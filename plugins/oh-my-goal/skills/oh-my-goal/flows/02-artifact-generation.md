# Artifact Generation

Generate harness artifacts only after the user answers intake or explicitly approves defaults.

## Preferred Generator

Path rule: `<plugin-root>` is two directories above this skill directory. Use `<plugin-root>/scripts/create-harness.mjs`, not `skills/oh-my-goal/scripts/create-harness.mjs`.

Use the bundled script from the plugin root:

```sh
node <plugin-root>/scripts/create-harness.mjs \
  --objective "<objective>" \
  --interview-complete \
  --answers-json '<json object with user-approved interview answers>'
```

Use `--force` only when intentionally replacing an existing harness for the same slug.

## Required Files

The harness root is `.omg/harness/<slug>/` and must include:

- `context-index.md` - first file the goal should read.
- `ambiguity-map.md` - ambiguity dimensions, defaults, and critical gaps.
- `intake-questionnaire.md` - structured questions, choices, and recorded answers.
- `deep-interview.md` - decisions, assumptions, and unresolved questions.
- `goal-prompt.md` - final recommended Codex `create_goal` objective.
- `harness.md` - execution lifecycle and state contract.
- `runtime-commands.md` - leader-owned auto-start commands for Team runtime, status, collection, and shutdown.
- `agents.md` - leader and worker lane responsibilities.
- `orchestration.md` - how to use subagents or sequential lanes.
- `team-system.md` - Team-style lane protocol with plugin-local runtime fallback.
- `worker-packet-template.md` - reusable worker instruction/result packet.
- `trajectory-ledger.md` - candidate path comparison table.
- `state-ledger.md` - persistent leader-loop checkpoint log.
- `local-optimum-pressure.md` - perturbation, critique, and basin-escape protocol.
- `completion-gate.md` - evidence required before `update_goal({status: "complete"})`.

## Manual Fallback

If the script is unavailable, create the same files manually. Preserve the same state contract: one leader-owned Codex goal, worker lanes as evidence producers, trajectory comparison before commitment, and completion only after the gate passes.

After generation, report the harness path and print the exact recommended Codex goal prompt from `goal-prompt.md` or `goalPromptText`. Do not only summarize it. If the selected output mode is harness-only, PRD-only, goal-prompt-only, or implementation-after-approval, stop after the handoff and do not ask whether to implement now. Do not ask the user to run `team-runtime.mjs` manually; the generated goal prompt and `runtime-commands.md` make the leader auto-start it during execution when lane separation is useful. Do not start execution unless the user already requested execution in this turn or explicitly approves the handoff.
