// Structure: line handling, assignments, section headers, nesting, merging.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check1.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'ini-parse.mjs')).href;
const { parseIni } = await import(moduleUrl);

assert.equal(typeof parseIni, 'function', 'parseIni must be exported');

assert.deepEqual(parseIni(''), {}, 'empty input yields an empty object');

assert.deepEqual(
  parseIni('name = fable\ncount = 3'),
  { name: 'fable', count: 3 },
  'top-level assignments live on the root object',
);

assert.deepEqual(
  parseIni('   key   =   value   '),
  { key: 'value' },
  'whitespace around key and value is trimmed',
);

assert.deepEqual(
  parseIni('url = a=b=c'),
  { url: 'a=b=c' },
  'only the first "=" splits the line',
);

assert.deepEqual(
  parseIni('a = 1\ngarbage\nb = 2'),
  { a: 1, b: 2 },
  'a line with no "=" is ignored',
);

assert.deepEqual(
  parseIni('= 5\na = 1'),
  { a: 1 },
  'a line whose key is empty is ignored',
);

assert.deepEqual(
  parseIni('\n\na = 1\n   \n\nb = 2\n'),
  { a: 1, b: 2 },
  'blank lines are ignored',
);

assert.deepEqual(
  parseIni('a = 1\n[s]\nb = 2'),
  { a: 1, s: { b: 2 } },
  'a section header starts a section object',
);

assert.deepEqual(
  parseIni('[s]\na = 1\nb = 2\n[t]\nc = 3'),
  { s: { a: 1, b: 2 }, t: { c: 3 } },
  'assignments belong to the section until the next header',
);

assert.deepEqual(
  parseIni('[a.b]\nx = 1'),
  { a: { b: { x: 1 } } },
  '"[a.b]" nests b inside a',
);

assert.deepEqual(
  parseIni('[ a . b . c ]\nk = v'),
  { a: { b: { c: { k: 'v' } } } },
  'section name and each dotted segment are trimmed',
);

assert.deepEqual(
  parseIni('[a]\nx = 1\n[b]\ny = 2\n[a]\nz = 3'),
  { a: { x: 1, z: 3 }, b: { y: 2 } },
  'a repeated header merges into the existing section instead of replacing it',
);

assert.deepEqual(
  parseIni('[a.b]\nx = 1\n[a]\ny = 2'),
  { a: { b: { x: 1 }, y: 2 } },
  'a header merges into a parent object an earlier dotted header created',
);

assert.deepEqual(
  parseIni('[a.b]\nx = 1\n[c]\ny = 2\n[a.b]\nz = 3'),
  { a: { b: { x: 1, z: 3 } }, c: { y: 2 } },
  'a repeated dotted header merges into the existing nested section',
);

assert.deepEqual(
  parseIni('[a]\nx = 1\n[a.b]\ny = 2'),
  { a: { x: 1, b: { y: 2 } } },
  'a dotted header descends into the existing parent section',
);

console.log('ok');
