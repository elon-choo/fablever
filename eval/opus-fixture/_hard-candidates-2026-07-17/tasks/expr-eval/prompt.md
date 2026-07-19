# Arithmetic expression evaluator

Implement `evalExpr(src)` in `scaffold/expr-eval.mjs`. Keep the named ESM export
(`export function evalExpr`) and use only Node.js built-ins.

`evalExpr` takes a string and evaluates it as an arithmetic expression.

- On success, return exactly `{ value }` — `value` is the JavaScript number the expression
  evaluates to.
- On failure, return exactly `{ error: { message, offset } }` — `message` is one of the four exact
  strings listed under **Errors**, and `offset` is the 0-based character index in `src` at which the
  problem starts.

Return one shape or the other, with no extra properties: a success result has no `error` key, and a
failure result has no `value` key. Never throw.

## Grammar

Written as EBNF, lowest-precedence rule first. This grammar is the complete definition of what
`evalExpr` accepts; everything in the rest of this document follows from it.

```
expression := term (('+' | '-') term)*
term       := unary (('*' | '/' | '%') unary)*
unary      := ('+' | '-') unary | power
power      := primary ('^' unary)?
primary    := number | '(' expression ')'
```

`evalExpr` parses one `expression` that must span the whole input.

### Numbers

A number is either:

- one or more digits, optionally followed by `.` and then zero or more digits — `12`, `7.`, `3.5`,
  `12.75`; or
- `.` followed by one or more digits — `.5`, `.125`.

Digits are `0`-`9` only. There are no signs inside a number literal (a leading `-` is the unary
operator, not part of the number), and there is no exponent notation — `1e3` is not a number. A `.`
that is not part of a number by the two rules above is not a valid character.

A number literal's value is its ordinary decimal interpretation: `.5` is `0.5`, `7.` is `7`.

### Operators

Precedence from lowest to highest:

1. binary `+` and `-` — left-associative
2. binary `*`, `/`, `%` — left-associative
3. prefix unary `-` and `+` — may be stacked (`- -3`, `-+-3`)
4. `^` (power) — right-associative

Parentheses group an expression and override precedence.

Four consequences of the grammar that are worth making explicit, since they are the parts most
easily gotten wrong:

- **`^` binds tighter than unary minus.** The `unary` rule sits *below* `power`, so a leading sign
  applies to the whole power expression: `-2^2` is `-(2^2)` = `-4`, **not** `(-2)^2`. Use
  parentheses for the other reading: `(-2)^2` = `4`.
- **`^` is right-associative.** `2^3^2` is `2^(3^2)` = `2^9` = `512`, not `(2^3)^2` = `64`.
- **The exponent may itself be a unary expression**, because `power` recurses into `unary` on its
  right: `2^-1` = `0.5`, and `-2^-2` is `-(2^(-2))` = `-0.25`. Combining the last two rules,
  `2^-3^2` is `2^(-(3^2))` = `2^-9` = `0.001953125`.
- **Unary binds tighter than `*`, `/`, `%`**, so a sign attaches to the operand next to it:
  `-5%3` is `(-5)%3` = `-2`, and `2*-3` = `-6`.

Left-associativity examples: `10-2-3` is `(10-2)-3` = `5`; `100/5/2` is `(100/5)/2` = `10`;
`7%5%3` is `(7%5)%3` = `2`.

### Arithmetic

Every operator is exactly its JavaScript counterpart on ordinary JavaScript numbers — `+`, `-`, `*`,
`/`, `%`, and `^` is JavaScript's `**`. Unary `-` and `+` are JavaScript's unary `-` and `+`.

Use plain double-precision arithmetic and do not round or otherwise correct the result:

- `.1+.2` is `0.30000000000000004`.
- `%` follows JavaScript, so it keeps the sign of the left operand and works on non-integers:
  `-5%3` is `-2`, `5.5%2` is `1.5`.
- `4^0.5` is `2`.

### Whitespace

Any run of whitespace between tokens is ignored, and leading and trailing whitespace is ignored.
Whitespace is any character matched by JavaScript's `\s`. `  1  +  2  ` and `1\t+\n2` both evaluate
to `3`.

Whitespace never appears *inside* a number: `1 2` is two numbers, not `12`.

## Errors

There are exactly four messages. Each must be produced verbatim.

### `"unexpected character"`

`offset` is the index of the offending character. Produced when:

- The input contains a character that is not a digit, `.`, `+`, `-`, `*`, `/`, `%`, `^`, `(`, `)`,
  or whitespace — `evalExpr('@')` gives offset `0`, `evalExpr('1 + @')` gives offset `4`.
- A `.` is not part of a number — `evalExpr('.')` gives offset `0`, `evalExpr('1 + .')` gives
  offset `4`.
- An operand was required (the `primary` rule was reached) but the next token is not a number and
  not `(` — `evalExpr('1 + * 2')` gives offset `4`, `evalExpr(')')` gives offset `0`,
  `evalExpr('1 + )')` gives offset `4`.
- Anything is left over after a complete expression has been parsed — `evalExpr('1)')` gives offset
  `1`, `evalExpr('(1))')` gives offset `3`, `evalExpr('1 2')` gives offset `2`.

### `"unexpected end of input"`

`offset` is **always** `src.length`. Produced when the input ends while an operand is still
required.

- `evalExpr('')` gives offset `0`.
- `evalExpr('   ')` gives offset `3`.
- `evalExpr('1 +')` gives offset `3`.
- `evalExpr('1 + ')` gives offset `4` — the offset is `src.length`, so trailing whitespace counts.
- `evalExpr('1 + (')` gives offset `5`.

### `"expected )"`

`offset` is **always** `src.length`, not the index of whatever was found instead. Produced when a
`(` group has been opened and its inner expression parsed, but the next token is not `)`.

- `evalExpr('(1')` gives offset `2`.
- `evalExpr('(1+2')` gives offset `4`.
- `evalExpr('(1 2)')` gives offset `5` — the inner expression `1` ends at the `2`, which is not `)`,
  so this is `"expected )"` at `src.length`, not `"unexpected character"` at the `2`.

Note the split with the rule above: if an operand is still required when `(` is followed by the end
of the input, that is `"unexpected end of input"` (`evalExpr('(')` gives offset `1`). `"expected )"`
only applies once the group's inner expression has been parsed successfully.

### `"division by zero"`

`offset` is the index of the `/` or `%` operator itself. This same message is used for **both** `/`
and `%`. Produced when the operator's right-hand value is zero.

- `evalExpr('1/0')` gives offset `1`.
- `evalExpr('1 / 0')` gives offset `2`.
- `evalExpr('5%0')` gives offset `1`.
- `evalExpr('1/(2-2)')` gives offset `1` — the divisor is a computed subexpression.
- `-0` counts as zero: `evalExpr('1/-0')` gives offset `1`.

## Resolving which error wins

Two ordering rules fully determine the result when more than one problem is present.

**1. Parsing happens before evaluation.** Parse the entire input first; only if the whole input is a
valid expression is it evaluated. So a syntax error anywhere in the input — including after the
offending division — beats a division by zero.

- `evalExpr('1/0 + @')` is `"unexpected character"` at offset `6`, not `"division by zero"`.
- `evalExpr('(1/0')` is `"expected )"` at offset `4`.
- `evalExpr('1/0)')` is `"unexpected character"` at offset `3`.

Within parsing, the reported problem is the first one the parse reaches, scanning left to right.

**2. Evaluation is left to right, and the first division by zero wins.** For a binary operator,
evaluate the left operand completely, then the right operand, then apply the operator. Report the
first division by zero reached in that order.

- `evalExpr('1/(2/0)')` gives offset `4` — the inner `/` is evaluated while producing the outer
  `/`'s right operand, so the inner one is reported.
- `evalExpr('(1/0)+(2/0)')` gives offset `2` — the left operand of `+` is evaluated first.
- `evalExpr('1/0/0')` is `(1/0)/0`, so it gives offset `1`.

## Examples

```js
evalExpr('1+2')          // { value: 3 }
evalExpr('2+3*4')        // { value: 14 }
evalExpr('(2+3)*4')      // { value: 20 }
evalExpr('.5')           // { value: 0.5 }
evalExpr('-2^2')         // { value: -4 }
evalExpr('2^3^2')        // { value: 512 }
evalExpr('2^-1')         // { value: 0.5 }
evalExpr('  1  +  2  ')  // { value: 3 }
evalExpr('1/0')          // { error: { message: 'division by zero', offset: 1 } }
evalExpr('1 + ')         // { error: { message: 'unexpected end of input', offset: 4 } }
evalExpr('(1+2')         // { error: { message: 'expected )', offset: 4 } }
evalExpr('1 2')          // { error: { message: 'unexpected character', offset: 2 } }
```
