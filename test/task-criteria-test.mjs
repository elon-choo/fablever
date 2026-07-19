#!/usr/bin/env node
// G3.4 UNIT: optional one-question criteria capture, shared fable_check parsing,
// and proof that no mandatory clarify stage exists.
import assert from 'node:assert/strict';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  lintPlanArtifact,
  renderPlanArtifact,
} from '../orchestration/lib/plan-artifact.mjs';
import {
  RUN_CONTRACT_SCHEMA_VERSION,
  validateRunContract,
} from '../orchestration/lib/run-state.mjs';

const require = createRequire(import.meta.url);
const {
  TASK_CRITERIA_END,
  parseTaskCriteriaBlock,
  renderTaskCriteriaBlock,
  shouldCaptureTaskCriteria,
} = require('../mcp/src/task-criteria.js');

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

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAUDE_SKILL = path.join(REPO, 'claude-code/skills/fable-plan/SKILL.md');
const CODEX_SKILL = path.join(REPO, '.agents/skills/fable-plan/SKILL.md');
const UPGRADED_SKILL = path.join(REPO, 'skill/optin/fable-plan/SKILL.md');
const SERVER = path.join(REPO, 'mcp/src/server.js');
const INSTALL = path.join(REPO, 'install.mjs');
const HEAD_FABLE_CHECK_DESCRIPTION = 'Deterministically GATE a finished deliverable against a per-domain Definition of Done before you hand it over — the delivery gate. dod_id ∈ code | doc-planning | research | marketing-copy | funnel-design. Returns each acceptance item as PASS / FAIL / UNCHECKED with the gap and the fix, plus an overall gate of PASS or BLOCK. A BLOCK means a checkable criterion is unmet: fix it and re-run, do not deliver. UNCHECKED items are taste/judgement calls a human must confirm — they are never auto-passed. Also enforces your taste-memory rules for the domain. Zero LLM. Run it on the artifact you are about to deliver, not on a draft message (that is fable_lint).';

function clarifyGateSection(text) {
  const heading = '## Optional clarify gate';
  const start = text.indexOf(heading);
  if (start < 0) return null;
  const next = text.indexOf('\n## ', start + heading.length);
  return text.slice(start, next < 0 ? text.length : next);
}

function lintClarifyGateSkill(text) {
  const section = clarifyGateSection(text);
  if (!section) return ['missing-clarify-gate-section'];

  const violations = [];
  const requirePattern = (name, pattern) => {
    if (!pattern.test(section)) violations.push(name);
  };
  requirePattern(
    'missing-both-condition-gate',
    /enter this gate only if both conditions hold/i,
  );
  requirePattern('missing-genuine-ambiguity', /genuinely ambiguous/i);
  requirePattern(
    'missing-reversal-cost',
    /(?:costly|expensive)|hard to (?:undo|reverse)/i,
  );
  requirePattern(
    'missing-one-question-cap',
    /ask at most one\s+clarifying question/i,
  );
  requirePattern(
    'missing-act-when-enough-fallback',
    /ask no question and act when you have enough/i,
  );
  requirePattern(
    'missing-no-interview-boundary',
    /never turn this into an interview/i,
  );

  const forbidden = [
    [
      'authorizes-question-series',
      /\b(?:ask|pose)\b[^.\n]{0,100}\b(?:a series of|multiple|several)\s+(?:clarifying\s+)?questions?\b/i,
    ],
    [
      'authorizes-multiple-question-count',
      /\b(?:ask|pose)\b[^.\n]{0,100}\b(?:2\s*[-–]\s*3|[2-9]|two|three|at least two)\s+(?:clarifying\s+)?questions?\b/i,
    ],
    [
      'authorizes-follow-up-question',
      /\b(?:ask|pose)\b[^.\n]{0,80}\b(?:another|additional|follow-up|next|second)\b[^.\n]{0,40}\bquestions?\b/i,
    ],
    [
      'authorizes-repeated-questions',
      /\b(?:keep|continue)\s+(?:asking|to ask)\b[^.\n]{0,80}\bquestions?\b/i,
    ],
    [
      'forces-interview-stage',
      /\b(?:always|must|required|mandatory)\b[^.\n]{0,80}\b(?:interview|clarif(?:y|ication)|questions?)\b/i,
    ],
    [
      'forces-interview-stage',
      /\b(?:interview|clarification|clarifying)\b[^.\n]{0,80}\b(?:always|must|required|mandatory|every task)\b/i,
    ],
    [
      'blocks-action-until-interview',
      /\bnever\s+(?:start|act|proceed)\b[^.\n]{0,100}\buntil\b[^.\n]{0,100}\b(?:clarif|questions?|answers?)\b/i,
    ],
    [
      'forces-interview-stage',
      /\b(?:conduct\s+an?\s+)?interview\b[^.\n]{0,80}\bbefore\s+(?:starting|acting|planning)\b/i,
    ],
    [
      'forces-interview-stage',
      /\b(?:begin|start)\b[^.\n]{0,80}\b(?:user\s+)?interview\b/i,
    ],
  ];
  for (const [name, pattern] of forbidden) {
    if (pattern.test(section) && !violations.includes(name)) violations.push(name);
  }
  return violations;
}

function recursiveTextFiles(entry) {
  const absolute = path.join(REPO, entry);
  const metadata = lstatSync(absolute);
  if (metadata.isFile()) return [absolute];
  const files = [];
  for (const child of readdirSync(absolute, { withFileTypes: true })) {
    const childPath = path.join(absolute, child.name);
    if (child.isDirectory()) {
      files.push(...recursiveTextFiles(path.relative(REPO, childPath)));
    } else if (child.isFile()) {
      files.push(childPath);
    }
  }
  return files;
}

async function withMcp(callback, { taskCriteriaFlag = 'on', serverPath = SERVER, extraEnv = {} } = {}) {
  const env = {
    ...process.env,
    ...extraEnv,
    FABLE_TASTE: 'off',
  };
  delete env.FABLE_TASK_CRITERIA;
  if (taskCriteriaFlag !== null) env.FABLE_TASK_CRITERIA = taskCriteriaFlag;
  const child = spawn(process.execPath, [serverPath], {
    stdio: ['pipe', 'pipe', 'ignore'],
    env,
  });
  let buffer = '';
  let nextId = 1;
  const pending = new Map();

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      clearTimeout(waiter.timer);
      pending.delete(message.id);
      waiter.resolve(message);
    }
  });

  const rejectPending = (error) => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    pending.clear();
  };
  child.on('error', rejectPending);
  child.on('exit', (code, signal) => {
    if (pending.size) {
      rejectPending(new Error(`MCP server exited before replying (${code ?? signal})`));
    }
  });

  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`MCP request timed out: ${method}`));
    }, 5000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });

  try {
    return await callback(rpc);
  } finally {
    child.stdin.end();
    child.kill();
  }
}

console.log('optional task acceptance-criteria capture (G3.4 UNIT):');

const defaultClaudeSkill = readFileSync(CLAUDE_SKILL, 'utf8');
const defaultCodexSkill = readFileSync(CODEX_SKILL, 'utf8');
const upgradedSkill = readFileSync(UPGRADED_SKILL, 'utf8');
const claudeSkill = defaultClaudeSkill;

// Charter #2: the DEFAULT-installed skill stays byte-identical to v1.3.0 (it carries NO clarify gate);
// the at-most-one clarify gate ships ONLY in the opt-in overlay the installers select behind the flag.
await check('default skill mirrors stay at HEAD; only the opt-in overlay carries the at-most-one clarify gate', () => {
  const headSkill = spawnSync('git', ['show', 'HEAD:claude-code/skills/fable-plan/SKILL.md'], { cwd: REPO, encoding: 'utf8' }).stdout;
  assert.equal(defaultClaudeSkill, defaultCodexSkill, 'default mirrors must match each other');
  assert.equal(defaultClaudeSkill, headSkill, 'default fable-plan skill must be byte-identical to HEAD');
  assert.notEqual(defaultClaudeSkill, upgradedSkill, 'the opt-in overlay must actually differ (else the flag gates nothing)');
  assert.equal(clarifyGateSection(defaultClaudeSkill), null);
  assert.equal(clarifyGateSection(defaultCodexSkill), null);
  assert.notEqual(clarifyGateSection(upgradedSkill), null);
  assert.deepEqual(lintClarifyGateSkill(upgradedSkill), []);
});

await check('skill lint rejects diverse multi-question and mandatory-interview wording', () => {
  const violatingPhrases = [
    'Ask the user a series of questions before writing the plan.',
    'Always interview before starting.',
    'Ask 2-3 questions to clarify acceptance criteria.',
    'Clarification is a mandatory stage for every task.',
    'Ask at least two clarifying questions before acting.',
    'Never start until the user has answered all clarification questions.',
    'Interview before starting.',
    'Ask a follow-up clarifying question before finalizing the plan.',
    'Keep asking clarifying questions until the specification is complete.',
    'Ask another question if the first answer is incomplete.',
    'Begin with a user interview, then write the plan.',
  ];
  for (const phrase of violatingPhrases) {
    const seeded = claudeSkill.replace(
      '\n## Procedure',
      `\n${phrase}\n\n## Procedure`,
    );
    assert.notDeepEqual(
      lintClarifyGateSkill(seeded),
      [],
      `lint unexpectedly passed: ${phrase}`,
    );
  }
});

const expectedCriteria = [
  {
    id: 'task.unit-only',
    description: 'Implement only the deterministic G3.4 unit slice.',
  },
  {
    id: 'task.ledger-untouched',
    description: 'Leave the harness upgrade ledger unchanged.',
  },
];
const criteriaBlock = renderTaskCriteriaBlock(expectedCriteria);
const parsedCriteria = parseTaskCriteriaBlock(criteriaBlock);

await check('capture renderer output round-trips through the shared parser', () => {
  assert.deepEqual(parsedCriteria, {
    schemaVersion: 1,
    criteria: expectedCriteria,
  });
});

await check('malformed and duplicate task-criteria blocks are rejected', () => {
  assert.throws(
    () => parseTaskCriteriaBlock(criteriaBlock.replace(TASK_CRITERIA_END, '')),
    /exactly one start and end marker/,
  );
  assert.throws(
    () => parseTaskCriteriaBlock(criteriaBlock.replace(
      TASK_CRITERIA_END,
      `- [task.unit-only] Duplicate criterion.\n${TASK_CRITERIA_END}`,
    )),
    /duplicate task criterion id/,
  );
  assert.throws(
    () => parseTaskCriteriaBlock(criteriaBlock.replace(
      '- [task.unit-only] Implement only the deterministic G3.4 unit slice.',
      'task.unit-only = malformed',
    )),
    /malformed task criterion line/,
  );
  assert.throws(
    () => renderTaskCriteriaBlock([{
      id: 'task.marker',
      description: `Do not emit ${TASK_CRITERIA_END} inside a criterion.`,
    }]),
    /cannot contain block markers/,
  );
});

await check('parsed criteria fit the existing plan and immutable run contract', () => {
  const plan = renderPlanArtifact({
    title: 'Optional task criteria',
    outcome: 'Capture this task acceptance criteria without a mandatory interview.',
    scope: {
      in: ['The optional capture block and deterministic unit proof.'],
      out: ['The budget-gated A/B evaluation.'],
    },
    criteria: parsedCriteria.criteria.map(entry => entry.description),
    orderedDependencies: [
      'Capture criteria before writing the decision plan and creating the run contract.',
    ],
    riskyAssumptions: [
      'Semantic criteria require human confirmation unless a separate executable oracle exists.',
    ],
    nonGoals: [
      'Auto-grade arbitrary user intent from prose.',
    ],
  });
  const planWithBlock = plan.replace(
    '\n## Ordered dependencies',
    `\n${criteriaBlock}\n## Ordered dependencies`,
  );
  lintPlanArtifact(planWithBlock);
  assert.deepEqual(parseTaskCriteriaBlock(planWithBlock), parsedCriteria);

  const contract = validateRunContract({
    schemaVersion: RUN_CONTRACT_SCHEMA_VERSION,
    runId: 'g3.4-task-criteria',
    goal: 'Capture optional task criteria in the existing run authority.',
    criteria: parsedCriteria.criteria,
    scope: {
      include: ['mcp/src/task-criteria.js', 'test/task-criteria-test.mjs'],
      exclude: ['docs/proposals/HARNESS-UPGRADE-LEDGER.md', 'A/B evaluation'],
    },
    allowedActions: ['parse the opt-in block', 'run local checks'],
    blockers: [],
    checks: parsedCriteria.criteria.map((entry, index) => ({
      id: `check.task.${index + 1}`,
      criterionId: entry.id,
      type: 'assertion',
      definition: `Confirm fable_check surfaces ${entry.id}.`,
    })),
  });
  assert.deepEqual(contract.criteria, parsedCriteria.criteria);
});

await check('trimmed on/1/true opt-ins expose task_criteria in tools/list', async () => {
  for (const taskCriteriaFlag of ['on', '1', ' true ']) {
    await withMcp(async (rpc) => {
      const response = await rpc('tools/list', {});
      const tool = response.result.tools.find(entry => entry.name === 'fable_check');
      assert.ok(tool);
      assert.match(tool.description, /Optional task_criteria accepts/);
      assert.deepEqual(tool.inputSchema.properties.task_criteria, {
        type: 'string',
        description: 'Optional fable-task-criteria:v1 block captured in this task\'s plan/contract.',
      });
    }, { taskCriteriaFlag });
  }
});

await check('Claude install persists task-criteria into the registered MCP launch', async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'fable-task-claude-'));
  try {
    const bin = path.join(home, 'bin');
    const logFile = path.join(home, 'claude-argv.jsonl');
    mkdirSync(path.join(home, '.claude'), { recursive: true });
    mkdirSync(bin, { recursive: true });
    const fakeJs = path.join(bin, 'claude-fake.js');
    writeFileSync(fakeJs, String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const argv = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify(argv) + '\n');
if (argv[0] === '--version') { process.stdout.write('1.0.0\n'); process.exit(0); }
const configFile = path.join(process.env.HOME, '.claude.json');
let config = {};
try { config = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch (_) {}
config.mcpServers ||= {};
if (argv[0] === 'mcp' && argv[1] === 'list') {
  process.stdout.write(Object.keys(config.mcpServers).join('\n') + (Object.keys(config.mcpServers).length ? '\n' : ''));
  process.exit(0);
}
if (argv[0] === 'mcp' && argv[1] === 'remove') {
  delete config.mcpServers[argv[2]];
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
  process.exit(0);
}
if (argv[0] === 'mcp' && argv[1] === 'add') {
  const transport = argv.indexOf('--transport');
  const name = argv[transport + 2];
  const separator = argv.indexOf('--');
  const envIndex = argv.indexOf('--env');
  config.mcpServers[name] = {
    type: 'stdio',
    command: argv[separator + 1],
    args: argv.slice(separator + 2),
    ...(envIndex >= 0 ? { env: Object.fromEntries([argv[envIndex + 1].split('=')]) } : {}),
  };
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
}
`);
    const fakeBin = path.join(bin, process.platform === 'win32' ? 'claude.cmd' : 'claude');
    if (process.platform === 'win32') {
      writeFileSync(fakeBin, `@"${process.execPath}" "${fakeJs}" %*\r\n`);
    } else {
      writeFileSync(fakeBin, readFileSync(fakeJs));
      chmodSync(fakeBin, 0o755);
    }
    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      PATH: `${bin}${path.delimiter}${process.env.PATH || ''}`,
      FAKE_CLAUDE_LOG: logFile,
      FABLE_TASK_CRITERIA: ' true ',
    };
    const installed = spawnSync(process.execPath, [
      INSTALL,
      '--no-subagent',
      '--no-onboard',
      '--no-modelcheck',
      '--no-update-check',
    ], { cwd: REPO, env, encoding: 'utf8' });
    assert.equal(installed.status, 0, installed.stderr);
    const invocations = readFileSync(logFile, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const add = invocations.find(argv => argv[0] === 'mcp' && argv[1] === 'add' && argv.includes('fable-profile'));
    assert.ok(add, 'missing fable-profile registration');
    const envIndex = add.indexOf('--env');
    assert.equal(add[envIndex + 1], 'FABLE_TASK_CRITERIA=on');
    const installedServer = path.join(home, '.claude', 'fable-profile', 'runtime', 'mcp', 'src', 'server.js');
    await withMcp(async (rpc) => {
      const response = await rpc('tools/list', {});
      const tool = response.result.tools.find(entry => entry.name === 'fable_check');
      assert.ok(tool.inputSchema.properties.task_criteria);
    }, {
      taskCriteriaFlag: add[envIndex + 1].split('=').slice(1).join('='),
      serverPath: installedServer,
      extraEnv: { HOME: home, USERPROFILE: home },
    });
    const offEnv = { ...env };
    delete offEnv.FABLE_TASK_CRITERIA;
    const defaultReinstall = spawnSync(process.execPath, [
      INSTALL,
      '--no-subagent',
      '--no-onboard',
      '--no-modelcheck',
      '--no-update-check',
    ], { cwd: REPO, env: offEnv, encoding: 'utf8' });
    assert.equal(defaultReinstall.status, 0, defaultReinstall.stderr);
    let config = JSON.parse(readFileSync(path.join(home, '.claude.json'), 'utf8'));
    assert.equal(Object.hasOwn(config.mcpServers['fable-profile'], 'env'), false);
    await withMcp(async (rpc) => {
      const response = await rpc('tools/list', {});
      const tool = response.result.tools.find(entry => entry.name === 'fable_check');
      assert.equal(Object.hasOwn(tool.inputSchema.properties, 'task_criteria'), false);
    }, {
      taskCriteriaFlag: null,
      serverPath: installedServer,
      extraEnv: { HOME: home, USERPROFILE: home },
    });
    if (process.platform !== 'win32') {
      writeFileSync(logFile, '');
      const shellInstalled = spawnSync('bash', [
        path.join(REPO, 'install.sh'),
        '--no-subagent',
        '--no-onboard',
        '--no-modelcheck',
        '--no-update-check',
      ], { cwd: REPO, env, encoding: 'utf8' });
      assert.equal(shellInstalled.status, 0, shellInstalled.stderr);
      config = JSON.parse(readFileSync(path.join(home, '.claude.json'), 'utf8'));
      assert.equal(config.mcpServers['fable-profile'].env.FABLE_TASK_CRITERIA, 'on');
      const shellDefaultReinstall = spawnSync('bash', [
        path.join(REPO, 'install.sh'),
        '--no-subagent',
        '--no-onboard',
        '--no-modelcheck',
        '--no-update-check',
      ], { cwd: REPO, env: offEnv, encoding: 'utf8' });
      assert.equal(shellDefaultReinstall.status, 0, shellDefaultReinstall.stderr);
      config = JSON.parse(readFileSync(path.join(home, '.claude.json'), 'utf8'));
      assert.equal(Object.hasOwn(config.mcpServers['fable-profile'], 'env'), false);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

await check('Codex install persists task-criteria into TOML and the clean-launch MCP', async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'fable-task-codex-'));
  try {
    const codexHome = path.join(home, '.codex');
    mkdirSync(codexHome, { recursive: true });
    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: codexHome,
      FABLE_TASK_CRITERIA: ' true ',
    };
    const installed = spawnSync(process.execPath, [
      INSTALL,
      '--codex-full',
      '--no-codex-agents',
      '--no-codex-hooks',
    ], { cwd: REPO, env, encoding: 'utf8' });
    assert.equal(installed.status, 0, installed.stderr);
    const toml = readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
    const persisted = toml.match(/^FABLE_TASK_CRITERIA = "([^"]+)"$/m)?.[1];
    assert.equal(persisted, 'on');
    const installedServer = path.join(codexHome, 'fable-profile', 'runtime', 'mcp', 'src', 'server.js');
    await withMcp(async (rpc) => {
      const response = await rpc('tools/list', {});
      const tool = response.result.tools.find(entry => entry.name === 'fable_check');
      assert.ok(tool.inputSchema.properties.task_criteria);
    }, {
      taskCriteriaFlag: persisted,
      serverPath: installedServer,
      extraEnv: { HOME: home, USERPROFILE: home, CODEX_HOME: codexHome },
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

await check('the opted-in fable_check path parses and surfaces this task block', async () => {
  await withMcp(async (rpc) => {
    const response = await rpc('tools/call', {
      name: 'fable_check',
      arguments: {
        text: 'Implemented the requested unit slice. Verified with `node test/task-criteria-test.mjs`.',
        dod_id: 'code',
        task_criteria: criteriaBlock,
      },
    });
    const report = JSON.parse(response.result.content[0].text);
    assert.equal(report.ok, true);
    assert.equal(report.task_criteria_applied, true);
    assert.equal(report.task_criteria_count, expectedCriteria.length);
    assert.deepEqual(report.task_criteria, expectedCriteria);
    for (const entry of expectedCriteria) {
      assert.ok(report.items.some(item => (
        item.id === `task:${entry.id}`
        && item.status === 'UNCHECKED'
      )));
    }
  });
});

await check('the actual fable_check path rejects a malformed task block', async () => {
  await withMcp(async (rpc) => {
    const response = await rpc('tools/call', {
      name: 'fable_check',
      arguments: {
        text: 'Verified with `node test/task-criteria-test.mjs`.',
        dod_id: 'code',
        task_criteria: criteriaBlock.replace(TASK_CRITERIA_END, ''),
      },
    });
    const report = JSON.parse(response.result.content[0].text);
    assert.equal(report.ok, false);
    assert.match(report.error, /invalid task_criteria block/);
  });
});

await check('omitting task_criteria preserves the default fable_check path', async () => {
  await withMcp(async (rpc) => {
    const response = await rpc('tools/call', {
      name: 'fable_check',
      arguments: {
        text: 'Implemented the requested unit slice. Verified with `node test/task-criteria-test.mjs`.',
        dod_id: 'code',
      },
    });
    const report = JSON.parse(response.result.content[0].text);
    assert.equal(report.ok, true);
    assert.equal(Object.hasOwn(report, 'task_criteria'), false);
    assert.equal(report.items.some(item => item.id.startsWith('task:')), false);
  });
});

await check('flag-off tools/list and invalid extra argument preserve HEAD behavior', async () => {
  await withMcp(async (rpc) => {
    const toolsResponse = await rpc('tools/list', {});
    const tool = toolsResponse.result.tools.find(entry => entry.name === 'fable_check');
    assert.ok(tool);
    assert.equal(tool.description, HEAD_FABLE_CHECK_DESCRIPTION);
    assert.equal(Object.hasOwn(tool.inputSchema.properties, 'task_criteria'), false);

    const argumentsWithoutExtra = {
      text: 'Implemented the requested unit slice. Verified with `node test/task-criteria-test.mjs`.',
      dod_id: 'code',
    };
    const ordinaryResponse = await rpc('tools/call', {
      name: 'fable_check',
      arguments: argumentsWithoutExtra,
    });
    const invalidExtraResponse = await rpc('tools/call', {
      name: 'fable_check',
      arguments: {
        ...argumentsWithoutExtra,
        task_criteria: 42,
      },
    });
    assert.ok(ordinaryResponse.result);
    assert.ok(invalidExtraResponse.result);
    assert.deepEqual(
      JSON.parse(invalidExtraResponse.result.content[0].text),
      JSON.parse(ordinaryResponse.result.content[0].text),
    );
  }, { taskCriteriaFlag: null });
});

await check('clarify-gate code enters only for genuine ambiguity plus reversal cost', () => {
  assert.equal(shouldCaptureTaskCriteria(), false);
  assert.equal(shouldCaptureTaskCriteria({}), false);
  assert.equal(shouldCaptureTaskCriteria({
    genuinelyAmbiguous: true,
    expensiveToReverse: false,
  }), false);
  assert.equal(shouldCaptureTaskCriteria({
    genuinelyAmbiguous: false,
    expensiveToReverse: true,
  }), false);
  assert.equal(shouldCaptureTaskCriteria({
    genuinelyAmbiguous: true,
    expensiveToReverse: true,
  }), true);
});

await check('source grep finds no default path that invokes the clarify gate', () => {
  const defaultSurfaces = [
    'install.mjs',
    'install.sh',
    'profiles',
    'claude-code/output-styles',
    'claude-code/subagent-brief.md',
    'claude-code/agents',
    'claude-code/hooks',
    'codex/AGENTS.fable.md',
    'codex/hooks',
    'mcp/src/server.js',
    'orchestration/lib',
    'orchestration/recipes',
  ];
  const forcedEntry = /\bshouldCaptureTaskCriteria\s*\(|\brenderTaskCriteriaBlock\s*\(/;
  const mandatoryInterview = /\b(?:always|must|required|mandatory)\b[^.\n]{0,100}\b(?:interview|clarif(?:y|ication))\b|\b(?:interview|clarification|clarifying)\b[^.\n]{0,100}\b(?:always|must|required|mandatory)\b/i;
  assert.match(
    'shouldCaptureTaskCriteria({ genuinelyAmbiguous: true, expensiveToReverse: true })',
    forcedEntry,
  );
  for (const file of defaultSurfaces.flatMap(recursiveTextFiles)) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(
      source,
      forcedEntry,
      path.relative(REPO, file),
    );
    assert.doesNotMatch(
      source,
      mandatoryInterview,
      path.relative(REPO, file),
    );
  }

  const serverSource = readFileSync(SERVER, 'utf8');
  assert.match(
    serverSource,
    /TASK_CRITERIA_ENABLED && taskCriteriaBlock !== undefined/,
  );
  assert.match(serverSource, /required: \['text', 'dod_id'\]/);
  assert.doesNotMatch(
    serverSource,
    /required:\s*\[[^\]]*task_criteria/,
  );
});

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
