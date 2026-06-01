# Goal Handoff

Use `goal-prompt.md` as the recommended Codex goal objective.

The handoff response must include:

- the harness path,
- the `goal-prompt.md` path,
- the exact prompt text in a fenced `text` block,
- no implementation offer when intake selected harness-only, PRD-only, goal-prompt-only, or implementation-after-approval.

## Prompt Requirements

The recommended goal prompt must:

- keep one Codex goal as the single top-level objective,
- reference `objective.txt` for the full original request instead of pasting long objectives into the Codex goal body,
- compress acceptance criteria, non-goals, verification, external-service blockers, and domain-critical constraints into a short execution focus,
- require the leader to use `.omg/harness/<slug>/`,
- require reading `runtime-commands.md` before execution,
- require reading `design-system.md`, `secrets-and-auth.md`, and `deployment.md` before UI, LLM/auth, or Vercel work,
- require deployment readiness and dry-run evidence before any `deployment-runtime.mjs deploy --execute` attempt,
- require `deployment-runtime.mjs setup-env --execute` in an attached terminal when Vercel/OpenAI/auth secrets are needed and not already configured,
- require the leader to auto-start visible Team runtime before coding for implementation goals, unless the user explicitly chose leader-only/no-worker mode,
- require secure secret handling and forbid raw API keys in chat or committed artifacts,
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
