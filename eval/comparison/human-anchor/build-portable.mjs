// build-portable.mjs — emit a SINGLE self-contained label-portable.html that scores ITSELF in the browser.
// For convenience self/peer labeling on any computer (no node, no repo, no network). The answer key is embedded
// base64-obfuscated and only decoded at "결과 보기" (after labeling). For a publication-grade fully-blind test with
// strangers, use label.html + the separately-held key.json instead (see README).
import fs from 'node:fs'; import path from 'node:path';
const HERE = '/Users/elon/work/fable-profile/eval/comparison/human-anchor';
const PAIRS = process.env.PAIRS || path.join(HERE, 'pairs.json');
const OUTHTML = process.env.OUTHTML || 'label-portable.html';
const pairs = JSON.parse(fs.readFileSync(PAIRS, 'utf8'));
const key = JSON.parse(fs.readFileSync(path.join(HERE, 'key.json'), 'utf8'));
const keyB64 = Buffer.from(JSON.stringify(key), 'utf8').toString('base64');
const DATA = pairs.map(p => ({ item: p.item, id: p.id, cat: p.cat, question: p.question, A: p.A, B: p.B }));

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>fablever 블라인드 평가</title>
<style>
 body{font:15px/1.6 -apple-system,system-ui,"Apple SD Gothic Neo",sans-serif;max-width:1120px;margin:0 auto;padding:16px;color:#1a1a1a}
 #q{background:#f4f6f8;border-left:4px solid #4a7;padding:12px 14px;border-radius:6px;white-space:pre-wrap;font-weight:600}
 .cols{display:flex;gap:14px;margin:14px 0}
 .col{flex:1;border:1px solid #ddd;border-radius:8px;padding:12px;min-width:0}
 .col h3{margin:.2em 0 .6em;font-size:14px;color:#555}
 pre{white-space:pre-wrap;word-wrap:break-word;font:13px/1.5 ui-monospace,Menlo,"D2Coding",monospace;margin:0;max-height:46vh;overflow:auto}
 .ask{margin:10px 0;padding:10px;background:#fafafa;border:1px solid #eee;border-radius:8px}
 button{font:14px sans-serif;padding:8px 16px;border-radius:6px;border:1px solid #bbb;background:#fff;cursor:pointer}
 button.primary{background:#2563eb;color:#fff;border-color:#2563eb}
 button:disabled{opacity:.4;cursor:default}
 label{margin-right:16px;cursor:pointer} .bar{display:flex;justify-content:space-between;align-items:center;margin:10px 0;gap:8px}
 textarea{width:100%;box-sizing:border-box;height:42px} small{color:#888}
 #results{display:none;background:#f0f7ff;border:1px solid #cfe0f5;border-radius:8px;padding:16px;margin-top:14px}
 table{border-collapse:collapse;margin:8px 0} td,th{border:1px solid #d4d4d4;padding:4px 10px;text-align:left}
 .big{font-size:22px;font-weight:700;color:#1d4ed8}
</style></head><body>
<div class="bar"><div><b>fablever 블라인드 평가</b> &nbsp;<span id="prog"></span></div>
 <div><button id="results-btn">결과 보기</button> <button id="export">원시라벨 저장</button></div></div>
<div id="card">
 <div id="q"></div>
 <div class="cols">
  <div class="col"><h3>답변 A</h3><pre id="A"></pre></div>
  <div class="col"><h3>답변 B</h3><pre id="B"></pre></div>
 </div>
 <div class="ask"><b>1. 일을 처리하는 데 어느 답변을 받고 싶나요?</b><br>
  <label><input type="radio" name="pref" value="A"> A</label>
  <label><input type="radio" name="pref" value="B"> B</label></div>
 <div class="ask"><b>2. 묻지도 않은 내용(없는 파일/API/맥락)을 더 지어낸 쪽은?</b><br>
  <label><input type="radio" name="fab" value="A"> A</label>
  <label><input type="radio" name="fab" value="B"> B</label>
  <label><input type="radio" name="fab" value="none"> 없음/비슷</label></div>
 <div class="ask"><b>3. (선택) 메모</b><br><textarea id="note"></textarea></div>
 <div class="bar"><button id="back">&larr; 이전</button><button id="next" class="primary">다음 &rarr;</button></div>
 <small>진행상황은 이 브라우저에 자동 저장됩니다. 언제든 멈췄다 다시 열어 이어서 할 수 있고, "결과 보기"로 즉시 채점됩니다.</small>
</div>
<div id="results"></div>
<script>
const DATA = ${JSON.stringify(DATA)};
const KEYB64 = "${keyB64}";
const SK='fablever_labels_portable_v1'; let res=JSON.parse(localStorage.getItem(SK)||'{}'); let i=0;
while(i<DATA.length && res[DATA[i].id] && res[DATA[i].id].pref) i++; if(i>=DATA.length) i=DATA.length-1;
function ans(){return Object.values(res).filter(r=>r&&r.pref).length;}
function render(){const d=DATA[i];document.getElementById('prog').textContent=\`\${i+1} / \${DATA.length}번 — 응답 \${ans()}개\`;
 document.getElementById('q').textContent=d.question;document.getElementById('A').textContent=d.A;document.getElementById('B').textContent=d.B;
 const r=res[d.id]||{};
 for(const el of document.getElementsByName('pref'))el.checked=(el.value===r.pref);
 for(const el of document.getElementsByName('fab'))el.checked=(el.value===r.fab);
 document.getElementById('note').value=r.note||'';document.getElementById('back').disabled=(i===0);
 window.scrollTo(0,0);}
function save(){const d=DATA[i];const pref=[...document.getElementsByName('pref')].find(e=>e.checked);
 const fab=[...document.getElementsByName('fab')].find(e=>e.checked);
 res[d.id]={pref:pref?pref.value:null,fab:fab?fab.value:null,note:document.getElementById('note').value,cat:d.cat};
 localStorage.setItem(SK,JSON.stringify(res));}
document.getElementById('next').onclick=()=>{save();if(i<DATA.length-1){i++;render();}else{alert('마지막 문항입니다. "결과 보기"를 누르세요.');}};
document.getElementById('back').onclick=()=>{save();if(i>0){i--;render();}};
document.getElementById('export').onclick=()=>{save();const b=new Blob([JSON.stringify(res,null,2)],{type:'application/json'});
 const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='human-labels.json';a.click();};
function logC(n,k){let s=0;for(let j=1;j<=k;j++)s+=Math.log(n-k+j)-Math.log(j);return s;}
function binGE(k,n){let s=0;for(let j=k;j<=n;j++)s+=Math.exp(logC(n,j)+n*Math.log(0.5));return s;}
function bin2(k,n){return n?Math.min(1,k>=n/2?2*binGE(k,n):2*(1-binGE(k+1,n))):1;}
document.getElementById('results-btn').onclick=()=>{save();const key=JSON.parse(atob(KEYB64));
 const rows=[];for(const [id,r] of Object.entries(res)){if(!r||!r.pref||!key[id])continue;
  rows.push({cat:r.cat,pref:key[id][r.pref],fab:(r.fab&&r.fab!=='none')?key[id][r.fab]:'none'});}
 const n=rows.length,a1=rows.filter(r=>r.pref==='A1').length,p=bin2(a1,n);
 const fA0=rows.filter(r=>r.fab==='A0').length,fA1=rows.filter(r=>r.fab==='A1').length,fN=rows.filter(r=>r.fab==='none').length;
 let cat='';for(const c of ['ACT','DEC','DBG','PLN','EXP','REV']){const cr=rows.filter(r=>r.cat===c);if(cr.length)cat+=\`<tr><td>\${c}</td><td>\${cr.filter(r=>r.pref==='A1').length}/\${cr.length} = \${Math.round(100*cr.filter(r=>r.pref==='A1').length/cr.length)}%</td></tr>\`;}
 const R=document.getElementById('results');
 R.style.display='block';
 R.innerHTML=\`<h2>채점 결과 (응답 \${n}개)</h2>
  <p class="big">fablever(A1) 선호: \${a1}/\${n} = \${n?Math.round(100*a1/n):'-'}%</p>
  <p>이항검정 p = \${p.toFixed(4)} — \${p<=0.05?'<b>통계적으로 유의 (p≤0.05)</b>':'유의하지 않음 (표본 더 필요)'}</p>
  <p>지어냄(없는 내용 발명): 순정쪽(A0) \${fA0} · fablever쪽(A1) \${fA1} · 없음 \${fN} \${fA1?\`(A0/A1 = \${(fA0/fA1).toFixed(1)}배)\`:''}</p>
  <h3>카테고리별 fablever 선호율</h3><table><tr><th>분류</th><th>선호율</th></tr>\${cat}</table>
  <p><button id="exp2">채점결과 저장(human-score.json)</button></p>
  <small>A0 = 순정 Opus, A1 = fablever. 이 파일은 채점키를 내장해 자체 채점합니다(본인·지인 평가용). 제3자 완전블라인드 검증은 repo의 분리된 키를 쓰세요.</small>\`;
 R.scrollIntoView();
 document.getElementById('exp2').onclick=()=>{const out={n,a1,winrate:n?a1/n:null,p,fab:{A0:fA0,A1:fA1,none:fN}};
  const b=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='human-score.json';a.click();};
};
render();
</script></body></html>`;
fs.writeFileSync(path.join(HERE, OUTHTML), html);
console.log(`wrote ${OUTHTML} (${(html.length/1024).toFixed(0)} KB, ${DATA.length} items, self-scoring) from ${path.basename(PAIRS)}`);
