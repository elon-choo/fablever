range(start, end) in src/range.js is off by one — range(1, 5) should be [1,2,3,4] but it returns [1,2,3,4,5], wrongly including the end value. Fix it.
