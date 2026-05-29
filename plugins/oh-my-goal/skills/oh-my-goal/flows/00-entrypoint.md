# Entrypoint Flow

This file is the required first read after `SKILL.md`.

## Invocation Parsing

- `$oh-my-goal <objective>` means the trailing text is the objective.
- Do not ask for the objective again when trailing text exists.
- If no objective exists, ask exactly one opening question: `What do you want to build or improve?`

## State Machine

Route every turn through exactly one phase:

| Phase | Condition | Required action | Stop condition |
| --- | --- | --- | --- |
| `INTAKE_PENDING` | User invoked `$oh-my-goal` and has not answered intake | Run preflight, ask intake block | Stop after questions |
| `INTAKE_ANSWERED` | User answered intake or approved defaults | Run gap-fill and critique | Continue to artifact generation |
| `HARNESS_READY` | `.omg/harness/<slug>/` files exist | Summarize generated artifacts and goal prompt | Ask before goal start unless already requested |
| `GOAL_HANDOFF` | User wants to start Codex goal | Inspect active goal first, then hand off | Do not replace conflicting active goal silently |
| `EXECUTION` | User approved implementation | Use orchestration and worker lanes | Finish only after completion gate |

## First-Turn Rule

For `INTAKE_PENDING`, do not create files, run the generator, call `create_goal`, or implement code. You may inspect focused repo context first. Then use `templates/first-turn-response.md` to ask one structured intake block and wait for the user's next turn.

Read next:

- `flows/01-intake-gate.md` during `INTAKE_PENDING`.
- `flows/02-artifact-generation.md` during `INTAKE_ANSWERED`.
- `flows/03-goal-handoff.md` during `GOAL_HANDOFF`.
- `flows/04-orchestration.md` during `EXECUTION`.
