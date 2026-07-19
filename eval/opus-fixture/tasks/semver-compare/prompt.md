# Semantic-version comparison

Implement `compareSemver(a, b)` in `scaffold/semver-compare.mjs`.

Return `-1` when `a` has lower precedence, `0` when both versions have equal precedence, and `1` when `a` has higher precedence.

The function must:

- compare major, minor, and patch components numerically;
- place a pre-release version below the matching normal version;
- compare pre-release identifiers from left to right;
- compare numeric pre-release identifiers numerically.

Keep the named ESM export and use only Node.js built-ins.
