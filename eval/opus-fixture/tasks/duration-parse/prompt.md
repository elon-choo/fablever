Implement `parseDuration` in `scaffold/duration-parse.mjs`.

The module must export:

```js
export function parseDuration(s);
```

Return an integer number of milliseconds, or `null` for invalid input.

Supported units are `ms`, `s`, `m`, `h`, and `d`. Support single values such as
`500ms`, compounds such as `1h30m`, and decimals such as `1.5h`. Ignore
surrounding whitespace and whitespace between compound components. The entire
non-whitespace input must consist of valid number-unit components; inputs such
as `''`, `abc`, `10x`, and `h` are invalid.
