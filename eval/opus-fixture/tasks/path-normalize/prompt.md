# POSIX path normalization

Implement `normalizePath(p)` in `scaffold/path-normalize.mjs`.

Inputs are always absolute POSIX-style paths beginning with `/`.

The function must:

- collapse repeated slashes;
- remove `.` segments;
- remove a trailing slash except when the result is `/`;
- make `..` remove the preceding segment;
- keep traversal at `/` when `..` would otherwise move above the root.

Keep the named ESM export and use only Node.js built-ins.
