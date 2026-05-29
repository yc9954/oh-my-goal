---
name: oh-my-goal
description: Codex-native goal harness bootstrap. Use when the user invokes `$oh-my-goal <objective>` or wants to define a development objective, run OMX-style structured deep interview, create repo-local Markdown harness artifacts, recommend a create_goal prompt, and set up agent/orchestration plus local-optimum pressure without relying on an omx launcher.
---

# Oh My Goal

Use `$oh-my-goal <objective>` to turn a vague development idea into a Codex goal-ready harness. Treat any text after `$oh-my-goal` as the objective and do not ask for it again.

This skill is plugin-first. Do not require `omx`, `omg`, tmux, or a shell launcher.

## Non-Negotiable Contract

1. Read `FLOW.md` before taking any action.
2. The first `$oh-my-goal <objective>` response is an intake turn, not an execution turn.
3. After repo/context preflight, ask structured intake questions until residual ambiguity is low enough, then stop.
4. Do not create harness files, run the artifact generator, write implementation files, call `create_goal`, or start coding until the user answers the intake questions.
5. Skip the interview gate only when the user explicitly says to use defaults, skip questions, or proceed without interview.

## Flow Files

- `FLOW.md` - read first.
- `flows/00-entrypoint.md`, `flows/01-intake-gate.md`, `flows/02-artifact-generation.md`, `flows/03-goal-handoff.md`, `flows/04-orchestration.md`.
- `templates/first-turn-response.md`, `templates/intake-fallback.md`, `templates/worker-packet.md`.
- `references/omx-patterns.md`, `references/omx-port-map.md`.

## Tool Boundary

Resolve `<plugin-root>` as the directory two levels above this skill directory. From `skills/oh-my-goal/SKILL.md`, the scripts live at `../../scripts/*.mjs`. Do not look for scripts under `skills/oh-my-goal/scripts/`.

Build intake questions with `scripts/intake-question-engine.mjs`, which ports OMX `questions[]`, `single-answerable` / `multi-answerable`, `answers[]`, and `selected_values`. `scripts/omx-question-core.mjs` is the plugin-local port of OMX `src/question/ui.ts`; keep UI state, key handling, review, and answer shape aligned with that source. `scripts/intake-question-runtime.mjs` adds only runtime transport and ambiguity follow-up behavior: start with `--mode auto`; cmux opens an in-workspace pane, attached tmux opens an arrow-key pane, macOS can open a Terminal question window, and other surfaces return sequential fallback with an ambiguity score. If auto returns interactive `status: "prompting"`, stop and later read it with `--mode status --state-path <record_path>`. The runtime starts with a baseline intake and appends follow-up questions when `residual_ambiguity.score` remains above threshold. Continue fallback answers with `--mode sequential-answer --state-path <record_path> --answer <selection> --json` until `ok: true`.

When independent worker lanes are useful, use `scripts/team-runtime.mjs`. It ports the useful OMX Team execution surface into plugin-local state: task decomposition, worker packets, `.omg/runtime/team/<team>/` state, optional cmux/tmux worker panes, status, collection, and shutdown. Workers still must not own the Codex goal.

Generated harnesses must include `runtime-commands.md`, and `goal-prompt.md` must tell the leader to auto-start Team runtime when lane separation is useful. Do not make the user run the `node ... team-runtime.mjs` command manually.

The bundled generator may be used only after interview completion:

```sh
node <plugin-root>/scripts/create-harness.mjs \
  --objective "<objective>" \
  --interview-complete \
  --answers-json '<json object with user-approved interview answers>'
```

Use `--print-interview` only to print the questionnaire. Do not pass synthetic default answers as if the user had answered.
