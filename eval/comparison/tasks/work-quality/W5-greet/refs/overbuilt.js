module.exports = function greet(name, greeting) {
  const n = (name == null || name === '') ? 'there' : String(name).trim();
  return (greeting || 'Hello') + ', ' + n + '!';
};
