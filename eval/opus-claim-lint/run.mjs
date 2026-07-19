#!/usr/bin/env node
// heuristic tripwire; pair with fresh review. This narrow regex lint catches common prohibited claim
// phrasings; it is not an omniscient semantic or citation verifier and does not catch every dishonest claim.
// Stage 1 currently has zero published rebaseline rows, so the exact-reference allowlist below is empty.
//
// Usage: node eval/opus-claim-lint/run.mjs [paths...]
// With no paths, scans README*.md, EVIDENCE*.md, EVALS.md, and docs/**/*.md in this repository.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, '..', '..');
const RULE_OPUS = 'opus-magnitude-without-rebaseline';
const RULE_PARALLEL = 'parallel-beats-solo-without-controlled-ab';

// Add only exact, committed Stage 1 row references here (for example,
// "eval/opus-rebaseline/RESULTS.md#style-only-row") after those rows actually exist.
// Generic prose such as "rebaseline row" must never bypass the tripwire.
const VALID_REBASELINE_ROW_REFS = Object.freeze([]);
const VALID_CONTROLLED_AB_REFS = Object.freeze([
  'eval/results-2026-06-15.md',
  'eval/results-2026-06-15-hard.md',
  'whitepaper/03-results.md',
]);

const OPUS = String.raw`\bOpus\b`;
const MAGNITUDE = String.raw`(?:[+−-]\s*)?\d+(?:\.\d+)?\s*(?:%|percent(?:age)?(?:\s+points?)?|points?|pts?\.?|[x×]|[- ]?fold|배|퍼센트|포인트)`;
const EFFECT = String.raw`(?:gain(?:s|ed|ing)?|improv(?:e|es|ed|ing|ement|ements)|boost(?:s|ed|ing)?|lift(?:s|ed|ing)?|increase(?:s|d|ing)?|raise(?:s|d|ing)?|rise(?:s|n|ing)?|rose|jump(?:s|ed|ing)?|outperform(?:s|ed|ing)?|better|higher|개선|향상|상승|증가)`;
const OPUS_MAGNITUDE_PATTERNS = [
  new RegExp(`${OPUS}.{0,100}${EFFECT}.{0,80}${MAGNITUDE}`, 'iu'),
  new RegExp(`${EFFECT}.{0,80}${OPUS}.{0,100}${MAGNITUDE}`, 'iu'),
  new RegExp(`${OPUS}.{0,80}${MAGNITUDE}.{0,50}(?:better|higher|gain|improv(?:ement|ed)?|lift|increase|개선|향상)`, 'iu'),
  new RegExp(`${MAGNITUDE}.{0,50}${EFFECT}.{0,80}(?:on|for|with)\\s+${OPUS}`, 'iu'),
  new RegExp(`(?:on|for|with)\\s+${OPUS}.{0,60}\\+\\s*\\d+(?:\\.\\d+)?\\s*(?:points?|pts?\\.?|포인트)`, 'iu'),
];

const PARALLEL = String.raw`(?:parallel(?:\s+(?:agents?|reviewers?|workers?|teams?|orchestration|panels?))?|panels?|multi[- ]agent(?:\s+(?:teams?|systems?|orchestration))?)`;
const SOLO = String.raw`(?:solo(?:\s+(?:agents?|reviewers?|passes?|runs?))?|single[- ]agent(?:\s+(?:baselines?|controls?|passes?|reviewers?))?|single\s+(?:strong\s+)?agents?|single\s+(?:baselines?|controls?)|one\s+agent)`;
const SUPERIOR = String.raw`(?:beats?|outperforms?|(?:does|performs?)\s+better\s+than|(?:is|are)\s+(?:materially\s+|significantly\s+)?better\s+than|(?:is|are)\s+superior\s+to|wins?\s+(?:against|over))`;
const INFERIOR = String.raw`(?:loses?\s+to|underperforms?|is\s+worse\s+than|falls?\s+short\s+of)`;
const PARALLEL_PATTERNS = [
  new RegExp(`${PARALLEL}.{0,100}${SUPERIOR}.{0,100}${SOLO}`, 'iu'),
  new RegExp(`${SOLO}.{0,100}${INFERIOR}.{0,100}${PARALLEL}`, 'iu'),
  /(?:병렬(?:\s*(?:에이전트|패널|오케스트레이션))?|패널).{0,80}(?:단일\s*(?:에이전트|패스|기준선)).{0,40}(?:이긴|능가|우월|더\s*낫)/u,
];

const NEGATED_OR_REFUTING = /(?:^\W*not\b)|\b(?:do\s+not|does\s+not|did\s+not|never|cannot|can't|doesn't|didn't|fails?\s+to|unverified|unproven|prohibited|forbidden|refutes?|rejects?|without\s+evidence|no\s+evidence|(?:is|are|was|were)\s+not|no\s+(?:gain|improvement|boost|lift|increase)|not\s+(?:better|higher|superior))\b|(?:아님|아니다|않|못|반증|금지|검증되지|주장하지|인용\s*없는|인용\s*없이)/iu;

function defaultInputs() {
  // CHANGELOG is the natural habitat for a release-note magnitude claim (charter #1: no unmeasured Opus
  // magnitude ANYWHERE in the repo), so scan it alongside README/EVIDENCE/EVALS and docs/**.
  const rootDocs = readdirSync(REPO)
    .filter(name => /^(?:README|EVIDENCE|CHANGELOG).*\.md$/iu.test(name) || /^EVALS\.md$/iu.test(name))
    .map(name => path.join(REPO, name));
  return [...rootDocs, path.join(REPO, 'docs')];
}

function collectMarkdown(input, files, errors) {
  const absolute = path.resolve(input);
  if (!existsSync(absolute)) {
    errors.push(`path does not exist: ${input}`);
    return;
  }

  const stat = statSync(absolute);
  if (stat.isFile()) {
    if (/\.md$/iu.test(absolute)) files.add(absolute);
    return;
  }
  if (!stat.isDirectory()) return;

  for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      // Skip internal planning docs (docs/proposals/*) during auto-discovery: they are excluded from the
      // npm package and must be free to DESCRIBE the forbidden claim patterns (e.g. the upgrade ledger's own
      // goal text names "Opus magnitude" and "parallel beats solo"). An explicit path arg still scans them.
      if (entry.name === 'proposals' && path.basename(absolute) === 'docs') continue;
      collectMarkdown(path.join(absolute, entry.name), files, errors);
    } else if (entry.isFile() && /\.md$/iu.test(entry.name)) files.add(path.join(absolute, entry.name));
  }
}

function visibleLines(text) {
  let fence = null;
  return text.split(/\r?\n/u).map(line => {
    const marker = line.match(/^\s*(```+|~~~+)/u)?.[1]?.[0] || null;
    if (marker) {
      fence = fence === marker ? null : (fence || marker);
      return '';
    }
    return fence ? '' : line;
  });
}

function normalizeCandidate(text) {
  let normalized = text.replace(/`[^`\n]*`/gu, ' ');
  return normalized
    .replace(/[*_]{1,2}/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function nearbyPrefix(text, matchIndex, limit = 80) {
  let prefix = text.slice(Math.max(0, matchIndex - limit), matchIndex);
  const boundary = Math.max(
    prefix.lastIndexOf('.'),
    prefix.lastIndexOf('!'),
    prefix.lastIndexOf('?'),
    prefix.lastIndexOf(';'),
  );
  if (boundary >= 0) prefix = prefix.slice(boundary + 1);
  return prefix;
}

function matchIsInsideQuestion(text, matchEnd, limit = 120) {
  const suffix = text.slice(matchEnd, matchEnd + limit);
  const punctuation = suffix.match(/(?<!\d)[.!?](?!\d)/u)?.[0] || '';
  return punctuation === '?';
}

function hasUnnegatedPatternMatch(text, patterns) {
  for (const pattern of patterns) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const globalPattern = new RegExp(pattern.source, flags);
    for (const match of text.matchAll(globalPattern)) {
      if (matchIsInsideQuestion(text, match.index + match[0].length)) continue;
      const localClaim = `${nearbyPrefix(text, match.index)}${match[0]}`;
      if (!NEGATED_OR_REFUTING.test(localClaim)) return true;
    }
  }
  return false;
}

function candidatesAt(lines, index) {
  const line = lines[index];
  if (!line.trim()) return [];

  const candidates = [line];
  if (!/^\s*(?:#{1,6}\s|\|)/u.test(line)) {
    let joined = line;
    for (let next = index + 1; next < Math.min(lines.length, index + 3); next++) {
      if (!lines[next].trim() || /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\|)/u.test(lines[next])) break;
      joined += ` ${lines[next].trim()}`;
    }
    if (joined !== line) candidates.push(joined);
  }
  return candidates;
}

function nearbyContext(lines, index, radius = 6) {
  return lines.slice(Math.max(0, index - radius), Math.min(lines.length, index + radius + 1)).join('\n');
}

function footnoteDefinitions(lines) {
  const definitions = new Map();
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^\s*\[\^([^\]]+)\]:\s*(.*)$/u);
    if (!match) continue;
    let definition = match[2];
    for (let next = index + 1; next < lines.length && /^\s{2,}\S/u.test(lines[next]); next++) {
      definition += ` ${lines[next].trim()}`;
    }
    definitions.set(match[1], definition);
  }
  return definitions;
}

function hasValidRebaselineRowReference(context) {
  return VALID_REBASELINE_ROW_REFS.some(reference => context.includes(reference));
}

function containsValidControlledAbReference(text) {
  return VALID_CONTROLLED_AB_REFS.some(reference => (
    text.includes(reference) && existsSync(path.join(REPO, reference))
  ));
}

function hasControlledAbCitation(context, claimText, footnotes) {
  if (containsValidControlledAbReference(context)) return true;
  for (const match of claimText.matchAll(/\[\^([^\]]+)\]/gu)) {
    const definition = footnotes.get(match[1]) || '';
    if (containsValidControlledAbReference(definition)) return true;
  }
  return false;
}

function isOpusMagnitudeClaim(text) {
  return hasUnnegatedPatternMatch(text, OPUS_MAGNITUDE_PATTERNS);
}

function isParallelBeatsSoloClaim(text) {
  return hasUnnegatedPatternMatch(text, PARALLEL_PATTERNS);
}

function lintFile(file) {
  const lines = visibleLines(readFileSync(file, 'utf8'));
  const footnotes = footnoteDefinitions(lines);
  const violations = [];
  const seen = new Set();

  for (let index = 0; index < lines.length; index++) {
    const context = nearbyContext(lines, index);
    for (const rawCandidate of candidatesAt(lines, index)) {
      const opusCandidate = normalizeCandidate(rawCandidate);
      const parallelCandidate = normalizeCandidate(rawCandidate);
      if (!opusCandidate && !parallelCandidate) continue;

      if (isOpusMagnitudeClaim(opusCandidate) && !hasValidRebaselineRowReference(context)) {
        const key = `${RULE_OPUS}:${index + 1}`;
        if (!seen.has(key)) violations.push({ rule: RULE_OPUS, line: index + 1, text: opusCandidate });
        seen.add(key);
      }

      if (
        isParallelBeatsSoloClaim(parallelCandidate)
        && !hasControlledAbCitation(context, rawCandidate, footnotes)
      ) {
        const key = `${RULE_PARALLEL}:${index + 1}`;
        if (!seen.has(key)) violations.push({ rule: RULE_PARALLEL, line: index + 1, text: parallelCandidate });
        seen.add(key);
      }
    }
  }
  return violations;
}

function displayPath(file) {
  const relative = path.relative(REPO, file);
  return relative && !relative.startsWith('..') ? relative : file;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node eval/opus-claim-lint/run.mjs [paths...]');
    console.log('heuristic tripwire; pair with fresh review.');
    return 0;
  }

  const inputs = args.length ? args : defaultInputs();
  const files = new Set();
  const errors = [];
  for (const input of inputs) collectMarkdown(input, files, errors);

  if (errors.length || files.size === 0) {
    for (const error of errors) console.error(`opus-claim lint: ${error}`);
    if (files.size === 0) console.error('opus-claim lint: no markdown files found');
    return 2;
  }

  const violations = [];
  for (const file of [...files].sort()) {
    for (const violation of lintFile(file)) violations.push({ file, ...violation });
  }

  if (violations.length) {
    console.error(`opus-claim lint failed: ${violations.length} violation(s)`);
    for (const violation of violations) {
      const excerpt = violation.text.length > 180 ? `${violation.text.slice(0, 177)}...` : violation.text;
      console.error(`${displayPath(violation.file)}:${violation.line}: ${violation.rule}: ${excerpt}`);
    }
    console.error('heuristic tripwire; pair with fresh review.');
    return 1;
  }

  console.log(`opus-claim lint passed (${files.size} markdown files; heuristic tripwire; pair with fresh review)`);
  return 0;
}

process.exitCode = main();
