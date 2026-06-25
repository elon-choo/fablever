#!/usr/bin/env node
// Regression for the unsupported-done-claim lint rule (mcp/src/server.js -> fableLint). Spawns the ACTUAL
// shipped MCP server and drives fable_lint over a labeled fixture, so it tests the real rule, not a copy.
// Deterministic: NO keys, NO network, NO model calls (the whole point — the rule is the deterministic proxy
// for the style-only ablation's one honest negative). Writes RESULTS.md and exits non-zero on a regression.
//
// Usage: node eval/unsupported-claim-regression/run.mjs            (writes RESULTS.md, asserts no regression)
//        node eval/unsupported-claim-regression/run.mjs --print    (also prints the per-case table)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, '..', '..');
const SERVER = path.join(REPO, 'mcp', 'src', 'server.js');
const fixture = JSON.parse(fs.readFileSync(path.join(DIR, 'fixture.json'), 'utf8'));

const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'ignore'] });
const pending = new Map(); let buf = ''; let nid = 1;
child.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue; let m; try { m = JSON.parse(l); } catch { continue; } if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
const rpc = (method, params) => new Promise(r => { const id = nid++; pending.set(id, r); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const flagged = async text => { const r = await rpc('tools/call', { name: 'fable_lint', arguments: { text } }); const rep = JSON.parse(r.result.content[0].text); return (rep.violations || []).some(v => v.rule === 'unsupported-done-claim'); };

(async () => {
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
  let tp = 0, tn = 0, fp = 0, fn = 0; const rows = [];
  for (const c of fixture.cases) {
    const got = await flagged(c.text);
    const want = c.expected === 'flag';
    const ok = got === want;
    if (want && got) tp++; else if (!want && !got) tn++; else if (!want && got) fp++; else fn++;
    rows.push({ id: c.id, expected: c.expected, got: got ? 'flag' : 'pass', ok, text: c.text });
  }
  const hard = [];
  for (const h of (fixture.hard_cases_known_limits || [])) hard.push({ id: h.id, got: (await flagged(h.text)) ? 'flag' : 'pass', note: h.note, text: h.text });
  child.stdin.end(); child.kill();

  const n = fixture.cases.length;
  const acc = ((tp + tn) / n * 100).toFixed(1);
  const prec = tp + fp ? (tp / (tp + fp) * 100).toFixed(1) : 'n/a';
  const rec = tp + fn ? (tp / (tp + fn) * 100).toFixed(1) : 'n/a';
  const fails = rows.filter(r => !r.ok);

  const md = [
    '# Unsupported-claim regression — the lint rule vs a labeled fixture',
    '',
    '> Deterministic, offline (no keys, no network, no model calls). This guards the `unsupported-done-claim`',
    "> rule in `mcp/src/server.js` -> `fableLint`, fablever's product-side answer to its **own** published",
    '> negative: the style-only ablation measured fablever asserting "it works" without a shown check **8.3%**',
    '> of the time vs plain Claude **2.1%** (`eval/style-only-ablation/RESULTS.md`). The rule does not change',
    '> that ablation; it is a forward guard so the discipline now ships *in the tool*. Reproduce:',
    '> `node eval/unsupported-claim-regression/run.mjs`.',
    '',
    `Fixture: **${n}** labeled cases (EN + KO), binary: should the rule **flag** (unsupported completion claim) or **pass** (check shown, or marked not-verified, or no claim).`,
    '',
    '| metric | value |',
    '|---|---|',
    `| accuracy | **${acc}%** (${tp + tn}/${n}) |`,
    `| precision (of flagged, how many were truly unsupported) | ${prec}% |`,
    `| recall (of unsupported, how many were flagged) | ${rec}% |`,
    `| confusion | TP=${tp} TN=${tn} FP=${fp} FN=${fn} |`,
    '',
    fails.length ? '## Misclassified (regressions)\n\n' + fails.map(r => `- \`${r.id}\` expected **${r.expected}**, got **${r.got}** — ${JSON.stringify(r.text)}`).join('\n') : '## Misclassified\n\nNone — every labeled case classified as expected.',
    '',
    '## Known limits (documented, not hidden)',
    '',
    'The rule is a **wording proxy**, deliberately keyword-anchored — it is not a verifier and cannot know if a cited check is real. Two honest misses kept in the fixture as `hard_cases_known_limits`:',
    '',
    ...hard.map(h => `- \`${h.id}\` -> rule says **${h.got}**. ${h.note}`),
    '',
    '_The proxy catches the common, lexical failure (a bare "it works" / "고쳤고 작동합니다"); it will miss completion implied purely by tone. That ceiling is stated, not papered over._',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(DIR, 'RESULTS.md'), md);

  console.log(`unsupported-claim regression: accuracy ${acc}% (TP=${tp} TN=${tn} FP=${fp} FN=${fn}); wrote RESULTS.md`);
  if (process.argv.includes('--print')) for (const r of rows) console.log(`  ${r.ok ? 'OK ' : 'XX '} ${r.id.padEnd(16)} want=${r.expected} got=${r.got}`);
  process.exit(fails.length === 0 ? 0 : 1);
})();
