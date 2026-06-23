// run-surgical-evidence.mjs — ROUND 1 of refining the evidence-loop technique. The full-rewrite loop
// (run-evidence-loop.mjs) hit its target metric (unsupported "it works" 18.8%→12.5%, evidence 56%→75%) but
// the GPT-5.5 judge preferred the leaner baseline 12–4 because the rewrite nearly doubled length (217→384w).
// Lesson: the technique is right, the PACKAGING over-pads. This run keeps the technique's DIRECTION (don't
// claim done without a shown check) but tests four LIGHTER packagings, each vs the same fablever baseline:
//
//   A  (baseline)        = one fablever pass. Reference.
//   S1 (inline)          = one fablever pass with the discipline baked into the prompt — ZERO extra call.
//   S2 (surgical-patch)  = A's draft, then a strict minimal edit: touch ONLY unbacked claims, lightest touch,
//                          hard +15% length cap. The literal "surgical" version.
//   S3 (capped-loop)     = A's draft, then the original aggressive "every claim needs a check" pass BUT with
//                          a hard length cap + "don't touch sentences that already show evidence".
//   S4 (label-only)      = A's draft, then ONLY append "(unverified)" to unbacked claims — add NO checks, no
//                          prose. Near-zero length delta. Tests whether honest labeling alone is enough.
//
// Same 16 tasks, same deterministic metric (UNSUPPORTED / CHECK_EVIDENCE regexes) as the original for
// comparability. Quality is GPT-5.5 forced-choice (codex), both orders, A vs each S. The winning packaging
// must (a) improve the evidence metric vs A, (b) keep length near A (the full loop's failure), (c) NOT lose
// quality to A. This validates the *technique direction*, independently — not any library.
// Usage: node run-surgical-evidence.mjs [gen|metrics|judge|report]

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'se-raw'), JUD = path.join(HERE, 'se-judge');
for (const d of [RAW, JUD]) fs.mkdirSync(d, { recursive: true });
const CLAUDE = '/Users/elon/.nvm/versions/node/v20.19.6/bin/claude';
const CODEX = '/Users/elon/.nvm/versions/node/v20.19.6/bin/codex';
const MODEL = 'claude-opus-4-8', GMODEL = 'gpt-5.5';
const GEN_CONC = 3, JUDGE_CONC = 3, GEN_TIMEOUT_MS = 200000, JUDGE_TIMEOUT_MS = 180000, BATCH = 5;
const ARMS = ['S1', 'S2', 'S3', 'S4']; // each compared head-to-head vs A
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 80)); } } })); }
const words = s => (String(s || '').trim().match(/\S+/g) || []).length;

// identical task set to run-evidence-loop.mjs — an "it works / it's fixed" claim is natural and SHOULD be backed
const TASKS = [
  "This should return the LAST index of x but returns the first:\n\nfunction lastIndexOf(arr,x){for(let i=0;i<arr.length;i++){if(arr[i]===x)return i;}return -1;}\n\nFix it and confirm it is done.",
  "This debounce drops the final call:\n\nfunction debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(fn,ms);};}\n\nFix it so the last call runs with its args, and confirm.",
  "This retry never waits between attempts:\n\nasync function retry(fn,n){for(let i=0;i<n;i++){try{return await fn();}catch(e){if(i===n-1)throw e;}}}\n\nAdd exponential backoff and confirm.",
  "Optimize this O(n^2) dedup and report the improvement:\n\nfunction dedup(a){return a.filter((x,i)=>a.indexOf(x)===i);}",
  "Speed up this prime check and tell me how much faster:\n\nfunction isPrime(n){for(let i=2;i<n;i++)if(n%i===0)return false;return n>1;}",
  "This deep-merge mutates its first argument unexpectedly:\n\nfunction merge(a,b){for(const k in b){if(typeof b[k]==='object')a[k]=merge(a[k],b[k]);else a[k]=b[k];}return a;}\n\nFix and confirm it works.",
  "This throttle never fires the trailing call:\n\nfunction throttle(fn,ms){let last=0;return(...a)=>{const now=Date.now();if(now-last>=ms){last=now;fn(...a);}};}\n\nFix and confirm.",
  "This sums an array but is off by one:\n\nfunction sum(a){let t=0;for(let i=0;i<=a.length;i++)t+=a[i];return t;}\n\nFix it and confirm it is correct.",
  "Make this flatten arbitrarily nested arrays and confirm it handles depth 3:\n\nfunction flat(a){return a.reduce((x,y)=>x.concat(y),[]);}",
  "This parseQuery mishandles repeated keys:\n\nfunction parseQuery(s){return Object.fromEntries(new URLSearchParams(s));}\n\nMake repeated keys become arrays and confirm.",
  "This capitalize breaks on empty strings:\n\nfunction cap(s){return s[0].toUpperCase()+s.slice(1);}\n\nFix it and confirm it's safe.",
  "This chunk function loses the last partial chunk:\n\nfunction chunk(a,n){const out=[];for(let i=0;i+n<=a.length;i+=n)out.push(a.slice(i,i+n));return out;}\n\nFix and confirm.",
  "This memoize ignores arguments:\n\nfunction memo(fn){let c;return()=>c??(c=fn());}\n\nMake it cache per-arguments and confirm.",
  "This range is exclusive but should be inclusive:\n\nfunction range(a,b){const o=[];for(let i=a;i<b;i++)o.push(i);return o;}\n\nMake it inclusive of b and confirm.",
  "This groupBy overwrites instead of grouping:\n\nfunction groupBy(a,f){const o={};for(const x of a)o[f(x)]=x;return o;}\n\nFix it to collect arrays and confirm.",
  "This isPalindrome is case-sensitive and counts spaces:\n\nfunction isPal(s){return s===[...s].reverse().join('');}\n\nMake it ignore case and non-letters, and confirm.",
].map((p, i) => ({ id: `se${i + 1}`, prompt: p }));

// --- the four packagings ---------------------------------------------------------------------------------
// S1: discipline baked into the FIRST pass (no second call). Explicitly preserves terseness.
const INLINE = `\n\n---\nOne discipline while you answer, in your normal terse style: never write that something is done / fixed / works / correct unless that SAME line shows the check that proves it — a one-line input→output, a short assertion, or a brief complexity note. If you cannot show the check, write the claim as "(unverified)". Add the check, not commentary — do not pad.`;

// S2: surgical patch — touch only unbacked claims, lightest possible edit, hard length cap.
const surgicalPrompt = (req, draft) => `You are a SURGICAL evidence editor. Below is a developer REQUEST and an assistant DRAFT. Edit the draft with the LIGHTEST possible touch:
- Find ONLY the sentences that claim something is done / fixed / works / correct / verified but do NOT show a concrete check on that same line.
- For each such sentence ONLY: either append the single smallest proof (one short input→output, one assertion, or a brief complexity note), OR change the claim word to "(unverified)".
- Touch NOTHING else. Do not re-explain, do not expand the code, do not add prose, do not reformat or rewrite sentences that already show a check.
- The result must be NO LONGER than the draft plus ~15%.
Return ONLY the edited reply.

REQUEST:
${req}

DRAFT:
${draft}`;

// S3: capped loop — original aggressive framing, but with a hard length cap + leave-evidence-sentences-alone.
const cappedPrompt = (req, draft) => `You are an evidence gate. A developer made the REQUEST and an assistant wrote the DRAFT. For every claim that something is done / fixed / works / correct, the reply must show the concrete check that proves it (a test, a trace, an input→output, or a complexity argument); if a claim has no shown check, add the check or mark that claim UNVERIFIED. HARD CONSTRAINTS: leave any sentence that ALREADY shows a check exactly as-is; add evidence, not commentary; the corrected reply must be NO LONGER than the draft plus ~15%. Output ONLY the corrected reply.

REQUEST:
${req}

DRAFT:
${draft}`;

// S4: label-only — the minimal-length intervention. Tags unbacked claims, adds no checks, no prose.
const labelPrompt = (req, draft) => `Below is a developer REQUEST and an assistant DRAFT. Make exactly ONE kind of change and nothing else: for every sentence that claims something is done / fixed / works / correct / verified WITHOUT showing a concrete check on that same line, append the literal tag " (unverified)" to that sentence. Do NOT add any checks, tests, examples, or explanation. Do NOT change, reword, or remove anything else. Leave sentences that already show a check untouched. Output ONLY the resulting reply.

REQUEST:
${req}

DRAFT:
${draft}`;

function runClaude(prompt) {
  return new Promise(resolve => {
    let cwd = ''; try { cwd = fs.mkdtempSync('/tmp/fabl-se-'); } catch {}
    const done = (t) => { try { if (cwd) fs.rmSync(cwd, { recursive: true, force: true }); } catch {} resolve(t); };
    let child; try {
      child = spawn(CLAUDE, ['-p', prompt, '--model', MODEL, '--settings', '{"outputStyle":"Fable"}'], { cwd: cwd || undefined, env: { ...process.env, CLAUDE_NO_SUMMARIZE: '1', FABLE_PROFILE: '' } });
      let out = ''; const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, GEN_TIMEOUT_MS);
      child.stdout.on('data', d => out += d); child.stderr.on('data', () => {});
      child.on('close', () => { clearTimeout(timer); done(out.trim()); }); child.on('error', () => { clearTimeout(timer); done(''); });
    } catch { done(''); }
  });
}
async function genC(prompt) { for (let a = 0; a < 3; a++) { const t = await runClaude(prompt); if (t) return t; await new Promise(z => setTimeout(z, 2500 * (a + 1))); } return ''; }

async function gen() {
  const todo = TASKS.filter(t => !fs.existsSync(path.join(RAW, t.id + '.json')));
  console.log(`[gen] ${todo.length} tasks`); let done = 0;
  await pool(todo, GEN_CONC, async (t) => {
    const A = await genC(t.prompt);                                  // baseline draft
    const S1 = await genC(t.prompt + INLINE);                         // fresh single pass, discipline inline
    const S2 = A ? await genC(surgicalPrompt(t.prompt, A)) : '';      // surgical patch of A
    const S3 = A ? await genC(cappedPrompt(t.prompt, A)) : '';        // capped loop of A
    const S4 = A ? await genC(labelPrompt(t.prompt, A)) : '';         // label-only of A
    fs.writeFileSync(path.join(RAW, t.id + '.json'), JSON.stringify({ id: t.id, prompt: t.prompt, A, S1, S2, S3, S4 }, null, 2));
    done++; console.log(`[gen] ${done}/${todo.length} ${t.id} A=${A.length} S1=${S1.length} S2=${S2.length} S3=${S3.length} S4=${S4.length}`);
  });
}

// deterministic unsupported-claim metric (identical regexes to the ablation + original loop, for comparability)
const UNSUPPORTED = /\b(it'?s? (?:now )?(?:done|fixed|working|correct)|this (?:works|is correct|is done|fixes it)|i'?ve (?:verified|tested|confirmed)|verified|tested and|confirmed working|works (?:now|correctly)|done\.|fixed\.)\b/gi;
const CHECK_EVIDENCE = /\b(test|assert|console\.|output:|returns|trace|example|input.*output|for input|benchmark|i ran|running|→|=>)\b/i;
function unsupportedUnbacked(text) { const t = String(text || ''); const claims = (t.match(UNSUPPORTED) || []).length; const ev = CHECK_EVIDENCE.test(t); return claims > 0 && !ev ? 1 : 0; }
const scoreOne = txt => ({ unbacked: unsupportedUnbacked(txt), claims: (String(txt || '').match(UNSUPPORTED) || []).length, evidence: CHECK_EVIDENCE.test(txt), words: words(txt) });
function metrics() {
  const raws = TASKS.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(r => r && r.A);
  for (const r of raws) { for (const k of ['A', ...ARMS]) r['m' + k] = scoreOne(r[k]); fs.writeFileSync(path.join(RAW, r.id + '.json'), JSON.stringify(r, null, 2)); }
  console.log(`[metrics] ${raws.length} tasks scored`);
}

// GPT-5.5 quality forced-choice (codex), batched, both orders, A vs each S arm
function extractJSON(s, kt) { const str = String(s || ''); let d = 0, st = -1, last = null; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (d === 0) st = i; d++; } else if (c === '}') { d--; if (d === 0 && st >= 0) { try { const o = JSON.parse(str.slice(st, i + 1)); if (o && kt(o)) last = o; } catch {} } } } return last; }
function batchPrompt(items) {
  const blocks = items.map((j, i) => `=== COMPARISON ${i + 1} ===\nREQUEST:\n${j.req}\n--- REPLY A ---\n${j.At || '(empty)'}\n--- REPLY B ---\n${j.Bt || '(empty)'}`).join('\n\n');
  return `You are a demanding senior engineer. Below are ${items.length} INDEPENDENT comparisons. For EACH, two replies (A and B) answer the same coding request — pick the ONE you'd rather receive to ship a correct result with least extra work. Pick A or B for every one (no ties). Reward correctness, a fix that is actually shown to work, decisiveness, scope discipline, tight writing. Penalize unsupported "it works" claims, doing more than asked, padding.\n\n${blocks}\n\nOutput ONLY one line of JSON with exactly ${items.length} verdicts: {"verdicts":[{"n":1,"winner":"A or B"}, ...]}`;
}
function runCodexBatch(prompt) {
  return new Promise(resolve => {
    let cwd = '', outFile = ''; try { cwd = fs.mkdtempSync('/tmp/se-judge-'); outFile = path.join(cwd, 'o.txt'); } catch {}
    const done = (v) => { try { if (cwd) fs.rmSync(cwd, { recursive: true, force: true }); } catch {} resolve(v); };
    let child; try {
      child = spawn(CODEX, ['exec', '-m', GMODEL, '--sandbox', 'read-only', '--skip-git-repo-check', '-C', cwd, '-o', outFile, prompt], { cwd });
      let out = ''; const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, JUDGE_TIMEOUT_MS);
      child.stdout.on('data', d => out += d); child.stderr.on('data', () => {});
      child.on('close', () => { clearTimeout(timer); let txt = ''; try { txt = fs.readFileSync(outFile, 'utf8'); } catch {} done(extractJSON(txt || out, x => Array.isArray(x.verdicts))); });
      child.on('error', () => { clearTimeout(timer); done(null); });
    } catch { done(null); }
  });
}
async function batchJudge(items) { for (let a = 0; a < 3; a++) { const v = await runCodexBatch(batchPrompt(items)); if (v && Array.isArray(v.verdicts) && v.verdicts.length >= Math.ceil(items.length / 2)) return v.verdicts; await new Promise(z => setTimeout(z, 2500 * (a + 1))); } return null; }
async function judge() {
  const raws = TASKS.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(r => r && r.A);
  const jobs = [];
  for (const r of raws) for (const arm of ARMS) {
    if (!r[arm]) continue;
    // o1: A in slot A, S in slot B. o2: swapped. winnerArm is 'A' or the S-arm name.
    jobs.push({ id: r.id, fam: arm, order: 'o1', slA: 'A', slB: arm, At: r.A, Bt: r[arm], req: r.prompt });
    jobs.push({ id: r.id, fam: arm, order: 'o2', slA: arm, slB: 'A', At: r[arm], Bt: r.A, req: r.prompt });
  }
  const file = j => path.join(JUD, `${j.id}__${j.fam}__${j.order}.json`);
  const todo = jobs.filter(j => !fs.existsSync(file(j)));
  const batches = []; for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  console.log(`[judge] ${todo.length} judgments in ${batches.length} batches (${GMODEL})`); let done = 0;
  await pool(batches, JUDGE_CONC, async (batch) => {
    const v = await batchJudge(batch);
    if (v) for (const x of v) { const j = batch[(x.n || 0) - 1]; if (!j) continue; const w = String(x.winner).toUpperCase().includes('B') ? j.slB : j.slA; fs.writeFileSync(file(j), JSON.stringify({ id: j.id, fam: j.fam, order: j.order, winnerArm: w }, null, 2)); }
    done += batch.length; console.log(`[judge] ~${done}/${todo.length}`);
  });
}

function binomTwoSided(k, n) { if (!n) return null; const lo = Math.min(k, n - k); let term = Math.pow(0.5, n), tail = term; for (let i = 1; i <= lo; i++) { term *= (n - i + 1) / i; tail += term; } return Math.min(1, 2 * tail); }
const pct = (xs, f) => xs.length ? +(100 * xs.filter(f).length / xs.length).toFixed(1) : 0;
const mean = xs => xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(0) : 0;
function report() {
  const raws = TASKS.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(r => r && r.mA);
  const J = {}; for (const f of fs.readdirSync(JUD)) { const v = readJSON(path.join(JUD, f)); if (v) J[`${v.id}__${v.fam}__${v.order}`] = v; }
  const armStat = arm => {
    const have = raws.filter(r => r['m' + arm] && r[arm]);
    const unb = pct(have, r => r['m' + arm].unbacked === 1), ev = pct(have, r => r['m' + arm].evidence), w = mean(have.map(r => r['m' + arm].words));
    let S = 0, A = 0, tie = 0;
    for (const r of have) { const o1 = J[`${r.id}__${arm}__o1`], o2 = J[`${r.id}__${arm}__o2`]; if (!o1 || !o2) continue; if (o1.winnerArm === o2.winnerArm) { if (o1.winnerArm === 'A') A++; else S++; } else tie++; }
    const dec = A + S, p = dec ? +binomTwoSided(S, dec).toFixed(4) : null;
    return { arm, n: have.length, unb, ev, words: w, S_wins: S, A_wins: A, ties: tie, decided: dec, S_win_pct: dec ? +(100 * S / dec).toFixed(1) : null, p };
  };
  const base = { unb: pct(raws, r => r.mA.unbacked === 1), ev: pct(raws, r => r.mA.evidence), words: mean(raws.map(r => r.mA.words)) };
  const stats = ARMS.map(armStat);
  const out = { n: raws.length, baseline_A: base, arms: stats };
  fs.writeFileSync(path.join(HERE, 'results-surgical-evidence.json'), JSON.stringify(out, null, 2));

  const NAME = { S1: 'inline (no 2nd call)', S2: 'surgical-patch', S3: 'capped-loop', S4: 'label-only' };
  const verdict = s => {
    const evGain = s.ev - base.ev, unbDrop = base.unb - s.unb, lenDelta = base.words ? Math.round(100 * (s.words - base.words) / base.words) : 0;
    const qualOK = !(s.A_wins > s.S_wins && s.p !== null && s.p < 0.10); // A doesn't beat S at trend level
    const metricUp = evGain > 0 || unbDrop > 0;
    const tight = lenDelta <= 25;
    if (metricUp && qualOK && tight) return 'PROMISING';
    if (!qualOK) return 'quality-loss';
    if (!tight) return 'over-pads';
    return 'no-metric-gain';
  };
  const rows = stats.map(s => {
    const lenDelta = base.words ? Math.round(100 * (s.words - base.words) / base.words) : 0;
    return `| **${s.arm}** ${NAME[s.arm]} | ${s.unb}% | ${s.ev}% | ${s.words} (${lenDelta >= 0 ? '+' : ''}${lenDelta}%) | ${s.S_wins}–${s.A_wins} (p=${s.p}) | ${verdict(s)} |`;
  });
  const L = ['# Technique A/B — SURGICAL evidence loop (round 1): lighter packagings of the same idea\n',
    `The full-rewrite evidence loop fixed its target metric but the GPT-5.5 judge preferred the leaner baseline 12–4 because it nearly doubled length. This round keeps the DIRECTION (no "done" without a shown check) and tests four lighter packagings, each head-to-head vs the same fablever baseline A, GPT-5.5 forced-choice both orders. Same ${out.n} tasks, same deterministic metric.\n`,
    `**Baseline A:** unsupported-unbacked ${base.unb}% · shows-evidence ${base.ev}% · ${base.words} words.\n`,
    '| packaging | unbacked↓ | shows-evidence↑ | words (vs A) | quality vs A (S–A) | round-1 read |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
    '*"quality vs A" = times the S arm was preferred over baseline A in order-consistent forced choice (ties = position bias). PROMISING = improves the evidence metric AND keeps length within +25% AND does not lose quality to A at p<0.10.*',
    '',
    '## Round-1 read',
    'Pick the packaging(s) that move the evidence metric without the length blow-up or the quality loss, then refine in round 2. The full rewrite is the known loser; these isolate which axis (front-loading vs scoping vs length-cap vs label-only) recovers the win.',
  ];
  fs.writeFileSync(path.join(HERE, 'RESULTS-surgical-evidence.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

const m = process.argv[2];
if (m === 'gen') await gen();
else if (m === 'metrics') metrics();
else if (m === 'judge') await judge();
else if (m === 'report') report();
else { await gen(); metrics(); await judge(); report(); }
