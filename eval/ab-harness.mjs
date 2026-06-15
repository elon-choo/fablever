export const meta = {
  name: 'orchestration-ab',
  description: 'Model-swap-aware, condition-blind A/B over a seeded-defect fixture: arm A = single mega-agent review, arm B = decomposed parallel skeptic panel, worker model held FIXED, independent blind judge scores catch-rate PER STRATUM. The honest answer to the placebo objection.',
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
// Per task: run arm A (single) and arm B (panel) with the SAME worker model.
const perTask = await parallel(fx.verify_tasks.map(t => () => (async () => { try {
  // arm A — one mega-agent
  const single = await agent(NO_RESTRAINT + '\n\nReview this artifact and list EVERY defect with evidence:\n\n' + t.artifact,
    { label: 'A-single:' + t.id, phase: 'Run-arms', schema: FOUND_SCHEMA, model: worker })
  // arm B — decomposed parallel skeptics (the recipe under test)
  const panel = (await parallel(lenses.map(k => () =>
    agent(NO_RESTRAINT + '\n\nYou are an independent skeptic. Review ONLY for ' + k + ' defects, with evidence:\n\n' + t.artifact,
      { label: 'B-' + k + ':' + t.id, phase: 'Run-arms', schema: FOUND_SCHEMA, model: worker })
  ))).filter(Boolean)
  const panelDefects = panel.flatMap(p => p.defects || [])
  return { task: t, armA: (single && single.defects) || [], armB: panelDefects }
  } catch (_) { return null }
})())).then(r => r.filter(Boolean))

phase('Judge')
const judged = await parallel(perTask.map((row, i) => () => (async () => { try {
  // condition-blind: present arms as X/Y; deterministic order from seed+index so the
  // judge cannot infer which is the structured arm.
  const flip = ((seed + i) % 2) === 1
  const subX = flip ? row.armB : row.armA
  const subY = flip ? row.armA : row.armB
  async function score(found) {
    return agent('You are an independent judge, BLIND to how these defects were produced. ' +
      'For EACH planted defect, decide whether the submission CAUGHT it (clearly identified the same issue). ' +
      'Also report claimed_total (how many defects the submission reported) and false_positives (how many of its reported defects match NONE of the planted defects — invented or noise). ' +
      'Precision matters: a noisier submission must not score better merely by reporting more.\n\n' +
      'PLANTED DEFECTS:\n' + JSON.stringify(row.task.planted_defects, null, 1) +
      '\n\nSUBMISSION (defects it reported):\n' + JSON.stringify(found, null, 1),
      { label: 'judge:' + row.task.id, phase: 'Judge', schema: JUDGE_SCHEMA, model: judge })
  }
  const [jX, jY] = [await score(subX), await score(subY)]
  return { id: row.task.id, armA: flip ? jY : jX, armB: flip ? jX : jY, counts: { armA_found: row.armA.length, armB_found: row.armB.length, panel_agents: lenses.length } }
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
const report = {
  worker_model: worker, judge_model: judge,
  arm_A_single: rollup('armA'),
  arm_B_panel: rollup('armB'),
  divergent_stratum: divergent,
  denominators: { panel_agents_per_task: lenses.length, note: 'agent count / tokens / wall-clock are cost denominators — read them WITH recall AND precision, never alone' },
  reading: 'Hypothesis: arm B (panel) beats arm A (single) on recall strata a & b via independence, small/null on c (weights-bound), and higher reference-set recall on the divergent stratum — WITHOUT a worse precision (false-positive) score. On the shipped tiny fixture some strata may be empty (null); expand it before concluding. Placebo test: re-run with a different workerModel — a real recipe keeps its edge across models; a placebo does not.',
  caveat: 'Illustrative fixture. Not a benchmark until expanded and pre-registered per eval/README.md. A null result is allowed to falsify the recipe.',
}
const bR = report.arm_B_panel.recall, aR = report.arm_A_single.recall
log('A/B done. worker=' + worker + '  arm B (panel) recall a/b/c = ' + bR.a + '/' + bR.b + '/' + bR.c +
    '  vs arm A (single) = ' + aR.a + '/' + aR.b + '/' + aR.c +
    '  (precision B=' + report.arm_B_panel.precision + ' A=' + report.arm_A_single.precision + ')')
return report
