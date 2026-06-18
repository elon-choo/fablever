// run-style.mjs — Axis A helper. Computes leaktest-style §4a MANIPULATION-CHECK metrics from captured
// transcripts and builds a format-normalized, task-shuffled, L/R-shuffled judging packet for §4c.
// NO network, no keys.
//
// IMPORTANT (PROTOCOL.md §0): the §4a metrics are a manipulation-check ("did the layer engage?"), NOT a
// result. They are also NOT blinding — normalization here suppresses only SOME form tells (openers,
// markdown); length and substance remain visible, so §4c is pre-registered NON-BLIND / descriptive only.
// The headline is the executable coding pass rate (§4b), scored by the task check commands, not here.
//
// Input dir: per-run transcript JSON files, each shaped:
//   { "condition":"A0"|"A1", "task":"C1-bugfix",
//     "messages":[ { "role":"assistant","text":"...","tool_uses":2 }, ... ] }
// Usage:
//   node run-style.mjs metrics <dir>          # print A0 vs A1 manipulation-check table
//   node run-style.mjs packet  <dir> <seed>   # write judging-packet.json (opener-stripped, task+L/R shuffled)
import fs from 'node:fs';
import path from 'node:path';

// hedging cues (proxy only — manipulation-check, not a result). Kept deliberately conservative.
const CAVEAT = /\b(however|that said|it'?s worth noting|worth noting|keep in mind|to be safe|caveat|i'?m not (?:totally |entirely )?sure|hard to say|it depends)\b/gi;
const SELF_OPENER = /^\s*(i'?ll|let me|i will|i'?m going to|i am going to|first,? i|now i'?ll|let'?s)\b[^.\n]*[.:]?\s*/i;

const load = dir => fs.readdirSync(dir).filter(f => f.endsWith('.json'))
  .map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } })
  .filter(Boolean);

const asstMsgs = t => (t.messages || []).filter(m => m.role === 'assistant');
const words = s => (String(s || '').trim().match(/\S+/g) || []).length;
const median = xs => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function metrics(runs) {
  const a = runs.flatMap(asstMsgs);
  const textMsgs = a.filter(m => words(m.text) > 0);          // denominator = text-bearing msgs (matches leaktest)
  const wlist = textMsgs.map(m => words(m.text));
  const totalWords = wlist.reduce((s, w) => s + w, 0) || 1;
  const tool = a.reduce((s, m) => s + (m.tool_uses || 0), 0);
  const caveats = textMsgs.reduce((s, m) => s + ((String(m.text).match(CAVEAT) || []).length), 0);
  const openers = textMsgs.filter(m => SELF_OPENER.test(m.text)).length;
  const endedQ = runs.filter(r => { const am = asstMsgs(r); const last = am[am.length - 1]; return last && /\?\s*$/.test(String(last.text || '').trim()); }).length;
  return {
    runs: runs.length,
    median_words_per_msg: median(wlist),
    tool_to_text_ratio: +(tool / (textMsgs.length || 1)).toFixed(2),
    caveat_per_100w: +((caveats / totalWords) * 100).toFixed(2),
    self_narration_pct: +((openers / (textMsgs.length || 1)) * 100).toFixed(1),
    ended_on_question_rate: +((endedQ / (runs.length || 1)) * 100).toFixed(1),
    // NOTE: the "over-build proxy" in PROTOCOL §4a is a MANUAL count (created files/abstractions beyond
    // the ask) — it is intentionally NOT computed here; record it by hand in results-template.md.
  };
}

// deterministic seeded RNG (xorshift32) — verified reproducible + unbiased
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296); }; }
function shuffle(arr, rand) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const stripOpener = s => String(s || '').replace(SELF_OPENER, '');           // per-message opener strip
const flatten = s => String(s || '')
  .replace(/^#{1,6}\s+/gm, '')             // markdown headers
  .replace(/^\s*[-*]\s+/gm, '')            // list markers ONLY (not content hyphens like -3 or --dir)
  .replace(/^\s*>\s+/gm, '')               // block quotes
  .trim();
const normalizeRun = r => flatten(asstMsgs(r).map(m => stripOpener(m.text)).join('\n\n'));

const [cmd, dir, seedArg] = [process.argv[2], process.argv[3], process.argv[4]];
if (!cmd || !dir) { console.log('usage: node run-style.mjs metrics <dir> | packet <dir> <seed>'); process.exit(1); }
const all = load(dir);
const A0 = all.filter(r => r.condition === 'A0'), A1 = all.filter(r => r.condition === 'A1');

if (cmd === 'metrics') {
  console.log(JSON.stringify({ note: 'MANIPULATION-CHECK ONLY — not a result, not blinding (PROTOCOL §0)', A0: metrics(A0), A1: metrics(A1) }, null, 2));
} else if (cmd === 'packet') {
  const seed = parseInt(seedArg || '1', 10); const rand = rng(seed);
  const tasks = shuffle([...new Set(all.map(r => r.task))], rand);   // M-2: seeded TASK-ORDER shuffle too
  const items = tasks.map(task => {
    const a0 = A0.find(r => r.task === task), a1 = A1.find(r => r.task === task);
    if (!a0 || !a1) return null;
    const left = rand() < 0.5;
    return { task, left: left ? 'A0' : 'A1', right: left ? 'A1' : 'A0', response_L: normalizeRun(left ? a0 : a1), response_R: normalizeRun(left ? a1 : a0) };
  }).filter(Boolean);
  const out = path.join(dir, 'judging-packet.json');
  fs.writeFileSync(out, JSON.stringify({
    seed,
    blinding: 'NON-BLIND: openers+markdown stripped, but LENGTH and SUBSTANCE remain visible. Treat all preferences as descriptive only.',
    instructions: 'Judge substance/task-success only; ignore length and formatting and do not mention them in your rationale. Record a one-line rationale. If you can tell which is the tool, mark the item condition-leaked.',
    items,
  }, null, 2));
  console.log(`wrote ${out} (${items.length} pairs, seed ${seed})`);
} else { console.log('unknown command'); process.exit(1); }
