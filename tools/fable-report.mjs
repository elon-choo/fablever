#!/usr/bin/env node
// tools/fable-report.mjs — honest evidence digest + measurement-campaign status, in one place.
//
// Prints the load-bearing frame ("disciplined, not smarter or cheaper"), the canonical recompute commands
// (the EVIDENCE is the committed data — this tool points at it, it does not restate numbers that could
// drift), which eval result files are present, and the current long-session measurement status (if any).
// Read-only. No network. Never reads keys/tokens. Zero dependencies.
//
//   node tools/fable-report.mjs            human-readable
//   node tools/fable-report.mjs --json     machine-readable
//
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSON_OUT = process.argv.includes('--json');
const exists = p => { try { return fs.existsSync(path.join(REPO, p)); } catch { return false; } };

const FRAME = 'fablever does not make a model smarter or cheaper. It makes a capable model more disciplined: scope control, check-before-delivery, evidence-grounded completion, stop-when-done. A style/structure transplant, not a capability upgrade.';

// Canonical evidence — class + where to RECOMPUTE it (no restated numbers, so this never drifts from data).
const EVIDENCE = [
  { class: 'proven (robust, judge-independent)', claim: 'Scope discipline (style-only)', recompute: 'cat eval/style-only-ablation/RESULTS.md' },
  { class: 'proven', claim: 'Delivery gate vs the raw first draft', recompute: 'cat eval/comparison/fable-check-sim/out4/RESULTS.md' },
  { class: 'proven', claim: 'Unsupported-claim lint rule (label regression)', recompute: 'node eval/unsupported-claim-regression/run.mjs' },
  { class: 'proven', claim: 'Install safety (uninstall restores deep-equal)', recompute: 'node test/install-matrix.mjs' },
  { class: 'proven', claim: 'Privacy (one anonymous version check; no key/code leaves)', recompute: 'node test/privacy-canary/run.mjs' },
  { class: 'proven', claim: 'Codex install reversibility + skills + no token reads', recompute: 'node test/codex-install-test.mjs && node test/codex-skills-test.mjs' },
  { class: 'null (published)', claim: 'Gate vs a generic "make it better" 2nd pass — no edge', recompute: 'cat eval/comparison/fable-check-sim/out4/RESULTS.md' },
  { class: 'null (published)', claim: 'Default-gate completeness over style-only — +0', recompute: 'cat eval/multistep-gate/RESULTS.md' },
  { class: 'null (published)', claim: 'Cross-model xverify on enumerable defects — +0 recall', recompute: 'cat eval/xverify-value/RESULTS.md' },
  { class: 'null (published)', claim: 'Developer productivity A/B', recompute: 'ls eval/comparison/productivity-ab/' },
  { class: 'cost (not a saving)', claim: 'Style block costs ~+14%/call', recompute: 'cat eval/cost-latency/RESULTS.md' },
  { class: 'judge-dependent', claim: 'Real-prompt one-shot preference flips by judge', recompute: 'cat eval/real-log-replay/RESULTS.md' },
  { class: 'unproven (missing evidence)', claim: 'Long real-session holdout (highest-leverage gap)', recompute: 'node install.mjs --with-measure-holdout  then  node measurement/status.mjs' },
];

// Long-session measurement campaign status (delegates to the canonical reporter; inert if no ledger yet).
function measurementStatus() {
  try {
    const r = spawnSync(process.execPath, [path.join(REPO, 'measurement', 'status.mjs')], { encoding: 'utf8', timeout: 15000 });
    return (r.stdout || r.stderr || '').trim() || 'no measurement output';
  } catch { return 'measurement status unavailable'; }
}

const present = EVIDENCE.map(e => ({ ...e, file_present: exists(e.recompute.replace(/^(cat|ls|node) /, '').split(/\s|&&/)[0]) }));
const status = measurementStatus();

if (JSON_OUT) {
  process.stdout.write(JSON.stringify({ frame: FRAME, evidence: present, measurement_status: status }, null, 2) + '\n');
  process.exit(0);
}

console.log('fablever — evidence report\n');
console.log(FRAME + '\n');
const byClass = {};
for (const e of present) (byClass[e.class] = byClass[e.class] || []).push(e);
for (const cls of Object.keys(byClass)) {
  console.log(`[${cls}]`);
  for (const e of byClass[cls]) console.log(`  • ${e.claim}${e.file_present ? '' : '  (data file not found here)'}\n      recompute: ${e.recompute}`);
  console.log('');
}
console.log('Long-session measurement campaign:');
console.log(status.split('\n').map(l => '  ' + l).join('\n'));
console.log('\nNote: classes "null" and "cost" are published on purpose — fablever does not hide its negative results.');
process.exit(0);
