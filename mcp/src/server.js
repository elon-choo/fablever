#!/usr/bin/env node
'use strict';

/*
 * fable-profile MCP server — ZERO dependencies (no @modelcontextprotocol/sdk, nothing to npm install).
 *
 * Why hand-rolled: the steering content this server ships is meant to be auditable and trustable by
 * other people who install it. A dependency-free stdio JSON-RPC 2.0 implementation means there is no
 * install-time code, no postinstall, no transitive supply chain — `node server.js` is the whole thing.
 *
 * Transport: MCP stdio = newline-delimited JSON-RPC 2.0. One JSON object per line on stdin/stdout.
 * Anything that is not a protocol message (logs, diagnostics) MUST go to stderr, never stdout.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const SERVER_NAME = 'fable-profile';
const SERVER_VERSION = '1.0.0';
const DEFAULT_PROTOCOL = '2025-06-18';
// Per MCP spec: echo the client's requested version only if we support it; otherwise answer with our latest.
const SUPPORTED_PROTOCOLS = new Set(['2025-06-18', '2025-03-26', '2024-11-05']);

// Host-awareness (B7): the same zero-dep server runs under Claude Code AND Codex CLI. The Codex install sets
// FABLE_HOST=codex plus FABLE_PROFILE_HOME / FABLE_HOME / FABLE_TASTE_FILE in config.toml so profile/taste/
// status resolve under .codex/fable-profile. With none of these set, every default is the original Claude
// behavior — so the Claude path is byte-for-byte unchanged.
const HOST = (process.env.FABLE_HOST || 'claude').toLowerCase();
const PROFILE_HOME = process.env.FABLE_PROFILE_HOME || path.join(os.homedir(), '.claude', 'fable-profile');
// Profiles dir: prefer an explicit runtime (Codex), else the repo/Claude-runtime layout (__dirname/../../profiles).
const PROFILE_DIR = (() => {
  const candidates = [];
  if (process.env.FABLE_HOME) candidates.push(path.join(process.env.FABLE_HOME, 'profiles'));
  if (process.env.FABLE_PROFILE_HOME) { candidates.push(path.join(process.env.FABLE_PROFILE_HOME, 'runtime', 'profiles')); candidates.push(process.env.FABLE_PROFILE_HOME); }
  candidates.push(path.resolve(__dirname, '..', '..', 'profiles'));
  for (const c of candidates) { try { if (fs.existsSync(path.join(c, 'full.md'))) return c; } catch (_) {} }
  return path.resolve(__dirname, '..', '..', 'profiles');
})();

// Server-wide guidance (B6): Codex reads an MCP server's `instructions` during initialize and applies it as
// session-wide steering. The first 512 chars are self-contained on purpose (some clients truncate).
const SERVER_INSTRUCTIONS =
  'fablever (Fable Profile) tools enforce a restrained, evidence-grounded working style. Before handing over ' +
  'a high-stakes deliverable, run fable_check — a deterministic per-domain Definition-of-Done gate; a BLOCK ' +
  'means an acceptance criterion is unmet, so fix it and re-run rather than delivering around it. Run ' +
  'fable_lint on a draft reply to catch scope creep and unsupported "done/works" claims. Do not over-build. ' +
  'Safety and explicit project/user instructions outrank this style\'s decisiveness. fable_taste stores LOCAL ' +
  'preferences only — never put secrets in it.\n\n' +
  'More depth: get_fable_profile returns the full working-style text (variant: core | compact | full). ' +
  'fable_status reports whether fablever is active and how it is configured. These are deterministic, ' +
  'zero-LLM checks — use them to self-steer, not as a substitute for judgement: clearing fable_check means ' +
  'the acceptance criteria are met, not that the work is good. Items it marks UNCHECKED are human judgement ' +
  'calls that are never auto-passed.';

// ---------------------------------------------------------------------------
// Profile loading (single source of truth = profiles/*.md in the repo)
// ---------------------------------------------------------------------------
const EMBEDDED_FALLBACK = {
  core: 'Fable profile (fallback). Act when you have enough to act. Lead with the outcome. ' +
    'Do not over-build or refactor beyond the task. Report findings, do not fix unprompted. ' +
    'Ground every progress claim in a tool result. Stop only for destructive/irreversible/scope/owner-only decisions. ' +
    'Safety and explicit project rules (e.g. ask before editing working code) outrank decisiveness.',
};

function loadProfile(variant) {
  const safe = String(variant || '').replace(/[^a-z0-9_-]/gi, '');
  const file = path.join(PROFILE_DIR, safe + '.md');
  try {
    const txt = fs.readFileSync(file, 'utf8');
    // Strip YAML frontmatter if present so MCP consumers get clean instruction text.
    return txt.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  } catch (e) {
    return EMBEDDED_FALLBACK[safe] || EMBEDDED_FALLBACK.core;
  }
}

// ---------------------------------------------------------------------------
// fable_lint — deterministic, dependency-free check of a draft response/plan
// against the Fable communication + restraint principles. No LLM call.
// ---------------------------------------------------------------------------
function fableLint(text) {
  const t = String(text || '');
  const violations = [];
  const add = (rule, severity, evidence, fix) => violations.push({ rule, severity, evidence, fix });

  // 1. Arrow-chain / shorthand in user-facing text.
  const arrows = t.match(/\S+\s*(?:→|->|⟶)\s*\S+/g) || [];
  if (arrows.length >= 1) {
    add('arrow-chain-shorthand', arrows.length >= 2 ? 'high' : 'medium',
      arrows.slice(0, 3).join(' | '),
      'Replace arrow chains with complete sentences; the final summary is for a reader who never saw your working thread.');
  }

  // 2. Ends on asking permission / hedge instead of acting.
  const permission = t.match(/\b(let me know if|would you like me to|do you want me to|want me to\b|shall i\b|should i\b)/gi) || [];
  if (permission.length) {
    add('ends-on-permission-or-hedge', 'high', permission.slice(0, 3).join(' | '),
      'For reversible actions that follow from the request, just do them — don\'t close on permission-asking. (One clarifying question on a genuinely ambiguous or destructive action is legitimate, not a violation.)');
  }

  // 3. Promise/intent as the final line without a following action.
  const lastChunk = t.trim().split(/\n\s*\n/).pop() || '';
  if (/^\s*(?:i'll\b|i will\b|let me\b|next,? i|i'm going to\b|going to\b|i plan to\b)/i.test(lastChunk) && lastChunk.length < 240) {
    add('intent-without-action', 'high', lastChunk.slice(0, 120),
      'Do the work now instead of ending on a promise. End the turn only when the task is done or you are blocked on owner-only input.');
  }

  // 4. Buries the outcome: opens with process narration rather than the result.
  const firstSentence = (t.trim().match(/^[^.!?\n]{0,200}[.!?\n]/) || [''])[0];
  if (/^\s*(?:let me\b|i'll\b|i will\b|first,?\b|i'm going to\b|now i|to start|in order to|i'm now)/i.test(firstSentence)) {
    add('buries-the-outcome', 'medium', firstSentence.trim().slice(0, 120),
      'Lead with what happened / what you found. Put process and reasoning after the outcome.');
  }

  // 5. Over-formatting for short content (headers/bold/bullets density).
  const headers = (t.match(/^#{1,6}\s/gm) || []).length;
  const bullets = (t.match(/^\s*[-*]\s/gm) || []).length;
  const bold = (t.match(/\*\*[^*]+\*\*/g) || []).length;
  const words = (t.match(/\S+/g) || []).length;
  if (words > 0 && words < 160 && (headers >= 2 || bold >= 4)) {
    add('over-formatting-short-answer', 'medium', `headers=${headers}, bold=${bold}, words=${words}`,
      'For a short answer, respond in prose. Reserve headers/bold/tables for genuinely multifaceted output.');
  }

  // 6. Hedging density (overconfidence's opposite failure — vague non-commitment).
  const hedges = (t.match(/\b(perhaps|maybe|possibly|i think|it seems|sort of|kind of|i believe|probably|might be|could be)\b/gi) || []);
  if (hedges.length >= 4) {
    add('excess-hedging', 'low', `${hedges.length} hedges`,
      'State what you verified plainly; flag genuine uncertainty explicitly once, rather than sprinkling hedges.');
  }

  // 7. Unrequested scope creep markers (over-building / tidying not asked for).
  const creep = (t.match(/\b(while i'?m at it|also refactor(?:ed|ing)?|cleaned? up the surrounding|for future|just in case|might as well|took the liberty|bonus[: ]|as a bonus)\b/gi) || []);
  if (creep.length) {
    add('unrequested-scope-creep', 'high', creep.slice(0, 3).join(' | '),
      'Do the simplest thing that satisfies the task. No surrounding cleanup, speculative abstractions, or unasked features.');
  }

  // 8. Option-surveying instead of a recommendation.
  if (/\b(option 1|option a|here are (?:a few|some|several) options|you could either)\b/i.test(t) && !/\bi recommend\b|\bi'd go with\b|\bmy recommendation\b/i.test(t)) {
    add('survey-without-recommendation', 'medium', 'lists options but gives no pick',
      'If you are weighing choices, give a recommendation, not an exhaustive survey.');
  }

  // 8b. Unsupported "it works / done / fixed" claim — the wording-level guard (the style-only ablation's one
  // honest negative: fablever's decisive voice asserts done/works MORE often than plain, without showing the
  // check, 8.3% vs 2.1% — eval/style-only-ablation/RESULTS.md). This grades the FINAL RESPONSE'S WORDING:
  // a completion claim with neither an evidence token (a `command`, file, file:line, test, "passes") NOR an
  // explicit "not verified" marker. It is the lint counterpart of fable_check's C-test acceptance item —
  // fable_lint = claim discipline in the message you are about to send; fable_check = deliverable gate.
  const DONE_CLAIM_L = /\b(fixed|resolved|works now|now works|it works|works fine|now passing|now passes|implemented(?:\s+it)?|completed|verified|confirmed working)\b|고쳤|고쳐졌|해결했|해결됨|완료(?:했|됐|함)|확인했|작동(?:합니다|해요|함|한다)|동작(?:합니다|해요|함)|구현(?:했|함|완료)/i;
  const EVID_L = /`[^`]+`|\b[\w./-]+\.(?:js|ts|jsx|tsx|mjs|cjs|py|go|rs|java|rb|php|md|json|ya?ml|sh|sql|css|html?|c|cc|cpp|h|hpp)\b|\b[\w./-]+:\d+\b|\btests?\b|\bspec\b|\bnpm (?:test|run)\b|\bpytest\b|\bpass(?:es|ed|ing)\b|\bexit code 0\b/i;
  const UNVERIFIED_L = /\bnot verified\b|\bunverified\b|\bnot (?:yet )?(?:tested|confirmed|checked|validated|run)\b|\bhaven'?t (?:tested|verified|confirmed|checked|run)\b|\bcan'?t verify\b|\bto be (?:tested|verified|confirmed)\b|\bTBD\b|아직[\s\S]{0,12}(?:못|않|안)|검증하지\s*못|확인하지\s*못|테스트하지\s*못|미검증|검증\s*안|확인\s*안/i;
  if (DONE_CLAIM_L.test(t) && !EVID_L.test(t) && !UNVERIFIED_L.test(t)) {
    add('unsupported-done-claim', 'high', (t.match(DONE_CLAIM_L) || [''])[0],
      'A "done/works/fixed/verified" claim must show the check on the same line — a `command`, a file:line, a test name, or "passes" — or be marked "not verified". Add the evidence inline in the first pass; do not assert completion you did not show.');
  }

  // 9-11. Decision-trail rules. These fire ONLY when a 'Decision trail' block is present; absent it, none
  // fire and the linter behaves exactly as before. They grade STRUCTURE / PRESENCE / GROUNDING only —
  // never semantic correctness — so a well-formed trail passes here, but the truth of each line still
  // rests on the artifact it cites, not on this check.
  // Match the label at line-start, then capture the rest — whether the trail is a multi-line block
  // ("Decision trail:\n- ...") or inline after the colon ("Decision trail: ..."). The \r?\n? makes the
  // newline optional so a degenerate single-line trail is still graded, not silently passed.
  const trailM = t.match(/(^|\n)[ \t]*(?:\*\*|#{1,6}\s*)?decision trail\b[*:]*[ \t]*\r?\n?([\s\S]*)$/i);
  if (trailM) {
    const before = t.slice(0, trailM.index);                 // the outcome answer above the trail
    const body = trailM[2] || '';
    const bodyLines = body.split(/\r?\n/).map(s => s.replace(/^\s*[-*]\s+/, '').trim()).filter(Boolean);
    const wcount = s => (String(s).match(/\S+/g) || []).length;
    // an evidence token = a `command`, a filename.ext, a file:line, a test/spec mention, or the literal 'unverified'.
    const EVID = /`[^`]+`|\b[\w./-]+\.(?:js|ts|jsx|tsx|mjs|cjs|py|go|rs|java|rb|php|md|json|ya?ml|sh|sql|css|html?|c|cc|cpp|h|hpp)\b|\b[\w./-]+:\d+\b|\btests?\b|\bspec\b|\bunverified\b|\bnot verified\b/i;
    const isPointer = s => /not verified|where to look|unverified/i.test(s);
    // (9) ungrounded-trail-line: a decision line that cites no checkable artifact (file, file:line, `command`, test, or 'unverified').
    const ungrounded = bodyLines.filter(l => !isPointer(l) && !EVID.test(l));
    if (ungrounded.length) {
      add('ungrounded-trail-line', 'high', ungrounded.slice(0, 3).join(' | '),
        'Every decision-trail line must anchor to something the reader can check — a file:line, a `command`, a test name, or the explicit word "unverified". A trail of unanchored claims is self-narration, which is not trustworthy evidence.');
    }
    // (10) trail-bloat: the trail outweighs the outcome it appends to, or uses arrow-chains/headers (the CoT-dump guard).
    const trailWords = wcount(body), answerWords = wcount(before);
    const trailArrows = (body.match(/\S+\s*(?:→|->|⟶)\s*\S+/g) || []).length;
    const trailHeaders = (body.match(/^\s*#{1,6}\s/gm) || []).length;
    if ((answerWords > 0 && trailWords > answerWords) || trailArrows >= 1 || trailHeaders >= 1) {
      add('trail-bloat', 'high', `trailWords=${trailWords} answerWords=${answerWords} arrows=${trailArrows} headers=${trailHeaders}`,
        'The decision trail is an appendix BELOW the outcome: keep it shorter than the answer, plain prose, no arrow-chains or headers. A trail longer than the answer is a chain-of-thought dump in disguise.');
    }
    // (11) trail-on-trivial: a trail emitted on a short/single-step message (the trail is for multi-step/irreversible work only).
    if (words > 0 && words < 120) {
      add('trail-on-trivial', 'low', `total words=${words} with a Decision trail block present`,
        'Omit the decision trail on trivial or single-step turns — it is for multi-step or irreversible work. On a short answer it is just token overhead.');
    }
  }

  const weight = { high: 25, medium: 10, low: 4 };
  const penalty = violations.reduce((s, v) => s + (weight[v.severity] || 0), 0);
  const score = Math.max(0, 100 - penalty);
  return {
    score,
    passed: score >= 80 && !violations.some(v => v.severity === 'high'),
    violation_count: violations.length,
    violations,
    summary: violations.length === 0
      ? 'Clean: matches Fable communication + restraint principles.'
      : `${violations.length} issue(s); score ${score}/100. Highest severity: ${violations.some(v => v.severity === 'high') ? 'high' : violations.some(v => v.severity === 'medium') ? 'medium' : 'low'}.`,
  };
}

// ---------------------------------------------------------------------------
// Capability definitions
// ---------------------------------------------------------------------------
// fable_status — read-only snapshot of whether fablever is active and how it is configured.
// Answers the everyday "is it on / what mode / which preset am I in" that has no slash-command surface.
function readJSONsafe(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function hasMarkerSafe(p, start, end) {
  try { const c = fs.readFileSync(p, 'utf8'); return c.includes(start) && c.includes(end) && c.indexOf(start) < c.indexOf(end); } catch { return null; }
}
function envOverrides() {
  const env = {};
  for (const k of ['FABLE_PROFILE', 'FABLE_HOST', 'FABLE_ULTRA', 'FABLE_ONBOARD', 'FABLE_MODELCHECK', 'FABLE_XVERIFY', 'FABLE_FUSION', 'FABLE_TASTE']) if (process.env[k]) env[k] = process.env[k];
  return env;
}

// Codex host status — derive CODEX_HOME from FABLE_PROFILE_HOME (= CODEX_HOME/fable-profile). We do NOT claim
// "output style active" (Codex has no output-style surface); we report whether the AGENTS.md marker block is
// present instead. Anything we cannot verify from the filesystem is reported as "unknown", never false.
function fableStatusCodex() {
  const codexHome = path.dirname(PROFILE_HOME);
  const agentsMarker = hasMarkerSafe(path.join(codexHome, 'AGENTS.md'), '<!-- fablever:codex:start -->', '<!-- fablever:codex:end -->');
  const overrideMarker = hasMarkerSafe(path.join(codexHome, 'AGENTS.override.md'), '<!-- fablever:codex:start -->', '<!-- fablever:codex:end -->');
  const agentsActive = agentsMarker === true || overrideMarker === true;
  const hooksJson = readJSONsafe(path.join(codexHome, 'hooks.json'));
  let hooksReg = 'unknown';
  if (hooksJson === null) hooksReg = !fs.existsSync(path.join(codexHome, 'hooks.json')) ? 'none (no hooks.json)' : 'unknown (unreadable)';
  else { const evs = Object.keys(hooksJson.hooks || {}).filter(ev => (hooksJson.hooks[ev] || []).some(e => (e.hooks || []).some(h => (h.statusMessage || '').startsWith('fablever:') || (h.command || '').includes('fable-')))); hooksReg = evs.length ? evs.join(', ') : 'none'; }
  const mcpMarker = hasMarkerSafe(path.join(codexHome, 'config.toml'), '# fablever:codex:mcp:start', '# fablever:codex:mcp:end');
  const profileOff = (process.env.FABLE_PROFILE || '').toLowerCase() === 'off';
  const env = envOverrides();
  const status = {
    host: 'codex', codex_home: codexHome, profile_home: PROFILE_HOME, taste_file: TASTE_FILE,
    agents_guidance_active: agentsActive,
    agents_marker_file: overrideMarker === true ? 'AGENTS.override.md' : (agentsMarker === true ? 'AGENTS.md' : null),
    hooks_quieted_by_env: profileOff,
    hooks_registered: hooksReg,
    mcp_registered: mcpMarker === null ? 'unknown' : mcpMarker,
    cross_model_reviewer: 'n/a (Codex-native install; cross-model xverify lives in the Claude path / Fusion. A Codex host verifying itself is not cross-model)',
    env_overrides: env,
  };
  const lines = [
    `Host: Codex CLI`,
    `Codex AGENTS guidance: ${agentsActive ? 'ACTIVE (fablever marker block in ' + status.agents_marker_file + ')' : 'NOT present — run: node install.mjs --codex-style-only'}` +
      (profileOff ? '  [FABLE_PROFILE=off quiets the hooks]' : ''),
    `Hooks registered: ${hooksReg}${hooksReg !== 'none' && hooksReg !== 'unknown' ? ' — run /hooks in Codex to confirm they are trusted' : ''}`,
    `MCP registered (config.toml): ${status.mcp_registered === true ? 'yes — run /mcp in Codex to confirm connected' : status.mcp_registered === false ? 'no' : 'unknown'}`,
    `Cross-model reviewer: ${status.cross_model_reviewer}`,
    `Taste store: ${TASTE_FILE}`,
  ];
  if (Object.keys(env).length) lines.push(`Env overrides in effect: ${Object.entries(env).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  return { summary: lines.join('\n'), status };
}

function fableStatus() {
  if (HOST === 'codex') return fableStatusCodex();
  const home = os.homedir();
  const cdir = path.join(home, '.claude');
  const fdir = PROFILE_HOME; // ~/.claude/fable-profile on the Claude default
  const settings = readJSONsafe(path.join(cdir, 'settings.json')) || {};
  const styleActive = settings.outputStyle === 'Fable';
  const profileOff = (process.env.FABLE_PROFILE || '').toLowerCase() === 'off';
  const mode = readJSONsafe(path.join(fdir, 'mode.json'));
  const ultra = (process.env.FABLE_ULTRA || (mode && mode.ultra) || 'auto').toLowerCase();
  const xv = readJSONsafe(path.join(fdir, 'xverify.json'));
  const preset = (xv && xv.preset) || 'claude-only';
  // The reviewer is the PRESET name (claude-only is itself a valid choice = same-family, no cross-model).
  // Only an explicit FABLE_XVERIFY=off env override means "cross-model disabled".
  const envXvOff = (process.env.FABLE_XVERIFY || '').toLowerCase() === 'off';
  const reviewer = envXvOff ? `off (FABLE_XVERIFY=off; saved preset: ${preset})` : preset;
  const env = envOverrides();
  const status = {
    host: 'claude',
    style_active: styleActive,
    hooks_quieted_by_env: profileOff,
    cost_mode: ultra,
    cost_mode_source: process.env.FABLE_ULTRA ? 'env FABLE_ULTRA' : (mode ? 'mode.json' : 'default'),
    cross_model_reviewer: reviewer,
    env_overrides: env,
  };
  const lines = [
    `Fable style: ${styleActive ? 'ON (always-on output style is the active style)' : 'NOT the active output style — pick "Fable" in /config'}` +
      (profileOff ? '  [FABLE_PROFILE=off quiets the hooks; the style itself still applies]' : ''),
    `Cost mode (ULTRA): ${ultra}  (from ${status.cost_mode_source}) — change: export FABLE_ULTRA=auto|on|off  or edit ${path.join(fdir, 'mode.json')}`,
    `Cross-model reviewer: ${reviewer}${reviewer === 'claude-only' ? ' (same-family Claude panel; no cross-model by design)' : ''} — change: node <fablever>/orchestration/lib/xverify-preset.mjs set <preset>`,
  ];
  if (Object.keys(env).length) lines.push(`Env overrides in effect: ${Object.entries(env).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  return { summary: lines.join('\n'), status };
}

// ---------------------------------------------------------------------------
// Taste memory — a local, on/off store of the requester's repeated preferences,
// so future deliverables match them instead of re-litigating taste each time.
// Persisted at ~/.claude/fable-profile/taste.json (override with FABLE_TASTE_FILE).
// Two kinds of preference:
//   kind:'rule' — a deterministically checkable forbid/require regex. These become
//                 extra HARD gate items inside fable_check (a forbid match, or a
//                 missing require, is a FAIL). This is the gate-not-narrate path:
//                 the taste actually blocks delivery, it does not just get recited.
//   kind:'note' — soft taste guidance (voice, altitude). NEVER auto-graded; surfaced
//                 as an UNCHECKED, human-confirm item. A model grading its own taste
//                 would just reproduce the decision-trail illusion-of-rigor, so a
//                 note can never auto-PASS.
// On/off: the store's `enabled` flag, OR the env override FABLE_TASTE=off (env wins).
// ---------------------------------------------------------------------------
const TASTE_FILE = process.env.FABLE_TASTE_FILE ||
  (process.env.FABLE_PROFILE_HOME ? path.join(process.env.FABLE_PROFILE_HOME, 'taste.json')
    : path.join(os.homedir(), '.claude', 'fable-profile', 'taste.json'));

function loadTaste() {
  const d = readJSONsafe(TASTE_FILE);
  if (!d || typeof d !== 'object') return { enabled: true, prefs: [] };
  return { enabled: d.enabled !== false, prefs: Array.isArray(d.prefs) ? d.prefs : [] };
}
function saveTaste(store) {
  fs.mkdirSync(path.dirname(TASTE_FILE), { recursive: true });
  fs.writeFileSync(TASTE_FILE, JSON.stringify(store, null, 2));
}
function tasteIsOn(store) {
  if ((process.env.FABLE_TASTE || '').toLowerCase() === 'off') return false;
  return store.enabled !== false;
}
function hashId(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return 't' + h.toString(36);
}
function safeRegex(src) { try { return src ? new RegExp(src, 'i') : null; } catch { return null; } }

function fableTaste(args) {
  const a = args || {};
  const action = String(a.action || '').toLowerCase();
  const store = loadTaste();
  const envOff = (process.env.FABLE_TASTE || '').toLowerCase() === 'off';
  switch (action) {
    case 'on':
    case 'off': {
      store.enabled = action === 'on';
      saveTaste(store);
      return { ok: true, enabled: store.enabled, active: tasteIsOn(store), env_override: envOff ? 'FABLE_TASTE=off overrides the stored flag until you unset it' : null, count: store.prefs.length };
    }
    case 'status':
      return { ok: true, enabled: store.enabled, active: tasteIsOn(store), env_override: envOff ? 'FABLE_TASTE=off' : null, count: store.prefs.length, by_kind: { rule: store.prefs.filter(p => p.kind === 'rule').length, note: store.prefs.filter(p => p.kind === 'note').length } };
    case 'list': {
      const dom = a.domain ? String(a.domain) : null;
      const on = tasteIsOn(store);
      const prefs = on ? store.prefs.filter(p => !dom || p.domain === dom || p.domain === 'global') : [];
      return { ok: true, enabled: store.enabled, active: on, applied: on, count: prefs.length, prefs };
    }
    case 'add': {
      if (!a.text || typeof a.text !== 'string') return { ok: false, error: 'add requires a "text" description of the preference' };
      const kind = a.kind === 'rule' ? 'rule' : 'note';
      const domain = a.domain ? String(a.domain) : 'global';
      if (kind === 'rule' && !a.forbid && !a.require) return { ok: false, error: 'a rule needs a "forbid" or "require" regex (otherwise use kind:"note")' };
      if (kind === 'rule' && !safeRegex(a.forbid || a.require)) return { ok: false, error: 'forbid/require must be a valid regular expression' };
      const pref = { id: hashId(domain + '|' + kind + '|' + a.text + '|' + (a.forbid || '') + '|' + (a.require || '')), domain, kind, text: String(a.text) };
      if (kind === 'rule') { if (a.forbid) pref.forbid = String(a.forbid); if (a.require) pref.require = String(a.require); }
      const at = store.prefs.findIndex(p => p.id === pref.id);
      if (at >= 0) store.prefs[at] = pref; else store.prefs.push(pref);
      saveTaste(store);
      return { ok: true, added: pref, count: store.prefs.length };
    }
    case 'remove': {
      if (!a.id) return { ok: false, error: 'remove requires an "id"' };
      const before = store.prefs.length;
      store.prefs = store.prefs.filter(p => p.id !== String(a.id));
      saveTaste(store);
      return { ok: true, removed: before - store.prefs.length, count: store.prefs.length };
    }
    default:
      return { ok: false, error: `unknown action "${a.action}". Valid: add | list | remove | on | off | status` };
  }
}

// ---------------------------------------------------------------------------
// fable_check — deterministic DELIVERY GATE. Checks a finished deliverable against
// a per-domain Definition of Done. Where fable_lint checks the STYLE of a draft
// message, fable_check checks whether the ARTIFACT meets its acceptance criteria,
// and a FAIL is a hard BLOCK: fix and re-run before handing it over. The lesson from
// the decision-trail experiment was that an after-the-fact narration changes nothing;
// a check that can actually FAIL and force a fix is the lever. Items are 'auto'
// (deterministically checkable -> PASS/FAIL) or 'human' (taste/judgement -> UNCHECKED,
// a person confirms; NEVER auto-passed — a model grading its own taste just recreates
// the trail's illusion-of-rigor). Zero LLM.
// ---------------------------------------------------------------------------
const CITE = /`[^`]+`|https?:\/\/\S+|\([A-Z][A-Za-z.\- ]+,?\s*(?:19|20)\d{2}\)|\b[\w./-]+\.(?:js|ts|jsx|tsx|mjs|cjs|py|go|rs|java|rb|php|md|json|ya?ml|sh|sql|csv)\b|\b[\w./-]+:\d+\b|\btests?\b|\bspec\b|\bpass(?:es|ed|ing)?\b|\bfail(?:s|ed|ing)?\b/i;
const DONE_CLAIM = /\b(fixed|resolved|works now|now works|now passes|passing|implemented|completed|verified)\b|고쳤|해결했|완료했|확인했/i;
const PROCESS_OPENER = /^\s*(?:let me\b|i'll\b|i will\b|first,?\b|i'm going to\b|now i\b|to start\b|in order to\b|this (?:document|memo|report|plan|analysis) (?:will|describes|outlines|covers)|먼저\b|이 (?:문서|메모|보고서|분석)(?:는|은))/i;
const METRIC = /\b\d+(?:\.\d+)?\s?%|\b\d+(?:\.\d+)?x\b|\b\d{2,}\s?(?:ms|users?|customers?|명|건|회|배)\b/i;
const ASSUME_MARKER = /\bassum|\bestimat|\bapprox|\broughly|\bTBD\b|to be confirmed|open question|미결|가정|추정|대략|예시|\bexample\b/i;
const REC_DOC = /\brecommend|\bmy pick\b|\bgo with\b|\bdecision:|결론|추천|권장|제안(?:은|:|\s)/i;
const OVERTURN = /what would (?:overturn|change|invalidate)|반증|뒤집|\blimitation|\bcaveat|한계|confidence|weakest/i;
// CTA detection is deliberately broad: the v1 keyword list under-detected real CTAs ("get early access",
// "start your free trial") and false-BLOCKed good copy. We count CTA-like phrases and only fail on CLUTTER
// (3+ competing CTAs) — a single primary CTA, a primary+secondary, or an intentionally CTA-less strategy
// deliverable all pass. "Exactly one CTA" is the right north star but too brittle to gate deterministically.
const CTA = /\bget (?:early access|started|access|the app|it now|your \w+)\b|\bstart(?:ed)?(?: your)?(?:\s+\w+){0,3}\s+(?:free|trial|today|now)\b|\bsign\s?up\b|\bsubscribe\b|\btry (?:it )?(?:free|now|today)\b|\bdownload(?:\s+(?:the app|now|today|it))?\b|\bjoin (?:now|us|today|free|\d)|\bbuy(?:\s+(?:now|it|the|our))?\b|\border (?:now|today)\b|\bbook (?:now|a|your)\b|\bregister(?:\s+(?:now|today|free))?\b|\bclaim (?:your|now|the)\b|\brequest (?:a )?demo\b|\bschedule (?:a )?(?:call|demo)\b|\blearn more\b|지금\s*(?:구매|시작|신청|가입|예약|받기|확인)|구매하기|신청하기|시작하기|가입하기|다운로드|예약하기|등록하기|받아보기/gi;
const OPTION = /\boption\s*[a-z0-9]\b|\bangle\s*\d|\bvariant\s*[a-z0-9]\b|버전\s*[A-Za-z0-9]|\b안\s*\d/gi;
const REC = /\brecommend|\bmy (?:pick|recommendation)\b|\bi.?d (?:go with|send|use|pick|choose|recommend)\b|\bgo with (?:angle|option|#|\d|the)\b|\blead with (?:angle|option|#|\d)\b|\bsend (?:angle|option|#)?\s*\d|\buse (?:angle|option) \d|\bthe (?:send|pick|winner) is\b|추천|권장|이걸 (?:보내|쓰)|보내(?:라|세요)/i;
const FMETRIC = /\b(conversion|cvr|ctr|cac|ltv|activation|retention|sign-?up|arpu|aov|churn)\b|전환|가입|이탈|리텐션|활성화|객단가/i;
const TIMEFRAME = /\b\d+\s*(?:day|week|month|days|weeks|months)\b|\d+\s*(?:일|주|개월|주간|분기)|\bq[1-4]\b|this (?:week|month|quarter)/i;
const BOTTLENECK = /\bbottleneck|biggest drop|largest drop|primary (?:drop|leak)|main leak|병목|가장 큰 이탈|주요 이탈/i;
const TESTPRIO = /(?:test|experiment|a\/b|실험|테스트)[^.\n]{0,40}(?:first|#1|우선|priority|먼저)|(?:first|#1|우선|priority|먼저)[^.\n]{0,40}(?:test|experiment|실험|테스트)/i;

function firstMatch(t, re) { const m = String(t).match(re); return m ? m[0] : null; }
function wordCount(s) { return (String(s).match(/\S+/g) || []).length; }
function firstSentence(t) { const m = String(t).trim().match(/^[^.!?\n。]{0,200}[.!?\n。]/); return m ? m[0] : String(t).trim().slice(0, 200); }
function noFabMetric(t) {
  const sents = String(t).split(/(?<=[.!?。\n])\s+/);
  for (const s of sents) { if (METRIC.test(s) && !CITE.test(s) && !ASSUME_MARKER.test(s)) return { pass: false, evidence: s.trim().slice(0, 140) }; }
  return { pass: true, evidence: 'no unsourced metric' };
}

const DOD_CATALOG = {
  'code': { domain: 'code', items: [
    { id: 'C-test', kind: 'auto', label: 'A "done/works" claim cites a test or command that verifies it.',
      check: t => DONE_CLAIM.test(t) ? { pass: !!firstMatch(t, CITE), evidence: firstMatch(t, CITE) || 'claims done but cites no test/command' } : { pass: true, evidence: 'no done-claim to back' },
      gap: 'Says the change works but points to nothing the reader can run.', fix: 'Cite the test or repro command you ran, or state explicitly what is still unverified.' },
    { id: 'C-nofab', kind: 'auto', label: 'Performance/quantity numbers carry a source or estimate marker.', check: noFabMetric,
      gap: 'A number is stated with no source and no estimate marker.', fix: 'Cite where the number comes from, or mark it TBD/estimate.' },
    { id: 'C-guards', kind: 'human', label: 'Existing guards (auth, null, error paths) preserved in the diff.',
      fix: 'Eyeball the diff: confirm no pre-existing guard or branch was silently dropped.' },
  ] },
  'doc-planning': { domain: 'doc-planning', items: [
    { id: 'D-lead', kind: 'auto', label: 'Leads with the recommendation/outcome, not process narration.',
      check: t => ({ pass: !PROCESS_OPENER.test(firstSentence(t)), evidence: firstSentence(t).trim().slice(0, 120) }),
      gap: 'Opens with "this document will…"/"let me…" instead of the decision.', fix: 'Put the recommendation or conclusion in the first line; move framing below it.' },
    { id: 'D-decision', kind: 'auto', label: 'Contains an explicit recommendation/decision.',
      check: t => ({ pass: REC_DOC.test(t), evidence: firstMatch(t, REC_DOC) || 'no recommendation/decision marker found' }),
      gap: 'Lays out context but never commits to a recommendation.', fix: 'State the call ("Recommend X") so the reader has something to accept or veto.' },
    { id: 'D-nofab', kind: 'auto', label: 'Numbers/dates carry a source or an explicit assumption marker.', check: noFabMetric,
      gap: 'A figure is asserted with no source and no assumption marker.', fix: 'Source it, or label it an assumption/TBD the reader can veto.' },
    { id: 'D-altitude', kind: 'human', label: 'Right altitude and framing for the intended audience.',
      fix: 'Confirm the depth matches who reads this (exec memo vs build spec).' },
  ] },
  'research': { domain: 'research', items: [
    { id: 'R-lead', kind: 'auto', label: 'States the conclusion up front, not buried after process.',
      check: t => ({ pass: !PROCESS_OPENER.test(firstSentence(t)), evidence: firstSentence(t).trim().slice(0, 120) }),
      gap: 'Opens with method/framing instead of the finding.', fix: 'Lead with the answer; put method and evidence after it.' },
    { id: 'R-cited', kind: 'auto', label: 'Factual claims are backed by at least one citable source.',
      check: t => wordCount(t) <= 40 ? { pass: true, evidence: 'too short to require citation' } : { pass: CITE.test(t), evidence: firstMatch(t, CITE) || 'no citation/source token found' },
      gap: 'Makes factual claims with no source the reader can check.', fix: 'Cite a source (name+year, URL, or file) for each load-bearing claim.' },
    { id: 'R-overturn', kind: 'auto', label: 'States what would overturn the conclusion / its limits.',
      check: t => ({ pass: OVERTURN.test(t), evidence: firstMatch(t, OVERTURN) || 'no limitation / what-would-overturn line' }),
      gap: 'Presents a conclusion with no stated weakness or disconfirmer.', fix: 'Add a line on what evidence would change the answer, or the key limitation.' },
    { id: 'R-sources', kind: 'human', label: 'Sources are trustworthy and correctly interpreted.',
      fix: 'Spot-check that the cited sources actually say what they are used to claim.' },
  ] },
  'marketing-copy': { domain: 'marketing-copy', items: [
    { id: 'M-cta', kind: 'auto', label: 'Not cluttered with competing calls to action.',
      check: t => { const n = (String(t).match(CTA) || []).length; return { pass: n < 3, evidence: `${n} CTA-like phrase(s) detected` }; },
      gap: 'Three or more competing CTAs — the reader does not get one clear next step.', fix: 'Keep one primary CTA (a soft secondary is fine); cut the rest.' },
    { id: 'M-nofab', kind: 'auto', label: 'Stats/testimonials carry a source or estimate marker.', check: noFabMetric,
      gap: 'A statistic is stated with no source.', fix: 'Source the stat, or remove it.' },
    { id: 'M-rec', kind: 'auto', label: 'If multiple angles are offered, one is recommended.',
      check: t => { const n = (String(t).match(OPTION) || []).length; return n >= 2 ? { pass: REC.test(t), evidence: REC.test(t) ? 'recommendation present' : `${n} angles, no pick` } : { pass: true, evidence: 'single angle' }; },
      gap: 'Lists angles but does not say which to run.', fix: 'Name your recommended angle.' },
    { id: 'M-voice', kind: 'human', label: 'On-brand voice and tone.',
      fix: 'Confirm it sounds like the brand (this is the prime taste-memory check).' },
  ] },
  'funnel-design': { domain: 'funnel-design', items: [
    { id: 'F-goal', kind: 'auto', label: 'Names a target metric and a timeframe.',
      check: t => ({ pass: FMETRIC.test(t) && TIMEFRAME.test(t), evidence: `metric=${!!firstMatch(t, FMETRIC)} timeframe=${!!firstMatch(t, TIMEFRAME)}` }),
      gap: 'No explicit goal metric and/or no timeframe.', fix: 'State the metric to move and over what period.' },
    { id: 'F-bottleneck', kind: 'auto', label: 'Names the single biggest bottleneck.',
      check: t => ({ pass: BOTTLENECK.test(t), evidence: firstMatch(t, BOTTLENECK) || 'no bottleneck named' }),
      gap: 'Does not single out where the funnel leaks most.', fix: 'Name the one stage that loses the most, and focus there first.' },
    { id: 'F-test', kind: 'auto', label: 'Gives a prioritized first test.',
      check: t => ({ pass: TESTPRIO.test(t), evidence: TESTPRIO.test(t) ? 'prioritized test present' : 'no #1 test / priority' }),
      gap: 'No clearly prioritized experiment to run first.', fix: 'Call out the #1 test and what to hold for later.' },
    { id: 'F-priority', kind: 'human', label: 'Prioritization is right for this business.',
      fix: 'Confirm the chosen bottleneck/test actually matters most for the goal.' },
  ] },
};

function fableCheck(text, dodId) {
  const t = String(text || '');
  const cat = DOD_CATALOG[dodId];
  if (!cat) return { ok: false, error: `unknown dod_id "${dodId}". Valid: ${Object.keys(DOD_CATALOG).join(' | ')}` };
  const items = [];
  for (const it of cat.items) {
    if (it.kind === 'human') { items.push({ id: it.id, label: it.label, status: 'UNCHECKED', evidence: null, gap: null, fix: it.fix }); continue; }
    let r; try { r = it.check(t); } catch (e) { r = { pass: false, evidence: 'check error: ' + e.message }; }
    items.push({ id: it.id, label: it.label, status: r.pass ? 'PASS' : 'FAIL', evidence: r.evidence, gap: r.pass ? null : it.gap, fix: r.pass ? null : it.fix });
  }
  // Taste-memory: rules become extra HARD gate items; notes become UNCHECKED items.
  const store = loadTaste();
  let tasteApplied = false;
  if (tasteIsOn(store)) {
    const relevant = store.prefs.filter(p => p.domain === dodId || p.domain === 'global');
    for (const p of relevant) {
      if (p.kind === 'rule') {
        const fre = safeRegex(p.forbid), rre = safeRegex(p.require);
        if (fre) { tasteApplied = true; const m = firstMatch(t, fre); items.push({ id: 'taste:' + p.id + ':forbid', label: `taste rule — avoid: ${p.text}`, status: m ? 'FAIL' : 'PASS', evidence: m || 'forbidden pattern absent', gap: m ? `Violates a saved taste rule: ${p.text}` : null, fix: m ? `Remove "${m}".` : null }); }
        if (rre) { tasteApplied = true; const ok = rre.test(t); items.push({ id: 'taste:' + p.id + ':require', label: `taste rule — require: ${p.text}`, status: ok ? 'PASS' : 'FAIL', evidence: ok ? 'required pattern present' : 'required pattern absent', gap: ok ? null : `Misses a saved taste rule: ${p.text}`, fix: ok ? null : `Ensure: ${p.text}.` }); }
      } else {
        tasteApplied = true;
        items.push({ id: 'taste:' + p.id, label: `taste note — ${p.text}`, status: 'UNCHECKED', evidence: null, gap: null, fix: `Confirm the deliverable honors: ${p.text}` });
      }
    }
  }
  const fail = items.filter(i => i.status === 'FAIL');
  const unchecked = items.filter(i => i.status === 'UNCHECKED');
  const pass = items.filter(i => i.status === 'PASS');
  const gate = fail.length ? 'BLOCK' : 'PASS';
  const summary = (gate === 'BLOCK'
    ? `BLOCK — ${fail.length} acceptance check(s) failed: ${fail.map(f => f.id).join(', ')}. Fix and re-run before delivering.`
    : `PASS — all ${pass.length} deterministic check(s) met.`)
    + (unchecked.length ? ` ${unchecked.length} item(s) need human confirmation (never auto-passed): ${unchecked.map(u => u.id).join(', ')}.` : '');
  return { ok: true, dod_id: dodId, domain: cat.domain, gate, pass_count: pass.length, fail_count: fail.length, unchecked_count: unchecked.length, taste_applied: tasteApplied, items, summary };
}

const TOOLS = [
  {
    name: 'get_fable_profile',
    description: 'Return the Fable behavioral-steering text. Use to self-steer a non-Fable model (Opus/Sonnet/Haiku) toward Fable\'s working style: act decisively, lead with the outcome, restraint over over-building, ground claims in evidence, stop only when genuinely blocked. variant: "core" (1 paragraph), "compact" (per-turn reminder), "full" (complete profile).',
    inputSchema: {
      type: 'object',
      properties: {
        variant: { type: 'string', enum: ['core', 'compact', 'full'], description: 'Which depth of profile to return. Default "full".' },
      },
    },
  },
  {
    name: 'fable_lint',
    description: 'Deterministically check a draft user-facing message or plan against Fable communication + restraint principles (arrow-chain shorthand, ending on permission-asking, intent-without-action, burying the outcome, over-formatting, scope creep, surveying-without-recommendation, and unsupported "done/works/fixed/verified" claims that show no check). Returns a score and concrete fixes. No LLM call. Run it on your own draft RESPONSE before sending — it grades message wording/claim discipline. (To gate a finished DELIVERABLE against its acceptance criteria, use fable_check instead.)',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'The draft response or plan to check.' } },
      required: ['text'],
    },
  },
  {
    name: 'fable_status',
    description: 'Report whether fablever is active right now and how it is configured: is the Fable output style on, the current cost mode (auto/on/off and where it comes from), the cross-model reviewer preset, and any FABLE_* env overrides. Read-only (reads local config). Use to answer the user\'s "is fablever on / what mode am I in / which reviewer preset / how do I change it".',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'fable_check',
    description: 'Deterministically GATE a finished deliverable against a per-domain Definition of Done before you hand it over — the delivery gate. dod_id ∈ code | doc-planning | research | marketing-copy | funnel-design. Returns each acceptance item as PASS / FAIL / UNCHECKED with the gap and the fix, plus an overall gate of PASS or BLOCK. A BLOCK means a checkable criterion is unmet: fix it and re-run, do not deliver. UNCHECKED items are taste/judgement calls a human must confirm — they are never auto-passed. Also enforces your taste-memory rules for the domain. Zero LLM. Run it on the artifact you are about to deliver, not on a draft message (that is fable_lint).',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The finished deliverable text to gate.' },
        dod_id: { type: 'string', enum: ['code', 'doc-planning', 'research', 'marketing-copy', 'funnel-design'], description: 'Which domain Definition of Done to check against.' },
      },
      required: ['text', 'dod_id'],
    },
  },
  {
    name: 'fable_taste',
    description: 'Manage taste-memory: a local, on/off store of the requester\'s repeated preferences so future deliverables match them without re-asking. A "rule" (forbid/require regex) becomes a HARD gate item inside fable_check; a "note" is surfaced for human confirmation and never auto-passed. actions: add | list | remove | on | off | status. Turn the whole store off with action:"off" (or env FABLE_TASTE=off).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'list', 'remove', 'on', 'off', 'status'], description: 'What to do.' },
        text: { type: 'string', description: 'add: a human description of the preference.' },
        domain: { type: 'string', description: 'add/list: which domain this preference applies to (a dod_id, or "global"). Default "global".' },
        kind: { type: 'string', enum: ['rule', 'note'], description: 'add: "rule" = deterministically enforced via forbid/require regex; "note" = soft, human-confirmed. Default "note".' },
        forbid: { type: 'string', description: 'add (rule): a regex that must NOT appear in the deliverable.' },
        require: { type: 'string', description: 'add (rule): a regex that MUST appear in the deliverable.' },
        id: { type: 'string', description: 'remove: the preference id to delete.' },
      },
      required: ['action'],
    },
  },
];

const PROMPTS = [
  {
    name: 'fable-mode',
    description: 'Inject the full Fable behavioral profile so the current model adopts Fable\'s working style for the rest of the session.',
    arguments: [],
  },
];

const RESOURCES = [
  { uri: 'fable://profile/full', name: 'Fable profile (full)', description: 'Complete Fable behavioral profile.', mimeType: 'text/markdown' },
  { uri: 'fable://profile/compact', name: 'Fable profile (compact)', description: 'Compact per-turn reminder.', mimeType: 'text/markdown' },
  { uri: 'fable://profile/core', name: 'Fable profile (core)', description: 'One-paragraph core.', mimeType: 'text/markdown' },
];

// ---------------------------------------------------------------------------
// JSON-RPC plumbing
// ---------------------------------------------------------------------------
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}
// JSON-RPC 2.0: a server MUST NOT reply to a Notification (a message with no id). Valid ids include 0
// and "", so guard only against null/undefined.
function result(id, res) { if (id === undefined || id === null) return; send({ jsonrpc: '2.0', id, result: res }); }
function error(id, code, message) { if (id === undefined || id === null) return; send({ jsonrpc: '2.0', id, error: { code, message } }); }

function handle(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize': {
      const requested = params && params.protocolVersion;
      return result(id, {
        protocolVersion: (typeof requested === 'string' && SUPPORTED_PROTOCOLS.has(requested)) ? requested : DEFAULT_PROTOCOL,
        capabilities: { tools: {}, prompts: {}, resources: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: SERVER_INSTRUCTIONS,
      });
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return; // notifications get no response
    case 'ping':
      return result(id, {});

    case 'tools/list':
      return result(id, { tools: TOOLS });
    case 'tools/call': {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      // Unknown tool name = protocol error. Execution failures on a known tool = in-band isError result
      // (MCP convention: the model should see the failure as tool output, not a transport error).
      try {
        if (name === 'get_fable_profile') {
          const variant = args.variant || 'full';
          return result(id, { content: [{ type: 'text', text: loadProfile(variant) }] });
        }
        if (name === 'fable_lint') {
          if (typeof args.text !== 'string') return error(id, -32602, 'fable_lint requires a "text" string argument');
          return result(id, { content: [{ type: 'text', text: JSON.stringify(fableLint(args.text), null, 2) }] });
        }
        if (name === 'fable_status') {
          const s = fableStatus();
          return result(id, { content: [{ type: 'text', text: `${s.summary}\n\n${JSON.stringify(s.status, null, 2)}` }] });
        }
        if (name === 'fable_check') {
          if (typeof args.text !== 'string' || typeof args.dod_id !== 'string') return error(id, -32602, 'fable_check requires "text" and "dod_id" string arguments');
          return result(id, { content: [{ type: 'text', text: JSON.stringify(fableCheck(args.text, args.dod_id), null, 2) }] });
        }
        if (name === 'fable_taste') {
          return result(id, { content: [{ type: 'text', text: JSON.stringify(fableTaste(args), null, 2) }] });
        }
        return error(id, -32602, `Unknown tool: ${name}`);
      } catch (e) {
        return result(id, { isError: true, content: [{ type: 'text', text: `Tool ${name} failed: ${e.message}` }] });
      }
    }

    case 'prompts/list':
      return result(id, { prompts: PROMPTS });
    case 'prompts/get': {
      const name = params && params.name;
      if (name === 'fable-mode') {
        return result(id, {
          description: 'Adopt the Fable working style for this session.',
          messages: [{
            role: 'user',
            content: { type: 'text', text: loadProfile('full') },
          }],
        });
      }
      return error(id, -32602, `Unknown prompt: ${name}`);
    }

    case 'resources/list':
      return result(id, { resources: RESOURCES });
    case 'resources/read': {
      const uri = params && params.uri;
      const m = /^fable:\/\/profile\/(full|compact|core)$/.exec(uri || '');
      if (m) {
        return result(id, { contents: [{ uri, mimeType: 'text/markdown', text: loadProfile(m[1]) }] });
      }
      return error(id, -32602, `Unknown resource: ${uri}`);
    }

    default:
      if (!isNotification) return error(id, -32601, `Method not found: ${method}`);
      return;
  }
}

// ---------------------------------------------------------------------------
// Main loop: newline-delimited JSON-RPC on stdin
// ---------------------------------------------------------------------------
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch (e) {
    process.stderr.write(`[fable-profile] parse error: ${e.message}\n`);
    return;
  }
  try {
    handle(msg);
  } catch (e) {
    process.stderr.write(`[fable-profile] handler error: ${e.stack || e.message}\n`);
    if (msg && msg.id !== undefined && msg.id !== null) error(msg.id, -32603, `Internal error: ${e.message}`);
  }
});
rl.on('close', () => process.exit(0));
process.stderr.write(`[fable-profile] MCP server up (zero-dep, stdio). profiles=${PROFILE_DIR}\n`);
