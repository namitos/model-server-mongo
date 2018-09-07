const _ = require('lodash');

/**
 * Wrapper of array
 */
class Collection extends Array {
  /**
   *
   * @param items
   * @param Model
   * @returns {Collection}
   */
  wrap(items = [], Model) {
    for (let i = 0, iL = items.length; i < iL; ++i) {
      this.push(new Model(items[i]));
    }
    return this;
  }

  /**
   * 
   * @param {Object} param0
   * @param {Object} param0.model model to join 
   * @param {String} param0.l 
   * @param {String} param0.r
   * @param {String} param0.as field, where we store joined documents
   * @param {Boolean} param0.single "single document or array" flag
   * @param {Object} param0.fields mongodb fields parameter
   */
  async joinModels({ model, l, r, as, single, fields = {} }) {
    let keys = new Set();
    for (let i = 0, iL = this.length; i < iL; ++i) {
      let item = this[i];
      let key = item.get(l);
      if (key) {
        if (key instanceof Array) {
          key = r === '_id' ? key.map((item) => model.prepareIdSingle(item)) : key.map((item) => item.toString());
          for (let j = 0, jL = key.length; j < jL; ++j) {
            keys.add(key[j]);
          }
        } else {
          key = r === '_id' ? model.prepareIdSingle(key) : key.toString();
          keys.add(key);
        }
      }
    }
    let joinedItems = await model.read({
      [r]: { $in: [...keys] }
    }, { fields })
    let groups = _.groupBy(joinedItems, r);
    for (let i = 0, iL = this.length; i < iL; ++i) {
      let item = this[i];
      let key = item.get(l);
      if (key instanceof Array) {
        item[as] = [];
        for (let j = 0, jL = key.length; j < jL; ++j) {
          let k = key[j];
          if (groups[k]) {
            item[as] = item[as].concat(groups[k]);
          }
        }
      } else {
        if (single) {
          item[as] = groups[key] ? groups[key][0] : null
        } else {
          item[as] = groups[key] ? groups[key] : []
        }
      }
    }
  }
}

module.exports = Collection;