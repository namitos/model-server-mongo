'use strict';

var _ = require('lodash');

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
	 * lodash wrapper
	 * @returns {Object}
	 */
	get _() {
		return _(this);
	}
}

module.exports = Collection;