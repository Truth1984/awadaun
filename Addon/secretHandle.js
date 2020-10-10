const un = require("../core");
const u = require("awadau");

/**
 * 
 * @param {{secret:{
        filename: string,
        keys: string[],
        additional: {}
    }}} config
 */
module.exports = (config) => {
  let secretConfig = config.secret;
  let directory = config.directories.secret;
  let secretPath = un.filePathNormalize(directory, secretConfig.filename);
  return un.fileExist(secretPath).then((bool) => {
    if (bool) return u.mapMerge(config, require(secretPath));
    else
      return un
        .fileMkdir(directory)
        .then(() => un.fileWriteSync(secretConfig.filename, true, un.filePathNormalize(directory, ".gitignore")))
        .then(() =>
          un.fileWriteSync(
            `module.exports = ${u.jsonToString(
              u.mapMerge(u.mapGetExist(config, ...secretConfig.keys), secretConfig.additional)
            )}`,
            false,
            secretPath
          )
        )
        .then(() => config);
  });
};
