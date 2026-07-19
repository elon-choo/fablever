Implement `getPointer` in `scaffold/json-pointer.mjs`.

The module must export:

```js
export function getPointer(obj, pointer);
```

Support the RFC 6901 pointer rules needed here:

- `''` returns the original input value.
- Non-empty pointers use `/`-separated segments and can traverse nested objects
  and array indexes.
- Decode `~1` to `/` first, then decode `~0` to `~` within each segment.
- Return `undefined` when any segment is missing instead of throwing.
