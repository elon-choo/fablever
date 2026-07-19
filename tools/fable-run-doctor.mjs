#!/usr/bin/env node
// Opt-in sibling to fable-doctor.mjs for one active run directory.
// Read-only: reports contract/ledger/receipt facts and never repairs them.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  diagnoseActiveRun,
  validateRunDoctorReport,
} from '../orchestration/lib/run-doctor.mjs';

export function formatActiveRunDoctorReport(input) {
  const report = validateRunDoctorReport(input);
  const lines = [
    `fablever active-run doctor — ${report.status}`,
    `Run: ${report.runDirectory}`,
    `Authority: ${report.source}`,
    `Summary: ${report.summary}`,
  ];
  if (report.selectedCriterion) {
    lines.push(
      `Selected criterion: ${report.selectedCriterion.id} — ${report.selectedCriterion.description}`,
    );
  }
  if (report.diagnostics.length === 0) {
    lines.push('Diagnostics: none');
  } else {
    lines.push('Diagnostics:');
    report.diagnostics.forEach((finding, index) => {
      lines.push(`  ${index + 1}. invariant: ${finding.invariant}`);
      lines.push(
        `     criterion: ${finding.criterionId || finding.criterionIds.join(', ') || finding.criterionUnavailableReason}`,
      );
      if (finding.receiptId) lines.push(`     receipt: ${finding.receiptId}`);
      if (finding.checkId) lines.push(`     check: ${finding.checkId}`);
      if (finding.eventType) {
        lines.push(
          `     event: ${finding.eventType} sequence ${finding.eventSequence} line ${finding.line || finding.eventSequence}`,
        );
      }
      lines.push(`     file: ${finding.responsibleFile}`);
      lines.push(`     fact: ${finding.observed}`);
      lines.push(`     safe next action: ${finding.safeNextAction}`);
    });
  }
  lines.push('Report-only: no plan, contract, ledger, state, receipt, target, or artifact was changed.');
  return `${lines.join('\n')}\n`;
}

export function runActiveRunDoctorCli(argv = process.argv.slice(2), {
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const json = argv.includes('--json');
  const positional = argv.filter(argument => !argument.startsWith('-'));
  if (positional.length !== 1) {
    stderr.write('Usage: node tools/fable-run-doctor.mjs <run-directory> [--json]\n');
    return 2;
  }
  try {
    const report = diagnoseActiveRun(positional[0]);
    stdout.write(
      json
        ? `${JSON.stringify(report, null, 2)}\n`
        : formatActiveRunDoctorReport(report),
    );
    return 0;
  } catch (error) {
    stderr.write(`fablever active-run doctor failed: ${error.message}\n`);
    return 2;
  }
}

const IS_MAIN = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) process.exitCode = runActiveRunDoctorCli();
