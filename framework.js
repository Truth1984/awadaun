const u = require("awadau");
const un = require("./core");
const express = require("express");
const bodyParser = require("body-parser");
const compression = require("compression");
const vhost = require("vhost");
const helmet = require("helmet");
const schedule = require("node-schedule");
const tl2 = require("tl2");
const loggerModifier = require("./Addon/loggerModifier");
const secretHandle = require("./Addon/secretHandle");

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
      logger: {
        type : "on" | "off" | "bunyan-dev" | "bunyan",
        bunyan : {
          name : string,
          fileBaseDir: string,
          baseLevel: "trace" | "debug" | "info" | "warn" | "error" | "fatal"
        }
      },
      handle404: {
        type: "message" | "filePath" | "function",
        value: string | ((req, res, next) => {}),
      },
      secret: {
        directory: string,
        filename: string,
        keys: string[],
        additional: {}
      },
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
        logger: {
          type: "on",
          bunyan: {
            name: "nodeApp",
            fileBaseDir: process.cwd(),
            baseLevel: "",
          },
        },
        handle404: {
          type: "message",
          value: "404 not found",
        },
        secret: {
          directory: un.filePathNormalize(process.cwd(), "Personal"),
          filename: "config.js",
          keys: ["listen"],
          additional: {
            redis: {
              enable: false,
              port: 6379,
              host: "localhost",
              password: "",
              cluster: [],
            },
            sql: {
              enable: false,
              client: "mysql",
              connection: {
                host: "localhost",
                user: "",
                password: "",
                database: "",
              },
            },
          },
        },
      },
      config
    );
    this.config = config;
    this.logger = loggerModifier(this.config.logger);
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

  run() {
    let task = new tl2();
    task.add("initialization", async () => {
      this.config = await secretHandle(this.config.secret, this.config);
      this.config.serveStatic.htmlPath.map((i) => this.app.use(express.static(i, { extensions: ["html"] })));
      this.config.serveStatic.filePath.map((i) => this.app.use(express.static(i)));
      this.config.serveStatic.vhost.map((i) => this.app.use(vhost(i.domain, express.static(i.path))));

      this.config.schedule.map((i) => (this.runtime[i.name] = schedule.scheduleJob(i.pattern, i.operation)));
      this.app.get("/health-check", (req, res) => res.status(200).send("OK"));
    });

    task.add("pre-process", async () => {
      for (let i of this.config.perform["pre-process"]) await i();
    });

    task.add("process", async () => {
      for (let i of this.config.perform["process"]) await i();
    });

    task.add("wrap-up", async () => {
      //handle404
      if (this.config.handle404.type == "message")
        this.app.use((req, res) => res.status(404).send(this.config.handle404.value));
      if (this.config.handle404.type == "filePath")
        this.app.use((req, res) => res.status(404).sendFile(this.config.handle404.value));
      if (this.config.handle404.type == "function")
        this.app.use((req, res, next) => this.config.handle404.value(req, res, next));

      this.app.listen(this.config.listen, () => this.logger.info(`server listen on http port ${this.config.listen}`));
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
        this.logger.fatal({ error, origin });
        process.exit();
      });
    });
    return task.runAuto();
  }
};
