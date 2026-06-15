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
assert 'const fs=require("fs"); process.exit(fs.existsSync(process.env.SB+"/.claude/hooks/fable-subagent.js")?0:1)' "fable-subagent.js installed"
assert 'const fs=require("fs");const t=fs.readFileSync(process.env.SB+"/.claude/output-styles/Fable.md","utf8");process.exit((/^---[\s\S]*name:\s*Fable/.test(t)&&/keep-coding-instructions:\s*true/.test(t)&&/Act when you have enough to act/.test(t))?0:1)' "output style generated with frontmatter + governor"
assert 'const fs=require("fs");process.exit(fs.readFileSync(process.env.SB+"/.claude/fable-profile/full.md","utf8").length>500?0:1)' "profile symlink resolves"
assert 'const fs=require("fs");process.exit(fs.readdirSync(process.env.SB+"/.claude").some(f=>f.startsWith("settings.json.fable-bak-"))?0:1)' "settings.json backed up before write"

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
assert 'const s=require(process.env.SB+"/.claude/settings.json");process.exit((!s.outputStyle && !(s.hooks&&s.hooks.UserPromptSubmit) && !(s.hooks&&s.hooks.SubagentStart) && s.hooks.Stop && s.effortLevel==="xhigh")?0:1)' "uninstall removed outputStyle + both hooks, kept Stop + effortLevel"
node -e 'const fs=require("fs");process.exit(!fs.existsSync(process.env.SB+"/.claude/output-styles/Fable.md")?0:1)' && echo "PASS: style file removed" || { echo "FAIL: style file remained"; exit 1; }

echo "# a pre-existing custom output style is RESTORED on uninstall, not clobbered"
cat > "$SB/.claude/settings.json" <<'JSON'
{ "outputStyle": "MyCustomStyle", "effortLevel": "high" }
JSON
HOME="$SB" bash "$REPO/install.sh" --no-mcp >/dev/null
assert 'const s=require(process.env.SB+"/.claude/settings.json");process.exit((s.outputStyle==="Fable"&&s._fableProfilePrevOutputStyle==="MyCustomStyle")?0:1)' "prior custom style memoized while Fable active"
HOME="$SB" bash "$REPO/install.sh" --no-mcp --uninstall >/dev/null
assert 'const s=require(process.env.SB+"/.claude/settings.json");process.exit((s.outputStyle==="MyCustomStyle"&&s._fableProfilePrevOutputStyle===undefined)?0:1)' "prior custom style RESTORED on uninstall, memo cleaned"

echo; echo "ALL INSTALL CHECKS PASSED"
