#!/usr/bin/env node
'use strict';
/*
 * fable-fusion MCP server — OPTIONAL, OFF BY DEFAULT, the one network-touching part of this project.
 *
 * Exposes a `fable_fusion` tool that sends a prompt to OpenRouter's Fusion API: a panel of models
 * (default Opus + GPT + Gemini) answers in parallel, a judge compares them, and a final answer is
 * synthesized — "Fable-like performance" by fusing several models. The fused answer is itself steered
 * with the Fable working style (a system message from profiles/full.md), unless you disable that.
 *
 * Zero npm dependencies — uses Node 18+'s built-in global fetch. Nothing to install.
 *
 * REQUIRES: an OpenRouter API key in the environment as OPENROUTER_API_KEY (API key, NOT OAuth login).
 * TOGGLE:   FABLE_FUSION=off disables the tool even if the server is registered.
 * COST:     you pay for every panel completion + the judge + the final answer (several calls per query).
 *
 * The core Fable Profile (output style, hooks, mcp/src/server.js) makes NO network calls and needs NO
 * keys. This module is intentionally separate so that guarantee stays intact.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SERVER_NAME = 'fable-fusion';
const SERVER_VERSION = '1.0.0';
const DEFAULT_PROTOCOL = '2025-06-18';
const SUPPORTED_PROTOCOLS = new Set(['2025-06-18', '2025-03-26', '2024-11-05']);
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const PROFILE_FULL = path.resolve(__dirname, '..', 'profiles', 'full.md');

function fableSystemPrompt() {
  try {
    return fs.readFileSync(PROFILE_FULL, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  } catch (_) { return ''; }
}

const TOOLS = [{
  name: 'fable_fusion',
  description:
    'Multi-model deliberation via OpenRouter Fusion: a panel of models (default Opus + GPT + Gemini) ' +
    'answers in parallel, a judge compares them (consensus / disagreements / unique insights / blind ' +
    'spots), and a final synthesized answer comes back — higher quality than any single model. The fused ' +
    'answer is written in the Fable working style. NETWORK + COST: each call hits OpenRouter and bills for ' +
    'several completions; requires OPENROUTER_API_KEY in the environment. Use for hard/ambiguous questions ' +
    'where a second (and third) opinion is worth the cost, not for routine work.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The question/prompt to send to the model panel.' },
      analysis_models: { type: 'array', items: { type: 'string' }, description: 'Optional 1–8 panel model slugs (e.g. "anthropic/claude-opus-4.8", "openai/gpt-5.5", "google/gemini-2.5-pro"). Omit for OpenRouter\'s default Quality panel (Opus + GPT + Gemini).' },
      judge_model: { type: 'string', description: 'Optional model that judges + writes the final answer. Omit for the default.' },
      fable_style: { type: 'boolean', description: 'Steer the fused answer with the Fable working style (default true).' },
      include_analysis: { type: 'boolean', description: 'Also return the raw model/usage metadata (default false).' },
    },
    required: ['prompt'],
  },
}, {
  name: 'fable_cross_verify',
  description:
    'Cross-model adversarial verification via OpenRouter: sends ONE artifact to N DIFFERENT-weights ' +
    'models (default GPT + Gemini) and asks each to REFUTE it, returning each model\'s structured verdict. ' +
    'Use to catch the correlated blind spots a same-family (all-Claude) panel shares. NETWORK + COST: hits ' +
    'OpenRouter once per model; requires OPENROUTER_API_KEY. Disabled if FABLE_XVERIFY=off or FABLE_FUSION=off.',
  inputSchema: {
    type: 'object',
    properties: {
      artifact: { type: 'string', description: 'The artifact/plan/diff/answer to refute.' },
      lens: { type: 'string', description: 'Optional focus (e.g. "security and edge cases").' },
      models: { type: 'array', items: { type: 'string' }, description: 'Optional 1-4 OpenRouter model slugs from DIFFERENT families (e.g. "openai/gpt-4o", "google/gemini-2.5-pro"). Default: GPT + Gemini.' },
    },
    required: ['artifact'],
  },
}];

async function runFusion(args) {
  if (process.env.FABLE_FUSION === 'off') {
    return { isError: true, text: 'fable_fusion is disabled (FABLE_FUSION=off). Unset it to enable.' };
  }
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return { isError: true, text:
      'OPENROUTER_API_KEY is not set. Fusion needs an OpenRouter API key (an API key, not OAuth login).\n' +
      'Get one at https://openrouter.ai/keys, then: export OPENROUTER_API_KEY="sk-or-..." (see fusion/README.md).' };
  }
  if (!args || typeof args.prompt !== 'string' || !args.prompt.trim()) {
    return { isError: true, text: 'fable_fusion requires a non-empty "prompt".' };
  }

  const messages = [];
  if (args.fable_style !== false) {
    const sys = fableSystemPrompt();
    if (sys) messages.push({ role: 'system', content: sys });
  }
  messages.push({ role: 'user', content: args.prompt });

  const body = { model: 'openrouter/fusion', messages };
  if (Array.isArray(args.analysis_models) && args.analysis_models.length) {
    const plugin = { id: 'fusion', analysis_models: args.analysis_models.slice(0, 8) };
    if (args.judge_model) plugin.model = args.judge_model;
    body.plugins = [plugin];
  } else if (args.judge_model) {
    body.plugins = [{ id: 'fusion', model: args.judge_model }];
  }

  let resp;
  try {
    resp = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/elon-choo/fable-profile',
        'X-Title': 'Fable Profile — Fusion',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { isError: true, text: `Network error reaching OpenRouter: ${e.message}` };
  }
  const raw = await resp.text();
  if (!resp.ok) {
    return { isError: true, text: `OpenRouter returned ${resp.status}: ${raw.slice(0, 800)}` };
  }
  let data;
  try { data = JSON.parse(raw); } catch (e) { return { isError: true, text: `Unparseable OpenRouter response: ${raw.slice(0, 400)}` }; }
  const answer = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!answer) return { isError: true, text: `No answer in OpenRouter response: ${raw.slice(0, 400)}` };

  if (args.include_analysis) {
    const meta = { model: data.model, usage: data.usage, id: data.id };
    return { text: `${answer}\n\n---\n[fusion meta] ${JSON.stringify(meta)}` };
  }
  return { text: answer };
}

// One OpenRouter chat completion (reused by cross-verify; runFusion keeps its own call).
async function openrouterChat(key, body) {
  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/elon-choo/fablever',
      'X-Title': 'Fable Profile — Cross-Verify',
    },
    body: JSON.stringify(body),
  });
  const raw = await resp.text();
  if (!resp.ok) throw new Error(`OpenRouter ${resp.status}: ${raw.slice(0, 300)}`);
  return JSON.parse(raw);
}

// Cross-model adversarial verification: each DIFFERENT-weights model independently refutes the
// artifact. This is the documented mitigation for the same-family correlated-blind-spot limit.
async function runCrossVerify(args) {
  if (process.env.FABLE_FUSION === 'off' || process.env.FABLE_XVERIFY === 'off') {
    return { isError: true, text: 'cross-verify is disabled (FABLE_XVERIFY=off or FABLE_FUSION=off).' };
  }
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return { isError: true, text:
      'OPENROUTER_API_KEY is not set — cross-verify needs an OpenRouter API key (not OAuth). See fusion/README.md.' };
  }
  if (!args || typeof args.artifact !== 'string' || !args.artifact.trim()) {
    return { isError: true, text: 'fable_cross_verify requires a non-empty "artifact".' };
  }
  const models = (Array.isArray(args.models) && args.models.length ? args.models : ['openai/gpt-4o', 'google/gemini-2.5-pro']).slice(0, 4);
  const lens = (typeof args.lens === 'string' && args.lens.trim()) ? args.lens.trim() : 'overall correctness, security, and missing/edge cases';
  const sys = 'You are an independent adversarial reviewer from a different model family. Try to REFUTE the ' +
    'artifact through the given lens. Reply with ONLY a JSON object: {"refuted": boolean, "confidence": ' +
    '"high"|"medium"|"low", "findings": [{"claim": string, "evidence": string, "severity": ' +
    '"blocker"|"major"|"minor"}]}. Default refuted=true when uncertain. No prose outside the JSON.';
  const user = 'LENS: ' + lens + '\n\nARTIFACT:\n' + args.artifact;
  const verdicts = await Promise.all(models.map(async (m) => {
    try {
      const data = await openrouterChat(key, {
        model: m,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        response_format: { type: 'json_object' },
      });
      const content = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      let parsed; try { parsed = JSON.parse(content); } catch (_) { parsed = { refuted: null, raw: String(content).slice(0, 800) }; }
      return { model: m, verdict: parsed };
    } catch (e) { return { model: m, error: e.message }; }
  }));
  return { text: JSON.stringify({ cross_model_verdicts: verdicts }, null, 1) };
}

// ---- JSON-RPC plumbing (newline-delimited stdio) ----
function send(m) { process.stdout.write(JSON.stringify(m) + '\n'); }
function result(id, res) { if (id === undefined || id === null) return; send({ jsonrpc: '2.0', id, result: res }); }
function error(id, code, message) { if (id === undefined || id === null) return; send({ jsonrpc: '2.0', id, error: { code, message } }); }

async function handle(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize': {
      const r = params && params.protocolVersion;
      return result(id, {
        protocolVersion: (typeof r === 'string' && SUPPORTED_PROTOCOLS.has(r)) ? r : DEFAULT_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return;
    case 'ping': return result(id, {});
    case 'tools/list': return result(id, { tools: TOOLS });
    case 'tools/call': {
      const name = params && params.name;
      const callArgs = (params && params.arguments) || {};
      let out;
      if (name === 'fable_fusion') out = await runFusion(callArgs);
      else if (name === 'fable_cross_verify') out = await runCrossVerify(callArgs);
      else return error(id, -32602, `Unknown tool: ${name}`);
      return result(id, { isError: !!out.isError, content: [{ type: 'text', text: out.text }] });
    }
    default:
      if (id !== undefined && id !== null) return error(id, -32601, `Method not found: ${method}`);
      return;
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const t = line.trim();
  if (!t) return;
  let msg; try { msg = JSON.parse(t); } catch (e) { process.stderr.write(`[fable-fusion] parse error: ${e.message}\n`); return; }
  Promise.resolve(handle(msg)).catch((e) => {
    process.stderr.write(`[fable-fusion] handler error: ${e.stack || e.message}\n`);
    if (msg && msg.id != null) error(msg.id, -32603, `Internal error: ${e.message}`);
  });
});
rl.on('close', () => process.exit(0));
process.stderr.write(`[fable-fusion] MCP server up (optional, network). key=${process.env.OPENROUTER_API_KEY ? 'set' : 'MISSING'} disabled=${process.env.FABLE_FUSION === 'off'}\n`);
