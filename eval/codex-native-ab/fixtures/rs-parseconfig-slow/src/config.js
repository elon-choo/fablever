'use strict';

function parseConfig(text) {
  const lines = text.split('\n');
  const keys = [];
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (keys.includes(key)) continue; // first definition wins
    keys.push(key);
    out[key] = value;
  }
  return out;
}

module.exports = { parseConfig };
