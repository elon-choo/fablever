flatten() in src/flat.js only takes the first element of each sub-array — flatten([[1,2],[3]]) returns [1,2] instead of [1,2,3]. Fix it.
