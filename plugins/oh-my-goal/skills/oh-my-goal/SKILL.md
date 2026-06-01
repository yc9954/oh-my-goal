---
name: oh-my-goal
description: Codex-native `$oh-my-goal <objective>` intake, harness artifacts, create_goal prompt, agent lanes, and local-optimum pressure.
---

# Oh My Goal

Use `$oh-my-goal <objective>` to turn an idea into a Codex goal-ready harness. Treat text after `$oh-my-goal` as the objective and do not ask for it again.

## Contract

1. Read `FLOW.md` before taking any action.
2. The first `$oh-my-goal <objective>` response is capability preflight first, then intake; it is not an execution turn.
3. Before intake, run `scripts/openai-key-runtime.mjs offer --cwd <cwd> --keys OPENAI_API_KEY,ZEP_API_KEY --json`; with a terminal, add `--execute` for yes/no + hidden input. Missing keys do not block intake. Never ask for raw API keys in chat.
4. After preflight, ask intake until residual ambiguity is low and quality-pruning is complete, then stop.
5. Do not create harness files, run the generator, write implementation files, call `create_goal`, or code until intake is answered.
6. Skip intake only on explicit "skip interview/questions" or "use defaults without asking"; "proceed" is insufficient.

## Flow Files

- `flows/00-entrypoint.md`, `flows/01-intake-gate.md`, `flows/02-artifact-generation.md`, `flows/03-goal-handoff.md`, `flows/04-orchestration.md`.
- `templates/first-turn-response.md`, `templates/intake-fallback.md`, `templates/worker-packet.md`.
- `references/omg-patterns.md`, `references/omg-port-map.md`, `references/ui-ux-pro-max-analysis.md`.

## Tool Boundary

Resolve `<plugin-root>` as two levels above this skill directory. Scripts live at `../../scripts/*.mjs`. Do not look for scripts under `skills/oh-my-goal/scripts/`.

Run `scripts/openai-key-runtime.mjs offer` before intake. It detects optional `OPENAI_API_KEY`/`ZEP_API_KEY`; `--execute` asks yes/no, stores accepted hidden-input keys in `.env.local`, and records redacted status. Missing keys are not a blocker.

Build intake with `scripts/intake-question-engine.mjs --repo-review --llm auto`: `questions[]`, `single-answerable` / `multi-answerable`, `answers[]`, and `selected_values`. It reviews the folder, uses LLM repo questions when `OPENAI_API_KEY` exists, then runs ambiguity reduction, quality-pruning, design, deployment, API, auth, secrets, and credential setup. Korean text is localized; IDs/values stay English. Use `intake-question-runtime.mjs --mode auto`; fallback is `--mode sequential` then `sequential-answer` with ambiguity score.

For old harnesses, use `scripts/migrate-quality-pruning.mjs --slug <slug> --apply --json` to add quality-pruning files.

For implementation goals, use `scripts/team-runtime.mjs`; `scripts/team-core.mjs` owns tasks, identities, packets, dynamic rebalance, status, collection, and shutdown. Mandatory-Team harnesses use `--require-interactive`; if blocked, report the cmux/tmux blocker instead of continuing leader-only. For `cmux_socket_permission_blocked`, use `scripts/cmux-bridge-runtime.mjs` before fallback. Run `team-runtime.mjs watch` or `tick` after worker changes. Use `scripts/design-system-runtime.mjs` for UI artifacts and `scripts/deployment-runtime.mjs` for Vercel/env plan/readiness/deploy. Workers must not own the Codex goal.

Generated harnesses must include `objective.txt`, `runtime-commands.md`, and `plugin-root-resolver.mjs`. Keep `goal-prompt.md` compact; details belong in harness files. It must point to `scripts/pressure-runtime.mjs`, Team runtime, gates, and resolver commands without cache paths. Do not make the user run runtime commands manually.

The bundled generator may be used only after interview completion:

```sh
node <plugin-root>/scripts/create-harness.mjs \
  --objective "<objective>" \
  --interview-complete \
  --answers-json '<json object with user-approved interview answers>'
```

Use `--print-interview` only to print the questionnaire. Do not pass synthetic defaults as user answers.
