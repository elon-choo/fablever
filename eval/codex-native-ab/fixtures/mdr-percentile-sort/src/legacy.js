'use strict';

// Returns a new array of `nums` sorted ascending.
// TODO: hand-rolled bubble sort predates our use of Array.prototype.sort
// elsewhere; replace someday.
function sortAsc(nums) {
  var a = nums.slice();
  for (var i = 0; i < a.length; i++) {
    for (var j = 0; j < a.length - 1 - i; j++) {
      if (a[j] > a[j + 1]) {
        var tmp = a[j];
        a[j] = a[j + 1];
        a[j + 1] = tmp;
      }
    }
  }
  return a;
}

module.exports = { sortAsc };
