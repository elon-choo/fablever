#!/usr/bin/env node
// paired-deliverable/run.mjs — repeatable owner-judged blind A/B for real DELIVERABLES (copy, planning,
// reports), NOT machine-scored code. This is fablever's first-class measurement axis after the hidden-oracle
// coding fixture was found saturated on Opus (2026-07-17, owner decision /004 #1: "drop the coding A/B, stack
// owner-judged deliverable A/Bs").
//
//   node eval/paired-deliverable/run.mjs --brief=<file.md> --slug=<id> --budget-confirmed=<owner-ref> [--model=…] [--out=<dir>]
//
// WHY a runner and not full automation: the metric is the OWNER's blind pairwise preference. The runner
// automates only what is safe to automate — producing the two arms from ONE byte-identical brief (fablever
// on vs off), the manipulation check that proves the arms differ, and a randomized blind side-by-side bundle.
// It does NOT score quality (that would put a model in the judge's chair — the exact thing the owner's
// decision rejects). Scoring is the owner, via elonfeedback, blind.
//
// Discipline (matches eval/results-paired-deliverable-2026-07-17.md): pre-register BEFORE running (the
// prereg lint enforces pre-dating), run the manipulation check FIRST (a run without differentiated arms is
// void), keep the assignment blind until the owner answers. Spends real tokens → explicit owner-budget flag.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const val = name => { const a = argv.find(x => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : ''; };

const briefPath = val('brief');
const slug = val('slug');
const budgetRef = val('budget-confirmed');
const model = val('model') || process.env.FABLE_OPUS_MODEL || 'claude-opus-4-8';
const outDir = val('out') || path.join(DIR, 'runs', slug || 'run');
// ON-arm output style. Defaults to the installed 'Fable' (unchanged behavior); override to measure a
// candidate profile upgrade against plain without disturbing the live installed style.
const onStyle = val('on-style') || 'Fable';

if (!briefPath || !existsSync(briefPath)) { process.stderr.write('need --brief=<existing file.md>\n'); process.exit(2); }
if (!slug) { process.stderr.write('need --slug=<id> (used for the results file + elonfeedback page)\n'); process.exit(2); }
if (!budgetRef.trim()) { process.stderr.write('refusing — this spends real tokens. need --budget-confirmed=<owner-ref>\n'); process.exit(2); }

const claudeBin = process.env.FABLE_CLAUDE_BIN || 'claude';
const brief = readFileSync(briefPath, 'utf8').trim();

// One Claude session. arm ON = real fablever env (Fable output style, FABLE_PROFILE on); arm OFF = plain.
// Byte-identical brief, one-shot, no follow-up — the same protocol the 2026-07-17 pilot used.
function runArm(label, on, prompt) {
  const settings = on ? { outputStyle: onStyle } : { outputStyle: 'default' };
  const args = [
    '-p', prompt, '--model', model, '--output-format', 'json',
    '--permission-mode', 'bypassPermissions',
    '--tools', 'Read,Write', '--allowedTools', 'Read,Write',
    '--disallowedTools', 'Bash,Edit,Glob,Grep,WebFetch,WebSearch,Task',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--disable-slash-commands', '--no-session-persistence', '--no-chrome',
    '--settings', JSON.stringify(settings),
  ];
  const command = /\.[cm]?js$/i.test(claudeBin) ? process.execPath : claudeBin;
  const commandArgs = command === process.execPath ? [claudeBin, ...args] : args;
  const started = process.hrtime.bigint();
  const r = spawnSync(command, commandArgs, {
    cwd: mkdtempSync(path.join(tmpdir(), `paired-${label}-`)),
    encoding: 'utf8', timeout: 15 * 60 * 1000, maxBuffer: 64 * 1024 * 1024, windowsHide: true,
    env: { ...process.env, CLAUDE_NO_SUMMARIZE: '1', FABLE_PROFILE: on ? 'on' : 'off' },
  });
  const wallMs = Number(process.hrtime.bigint() - started) / 1e6;
  // `claude -p --output-format json` emits an ARRAY of stream events; the deliverable is the LAST element
  // of type 'result', in its `.result` field. Falling back to the raw stdout here silently turns the whole
  // experiment into JSON-noise-vs-JSON-noise (and makes the manipulation check match on the noise), so a
  // shape we cannot parse is a hard failure, never a fallback.
  let text = null;
  try {
    const j = JSON.parse(r.stdout);
    if (Array.isArray(j)) {
      const last = [...j].reverse().find(e => e && e.type === 'result' && typeof e.result === 'string');
      text = last ? last.result : null;
    } else if (j && typeof j.result === 'string') text = j.result;
  } catch { text = null; }
  if (text === null) {
    process.stderr.write(`VOID — could not extract the model's text from arm ${label} (unexpected --output-format json shape). Not scoring noise.\n`);
    process.exit(4);
  }
  return { label, on, status: r.status, wallMs: Math.round(wallMs), bytes: Buffer.byteLength(text, 'utf8'), text: String(text) };
}

// Manipulation check FIRST — a run whose arms are not genuinely differentiated is void.
const MANIP = 'In one short sentence: are you operating under a named custom working style right now? Name it, or say you are plain Claude Code.';
process.stdout.write('manipulation check (arms must differ)…\n');
const manipOn = runArm('manip-on', true, MANIP);
const manipOff = runArm('manip-off', false, MANIP);
// Judge the arms' ACTUAL answers (now that the text is really extracted). The ON arm must name the style;
// the OFF arm must both fail to name it AND disclaim one — a one-sided check would pass on an evasive answer.
const onNamesStyle = /fable/i.test(manipOn.text);
const offDisclaimsStyle = !/fable/i.test(manipOff.text)
  && /plain|no named|no custom|without a|not operating under|없|아닙니다|없습니다/i.test(manipOff.text);
process.stdout.write(`  ON says: ${manipOn.text.slice(0, 90).replace(/\n/g, ' ')}\n  OFF says: ${manipOff.text.slice(0, 90).replace(/\n/g, ' ')}\n`);
if (!(onNamesStyle && offDisclaimsStyle)) {
  process.stderr.write('VOID — arms are not differentiated (ON did not name Fable, or OFF did not disclaim). Not producing a comparison.\n');
  process.exit(3);
}
process.stdout.write('  → arms differentiated. Proceeding.\n\n');

process.stdout.write('producing the two deliverables (one-shot, byte-identical brief)…\n');
const armOn = runArm('deliver-on', true, brief);
const armOff = runArm('deliver-off', false, brief);

// Randomized blind assignment: which of A/B is the ON arm is hidden until the owner answers.
// Deterministic-but-unguessable-at-a-glance from the slug so the run is reproducible without Math.random.
const flip = [...slug].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 2 === 0;
const A = flip ? armOn : armOff;
const B = flip ? armOff : armOn;

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'A.md'), A.text);
writeFileSync(path.join(outDir, 'B.md'), B.text);
const keyPath = path.join(outDir, 'BLIND-KEY.json');
writeFileSync(keyPath, JSON.stringify({
  slug, model, recorded_note: 'DO NOT OPEN before the owner answers — reveals which arm is fablever.',
  A: A.on ? 'fablever-ON' : 'plain-OFF', B: B.on ? 'fablever-ON' : 'plain-OFF',
  cost: { on: { wall_ms: armOn.wallMs, bytes: armOn.bytes }, off: { wall_ms: armOff.wallMs, bytes: armOff.bytes } },
  budget_confirmed_ref: budgetRef,
}, null, 2) + '\n');

process.stdout.write(`\nblind bundle written to ${outDir}\n  A.md / B.md (assignment hidden in ${keyPath})\n`);
process.stdout.write(`cost — ON: ${armOn.wallMs}ms / ${armOn.bytes}B · OFF: ${armOff.wallMs}ms / ${armOff.bytes}B\n`);
process.stdout.write('\nNEXT: post A.md vs B.md to elonfeedback as a blind pairwise-preference page, get the owner\'s verdict,\n');
process.stdout.write('THEN reveal BLIND-KEY.json and write the results file. Do NOT self-score.\n');
process.exit(0);
