# Unified diff hunks

Implement `diffHunks(a, b, context = 3)` in `diff-hunks.mjs`. Keep the named ESM export
(`export function diffHunks`) and use only Node.js built-ins.

`a` and `b` are arrays of strings — the lines of the "before" and "after" text, with no
trailing newline characters on any line. `context` is a non-negative integer.

The function returns an **array of hunk strings** in unified-diff format, in order.

## 1. Matching lines with an LCS

First decide which lines of `a` are "the same line" as which lines of `b`, using a longest
common subsequence (LCS) of the two line arrays. When several LCS choices have the same
length, the one that keeps the **earliest possible matches** wins. To make that exact, use
this construction:

Build a table `L` where `L[i][j]` is the length of the LCS of `a.slice(i)` and `b.slice(j)`:

- `L[a.length][j] = 0` for every `j`, and `L[i][b.length] = 0` for every `i`;
- for `i < a.length` and `j < b.length`:
  - if `a[i] === b[j]` then `L[i][j] = 1 + L[i + 1][j + 1]`
  - otherwise `L[i][j] = Math.max(L[i + 1][j], L[i][j + 1])`

Then walk forward from `i = 0`, `j = 0`, repeating until `i === a.length && j === b.length`:

- if `i < a.length && j < b.length && a[i] === b[j]` — `a[i]` and `b[j]` are a **matched
  pair**; advance both `i++` and `j++`;
- else if `j === b.length`, or (`i < a.length` and `L[i + 1][j] >= L[i][j + 1]`) — `a[i]` is
  **unmatched in `a`** (a deletion); advance `i++`;
- else — `b[j]` is **unmatched in `b`** (an insertion); advance `j++`.

Two details of that walk matter. Taking the match branch whenever `a[i] === b[j]` is what
keeps matches as early as possible. The `>=` in the second branch makes a deletion win a tie,
so at a spot where lines were replaced the deleted lines come out before the inserted ones.

Worked example — `a = ["A", "B", "A"]`, `b = ["A"]`. Both "drop `B` and the second `A`" and
"drop the first `A` and `B`" are length-1 LCS choices, but the rule above matches at
`i = 0, j = 0`, so the **first** `A` is the matched line and `B` and the second `A` are both
deletions.

This walk produces a sequence of operations, each one of:

- **context** — a matched pair (the line is present in both `a` and `b`);
- **deletion** — a line of `a` with no match;
- **insertion** — a line of `b` with no match.

If there are no deletions and no insertions, `a` and `b` are identical: return `[]`.

## 2. Grouping operations into hunks

A **change run** is a maximal stretch of consecutive deletions/insertions in that sequence
(no context operation inside it). Each change run would become its own hunk, except that runs
get merged:

> Walk the change runs in order. Let `gap` be the number of context operations lying strictly
> between the end of the current group's last change run and the start of the next change run.
> If `gap <= 2 * context`, the next change run joins the current group. Otherwise the current
> group is finished and the next change run starts a new group.

Each group becomes exactly one hunk. The hunk covers every operation from `context`
operations before the group's first change up to `context` operations after the group's last
change, clamped to the ends of the sequence. (Because a group only absorbs a run when the gap
is at most `2 * context`, every operation inside a group's span is covered, so a hunk is
always one contiguous stretch of the sequence.)

Note the boundary precisely: with `context = 1`, a gap of exactly `2` unchanged lines merges
into one hunk, and a gap of `3` splits into two hunks. With the default `context = 3`, a gap
of `6` merges and a gap of `7` splits. When two hunks split, the unchanged lines in the middle
of the gap belong to neither hunk and are simply not emitted.

## 3. Formatting a hunk

A hunk is a **single string**: the header line, then one line per covered operation, all
joined with `"\n"`. There is no trailing newline.

The body lines are the operation's line text with a one-character prefix:

- `" "` (one space) for a context line;
- `"-"` for a deletion;
- `"+"` for an insertion.

The header line is exactly:

```
@@ -aStart,aCount +bStart,bCount @@
```

- `aCount` is how many of the hunk's covered operations exist in `a` — that is, the context
  lines plus the deletions. `bCount` is how many exist in `b` — the context lines plus the
  insertions.
- `aStart` is the 1-based line number in `a` of the hunk's first covered `a` line. `bStart` is
  the 1-based line number in `b` of the hunk's first covered `b` line.
- **Zero-count rule:** if `aCount` is `0` the hunk touches no line of `a`, so `aStart` is
  instead the 1-based number of the `a` line immediately *before* the hunk — which is `0` when
  the hunk sits before the first line of `a`. `bStart` follows the same rule when `bCount` is
  `0`.
- Always write `,` and the count, **even when the count is `1`**. Emit `@@ -1,1 +1,1 @@`, never
  the abbreviated `@@ -1 +1 @@`.

## Examples

Replacing one line, default `context = 3`:

```js
diffHunks(
  ["one", "two", "three", "four", "five"],
  ["one", "two", "THREE", "four", "five"],
)
```

returns one hunk:

```
@@ -1,5 +1,5 @@
 one
 two
-three
+THREE
 four
 five
```

Identical inputs return `[]`:

```js
diffHunks(["a", "b"], ["a", "b"])  // []
```

Inserting into an empty `a` — `aCount` is `0`, so the zero-count rule puts `aStart` at `0`:

```js
diffHunks([], ["hello"])
// ["@@ -0,0 +1,1 @@\n+hello"]
```

Deleting everything from `b` — `bCount` is `0`:

```js
diffHunks(["x"], [])
// ["@@ -1,1 +0,0 @@\n-x"]
```

With `context = 0`, an insertion between `a` line 1 and `a` line 2 emits no context, so
`aCount` is `0` and `aStart` is the line before, `1`:

```js
diffHunks(["a", "b"], ["a", "x", "b"], 0)
// ["@@ -1,0 +2,1 @@\n+x"]
```

Two changes with `context = 1` and a gap of 2 unchanged lines — `2 <= 2 * 1`, so they merge
into one hunk:

```js
diffHunks(
  ["A", "g1", "g2", "B"],
  ["A2", "g1", "g2", "B2"],
  1,
)
```

returns one hunk:

```
@@ -1,4 +1,4 @@
-A
+A2
 g1
 g2
-B
+B2
```

The same shape with a gap of 3 unchanged lines and `context = 1` — `3 > 2 * 1`, so it splits:

```js
diffHunks(
  ["A", "g1", "g2", "g3", "B"],
  ["A2", "g1", "g2", "g3", "B2"],
  1,
)
```

returns two hunks:

```
@@ -1,2 +1,2 @@
-A
+A2
 g1
```

```
@@ -4,2 +4,2 @@
 g3
-B
+B2
```

`g2` (line 3 on both sides) is in the middle of the gap and appears in neither hunk.
