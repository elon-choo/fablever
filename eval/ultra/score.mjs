#!/usr/bin/env node
// Offline scorer for the committed ULTRA raw data — NO API keys, NO network.
// Recomputes the *deterministic* count claims in whitepaper/03-results.md straight from
// raw/*.json + the fixture, so a reviewer can check them in seconds without re-running models.
//
//   node eval/ultra/score.mjs
//
// What it CAN check offline (pure arithmetic over committed JSON):
//   - planted-defect count (18 across n=6 artifacts)
//   - candidate-union size per run (the 4xx "candidates" numbers)
//   - confirmed-defect count per run (the adjudicator's deduped output)
// What it CANNOT check offline (requires the live cross-model judge panel, by design):
//   - recall (16/18, 18/18) and precision (0.74, 0.63): each planted defect is matched to a
//     confirmed defect by a 5-judge cross-model panel (semantic judgement, not string match).
//     Re-run that with your own keys:  node eval/ultra/ultra-judge-panel-latest.mjs raw/ultra-confirmed-latest.json
//   The panel's per-vote output was streamed to stdout at run time and is reported in §3, not
//   persisted here — so the recall/precision line is "live-reproducible," not "offline-checkable."
//   This script is explicit about that boundary instead of pretending the headline is offline-derivable.

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const raw = join(here, 'raw')

const fixture = JSON.parse(readFileSync(join(repo, 'eval/fixtures/seeded-defects-hard.json'), 'utf8'))
const nTasks = fixture.verify_tasks.length
const nPlanted = fixture.verify_tasks.reduce((s, t) => s + t.planted_defects.length, 0)

console.log(`fixture: eval/fixtures/seeded-defects-hard.json`)
console.log(`  artifacts (n) = ${nTasks}`)
console.log(`  planted defects = ${nPlanted}  (${fixture.verify_tasks.map(t => t.planted_defects.length).join('+')})`)
console.log('')

// Human-readable label for each committed adjudicator-output file.
const LABEL = {
  'ultra-confirmed.json': 'prior-model peak run (whitepaper 18/18) — adjudicate the wide union',
  'ultra-confirmed-latest.json': 'latest-model re-run (whitepaper 16/18 @ 0.74) — V3',
  'ultra-confirmed-v2.json': 'negative result: escalation variant (backfired, see experiment log)',
  'ultra-confirmed-v3.json': 'negative result: escalation variant (backfired, see experiment log)',
  'ultra-confirmed-v1refuted.json': 'negative result: adversarial-refute pass (dropped ~nothing real)',
}

const files = readdirSync(raw).filter(f => f.startsWith('ultra-confirmed') && f.endsWith('.json')).sort()
let problems = 0
for (const f of files) {
  const d = JSON.parse(readFileSync(join(raw, f), 'utf8'))
  const confirmed = (d.tasks || []).reduce((s, t) => s + (t.confirmed ? t.confirmed.length : 0), 0)
  const candReported = d.n_candidates_total
  const candSummed = (d.tasks || []).reduce((s, t) => s + (t.n_candidates || 0), 0)
  console.log(`raw/${f}`)
  console.log(`  ${LABEL[f] || 'run'}`)
  console.log(`  adjudicator      = ${d.adjudicator || '(n/a)'}`)
  console.log(`  candidate union  = ${candReported ?? candSummed}${candSummed && candReported && candSummed !== candReported ? `  (per-task sums to ${candSummed} — MISMATCH)` : ''}`)
  console.log(`  confirmed (deduped) = ${confirmed}`)
  console.log(`  pipeline agents  ~ ${d.agents_total ?? '(n/a)'}`)
  // sanity: every task in the run covers a known fixture artifact with the right planted count
  for (const t of (d.tasks || [])) {
    const fx = fixture.verify_tasks.find(x => x.id === t.task_id)
    if (!fx) { console.log(`  ! task ${t.task_id} not in fixture`); problems++; continue }
    if ((t.planted_defects || []).length !== fx.planted_defects.length) {
      console.log(`  ! task ${t.task_id} planted-count drift: run=${(t.planted_defects||[]).length} fixture=${fx.planted_defects.length}`); problems++
    }
  }
  console.log('')
}

console.log('Recall/precision (16/18, 18/18, 0.74, 0.63) are NOT computed here by design — they need the')
console.log('live 5-judge cross-model panel. Re-run it against the committed confirmed lists with your keys:')
console.log('  node eval/ultra/ultra-judge-panel-latest.mjs eval/ultra/raw/ultra-confirmed-latest.json   # latest models')
console.log('  node eval/ultra/ultra-judge-panel.mjs        eval/ultra/raw/ultra-confirmed.json          # prior peak')
console.log('')
console.log(problems ? `FAIL: ${problems} integrity problem(s) above` : 'OK: committed raw data is internally consistent with the fixture')
process.exit(problems ? 1 : 0)
