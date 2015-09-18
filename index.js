'use strict';

var revalidator = require('revalidator');

module.exports = function (app) {
	return class Model {
		constructor(properties) {
			var model = this;
			Object.keys(properties).forEach(function (prop) {
				model[prop] = properties[prop];
			});
			if (model._id) {
				model._id = app.util.prepareId(model._id);
			}
		}

		toJSON() {
			var model = this;
			var result = {};
			Object.keys(this).forEach(function (prop) {
				result[prop] = model[prop];
			});
			return result;
		}

		prepare() {
			var model = this;
			return new Promise(function (resolve, reject) {
				var data = app.util.forceSchema(model.constructor.schema, model);
				var validation = revalidator.validate(data, model.constructor.schema);
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

		create() {
			var model = this;
			return model.prepare().then(function (data) {
				return app.db.collection(model.constructor.schema.name).insertOne(data);
			}).then(function (result) {
				return new Promise(function (resolve) {
					model._id = result.ops[0]._id;
					resolve(model);
				});
			});
		}

		update() {
			var model = this;
			return model.prepare().then(function (data) {
				if (model.constructor.schema.updatePatch) {
					data = {
						$set: data
					};
				}
				return app.db.collection(model.constructor.schema.name).updateOne({
					_id: model._id
				}, data).then(function () {
					return new Promise(function (resolve) {
						resolve(model);
					});
				});
			});
		}

		delete() {
			var model = this;
			if (model.constructor.schema.safeDelete) {
				model.deleted = true;
				return model.update();
			} else {
				return app.db.collection(model.constructor.schema.name).deleteOne({
					_id: model._id
				});
			}
		}

		static read(where, options, connections) {
			var This = this;
			return new Promise(function (resolve, reject) {
				//TODO: тут надо делать подтягивание связей
				where = where || {};
				options = options || {};
				app.db.collection(This.schema.name).find(where, options).toArray().then(function (result) {
					resolve(result.map(function (row) {
						return new This(row);
					}));
				}).catch(function (err) {
					reject(err);
				});
			});
		}

		static byId(id, options, connections) {
			return this.read({
				_id: app.util.prepareId(id)
			}, options, connections).then(function (result) {
				return new Promise(function (resolve, reject) {
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
