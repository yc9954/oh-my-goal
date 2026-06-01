# OMG Port Map

Oh My Goal must port from Oh My Goal source-of-truth modules, then adapt only the transport and Codex-goal boundary.

## Question Intake

- Source of truth: `src/question/types.ts`, `src/question/ui.ts`, `src/question/state.ts`, `src/question/renderer.ts`, `src/cli/question.ts`.
- Plugin port: `plugins/oh-my-goal/scripts/intake-question-engine.mjs`, `plugins/oh-my-goal/scripts/question-core.mjs`, `plugins/oh-my-goal/scripts/intake-question-runtime.mjs`.
- Rule: schema normalization, answer shape, wizard key handling, review screen, Other handling, and numeric fallback come from Oh My Goal. Oh My Goal may add objective classification, residual ambiguity, cmux transport, and harness-specific follow-up questions.
- Drift check: if `src/question/ui.ts` changes, compare and update `question-core.mjs` before changing intake behavior.

## Deep Interview

- Source of truth: `src/question/deep-interview.ts`, `src/question/policy.ts`, `src/question/autopilot-wait.ts`.
- Plugin adaptation: first turn remains intake-only; generated harness records the answers and recommended Codex goal prompt.
- Rule: the plugin must not silently skip intake by filling defaults. Defaults are allowed only when the user explicitly selects or approves them.

## Team Orchestration

- Source of truth: `src/team/tmux-session.ts`, `src/team/runtime.ts`, `src/team/runtime-cli.ts`, `src/team/state/*`, `src/team/worker-bootstrap.ts`.
- Plugin core port: `plugins/oh-my-goal/scripts/team-core.mjs`.
- Plugin bridge: `plugins/oh-my-goal/scripts/team-runtime.mjs`.
- Rule: workers are evidence lanes. They never call `create_goal` or `update_goal`; the leader owns the single Codex goal.
- State rule: keep `config.json`, `manifest.json`, task files, worker identity, worker status, and worker prompt shape aligned with the Oh My Goal Team contracts. Do not put these contracts in cmux/tmux renderer code.
- Transport adaptation: tmux behavior should follow Oh My Goal where available. cmux is a transport adapter with equivalent visible panes, worker titles, durable packets, and result files.

## Local-Optimum Pressure

- Source of truth: `src/goal-harness/policy.ts`, `src/goal-harness/runtime.ts`, `src/goal-harness/perturbation.ts`, and the goal-harness completion gate.
- Plugin runtime: `plugins/oh-my-goal/scripts/pressure-runtime.mjs`.
- Rule: pressure must be runtime-enforced, not only Markdown prose. Completion is blocked until there is an accepted evidence-backed trajectory, at least two independent evidence-backed trajectories, critic/tester/replanner pressure evidence, no unresolved repeated blocker, and passing completion evidence.
- Team connection: pressure runtime creates the search contract; Team runtime provides optional visible worker lanes to produce independent evidence.

## Harness Artifacts

- Source of truth: Oh My Goal goal/team/deep-interview contracts plus Codex goal constraints.
- Plugin generator: `plugins/oh-my-goal/scripts/create-harness.mjs`.
- Required outputs: `goal-prompt.md`, `execution-spec.md`, `orchestration.md`, `completion-gate.md`, `trajectory-ledger.md`, `runtime-commands.md`, and worker packet templates.

## Non-Negotiables

- Do not invent a second question schema.
- Do not create a plugin-only team model when an Oh My Goal contract can be ported.
- Keep cmux-specific code behind adapter functions.
- Add or update tests whenever a plugin behavior intentionally differs from Oh My Goal.
