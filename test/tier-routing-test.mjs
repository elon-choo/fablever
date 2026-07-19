#!/usr/bin/env node
// G5.1 deterministic unit oracle for task-category cost routing.
// Tier selection is tested only as spend policy; no output-quality conclusion is asserted.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from '../orchestration/lib/mode.mjs';
import {
  MODEL_CONFIG_PATH,
  routeTaskCategory,
} from '../orchestration/lib/tier-routing.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = path.join(ROOT, 'orchestration', 'models.json');
const MODELS_DOC = path.join(ROOT, 'orchestration', 'MODELS.md');
const ROUTER = path.join(ROOT, 'orchestration', 'lib', 'tier-routing.mjs');
const PLAN = path.join(ROOT, 'plans', 'g5-1-tier-routing-unit.md');
const CLAIM_LINT = path.join(ROOT, 'eval', 'opus-claim-lint', 'run.mjs');
const registry = JSON.parse(readFileSync(MODELS, 'utf8'));
const OPUS_MODEL = /(?:^|[^a-z0-9])opus(?:[^a-z0-9]|$)/i;
const TIER_QUALITY_CLAIM = /\b(?:lower[- ]cost|codex|cheaper tier|cost tier).{0,160}\b(?:as good as|better than|superior to|same quality(?: as)?|equally capable(?: as)?|equivalent (?:quality|results?|accuracy)(?: to)?|matches? opus(?: (?:quality|accuracy|results?))?|preserves? (?:output )?(?:quality|accuracy)|without (?:any )?(?:quality|accuracy) loss|no (?:quality|accuracy) (?:loss|degradation)|non[- ]inferior(?: to)?)\b|\b(?:as good as|better than|superior to|same quality(?: as)?|equally capable(?: as)?|equivalent (?:quality|results?|accuracy)(?: to)?|non[- ]inferior(?: to)?).{0,160}\b(?:lower[- ]cost|codex|cheaper tier|cost tier)\b/isu;

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

function recursiveFiles(entry, accept = () => true) {
  if (!existsSync(entry)) return [];
  const metadata = lstatSync(entry);
  if (metadata.isFile()) return accept(entry) ? [entry] : [];
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) return [];

  const files = [];
  for (const child of readdirSync(entry, { withFileTypes: true })) {
    if (child.name === '.git' || child.name === 'node_modules') continue;
    files.push(...recursiveFiles(path.join(entry, child.name), accept));
  }
  return files;
}

function isRoutingConfig(file) {
  const extension = path.extname(file).toLowerCase();
  const text = readFileSync(file, 'utf8');
  if (extension === '.json') {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (
        Object.prototype.hasOwnProperty.call(parsed, 'cost_routing')
        || (
          Object.prototype.hasOwnProperty.call(parsed, 'category_chains')
          && Object.prototype.hasOwnProperty.call(parsed, 'unclassified_chain')
        )
      );
    } catch {
      return false;
    }
  }
  return /\bcost_routing\b/.test(text)
    || (/\bcategory_chains\b/.test(text) && /\bunclassified_chain\b/.test(text));
}

const expectedCategoryChains = {
  'mechanical-edit': ['lower-cost', 'opus'],
  'bounded-code-change': ['lower-cost', 'opus'],
  'deterministic-check': ['lower-cost', 'opus'],
  judgment: ['opus'],
};

const hadUltra = Object.prototype.hasOwnProperty.call(process.env, 'FABLE_ULTRA');
const originalUltra = process.env.FABLE_ULTRA;

console.log('tier-routing unit:');

try {
  process.env.FABLE_ULTRA = 'auto';

  check('category map and unclassified fallback live in the existing models.json', () => {
    assert.deepEqual(registry.cost_routing.category_chains, expectedCategoryChains);
    assert.deepEqual(registry.cost_routing.unclassified_chain, ['opus']);
    assert.equal(registry.cost_routing.tiers.opus.target, 'active.worker_claude');
    assert.match(registry.active.worker_claude, OPUS_MODEL);
    for (const chain of Object.values(registry.cost_routing.category_chains)) {
      assert.equal(chain.at(-1), 'opus');
    }
  });

  check('known mechanical categories deterministically select Codex then Opus', () => {
    for (const category of [
      'mechanical-edit',
      'bounded-code-change',
      'deterministic-check',
    ]) {
      const first = routeTaskCategory(category);
      const second = routeTaskCategory(category);
      assert.deepEqual(first, second);
      assert.equal(first.costRouted, true);
      assert.equal(first.knownCategory, true);
      assert.equal(first.tier, 'lower-cost');
      assert.equal(first.kind, 'delegation');
      assert.equal(first.target, 'codex');
      assert.equal(first.costClass, 'lower');
      assert.equal(first.fallback, false);
      assert.deepEqual(first.fallbackChain, ['lower-cost', 'opus']);
      assert.equal(first.resolvedTargets.at(-1).model, registry.active.worker_claude);
    }
  });

  check('known judgment category stays on the configured Opus target', () => {
    const route = routeTaskCategory('judgment');
    assert.equal(route.knownCategory, true);
    assert.equal(route.tier, 'opus');
    assert.equal(route.target, 'active.worker_claude');
    assert.equal(route.model, registry.active.worker_claude);
    assert.equal(route.fallback, false);
    assert.deepEqual(route.fallbackChain, ['opus']);
  });

  check('unknown, blank, and missing categories use the Opus fallback', () => {
    for (const category of ['not-a-category', '   ', undefined]) {
      const route = routeTaskCategory(category);
      assert.equal(route.category, 'UNCLASSIFIED');
      assert.equal(route.knownCategory, false);
      assert.equal(route.tier, 'opus');
      assert.equal(route.model, registry.active.worker_claude);
      assert.match(route.model, OPUS_MODEL);
      assert.equal(route.fallback, true);
      assert.deepEqual(route.fallbackChain, ['opus']);
    }
  });

  check('FABLE_ULTRA=auto activates the explicit cost-routed API only', () => {
    assert.equal(routeTaskCategory('mechanical-edit').costRouted, true);
    assert.deepEqual(decide({ text: 'fix a typo' }), {
      mode: 'auto',
      heavy: false,
      reason: 'auto: no stakes signal -> cheap single-agent (A2)',
    });
    assert.deepEqual(decide({ text: 'audit the auth token flow for vulnerabilities' }), {
      mode: 'auto',
      heavy: true,
      reason: 'auto: stakes signal "audit" in task',
    });
  });

  check('FABLE_ULTRA=on keeps the legacy forced-heavy decision and skips category routing', () => {
    process.env.FABLE_ULTRA = 'on';
    assert.deepEqual(decide({ text: 'fix a typo' }), {
      mode: 'on',
      heavy: true,
      reason: 'FABLE_ULTRA=on (forced heavy)',
    });
    const route = routeTaskCategory('mechanical-edit');
    assert.equal(route.mode, 'on');
    assert.equal(route.costRouted, false);
    assert.equal('tier' in route, false);
  });

  check('FABLE_ULTRA=off keeps the legacy forced-cheap decision and skips category routing', () => {
    process.env.FABLE_ULTRA = 'off';
    assert.deepEqual(decide({ text: 'audit security' }), {
      mode: 'off',
      heavy: false,
      reason: 'FABLE_ULTRA=off (forced cheap)',
    });
    const route = routeTaskCategory('judgment');
    assert.equal(route.mode, 'off');
    assert.equal(route.costRouted, false);
    assert.equal('tier' in route, false);
  });

  check('routing reads the sole existing model JSON and duplicates no category map in code', () => {
    process.env.FABLE_ULTRA = 'auto';
    assert.equal(realpathSync(MODEL_CONFIG_PATH), realpathSync(MODELS));
    const configExtensions = new Set(['.json', '.jsonc', '.yaml', '.yml', '.toml']);
    const routingConfigs = recursiveFiles(
      ROOT,
      file => configExtensions.has(path.extname(file).toLowerCase()),
    )
      .filter(isRoutingConfig)
      .map(file => path.relative(ROOT, file))
      .sort();
    assert.deepEqual(routingConfigs, ['orchestration/models.json']);

    const routerSource = readFileSync(ROUTER, 'utf8');
    for (const category of Object.keys(expectedCategoryChains)) {
      assert.equal(routerSource.includes(category), false);
    }
    assert.equal(routeTaskCategory('mechanical-edit').configSource, MODEL_CONFIG_PATH);
  });

  check('the new router has no default runtime caller', () => {
    const defaultSurfaces = [
      'install.mjs',
      'install.sh',
      'profiles',
      'claude-code',
      'codex',
      'mcp',
      'fusion',
      path.join('orchestration', 'recipes'),
    ];
    // A default installer may mention the module solely in its opt-in pruning list;
    // only an import, function call, or CLI launch would make it a runtime caller.
    const forbiddenInvocation = /(?:from\s+|import\s*\(|require\s*\()\s*['"][^'"]*tier-routing\.mjs|routeTaskCategory\s*\(|node[^\n]*tier-routing\.mjs/;
    for (const file of defaultSurfaces.flatMap(entry => recursiveFiles(path.join(ROOT, entry)))) {
      assert.doesNotMatch(
        readFileSync(file, 'utf8'),
        forbiddenInvocation,
        path.relative(ROOT, file),
      );
    }
  });

  check('package chain places the focused test immediately after continuation with zero deps', () => {
    const packageJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const chain = packageJson.scripts.test.split(' && ');
    const continuationIndex = chain.indexOf('node test/continuation-test.mjs');
    assert.notEqual(continuationIndex, -1);
    assert.equal(chain[continuationIndex + 1], 'node test/tier-routing-test.mjs');
    assert.deepEqual(packageJson.dependencies, {});
  });

  check('added routing prose has no tier-selection comparison claim and passes claim lint', () => {
    const modelsDoc = readFileSync(MODELS_DOC, 'utf8');
    const sectionStart = modelsDoc.indexOf('### Explicit task-category cost route');
    const sectionEnd = modelsDoc.indexOf('## Staying current');
    assert.ok(sectionStart >= 0);
    assert.ok(sectionEnd > sectionStart);
    const routingSection = modelsDoc.slice(
      sectionStart,
      sectionEnd,
    );
    const routingText = [
      readFileSync(ROUTER, 'utf8'),
      JSON.stringify(registry.cost_routing),
      routingSection,
    ].join('\n');
    assert.doesNotMatch(routingText, TIER_QUALITY_CLAIM);
    for (const seededClaim of [
      'The lower-cost tier is as good as Opus.',
      'Codex is equally capable as Opus.',
      'The lower-cost tier produces equivalent results to Opus.',
      'Codex preserves output quality versus Opus.',
      'Equivalent results to Opus come from Codex.',
    ]) {
      assert.match(seededClaim, TIER_QUALITY_CLAIM);
    }

    const lint = spawnSync(process.execPath, [CLAIM_LINT, MODELS_DOC, PLAN], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.equal(lint.status, 0, lint.stderr || lint.stdout);
  });
} finally {
  if (hadUltra) process.env.FABLE_ULTRA = originalUltra;
  else delete process.env.FABLE_ULTRA;
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exitCode = failed === 0 ? 0 : 1;
