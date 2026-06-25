// codex/lib/markers.mjs — pure, dependency-free helpers for the marker-based Codex install.
//
// Everything fablever writes into a user's Codex files (AGENTS.md, AGENTS.override.md, config.toml) goes
// inside a clearly-delimited marker block, so install is idempotent and uninstall removes ONLY our block,
// never touching anything the user wrote around it. hooks.json is JSON, so it uses the entry helpers below
// (identified by exact command path / statusMessage prefix) rather than a text marker.
//
// Marker constants are the single source of truth — referenced by codex-install.mjs and the tests.
export const AGENTS_START = '<!-- fablever:codex:start -->';
export const AGENTS_END = '<!-- fablever:codex:end -->';
export const TOML_START = '# fablever:codex:mcp:start';
export const TOML_END = '# fablever:codex:mcp:end';
export const HOOK_STATUS_PREFIX = 'fablever:'; // every fablever hooks.json entry's statusMessage starts with this

export function hasBlock(content, start, end) {
  const c = String(content || '');
  return c.includes(start) && c.includes(end) && c.indexOf(start) < c.indexOf(end);
}

// Insert `block` between start/end markers, or replace it if the markers already exist. Idempotent: running
// twice yields the same file. `block` is the full payload INCLUDING the markers (so AGENTS.fable.md, which
// already carries its own start/end lines, is passed verbatim).
export function upsertBlock(content, start, end, block) {
  const c = String(content || '');
  const trimmedBlock = String(block).replace(/^\n+|\n+$/g, '');
  if (hasBlock(c, start, end)) {
    const head = c.slice(0, c.indexOf(start));
    const tail = c.slice(c.indexOf(end) + end.length);
    return head + trimmedBlock + tail;
  }
  const base = c.replace(/\s*$/, '');
  return (base ? base + '\n\n' : '') + trimmedBlock + '\n';
}

// Remove the marker block (inclusive). Collapses the blank lines left behind so we don't accumulate gaps on
// repeated install/uninstall cycles. Returns the original string if no block is present.
export function removeBlock(content, start, end) {
  const c = String(content || '');
  if (!hasBlock(c, start, end)) return c;
  const head = c.slice(0, c.indexOf(start)).replace(/\n+$/, '');
  const tail = c.slice(c.indexOf(end) + end.length).replace(/^\n+/, '');
  if (!head) return tail.replace(/^\n+/, '');
  if (!tail) return head + '\n';
  return head + '\n\n' + tail;
}

// Remove any TOML table whose header is `[prefix]` or `[prefix.sub]` (header line through the line before the
// next table header / EOF). Used ONLY on --force-codex-mcp to clear a pre-existing [mcp_servers.fable-profile]
// table before re-inserting our marker block, so the result never has two same-named tables. Dependency-free
// and deliberately narrow: it keys off table HEADER lines, not arbitrary TOML parsing.
export function stripTomlTable(text, prefix) {
  const headerRe = /^\s*\[([^\]]+)\]/;
  const matches = name => name === prefix || name.startsWith(prefix + '.');
  let skipping = false;
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const m = line.match(headerRe);
    if (m) { skipping = matches(m[1].trim()); if (skipping) continue; }
    if (skipping) continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

// ---- hooks.json (JSON) entry helpers -------------------------------------------------------------------
// Codex hooks.json shape: { hooks: { SessionStart: [ { matcher?, hooks: [ { type, command, ... } ] } ] } }.
// We add our entry under the event and identify it later by the statusMessage prefix or the absolute hook
// command path, so uninstall removes only fablever entries.

export function isFableEntry(entry, hookDir) {
  if (!entry || !Array.isArray(entry.hooks)) return false;
  return entry.hooks.some(h => {
    const sm = typeof h.statusMessage === 'string' && h.statusMessage.startsWith(HOOK_STATUS_PREFIX);
    const cmd = typeof h.command === 'string' && hookDir && h.command.includes(hookDir);
    return sm || cmd;
  });
}

// Add a fablever entry to hooks.hooks[event] if an equivalent one is not already present (idempotent by the
// absolute command string). Mutates and returns the hooks object.
export function addHookEntry(hooksObj, event, entry) {
  const root = hooksObj && typeof hooksObj === 'object' ? hooksObj : {};
  root.hooks = root.hooks || {};
  const arr = Array.isArray(root.hooks[event]) ? root.hooks[event] : [];
  const cmds = new Set(arr.flatMap(e => (e.hooks || []).map(h => h.command)));
  const newCmds = (entry.hooks || []).map(h => h.command);
  if (!newCmds.every(c => cmds.has(c))) arr.push(entry);
  root.hooks[event] = arr;
  return root;
}

// Remove every fablever entry (matched by hookDir/statusMessage) from all events; prune empty arrays and an
// empty hooks object. Mutates and returns the hooks object.
export function removeFableEntries(hooksObj, hookDir) {
  if (!hooksObj || typeof hooksObj !== 'object' || !hooksObj.hooks) return hooksObj || {};
  for (const event of Object.keys(hooksObj.hooks)) {
    if (!Array.isArray(hooksObj.hooks[event])) continue;
    hooksObj.hooks[event] = hooksObj.hooks[event].filter(e => !isFableEntry(e, hookDir));
    if (hooksObj.hooks[event].length === 0) delete hooksObj.hooks[event];
  }
  if (Object.keys(hooksObj.hooks).length === 0) delete hooksObj.hooks;
  return hooksObj;
}
