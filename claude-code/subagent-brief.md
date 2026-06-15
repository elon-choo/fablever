# Extending the Fable style to subagents

Neither the output style nor the `UserPromptSubmit` hook reaches **Task / workflow subagents** — they run
with their own system prompt and do not load the main session's output style or CLAUDE.md. So if you
delegate multi-step work to subagents and want them on the Fable style too, give them the style explicitly.

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
