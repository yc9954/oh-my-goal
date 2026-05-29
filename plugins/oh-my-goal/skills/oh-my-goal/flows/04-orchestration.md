# Orchestration

Use available Codex subagent, agent, or task tools only as evidence lanes. If visible worker lanes are useful, prefer the plugin Team bridge. Path rule: `<plugin-root>` is two directories above this skill directory, so the runtime is `<plugin-root>/scripts/team-runtime.mjs`, not `skills/oh-my-goal/scripts/team-runtime.mjs`.

```sh
node <plugin-root>/scripts/team-runtime.mjs launch \
  --objective "<bounded objective>" \
  --workers 3 \
  --mode auto \
  --json
```

The Team bridge ports the useful OMX Team execution surface into plugin-local state:

- task decomposition and role routing,
- `.omg/runtime/team/<team>/config.json`,
- worker `inbox.md`, `prompt.md`, `status.json`, and `result.md` paths,
- optional cmux/tmux panes when launched from an attached interactive session,
- cmux-visible surfaces renamed by worker id and role when cmux is available,
- `status`, `collect`, and `shutdown` commands for inspection and cleanup.

If cmux/tmux is unavailable, `--mode auto` degrades to planned state and worker packets. Continue sequentially from those packets and record results.

When cmux is available, inspect visible worker lanes with:

```sh
cmux tree --workspace "$CMUX_WORKSPACE_ID"
cmux read-screen --workspace "$CMUX_WORKSPACE_ID" --surface <surface:id> --lines 80
```

Use cmux screen reads for observation only. Worker `result.md` files remain the durable evidence source.

## Leader And Workers

- Leader owns the single Codex goal, plan selection, state ledger, and completion.
- Workers own bounded evidence: facts, diffs, tests, risks, blockers, and scores.
- Workers do not call `create_goal`.
- Workers do not call `update_goal`.
- Workers do not mark the whole mission complete.

Use `scripts/team-runtime.mjs plan` or `templates/worker-packet.md` for each worker or sequential lane.

Inspect and collect Team work with:

```sh
node <plugin-root>/scripts/team-runtime.mjs status --team <team> --json
node <plugin-root>/scripts/team-runtime.mjs collect --team <team> --json
node <plugin-root>/scripts/team-runtime.mjs shutdown --team <team> --json
```

## OMX-Style Planning Voices

- Metis: clarify material ambiguity and source facts before asking the user.
- Momus: challenge assumptions, validation gaps, and overbroad scope.
- Oracle: synthesize the goal prompt, worker lanes, and completion gate.

## Local-Optimum Pressure

Before selecting a plan or finishing:

1. Generate at least two materially different trajectories.
2. Include one conservative baseline and one novelty-seeking or constraint-inverting path.
3. Run a critic pass that tries to disprove completion.
4. Add perturbation when the same blocker repeats.
5. Reject novelty unless it improves evidence against acceptance checks.

Completion requires objective-to-artifact audit, implementation or research evidence, external verification output, adversarial review with blockers cleared, and a basin-escape challenge comparing alternatives.
