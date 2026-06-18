#!/usr/bin/env node
// fablever update-check — SessionStart hook. Tells the user (and the agent) when the installed clone is
// behind the public GitHub repo, so the agent can summarize what changed and OFFER to update (never auto).
//
// DEFAULT-ON, but trivially disabled: FABLE_UPDATE_CHECK=off (this feature) or FABLE_PROFILE=off (all hooks),
// or `node install.mjs --no-update-check` at install time.
// Network footprint: the ONLY network it triggers is, at most once/24h, a detached `git ls-remote`
// (anonymous — no credentials, no data sent, reads just the latest public commit hash). The hook itself
// only READS a cached state file. FAIL-OPEN, NON-BLOCKING: any error prints nothing and exits 0.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// locale for the VISIBLE cue only (we can't know the chat language before the user types).
function detectLang() {
  const env = (process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || '').split('.')[0].split('_')[0].toLowerCase();
  if (env) return env;
  try { return (Intl.DateTimeFormat().resolvedOptions().locale || '').split('-')[0].toLowerCase(); } catch { return ''; }
}
const CUE = {
  ko: '🆕 fablever 업데이트가 있습니다 — 무엇이 바뀌었는지 물어보면 설명해 드리고, 업데이트할지 여쭤볼게요.',
  ja: '🆕 fablever のアップデートがあります — 何が変わったか聞いてくれれば説明し、更新するか確認します。',
  zh: '🆕 fablever 有可用更新 — 问我改了什么，我会说明并询问是否更新。',
  es: '🆕 Hay una actualización de fablever — pregúntame qué cambió y te diré, y si quieres actualizar.',
  fr: '🆕 Une mise à jour de fablever est disponible — demande-moi ce qui a changé ; je t\'expliquerai et te proposerai de mettre à jour.',
  de: '🆕 Ein fablever-Update ist verfügbar — frag mich, was sich geändert hat; ich erkläre es und frage, ob du aktualisieren willst.',
  pt: '🆕 Há uma atualização do fablever — pergunte o que mudou; eu explico e pergunto se quer atualizar.',
  en: '🆕 A fablever update is available — ask me what changed and I\'ll explain, then offer to update.',
};

const q = p => (/[\s'"]/.test(p) ? JSON.stringify(p) : p);
function resolveScript(dir) {
  let homePtr = '';
  try { homePtr = fs.readFileSync(path.join(dir, 'fable-home'), 'utf8').trim(); } catch (_) {}
  const bases = [process.env.FABLE_HOME, homePtr, path.join(dir, 'runtime'), path.join(__dirname, '..', '..')].filter(Boolean);
  for (const b of bases) { const c = path.join(b, 'orchestration', 'lib', 'update-check.mjs'); try { if (fs.existsSync(c)) return c; } catch (_) {} }
  return '';
}

try {
  if ((process.env.FABLE_PROFILE || '').toLowerCase() === 'off') process.exit(0);
  if ((process.env.FABLE_UPDATE_CHECK || '').toLowerCase() === 'off') process.exit(0);

  const dir = path.join(os.homedir(), '.claude', 'fable-profile');
  const statePath = path.join(dir, 'update-check.json');
  const notifiedPath = path.join(dir, 'update-notified.json'); // hook-owned; remembers the sha we've announced
  const verPath = path.join(dir, 'installed-version.json');

  // Only run on a real start; never interrupt a resume/compact.
  try {
    const input = fs.readFileSync(0, 'utf8');
    if (input) { const src = (JSON.parse(input).source || '').toLowerCase(); if (src === 'resume' || src === 'compact') process.exit(0); }
  } catch (_) {}

  // 1) read cached state; announce only a NEW remote sha (never re-nag the same version).
  let notice = '';
  try {
    const st = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (st.update_available && st.remote_sha && st.remote_sha !== st.installed_sha) {
      let notified = '';
      try { notified = (JSON.parse(fs.readFileSync(notifiedPath, 'utf8')) || {}).remote_sha || ''; } catch (_) {}
      if (notified !== st.remote_sha) {
        let ver = {};
        try { ver = JSON.parse(fs.readFileSync(verPath, 'utf8')); } catch (_) {}
        const clone = ver.source_dir || '<your fablever clone>';
        const repo = ver.repo_url || 'https://github.com/elon-choo/fablever';
        const shortI = String(st.installed_sha).slice(0, 7), shortR = String(st.remote_sha).slice(0, 7);
        notice =
          '[fablever update available — surface this in the user\'s language; keep commands/ids verbatim]\n' +
          `A newer version of fablever is on GitHub (installed ${shortI}, latest ${shortR}). If the user is ` +
          'interested, SUMMARIZE what changed and ASK whether to update — never update silently:\n' +
          `  1) Changelog: run \`git -C ${q(clone)} fetch --quiet && git -C ${q(clone)} log --oneline ${shortI}..${shortR}\` ` +
          `(if the local clone is gone, read ${repo}/compare/${shortI}...${shortR} instead) and explain the notable ` +
          'changes briefly, in the user\'s language.\n' +
          `  2) Ask "Update now?" Only on a yes, run \`git -C ${q(clone)} pull --ff-only && node ${q(path.join(clone, 'install.mjs'))}\` ` +
          'and then tell them to RESTART Claude Code (or /clear).\n' +
          '  3) If they decline, leave it — this notice will not repeat for this version.\n' +
          'Shown once per new version.';
        try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(notifiedPath, JSON.stringify({ remote_sha: st.remote_sha })); } catch (_) {}
      }
    }
  } catch (_) { /* no state yet -> nothing to announce */ }

  // 2) best-effort: trigger the daily-rate-limited anonymous remote check in a DETACHED child (never blocks).
  try {
    const script = resolveScript(dir);
    if (script) { const c = spawn(process.execPath, [script, 'check'], { detached: true, stdio: 'ignore' }); c.unref(); }
  } catch (_) { /* refresh is best-effort */ }

  if (notice) {
    process.stdout.write(JSON.stringify({
      systemMessage: CUE[detectLang()] || CUE.en,
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: notice },
    }));
  }
  process.exit(0);
} catch (_) {
  process.exit(0); // fail-open
}
