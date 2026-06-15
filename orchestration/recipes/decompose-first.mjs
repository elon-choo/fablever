export const meta = {
  name: 'decompose-first',
  description: 'P1: force a typed task-tree (which known split-axis, how many independent sub-problems) BEFORE any fan-out, then spawn width = count of independent sub-problems (capped, floored). Converts decomposition from generation-under-load into classification-against-a-menu.',
  phases: [
    { title: 'Plan', detail: 'emit a schema-forced task-tree; pick a split-axis from the fixed menu' },
    { title: 'Execute', detail: 'fan out exactly to the independent sub-problems the tree found' },
    { title: 'Integrate', detail: 'merge sub-results into one answer' },
  ],
}

/*
 * WHY (docs/ORCHESTRATION-RESEARCH.md §3.2): fan-out width is a learned policy. For
 * KNOWN task genres it reduces to recognizing which split-axis applies — recognition
 * is far more recoverable on a weak model than open generation, and forcing the PLAN
 * to exist first defeats the completion-attractor rush to answer before planning.
 * Width is keyed to the COUNT of independent sub-problems the plan actually contains,
 * never a quota. A complexity floor exempts trivial tasks (else this is just overhead).
 *
 * RUN: Workflow tool, scriptPath here, args = { task: "<the task>", maxWidth: 12 }
 */

const SPLIT_AXES = ['by-hypothesis', 'by-perspective', 'by-search-modality', 'by-pipeline-stage', 'by-file-or-module', 'none']

const TREE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['split_axis', 'rationale', 'independent', 'subproblems'],
  properties: {
    split_axis: { type: 'string', enum: SPLIT_AXES,
      description: 'pick the ONE axis from this fixed menu that best splits the task; "none" if it is genuinely atomic' },
    rationale: { type: 'string' },
    independent: { type: 'boolean', description: 'true only if the subproblems can be worked WITHOUT needing each other\'s results (then parallel; else pipeline/sequential)' },
    subproblems: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['title', 'goal'], properties: { title: { type: 'string' }, goal: { type: 'string' } } } },
  },
}

let a = args; if (typeof a === 'string') { try { a = JSON.parse(a); } catch (_) { a = {}; } } if (typeof a !== 'object' || !a) a = {}
const task = a.task
if (!task) { log('decompose-first: no args.task.'); return { skipped: true } }
const maxWidth = Math.max(1, Math.min(16, a.maxWidth || 12)) // honor min(16, cores-2) spirit

phase('Plan')
const tree = await agent(
  'Classify how to decompose this task. Do NOT solve it yet. Pick exactly one split-axis from the fixed menu ' +
  '[' + SPLIT_AXES.join(', ') + '] and list the independent sub-problems it produces. If the task is genuinely atomic, use split_axis="none" and a single subproblem.' +
  '\n\nTASK:\n' + task,
  { label: 'plan', phase: 'Plan', schema: TREE_SCHEMA }
)

const plannedCount = (tree.subproblems || []).length
const subs = (tree.subproblems || []).slice(0, maxWidth)
if (plannedCount > subs.length) log('decompose-first: plan had ' + plannedCount + ' sub-problems; capped to maxWidth=' + maxWidth + ' (' + (plannedCount - subs.length) + ' dropped — raise maxWidth to cover them).')

// Complexity floor: 0/1 subproblem or axis "none" => do NOT fan out. Answer directly.
if (tree.split_axis === 'none' || subs.length <= 1) {
  if (tree.split_axis !== 'none' && subs.length === 0) log('decompose-first: planner returned a non-atomic axis (' + tree.split_axis + ') but ZERO sub-problems — treating as atomic.')
  log('decompose-first: task is atomic (axis=' + tree.split_axis + ', subproblems=' + subs.length + ') — below the fan-out floor, answering directly.')
  phase('Execute')
  const direct = await agent('Solve this task directly and completely:\n' + task, { label: 'direct', phase: 'Execute' })
  return { plan: tree, fanned_out: false, answer: direct }
}

phase('Execute')
log('decompose-first: axis=' + tree.split_axis + ', width=' + subs.length + ' (independent=' + tree.independent + ')')
const SUB_SCHEMA = { type: 'object', additionalProperties: false, required: ['title', 'result', 'open_issues'],
  properties: { title: { type: 'string' }, result: { type: 'string' }, open_issues: { type: 'array', items: { type: 'string' } } } }

let results
let dropped = []
if (tree.independent) {
  // parallel — barrier — because subproblems don't depend on each other
  results = (await parallel(subs.map(s => () =>
    agent('Sub-task (' + s.title + '): ' + s.goal + '\n\nParent task for context:\n' + task,
      { label: 'sub:' + s.title.slice(0, 24), phase: 'Execute', schema: SUB_SCHEMA })
  ))).filter(Boolean)
  const lost = subs.length - results.length
  if (lost > 0) { dropped = ['(' + lost + ' parallel sub-task(s) failed)']; log('decompose-first: ' + lost + ' parallel sub-task(s) returned null.') }
} else {
  // sequential: each sub depends on prior results. Cap each carried prior to a compact
  // summary so the per-agent window stays small even at max width. (Total work is still
  // ~O(N^2) across the chain, but no single agent's window blows up — that is the risk.)
  results = []
  for (const s of subs) {
    const priorSummary = results.map(r => '- ' + r.title + ': ' + String(r.result).slice(0, 600)).join('\n')
    const prior = results.length ? '\n\nResults so far (summarized):\n' + priorSummary : ''
    const lostNote = dropped.length ? '\n\n(Note: earlier sub-task(s) failed and are missing: ' + dropped.join(', ') + ')' : ''
    const r = await agent('Sub-task (' + s.title + '): ' + s.goal + '\n\nParent task:\n' + task + prior + lostNote,
      { label: 'sub:' + s.title.slice(0, 24), phase: 'Execute', schema: SUB_SCHEMA })
    if (r) results.push(r); else dropped.push(s.title)
  }
  if (dropped.length) log('decompose-first: ' + dropped.length + ' sequential sub-task(s) failed: ' + dropped.join(', '))
}

if (!results.length) {
  log('decompose-first: all sub-tasks failed — nothing to integrate.')
  return { plan: tree, fanned_out: true, planned: plannedCount, width: subs.length, failed: dropped.length, sub_results: [], answer: null, error: 'all-subtasks-failed' }
}

phase('Integrate')
const dropNote = dropped.length ? '\n\nNOTE: ' + dropped.length + ' sub-task(s) failed and are ABSENT (' + dropped.join(', ') + ') — flag any resulting gaps; do not paper over them.' : ''
const merged = await agent(
  'Integrate these sub-results into one coherent answer to the original task. Reconcile conflicts, surface any open issues.' +
  '\n\nORIGINAL TASK:\n' + task + '\n\nSUB-RESULTS:\n' + JSON.stringify(results, null, 1) + dropNote,
  { label: 'integrate', phase: 'Integrate' }
)

return {
  plan: tree, fanned_out: true, planned: plannedCount, width: subs.length, failed: dropped.length,
  mode: tree.independent ? 'parallel' : 'sequential',
  sub_results: results, answer: merged,
  cost_note: subs.length + ' sub-agents + plan + integrate (cost denominator; width keyed to detected sub-problems, not a quota; sequential mode caps each carried prior so the per-agent window stays small).',
}
