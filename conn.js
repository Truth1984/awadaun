const u = require("awadau");
const knex = require("knex");
const ioredis = require("ioredis");

class Redis {
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
}

class SQL {
  constructor(config, errorLog = u.log, infoLog = u.log) {
    this._conn = knex(config);
    this.sequence = knex(config).queryBuilder();
    this.infoLog = infoLog;
    this.errorLog = errorLog;
    this._option = config;
  }

  _TABLE(tableName) {
    this.tableName = tableName;
    this.sequence.from(tableName);
    return this;
  }

  /**
   * ```createTableIfNotExists(tableName, t=> {
      t.increments("userid");
      t.string("username").notNullable();
  })```
   */
  _CREATE() {
    return this._conn.schema;
  }

  _SELECT(...range) {
    if (range.length == 0) range = "*";
    this.sequence.select(range);
    return this;
  }

  _INSERT(dataPairs) {
    this.sequence.insert(dataPairs);
    return this;
  }

  _UPDATE(dataPairs) {
    this.sequence.update(dataPairs);
    return this;
  }

  // eslint-disable-next-line no-unused-vars
  _WHERE(builder = (b = this.sequence) => this.sequence) {
    builder(this.sequence);
    return this;
  }

  /**
   * @param {{[string]:boolean}} columnDescMap
   */
  _ORDER(columnDescMap = {}) {
    u.mapKeys(columnDescMap).map((i) => this.sequence.orderBy(i, columnDescMap[i] ? "desc" : "asc"));
    return this;
  }

  _LIMIT(page = 0, pageSize = 50) {
    this.sequence.limit(pageSize).offset(page * pageSize);
    return this;
  }

  /**
   *
   * @param {string | []} joinKeys
   * @param { 1 | 2 | 13 } mode
   */
  _JOIN(targetName, joinKeys, mode = 2) {
    if (!Array.isArray(joinKeys)) joinKeys = [joinKeys];
    let joinMap = {
      [this.tableName + "." + joinKeys[0]]: targetName + "." + (joinKeys.length == 2 ? joinKeys[1] : joinKeys[0]),
    };
    if (mode == 1) this.sequence.leftOuterJoin(targetName, joinMap);
    if (mode == 2) this.sequence.innerJoin(targetName, joinMap);
    if (mode == 13) this.sequence.fullOuterJoin(targetName, joinMap);
    return this;
  }

  _RUN() {
    return this.sequence.then((data) => data).catch(this.errorLog);
  }

  _RUNLOG() {
    this.infoLog(this.sequence.toQuery());
    return this._RUN().then((data) => {
      this.infoLog(data);
      return data;
    });
  }

  /**
   *
   * #### count
   *      .count('active as is_active');
   * #### join
   *      .join('accounts', builder {
   *          builder.on('accounts.id', '=', 'users.account_id')
   *          .orOn('accounts.owner_id', '=', 'users.id')
   *      })
   */
  _BUILDER() {
    return this.sequence;
  }

  _QUERYRAW(string) {
    return this._conn
      .raw(string)
      .then((data) => data)
      .catch(this.errorLog);
  }

  _toString() {
    return this.sequence.toQuery();
  }

  REST(tableName) {
    // eslint-disable-next-line no-unused-vars
    let wheres = (b = this.sequence) => this.sequence;
    let conn = knex(this._option);
    let builder = () => conn.queryBuilder().from(tableName);
    let run = (data) => Promise.resolve(data).catch(this.errorLog);
    let get = (rangeArr = "*", where = wheres) => conn.from(tableName).select(rangeArr).where(where).then(run);
    let getOne = (rangeArr = "*", where = wheres) =>
      conn.from(tableName).select(rangeArr).where(where).limit(1).then(run);
    /**
     * @param {{[string]:boolean}} columnDescMap
     */
    let getOrder = (rangeArr = "*", where = wheres, columnDescMap) => {
      let holder = conn.from(tableName).select(rangeArr).where(where);
      u.mapKeys(columnDescMap).map((i) => holder.orderBy(i, columnDescMap[i] ? "desc" : "asc"));
      return holder.then(run);
    };
    let getPage = (rangeArr = "*", where = wheres, page = 0, pageSize = 50) =>
      conn
        .from(tableName)
        .select(rangeArr)
        .where(where)
        .limit(pageSize)
        .offset(page * pageSize)
        .then(run);

    let add = (dataPairs) => conn.from(tableName).insert(dataPairs).then(run);
    let set = (dataPairs, where = wheres) => conn.from(tableName).update(dataPairs).where(where).then(run);
    let has = (where = wheres) => getOne("*", where).then((data) => u.len(data) > 0);
    let hasElseAdd = (dataPairs, where = wheres) =>
      has(where).then((bool) => {
        if (bool) return false;
        return add(dataPairs).then(() => true);
      });
    let hasSetAdd = (dataPairs, where = wheres) =>
      has(where).then((bool) => (bool ? set(dataPairs, where) : add(dataPairs)));
    let name = () => tableName;
    return { builder, get, getOne, getOrder, getPage, add, set, has, hasElseAdd, hasSetAdd, name };
  }
}

module.exports = { Redis, SQL };
