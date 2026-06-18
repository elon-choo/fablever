module.exports = function createUser(obj) {
  if (obj.age !== undefined && (!Number.isInteger(obj.age) || obj.age <= 0)) {
    throw new Error('age must be a positive integer');
  }
  return { name: obj.name, age: obj.age, role: obj.role || 'member' };
};
