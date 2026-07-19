// Values: bare-value coercion (with the round-trip rule) and quoted strings.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check2.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'ini-parse.mjs')).href;
const { parseIni } = await import(moduleUrl);

assert.equal(typeof parseIni, 'function', 'parseIni must be exported');

assert.deepEqual(
  parseIni('a = true\nb = false\nc = null'),
  { a: true, b: false, c: null },
  'true/false/null are coerced',
);

assert.deepEqual(
  parseIni('a = True\nb = FALSE\nc = Null\nd = NULL\ne = TRUE'),
  { a: 'True', b: 'FALSE', c: 'Null', d: 'NULL', e: 'TRUE' },
  'the coercion words are lower-case only',
);

assert.deepEqual(
  parseIni('a = 42\nb = -7\nc = 3.14\nd = 0\ne = -0.5\nf = 10.25'),
  { a: 42, b: -7, c: 3.14, d: 0, e: -0.5, f: 10.25 },
  'integers and decimals that round-trip become numbers',
);

assert.deepEqual(
  parseIni('a = 007\nb = 1.0\nc = 1.50\nd = -0\ne = 0.10'),
  { a: '007', b: '1.0', c: '1.50', d: '-0', e: '0.10' },
  'numeric text that does not round-trip stays a string',
);

assert.deepEqual(
  parseIni('a = +5\nb = 1e3\nc = .5\nd = 5.\ne = 1_000\nf = NaN\ng = Infinity\nh = -\ni = 1.2.3'),
  {
    a: '+5',
    b: '1e3',
    c: '.5',
    d: '5.',
    e: '1_000',
    f: 'NaN',
    g: 'Infinity',
    h: '-',
    i: '1.2.3',
  },
  'text the numeric pattern rejects stays a string',
);

assert.deepEqual(parseIni('a ='), { a: '' }, 'an empty value is the empty string');
assert.deepEqual(parseIni('a =   '), { a: '' }, 'a whitespace-only value is the empty string');

assert.deepEqual(
  parseIni('a = "hello"\nb = ""'),
  { a: 'hello', b: '' },
  'a double-quoted value is unwrapped',
);

assert.deepEqual(
  parseIni('a = "42"\nb = "true"\nc = "null"\nd = "3.14"'),
  { a: '42', b: 'true', c: 'null', d: '3.14' },
  'a quoted value is always a string, never coerced',
);

assert.deepEqual(
  parseIni('a = "  padded  "'),
  { a: '  padded  ' },
  'a quoted value keeps its inner whitespace',
);

assert.deepEqual(
  parseIni('a = "x=y"'),
  { a: 'x=y' },
  'a quoted value may contain "="',
);

assert.deepEqual(
  parseIni('a = "line1\\nline2"'),
  { a: 'line1\nline2' },
  '\\n is a newline escape',
);

assert.deepEqual(
  parseIni('a = "tab\\there"'),
  { a: 'tab\there' },
  '\\t is a tab escape',
);

assert.deepEqual(
  parseIni('a = "say \\"hi\\""'),
  { a: 'say "hi"' },
  '\\" is a quote escape and does not close the value',
);

assert.deepEqual(
  parseIni('a = "back\\\\slash"'),
  { a: 'back\\slash' },
  '\\\\ is a backslash escape',
);

assert.deepEqual(
  parseIni('a = "\\""'),
  { a: '"' },
  'an escaped quote right before the closing quote is kept',
);

assert.deepEqual(
  parseIni('a = "\\q"\nb = "end\\"'),
  { a: '\\q', b: '"end\\"' },
  'an unknown escape is kept as-is; a value whose closing quote is escaped is a bare value',
);

assert.deepEqual(
  parseIni('a = "unterminated'),
  { a: '"unterminated' },
  'a value with no closing quote is a bare value including the quote character',
);

assert.deepEqual(
  parseIni('a = "abc" def'),
  { a: '"abc" def' },
  'text after the closing quote makes the whole value a bare value',
);

assert.deepEqual(
  parseIni('a = mid"dle'),
  { a: 'mid"dle' },
  'a quote that does not start the value is ordinary text',
);

console.log('ok');
