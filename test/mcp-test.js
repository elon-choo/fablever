#!/usr/bin/env node
'use strict';
/*
 * Protocol test for the zero-dependency fable-profile MCP server.
 * Spawns the server, drives a full stdio JSON-RPC handshake, asserts the responses.
 * Exit 0 = all pass. Run: node test/mcp-test.js
 */
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const SERVER = path.resolve(__dirname, '..', 'mcp', 'src', 'server.js');
// Hermetic taste-memory store: never touch the user's real ~/.claude/fable-profile/taste.json.
const TASTE_FILE = path.join(os.tmpdir(), `fable-taste-test-${process.pid}.json`);
try { require('fs').unlinkSync(TASTE_FILE); } catch {}
const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, FABLE_TASTE_FILE: TASTE_FILE, FABLE_TASTE: '' } });

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
  check('tools/list has all 5 tools', tools.result && tools.result.tools.length === 5 && ['get_fable_profile', 'fable_lint', 'fable_status', 'fable_check', 'fable_taste'].every(n => tools.result.tools.some(t => t.name === n)), JSON.stringify(tools.result));

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

  // --- unsupported "done/works" claim rule (A5): the wording-level guard, EN + KO ---
  const hasUnsupported = rep => ruleNames(rep).includes('unsupported-done-claim');
  const sevOf = (rep, rule) => ((rep && rep.violations) || []).filter(v => v.rule === rule).map(v => v.severity);
  const u1 = await lintReport('Fixed. It works now.');
  check('fable_lint FLAGS an unsupported "it works" claim (high)', hasUnsupported(u1) && sevOf(u1, 'unsupported-done-claim').includes('high') && u1.passed === false, JSON.stringify({ v: ruleNames(u1), passed: u1.passed }));
  const u2 = await lintReport('Fixed. Verified with `npm test`.');
  check('fable_lint PASSES a done-claim that shows the check', !hasUnsupported(u2), JSON.stringify(ruleNames(u2)));
  const u3 = await lintReport('Implemented, but not verified yet.');
  check('fable_lint PASSES a done-claim explicitly marked not-verified', !hasUnsupported(u3), JSON.stringify(ruleNames(u3)));
  const k1 = await lintReport('고쳤고 작동합니다.');
  check('fable_lint FLAGS an unsupported Korean done-claim', hasUnsupported(k1) && k1.passed === false, JSON.stringify({ v: ruleNames(k1), passed: k1.passed }));
  const k2 = await lintReport('고쳤습니다. `npm test`로 확인했습니다.');
  check('fable_lint PASSES a Korean done-claim that shows the check', !hasUnsupported(k2), JSON.stringify(ruleNames(k2)));
  const k3 = await lintReport('수정했지만 아직 검증하지 못했습니다.');
  check('fable_lint PASSES a Korean done-claim marked not-verified', !hasUnsupported(k3), JSON.stringify(ruleNames(k3)));

  // --- instructions (B6): initialize returns server-wide guidance; first 512 chars self-contained ---
  const ins = (init.result && init.result.instructions) || '';
  const head = ins.slice(0, 512);
  check('initialize returns server instructions', ins.length > 100, String(ins.length));
  check('instructions head includes evidence-grounded + fable_check + safety', /evidence-grounded/.test(head) && /fable_check/.test(head) && /[Ss]afety/.test(head), head.slice(0, 120));

  // --- fable_check: the deterministic delivery gate (per-domain Definition of Done) ---
  async function checkReport(text, dod) { const r = await rpc('tools/call', { name: 'fable_check', arguments: { text, dod_id: dod } }); return r.result ? JSON.parse(r.result.content[0].text) : null; }
  // One GOOD deliverable per domain must clear the gate (gate=PASS, no FAIL); each carries exactly the
  // human-confirm item(s) as UNCHECKED — proving UNCHECKED never auto-passes AND never blocks on its own.
  const GOOD = {
    'code': 'Fixed the auth timeout. The token refresh used wall-clock time, so a backward NTP step made it think the token was still valid. I switched it to monotonic time in auth/refresh.js and the previously failing test in auth/refresh.test.js now passes.',
    'doc-planning': 'Recommend shipping the email-capture gate behind a feature flag this sprint. It is reversible, and the one open assumption is that legal has cleared the consent copy (TBD — flagging for veto). Below: the three options I weighed and why the flag wins.',
    'research': 'Switching to server-side rendering is the right call for this app. Core Web Vitals data (Google, 2023) shows LCP is the dominant ranking factor for our traffic, and our current build measured 4.1s LCP in lighthouse.json. What would overturn this: if most traffic is logged-in users, the SEO benefit largely disappears — that is the key limitation to check.',
    'marketing-copy': 'Your inbox, finally quiet. Stop drowning in newsletters you never read — one tap unsubscribes you from all of them. Start free today.',
    'funnel-design': 'Goal: lift signup-to-activation conversion over the next 4 weeks. The biggest bottleneck is the email-verification step, where we lose the most users. Run the magic-link test first; hold the onboarding-checklist redesign for later.',
  };
  for (const [dod, text] of Object.entries(GOOD)) {
    const rep = await checkReport(text, dod);
    check(`fable_check passes a good ${dod} deliverable`, rep && rep.ok && rep.gate === 'PASS' && rep.fail_count === 0, JSON.stringify(rep && { gate: rep.gate, fails: rep.items.filter(i => i.status === 'FAIL').map(i => i.id) }));
    check(`fable_check leaves the ${dod} human item UNCHECKED (never auto-passed)`, rep && rep.unchecked_count >= 1 && rep.items.some(i => i.status === 'UNCHECKED'), JSON.stringify(rep && rep.unchecked_count));
  }
  // One BAD deliverable per domain must BLOCK on the expected acceptance item.
  const BAD = {
    'code': ['Fixed the auth timeout and made it 40% faster. It works now.', 'C-test'],
    'doc-planning': ['This document will walk through the various considerations involved in our onboarding flow and explore several possible directions we might take.', 'D-lead'],
    'research': ['Let me walk through the options. SSR is generally considered better and most people think it improves performance quite a lot.', 'R-overturn'],
    'marketing-copy': ['Join now, buy our pro plan, and download the app today.', 'M-cta'],
    'funnel-design': ['We should improve the funnel and make the experience better so more people convert eventually.', 'F-goal'],
  };
  for (const [dod, [text, expectFail]] of Object.entries(BAD)) {
    const rep = await checkReport(text, dod);
    const fails = rep ? rep.items.filter(i => i.status === 'FAIL').map(i => i.id) : [];
    check(`fable_check BLOCKs a bad ${dod} deliverable on ${expectFail}`, rep && rep.gate === 'BLOCK' && fails.includes(expectFail), JSON.stringify(fails));
  }
  const badDod = await checkReport('x', 'no-such-domain');
  check('fable_check rejects an unknown dod_id', badDod && badDod.ok === false && /unknown dod_id/.test(badDod.error), JSON.stringify(badDod));
  const noArgs = await rpc('tools/call', { name: 'fable_check', arguments: { text: 'x' } });
  check('fable_check without dod_id returns invalid-params error', noArgs.error && noArgs.error.code === -32602, JSON.stringify(noArgs));

  // --- fable_taste: on/off store; rules become hard gate items inside fable_check ---
  async function taste(a) { const r = await rpc('tools/call', { name: 'fable_taste', arguments: a }); return r.result ? JSON.parse(r.result.content[0].text) : r.error; }
  const stat0 = await taste({ action: 'status' });
  check('fable_taste starts empty and enabled', stat0 && stat0.ok && stat0.enabled === true && stat0.count === 0, JSON.stringify(stat0));
  const added = await taste({ action: 'add', domain: 'marketing-copy', kind: 'rule', text: 'never say "happy users"', forbid: 'happy users' });
  check('fable_taste add (rule) succeeds', added && added.ok && added.count === 1 && added.added.id, JSON.stringify(added));
  // The saved rule must now BLOCK a marketing deliverable that violates it.
  const tasteHit = await checkReport('Your inbox, finally quiet. Join our happy users and start free today.', 'marketing-copy');
  check('a taste rule becomes a hard FAIL in fable_check', tasteHit && tasteHit.taste_applied === true && tasteHit.gate === 'BLOCK' && tasteHit.items.some(i => i.id.startsWith('taste:') && i.status === 'FAIL'), JSON.stringify(tasteHit && { gate: tasteHit.gate, taste_applied: tasteHit.taste_applied }));
  // A soft note is surfaced as UNCHECKED, never auto-passed.
  const addedNote = await taste({ action: 'add', domain: 'marketing-copy', kind: 'note', text: 'keep the tone calm, not hypey' });
  check('fable_taste add (note) succeeds', addedNote && addedNote.ok && addedNote.count === 2, JSON.stringify(addedNote));
  const withNote = await checkReport('Your inbox, finally quiet. Start free today.', 'marketing-copy');
  check('a taste note is surfaced UNCHECKED (never auto-passed)', withNote && withNote.items.some(i => i.id.startsWith('taste:') && /taste note/.test(i.label) && i.status === 'UNCHECKED'), JSON.stringify(withNote && withNote.items.filter(i => i.id.startsWith('taste:')).map(i => [i.id, i.status])));
  // Turn the store OFF: taste must stop being applied (on/off requirement).
  const off = await taste({ action: 'off' });
  check('fable_taste off flips active=false', off && off.ok && off.active === false, JSON.stringify(off));
  const afterOff = await checkReport('Your inbox, finally quiet. Join our happy users and start free today.', 'marketing-copy');
  check('with taste OFF, no taste rule is applied', afterOff && afterOff.taste_applied === false && !afterOff.items.some(i => i.id.startsWith('taste:')), JSON.stringify(afterOff && afterOff.taste_applied));
  const listOff = await taste({ action: 'list', domain: 'marketing-copy' });
  check('fable_taste list returns nothing while OFF', listOff && listOff.applied === false && listOff.count === 0, JSON.stringify(listOff));
  // Back ON, then remove the rule.
  await taste({ action: 'on' });
  const listOn = await taste({ action: 'list', domain: 'marketing-copy' });
  check('fable_taste list returns saved prefs while ON', listOn && listOn.applied === true && listOn.count === 2, JSON.stringify(listOn && listOn.count));
  const removed = await taste({ action: 'remove', id: added.added.id });
  check('fable_taste remove deletes by id', removed && removed.ok && removed.removed === 1 && removed.count === 1, JSON.stringify(removed));

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
  try { require('fs').unlinkSync(TASTE_FILE); } catch {}
  process.exit(failed.length === 0 ? 0 : 1);
})();
