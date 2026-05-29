# OMX Port Map

Oh My Goal must port from OMX source-of-truth modules, then adapt only the transport and Codex-goal boundary.

## Question Intake

- Source of truth: `src/question/types.ts`, `src/question/ui.ts`, `src/question/state.ts`, `src/question/renderer.ts`, `src/cli/question.ts`.
- Plugin port: `plugins/oh-my-goal/scripts/intake-question-engine.mjs`, `plugins/oh-my-goal/scripts/omx-question-core.mjs`, `plugins/oh-my-goal/scripts/intake-question-runtime.mjs`.
- Rule: schema normalization, answer shape, wizard key handling, review screen, Other handling, and numeric fallback come from OMX. Oh My Goal may add objective classification, residual ambiguity, cmux transport, and harness-specific follow-up questions.
- Drift check: if `src/question/ui.ts` changes, compare and update `omx-question-core.mjs` before changing intake behavior.

## Deep Interview

- Source of truth: `src/question/deep-interview.ts`, `src/question/policy.ts`, `src/question/autopilot-wait.ts`.
- Plugin adaptation: first turn remains intake-only; generated harness records the answers and recommended Codex goal prompt.
- Rule: the plugin must not silently skip intake by filling defaults. Defaults are allowed only when the user explicitly selects or approves them.

## Team Orchestration

- Source of truth: `src/team/tmux-session.ts`, `src/team/runtime.ts`, `src/team/runtime-cli.ts`, `src/team/state/*`, `src/team/worker-bootstrap.ts`.
- Plugin bridge: `plugins/oh-my-goal/scripts/team-runtime.mjs`.
- Rule: workers are evidence lanes. They never call `create_goal` or `update_goal`; the leader owns the single Codex goal.
- Transport adaptation: tmux behavior should follow OMX where available. cmux is a transport adapter with equivalent visible panes, worker titles, durable packets, and result files.

## Harness Artifacts

- Source of truth: OMX goal/team/deep-interview contracts plus Codex goal constraints.
- Plugin generator: `plugins/oh-my-goal/scripts/create-harness.mjs`.
- Required outputs: `goal-prompt.md`, `execution-spec.md`, `orchestration.md`, `completion-gate.md`, `trajectory-ledger.md`, `runtime-commands.md`, and worker packet templates.

## Non-Negotiables

- Do not invent a second question schema.
- Do not create a plugin-only team model when an OMX contract can be ported.
- Keep cmux-specific code behind adapter functions.
- Add or update tests whenever a plugin behavior intentionally differs from OMX.
