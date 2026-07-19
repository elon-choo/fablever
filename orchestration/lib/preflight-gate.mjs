// Deterministic, opt-in route-vs-solo cost gate.
// This module authorizes multi-agent spend only. It does not estimate output quality,
// model capability, or task success. The default route is single-lens.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveReadonlyAgentType } from './readonly-verifiers.mjs';

export const PREFLIGHT_ROUTES = Object.freeze({
  SINGLE_LENS: 'single-lens',
  PANEL: 'panel',
  DECOMPOSE: 'decompose',
});

export const PREFLIGHT_FLOORS = Object.freeze({
  decompose: Object.freeze({
    minTaskSize: 200,
    minIndependentParts: 2,
  }),
  panel: Object.freeze({
    minTaskSize: 400,
    precisionNeed: 'at-scale',
  }),
});

const VALID_ROUTES = new Set(Object.values(PREFLIGHT_ROUTES));
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function decision(requestedRoute, route, allow, reason, readonlyAgentType) {
  return Object.freeze({
    requestedRoute,
    route,
    allow,
    reason,
    ...(readonlyAgentType ? { readonlyAgentType } : {}),
  });
}

function taskSizeOf(attributes) {
  if (hasOwn(attributes, 'taskSize')) return attributes.taskSize;
  if (typeof attributes.task === 'string') return attributes.task.trim().length;
  return undefined;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

/**
 * Decide whether a requested multi-agent route may dispatch.
 *
 * A refused multi-agent request falls back to route='single-lens' with allow=false.
 * `allow` means the requested route may dispatch; the caller must return before
 * launching Workflow or invoking any agent when allow=false.
 */
export function decidePreflightRoute(attributes = {}, env = process.env) {
  const readonlyAgentType = resolveReadonlyAgentType(env);
  const decide = (requestedRoute, route, allow, reason) => (
    decision(requestedRoute, route, allow, reason, readonlyAgentType)
  );
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
    return decide(
      'invalid',
      PREFLIGHT_ROUTES.SINGLE_LENS,
      false,
      'invalid-preflight-input',
    );
  }

  const requestedRoute = attributes.requestedRoute ?? PREFLIGHT_ROUTES.SINGLE_LENS;
  if (!VALID_ROUTES.has(requestedRoute)) {
    return decide(
      String(requestedRoute),
      PREFLIGHT_ROUTES.SINGLE_LENS,
      false,
      'invalid-preflight-input',
    );
  }

  if (requestedRoute === PREFLIGHT_ROUTES.SINGLE_LENS) {
    return decide(
      requestedRoute,
      PREFLIGHT_ROUTES.SINGLE_LENS,
      true,
      'default-cost-route',
    );
  }

  const taskSize = taskSizeOf(attributes);
  if (!isNonNegativeInteger(taskSize)) {
    return decide(
      requestedRoute,
      PREFLIGHT_ROUTES.SINGLE_LENS,
      false,
      'invalid-preflight-input',
    );
  }

  if (requestedRoute === PREFLIGHT_ROUTES.DECOMPOSE) {
    const independentParts = attributes.independentParts;
    if (!isNonNegativeInteger(independentParts)) {
      return decide(
        requestedRoute,
        PREFLIGHT_ROUTES.SINGLE_LENS,
        false,
        'invalid-preflight-input',
      );
    }

    const floor = PREFLIGHT_FLOORS.decompose;
    if (taskSize < floor.minTaskSize || independentParts < floor.minIndependentParts) {
      return decide(
        requestedRoute,
        PREFLIGHT_ROUTES.SINGLE_LENS,
        false,
        'decompose-cost-floor-not-met',
      );
    }

    return decide(
      requestedRoute,
      PREFLIGHT_ROUTES.DECOMPOSE,
      true,
      'decompose-cost-floor-met',
    );
  }

  const panelFloor = PREFLIGHT_FLOORS.panel;
  if (taskSize < panelFloor.minTaskSize) {
    return decide(
      requestedRoute,
      PREFLIGHT_ROUTES.SINGLE_LENS,
      false,
      'panel-size-cost-floor-not-met',
    );
  }
  if (attributes.precisionNeed !== panelFloor.precisionNeed) {
    return decide(
      requestedRoute,
      PREFLIGHT_ROUTES.SINGLE_LENS,
      false,
      'panel-precision-cost-floor-not-met',
    );
  }

  return decide(
    requestedRoute,
    PREFLIGHT_ROUTES.PANEL,
    true,
    'panel-cost-floor-met',
  );
}

/**
 * Evaluate the floor before invoking a multi-agent launcher.
 * The launcher is never touched for single-lens or refused decisions.
 */
export async function runPreflightRoute(attributes, launch) {
  const routeDecision = decidePreflightRoute(attributes);
  if (!routeDecision.allow || routeDecision.route === PREFLIGHT_ROUTES.SINGLE_LENS) {
    return Object.freeze({
      decision: routeDecision,
      proceeded: false,
      refused: !routeDecision.allow,
      result: null,
    });
  }
  if (typeof launch !== 'function') {
    throw new TypeError('an allowed multi-agent route requires a launch function');
  }

  const result = await launch(routeDecision);
  return Object.freeze({
    decision: routeDecision,
    proceeded: true,
    refused: false,
    result,
  });
}

function readFlag(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function parseCliInteger(value) {
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}

function cliEnvironment(env = process.env) {
  if (Object.prototype.hasOwnProperty.call(env, 'FABLE_READONLY_VERIFIER')) return env;
  if (resolveReadonlyAgentType(env)) return env;
  const home = env.HOME || env.USERPROFILE || os.homedir();
  const installedAgent = path.join(
    home,
    '.claude',
    'agents',
    'fable-readonly-verifier.md',
  );
  try {
    const source = fs.readFileSync(installedAgent, 'utf8');
    if (source.includes('<!-- fablever-owned:readonly-verifier:v1 -->')) {
      return { ...env, FABLE_READONLY_VERIFIER: 'on' };
    }
  } catch (_) {}
  return env;
}

function cli(argv) {
  if (argv.includes('--help')) {
    console.log('Usage: node preflight-gate.mjs --route <single-lens|panel|decompose> [options]');
    console.log('  --task-size <integer> --independent-parts <integer> --precision-need <standard|at-scale>');
    console.log('  --require-multi exits 2 unless a multi-agent route is allowed');
    return 0;
  }

  const attributes = {
    requestedRoute: readFlag(argv, '--route') ?? PREFLIGHT_ROUTES.SINGLE_LENS,
  };
  const taskSize = parseCliInteger(readFlag(argv, '--task-size'));
  const independentParts = parseCliInteger(readFlag(argv, '--independent-parts'));
  const precisionNeed = readFlag(argv, '--precision-need');
  if (taskSize !== undefined) attributes.taskSize = taskSize;
  if (independentParts !== undefined) attributes.independentParts = independentParts;
  if (precisionNeed !== undefined) attributes.precisionNeed = precisionNeed;

  const routeDecision = decidePreflightRoute(attributes, cliEnvironment());
  console.log(JSON.stringify(routeDecision));
  if (
    argv.includes('--require-multi')
    && (!routeDecision.allow || routeDecision.route === PREFLIGHT_ROUTES.SINGLE_LENS)
  ) return 2;
  return 0;
}

if (
  process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  process.exitCode = cli(process.argv.slice(2));
}
