#!/usr/bin/env node
'use strict';
/*
 * fable-subagent.js — Codex CLI SubagentStart hook. Injects the COMPACT fablever reminder into every
 * spawned subagent (the agents the session-level AGENTS.md layer does not reach, since a subagent runs with
 * its own context). Codex passes the subagent's role as `agent_type`; we also read the Claude-Code keys
 * (subagent_type / agentType / subagentType) so one hook body works under either host.
 *
 * Orchestration / skeptic / verifier roles are EXEMPT: the restraint governor tells an agent to stop early
 * and under-validate, which is backwards for fan-out and adversarial verification depth. Those agents get
 * no injection.
 *
 * Zero dependencies. FAIL-OPEN: any error → exit 0, no stdout. Disable with FABLE_PROFILE=off (or touch
 * <profile-home>/OFF). Profile-home resolution: FABLE_PROFILE_HOME → FABLE_HOME/.. → <hookdir>/../fable-profile.
 */
const fs = require('fs');
const path = require('path');

const COMPACT_FALLBACK =
  'Fable working style (Codex): act when you have enough — recommend, don\'t survey; lead with the outcome; ' +
  'don\'t over-build; respect the exact scope asked; ground every done/works/fixed claim in a tool/file/test ' +
  'result on the same line, else say "not verified"; stop only when truly blocked, don\'t end on a promise; ' +
  'no filler. Use proportionality when rules collide: safety, explicit user/project instructions, approval ' +
  'prompts, and destructive-action confirmation outrank decisiveness; format/length caps apply only to prose ' +
  'and never cut the P5 evidence check or P7 decision trail; preambles/progress notes stay silent for ' +
  'single-step work; early-stop limits search breadth, not grounding depth; verification scales with blast radius.';

function profileHomes() {
  const homes = [];
  if (process.env.FABLE_PROFILE_HOME) homes.push(process.env.FABLE_PROFILE_HOME);
  if (process.env.FABLE_HOME) homes.push(path.join(process.env.FABLE_HOME, '..'));
  homes.push(path.join(__dirname, '..', 'fable-profile'));
  return homes;
}
function readProfile(variant) {
  for (const home of profileHomes()) {
    for (const rel of [variant + '.md', path.join('runtime', 'profiles', variant + '.md')]) {
      try { const t = fs.readFileSync(path.join(home, rel), 'utf8').trim(); if (t) return t; } catch (_) {}
    }
  }
  return '';
}
function isOff() {
  if ((process.env.FABLE_PROFILE || '').toLowerCase() === 'off') return true;
  for (const home of profileHomes()) { try { if (fs.existsSync(path.join(home, 'OFF'))) return true; } catch (_) {} }
  return false;
}

// Measurement holdout: an 'off'-arm session suppresses injection (subagents inherit the session's arm).
// Resolved from runtime/repo; fail-open (any error → false → inject normally).
function isHoldoutOff(sessionId) {
  if (!sessionId) return false;
  const cands = [];
  if (process.env.FABLE_HOME) cands.push(path.join(process.env.FABLE_HOME, 'measurement', 'runtime', 'holdout.cjs'));
  cands.push(path.join(__dirname, '..', '..', 'measurement', 'runtime', 'holdout.cjs'));
  cands.push(path.join(__dirname, '..', 'fable-profile', 'runtime', 'measurement', 'runtime', 'holdout.cjs'));
  for (const c of cands) { try { return require(c).holdoutOff({ env: process.env, sessionId }); } catch (_) {} }
  return false;
}

// Opt-in, ZERO-CONTENT trust trace (see fable-session.js) — proves Codex actually ran this hook.
function traceHook(name) {
  const f = process.env.FABLE_HOOK_TRACE_FILE;
  if (!f) return;
  try { fs.appendFileSync(f, JSON.stringify({ hook: name, ts: Date.now() }) + '\n'); } catch (_) {}
}

try {
  traceHook('fable-subagent');
  if (isOff()) process.exit(0);

  // Read the SubagentStart event and skip injection for orchestration agent types. Fail-open: no stdin or
  // any parse error → fall through and inject (the safe default for an ordinary user subagent).
  try {
    if (!process.stdin.isTTY) {
      const raw = fs.readFileSync(0, 'utf8');
      if (raw) {
        const ev = JSON.parse(raw);
        if (isHoldoutOff(String(ev.session_id || ev.sessionId || '').trim())) process.exit(0); // off-arm baseline
        const t = ev.agent_type || ev.subagent_type || ev.agentType || ev.subagentType ||
          (ev.hookSpecificOutput && ev.hookSpecificOutput.subagentType) || '';
        // Exact-match calibrated orchestration roles (incl. Claude's built-in Explore/Plan), plus an
        // anchored pattern for skeptic/refute/diverge/orchestrate/adversarial role names.
        const EXEMPT = new Set(['red-team-validator', 'evidence-verifier', 'purple-team-arbiter', 'Explore', 'Plan']);
        const EXEMPT_RE = /(^|[-_ ])(skeptic|refuters?|refute|diverge\w*|orchestrat\w*|adversar\w*)([-_ ]|$)/i;
        if (t && (EXEMPT.has(t) || EXEMPT_RE.test(t))) {
          try { process.stderr.write('[fable-subagent] exempting orchestration agentType from restraint payload: ' + t + '\n'); } catch (_) {}
          process.exit(0);
        }
      }
    }
  } catch (_) { /* fall through: inject */ }

  const text = readProfile('compact') || readProfile('core') || COMPACT_FALLBACK;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: text },
  }));
} catch (_) {
  // never block a subagent spawn
}
process.exit(0);
