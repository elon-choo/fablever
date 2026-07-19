#!/usr/bin/env node
// eval/opus-prereg/lint.mjs — pre-registration binding lint (charter #1 / G0.4).
//
// fablever does not claim a magnitude before it is measured. A results file that reports an Opus effect must
// be bound to a *pre-registration* recorded BEFORE the first run — the decision rule ("ship iff ≥X gain at
// ≤Y% cost"), the primary/co-primary metrics, the sample floor, and (where applicable) the exact task N,
// off-trigger list, judge id, and margin. This lint makes that binding checkable, not honor-system.
//
// It is a deterministic, zero-dependency structural check — a heuristic tripwire that a prereg EXISTS, is
// well-formed, and pre-dates the run. It does NOT judge whether the decision rule is *wise* (a human does).
//
// Two modes:
//   node lint.mjs                          validate every committed *.prereg.json under eval/opus-prereg/
//   node lint.mjs --results=<path>         verify a results file is bound to a valid, pre-dated prereg
//                                          (path: a .json {experiment_id, first_run_at}, or a .md carrying a
//                                           <!-- prereg-binding: {"experiment_id":"...","first_run_at":"..."} --> block)
//   node lint.mjs --prereg-dir=<dir>       override the prereg directory (default: this file's dir)
//
// Exit 0 = all checks pass. Non-zero = a binding is missing / malformed / post-dated. Never writes anything.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const val = (name, def) => { const a = argv.find(x => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : def; };
const PREREG_DIR = path.resolve(val('prereg-dir', DIR));
const RESULTS = val('results', '');

const REQUIRED = ['experiment_id', 'registered_at', 'decision_rule', 'primary_metric', 'floor_n'];
// A decision rule must commit to a directional ship/park decision — an empty or placeholder rule is not a
// pre-registration. Heuristic: it names a decision verb AND a threshold token. (Fresh review still required.)
const DECISION_VERB = /\b(ship|adopt|promote|park|reject|keep|revert|default[-\s]?on)\b/i;
const THRESHOLD_TOKEN = /(≥|>=|≤|<=|>|<|\bat\s+(?:most|least)\b|\bwithin\b|\biff\b|%|percent|pp\b|points?\b|×|x\b)/i;

function isoOrNull(s) {
  if (typeof s !== 'string' || !s.trim()) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

// Validate one parsed prereg object. Returns an array of problem strings (empty = valid).
function validatePrereg(obj, label) {
  const problems = [];
  if (!obj || typeof obj !== 'object') return [`${label}: not a JSON object`];
  for (const k of REQUIRED) if (obj[k] === undefined || obj[k] === null || obj[k] === '') problems.push(`${label}: missing required field "${k}"`);
  if (obj.registered_at !== undefined && isoOrNull(obj.registered_at) === null) problems.push(`${label}: registered_at is not a parseable ISO-8601 timestamp`);
  if (obj.floor_n !== undefined && !(Number.isInteger(obj.floor_n) && obj.floor_n >= 1)) problems.push(`${label}: floor_n must be an integer ≥ 1`);
  if (typeof obj.decision_rule === 'string' && obj.decision_rule.trim()) {
    if (!DECISION_VERB.test(obj.decision_rule)) problems.push(`${label}: decision_rule names no decision verb (ship/park/adopt/…) — a rule that decides nothing is not a pre-registration`);
    if (!THRESHOLD_TOKEN.test(obj.decision_rule)) problems.push(`${label}: decision_rule names no threshold (≥, ≤, %, ×, iff, …) — pre-register the exact bar, not a vibe`);
  }
  return problems;
}

function readJson(file) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { return { __parse_error: String(e && e.message || e) }; } }

// Recursively collect *.prereg.json under a dir.
function collectPreregs(dir, acc = []) {
  let ents = []; try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectPreregs(p, acc);
    else if (e.isFile() && /\.prereg\.json$/i.test(e.name)) acc.push(p);
  }
  return acc;
}

// Load an index of experiment_id → {registered_at, file, problems} from the prereg dir.
function loadPreregIndex() {
  const index = new Map();
  const problems = [];
  for (const file of collectPreregs(PREREG_DIR)) {
    const label = path.relative(PREREG_DIR, file);
    const obj = readJson(file);
    if (obj && obj.__parse_error) { problems.push(`${label}: JSON parse error — ${obj.__parse_error}`); continue; }
    const probs = validatePrereg(obj, label);
    problems.push(...probs);
    if (obj && obj.experiment_id) {
      if (index.has(obj.experiment_id)) problems.push(`${label}: duplicate experiment_id "${obj.experiment_id}" (also ${index.get(obj.experiment_id).label})`);
      else index.set(obj.experiment_id, { registered_at: isoOrNull(obj.registered_at), file, label, valid: probs.length === 0 });
    }
  }
  return { index, problems };
}

// Extract {experiment_id, first_run_at} from a results file (.json or .md-with-binding-comment).
function readResultsBinding(file) {
  if (!existsSync(file)) return { error: `results path does not exist: ${file}` };
  const text = readFileSync(file, 'utf8');
  if (/\.json$/i.test(file)) {
    try { const o = JSON.parse(text); return { experiment_id: o.experiment_id, first_run_at: o.first_run_at }; }
    catch (e) { return { error: `results JSON parse error: ${String(e && e.message || e)}` }; }
  }
  const m = text.match(/<!--\s*prereg-binding:\s*(\{[\s\S]*?\})\s*-->/i);
  if (!m) return { error: `results markdown carries no <!-- prereg-binding: {...} --> block (cannot verify pre-registration)` };
  try { const o = JSON.parse(m[1]); return { experiment_id: o.experiment_id, first_run_at: o.first_run_at }; }
  catch (e) { return { error: `prereg-binding block is not valid JSON: ${String(e && e.message || e)}` }; }
}

const failures = [];
const { index, problems } = loadPreregIndex();
failures.push(...problems);

if (RESULTS) {
  const b = readResultsBinding(RESULTS);
  const rlabel = path.basename(RESULTS);
  if (b.error) failures.push(`${rlabel}: ${b.error}`);
  else {
    if (!b.experiment_id) failures.push(`${rlabel}: results declares no experiment_id`);
    const firstRun = isoOrNull(b.first_run_at);
    // first_run_at is REQUIRED in --results mode: without it the pre-dating check silently no-ops and a
    // back-dated (post-hoc) result launders through by simply omitting the field. Absence is a failure.
    if (b.first_run_at === undefined || b.first_run_at === null || b.first_run_at === '') failures.push(`${rlabel}: results declares no first_run_at — cannot verify the pre-registration pre-dates the run (omitting it is not a bypass)`);
    else if (firstRun === null) failures.push(`${rlabel}: first_run_at is not a parseable ISO-8601 timestamp`);
    const pre = b.experiment_id && index.get(b.experiment_id);
    if (!pre) failures.push(`${rlabel}: NO pre-registration found for experiment_id "${b.experiment_id}" (a magnitude result must be pre-registered before the first run — charter #1)`);
    else {
      if (!pre.valid) failures.push(`${rlabel}: bound prereg ${pre.label} is itself malformed (see above)`);
      if (pre.registered_at !== null && firstRun !== null && !(pre.registered_at < firstRun)) {
        failures.push(`${rlabel}: prereg ${pre.label} registered_at (${new Date(pre.registered_at).toISOString()}) is NOT before first_run_at (${new Date(firstRun).toISOString()}) — pre-registration must precede the run`);
      }
    }
  }
}

if (failures.length) {
  process.stderr.write(`opus-prereg lint failed: ${failures.length} problem(s)\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.stderr.write('heuristic tripwire (existence + well-formedness + pre-dating); a human still judges whether the rule is sound.\n');
  process.exit(1);
}
process.stdout.write(RESULTS
  ? `opus-prereg lint OK — results bound to a valid, pre-dated pre-registration (${index.size} prereg(s) indexed).\n`
  : `opus-prereg lint OK — ${index.size} committed pre-registration(s) well-formed.\n`);
process.exit(0);
