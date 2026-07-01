#!/usr/bin/env node
// Regression for fable_lint proportionality/precedence conflict rules. It drives the actual shipped MCP
// server, so the fixture verifies the live rule rather than a test-local copy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, '..', '..');
const SERVER = path.join(REPO, 'mcp', 'src', 'server.js');
const fixture = JSON.parse(fs.readFileSync(path.join(DIR, 'fixture.json'), 'utf8'));

const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'ignore'] });
const pending = new Map();
let buf = '';
let nid = 1;

child.stdout.on('data', d => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

const rpc = (method, params) => new Promise(resolve => {
  const id = nid++;
  pending.set(id, resolve);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});

const lintRules = async text => {
  const res = await rpc('tools/call', { name: 'fable_lint', arguments: { text } });
  const report = JSON.parse(res.result.content[0].text);
  return (report.violations || []).map(v => v.rule);
};

const conflictRuleSet = new Set([
  'missing-safety-precedence',
  'missing-cap-evidence-trail-exemption',
  'missing-preamble-task-gate',
  'missing-early-stop-grounding-depth',
  'missing-verification-proportionality',
]);

const requiredProfileLines = [
  ['proportionality gate', /Use proportionality|proportionality/i],
  ['safety/project rules outrank decisiveness', /safety[\s\S]{0,180}outrank[\s\S]{0,80}decisiveness/i],
  ['format/length cap exemption for P5/P7', /(Format and length caps constrain prose only|format\/length caps apply only to prose)[\s\S]{0,180}(P5[\s\S]{0,80}P7|P7[\s\S]{0,80}P5)/i],
  ['preamble/progress task-length gate', /(single-step|single step)[\s\S]{0,180}(three or more|three-or-more|three-or-more-step|three-or-more-step work|three-or-more-step)/i],
  ['private reasoning narration ban', /(never[\s\S]{0,80}private reasoning|private reasoning[\s\S]{0,80}never)/i],
  ['early-stop preserves grounding depth', /early-stop[\s\S]{0,120}search breadth[\s\S]{0,120}(not|never)[\s\S]{0,80}grounding depth/i],
  ['verification scales with blast radius', /verification strength scales with blast radius/i],
];

try {
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {} });

  const failures = [];
  for (const c of fixture.cases) {
    const gotRules = await lintRules(c.text);
    const expectedRules = c.rules || [];
    const foundExpected = expectedRules.filter(r => gotRules.includes(r));
    const ok = c.expected === 'flag'
      ? foundExpected.length === expectedRules.length
      : foundExpected.length === 0;
    if (!ok) failures.push({ id: c.id, expected: c.expected, expectedRules, gotRules });
  }

  for (const variant of ['full', 'compact', 'core']) {
    const text = fs.readFileSync(path.join(REPO, 'profiles', `${variant}.md`), 'utf8');
    const missing = requiredProfileLines.filter(([, re]) => !re.test(text)).map(([label]) => label);
    if (missing.length) failures.push({ id: `profile-${variant}`, expected: 'contains priority lines', expectedRules: missing, gotRules: [] });

    const gotRules = (await lintRules(text)).filter(r => conflictRuleSet.has(r));
    if (gotRules.length) failures.push({ id: `profile-${variant}`, expected: 'pass', expectedRules: [], gotRules });
  }

  if (failures.length) {
    console.error('conflict regression failed');
    for (const f of failures) {
      console.error(`- ${f.id}: expected ${f.expected} for ${f.expectedRules.join(', ') || '(none)'}, got ${f.gotRules.join(', ') || '(none)'}`);
    }
    process.exitCode = 1;
  } else {
    console.log('conflict regression passed');
  }
} finally {
  child.stdin.end();
  child.kill();
}
