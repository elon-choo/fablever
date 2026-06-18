module.exports = function windowMax(arr, k) {
  if (k > arr.length) return [];
  const result = [];
  for (let i = 0; i + k <= arr.length; i++) {
    let max = arr[i];
    for (let j = i + 1; j < i + k; j++) {
      if (arr[j] > max) max = arr[j];
    }
    result.push(max);
  }
  return result;
};
