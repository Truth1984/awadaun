const loggerModifier = require("./loggerModifier");
require("../typedef");

/**
 * @param {CoreConfig} config
 */
module.exports = (config) => {
  let logger = loggerModifier(config);
  logger.trace = logger.trace.bind(logger);
  logger.debug = logger.debug.bind(logger);
  logger.info = logger.info.bind(logger);
  logger.warn = logger.warn.bind(logger);
  logger.error = logger.error.bind(logger);
  logger.fatal = logger.fatal.bind(logger);
  return logger;
};
