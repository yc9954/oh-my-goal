---
name: oh-my-goal
description: Codex-native goal harness bootstrap. Use when the user invokes `$oh-my-goal <objective>` or wants to define a development objective, run OMX-style structured deep interview, create repo-local Markdown harness artifacts, recommend a create_goal prompt, and set up agent/orchestration plus local-optimum pressure without relying on an omx launcher.
---

# Oh My Goal

Use `$oh-my-goal <objective>` to turn a vague development idea into a Codex goal-ready harness. Treat any text after `$oh-my-goal` as the objective and do not ask for it again. This skill is plugin-first: do not require `omx`, `omg`, tmux, or a shell launcher.

The product should still reuse the good OMX ideas: leader/worker separation, Team-style evidence lanes, worker packet templates, trajectory scoring, persistent state notes, critic pressure, and strict completion gates. The boundary is that those ideas are encoded as plugin guidance and repo-local Markdown artifacts, not as a required OMX runtime.

## Mandatory Interview Gate

The first `$oh-my-goal <objective>` response is an intake turn, not an execution turn. After repo/context preflight, ask the structured intake questions and then stop. Do not create harness files, run the artifact generator, write implementation files, call `create_goal`, or start coding until the user answers the intake questions.

Only skip this gate when the user explicitly says to use defaults, skip questions, or proceed without interview. If the surface has no structured input tool, ask a numbered prose block with compact choices and wait for one user reply containing the answers.

## OMX-Derived Behavior

Port the useful behavior from OMX `$deep-interview`, `$prometheus-strict`, and `$ralplan`:

- Parse trailing arguments like `$oh-my-goal ralpli PRD 작성` as the initial objective.
- Run preflight repo/context intake before asking the user about facts that can be discovered.
- Build an ambiguity map covering objective, scope in/out, acceptance, verification, handoff target, non-goals, and decision boundaries.
- Batch independent high-leverage questions into one structured form when the surface supports it.
- When structured input is unavailable, ask a numbered prose block and wait for all answers in one user turn.
- After answers, run two gap-fill passes: assimilate answers, then rescan repo/prior context/defaults for residual critical gaps.
- Use Metis-style clarification, Momus-style critique, and Oracle-style synthesis as planning voices, without copying OMX runtime state or requiring `omx question`.

## Flow

1. If the invocation has trailing text, use it as the objective. If not, ask exactly one opening question:
   `What do you want to build or improve?`
2. Inspect repo context first with focused reads; do not scan `node_modules`, generated caches, or vendor trees unless explicitly relevant.
3. Present an OMX-style structured intake round for unresolved material ambiguity. Use choices where possible, and include an `Other` path only when a user-supplied answer is genuinely needed. End the turn immediately after the questions.
4. After the user answers, run gap-fill and critique. Ask another round only for surviving critical ambiguity.
5. Create repo-local harness artifacts under `.omg/harness/<slug>/`.
6. Tell the user the recommended `create_goal` prompt from `goal-prompt.md`.
7. If Codex goal tools are available, inspect `get_goal` first. Call `create_goal` only when there is no conflicting active goal and the user wants to start execution.

## Structured Intake Round

For common PRD/spec/planning requests, the first round should normally ask these independent questions together:

- deliverable scope: current product PRD, next-version PRD, single-feature PRD, or goal-execution prompt.
- primary reader: builder/PM, stakeholder, external user/investor, or Codex goal executor.
- source context: repo only, repo plus user answers, repo plus external research.
- non-goals: no implementation yet, no broad refactor, no new dependencies, no external release action.
- verification: Markdown inspection, repo checks, stakeholder review, or full test suite.
- handoff target: goal prompt only, goal plus team lanes, PRD only, or implementation after approval.

If the request is not PRD/spec/planning, adapt the same slots to the task domain. Keep the first round short enough to answer in one turn.

For implementation requests, still run the first intake round before writing code. Example compact fallback:

```text
Before I create files, answer these in one line:
1. Scope: A minimal / B polished / C full-featured
2. Stack: A static HTML/CSS/JS / B React/Vite / C match existing repo
3. UX: A clean app / B platform-inspired / C domain-specific
4. Functionality: A basic / B keyboard + edge cases / C history/settings
5. Verification: A browser check / B tests / C both
6. Output: A implement now / B harness only / C spec first

Reply like: 1B 2A 3A 4B 5C 6A
```

## Artifact Generator

After the interview, prefer the bundled generator. Do not pass synthetic default answers. Use `--interview-complete` only after the user has answered the intake or explicitly approved defaults:

```sh
node <plugin-root>/scripts/create-harness.mjs \
  --objective "<objective>" \
  --interview-complete \
  --answers-json '<json object with interview answers>'
```

When this skill is loaded from the plugin, `<plugin-root>` is two directories above this `SKILL.md`. If running the script is unavailable, create the same files manually.

The required files are:

- `context-index.md` - first file the goal should read.
- `ambiguity-map.md` - OMX-style ambiguity dimensions, defaults, and critical gaps.
- `intake-questionnaire.md` - structured questions, choices, and recorded answers.
- `deep-interview.md` - decisions, assumptions, and unresolved questions.
- `goal-prompt.md` - final recommended Codex `create_goal` objective.
- `harness.md` - execution lifecycle and state contract.
- `agents.md` - leader and worker lane responsibilities.
- `orchestration.md` - how to use subagents or sequential lanes.
- `team-system.md` - Team-style lane protocol without requiring OMX Team.
- `worker-packet-template.md` - reusable worker instruction/result packet.
- `trajectory-ledger.md` - candidate path comparison table.
- `state-ledger.md` - persistent leader-loop checkpoint log.
- `local-optimum-pressure.md` - perturbation, critique, and basin-escape protocol.
- `completion-gate.md` - evidence required before `update_goal({status: "complete"})`.

## Goal Prompt Rules

The recommended goal prompt must:

- keep one Codex goal as the single top-level objective,
- include the original objective, acceptance criteria, non-goals, and verification,
- require the leader to use the harness artifacts in `.omg/harness/<slug>/`,
- require Team-style evidence lanes when the task benefits from independent work,
- require at least two independent trajectories before major commitment,
- require an adversarial review and basin-escape challenge before completion,
- state that only the leader may call `update_goal({status: "complete"})`.

## Orchestration Rules

Use available Codex subagent, agent, or task tools only as evidence lanes. Workers may research, implement, test, critique, or replan, but they must not call `create_goal`, must not call `update_goal`, and must not mark the whole mission complete. If no multi-agent runtime is available, run the same lanes sequentially and record results in `worker-packet-template.md`, `trajectory-ledger.md`, and `state-ledger.md`.

Carry forward these OMX-style strengths:

- **Leader owns the goal**: one session owns goal state, plan selection, and completion.
- **Workers own evidence**: workers return facts, diffs, tests, risks, blockers, and scores.
- **Packets over vibes**: every lane gets a task, boundary, expected output, and result template.
- **Trajectory competition**: compare candidate paths before selecting one.
- **Backpressure**: critic/tester/replanner lanes are first-class, not afterthoughts.
- **Durable state**: decisions and checkpoints are written to Markdown so the Codex goal can resume from files.

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
