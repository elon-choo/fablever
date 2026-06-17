#!/usr/bin/env node
// fablever SessionStart hook — surfaces a notice when a newer, not-yet-validated verification
// model has been detected (read from a cached state file). FAIL-OPEN and NON-BLOCKING: any error,
// or no candidates, prints nothing and exits 0.
// DEFAULT = NO NETWORK, NO CREDENTIAL READ: the hook only READS a cached state file (ZERO chat
// tokens, no key access). The model-LIST refresh — which inspects OPENAI_API_KEY/GEMINI_API_KEY/
// GOOGLE_API_KEY and queries provider model-list endpoints — is OPT-IN via FABLE_MODELCHECK_REFRESH=on;
// without it, refresh only happens when you run `npm run model:check` yourself.
// Disable the whole hook with FABLE_MODELCHECK=off or FABLE_PROFILE=off.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

try {
  if ((process.env.FABLE_PROFILE || '').toLowerCase() === 'off') process.exit(0);
  if ((process.env.FABLE_MODELCHECK || '').toLowerCase() === 'off') process.exit(0);

  const home = os.homedir();
  const baseDir = path.join(home, '.claude', 'fable-profile');
  const statePath = path.join(baseDir, 'model-check.json');
  const notifiedPath = path.join(baseDir, 'model-notified.json'); // hook-owned; refresh child never touches it

  // Resolve the ABSOLUTE model-freshness.mjs path (used for both the displayed command and the spawn),
  // so the "to adopt" command the user sees actually runs from their cwd.
  const candidatesFor = [
    process.env.FABLE_HOME && path.join(process.env.FABLE_HOME, 'orchestration/lib/model-freshness.mjs'),
    path.join(baseDir, 'runtime/orchestration/lib/model-freshness.mjs'),
    path.join(__dirname, '../../orchestration/lib/model-freshness.mjs'),
  ].filter(Boolean);
  const script = candidatesFor.find(p => { try { return fs.existsSync(p); } catch { return false; } });
  const adoptCmd = (script ? `node ${/[\s'"]/.test(script) ? JSON.stringify(script) : script}` : 'node <fablever>/orchestration/lib/model-freshness.mjs') + ' adopt <role> <id>';

  // 1) notice for NEW candidates only — never re-nag the same model every session.
  let notice = '';
  try {
    const st = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const cands = (st.candidates || []).filter(Boolean);
    let notified = [];
    try { notified = JSON.parse(fs.readFileSync(notifiedPath, 'utf8')) || []; } catch (_) {}
    const seen = new Set(notified.map(String));
    const fresh = cands.filter(c => !seen.has(`${c.role}:${c.candidate}`));
    if (fresh.length) {
      const lines = fresh.map(c => `  • ${c.candidate} (newer than pinned ${c.current} for role ${c.role})`).join('\n');
      notice = `[fablever — if you surface this to the user, do it in their language; keep commands/ids verbatim]\n` +
        `A newer verification model may be available:\n${lines}\n` +
        `It is NOT in use yet — adoption is eval-gated to protect reproducibility. To validate & adopt:\n` +
        `  ${adoptCmd}\n` +
        `(See orchestration/MODELS.md. Published whitepaper numbers keep their original models.) Shown once per model.`;
      // record so the same candidate never re-fires (the refresh child rewrites model-check.json, not this file)
      try { fs.mkdirSync(baseDir, { recursive: true }); fs.writeFileSync(notifiedPath, JSON.stringify([...seen, ...fresh.map(c => `${c.role}:${c.candidate}`)])); } catch (_) {}
    }
  } catch (_) { /* no state yet -> no notice */ }

  // 2) OPT-IN refresh: trigger the daily-rate-limited model-LIST refresh in a DETACHED child.
  //    GATED behind FABLE_MODELCHECK_REFRESH=on so the DEFAULT install makes NO network call and
  //    NO credential read — the refresh (model-freshness.mjs) inspects API keys and queries provider
  //    model-list endpoints, which would otherwise contradict the "default hooks: no network, no
  //    credential reads" guarantee. Without the opt-in, run `npm run model:check` manually.
  try {
    const refreshOn = ['on', '1', 'true'].includes((process.env.FABLE_MODELCHECK_REFRESH || '').toLowerCase());
    if (refreshOn && script) {
      const child = spawn(process.execPath, [script, 'check'], { detached: true, stdio: 'ignore' });
      child.unref();
    }
  } catch (_) { /* refresh is best-effort */ }

  // 3) emit the notice as SessionStart additionalContext (only if there is one)
  if (notice) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: notice },
    }));
  }
  process.exit(0);
} catch (_) {
  process.exit(0); // fail-open
}
