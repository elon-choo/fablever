// translate-ko.mjs — translate each pair's question/A/B to Korean, preserving structure/length so the A0-vs-A1
// style contrast survives. Each field translated INDEPENDENTLY (so the translator can't harmonize A and B).
// Code, commands, identifiers, file names left untranslated. Resumable per-field cache. Engine: Gemini API.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const HERE = '/Users/elon/work/fable-profile/eval/comparison/human-anchor';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const pairs = JSON.parse(fs.readFileSync(path.join(HERE, 'pairs.json'), 'utf8'));
const CACHE = '/tmp/ko-cache'; fs.mkdirSync(CACHE, { recursive: true });
const CONC = 8;

const INSTR = `다음 영어 텍스트를 자연스러운 한국어로 번역하라. 엄격한 규칙:
1. 번역만 하라. 절대 요약·재구성·개선·축약·확장하지 마라.
2. 마크다운 구조를 그대로 보존: 제목(#, ##), 불릿(-, *), 번호목록, 굵게, 표, 줄바꿈, 단락 수를 원문과 동일하게.
3. 코드블록(\`\`\`...\`\`\`), 인라인 코드(\`...\`), 명령어, 함수·변수·파일명·API 이름·식별자는 번역하지 말고 원문 그대로 둬라.
4. 원문의 길이감과 톤을 유지하라(짧으면 짧게, 길면 길게). 친절하게 풀어쓰지 마라.
5. 설명/번역노트 없이 번역 결과 텍스트만 출력하라.

[원문]
`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gemini(text) {
  for (let a = 0; a < 5; a++) {
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: INSTR + text }] }], generationConfig: { temperature: 0, maxOutputTokens: 8000 } }),
      });
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (a + 1)); continue; }
      const j = await r.json();
      const out = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
      if (out.trim()) return out.trim();
      await sleep(1500 * (a + 1));
    } catch { await sleep(2000 * (a + 1)); }
  }
  return null;
}
async function tr(text) {
  if (!text || !text.trim()) return text;
  const h = crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
  const cf = path.join(CACHE, h + '.txt');
  if (fs.existsSync(cf)) return fs.readFileSync(cf, 'utf8');
  const out = await gemini(text);
  if (out) fs.writeFileSync(cf, out);
  return out;
}

// build task list of (pairIndex, field)
const tasks = [];
pairs.forEach((p, idx) => { for (const f of ['question', 'A', 'B']) tasks.push({ idx, f }); });
let done = 0, fail = 0;
const out = pairs.map(p => ({ ...p }));
let i = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (i < tasks.length) {
    const t = tasks[i++]; const ko = await tr(pairs[t.idx][t.f]);
    if (ko) out[t.idx][t.f] = ko; else { fail++; }
    done++; if (done % 30 === 0) console.log(`[${done}/${tasks.length}] fail=${fail}`);
  }
}));
fs.writeFileSync(path.join(HERE, 'pairs-ko.json'), JSON.stringify(out, null, 2));
console.log(`DONE: pairs-ko.json (${out.length} items, ${tasks.length} fields, ${fail} failed)`);
