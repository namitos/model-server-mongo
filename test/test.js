'use strict';

process.env.DBAUTH = process.env.DBAUTH || '';

const assert = require('assert');
const mongodb = require('mongodb');
const Model = require('../');

async function init() {
  // /test-msm - where we must authenticate
  let client = await mongodb.MongoClient.connect(`mongodb://${process.env.DBAUTH}127.0.0.1:27017/test-msm`);
  let TestModel = class TestModel extends Model {
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

    static get db() {
      return client.db('test-msm');
    }
  }

  return { client, TestModel }
}

describe('Model-server-mongo', function() {
  it('init', async function() {
    let { client, TestModel } = await init();
    client.close();
  });

  it('forceSchema', async function() {
    let { client, TestModel } = await init();

    assert.equal(999, TestModel.forceSchema(TestModel.schema, { a: 999 }).a);
    assert.equal(999, TestModel.forceSchema(TestModel.schema, { a: '999' }).a);
    assert.equal(999, TestModel.forceSchema(TestModel.schema, { a: '999.999' }).a);

    assert.equal(999.999, TestModel.forceSchema(TestModel.schema, { aa: '999.999' }).aa);

    assert.equal('999.999', TestModel.forceSchema(TestModel.schema, { b: 999.999 }).b);

    var undVar;
    var obj = {};
    obj.c = undVar;
    assert.equal(false, TestModel.forceSchema(TestModel.schema, obj).c);
    assert.equal(false, TestModel.forceSchema(TestModel.schema, { c: '' }).c);
    assert.equal(false, TestModel.forceSchema(TestModel.schema, { c: false }).c);
    assert.equal(false, TestModel.forceSchema(TestModel.schema, { c: null }).c);

    assert.equal(true, TestModel.forceSchema(TestModel.schema, { c: {} }).c);
    assert.equal(true, TestModel.forceSchema(TestModel.schema, { c: '1' }).c);
    assert.equal(true, TestModel.forceSchema(TestModel.schema, { c: 'true' }).c);
    assert.equal(true, TestModel.forceSchema(TestModel.schema, { c: '999' }).c);
    assert.equal(true, TestModel.forceSchema(TestModel.schema, { c: true }).c);

    client.close();
  });

  it('prepareId', async function() {
    let { client, TestModel } = await init();

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

    client.close();
  });

  it('byId found', async function() {
    let { client, TestModel } = await init();

    let item = await new TestModel().create();
    await TestModel.byId(item._id);

    client.close();
  });

  it('byId not found (reject)', async function() {
    let { client, TestModel } = await init();
    try {
      await TestModel.byId('56c329b829b58bc921b1e5fa');
    } catch (err) {
      assert.equal(err.text, 'not found');
    }
    client.close();
  });

  it('byId invalid id (reject)', async function() {
    let { client, TestModel } = await init();
    try {
      await TestModel.byId('123');
    } catch (err) {
      console.log('this error must be here! its normal!');
      assert.equal(err.text, 'invalid id');
    }
    client.close();
  });

  it('create', async function() {
    let { client, TestModel } = await init();
    let item = await new TestModel({
      a: 11,
      aa: 11.11,
      b: 'foo',
      c: true
    }).create();
    assert.equal(true, item._id instanceof mongodb.ObjectID);

    client.close();
  });











  it('update', async function() {
    let { client, TestModel } = await init();
    let item = await new TestModel({
      a: 22,
      aa: 22.22,
      b: 'foo',
      c: true
    }).create();
    item.a = 22222;
    await item.update();
    item = await TestModel.byId(item._id);
    assert.equal(22222, item.a);

    client.close();
  });

  it('update (additional conditions 1)', async function() {
    let { client, TestModel } = await init();

    let item = await new TestModel({
      a: 22,
      aa: 22.22,
      b: 'foo',
      c: true
    }).create();
    item.a = 22222;
    await item.update({ aa: 22.22 }); //existent condition;
    item = await TestModel.byId(item._id);
    assert.equal(22222, item.a);

    client.close();
  });

  it('update (additional conditions 2)', async function() {
    let { client, TestModel } = await init();

    let item = await new TestModel({
      a: 22,
      aa: 22.22,
      b: 'foo',
      c: true
    }).create();
    item.a = 22222;
    await item.update({ aa: 9 }); //non existent condition; should not update
    item = await TestModel.byId(item._id);
    assert.equal(22, item.a);

    client.close();
  });


  it('updateQuery', async function() {
    let { client, TestModel } = await init();

    let item = await new TestModel({
      a: 22,
      aa: 22.22,
      b: 'foo',
      c: true
    }).create();
    await item.updateQuery({ $set: { aa: 9 } }); //non existent condition;
    item = await TestModel.byId(item._id);
    assert.equal(9, item.aa);

    client.close();
  });

  it('delete model without _id (reject)', async function() {
    let { client, TestModel } = await init();

    try {
      await new TestModel().delete() //model without _id
    } catch (err) {
      assert.equal(err.text, '_id required for delete');
    }

    client.close();
  });

  it('delete model with _id (resolve)', async function() {
    let { client, TestModel } = await init();

    let item = await new TestModel().create();
    await item.delete() //model with _id

    client.close();
  });

  it('count', async function() {
    let { client, TestModel } = await init();

    let count = await TestModel.count();
    assert.equal(true, typeof count == 'number');

    client.close();
  });
});