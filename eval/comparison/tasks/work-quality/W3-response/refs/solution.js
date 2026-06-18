module.exports = function buildResponse(data, now) {
  return { status: 200, data, timestamp: now() };
};
