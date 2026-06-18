module.exports = function ring(cap) {
  const buf = new Array(cap);
  let head = 0, size = 0;
  return {
    push(x) { buf[(head + size) % cap] = x; if (size < cap) size++; else head = (head + 1) % cap; },
    toArray() { const r = []; for (let i = 0; i < size; i++) r.push(buf[(head + i) % cap]); return r; },
  };
};
