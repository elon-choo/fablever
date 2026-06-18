// fablever update-check — detect when the installed clone is behind the public GitHub repo.
//
// ZERO credentials, ZERO data sent: it runs an anonymous `git ls-remote <repo> HEAD` (which reads only
// the latest public commit hash) and compares it to the sha recorded at install time. Rate-limited to
// once per 24h via a state file, so it costs at most one tiny network round-trip per day. No API keys,
// no generation, no analytics, nothing about your code leaves the machine. Disable the whole feature
// with FABLE_UPDATE_CHECK=off (or per-install with `node install.mjs --no-update-check`).
//
// CLI:
//   node update-check.mjs check [--force]   # daily-gated remote check; writes state; prints result
//   node update-check.mjs status            # show installed sha, last check, whether an update is waiting
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DIR = path.join(os.homedir(), '.claude', 'fable-profile');
const VERSION_FILE = path.join(DIR, 'installed-version.json'); // { sha, repo_url, source_dir, installed_at }
const STATE = path.join(DIR, 'update-check.json');             // { last_checked, installed_sha, remote_sha, update_available }
const DAY_MS = 24 * 60 * 60 * 1000;

const readJSON = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };
const writeJSON = (p, o) => { try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n'); } catch { /* fail-open */ } };

// pure: extract the 40-hex HEAD sha from `git ls-remote` output. Exported for offline testing.
export function parseHead(stdout) {
  const m = String(stdout || '').match(/^([0-9a-f]{40})\b/m);
  return m ? m[1] : '';
}

// anonymous remote HEAD sha (no auth, no data sent). Returns '' on any failure (offline, no git, etc.).
export function remoteHead(repoUrl) {
  if (!repoUrl) return '';
  try {
    const r = spawnSync('git', ['ls-remote', repoUrl, 'HEAD'], { encoding: 'utf8', timeout: 12000, stdio: ['ignore', 'pipe', 'ignore'] });
    if (r.status !== 0) return '';
    return parseHead(r.stdout);
  } catch { return ''; }
}

export function check({ force = false } = {}) {
  const ver = readJSON(VERSION_FILE, null);
  if (!ver || !ver.repo_url || !ver.sha) return { ok: false, reason: 'no installed-version record (sha/repo_url missing)' };
  const prev = readJSON(STATE, { last_checked: 0 });
  const now = Date.now();
  if (!force && prev.last_checked && (now - prev.last_checked) < DAY_MS) {
    return { ok: true, skipped: true, reason: 'checked within 24h', ...prev };
  }
  const remote = remoteHead(ver.repo_url);
  if (!remote) { // network/git failure -> record the attempt time, never falsely claim an update
    const state = { last_checked: now, installed_sha: ver.sha, remote_sha: prev.remote_sha || '', update_available: !!prev.update_available };
    writeJSON(STATE, state);
    return { ok: true, network: false, ...state };
  }
  const state = { last_checked: now, installed_sha: ver.sha, remote_sha: remote, update_available: remote !== ver.sha };
  writeJSON(STATE, state);
  return { ok: true, network: true, ...state };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] || 'status';
  if (cmd === 'check') console.log(JSON.stringify(check({ force: process.argv.includes('--force') }), null, 2));
  else if (cmd === 'status') console.log(JSON.stringify({ installed: readJSON(VERSION_FILE, null), state: readJSON(STATE, {}) }, null, 2));
  else console.log('usage: check [--force] | status');
}
