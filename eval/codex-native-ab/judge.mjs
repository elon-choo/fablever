#!/usr/bin/env node
// eval/codex-native-ab/judge.mjs — blind quality preference between two arms, via an external judge adapter.
//
//   node judge.mjs --judge-cmd=<cmd> [--contrast=A-B] [--out=<dir>] [--seed=1] [--json]
//
// For each task where both arms of the contrast produced a final message, it presents the pair BLIND (arm
// labels stripped) and TWICE with the order swapped, so a position-biased judge can't decide. Only pairs the
// judge ranks CONSISTENTLY across both orders count; the rest are reported as inconsistent (position bias),
// not silently dropped. The decided pairs feed an exact two-sided sign test. The judge is an external command
// (a different lab) — the harness pipes it the two texts as JSON on stdin and reads {winner:'A'|'B'|'tie'};
// it NEVER reads an API key (the adapter owns auth). A `.js`/`.mjs` adapter is run via node for portability.
// Zero dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PRIMARY_CONTRASTS } from './lib/arms.mjs';
import { mulberry32 } from '../../measurement/lib/stats.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const val = (name, def) => { const a = args.find(x => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : def; };
const JSON_OUT = args.includes('--json');
const OUT = val('out', path.join(DIR, 'out'));
const SEED = Number(val('seed', '1')) || 1;
const JUDGE = val('judge-cmd', '');
const which = val('contrast', '');
const contrasts = which ? PRIMARY_CONTRASTS.filter(c => c.id === which) : PRIMARY_CONTRASTS;

if (!JUDGE) { process.stderr.write('judge needs --judge-cmd=<adapter> (a command that reads {optionA,optionB} JSON on stdin and prints {"winner":"A"|"B"|"tie"}). The harness never reads a key.\n'); process.exit(2); }

const readFinal = (task, arm) => { try { return fs.readFileSync(path.join(OUT, task, `${arm}.final.txt`), 'utf8'); } catch { return null; } };
const tasks = (() => { try { return fs.readdirSync(OUT, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch { return []; } })();

// spawn the judge adapter with {optionA, optionB} on stdin → {winner}
function askJudge(optionA, optionB) {
  const input = JSON.stringify({ optionA, optionB });
  const r = /\.[cm]?js$/.test(JUDGE)
    ? spawnSync(process.execPath, [JUDGE], { input, encoding: 'utf8', timeout: 60000 })
    : spawnSync(JUDGE, [], { input, encoding: 'utf8', shell: true, timeout: 60000 });
  try { const v = JSON.parse(r.stdout); return (v.winner === 'A' || v.winner === 'B') ? v.winner : 'tie'; } catch { return 'tie'; }
}

// exact two-sided sign test (binomial at 0.5) over decided pairs
function signTestP(a, b) {
  const n = a + b; if (n === 0) return 1;
  const k = Math.min(a, b);
  let pmf = Math.pow(0.5, n), cum = 0;
  for (let i = 0; i <= k; i++) { cum += pmf; pmf = pmf * (n - i) / (i + 1); }
  return Math.min(1, 2 * cum);
}

const MIN_DECIDED = 8;
const result = { judge: JUDGE, contrasts: [] };
for (const c of contrasts) {
  const rng = mulberry32(SEED + c.id.charCodeAt(0));
  let winsA = 0, winsB = 0, inconsistent = 0, pairs = 0;
  for (const task of tasks) {
    const ta = readFinal(task, c.a), tb = readFinal(task, c.b);
    if (ta == null || tb == null) continue;
    pairs++;
    // present both orders; map the blind winner back to the real arm
    const aFirst = rng() < 0.5;
    const o1 = askJudge(aFirst ? ta : tb, aFirst ? tb : ta);          // winner letter refers to the order shown
    const o2 = askJudge(aFirst ? tb : ta, aFirst ? ta : tb);          // swapped order
    const armOf = (winner, firstIsA) => winner === 'tie' ? 'tie' : ((winner === 'A') === firstIsA ? c.a : c.b);
    const w1 = armOf(o1, aFirst), w2 = armOf(o2, !aFirst);
    if (w1 === 'tie' || w2 === 'tie' || w1 !== w2) { inconsistent++; continue; } // position bias / tie
    if (w1 === c.a) winsA++; else winsB++;
  }
  const decided = winsA + winsB;
  result.contrasts.push({
    contrast: c.id, isolates: c.isolates, pairs, decided, inconsistent,
    [`${c.a}_preferred`]: winsA, [`${c.b}_preferred`]: winsB,
    p: signTestP(winsA, winsB), underpowered: decided < MIN_DECIDED,
    preferred: decided < MIN_DECIDED ? 'underpowered' : (winsA === winsB ? 'no preference' : (winsA > winsB ? c.a : c.b)),
  });
}

if (JSON_OUT) { process.stdout.write(JSON.stringify(result, null, 2) + '\n'); process.exit(0); }
console.log(`# codex-native-ab blind quality preference (judge: ${path.basename(JUDGE)})`);
for (const r of result.contrasts) {
  const sig = !r.underpowered && r.p < 0.05;
  console.log(`\n## ${r.contrast} (${r.isolates})`);
  console.log(`  decided ${r.decided}/${r.pairs} pairs (${r.inconsistent} inconsistent = position bias/tie)`);
  console.log(`  ${r.contrast.split('-')[0]} preferred ${r[`${r.contrast.split('-')[0]}_preferred`]}  ·  ${r.contrast.split('-')[1]} preferred ${r[`${r.contrast.split('-')[1]}_preferred`]}  ·  sign-test p=${r.p.toFixed(3)}`);
  console.log(`  → ${r.underpowered ? `underpowered (<${MIN_DECIDED} decided)` : sig ? `prefers ${r.preferred}` : 'no clear preference (ns)'}`);
}
console.log('\nBlind, order-swapped, one judge. Re-run with a second independent judge; if the preference flips, report it as JUDGE-DEPENDENT, do not merge.');
process.exit(0);
