const isCoreModule = require("is-core-module");
const micromatch = require("micromatch");
const resolve = require("eslint-module-utils/resolve").default;

const { TYPES, IGNORE } = require("../constants/settings");

function baseModule(name, path) {
  if (path) {
    return null;
  }
  if (isScoped(name)) {
    const [scope, pkg] = name.split("/");
    return `${scope}/${pkg}`;
  }
  const [pkg] = name.split("/");
  return pkg;
}

function isIgnored(path, settings) {
  return micromatch.isMatch(path, settings[IGNORE] || []);
}

function isBuiltIn(name, path) {
  if (path || !name) return false;
  const base = baseModule(name);
  return isCoreModule(base);
}

const scopedRegExp = /^@[^/]*\/?[^/]+/;
function isScoped(name) {
  return name && scopedRegExp.test(name);
}

const externalModuleRegExp = /^\w/;
function isExternal(name, path) {
  return !path && (externalModuleRegExp.test(name) || isScoped(name));
}

function typeCaptureValues(capture, captureSettings) {
  if (!captureSettings) {
    return null;
  }
  return capture.reduce((captureValues, capture, index) => {
    if (captureSettings[index]) {
      captureValues[captureSettings[index]] = capture;
    }
    return captureValues;
  }, {});
}

function elementTypeAndParents(path, settings) {
  const parents = [];
  const typeResult = {
    type: null,
    typePath: null,
    typeCapture: null,
    typeCapturedValues: null,
    internalPath: null,
  };

  if (!path || isIgnored(path, settings)) {
    return {
      ...typeResult,
      parents,
    };
  }

  // TODO, convert string types to default patterns for backward compatibility

  path
    .split("/")
    .reverse()
    .reduce((accumulator, elementPathSegment, segmentIndex, elementPaths) => {
      accumulator.unshift(elementPathSegment);
      let typeFound = false;
      settings[TYPES] &&
        settings[TYPES].forEach((type) => {
          if (!typeFound) {
            const pattern =
              type.matchType === "parentFolders" && !typeResult.type
                ? `${type.pattern}/**/*`
                : type.pattern;
            const capture = micromatch.capture(pattern, accumulator.join("/"));
            if (capture) {
              typeFound = true;
              accumulator = [];
              const captureValues = typeCaptureValues(capture, type.capture);
              const typePath = elementPaths
                .slice(segmentIndex - 1)
                .reverse()
                .join("/");
              if (!typeResult.type) {
                typeResult.type = type.name;
                typeResult.typePath = typePath;
                typeResult.typeCapture = capture;
                typeResult.typeCapturedValues = captureValues;
                typeResult.internalPath =
                  type.matchType === "parentFolders" ? path.replace(`${typePath}/`, "") : null;
              } else {
                parents.push({
                  type: type.name,
                  typePath: typePath,
                  typeCapture: capture,
                  typeCapturedValues: captureValues,
                });
              }
            }
          }
        });
      return accumulator;
    }, []);

  return {
    ...typeResult,
    parents,
  };
}

function projectPath(absolutePath) {
  if (absolutePath) {
    return absolutePath.replace(`${process.cwd()}/`, "");
  }
}

function importInfo(source, context) {
  const path = projectPath(resolve(source, context));
  const isBuiltInModule = isBuiltIn(source, path);
  const isExternalModule = isExternal(source, path);
  return {
    // filePath: projectPath(context.getFilename()),
    source,
    path,
    isIgnored: isIgnored(path, context.settings),
    isLocal: !!path && !isBuiltInModule && !isExternalModule,
    isBuiltIn: isBuiltInModule,
    isExternal: isExternalModule,
    baseModule: baseModule(source, path),
    ...elementTypeAndParents(path, context.settings),
  };
}

function fileInfo(context) {
  const path = projectPath(context.getFilename());
  return {
    path,
    isIgnored: isIgnored(path, context.settings),
    ...elementTypeAndParents(path, context.settings),
  };
}

module.exports = {
  importInfo,
  fileInfo,
};
