---
name: oh-my-goal
description: Codex-native goal harness bootstrap. Use when the user wants to define a development objective, run deep interview, create repo-local Markdown harness artifacts, recommend a create_goal prompt, and set up agent/orchestration plus local-optimum pressure without relying on an omx launcher.
---

# Oh My Goal

Use `$oh-my-goal` to turn a vague development idea into a Codex goal-ready harness. This skill is plugin-first: do not require `omx`, `omg`, tmux, or a shell launcher.

## Flow

1. If the user has not provided an objective, ask exactly one opening question:
   `What do you want to build or improve?`
2. Run a deep interview one question at a time until the following are clear:
   - concrete success outputs and acceptance checks,
   - non-goals and scope boundaries,
   - verification commands or inspection artifacts,
   - risks, constraints, credentials, data, and release boundaries,
   - whether worker lanes are useful,
   - how to apply local-optimum pressure before completion.
3. Create repo-local harness artifacts under `.omg/harness/<slug>/`.
4. Tell the user the recommended `create_goal` prompt from `goal-prompt.md`.
5. If Codex goal tools are available, inspect `get_goal` first. Call `create_goal` only when there is no conflicting active goal and the user wants to start execution.

## Artifact Generator

After the interview, prefer the bundled generator:

```sh
node <plugin-root>/scripts/create-harness.mjs \
  --objective "<objective>" \
  --answers-json '<json object with interview answers>'
```

When this skill is loaded from the plugin, `<plugin-root>` is two directories above this `SKILL.md`. If running the script is unavailable, create the same files manually.

The required files are:

- `context-index.md` - first file the goal should read.
- `deep-interview.md` - decisions, assumptions, and unresolved questions.
- `goal-prompt.md` - final recommended Codex `create_goal` objective.
- `harness.md` - execution lifecycle and state contract.
- `agents.md` - leader and worker lane responsibilities.
- `orchestration.md` - how to use subagents or sequential lanes.
- `local-optimum-pressure.md` - perturbation, critique, and basin-escape protocol.
- `completion-gate.md` - evidence required before `update_goal({status: "complete"})`.

## Goal Prompt Rules

The recommended goal prompt must:

- keep one Codex goal as the single top-level objective,
- include the original objective, acceptance criteria, non-goals, and verification,
- require the leader to use the harness artifacts in `.omg/harness/<slug>/`,
- require at least two independent trajectories before major commitment,
- require an adversarial review and basin-escape challenge before completion,
- state that only the leader may call `update_goal({status: "complete"})`.

## Orchestration Rules

Use available Codex subagent, agent, or task tools only as evidence lanes. Workers may research, implement, test, critique, or replan, but they must not call `create_goal`, must not call `update_goal`, and must not mark the whole mission complete. If no multi-agent runtime is available, run the same lanes sequentially and record results in the harness files.

## Local-Optimum Pressure

Before selecting a plan or finishing, force the current path to compete against alternatives:

- generate at least two materially different trajectories,
- include one conservative baseline and one novelty-seeking or constraint-inverting path,
- run a critic pass that tries to disprove completion,
- add a perturbation when the same blocker repeats,
- reject novelty unless it improves evidence against the acceptance checks.

## Completion Boundary

Do not mark the Codex goal complete until the harness has:

- objective-to-artifact audit,
- implementation or research evidence,
- external verification output,
- adversarial review with unresolved blockers cleared,
- passed basin-escape challenge comparing at least two alternatives.
