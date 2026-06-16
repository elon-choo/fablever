#!/usr/bin/env node
// fablever SessionStart hook — surfaces a notice when a newer, not-yet-validated verification
// model has been detected, and triggers the (daily-rate-limited) refresh in the background.
// FAIL-OPEN and NON-BLOCKING: any error, or no candidates, prints nothing and exits 0.
// Token cost per chat = ZERO: this reads a cached state file; the actual model-LIST call runs
// at most once / 24h in a detached child. Disable with FABLE_MODELCHECK=off or FABLE_PROFILE=off.
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

  // 2) best-effort: trigger the daily-rate-limited refresh in a DETACHED child (never blocks).
  try {
    if (script) {
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
