// Deterministic, explicit task-category spend routing.
// Tier selection is cost policy only; it does not estimate output quality,
// model capability, accuracy, or task success. This module is inert until called.
// Zero dependencies: Node built-ins only.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveMode } from './mode.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const MODEL_CONFIG_PATH = path.join(DIR, '..', 'models.json');

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function normalizeCategory(category) {
  const value = nonEmptyString(category);
  return value ? value.toLowerCase() : null;
}

function isOpusModel(model) {
  return /(?:^|[^a-z0-9])opus(?:[^a-z0-9]|$)/i.test(model);
}

function readRegistry() {
  const registry = JSON.parse(readFileSync(MODEL_CONFIG_PATH, 'utf8'));
  if (!isRecord(registry)) throw new TypeError('models.json must contain an object');
  return registry;
}

function resolveModelReference(registry, reference) {
  const match = nonEmptyString(reference)?.match(/^active\.([A-Za-z0-9_]+)$/);
  if (!match) return null;
  return nonEmptyString(registry.active?.[match[1]]);
}

function resolveTier(registry, routing, tier) {
  const id = nonEmptyString(tier);
  const configured = id && isRecord(routing.tiers) ? routing.tiers[id] : null;
  if (!isRecord(configured)) return null;

  const kind = nonEmptyString(configured.kind);
  const target = nonEmptyString(configured.target);
  const costClass = nonEmptyString(configured.cost_class);
  if (!kind || !target || !costClass) return null;

  if (kind === 'delegation') {
    return Object.freeze({
      tier: id,
      kind,
      target,
      model: null,
      costClass,
    });
  }

  if (kind === 'model-ref') {
    const model = resolveModelReference(registry, target);
    if (!model) return null;
    if (id === 'opus' && !isOpusModel(model)) return null;
    return Object.freeze({
      tier: id,
      kind,
      target,
      model,
      costClass,
    });
  }

  return null;
}

function configuredChain(routing, category) {
  const categoryChains = routing.category_chains;
  if (!isRecord(categoryChains)) {
    throw new TypeError('models.json cost_routing.category_chains must contain an object');
  }

  const knownCategory = Boolean(category && hasOwn(categoryChains, category));
  const chain = knownCategory ? categoryChains[category] : routing.unclassified_chain;
  if (!Array.isArray(chain) || chain.length === 0 || chain.at(-1) !== 'opus') {
    throw new TypeError('every cost-routing chain must be non-empty and end with opus');
  }
  return Object.freeze({
    knownCategory,
    chain: Object.freeze([...chain]),
  });
}

/**
 * Select an ordered cost route for an explicitly supplied task category.
 *
 * FABLE_ULTRA=auto activates this unit API. `on` and `off` leave their existing
 * paths untouched. The caller owns dispatch and walks fallbackChain in order.
 */
export function routeTaskCategory(taskCategory) {
  const mode = resolveMode();
  const requestedCategory = normalizeCategory(taskCategory);

  if (mode !== 'auto') {
    return Object.freeze({
      mode,
      costRouted: false,
      requestedCategory,
      reason: `FABLE_ULTRA=${mode}: task-category cost routing inactive`,
    });
  }

  const registry = readRegistry();
  const routing = registry.cost_routing;
  if (!isRecord(routing) || routing.enabled_mode !== 'auto') {
    throw new TypeError('models.json cost_routing must be enabled for auto mode');
  }

  const configured = configuredChain(routing, requestedCategory);
  const resolvedTargets = configured.chain
    .map(tier => resolveTier(registry, routing, tier))
    .filter(Boolean);
  const selected = resolvedTargets[0];
  const selectedIndex = selected ? configured.chain.indexOf(selected.tier) : -1;

  if (!selected || !resolvedTargets.some(target => target.tier === 'opus')) {
    throw new TypeError('cost-routing chain must resolve to an opus fallback');
  }

  const fallback = !configured.knownCategory || selectedIndex > 0;
  const category = configured.knownCategory ? requestedCategory : 'UNCLASSIFIED';
  const reason = !configured.knownCategory
    ? 'auto cost route: UNCLASSIFIED -> opus fallback'
    : selectedIndex > 0
      ? `auto cost route: ${requestedCategory} -> ${selected.tier} fallback`
      : `auto cost route: ${requestedCategory} -> ${selected.tier}`;

  return Object.freeze({
    mode,
    costRouted: true,
    requestedCategory,
    category,
    knownCategory: configured.knownCategory,
    tier: selected.tier,
    kind: selected.kind,
    target: selected.target,
    model: selected.model,
    costClass: selected.costClass,
    fallback,
    fallbackChain: configured.chain,
    resolvedTargets: Object.freeze(resolvedTargets),
    configSource: MODEL_CONFIG_PATH,
    reason,
  });
}
