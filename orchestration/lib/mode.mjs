// fablever execution-mode resolver — decides whether a verification task runs the heavy
// cross-model / panel path (ULTRA) or the cheap prompt-matched single agent (A2).
// Zero dependencies. Precedence: env FABLE_ULTRA > ~/.claude/fable-profile/mode.json > default 'auto'.
//
//   FABLE_ULTRA=on    -> always heavy
//   FABLE_ULTRA=off   -> always cheap
//   FABLE_ULTRA=auto  -> heuristic: heavy ONLY when stakes signals are present; cheap otherwise
//                        (default-cheap, so easy tasks never silently burn cost — see whitepaper §4.4)
//
// The 'auto' gate is an honest heuristic (keyword/size based), NOT a guarantee. on/off always override.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CONFIG = path.join(os.homedir(), '.claude', 'fable-profile', 'mode.json');
const VALID = new Set(['auto', 'on', 'off']);

// Stakes signals that justify the expensive path. English + Korean.
const STAKES = /\b(secur\w*|auth\w*|password|secret|token|credential|crypto\w*|payment|billing|money|financ\w*|migrat\w*|release|deploy\w*|production|irreversible|destructive|delete|drop\s+table|audit|thorough|exhaustive|critical|vulnerab\w*|exploit|injection|race\s*condition|concurrenc\w*)\b/i;
const STAKES_KO = /(보안|인증|암호|비밀번호|비밀키|자격증명|결제|청구|금융|돈|마이그레이션|배포|릴리스|프로덕션|운영|되돌릴\s*수\s*없|파괴적|삭제|감사|철저|꼼꼼|중요|취약|익스플로잇|인젝션|경쟁\s*상태|동시성)/;

export function resolveMode() {
  const env = (process.env.FABLE_ULTRA || '').trim().toLowerCase();
  if (VALID.has(env)) return env;
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
    const v = (cfg.ultra || '').trim().toLowerCase();
    if (VALID.has(v)) return v;
  } catch { /* no config -> default */ }
  return 'auto';
}

// decide({ text, artifactCount, artifactBytes, highStakes }) -> { mode, heavy, reason }
export function decide(signals = {}) {
  const mode = resolveMode();
  if (mode === 'on') return { mode, heavy: true, reason: 'FABLE_ULTRA=on (forced heavy)' };
  if (mode === 'off') return { mode, heavy: false, reason: 'FABLE_ULTRA=off (forced cheap)' };
  // auto
  const text = String(signals.text || '');
  if (signals.highStakes === true) return { mode, heavy: true, reason: 'auto: caller flagged highStakes' };
  if (STAKES.test(text) || STAKES_KO.test(text)) {
    const m = (text.match(STAKES) || text.match(STAKES_KO) || [])[0];
    return { mode, heavy: true, reason: `auto: stakes signal "${m}" in task` };
  }
  if (Number(signals.artifactCount) >= 5) return { mode, heavy: true, reason: `auto: ${signals.artifactCount} artifacts (broad surface)` };
  if (Number(signals.artifactBytes) >= 50000) return { mode, heavy: true, reason: `auto: large artifact (${signals.artifactBytes} bytes)` };
  return { mode, heavy: false, reason: 'auto: no stakes signal -> cheap single-agent (A2)' };
}

// CLI self-test: `node mode.mjs "review the auth token refresh logic"` -> prints the decision.
if (import.meta.url === `file://${process.argv[1]}`) {
  const text = process.argv.slice(2).join(' ');
  if (text === '--selftest') {
    const cases = [
      { in: { text: 'fix a typo in the README' }, wantHeavyAuto: false },
      { in: { text: 'audit the payment authorization flow for vulnerabilities' }, wantHeavyAuto: true },
      { in: { text: '결제 인증 로직을 철저히 검증해줘' }, wantHeavyAuto: true },
      { in: { text: 'rename a local variable' }, wantHeavyAuto: false },
      { in: { artifactCount: 8, text: 'review these' }, wantHeavyAuto: true },
    ];
    let pass = 0;
    for (const c of cases) {
      const d = decide(c.in);
      // self-test only meaningful in auto mode; report regardless
      const ok = (resolveMode() !== 'auto') || (d.heavy === c.wantHeavyAuto);
      if (ok) pass++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  heavy=${d.heavy}  ${d.reason}  <- ${JSON.stringify(c.in)}`);
    }
    console.log(`mode=${resolveMode()}  ${pass}/${cases.length} ${pass === cases.length ? 'OK' : 'CHECK'}`);
    process.exit(pass === cases.length ? 0 : 1);
  }
  console.log(JSON.stringify(decide({ text }), null, 2));
}
