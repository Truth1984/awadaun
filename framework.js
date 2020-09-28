const u = require("awadau");
const un = require("./core");
const express = require("express");
const bodyParser = require("body-parser");
const compression = require("compression");
const vhost = require("vhost");
const helmet = require("helmet");
const schedule = require("node-schedule");
const tl2 = require("tl2");

module.exports = class Framework {
  /**
  * @param {{
      master:true,
      serveStatic: {
        htmlPath:string[],
        filePath:string[],
        vhost: {domain:string, path:string}[]
      },
      listen:number,
      schedule: {
        name:string,
        pattern:string,
        operation: () => {}
      }[],
      perform:{
        "pre-process" : [],
        "process" : [],
        "post-process" : [],
        "pre-terminate" : []
      },
      logger:()=>{},
    }} config
 * master controls most of the schedule work
 */
  constructor(config = {}) {
    this.express = express;
    this.app = express();
    this.app.use(bodyParser.json({ type: "application/json" }));
    this.app.use(bodyParser.urlencoded({ extended: true }));
    this.app.use(helmet());
    this.app.use(compression());
    this.app.set("trust proxy", 1);

    config = u.mapMergeDeep(
      {
        master: true,
        serveStatic: {
          htmlPath: [],
          filePath: [],
          vhost: [],
        },
        listen: process.env.PORT || 8080,
        schedule: [],
        perform: {
          "pre-process": [],
          process: [],
          "post-process": [],
          "pre-terminate": [],
        },
        logger: u.log,
      },
      config
    );
    this.config = config;

    this.runtime = {
      scheduler: {},
    };
  }

  serveHTML(path) {
    path = un.filePathNormalize(path);
    this.config.serveStatic.htmlPath.push(path);
  }

  serveFile(path) {
    path = un.filePathNormalize(path);
    this.config.serveStatic.filePath.push(path);
  }

  serveVhost(path, domain) {
    path = un.filePathNormalize(path);
    this.config.serveStatic.vhost.push({ domain, path });
  }

  listen(port) {
    this.config.listen = port;
  }

  /**
   *
   * @param {*} cronPattern \*\/5 * * * * * every 5 second, and it can also be
   *
   *`{start: startTime, end: endTime, rule: '\*\/1 * * * * *'}`
   *
   * min (0 - 59) | hour (0 - 23) | day of month (1 - 31) | month (1 - 12) | day of week (0 - 6)
   *
   *{second (0-59), minute (0-59), hour (0-23), date (1-31), month (0-11), year, dayOfWeek (0-6) Starting with Sunday}
   *
   */
  scheduleJob(jobname, cronPattern, action) {
    this.config.schedule.push({ name: jobname, pattern: cronPattern, operation: action });
  }

  scheduleCancel(jobname, preAction = () => {}, postAction = () => {}) {
    let preFunc = async () => preAction();
    return preFunc()
      .then(() => {
        if (this.runtime.scheduler[jobname]) this.runtime.scheduler[jobname].cancel();
      })
      .then(postAction);
  }

  /**
   *
   * @param {"pre-process" | "process" | "post-process" | "pre-terminate"} level
   * **pre-process** : config, and middleware setup
   *
   * **process** : router and logic
   *
   * **post-process** : misc
   *
   * **pre-terminate**: only run once before termination
   *
   * @param {*} operation
   */
  perform(level, operation) {
    this.config.perform[level].push(operation);
  }

  run(stepLogger = this.config.logger) {
    let task = new tl2({}, stepLogger);
    task.add("initialization", () => {
      this.config.serveStatic.htmlPath.map((i) => this.app.use(express.static(i, { extensions: ["html"] })));
      this.config.serveStatic.filePath.map((i) => this.app.use(express.static(i)));
      this.config.serveStatic.vhost.map((i) => this.app.use(vhost(i.domain, express.static(i.path))));

      this.config.schedule.map((i) => (this.runtime[i.name] = schedule.scheduleJob(i.pattern, i.operation)));
    });

    task.add("pre-process", async () => {
      for (let i of this.config.perform["pre-process"]) await i();
    });

    task.add("process", async () => {
      for (let i of this.config.perform["process"]) await i();
    });

    task.add("wrap-up", async () => {
      this.app.listen(this.config.listen, () => this.config.logger(`server listen on http port ${this.config.listen}`));
    });

    task.add("post-process", async () => {
      for (let i of this.config.perform["post-process"]) await i();
    });

    task.add("pre-terminate", () => {
      process.stdin.resume(); //so the program will not close instantly
      process.on("exit", () => this.config.perform["pre-terminate"].map((i) => i())); //do something when app is closing
      process.on("SIGINT", () => process.exit()); //catches ctrl+c event
      // catches "kill pid" (for example: nodemon restart)
      process.on("SIGUSR1", () => process.exit());
      process.on("SIGUSR2", () => process.exit());

      //catches uncaught exceptions
      process.on("uncaughtException", (error, origin) => {
        console.error({ error, origin });
        process.exit();
      });
    });
    return task.runAuto();
  }
};
