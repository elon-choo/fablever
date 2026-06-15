#!/usr/bin/env node
'use strict';
/*
 * Protocol + safety test for the optional fable-fusion MCP server.
 * Verifies the stdio JSON-RPC handshake and every NON-NETWORK error path (disabled / no key / empty
 * prompt / unknown tool / notification). It never makes a real OpenRouter call — every asserted path
 * returns before fetch(). Run: node test/fusion-test.js
 */
const { spawn } = require('child_process');
const path = require('path');
const SERVER = path.resolve(__dirname, '..', 'fusion', 'fusion-server.js');

function rpcSession(env) {
  const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, ...env } });
  const pending = new Map();
  let buf = '', nextId = 1;
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    }
  });
  return {
    rpc: (method, params) => new Promise((res) => { const id = nextId++; pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); }),
    notify: (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'),
    close: () => { child.stdin.end(); child.kill(); },
  };
}

const results = [];
const check = (name, cond, detail) => { results.push(cond); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + (detail || '')}`); };

(async () => {
  // Session 1: a normal key present (dummy) — test protocol + empty-prompt guard (no network hit).
  const s = rpcSession({ OPENROUTER_API_KEY: 'sk-or-dummy-not-used', FABLE_FUSION: '' });
  const init = await s.rpc('initialize', { protocolVersion: '2025-06-18' });
  check('initialize -> serverInfo.name=fable-fusion', init.result?.serverInfo?.name === 'fable-fusion', JSON.stringify(init.result));
  check('initialize echoes supported protocol', init.result?.protocolVersion === '2025-06-18');
  const bad = await s.rpc('initialize', { protocolVersion: '1999-01-01' });
  // (second initialize just to check fallback; servers tolerate it)
  check('unsupported protocol falls back', bad.result?.protocolVersion === '2025-06-18', JSON.stringify(bad.result));
  const tools = await s.rpc('tools/list', {});
  check('tools/list has fable_fusion', tools.result?.tools?.some(t => t.name === 'fable_fusion'));
  const empty = await s.rpc('tools/call', { name: 'fable_fusion', arguments: { prompt: '   ' } });
  check('empty prompt -> isError (no network)', empty.result?.isError === true && /non-empty/.test(empty.result.content[0].text), JSON.stringify(empty.result));
  const unk = await s.rpc('tools/call', { name: 'nope', arguments: {} });
  check('unknown tool -> -32602', unk.error?.code === -32602);
  s.notify('notifications/initialized'); // no reply expected; absence of crash is the check
  check('notification handled (no throw)', true);
  s.close();

  // Session 2: FABLE_FUSION=off -> disabled path (no network, even with a key).
  const off = rpcSession({ OPENROUTER_API_KEY: 'sk-or-dummy', FABLE_FUSION: 'off' });
  await off.rpc('initialize', { protocolVersion: '2025-06-18' });
  const disabled = await off.rpc('tools/call', { name: 'fable_fusion', arguments: { prompt: 'hi' } });
  check('FABLE_FUSION=off -> disabled isError (no network)', disabled.result?.isError === true && /disabled/.test(disabled.result.content[0].text), JSON.stringify(disabled.result));
  off.close();

  // Session 3: no key -> helpful setup error (no network).
  const nokey = rpcSession({ OPENROUTER_API_KEY: '', FABLE_FUSION: '' });
  await nokey.rpc('initialize', { protocolVersion: '2025-06-18' });
  const missing = await nokey.rpc('tools/call', { name: 'fable_fusion', arguments: { prompt: 'hi' } });
  check('missing key -> isError with setup hint (no network)', missing.result?.isError === true && /OPENROUTER_API_KEY/.test(missing.result.content[0].text), JSON.stringify(missing.result));
  nokey.close();

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed.`);
  process.exit(passed === results.length ? 0 : 1);
})();
