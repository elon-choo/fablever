#!/usr/bin/env bash
# fable-reinject.sh — UserPromptSubmit hook. OPT-IN anti-decay booster for the Fable profile.
# (The always-on engine is the output style; this hook only keeps a small anchor alive in long sessions.)
#
# What it does, every time you submit a prompt (in ANY project on this machine), when enabled:
#   - Injects a small Fable working-style reminder into the model's context (plain stdout = added to context).
#   - Injects the COMPACT reminder on turn 1 (bootstrap) and every 25th turn (compaction defense),
#     and the tiny CORE on the turns in between (cheap, fights steering decay). The FULL governor is
#     NOT injected here — it lives only in the output style, set once at session start.
#   - Model-aware: if the active model is already Fable/Mythos class, it injects nothing
#     (Fable already behaves this way, and over-prescribing degrades it — per Anthropic's own guidance).
#   - Fail-safe: ALWAYS exits 0. A bug here must never block your prompt.
#
# Disable instantly:  export FABLE_PROFILE=off   (or)   touch ~/.claude/fable-profile/OFF
#
# Design notes:
#   - Uses the docs' "plain stdout" context-injection method, so there is NO dependency on jq/python
#     and no JSON escaping of multi-line steering text. Portable to any machine with bash.
#   - Reads profile text from ~/.claude/fable-profile/{compact,core}.md (install.sh links these to the
#     repo's profiles/ so there is a single source of truth).

set +e  # never abort on error; we always want exit 0

PROFILE_DIR="${HOME}/.claude/fable-profile"
MARK_DIR="/tmp/fable-profile"

# --- read hook input (JSON on stdin) ---
INPUT="$(cat 2>/dev/null)"

# --- global off switches ---
[ "${FABLE_PROFILE}" = "off" ] && exit 0
[ -f "${PROFILE_DIR}/OFF" ] && exit 0

# --- extract fields without a JSON dependency (ids/paths are grep-safe) ---
sid="$(printf '%s' "$INPUT"   | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"'      | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//')"
sid="${sid//[^A-Za-z0-9_-]/_}"   # sanitize: sid only ever indexes a /tmp marker filename (no path traversal)
tpath="$(printf '%s' "$INPUT" | grep -o '"transcript_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//')"

# --- holdout suppression (OPT-IN measurement only; inert unless FABLE_MEASURE=on) ---
# When a measurement campaign is running, sessions assigned to the untreated 'off' arm carry a marker
# (written by measurement/holdout.js); skip injection so that arm is a true baseline. Default: no-op.
m="$(printf '%s' "${FABLE_MEASURE}" | tr 'A-Z' 'a-z')"   # normalize identically to holdout.js / fable-subagent.js
case "$m" in
  on|1|true) [ -n "$sid" ] && [ -f "${PROFILE_DIR}/holdout/${sid}.off" ] && exit 0 ;;
esac

# --- model-aware gate: skip entirely for Fable/Mythos-class models ---
if [ -n "$tpath" ] && [ -f "$tpath" ]; then
  model="$(tail -n 120 "$tpath" 2>/dev/null | grep -o '"model"[[:space:]]*:[[:space:]]*"[^"]*"' | tail -1)"
  case "$model" in
    *fable*|*mythos*) exit 0 ;;   # already Fable-class: inject nothing
  esac
fi

# --- choose compact (bootstrap) vs core (cheap reminder) by per-session turn counter ---
# The output style carries the FULL governor at session start; this hook only keeps a small
# anchor alive against decay, so it injects the tiny CORE most turns and a COMPACT refresh
# on turn 1 (bootstrap, in case no output style is set) and periodically (compaction defense).
mkdir -p "$MARK_DIR" 2>/dev/null
# prune stale markers (>1 day) so /tmp doesn't accumulate
find "$MARK_DIR" -name 'seen-*' -mtime +1 -delete 2>/dev/null

variant="core"
if [ -n "$sid" ]; then
  marker="${MARK_DIR}/seen-${sid}"
  if [ ! -f "$marker" ]; then
    n=1
  else
    n="$(cat "$marker" 2>/dev/null)"
    case "$n" in ''|*[!0-9]*) n=0 ;; esac
    n=$((n + 1))
  fi
  printf '%s' "$n" > "$marker" 2>/dev/null
  if [ "$n" -eq 1 ] || [ $((n % 25)) -eq 0 ]; then
    variant="compact"
  fi
fi

file="${PROFILE_DIR}/${variant}.md"
[ -f "$file" ] || file="${PROFILE_DIR}/core.md"
[ -f "$file" ] || exit 0

# --- inject: plain stdout is auto-added to the model's context on exit 0 ---
cat "$file" 2>/dev/null
exit 0
