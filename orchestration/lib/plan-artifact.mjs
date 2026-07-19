// Durable, decision-only plan artifacts for explicitly triggered hard multi-part work.
// This module is inert until imported and writePlanArtifact() receives PLAN_TRIGGER.
// Progress, completion state, and verification debt belong in run-state ledger.jsonl.
// Zero dependencies: Node built-ins only.
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';

export const PLAN_TRIGGER = 'hard-multi-part';
export const PLAN_REQUIRED_SECTIONS = Object.freeze([
  'Outcome',
  'Scope',
  'Criteria',
  'Ordered dependencies',
  'Risky assumptions',
  'Non-goals',
]);

const PLAN_INPUT_KEYS = Object.freeze([
  'title',
  'outcome',
  'scope',
  'criteria',
  'orderedDependencies',
  'riskyAssumptions',
  'nonGoals',
]);
const PLAN_SCOPE_KEYS = Object.freeze(['in', 'out']);
const FORBIDDEN_STATE_HEADINGS = new Set([
  'progress',
  'status',
  'debt',
  'verification debt',
  'todo',
  'to-do',
  'completed',
  'completion log',
  'next steps',
]);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function assertPlainRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function assertExactKeys(value, keys, label) {
  assertPlainRecord(value, label);
  const allowed = new Set(keys);
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new TypeError(`${label} has unknown field(s): ${unknown.join(', ')}`);
  }
  const missing = keys.filter(key => !hasOwn(value, key));
  if (missing.length) {
    throw new TypeError(`${label} is missing required field(s): ${missing.join(', ')}`);
  }
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function nonEmptyStrings(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${label} must contain at least one entry`);
  }
  return Object.freeze(value.map((entry, index) => (
    nonEmptyString(entry, `${label}[${index}]`)
  )));
}

function normalizeHeading(value) {
  return value
    .replace(/\s+#+\s*$/, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function stripHtmlComments(markdown) {
  let cursor = 0;
  let stripped = '';
  while (cursor < markdown.length) {
    const opening = markdown.indexOf('<!--', cursor);
    const orphanClosing = markdown.indexOf('-->', cursor);
    if (orphanClosing !== -1 && (opening === -1 || orphanClosing < opening)) {
      throw new TypeError('plan lint failed: HTML comment closes without an opening marker');
    }
    if (opening === -1) {
      stripped += markdown.slice(cursor);
      break;
    }
    stripped += markdown.slice(cursor, opening);
    const closing = markdown.indexOf('-->', opening + 4);
    if (closing === -1) {
      throw new TypeError('plan lint failed: unterminated HTML comment');
    }
    const nested = markdown.indexOf('<!--', opening + 4);
    if (nested !== -1 && nested < closing) {
      throw new TypeError('plan lint failed: nested HTML comments are not allowed');
    }
    cursor = closing + 3;
  }
  return stripped;
}

function visibleLines(markdown) {
  const lines = stripHtmlComments(markdown).replace(/\r\n?/g, '\n').split('\n');
  const visible = [];
  let fence = null;
  for (const line of lines) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      const character = marker[1][0];
      if (fence === null) fence = character;
      else if (fence === character) fence = null;
      visible.push('');
      continue;
    }
    visible.push(fence === null ? line : '');
  }
  return visible;
}

function headingRecords(lines) {
  const records = [];
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^\s{0,3}(#{1,6})\s+(.+?)\s*$/);
    if (!match) continue;
    records.push(Object.freeze({
      level: match[1].length,
      name: normalizeHeading(match[2]),
      index,
    }));
  }
  return records;
}

function meaningfulContent(lines) {
  return lines.some((line) => {
    if (/^\s{0,3}#{1,6}\s+/.test(line)) return false;
    const withoutMarker = line
      .replace(/^\s*(?:[-+*]|\d+[.)])\s*/, '')
      .trim();
    return withoutMarker !== '';
  });
}

function sectionRange(h2Records, position, lineCount) {
  const start = h2Records[position].index + 1;
  const end = position + 1 < h2Records.length
    ? h2Records[position + 1].index
    : lineCount;
  return { start, end };
}

export function createPlanTemplate(title = 'Decision-complete plan') {
  const normalizedTitle = nonEmptyString(title, 'plan title');
  return [
    `# Plan: ${normalizedTitle}`,
    '',
    '<!-- Decision/criteria snapshot only. Progress and debt belong in the run ledger. -->',
    '',
    '## Outcome',
    '',
    '<!-- State the observable outcome this work must produce. -->',
    '',
    '## Scope',
    '',
    '### In',
    '',
    '<!-- List what is in scope. -->',
    '',
    '### Out',
    '',
    '<!-- List what is explicitly out of scope. -->',
    '',
    '## Criteria',
    '',
    '<!-- List acceptance criteria. Do not use progress checkboxes. -->',
    '',
    '## Ordered dependencies',
    '',
    '<!-- Number dependencies/steps in the order decisions require them. -->',
    '',
    '## Risky assumptions',
    '',
    '<!-- List assumptions whose failure would change the decision. -->',
    '',
    '## Non-goals',
    '',
    '<!-- List outcomes this plan deliberately does not pursue. -->',
    '',
  ].join('\n');
}

export function lintPlanArtifact(markdown) {
  const source = nonEmptyString(markdown, 'plan markdown');
  const lines = visibleLines(source);
  const headings = headingRecords(lines);
  const errors = [];

  const h1 = headings.filter(entry => entry.level === 1);
  if (h1.length !== 1 || !/^Plan:\s+\S/.test(h1[0]?.name || '')) {
    errors.push('plan must contain exactly one non-empty "# Plan: <title>" heading');
  }

  for (const heading of headings) {
    if (heading.level >= 2 && FORBIDDEN_STATE_HEADINGS.has(heading.name.toLowerCase())) {
      errors.push(`state heading "${heading.name}" is forbidden; progress/debt belong in the run ledger`);
    }
  }
  if (lines.some(line => /^\s*(?:[-+*]|\d+[.)])\s+\[[ xX]\]\s*/.test(line))) {
    errors.push('task-list checkboxes are forbidden; the plan is not a progress store');
  }

  const h2 = headings.filter(entry => entry.level === 2);
  const names = h2.map(entry => entry.name);
  for (const required of PLAN_REQUIRED_SECTIONS) {
    const count = names.filter(name => name === required).length;
    if (count === 0) errors.push(`missing required section "${required}"`);
    if (count > 1) errors.push(`required section "${required}" appears more than once`);
  }
  const unexpected = names.filter(name => !PLAN_REQUIRED_SECTIONS.includes(name));
  if (unexpected.length) {
    errors.push(`unexpected level-2 section(s): ${unexpected.join(', ')}`);
  }
  if (JSON.stringify(names) !== JSON.stringify(PLAN_REQUIRED_SECTIONS)) {
    errors.push(`required sections must appear once in order: ${PLAN_REQUIRED_SECTIONS.join(' → ')}`);
  }

  if (errors.length === 0) {
    for (let position = 0; position < h2.length; position++) {
      const section = h2[position];
      const { start, end } = sectionRange(h2, position, lines.length);
      const sectionLines = lines.slice(start, end);

      if (section.name === 'Scope') {
        const scopeHeadings = headings.filter(
          entry => entry.level === 3 && entry.index >= start && entry.index < end,
        );
        const scopeNames = scopeHeadings.map(entry => entry.name);
        if (JSON.stringify(scopeNames) !== JSON.stringify(['In', 'Out'])) {
          errors.push('Scope must contain exactly "### In" then "### Out"');
          continue;
        }
        for (let scopeIndex = 0; scopeIndex < scopeHeadings.length; scopeIndex++) {
          const scopeStart = scopeHeadings[scopeIndex].index + 1;
          const scopeEnd = scopeIndex + 1 < scopeHeadings.length
            ? scopeHeadings[scopeIndex + 1].index
            : end;
          if (!meaningfulContent(lines.slice(scopeStart, scopeEnd))) {
            errors.push(`Scope ${scopeHeadings[scopeIndex].name} must not be empty`);
          }
        }
        continue;
      }

      if (!meaningfulContent(sectionLines)) {
        errors.push(`section "${section.name}" must not be empty`);
      }
      if (section.name === 'Ordered dependencies'
        && !sectionLines.some(line => /^\s*\d+[.)]\s+\S/.test(line))) {
        errors.push('Ordered dependencies must contain at least one numbered entry');
      }
    }
  }

  if (errors.length) {
    throw new TypeError(`plan lint failed: ${errors.join('; ')}`);
  }

  return Object.freeze({
    title: h1[0].name.slice('Plan:'.length).trim(),
    sections: PLAN_REQUIRED_SECTIONS,
  });
}

/**
 * Extract the ordered acceptance-criteria source from a lint-valid plan.
 * Criteria must be one-line Markdown list entries. An optional `[criterion.id]`
 * prefix binds an entry to a specific run-contract criterion; otherwise order
 * is authoritative.
 */
export function extractPlanCriteria(markdown) {
  const source = nonEmptyString(markdown, 'plan markdown');
  lintPlanArtifact(source);
  const lines = visibleLines(source);
  const h2 = headingRecords(lines).filter(entry => entry.level === 2);
  const position = h2.findIndex(entry => entry.name === 'Criteria');
  const { start, end } = sectionRange(h2, position, lines.length);
  const criteria = [];

  for (const line of lines.slice(start, end)) {
    if (line.trim() === '') continue;
    const match = line.match(
      /^\s*(?:[-+*]|\d+[.)])\s+(?:\[([A-Za-z0-9][A-Za-z0-9._:-]*)\]\s+)?(.+?)\s*$/,
    );
    if (!match) {
      throw new TypeError(
        'plan criteria must be one-line Markdown list entries '
        + 'with optional [criterion.id] prefixes',
      );
    }
    criteria.push(Object.freeze({
      id: match[1] || null,
      description: nonEmptyString(match[2], 'plan criterion description'),
    }));
  }
  if (criteria.length === 0) {
    throw new TypeError('plan criteria must contain at least one list entry');
  }
  return Object.freeze(criteria);
}

export function renderPlanArtifact(input) {
  assertExactKeys(input, PLAN_INPUT_KEYS, 'plan input');
  assertExactKeys(input.scope, PLAN_SCOPE_KEYS, 'plan input.scope');
  const title = nonEmptyString(input.title, 'plan input.title');
  const outcome = nonEmptyString(input.outcome, 'plan input.outcome');
  const scopeIn = nonEmptyStrings(input.scope.in, 'plan input.scope.in');
  const scopeOut = nonEmptyStrings(input.scope.out, 'plan input.scope.out');
  const criteria = nonEmptyStrings(input.criteria, 'plan input.criteria');
  const orderedDependencies = nonEmptyStrings(
    input.orderedDependencies,
    'plan input.orderedDependencies',
  );
  const riskyAssumptions = nonEmptyStrings(
    input.riskyAssumptions,
    'plan input.riskyAssumptions',
  );
  const nonGoals = nonEmptyStrings(input.nonGoals, 'plan input.nonGoals');

  const bullets = entries => entries.map(entry => `- ${entry}`);
  const numbered = entries => entries.map((entry, index) => `${index + 1}. ${entry}`);
  const content = [
    `# Plan: ${title}`,
    '',
    '<!-- Decision/criteria snapshot only. Progress and debt belong in the run ledger. -->',
    '',
    '## Outcome',
    '',
    outcome,
    '',
    '## Scope',
    '',
    '### In',
    '',
    ...bullets(scopeIn),
    '',
    '### Out',
    '',
    ...bullets(scopeOut),
    '',
    '## Criteria',
    '',
    ...numbered(criteria),
    '',
    '## Ordered dependencies',
    '',
    ...numbered(orderedDependencies),
    '',
    '## Risky assumptions',
    '',
    ...bullets(riskyAssumptions),
    '',
    '## Non-goals',
    '',
    ...bullets(nonGoals),
    '',
  ].join('\n');
  lintPlanArtifact(content);
  return content;
}

export function hashPlanArtifact(markdown) {
  const content = typeof markdown === 'string' || Buffer.isBuffer(markdown)
    ? markdown
    : (() => { throw new TypeError('plan content must be a string or Buffer'); })();
  return createHash('sha256').update(content).digest('hex');
}

export function validatePlanSlug(slug) {
  const normalized = nonEmptyString(slug, 'plan slug');
  if (!SLUG_PATTERN.test(normalized)) {
    throw new TypeError('plan slug must be lowercase kebab-case');
  }
  return normalized;
}

export function inspectPlanArtifact(filePath) {
  const absolute = path.resolve(nonEmptyString(filePath, 'plan path'));
  const slug = path.basename(absolute, '.md');
  if (path.extname(absolute) !== '.md'
    || path.basename(path.dirname(absolute)) !== 'plans'
    || validatePlanSlug(slug) !== slug) {
    throw new TypeError('plan path must identify plans/<lowercase-kebab-slug>.md');
  }
  const plansMetadata = lstatSync(path.dirname(absolute));
  if (!plansMetadata.isDirectory() || plansMetadata.isSymbolicLink()) {
    throw new TypeError('plans directory must be a real directory, not a symbolic link');
  }
  const metadata = lstatSync(absolute);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new TypeError('plan path must identify a regular file');
  }
  const bytes = readFileSync(absolute);
  let content;
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new TypeError(`plan artifact must be valid UTF-8: ${error.message}`);
  }
  lintPlanArtifact(content);
  return Object.freeze({
    path: absolute,
    relativePath: `plans/${slug}.md`,
    sha256: hashPlanArtifact(bytes),
    content,
  });
}

function atomicCreate(filePath, content) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, 'wx', 0o600);
    writeFileSync(descriptor, content, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, filePath);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the original write/rename failure.
      }
    }
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

export function writePlanArtifact(projectRoot, slug, decisions, {
  trigger,
} = {}) {
  if (trigger !== PLAN_TRIGGER) {
    throw new Error(
      `plan writing requires the explicit "${PLAN_TRIGGER}" trigger; default flow is inert`,
    );
  }
  const normalizedSlug = validatePlanSlug(slug);
  const content = renderPlanArtifact(decisions);
  const root = path.resolve(nonEmptyString(projectRoot, 'project root'));
  const rootMetadata = lstatSync(root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new TypeError('project root must be a real directory');
  }
  const plansDirectory = path.join(root, 'plans');
  if (existsSync(plansDirectory)) {
    const plansMetadata = lstatSync(plansDirectory);
    if (!plansMetadata.isDirectory() || plansMetadata.isSymbolicLink()) {
      throw new TypeError('plans directory must be a real directory, not a symbolic link');
    }
  } else {
    mkdirSync(plansDirectory, { mode: 0o700 });
  }
  const filePath = path.join(plansDirectory, `${normalizedSlug}.md`);
  if (existsSync(filePath)) {
    throw new Error(`plan artifact already exists: ${filePath}`);
  }
  atomicCreate(filePath, content);
  return inspectPlanArtifact(filePath);
}

const directPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (directPath === fileURLToPath(import.meta.url)) {
  const [command, filePath] = process.argv.slice(2);
  if (command !== 'lint' || !filePath) {
    process.stderr.write('usage: node orchestration/lib/plan-artifact.mjs lint plans/<slug>.md\n');
    process.exitCode = 2;
  } else {
    try {
      const artifact = inspectPlanArtifact(filePath);
      process.stdout.write(`plan lint: PASS ${artifact.sha256} ${artifact.relativePath}\n`);
    } catch (error) {
      process.stderr.write(`plan lint: FAIL ${error.message}\n`);
      process.exitCode = 1;
    }
  }
}
