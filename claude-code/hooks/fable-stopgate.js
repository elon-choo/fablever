#!/usr/bin/env node
'use strict';
/*
 * fable-stopgate.js — OPT-IN Stop hook that COMPILES fablever's proven unsupported-done-claim rule into
 * deterministic enforcement. The `fable_lint` MCP tool already catches "fixed/works/done/verified" claims
 * that show no check — but a tool only fires if the model chooses to call it, and a strong model rarely
 * does (measured: ~1/60 self-invocations under codex exec). This hook makes the SAME deterministic rule
 * fire automatically when the turn ends, closing fablever's one measured cost (style-only ablation: more
 * unsupported "it works" claims, 8.3% vs plain's 2.1% — eval/style-only-ablation/). The rule is a wording
 * proxy, not proof the work is done; it just refuses to let an UNgrounded completion claim stand silently.
 *
 * Contract (Claude Code Stop hook): reads a JSON event on stdin ({ transcript_path, stop_hook_active, ... }).
 * If the last assistant message asserts completion without an evidence token AND without a "not verified"
 * marker, it returns {"decision":"block","reason":"…"} so the model revises ONCE. It NEVER loops: when
 * Claude is already continuing from this hook (stop_hook_active=true) it allows the stop. It NEVER traps the
 * user: any missing/parse/transcript error fails OPEN (exit 0, allow stop). Kill switch: FABLE_STOP_GATE=off
 * or FABLE_PROFILE=off. Zero dependencies (Node built-ins only); reads only the local transcript, writes
 * nothing, no network.
 *
 * The three regexes below are BYTE-IDENTICAL to the live fable_lint rule (mcp/src/server.js); a test asserts
 * that equality so the enforcement can never silently drift from the validated, regression-tested rule.
 */
const fs = require('node:fs');

// allow the stop (the safe default) and exit. `obj` (optional) is the Stop-hook JSON decision.
function allow() { process.exit(0); }
function block(reason) { try { process.stdout.write(JSON.stringify({ decision: 'block', reason })); } catch (_) {} process.exit(0); }

try {
  if (process.env.FABLE_STOP_GATE === 'off' || process.env.FABLE_PROFILE === 'off') allow();

  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch (_) { allow(); }
  let evt = {};
  try { evt = JSON.parse(raw || '{}'); } catch (_) { allow(); }

  // Never loop: if we already nudged this turn, let the model stop.
  if (evt.stop_hook_active) allow();

  const tp = evt.transcript_path;
  if (!tp || !fs.existsSync(tp)) allow();

  // Pull the LAST assistant text message from the JSONL transcript.
  let lines = [];
  try { lines = fs.readFileSync(tp, 'utf8').split('\n').filter(Boolean); } catch (_) { allow(); }
  let text = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    let o; try { o = JSON.parse(lines[i]); } catch (_) { continue; }
    const role = o.type || (o.message && o.message.role);
    if (role !== 'assistant') continue;
    const content = (o.message && o.message.content) || o.content;
    if (typeof content === 'string') { text = content; break; }
    if (Array.isArray(content)) {
      text = content.filter(b => b && (b.type === 'text' || typeof b.text === 'string')).map(b => b.text || '').join('\n').trim();
      if (text) break;
    }
  }
  if (!text) allow();

  // ── the rule (byte-identical to mcp/src/server.js fable_lint unsupported-done-claim) ──
  const DONE_CLAIM_L = /\b(fixed|resolved|works now|now works|it works|works fine|now passing|now passes|implemented(?:\s+it)?|completed|verified|confirmed working)\b|고쳤|고쳐졌|해결했|해결됨|완료(?:했|됐|함)|확인했|작동(?:합니다|해요|함|한다)|동작(?:합니다|해요|함)|구현(?:했|함|완료)/i;
  const EVID_L = /`[^`]+`|\b[\w./-]+\.(?:js|ts|jsx|tsx|mjs|cjs|py|go|rs|java|rb|php|md|json|ya?ml|sh|sql|css|html?|c|cc|cpp|h|hpp)\b|\b[\w./-]+:\d+\b|\btests?\b|\bspec\b|\bnpm (?:test|run)\b|\bpytest\b|\bpass(?:es|ed|ing)\b|\bexit code 0\b/i;
  const UNVERIFIED_L = /\bnot verified\b|\bunverified\b|\bnot (?:yet )?(?:tested|confirmed|checked|validated|run)\b|\bhaven'?t (?:tested|verified|confirmed|checked|run)\b|\bcan'?t verify\b|\bto be (?:tested|verified|confirmed)\b|\bTBD\b|아직[\s\S]{0,12}(?:못|않|안)|검증하지\s*못|확인하지\s*못|테스트하지\s*못|미검증|검증\s*안|확인\s*안/i;

  if (DONE_CLAIM_L.test(text) && !EVID_L.test(text) && !UNVERIFIED_L.test(text)) {
    const claim = (text.match(DONE_CLAIM_L) || [''])[0];
    block(
      `Your last message claims completion ("${claim}") without showing the check that backs it. Before finishing, either (a) show the evidence on the same line — a \`command\`, a file:line, a test name, "passes", or exit code 0 — or (b) mark the claim "not verified". Do not assert completion you did not show. (fablever stop-gate; one-time. Disable: FABLE_STOP_GATE=off.)`
    );
  }
  allow();
} catch (_) {
  // Fail OPEN, always — a discipline gate must never trap the user behind a bug.
  allow();
}
