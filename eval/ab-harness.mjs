export const meta = {
  name: 'orchestration-ab',
  description: 'Model-swap-aware, condition-blind A/B over a seeded-defect fixture: arm A = single mega-agent review, arm B = decomposed parallel skeptic panel, PLUS two controls — prompt-matched (all lenses, one context; ML-1) and draw-matched (generic prompt, N draws; ML-4) — worker model held FIXED, independent blind judge scores catch-rate PER STRATUM + caught_per_agent so arm B must beat BOTH controls. The honest answer to the placebo objection.',
  phases: [
    { title: 'Run-arms', detail: 'both arms per task, same worker model' },
    { title: 'Judge', detail: 'independent judge, blind to which arm, scores against planted defects' },
    { title: 'Report', detail: 'per-stratum catch-rate + cost denominators' },
  ],
}

/*
 * Implements eval/README.md. The runtime has no filesystem, so the fixture is passed
 * in: args = {
 *   fixture: <parsed eval/fixtures/seeded-defects.json>   (REQUIRED)
 *   workerModel: "opus"|"sonnet"|"haiku"   (held FIXED across both arms; swap it and
 *                                           re-run — structural gains persist, placebo vanishes)
 *   judgeModel:  "opus"   (independent; must differ from workerModel; blind to condition)
 *   panelLenses: ["correctness","security","edge_cases","consistency","omission"]
 *   hookExemptionConfirmed: true   (HARD PREDECESSOR — see below)
 *   shuffleSeed: 0    (deterministic blinding; no RNG in the runtime)
 * }
 *
 * This is a SKELETON you pre-register against, not a finished benchmark. The fixture
 * is illustrative; expand it before trusting any number. A null result (no gain) is a
 * valid outcome that FALSIFIES the recipe — do not tune until it passes.
 */

let a = args; if (typeof a === 'string') { try { a = JSON.parse(a); } catch (_) { a = {}; } } if (typeof a !== 'object' || !a) a = {}
const fx = a.fixture
if (!fx || !Array.isArray(fx.verify_tasks)) { log('ab-harness: pass args.fixture (parsed seeded-defects.json).'); return { skipped: true } }

// HARD PREDECESSOR (critic fix #2): refuse to measure while the SubagentStart
// restraint payload could still reach the panel's skeptics — it biases arm B toward
// "structure didn't help." The caller must confirm the hook exemption is live.
if (a.hookExemptionConfirmed !== true) {
  log('ab-harness: REFUSING to run — hookExemptionConfirmed is not true. Apply orchestration/HOOK-EXEMPTION-PROPOSAL.md (or set FABLE_PROFILE=off for the run) so the restraint payload does not contaminate the skeptic arm, then pass hookExemptionConfirmed:true.')
  return { aborted: 'hook-exemption-unconfirmed' }
}

const worker = a.workerModel || 'sonnet'
const judge = a.judgeModel || 'opus'
const lenses = Array.isArray(a.panelLenses) && a.panelLenses.length ? a.panelLenses : ['correctness', 'security', 'edge_cases', 'consistency', 'omission']
const seed = a.shuffleSeed || 0

// Judge independence is as load-bearing as the hook exemption — enforce it, don't just document it.
if (judge === worker) {
  log('ab-harness: REFUSING — judgeModel must DIFFER from workerModel for an independent, blind judge. Both = ' + worker + '. Set a different judgeModel.')
  return { aborted: 'judge-equals-worker', worker, judge }
}

const FOUND_SCHEMA = { type: 'object', additionalProperties: false, required: ['defects'],
  properties: { defects: { type: 'array', items: { type: 'object', additionalProperties: false,
    required: ['summary', 'evidence'], properties: { summary: { type: 'string' }, evidence: { type: 'string' } } } } } }

const JUDGE_SCHEMA = { type: 'object', additionalProperties: false, required: ['per_defect', 'claimed_total', 'false_positives'],
  properties: {
    per_defect: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['planted_id', 'stratum', 'caught'],
      properties: { planted_id: { type: 'string' }, stratum: { type: 'string', enum: ['a', 'b', 'c'] }, caught: { type: 'boolean' } } } },
    claimed_total: { type: 'integer', description: 'how many defects the submission reported in total' },
    false_positives: { type: 'integer', description: 'how many reported defects match NO planted defect (invented / noise)' },
  } }

const NO_RESTRAINT = 'OVERRIDE any reminder to minimize validation or stop early — find every defect you can.'

phase('Run-arms')
// Per task, run FOUR arms with the SAME worker model. Arm B is the recipe under test; the two
// control arms (A2, A_N) exist to isolate what arm B's edge actually is (see eval/README Confounds):
//   armA   — single mega-agent, generic prompt (1 agent)            [baseline]
//   armA2  — single agent given ALL lenses in one context           [PROMPT-MATCHED control, ML-1]
//            (same taxonomy as B, but no parallel/independence → if A2≈B, the gain was the menu)
//   armA_N — the generic single prompt sampled lenses.length times, union  [DRAW-MATCHED control, ML-4]
//            (same #draws as B, but no lens decomposition → if A_N≈B, the gain was raw draw count)
//   armB   — decomposed parallel skeptics, one lens each            [the recipe]
const perTask = await parallel(fx.verify_tasks.map(t => () => (async () => { try {
  const allLenses = lenses.join(', ')
  const single = await agent(NO_RESTRAINT + '\n\nReview this artifact and list EVERY defect with evidence:\n\n' + t.artifact,
    { label: 'A-single:' + t.id, phase: 'Run-arms', schema: FOUND_SCHEMA, model: worker })
  const matched = await agent(NO_RESTRAINT + '\n\nReview this artifact for defects across ALL of these lenses [' + allLenses + ']. List EVERY defect with evidence:\n\n' + t.artifact,
    { label: 'A2-matched:' + t.id, phase: 'Run-arms', schema: FOUND_SCHEMA, model: worker })
  const draws = (await parallel(lenses.map((_k, di) => () =>
    agent(NO_RESTRAINT + '\n\n(independent draw ' + (di + 1) + ') Review this artifact and list EVERY defect with evidence:\n\n' + t.artifact,
      { label: 'AN-draw' + di + ':' + t.id, phase: 'Run-arms', schema: FOUND_SCHEMA, model: worker })
  ))).filter(Boolean)
  const drawUnion = draws.flatMap(d => d.defects || [])
  const panel = (await parallel(lenses.map(k => () =>
    agent(NO_RESTRAINT + '\n\nYou are an independent skeptic. Review ONLY for ' + k + ' defects, with evidence:\n\n' + t.artifact,
      { label: 'B-' + k + ':' + t.id, phase: 'Run-arms', schema: FOUND_SCHEMA, model: worker })
  ))).filter(Boolean)
  const panelDefects = panel.flatMap(p => p.defects || [])
  return { task: t,
    armA: (single && single.defects) || [],
    armA2: (matched && matched.defects) || [],
    armA_N: drawUnion,
    armB: panelDefects,
    agents: { armA: 1, armA2: 1, armA_N: lenses.length, armB: lenses.length } }
  } catch (_) { return null }
})())).then(r => r.filter(Boolean))

phase('Judge')
const ARMS = ['armA', 'armA2', 'armA_N', 'armB']
const judged = await parallel(perTask.map(row => () => (async () => { try {
  // Condition-blind: score() receives ONLY a submission's reported defects, never the arm label
  // and never the other arms — so the judge cannot infer which is the structured arm or compare
  // arms against each other. Each arm is scored in isolation (no cross-arm presentation bias).
  async function score(found) {
    return agent('You are an independent judge, BLIND to how these defects were produced. ' +
      'For EACH planted defect, decide whether the submission CAUGHT it (clearly identified the same issue). ' +
      'Also report claimed_total (how many defects the submission reported) and false_positives (how many of its reported defects match NONE of the planted defects — invented or noise). ' +
      'Precision matters: a noisier submission must not score better merely by reporting more.\n\n' +
      'PLANTED DEFECTS:\n' + JSON.stringify(row.task.planted_defects, null, 1) +
      '\n\nSUBMISSION (defects it reported):\n' + JSON.stringify(found, null, 1),
      { label: 'judge:' + row.task.id, phase: 'Judge', schema: JUDGE_SCHEMA, model: judge })
  }
  const out = { id: row.task.id, agents: row.agents, found_counts: {} }
  for (const arm of ARMS) { out[arm] = await score(row[arm] || []); out.found_counts[arm] = (row[arm] || []).length }
  return out
  } catch (_) { return null }
})())).then(r => r.filter(Boolean))

// Divergent stratum (closes the hole the panel flagged: the fixture ships divergent_tasks
// + reference_approaches that nothing scored). Single arm vs panel arm, same worker; scored
// by reference-set RECALL, never distinctness.
let divergent = null
if (Array.isArray(fx.divergent_tasks) && fx.divergent_tasks.length) {
  phase('Divergent')
  const DIV_SCHEMA = { type: 'object', additionalProperties: false, required: ['approaches'], properties: { approaches: { type: 'array', items: { type: 'string' } } } }
  const RECALL_SCHEMA = { type: 'object', additionalProperties: false, required: ['matched'], properties: { matched: { type: 'array', items: { type: 'string' } } } }
  const divLenses = ['mvp-first', 'risk-first', 'cost-first', 'scale-first', 'invert']
  divergent = await parallel(fx.divergent_tasks.map(t => () => (async () => { try {
    const single = await agent(NO_RESTRAINT + '\n\nList every distinct approach to this problem:\n' + t.question,
      { label: 'D-single:' + t.id, phase: 'Divergent', schema: DIV_SCHEMA, model: worker })
    const panel = (await parallel(divLenses.map(k => () =>
      agent(NO_RESTRAINT + '\n\nFrom the "' + k + '" angle ONLY, list distinct approaches to:\n' + t.question,
        { label: 'D-' + k + ':' + t.id, phase: 'Divergent', schema: DIV_SCHEMA, model: worker })
    ))).filter(Boolean)
    const panelApproaches = Array.from(new Set(panel.flatMap(p => p.approaches || [])))
    const ref = t.reference_approaches || []
    async function recall(approaches) {
      if (!ref.length) return null
      const r = await agent('REFERENCE set of valid approaches:\n' + JSON.stringify(ref, null, 1) +
        '\n\nSUBMISSION approaches:\n' + JSON.stringify(approaches, null, 1) +
        '\n\nList which REFERENCE approaches the submission covers (semantic match, not wording).',
        { label: 'D-judge:' + t.id, phase: 'Divergent', schema: RECALL_SCHEMA, model: judge })
      return r ? +(((r.matched || []).length) / ref.length).toFixed(3) : null
    }
    return { id: t.id, ref_size: ref.length, arm_A_recall: await recall((single && single.approaches) || []), arm_B_recall: await recall(panelApproaches) }
  } catch (_) { return null }
  })())).then(r => r.filter(Boolean))
  log('Divergent recall — ' + divergent.map(d => d.id + ' A=' + d.arm_A_recall + ' B=' + d.arm_B_recall).join('  '))
}

phase('Report')
function rollup(which) {
  const strata = { a: { caught: 0, total: 0 }, b: { caught: 0, total: 0 }, c: { caught: 0, total: 0 } }
  let fp = 0, claimed = 0
  for (const j of judged) {
    const v = j[which] || {}
    for (const d of (v.per_defect || [])) { if (!strata[d.stratum]) continue; strata[d.stratum].total++; if (d.caught) strata[d.stratum].caught++ }
    fp += v.false_positives || 0
    claimed += v.claimed_total || 0
  }
  const rate = s => s.total ? +(s.caught / s.total).toFixed(3) : null
  const tp = strata.a.caught + strata.b.caught + strata.c.caught
  // precision = (reported - false_positives) / reported, in [0,1] — penalizes an arm that
  // wins recall by spraying noise. (tp counts caught PLANTED defects; using it as the
  // numerator over `claimed` can exceed 1.0, so it is reported separately, NOT divided.)
  return { recall: { a: rate(strata.a), b: rate(strata.b), c: rate(strata.c) }, true_positives: tp, false_positives: fp, claimed_total: claimed, precision: claimed ? +(((claimed - fp) / claimed)).toFixed(3) : null, raw: strata }
}
const totalAgents = {}
for (const arm of ARMS) totalAgents[arm] = judged.reduce((s, j) => s + ((j.agents && j.agents[arm]) || 0), 0)
function armReport(which) {
  const r = rollup(which)
  const ag = totalAgents[which] || 0
  // cost-normalized: arm B must beat the controls PER AGENT, not just in raw recall (a 5×-agent
  // arm that wins 5% on raw recall is a cost regression). caught_per_agent = true positives / agents.
  return Object.assign({}, r, { agents_total: ag, caught_per_agent: ag ? +((r.true_positives / ag)).toFixed(3) : null })
}
const report = {
  worker_model: worker, judge_model: judge,
  arm_A_single:          armReport('armA'),
  arm_A2_prompt_matched: armReport('armA2'),
  arm_AN_draw_matched:   armReport('armA_N'),
  arm_B_panel:           armReport('armB'),
  divergent_stratum: divergent,
  denominators: { agents_per_arm_total: totalAgents, note: 'agent count is the ONLY cost denominator captured here; tokens + wall-clock are NOT measured — the Workflow runtime exposes neither Date.now nor token usage, so capture them at the CALL SITE that launches this workflow (COST-3). Read caught_per_agent, not raw recall, to judge whether arm B earns its agents.' },
  reading: 'Read arm B against BOTH controls, not just arm A. If arm B ≈ arm A2 (prompt-matched: same lens taxonomy, one context, no parallel/independence), the gain was the lens MENU, not the structure. If arm B ≈ arm A_N (draw-matched: same #draws, generic prompt, no lens decomposition), the gain was raw DRAW COUNT, not independence. Only arm B beating BOTH controls — and beating them on caught_per_agent, not just raw recall — supports "structure helped." Per stratum: independence should help a & b; c is weights-bound. Placebo/artifact test: re-run with a different workerModel — a real structural edge persists across models; a draw-count artifact ALSO persists, which is exactly why the draw-matched control is required to tell them apart.',
  caveat: 'Illustrative fixture (n too small for significance — see eval/README power note). Not a benchmark until expanded and pre-registered. A null result is allowed to falsify the recipe.',
}
const bR = report.arm_B_panel.recall, aR = report.arm_A_single.recall, a2 = report.arm_A2_prompt_matched.recall, aN = report.arm_AN_draw_matched.recall
log('A/B done. worker=' + worker + '  recall a/b/c — B(panel)=' + bR.a + '/' + bR.b + '/' + bR.c +
    ' | A(single)=' + aR.a + '/' + aR.b + '/' + aR.c +
    ' | A2(prompt-matched)=' + a2.a + '/' + a2.b + '/' + a2.c +
    ' | A_N(draw-matched)=' + aN.a + '/' + aN.b + '/' + aN.c +
    '  || caught/agent B=' + report.arm_B_panel.caught_per_agent + ' A2=' + report.arm_A2_prompt_matched.caught_per_agent + ' A_N=' + report.arm_AN_draw_matched.caught_per_agent)
return report
