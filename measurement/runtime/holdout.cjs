'use strict';
// measurement/runtime/holdout.cjs — the shared "is this session in the untreated arm?" guard.
//
// During a measurement campaign the injector hooks (fable-session / fable-subagent / fable-reinject) must
// SUPPRESS themselves for the 'off' arm, so those sessions run as an honest baseline. Codex fires same-event
// hooks concurrently, so the injectors cannot read an arm-marker another hook wrote — instead every hook
// calls this, which derives the arm from the SAME HMAC(salt, campaign\0session) as codex-measure.js. So the
// logger's arm tag and the injector's suppression always agree, with no race.
//
// Fail-open toward INJECTING: any uncertainty (no campaign env, no salt yet, no session id, any error) returns
// false → the hook injects normally. We never suppress fablever on a guess. Zero deps beyond ./assign.cjs.
const fs = require('fs');
const path = require('path');
const { assignArm } = require('./assign.cjs');

const onish = v => /^(on|1|true|yes)$/i.test(String(v || ''));

function holdoutOff(opts) {
  try {
    const env = (opts && opts.env) || process.env;
    if (!onish(env.FABLE_MEASURE)) return false;
    if (String(env.FABLE_PROFILE || '').toLowerCase() === 'off') return false;
    const home = env.FABLE_MEASURE_HOME;
    const campaign = env.FABLE_MEASURE_CAMPAIGN;
    const sessionId = String((opts && opts.sessionId) || '').trim();
    if (!home || !campaign || !sessionId) return false;
    let salt;
    try { salt = fs.readFileSync(path.join(home, 'measurement-salt')); } catch (_) { return false; }
    return assignArm({ campaignId: campaign, sessionId, salt, offPercent: Number(env.FABLE_MEASURE_OFF_PCT || 50) }) === 'off';
  } catch (_) {
    return false;
  }
}

module.exports = { holdoutOff };
