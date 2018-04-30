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

  async join() {
    try {
      console.trace('Collection.join deprecated. use Collection.joinModels');
    } catch (err) { console.error(err) }
    return this.joinModels(...arguments);
  }

  async joinModels({ model, l, r, as, single, fields = {} }) {
    let keys = new Set();
    this.forEach((item) => {
      let key = item.get(l);
      if (key instanceof Array) {
        key = r === '_id' ? key.map((item) => model.prepareIdSingle(item)) : key.map((item) => item.toString());
        key.forEach((k) => {
          keys.add(k);
        });
      } else {
        key = r === '_id' ? model.prepareIdSingle(key) : key.toString();
        keys.add(key);
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

  /**
   * lodash wrapper
   * @returns {Object}
   */
  get _() {
    return _(this);
  }
}

module.exports = Collection;
