# Intake Gate

The intake gate runs Oh My Goal's structured deep interview.

## Optional Capability Preflight

Before structured intake, run the user-facing optional setup offer:

```sh
node <plugin-root>/scripts/openai-key-runtime.mjs offer --cwd "<cwd>" --keys OPENAI_API_KEY,ZEP_API_KEY --json
```

If an attached terminal is available and keys are missing, run the same command with `--execute`. It asks whether to enable each optional capability, hidden-inputs only accepted keys, writes them to uncommitted `.env.local`, updates `.gitignore`, and records redacted status. Missing or skipped keys do not block Codex-native intake. They only mean local Node-based LLM question generation and later Zep-backed memory features are unavailable until configured. Do not ask for raw API key values in chat. If the selected plan requires deployed secrets, route setup through Vercel env, dashboard env, or shell env instead of chat.

## Preflight

Before asking the user, run a repository-aware review pass over the current folder:

- current working directory and whether it is a git repo,
- top-level files such as `README*`, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, or `docs/**`,
- existing `.omg/harness/**` for continuation state.

Do not scan `node_modules`, generated caches, build outputs, or vendor trees unless explicitly relevant.

The question engine should use that review as question-generation context. When `OPENAI_API_KEY` is configured, let the LLM add repo-specific high-leverage questions; if the LLM is unavailable, use the deterministic repo-aware fallback questions. Do not mix demo, calculator, or dummy survey content into real project questions unless the objective explicitly asks for it.

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

## Quality Frontier And Pruning

After ambiguity-reduction questions, the intake must also run a quality-pruning stage. This stage is not the same as acceptance testing. It asks what "better" could mean for this objective, then prunes that wider search space before worker lanes start.

Cover at least:

- `qualityFrontier`: candidate quality lenses such as user workflow, reliability, maintainability, verification depth, extensibility, stakeholder clarity, or risk reduction.
- `qualityPruning`: which quality directions should survive into the execution strategy.
- `pruningRule`: the rule for cutting low-leverage, speculative, or scope-expanding improvements.

The runtime may ask these as baseline questions or append them as follow-ups after ambiguity falls below threshold. `ok: true` requires both low residual ambiguity and completed quality pruning.

## Web App, Secret, Auth, And Deployment Decisions

For website/app requests, also cover:

- `deploymentTarget`: Vercel preview, Vercel production, deployment-plan-only, or no deployment.
- `llmApi`: no LLM API, OpenAI API, OpenAI-compatible API, or decide after spec.
- `authProvider`: no auth, Clerk, Auth.js/NextAuth, Supabase Auth, or custom auth.
- `secretHandling`: Vercel secure prompt, `.env.example` only, existing env only, or no secrets.
- `credentialSetup`: secure terminal prompt, already configured Vercel env, already configured local env, `.env.example` then pause, or no credentials.
- `designSystemMode`: generate full design system, lightweight checklist, match existing design system, or skip.

Do not ask for raw API key values in chat. If the user wants to enter keys, route them through secure terminal prompts, Vercel env commands, dashboard setup, shell env, or uncommitted `.env.local`.

## Structured Intake

Path rule: `<plugin-root>` is two directories above this skill directory. Use `<plugin-root>/scripts/intake-question-engine.mjs`, not `skills/oh-my-goal/scripts/intake-question-engine.mjs`.

Build the question payload with the bundled Oh My Goal question engine:

```sh
node <plugin-root>/scripts/intake-question-engine.mjs \
  --objective "<objective>" \
  --cwd "<cwd>" \
  --repo-review \
  --llm auto \
  --format payload
```

The payload must use canonical Oh My Goal question fields:

- `questions[]` for the batched round,
- `type: "single-answerable"` for mutually exclusive choices,
- `type: "multi-answerable"` for coexisting constraints or non-goals,
- `allow_other` only when one user-supplied option is genuinely useful,
- `answers[]` and `answers[i].answer.selected_values` as the source of truth after the answer.

Locale rule: when the objective contains Korean text, the engine renders user-visible `question`, option `label`, option `description`, and `other_label` in Korean. Keep `id`, `value`, `selected_values`, `type`, and `multi_select` canonical and English-compatible.

For the user-facing intake, run the bundled runtime in `auto` mode first:

```sh
node <plugin-root>/scripts/intake-question-runtime.mjs \
  --objective "<objective>" \
  --cwd "<cwd>" \
  --repo-review \
  --llm auto \
  --mode auto \
  --json
```

Inside cmux, `auto` opens a focused in-workspace question pane. In attached tmux, it opens a separate arrow-key question pane. On macOS outside cmux/tmux, it can open a Terminal question window with the same selector. These temporary question surfaces close themselves after the final answer is recorded and the leader is notified. The UI core provides ↑↓ movement, Enter selects the current option, Space toggles `multi-answerable`, → advances the current question in the wizard, and ← goes back.

If `auto` reports `cmux_socket_permission_blocked`, cmux is present but Codex's seatbelt sandbox cannot connect to `cmux.sock`. Do not downgrade to inline questions until the user declines the bridge. Tell the user to start `scripts/cmux-bridge-runtime.mjs start --cwd "$PWD" --root .omg/runtime/cmux-bridge` from a normal cmux/terminal surface outside Codex, then retry the intake runtime. The bridge keeps the same realtime behavior: cmux question pane creation, answer return, and temporary pane cleanup are proxied through request/result files.

If `auto` returns `ok: false`, `interactive: true`, and `status: "prompting"`, tell the user to answer in that window and stop. Do not ask the text fallback question too. On the next user turn, read the record:

```sh
node <plugin-root>/scripts/intake-question-runtime.mjs \
  --mode status \
  --state-path "<record_path>" \
  --json
```

If status returns `ok: true`, use those `answers[]` directly and continue to gap-fill. `ok: true` means the runtime has driven residual ambiguity below threshold and completed quality pruning, or reached an explicit user-approved stopping condition.

When no interactive renderer can be opened, `auto` returns the sequential fallback with the current ambiguity score. Ask only `prompt` from the JSON result, then stop. Keep `record_path` in context. When the user answers, continue with:

```sh
node <plugin-root>/scripts/intake-question-runtime.mjs \
  --mode sequential-answer \
  --state-path "<record_path>" \
  --answer "<user selection>" \
  --json
```

If the result is still `status: "prompting"`, ask the next `prompt` and stop again. The prompt may be question 8+ because the runtime appends follow-up questions when the baseline answers leave residual ambiguity above threshold or the quality-pruning stage is incomplete. If the result has `ok: true`, use its `answers[]`, `residual_ambiguity`, and `quality_pruning` as the approved intake record.
Do not fall back to a batched questionnaire unless the user explicitly asks for all questions at once. The Markdown schema block is only a last-resort diagnostic fallback.

For PRD/spec/planning requests, ask about:

- deliverable scope: current product PRD, next-version PRD, single-feature PRD, or goal-execution prompt,
- primary reader: builder/PM, stakeholder, external user/investor, or Codex goal executor,
- source context: repo only, repo plus user answers, or repo plus external research,
- non-goals: no implementation yet, no broad refactor, no new dependencies, or no external release action,
- verification: Markdown inspection, repo checks, stakeholder review, or full test suite,
- handoff target: goal prompt only, goal plus team lanes, PRD only, or implementation after approval.

For implementation requests, still ask intake before writing code. Adapt the same slots to scope, stack, UX, functionality, verification, output mode, design-system, LLM/API, auth, secret handling, credential setup, and deployment.

## Gap-Fill Passes

After the user answers:

1. Assimilate answers into scope, non-goals, acceptance, verification, and handoff target.
2. Rescan repo context, prior turns, and conservative defaults for residual critical gaps.
3. Expand the quality frontier, then prune candidates into a small execution strategy before harness generation.

Ask another round only for surviving critical ambiguity. The runtime should keep adding focused follow-up questions until `residual_ambiguity.score` is below threshold, rather than stopping just because the baseline questionnaire ended.
