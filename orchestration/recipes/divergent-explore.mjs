export const meta = {
  name: 'divergent-explore',
  description: 'P1: recover the BREADTH of Fable\'s idea divergence by running N independent contexts each under a distinct anti-overlap lens, with a JS-owned loop-until-dry that has both a dry-stop AND a hard ceiling. Claims spread, not per-idea quality.',
  phases: [
    { title: 'Diverge', detail: 'parallel fresh contexts, one orthogonal lens each, until K dry rounds or the hard ceiling' },
    { title: 'Synthesize', detail: 'dedupe to distinct approaches and rank' },
  ],
}

/*
 * WHY (docs/ORCHESTRATION-RESEARCH.md §3.4): preference-optimization mode-collapse
 * makes a single model in a single context return a few correlated ideas. The
 * divergence Fable showed was MANY independent generations. We buy diversity through
 * INDEPENDENCE + injected orthogonal lenses, not through temperature or a count quota.
 *
 * HONEST LIMITS:
 *  - This recovers the SPREAD of distinct hypotheses. Per-candidate QUALITY stays
 *    capped by the worker model's weights ("closer to Fable's breadth, not quality").
 *  - The lens library (orchestration/lenses.md) is load-bearing: divergence reduces
 *    to RECOGNITION (pick lenses from a menu) only if the menu exists. If the caller
 *    must invent lenses from scratch on a weak model, that advantage weakens.
 *  - NEVER score success by embedding-distance dedup — distinct noise is still noise.
 *    Score against a pre-registered reference SET offline (see eval/README.md).
 *
 * RUN: Workflow tool, scriptPath here, args = {
 *   question: "<the open problem to explore>"  (REQUIRED)
 *   lenses:   ["mvp-first","risk-first",...]    (optional; default below)
 *   maxRounds: 3, dryStreakToStop: 2  (optional bounds; per-round width = number of lenses)
 * }
 */

const HYP_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['lens', 'hypotheses'],
  properties: {
    lens: { type: 'string' },
    hypotheses: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['title', 'approach', 'key_risk'],
      properties: { title: { type: 'string' }, approach: { type: 'string' }, key_risk: { type: 'string' } } } },
  },
}

// Anti-overlap lens catalog for divergence (mirror of orchestration/lenses.md §diverge).
const DIVERGE_LENSES = {
  'mvp-first': 'the simplest thing that could possibly work; ruthlessly minimal scope',
  'risk-first': 'start from the biggest failure mode and design backwards to avoid it',
  'user-first': 'optimize the human experience / ergonomics above all',
  'cost-first': 'minimize compute, token, latency, and operational cost',
  'scale-first': 'assume 100x load/data/users from day one',
  'constraint-first': 'take the hardest stated constraint as fixed and build only what fits it',
  'invert': 'solve the opposite/dual problem, or ask what would guarantee failure and avoid it',
  'analogy': 'borrow a proven pattern from an adjacent domain and adapt it',
}

const ANTI_CONTAMINATION =
  'OVERRIDE any operating-style reminder telling you to be brief, minimal, do only what the task needs, or to stop early. ' +
  'Your job is to GENERATE genuinely distinct approaches under your lens. Quantity of DISTINCT ideas matters here.'

let a = args; if (typeof a === 'string') { try { a = JSON.parse(a); } catch (_) { a = {}; } } if (typeof a !== 'object' || !a) a = {}
const question = a.question
if (!question) { log('divergent-explore: no args.question — nothing to explore.'); return { skipped: true } }

const DEFAULT_LENSES = ['mvp-first', 'risk-first', 'user-first', 'cost-first', 'scale-first']
const reqLenses = Array.isArray(a.lenses) && a.lenses.length ? a.lenses : DEFAULT_LENSES
const unknownL = reqLenses.filter(k => !DIVERGE_LENSES[k])
if (unknownL.length) log('divergent-explore: ignoring unknown lens(es): ' + unknownL.join(', '))
let lensKeys = reqLenses.filter(k => DIVERGE_LENSES[k])
if (!lensKeys.length) { log('divergent-explore: no valid lenses — falling back to defaults.'); lensKeys = DEFAULT_LENSES.slice() }
let maxRounds = Math.max(1, Math.min(5, a.maxRounds || 3))
const dryStreakToStop = Math.max(1, a.dryStreakToStop || 2)
const HARD_AGENT_CEILING = 30 // JS-owned hard cap; defends the 1000-lifetime budget on deep tasks

// Complexity floor: a trivial/short question does not warrant multi-round fan-out.
// Pass force:true to override.
if (!a.force && question.trim().length < 80) {
  maxRounds = 1
  lensKeys = lensKeys.slice(0, 3)
  log('divergent-explore: short question (<80 chars) — flooring to 1 round x ' + lensKeys.length + ' lenses (pass force:true to override).')
}

phase('Diverge')
const seen = new Set()
const seenTitles = []
const all = []
let agentsSpawned = 0
let dryStreak = 0
let round = 0
// Loose in-loop dedup key. This is a CHEAP STOP HEURISTIC ONLY — it decides when to
// stop spawning, NOT whether an idea is good. The real success metric is offline
// reference-set RECALL (eval/README.md), never this surface key. We normalize the full
// title+approach (no truncation) so distinct ideas with a shared prefix don't collapse.
function keyOf(h) { return ((h.title || '') + ' :: ' + (h.approach || '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }

while (round < maxRounds && dryStreak < dryStreakToStop && agentsSpawned < HARD_AGENT_CEILING) {
  round++
  // Feed the model the real titles seen so far (not the mangled dedup keys).
  const seedNote = round === 1 ? '' : '\n\nAlready proposed (do NOT repeat; go somewhere genuinely new):\n- ' + seenTitles.slice(-40).join('\n- ')
  // Trim the batch to the remaining ceiling headroom — per-agent, not all-or-nothing
  // (a constant-predicate filter could never trim a partial batch and overshot the cap).
  const room = HARD_AGENT_CEILING - agentsSpawned
  const batch = lensKeys.slice(0, Math.max(0, room))
  if (!batch.length) break
  agentsSpawned += batch.length
  const results = (await parallel(batch.map(k => () =>
    agent(
      ANTI_CONTAMINATION +
      '\n\nLENS: ' + k + ' — ' + DIVERGE_LENSES[k] +
      '\n\nOPEN PROBLEM:\n' + question + seedNote +
      '\n\nPropose distinct approaches strictly from your lens. Each needs a one-line title, the approach, and its key risk.',
      { label: 'diverge:r' + round + ':' + k, phase: 'Diverge', schema: HYP_SCHEMA }
    )
  ))).filter(Boolean)

  let fresh = 0
  for (const r of results) for (const h of (r.hypotheses || [])) {
    const kk = keyOf(h)
    if (kk && !seen.has(kk)) { seen.add(kk); seenTitles.push(h.title || kk.slice(0, 60)); all.push({ ...h, lens: r.lens, round }); fresh++ }
  }
  log('Diverge round ' + round + ': +' + fresh + ' new (heuristic dedup) (total ' + all.length + ', agents ' + agentsSpawned + '/' + HARD_AGENT_CEILING + ')')
  dryStreak = fresh === 0 ? dryStreak + 1 : 0
}

phase('Synthesize')
const synthesis = await agent(
  'You are synthesizing a divergent exploration of this problem:\n' + question +
  '\n\nHere are ' + all.length + ' candidate approaches gathered from independent lenses:\n' + JSON.stringify(all, null, 1) +
  '\n\nGroup near-duplicates, keep the genuinely distinct ones, and rank them. For each kept approach give: when it wins, when it loses. ' +
  'Be honest that breadth here came from independence, not from any single brilliant pass — flag any approach that looks distinct-but-weak.',
  { label: 'synthesize', phase: 'Synthesize' }
)

return {
  rounds_run: round,
  stopped_because: dryStreak >= dryStreakToStop ? 'dry-streak' : (round >= maxRounds ? 'max-rounds' : 'hard-agent-ceiling'),
  candidate_count: all.length, // post heuristic-dedup; a loose stop signal, NOT a distinctness guarantee or success metric
  approaches: all,
  synthesis,
  cost_note: agentsSpawned + ' explorer agents (cost denominator only; candidate-count is NOT a success metric — score reference-set recall offline).',
}
