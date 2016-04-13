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
});