pageCount(total, perPage) in src/x.js under-counts when the last page is partial -- 11 items at 10 per page should be 2 pages but it returns 1. Fix the page-count calculation.
