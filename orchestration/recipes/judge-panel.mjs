export const meta = {
  name: 'judge-panel',
  description: 'P2 (gated to high-stakes single artifacts): generate N independent attempts from distinct angles, score each with independent judges against a fixed rubric, then synthesize from the winner while grafting the best of the rest. Best-of-N discrimination where one artifact\'s quality matters most.',
  phases: [
    { title: 'Generate', detail: 'N independent attempts, distinct angles' },
    { title: 'Judge', detail: 'independent rubric scoring (judge != generator)' },
    { title: 'Synthesize', detail: 'build from the winner, graft runner-up strengths' },
  ],
}

/*
 * WHY (docs/ORCHESTRATION-RESEARCH.md §4 P2): for a single high-stakes artifact,
 * best-of-N with independent judging beats one-attempt-iterated when the solution
 * space is wide. GATED on purpose — never run on every task (token-expensive
 * theater). The judge must NOT be the generator (anchoring) and must NOT be a
 * cross-model sibling used as an eval oracle (treatment leak); here judging is for
 * SELECTION, not for shipping a validated metric.
 *
 * RUN: Workflow tool, scriptPath here, args = {
 *   task: "<the artifact to produce>"   (REQUIRED)
 *   angles: ["...","..."]               (optional; default below)
 *   rubric: ["criterion 1", ...]        (optional)
 * }
 */

const SCORE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['candidate', 'total', 'per_criterion', 'verdict'],
  properties: {
    candidate: { type: 'integer' },
    total: { type: 'number' },
    per_criterion: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['criterion', 'score', 'why'], properties: { criterion: { type: 'string' }, score: { type: 'number' }, why: { type: 'string' } } } },
    verdict: { type: 'string' },
  },
}

let a = args; if (typeof a === 'string') { try { a = JSON.parse(a); } catch (_) { a = {}; } } if (typeof a !== 'object' || !a) a = {}
const task = a.task
if (!task) { log('judge-panel: no args.task.'); return { skipped: true } }
const angles = (Array.isArray(a.angles) && a.angles.length ? a.angles : ['the most robust/correct solution', 'the simplest solution that works', 'the most novel/creative solution'])
const rubric = (Array.isArray(a.rubric) && a.rubric.length ? a.rubric : ['correctness', 'completeness', 'simplicity', 'robustness'])
const MAX = 16

phase('Generate')
const candidates = (await parallel(angles.slice(0, MAX).map((ang, i) => () =>
  agent('Produce a complete solution to this task, optimizing for: ' + ang + '\n\nTASK:\n' + task, { label: 'gen:' + i, phase: 'Generate' })
    .then(text => ({ i, angle: ang, text }))
))).filter(Boolean)

if (!candidates.length) { log('judge-panel: all generators failed — nothing to judge.'); return { skipped: true, reason: 'all-generators-failed' } }

phase('Judge')
// Independent judges — fresh context, see the candidate but not who wrote it. Each score
// is bound to ITS candidate in JS (by closure), NEVER via the model-supplied index field
// (a mis-filled index must not be able to pick the wrong winner).
const scores = (await parallel(candidates.map(c => () =>
  agent('Score this candidate solution against the rubric [' + rubric.join(', ') + '], each 0-10, then a total. Be a strict, independent judge.' +
    '\n\nTASK:\n' + task + '\n\nCANDIDATE #' + c.i + ':\n' + c.text,
    { label: 'judge:' + c.i, phase: 'Judge', schema: SCORE_SCHEMA })
    .then(s => s ? { ...s, _candidate: c } : null)
))).filter(Boolean)

const ranked = scores.slice().sort((x, y) => (y.total || 0) - (x.total || 0))
const winner = (ranked[0] && ranked[0]._candidate) || candidates[0]
if (!ranked.length) log('judge-panel: no judge returned a score — defaulting to the first candidate; selection is UNRELIABLE.')

phase('Synthesize')
const final = await agent(
  'Build the final answer to the task. Start from the winning candidate and graft in the strongest ideas from the runners-up. Resolve any conflicts in favor of correctness.' +
  '\n\nTASK:\n' + task + '\n\nWINNER (candidate #' + (winner && winner.i) + ', angle: ' + (winner && winner.angle) + '):\n' + (winner && winner.text) +
  '\n\nALL CANDIDATES:\n' + JSON.stringify(candidates.map(c => ({ i: c.i, angle: c.angle, text: c.text })), null, 1) +
  '\n\nJUDGE SCORES:\n' + JSON.stringify(ranked.map(({ _candidate, ...r }) => r), null, 1),
  { label: 'synthesize', phase: 'Synthesize' }
)

return { winner_index: winner && winner.i, judges_scored: ranked.length, of_candidates: candidates.length,
  ranked: ranked.map(({ _candidate, ...r }) => r), final,
  cost_note: candidates.length + ' generators + ' + scores.length + ' judges + 1 synthesis — gated to high-stakes single artifacts only.' }
