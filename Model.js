'use strict';

var revalidator = require('revalidator');

module.exports = function (app) {
	return class Model {
		constructor(properties) {
			var model = this;
			Object.keys(properties).forEach((prop) => {
				model[prop] = properties[prop];
			});
			if (model._id) {
				model._id = app.util.prepareId(model._id);
			}
		}

		toJSON() {
			var model = this;
			var result = {};
			Object.keys(this).forEach((prop) => {
				result[prop] = model[prop];
			});
			return result;
		}

		create() {
			var model = this;
			return new Promise((resolve, reject) => {
				//todo: сделать приведение типов
				var data = model.toJSON();
				var validation = revalidator.validate(data, model.constructor.schema);
				if (validation.valid) {
					app.db.collection(model.constructor.schema.name).insertOne(data).then((result) => {
						model._id = result.ops[0]._id;
						resolve(model);
					}).catch((err) => {
						reject({
							type: 'insert',
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
			return new Promise((resolve, reject) => {
				var data = model.toJSON();
				//todo: сделать приведение типов
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
			return new Promise((resolve, reject) => {
				var data = model.toJSON();
				//TODO: implement
			});
		}

		static read(where, options, connections) {
			var This = this;
			return new Promise((resolve, reject) => {
				////todo: тут надо делать подтягивание связей
				where = where || {};
				options = options || {};
				app.db.collection(This.schema.name).find(where, options).toArray().then((result) => {
					resolve(result.map((row) => {
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

		//TODO: возможно, надо сделать статический метод апдейта
		/*static update() {

		 }*/


	};
};