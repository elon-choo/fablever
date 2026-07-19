#!/usr/bin/env node
// G5.4 — fail-closed opt-in manifest + v1.3.0 default-behavior audit.
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_RUNTIME_SURFACES,
  OPTIN_MANIFEST_PATH,
  auditFlagSets,
  auditRepositoryFlags,
  captureBehavioralReport,
  loadOptinManifest,
  scanSourceEnvReads,
} from '../tools/v130-behavioral-snapshot.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL = path.join(REPO, 'install.mjs');
const EXPECTED_UPGRADE_FLAGS = Object.freeze([
  'FABLE_BUDGET_CONFIG',
  'FABLE_BUDGET_CONFIG_FILE',
  'FABLE_CLAUDE_BIN',
  'FABLE_MEASURE',
  'FABLE_MEASURE_CAMPAIGN',
  'FABLE_MEASURE_HOME',
  'FABLE_MEASURE_OFF_PCT',
  'FABLE_MEASURE_TEXT_SIGNALS',
  'FABLE_OPUS_BASELINE_ATTESTED',
  'FABLE_OPUS_BUDGET_CONFIRMED',
  'FABLE_OPUS_MODEL',
  'FABLE_ORCHESTRATION_PREFLIGHT',
  'FABLE_PROGRESS_CONTINUATION',
  'FABLE_READONLY_VERIFIER',
  'FABLE_TASK_CRITERIA',
  'FABLE_ULTRA',
  'FABLE_VERIFIED_LOOP',
  'FABLE_VERIFIER_HOOK_EXEMPTION',
]);
const EXPECTED_BASELINE_FLAGS = Object.freeze([
  'FABLE_CODEX_BIN',
  'FABLE_FUSION',
  'FABLE_HOME',
  'FABLE_HOOK_TRACE_FILE',
  'FABLE_HOST',
  'FABLE_MODELCHECK',
  'FABLE_MODELCHECK_REFRESH',
  'FABLE_ONBOARD',
  'FABLE_PROFILE',
  'FABLE_PROFILE_HOME',
  'FABLE_STOP_GATE',
  'FABLE_TASTE',
  'FABLE_TASTE_FILE',
  'FABLE_TS',
  'FABLE_UPDATE_CHECK',
  'FABLE_XVERIFY',
]);

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL ${name} — ${error.message}`);
  }
}

function installerPlan(readonlyValue) {
  const home = mkdtempSync(path.join(os.tmpdir(), 'fable-optin-plan-'));
  try {
    const env = {
      PATH: process.env.PATH || '',
      HOME: home,
      USERPROFILE: home,
      CI: '1',
      LANG: 'C',
      LC_ALL: 'C',
    };
    if (readonlyValue !== undefined) env.FABLE_READONLY_VERIFIER = readonlyValue;
    if (process.platform === 'win32') {
      if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
      if (process.env.WINDIR) env.WINDIR = process.env.WINDIR;
    }
    const result = spawnSync(process.execPath, [INSTALL, '--dry-run', '--json'], {
      cwd: REPO,
      env,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

console.log('G5.4 additive/default-off integration audit:');
const manifest = loadOptinManifest();
const upgradeNames = manifest.flags.map(entry => entry.name);
const manifestNames = [...manifest.baselineEnvReads, ...upgradeNames];

check('flag manifest is complete, unique, sorted, and carries no approved carve-out', () => {
  assert.equal(manifest.schemaVersion, 1);
  // The baseline MUST be the immutable v1.3.0 release tag, never the moving HEAD: a HEAD baseline
  // self-compares the moment the upgrade is committed, silently killing this proof (G5.5 finding H-1).
  assert.equal(manifest.baselineRef, 'v1.3.0');
  assert.deepEqual(manifest.approvedCarveOuts, []);
  assert.deepEqual(manifest.baselineEnvReads, EXPECTED_BASELINE_FLAGS);
  assert.deepEqual(upgradeNames, EXPECTED_UPGRADE_FLAGS);
  assert.deepEqual(manifest.baselineEnvReads, [...manifest.baselineEnvReads].sort());
  assert.deepEqual(upgradeNames, [...upgradeNames].sort());
  assert.equal(new Set(manifestNames).size, manifestNames.length);
});

check('every manifest entry defaults inactive and defines a reproducible off environment', () => {
  for (const entry of manifest.flags) {
    assert.deepEqual(
      Object.keys(entry).sort(),
      ['defaultEnabled', 'defaultEnv', 'name', 'purpose', 'snapshotOffEnv'].sort(),
      entry.name,
    );
    assert.equal(entry.defaultEnabled, false, entry.name);
    assert.equal(entry.defaultEnv, null, entry.name);
    assert.match(entry.name, /^FABLE_[A-Z_]+$/);
    assert.equal(typeof entry.purpose, 'string');
    assert(entry.purpose.trim().length > 0, entry.name);
    assert(
      entry.snapshotOffEnv === null || typeof entry.snapshotOffEnv === 'string',
      entry.name,
    );
  }
});

check('scanner recognizes direct, bracket, constant, destructured, and shell env reads', () => {
  const javascript = scanSourceEnvReads(`
    const GATE = 'FABLE_VERIFIED_LOOP';
    const a = process.env.FABLE_MEASURE;
    const b = process.env['FABLE_READONLY_VERIFIER'];
    const c = env?.[GATE];
    const { FABLE_ULTRA: mode } = process.env;
    const d = process["env"].FABLE_OPUS_MODEL;
    const e = process.env[\`FABLE_CLAUDE_BIN\`];
    const runtimeEnv = process.env;
    const f = runtimeEnv.FABLE_STOP_GATE;
    const g = (process.env).FABLE_TASTE;
    const h = Reflect.get(process.env, 'FABLE_XVERIFY');
    const i = Object.hasOwn(process.env, 'FABLE_FUSION');
  `, 'fixture.mjs');
  assert.deepEqual(javascript.names, [
    'FABLE_CLAUDE_BIN',
    'FABLE_FUSION',
    'FABLE_MEASURE',
    'FABLE_OPUS_MODEL',
    'FABLE_READONLY_VERIFIER',
    'FABLE_STOP_GATE',
    'FABLE_TASTE',
    'FABLE_ULTRA',
    'FABLE_VERIFIED_LOOP',
    'FABLE_XVERIFY',
  ]);
  assert.deepEqual(javascript.unresolved, []);
  const dynamic = scanSourceEnvReads(
    'const value = process.env[prefix + "FABLE_BUDGET_CONFIG"];\n',
    'dynamic.mjs',
  );
  assert.deepEqual(dynamic.names, ['FABLE_BUDGET_CONFIG']);
  assert.equal(dynamic.unresolved.length, 1);
  const shell = scanSourceEnvReads(
    'printf "%s" "${FABLE_MEASURE_HOME:-}" "$FABLE_PROGRESS_CONTINUATION" "${FABLE_UPDATE_CHECK-off}"\n',
    'fixture.sh',
  );
  assert.deepEqual(shell.names, [
    'FABLE_MEASURE_HOME',
    'FABLE_PROGRESS_CONTINUATION',
    'FABLE_UPDATE_CHECK',
  ]);
  const shadowed = scanSourceEnvReads(`
    { const FLAG = 'FABLE_AUDIT_UNREGISTERED'; void process.env[FLAG]; }
    { const FLAG = 'FABLE_READONLY_VERIFIER'; void FLAG; }
  `, 'shadowed.mjs');
  assert.deepEqual(shadowed.names, [
    'FABLE_AUDIT_UNREGISTERED',
    'FABLE_READONLY_VERIFIER',
  ]);
});

check('seeded unregistered flag fixture fails closed', () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'fable-optin-unregistered-'));
  try {
    const file = path.join(fixture, 'unregistered.mjs');
    writeFileSync(file, 'export const enabled = process.env.FABLE_AUDIT_UNREGISTERED === "on";\n');
    const current = scanSourceEnvReads(readFileSync(file, 'utf8'), 'unregistered.mjs');
    assert.throws(
      () => auditFlagSets({
        current,
        baseline: { names: [], unresolved: [] },
        manifestNames,
      }),
      /UNREGISTERED flag\(s\): FABLE_AUDIT_UNREGISTERED/,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

check('a HEAD-known name is not globally grandfathered when omitted from the manifest', () => {
  assert.throws(
    () => auditFlagSets({
      current: { names: ['FABLE_AUDIT_UNREGISTERED'], unresolved: [] },
      baseline: { names: ['FABLE_AUDIT_UNREGISTERED'], unresolved: [] },
      manifestNames,
    }),
    /UNREGISTERED flag\(s\): FABLE_AUDIT_UNREGISTERED/,
  );
});

check('registered seeded flag fixture passes', () => {
  const current = scanSourceEnvReads(
    'export const enabled = process.env.FABLE_READONLY_VERIFIER === "on";\n',
    'registered.mjs',
  );
  assert.doesNotThrow(() => auditFlagSets({
    current,
    baseline: { names: [], unresolved: [] },
    manifestNames,
  }));
});

let repositoryAudit;
check('real-tree fail-closed scan passes and every manifest flag is exercised by code', () => {
  repositoryAudit = auditRepositoryFlags(manifest);
  for (const name of manifestNames) {
    assert(repositoryAudit.currentFlags.includes(name), `${name} is not read by scanned code`);
  }
  assert.deepEqual(repositoryAudit.registeredBaselineFlags, EXPECTED_BASELINE_FLAGS);
  assert.deepEqual(repositoryAudit.registeredUpgradeFlags, EXPECTED_UPGRADE_FLAGS);
  assert.deepEqual(repositoryAudit.registeredFlags, [...manifestNames].sort());
});

check('read-only verifier installer is off by default and appears only with explicit opt-in', () => {
  const absent = JSON.stringify(installerPlan(undefined));
  assert(!absent.includes('fable-readonly-verifier.md'));
  assert(!absent.includes('fable-readonly-verifier-gate.js'));
  const off = JSON.stringify(installerPlan('off'));
  assert(!off.includes('fable-readonly-verifier.md'));
  assert(!off.includes('fable-readonly-verifier-gate.js'));
  const on = JSON.stringify(installerPlan('on'));
  assert(on.includes('fable-readonly-verifier.md'));
  assert(on.includes('fable-readonly-verifier-gate.js'));
});

let behavioralReport;
check('HEAD behavioral snapshot covers every named shipped surface', () => {
  behavioralReport = captureBehavioralReport(manifest);
  assert.equal(behavioralReport.baselineRef, 'HEAD');
  assert.equal(behavioralReport.upgradeFlagEnvironment, 'absent');
  assert.deepEqual(behavioralReport.surfaceList, DEFAULT_RUNTIME_SURFACES);
  assert.deepEqual(DEFAULT_RUNTIME_SURFACES, [
    'hooks',
    'mcp',
    'installFileFootprint',
    'recipeDispatch',
  ]);
  for (const surface of [
    'claudeSubagent',
    'shellReinject',
    'codexHooks',
    'installerOutput',
    'mcp',
    'recipes',
    'skills',
    'stopGate',
    'uninstallOwnership',
  ]) {
    assert(surface in behavioralReport.baseline, surface);
    assert(surface in behavioralReport.current, surface);
  }
  assert.deepEqual(behavioralReport.current.codexHooks.files, [
    'codex/hooks/fable-reinject.js',
    'codex/hooks/fable-session.js',
    'codex/hooks/fable-subagent.js',
  ]);
  const uninstallPlan = behavioralReport.current.installerOutput.nodeUninstallDryRun;
  assert.equal(uninstallPlan.status, 0);
  assert.deepEqual(
    uninstallPlan,
    behavioralReport.baseline.installerOutput.nodeUninstallDryRun,
  );
  assert.doesNotMatch(JSON.stringify(uninstallPlan.plan), /fable-readonly-verifier/);
});

check('MCP default tools/list and normal fable_check bytes match HEAD', () => {
  const stdout = result => Buffer.from(result.stdoutBase64, 'base64').toString('utf8');
  const parseRpc = result => JSON.parse(stdout(result).trim().split('\n').at(-1));
  const baselineList = behavioralReport.baseline.mcp.toolsList;
  const currentList = behavioralReport.current.mcp.toolsList;
  assert.equal(baselineList.status, 0);
  assert.equal(currentList.status, 0);
  assert.equal(baselineList.stdoutByteLength, 4273);
  assert.equal(currentList.stdoutByteLength, baselineList.stdoutByteLength);
  assert.equal(currentList.stdoutBase64, baselineList.stdoutBase64);
  assert.deepEqual(
    behavioralReport.current.mcp.normalFableCheck,
    behavioralReport.baseline.mcp.normalFableCheck,
  );
  const tools = parseRpc(currentList).result.tools;
  const fableCheck = tools.find(tool => tool.name === 'fable_check');
  assert.ok(fableCheck);
  assert.equal(Object.hasOwn(fableCheck.inputSchema.properties, 'task_criteria'), false);
  for (const probe of ['validHiddenTaskCriteria', 'numericHiddenTaskCriteria']) {
    assert.deepEqual(
      behavioralReport.current.mcp[probe],
      behavioralReport.current.mcp.normalFableCheck,
      `${probe}: hidden field changed the flag-off response`,
    );
    const response = parseRpc(behavioralReport.current.mcp[probe]);
    assert.equal(Object.hasOwn(response, 'error'), false, probe);
    const report = JSON.parse(response.result.content[0].text);
    assert.equal(Object.hasOwn(report, 'task_criteria'), false, probe);
  }
  for (const installer of ['nodeInstall', 'shellInstall']) {
    const installed = behavioralReport.current.installerOutput[installer].installedMcp;
    if (process.platform === 'win32' && installer === 'shellInstall') {
      assert.equal(installed, null);
      continue;
    }
    assert.ok(installed, `${installer}: installed MCP was not probed`);
    assert.equal(installed.toolsList.stdoutBase64, baselineList.stdoutBase64, installer);
    assert.deepEqual(
      installed,
      behavioralReport.baseline.installerOutput[installer].installedMcp,
      installer,
    );
  }
});

// On-demand skill text is opt-in behavior. Default parity locks the installed path
// set to HEAD while these checks retain source-to-install copy integrity.
check('default installed skill set matches HEAD while on-demand bodies may evolve', () => {
  const { baseline, current } = behavioralReport;
  const names = snapshot => Object.keys(snapshot).sort();
  assert.deepEqual(
    names(current.skills.installedClaude),
    names(baseline.skills.installedClaude),
    'Claude installed skill set',
  );
  assert.deepEqual(
    names(current.skills.installedCodex.skillFiles),
    names(baseline.skills.installedCodex.skillFiles),
    'Codex installed skill set',
  );
  for (const name of names(current.skills.installedClaude)) {
    assert.deepEqual(
      current.skills.installedClaude[name],
      current.skills.shippedClaude[name],
      `Claude install copied ${name}`,
    );
  }
  assert.equal(current.skills.installedCodex.status, 0);
  for (const name of names(current.skills.installedCodex.skillFiles)) {
    assert.deepEqual(
      current.skills.installedCodex.skillFiles[name],
      current.skills.shippedCodex[name],
      `Codex install copied ${name}`,
    );
  }
  for (const host of ['node', 'shell', 'codex']) {
    const paths = behavioralReport.currentRuntime.installFileFootprint[host].paths;
    assert.deepEqual(
      paths,
      behavioralReport.baselineRuntime.installFileFootprint[host].paths,
      `${host} installed file footprint`,
    );
  }
});

check('flag-off recipe runtime dispatch matches HEAD for every advisory role', () => {
  const recipes = behavioralReport.current.recipes;
  const expectedCalls = {
    'adversarial-verify': [
      'refute:correctness',
      'refute:security',
      'refute:edge_cases',
      'refute:consistency',
      'refute:omission',
      'refute:overclaim',
      'refute:cost',
      'xverify:openrouter',
      'synthesize',
    ],
    'decompose-first': ['plan', 'direct'],
    'divergent-explore': ['diverge:r1:mvp-first', 'synthesize'],
    'judge-panel': ['gen:0', 'judge:0', 'synthesize'],
    'pipeline-map': ['extract:0', 'transform:0', 'verify:0'],
  };
  const advisoryLabels = {
    'adversarial-verify': new Set(expectedCalls['adversarial-verify']),
    'decompose-first': new Set(['plan']),
    'divergent-explore': new Set(['diverge:r1:mvp-first', 'synthesize']),
    'judge-panel': new Set(['judge:0']),
    'pipeline-map': new Set(['verify:0']),
  };
  assert.deepEqual(Object.keys(recipes).sort(), [
    'adversarial-verify',
    'decompose-first',
    'divergent-explore',
    'judge-panel',
    'pipeline-map',
  ]);
  for (const [name, snapshot] of Object.entries(recipes)) {
    assert.equal(snapshot.status, 0, `${name}: ${snapshot.stderr}`);
    assert.deepEqual(snapshot, behavioralReport.baseline.recipes[name], name);
    assert.deepEqual(
      snapshot.calls.map(call => call.label),
      expectedCalls[name],
      `${name}: complete runtime call surface`,
    );
  }
  const adversarial = recipes['adversarial-verify'].calls;
  assert.equal(adversarial.filter(call => call.label.startsWith('refute:')).length, 7);
  const expectedTypes = {
    correctness: 'red-team-validator',
    security: 'red-team-validator',
    edge_cases: 'red-team-validator',
    overclaim: 'evidence-verifier',
    consistency: undefined,
    omission: undefined,
    cost: undefined,
  };
  for (const [lens, expected] of Object.entries(expectedTypes)) {
    const call = adversarial.find(entry => entry.label === `refute:${lens}`);
    assert.ok(call, lens);
    assert.equal(call.agentTypePresent, true, lens);
    assert.equal(call.agentTypeUndefined, expected === undefined, lens);
    assert.equal(call.agentType, expected === undefined ? null : expected, lens);
  }
  for (const call of adversarial.filter(entry => !entry.label.startsWith('refute:'))) {
    assert.equal(call.agentTypePresent, false, call.label);
    assert.equal(call.agentTypeUndefined, true, call.label);
    assert.equal(call.agentType, null, call.label);
  }
  const advisoryCalls = Object.entries(recipes).flatMap(([name, snapshot]) => (
    snapshot.calls.filter(call => advisoryLabels[name].has(call.label))
  ));
  assert.equal(advisoryCalls.length, 14);
  for (const call of advisoryCalls.filter(entry => !entry.label.startsWith('refute:'))) {
    assert.equal(call.agentTypePresent, false, call.label);
    assert.equal(call.agentTypeUndefined, true, call.label);
    assert.equal(call.agentType, null, call.label);
  }
});

check('default uninstall preserves byte-exact unowned verifier files in both installers', () => {
  for (const variant of ['baseline', 'current']) {
    for (const installer of ['node', 'shell']) {
      const snapshot = behavioralReport[variant].uninstallOwnership[installer];
      assert.equal(snapshot.status, 0, `${variant}.${installer}: ${snapshot.stderr}`);
      assert.equal(snapshot.preserved, true, `${variant}.${installer}`);
      assert.equal(snapshot.agent.exists, true, `${variant}.${installer}.agent`);
      assert.equal(snapshot.gate.exists, true, `${variant}.${installer}.gate`);
    }
  }
});

check('all upgrade flags off yields an empty runtime-surface diff with no carve-outs', () => {
  assert.deepEqual(manifest.approvedCarveOuts, []);
  assert.deepEqual(behavioralReport.diff, []);
  assert.equal(
    behavioralReport.explicitOff.upgradeFlagEnvironment,
    'manifest snapshotOffEnv values',
  );
  assert.deepEqual(behavioralReport.explicitOff.diff, []);
  assert.equal(
    behavioralReport.onToOff.upgradeFlagEnvironment,
    'on followed by manifest snapshotOffEnv values',
  );
  assert.deepEqual(behavioralReport.onToOff.diff, []);
  assert.equal(behavioralReport.baseline.installerOutput.nodeDryRun.readonlyAgentListed, false);
  assert.equal(behavioralReport.baseline.installerOutput.nodeDryRun.readonlyGateListed, false);
  assert.equal(behavioralReport.current.installerOutput.nodeDryRun.readonlyAgentListed, false);
  assert.equal(behavioralReport.current.installerOutput.nodeDryRun.readonlyGateListed, false);
  assert.equal(behavioralReport.baseline.installerOutput.nodeInstall.readonlyAgentInstalled, false);
  assert.equal(behavioralReport.baseline.installerOutput.nodeInstall.readonlyGateInstalled, false);
  assert.equal(behavioralReport.current.installerOutput.nodeInstall.readonlyAgentInstalled, false);
  assert.equal(behavioralReport.current.installerOutput.nodeInstall.readonlyGateInstalled, false);
  assert.equal(behavioralReport.baseline.installerOutput.shellInstall.readonlyAgentInstalled, false);
  assert.equal(behavioralReport.baseline.installerOutput.shellInstall.readonlyGateInstalled, false);
  assert.equal(behavioralReport.current.installerOutput.shellInstall.readonlyAgentInstalled, false);
  assert.equal(behavioralReport.current.installerOutput.shellInstall.readonlyGateInstalled, false);
});

check('ON-to-OFF restores installed MCP, skills, and verifier files to HEAD', () => {
  const stdout = result => Buffer.from(result.stdoutBase64, 'base64').toString('utf8');
  const parseTools = result => JSON.parse(stdout(result).trim()).result.tools;
  for (const installer of ['node', 'shell']) {
    const current = behavioralReport.onToOff.current[installer];
    const baseline = behavioralReport.onToOff.baseline[installer];
    if (current.skipped) {
      assert.equal(process.platform, 'win32');
      assert.deepEqual(current, baseline);
      continue;
    }
    assert.equal(current.onStatus, 0, `${installer}: on install`);
    assert.equal(current.offStatus, 0, `${installer}: off install`);
    assert.equal(current.readonlyAgentInstalled, false, `${installer}: agent`);
    assert.equal(current.readonlyGateInstalled, false, `${installer}: gate`);
    assert.equal(
      Object.hasOwn(current.mcpConfig.mcpServers['fable-profile'], 'env'),
      false,
      `${installer}: persisted MCP env`,
    );
    const tool = parseTools(current.installedMcp.toolsList)
      .find(entry => entry.name === 'fable_check');
    assert.ok(tool, `${installer}: fable_check`);
    assert.equal(
      Object.hasOwn(tool.inputSchema.properties, 'task_criteria'),
      false,
      `${installer}: installed tools/list`,
    );
    assert.deepEqual(
      behavioralReport.onToOff.currentRuntime[installer],
      behavioralReport.onToOff.baselineRuntime[installer],
      installer,
    );
  }
});

check('package chain places the audit immediately after ledger evidence and keeps zero deps', () => {
  const pkg = JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  const expected = 'node test/ledger-evidence-test.mjs && node test/optin-audit-test.mjs';
  assert(pkg.scripts.test.includes(expected), 'audit is not immediately after ledger evidence');
  assert.deepEqual(pkg.dependencies, {});
});

// Skill bodies are audited too — NO on-demand-skill carve-out. A skill's frontmatter `description:` is loaded
// as default session context (progressive disclosure), so a changed default skill IS a default-context change,
// and a default skill that orders machinery a default install prunes would brick that flow. The upgraded
// guidance therefore lives ONLY in skill/optin/, which the installers select behind an explicit flag.
check('default skill bodies + footprint are byte-identical to HEAD (no on-demand-skill carve-out)', () => {
  for (const dir of ['claude-code/skills', '.agents/skills']) {
    // Compare EVERY file under a skill dir, not just SKILL.md — the installers copy these dirs recursively,
    // so a non-SKILL.md sidecar would otherwise ship to users unaudited.
    const headList = spawnSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', dir], { cwd: REPO, encoding: 'utf8' })
      .stdout.split('\n').filter(Boolean).sort();
    const currentList = spawnSync('bash', ['-c', `find ${dir} -type f | sort`], { cwd: REPO, encoding: 'utf8' })
      .stdout.split('\n').filter(Boolean).sort();
    assert.deepEqual(currentList, headList, `${dir}: default skill footprint must match HEAD (a new/removed default skill is a footprint change)`);
    for (const file of headList) {
      const head = spawnSync('git', ['show', `HEAD:${file}`], { cwd: REPO, encoding: 'utf8' }).stdout;
      assert.equal(readFileSync(path.join(REPO, file), 'utf8'), head, `${file}: default skill body must be byte-identical to HEAD`);
    }
  }
  // ...and the opt-in overlay must genuinely differ, else its flag gates nothing (dead-code overlay).
  for (const name of ['orchestrate', 'fable-plan']) {
    const overlay = path.join(REPO, 'skill', 'optin', name, 'SKILL.md');
    const head = spawnSync('git', ['show', `HEAD:claude-code/skills/${name}/SKILL.md`], { cwd: REPO, encoding: 'utf8' }).stdout;
    assert.notEqual(readFileSync(overlay, 'utf8'), head, `skill/optin/${name}: overlay must differ from HEAD, else the flag gates nothing`);
  }
});

console.log(`opt-in audit selftest: ${passed}/${passed + failed}`);
if (failed) process.exit(1);
console.log(`flag manifest: ${OPTIN_MANIFEST_PATH}`);
console.log(`registered upgrade flags: ${upgradeNames.join(', ')}`);
console.log(`registered v1.3.0 env reads: ${manifest.baselineEnvReads.join(', ')}`);
console.log(`real-tree flag reads: ${repositoryAudit.currentFlags.length}`);
console.log('seeded unregistered flag: rejected');
console.log('default runtime-surface diff vs v1.3.0: EMPTY (absent + explicit-off + on-to-off)');
