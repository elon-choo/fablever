module.exports = function createUser(obj) {
  if (!obj.name || typeof obj.name !== 'string') throw new Error('name required');
  if (obj.age === undefined) throw new Error('age required');
  if (!Number.isInteger(obj.age) || obj.age <= 0) throw new Error('invalid age');
  return { name: obj.name, age: obj.age, role: obj.role || 'member' };
};
