'use strict';

var revalidator = require('revalidator');
var _ = require('lodash');

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
				this._id = app.util.prepareId(this._id);
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
				var data = app.util.forceSchema(this.constructor.schema, this);
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
		 * @returns {Promise}
		 */
		update() {
			return this.prepare('update').then((data) => {
				if (this.constructor.schema.updatePatch) {
					data = {
						$set: data
					};
				}
				return app.db.collection(this.constructor.schema.name).updateOne({
					_id: this._id
				}, data).then(() => {
					return this;
				});
			});
		}

		/**
		 *
		 * @returns {Promise}
		 */
		delete() {
			if (this.constructor.schema.safeDelete) {
				this.deleted = true;
				return this.update();
			} else {
				return app.db.collection(this.constructor.schema.name).deleteOne({
					_id: this._id
				});
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
			return this.by('_id', app.util.prepareId(id), options, connections);
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
	};
};
