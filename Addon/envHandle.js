const u = require("awadau");
require("../typedef");

/**
 * @param {CoreConfig} config
 */
module.exports = (config) => {
  let env = process.env;
  for (let i of u.arrayAdd(u.mapKeys(config), config.envAddition))
    if (env[i] != undefined) config = u.mapMergeDeep(config, { [i]: u.stringConvertType(env[i]) });

  return config;
};
