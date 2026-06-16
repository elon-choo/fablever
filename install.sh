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
ONBOARD_SRC="${REPO}/claude-code/hooks/fable-onboard.js"
ONBOARD_DST="${CLAUDE_DIR}/hooks/fable-onboard.js"
ONBOARD_CMD='node $HOME/.claude/hooks/fable-onboard.js'
MODELCHK_SRC="${REPO}/claude-code/hooks/fable-model-check.js"
MODELCHK_DST="${CLAUDE_DIR}/hooks/fable-model-check.js"
MODELCHK_CMD='node $HOME/.claude/hooks/fable-model-check.js'
STYLE_HEADER="${REPO}/claude-code/output-styles/Fable.header.md"
STYLE_DST="${CLAUDE_DIR}/output-styles/Fable.md"
GOVERNOR="${REPO}/profiles/full.md"
PROFILE_DST_DIR="${CLAUDE_DIR}/fable-profile"
RUNTIME_DIR="${PROFILE_DST_DIR}/runtime"          # SEC-1: immutable copy the MCP runs from (NOT the mutable clone)
MERGE="${REPO}/claude-code/lib/settings-merge.js"
MCP_REMOVE="${REPO}/claude-code/lib/mcp-remove.js"
MCP_SERVER="${RUNTIME_DIR}/mcp/src/server.js"
FUSION_SERVER="${RUNTIME_DIR}/fusion/fusion-server.js"
XVERIFY_CFG="${PROFILE_DST_DIR}/xverify.json"
MODE_CFG="${PROFILE_DST_DIR}/mode.json"
FABLE_HOME_PTR="${PROFILE_DST_DIR}/fable-home"

usage() {
  cat <<'USAGE'
Fable Profile installer — make any Claude model adopt Claude Fable 5's working style.

Usage: ./install.sh [options]

  (no options)     output style (always-on) + SubagentStart hook (reaches every subagent) + MCP server
  --with-hook      also add the opt-in per-turn re-injection hook for the MAIN session
  --with-fusion    register the OPTIONAL OpenRouter Fusion MCP (multi-model deliberation; needs an
                   OPENROUTER_API_KEY and makes network calls — see fusion/README.md). Off by default.
  --with-xverify[=openrouter|codex]
                   enable CROSS-MODEL verification: different-weights models cross-check the
                   orchestration verify loop, reducing the same-family blind spots a Claude-only
                   panel shares. OFF by default (zero overhead when off). =openrouter needs an
                   OPENROUTER_API_KEY + the fusion MCP; =codex uses the codex MCP. See orchestration/xverify.md.
  --no-subagent    skip the SubagentStart hook (don't inject into subagents)
  --no-onboard     skip the first-run onboarding SessionStart hook
  --no-modelcheck  skip the daily latest-model-check SessionStart hook
  --no-style       install the style file but don't set it as the default (pick "Fable" in /config)
  --no-mcp         skip registering the MCP server
  --uninstall      remove everything; restores prior settings
  -h, --help       show this help

After installing, restart Claude Code (or /clear). Quiet the hooks: export FABLE_PROFILE=off
(the always-on style stays — switch it in /config or run --uninstall to remove it too).
USAGE
}

WITH_HOOK=0; SET_STYLE=1; DO_MCP=1; UNINSTALL=0; DO_SUBAGENT=1; WITH_FUSION=0; XVERIFY=off; DO_ONBOARD=1; DO_MODELCHK=1; XVERIFY_EXPLICIT=0
for a in "$@"; do
  case "$a" in
    --with-hook)      WITH_HOOK=1 ;;
    --with-fusion)    WITH_FUSION=1 ;;
    --with-xverify)   XVERIFY=openrouter; XVERIFY_EXPLICIT=1 ;;
    --with-xverify=*) XVERIFY="${a#*=}"; XVERIFY_EXPLICIT=1 ;;
    --no-style)    SET_STYLE=0 ;;
    --no-mcp)      DO_MCP=0 ;;
    --no-subagent) DO_SUBAGENT=0 ;;
    --no-onboard)    DO_ONBOARD=0 ;;
    --no-modelcheck) DO_MODELCHK=0 ;;
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
  node "$MERGE" sesshook-off "$SETTINGS" "$ONBOARD_CMD" 2>/dev/null || true
  node "$MERGE" sesshook-off "$SETTINGS" "$MODELCHK_CMD" 2>/dev/null || true
  rm -f "$HOOK_DST" "$SUBHOOK_DST" "$ONBOARD_DST" "$MODELCHK_DST" "$STYLE_DST"
  rm -f "$PROFILE_DST_DIR/full.md" "$PROFILE_DST_DIR/compact.md" "$PROFILE_DST_DIR/core.md" "$XVERIFY_CFG" "$MODE_CFG" "$FABLE_HOME_PTR"
  rm -f "$PROFILE_DST_DIR/onboarded" "$PROFILE_DST_DIR/model-check.json" "$PROFILE_DST_DIR/model-notified.json"  # so a later re-install re-onboards cleanly
  rm -rf "$RUNTIME_DIR" 2>/dev/null || true
  rmdir "$PROFILE_DST_DIR" 2>/dev/null || true
  if have claude; then
    claude mcp remove fable-profile --scope user 2>/dev/null || true
    claude mcp remove fable-fusion  --scope user 2>/dev/null || true
  fi
  # Deterministic fallback (SEC-2): strip the MCP entries directly even if `claude` is absent,
  # so "uninstall restores prior settings" does not silently leave entries behind.
  node "$MCP_REMOVE" "$HOME/.claude.json" fable-profile fable-fusion 2>/dev/null || true
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

# 4b) SessionStart hooks (default ON): first-run onboarding (asks the user for defaults until
#     configured) + daily model-freshness notice. Both fail-open; FABLE_ONBOARD/FABLE_MODELCHECK=off.
cp "$ONBOARD_SRC" "$ONBOARD_DST"; chmod +x "$ONBOARD_DST"
cp "$MODELCHK_SRC" "$MODELCHK_DST"; chmod +x "$MODELCHK_DST"
if [ "$DO_ONBOARD" = "1" ]; then
  node "$MERGE" sesshook-on "$SETTINGS" "$ONBOARD_CMD"
  echo "  onboard   -> SessionStart hook registered (first run asks your defaults; FABLE_ONBOARD=off or --no-onboard to skip)"
else
  echo "  onboard   -> file staged but NOT registered (--no-onboard)"
fi
if [ "$DO_MODELCHK" = "1" ]; then
  node "$MERGE" sesshook-on "$SETTINGS" "$MODELCHK_CMD"
  echo "  modelchk  -> SessionStart hook registered (daily latest-model check, ~0 tokens; FABLE_MODELCHECK=off or --no-modelcheck)"
else
  echo "  modelchk  -> file staged but NOT registered (--no-modelcheck)"
fi

# 5) optional main-session anti-decay hook (opt-in)
cp "$HOOK_SRC" "$HOOK_DST"; chmod +x "$HOOK_DST"
if [ "$WITH_HOOK" = "1" ]; then
  node "$MERGE" hook-on "$SETTINGS" "$HOOK_CMD"
  echo "  hook      -> installed + registered (per-turn core re-injection; FABLE_PROFILE=off to disable)"
else
  echo "  hook      -> file staged at ${HOOK_DST} but NOT registered (re-run with --with-hook to enable)"
fi

# 4.5) SEC-1: copy the runtime to an IMMUTABLE location so the registered servers/hooks do NOT
#       execute from the mutable clone dir (where a stray edit/pull/compromise would change what
#       auto-runs every session). Copy the servers + the profiles they read AND orchestration/ —
#       the SessionStart hooks (onboarding xverify-preset.mjs, daily model-freshness.mjs) and the
#       fusion model registry (models.json) all resolve out of here, NOT the clone, so they work
#       from any cwd after the user restarts. Re-running install.sh refreshes this copy.
if [ "$DO_MCP" = "1" ] || [ "$WITH_FUSION" = "1" ] || [ "$DO_ONBOARD" = "1" ] || [ "$DO_MODELCHK" = "1" ]; then
  rm -rf "$RUNTIME_DIR" 2>/dev/null || true   # refresh cleanly so files deleted from the repo don't persist stale
  mkdir -p "$RUNTIME_DIR"
  cp -R "${REPO}/mcp" "${REPO}/fusion" "${REPO}/profiles" "${REPO}/orchestration" "${REPO}/docs" "$RUNTIME_DIR"/ 2>/dev/null || true
  printf '%s\n' "$RUNTIME_DIR" > "$FABLE_HOME_PTR"   # pointer the hooks read to find orchestration/ from any cwd
  echo "  runtime   -> copied to $RUNTIME_DIR (immutable; incl. orchestration/ for the SessionStart hooks; re-run to refresh)"
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

# 6) OPTIONAL: OpenRouter Fusion MCP (off by default; only with --with-fusion). The one network module.
if [ "$WITH_FUSION" = "1" ]; then
  if have claude; then
    if claude mcp list 2>/dev/null | grep -q '^fable-fusion\b'; then
      echo "  fusion    -> already registered"
    else
      claude mcp add --transport stdio fable-fusion --scope user -- node "$FUSION_SERVER" \
        && echo "  fusion    -> registered (needs OPENROUTER_API_KEY; FABLE_FUSION=off to disable; see fusion/README.md)" \
        || echo "  fusion    -> WARN: 'claude mcp add' failed; add manually (see fusion/README.md)"
    fi
  else
    echo "  fusion    -> 'claude' CLI not found; add manually:"
    echo "               claude mcp add --transport stdio fable-fusion --scope user -- node $FUSION_SERVER"
  fi
  [ -n "${OPENROUTER_API_KEY:-}" ] || echo "  fusion    -> NOTE: OPENROUTER_API_KEY is not set in this shell — set it before using fusion (fusion/README.md)."
fi

# 7) Cross-model verification — accuracy options for the orchestration verify loop, with cost.
cat <<'XMENU'

──────────────────────────────────────────────────────────────────────────────
 Verify-loop accuracy — the orchestration verify recipe can cross-check with OTHER
 models to catch the blind spots a same-family (all-Claude) panel shares:

   [A] Claude-only     cost: $0 extra, no network.  Same model family => shared blind spots.
                       (default — nothing to configure)
   [B] + OpenRouter    cost: ~1 OpenRouter call per extra model per verify (GPT + Gemini by
                       default). Needs OPENROUTER_API_KEY. Different weights => decorrelated.
                       enable:  ./install.sh --with-xverify=openrouter
   [C] + Codex MCP     cost: uses your ChatGPT/Codex subscription quota (no OpenRouter key).
                       Setup (3 cmds): docs/API-KEYS.md § Set up the codex MCP.  enable: ./install.sh --with-xverify=codex

 OFF by default. When off, the cross-model path NEVER runs — zero extra agents, zero network,
 zero overhead on the base system. Toggle anytime: export FABLE_XVERIFY=off
──────────────────────────────────────────────────────────────────────────────
XMENU

# map legacy aliases -> the 4 presets (preset names also accepted directly)
case "$XVERIFY" in
  off|claude-only)               PRESET=claude-only ;;
  codex|gpt-oauth)               PRESET=gpt-oauth ;;
  openrouter|gpt-api+gemini-api) PRESET=gpt-api+gemini-api ;;
  gpt-oauth+gemini-api)          PRESET=gpt-oauth+gemini-api ;;
  *) echo "  xverify   -> WARN: unknown value '$XVERIFY'; using claude-only" ; PRESET=claude-only ;;
esac
# Only (over)write the preset when the user EXPLICITLY chose one (--with-xverify), or when no
# preset exists yet. A plain re-run (refresh runtime / after git pull) must PRESERVE the user's
# existing choice instead of silently resetting it to claude-only.
if [ "$XVERIFY_EXPLICIT" = "1" ] || [ ! -f "$XVERIFY_CFG" ]; then
  if node "$REPO/orchestration/lib/xverify-preset.mjs" set "$PRESET" >/dev/null 2>&1; then
    echo "  xverify   -> preset '$PRESET' -> $XVERIFY_CFG  (change later: node orchestration/lib/xverify-preset.mjs set <preset>)"
  else
    printf '{ "preset": "claude-only", "mode": "off" }\n' > "$XVERIFY_CFG"; echo "  xverify   -> claude-only (fallback)"
  fi
else
  KEEP="$(node "$REPO/orchestration/lib/xverify-preset.mjs" current 2>/dev/null || echo '?')"
  echo "  xverify   -> kept your existing preset '$KEEP' (re-run with --with-xverify=<preset> to change)"
  PRESET="$KEEP"
fi
# seed the cost-mode default so the skip/defaults onboarding path needs ZERO command execution
[ -f "$MODE_CFG" ] || { printf '{ "ultra": "auto" }\n' > "$MODE_CFG"; echo "  mode      -> $MODE_CFG seeded {\"ultra\":\"auto\"}  (change: export FABLE_ULTRA=on|off|auto)"; }
# per-preset setup notes — only when the user explicitly chose this run (not on a plain re-run)
[ "$XVERIFY_EXPLICIT" = "1" ] && case "$PRESET" in
  gpt-api+gemini-api)
    if have claude && ! claude mcp list 2>/dev/null | grep -q '^fable-fusion\b'; then
      claude mcp add --transport stdio fable-fusion --scope user -- node "$FUSION_SERVER" \
        && echo "  xverify   -> fable-fusion MCP registered (hosts fable_cross_verify)" \
        || echo "  xverify   -> WARN: register fable-fusion manually (see fusion/README.md)"
    fi
    [ -n "${OPENROUTER_API_KEY:-}" ] || echo "  xverify   -> NOTE: set OPENROUTER_API_KEY in ~/.zshrc (never paste a key into chat)." ;;
  gpt-oauth)
    echo "  xverify   -> GPT reviewer via ChatGPT login (NO API key). One-time setup (3 commands):"
    echo "                 npm i -g @openai/codex  &&  codex login  &&  claude mcp add --transport stdio codex --scope user -- codex mcp-server"
    echo "               then 'claude mcp list' should show  codex ✔ Connected.  Details: docs/API-KEYS.md (§ Set up the codex MCP)." ;;
  gpt-oauth+gemini-api)
    echo "  xverify   -> NOTE: GPT via codex MCP (setup: docs/API-KEYS.md § Set up the codex MCP) + set GEMINI_API_KEY in ~/.zshrc (never paste a key into chat)." ;;
  claude-only)
    echo "  xverify   -> Claude-only (no key/login, zero overhead)." ;;
esac

HOOK_NOTE=""
[ "$WITH_HOOK" = "1" ] && HOOK_NOTE="  Hook off:    export FABLE_PROFILE=off   (or)  touch ${PROFILE_DST_DIR}/OFF"

# Localized post-install handoff — the terminal output is the FIRST UX moment, before the in-session
# agent can translate anything. Print the one essential next-action in the user's language (from the
# locale), then the English detail block below. Falls back to English for unlisted locales.
LANG_CODE="$(printf '%s' "${LANG:-${LC_ALL:-${LC_MESSAGES:-}}}" | cut -d. -f1 | cut -d_ -f1 | tr '[:upper:]' '[:lower:]')"
case "$LANG_CODE" in
  ko) cat <<'L'

✅ 설치 완료. 다음 단계는 하나뿐 — Claude Code를 재시작하세요(또는 /clear).
   첫 세션에서 fablever가 간단한 설정 질문 2개를 물어봅니다. 그냥 "skip"이라고 답하면
   안전한 기본값으로 시작됩니다 — API 키가 필요 없고 추가 비용도 없습니다.
L
  ;;
  ja) cat <<'L'

✅ インストール完了。次にやることは一つだけ — Claude Code を再起動してください（または /clear）。
   最初のセッションで fablever が簡単な設定の質問を2つします。「skip」と答えれば
   安全な初期設定で始まります — APIキーは不要で、追加費用もありません。
L
  ;;
  zh) cat <<'L'

✅ 安装完成。下一步只有一个 — 重启 Claude Code（或 /clear）。
   首次会话中 fablever 会问你两个简单的设置问题。直接回答 "skip"
   即可使用安全的默认设置 — 无需 API 密钥，也不产生额外费用。
L
  ;;
  es) cat <<'L'

✅ Instalación completa. El único paso siguiente: reinicia Claude Code (o /clear).
   En tu primera sesión, fablever te hará 2 preguntas rápidas de configuración. Responde
   "skip" para los valores por defecto seguros — sin clave API y sin coste adicional.
L
  ;;
  fr) cat <<'L'

✅ Installation terminée. Seule étape suivante : redémarre Claude Code (ou /clear).
   Lors de ta première session, fablever te posera 2 questions de configuration rapides.
   Réponds « skip » pour les réglages par défaut sûrs — sans clé API ni coût supplémentaire.
L
  ;;
  de) cat <<'L'

✅ Installation abgeschlossen. Einziger nächster Schritt: starte Claude Code neu (oder /clear).
   In deiner ersten Sitzung stellt fablever 2 kurze Einrichtungsfragen. Antworte mit
   "skip" für die sicheren Standardwerte — kein API-Schlüssel, keine Zusatzkosten.
L
  ;;
  pt) cat <<'L'

✅ Instalação concluída. Único próximo passo: reinicie o Claude Code (ou /clear).
   Na sua primeira sessão, o fablever fará 2 perguntas rápidas de configuração. Responda
   "skip" para os padrões seguros — sem chave de API e sem custo adicional.
L
  ;;
esac

cat <<EOF

Installed.  Next: RESTART Claude Code (or run /clear).

  >> First time? Just restart and start working normally. On your first session, fablever will
     ASK YOU two quick setup questions (cost mode, and whether to add a cross-model reviewer) and
     save your answers — no config files to edit by hand. New to AI/API keys? That's fine: the
     default needs NO key and costs nothing extra. Say "skip" to take the recommended defaults.

  What's on now:
  Always-on:   the Fable working style layers onto every session, project, and subagent.
  Cost dial:   FABLE_ULTRA=auto (default: cheap; spends only on high-stakes reviews) | on | off.
  Verify:      /config -> Output style shows "Fable"; /mcp lists fable-profile.
  Full guide:  whitepaper/09-running-it.md  (keys, login, modes, kill switches).
  Quiet hooks: export FABLE_PROFILE=off   (the always-on STYLE stays; switch it in /config to drop it)
  Remove all:  ./install.sh --uninstall   (restores your prior output style + settings)
${HOOK_NOTE}

  This is a STYLE transplant, not a capability transplant: it recovers Fable's restraint,
  decisiveness, outcome-first communication, anti-fabrication and stop-when-done discipline.
  It cannot raise a weaker model's reasoning ceiling — that lives in the weights.
EOF
