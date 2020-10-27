const u = require("awadau");
const un = require("../core");
const bunyan = require("bunyan");
const fs = require("fs");
const path = require("path");
const colors = require("colors/safe");

/**
 * @param {{"logger": {
        type : "on" | "off" | "bunyan-dev" | "bunyan",
        bunyan : {
          name : string,
          baseLevel: "trace" | "debug" | "info" | "warn" | "error" | "fatal"
        }
      }}} config 
 */
module.exports = (config) => {
  let directory = config.directories.logger;
  config = config.logger;
  if (config.type == "on") {
    return {
      trace: (msg) => u.log(msg, undefined, "trace"),
      debug: (msg) => u.log(msg, undefined, "debug"),
      info: (msg) => u.log(msg, undefined, "info"),
      warn: (msg) => u.log(msg, undefined, "warn"),
      error: (msg) => u.log(msg, undefined, "error"),
      fatal: (msg) => u.log(msg, undefined, "fatal"),
    };
  }
  if (config.type == "off") {
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
    if (config.bunyan.baseLevel == "") return config.type == "bunyan" ? "warn" : "trace";
    return config.bunyan.baseLevel;
  };

  let streamSwitch = () => {
    if (config.type == "bunyan-dev")
      return {
        write: (entry) => {
          var logObject = JSON.parse(entry);
          logObject.severity = bunyan.nameFromLevel[logObject.level].toUpperCase();
          let result = JSON.stringify(logObject) + "\n";
          if (logObject.level == 40) warnStream.write(result);
          if (logObject.level == 50) errorStream.write(result);
          if (logObject.level == 60) fatalStream.write(logObject);
          process.stdout.write(colorSelector(logObject.level)(logObject.severity) + "\t" + result);
        },
      };
    return {
      write: (entry) => {
        var logObject = JSON.parse(entry);
        if (logObject.level == 40) warnStream.write(logObject);
        if (logObject.level == 50) errorStream.write(logObject);
        if (logObject.level == 60) fatalStream.write(logObject);
        process.stdout.write(JSON.stringify(logObject) + "\n");
      },
    };
  };

  let streams = [{ level: levelSwitch(), stream: streamSwitch() }];

  return bunyan.createLogger(u.mapMergeDeep({ streams }, u.mapGetExcept(config.bunyan, "baseLevel")));
};
