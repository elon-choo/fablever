#!/usr/bin/env node
'use strict';
/*
 * Protocol test for the zero-dependency fable-profile MCP server.
 * Spawns the server, drives a full stdio JSON-RPC handshake, asserts the responses.
 * Exit 0 = all pass. Run: node test/mcp-test.js
 */
const { spawn } = require('child_process');
const path = require('path');

const SERVER = path.resolve(__dirname, '..', 'mcp', 'src', 'server.js');
const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });

const pending = new Map();
let buf = '';
child.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});

let nextId = 1;
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + (detail || '')}`);
}

(async () => {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  check('initialize returns serverInfo.name', init.result && init.result.serverInfo && init.result.serverInfo.name === 'fable-profile', JSON.stringify(init.result || init.error));
  check('initialize echoes protocolVersion', init.result && init.result.protocolVersion === '2025-06-18', JSON.stringify(init.result));
  check('initialize advertises tools+prompts+resources', init.result && init.result.capabilities && init.result.capabilities.tools && init.result.capabilities.prompts && init.result.capabilities.resources, JSON.stringify(init.result && init.result.capabilities));

  notify('notifications/initialized');

  const tools = await rpc('tools/list', {});
  check('tools/list has get_fable_profile + fable_lint', tools.result && tools.result.tools.length === 2 && tools.result.tools.some(t => t.name === 'get_fable_profile') && tools.result.tools.some(t => t.name === 'fable_lint'), JSON.stringify(tools.result));

  const prof = await rpc('tools/call', { name: 'get_fable_profile', arguments: { variant: 'core' } });
  check('get_fable_profile returns text content', prof.result && prof.result.content && prof.result.content[0].type === 'text' && prof.result.content[0].text.length > 20, JSON.stringify(prof.result || prof.error));

  // fable_lint on a deliberately bad draft should flag multiple high-severity issues.
  const badDraft = 'Let me start by analyzing the code. parse → validate → store. I also refactored the surrounding helper while I was at it. Would you like me to continue?';
  const lint = await rpc('tools/call', { name: 'fable_lint', arguments: { text: badDraft } });
  const report = lint.result ? JSON.parse(lint.result.content[0].text) : null;
  check('fable_lint flags the bad draft', report && report.passed === false && report.violation_count >= 3, JSON.stringify(report));
  check('fable_lint catches arrow-chain', report && report.violations.some(v => v.rule === 'arrow-chain-shorthand'), report && JSON.stringify(report.violations.map(v => v.rule)));
  check('fable_lint catches scope-creep', report && report.violations.some(v => v.rule === 'unrequested-scope-creep'), report && JSON.stringify(report.violations.map(v => v.rule)));
  check('fable_lint catches permission-ending', report && report.violations.some(v => v.rule === 'ends-on-permission-or-hedge'), report && JSON.stringify(report.violations.map(v => v.rule)));

  // A clean draft should pass.
  const goodDraft = 'Fixed the auth timeout: the token refresh was using the wrong clock. Changed it to monotonic time in auth/refresh.js and the failing test now passes.';
  const lint2 = await rpc('tools/call', { name: 'fable_lint', arguments: { text: goodDraft } });
  const report2 = lint2.result ? JSON.parse(lint2.result.content[0].text) : null;
  check('fable_lint passes a clean draft', report2 && report2.passed === true, JSON.stringify(report2));

  const prompts = await rpc('prompts/list', {});
  check('prompts/list has fable-mode', prompts.result && prompts.result.prompts.some(p => p.name === 'fable-mode'), JSON.stringify(prompts.result));

  const pget = await rpc('prompts/get', { name: 'fable-mode', arguments: {} });
  check('prompts/get fable-mode returns a message', pget.result && pget.result.messages && pget.result.messages[0].content.text.length > 20, JSON.stringify(pget.result || pget.error));

  const res = await rpc('resources/list', {});
  check('resources/list has 3 profile resources', res.result && res.result.resources.length === 3, JSON.stringify(res.result));

  const rread = await rpc('resources/read', { uri: 'fable://profile/core' });
  check('resources/read fable://profile/core returns text', rread.result && rread.result.contents && rread.result.contents[0].text.length > 20, JSON.stringify(rread.result || rread.error));

  const unknown = await rpc('tools/call', { name: 'nope', arguments: {} });
  check('unknown tool returns JSON-RPC error', unknown.error && unknown.error.code === -32602, JSON.stringify(unknown));

  const noArg = await rpc('tools/call', { name: 'fable_lint', arguments: {} });
  check('fable_lint without text returns invalid-params error', noArg.error && noArg.error.code === -32602, JSON.stringify(noArg));

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  child.stdin.end();
  child.kill();
  process.exit(failed.length === 0 ? 0 : 1);
})();
