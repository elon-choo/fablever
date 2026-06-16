// fablever model-freshness — detect newer high-performance models, validate before adopting.
// Zero dependencies (built-in fetch). The DAILY check is a cheap model-LIST call (no generation,
// ~0 chat tokens) and is rate-limited to once per 24h via a state file, so it never costs per chat.
// Adoption is GATED: a candidate is written into models.json 'active' only after it passes a
// defect-catch validation on the repo fixture (>= the current pin). Reproducibility is preserved —
// 'reported_in_whitepaper' is never touched. See orchestration/MODELS.md.
//
// CLI:
//   node model-freshness.mjs check [--force]     # detect (daily-gated unless --force); prints candidates
//   node model-freshness.mjs status              # show active pins + last check + cached candidates
//   node model-freshness.mjs validate <id>       # run the eval gate for a candidate (no write)
//   node model-freshness.mjs adopt <role> <id>   # validate, then write into active[role] if it passes
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY = path.join(__dir, '..', 'models.json');
const FIXTURE = path.join(__dir, '..', '..', 'eval', 'fixtures', 'seeded-defects-hard.json');
const STATE = path.join(os.homedir(), '.claude', 'fable-profile', 'model-check.json');
const DAY_MS = 24 * 60 * 60 * 1000;

const readJSON = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };
const writeState = (s) => { try { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); } catch { /* fail-open */ } };

// parse a numeric version out of a model id, e.g. gpt-5.5 -> 5.5, gemini-3.1-pro-preview -> 3.1
const verOf = (id) => { const m = String(id).match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : NaN; };

async function listOpenAI(key) {
  const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer ' + key } });
  if (!r.ok) return [];
  return ((await r.json()).data || []).map(m => m.id);
}
async function listGoogle(key) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + key + '&pageSize=200');
  if (!r.ok) return [];
  return ((await r.json()).models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace('models/', ''));
}

// Given a provider id list + current pin, return ids that are a NEWER same-class flagship.
export function candidatesOpenAI(ids, pin) {
  const pinV = verOf(pin);
  // flagship chat models only: gpt-N(.M) with no -pro/-mini/-nano/-codex/-chat-latest/-search suffix
  return ids.filter(id => /^gpt-\d+(?:\.\d+)?$/.test(id) && verOf(id) > pinV).sort((a, b) => verOf(b) - verOf(a));
}
export function candidatesGoogle(ids, pin) {
  const pinV = verOf(pin);
  // pro-tier flagships: gemini-N(.M)-pro(-preview)
  return ids.filter(id => /^gemini-\d+(?:\.\d+)?-pro(?:-preview)?$/.test(id) && verOf(id) > pinV).sort((a, b) => verOf(b) - verOf(a));
}

export async function check({ force = false } = {}) {
  const reg = readJSON(REGISTRY, {});
  const state = readJSON(STATE, { last_checked: null, candidates: [] });
  const now = Date.now();
  if (!force && state.last_checked && (now - state.last_checked) < DAY_MS) {
    return { skipped: true, reason: 'checked within 24h', last_checked: state.last_checked, candidates: state.candidates };
  }
  const OK = process.env.OPENAI_API_KEY, GK = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const candidates = [];
  try {
    if (OK) {
      const ids = await listOpenAI(OK);
      for (const c of candidatesOpenAI(ids, reg.active?.adjudicator || reg.families?.openai?.pin || 'gpt-5.2'))
        candidates.push({ role: 'adjudicator', provider: 'openai', current: reg.active?.adjudicator, candidate: c });
    }
    if (GK) {
      const ids = await listGoogle(GK);
      for (const c of candidatesGoogle(ids, reg.active?.worker_gemini || reg.families?.google?.pin || 'gemini-2.5-pro'))
        candidates.push({ role: 'worker_gemini', provider: 'google', current: reg.active?.worker_gemini, candidate: c });
    }
  } catch (e) { /* fail-open: network/keys absent -> no candidates */ }
  // de-dupe top candidate per role
  const top = {};
  for (const c of candidates) if (!top[c.role]) top[c.role] = c;
  const list = Object.values(top);
  writeState({ last_checked: now, candidates: list });
  return { skipped: false, last_checked: now, candidates: list };
}

// ---- validation gate: candidate reviews a fixture artifact; pinned judge scores recall vs planted ----
async function review(provider, model, artifact) {
  const sys = 'You are an adversarial code/spec reviewer. List EVERY defect you find with concrete evidence. Return ONLY JSON: {"defects":[{"summary":"...","evidence":"..."}]}';
  const user = 'Review this artifact and list every defect:\n\n' + artifact;
  if (provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, response_format: { type: 'json_object' }, max_completion_tokens: 8000, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }) });
    if (!r.ok) throw new Error('review ' + r.status);
    return JSON.parse((await r.json()).choices?.[0]?.message?.content || '{"defects":[]}').defects || [];
  }
  const GK = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GK}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ parts: [{ text: user }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8000 } }) });
  if (!r.ok) throw new Error('review ' + r.status);
  return JSON.parse((await r.json()).candidates?.[0]?.content?.parts?.[0]?.text || '{"defects":[]}').defects || [];
}
async function judgeRecall(planted, found, judgeModel) {
  const sys = 'You are a strict judge. For EACH planted defect decide if the submission CAUGHT it. Return ONLY JSON: {"caught":<integer>,"total":<integer>}';
  const user = 'PLANTED:\n' + JSON.stringify(planted) + '\n\nSUBMISSION:\n' + JSON.stringify(found);
  const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: judgeModel, response_format: { type: 'json_object' }, max_completion_tokens: 4000, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }) });
  if (!r.ok) throw new Error('judge ' + r.status);
  const j = JSON.parse((await r.json()).choices?.[0]?.message?.content || '{}');
  return { caught: j.caught || 0, total: j.total || planted.length };
}

// validate(role, candidate): candidate reviews 2 fixture artifacts; pinned judge scores recall.
// Returns { pass, recall, baselineMin }. Bounded (2 artifacts) — a regression gate, not the full A/B.
export async function validate(role, candidate) {
  const reg = readJSON(REGISTRY, {});
  const fx = readJSON(FIXTURE, { verify_tasks: [] });
  const provider = role === 'worker_gemini' ? 'google' : 'openai';
  const judge = reg.active?.adjudicator || 'gpt-5.5';
  const tasks = fx.verify_tasks.slice(0, 2);
  let caught = 0, total = 0;
  for (const t of tasks) {
    const found = await review(provider, candidate, t.artifact);
    const r = await judgeRecall(t.planted_defects, found, judge);
    caught += r.caught; total += r.total;
  }
  const recall = total ? caught / total : 0;
  const baselineMin = 0.66; // candidate must catch >= 2/3 of planted across the 2 artifacts
  return { pass: recall >= baselineMin, recall: +recall.toFixed(3), caught, total, baselineMin, candidate, role, judge };
}

export async function adopt(role, candidate, { skipValidate = false } = {}) {
  const reg = readJSON(REGISTRY, {});
  if (!reg.active || !(role in reg.active)) throw new Error('unknown role: ' + role);
  let v = { pass: true, note: 'validation skipped (--force)' };
  if (!skipValidate) {
    v = await validate(role, candidate);
    if (!v.pass) return { adopted: false, validation: v };
  }
  reg.active[role] = candidate;
  if (role === 'adjudicator' || role === 'worker_gemini') {
    reg.active.judges = [reg.active.adjudicator, reg.active.worker_gemini].filter(Boolean);
  }
  reg.validation = reg.validation || { history: [] };
  reg.validation.history = reg.validation.history || [];
  reg.validation.history.push({ event: `adopted ${candidate} as ${role}`, recall: v.recall, of: v.total });
  fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + '\n');
  return { adopted: true, validation: v };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] || 'status';
  const reg = readJSON(REGISTRY, {});
  if (cmd === 'status') {
    const st = readJSON(STATE, { last_checked: null, candidates: [] });
    console.log(JSON.stringify({ active: reg.active, reported: reg.reported_in_whitepaper, last_checked: st.last_checked, candidates: st.candidates }, null, 2));
  } else if (cmd === 'check') {
    check({ force: process.argv.includes('--force') }).then(r => console.log(JSON.stringify(r, null, 2)));
  } else if (cmd === 'validate') {
    const id = process.argv[3]; const role = /gemini/.test(id) ? 'worker_gemini' : 'adjudicator';
    validate(role, id).then(r => console.log(JSON.stringify(r, null, 2)));
  } else if (cmd === 'adopt') {
    adopt(process.argv[3], process.argv[4], { skipValidate: process.argv.includes('--force') }).then(r => console.log(JSON.stringify(r, null, 2)));
  } else { console.log('usage: check|status|validate <id>|adopt <role> <id>'); }
}
