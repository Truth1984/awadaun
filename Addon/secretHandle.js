const un = require("../core");
const u = require("awadau");

/**
 * 
 * @param {{
        directory: string,
        filename: string,
        keys: string[]
    }} secretConfig
 */
module.exports = (secretConfig, originalConfig) => {
  let secretPath = un.filePathNormalize(secretConfig.directory, secretConfig.filename);
  return un.fileExist(secretPath).then((bool) => {
    if (bool) return u.mapMerge(originalConfig, require(secretPath));
    else
      return un
        .fileMkdir(secretConfig.directory)
        .then(() =>
          un.fileWriteSync(secretConfig.filename, true, un.filePathNormalize(secretConfig.directory, ".gitignore"))
        )
        .then(() =>
          un.fileWriteSync(
            `module.exports = ${u.jsonToString(u.mapGetExist(originalConfig, ...secretConfig.keys))}`,
            false,
            secretPath
          )
        )
        .then(() => originalConfig);
  });
};
