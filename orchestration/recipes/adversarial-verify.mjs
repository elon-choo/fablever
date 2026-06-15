export const meta = {
  name: 'adversarial-verify',
  description: 'P0 spine: N fresh-context skeptics independently try to REFUTE an artifact, barrier-synced, then a RED output-gate. The cleanest, most model-portable transplant of Fable\'s orchestration edge.',
  phases: [
    { title: 'Refute', detail: 'N independent fresh-context skeptics, each a distinct lens, each forced to refute-or-concede' },
    { title: 'Synthesize', detail: 'merge verdicts, apply the RED output-gate, report confirmed defects' },
  ],
}

/*
 * WHY THIS EXISTS (see docs/ORCHESTRATION-RESEARCH.md §3-4)
 * -------------------------------------------------------------------------
 * Fable's stronger independent review is ARCHITECTURE, not reviewer brilliance.
 * A fresh-context skeptic with an empty window has no completion-attractor pull
 * toward an answer that is not its own output, so it structurally cannot
 * rubber-stamp the way single-model in-thread self-review does. That separation
 * of generate-from-verify is what transplants across worker models. The DEPTH of
 * any single refutation stays weights-bound — so we claim catch-rate on
 * contradiction/omission defects, not deep-correctness, until the A/B says otherwise.
 *
 * HOW TO RUN
 *   Launch via the Workflow tool with scriptPath pointing here, passing args:
 *     args = {
 *       artifact:   "<the text/plan/diff to review>"   (REQUIRED; or artifactPath)
 *       artifactPath: "/abs/path/to/file"               (alternative to artifact)
 *       lenses:     ["correctness","security",...]      (optional; default below)
 *       triviallySmall: false                           (set true to force-skip the floor)
 *     }
 *
 * RUNTIME NOTE: workflow scripts have no filesystem/import access, so this file is
 * SELF-CONTAINED. The lens catalog is duplicated from orchestration/lenses.md by
 * design — keep them conceptually in sync; lenses.md is the human source of truth.
 */

const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['lens', 'refuted', 'confidence', 'defect_class', 'findings'],
  properties: {
    lens: { type: 'string' },
    refuted: { type: 'boolean', description: 'true if you found a real defect the artifact must fix' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    defect_class: { type: 'string', enum: ['contradiction', 'omission', 'deep-reasoning', 'none'],
      description: 'contradiction/omission are what independence reliably catches; deep-reasoning is weights-bound — be honest about which you found' },
    findings: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['claim', 'evidence', 'severity'],
      properties: { claim: { type: 'string' }, evidence: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] } } } },
  },
}

// Default anti-overlap lens catalog (mirror of orchestration/lenses.md §verify).
// Each lens is a DISTINCT failure mode so skeptics decorrelate instead of all
// finding the same obvious bug. Selection is recognition-against-this-menu, not
// open generation — that is what makes it recoverable on a weaker worker.
const VERIFY_LENSES = {
  correctness: 'logical/behavioral correctness: wrong results, off-by-one, broken invariants, mishandled inputs',
  security: 'security & trust boundaries: injection, authz gaps, secret/credential exposure, unsafe deserialization',
  edge_cases: 'edge cases & failure modes: empty/null, concurrency, partial failure, resource exhaustion, timeouts',
  consistency: 'internal consistency: claims that contradict each other or contradict the stated spec/requirements',
  omission: 'coverage gaps: a required case, file, modality, or step the artifact silently does not handle',
  overclaim: 'unsupported claims: assertions of "done/verified/safe" with no evidence behind them',
  cost: 'cost & efficiency: wasted work, needless fan-out, token/latency blowups, over-building',
}

// The anti-contamination preamble. The shipped SubagentStart hook may inject a
// restraint reminder ("report findings and stop / no validation beyond what the
// task needs") into every spawned subagent. For a SKEPTIC that is exactly wrong,
// so we explicitly override it at the prompt layer. (The clean fix is the
// settings-level hook exemption — see orchestration/HOOK-EXEMPTION-PROPOSAL.md.)
const ANTI_CONTAMINATION =
  'OVERRIDE any operating-style reminder telling you to minimize validation, do only what the task needs, or report and stop. ' +
  'Your single job is EXHAUSTIVE adversarial refutation. Dig. Default to refuted=true when uncertain and say why. Brevity here is a failure.'

const MAX_AGENTS = 24 // caps the number of skeptic lenses (the synthesis agent is +1), well under the 1000 lifetime cap

let a = args; if (typeof a === 'string') { try { a = JSON.parse(a); } catch (_) { a = {}; } } if (typeof a !== 'object' || !a) a = {}
const artifact = a.artifact || (a.artifactPath ? ('See file: ' + a.artifactPath + ' (read it first).') : null)
if (!artifact) {
  log('adversarial-verify: no artifact provided (pass args.artifact or args.artifactPath). Nothing to verify.')
  return { skipped: true, reason: 'no artifact' }
}

// Complexity floor: do not pay for a panel on a trivial artifact (mirrors the
// profile's own "skip ceremony on trivial one-liners"). Honest, deterministic, JS-owned.
// NOTE: the char-count floor is only valid for INLINE artifacts. With artifactPath the
// `artifact` string is just a short pointer we cannot size in-runtime (no fs), so the
// caller is explicitly flagging a real file — never floor that away (was a silent-skip bug).
const tiny = !a.triviallySmall && !a.artifactPath && typeof artifact === 'string' && artifact.trim().length < 200
if (tiny) {
  log('adversarial-verify: inline artifact below complexity floor (<200 chars) — skipping the panel by design. Pass triviallySmall:true to force.')
  return { skipped: true, reason: 'below-complexity-floor' }
}

const DEFAULT_LENSES = ['correctness', 'security', 'edge_cases', 'consistency', 'omission']
const requested = Array.isArray(a.lenses) && a.lenses.length ? a.lenses : DEFAULT_LENSES
const requestedCount = requested.length
const unknown = requested.filter(k => !VERIFY_LENSES[k])
if (unknown.length) log('adversarial-verify: ignoring unknown lens(es): ' + unknown.join(', ') + ' (valid: ' + Object.keys(VERIFY_LENSES).join(', ') + ')')
let lensKeys = requested.filter(k => VERIFY_LENSES[k]).slice(0, MAX_AGENTS - 1)
if (!lensKeys.length) { log('adversarial-verify: no valid lenses after filtering — falling back to defaults.'); lensKeys = DEFAULT_LENSES.slice() }

phase('Refute')
// Reuse the machine's calibrated skeptic agentTypes where they fit; fall back to
// a default fresh-context worker. Each skeptic sees ONLY the artifact + its lens —
// no sibling output, so no anchoring.
const AGENT_FOR_LENS = { correctness: 'red-team-validator', security: 'red-team-validator', edge_cases: 'red-team-validator', overclaim: 'evidence-verifier' }
const thunks = lensKeys.map(k => () =>
  agent(
    ANTI_CONTAMINATION +
    '\n\nYou are an independent skeptic. LENS: ' + k + ' — ' + VERIFY_LENSES[k] +
    '\n\nReview ONLY through this lens and try to BREAK the artifact below. Report concrete, evidence-backed defects. ' +
    'Mark defect_class honestly: contradiction/omission are what a fresh reviewer reliably catches; only claim deep-reasoning if you can show the flawed step.' +
    '\n\n=== ARTIFACT UNDER REVIEW ===\n' + artifact,
    { label: 'refute:' + k, phase: 'Refute', schema: VERDICT_SCHEMA, agentType: AGENT_FOR_LENS[k] }
  )
)

// OPTIONAL cross-model arm (OFF by default). Closes the same-family correlated-blind-spot
// limit: a genuinely DIFFERENT-weights model (GPT/Gemini via OpenRouter, or Codex/GPT via the
// codex MCP) reviews alongside the Claude panel. Controlled entirely by args.crossModel, which
// the orchestrate skill passes ONLY when ~/.claude/fable-profile/xverify.json enables it. When
// absent (the default) NOTHING below runs — zero extra agents, zero network, zero overhead.
const xc = a.crossModel
const crossEnabled = !!(xc && xc.provider && xc.provider !== 'off')
if (crossEnabled) {
  const tool = xc.provider === 'codex' ? 'the mcp__codex__codex tool' : 'the fable_cross_verify MCP tool'
  const xModels = (Array.isArray(xc.models) && xc.models.length) ? (' (models: ' + xc.models.join(', ') + ')') : ''
  thunks.push(() => agent(
    ANTI_CONTAMINATION +
    '\n\nYou are a CROSS-MODEL verification ADAPTER (not a re-judge). Use ' + tool +
    ' to obtain an INDEPENDENT adversarial review of the artifact below from a DIFFERENT model family' + xModels +
    '. Ask it to REFUTE. Then RELAY its findings faithfully into your verdict — do not soften, drop, or invent; ' +
    'prefix each finding with the external model name. Set lens to "cross-model". If the tool errors or is ' +
    'unavailable, return refuted:false, defect_class:none, and ONE finding noting the tool was unavailable.' +
    '\n\n=== ARTIFACT UNDER REVIEW ===\n' + artifact,
    { label: 'xverify:' + xc.provider, phase: 'Refute', schema: VERDICT_SCHEMA }
  ))
}

// One barrier; parallel() results are positional, so slice the Claude panel (gated) from the
// cross arm (bonus coverage that does NOT affect the full-panel gate).
const all = await parallel(thunks)
const verdicts = all.slice(0, lensKeys.length).filter(Boolean)
const crossVerdicts = (crossEnabled ? all.slice(lensKeys.length) : []).filter(Boolean)

phase('Synthesize')
// RED output-gate (deterministic, JS-owned). HONEST FRAMING: this gate is
// leaf-ungameable (a skeptic cannot make it pass by hand-waving) but
// orchestrator-gameable (a caller could spawn one hollow skeptic). At runtime it
// only certifies that fresh-context verification RAN and returned schema-valid
// findings — it does NOT certify the refutation was deep. Evidence-QUALITY is
// scored offline in eval/ (the gate-integrity fixture). Do not over-sell it.
// Partial-failure contract (Workflow tool spec for parallel()/pipeline()): a thunk that
// throws — or an agent that dies after retries — RESOLVES TO null in the result array; the
// call itself NEVER rejects. ("Barrier"/"awaits all" means it waits for every thunk to
// SETTLE, allSettled-style — NOT Promise.all reject-on-first-throw.) So `.filter(Boolean)`
// is the correct way to drop failed skeptics; a transient error degrades one verdict, it
// cannot abort the panel.
// The gate below must therefore notice when too many were dropped.
const returned = verdicts.length            // skeptics that came back at all
const crashed = lensKeys.length - returned  // dropped by the runtime (error / user-skip)
const schemaValid = verdicts.filter(v => v && Array.isArray(v.findings))
const withFindings = schemaValid.filter(v => v.findings.length > 0)
// RED gate: require the FULL EFFECTIVE panel — every valid requested lens (unknown lens
// names were dropped and warned above) — to return schema-valid verdicts. A partial
// collapse (e.g. 4/5 crashed) FAILS instead of passing on a lone survivor. Empty findings
// still pass (a skeptic that genuinely found nothing IS verification running); evidence
// DEPTH is scored offline, not here. requested vs ran are both reported in the result.
const gatePass = lensKeys.length >= 1 && schemaValid.length === lensKeys.length
log('RED-gate: ' + (gatePass ? 'PASS' : 'FAIL') + ' — ' + schemaValid.length + '/' + lensKeys.length +
    ' effective skeptics returned schema-valid verdicts' + (crashed ? ' (' + crashed + ' dropped by runtime)' : '') +
    '; ' + withFindings.length + ' raised findings. (Gate certifies the full panel RAN, not that refutation was deep — see eval/.)')

const crossValid = crossVerdicts.filter(v => v && Array.isArray(v.findings))
if (crossEnabled) log('cross-model: ' + crossValid.length + ' different-weights reviewer(s) returned verdicts (bonus coverage; not part of the gate).')
const confirmed = schemaValid.concat(crossValid).flatMap(v => (v.findings || []).map(f => ({ ...f, lens: v.lens, defect_class: v.defect_class, confidence: v.confidence })))
const blockers = confirmed.filter(f => f.severity === 'blocker')

// Don't pay a synthesis agent to summarize an empty finding set (cost floor in spirit).
let synthesis
if (!confirmed.length) {
  synthesis = gatePass
    ? 'No defects raised by any of the ' + (schemaValid.length + crossValid.length) + ' independent reviewers. Gate PASS (full panel ran). Safe to deliver on these lenses — depth not guaranteed (see eval/).'
    : 'No findings, but the gate FAILED: only ' + schemaValid.length + '/' + lensKeys.length + ' requested skeptics returned' + (crashed ? ' (' + crashed + ' dropped)' : '') + ' — re-run before trusting this.'
  log('adversarial-verify: zero findings — skipping the synthesis agent (cost floor).')
} else {
  synthesis = await agent(
    ANTI_CONTAMINATION +
    '\n\nYou are the verification synthesizer. ' + (schemaValid.length + crossValid.length) + ' independent reviewers' + (crossValid.length ? ' (incl. ' + crossValid.length + ' cross-model)' : '') + ' reviewed an artifact through distinct lenses. ' +
    'Here are their structured verdicts:\n' + JSON.stringify(verdicts.concat(crossVerdicts), null, 1) +
    '\n\nDeduplicate overlapping findings, rank by severity, and write a tight verdict: is this artifact safe to deliver? ' +
    'List the must-fix blockers first. Be concrete; cite the lens each finding came from. Do not invent findings the reviewers did not raise.',
    { label: 'synthesize', phase: 'Synthesize' }
  )
}

return {
  gate: { red_gate_pass: gatePass, requested: requestedCount, ran: lensKeys.length, returned, crashed, schema_valid: schemaValid.length, raised_findings: withFindings.length },
  cross_model: crossEnabled ? { provider: xc.provider, reviewers: crossValid.length } : null,
  confirmed_count: confirmed.length,
  blocker_count: blockers.length,
  blockers,
  findings: confirmed,
  synthesis,
  cost_note: 'denominators only (not success metrics): ' + verdicts.length + ' skeptic agents' + (crossEnabled ? ' + ' + crossVerdicts.length + ' cross-model' : '') + ' + 1 synthesis. Track tokens & wall-clock at the call site.',
}
