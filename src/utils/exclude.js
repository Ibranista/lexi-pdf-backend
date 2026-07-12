/**
 * Return a shallow copy of obj with the given keys removed
 * @param {Object} obj
 * @param {string[]} keys
 * @returns {Object}
 */
const exclude = (obj, keys) => {
  const result = { ...obj };
  keys.forEach((key) => delete result[key]);
  return result;
};

module.exports = exclude;
