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
    this.forEach((item) => {
      let key = item.get(l);
      if (key) {
        if (key instanceof Array) {
          key = r === '_id' ? key.map((item) => model.prepareIdSingle(item)) : key.map((item) => item.toString());
          key.forEach((k) => {
            keys.add(k);
          });
        } else {
          key = r === '_id' ? model.prepareIdSingle(key) : key.toString();
          keys.add(key);
        }
      }
    });
    let joinedItems = await model.read({
      [r]: { $in: [...keys] }
    }, { fields })
    let groups = _.groupBy(joinedItems, r);
    this.forEach((item) => {
      let key = item.get(l);
      if (key instanceof Array) {
        item[as] = [];
        key.forEach((k) => {
          item[as] = item[as].concat(groups[k]);
        });
      } else {
        if (single) {
          item[as] = groups[key] ? groups[key][0] : null
        } else {
          item[as] = groups[key]
        }
      }
    })
  }
}

module.exports = Collection;