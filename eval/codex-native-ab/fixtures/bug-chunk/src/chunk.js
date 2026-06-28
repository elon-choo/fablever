'use strict';
// BUG: the loop condition i + size <= length drops the final PARTIAL chunk.
function chunk(arr, size) { const out = []; for (let i = 0; i + size <= arr.length; i += size) out.push(arr.slice(i, i + size)); return out; }
module.exports = { chunk };
