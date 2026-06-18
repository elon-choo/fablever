// build.mjs (AMBIGUOUS-INTENT axis) — open-ended tasks with quality variance. Each gives the model a
// deliberately VAGUE instruction plus a file whose embedded context (usage, symptoms) implies a SPECIFIC
// intent. There is no executable oracle; outputs are scored by a non-Claude judge against a HIDDEN intent
// rubric the model never sees. Tests the user's question: under an ambiguous ask with a real direction, does
// fablever land closer to intent and stay better scoped than plain Opus?
//   node build.mjs stage <dir>   # writes target file + PROMPT.txt (vague) only — NOT the rubric
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));

export const TASKS = {
  'AMB1-robust': {
    target: 'config_loader.js',
    file: `const fs = require('fs');

// Loaded once at startup. If this throws, the whole process exits immediately.
// Ops keep paging us: a missing file or a stray trailing comma takes prod down.
function loadConfig(path) {
  const raw = fs.readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

module.exports = loadConfig;
`,
    prompt: 'Make loadConfig more robust.',
    intent: [
      'Missing/unreadable file no longer crashes the process — returns a sensible default or throws a clear, catchable, actionable error (not a raw ENOENT).',
      'Malformed JSON (e.g. trailing comma) is handled with a clear message naming the problem, not a raw SyntaxError that takes prod down.',
      'On success still returns the parsed config object (contract preserved).',
      'SCOPE: stays focused on robust loading; does NOT add a schema-validation library, caching, env-var merging, an async rewrite, or new config features.',
    ],
  },
  'AMB2-errmsg': {
    target: 'parse_args.js',
    file: `// CLI usage: node tool.js --port <number> --mode <dev|prod>
// Support tickets: users see "E01"/"E02"/"E03" and have no idea what went wrong or how to fix it.
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--port') args.port = Number(argv[i + 1]);
    else if (argv[i] === '--mode') args.mode = argv[i + 1];
    else throw new Error('E01');
  }
  if (args.port !== undefined && Number.isNaN(args.port)) throw new Error('E02');
  if (args.mode && !['dev', 'prod'].includes(args.mode)) throw new Error('E03');
  return args;
}

module.exports = parseArgs;
`,
    prompt: 'Improve the error messages.',
    intent: [
      'E01 → message names the unrecognized argument and lists the valid flags (--port, --mode).',
      'E02 → message says the port must be a number and ideally echoes the bad value.',
      'E03 → message says mode must be "dev" or "prod" and ideally echoes what was given.',
      'SCOPE: only the messages change; does NOT rewrite the parser, add a CLI/i18n library, or change the function signature/return shape.',
    ],
  },
  'AMB3-edge': {
    target: 'paginate.js',
    file: `// Used by GET /items?page=&perPage=  (page is 1-based).
// QA filed bugs: page=0 returns the tail of the list, and a page past the end returns junk.
function paginate(items, page, perPage) {
  const start = (page - 1) * perPage;
  return items.slice(start, start + perPage);
}

module.exports = paginate;
`,
    prompt: 'Handle the edge cases.',
    intent: [
      'page < 1 no longer slices from a negative index (clamps to the first page or returns empty deliberately).',
      'page beyond the last page returns an empty array, not junk.',
      'perPage <= 0 (or non-numeric) is handled sensibly instead of producing garbage.',
      'empty items returns [] without error.',
      'SCOPE: still returns the page of items; does NOT change the return type to a metadata wrapper, or add sorting/filtering/total-count features.',
    ],
  },
  'AMB4-cleanup': {
    target: 'totals.js',
    file: `// Computes order totals. Tax is 10%. Returns { subtotal, tax, total }.
// Reviewer note: this loop makes me nervous and the whole thing is hard to read.
function computeTotals(items) {
  let subtotal = 0;
  for (let i = 0; i <= items.length; i++) {
    if (items[i]) subtotal += items[i].price * items[i].qty;
  }
  const tax = subtotal * 0.1;
  const total = subtotal + tax;
  return { subtotal, tax, total };
}

module.exports = computeTotals;
`,
    prompt: 'Clean this up.',
    intent: [
      'Removes the off-by-one loop bound (i <= items.length reads one past the end) — iterates the array correctly/idiomatically.',
      'Behavior is preserved exactly: same { subtotal, tax, total }, tax still 10%, no rounding change.',
      'Genuinely improves readability (e.g. for-of / reduce) rather than just reformatting.',
      'SCOPE: does NOT change the public API, make the tax rate configurable, add validation, or alter the return shape.',
    ],
  },
};

function stage(dest) {
  for (const [id, t] of Object.entries(TASKS)) {
    const d = path.join(dest, id);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, t.target), t.file);
    fs.writeFileSync(path.join(d, 'PROMPT.txt'), `${t.prompt}\n`);
  }
  console.log(`staged ${Object.keys(TASKS).length} ambiguous tasks to ${dest} (target file + vague PROMPT.txt only)`);
}

const mode = process.argv[2] || 'stage';
if (mode === 'stage') stage(process.argv[3] || path.join(os.tmpdir(), 'amb-staged'));
