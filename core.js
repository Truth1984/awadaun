const u = require("awadau");
const uuid = require("uuid");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const fsp = fs.promises;
const fse = require("fs-extra");
const iconv = require("iconv-lite");
const paths = require("path");
const download = require("download");
const archiver = require("archiver");
const readline = require("readline");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const readdir = require("readdirp");
const ioredis = require("ioredis");
const knex = require("knex");
const htmlEntities = new (require("html-entities").Html5Entities)();

var un = {};

un.uuid = (v4 = true) => (v4 ? uuid.v4() : uuid.v1());

/**
 * using `bcryptjs`
 * @return {Promise<String>}
 */
un.passwordEncrypt = (plainText) => bcrypt.hash(plainText, 10);

/**
 * using `bcryptjs`
 * @return {Promise<Boolean>}
 */
un.passwordCheck = (plainText, hash) => bcrypt.compare(plainText, hash);

/**
 * @return {Buffer}
 */
un.textEncrypt = (text, secret) => {
  let key = crypto.createHash("sha256").update(String(secret)).digest("base64").substr(0, 32);
  let algorithm = "aes-256-ctr";
  let iv = crypto.randomBytes(16);
  let cipher = crypto.createCipheriv(algorithm, key, iv);
  return Buffer.concat([iv, cipher.update(Buffer.from(text)), cipher.final()]).toString("binary");
};

/**
 * @return {string}
 */
un.textDecrypt = (encrypted, secret) => {
  let key = crypto.createHash("sha256").update(String(secret)).digest("base64").substr(0, 32);
  let algorithm = "aes-256-ctr";
  encrypted = Buffer.from(encrypted, "binary");
  let iv = encrypted.slice(0, 16);
  encrypted = encrypted.slice(16);
  let decipher = crypto.createDecipheriv(algorithm, key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString();
};

un.textEncryptBase64 = (text, encrypting = true) => {
  return encrypting ? Buffer.from(text).toString("base64") : Buffer.from(text, "base64").toString();
};

/**
 * normalize path, also replace ~ with $home
 */
un.filePathNormalize = (...path) =>
  u.stringReplace(paths.normalize(paths.join(...path)), { "~": process.env.HOME, "\\\\\\\\": "/", "\\\\": "/" });

un.fileExist = (path) => {
  path = un.filePathNormalize(path);
  return fs.existsSync(path);
};

/**
 * @return {Boolean}
 */
un.fileIsDir = (path) => {
  path = un.filePathNormalize(path);
  return fs.existsSync(path) && fs.lstatSync(path).isDirectory();
};

un.filels = async (path, fullPath = false) => {
  path = un.filePathNormalize(path);
  return fsp.readdir(path).then((data) => {
    if (fullPath) return data.map((value) => paths.resolve(path, value));
    return data;
  });
};

un.fileSize = async (path) => {
  path = un.filePathNormalize(path);
  return fsp.stat(path).then((data) => data.size / 1e6);
};

un.fileMkdir = (path, recursive = true) => {
  path = un.filePathNormalize(path);
  if (fs.existsSync(path)) return Promise.resolve(true);
  return fsp.mkdir(path, { recursive });
};

un.fileMove = async (source, target, mkdir = true, overwrite = true) => {
  source = un.filePathNormalize(source);
  target = un.filePathNormalize(target);
  if (mkdir) fse.mkdirpSync(paths.dirname(target));
  return fse.moveSync(source, target, { overwrite });
};

/**
 * 
 * @param {string} path 
 * @param {{root?: string;
    fileFilter?: string | string[] | ((entry: EntryInfo) => boolean);
    directoryFilter?: string | string[] | ((entry: EntryInfo) => boolean);
    type?: 'files' | 'directories' | 'files_directories' | 'all';
    lstat?: boolean;
    depth?: number;
    alwaysStat?: boolean;}} option 
 */
un.fileReaddir = async (path, option) => {
  return readdir.promise(un.filePathNormalize(path), option);
};

un.fileLatestDir = (path) => {
  return un.fileIsDir(path) ? path : paths.dirname(path);
};

un.fileWrite = async (content, appendOrNot = false, path, encode = "utf8") => {
  path = un.filePathNormalize(path);
  return un
    .fileMkdir(paths.dirname(path))
    .then(() =>
      Buffer.isBuffer(content)
        ? fsp.writeFile(path, content, { flag: appendOrNot ? "a+" : "w+", encoding: "binary" })
        : fsp.writeFile(path, iconv.encode(content, encode), { flag: appendOrNot ? "a+" : "w+" })
    );
};

un.fileWriteSync = (content, appendOrNot = false, path, encode = "utf8") => {
  path = un.filePathNormalize(path);
  un.fileMkdir(paths.dirname(path));
  return Buffer.isBuffer(content)
    ? fs.writeFileSync(path, content, { flag: appendOrNot ? "a+" : "w+", encoding: "binary" })
    : fs.writeFileSync(path, iconv.encode(content, encode), {
        flag: appendOrNot ? "a+" : "w+",
      });
};

un.fileRead = async (path, encode = "utf8") => {
  path = un.filePathNormalize(path);
  return fsp.readFile(path, encode);
};

un.fileReadSync = (path, encode = "utf8") => {
  path = un.filePathNormalize(path);
  return fs.readFileSync(path, encode).toString();
};

/**
 * @return {Promise<Buffer>}
 */
un.fileReadBuffer = async (path) => {
  path = un.filePathNormalize(path);
  return fsp.readFile(path, "binary");
};

un.fileDelete = async (path, trash = false) => {
  path = un.filePathNormalize(path);
  if (trash) return un.cmd(`trash ${path}`);
  return fsp.unlink(path);
};

un.fileDownload = async (url, outputPath) => {
  url = u.url(url);
  outputPath = un.filePathNormalize(outputPath);
  let stream = download(url).pipe(fs.createWriteStream(outputPath));
  return new Promise((resolve) => stream.on("close", () => resolve(true)));
};

un.cmd = async (scripts) => {
  return un.cmdSync(scripts);
};

un.cmdSync = (scripts) => {
  let cmdarray = scripts.split(" ");
  return spawnSync(cmdarray.shift(), cmdarray, {
    shell: true,
    stdio: "pipe",
    encoding: "utf-8",
    env: process.env,
  }).stdout;
};

/**
 * @param path can be [path]
 * @param outputPath file better end up with .zip
 * @return {Promise<String>} filedest
 */
un.fileZip = (path, outputPath) => {
  if (u.typeCheck(path, "arr")) path = path.map(un.filePathNormalize);
  else path = un.filePathNormalize(path);
  outputPath = un.filePathNormalize(outputPath);

  let archive = archiver("zip", { zlib: { level: 9 } });
  let stream = fs.createWriteStream(outputPath);
  return new Promise((resolve, reject) => {
    if (u.typeCheck(path, "arr")) path.map((i) => archive.append(i, { name: paths.basename(i) }));
    else un.fileIsDir(path) ? archive.directory(path, false) : archive.append(path, { name: paths.basename(path) });
    archive.on("error", reject).pipe(stream);
    stream.on("close", () => resolve());
    archive.finalize();
  });
};

/**
 * @param {(line, outputStream:{write:()=>{}})=>{}} inputCallback
 */
un.fileProcess = (inputPath, outputPath, inputCallback) => {
  inputPath = un.filePathNormalize(inputPath);
  outputPath = un.filePathNormalize(outputPath);
  let readStream = fs.createReadStream(inputPath);
  fs.writeFileSync(outputPath, "");
  let outputStream = fs.createWriteStream(outputPath, { flags: "a" });
  outputStream.readable = true;
  outputStream.writable = true;
  let rl = readline.createInterface(readStream, outputStream);
  let perform = async () => {
    for await (const line of rl) {
      await inputCallback(line, outputStream);
    }
  };
  return perform().then(() => new Promise((resolve) => outputStream.end(() => resolve())));
};

un.escapeHtml = (content) => htmlEntities.encode(content);

un.unescapeHtml = (content) => htmlEntities.decode(content);

/**
 * @param {{
    port: 6379,
    host: "localhost",
    password: "",
    cluster: { port: number, host: string }[]
  }} config redis config
 */
un.connRedis = class Redis {
  constructor(config) {
    if (u.len(config.cluster) > 0) this.redis = new ioredis.Cluster(config);
    else this.redis = new ioredis(config);
  }

  async add(pairs, expireMs = -1) {
    return Promise.all(
      u.mapKeys(pairs).map((key) => this.redis.set(key, pairs[key], ...(expireMs != -1 ? ["PX", expireMs] : [])))
    );
  }

  async addTilDate(pairs, date = -1) {
    if (date == -1) return this.add(pairs);
    return this.add(pairs, new Date(date).getTime() - new Date().getTime());
  }

  async increment(key, int = 1) {
    if (int == 1) return this.redis.incr(key);
    return this.redis.incrby(key, int);
  }

  async keys(pattern) {
    return this.redis.keys(pattern);
  }

  /**
   * will return null
   */
  async get(...keys) {
    return u.arrayToMap(keys, await this.redis.mget(...keys));
  }

  /**
   * @return {Promise<string | null>}
   */
  async getPlain(key) {
    return this.redis.get(key);
  }

  /**
   * @return {Promise<string[]>}
   */
  async getArray(...keys) {
    return this.redis.mget(...keys);
  }

  async getOnce(...keys) {
    return this.get(...keys).then((data) => this.remove(...keys).then(() => data));
  }

  async remove(...keys) {
    if (keys.length > 0) return this.redis.del(...keys);
  }

  /**
   * @return {boolean}
   */
  async rawSet(...param) {
    return this.redis.set(...param).then((val) => val === "OK");
  }

  /**
   * @return {Promise<boolean>} if already exist, return false
   */
  async checkOrSet(key, value, expireMs = -1) {
    if (expireMs <= -1) return this.rawSet(key, value, "NX");
    return this.rawSet(key, value, "PX", expireMs, "NX");
  }

  async mapAdd(setName, ...key) {
    return this.redis.sadd(setName, ...key);
  }

  async mapHas(setName, key) {
    return this.redis.sismember(setName, key).then((data) => data > 0);
  }

  async mapDel(setName, key) {
    return this.redis.srem(setName, key);
  }

  async mapKeys(setName) {
    return this.redis.smembers(setName);
  }
};

/**
 * 
 * @param {{
    client: "mysql" | "postgres" | "mariadb" | "mssql" | "sqlite" | "sqlite::memory",
    connection:{
      host: "localhost",
      user:"",
      password:"",
      database:"",
      port:number
    }
  }} config 
*/
un.sqldb = (config) => {
  return knex(config).schema;
};

/**
 * 
 * @param {{
    client: "mysql" | "postgres" | "mariadb" | "mssql" | "sqlite" | "sqlite::memory",
    connection:{
      host: "localhost",
      user:"",
      password:"",
      database:"",
      port:number
    }
  }} config 
*
* @param {{debug:false, debugLog:(data)=>{}, errorHandle:(data)=>{}}} logConfig
*/
un.sqlTable = (config, tableName, logConfig = {}) => {
  let conn = knex(config);
  let defaultLogConfig = {
    debug: false,
    debugLog: (data) => u.log(data, { tableName }, "sqlTable", "DEBUG"),
    errorHandle: (data) => u.log(data, { tableName }, "sqlTable", "ERROR"),
  };
  logConfig = u.mapMergeDeep(defaultLogConfig, logConfig);

  // eslint-disable-next-line no-unused-vars
  let wheres = (b = knex(config).queryBuilder()) => knex(config).queryBuilder();
  let builder = () => conn.queryBuilder().from(tableName);
  let run = logConfig.debug
    ? async (sequence) => {
        let query = sequence.toQuery();
        let result = await sequence.then((data) => data).catch(logConfig.errorHandle);
        logConfig.debugLog({ query, result });
        return result;
      }
    : (sequence) => sequence.then((data) => data).catch(logConfig.errorHandle);

  let get = (rangeArr = "*", where = wheres) => run(conn.from(tableName).select(rangeArr).where(where));
  let getOne = (rangeArr = "*", where = wheres) => run(conn.from(tableName).select(rangeArr).where(where).limit(1));
  /**
   * @param {{[string]:boolean}} columnDescMap
   */
  let getOrder = (rangeArr = "*", where = wheres, columnDescMap, page, pageSize = 50) => {
    let holder = conn.from(tableName).select(rangeArr).where(where);
    u.mapKeys(columnDescMap).map((i) => holder.orderBy(i, columnDescMap[i] ? "desc" : "asc"));
    if (page) holder.limit(pageSize).offset(page * pageSize);
    return run(holder);
  };
  let getPage = (rangeArr = "*", where = wheres, page = 0, pageSize = 50) =>
    run(
      conn
        .from(tableName)
        .select(rangeArr)
        .where(where)
        .limit(pageSize)
        .offset(page * pageSize)
    );

  let getCount = (columnResultKeyMap = {}, where = wheres) => {
    let holder = conn.from(tableName).where(where);
    for (let i of u.mapKeys(columnResultKeyMap)) holder.count(i, { as: columnResultKeyMap[i] });
    return run(holder);
  };
  let getCountDistinct = (columnResultKeyMap = {}, where = wheres) => {
    let holder = conn.from(tableName).where(where);
    for (let i of u.mapKeys(columnResultKeyMap)) holder.countDistinct(i, { as: columnResultKeyMap[i] });
    return run(holder);
  };
  let add = (dataPairs) => run(conn.from(tableName).insert(dataPairs));
  let set = (dataPairs, where = wheres) => run(conn.from(tableName).update(dataPairs).where(where));
  let has = (where = wheres) => getOne("*", where).then((data) => u.len(data) > 0);
  let hasElseAdd = (dataPairs, where = wheres) =>
    has(where).then((bool) => {
      if (bool) return false;
      return add(dataPairs).then(() => true);
    });
  let hasSetAdd = (dataPairs, where = wheres) =>
    has(where).then((bool) => (bool ? set(dataPairs, where) : add(dataPairs)));
  let raw = (string) => run(conn.raw(string));
  let name = () => tableName;
  return {
    builder,
    get,
    getOne,
    getOrder,
    getPage,
    getCount,
    getCountDistinct,
    add,
    set,
    has,
    hasElseAdd,
    hasSetAdd,
    raw,
    name,
  };
};

un.elasticSearch = (config) => {};

module.exports = un;
