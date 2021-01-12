const u = require("awadau");
require("../typedef");

/**
 * @param {CoreConfig} config
 */
module.exports = (config) => {
  let env = process.env;
  for (let i of u.mapKeys(config))
    if (env[i] != undefined) config = u.mapMergeDeep(config, { [i]: u.stringConvertType(env[i]) });

  return config;
};
