'use strict';

var revalidator = require('revalidator');
var _ = require('lodash');
var mongodb = require('mongodb');

var Collection = require('./Collection');

module.exports = (app) => {
	return class Model {
		/**
		 * @constructor
		 * @param {Object} properties
		 */
		constructor(properties) {
			Object.keys(properties).forEach((prop) => {
				this[prop] = properties[prop];
			});
			if (this._id) {
				this._id = this.constructor.prepareId(this._id);
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
			var result;

			if (obj instanceof mongodb.ObjectId) {
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
		prepare(op) {
			return new Promise((resolve, reject) => {
				var data = this.constructor.forceSchema(this.constructor.schema, this);
				var validation = revalidator.validate(data, this.constructor.schema);
				if (validation.valid) {
					resolve(data);
				} else {
					reject({
						type: 'validation',
						data: validation.errors
					});
				}
			});
		}

		/**
		 *
		 * @returns {Promise}
		 */
		create() {
			return this.prepare('create').then((data) => {
				return this.constructor.c.insertOne(data);
			}).then((result) => {
				this._id = result.ops[0]._id;
				return this;
			});
		}

		/**
		 *
		 * @param {Object} where - sometimes we need in additional conditions in query.
		 * @returns {Promise}
		 */
		update(where) {
			return this.prepare('update').then((data) => {
				if (this.constructor.schema.updatePatch) {
					data = {
						$set: data
					};
				}
				return this.constructor.c.updateOne(_.merge(where || {}, {
					_id: this._id
				}), data).then(() => {
					return this;
				});
			});
		}

		/**
		 *
		 * @param {Object} where - sometimes we need in additional conditions in query. for example, to update the record of a particular user, to avoid reading the document and comparison.
		 * @returns {Promise}
		 */
		delete(where) {
			if (this.constructor.schema.safeDelete) {
				this.deleted = true;
				return this.update(where);
			} else {
				return this.constructor.c.deleteOne(_.merge(where || {}, {
					_id: this._id
				}));
			}
		}

		/**
		 *
		 * @returns {Collection}
		 * @constructor
		 */
		static get Collection() {
			return Collection;
		}

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
		static read(where, options, connections) {
			//TODO join connections D:
			where = where || {};
			options = options || {};
			return this.c.find(where, options).toArray().then((result) => {
				return new this.Collection().wrap(result, this);
			});
		}

		/**
		 * find element by id, rejects if not found
		 * @param {Object|string} id
		 * @param {Object} options
		 * @param {Object} connections
		 * @returns {Promise}
		 */
		static byId(id, options, connections) {
			return this.by('_id', this.prepareId(id), options, connections);
		}

		/**
		 * find one element by {field}, rejects if not found
		 * @param {string} field
		 * @param {Object} key
		 * @param {Object} options
		 * @param {Object} connections
		 * @returns {Promise}
		 */
		static by(field, key, options, connections) {
			var where = {};
			where[field] = key;
			return this.read(where, options, connections).then((result) => {
				return new Promise((resolve, reject) => {
					if (result.length) {
						resolve(result[0]);
					} else {
						reject('item not found');
					}
				});
			});
		}

		static prepareId(id) {
			var newId;
			try {
				if (id instanceof Array) {
					newId = [];
					id.forEach((item, i) => {
						newId.push(this.prepareId(item));
					});
				} else if (id instanceof Object && id.hasOwnProperty('$in')) {
					newId = {
						$in: this.prepareId(id.$in)
					};
				} else {
					newId = new mongodb.ObjectID(id.toString());
				}
			} catch (err) {
				console.error(id, err);
			}
			return newId;
		}

		static forceSchema(schema, obj) {
			var objNew;
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
				var undVar;
				objNew = !_.includes([false, 0, '', '0', 'false', null, undVar], obj);
			} else if (schema.type == 'any') {
				objNew = obj;
			}
			return objNew;
		}
	};
};
