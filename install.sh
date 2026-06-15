#!/usr/bin/env bash
# install.sh — apply the Fable working style on this machine (always-on, every project).
#
#   ./install.sh                 set the Fable output style as default (always-on) + the SubagentStart
#                                hook (reaches every subagent, incl. background) + register the MCP server.
#   ./install.sh --with-hook     ALSO install the opt-in per-turn re-injection hook for the MAIN session
#                                (anti-decay booster for very long sessions; costs a few tokens every turn).
#   ./install.sh --no-subagent   skip the SubagentStart hook (don't inject into subagents).
#   ./install.sh --no-style      install the output-style FILE but don't set it as default
#                                (you can still pick it in /config).
#   ./install.sh --no-mcp        skip registering the MCP server.
#   ./install.sh --uninstall     remove everything cleanly (restores prior settings).
#
# Primary lever = a Claude Code OUTPUT STYLE: it appends the governor to the system prompt at
# session start (high instruction weight, cache-amortized, no execution surface) and the harness
# auto-reminds the model to keep adhering. Disable anytime: edit ~/.claude/settings.json outputStyle,
# or run --uninstall.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${HOME}/.claude"
SETTINGS="${CLAUDE_DIR}/settings.json"
HOOK_SRC="${REPO}/claude-code/hooks/fable-reinject.sh"
HOOK_DST="${CLAUDE_DIR}/hooks/fable-reinject.sh"
HOOK_CMD='$HOME/.claude/hooks/fable-reinject.sh'
SUBHOOK_SRC="${REPO}/claude-code/hooks/fable-subagent.js"
SUBHOOK_DST="${CLAUDE_DIR}/hooks/fable-subagent.js"
SUBHOOK_CMD='node $HOME/.claude/hooks/fable-subagent.js'
STYLE_HEADER="${REPO}/claude-code/output-styles/Fable.header.md"
STYLE_DST="${CLAUDE_DIR}/output-styles/Fable.md"
GOVERNOR="${REPO}/profiles/full.md"
PROFILE_DST_DIR="${CLAUDE_DIR}/fable-profile"
MERGE="${REPO}/claude-code/lib/settings-merge.js"
MCP_SERVER="${REPO}/mcp/src/server.js"

usage() {
  cat <<'USAGE'
Fable Profile installer — make any Claude model adopt Claude Fable 5's working style.

Usage: ./install.sh [options]

  (no options)     output style (always-on) + SubagentStart hook (reaches every subagent) + MCP server
  --with-hook      also add the opt-in per-turn re-injection hook for the MAIN session
  --no-subagent    skip the SubagentStart hook (don't inject into subagents)
  --no-style       install the style file but don't set it as the default (pick "Fable" in /config)
  --no-mcp         skip registering the MCP server
  --uninstall      remove everything; restores prior settings
  -h, --help       show this help

After installing, restart Claude Code (or /clear). Disable anytime: export FABLE_PROFILE=off
USAGE
}

WITH_HOOK=0; SET_STYLE=1; DO_MCP=1; UNINSTALL=0; DO_SUBAGENT=1
for a in "$@"; do
  case "$a" in
    --with-hook)   WITH_HOOK=1 ;;
    --no-style)    SET_STYLE=0 ;;
    --no-mcp)      DO_MCP=0 ;;
    --no-subagent) DO_SUBAGENT=0 ;;
    --uninstall)   UNINSTALL=1 ;;
    -h|--help)     usage; exit 0 ;;
    *) echo "unknown flag: $a" >&2; usage >&2; exit 2 ;;
  esac
done
have() { command -v "$1" >/dev/null 2>&1; }

if [ "$UNINSTALL" = "1" ]; then
  echo "Uninstalling Fable profile..."
  node "$MERGE" style-off "$SETTINGS" Fable 2>/dev/null || true
  node "$MERGE" hook-off    "$SETTINGS" "$HOOK_CMD" 2>/dev/null || true
  node "$MERGE" subhook-off "$SETTINGS" "$SUBHOOK_CMD" 2>/dev/null || true
  rm -f "$HOOK_DST" "$SUBHOOK_DST" "$STYLE_DST"
  rm -f "$PROFILE_DST_DIR/full.md" "$PROFILE_DST_DIR/compact.md" "$PROFILE_DST_DIR/core.md"
  rmdir "$PROFILE_DST_DIR" 2>/dev/null || true
  if have claude; then claude mcp remove fable-profile --scope user 2>/dev/null || true; fi
  rm -f /tmp/fable-profile/seen-* 2>/dev/null || true
  echo "Done. Restart Claude Code (or /clear) for the change to take full effect."
  exit 0
fi

if ! have node; then echo "ERROR: node is required (MCP server + settings merge)." >&2; exit 1; fi

echo "Installing Fable profile from: $REPO"
mkdir -p "${CLAUDE_DIR}/hooks" "${CLAUDE_DIR}/output-styles" "$PROFILE_DST_DIR"

# 1) profiles: symlink the single source of truth (used by the optional hook and as a reference)
for v in full compact core; do
  ln -sf "${REPO}/profiles/${v}.md" "${PROFILE_DST_DIR}/${v}.md"
done
echo "  profiles  -> ${PROFILE_DST_DIR}/{full,compact,core}.md (symlinked to repo)"

# 2) output style: generate from frontmatter header + the single-source governor
cat "$STYLE_HEADER" "$GOVERNOR" > "$STYLE_DST"
echo "  style     -> ${STYLE_DST} (generated from profiles/full.md)"

# 3) set the output style as the default (the always-on lever) unless --no-style
if [ "$SET_STYLE" = "1" ]; then
  node "$MERGE" style-on "$SETTINGS" Fable
else
  echo "  style     -> not set as default (--no-style); pick 'Fable' in /config to enable"
fi

# 4) subagent reach (default ON): SubagentStart hook injects the style into every spawned subagent
#    (foreground, background/run_in_background, and workflow agents) — which the output style can't reach.
cp "$SUBHOOK_SRC" "$SUBHOOK_DST"; chmod +x "$SUBHOOK_DST"
if [ "$DO_SUBAGENT" = "1" ]; then
  node "$MERGE" subhook-on "$SETTINGS" "$SUBHOOK_CMD"
  echo "  subagent  -> SubagentStart hook registered (reaches every subagent incl. background; FABLE_PROFILE=off to disable)"
else
  echo "  subagent  -> file staged at ${SUBHOOK_DST} but NOT registered (--no-subagent)"
fi

# 5) optional main-session anti-decay hook (opt-in)
cp "$HOOK_SRC" "$HOOK_DST"; chmod +x "$HOOK_DST"
if [ "$WITH_HOOK" = "1" ]; then
  node "$MERGE" hook-on "$SETTINGS" "$HOOK_CMD"
  echo "  hook      -> installed + registered (per-turn core re-injection; FABLE_PROFILE=off to disable)"
else
  echo "  hook      -> file staged at ${HOOK_DST} but NOT registered (re-run with --with-hook to enable)"
fi

# 5) register the MCP server globally (portable on-demand tools + subagent-reachable profile)
if [ "$DO_MCP" = "1" ]; then
  if have claude; then
    if claude mcp list 2>/dev/null | grep -q '^fable-profile\b'; then
      echo "  mcp       -> already registered"
    else
      claude mcp add --transport stdio fable-profile --scope user -- node "$MCP_SERVER" \
        && echo "  mcp       -> registered (scope: user)" \
        || echo "  mcp       -> WARN: 'claude mcp add' failed; add manually (see README)"
    fi
  else
    echo "  mcp       -> 'claude' CLI not found; add manually:"
    echo "               claude mcp add --transport stdio fable-profile --scope user -- node $MCP_SERVER"
  fi
fi

HOOK_NOTE=""
[ "$WITH_HOOK" = "1" ] && HOOK_NOTE="  Hook off:    export FABLE_PROFILE=off   (or)  touch ${PROFILE_DST_DIR}/OFF"
cat <<EOF

Installed. Restart Claude Code (or run /clear) so the output style and MCP server load.

  Always-on:   the Fable working style now layers onto every new session, every project,
               and is injected into every spawned subagent (incl. background) via SubagentStart.
  Verify:      /config -> Output style should show "Fable"; /mcp should list fable-profile.
  Disable:     ./install.sh --uninstall   (or set outputStyle back in ~/.claude/settings.json)
${HOOK_NOTE}

  This is a STYLE transplant, not a capability transplant: it recovers Fable's restraint,
  decisiveness, outcome-first communication, anti-fabrication and stop-when-done discipline.
  It cannot raise a weaker model's reasoning ceiling — that lives in the weights.
EOF
