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

		create() {
			var model = this;
			return new Promise(function (resolve, reject) {
				var data = model.toJSON();
				data = app.util.forceSchema(model.constructor.schema, data);
				var validation = revalidator.validate(data, model.constructor.schema);
				if (validation.valid) {
					app.db.collection(model.constructor.schema.name).insertOne(data).then(function (result) {
						model._id = result.ops[0]._id;
						resolve(model);
					}).catch(function (err) {
						reject({
							type: 'create',
							data: err.toString()
						});
					});
				} else {
					reject({
						type: 'validation',
						data: validation.errors
					});
				}
			});
		}

		update() {
			var model = this;
			return new Promise(function (resolve, reject) {
				var data = model.toJSON();
				data = app.util.forceSchema(model.constructor.schema, data);
				var validation = revalidator.validate(data, model.constructor.schema);
				if (validation.valid) {
					if (model.constructor.schema.updatePatch) {
						data = {
							$set: data
						};
					}
					app.db.collection(model.constructor.schema.name).updateOne({
						_id: model._id
					}, data).then(function (result) {
						console.log('model', model);
						resolve(model);
					}).catch(function (err) {
						reject({
							type: 'update',
							data: err
						});
					});
				} else {
					reject({
						type: 'validation',
						data: validation.errors
					});
				}
			});
		}

		delete() {
			var model = this;
			if (This.schema.safeDelete) {
				this.deleted = true;
				return this.update();
			} else {
				return new Promise(function (resolve, reject) {
					app.db.collection(model.constructor.schema.name).deleteOne({
						_id: model._id
					}).then(function () {
						resolve();
					}).catch(function (err) {
						reject({
							type: 'delete',
							data: err
						});
					});
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
					reject({
						type: 'read',
						data: err.toString()
					});
				});
			});
		}

		static byId(id, options, connections) {
			var This = this;
			return this.read({
				_id: app.util.prepareId(id)
			}, options, connections).then(function (result) {
				return new Promise(function (resolve, reject) {
					if (result.length) {
						resolve(result[0]);
					} else {
						reject({
							type: 'read',
							data: 'item not found'
						})
					}
				});
			});
		}
	};
};
