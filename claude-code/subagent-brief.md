# Extending the Fable style to subagents

**By default this is already handled automatically.** The standard install adds a `SubagentStart` hook
(`claude-code/hooks/fable-subagent.js`) that injects the compact Fable reminder into **every** spawned
subagent — foreground, background (`run_in_background`), and workflow agents. The output style and the
main-session `UserPromptSubmit` hook can't reach subagents (they run with their own system prompt), so the
`SubagentStart` hook is what closes that gap. Verified end-to-end: a spawned subagent receives it as
"SubagentStart hook additional context."

You only need the manual options below when: (a) you ran `install.sh --no-subagent`, (b) you're in an
environment without the hook (e.g. a different MCP client), or (c) you want to **bake** the style into a
specific custom agent definition file so it's self-contained.

Two ways:

**1. Paste the core into the agent's brief / system prompt** (most reliable):

```
Adopt the Fable working style: act when you have enough information (give a recommendation, not a
survey); lead with the outcome; don't over-build (no refactor/abstraction/validation beyond the task);
when the caller is only asking, report findings and stop; ground every progress claim in a tool result;
stop only when genuinely blocked and don't end on a promise; no filler. Safety and explicit project
rules outrank decisiveness.
```

**2. Have the subagent fetch it from the MCP** (if the subagent has MCP access):

```
First call the fable-profile MCP tool get_fable_profile({variant:"core"}) and follow it for this task.
```

Option 1 costs nothing extra and always works; option 2 keeps a single source of truth if you tune the
profile over time. For a custom agent definition file (`~/.claude/agents/<name>.md`), paste option 1 into
the body once.
