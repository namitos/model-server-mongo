'use strict';

const revalidator = require('revalidator');
const _ = require('lodash');
const mongodb = require('mongodb');

const Collection = require('./Collection');

module.exports = (app) => {
  return class Model {
    /**
     * @constructor
     * @param {Object} properties
     */
    constructor(properties = {}) {
      Object.keys(properties).forEach((prop) => {
        this[prop] = properties[prop];
      });
      if (this._id && typeof this._id == 'string') {
        this._id = this.constructor.prepareIdSingle(this._id);
      }
    }

    /**
     * useful wrapper for getting values of deep objects
     * @param {string} path
     * @returns {*}
     */
    get(path) {
      return _.get(this, path);
    }

    /**
     * useful wrapper for setting values of deep objects
     * @param {string} path
     * @returns {*}
     */
    set(path) {
      return _.set(this, path);
    }

    static _toJSON(obj) {
      let result;
      if (obj instanceof mongodb.ObjectID) {
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
     *
     * @returns {Object}
     */
    toJSON() {
      return this.constructor._toJSON(this);
    }

    /**
     * prepares the object to database
     * @param {string} op
     * @returns {Promise}
     */
    async prepare(op) {
      let data = this.constructor.forceSchema(this.constructor.schema, this);
      let validation;
      if (this.constructor.schema.sendOnlyUpdates) {
        let schema = Object.assign({}, this.constructor.schema);
        schema.properties = {};
        Object.keys(data).forEach((prop) => { //validate only patching properties
          schema.properties[prop] = this.constructor.schema.properties[prop];
        })
        validation = revalidator.validate(data, schema);
      } else {
        validation = revalidator.validate(data, this.constructor.schema);
      }
      if (validation.valid) {
        return data;
      } else {
        return Promise.reject({
          type: 'validation',
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
     * @param {Object} where - sometimes we need in additional conditions in query.
     * @returns {Promise}
     */
    async update(where = {}) {
      if (this._id) {
        let data = await this.prepare('update');
        if (this.constructor.schema.updatePatch || this.constructor.schema.sendOnlyUpdates) {
          data = { $set: data };
        }
        await this.constructor.c.updateOne(Object.assign(where, { _id: this._id }), data);
        return this;
      } else {
        return Promise.reject('_id required for update');
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
          this.deleted = true;
          return this.update(where);
        } else {
          return this.constructor.c.deleteOne(Object.assign(where, { _id: this._id }));
        }
      } else {
        return Promise.reject('_id required for delete');
      }
    }

    /**
     * @param schema.safeDelete
     * @param schema.updatePatch
     * @param schema.sendOnlyUpdates
     */
    static get schema() {}

    /**
     * getter for internal collection class
     * @returns {Collection}
     * @constructor
     */
    static get Collection() {
      return Collection;
    }

    /**
     * getter for mongo collection instance
     * @returns {Object}
     */
    static get c() {
      return app.db.collection(this.schema.name);
    }

    /**
     *
     * @param where {Object}
     * @param options {Object}
     * @param connections {Object}
     * @returns {Promise}
     */
    static async read(where = {}, options = {}, connections) {
      //TODO join connections D:
      let r = await this.c.find(where, options).toArray();
      return new this.Collection().wrap(r, this);
    }

    /**
     *
     * @param where {Object}
     * @returns {Promise}
     */
    static count(where) {
      return this.c.count(where);
    }

    /**
     * find element by id, rejects if not found
     * @param {Object|string} id
     * @param {Object} options
     * @param {Object} connections
     * @returns {Promise}
     */
    static byId(id, options, connections) {
      id = this.prepareIdSingle(id);
      return id ? this.by('_id', id, options, connections) : Promise.reject('invalid id');
    }

    /**
     * find one element by {field}, rejects if not found
     * @param {string} field
     * @param {Object} key
     * @param {Object} options
     * @param {Object} connections
     * @returns {Promise}
     */
    static async by(field, key, options, connections) {
      let where = {};
      where[field] = key;
      let result = await this.read(where, options, connections);
      return result.length ? result[0] : Promise.reject('item not found');
    }

    static prepareIdSingle(id) {
      try {
        return new mongodb.ObjectID(id);
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
          _.compact(obj).forEach((val, key) => {
            objNew[key] = this.forceSchema(schema.items, val);
          });
        } else {
          objNew = null;
        }
      } else if (schema.type == 'object') {
        objNew = {};
        if (obj instanceof Object) {
          _.forEach(schema.properties, (schemaPart, key) => {
            if (obj.hasOwnProperty(key)) {
              objNew[key] = this.forceSchema(schemaPart, obj[key]);
            }
          });
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
        let undVar;
        objNew = ![false, 0, '', '0', 'false', null, undVar].includes(obj);
      } else if (schema.type == 'any') {
        objNew = obj;
      }
      return objNew;
    }
  };
};
