#!/usr/bin/env node
// eval/codex-native-ab/cost-report.mjs — replay recorded runner metadata into a per-arm cost report.
//
//   node cost-report.mjs [--out=<recorded-run-dir>]
//
// Reads only archived *.meta.json files. It never launches Codex or re-runs a fixture. Missing cost fields
// are fatal so a report cannot silently label an older/incomplete archive as complete. Zero dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const compareText = (a, b) => a < b ? -1 : (a > b ? 1 : 0);

function regularFiles(root, base = root, out = []) {
  const entries = fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => compareText(a.name, b.name));
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) regularFiles(absolute, base, out);
    else if (entry.isFile()) out.push({ absolute, relative: path.relative(base, absolute).split(path.sep).join('/') });
  }
  return out;
}

// Stable across directory enumeration order, mtimes, and platforms. Each file's raw bytes are hashed first;
// the directory digest then binds those content hashes to normalized relative paths in sorted order.
export function fixtureSha256(fixtureDir) {
  const entries = regularFiles(fixtureDir)
    .sort((a, b) => compareText(a.relative, b.relative))
    .map(file => ({
      path: file.relative,
      sha256: createHash('sha256').update(fs.readFileSync(file.absolute)).digest('hex'),
    }));
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}

function archiveFiles(root, base = root, out = { meta: [], raw: [] }) {
  const entries = fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => compareText(a.name, b.name));
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) archiveFiles(absolute, base, out);
    else if (entry.isFile() && entry.name.endsWith('.meta.json')) out.meta.push({ absolute, key: path.relative(base, absolute).split(path.sep).join('/').slice(0, -'.meta.json'.length) });
    else if (entry.isFile() && entry.name.endsWith('.raw.jsonl')) out.raw.push({ absolute, key: path.relative(base, absolute).split(path.sep).join('/').slice(0, -'.raw.jsonl'.length) });
  }
  return out;
}

function tokenTotal(meta, file) {
  const usage = meta && meta.usage;
  if (usage && Number.isFinite(usage.total) && usage.total >= 0) return usage.total;
  if (usage && Number.isFinite(usage.input) && usage.input >= 0 && Number.isFinite(usage.output) && usage.output >= 0) return usage.input + usage.output;
  throw new Error(`${file}: missing complete token usage (usage.total or usage.input + usage.output)`);
}

export function buildCostReport(outDir) {
  const rows = new Map();
  let stat;
  try { stat = fs.statSync(outDir); } catch { throw new Error(`${outDir}: archive directory not found`); }
  if (!stat.isDirectory()) throw new Error(`${outDir}: archive path is not a directory`);
  const archive = archiveFiles(outDir);
  if (!archive.meta.length && !archive.raw.length) throw new Error(`${outDir}: no recorded run artifacts found`);
  const metaKeys = new Set(archive.meta.map(file => file.key));
  const rawKeys = new Set(archive.raw.map(file => file.key));
  const missingMeta = [...rawKeys].filter(key => !metaKeys.has(key)).sort(compareText);
  const missingRaw = [...metaKeys].filter(key => !rawKeys.has(key)).sort(compareText);
  if (missingMeta.length) throw new Error(`${outDir}: raw run(s) missing metadata: ${missingMeta.join(', ')}`);
  if (missingRaw.length) throw new Error(`${outDir}: metadata run(s) missing raw event stream: ${missingRaw.join(', ')}`);
  for (const { absolute: file } of archive.meta) {
    let meta;
    try { meta = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { throw new Error(`${file}: invalid JSON (${error.message})`); }
    if (!meta || typeof meta.arm !== 'string' || !meta.arm) throw new Error(`${file}: missing arm`);
    if (!Number.isFinite(meta.wall_clock_ms) || meta.wall_clock_ms < 0) throw new Error(`${file}: missing wall_clock_ms`);
    if (typeof meta.fixture_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(meta.fixture_sha256)) throw new Error(`${file}: missing fixture_sha256`);

    if (!rows.has(meta.arm)) rows.set(meta.arm, { tokens: 0, wall_clock_ms: 0, hashes: new Set(), runs: 0 });
    const row = rows.get(meta.arm);
    row.tokens += tokenTotal(meta, file);
    row.wall_clock_ms += meta.wall_clock_ms;
    row.hashes.add(meta.fixture_sha256);
    row.runs++;
  }

  const perArm = {};
  for (const arm of [...rows.keys()].sort()) {
    const row = rows.get(arm);
    const hashes = [...row.hashes].sort();
    perArm[arm] = {
      tokens: row.tokens,
      wall_clock_ms: row.wall_clock_ms,
      // A normal single-fixture replay gets the requested scalar; multi-fixture campaigns retain every hash.
      fixture_sha256: hashes.length === 1 ? hashes[0] : hashes,
      runs: row.runs,
    };
  }
  return { complete: true, total_runs: archive.meta.length, perArm };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const outArg = args.find(arg => arg.startsWith('--out='));
  const outDir = outArg ? path.resolve(outArg.slice('--out='.length)) : path.join(DIR, 'out');
  try { process.stdout.write(JSON.stringify(buildCostReport(outDir), null, 2) + '\n'); }
  catch (error) { process.stderr.write(`cost-report: ${error.message}\n`); process.exit(1); }
}
