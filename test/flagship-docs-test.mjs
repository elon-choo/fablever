// flagship-docs-test.mjs — G3.7 honest-docs gate for the verified-completion loop.
// (1) the flagship doc passes the G0.5 magnitude-claim lint (no unmeasured effect-size claim);
// (2) each disproven form (N2/N5/N6/N9) has an explicit boundary paragraph saying why this loop avoids it;
// (3) the ceiling language ("closer to Fable, never equal") is present. Zero network. Exit 0 = all pass.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(REPO, 'docs', 'VERIFIED-LOOP.md');
const LINT = path.join(REPO, 'eval', 'opus-claim-lint', 'run.mjs');

let ok = 0, n = 0;
const t = (cond, msg) => { n++; if (cond) { ok++; console.log('PASS:', msg); } else console.log('FAIL:', msg); };

t(existsSync(DOC), 'flagship doc docs/VERIFIED-LOOP.md exists');
const text = existsSync(DOC) ? readFileSync(DOC, 'utf8') : '';

// (1) G0.5 magnitude-claim lint must pass on the doc.
const lint = spawnSync(process.execPath, [LINT, DOC], { encoding: 'utf8' });
t(lint.status === 0, 'G0.5 claim-lint passes on the flagship doc (no unmeasured magnitude claim)');

// (2) each disproven form has an explicit boundary paragraph naming it AND explaining the avoidance.
const boundaries = {
  N2: /N2\b[\s\S]{0,400}?(500-iteration|bounded|hard cap|halt)/i,
  N5: /N5\b[\s\S]{0,400}?(second[-\s]?pass rewrite|baked in|first action)/i,
  N6: /N6\b[\s\S]{0,400}?(generation-round|repair[-\s]?only|repair pass)/i,
  N9: /N9\b[\s\S]{0,400}?(judge|preference|executable check FAIL)/i,
};
for (const [key, re] of Object.entries(boundaries)) {
  t(re.test(text), `boundary paragraph for ${key} is present and explains why this loop avoids it`);
}

// (3) honest ceiling language + explicit "no magnitude asserted".
t(/closer to Fable, never equal/i.test(text), 'ceiling language "closer to Fable, never equal" is present');
t(/no (effect-size|magnitude)[\s\S]{0,80}(claim|assert)/i.test(text) || /no magnitude is asserted/i.test(text), 'doc explicitly states no magnitude is asserted (A/B pending)');
t(/prompt-matched solo/i.test(text), 'doc frames the A/B against the prompt-matched solo control (not plain-opus alone)');

console.log(`\n${ok}/${n} checks passed`);
process.exit(ok === n ? 0 : 1);
