#!/usr/bin/env node
'use strict';
/*
 * fable-subagent.js — SubagentStart hook. Injects the Fable working style into EVERY spawned subagent
 * (foreground, background/run_in_background, and workflow agents) — the agents that the main session's
 * output style and the UserPromptSubmit hook do NOT reach (subagents run with their own system prompt).
 *
 * Mechanism: SubagentStart fires when a subagent spawns; returning hookSpecificOutput.additionalContext
 * adds that text to the subagent's context. We inject the COMPACT reminder once at spawn (one-time cost,
 * no per-turn tax). Emitted as JSON (Node handles the escaping) so there is no jq/bash dependency.
 *
 * Disable: export FABLE_PROFILE=off   (or)   touch ~/.claude/fable-profile/OFF
 * Recipe-verifier exemption (default OFF): export FABLE_VERIFIER_HOOK_EXEMPTION=on
 * Fail-safe: ALWAYS exits 0 and emits nothing on any error, so it can never block a subagent from starting.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const VERIFIER_EXEMPTION_FLAG = 'FABLE_VERIFIER_HOOK_EXEMPTION';

function hmacSessionKey(sid, measureDir) {
  let salt;
  try { salt = fs.readFileSync(path.join(measureDir, 'measurement-salt')); } catch { return ''; }
  const digest = crypto.createHmac('sha256', salt).update(String(sid || '')).digest('hex');
  return `s_${digest.slice(0, 24)}`;
}

function verifierExemptionEnabled() {
  return ['on', '1', 'true'].includes((process.env[VERIFIER_EXEMPTION_FLAG] || '').trim().toLowerCase());
}

function readReadonlyVerifierType(profileDir) {
  const candidates = [
    process.env.FABLE_HOME && path.join(process.env.FABLE_HOME, 'orchestration', 'lib', 'readonly-verifiers.mjs'),
    process.env.FABLE_PROFILE_HOME && path.join(process.env.FABLE_PROFILE_HOME, 'runtime', 'orchestration', 'lib', 'readonly-verifiers.mjs'),
    path.join(profileDir, 'runtime', 'orchestration', 'lib', 'readonly-verifiers.mjs'),
    path.join(__dirname, '..', '..', 'orchestration', 'lib', 'readonly-verifiers.mjs'),
  ].filter(Boolean);
  for (const file of candidates) {
    try {
      const source = fs.readFileSync(file, 'utf8');
      const match = source.match(/^\s*export const READ_ONLY_AGENT_TYPE\s*=\s*(['"])([^'"\r\n]+)\1\s*;?/m);
      if (match && match[2]) return match[2];
    } catch (_) { /* try next source; missing/unreadable registry must fail open */ }
  }
  return '';
}

try {
  if (process.env.FABLE_PROFILE === 'off') process.exit(0);
  const dir = path.join(process.env.HOME || os.homedir(), '.claude', 'fable-profile');
  if (fs.existsSync(path.join(dir, 'OFF'))) process.exit(0);

  // Orchestration workers must NOT receive the restraint governor — it tells skeptics to
  // stop early / under-validate, which is backwards for fan-out and verification depth.
  // Read the SubagentStart event and skip injection for orchestration agentTypes.
  // Fail-open: any error (or no stdin) -> fall through and inject as before; never blocks.
  try {
    if (!process.stdin.isTTY) {
      const raw = fs.readFileSync(0, 'utf8');
      if (raw) {
        const ev = JSON.parse(raw);
        // holdout suppression (OPT-IN measurement only; inert unless FABLE_MEASURE=on): off-arm sessions
        // run untreated, so their subagents get no injection either. Default: no-op.
        const measure = (process.env.FABLE_MEASURE || '').toLowerCase();
        if (measure === 'on' || measure === '1' || measure === 'true') {
          const sid = String(ev.session_id || ev.sessionId || '').replace(/[^A-Za-z0-9_-]/g, '_');
          if (sid && fs.existsSync(path.join(dir, 'holdout', sid + '.off'))) process.exit(0);
          const measureDir = process.env.FABLE_MEASURE_HOME || dir;
          const sessionKey = hmacSessionKey(String(ev.session_id || ev.sessionId || '').trim(), measureDir);
          if (sessionKey && fs.existsSync(path.join(measureDir, 'holdout', sessionKey + '.off'))) process.exit(0);
        }
        const t = ev.subagent_type || ev.agentType || ev.subagentType ||
          (ev.hookSpecificOutput && ev.hookSpecificOutput.subagentType) || '';
        // G2.3 opt-in only: recipe advisory roles share READ_ONLY_AGENT_TYPE from the
        // shipped registry. Exact-match it; any registry/parse error falls through to
        // the v1.3.0 injection path. Flag unset/off performs no registry read.
        const verifierEventType = ev.agent_type || t;
        if (verifierEventType && verifierExemptionEnabled()) {
          const readonlyVerifierType = readReadonlyVerifierType(dir);
          if (readonlyVerifierType && verifierEventType === readonlyVerifierType) {
            try { process.stderr.write('[fable-subagent] exempting recipe verifier from restraint payload: ' + verifierEventType + '\n'); } catch (_) {}
            process.exit(0);
          }
        }
        // Exact-match the calibrated orchestration agent types (incl. CC's built-in Explore/Plan).
        const EXEMPT = new Set(['red-team-validator', 'evidence-verifier', 'purple-team-arbiter', 'Explore', 'Plan']);
        // Word-anchored match for orchestration ROLE names only. The broad substrings 'verif' and
        // 'search' were REMOVED (H3/SEC-3): they silently stripped the profile from ordinary user
        // agents (doc-search, fact-verifier, config-verify). Anchored tokens won't collide.
        const EXEMPT_RE = /(^|[-_ ])(skeptic|refuters?|refute|diverge\w*|orchestrat\w*|adversar\w*)([-_ ]|$)/i;
        if (t && (EXEMPT.has(t) || EXEMPT_RE.test(t))) {
          try { process.stderr.write('[fable-subagent] exempting orchestration agentType from restraint payload: ' + t + '\n'); } catch (_) {}
          process.exit(0); // no restraint for orchestration workers
        }
      }
    }
  } catch (_) { /* fall through: inject as before */ }

  // Inject the compact reminder (fuller than core, but still ~1 paragraph) once per subagent.
  let text = '';
  for (const variant of ['compact', 'core']) {
    try {
      const t = fs.readFileSync(path.join(dir, variant + '.md'), 'utf8').trim();
      if (t) { text = t; break; }
    } catch (_) { /* try next */ }
  }
  if (!text) process.exit(0);

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: text },
  }));
} catch (_) {
  // never block a subagent spawn
}
process.exit(0);
