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

Build the question round with the bundled OMX-derived question engine:

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

For a visible blocking UI, prefer the bundled runtime:

```sh
node <plugin-root>/scripts/intake-question-runtime.mjs \
  --objective "<objective>" \
  --mode auto \
  --json
```

In attached tmux, it opens a separate question pane and returns structured answers. Outside tmux, use native structured input when available. When structured input is unavailable, render the same payload with `--format markdown`, use `templates/intake-fallback.md` as the output shape, and wait for one user reply.

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
