export const meta = {
  name: 'pipeline-map',
  description: 'Map-heavy / no-barrier genre: process each of N items through staged extract -> transform -> verify independently, with NO global barrier (item A can be at stage 3 while item B is still at stage 1). Fills the pipeline() coverage hole the panel flagged.',
  phases: [
    { title: 'Map', detail: 'each item flows through all stages on its own; per-item verify gate at the end' },
  ],
}

/*
 * WHY (docs/ORCHESTRATION-RESEARCH.md §4 gap-fillers): map-heavy staged work
 * ("process each of N files/records through extract->transform->check") is one of
 * the most common real orchestration shapes, and the parallel()+barrier recipes do
 * not model it. pipeline() runs each item through all stages with no barrier, so
 * wall-clock is the slowest single-item chain, not sum-of-slowest-per-stage.
 *
 * Each item is independently verified: the verify stage returns a verdict (ok flag +
 * note), and the item's TRANSFORMED output is carried into the result. Items that FAIL
 * verify are returned flagged ok:false (not silently dropped); only a true stage ERROR
 * drops an item to null. So the result preserves the transform product AND the verdict —
 * verify is advisory labeling, not a hard gate that discards work.
 *
 * RUN: Workflow tool, scriptPath here, args = {
 *   items: ["...", "..."]          (REQUIRED; capped so items x 3 stages stays under the ~1000-agent budget)
 *   extract: "<instruction>", transform: "<instruction>", verify: "<instruction>"
 * }
 */

const OUT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['ok', 'output', 'note'],
  properties: { ok: { type: 'boolean' }, output: { type: 'string' }, note: { type: 'string' } },
}
// The verify stage JUDGES; it does not need to echo the product. JS carries the transform
// output forward so the actual transformed item is never lost.
const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['ok', 'note'],
  properties: { ok: { type: 'boolean' }, note: { type: 'string' } },
}

let a = args; if (typeof a === 'string') { try { a = JSON.parse(a); } catch (_) { a = {}; } } if (typeof a !== 'object' || !a) a = {}
// The Workflow VM cannot read process.env or import the shared resolver. The Node
// preflight serializes its optional result; an empty object preserves v1.3 fallback.
const readonlyAgentType = a.preflight && a.preflight.readonlyAgentType
const readonlyAgentOptions = readonlyAgentType ? { agentType: readonlyAgentType } : {}
const ADVISORY_ROLES = {
  verifier: readonlyAgentOptions,
}
// Optional host-level cost preflight. Omitted preserves legacy direct-recipe behavior.
// When supplied, fail closed before phase(), pipeline(), or the first agent() call.
const preflight = a.preflight
if (preflight !== undefined && (!preflight || preflight.allow !== true || preflight.route !== 'decompose')) {
  log('pipeline-map: preflight refused multi-agent spend; use the single-lens route.')
  return {
    refused: true,
    allow: false,
    route: 'single-lens',
    reason: (preflight && preflight.reason) || 'invalid-preflight-input',
  }
}
const STAGE_COUNT = 3 // extract -> transform -> verify
// Hard agent budget: items x 3 stages must stay under the 1000-agent lifetime cap that the
// sibling recipes defend. Default ~960 agents => ~320 items. (There is intentionally NO
// per-item complexity floor — the caller owns the item list — only this total agent cap.)
const AGENT_BUDGET = Math.max(STAGE_COUNT, Math.min(960, a.agentBudget || 960))
const maxItems = Math.floor(AGENT_BUDGET / STAGE_COUNT)
const rawItems = Array.isArray(a.items) ? a.items : []
const items = rawItems.slice(0, maxItems)
if (!items.length) { log('pipeline-map: no args.items.'); return { skipped: true } }
if (rawItems.length > items.length) log('pipeline-map: ' + rawItems.length + ' items requested, capped to ' + items.length + ' (' + items.length + '×' + STAGE_COUNT + ' stages stays under the ~1000-agent lifetime budget). Chunk larger batches across runs or route through a long-job harness.')

const extract = a.extract || 'Extract the salient facts/fields from this item.'
const transform = a.transform || 'Transform the extracted facts into the target form.'
const verify = a.verify || 'Verify the transform is correct and complete; ok=false with a reason if not.'

phase('Map')
const results = await pipeline(
  items,
  // stage 1: extract
  (item, _orig, i) => agent('ITEM #' + i + ':\n' + String(item) + '\n\nTASK: ' + extract,
    { label: 'extract:' + i, phase: 'Map', schema: OUT_SCHEMA }),
  // stage 2: transform (gets stage-1 output)
  (ex, item, i) => agent('Extracted from item #' + i + ':\n' + JSON.stringify(ex) + '\n\nTASK: ' + transform,
    { label: 'transform:' + i, phase: 'Map', schema: OUT_SCHEMA }),
  // stage 3: per-item verify (fresh context; independent). Returns a verdict; JS then
  // carries the TRANSFORM output (tr.output) into the result so the product is preserved.
  (tr, item, i) => agent('Transformed output for item #' + i + ':\n' + JSON.stringify(tr) +
    '\n\nORIGINAL ITEM:\n' + String(item) + '\n\nTASK: ' + verify + ' Set ok=false (with a reason in note) if it does not hold.',
    { label: 'verify:' + i, phase: 'Map', schema: VERIFY_SCHEMA, ...ADVISORY_ROLES.verifier })
    .then(v => v ? { ok: v.ok, output: (tr && tr.output) || '', verify_note: v.note, item_index: i } : null)
)

const done = results.filter(Boolean)
const passed = done.filter(r => r.ok)
const failed = done.filter(r => !r.ok)
const dropped = results.length - done.length
log('pipeline-map: ' + passed.length + ' passed, ' + failed.length + ' failed verify, ' + dropped + ' dropped (stage error) of ' + items.length)

return {
  total: items.length, passed: passed.length, failed_verify: failed.length, dropped_stage_error: dropped,
  results: done,
  cost_note: 'one chain per item; wall-clock = slowest single chain (no barrier). Dropped/failed items are surfaced, not hidden.',
}
