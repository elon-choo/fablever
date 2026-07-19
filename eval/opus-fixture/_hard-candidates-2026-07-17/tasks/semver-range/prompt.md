# Semver range matching

Implement `satisfies(version, range)` in `semver-range.mjs`. Keep the named ESM export
(`export function satisfies`) and use only Node.js built-ins.

`satisfies(version, range)` returns `true` when `version` falls inside `range`, and `false`
otherwise. Both arguments are strings, and both are always well-formed per the grammar
below — you never have to handle malformed input.

## 1. Versions

A version is `major.minor.patch`, each part a non-negative integer, plus an optional
prerelease suffix introduced by the FIRST `-` in the string:

    1.2.3
    1.2.3-alpha
    1.2.3-alpha.1
    1.2.3-rc.1.2

The prerelease suffix is everything after that first `-`, split on `.` into identifiers. An
identifier may itself contain `-`, so `1.2.3-alpha-1` has the single identifier `alpha-1`.
Build metadata (`+...`) never appears.

### 1.1 Version ordering

To compare two versions:

1. Compare `major`, then `minor`, then `patch`, numerically. The first difference decides.
2. If all three are equal, a version with NO prerelease is GREATER than one with a
   prerelease. So `1.0.0 > 1.0.0-rc.1`.
3. If both have prereleases, compare identifiers left to right:
   - two numeric identifiers (all digits) compare NUMERICALLY, so `beta.11` is above
     `beta.2`;
   - a numeric identifier is always LOWER than an alphanumeric one, so `alpha.1` is below
     `alpha.beta`;
   - two alphanumeric identifiers compare by ASCII string order;
   - if every identifier of the shorter list matches, the SHORTER list is lower, so
     `1.0.0-alpha` is below `1.0.0-alpha.1`.

That yields the standard ladder:

    1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta
        < 1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0

## 2. Range structure

- `||` splits the range into OR groups. The range matches if ANY group matches.
- Inside a group, runs of whitespace split the text into tokens. Walk the tokens left to
  right: if the NEXT token is exactly `-`, then this token, the `-`, and the token after it
  form one hyphen range (3 tokens consumed); otherwise this token is a term on its own.
  All terms in a group are ANDed.
- A group with no tokens (an empty or whitespace-only range) behaves exactly like `*`.

Because a hyphen range needs whitespace around its `-`, `1.2.3-alpha` is always a single
token — a version carrying a prerelease, never a hyphen range.

## 3. Terms

Each term expands into one or more primitive comparators. A primitive comparator is an
operator (`>=`, `<=`, `>`, `<`, `=`) plus a full version; it holds when comparing `version`
against that version by §1.1 satisfies the operator.

### 3.1 Explicit comparators

`>=1.2.3`, `<=1.2.3`, `>1.2.3`, `<1.2.3`, `=1.2.3`. An explicit operator is always followed
immediately (never with a space) by a complete `major.minor.patch`, optionally with a
prerelease. Each expands to exactly that one comparator.

### 3.2 Partials and wildcards

A part may be `x`, `X`, or `*`, and wildcards only ever occupy trailing positions. A MISSING
trailing part means the same thing as `x` in that position: `1` is `1.x`, and `1.2` is
`1.2.x`. Let `s` be the count of leading numeric parts before the first wildcard-or-missing
part.

| term | `s` | expansion |
| --- | --- | --- |
| `*`, `x`, `X` | 0 | `>=0.0.0` |
| `1.x`, `1.*`, `1` | 1 | `>=1.0.0` `<2.0.0` |
| `1.2.x`, `1.2` | 2 | `>=1.2.0` `<1.3.0` |
| `1.2.3` | 3 | `=1.2.3` |

A bare three-part term may carry a prerelease: `1.2.3-rc.1` expands to `=1.2.3-rc.1`.

### 3.3 Caret

A caret term always carries all three numeric parts, optionally with a prerelease. It allows
changes that do not modify the left-most NON-ZERO part:

| term | expansion |
| --- | --- |
| `^1.2.3` | `>=1.2.3` `<2.0.0` |
| `^0.2.3` | `>=0.2.3` `<0.3.0` |
| `^0.0.3` | `>=0.0.3` `<0.0.4` |

So if major > 0 the upper bound is `<(major+1).0.0`; else if minor > 0 it is
`<0.(minor+1).0`; else it is `<0.0.(patch+1)`. A prerelease on a caret rides along on the
LOWER bound only: `^1.2.3-rc.1` is `>=1.2.3-rc.1 <2.0.0`.

### 3.4 Tilde

A tilde term allows patch-level changes when a minor is given. **A tilde has no special
zero-major handling** — the rule below is the whole rule, and it applies identically for
major `0`.

| term | expansion |
| --- | --- |
| `~1.2.3` | `>=1.2.3` `<1.3.0` |
| `~0.2.3` | `>=0.2.3` `<0.3.0` |
| `~0.0.3` | `>=0.0.3` `<0.1.0` |
| `~1.2` | `>=1.2.0` `<1.3.0` |
| `~1` | `>=1.0.0` `<2.0.0` |

That is: with a minor present (`~M.m` or `~M.m.p`) the bounds are `>=M.m.p` (patch
zero-filled when absent) and `<M.(m+1).0`, for every `M` including `0`. With only a major
(`~M`) the bounds are `>=M.0.0` and `<(M+1).0.0`. A prerelease rides along on the LOWER
bound only: `~1.2.3-rc.1` is `>=1.2.3-rc.1 <1.3.0`.

### 3.5 Hyphen ranges

`A - B`. Each endpoint is a numeric version, possibly partial (`M`, `M.m`, or `M.m.p`); a
three-part endpoint may carry a prerelease. Endpoints never contain wildcards.

- The LOWER bound zero-fills its missing parts and is INCLUSIVE. `1.2 - ...` is `>=1.2.0`,
  `1 - ...` is `>=1.0.0`, and `1.2.3-rc.1 - ...` is `>=1.2.3-rc.1`.
- The UPPER bound depends on how complete it is:
  - complete `M.m.p` (prerelease allowed) — INCLUSIVE: `... - 2.3.4` is `<=2.3.4`;
  - `M.m` — everything in that minor: `... - 1.2` is `<1.3.0`;
  - `M` — everything in that major: `... - 2` is `<3.0.0`.

So `1.2.3 - 2.3.4` is `>=1.2.3 <=2.3.4`, while `1.2.3 - 2.3` is `>=1.2.3 <2.4.0`.

## 4. Matching

Expand every term of a group into its primitive comparators and pool them (a group's pool is
the concatenation of its terms' expansions). The group matches `version` when BOTH hold:

1. **Every** comparator in the group's pool holds for `version`.
2. **Prerelease rule.** If `version` has a prerelease, then at least one comparator in
   THIS group's pool must have a prerelease AND have exactly the same
   `[major, minor, patch]` as `version`. If `version` has no prerelease, this rule imposes
   nothing.

The range matches when at least one group matches.

The prerelease rule is what stops a prerelease from leaking across a boundary. Worked
examples:

- `satisfies('2.0.0-rc.1', '^1.2.3')` is `false`. The pool is `>=1.2.3 <2.0.0`; rule 1 holds
  (`2.0.0-rc.1` is below `2.0.0` by §1.1 step 2), but no comparator has a prerelease, so
  rule 2 fails.
- `satisfies('1.2.3-beta', '^1.2.3-alpha')` is `true`. The pool is `>=1.2.3-alpha <2.0.0`;
  rule 1 holds, and `>=1.2.3-alpha` has a prerelease at `[1,2,3]`, matching the version.
- `satisfies('1.9.0-beta', '^1.2.3-alpha')` is `false`. Rule 1 holds, but the only
  prerelease comparator sits at `[1,2,3]`, not `[1,9,0]`.
- `satisfies('1.9.0', '^1.2.3-alpha')` is `true`. The version has no prerelease, so rule 2
  imposes nothing.
- `satisfies('1.2.3-rc.9', '>=1.2.3-rc.1 <1.2.3-rc.3 || >=1.0.0 <2.0.0')` is `false`. Rule 1
  fails for the first group. The second group passes rule 1 but owns no prerelease
  comparator — rule 2 is per-group, and the first group's comparators do not help it.
- `satisfies('1.0.0-rc.1', '*')` is `false`. The pool is `>=0.0.0`, which has no prerelease.

## 5. More examples

    satisfies('1.2.3', '1.2.3')                                // true
    satisfies('1.2.4', '1.2.3')                                // false
    satisfies('1.2.9', '^1.2.3')                               // true
    satisfies('2.0.0', '^1.2.3')                               // false
    satisfies('0.2.9', '^0.2.3')                               // true
    satisfies('0.3.0', '^0.2.3')                               // false
    satisfies('0.0.4', '^0.0.3')                               // false
    satisfies('0.0.9', '~0.0.3')                               // true
    satisfies('1.2.9', '~1.2.3')                               // true
    satisfies('1.3.0', '~1.2')                                 // false
    satisfies('1.9.9', '1.x')                                  // true
    satisfies('1.2.9', '1.2.x')                                // true
    satisfies('4.5.6', '*')                                    // true
    satisfies('1.3.0', '>=1.2.0 <1.4.0')                       // true
    satisfies('1.5.0', '>=1.2.0 <1.4.0')                       // false
    satisfies('2.5.0', '^1.2.3 || ^2.0.0')                     // true
    satisfies('2.3.4', '1.2.3 - 2.3.4')                        // true
    satisfies('2.3.5', '1.2.3 - 2.3.4')                        // false
    satisfies('1.2.9', '1.2.3 - 1.2')                          // true
    satisfies('1.3.0', '1.2.3 - 1.2')                          // false
    satisfies('1.0.0-beta.11', '>=1.0.0-beta.2 <1.0.0-rc.1')   // true
