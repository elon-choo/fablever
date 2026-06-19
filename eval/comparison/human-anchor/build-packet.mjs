// build-packet.mjs — generate a blind, position-balanced human-labeling packet from the committed A0/A1 responses.
// Outputs: pairs.json (blind, no arm info), key.json (hidden A0/A1 mapping), label.html (self-contained labeling app).
import fs from 'node:fs'; import path from 'node:path';
const BASE = '/Users/elon/work/fable-profile/eval/comparison/runs/2026-06-19';
const RUNS = [`${BASE}/preference-battery`, `${BASE}/preference-battery-v2`];
const BATTERIES = ['/Users/elon/work/fable-profile/eval/comparison/prompts/preference-battery.json', '/Users/elon/work/fable-profile/eval/comparison/prompts/preference-battery-v2.json'];
const OUT = '/Users/elon/work/fable-profile/eval/comparison/human-anchor';
const CAT = id => id.replace(/[0-9].*$/, '').replace(/_.*/, '').toUpperCase();

const Q = {};
for (const b of BATTERIES) { const o = JSON.parse(fs.readFileSync(b, 'utf8')); for (const [k, v] of Object.entries(o)) if (!k.startsWith('_')) Q[k] = v; }
function find(cond, id) { for (const r of RUNS) { try { const t = fs.readFileSync(path.join(r, cond, 'k1', id + '.txt'), 'utf8'); if (t && t.trim()) return t.trim(); } catch {} } return null; }

// deterministic seeded PRNG so the packet/key are reproducible
let s = 20260619; const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296); };

const ids = Object.keys(Q).filter(id => find('A0', id) && find('A1', id));
// seeded shuffle for presentation order
for (let i = ids.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0;[ids[i], ids[j]] = [ids[j], ids[i]]; }
// balanced side assignment: alternate after shuffle so exactly half put A1 on side A
const pairs = [], key = {};
ids.forEach((id, i) => {
  const a1OnA = i % 2 === 0; // balanced 50/50
  const sideA_arm = a1OnA ? 'A1' : 'A0', sideB_arm = a1OnA ? 'A0' : 'A1';
  pairs.push({ item: i + 1, id, cat: CAT(id), question: Q[id], A: find(sideA_arm, id), B: find(sideB_arm, id) });
  key[id] = { A: sideA_arm, B: sideB_arm };
});
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'pairs.json'), JSON.stringify(pairs, null, 2));
fs.writeFileSync(path.join(OUT, 'key.json'), JSON.stringify(key, null, 2));

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>fablever blind labeling</title>
<style>
 body{font:15px/1.5 -apple-system,system-ui,sans-serif;max-width:1100px;margin:0 auto;padding:16px;color:#1a1a1a}
 #q{background:#f4f6f8;border-left:4px solid #4a7;padding:12px 14px;border-radius:6px;white-space:pre-wrap;font-weight:600}
 .cols{display:flex;gap:14px;margin:14px 0}
 .col{flex:1;border:1px solid #ddd;border-radius:8px;padding:12px;min-width:0}
 .col h3{margin:.2em 0 .6em;font-size:14px;color:#555}
 pre{white-space:pre-wrap;word-wrap:break-word;font:13px/1.45 ui-monospace,Menlo,monospace;margin:0;max-height:46vh;overflow:auto}
 .ask{margin:10px 0;padding:10px;background:#fafafa;border:1px solid #eee;border-radius:8px}
 button{font:14px sans-serif;padding:8px 16px;border-radius:6px;border:1px solid #bbb;background:#fff;cursor:pointer}
 button.primary{background:#2563eb;color:#fff;border-color:#2563eb}
 button:disabled{opacity:.4;cursor:default}
 label{margin-right:14px;cursor:pointer} .bar{display:flex;justify-content:space-between;align-items:center;margin:10px 0}
 textarea{width:100%;box-sizing:border-box;height:42px} .done{text-align:center;padding:40px}
 small{color:#888}
</style></head><body>
<div class="bar"><div><b>Blind labeling</b> &nbsp;<span id="prog"></span></div>
 <div><button id="export">Export results</button></div></div>
<div id="card">
 <div id="q"></div>
 <div class="cols">
  <div class="col"><h3>Reply A</h3><pre id="A"></pre></div>
  <div class="col"><h3>Reply B</h3><pre id="B"></pre></div>
 </div>
 <div class="ask"><b>1. Which reply would you rather receive to get your work done?</b><br>
  <label><input type="radio" name="pref" value="A">A</label>
  <label><input type="radio" name="pref" value="B">B</label></div>
 <div class="ask"><b>2. Which invents details you did NOT ask for (made-up files/APIs/context)?</b><br>
  <label><input type="radio" name="fab" value="A">A</label>
  <label><input type="radio" name="fab" value="B">B</label>
  <label><input type="radio" name="fab" value="none">neither</label></div>
 <div class="ask"><b>3. (optional) note</b><br><textarea id="note"></textarea></div>
 <div class="bar"><button id="back">&larr; Back</button><button id="next" class="primary">Next &rarr;</button></div>
 <small>Your progress is saved in this browser. You can stop anytime and click "Export results".</small>
</div>
<script>
const DATA = ${JSON.stringify(pairs.map(p => ({ item: p.item, id: p.id, cat: p.cat, question: p.question, A: p.A, B: p.B })))};
const KEY='fablever_labels_v1'; let res=JSON.parse(localStorage.getItem(KEY)||'{}'); let i=0;
// resume at first unanswered
while(i<DATA.length && res[DATA[i].id] && res[DATA[i].id].pref) i++;
if(i>=DATA.length) i=DATA.length-1;
function render(){const d=DATA[i];document.getElementById('prog').textContent=\`item \${i+1} / \${DATA.length} — answered \${Object.values(res).filter(r=>r&&r.pref).length}\`;
 document.getElementById('q').textContent=d.question;document.getElementById('A').textContent=d.A;document.getElementById('B').textContent=d.B;
 const r=res[d.id]||{};
 for(const el of document.getElementsByName('pref'))el.checked=(el.value===r.pref);
 for(const el of document.getElementsByName('fab'))el.checked=(el.value===r.fab);
 document.getElementById('note').value=r.note||'';
 document.getElementById('back').disabled=(i===0);}
function save(){const d=DATA[i];const pref=[...document.getElementsByName('pref')].find(e=>e.checked);
 const fab=[...document.getElementsByName('fab')].find(e=>e.checked);
 res[d.id]={pref:pref?pref.value:null,fab:fab?fab.value:null,note:document.getElementById('note').value,cat:d.cat};
 localStorage.setItem(KEY,JSON.stringify(res));}
document.getElementById('next').onclick=()=>{save();if(i<DATA.length-1){i++;render();}else alert('Last item. Click "Export results".');};
document.getElementById('back').onclick=()=>{save();if(i>0){i--;render();}};
document.getElementById('export').onclick=()=>{save();const blob=new Blob([JSON.stringify(res,null,2)],{type:'application/json'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='human-labels.json';a.click();};
render();
</script></body></html>`;
fs.writeFileSync(path.join(OUT, 'label.html'), html);
console.log(`wrote ${pairs.length} blind pairs -> pairs.json, key.json, label.html`);
console.log(`balance check: A1-on-sideA = ${pairs.filter(p => key[p.id].A === 'A1').length}/${pairs.length}`);
