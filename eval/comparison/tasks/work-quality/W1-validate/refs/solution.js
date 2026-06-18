module.exports = function createUser(obj) {
  if (obj.age !== undefined && (!Number.isInteger(obj.age) || obj.age <= 0)) throw new Error('invalid age');
  return { name: obj.name, age: obj.age, role: obj.role || 'member' };
};
