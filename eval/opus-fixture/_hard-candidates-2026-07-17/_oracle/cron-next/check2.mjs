// Calendar correctness: month lengths, leap years, rollovers, and the 5-year search window.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check2.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'cron-next.mjs')).href;
const { cronNext } = await import(moduleUrl);

assert.equal(typeof cronNext, 'function', 'cronNext must be exported');

const eq = (expr, from, expected) =>
  assert.equal(cronNext(expr, from), expected, `${expr} from ${from}`);

// Day and month rollover.
eq('0 0 1 * *', '2024-01-15T00:00:00Z', '2024-02-01T00:00:00Z');
eq('0 0 1 * *', '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z'); // strictly after
eq('59 23 * * *', '2024-12-31T23:59:00Z', '2025-01-01T23:59:00Z'); // year rollover
eq('59 23 31 12 *', '2024-06-01T00:00:00Z', '2024-12-31T23:59:00Z');
eq('59 23 31 12 *', '2024-12-31T23:59:00Z', '2025-12-31T23:59:00Z');
eq('0 0 1 1 *', '2024-06-01T00:00:00Z', '2025-01-01T00:00:00Z');

// Month lengths: the 31st does not exist in April, June, September, November, or February.
eq('0 0 31 * *', '2024-04-01T00:00:00Z', '2024-05-31T00:00:00Z');
eq('0 0 31 * *', '2024-05-31T00:00:00Z', '2024-07-31T00:00:00Z'); // June has 30
eq('0 0 31 * *', '2024-01-31T00:00:00Z', '2024-03-31T00:00:00Z'); // February has no 31st
eq('0 0 30 * *', '2024-01-30T00:00:00Z', '2024-03-30T00:00:00Z'); // February has no 30th either

// Leap years, including the century rule.
eq('0 0 * * *', '2024-02-28T12:00:00Z', '2024-02-29T00:00:00Z'); // 2024 is leap
eq('0 0 * * *', '2023-02-28T12:00:00Z', '2023-03-01T00:00:00Z'); // 2023 is not
eq('0 0 * * *', '2000-02-28T12:00:00Z', '2000-02-29T00:00:00Z'); // 2000 is leap (÷400)
eq('0 0 * * *', '2100-02-28T12:00:00Z', '2100-03-01T00:00:00Z'); // 2100 is not (÷100, not ÷400)
eq('0 0 29 2 *', '2024-01-01T00:00:00Z', '2024-02-29T00:00:00Z');
eq('0 0 29 2 *', '2024-03-01T00:00:00Z', '2028-02-29T00:00:00Z'); // skips 2025, 2026, 2027

// Day-of-month */s starts at 1, the field minimum — not 0.
eq('0 0 */2 * *', '2024-01-01T12:00:00Z', '2024-01-03T00:00:00Z'); // 1,3,5,...
eq('0 0 */2 * *', '2024-01-03T00:00:00Z', '2024-01-05T00:00:00Z');
eq('0 0 */2 * *', '2024-01-31T12:00:00Z', '2024-02-01T00:00:00Z'); // restarts at 1 each month
eq('0 0 */10 * *', '2024-01-01T12:00:00Z', '2024-01-11T00:00:00Z'); // 1,11,21,31
eq('0 0 */10 * *', '2024-01-21T12:00:00Z', '2024-01-31T00:00:00Z');
eq('0 0 */10 * *', '2024-01-31T12:00:00Z', '2024-02-01T00:00:00Z');

// Month field: ranges, lists, and steps.
eq('0 0 1 3-5 *', '2024-01-01T00:00:00Z', '2024-03-01T00:00:00Z');
eq('0 0 1 3-5 *', '2024-05-01T00:00:00Z', '2025-03-01T00:00:00Z');
eq('0 0 1 */3 *', '2024-01-02T00:00:00Z', '2024-04-01T00:00:00Z'); // months 1,4,7,10
eq('0 0 1 */3 *', '2024-10-02T00:00:00Z', '2025-01-01T00:00:00Z');
eq('0 0 1 2-12/5 *', '2024-03-01T00:00:00Z', '2024-07-01T00:00:00Z'); // months 2,7,12
eq('0 0 1 2-12/5 *', '2024-07-01T00:00:00Z', '2024-12-01T00:00:00Z');
eq('0 0 1 1,6 *', '2024-02-01T00:00:00Z', '2024-06-01T00:00:00Z');

// The 5-year search window. The bound is inclusive on the year of fromIso + 5.
eq('0 0 29 2 *', '2099-03-01T00:00:00Z', '2104-02-29T00:00:00Z'); // window through 2104
assert.equal(
  cronNext('0 0 29 2 *', '2096-03-01T00:00:00Z'),
  null,
  'no February 29 in 2097-2101 (2100 is not leap), so the 5-year window has no match',
);
assert.equal(
  cronNext('0 0 30 2 *', '2024-01-01T00:00:00Z'),
  null,
  'February 30 never exists',
);

console.log('ok');
