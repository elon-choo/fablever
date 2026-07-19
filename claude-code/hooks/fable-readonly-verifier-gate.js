#!/usr/bin/env node
// fablever-owned:readonly-verifier-gate:v1
'use strict';

/*
 * Agent-scoped PreToolUse backstop for the orchestration advisory agent.
 *
 * The custom agent frontmatter is the primary tool-level allowlist. Its own `hooks:`
 * block activates this backstop only while that advisory agent is running, so the
 * v1.3.0 default path gains no always-on hook. Any present or future tool outside the
 * allowlist is denied before it can execute.
 */
const READ_ONLY_AGENT_TYPE = 'fable-readonly-verifier';
const READ_ONLY_ALLOWLIST = Object.freeze([
  'Read',
  'Grep',
  'Glob',
  'WebSearch',
  'WebFetch',
  'StructuredOutput',
  'mcp__fable-fusion__fable_cross_verify',
]);
const ALLOWED = new Set(READ_ONLY_ALLOWLIST);

function agentTypeOf(event) {
  return event && (
    event.agent_type
    || event.subagent_type
    || event.agentType
    || event.subagentType
  );
}

function decisionFor(event) {
  if (agentTypeOf(event) !== READ_ONLY_AGENT_TYPE) {
    return { applies: false, decision: 'pass' };
  }
  const tool = event && (event.tool_name || event.toolName);
  if (typeof tool === 'string' && ALLOWED.has(tool)) {
    return { applies: true, decision: 'allow', tool };
  }
  return {
    applies: true,
    decision: 'deny',
    tool: typeof tool === 'string' && tool ? tool : '<missing>',
    reason: `fablever read-only verifier denied tool outside READ_ONLY_ALLOWLIST: ${typeof tool === 'string' && tool ? tool : '<missing>'}`,
  };
}

function denyPayload(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let event;
  try {
    event = JSON.parse(raw);
  } catch (_) {
    process.stderr.write('fablever read-only verifier gate: malformed PreToolUse input; denying fail-closed\n');
    process.exitCode = 2;
    return;
  }
  const result = decisionFor(event);
  if (result.decision === 'deny') {
    process.stdout.write(JSON.stringify(denyPayload(result.reason)));
  }
}

module.exports = {
  READ_ONLY_AGENT_TYPE,
  READ_ONLY_ALLOWLIST,
  agentTypeOf,
  decisionFor,
  denyPayload,
};

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`fablever read-only verifier gate failed; denying fail-closed: ${error.message}\n`);
    process.exitCode = 2;
  });
}
