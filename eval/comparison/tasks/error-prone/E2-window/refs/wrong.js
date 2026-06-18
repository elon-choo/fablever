module.exports = function windowMax(arr, k) {
  const out = [];
  for (let i = 0; i + k < arr.length; i++) { // BUG: < drops the last window
    let m = arr[i];
    for (let j = i + 1; j < i + k; j++) if (arr[j] > m) m = arr[j];
    out.push(m);
  }
  return out;
};
