#!/usr/bin/env bash
# install-test.sh — prove install.sh and settings-merge.js only touch outputStyle + their own hook entry,
# back up settings.json before writing, are idempotent, and uninstall cleanly. Runs entirely in a throwaway
# HOME sandbox; never touches your real ~/.claude. Exit 0 = all checks pass.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SB="$(mktemp -d "${TMPDIR:-/tmp}/fable-install-test.XXXXXX")"
export SB
trap 'rm -rf "$SB"' EXIT
mkdir -p "$SB/.claude/hooks" "$SB/.claude/output-styles"
unset FABLE_READONLY_VERIFIER

# a settings.json with pre-existing hooks + fields that MUST survive untouched
cat > "$SB/.claude/settings.json" <<'JSON'
{
  "permissions": { "allow": ["Bash(ls*)"], "deny": ["Bash(rm -rf /*)"] },
  "hooks": {
    "Stop": [ { "hooks": [ { "type": "command", "command": "$HOME/.claude/hooks/summarize-session.sh", "timeout": 120, "async": true } ] } ],
    "PreToolUse": [ { "matcher": "Edit|Write", "hooks": [ { "type": "command", "command": "/x/protect-files.sh", "timeout": 10 } ] } ]
  },
  "effortLevel": "xhigh", "theme": "dark-daltonized"
}
JSON

assert() { node -e "$1" || { echo "FAIL: $2"; exit 1; }; echo "PASS: $2"; }

echo "# default install (--no-mcp so the test never calls the claude CLI)"
HOME="$SB" bash "$REPO/install.sh" --no-mcp >/dev/null
assert 'const s=require(process.env.SB+"/.claude/settings.json"); process.exit(s.outputStyle==="Fable"?0:1)' "outputStyle set to Fable"
assert 'const s=require(process.env.SB+"/.claude/settings.json"); process.exit((s.hooks.Stop&&s.hooks.PreToolUse&&s.effortLevel==="xhigh"&&s.permissions.allow.length===1)?0:1)' "existing hooks + permissions + effortLevel preserved"
assert 'const s=require(process.env.SB+"/.claude/settings.json"); process.exit(!s.hooks.UserPromptSubmit?0:1)' "UserPromptSubmit hook NOT added by default (opt-in)"
assert 'const s=require(process.env.SB+"/.claude/settings.json"); const j=JSON.stringify(s.hooks.SubagentStart||[]); process.exit(/fable-subagent/.test(j)?0:1)' "SubagentStart hook registered by default (reaches subagents)"
assert 'const s=require(process.env.SB+"/.claude/settings.json"); const j=JSON.stringify(s.hooks.PreToolUse||[]); process.exit((/protect-files/.test(j)&&!/fable-readonly-verifier-gate/.test(j))?0:1)' "read-only verifier adds no always-on PreToolUse hook"
assert 'const s=require(process.env.SB+"/.claude/settings.json"); const j=JSON.stringify(s.hooks.SessionStart||[]); process.exit((/fable-onboard/.test(j)&&/fable-model-check/.test(j))?0:1)' "SessionStart hooks (onboard + model-check) registered by default"
assert 'const s=require(process.env.SB+"/.claude/settings.json"); const j=JSON.stringify(s.hooks.SessionStart||[]); process.exit(/fable-update-check/.test(j)?0:1)' "SessionStart update-check hook registered by default"
assert 'const fs=require("fs"); const v=JSON.parse(fs.readFileSync(process.env.SB+"/.claude/fable-profile/installed-version.json","utf8")); process.exit(/fablever/.test(v.repo_url||"")?0:1)' "installed-version.json recorded (repo_url)"
assert 'const fs=require("fs"); process.exit(fs.existsSync(process.env.SB+"/.claude/hooks/fable-subagent.js")?0:1)' "fable-subagent.js installed"
assert 'const fs=require("fs"); process.exit(fs.existsSync(process.env.SB+"/.claude/hooks/fable-onboard.js")?0:1)' "fable-onboard.js installed"
assert 'const fs=require("fs"); process.exit(!fs.existsSync(process.env.SB+"/.claude/agents/fable-readonly-verifier.md")?0:1)' "read-only verifier agent is default-off"
assert 'const fs=require("fs"); process.exit(!fs.existsSync(process.env.SB+"/.claude/hooks/fable-readonly-verifier-gate.js")?0:1)' "read-only verifier gate is default-off"
assert 'const fs=require("fs"); process.exit(fs.existsSync(process.env.SB+"/.claude/fable-profile/runtime/orchestration/lib/xverify-preset.mjs")?0:1)' "orchestration copied into runtime (onboarding/model-check resolve from any cwd)"
assert 'const fs=require("fs"); const p=process.env.SB+"/.claude/fable-profile/fable-home"; process.exit((fs.existsSync(p)&&fs.readFileSync(p,"utf8").trim().endsWith("/runtime"))?0:1)' "fable-home pointer written for the hooks"
assert 'const fs=require("fs"); const m=JSON.parse(fs.readFileSync(process.env.SB+"/.claude/fable-profile/mode.json","utf8")); process.exit(m.ultra==="auto"?0:1)' "mode.json seeded {ultra:auto} (skip path needs zero commands)"
assert 'const fs=require("fs");const t=fs.readFileSync(process.env.SB+"/.claude/output-styles/Fable.md","utf8");process.exit((/^---[\s\S]*name:\s*Fable/.test(t)&&/keep-coding-instructions:\s*true/.test(t)&&/Act when you have enough to act/.test(t))?0:1)' "output style generated with frontmatter + governor"
assert 'const fs=require("fs");process.exit(fs.readFileSync(process.env.SB+"/.claude/fable-profile/full.md","utf8").length>500?0:1)' "profile symlink resolves"
assert 'const fs=require("fs");process.exit(fs.readdirSync(process.env.SB+"/.claude").some(f=>f.startsWith("settings.json.fable-bak-"))?0:1)' "settings.json backed up before write"

echo "# explicit read-only verifier opt-in installs and uninstalls its scoped boundary"
RO="$(mktemp -d "${TMPDIR:-/tmp}/fable-install-readonly.XXXXXX")"
mkdir -p "$RO/.claude"
printf '{}\n' > "$RO/.claude/settings.json"
FABLE_READONLY_VERIFIER=' true ' HOME="$RO" bash "$REPO/install.sh" --no-mcp --no-subagent --no-onboard --no-modelcheck --no-update-check >/dev/null 2>&1
RO="$RO" node -e 'const fs=require("fs"); const p=process.env.RO+"/.claude/agents/fable-readonly-verifier.md"; process.exit((fs.existsSync(p)&&/tools:\s*Read,\s*Grep,\s*Glob/.test(fs.readFileSync(p,"utf8"))&&/hooks:\s*\n\s*PreToolUse:[\s\S]*fable-readonly-verifier-gate/.test(fs.readFileSync(p,"utf8")))?0:1)' \
  && test -f "$RO/.claude/hooks/fable-readonly-verifier-gate.js" \
  && echo "PASS: padded FABLE_READONLY_VERIFIER=' true ' installs verifier agent + scoped gate" \
  || { echo "FAIL: explicit verifier opt-in omitted its boundary"; rm -rf "$RO"; exit 1; }
FABLE_READONLY_VERIFIER=off HOME="$RO" bash "$REPO/install.sh" --no-mcp --no-subagent --no-onboard --no-modelcheck --no-update-check >/dev/null 2>&1
test ! -e "$RO/.claude/agents/fable-readonly-verifier.md" \
  && test ! -e "$RO/.claude/hooks/fable-readonly-verifier-gate.js" \
  && echo "PASS: explicit verifier off re-install restores default agent + gate surface" \
  || { echo "FAIL: verifier off re-install left its boundary"; rm -rf "$RO"; exit 1; }
HOME="$RO" bash "$REPO/install.sh" --uninstall >/dev/null 2>&1
rm -rf "$RO"

echo "# uninstall preserves pre-existing unowned verifier files byte-exact"
UNOWNED="$(mktemp -d "${TMPDIR:-/tmp}/fable-install-unowned.XXXXXX")"
mkdir -p "$UNOWNED/.claude/agents" "$UNOWNED/.claude/hooks"
printf '{}\n' > "$UNOWNED/.claude/settings.json"
printf 'user-owned verifier agent\nbyte-exact sentinel\n' > "$UNOWNED/.claude/agents/fable-readonly-verifier.md"
printf '#!/usr/bin/env node\nuser-owned verifier gate\n' > "$UNOWNED/.claude/hooks/fable-readonly-verifier-gate.js"
HOME="$UNOWNED" bash "$REPO/install.sh" --uninstall >/dev/null 2>&1
UNOWNED="$UNOWNED" node -e 'const fs=require("fs"),p=process.env.UNOWNED+"/.claude/"; process.exit(fs.readFileSync(p+"agents/fable-readonly-verifier.md","utf8")==="user-owned verifier agent\nbyte-exact sentinel\n"&&fs.readFileSync(p+"hooks/fable-readonly-verifier-gate.js","utf8")==="#!/usr/bin/env node\nuser-owned verifier gate\n"?0:1)' \
  && echo "PASS: uninstall preserves unowned verifier agent + gate byte-exact" \
  || { echo "FAIL: uninstall changed an unowned verifier file"; rm -rf "$UNOWNED"; exit 1; }
rm -rf "$UNOWNED"

echo "# verifier opt-in refuses to overwrite a pre-existing unowned gate"
COLLISION="$(mktemp -d "${TMPDIR:-/tmp}/fable-install-gate-collision.XXXXXX")"
mkdir -p "$COLLISION/.claude/hooks"
printf '{}\n' > "$COLLISION/.claude/settings.json"
printf '#!/usr/bin/env node\nuser-owned verifier gate\n' > "$COLLISION/.claude/hooks/fable-readonly-verifier-gate.js"
if FABLE_READONLY_VERIFIER=' true ' HOME="$COLLISION" bash "$REPO/install.sh" --no-mcp --no-subagent --no-onboard --no-modelcheck --no-update-check >/dev/null 2>&1; then
  echo "FAIL: verifier opt-in overwrote or accepted an unowned gate"
  rm -rf "$COLLISION"
  exit 1
fi
COLLISION="$COLLISION" node -e 'const fs=require("fs"),p=process.env.COLLISION+"/.claude/hooks/fable-readonly-verifier-gate.js"; process.exit(fs.readFileSync(p,"utf8")==="#!/usr/bin/env node\nuser-owned verifier gate\n"?0:1)' \
  && echo "PASS: verifier opt-in refuses and preserves an unowned gate byte-exact" \
  || { echo "FAIL: verifier opt-in changed an unowned gate"; rm -rf "$COLLISION"; exit 1; }
rm -rf "$COLLISION"

echo "# preset preservation on a plain re-run (do not silently reset the user's choice)"
HOME="$SB" bash "$REPO/install.sh" --no-mcp --with-xverify=gpt-oauth >/dev/null 2>&1
assert 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.env.SB+"/.claude/fable-profile/xverify.json","utf8"));process.exit(x.preset==="gpt-oauth"?0:1)' "explicit --with-xverify sets the preset"
HOME="$SB" bash "$REPO/install.sh" --no-mcp >/dev/null 2>&1
assert 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.env.SB+"/.claude/fable-profile/xverify.json","utf8"));process.exit(x.preset==="gpt-oauth"?0:1)' "plain re-run PRESERVES the chosen preset (not reset to claude-only)"

echo "# --with-hook (idempotent)"
HOME="$SB" bash "$REPO/install.sh" --no-mcp --with-hook >/dev/null
HOME="$SB" bash "$REPO/install.sh" --no-mcp --with-hook >/dev/null   # run twice
assert 'const s=require(process.env.SB+"/.claude/settings.json");const j=JSON.stringify(s.hooks.UserPromptSubmit||[]);process.exit((/fable-reinject/.test(j)&&(j.match(/fable-reinject/g)||[]).length===1&&s.outputStyle==="Fable")?0:1)' "hook added exactly once (idempotent), style intact"

echo "# hook runtime: emits on a normal turn, emits nothing when disabled, always exit 0"
OUT1="$(printf '{"session_id":"t1","transcript_path":"/nope","prompt":"hi"}' | HOME="$SB" bash "$SB/.claude/hooks/fable-reinject.sh"; echo "rc=$?")"
[ "${OUT1##*rc=}" = "0" ] && [ -n "${OUT1%rc=*}" ] && echo "PASS: hook injects on a turn (exit 0)" || { echo "FAIL: hook turn"; exit 1; }
OUT2="$(printf '{"session_id":"t2","transcript_path":"/nope"}' | FABLE_PROFILE=off HOME="$SB" bash "$SB/.claude/hooks/fable-reinject.sh"; echo "rc=$?")"
[ "${OUT2}" = "rc=0" ] && echo "PASS: FABLE_PROFILE=off injects nothing (exit 0)" || { echo "FAIL: off toggle"; exit 1; }

echo "# uninstall restores cleanly"
HOME="$SB" bash "$REPO/install.sh" --no-mcp --uninstall >/dev/null
assert 'const s=require(process.env.SB+"/.claude/settings.json");const p=JSON.stringify((s.hooks&&s.hooks.PreToolUse)||[]);process.exit((!s.outputStyle && !(s.hooks&&s.hooks.UserPromptSubmit) && !(s.hooks&&s.hooks.SubagentStart) && !(s.hooks&&s.hooks.SessionStart) && !/fable-readonly-verifier-gate/.test(p) && /protect-files/.test(p) && s.hooks.Stop && s.effortLevel==="xhigh")?0:1)' "uninstall removed fable hooks (incl. read-only gate), kept existing PreToolUse + Stop + effortLevel"
node -e 'const fs=require("fs");process.exit(!fs.existsSync(process.env.SB+"/.claude/output-styles/Fable.md")?0:1)' && echo "PASS: style file removed" || { echo "FAIL: style file remained"; exit 1; }
node -e 'const fs=require("fs");process.exit(!fs.existsSync(process.env.SB+"/.claude/agents/fable-readonly-verifier.md")?0:1)' && echo "PASS: read-only verifier agent removed" || { echo "FAIL: read-only verifier agent remained"; exit 1; }
node -e 'const fs=require("fs");process.exit(!fs.existsSync(process.env.SB+"/.claude/hooks/fable-readonly-verifier-gate.js")?0:1)' && echo "PASS: read-only verifier gate removed" || { echo "FAIL: read-only verifier gate remained"; exit 1; }

echo "# reduced explicit xverify does not implicitly deploy the verifier boundary"
XV="$(mktemp -d "${TMPDIR:-/tmp}/fable-install-xverify.XXXXXX")"
mkdir -p "$XV/.claude"
printf '{}\n' > "$XV/.claude/settings.json"
HOME="$XV" bash "$REPO/install.sh" --with-xverify=codex --no-mcp --no-subagent --no-onboard --no-modelcheck --no-update-check >/dev/null 2>&1
test ! -e "$XV/.claude/agents/fable-readonly-verifier.md" \
  && test ! -e "$XV/.claude/hooks/fable-readonly-verifier-gate.js" \
  && test -f "$XV/.claude/fable-profile/runtime/orchestration/recipes/adversarial-verify.mjs" \
  && echo "PASS: reduced explicit xverify deploys runtime without implicit verifier files" \
  || { echo "FAIL: reduced explicit xverify violated verifier default-off"; rm -rf "$XV"; exit 1; }
rm -rf "$XV"

echo "# reduced subagent-only install does not implicitly deploy the verifier boundary"
SA="$(mktemp -d "${TMPDIR:-/tmp}/fable-install-subagent.XXXXXX")"
mkdir -p "$SA/.claude"
printf '{}\n' > "$SA/.claude/settings.json"
HOME="$SA" bash "$REPO/install.sh" --no-mcp --no-onboard --no-modelcheck --no-update-check >/dev/null 2>&1
test ! -e "$SA/.claude/agents/fable-readonly-verifier.md" \
  && test ! -e "$SA/.claude/hooks/fable-readonly-verifier-gate.js" \
  && echo "PASS: reduced subagent-only install leaves verifier files absent" \
  || { echo "FAIL: reduced subagent-only install violated verifier default-off"; rm -rf "$SA"; exit 1; }
rm -rf "$SA"

echo "# a pre-existing custom output style is RESTORED on uninstall, not clobbered"
cat > "$SB/.claude/settings.json" <<'JSON'
{ "outputStyle": "MyCustomStyle", "effortLevel": "high" }
JSON
HOME="$SB" bash "$REPO/install.sh" --no-mcp >/dev/null
assert 'const s=require(process.env.SB+"/.claude/settings.json");process.exit((s.outputStyle==="Fable"&&s._fableProfilePrevOutputStyle==="MyCustomStyle")?0:1)' "prior custom style memoized while Fable active"
HOME="$SB" bash "$REPO/install.sh" --no-mcp --uninstall >/dev/null
assert 'const s=require(process.env.SB+"/.claude/settings.json");process.exit((s.outputStyle==="MyCustomStyle"&&s._fableProfilePrevOutputStyle===undefined)?0:1)' "prior custom style RESTORED on uninstall, memo cleaned"

echo; echo "ALL INSTALL CHECKS PASSED"
