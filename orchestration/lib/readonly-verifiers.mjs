export const READ_ONLY_AGENT_TYPE = 'fable-readonly-verifier';
export const READ_ONLY_VERIFIER_ENV = 'FABLE_READONLY_VERIFIER';

const READ_ONLY_VERIFIER_ENABLED_VALUES = new Set(['on', '1', 'true']);

/**
 * Resolve the optional Workflow agent type from the same opt-in used by the installer.
 * When this returns undefined, callers must retain their exact legacy agentType dispatch.
 */
export function resolveReadonlyAgentType(env = process.env) {
  const value = env?.[READ_ONLY_VERIFIER_ENV];
  return READ_ONLY_VERIFIER_ENABLED_VALUES.has(String(value ?? '').trim().toLowerCase())
    ? READ_ONLY_AGENT_TYPE
    : undefined;
}

// Explicit, closed capability set. StructuredOutput is injected by the Workflow runtime
// for schema-bound calls; the other entries are the only tools configured on the agent.
export const READ_ONLY_ALLOWLIST = Object.freeze([
  'Read',
  'Grep',
  'Glob',
  'WebSearch',
  'WebFetch',
  'StructuredOutput',
  'mcp__fable-fusion__fable_cross_verify',
]);

// Each recipe is self-contained in the Workflow VM, so it cannot import this module or
// read process.env. The Node preflight resolves the opt-in here and serializes only the
// optional result into args.preflight; tests use this registry to classify every role.
export const ADVISORY_ROLE_CONFIG = Object.freeze({
  'adversarial-verify': Object.freeze([
    Object.freeze({ role: 'refuter', prefix: 'refute:' }),
    Object.freeze({ role: 'cross-model-refuter', prefix: 'xverify:' }),
    Object.freeze({ role: 'verification-synthesizer', label: 'synthesize' }),
  ]),
  'judge-panel': Object.freeze([
    Object.freeze({ role: 'judge', prefix: 'judge:' }),
  ]),
  'divergent-explore': Object.freeze([
    Object.freeze({ role: 'idea-adviser', prefix: 'diverge:' }),
    Object.freeze({ role: 'advisory-synthesizer', label: 'synthesize' }),
  ]),
  'decompose-first': Object.freeze([
    Object.freeze({ role: 'planning-adviser', label: 'plan' }),
  ]),
  'pipeline-map': Object.freeze([
    Object.freeze({ role: 'verifier', prefix: 'verify:' }),
  ]),
});

// Runtime fixtures classify every agent() call in each recipe as advisory or executor.
// This closes the fail-open path where a newly added call is simply omitted from the
// advisory registry and therefore never checked.
export const EXECUTOR_ROLE_CONFIG = Object.freeze({
  'adversarial-verify': Object.freeze([]),
  'judge-panel': Object.freeze([
    Object.freeze({ role: 'generator', prefix: 'gen:' }),
    Object.freeze({ role: 'final-synthesizer', label: 'synthesize' }),
  ]),
  'divergent-explore': Object.freeze([]),
  'decompose-first': Object.freeze([
    Object.freeze({ role: 'direct-executor', label: 'direct' }),
    Object.freeze({ role: 'subproblem-executor', prefix: 'sub:' }),
    Object.freeze({ role: 'integrator', label: 'integrate' }),
  ]),
  'pipeline-map': Object.freeze([
    Object.freeze({ role: 'extractor', prefix: 'extract:' }),
    Object.freeze({ role: 'transformer', prefix: 'transform:' }),
  ]),
});

export function assertReadOnlySubset(tools, allowlist = READ_ONLY_ALLOWLIST) {
  if (!Array.isArray(tools)) throw new TypeError('configured tools must be an array');
  const allowed = new Set(allowlist);
  const outside = [...new Set(tools.filter(tool => !allowed.has(tool)))];
  if (outside.length) {
    throw new Error('non-read-only tool(s) outside READ_ONLY_ALLOWLIST: ' + outside.join(', '));
  }
  return true;
}

export function matchesAdvisoryRole(label, role) {
  return typeof label === 'string'
    && (role.label === label || (role.prefix && label.startsWith(role.prefix)));
}
