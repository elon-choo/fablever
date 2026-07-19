# Glob matching

Implement `globMatch(pattern, path)` in `glob-match.mjs`.

```js
export function globMatch(pattern, path) { /* ... */ }
```

Both arguments are strings. Return `true` when `path` matches `pattern`, otherwise `false`.
Keep the named ESM export and use only Node.js built-ins.

Matching is **anchored**: the whole pattern must consume the whole path. Everything is
**case-sensitive**, and character comparisons/ranges use UTF-16 code-unit order.

## Paths

A path is split into **segments** on every `/`.

| path | segments |
| --- | --- |
| `a/b/c` | `a`, `b`, `c` |
| `a` | `a` |
| `""` | `""` (one empty segment) |
| `a/` | `a`, `""` |

Because of this split, a segment never contains a `/`.

## Order of operations

1. **Expand braces** in the pattern into a list of alternative patterns.
2. The answer is `true` if **at least one** alternative matches the path by the rules below.

---

## 1. Brace expansion

A brace group starts at an unescaped `{` and ends at the matching unescaped `}` at the same
nesting depth. Brace expansion is purely textual and happens before anything else, so an
alternative may contain any other pattern syntax — including `/`, `*`, `**`, and further braces.

- A group expands to one alternative per **top-level** comma inside it. Commas nested inside an
  inner brace group, or inside a character class (section 4), belong to that construct and do not
  split the outer group.
- A group with no top-level comma expands to its single content: `{a}` → `a`.
- `{}` expands to the empty string. `{a,}` expands to `a` and to the empty string.
- Groups combine with surrounding text and with each other as a **cross product**.
- A `{` with no matching `}` is a literal `{`. A `}` with no matching `{` is a literal `}`.
- Expansion recurses: an alternative that itself contains braces is expanded again.

| pattern | alternatives |
| --- | --- |
| `{a,b}` | `a`, `b` |
| `x{a,b}y` | `xay`, `xby` |
| `a{b,c}d{e,f}` | `abde`, `abdf`, `acde`, `acdf` |
| `{a,{b,c}d}` | `a`, `bd`, `cd` |
| `{a,b{c,d}e}f` | `af`, `bcef`, `bdef` |
| `{a}` | `a` |
| `{a,}z` | `az`, `z` |
| `{a` | `{a` |
| `{a/{b,c}` | `{a/b`, `{a/c` |
| `{[a,b],z}` | `[a,b]`, `z` |
| `{src,lib}/**/*.{js,mjs}` | `src/**/*.js`, `src/**/*.mjs`, `lib/**/*.js`, `lib/**/*.mjs` |

So `globMatch('{a,b}/c', 'b/c')` is `true`, and `globMatch('a{b,c}d{e,f}', 'acdf')` is `true`.

## 2. Leading `/`

Each alternative is matched against the path independently, and first they must agree on
whether they are absolute: if exactly one of the alternative and the path begins with `/`, that
alternative does not match. If both do, drop that one leading `/` from each before splitting
into segments.

- `globMatch('/a/b', '/a/b')` → `true`
- `globMatch('/a/b', 'a/b')` → `false`
- `globMatch('a/b', '/a/b')` → `false`
- `globMatch('**', '/a')` → `false`
- `globMatch('/**', '/a/b')` → `true`

## 3. Segments and `**`

The alternative is split into segments on every `/` that is neither escaped by a backslash
(section 5) nor inside a character class (section 4). Pattern segments are then matched against
path segments in order, and both lists must be consumed exactly.

A pattern segment whose text is exactly `**` (two unescaped stars and nothing else) is a
**globstar**: it matches **zero or more** consecutive path segments.

- `globMatch('a/**/b', 'a/b')` → `true` (zero segments)
- `globMatch('a/**/b', 'a/x/b')` → `true`
- `globMatch('a/**/b', 'a/x/y/b')` → `true`
- `globMatch('**/b', 'b')` → `true` (zero segments)
- `globMatch('**/b', 'x/y/b')` → `true`
- `globMatch('a/**', 'a')` → `true` (zero segments)
- `globMatch('a/**', 'a/b/c')` → `true`
- `globMatch('**', 'a/b')` → `true`
- `globMatch('**', '')` → `true`

If `**` appears in a segment alongside anything else it is **not** a globstar — each `*` is then
just an ordinary single-star wildcard (section 4), so `a**b` behaves like `a*b` and does not
cross a `/`. An escaped `\*\*` segment is the literal two-character name `**`, not a globstar.

Every other pattern segment must match exactly one path segment, by section 4.

## 4. Matching one segment

Within a segment, matching is anchored to the whole segment, and these are the metacharacters:

- `?` matches **exactly one** character. It never matches `/` (and never crosses a segment
  boundary): `globMatch('a?b', 'axb')` → `true`, `globMatch('a?b', 'ab')` → `false`,
  `globMatch('a?b', 'a/b')` → `false`.
- `*` matches **zero or more** characters, never including `/`:
  `globMatch('a*b', 'ab')` → `true`, `globMatch('a*b', 'axyzb')` → `true`,
  `globMatch('a*b', 'a/b')` → `false`, `globMatch('*', 'anything')` → `true`.
  A `*` is greedy but must give back characters when needed for the rest of the pattern to
  match: `globMatch('*a*b', 'xaybzb')` → `true`, `globMatch('*.js', 'a.b.js')` → `true`.
- `[...]` is a **character class** matching exactly one character:
  - It starts at an unescaped `[` and ends at the first `]` that closes it. If there is no
    closing `]`, the `[` is a literal `[` character (`globMatch('a[b', 'a[b')` → `true`).
  - An immediately following `!` or `^` **negates** the class: `[!abc]` and `[^abc]` both match
    one character that is not `a`, `b`, or `c`.
  - A `]` that is the first character of the class body (right after `[`, or right after the
    negating `!`/`^`) is a **literal** `]` and does not close the class: `[]]` matches `]`, and
    `[!]]` matches any one character other than `]`. Consequently `[]` and `[!]` have no closing
    `]` at all and are literal text.
  - `a-z` inside a class is an inclusive **range**. A `-` that is the first or the last character
    of the class body is a literal `-`: `[a-]`, `[-a]` and `[a-c-e]` each contain a literal `-`.
  - A backslash inside a class escapes the next character, so `[\]]` matches `]` and `[a\-z]`
    matches exactly `a`, `-` or `z` (not a range).
  - **A character class never matches `/`**, not even a negated one:
    `globMatch('a[!x]b', 'a/b')` → `false`, and `globMatch('a[/]b', 'a/b')` → `false`.
  - Examples: `globMatch('[a-z]*', 'hello')` → `true`, `globMatch('[!a-z]*', 'Hello')` → `true`,
    `globMatch('[A-Z]', 'a')` → `false`.
- Any other character matches itself.

## 5. Backslash escapes

A backslash makes the next character literal, stripping every special meaning it would otherwise
have (`? * [ ] { } , \ /` and the globstar). A backslash at the very end of the pattern, with
nothing left to escape, matches a literal backslash.

- `globMatch('a\\*b', 'a*b')` → `true`; `globMatch('a\\*b', 'axb')` → `false`
- `globMatch('a\\?b', 'a?b')` → `true`
- `globMatch('\\{a,b\\}', '{a,b}')` → `true` (the group is escaped away, so there is no alternation)
- `globMatch('a\\\\b', 'a\\b')` → `true` (an escaped backslash matches one backslash)
- `globMatch('\\[abc]', '[abc]')` → `true`

(The `\\` above are JavaScript source escapes: the pattern string `'a\\*b'` is the four
characters `a`, `\`, `*`, `b`.)

An escaped `/` is a literal `/` inside a segment rather than a segment separator — and since path
segments never contain a `/`, such a segment simply never matches anything.
