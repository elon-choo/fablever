# Cron: next fire time

Implement `cronNext(expr, fromIso)` in `cron-next.mjs`. Keep the named ESM export
(`export function cronNext`) and use only Node.js built-ins.

`cronNext` returns the next time a 5-field cron expression fires, strictly after `fromIso`.
Everything is UTC: no local time, no time zones, no DST.

## Inputs

- `expr` — a cron expression: exactly 5 fields separated by runs of whitespace. Surrounding
  whitespace is allowed (`"0 0 * * *"`, `"  */5   *  *  *  *  "`).
- `fromIso` — an ISO-8601 UTC timestamp ending in `Z`, e.g. `2024-03-31T23:59:00Z`. It may
  carry fractional seconds: `2024-03-31T23:59:30.250Z`.

## Output

A string of exactly the shape `YYYY-MM-DDTHH:MM:SSZ` — zero-padded, no fractional seconds,
e.g. `2024-04-01T00:00:00Z`. Fire times always land on a whole minute, so the seconds are
always `00`. Return `null` when nothing matches inside the search window described below.

## The five fields

| position | field        | range                            |
| -------- | ------------ | -------------------------------- |
| 1        | minute       | 0–59                             |
| 2        | hour         | 0–23                             |
| 3        | day-of-month | 1–31                             |
| 4        | month        | 1–12 (1 = January)               |
| 5        | day-of-week  | 0–6 (0 = Sunday, 6 = Saturday)   |

## Field syntax

A field is a comma-separated list of one or more terms; a value matches the field if it
matches any term.

- `*` — every value in the field's range.
- `n` — exactly `n`. Example: `5`.
- `a-b` — every value from `a` through `b`, inclusive (`a <= b`). Example: `9-17` → 9,10,…,17.
- `a-b/s` — every `s`-th value **starting at `a`**, up to and including `b`: `a`, `a+s`, `a+2s`, …
  Example: `5-30/10` → 5, 15, 25 (35 would exceed 30).
- `*/s` — every `s`-th value starting at **the field's minimum**, through the field's maximum.
  Example: `*/15` in minute → 0, 15, 30, 45. `*/2` in day-of-month starts at 1, that field's
  minimum → 1, 3, 5, …, 31 (not 0, 2, 4, …).
- Lists combine the above: `0,30` · `1,3-5,20-30/5`.

Only this syntax appears. No names (`JAN`, `MON`), no `L`, `W`, `#`, `?`, no seconds field.
You may assume `expr` is well-formed: exactly 5 fields, every number inside its field's range,
every range with `a <= b`, every step `>= 1`. Behavior on malformed input is up to you.

## day-of-month and day-of-week

Call a field **restricted** when its text is not exactly `*`. So `*` is unrestricted, and
everything else — including `*/2` and `0-6` — is restricted.

- **Both** day-of-month and day-of-week restricted → **OR**: a day matches if day-of-month
  matches **or** day-of-week matches.
- Exactly one restricted → only that one must match.
- Neither restricted → every day matches.

Examples, all with `fromIso = 2024-01-01T00:00:00Z` (a Monday):

- `0 0 13 * 5` — both restricted → every 13th **plus** every Friday. The answer is Friday
  `2024-01-05T00:00:00Z`, not the first Friday-the-13th.
- `0 0 13 * *` — day-of-month only → `2024-01-13T00:00:00Z`.
- `0 0 * * 5` — day-of-week only → `2024-01-05T00:00:00Z`.
- `0 0 1 * */2` — both restricted (`*/2` is not exactly `*`) → the 1st of a month, OR
  Sun/Tue/Thu/Sat. The answer is Tuesday `2024-01-02T00:00:00Z`.

## The calendar

Use the real UTC calendar: month lengths and leap years must be right. February has 29 days
in a year divisible by 4, except century years not divisible by 400 — 2000 and 2024 are leap,
1900 and 2100 are not.

- `0 0 31 * *` skips 30-day months: from `2024-04-01T00:00:00Z` the answer is
  `2024-05-31T00:00:00Z`.
- `0 0 29 2 *` from `2024-03-01T00:00:00Z` is `2028-02-29T00:00:00Z`.
- `0 0 30 2 *` never matches any day.

## Search window

The answer is strictly after `fromIso`: begin at the earliest whole minute strictly later than
`fromIso` and walk forward. From `2024-01-01T00:00:30Z` the first candidate is
`2024-01-01T00:01:00Z`; from `2024-01-01T00:00:00Z` the first candidate is also
`2024-01-01T00:01:00Z`, because `00:00:00` is not strictly after itself.

Search at most 5 years: only consider candidate times whose UTC year is at most
(the UTC year of `fromIso`) + 5. If nothing in that window matches, return `null`.

- `0 0 30 2 *` from `2024-01-01T00:00:00Z` → `null`.
- `0 0 29 2 *` from `2099-03-01T00:00:00Z` → the window runs through 2104; 2100 is not a leap
  year, so the answer is `2104-02-29T00:00:00Z`.
- `0 0 29 2 *` from `2096-03-01T00:00:00Z` → the window runs through 2101, which contains no
  February 29 → `null`.

The window can span up to five years of minutes; any approach that produces the right answer
is fine.
