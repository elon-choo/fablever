#!/usr/bin/env node
// G3.3 bidirectional oracle for durable decision plans, trigger gating, and contract binding.
import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  PLAN_REQUIRED_SECTIONS,
  PLAN_TRIGGER,
  createPlanTemplate,
  hashPlanArtifact,
  lintPlanArtifact,
  renderPlanArtifact,
  writePlanArtifact,
} from '../orchestration/lib/plan-artifact.mjs';
import {
  RUN_CONTRACT_SCHEMA_VERSION,
  RUN_EVENT_TYPES,
  RUN_FILES,
  assertRunPlanBinding,
  createRun,
  loadRunState,
  readRunContract,
  readRunLedger,
  rebindRunPlan,
  recordRunPlanDeviation,
  startCriterionAttempt,
  validateRunContract,
} from '../orchestration/lib/run-state.mjs';

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

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clone = value => JSON.parse(JSON.stringify(value));
const at = second => `2026-07-17T01:00:${String(second).padStart(2, '0')}.000Z`;
const decisions = Object.freeze({
  title: 'Decision-complete durable plan',
  outcome: 'A durable plan records the decisions needed to implement G3.3 across sessions.',
  scope: Object.freeze({
    in: Object.freeze([
      'The plan artifact, lint, explicit trigger, and run-contract hash binding.',
    ]),
    out: Object.freeze([
      'Product feature implementation and mutable progress tracking.',
    ]),
  }),
  criteria: Object.freeze([
    'Every required decision section is present and non-empty.',
    'A silent content change cannot remain bound to the old contract hash.',
  ]),
  orderedDependencies: Object.freeze([
    'Write and lint the decision snapshot before creating the run contract.',
    'Bind the resulting content hash before execution begins.',
  ]),
  riskyAssumptions: Object.freeze([
    'Any byte-level content change is conservatively treated as material steering.',
  ]),
  nonGoals: Object.freeze([
    'Store progress, completion state, or verification debt in the plan.',
  ]),
});

function replaceSection(markdown, heading, replacement) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\n## ${escaped}\\n[\\s\\S]*?(?=\\n## |$)`);
  return markdown.replace(pattern, `\n## ${heading}\n${replacement}`);
}

function removeSection(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\n## ${escaped}\\n[\\s\\S]*?(?=\\n## |$)`);
  return markdown.replace(pattern, '');
}

function listFiles(root, relative = '.') {
  const absolute = path.join(root, relative);
  const entries = readdirSync(absolute, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  const files = [];
  for (const entry of entries) {
    const child = relative === '.' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) files.push(...listFiles(root, child));
    else files.push(child);
  }
  return files;
}

function contractFor(runId, artifact = null) {
  return {
    schemaVersion: RUN_CONTRACT_SCHEMA_VERSION,
    runId,
    goal: 'Keep a durable plan bound to the single authoritative run ledger.',
    criteria: [
      {
        id: 'criterion.plan',
        description: 'The decision-complete plan remains explicitly hash-bound.',
      },
    ],
    scope: {
      include: [
        'orchestration/lib/plan-artifact.mjs',
        'orchestration/lib/run-state.mjs',
        'test/plan-artifact-test.mjs',
      ],
      exclude: [
        'product files',
        'always-on hooks and default runtime paths',
      ],
    },
    allowedActions: [
      'write the explicitly triggered plan artifact',
      'append typed plan steering events to ledger.jsonl',
      'run local checks',
    ],
    blockers: [],
    checks: [
      {
        id: 'check.plan',
        criterionId: 'criterion.plan',
        type: 'command',
        definition: 'node test/plan-artifact-test.mjs',
      },
    ],
    ...(artifact ? { planPath: artifact.path, planHash: artifact.sha256 } : {}),
  };
}

function recursiveTextFiles(entry) {
  const absolute = path.join(REPO, entry);
  const metadata = lstatSync(absolute);
  if (metadata.isFile()) return [absolute];
  const files = [];
  for (const child of readdirSync(absolute, { withFileTypes: true })) {
    const childPath = path.join(absolute, child.name);
    if (child.isDirectory()) files.push(...recursiveTextFiles(path.relative(REPO, childPath)));
    else if (child.isFile()) files.push(childPath);
  }
  return files;
}

console.log('decision-complete durable plan artifact (G3.3):');

const completePlan = renderPlanArtifact(decisions);

// (a) Bidirectional plan lint: complete passes; every missing/empty required section fails.
check('a complete decision plan passes and exposes all required sections', () => {
  const result = lintPlanArtifact(completePlan);
  assert.deepEqual(result.sections, PLAN_REQUIRED_SECTIONS);
  assert.equal(hashPlanArtifact(completePlan), createHash('sha256').update(completePlan).digest('hex'));
});

check('removing any one required section fails the lint', () => {
  for (const section of PLAN_REQUIRED_SECTIONS) {
    assert.throws(
      () => lintPlanArtifact(removeSection(completePlan, section)),
      /plan lint failed/,
      section,
    );
  }
});

check('emptying any required section, Scope In, or Scope Out fails the lint', () => {
  for (const section of PLAN_REQUIRED_SECTIONS) {
    assert.throws(
      () => lintPlanArtifact(replaceSection(completePlan, section, '\n')),
      /plan lint failed/,
      section,
    );
  }
  const emptyIn = completePlan.replace(
    /### In\n[\s\S]*?(?=\n### Out)/,
    '### In\n\n<!-- no decision -->\n',
  );
  const emptyOut = completePlan.replace(
    /### Out\n[\s\S]*?(?=\n## Criteria)/,
    '### Out\n\n<!-- no decision -->\n',
  );
  assert.throws(() => lintPlanArtifact(emptyIn), /Scope In must not be empty/);
  assert.throws(() => lintPlanArtifact(emptyOut), /Scope Out must not be empty/);
  assert.throws(() => lintPlanArtifact(createPlanTemplate('Unfilled')), /must not be empty/);
});

check('ordered dependencies are numbered and mutable state syntax is rejected', () => {
  const unnumbered = completePlan.replace(
    '1. Write and lint the decision snapshot before creating the run contract.',
    '- Write and lint the decision snapshot before creating the run contract.',
  ).replace(
    '2. Bind the resulting content hash before execution begins.',
    '- Bind the resulting content hash before execution begins.',
  );
  assert.throws(() => lintPlanArtifact(unnumbered), /must contain at least one numbered entry/);
  assert.throws(
    () => lintPlanArtifact(`${completePlan}\n## Progress\n\n- underway\n`),
    /state heading "Progress" is forbidden/,
  );
  assert.throws(
    () => lintPlanArtifact(completePlan.replace(
      '1. Every required decision section is present and non-empty.',
      '- [ ] Every required decision section is present and non-empty.',
    )),
    /task-list checkboxes are forbidden/,
  );
  assert.throws(
    () => lintPlanArtifact(completePlan.replace(
      '1. Every required decision section is present and non-empty.',
      '1. [ ] Every required decision section is present and non-empty.',
    )),
    /task-list checkboxes are forbidden/,
  );
});

check('malformed comments and heading-only placeholders cannot fake non-empty decisions', () => {
  assert.throws(
    () => lintPlanArtifact(completePlan.replace(
      '\n## Outcome\n',
      '\n<!--\n## Outcome\n',
    )),
    /unterminated HTML comment/,
  );
  assert.throws(
    () => lintPlanArtifact(replaceSection(
      completePlan,
      'Outcome',
      '\n### Placeholder\n',
    )),
    /section "Outcome" must not be empty/,
  );
});

const root = mkdtempSync(path.join(tmpdir(), 'fable-plan-artifact-'));
try {
  // (b, c) Explicit trigger writes only plans/<slug>.md and leaves product bytes/mtimes untouched.
  const projectRoot = path.join(root, 'project');
  const sourceDirectory = path.join(projectRoot, 'src');
  mkdirSync(sourceDirectory, { recursive: true });
  const productFiles = [
    path.join(sourceDirectory, 'app.js'),
    path.join(sourceDirectory, 'config.json'),
  ];
  writeFileSync(productFiles[0], 'export const answer = 42;\n');
  writeFileSync(productFiles[1], '{"mode":"stable"}\n');
  const fixedTime = new Date('2024-01-02T03:04:05.000Z');
  for (const productFile of productFiles) utimesSync(productFile, fixedTime, fixedTime);
  const productBefore = productFiles.map(file => ({
    file,
    content: readFileSync(file),
    mtimeNs: statSync(file, { bigint: true }).mtimeNs,
  }));

  check('default or wrong triggers enter no plan flow and create no files', () => {
    assert.throws(
      () => writePlanArtifact(projectRoot, 'g3-3-plan', decisions),
      /explicit "hard-multi-part" trigger/,
    );
    assert.throws(
      () => writePlanArtifact(
        projectRoot,
        'g3-3-plan',
        decisions,
        { trigger: 'default' },
      ),
      /default flow is inert/,
    );
    assert.equal(existsSync(path.join(projectRoot, 'plans')), false);
  });

  let initialArtifact;
  check('explicit hard-multi-part planning mutates only the plan artifact', () => {
    initialArtifact = writePlanArtifact(
      projectRoot,
      'g3-3-plan',
      decisions,
      { trigger: PLAN_TRIGGER },
    );
    assert.equal(initialArtifact.relativePath, 'plans/g3-3-plan.md');
    assert.equal(initialArtifact.content, completePlan);
    assert.equal(
      initialArtifact.sha256,
      createHash('sha256').update(readFileSync(initialArtifact.path)).digest('hex'),
    );
    for (const before of productBefore) {
      assert.deepEqual(readFileSync(before.file), before.content);
      assert.equal(statSync(before.file, { bigint: true }).mtimeNs, before.mtimeNs);
    }
    assert.deepEqual(listFiles(projectRoot), [
      'plans/g3-3-plan.md',
      'src/app.js',
      'src/config.json',
    ]);
  });

  check('plan output is constrained to plans/<lowercase-kebab-slug>.md', () => {
    assert.throws(
      () => writePlanArtifact(
        projectRoot,
        '../escape',
        decisions,
        { trigger: PLAN_TRIGGER },
      ),
      /lowercase kebab-case/,
    );
    assert.equal(existsSync(path.join(root, 'escape.md')), false);
  });

  check('plan binding hashes exact bytes and rejects invalid UTF-8', () => {
    assert.notEqual(
      hashPlanArtifact(Buffer.from([0x80])),
      hashPlanArtifact(Buffer.from([0x81])),
    );
    const utf8Artifact = writePlanArtifact(
      projectRoot,
      'g3-3-utf8',
      decisions,
      { trigger: PLAN_TRIGGER },
    );
    const utf8Run = path.join(root, 'runs', 'utf8');
    createRun(
      utf8Run,
      contractFor('g3.3-utf8', utf8Artifact),
      { timestamp: at(30) },
    );
    const validBytes = readFileSync(utf8Artifact.path);
    writeFileSync(
      utf8Artifact.path,
      Buffer.concat([validBytes, Buffer.from([0x80])]),
    );
    assert.throws(
      () => loadRunState(utf8Run),
      /plan artifact must be valid UTF-8/,
    );
  });

  check('on-demand skill mirrors carry trigger-gated durable decision-plan guidance', () => {
    const defaultClaudeSkill = readFileSync(
      path.join(REPO, 'claude-code/skills/fable-plan/SKILL.md'),
      'utf8',
    );
    const defaultCodexSkill = readFileSync(
      path.join(REPO, '.agents/skills/fable-plan/SKILL.md'),
      'utf8',
    );
    const upgradedSkill = readFileSync(
      path.join(REPO, 'skill/optin/fable-plan/SKILL.md'),
      'utf8',
    );
    // Charter #2: the DEFAULT-installed skill must stay byte-identical to v1.3.0 — the durable-plan machinery
    // (run-state/plan-artifact) is pruned from a default install, so default guidance must not order it.
    // The upgraded guidance lives ONLY in the opt-in overlay the installers select when the flag is on.
    const headSkill = spawnSync('git', ['show', 'HEAD:claude-code/skills/fable-plan/SKILL.md'], { cwd: REPO, encoding: 'utf8' }).stdout;
    assert.equal(defaultClaudeSkill, defaultCodexSkill, 'default mirrors must match each other');
    assert.equal(defaultClaudeSkill, headSkill, 'default fable-plan skill must be byte-identical to HEAD');
    assert.notEqual(defaultClaudeSkill, upgradedSkill, 'the opt-in overlay must actually differ (else the flag gates nothing)');
    assert.doesNotMatch(defaultClaudeSkill, /plans\/<lowercase-kebab-slug>\.md/);
    assert.match(upgradedSkill, /durable decision plan/);
    assert.match(upgradedSkill, /explicitly pulled for genuinely hard multi-part work/);
    assert.match(upgradedSkill, /Never\s+enter it from a default or always-on path/);
    assert.match(upgradedSkill, /Progress and debt belong in the run ledger/);
    assert.doesNotMatch(upgradedSkill, /update the plan line/i);
    for (const section of PLAN_REQUIRED_SECTIONS) {
      assert.match(upgradedSkill, new RegExp(`## ${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    }
  });

  check('no default hook, profile, installer, MCP, or recipe invokes the plan writer', () => {
    const defaultSurfaces = [
      'install.mjs',
      'install.sh',
      'profiles',
      'claude-code/hooks',
      'codex/hooks',
      'mcp/src',
      'orchestration/recipes',
    ];
    const forbiddenInvocation = /(?:from\s+|import\s*\(|require\s*\()\s*['"][^'"]*plan-artifact\.mjs|writePlanArtifact\s*\(|PLAN_TRIGGER/;
    for (const file of defaultSurfaces.flatMap(recursiveTextFiles)) {
      assert.doesNotMatch(
        readFileSync(file, 'utf8'),
        forbiddenInvocation,
        path.relative(REPO, file),
      );
    }
  });

  // (d) Optional plan hash in contract; steering must rebind or record an exact deviation.
  check('planless contracts stay valid while malformed/partial plan bindings fail closed', () => {
    const planless = contractFor('g3.3-planless');
    assert.deepEqual(validateRunContract(clone(planless)), planless);
    const missingPath = { ...contractFor('g3.3-missing-path'), planHash: '0'.repeat(64) };
    assert.throws(() => validateRunContract(missingPath), /must be provided together/);
    const relativePath = {
      ...contractFor('g3.3-relative'),
      planPath: 'plans/g3-3-plan.md',
      planHash: initialArtifact.sha256,
    };
    assert.throws(() => validateRunContract(relativePath), /must be an absolute path/);
    const malformedHash = {
      ...contractFor('g3.3-bad-hash'),
      planPath: initialArtifact.path,
      planHash: 'not-a-sha256',
    };
    assert.throws(() => validateRunContract(malformedHash), /lowercase SHA-256 digest/);
  });

  const boundRun = path.join(root, 'runs', 'rebind');
  const boundContract = contractFor('g3.3-rebind', initialArtifact);
  check('initial plan hash is recorded in contract.json and contract.created', () => {
    createRun(boundRun, boundContract, { timestamp: at(0) });
    const contract = readRunContract(boundRun);
    const events = readRunLedger(boundRun);
    assert.equal(contract.planPath, initialArtifact.path);
    assert.equal(contract.planHash, initialArtifact.sha256);
    assert.equal(events[0].payload.planPath, initialArtifact.path);
    assert.equal(events[0].payload.planHash, initialArtifact.sha256);
    const planState = assertRunPlanBinding(boundRun);
    assert.equal(planState.initialHash, initialArtifact.sha256);
    assert.equal(planState.boundHash, initialArtifact.sha256);
    assert.equal(planState.currentHash, initialArtifact.sha256);
    assert.equal(planState.status, 'bound');
  });

  let reboundContent;
  let reboundHash;
  check('silent material steering fails and blocks further run events without ledger mutation', () => {
    reboundContent = renderPlanArtifact({
      ...clone(decisions),
      outcome: 'The steered outcome keeps the durable plan bound to the revised decision.',
    });
    reboundHash = createHash('sha256').update(reboundContent).digest('hex');
    writeFileSync(initialArtifact.path, reboundContent);
    const ledgerBefore = readFileSync(path.join(boundRun, RUN_FILES.ledger), 'utf8');
    assert.throws(() => loadRunState(boundRun), /silent plan divergence/);
    assert.throws(
      () => startCriterionAttempt(
        boundRun,
        'criterion.plan',
        'attempt.silent.1',
        { timestamp: at(1) },
      ),
      /silent plan divergence/,
    );
    assert.equal(readFileSync(path.join(boundRun, RUN_FILES.ledger), 'utf8'), ledgerBefore);
  });

  check('typed plan.rebound advances the effective hash while contract keeps the initial snapshot', () => {
    const rebound = rebindRunPlan(boundRun, {
      reason: 'User steering materially changed the desired outcome.',
      timestamp: at(2),
    });
    assert.equal(rebound.type, RUN_EVENT_TYPES.PLAN_REBOUND);
    assert.equal(rebound.payload.fromHash, initialArtifact.sha256);
    assert.equal(rebound.payload.toHash, reboundHash);
    const contract = readRunContract(boundRun);
    const state = loadRunState(boundRun);
    assert.equal(contract.planHash, initialArtifact.sha256);
    assert.equal(state.plan.initialHash, initialArtifact.sha256);
    assert.equal(state.plan.boundHash, reboundHash);
    assert.equal(state.plan.currentHash, reboundHash);
    assert.equal(state.plan.status, 'bound');
    assert.equal(state.plan.rebindings.length, 1);
  });

  let deviationArtifact;
  const deviationRun = path.join(root, 'runs', 'deviation');
  check('a hash-specific explicit deviation permits only the recorded observed content', () => {
    deviationArtifact = writePlanArtifact(
      projectRoot,
      'g3-3-deviation',
      decisions,
      { trigger: PLAN_TRIGGER },
    );
    createRun(
      deviationRun,
      contractFor('g3.3-deviation', deviationArtifact),
      { timestamp: at(10) },
    );
    const steered = renderPlanArtifact({
      ...clone(decisions),
      nonGoals: ['Do not rebind this intentionally deviating decision snapshot.'],
    });
    writeFileSync(deviationArtifact.path, steered);
    const event = recordRunPlanDeviation(deviationRun, {
      reason: 'The owner accepted this one explicit divergence without rebinding.',
      timestamp: at(11),
    });
    assert.equal(event.type, RUN_EVENT_TYPES.PLAN_DEVIATION_RECORDED);
    const state = loadRunState(deviationRun);
    assert.equal(state.plan.boundHash, deviationArtifact.sha256);
    assert.equal(state.plan.currentHash, event.payload.observedHash);
    assert.equal(state.plan.status, 'deviation-recorded');
    assert.equal(state.plan.deviation.reason, event.payload.reason);

    const secondSteering = renderPlanArtifact({
      ...clone(decisions),
      nonGoals: ['A second unrecorded steering change must fail again.'],
    });
    writeFileSync(deviationArtifact.path, secondSteering);
    assert.throws(() => loadRunState(deviationRun), /silent plan divergence/);
  });

  check('editing contract planHash cannot bypass the ledger-preserved initial binding', () => {
    const tamperArtifact = writePlanArtifact(
      projectRoot,
      'g3-3-tamper',
      decisions,
      { trigger: PLAN_TRIGGER },
    );
    const tamperRun = path.join(root, 'runs', 'tamper');
    createRun(
      tamperRun,
      contractFor('g3.3-tamper', tamperArtifact),
      { timestamp: at(20) },
    );
    const contractPath = path.join(tamperRun, RUN_FILES.contract);
    const forged = JSON.parse(readFileSync(contractPath, 'utf8'));
    forged.planHash = '0'.repeat(64);
    writeFileSync(contractPath, `${JSON.stringify(forged, null, 2)}\n`);
    assert.throws(
      () => loadRunState(tamperRun),
      /does not match the ledger contract\.created binding/,
    );
  });
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
