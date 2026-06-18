module.exports = function greet(name, greeting) {
  if (greeting === undefined) greeting = 'Hello';
  return greeting + ', ' + name + '!';
};
