const RANGES = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day-of-month
  [1, 12], // month
  [0, 6], // day-of-week
];

function parseField(text, min, max) {
  const values = new Set();
  for (const term of text.split(',')) {
    const slash = term.indexOf('/');
    const rangeText = slash === -1 ? term : term.slice(0, slash);
    const step = slash === -1 ? 1 : Number(term.slice(slash + 1));
    if (!Number.isInteger(step) || step < 1) throw new Error(`bad step in "${text}"`);

    let lo;
    let hi;
    if (rangeText === '*') {
      lo = min;
      hi = max;
    } else {
      const dash = rangeText.indexOf('-');
      if (dash === -1) {
        lo = Number(rangeText);
        hi = lo;
      } else {
        lo = Number(rangeText.slice(0, dash));
        hi = Number(rangeText.slice(dash + 1));
      }
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw new Error(`bad term "${term}"`);
    if (lo < min || hi > max || lo > hi) throw new Error(`term "${term}" out of range`);

    // Steps count from the low end of the term's own range, not from the field minimum.
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return values;
}

function pad(value, width) {
  return String(value).padStart(width, '0');
}

function format(date) {
  return (
    `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}` +
    `T${pad(date.getUTCHours(), 2)}:${pad(date.getUTCMinutes(), 2)}:00Z`
  );
}

export function cronNext(expr, fromIso) {
  const fields = String(expr).trim().split(/\s+/);
  if (fields.length !== 5) throw new Error('a cron expression must have exactly 5 fields');

  const [minutes, hours, doms, months, dows] = fields.map((text, i) =>
    parseField(text, RANGES[i][0], RANGES[i][1]),
  );

  // "Restricted" is decided on the raw field text: only a bare "*" is unrestricted.
  const domRestricted = fields[2] !== '*';
  const dowRestricted = fields[4] !== '*';

  const fromMs = Date.parse(fromIso);
  if (!Number.isFinite(fromMs)) throw new Error(`unparseable timestamp: ${fromIso}`);

  const maxYear = new Date(fromMs).getUTCFullYear() + 5;

  // First whole minute strictly after fromIso.
  let cursor = new Date(Math.floor(fromMs / 60000) * 60000 + 60000);

  for (;;) {
    const year = cursor.getUTCFullYear();
    if (year > maxYear) return null;

    if (!months.has(cursor.getUTCMonth() + 1)) {
      cursor = new Date(Date.UTC(year, cursor.getUTCMonth() + 1, 1, 0, 0, 0, 0));
      continue;
    }

    const dom = cursor.getUTCDate();
    const dow = cursor.getUTCDay();
    let dayOk;
    if (domRestricted && dowRestricted) dayOk = doms.has(dom) || dows.has(dow);
    else if (domRestricted) dayOk = doms.has(dom);
    else if (dowRestricted) dayOk = dows.has(dow);
    else dayOk = true;

    if (!dayOk) {
      cursor = new Date(Date.UTC(year, cursor.getUTCMonth(), dom + 1, 0, 0, 0, 0));
      continue;
    }

    if (!hours.has(cursor.getUTCHours())) {
      cursor = new Date(Date.UTC(year, cursor.getUTCMonth(), dom, cursor.getUTCHours() + 1, 0, 0, 0));
      continue;
    }

    if (!minutes.has(cursor.getUTCMinutes())) {
      cursor = new Date(cursor.getTime() + 60000);
      continue;
    }

    return format(cursor);
  }
}
