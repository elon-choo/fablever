// eval/codex-native-ab/lib/codex-events.mjs — parse the `codex exec --json` JSONL event stream.
//
// Codex streams JSONL events: thread.started, turn.started, turn.completed, turn.failed, item.*, error.
// item.* carries agent messages, reasoning, command executions, file changes, MCP tool calls, web searches,
// and plan updates. The exact item field names are not a documented stable interface, so this parser is
// DEFENSIVE: it classifies by substring on the `type` string and searches nested objects for usage/exit
// metadata, and it is fail-open (an unparseable or unknown line is preserved/ignored, never throws). Counts
// are therefore labelled "observed via the event stream" — they may not capture every execution path.
// Zero dependencies.

const has = (s, re) => re.test(String(s || ''));

// find the first object anywhere in `node` that has token-usage-looking keys
function findUsage(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  const keys = Object.keys(node);
  if (keys.some(k => /input_tokens|prompt_tokens/i.test(k)) || keys.some(k => /output_tokens|completion_tokens/i.test(k))) {
    const num = re => { for (const k of keys) if (re.test(k) && typeof node[k] === 'number') return node[k]; return null; };
    return { input: num(/input_tokens|prompt_tokens/i), output: num(/output_tokens|completion_tokens/i), cached: num(/cache/i), total: num(/total_tokens/i) };
  }
  for (const k of keys) { const u = findUsage(node[k], depth + 1); if (u) return u; }
  return null;
}

function itemFailed(node) {
  // exit_code !== 0, or an explicit failure flag, anywhere shallow in the item
  const stack = [node]; let d = 0;
  while (stack.length && d < 200) {
    const n = stack.shift(); d++;
    if (!n || typeof n !== 'object') continue;
    if (typeof n.exit_code === 'number' && n.exit_code !== 0) return true;
    if (n.success === false || n.status === 'error' || n.status === 'failed') return true;
    for (const v of Object.values(n)) if (v && typeof v === 'object') stack.push(v);
  }
  return false;
}

export function parseEvents(jsonl) {
  const counts = { commands: 0, command_failures: 0, file_changes: 0, mcp_calls: 0, web_searches: 0, messages: 0, reasoning: 0, plan_updates: 0 };
  let usage = null, failed = false, lastMessageText = '', turns = 0, lines = 0, unparsed = 0;
  for (const line of String(jsonl || '').split('\n')) {
    if (!line.trim()) continue;
    lines++;
    let ev; try { ev = JSON.parse(line); } catch { unparsed++; continue; }
    const type = String(ev.type || ev.event || '');
    if (type === 'turn.failed' || type === 'error') failed = true;
    if (type === 'turn.completed') { turns++; const u = findUsage(ev); if (u) usage = u; }
    if (has(type, /^item\b|item\./i) || ev.item) {
      const item = ev.item || ev;
      const itype = String(item.type || item.item_type || type);
      if (has(itype, /command|exec|shell/i)) { counts.commands++; if (itemFailed(item)) counts.command_failures++; }
      else if (has(itype, /file|patch|change|edit|write/i)) counts.file_changes++;
      else if (has(itype, /mcp/i)) counts.mcp_calls++;
      else if (has(itype, /web.?search|search/i)) counts.web_searches++;
      else if (has(itype, /reasoning/i)) counts.reasoning++;
      else if (has(itype, /plan/i)) counts.plan_updates++;
      else if (has(itype, /message|assistant|agent/i)) { counts.messages++; const t = item.text || item.message || (item.content && (typeof item.content === 'string' ? item.content : '')); if (t) lastMessageText = String(t); }
    }
  }
  return { counts, usage, failed, lastMessageText, turns, lines, unparsed };
}
