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
			var obj = TestModel.forceSchema(TestModel.schema, {
				a: '1',
				b: 1,
				c: '0'
			});
			assert.equal(true, obj.a === 1);
			assert.equal(true, obj.b === '1');
			assert.equal(true, obj.c === false);
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