# Goal Handoff

Use `goal-prompt.md` as the recommended Codex goal objective.

## Prompt Requirements

The recommended goal prompt must:

- keep one Codex goal as the single top-level objective,
- include the original objective, acceptance criteria, non-goals, and verification,
- require the leader to use `.omg/harness/<slug>/`,
- require reading `runtime-commands.md` before execution,
- require the leader to auto-start Team runtime when independent work improves quality,
- forbid asking the user to run Team runtime manually,
- require at least two materially different trajectories before major commitment,
- require adversarial review and basin-escape challenge before completion,
- state that only the leader may call `update_goal({status: "complete"})`.

## Goal Tool Boundary

If Codex goal tools are available:

1. Call `get_goal` first.
2. Call `create_goal` only when no conflicting active goal exists and the user wants to start execution.
3. Never create per-subtask goals.
4. Workers must not call `create_goal` or `update_goal`.
5. Call `update_goal({status: "complete"})` only after the completion gate passes.

If a different active Codex goal exists, checkpoint or ask before replacing focus.
