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
const PROFILE_DIR = path.resolve(__dirname, '..', '..', 'profiles');

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
function fableStatus() {
  const home = os.homedir();
  const cdir = path.join(home, '.claude');
  const fdir = path.join(cdir, 'fable-profile');
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
  const env = {};
  for (const k of ['FABLE_PROFILE', 'FABLE_ULTRA', 'FABLE_ONBOARD', 'FABLE_MODELCHECK', 'FABLE_XVERIFY', 'FABLE_FUSION']) if (process.env[k]) env[k] = process.env[k];
  const status = {
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
    description: 'Deterministically check a draft user-facing message or plan against Fable communication + restraint principles (arrow-chain shorthand, ending on permission-asking, intent-without-action, burying the outcome, over-formatting, scope creep, surveying-without-recommendation). Returns a score and concrete fixes. No LLM call. Run it on your own draft before sending.',
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
