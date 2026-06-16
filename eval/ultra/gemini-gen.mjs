// Cross-model GENERATION via the DIRECT Google Gemini API (OpenRouter is credit-limited).
import fs from 'node:fs';
const KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const fx = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const MODEL = process.argv[3] || 'gemini-2.5-pro';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;

async function call(sys, user) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sys }] },
          contents: [{ parts: [{ text: user }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8000, temperature: 0.5 },
        }),
      });
      if (!r.ok) { if (i < 2) continue; return { _e: r.status + ' ' + (await r.text()).slice(0, 160) }; }
      const j = await r.json();
      const txt = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!txt) { if (i < 2) continue; return { _e: 'empty:' + (j.candidates?.[0]?.finishReason || '?') }; }
      return JSON.parse(txt);
    } catch (e) { if (i < 2) continue; return { _e: String(e).slice(0, 140) }; }
  }
}

const SYS = 'You are an extremely thorough adversarial code/spec reviewer. Find EVERY defect — correctness, security, concurrency, edge cases, omissions, and especially SUBTLE deep-reasoning flaws that look fine on the surface. For each, give a one-line summary and concrete evidence. Return ONLY JSON: {"defects":[{"summary":"...","evidence":"..."}]}';
const SYS_DEEP = 'You are a senior reviewer hunting ONLY the subtle, deep-reasoning defects others miss — logic wrong in a non-obvious way, ordering bugs, race/TOCTOU, off-by-one at boundaries, type/precision pitfalls, protocol/parser differentials. Skip the obvious. Return ONLY JSON: {"defects":[{"summary":"...","evidence":"..."}]}';

const out = {};
for (const t of fx.verify_tasks) {
  const full = await call(SYS, 'Review this artifact and list every defect with evidence:\n\n' + t.artifact);
  const deep = await call(SYS_DEEP, 'Find the subtle deep-reasoning defects in this artifact:\n\n' + t.artifact);
  if (full && full._e) process.stderr.write('[full err ' + full._e + '] ');
  const defs = [].concat((full && full.defects) || [], (deep && deep.defects) || []);
  out[t.id] = defs;
  process.stderr.write(t.id + ':' + defs.length + ' ');
}
process.stderr.write('\n');
fs.writeFileSync('/tmp/gemini-cands.json', JSON.stringify(out));
console.log('wrote', Object.keys(out).length, 'artifacts; total findings:', Object.values(out).reduce((s, a) => s + a.length, 0));
