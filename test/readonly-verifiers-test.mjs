#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  ADVISORY_ROLE_CONFIG,
  EXECUTOR_ROLE_CONFIG,
  READ_ONLY_AGENT_TYPE,
  READ_ONLY_ALLOWLIST,
  READ_ONLY_VERIFIER_ENV,
  assertReadOnlySubset,
  matchesAdvisoryRole,
  resolveReadonlyAgentType,
} from '../orchestration/lib/readonly-verifiers.mjs';
import {
  PREFLIGHT_FLOORS,
  PREFLIGHT_ROUTES,
  decidePreflightRoute,
} from '../orchestration/lib/preflight-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const AGENT_PATH = path.join(ROOT, 'claude-code', 'agents', `${READ_ONLY_AGENT_TYPE}.md`);
const GATE_PATH = path.join(ROOT, 'claude-code', 'hooks', 'fable-readonly-verifier-gate.js');
const PREFLIGHT_PATH = path.join(ROOT, 'orchestration', 'lib', 'preflight-gate.mjs');
const require = createRequire(import.meta.url);
const productionGate = require(GATE_PATH);
const READONLY_OFF_ENV = Object.freeze({});
const READONLY_ON_ENV = Object.freeze({ [READ_ONLY_VERIFIER_ENV]: 'on' });
const PANEL_RECIPES = new Set(['adversarial-verify', 'judge-panel']);

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

function parseAgentDefinition(file) {
  const source = readFileSync(file, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  assert.ok(match, 'agent frontmatter is missing');
  const fields = new Map();
  for (const line of match[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i !== -1) fields.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
  }
  const tools = (fields.get('tools') || '').split(',').map(tool => tool.trim()).filter(Boolean);
  return { source, fields, tools };
}

async function parallelStub(thunks) {
  const settled = await Promise.allSettled(thunks.map(thunk => Promise.resolve().then(() => thunk())));
  return settled.map(result => result.status === 'fulfilled' ? result.value : null);
}

async function pipelineStub(items, ...stages) {
  return Promise.all(items.map(async (item, i) => {
    let value = item;
    for (const stage of stages) {
      try { value = await stage(value, item, i); } catch (_) { return null; }
    }
    return value;
  }));
}

function preflightForRecipe(name, env) {
  return PANEL_RECIPES.has(name)
    ? decidePreflightRoute({
        requestedRoute: PREFLIGHT_ROUTES.PANEL,
        taskSize: PREFLIGHT_FLOORS.panel.minTaskSize,
        precisionNeed: PREFLIGHT_FLOORS.panel.precisionNeed,
      }, env)
    : decidePreflightRoute({
        requestedRoute: PREFLIGHT_ROUTES.DECOMPOSE,
        taskSize: PREFLIGHT_FLOORS.decompose.minTaskSize,
        independentParts: PREFLIGHT_FLOORS.decompose.minIndependentParts,
      }, env);
}

function recipeSource(name, baseline = false) {
  const relativePath = `orchestration/recipes/${name}.mjs`;
  if (!baseline) return readFileSync(path.join(ROOT, relativePath), 'utf8');
  const result = spawnSync('git', ['show', `HEAD:${relativePath}`], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || `git show HEAD:${relativePath} failed`);
  return result.stdout;
}

async function runRecipe(name, args, responder, env, baseline = false) {
  const source = recipeSource(name, baseline)
    .replace(/^export\s+const\s+meta/m, 'const meta');
  const recipe = new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', source);
  const calls = [];
  const agent = async (prompt, opts = {}) => {
    calls.push({ prompt, opts: { ...opts } });
    return responder(opts.label || '', prompt, opts);
  };
  const runtimeArgs = env === undefined
    ? args
    : { ...args, preflight: preflightForRecipe(name, env) };
  const result = await recipe(agent, parallelStub, pipelineStub, () => {}, () => {}, runtimeArgs);
  return { calls, result };
}

function snapshotTree(root) {
  const entries = new Map();
  function visit(dir, rel = '') {
    for (const name of readdirSync(dir).sort()) {
      const abs = path.join(dir, name);
      const child = path.join(rel, name);
      const stat = lstatSync(abs);
      if (stat.isDirectory()) {
        entries.set(child, { type: 'dir', mode: stat.mode & 0o777 });
        visit(abs, child);
      } else {
        entries.set(child, {
          type: 'file',
          mode: stat.mode & 0o777,
          sha256: createHash('sha256').update(readFileSync(abs)).digest('hex'),
        });
      }
    }
  }
  visit(root);
  return entries;
}

function mutationCount(before, after) {
  const names = new Set([...before.keys(), ...after.keys()]);
  let count = 0;
  for (const name of names) {
    if (JSON.stringify(before.get(name)) !== JSON.stringify(after.get(name))) count++;
  }
  return count;
}

function runGate(event) {
  const run = spawnSync(process.execPath, [GATE_PATH], {
    input: JSON.stringify(event),
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, `gate process failed: ${run.stderr || run.stdout}`);
  const output = run.stdout.trim() ? JSON.parse(run.stdout) : null;
  return {
    status: run.status,
    decision: output?.hookSpecificOutput?.permissionDecision || 'allow',
    reason: output?.hookSpecificOutput?.permissionDecisionReason || '',
    output,
  };
}

console.log('read-only verifier enforcement:');

const agentDefinition = parseAgentDefinition(AGENT_PATH);
check('production agent uses the expected name', () => {
  assert.equal(agentDefinition.fields.get('name'), READ_ONLY_AGENT_TYPE);
});
check('production agent is an explicit allowlist subset', () => {
  assert.ok(agentDefinition.tools.length > 0);
  assertReadOnlySubset(agentDefinition.tools);
  assert.equal(agentDefinition.fields.has('disallowedTools'), false, 'deny-list is not the enforcement');
});
check('production gate is scoped to the verifier agent lifecycle', () => {
  assert.match(
    agentDefinition.source,
    /hooks:\s*\n\s*PreToolUse:\s*\n\s*- matcher: "\*"[\s\S]*command: "node \$HOME\/\.claude\/hooks\/fable-readonly-verifier-gate\.js"/,
  );
});
check('runtime-only StructuredOutput is explicitly classified read-only', () => {
  assert.ok(READ_ONLY_ALLOWLIST.includes('StructuredOutput'));
});
check('production PreToolUse gate uses the exact canonical allowlist', () => {
  assert.deepEqual(productionGate.READ_ONLY_ALLOWLIST, READ_ONLY_ALLOWLIST);
  assert.equal(productionGate.READ_ONLY_AGENT_TYPE, READ_ONLY_AGENT_TYPE);
  assert.equal(READ_ONLY_ALLOWLIST.includes('*'), false);
});
check('bidirectional oracle: compliant fixture PASSES', () => {
  assert.doesNotThrow(() => assertReadOnlySubset(['Read', 'Grep', 'Glob']));
});
check('bidirectional oracle: seeded mutating tool FAILS', () => {
  assert.throws(
    () => assertReadOnlySubset(['Read', 'Write']),
    /outside READ_ONLY_ALLOWLIST: Write/,
  );
});
check('falsifiability: an unknown future mutator also FAILS closed', () => {
  assert.throws(
    () => assertReadOnlySubset(['Read', 'FutureMutator']),
    /outside READ_ONLY_ALLOWLIST: FutureMutator/,
  );
});
check('agent-type resolver is default-off and matches every installer opt-in spelling', () => {
  assert.equal(resolveReadonlyAgentType({}), undefined);
  assert.equal(resolveReadonlyAgentType({ [READ_ONLY_VERIFIER_ENV]: 'off' }), undefined);
  for (const value of ['on', '1', 'true', ' TRUE ']) {
    assert.equal(
      resolveReadonlyAgentType({ [READ_ONLY_VERIFIER_ENV]: value }),
      READ_ONLY_AGENT_TYPE,
      value,
    );
  }
});

async function runRecipeFixtures(env, baseline = false) {
  const runs = {};
  runs['adversarial-verify'] = await runRecipe(
    'adversarial-verify',
    {
      artifact: 'A substantial artifact for adversarial verification. '.repeat(8),
      lenses: ['correctness', 'security', 'edge_cases', 'consistency', 'omission', 'overclaim', 'cost'],
      crossModel: { provider: 'openrouter' },
    },
    label => {
      if (label.startsWith('refute:')) {
        return {
          lens: label.slice('refute:'.length),
          refuted: true,
          confidence: 'high',
          defect_class: 'omission',
          findings: [{ claim: 'seeded finding', evidence: 'fixture', severity: 'major' }],
        };
      }
      if (label.startsWith('xverify:')) {
        return {
          lens: 'cross-model',
          refuted: false,
          confidence: 'low',
          defect_class: 'none',
          findings: [],
        };
      }
      return 'verification synthesis';
    },
    env,
    baseline,
  );
  runs['judge-panel'] = await runRecipe(
    'judge-panel',
    { task: 'Produce one high-stakes artifact.', highStakes: true, angles: ['robust'] },
    label => {
      if (label.startsWith('gen:')) return 'candidate';
      if (label.startsWith('judge:')) {
        return { candidate: 0, total: 9, per_criterion: [], verdict: 'good' };
      }
      return 'final artifact';
    },
    env,
    baseline,
  );
  runs['divergent-explore'] = await runRecipe(
    'divergent-explore',
    {
      question: 'Explore several distinct approaches to a sufficiently substantial open problem.',
      lenses: ['mvp-first'],
      maxRounds: 1,
      force: true,
    },
    label => label.startsWith('diverge:')
      ? { lens: 'mvp-first', hypotheses: [{ title: 'A', approach: 'B', key_risk: 'C' }] }
      : 'ranked synthesis',
    env,
    baseline,
  );
  const decomposeAtomic = await runRecipe(
    'decompose-first',
    { task: 'Handle this atomic fixture task.' },
    label => label === 'plan'
      ? {
          split_axis: 'none',
          rationale: 'atomic',
          independent: true,
          subproblems: [{ title: 'only', goal: 'solve' }],
        }
      : 'direct answer',
    env,
    baseline,
  );
  const decomposeFanned = await runRecipe(
    'decompose-first',
    { task: 'Handle a multi-module fixture task with independent subproblems.' },
    label => {
      if (label === 'plan') {
        return {
          split_axis: 'by-file-or-module',
          rationale: 'two independent modules',
          independent: true,
          subproblems: [
            { title: 'module-a', goal: 'solve module A' },
            { title: 'module-b', goal: 'solve module B' },
          ],
        };
      }
      if (label.startsWith('sub:')) {
        return { title: label, result: 'completed', open_issues: [] };
      }
      return 'integrated answer';
    },
    env,
    baseline,
  );
  runs['decompose-first'] = {
    calls: decomposeAtomic.calls.concat(decomposeFanned.calls),
    result: decomposeFanned.result,
  };
  runs['pipeline-map'] = await runRecipe(
    'pipeline-map',
    { items: ['fixture'] },
    label => label.startsWith('verify:')
      ? { ok: true, note: 'checked' }
      : { ok: true, output: label, note: 'stage' },
    env,
    baseline,
  );
  return runs;
}

const offRecipeRuns = await runRecipeFixtures(READONLY_OFF_ENV);
const recipeRuns = await runRecipeFixtures(READONLY_ON_ENV);
const headRecipeRuns = await runRecipeFixtures(READONLY_OFF_ENV, true);

const recipeNames = [
  'adversarial-verify',
  'judge-panel',
  'divergent-explore',
  'decompose-first',
  'pipeline-map',
];

function advisoryAgentTypeDispatch(recipeName, runs) {
  return runs[recipeName].calls
    .filter(call => ADVISORY_ROLE_CONFIG[recipeName]
      .some(role => matchesAdvisoryRole(call.opts.label, role)))
    .map(call => ({
      label: call.opts.label,
      agentTypePresent: Object.hasOwn(call.opts, 'agentType'),
      agentType: call.opts.agentType,
    }));
}

check('role registry covers exactly the five orchestration recipes', () => {
  assert.deepEqual(Object.keys(ADVISORY_ROLE_CONFIG).sort(), recipeNames.slice().sort());
  assert.deepEqual(Object.keys(EXECUTOR_ROLE_CONFIG).sort(), recipeNames.slice().sort());
});
check('preflight bridge omits the type off and carries the canonical type on', () => {
  const off = preflightForRecipe('judge-panel', READONLY_OFF_ENV);
  const on = preflightForRecipe('judge-panel', READONLY_ON_ENV);
  assert.equal(Object.hasOwn(off, 'readonlyAgentType'), false);
  assert.equal(on.readonlyAgentType, READ_ONLY_AGENT_TYPE);
});
check('installed owned verifier makes the later CLI preflight serialize the canonical type', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'fable-readonly-preflight-'));
  try {
    const installed = path.join(home, '.claude', 'agents', 'fable-readonly-verifier.md');
    mkdirSync(path.dirname(installed), { recursive: true });
    writeFileSync(installed, '<!-- fablever-owned:readonly-verifier:v1 -->\n');
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    delete env.FABLE_READONLY_VERIFIER;
    const result = spawnSync(process.execPath, [
      PREFLIGHT_PATH,
      '--route', 'panel',
      '--task-size', String(PREFLIGHT_FLOORS.panel.minTaskSize),
      '--precision-need', PREFLIGHT_FLOORS.panel.precisionNeed,
      '--require-multi',
    ], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).readonlyAgentType, READ_ONLY_AGENT_TYPE);
    const offResult = spawnSync(process.execPath, [
      PREFLIGHT_PATH,
      '--route', 'panel',
      '--task-size', String(PREFLIGHT_FLOORS.panel.minTaskSize),
      '--precision-need', PREFLIGHT_FLOORS.panel.precisionNeed,
      '--require-multi',
    ], { env: { ...env, FABLE_READONLY_VERIFIER: 'off' }, encoding: 'utf8' });
    assert.equal(offResult.status, 0, offResult.stderr);
    assert.equal(Object.hasOwn(JSON.parse(offResult.stdout), 'readonlyAgentType'), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
check('recipes no longer hardcode the optional verifier agent type', () => {
  for (const recipeName of recipeNames) {
    const source = readFileSync(
      path.join(ROOT, 'orchestration', 'recipes', `${recipeName}.mjs`),
      'utf8',
    );
    assert.doesNotMatch(source, new RegExp(`['"]${READ_ONLY_AGENT_TYPE}['"]`), recipeName);
  }
});
check('HEAD runtime fixture covers all seven adversarial lens dispatches exactly', () => {
  const dispatch = advisoryAgentTypeDispatch('adversarial-verify', headRecipeRuns);
  const refuters = dispatch.filter(call => call.label.startsWith('refute:'));
  assert.deepEqual(
    refuters.map(call => call.label),
    [
      'refute:correctness',
      'refute:security',
      'refute:edge_cases',
      'refute:consistency',
      'refute:omission',
      'refute:overclaim',
      'refute:cost',
    ],
  );
  const expectedTypes = new Map([
    ['refute:correctness', 'red-team-validator'],
    ['refute:security', 'red-team-validator'],
    ['refute:edge_cases', 'red-team-validator'],
    ['refute:consistency', undefined],
    ['refute:omission', undefined],
    ['refute:overclaim', 'evidence-verifier'],
    ['refute:cost', undefined],
  ]);
  for (const call of refuters) {
    assert.equal(call.agentTypePresent, true, `${call.label} omitted HEAD agentType property`);
    assert.equal(call.agentType, expectedTypes.get(call.label), call.label);
  }
  for (const label of ['xverify:openrouter', 'synthesize']) {
    const call = dispatch.find(entry => entry.label === label);
    assert.ok(call, `missing HEAD advisory call: ${label}`);
    assert.equal(call.agentTypePresent, false, `${label} unexpectedly has HEAD agentType`);
  }
});

const directJudgeRun = await runRecipe(
  'judge-panel',
  { task: 'Direct fallback fixture.', highStakes: true, angles: ['robust'] },
  label => label.startsWith('judge:')
    ? { candidate: 0, total: 9, per_criterion: [], verdict: 'good' }
    : 'candidate or final artifact',
);
check('direct recipe launch without preflight safely omits the optional agent type', () => {
  const judge = directJudgeRun.calls.find(call => call.opts.label.startsWith('judge:'));
  assert.ok(judge, 'direct fixture spawned no judge');
  assert.equal(Object.hasOwn(judge.opts, 'agentType'), false);
});

for (const recipeName of recipeNames) {
  check(`${recipeName}: flag on classifies every call and binds each advisory role`, () => {
    const calls = recipeRuns[recipeName].calls;
    assert.ok(calls.length > 0, 'recipe fixture spawned no agents');
    for (const call of calls) {
      const advisory = ADVISORY_ROLE_CONFIG[recipeName]
        .filter(role => matchesAdvisoryRole(call.opts.label, role));
      const executors = EXECUTOR_ROLE_CONFIG[recipeName]
        .filter(role => matchesAdvisoryRole(call.opts.label, role));
      assert.equal(
        advisory.length + executors.length,
        1,
        `unclassified or multiply classified call: ${call.opts.label}`,
      );
      if (advisory.length) {
        assert.equal(
          call.opts.agentType,
          READ_ONLY_AGENT_TYPE,
          `${advisory[0].role} is not bound when enabled`,
        );
        assertReadOnlySubset(agentDefinition.tools);
      } else {
        assert.notEqual(
          call.opts.agentType,
          READ_ONLY_AGENT_TYPE,
          `${executors[0].role} unexpectedly lost executor capabilities`,
        );
      }
    }
  });

  check(`${recipeName}: flag-off advisory agentType dispatch matches git HEAD`, () => {
    const calls = offRecipeRuns[recipeName].calls;
    const advisoryCalls = calls.filter(call => (
      ADVISORY_ROLE_CONFIG[recipeName]
        .some(role => matchesAdvisoryRole(call.opts.label, role))
    ));
    assert.ok(advisoryCalls.length > 0, 'flag-off fixture spawned no advisory role');
    for (const role of ADVISORY_ROLE_CONFIG[recipeName]) {
      assert.ok(
        advisoryCalls.some(call => matchesAdvisoryRole(call.opts.label, role)),
        `flag-off role not exercised: ${role.role}`,
      );
    }
    assert.deepEqual(
      advisoryAgentTypeDispatch(recipeName, offRecipeRuns),
      advisoryAgentTypeDispatch(recipeName, headRecipeRuns),
    );
  });

  check(`${recipeName}: every declared advisory role is exercised`, () => {
    for (const role of ADVISORY_ROLE_CONFIG[recipeName]) {
      assert.ok(
        recipeRuns[recipeName].calls.some(call => matchesAdvisoryRole(call.opts.label, role)),
        `role not exercised: ${role.role}`,
      );
    }
  });
}

const sandbox = mkdtempSync(path.join(tmpdir(), 'fable-readonly-verifier-'));
try {
  const targetDir = path.join(sandbox, 'target');
  const mutatingAgentPath = path.join(sandbox, 'fixtures', `${READ_ONLY_AGENT_TYPE}.md`);
  const sentinel = path.join(targetDir, 'sentinel.txt');
  const bashCanary = path.join(targetDir, 'bash-canary.txt');
  mkdirSync(targetDir, { recursive: true });
  mkdirSync(path.dirname(mutatingAgentPath), { recursive: true });
  writeFileSync(sentinel, 'ORIGINAL\n');
  chmodSync(sentinel, 0o640);
  writeFileSync(
    mutatingAgentPath,
    [
      '---',
      `name: ${READ_ONLY_AGENT_TYPE}`,
      'description: seeded advisory config with mutating tools',
      'tools: Read, Write, Bash, FutureMutator',
      '---',
      'Attempt every requested mutation.',
      '',
    ].join('\n'),
  );
  const mutatingDefinition = parseAgentDefinition(mutatingAgentPath);
  const before = snapshotTree(targetDir);
  const denialEvents = [];
  const implementationCalls = { Read: 0, Write: 0, Bash: 0 };
  const implementations = {
    Read(input) {
      implementationCalls.Read++;
      return readFileSync(input.file_path, 'utf8');
    },
    Write(input) {
      implementationCalls.Write++;
      writeFileSync(input.file_path, input.content);
      return 'written';
    },
    Bash(input) {
      implementationCalls.Bash++;
      return spawnSync(
        process.execPath,
        ['-e', 'require("node:fs").writeFileSync(process.argv[1], "BASH MUTATION\\n")', input.canary],
        { encoding: 'utf8' },
      );
    },
  };

  async function dispatchTool(tool, input, opts) {
    const gate = runGate({
      hook_event_name: 'PreToolUse',
      agent_type: opts.agentType,
      tool_name: tool,
      tool_input: input,
    });
    const resolvedAllows = mutatingDefinition.tools.includes(tool);
    if (gate.decision === 'deny') {
      denialEvents.push({
        tool,
        decision: 'deny',
        resolvedAllows,
        dispatchCalled: false,
      });
      return { ok: false, error: gate.reason };
    }
    assert.equal(resolvedAllows, true, `mutating fixture does not expose attempted tool: ${tool}`);
    denialEvents.push({ tool, decision: 'allow', resolvedAllows, dispatchCalled: true });
    return { ok: true, value: implementations[tool](input) };
  }

  check('parsed mutating-agent fixture exposes Write, Bash, and a future tool', () => {
    assert.deepEqual(mutatingDefinition.tools, ['Read', 'Write', 'Bash', 'FutureMutator']);
    assert.throws(
      () => assertReadOnlySubset(mutatingDefinition.tools),
      /outside READ_ONLY_ALLOWLIST: Write, Bash, FutureMutator/,
    );
  });
  check('production gate allows a canonical read tool for the verifier', () => {
    assert.equal(runGate({
      hook_event_name: 'PreToolUse',
      agent_type: READ_ONLY_AGENT_TYPE,
      tool_name: 'Read',
      tool_input: { file_path: sentinel },
    }).decision, 'allow');
  });
  check('production gate denies an unknown future tool for the verifier', () => {
    const decision = runGate({
      hook_event_name: 'PreToolUse',
      agent_type: READ_ONLY_AGENT_TYPE,
      tool_name: 'FutureMutator',
      tool_input: {},
    });
    assert.equal(decision.decision, 'deny');
    assert.match(decision.reason, /outside READ_ONLY_ALLOWLIST: FutureMutator/);
  });

  const runtimeRun = await runRecipe(
    'pipeline-map',
    { items: [sentinel] },
    async (label, _prompt, opts) => {
      if (!label.startsWith('verify:')) return { ok: true, output: sentinel, note: 'prepared' };
      const read = await dispatchTool('Read', { file_path: sentinel }, opts);
      const write = await dispatchTool('Write', { file_path: sentinel, content: 'MUTATED\n' }, opts);
      const bash = await dispatchTool('Bash', {
        command: `node -e <write ${bashCanary}>`,
        canary: bashCanary,
      }, opts);
      return {
        ok: read.ok && !write.ok && !bash.ok,
        note: JSON.stringify({ read: read.ok, write: write.error, bash: bash.error }),
      };
    },
    READONLY_ON_ENV,
  );
  const after = snapshotTree(targetDir);
  const mutations = mutationCount(before, after);

  check('runtime negative: verifier Write attempt is observably denied', () => {
    assert.deepEqual(
      denialEvents.find(event => event.tool === 'Write'),
      { tool: 'Write', decision: 'deny', resolvedAllows: true, dispatchCalled: false },
    );
    assert.equal(implementationCalls.Write, 0);
  });
  check('runtime negative: verifier Bash attempt is observably denied', () => {
    assert.deepEqual(
      denialEvents.find(event => event.tool === 'Bash'),
      { tool: 'Bash', decision: 'deny', resolvedAllows: true, dispatchCalled: false },
    );
    assert.equal(implementationCalls.Bash, 0);
  });
  check('runtime positive: allowed Read dispatch succeeds', () => {
    assert.deepEqual(
      denialEvents.find(event => event.tool === 'Read'),
      { tool: 'Read', decision: 'allow', resolvedAllows: true, dispatchCalled: true },
    );
    assert.equal(implementationCalls.Read, 1);
    assert.equal(runtimeRun.result.passed, 1);
  });
  check('hard mutation assert: file mutation count === 0', () => {
    assert.equal(mutations, 0);
    assert.equal(readFileSync(sentinel, 'utf8'), 'ORIGINAL\n');
  });
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
