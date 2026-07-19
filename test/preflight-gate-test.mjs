#!/usr/bin/env node
// G2.4 deterministic route-vs-solo cost oracle.
// Refused routes must stop before launch/agent creation; floor-met routes must continue.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  PREFLIGHT_FLOORS,
  PREFLIGHT_ROUTES,
  decidePreflightRoute,
  runPreflightRoute,
} from '../orchestration/lib/preflight-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE = path.join(ROOT, 'orchestration', 'lib', 'preflight-gate.mjs');
const CLAIM_LINT = path.join(ROOT, 'eval', 'opus-claim-lint', 'run.mjs');
const CLAUDE_ORCHESTRATE_SKILL = path.join(ROOT, 'claude-code', 'skills', 'orchestrate', 'SKILL.md');
// NOTE: there is no `.agents/skills/orchestrate` at HEAD — the orchestrate skill is Claude-side only, so a
// codex-side default mirror would itself be a footprint change. The opt-in overlay is the only upgraded copy.
const OPTIN_ORCHESTRATE_SKILL = path.join(ROOT, 'skill', 'optin', 'orchestrate', 'SKILL.md');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (error) {
    failed++;
    console.log('  FAIL ' + name + ' — ' + error.message);
  }
}

async function parallelStub(thunks) {
  const settled = await Promise.allSettled(thunks.map(thunk => Promise.resolve().then(() => thunk())));
  return settled.map(result => result.status === 'fulfilled' ? result.value : null);
}

async function pipelineStub(items, ...stages) {
  return Promise.all(items.map(async (item, index) => {
    let value = item;
    for (const stage of stages) {
      try {
        value = await stage(value, item, index);
      } catch {
        return null;
      }
    }
    return value;
  }));
}

async function runRecipe(name, args, responder) {
  const source = readFileSync(path.join(ROOT, 'orchestration', 'recipes', `${name}.mjs`), 'utf8')
    .replace(/^export\s+const\s+meta/m, 'const meta');
  const recipe = new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', source);
  const labels = [];
  let spawnCount = 0;
  const agent = async (prompt, opts = {}) => {
    spawnCount++;
    labels.push(opts.label || '');
    return responder(opts.label || '', prompt, opts);
  };
  const result = await recipe(
    agent,
    parallelStub,
    pipelineStub,
    () => {},
    () => {},
    args,
  );
  return { result, labels, spawnCount };
}

const decomposeFloor = PREFLIGHT_FLOORS.decompose;
const panelFloor = PREFLIGHT_FLOORS.panel;
const decomposeTask = 'D'.repeat(decomposeFloor.minTaskSize);
const panelTask = 'P'.repeat(panelFloor.minTaskSize);

console.log('preflight route-vs-solo cost gate:');

await check('default route is single-lens and allowed without multi-agent launch', () => {
  assert.deepEqual(decidePreflightRoute(), {
    requestedRoute: PREFLIGHT_ROUTES.SINGLE_LENS,
    route: PREFLIGHT_ROUTES.SINGLE_LENS,
    allow: true,
    reason: 'default-cost-route',
  });
});

await check('unknown routes fail closed to single-lens', () => {
  assert.deepEqual(decidePreflightRoute({ requestedRoute: 'unknown-route' }), {
    requestedRoute: 'unknown-route',
    route: PREFLIGHT_ROUTES.SINGLE_LENS,
    allow: false,
    reason: 'invalid-preflight-input',
  });
});

await check('decompose refuses one character below its size floor', () => {
  const result = decidePreflightRoute({
    requestedRoute: PREFLIGHT_ROUTES.DECOMPOSE,
    taskSize: decomposeFloor.minTaskSize - 1,
    independentParts: decomposeFloor.minIndependentParts,
  });
  assert.equal(result.allow, false);
  assert.equal(result.route, PREFLIGHT_ROUTES.SINGLE_LENS);
  assert.equal(result.reason, 'decompose-cost-floor-not-met');
});

await check('decompose refuses one part below its independent-parts floor', () => {
  const result = decidePreflightRoute({
    requestedRoute: PREFLIGHT_ROUTES.DECOMPOSE,
    taskSize: decomposeFloor.minTaskSize,
    independentParts: decomposeFloor.minIndependentParts - 1,
  });
  assert.equal(result.allow, false);
  assert.equal(result.route, PREFLIGHT_ROUTES.SINGLE_LENS);
  assert.equal(result.reason, 'decompose-cost-floor-not-met');
});

await check('decompose allows the inclusive floor boundary', () => {
  const result = decidePreflightRoute({
    requestedRoute: PREFLIGHT_ROUTES.DECOMPOSE,
    task: decomposeTask,
    independentParts: decomposeFloor.minIndependentParts,
  });
  assert.equal(result.allow, true);
  assert.equal(result.route, PREFLIGHT_ROUTES.DECOMPOSE);
  assert.equal(result.reason, 'decompose-cost-floor-met');
});

await check('panel refuses one character below its task-size floor', () => {
  const result = decidePreflightRoute({
    requestedRoute: PREFLIGHT_ROUTES.PANEL,
    taskSize: panelFloor.minTaskSize - 1,
    precisionNeed: panelFloor.precisionNeed,
  });
  assert.equal(result.allow, false);
  assert.equal(result.route, PREFLIGHT_ROUTES.SINGLE_LENS);
  assert.equal(result.reason, 'panel-size-cost-floor-not-met');
});

await check('judge-panel precision floor refuses a standard precision need', () => {
  const result = decidePreflightRoute({
    requestedRoute: PREFLIGHT_ROUTES.PANEL,
    taskSize: panelFloor.minTaskSize,
    precisionNeed: 'standard',
  });
  assert.equal(result.allow, false);
  assert.equal(result.route, PREFLIGHT_ROUTES.SINGLE_LENS);
  assert.equal(result.reason, 'panel-precision-cost-floor-not-met');
});

await check('panel allows the inclusive size plus precision-at-scale boundary', () => {
  const result = decidePreflightRoute({
    requestedRoute: PREFLIGHT_ROUTES.PANEL,
    task: panelTask,
    precisionNeed: panelFloor.precisionNeed,
  });
  assert.equal(result.allow, true);
  assert.equal(result.route, PREFLIGHT_ROUTES.PANEL);
  assert.equal(result.reason, 'panel-cost-floor-met');
});

await check('CLI --require-multi exits non-zero on a refused panel before routing', () => {
  const result = spawnSync(process.execPath, [
    GATE,
    '--route', 'panel',
    '--task-size', String(panelFloor.minTaskSize),
    '--precision-need', 'standard',
    '--require-multi',
  ], { cwd: ROOT, encoding: 'utf8' });
  const output = JSON.parse(result.stdout);
  assert.equal(result.status, 2);
  assert.equal(output.allow, false);
  assert.equal(output.route, PREFLIGHT_ROUTES.SINGLE_LENS);
});

await check('CLI --require-multi exits zero when the panel floor is met', () => {
  const result = spawnSync(process.execPath, [
    GATE,
    '--route', 'panel',
    '--task-size', String(panelFloor.minTaskSize),
    '--precision-need', panelFloor.precisionNeed,
    '--require-multi',
  ], { cwd: ROOT, encoding: 'utf8' });
  const output = JSON.parse(result.stdout);
  assert.equal(result.status, 0);
  assert.equal(output.allow, true);
  assert.equal(output.route, PREFLIGHT_ROUTES.PANEL);
});

await check('floor-failed judge route refuses with launchCount=0 and spawnCount=0', async () => {
  const attributes = {
    requestedRoute: PREFLIGHT_ROUTES.PANEL,
    task: panelTask,
    precisionNeed: 'standard',
  };
  let launchCount = 0;
  let spawnCount = 0;
  const routed = await runPreflightRoute(attributes, async preflight => {
    launchCount++;
    const run = await runRecipe(
      'judge-panel',
      {
        task: panelTask,
        highStakes: true,
        angles: ['a', 'b', 'c'],
        preflight,
      },
      () => 'should not run',
    );
    spawnCount += run.spawnCount;
    return run.result;
  });

  assert.equal(routed.decision.reason, 'panel-precision-cost-floor-not-met');
  assert.equal(routed.refused, true);
  assert.equal(routed.proceeded, false);
  assert.equal(launchCount, 0);
  assert.equal(spawnCount, 0);
});

await check('judge recipe guard preserves spawnCount=0 if a refused decision is passed directly', async () => {
  const preflight = decidePreflightRoute({
    requestedRoute: PREFLIGHT_ROUTES.PANEL,
    task: panelTask,
    precisionNeed: 'standard',
  });
  const run = await runRecipe(
    'judge-panel',
    {
      task: panelTask,
      highStakes: true,
      angles: ['a', 'b', 'c'],
      preflight,
    },
    () => 'should not run',
  );
  assert.equal(run.result.refused, true);
  assert.equal(run.result.reason, 'panel-precision-cost-floor-not-met');
  assert.equal(run.spawnCount, 0);
});

await check('all remaining recipes fail closed on a refused preflight before agent creation', async () => {
  const refusedPanel = decidePreflightRoute({
    requestedRoute: PREFLIGHT_ROUTES.PANEL,
    task: panelTask,
    precisionNeed: 'standard',
  });
  const refusedDecompose = decidePreflightRoute({
    requestedRoute: PREFLIGHT_ROUTES.DECOMPOSE,
    task: decomposeTask,
    independentParts: decomposeFloor.minIndependentParts - 1,
  });
  const cases = [
    ['adversarial-verify', { artifact: 'artifact '.repeat(40), preflight: refusedPanel }],
    ['divergent-explore', { question: 'question '.repeat(20), force: true, preflight: refusedDecompose }],
    ['pipeline-map', { items: ['one'], preflight: refusedDecompose }],
  ];

  for (const [name, args] of cases) {
    const run = await runRecipe(name, args, () => 'should not run');
    assert.equal(run.result.refused, true, `${name} did not refuse`);
    assert.equal(run.spawnCount, 0, `${name} spawned before refusal`);
  }
});

await check('all remaining recipes keep their existing path after an allowed preflight', async () => {
  const allowedPanel = decidePreflightRoute({
    requestedRoute: PREFLIGHT_ROUTES.PANEL,
    task: panelTask,
    precisionNeed: panelFloor.precisionNeed,
  });
  const allowedDecompose = decidePreflightRoute({
    requestedRoute: PREFLIGHT_ROUTES.DECOMPOSE,
    task: decomposeTask,
    independentParts: decomposeFloor.minIndependentParts,
  });

  const adversarial = await runRecipe(
    'adversarial-verify',
    { artifact: panelTask, lenses: ['correctness'], preflight: allowedPanel },
    () => ({
      lens: 'correctness',
      refuted: false,
      confidence: 'low',
      defect_class: 'none',
      findings: [],
    }),
  );
  assert.equal(adversarial.spawnCount, 1);
  assert.equal(adversarial.result.gate.red_gate_pass, true);

  const divergent = await runRecipe(
    'divergent-explore',
    {
      question: decomposeTask,
      lenses: ['mvp-first'],
      maxRounds: 1,
      force: true,
      preflight: allowedDecompose,
    },
    label => label.startsWith('diverge:')
      ? { lens: 'mvp-first', hypotheses: [] }
      : 'synthesis',
  );
  assert.equal(divergent.spawnCount, 2);

  const mapped = await runRecipe(
    'pipeline-map',
    { items: ['one'], preflight: allowedDecompose },
    label => label.startsWith('verify:')
      ? { ok: true, note: 'checked' }
      : { ok: true, output: label, note: 'stage' },
  );
  assert.equal(mapped.spawnCount, 3);
  assert.equal(mapped.result.total, 1);
});

await check('floor-met judge route proceeds through generation, judging, and synthesis', async () => {
  const attributes = {
    requestedRoute: PREFLIGHT_ROUTES.PANEL,
    task: panelTask,
    precisionNeed: panelFloor.precisionNeed,
  };
  const routed = await runPreflightRoute(attributes, preflight => runRecipe(
    'judge-panel',
    {
      task: panelTask,
      highStakes: true,
      angles: ['a', 'b', 'c'],
      preflight,
    },
    label => {
      if (label.startsWith('gen:')) return 'candidate';
      if (label.startsWith('judge:')) {
        return { candidate: 0, total: 8, per_criterion: [], verdict: 'ranked' };
      }
      return 'final';
    },
  ));

  assert.equal(routed.decision.allow, true);
  assert.equal(routed.proceeded, true);
  assert.equal(routed.result.spawnCount, 7);
  assert.equal(routed.result.labels.filter(label => label.startsWith('gen:')).length, 3);
  assert.equal(routed.result.labels.filter(label => label.startsWith('judge:')).length, 3);
  assert.ok(routed.result.labels.includes('synthesize'));
});

await check('floor-failed decompose route refuses before the planner with spawnCount=0', async () => {
  const preflight = decidePreflightRoute({
    requestedRoute: PREFLIGHT_ROUTES.DECOMPOSE,
    task: decomposeTask,
    independentParts: decomposeFloor.minIndependentParts - 1,
  });
  const run = await runRecipe(
    'decompose-first',
    { task: decomposeTask, preflight },
    () => ({
      split_axis: 'by-file-or-module',
      rationale: 'should not run',
      independent: true,
      subproblems: [],
    }),
  );
  assert.equal(run.result.refused, true);
  assert.equal(run.result.reason, 'decompose-cost-floor-not-met');
  assert.equal(run.spawnCount, 0);
});

await check('floor-met decompose route proceeds through planner, parts, and integration', async () => {
  const attributes = {
    requestedRoute: PREFLIGHT_ROUTES.DECOMPOSE,
    task: decomposeTask,
    independentParts: decomposeFloor.minIndependentParts,
  };
  const routed = await runPreflightRoute(attributes, preflight => runRecipe(
    'decompose-first',
    { task: decomposeTask, preflight },
    label => {
      if (label === 'plan') {
        return {
          split_axis: 'by-file-or-module',
          rationale: 'two declared parts',
          independent: true,
          subproblems: [
            { title: 'one', goal: 'first part' },
            { title: 'two', goal: 'second part' },
          ],
        };
      }
      if (label.startsWith('sub:')) {
        return { title: label, result: 'done', open_issues: [] };
      }
      return 'integrated';
    },
  ));

  assert.equal(routed.decision.allow, true);
  assert.equal(routed.proceeded, true);
  assert.equal(routed.result.spawnCount, decomposeFloor.minIndependentParts + 2);
  assert.ok(routed.result.labels.includes('plan'));
  assert.ok(routed.result.labels.includes('integrate'));
});

await check('default-off regression: omitting preflight keeps the legacy judge path', async () => {
  const run = await runRecipe(
    'judge-panel',
    {
      task: 'legacy direct route',
      highStakes: true,
      angles: ['only'],
    },
    label => {
      if (label.startsWith('judge:')) {
        return { candidate: 0, total: 1, per_criterion: [], verdict: 'ranked' };
      }
      return label.startsWith('gen:') ? 'candidate' : 'final';
    },
  );
  assert.equal(run.spawnCount, 3);
  assert.equal(run.result.of_candidates, 1);
});

// Charter #2: a DEFAULT install must stay byte-identical to v1.3.0, so the default orchestrate skill must
// NOT mandate the preflight — the gate module is pruned from a default install, and a skill that ordered a
// fail-closed call to a pruned file would brick orchestration by default. The preflight guidance therefore
// lives ONLY in the opt-in overlay, which the installers select when the flag is on.
await check('default orchestrate skill stays at HEAD; only the opt-in overlay wires preflight', () => {
  const defaultSkill = readFileSync(CLAUDE_ORCHESTRATE_SKILL, 'utf8');
  const upgradedSkill = readFileSync(OPTIN_ORCHESTRATE_SKILL, 'utf8');
  const headSkill = spawnSync('git', ['show', 'HEAD:claude-code/skills/orchestrate/SKILL.md'], { cwd: ROOT, encoding: 'utf8' }).stdout;
  assert.equal(defaultSkill, headSkill, 'default orchestrate skill must be byte-identical to HEAD');
  assert.notEqual(defaultSkill, upgradedSkill, 'the opt-in overlay must actually differ (else the flag gates nothing)');
  assert.doesNotMatch(defaultSkill, /preflight-gate\.mjs/);
  assert.match(upgradedSkill, /preflight-gate\.mjs/);
  assert.match(upgradedSkill, /--require-multi/);
  assert.match(upgradedSkill, /do \*\*not\*\* call Workflow/);
  assert.match(upgradedSkill, /args\.preflight/);
});

await check('new preflight docs pass the magnitude/parallel claim lint', () => {
  const result = spawnSync(process.execPath, [
    CLAIM_LINT,
    path.join(ROOT, 'orchestration', 'README.md'),
    CLAUDE_ORCHESTRATE_SKILL,
    OPTIN_ORCHESTRATE_SKILL,
  ], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, (result.stderr || result.stdout || '').trim());
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
