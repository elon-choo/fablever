module.exports = function buildResponse(data, now) {
  return { status: 200, payload: data, timestamp: now(), version: 'v1' };
};
