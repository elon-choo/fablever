# INI parsing

Implement `parseIni(text)` in `ini-parse.mjs`. Keep the named ESM export (`export function parseIni`) and use only Node.js built-ins.

`parseIni` takes the full text of an INI-style config file and returns a plain object.

## Line handling

Split the input on `\n`. For each line, in this order:

1. Trim leading and trailing whitespace.
2. Strip a comment, if the line has one (rules below), then trim again.
3. If nothing is left, ignore the line. Blank lines and comment-only lines therefore contribute nothing.
4. If what remains starts with `[` and ends with `]`, it is a section header.
5. Otherwise it is an assignment. Find the **first** `=`. If there is no `=`, ignore the line. If the text before the first `=` is empty once trimmed, ignore the line. Only the first `=` splits the line, so `url = a=b=c` assigns the value `a=b=c`.

The key is the text before the first `=`, trimmed. The value is the text after it, trimmed.

## Comments

Scan the trimmed line left to right, tracking whether you are inside a double-quoted span: a `"` opens the span, the next unescaped `"` closes it, and inside the span a `\` escapes whatever character follows it (so `\"` does not close the span).

A `;` or a `#` starts a comment when it is **not** inside a quoted span **and** either:

- it is the first character of the trimmed line — the whole line is a comment; or
- the character immediately before it is whitespace — that `;`/`#` and everything after it to the end of the line is the comment.

A `;` or `#` with a non-whitespace character immediately before it is ordinary text, not a comment.

```
; a whole-line comment
# also a whole-line comment
a = 1 ; comment          ->  a is the number 1
b = 1 # comment          ->  b is the number 1
c = x;y                  ->  c is the string "x;y"
d = x ;y                 ->  d is the string "x"
e = "x ; y"              ->  e is the string "x ; y"   (inside quotes)
[sec] ; comment          ->  a header may carry a trailing comment
```

## Sections

A section header names the container for the assignments that follow it, up to the next header. Assignments that appear before any header go on the root object.

The section name is the text between the brackets, trimmed. Split that name on `.` into segments and trim each segment. Starting from the root, walk the segments: if a segment's object does not exist yet, create an empty object for it; either way, descend into it. The object you end on is the container for the assignments that follow.

Because you descend into an object that already exists rather than creating a fresh one, a header **merges** into a container an earlier header created — it never replaces it. Walking `[a.b]` also creates `a` implicitly if it is not there yet.

Assume every header has at least one non-empty segment, and that no name is used both as a section and as a key.

```
a = 1
[s]
b = 2
```
→ `{ a: 1, s: { b: 2 } }`

```
[a.b]
x = 1
```
→ `{ a: { b: { x: 1 } } }`

```
[a.b]
x = 1
[a]
y = 2
```
→ `{ a: { b: { x: 1 }, y: 2 } }`  (the `[a]` header merges into the `a` that `[a.b]` created)

```
[a]
x = 1
[b]
y = 2
[a]
z = 3
```
→ `{ a: { x: 1, z: 3 }, b: { y: 2 } }`  (the second `[a]` merges; `x` survives)

```
[ a . b . c ]
k = v
```
→ `{ a: { b: { c: { k: "v" } } } }`  (segments are trimmed)

## Values

A value is either a quoted string or a bare value.

### Quoted strings

The value is a quoted string **if and only if** it starts with `"` and, scanning forward from that opening quote (where a `\` escapes the character right after it), the first unescaped `"` is the **last** character of the value.

A quoted string is **always** a string — never coerced — and its inner whitespace is kept exactly. Inside it:

| escape | becomes |
| --- | --- |
| `\n` | newline |
| `\t` | tab |
| `\"` | `"` |
| `\\` | `\` |

A `\` followed by anything else is kept as-is — both the backslash and the character after it (`\q` stays `\q`).

If the value starts with `"` but does not satisfy the rule above — there is no closing quote, or there is text after the closing quote — it is a bare value, i.e. the raw text including the quote characters.

```
a = "hello"              ->  "hello"
b = "42"                 ->  the string "42", not the number
c = "  padded  "         ->  "  padded  "
d = "say \"hi\""         ->  say "hi"
e = "unterminated        ->  the string "\"unterminated" (starts with a quote character)
f = "abc" def            ->  the string "\"abc\" def"    (text after the closing quote)
g = ""                   ->  the empty string
```

### Bare values

A bare value is coerced, in this order:

1. exactly `true` → the boolean `true`
2. exactly `false` → the boolean `false`
3. exactly `null` → `null`
4. a number — but only if the text matches `/^-?\d+(\.\d+)?$/` **and** it round-trips, meaning `String(Number(text)) === text`. The value is then `Number(text)`.
5. otherwise, the text itself, as a string.

The three coercion words are lower-case only: `True` is the string `"True"`.

The round-trip requirement keeps text that JavaScript would not print back identically as a string:

```
42      -> 42        007     -> "007"
-7      -> -7        1.0     -> "1.0"
0       -> 0         1.50    -> "1.50"
3.14    -> 3.14      -0      -> "-0"     (String(Number("-0")) is "0")
```

Text the pattern itself rejects also stays a string: `+5`, `1e3`, `.5`, `5.`.

An empty value — nothing after the `=` — is the empty string.

## Duplicate keys

Duplicates are judged per container — the root object counts as a container — against what is already in that container:

- the first time a key is assigned in a container, store the value;
- the second time, replace the stored value with a two-element array `[first, second]`;
- the third and later times, append to that array.

The array is in appearance order and may mix types. Because a repeated header merges into the same container, an assignment under a second `[a]` header is a duplicate of one under the first `[a]` header. The same key in two **different** containers is not a duplicate.

```
[s]
x = 1
x = two
x = true
```
→ `{ s: { x: [1, "two", true] } }`

```
[a]
x = 1
[b]
x = 2
[a]
x = 3
```
→ `{ a: { x: [1, 3] }, b: { x: 2 } }`
