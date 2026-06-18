module.exports = function createUser(obj) {
  return { name: obj.name, age: obj.age, role: obj.role || 'member' };
};
