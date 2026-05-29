# Oh My Goal Flow

This is the top-level workflow contract. Read this before any phase file.

## Core Rule

The first `$oh-my-goal <objective>` response is intake only. Run focused preflight, ask the structured questionnaire, then stop. Harness generation and implementation happen only after the user answers intake or explicitly approves defaults.

## Phase Router

| Phase | Read | Do | Do not |
| --- | --- | --- | --- |
| `INTAKE_PENDING` | `flows/00-entrypoint.md`, `flows/01-intake-gate.md`, `templates/first-turn-response.md`, `templates/intake-fallback.md` | inspect focused context, generate OMX question payload or runtime UI, ask one questionnaire | create files, run harness generator, code, create goal |
| `INTAKE_ANSWERED` | `flows/02-artifact-generation.md` | assimilate answers, run gap-fill, generate harness | invent missing answers silently |
| `HARNESS_READY` | `flows/03-goal-handoff.md` | show harness path and recommended goal prompt | start a conflicting goal silently |
| `EXECUTION` | `flows/04-orchestration.md`, `templates/worker-packet.md` | run leader/worker evidence lanes | let workers own goal completion |

## Required Evidence Trail

Every completed Oh My Goal run should leave:

- user-approved intake answers,
- `.omg/harness/<slug>/context-index.md`,
- `.omg/harness/<slug>/goal-prompt.md`,
- orchestration and local-optimum pressure instructions,
- completion gate evidence before `update_goal({status: "complete"})`.

## OMX Pattern Reference

Read `references/omx-patterns.md` when adapting the flow or when the task needs deeper orchestration, critic pressure, or Team-style lane design.
