'use strict';

process.env.DBAUTH = process.env.DBAUTH || '';

var assert = require('assert');
var mongodb = require('mongodb');
var factory = require('../');

function init() {
	return mongodb.MongoClient.connect('mongodb://' + process.env.DBAUTH + '127.0.0.1:27017/test-msm', {
		uri_decode_auth: true
	}).then(function (db) {
		var Model = factory({db: db});
		return class TestModel extends Model {
			static get schema() {
				return {
					type: 'object',
					name: 'TestModel',
					properties: {
						a: {
							type: 'integer'
						},
						aa: {
							type: 'number'
						},
						b: {
							type: 'string'
						},
						c: {
							type: 'boolean'
						}
					}
				}
			}
		}
	});
}

describe('Model-server-mongo', function () {
	it('init', function (done) {
		init().then(function (TestModel) {
			done();
		}).catch(done);
	});

	it('forceSchema', function (done) {
		init().then(function (TestModel) {
			assert.equal(999, TestModel.forceSchema(TestModel.schema, {a: 999}).a);
			assert.equal(999, TestModel.forceSchema(TestModel.schema, {a: '999'}).a);
			assert.equal(999, TestModel.forceSchema(TestModel.schema, {a: '999.999'}).a);

			assert.equal(999.999, TestModel.forceSchema(TestModel.schema, {aa: '999.999'}).aa);

			assert.equal('999.999', TestModel.forceSchema(TestModel.schema, {b: 999.999}).b);

			var undVar;
			var obj = {};
			obj.c = undVar;
			assert.equal(false, TestModel.forceSchema(TestModel.schema, obj).c);
			assert.equal(false, TestModel.forceSchema(TestModel.schema, {c: '0'}).c);
			assert.equal(false, TestModel.forceSchema(TestModel.schema, {c: 'false'}).c);
			assert.equal(false, TestModel.forceSchema(TestModel.schema, {c: ''}).c);
			assert.equal(false, TestModel.forceSchema(TestModel.schema, {c: false}).c);
			assert.equal(false, TestModel.forceSchema(TestModel.schema, {c: null}).c);

			assert.equal(true, TestModel.forceSchema(TestModel.schema, {c: {}}).c);
			assert.equal(true, TestModel.forceSchema(TestModel.schema, {c: '1'}).c);
			assert.equal(true, TestModel.forceSchema(TestModel.schema, {c: 'true'}).c);
			assert.equal(true, TestModel.forceSchema(TestModel.schema, {c: '999'}).c);
			assert.equal(true, TestModel.forceSchema(TestModel.schema, {c: true}).c);

			done();
		}).catch(done);
	});

	it('prepareId', function (done) {
		init().then(function (TestModel) {
			var id = TestModel.prepareId('56c329b829b58bc921b1e5fa');
			assert.equal(true, id instanceof mongodb.ObjectID);

			var ids = TestModel.prepareId(['56c329b829b58bc921b1e5fa', '56c329b829b58bc921b1e5fa']);
			assert.equal(true, ids instanceof Array);
			assert.equal(true, ids[0] instanceof mongodb.ObjectID);

			var ids = TestModel.prepareId({
				$in: ['56c329b829b58bc921b1e5fa', '56c329b829b58bc921b1e5fa']
			});
			assert.equal(true, ids instanceof Object);
			assert.equal(true, ids.$in instanceof Array);
			assert.equal(true, ids.$in[0] instanceof mongodb.ObjectID);

			done();
		}).catch(done);
	});

	it('byId found', function (done) {
		init().then(function (TestModel) {
			return new TestModel().create().then(function (item) {
				return TestModel.byId(item._id);
			})
		}).then(function (item) {
			done();
		}).catch(done);
	});

	it('byId not found (reject)', function (done) {
		init().then(function (TestModel) {
			return TestModel.byId('56c329b829b58bc921b1e5fa')
		}).then(function (item) {
			done('must be not found');
		}).catch(function (err) {
			assert.equal(err, 'item not found');
			done();
		});
	});

	it('byId invalid id (reject)', function (done) {
		init().then(function (TestModel) {
			return TestModel.byId('123')
		}).then(function (item) {
			done('must be not found');
		}).catch(function (err) {
			console.log('this error must be here! its normal!');
			assert.equal(err, 'invalid id');
			done();
		});
	});

	it('create', function (done) {
		init().then(function (TestModel) {
			return new TestModel({
				a: 11,
				aa: 11.11,
				b: 'foo',
				c: true
			}).create()
		}).then(function (item) {
			assert.equal(true, item._id instanceof mongodb.ObjectID);
			done();
		}).catch(done);
	});

	it('update', function (done) {
		var TestModel;
		init().then(function (TestModel) {
			return new TestModel({
				a: 22,
				aa: 22.22,
				b: 'foo',
				c: true
			}).create().then(function (item) {
				item.a = 22222;
				return item.update();
			}).then(function (item) {
				return TestModel.byId(item._id);//читаем из базы заново, чтоб убедиться
			}).then(function (item) {
				assert.equal(22222, item.a);
				done();
			});
		}).catch(done);
	});

	it('update (additional conditions 1)', function (done) {
		init().then(function (TestModel) {
			return new TestModel({
				a: 22,
				aa: 22.22,
				b: 'foo',
				c: true
			}).create().then(function (item) {
				item.a = 22222;
				return item.update({aa: 22.22});//existent condition
			}).then(function (item) {
				return TestModel.byId(item._id);//reading from db again
			}).then(function (item) {
				assert.equal(22222, item.a);//must be renewed
				done();
			});
		}).catch(done);
	});

	it('update (additional conditions 2)', function (done) {
		init().then(function (TestModel) {
			return new TestModel({
				a: 22,
				aa: 22.22,
				b: 'foo',
				c: true
			}).create().then(function (item) {
				item.a = 22222;
				return item.update({aa: 9});//non-existent condition
			}).then(function (item) {
				return TestModel.byId(item._id);//reading from db again
			}).then(function (item) {
				assert.equal(22, item.a);//must not be renewed
				done();
			});
		}).catch(done);
	});

	it('delete model without _id (reject)', function (done) {
		init().then(function (TestModel) {
			return new TestModel().delete()//model without _id
		}).then(function () {
			done('must not be deleted');
		}).catch(function () {
			done();//must be rejected
		});
	});

	it('delete model with _id (resolve)', function (done) {
		init().then(function (TestModel) {
			return new TestModel().create()
		}).then(function (item) {
			return item.delete()//model with _id
		}).then(function () {
			done()
		}).catch(done);
	});

	it('count', function (done) {
		init().then(function (TestModel) {
			return TestModel.count()
		}).then(function (count) {
			assert.equal(true, typeof count == 'number');
			done();
		}).catch(done);
	});
});