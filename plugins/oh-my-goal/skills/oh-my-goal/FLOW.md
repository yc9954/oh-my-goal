# Oh My Goal Flow

This is the top-level workflow contract. Read this before any phase file.

## Core Rule

The first `$oh-my-goal <objective>` response starts with optional capability preflight, then intake. Run `scripts/openai-key-runtime.mjs offer --cwd <cwd> --keys OPENAI_API_KEY,ZEP_API_KEY --json` before the intake runtime. If an attached terminal is available and the user has not already configured keys, run the same command with `--execute` so the runtime asks yes/no and hidden-inputs accepted keys into uncommitted `.env.local`. Missing keys do not block Codex-native intake; they only disable local Node-based LLM question generation or later Zep-backed features until configured. Never ask for raw keys in chat. After capability preflight, run focused repo preflight, start the Oh My Goal intake runtime in `auto` mode, and stop after either an interactive cmux/tmux/macOS Terminal question window is opened, structured answers are returned, or the sequential fallback prompt is shown. Harness generation and implementation happen only after intake returns `ok: true`, meaning residual ambiguity is below threshold and quality, design-system, deployment, LLM/API, auth, secret-handling, and credential setup decisions are complete or explicitly out of scope. Phrases such as "proceed", "build start", or "resolve unknowns conservatively" do not skip intake; skip only when the user explicitly says to skip questions/interview or use defaults without asking.

## Phase Router

| Phase | Read | Do | Do not |
| --- | --- | --- | --- |
| `CAPABILITY_PREFLIGHT` | `flows/00-entrypoint.md`, `templates/first-turn-response.md` | offer optional `OPENAI_API_KEY` and `ZEP_API_KEY` setup; continue intake when missing or skipped | ask for raw keys in chat or block intake on missing keys |
| `INTAKE_PENDING` | `flows/00-entrypoint.md`, `flows/01-intake-gate.md`, `templates/first-turn-response.md`, `templates/intake-fallback.md` | inspect focused context, start `auto` intake runtime; use cmux/tmux/macOS Terminal UI answers when available or continue sequential fallback one question at a time | create files, run harness generator, code, create goal |
| `INTAKE_ANSWERED` | `flows/02-artifact-generation.md` | assimilate answers, verify residual ambiguity is low enough and quality/deployment/secret decisions are complete, generate harness | invent missing answers silently |
| `HARNESS_READY` | `flows/03-goal-handoff.md` | show harness path and recommended goal prompt | start a conflicting goal silently |
| `EXECUTION` | `flows/04-orchestration.md`, `templates/worker-packet.md` | initialize `scripts/pressure-runtime.mjs`; if the harness marks Team startup mandatory, run `scripts/team-runtime.mjs launch --mode auto --require-interactive` and require `status: "launched"` before implementation; otherwise use Team when visible lanes help | let workers own goal completion; silently continue leader-only after a blocked Team startup |

## Required Evidence Trail

Every completed Oh My Goal run should leave:

- user-approved intake answers,
- quality frontier and pruning decisions,
- design-system, deployment, LLM/API, auth, secret-handling, and credential setup decisions,
- `.omg/harness/<slug>/context-index.md`,
- `.omg/harness/<slug>/goal-prompt.md`,
- orchestration and local-optimum pressure instructions,
- completion gate evidence before `update_goal({status: "complete"})`.
- optional `.omg/runtime/team/<team>/` state when Team workers are launched or planned,
- `.omg/runtime/pressure/<slug>/` state when runtime local-optimum pressure is initialized.

## OMG Pattern Reference

Read `references/omg-patterns.md` when adapting the flow or when the task needs deeper orchestration, critic pressure, or Team-style lane design.
