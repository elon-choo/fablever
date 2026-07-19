// day-of-month / day-of-week matching: OR when both are restricted, and what "restricted" means.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check3.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'cron-next.mjs')).href;
const { cronNext } = await import(moduleUrl);

assert.equal(typeof cronNext, 'function', 'cronNext must be exported');

const eq = (expr, from, expected) =>
  assert.equal(cronNext(expr, from), expected, `${expr} from ${from}`);

// 2024-01-01 is a Monday: Jan 5 = Fri, Jan 6 = Sat, Jan 7 = Sun, Jan 13 = Sat, Jan 14 = Sun.

// Neither field restricted: every day matches.
eq('0 0 * * *', '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z');

// Only day-of-week restricted.
eq('0 0 * * 1', '2024-01-01T00:00:00Z', '2024-01-08T00:00:00Z'); // Monday
eq('0 0 * * 0', '2024-01-01T00:00:00Z', '2024-01-07T00:00:00Z'); // 0 is Sunday
eq('0 0 * * 6', '2024-01-01T00:00:00Z', '2024-01-06T00:00:00Z'); // 6 is Saturday
eq('0 0 * * 1,3,5', '2024-01-01T00:00:00Z', '2024-01-03T00:00:00Z');
eq('0 0 * * 1-5', '2024-01-04T12:00:00Z', '2024-01-05T00:00:00Z');
eq('0 0 * * 1-5', '2024-01-05T12:00:00Z', '2024-01-08T00:00:00Z'); // skips the weekend
eq('0 0 * * 0', '2024-01-28T12:00:00Z', '2024-02-04T00:00:00Z'); // crosses a month boundary
eq('30 9 * * 1-5', '2024-01-05T10:00:00Z', '2024-01-08T09:30:00Z');

// Only day-of-month restricted.
eq('0 0 13 * *', '2024-01-01T00:00:00Z', '2024-01-13T00:00:00Z');
eq('0 0 15 * *', '2024-01-01T00:00:00Z', '2024-01-15T00:00:00Z');
eq('0 0 13 * *', '2024-01-13T00:00:00Z', '2024-02-13T00:00:00Z');

// BOTH restricted: a day matches if day-of-month matches OR day-of-week matches.
// Every 13th plus every Friday -> Friday Jan 5 comes first, NOT the first Friday-the-13th.
eq('0 0 13 * 5', '2024-01-01T00:00:00Z', '2024-01-05T00:00:00Z');
// The day-of-month branch firing on its own: Jan 13 is a Saturday, yet it matches.
eq('0 0 13 * 0', '2024-01-08T00:00:00Z', '2024-01-13T00:00:00Z');
// The day-of-week branch firing on its own: Jan 14 is a Sunday.
eq('0 0 13 * 0', '2024-01-13T00:00:00Z', '2024-01-14T00:00:00Z');
// OR still applies alongside a restricted month field.
eq('0 0 1 2 5', '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z'); // Feb 1 is a Thursday; day-of-month wins

// "Restricted" is about the field text, not about whether the field happens to match everything.
// `0-6` covers every weekday, so under OR every day matches -> Jan 2, not Jan 15.
eq('0 0 15 * 0-6', '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z');
// `*/2` is not exactly `*`, so it IS restricted: 1st of the month OR Sun/Tue/Thu/Sat.
eq('0 0 1 * */2', '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z'); // Tuesday
eq('0 0 1 * */2', '2024-01-02T00:00:00Z', '2024-01-04T00:00:00Z'); // Thursday
eq('0 0 1 * */2', '2024-01-06T00:00:00Z', '2024-01-07T00:00:00Z'); // Sunday
// Same day-of-month, unrestricted day-of-week: only the 15th matches.
eq('0 0 15 * *', '2024-01-02T00:00:00Z', '2024-01-15T00:00:00Z');
// `*/1` in day-of-month covers 1-31 but is still restricted -> OR with Mondays = every day.
eq('0 0 */1 * 1', '2024-01-02T00:00:00Z', '2024-01-03T00:00:00Z');

console.log('ok');
