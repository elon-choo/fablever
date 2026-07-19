# CSV parsing

Implement `parseCsv(text)` in `scaffold/csv-parse.mjs`.

The function must:

- return an array of rows, where every row is an array of string fields;
- split ordinary fields on commas and rows on newlines;
- allow a double-quoted field to contain commas;
- decode doubled quotes inside a quoted field (`""` becomes `"`);
- avoid adding an empty final row when the input ends with a newline.

Keep the named ESM export and use only Node.js built-ins.
