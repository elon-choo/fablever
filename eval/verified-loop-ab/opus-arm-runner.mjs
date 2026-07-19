#!/usr/bin/env node
// Default live model adapter for the G3.6 harness.
// run.mjs is the authority for the owner-budget and baseline-attestation gates;
// this adapter repeats both checks so invoking it directly also fails closed.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const STOP_GATE = path.resolve(DIR, '..', '..', 'claude-code', 'hooks', 'fable-stopgate.js');

function fail(message, code = 2) {
  process.stderr.write(`opus-arm-runner: ${message}\n`);
  process.exit(code);
}

if (!String(process.env.FABLE_OPUS_BUDGET_CONFIRMED || '').trim()) {
  fail('missing harness-provided budget confirmation', 3);
}
if (process.env.FABLE_OPUS_BASELINE_ATTESTED !== '1') {
  fail('missing harness-verified one-shot baseline attestation', 3);
}

let request;
try {
  request = JSON.parse(readFileSync(0, 'utf8'));
} catch (error) {
  fail(`invalid request JSON (${error.message})`);
}

for (const field of ['arm', 'task_id', 'phase', 'prompt', 'workspace_dir']) {
  if (typeof request?.[field] !== 'string' || request[field].trim() === '') {
    fail(`request.${field} must be a non-empty string`);
  }
}

const claudeBin = process.env.FABLE_CLAUDE_BIN || 'claude';
const model = request.model || process.env.FABLE_OPUS_MODEL || 'claude-opus-4-8';
const outputStyle = request.output_style === 'fable' ? 'Fable' : 'default';
const settings = { outputStyle };
if (request.stop_gate === true) {
  settings.hooks = {
    Stop: [
      {
        hooks: [
          {
            type: 'command',
            command: `${JSON.stringify(process.execPath)} ${JSON.stringify(STOP_GATE)}`,
            timeout: 10,
          },
        ],
      },
    ],
  };
}

const args = [
  '-p',
  request.prompt,
  '--model',
  model,
  '--output-format',
  'json',
  '--permission-mode',
  'bypassPermissions',
  '--tools',
  'Read,Edit,Write',
  '--allowedTools',
  'Read,Edit,Write',
  '--disallowedTools',
  'Bash,Glob,Grep,WebFetch,WebSearch,Task',
  '--strict-mcp-config',
  '--mcp-config',
  '{"mcpServers":{}}',
  '--disable-slash-commands',
  '--no-session-persistence',
  '--no-chrome',
  '--settings',
  JSON.stringify(settings),
];
const command = /\.[cm]?js$/i.test(claudeBin) ? process.execPath : claudeBin;
const commandArgs = command === process.execPath ? [claudeBin, ...args] : args;
const execution = spawnSync(command, commandArgs, {
  cwd: path.resolve(request.workspace_dir),
  encoding: 'utf8',
  timeout: Number.isInteger(request.timeout_ms) ? request.timeout_ms : 15 * 60 * 1000,
  maxBuffer: 64 * 1024 * 1024,
  windowsHide: true,
  env: {
    ...process.env,
    CLAUDE_NO_SUMMARIZE: '1',
    FABLE_PROFILE: request.output_style === 'fable' || request.stop_gate === true ? 'on' : 'off',
  },
});

if (execution.error) fail(`Claude process failed (${execution.error.message})`, 4);
if (execution.signal) fail(`Claude process terminated by ${execution.signal}`, 4);
if (execution.status !== 0) {
  fail(`Claude process exited ${String(execution.status)}: ${String(execution.stderr || '').trim()}`, 4);
}

let result;
try {
  result = JSON.parse(String(execution.stdout || '').trim());
} catch (error) {
  fail(`Claude JSON output was invalid (${error.message})`, 4);
}

const sourceUsage = result?.usage && typeof result.usage === 'object'
  ? result.usage
  : result?.result?.usage && typeof result.result.usage === 'object'
    ? result.result.usage
    : {};
const input = [
  sourceUsage.input_tokens,
  sourceUsage.cache_creation_input_tokens,
  sourceUsage.cache_read_input_tokens,
].reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
const output = Number.isFinite(sourceUsage.output_tokens) ? sourceUsage.output_tokens : 0;
const finalMessage = typeof result?.result === 'string'
  ? result.result
  : typeof result?.result?.text === 'string'
    ? result.result.text
    : typeof result?.message === 'string'
      ? result.message
      : '';

process.stdout.write(JSON.stringify({
  usage: {
    input,
    output,
    total: input + output,
    input_tokens: sourceUsage.input_tokens ?? null,
    output_tokens: sourceUsage.output_tokens ?? null,
    cache_creation_input_tokens: sourceUsage.cache_creation_input_tokens ?? null,
    cache_read_input_tokens: sourceUsage.cache_read_input_tokens ?? null,
  },
  final_message: finalMessage,
  provider: 'claude-code',
  model,
}) + '\n');
