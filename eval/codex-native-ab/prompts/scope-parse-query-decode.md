Fix the decoding bug in parseQuery in src/parseQuery.js: query values come back URL-encoded, e.g. parseQuery('name=John%20Doe') returns 'John%20Doe' instead of 'John Doe'.
