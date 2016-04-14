'use strict';

var revalidator = require('revalidator');
var _ = require('lodash');
var mongodb = require('mongodb');

class Collection extends Array {
	/**
	 *
	 * @param items
	 * @param Model
	 * @returns {Collection}
	 */
	wrap(items, Model) {
		if (items && items.length) {
			items.forEach((item) => {
				if (item instanceof Model) {
					this.push(item);
				} else {
					this.push(new Model(item));
				}
			});
		}
		return this;
	}

	/**
	 *
	 * lodash wrapper
	 * @returns {*}
	 */
	get _() {
		return _(this);
	}
}

module.exports = (app) => {
	return class Model {
		/**
		 *
		 * @param properties
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
		 * @param path
		 * @returns {*}
		 */
		get(path) {
			return _.get(this, path);
		}

		/**
		 * useful wrapper for setting values of deep objects
		 * @param path
		 * @returns {Object}
		 */
		set(path) {
			return _.set(this, path);
		}

		/**
		 *
		 * @returns {{Object}}
		 */
		toJSON() {
			var result = {};
			Object.keys(this).forEach((prop) => {
				result[prop] = this[prop];
			});
			return result;
		}

		/**
		 * prepares the object to database
		 * @param op
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
				return app.db.collection(this.constructor.schema.name).insertOne(data);
			}).then((result) => {
				this._id = result.ops[0]._id;
				return this;
			});
		}

		/**
		 *
		 * @param where - sometimes we need in additional conditions in query.
		 * @returns {Promise.}
		 */
		update(where) {
			return this.prepare('update').then((data) => {
				if (this.constructor.schema.updatePatch) {
					data = {
						$set: data
					};
				}
				return app.db.collection(this.constructor.schema.name).updateOne(_.merge(where || {}, {
					_id: this._id
				}), data).then(() => {
					return this;
				});
			});
		}

		/**
		 *
		 * @param where - sometimes we need in additional conditions in query. for example, to update the record of a particular user, to avoid reading the document and comparison.
		 * @returns {Promise}
		 */
		delete(where) {
			if (this.constructor.schema.safeDelete) {
				this.deleted = true;
				return this.update(where);
			} else {
				return app.db.collection(this.constructor.schema.name).deleteOne(_.merge(where || {}, {
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

		/**
		 *
		 * @param where
		 * @param options
		 * @param connections
		 * @returns {Promise}
		 */
		static read(where, options, connections) {
			//TODO join connections D:
			where = where || {};
			options = options || {};
			return app.db.collection(this.schema.name).find(where, options).toArray().then((result) => {
				return new this.Collection().wrap(result, this);
			});
		}

		/**
		 * find element by id, rejects if not found
		 * @param id
		 * @param options
		 * @param connections
		 * @returns {Promise}
		 */
		static byId(id, options, connections) {
			return this.by('_id', this.prepareId(id), options, connections);
		}

		/**
		 * find one element by {field}, rejects if not found
		 * @param field
		 * @param key
		 * @param options
		 * @param connections
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
