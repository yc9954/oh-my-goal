# Intake Gate

The intake gate ports the useful behavior from OMX `$deep-interview` and `$prometheus-strict`.

## Preflight

Before asking the user, inspect only focused context:

- current working directory and whether it is a git repo,
- top-level files such as `README*`, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, or `docs/**`,
- existing `.omg/harness/**` for continuation state.

Do not scan `node_modules`, generated caches, build outputs, or vendor trees unless explicitly relevant.

## Ambiguity Map

Build a private ambiguity map before asking. Cover:

- objective,
- scope in/out,
- acceptance evidence,
- verification path,
- handoff target,
- non-goals,
- decision boundaries.

Do not show a long analysis dump. Ask only the independent high-leverage questions that would materially change the harness.

## Structured Intake

Path rule: `<plugin-root>` is two directories above this skill directory. Use `<plugin-root>/scripts/intake-question-engine.mjs`, not `skills/oh-my-goal/scripts/intake-question-engine.mjs`.

Build the question payload with the bundled OMX-derived question engine:

```sh
node <plugin-root>/scripts/intake-question-engine.mjs \
  --objective "<objective>" \
  --format payload
```

The payload must use canonical OMX question fields:

- `questions[]` for the batched round,
- `type: "single-answerable"` for mutually exclusive choices,
- `type: "multi-answerable"` for coexisting constraints or non-goals,
- `allow_other` only when one user-supplied option is genuinely useful,
- `answers[]` and `answers[i].answer.selected_values` as the source of truth after the answer.

For the user-facing intake, run the bundled runtime in `auto` mode first:

```sh
node <plugin-root>/scripts/intake-question-runtime.mjs \
  --objective "<objective>" \
  --mode auto \
  --json
```

In attached tmux, `auto` opens a separate arrow-key question pane. On macOS outside tmux, it can open a Terminal question window with the same selector. The UI ports OMX `src/question/ui.ts` behavior: ↑↓ movement, Enter selects single-answer questions, Space toggles `multi-answerable`, Enter/→ advances multi-answer questions, and ← goes back.

If `auto` returns `ok: false`, `interactive: true`, and `status: "prompting"`, tell the user to answer in that window and stop. Do not ask the text fallback question too. On the next user turn, read the record:

```sh
node <plugin-root>/scripts/intake-question-runtime.mjs \
  --mode status \
  --state-path "<record_path>" \
  --json
```

If status returns `ok: true`, use those `answers[]` directly and continue to gap-fill.

When no interactive renderer can be opened, `auto` returns the sequential fallback with the current ambiguity score. Ask only `prompt` from the JSON result, then stop. Keep `record_path` in context. When the user answers, continue with:

```sh
node <plugin-root>/scripts/intake-question-runtime.mjs \
  --mode sequential-answer \
  --state-path "<record_path>" \
  --answer "<user selection>" \
  --json
```

If the result is still `status: "prompting"`, ask the next `prompt` and stop again. If the result has `ok: true`, use its `answers[]` as the approved intake answers.
Do not fall back to a batched questionnaire unless the user explicitly asks for all questions at once. The Markdown schema block is only a last-resort diagnostic fallback.

For PRD/spec/planning requests, ask about:

- deliverable scope: current product PRD, next-version PRD, single-feature PRD, or goal-execution prompt,
- primary reader: builder/PM, stakeholder, external user/investor, or Codex goal executor,
- source context: repo only, repo plus user answers, or repo plus external research,
- non-goals: no implementation yet, no broad refactor, no new dependencies, or no external release action,
- verification: Markdown inspection, repo checks, stakeholder review, or full test suite,
- handoff target: goal prompt only, goal plus team lanes, PRD only, or implementation after approval.

For implementation requests, still ask intake before writing code. Adapt the same slots to scope, stack, UX, functionality, verification, and output mode.

## Gap-Fill Passes

After the user answers:

1. Assimilate answers into scope, non-goals, acceptance, verification, and handoff target.
2. Rescan repo context, prior turns, and conservative defaults for residual critical gaps.

Ask a second round only for surviving critical ambiguity.
