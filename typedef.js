/**
 * @typedef CoreConfig
 * @property {true} master
 * @property {{htmlPath:string,filePath:string,vhost: {domain:string, path:string}[]}} serveStatic
 * @property {number} listen
 * @property {{name:string,pattern:string,operation: () => {}}[]} schedule
 * @property {{"pre-process" : [],"process" : [],"post-process" : [],"pre-terminate" : []}} perform
 * @property {{type : "on" | "off" | "bunyan-dev" | "bunyan", bunyan : { name : string, baseLevel: "trace" | "debug" | "info" | "warn" | "error" | "fatal" }}} logger
 * @property {{type: "message" | "filePath" | "function", value: string | ((req, res, next) => {}),}} handle404
 * @property {{logger:string, secret:string,}} directories
 * @property {{filename: string, keys: string[], additional: {}}} secret
 */
