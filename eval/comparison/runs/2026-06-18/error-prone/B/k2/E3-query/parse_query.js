module.exports = function parseQuery(s) {
  if (!s) return {};
  const order = [];
  const groups = Object.create(null);
  for (const part of s.split("&")) {
    const eq = part.indexOf("=");
    let key, value;
    if (eq === -1) {
      key = part;
      value = "";
    } else {
      key = part.slice(0, eq);
      value = part.slice(eq + 1);
    }
    if (!(key in groups)) {
      groups[key] = [];
      order.push(key);
    }
    groups[key].push(value);
  }
  const result = {};
  for (const key of order) {
    const values = groups[key];
    result[key] = values.length > 1 ? values : values[0];
  }
  return result;
};
