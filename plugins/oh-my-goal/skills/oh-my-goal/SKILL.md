---
name: oh-my-goal
description: Codex-native goal harness bootstrap. Use when the user invokes `$oh-my-goal <objective>` or wants to define a development objective, run OMX-style structured deep interview, create repo-local Markdown harness artifacts, recommend a create_goal prompt, and set up agent/orchestration plus local-optimum pressure without relying on an omx launcher.
---

# Oh My Goal

Use `$oh-my-goal <objective>` to turn a vague development idea into a Codex goal-ready harness. Treat any text after `$oh-my-goal` as the objective and do not ask for it again.

This skill is plugin-first. Do not require `omx`, `omg`, tmux, or a shell launcher. Reuse the useful OMX ideas through Markdown flow files, local harness artifacts, and Codex-native worker lanes.

## Non-Negotiable Contract

1. Read `FLOW.md` before taking any action.
2. The first `$oh-my-goal <objective>` response is an intake turn, not an execution turn.
3. After repo/context preflight, ask the structured intake questions and stop.
4. Do not create harness files, run the artifact generator, write implementation files, call `create_goal`, or start coding until the user answers the intake questions.
5. Skip the interview gate only when the user explicitly says to use defaults, skip questions, or proceed without interview.

## Flow Files

- `FLOW.md` - required first read; top-level state machine and routing.
- `flows/00-entrypoint.md` - required first read; state machine and phase routing.
- `flows/01-intake-gate.md` - preflight, ambiguity map, and first questionnaire rules.
- `flows/02-artifact-generation.md` - generator usage and required harness files.
- `flows/03-goal-handoff.md` - recommended `create_goal` prompt rules.
- `flows/04-orchestration.md` - leader, workers, Team-style packets, and local-optimum pressure.
- `templates/first-turn-response.md` - required output shape for the first intake turn.
- `templates/intake-fallback.md` - numbered prose fallback questions when structured input is unavailable.
- `templates/worker-packet.md` - worker lane packet template.
- `references/omx-patterns.md` - OMX-derived design patterns to preserve.

## Tool Boundary

Build intake questions with `scripts/intake-question-engine.mjs`, which ports the OMX `questions[]`, `single-answerable` / `multi-answerable`, `answers[]`, and `selected_values` schema. When a visible question UI is useful, use `scripts/intake-question-runtime.mjs --mode auto`: it opens a tmux pane when attached and otherwise returns the same Markdown fallback block.

The bundled generator may be used only after interview completion:

```sh
node <plugin-root>/scripts/create-harness.mjs \
  --objective "<objective>" \
  --interview-complete \
  --answers-json '<json object with user-approved interview answers>'
```

Use `--print-interview` only to print the questionnaire. Do not pass synthetic default answers as if the user had answered.
