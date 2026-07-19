// Field syntax, step semantics, strictly-after start, and output shape.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check1.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'cron-next.mjs')).href;
const { cronNext } = await import(moduleUrl);

assert.equal(typeof cronNext, 'function', 'cronNext must be exported');

const eq = (expr, from, expected) =>
  assert.equal(cronNext(expr, from), expected, `${expr} from ${from}`);

// Strictly after fromIso; fire times sit on whole minutes.
eq('* * * * *', '2024-01-01T00:00:00Z', '2024-01-01T00:01:00Z');
eq('* * * * *', '2024-01-01T00:00:30Z', '2024-01-01T00:01:00Z');
eq('* * * * *', '2024-01-01T00:00:30.250Z', '2024-01-01T00:01:00Z');
eq('* * * * *', '2024-01-01T00:00:59.999Z', '2024-01-01T00:01:00Z');

// Output shape: zero-padded, seconds always 00, no fractional seconds, trailing Z.
const shaped = cronNext('* * * * *', '2024-01-01T00:00:00Z');
assert.match(
  shaped,
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/,
  `result must be YYYY-MM-DDTHH:MM:SSZ with zero seconds, got ${JSON.stringify(shaped)}`,
);
assert.equal(
  cronNext('5 3 7 9 *', '2024-01-01T00:00:00Z'),
  '2024-09-07T03:05:00Z',
  'single-digit numbers must be zero-padded in the output',
);

// Bare numbers and hour/minute interaction.
eq('0 * * * *', '2024-01-01T00:00:00Z', '2024-01-01T01:00:00Z');
eq('0 * * * *', '2024-01-01T00:30:00Z', '2024-01-01T01:00:00Z');
eq('30 4 * * *', '2024-01-01T05:00:00Z', '2024-01-02T04:30:00Z');
eq('30 4 * * *', '2024-01-01T04:00:00Z', '2024-01-01T04:30:00Z');
eq('30 4 * * *', '2024-01-01T04:30:00Z', '2024-01-02T04:30:00Z');

// */s in minute: 0-based field minimum.
eq('*/15 * * * *', '2024-01-01T00:00:00Z', '2024-01-01T00:15:00Z');
eq('*/15 * * * *', '2024-01-01T00:50:00Z', '2024-01-01T01:00:00Z');
eq('*/20 * * * *', '2024-01-01T00:45:00Z', '2024-01-01T01:00:00Z');
eq('*/7 * * * *', '2024-01-01T00:00:00Z', '2024-01-01T00:07:00Z');
eq('*/7 * * * *', '2024-01-01T00:56:00Z', '2024-01-01T01:00:00Z'); // 56 is the last <60; wraps

// a-b/s: the step counts from a, not from the field minimum.
eq('5-30/10 * * * *', '2024-01-01T00:00:00Z', '2024-01-01T00:05:00Z');
eq('5-30/10 * * * *', '2024-01-01T00:05:00Z', '2024-01-01T00:15:00Z');
eq('5-30/10 * * * *', '2024-01-01T00:15:00Z', '2024-01-01T00:25:00Z');
eq('5-30/10 * * * *', '2024-01-01T00:25:00Z', '2024-01-01T01:05:00Z'); // 35 > 30, so wrap
eq('0 1-23/6 * * *', '2024-01-01T00:00:00Z', '2024-01-01T01:00:00Z');
eq('0 1-23/6 * * *', '2024-01-01T01:00:00Z', '2024-01-01T07:00:00Z');
eq('0 1-23/6 * * *', '2024-01-01T19:00:00Z', '2024-01-02T01:00:00Z'); // 1,7,13,19 then wrap

// Plain ranges.
eq('0 9-17 * * *', '2024-01-01T00:00:00Z', '2024-01-01T09:00:00Z');
eq('0 9-17 * * *', '2024-01-01T17:00:00Z', '2024-01-02T09:00:00Z');
eq('15 9-17 * * *', '2024-01-01T17:15:00Z', '2024-01-02T09:15:00Z');

// Comma lists, including mixed terms.
eq('0,30 * * * *', '2024-01-01T00:00:00Z', '2024-01-01T00:30:00Z');
eq('0,30 * * * *', '2024-01-01T00:30:00Z', '2024-01-01T01:00:00Z');
eq('0,15 9-11 * * *', '2024-01-01T09:15:00Z', '2024-01-01T10:00:00Z');
eq('0,15 9-11 * * *', '2024-01-01T11:15:00Z', '2024-01-02T09:00:00Z');
eq('1,3-5,20-30/5 * * * *', '2024-01-01T00:00:00Z', '2024-01-01T00:01:00Z');
eq('1,3-5,20-30/5 * * * *', '2024-01-01T00:01:00Z', '2024-01-01T00:03:00Z');
eq('1,3-5,20-30/5 * * * *', '2024-01-01T00:05:00Z', '2024-01-01T00:20:00Z');
eq('1,3-5,20-30/5 * * * *', '2024-01-01T00:20:00Z', '2024-01-01T00:25:00Z');
eq('1,3-5,20-30/5 * * * *', '2024-01-01T00:30:00Z', '2024-01-01T01:01:00Z');

// Whitespace tolerance.
eq('  0   0   *  *  *  ', '2024-01-01T12:00:00Z', '2024-01-02T00:00:00Z');

console.log('ok');
