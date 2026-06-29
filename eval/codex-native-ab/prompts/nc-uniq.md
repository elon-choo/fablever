uniq() in src/uniq.js drops the first occurrence of each duplicate — uniq([1,2,2,3,1]) returns [2,3,1] instead of [1,2,3]. Fix it.
