const u = require("awadau");
const un = require("../core");
const bunyan = require("bunyan");
const fs = require("fs");
const path = require("path");
const colors = require("colors/safe");
require("../typedef");

/**
 * @param {CoreConfig} config
 */
module.exports = (config) => {
  let directory = config.directories.logger;
  let logconfig = config.logger;
  if (logconfig.devOverride) {
    if (config.dev == "full-dev") logconfig.type = "bunyan-dev";
    if (config.dev == "dev") logconfig.type = "on";
    if (config.dev == "prod") logconfig.type = "bunyan";
  }
  if (logconfig.type == "on") {
    return {
      trace: (msg) => u.log(msg, {}, undefined, "TRACE"),
      debug: (msg) => u.log(msg, {}, undefined, "DEBUG"),
      info: (msg) => u.log(msg, {}, undefined, "INFO"),
      warn: (msg) => u.log(msg, {}, undefined, "WARN"),
      error: (msg) => u.log(msg, {}, undefined, "ERROR"),
      fatal: (msg) => u.log(msg, {}, undefined, "FATAL"),
    };
  }
  if (logconfig.type == "off") {
    return {
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      fatal: () => {},
    };
  }
  if (!un.fileIsDir(directory))
    un.fileMkdir(directory).then(() => un.fileWriteSync("*", true, un.filePathNormalize(directory, ".gitignore")));

  let colorSelector = (level) => {
    // trace:10, debug: 20, info: 30, warning: 40, error: 50, fatal: 60
    if (level < 40) return colors.green;
    if (level < 50) return colors.yellow;
    return colors.red;
  };

  let warnStream = fs.createWriteStream(path.join(directory, `warn.log`), { flags: "a" });
  let errorStream = fs.createWriteStream(path.join(directory, `error.log`), { flags: "a" });
  let fatalStream = fs.createWriteStream(path.join(directory, `fatal.log`), { flags: "a" });

  let levelSwitch = () => {
    if (logconfig.bunyan.baseLevel == "") return logconfig.type == "bunyan" ? "warn" : "trace";
    return logconfig.bunyan.baseLevel;
  };

  let streamSwitch = () => {
    if (logconfig.type == "bunyan-dev")
      return {
        write: (entry) => {
          var logObject = JSON.parse(entry);
          logObject.severity = bunyan.nameFromLevel[logObject.level].toUpperCase();
          let result = JSON.stringify(logObject) + "\n";
          if (logObject.level == 40) warnStream.write(result);
          if (logObject.level == 50) errorStream.write(result);
          if (logObject.level == 60) fatalStream.write(result);
          process.stdout.write(colorSelector(logObject.level)(logObject.severity) + "\t" + result);
        },
      };
    return {
      write: (entry) => {
        var logObject = JSON.parse(entry);
        let result = JSON.stringify(logObject) + "\n";
        if (logObject.level == 40) warnStream.write(result);
        if (logObject.level == 50) errorStream.write(result);
        if (logObject.level == 60) fatalStream.write(result);
        process.stdout.write(JSON.stringify(logObject) + "\n");
      },
    };
  };

  let streams = [{ level: levelSwitch(), stream: streamSwitch() }];

  let bLog = bunyan.createLogger(u.mapMergeDeep({ streams }, u.mapGetExcept(logconfig.bunyan, "baseLevel")));
  bLog.fields = { time: 0, msg: 1 };
  return bLog;
};
