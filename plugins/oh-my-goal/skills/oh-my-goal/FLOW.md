# Oh My Goal Flow

This is the top-level workflow contract. Read this before any phase file.

## Core Rule

The first `$oh-my-goal <objective>` response is intake only. Run focused preflight, start the OMX-style intake runtime in `auto` mode, and stop after either an interactive cmux/tmux/macOS Terminal question window is opened, structured answers are returned, or the sequential fallback prompt is shown. Harness generation and implementation happen only after intake returns `ok: true`, meaning residual ambiguity is below threshold or the user explicitly approves defaults.

## Phase Router

| Phase | Read | Do | Do not |
| --- | --- | --- | --- |
| `INTAKE_PENDING` | `flows/00-entrypoint.md`, `flows/01-intake-gate.md`, `templates/first-turn-response.md`, `templates/intake-fallback.md` | inspect focused context, start `auto` intake runtime; use cmux/tmux/macOS Terminal UI answers when available or continue sequential fallback one question at a time | create files, run harness generator, code, create goal |
| `INTAKE_ANSWERED` | `flows/02-artifact-generation.md` | assimilate answers, verify residual ambiguity is low enough, generate harness | invent missing answers silently |
| `HARNESS_READY` | `flows/03-goal-handoff.md` | show harness path and recommended goal prompt | start a conflicting goal silently |
| `EXECUTION` | `flows/04-orchestration.md`, `templates/worker-packet.md` | initialize `scripts/pressure-runtime.mjs`, run leader/worker evidence lanes, use `scripts/team-runtime.mjs` when visible Team lanes help | let workers own goal completion |

## Required Evidence Trail

Every completed Oh My Goal run should leave:

- user-approved intake answers,
- `.omg/harness/<slug>/context-index.md`,
- `.omg/harness/<slug>/goal-prompt.md`,
- orchestration and local-optimum pressure instructions,
- completion gate evidence before `update_goal({status: "complete"})`.
- optional `.omg/runtime/team/<team>/` state when Team workers are launched or planned,
- `.omg/runtime/pressure/<slug>/` state when runtime local-optimum pressure is initialized.

## OMX Pattern Reference

Read `references/omx-patterns.md` when adapting the flow or when the task needs deeper orchestration, critic pressure, or Team-style lane design.
