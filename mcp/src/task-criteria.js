'use strict';

// Optional, passive task-criteria capture shared by fable-plan and fable_check.
// Nothing invokes the clarify gate from this module; callers must opt in explicitly.

const TASK_CRITERIA_SCHEMA_VERSION = 1;
const TASK_CRITERIA_START = '<!-- fable-task-criteria:v1 -->';
const TASK_CRITERIA_END = '<!-- /fable-task-criteria -->';
const CRITERION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const CRITERION_LINE_PATTERN = /^\s*-\s+\[([A-Za-z0-9][A-Za-z0-9._:-]*)\]\s+(.+?)\s*$/;

function occurrences(text, needle) {
  let count = 0;
  let offset = 0;
  while ((offset = text.indexOf(needle, offset)) !== -1) {
    count++;
    offset += needle.length;
  }
  return count;
}

function normalizeCriteria(input, label = 'task criteria') {
  if (!Array.isArray(input) || input.length === 0) {
    throw new TypeError(`${label} must contain at least one criterion`);
  }

  const seen = new Set();
  const criteria = input.map((entry, index) => {
    const entryLabel = `${label}[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError(`${entryLabel} must be an object`);
    }
    const keys = Object.keys(entry);
    if (keys.length !== 2 || !keys.includes('id') || !keys.includes('description')) {
      throw new TypeError(`${entryLabel} must contain only id and description`);
    }

    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!CRITERION_ID_PATTERN.test(id)) {
      throw new TypeError(
        `${entryLabel}.id must start with an alphanumeric character and contain only `
        + 'letters, numbers, ".", "_", ":", or "-"',
      );
    }
    if (seen.has(id)) throw new TypeError(`duplicate task criterion id "${id}"`);
    seen.add(id);

    const description = typeof entry.description === 'string'
      ? entry.description.trim()
      : '';
    if (!description || /[\r\n]/.test(description)) {
      throw new TypeError(`${entryLabel}.description must be one non-empty line`);
    }
    if (description.includes(TASK_CRITERIA_START)
      || description.includes(TASK_CRITERIA_END)) {
      throw new TypeError(`${entryLabel}.description cannot contain block markers`);
    }
    return Object.freeze({ id, description });
  });

  return Object.freeze(criteria);
}

function renderTaskCriteriaBlock(criteria) {
  const normalized = normalizeCriteria(criteria);
  return [
    TASK_CRITERIA_START,
    ...normalized.map(entry => `- [${entry.id}] ${entry.description}`),
    TASK_CRITERIA_END,
    '',
  ].join('\n');
}

function parseTaskCriteriaBlock(input) {
  if (typeof input !== 'string') {
    throw new TypeError('task criteria block must be a string');
  }
  if (occurrences(input, TASK_CRITERIA_START) !== 1
    || occurrences(input, TASK_CRITERIA_END) !== 1) {
    throw new TypeError('task criteria block must contain exactly one start and end marker');
  }

  const start = input.indexOf(TASK_CRITERIA_START);
  const bodyStart = start + TASK_CRITERIA_START.length;
  const end = input.indexOf(TASK_CRITERIA_END, bodyStart);
  if (end < bodyStart) {
    throw new TypeError('task criteria block end marker must follow its start marker');
  }

  const criteria = [];
  for (const rawLine of input.slice(bodyStart, end).split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const match = CRITERION_LINE_PATTERN.exec(rawLine);
    if (!match) {
      throw new TypeError(`malformed task criterion line "${rawLine.trim()}"`);
    }
    criteria.push({ id: match[1], description: match[2] });
  }

  return Object.freeze({
    schemaVersion: TASK_CRITERIA_SCHEMA_VERSION,
    criteria: normalizeCriteria(criteria),
  });
}

function shouldCaptureTaskCriteria(context = {}) {
  const input = context && typeof context === 'object' ? context : {};
  return input.genuinelyAmbiguous === true
    && input.expensiveToReverse === true;
}

module.exports = Object.freeze({
  TASK_CRITERIA_SCHEMA_VERSION,
  TASK_CRITERIA_START,
  TASK_CRITERIA_END,
  parseTaskCriteriaBlock,
  renderTaskCriteriaBlock,
  shouldCaptureTaskCriteria,
});
