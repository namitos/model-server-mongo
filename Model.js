const revalidator = require('revalidator');
const { ObjectID } = require('mongodb');
const Collection = require('./Collection');

module.exports = ({ db }) => class Model {
  /**
   * @constructor
   * @param {Object} properties
   */
  constructor(properties = {}) {
    Object.assign(this, properties);
    if (this._id && typeof this._id == 'string') {
      this._id = this.constructor.prepareIdSingle(this._id);
    }
  }

  static _toJSON(obj) {
    let result;
    if (obj instanceof ObjectID) {
      result = obj.toString();
    } else if (obj instanceof Array) {
      result = [];
      obj.forEach((item) => {
        result.push(this._toJSON(item));
      });
    } else if (obj instanceof Object) {
      result = {};
      Object.keys(obj).forEach((prop) => {
        result[prop] = this._toJSON(obj[prop]);
      });
    } else {
      result = obj;
    }
    return result;
  }

  /**
   * makes a deep clone to simple object
   * @returns {Object}
   */
  toJSON() {
    return this.constructor._toJSON(this);
  }

  /**
   * safe deep get
   * @param {Array} path 
   * @param {*} o default value
   */
  get(path, o) {
    if (typeof path === 'string') {
      path = path.split('.');
    }
    return path.reduce((xs, x) => (xs && xs[x]) ? xs[x] : null, o)
  }

  /**
   * prepares the object to database
   * @param {string} op
   * @returns {Promise}
   */
  async prepare(op) {
    let data = this.constructor.forceSchema(this.constructor.schema, this);
    let validation;
    if (op === 'create') { //validating full document
      validation = revalidator.validate(data, this.constructor.schema);
    } else { //validating only patching properties
      let schema = Object.assign({}, this.constructor.schema);
      schema.properties = {};
      Object.keys(data).forEach((prop) => {
        schema.properties[prop] = this.constructor.schema.properties[prop];
      })
      validation = revalidator.validate(data, schema);
    }
    if (validation.valid) {
      return data;
    } else {
      return Promise.reject({
        name: 'OdmError',
        text: 'validation',
        data: validation.errors
      });
    }
  }

  /**
   *
   * @returns {Promise}
   */
  async create() {
    let data = await this.prepare('create');
    let r = await this.constructor.c.insertOne(data);
    this._id = r.ops[0]._id;
    return this;
  }

  /**
   *
   * @param {Object} where - crutch for bdlo; sometimes we need in additional conditions in query.
   * @returns {Promise}
   */
  async update(where = {}) {
    if (this._id) {
      let data = await this.prepare('update');
      await this.constructor.c.updateOne(Object.assign(where, { _id: this._id }), { $set: data });
      return this;
    } else {
      return Promise.reject({
        name: 'OdmError',
        text: '_id required for update'
      });
    }
  }

  /**
   * 
   * @param {Object} data query object
   * @returns {Promise}
   */
  async updateQuery(data) {
    if (this._id) {
      await this.constructor.c.updateOne({ _id: this._id }, data);
      return this;
    } else {
      return Promise.reject({
        name: 'OdmError',
        text: '_id required for update'
      });
    }
  }

  /**
   *
   * @param {Object} where - sometimes we need in additional conditions in query. for example, to update the record of a particular user, to avoid reading the document and comparison.
   * @returns {Promise}
   */
  delete(where = {}) {
    if (this._id) {
      if (this.constructor.schema.safeDelete) {
        return this.constructor.c.updateOne(Object.assign(where, { _id: this._id }), { $set: { deleted: true } });
      } else {
        return this.constructor.c.deleteOne(Object.assign(where, { _id: this._id }));
      }
    } else {
      return Promise.reject({
        name: 'OdmError',
        text: '_id required for delete'
      });
    }
  }

  /**
   * @param schema.safeDelete
   */
  static get schema() {}

  /**
   * getter for internal collection class
   * @returns {Collection}
   */
  static get Collection() {
    return Collection;
  }


  static get db() {
    return db;
  }

  /**
   * getter for mongo collection instance
   * @returns {Object}
   */
  static get c() {
    return this.db.collection(this.schema.name);
  }

  /**
   *
   * @param where {Object}
   * @param options {Object}
   * @returns {Promise}
   */
  static async read(where = {}, options = {}) {
    let r = await this.c.find(where, options).toArray();
    return new this.Collection().wrap(r, this);
  }

  /**
   *
   * @param where {Object}
   * @returns {Promise}
   */
  static count(where) {
    return this.c.countDocuments(where);
  }

  /**
   * find element by id, rejects if not found
   * @param {Object|string} id
   * @param {Object} options
   * @returns {Promise}
   */
  static async byId(id, options) {
    id = this.prepareIdSingle(id);
    if (id) {
      let [item] = await this.read({ _id: id }, options);
      return item || Promise.reject({ name: 'OdmError', text: 'not found' });
    } else {
      return Promise.reject({ name: 'OdmError', text: 'invalid id' });
    }
  }

  static prepareIdSingle(id) {
    try {
      return new ObjectID(id);
    } catch (err) {
      console.error(id, err);
    }
  }

  static prepareId(id) {
    let newId;
    if (id instanceof Array) {
      newId = [];
      id.forEach((item, i) => {
        newId.push(this.prepareIdSingle(item));
      });
    } else if (id instanceof Object && id.hasOwnProperty('$in')) {
      newId = {
        $in: this.prepareId(id.$in)
      };
    } else if (id) {
      newId = this.prepareIdSingle(id);
    } else {

    }
    return newId;
  }

  static forceSchema(schema, obj) {
    let objNew;
    if (schema.type == 'array') {
      objNew = [];
      if (obj instanceof Array) {
        let compact = true;
        if (['number', 'integer'].includes(schema.items.type)) {
          compact = false;
        }
        obj.forEach((item) => {
          let itemPush = this.forceSchema(schema.items, item);
          if (itemPush || !compact) { //if item exists or ignore compact
            objNew.push(itemPush);
          }
        });
      } else {
        objNew = null;
      }
    } else if (schema.type == 'object') {
      objNew = {};
      if (obj instanceof Object) {
        let keys = Object.keys(schema.properties);
        for (let i = 0; i < keys.length; ++i) {
          let key = keys[i];
          if (obj.hasOwnProperty(key)) {
            objNew[key] = this.forceSchema(schema.properties[key], obj[key]);
          }
        }
      } else {
        objNew = null;
      }
    } else if (schema.type == 'integer') {
      objNew = parseInt(obj);
      if (isNaN(objNew)) {
        objNew = 0;
      }
    } else if (schema.type == 'number') {
      objNew = parseFloat(obj);
      if (isNaN(objNew)) {
        objNew = 0;
      }
    } else if (schema.type == 'string') {
      objNew = obj ? obj.toString() : '';
    } else if (schema.type == 'boolean') {
      objNew = !!obj;
    } else if (schema.type == 'any') {
      objNew = obj;
    }
    return objNew;
  }
};