// rejudge-handoff-gemini.mjs — SECOND LAB for the Handoff A/B. Re-judges the SAME reports run-handoff.mjs
// generated (hh1-raw / hh2-raw / hh4-raw), with the IDENTICAL prompts (imported from run-handoff.mjs), using
// Gemini 3.1 pro instead of GPT-5.5. No new generation — only the judge model changes. The SHIP GATE requires
// E1 to pass under BOTH labs (B preferred, >=70% of decided, p<0.05). Caches judgments so reruns are free.
//
// Usage: node rejudge-handoff-gemini.mjs [judge|report] [e1|e2|e4]   (no arg = judge all then combined report).
// Needs GEMINI_API_KEY + network.

import fs from 'node:fs';
import path from 'node:path';
import { EXP, TASKS, HERE, pairPrompt, classifyPrompt, extractJSON, binomTwoSided, tallyPair } from './run-handoff.mjs';

const KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const GMODEL = 'gemini-3.1-pro-preview';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${GMODEL}:generateContent?key=${KEY}`;
const CONC = 3, BATCH = 5, TIMEOUT_MS = 90000;
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 80)); } } })); }

async function callGemini(prompt, kt) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }), signal: ctl.signal });
    clearTimeout(t);
    const j = await r.json();
    const txt = j?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '';
    return extractJSON(txt, kt);
  } catch { clearTimeout(t); return null; }
}
async function pairBatch(expKey, items) { for (let a = 0; a < 4; a++) { const v = await callGemini(pairPrompt(expKey, items), x => Array.isArray(x.verdicts)); if (v && v.verdicts.length >= Math.ceil(items.length / 2)) return v.verdicts; await new Promise(z => setTimeout(z, 2000 * (a + 1))); } return null; }
async function classifyBatch(items) { for (let a = 0; a < 4; a++) { const v = await callGemini(classifyPrompt(items), x => Array.isArray(x.results)); if (v && v.results.length >= Math.ceil(items.length / 2)) return v.results; await new Promise(z => setTimeout(z, 2000 * (a + 1))); } return null; }

async function judge(expKey) {
  const cfg = EXP[expKey], RAW = path.join(HERE, cfg.dir + '-raw'), JUD = path.join(HERE, cfg.dir + '-judge-gm');
  fs.mkdirSync(JUD, { recursive: true });
  const raws = TASKS[expKey].map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(r => r && r.A && r.B);
  if (cfg.kind === 'pairwise') {
    const jobs = [];
    for (const r of raws) {
      jobs.push({ id: r.id, order: 'o1', At: r.A, Bt: r.B, req: r.prompt, mapA: 'A', mapB: 'B' });
      jobs.push({ id: r.id, order: 'o2', At: r.B, Bt: r.A, req: r.prompt, mapA: 'B', mapB: 'A' });
    }
    const file = j => path.join(JUD, `${j.id}__${j.order}.json`);
    const todo = jobs.filter(j => !fs.existsSync(file(j)));
    const batches = []; for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
    console.log(`[gm judge ${expKey}] ${todo.length} judgments in ${batches.length} batches`); let done = 0;
    await pool(batches, CONC, async (batch) => {
      const v = await pairBatch(expKey, batch);
      if (v) for (const x of v) { const j = batch[(x.n || 0) - 1]; if (!j) continue; const w = String(x.winner).toUpperCase().includes('B') ? j.mapB : j.mapA; fs.writeFileSync(file(j), JSON.stringify({ id: j.id, order: j.order, winnerArm: w }, null, 2)); }
      done += batch.length; console.log(`[gm judge ${expKey}] ~${done}/${todo.length}`);
    });
  } else {
    const jobs = [];
    for (const r of raws) for (const arm of ['A', 'B']) jobs.push({ id: r.id, arm, text: r[arm], req: r.prompt });
    const file = j => path.join(JUD, `${j.id}__${j.arm}.json`);
    const todo = jobs.filter(j => !fs.existsSync(file(j)));
    const batches = []; for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
    console.log(`[gm judge ${expKey}] ${todo.length} classifications in ${batches.length} batches`); let done = 0;
    await pool(batches, CONC, async (batch) => {
      const v = await classifyBatch(batch);
      if (v) for (const x of v) { const j = batch[(x.n || 0) - 1]; if (!j) continue; fs.writeFileSync(file(j), JSON.stringify({ id: j.id, arm: j.arm, class: String(x.class || '').trim() }, null, 2)); }
      done += batch.length; console.log(`[gm judge ${expKey}] ~${done}/${todo.length}`);
    });
  }
}

function gmPairTally(expKey) {
  const cfg = EXP[expKey], RAW = path.join(HERE, cfg.dir + '-raw'), JUD = path.join(HERE, cfg.dir + '-judge-gm');
  const raws = TASKS[expKey].map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(r => r && r.A && r.B);
  const J = {}; if (fs.existsSync(JUD)) for (const f of fs.readdirSync(JUD)) { const v = readJSON(path.join(JUD, f)); if (v) J[`${v.id}__${v.order}`] = v; }
  return { n: raws.length, bva: tallyPair(raws, J, 'B') };
}
function gmClassTally(expKey) {
  const cfg = EXP[expKey], RAW = path.join(HERE, cfg.dir + '-raw'), JUD = path.join(HERE, cfg.dir + '-judge-gm');
  const raws = TASKS[expKey].map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(r => r && r.A && r.B);
  const G = {}; if (fs.existsSync(JUD)) for (const f of fs.readdirSync(JUD)) { const g = readJSON(path.join(JUD, f)); if (g) G[`${g.id}__${g.arm}`] = g.class; }
  const rec = raws.filter(r => !r.destructive), des = raws.filter(r => r.destructive);
  const rate = (set, arm, cls) => { const v = set.map(r => G[`${r.id}__${arm}`]).filter(Boolean); return v.length ? +(100 * v.filter(c => cls.includes(c)).length / v.length).toFixed(1) : null; };
  return {
    recover_earlyEscalation: { A: rate(rec, 'A', ['escalate_immediately']), B: rate(rec, 'B', ['escalate_immediately']) },
    destructive_overRetry: { A: rate(des, 'A', ['self_correct']), B: rate(des, 'B', ['self_correct']) },
  };
}

function report() {
  const gptAll = readJSON(path.join(HERE, 'results-handoff.json')); // GPT lab
  const e1g = gmPairTally('e1'), e2g = gmPairTally('e2'), e4g = gmClassTally('e4');
  const gptE1 = gptAll?.e1?.bva, gptE2 = gptAll?.e2?.bva;
  const passLab = b => b && b.F > b.O && b.F_pct !== null && b.F_pct >= 70 && b.p !== null && b.p < 0.05;
  const gemJudge = passLab(e1g.bva), gptJudge = passLab(gptE1);
  const bothJudge = gemJudge && gptJudge;
  // arm-neutral, lab-independent prerequisites computed by run-handoff's report() (deterministic backstops)
  const e1BackstopFavorsB = gptAll?.gate?.e1_backstopFavorsB ?? false;
  const e2SelfGates = gptAll?.gate?.e2_selfGates ?? false;
  // Single-shot ELIGIBILITY is necessary-but-NOT-sufficient for the always-on edit: the [Handoff Summary] block
  // is unblindable, so single-shot can never be the final always-on gate (that is E5/holdout, real usage). This
  // session ships the on-demand SKILL regardless; the always-on profile edit is HELD for E5 in every branch.
  const eligible = bothJudge && e1BackstopFavorsB && e2SelfGates;
  const out = { judge: GMODEL, e1_gemini: e1g.bva, e1_gpt: gptE1, e2_gemini: e2g.bva, e2_gpt: gptE2, e4_gemini: e4g,
    gate: { gpt_judgePass: gptJudge, gemini_judgePass: gemJudge, both_judgePass: bothJudge, e1_backstopFavorsB: e1BackstopFavorsB, e2_selfGates: e2SelfGates, single_shot_eligible: eligible, always_on_action: 'HOLD — pending E5/holdout', skill_action: 'SHIP (on-demand, self-gating)' } };
  fs.writeFileSync(path.join(HERE, 'results-rejudge-handoff-gemini.json'), JSON.stringify(out, null, 2));

  let verdict, body;
  const reload = `GPT-5.5: B ${gptE1?.F}-${gptE1?.O} (${gptE1?.F_pct}%, p=${gptE1?.p}); Gemini 3.1: B ${e1g.bva.F}-${e1g.bva.O} (${e1g.bva.F_pct}%, p=${e1g.bva.p}); arm-neutral backstop favors B = ${e1BackstopFavorsB}; E2 self-gates = ${e2SelfGates}.`;
  if (eligible) { verdict = 'SKILL SHIPS · always-on HELD — single-shot prerequisites MET, longitudinal gate (E5) pending'; body = `${reload} Both labs clear the judge bar, the arm-neutral backstop agrees, and the directive self-gates on short tasks — so the single-shot PREREQUISITES for an always-on edit are green. But the [Handoff Summary] block is unblindable to a forced-choice judge, so single-shot preference is **necessary, not sufficient**: the final always-on gate is the E5/holdout longitudinal signal (real multi-session usage), which cannot run headless. Decision: **ship the on-demand skill now; hold the always-on profile edit for E5.**`; }
  else if (bothJudge && !eligible) { verdict = 'SKILL SHIPS · always-on HELD — judges agree but a prerequisite fails (packaging-only or over-emits)'; body = `${reload} Both judges prefer B, but ${!e1BackstopFavorsB ? 'the arm-neutral backstop does NOT favor B (consistent with a packaging/form preference rather than genuine earlier reload)' : ''}${(!e1BackstopFavorsB && !e2SelfGates) ? ' and ' : ''}${!e2SelfGates ? 'the directive over-emits on short tasks (always-on noise risk)' : ''}. Not eligible for the always-on edit. **Ship the on-demand skill; hold the profile.**`; }
  else if (gptJudge !== gemJudge) { verdict = 'SKILL SHIPS · always-on HELD — judge-dependent (one lab only)'; body = `${reload} The judges disagree on the gate, so even the single-shot preference is not robust. **Ship the on-demand skill; hold the always-on profile edit; move the case to E5/holdout.**`; }
  else { verdict = 'SKILL SHIPS · always-on HELD — single-shot null, base style already reloads well'; body = `${reload} Same single-shot null this repo keeps finding: with lead-outcome + decision-trail present, a fixed top block adds no measurable single-turn advantage. **Ship the on-demand skill for the operator who wants it, keep it OUT of the always-on governor, and let E5/holdout decide the longitudinal case.**`; }

  const L = ['# Handoff A/B — SECOND LAB (Gemini 3.1) + combined decision\n',
    `Same reports generated by run-handoff.mjs, re-judged with **${GMODEL}** using the IDENTICAL imported prompts. No new generation. The on-demand SKILL ships regardless; only the ALWAYS-ON profile edit is gated. Single-shot ELIGIBILITY (necessary, not sufficient) = under BOTH labs: judge p<0.05 AND arm-neutral backstop favors B AND E2 self-gates. The final always-on gate is E5/holdout, which is not runnable headless — so the always-on edit is HELD this session in every branch.\n`,
    '| experiment | lab | B vs A | B% | p | judge-pass |',
    '|---|---|---|---|---|---|',
    `| E1 | GPT-5.5 | ${gptE1?.F}-${gptE1?.O} | ${gptE1?.F_pct}% | ${gptE1?.p} | ${gptJudge} |`,
    `| E1 | **Gemini 3.1** | ${e1g.bva.F}-${e1g.bva.O} | ${e1g.bva.F_pct}% | ${e1g.bva.p} | ${gemJudge} |`,
    `| E2 | GPT-5.5 | ${gptE2?.F}-${gptE2?.O} | ${gptE2?.F_pct}% | ${gptE2?.p} | — |`,
    `| E2 | **Gemini 3.1** | ${e2g.bva.F}-${e2g.bva.O} | ${e2g.bva.F_pct}% | ${e2g.bva.p} | — |`,
    '',
    `Arm-neutral backstop favors B (lab-independent): **${e1BackstopFavorsB}**. E2 directive self-gates on short tasks: **${e2SelfGates}**.`,
    `E4 (retry proxy, Gemini): recoverable early-escalation A ${e4g.recover_earlyEscalation.A}% vs B ${e4g.recover_earlyEscalation.B}%; destructive wrong-direction A ${e4g.destructive_overRetry.A}% vs B ${e4g.destructive_overRetry.B}%.`,
    '',
    `## Decision — ${verdict}`, body,
    `\nTwo labs, same reports; E1 n=${e1g.n}. The block is unblindable to a forced-choice judge, so single-shot is a prerequisite, not the final word; the always-on edit waits on E5/holdout.`,
  ];
  fs.writeFileSync(path.join(HERE, 'RESULTS-rejudge-handoff-gemini.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

if (!KEY) { console.log('GEMINI_API_KEY not set — aborting'); process.exit(0); }
const mode = process.argv[2], exp = process.argv[3];
const EXPS = exp ? [exp] : ['e1', 'e2', 'e4'];
if (mode === 'judge') { for (const e of EXPS) await judge(e); }
else if (mode === 'report') report();
else { for (const e of EXPS) await judge(e); report(); }
