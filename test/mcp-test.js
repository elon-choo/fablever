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
  check('tools/list has get_fable_profile + fable_lint + fable_status', tools.result && tools.result.tools.length === 3 && ['get_fable_profile', 'fable_lint', 'fable_status'].every(n => tools.result.tools.some(t => t.name === n)), JSON.stringify(tools.result));

  const status = await rpc('tools/call', { name: 'fable_status', arguments: {} });
  check('fable_status returns a config snapshot', status.result && status.result.content && /cost_mode|Cost mode/.test(status.result.content[0].text), JSON.stringify(status.result || status.error));

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

  // --- Decision-trail rules (additive; fire ONLY when a 'Decision trail' block is present) ---
  async function lintReport(text) { const r = await rpc('tools/call', { name: 'fable_lint', arguments: { text } }); return r.result ? JSON.parse(r.result.content[0].text) : null; }
  const ruleNames = rep => ((rep && rep.violations) || []).map(v => v.rule);

  const goodTrail = 'Fixed the intermittent 500s. The Postgres connection pool was leaking clients on the error path, so under load it ran out of connections and roughly one request in fifty failed once traffic climbed. The release call only ran on the success path, which is why nothing showed up in light testing. I moved the release into a finally block so every request returns its client, and I added a regression test that drives the failing path under concurrency to prove the pool no longer drains.\n\nDecision trail:\n- Released the client in a finally block instead of wrapping each query, because db/pool.js:42 showed the leak was only on the throw path.\n- Left the pool size unchanged rather than raising it, since test/pool.test.js now passes with the leak fixed.\n- Not verified / where to look: a real production traffic spike; the test only simulates fifty concurrent calls.';
  const rGood = await lintReport(goodTrail);
  check('fable_lint passes a well-formed grounded decision trail', rGood && rGood.passed === true && !ruleNames(rGood).some(n => n.startsWith('trail') || n === 'ungrounded-trail-line'), JSON.stringify(rGood && { passed: rGood.passed, v: ruleNames(rGood) }));

  const ungroundedTrail = 'Refactored the report builder so the totals are computed once and reused across the three sections, which removes the duplicated aggregation pass and keeps the per-section formatting untouched as before.\n\nDecision trail:\n- I decided the cleaner approach was clearly better and went with it because it felt right at the time.\n- Not verified / where to look: the rounding on the subtotal rows.';
  const rUng = await lintReport(ungroundedTrail);
  check('fable_lint flags an ungrounded trail line', ruleNames(rUng).includes('ungrounded-trail-line'), JSON.stringify(ruleNames(rUng)));

  const bloatTrail = 'Patched the leak.\n\nDecision trail:\n- pool leak -> finally block -> test passes, see db/pool.js:42 and test/pool.test.js for the change and the regression that now guards it under concurrency in CI.';
  const rBloat = await lintReport(bloatTrail);
  check('fable_lint flags a bloated/arrow-chain trail', ruleNames(rBloat).includes('trail-bloat'), JSON.stringify(ruleNames(rBloat)));

  const trivialTrail = 'Use git reset --soft HEAD~1 to undo the commit but keep the changes staged.\n\nDecision trail:\n- Chose a soft reset over a mixed reset because it keeps the changes staged, per `git reset`.';
  const rTriv = await lintReport(trivialTrail);
  check('fable_lint flags a trail on a trivial turn', ruleNames(rTriv).includes('trail-on-trivial'), JSON.stringify(ruleNames(rTriv)));

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
