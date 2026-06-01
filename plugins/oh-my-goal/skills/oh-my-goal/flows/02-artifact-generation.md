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
- `execution-spec.md` - detailed requirements, UX/technical constraints, verification plan, and agent work breakdown.
- `quality-frontier.md` - quality-improvement candidates across multiple lenses.
- `pruning-matrix.md` - keep/cut decisions for quality candidates, owner lanes, and evidence probes.
- `selected-strategy.md` - selected path plus rejected or deferred quality candidates.
- `design-system.md` - web/app design system, colors, typography, patterns, anti-patterns, and UI QA checklist.
- `secrets-and-auth.md` - LLM API, auth provider, and safe secret-handling contract.
- `deployment.md` - Vercel target, deployment commands, env setup, and deployment evidence.
- `goal-prompt.md` - final recommended Codex `create_goal` objective; keep it compact and below Codex objective-length limits.
- `objective.txt` - full raw user objective for long requests and runtime command reuse.
- `harness.md` - execution lifecycle and state contract.
- `runtime-commands.md` - leader-owned auto-start commands for Team runtime, status, collection, and shutdown.
- `plugin-root-resolver.mjs` - portable resolver that finds the installed Oh My Goal plugin root at execution time instead of preserving the generating machine's absolute cache path.
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

## Old Harness Migration

For harnesses created before quality pruning existed, generate migration guidance instead of silently treating the old completion gate as current:

```sh
node <plugin-root>/scripts/migrate-quality-pruning.mjs \
  --slug "<slug>" \
  --apply \
  --json
```

This writes `quality-pruning-migration.md` and missing quality-pruning scaffold files without overwriting existing harness artifacts. The leader must add `qualityPruning` evidence before the pressure gate can pass.

After generation, report the harness path and print the exact recommended Codex goal prompt from `goal-prompt.md` or `goalPromptText`. Do not only summarize it. Mention `execution-spec.md`, `design-system.md`, `secrets-and-auth.md`, `deployment.md`, `quality-frontier.md`, `pruning-matrix.md`, and `selected-strategy.md` as the detailed specs the goal should read before implementation. If the selected output mode is harness-only, PRD-only, goal-prompt-only, or implementation-after-approval, stop after the handoff and do not ask whether to implement now. Do not ask the user to run runtime commands manually; implementation goals must have the generated leader auto-start Team runtime from `runtime-commands.md` before coding, unless the user explicitly chose a leader-only/no-worker mode. Do not start execution unless the user already requested execution in this turn or explicitly approves the handoff.
