#!/usr/bin/env node
// G2.3 SubagentStart restraint-payload exemption.
// Fresh installs must preserve v1.3.0 injection by default; the opt-in flag may
// exempt only the canonical recipe verifier from readonly-verifiers.mjs.
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { READ_ONLY_AGENT_TYPE } from '../orchestration/lib/readonly-verifiers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL = path.join(ROOT, 'install.mjs');
const FLAG = 'FABLE_VERIFIER_HOOK_EXEMPTION';
const REGISTRY_REL = path.join('runtime', 'orchestration', 'lib', 'readonly-verifiers.mjs');

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (error) {
    failed++;
    console.log('  FAIL ' + name + ' — ' + error.message);
  }
}

function cleanEnv(home, extra = {}) {
  return {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    FABLE_HOME: '',
    FABLE_PROFILE_HOME: '',
    FABLE_PROFILE: '',
    FABLE_MEASURE: 'off',
    FABLE_HOOK_TRACE_FILE: '',
    [FLAG]: '',
    ...extra,
  };
}

function installClaude(home) {
  mkdirSync(path.join(home, '.claude'), { recursive: true });
  writeFileSync(path.join(home, '.claude', 'settings.json'), '{}\n');
  return spawnSync(process.execPath, [
    INSTALL,
    '--no-mcp',
    '--no-update-check',
  ], {
    cwd: ROOT,
    env: cleanEnv(home, { [FLAG]: 'on' }),
    encoding: 'utf8',
  });
}

function installCodex(home, codexHome) {
  mkdirSync(codexHome, { recursive: true });
  return spawnSync(process.execPath, [
    INSTALL,
    '--codex-full',
    '--no-codex-agents',
    '--no-codex-skills',
  ], {
    cwd: ROOT,
    env: cleanEnv(home, { CODEX_HOME: codexHome, [FLAG]: 'on' }),
    encoding: 'utf8',
  });
}

function runHookRaw(hook, input, env, flagValue) {
  const hookEnv = { ...env };
  if (flagValue !== undefined) hookEnv[FLAG] = flagValue;
  const run = spawnSync(process.execPath, [hook], {
    input,
    env: hookEnv,
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr || run.stdout || 'hook exited nonzero');
  return run;
}

function runHook(hook, event, env, flagValue) {
  return runHookRaw(hook, JSON.stringify(event), env, flagValue);
}

function assertInjected(run, expected) {
  assert.equal(run.stdout, JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext: expected,
    },
  }));
}

function assertAbsent(run) {
  assert.equal(run.stdout, '');
}

function assertInstalledRegistration(settingsFile) {
  const settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
  const entries = settings?.hooks?.SubagentStart || [];
  assert.ok(entries.some(entry => entry.matcher === '*' && /fable-subagent/.test(JSON.stringify(entry))));
}

function exerciseHost({ name, hook, registry, profile, env, verifierEvent, executorEvent }) {
  const expected = readFileSync(profile, 'utf8').trim();
  const withType = type => {
    const event = { ...verifierEvent };
    for (const key of ['agent_type', 'subagent_type', 'agentType', 'subagentType']) {
      if (key in event) event[key] = type;
    }
    return event;
  };
  const decoyEvent = withType(READ_ONLY_AGENT_TYPE + '-helper');

  check(`${name}: flag unset defaults OFF, so recipe verifier gets byte-identical v1.3.0 JSON`, () => {
    assertInjected(runHook(hook, verifierEvent, env), expected);
  });
  check(`${name}: explicit flag OFF keeps recipe verifier payload`, () => {
    assertInjected(runHook(hook, verifierEvent, env, 'off'), expected);
  });
  check(`${name}: flag ON removes payload from the exact recipe verifier`, () => {
    assertAbsent(runHook(hook, verifierEvent, env, 'on'));
  });
  check(`${name}: non-verifier executor is injected with flag OFF`, () => {
    assertInjected(runHook(hook, executorEvent, env, 'off'), expected);
  });
  check(`${name}: non-verifier executor is still injected with flag ON`, () => {
    assertInjected(runHook(hook, executorEvent, env, 'on'), expected);
  });
  check(`${name}: verifier-looking but non-canonical agentType is not exempted`, () => {
    assertInjected(runHook(hook, decoyEvent, env, 'on'), expected);
  });
  check(`${name}: historical fact-verifier collision remains injected in both states`, () => {
    const event = withType('fact-verifier');
    assertInjected(runHook(hook, event, env, 'off'), expected);
    assertInjected(runHook(hook, event, env, 'on'), expected);
  });
  check(`${name}: legacy exact orchestration role keeps its v1.3.0 exemption in both states`, () => {
    const event = withType('red-team-validator');
    assertAbsent(runHook(hook, event, env, 'off'));
    assertAbsent(runHook(hook, event, env, 'on'));
  });
  check(`${name}: malformed event JSON fails open to the exact injection payload`, () => {
    assertInjected(runHookRaw(hook, '{"agent_type":', env, 'on'), expected);
  });
  check(`${name}: registry read failure fails open to injection`, () => {
    const registrySource = readFileSync(registry, 'utf8');
    rmSync(registry);
    try {
      assertInjected(runHook(hook, verifierEvent, env, 'on'), expected);
    } finally {
      writeFileSync(registry, registrySource);
    }
  });
}

console.log('SubagentStart hook exemption (G2.3):');

const sandbox = mkdtempSync(path.join(tmpdir(), 'fable-hook-exemption-'));
try {
  const claudeHome = path.join(sandbox, 'claude-home');
  const claudeInstall = installClaude(claudeHome);
  const claudeHook = path.join(claudeHome, '.claude', 'hooks', 'fable-subagent.js');
  const claudeProfileHome = path.join(claudeHome, '.claude', 'fable-profile');
  const claudeRegistry = path.join(claudeProfileHome, REGISTRY_REL);
  check('opt-in Claude install succeeds and retains matcher=* registration', () => {
    assert.equal(claudeInstall.status, 0, claudeInstall.stderr || claudeInstall.stdout);
    assert.ok(existsSync(claudeHook));
    assert.ok(existsSync(claudeRegistry));
    assertInstalledRegistration(path.join(claudeHome, '.claude', 'settings.json'));
  });

  const codexUserHome = path.join(sandbox, 'codex-user-home');
  const codexHome = path.join(sandbox, 'codex-home');
  const codexInstall = installCodex(codexUserHome, codexHome);
  const codexHook = path.join(codexHome, 'hooks', 'fable-subagent.js');
  const codexProfileHome = path.join(codexHome, 'fable-profile');
  const codexRegistry = path.join(codexProfileHome, REGISTRY_REL);
  check('opt-in Codex install succeeds and retains matcher=* registration', () => {
    assert.equal(codexInstall.status, 0, codexInstall.stderr || codexInstall.stdout);
    assert.ok(existsSync(codexHook));
    assert.ok(existsSync(codexRegistry));
    assertInstalledRegistration(path.join(codexHome, 'hooks.json'));
  });

  for (const source of [
    readFileSync(path.join(ROOT, 'claude-code', 'hooks', 'fable-subagent.js'), 'utf8'),
    readFileSync(path.join(ROOT, 'codex', 'hooks', 'fable-subagent.js'), 'utf8'),
  ]) {
    check('hook resolves the verifier through readonly-verifiers.mjs without a duplicate literal', () => {
      assert.match(source, /readonly-verifiers\.mjs/);
      assert.doesNotMatch(source, new RegExp(`['"]${READ_ONLY_AGENT_TYPE}['"]`));
    });
  }

  exerciseHost({
    name: 'Claude',
    hook: claudeHook,
    registry: claudeRegistry,
    profile: path.join(claudeProfileHome, 'compact.md'),
    env: cleanEnv(claudeHome),
    verifierEvent: { hook_event_name: 'SubagentStart', subagent_type: READ_ONLY_AGENT_TYPE },
    executorEvent: { hook_event_name: 'SubagentStart', subagent_type: 'coder' },
  });

  check('Claude flag-on also recognizes the live-style agent_type field without changing flag-off behavior', () => {
    const expected = readFileSync(path.join(claudeProfileHome, 'compact.md'), 'utf8').trim();
    const event = { hook_event_name: 'SubagentStart', agent_type: READ_ONLY_AGENT_TYPE };
    assertInjected(runHook(claudeHook, event, cleanEnv(claudeHome), 'off'), expected);
    assertAbsent(runHook(claudeHook, event, cleanEnv(claudeHome), 'on'));
  });

  exerciseHost({
    name: 'Codex',
    hook: codexHook,
    registry: codexRegistry,
    profile: path.join(codexProfileHome, 'compact.md'),
    env: cleanEnv(codexUserHome, { CODEX_HOME: codexHome }),
    verifierEvent: { hook_event_name: 'SubagentStart', agent_type: READ_ONLY_AGENT_TYPE },
    executorEvent: { hook_event_name: 'SubagentStart', agent_type: 'coder' },
  });
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
