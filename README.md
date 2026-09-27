<h1 align="center">Oh My Goal</h1>

<p align="center">
  <a href="https://github.com/yc9954/oh-my-goal"><img src="https://img.shields.io/github/stars/yc9954/oh-my-goal?style=flat&amp;label=%E2%98%85&amp;color=4493F8" alt="GitHub stars" /></a>
  <a href="https://github.com/yc9954/oh-my-goal/actions/workflows/ci.yml"><img src="https://github.com/yc9954/oh-my-goal/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/Codex%20plugin-%24oh--my--goal-4493F8?style=flat" alt="Codex plugin: $oh-my-goal" />
  <img src="https://img.shields.io/badge/Node%2020%2B%20%C2%B7%20TypeScript%206-4493F8?style=flat" alt="Node 20+, TypeScript 6" />
  <img src="https://img.shields.io/badge/version-0.18.29-4493F8?style=flat" alt="version 0.18.29" />
</p>

<p align="center">
  <strong>One Codex goal. A repo-local harness. Pressure against the first plausible answer.</strong><br/>
  Oh My Goal is a Codex-native plugin skill for long-running work. <code>$oh-my-goal &lt;objective&gt;</code> runs a structured intake,<br/>
  writes Markdown harness artifacts under <code>.omg/harness/&lt;slug&gt;/</code>, recommends a <code>create_goal</code> prompt, and gives the leader<br/>
  optional worker lanes, design and deployment gates, and a completion gate it cannot skip.
</p>

<h3 align="center"><a href="#getting-started"><ins>Getting started</ins></a> · <a href="plugins/oh-my-goal/skills/oh-my-goal/FLOW.md">The flow</a></h3>

## Features

- **Plugin-first.** The primary surface is the `oh-my-goal` Codex plugin skill. Text after `$oh-my-goal` is the objective; the plugin never asks for it again. The `omg` CLI remains as a compatibility helper, but no separate launcher is required.
- **Intake before anything else.** The first response is a questionnaire, not an execution turn. The plugin does not create harness files, write implementation files, or call `create_goal` until the questions are answered or the user explicitly says to use defaults ("proceed" is not enough).
- **Two-stage question engine.** `intake-question-engine.mjs` reduces ambiguity first, then expands and prunes quality-improvement candidates so the goal does not converge on the first plausible path. Korean objectives get Korean question and option text while canonical IDs and `selected_values` stay in English.
- **Interactive intake where a surface exists.** Inside cmux it opens an in-workspace selector pane; inside attached tmux a separate question pane; on macOS a Terminal selector window. Without any of those it asks one sequential question at a time until residual ambiguity is low and quality pruning is complete.
- **A harness you can read.** Generation writes `objective.txt`, `ambiguity-map.md`, `deep-interview.md`, `execution-spec.md`, `quality-frontier.md`, `pruning-matrix.md`, `selected-strategy.md`, `design-system.md`, `deployment.md`, `secrets-and-auth.md`, `goal-prompt.md`, `agents.md`, `orchestration.md`, `team-system.md`, `trajectory-ledger.md`, `state-ledger.md`, `local-optimum-pressure.md`, `completion-gate.md`, `runtime-commands.md` and a `plugin-root-resolver.mjs` that never embeds a machine-specific cache path.
- **Visible worker lanes.** `team-runtime.mjs` writes worker packets under `.omg/runtime/team/<team>/` and opens cmux or tmux panes for leader, architect, designer, implementer, tester, deployer, critic and replanner roles. `tick` and `watch` rebalance work, create follow-ups for revise/reject/block results, reclaim stale lanes and scale bounded dynamic lanes.
- **Runtime-enforced pressure.** `pressure-runtime.mjs` forces evidence-backed baseline/novelty/critic trajectories, imports Team `result.md` files, creates perturbations for repeated blockers, and blocks completion until `gate` passes.
- **Design and deployment gates for web work.** `design-system-runtime.mjs` ports the useful UI/UX Pro Max snippets (BM25-style domain search, product classification, style/color/typography matching, token architecture, `MASTER.md` persistence) into a project-specific `design-system.md`. `deployment-runtime.mjs` writes `deployment.md`, `.env.example` placeholders and `secrets-and-auth.md` for Vercel, OpenAI-compatible keys and auth providers; `deploy` is a dry run unless the leader passes `--execute` after tests, build, auth and secret readiness are proven.
- **Secrets never touch chat.** `openai-key-runtime.mjs` preflights `OPENAI_API_KEY` and `ZEP_API_KEY`; with `--execute` in an attached terminal it takes hidden input, writes only to `.env.local`, keeps `.env*.local` in `.gitignore`, and records redacted status. Missing keys do not block intake.

---

## How it works

```text
$oh-my-goal <objective>
        │
        ▼
openai-key-runtime.mjs offer ─── optional key preflight (hidden input, .env.local only)
        │
        ▼
intake-question-engine.mjs ──▶ intake-question-runtime.mjs (cmux pane · tmux pane · macOS Terminal · sequential)
   stage 1: reduce ambiguity          stage 2: expand + prune quality candidates
        │
        ▼  answers approved by the user
create-harness.mjs --interview-complete --answers-json …
        │
        ▼
.omg/harness/<slug>/  ── goal-prompt.md ──▶ create_goal (leader session owns the goal)
        │                     │
        │                     ├─ team-runtime.mjs launch / tick / watch ──▶ .omg/runtime/team/<team>/ + cmux/tmux panes
        │                     ├─ pressure-runtime.mjs init / record / perturb / import-team / gate
        │                     ├─ design-system-runtime.mjs ──▶ design-system.md
        │                     └─ deployment-runtime.mjs plan / check / setup-env / deploy
        ▼
completion-gate.md: objective audit · implementation evidence · external verification ·
                    quality-pruning evidence · adversarial review · basin-escape check
```

1. **Preflight.** The skill reads `FLOW.md`, then offers to capture optional API keys without ever printing them into Codex chat or harness Markdown.
2. **Intake.** Questions come from the engine's canonical schema (`questions[]`, `single-answerable` / `multi-answerable`, `answers[]`, `selected_values`). Intake continues until ambiguity is low and quality pruning is done; it is skipped only on an explicit "skip interview" or "use defaults without asking".
3. **Generate.** `create-harness.mjs` runs only with `--interview-complete` and the user-approved answers. `goal-prompt.md` stays compact enough for Codex goal objective limits; the full request lives in `objective.txt` and runtime commands read it from there.
4. **Hand off.** The leader checks the active Codex goal and uses `goal-prompt.md` as the `create_goal` payload. Workers never call `create_goal` or `update_goal`; they return evidence, diffs, blockers, risks, test output and candidate trajectory scores.
5. **Orchestrate under pressure.** The generated prompt points the leader at `runtime-commands.md` and auto-starts the Team runtime when lanes are useful. Execution is treated as trajectory search: baseline, novelty and critic trajectories are recorded, compared and perturbed before the gate.

<details>
<summary><strong>The skill layout</strong></summary>

```text
plugins/oh-my-goal/skills/oh-my-goal/
  SKILL.md                         the non-negotiable gate; points Codex to FLOW.md
  FLOW.md
  flows/00-entrypoint.md
  flows/01-intake-gate.md
  flows/02-artifact-generation.md
  flows/03-goal-handoff.md
  flows/04-orchestration.md
  templates/first-turn-response.md
  templates/intake-fallback.md
  templates/worker-packet.md
  references/omg-patterns.md
  references/omg-port-map.md
  references/ui-ux-pro-max-analysis.md
```

Scripts live two levels up at `plugins/oh-my-goal/scripts/*.mjs`, are plain Node with no dependencies, and are runnable from a Codex plugin cache path. The generated `plugin-root-resolver.mjs` checks `OH_MY_GOAL_PLUGIN_ROOT`, repo-local `plugins/oh-my-goal`, an installed `oh-my-goal` package, and Codex plugin cache locations.

</details>

<details>
<summary><strong>When cmux is blocked by the Codex sandbox</strong></summary>

If Codex reports `cmux_socket_permission_blocked`, cmux is healthy but the Codex seatbelt sandbox cannot connect to `cmux.sock`. Start the file bridge once from a normal cmux or terminal surface outside the sandbox, leave it running, then retry the same `$oh-my-goal` request:

```bash
node plugins/oh-my-goal/scripts/cmux-bridge-runtime.mjs start \
  --cwd "$PWD" \
  --root .omg/runtime/cmux-bridge
```

The bridge proxies `identify`, `new-pane`, `send`, `rename-tab`, `close-surface` and related commands through `.omg/runtime/cmux-bridge/` request/result files, so intake panes still close themselves and Team `watch`/`tick` can still notify, close and reopen worker panes.

</details>

---

## Tech stack

<p>
  <kbd>Codex&nbsp;CLI&nbsp;plugin</kbd> &nbsp; <kbd>Node&nbsp;20+</kbd> &nbsp; <kbd>TypeScript&nbsp;6</kbd> &nbsp; <kbd>plain&nbsp;.mjs&nbsp;runtimes</kbd> &nbsp; <kbd>zod</kbd> &nbsp; <kbd>@modelcontextprotocol/sdk</kbd> &nbsp; <kbd>Biome</kbd> &nbsp; <kbd>node:test</kbd> &nbsp; <kbd>cmux&nbsp;/&nbsp;tmux</kbd>
</p>

---

## Getting started

**Prerequisites**

- Codex CLI (`codex --version`) with plugin support.
- Node.js 20 or newer for the runtime scripts and local development.
- Optional: cmux or tmux for visible intake and worker panes; Vercel CLI for the deployment runtime; `OPENAI_API_KEY` for LLM-generated repo-review questions.

**Install the plugin from GitHub**

```bash
codex plugin marketplace add yc9954/oh-my-goal --ref main
codex plugin add oh-my-goal@oh-my-goal-local
```

Then, in Codex:

```text
$oh-my-goal ralpli PRD 작성하고 싶어
```

Answer the questionnaire. Once intake is complete the harness lands in `.omg/harness/<slug>/` and the leader is pointed at `goal-prompt.md`.

**Run the pieces by hand**

```bash
# key preflight (add --execute in an attached terminal to capture keys with hidden input)
node plugins/oh-my-goal/scripts/openai-key-runtime.mjs ensure --cwd "$PWD" --keys OPENAI_API_KEY,ZEP_API_KEY --json

# generate the intake payload for an objective (Korean text → Korean display, English IDs)
node plugins/oh-my-goal/scripts/intake-question-engine.mjs --objective "계산기 앱을 웹사이트 형태로 만들어줘" --format payload
node plugins/oh-my-goal/scripts/intake-question-runtime.mjs --objective "계산기 앱을 웹사이트 형태로 만들어줘" --mode auto --json

# worker lanes and the leader-side loop
node plugins/oh-my-goal/scripts/team-runtime.mjs launch --objective "implement UI, write tests, update docs" --workers 3 --mode auto --json
node plugins/oh-my-goal/scripts/team-runtime.mjs tick --team implement-ui-write-tests-updat --pressure-slug example --json

# local-optimum pressure
node plugins/oh-my-goal/scripts/pressure-runtime.mjs init --objective "implement UI, write tests, update docs" --slug example --json

# add quality-pruning files to a harness created before they existed
node plugins/oh-my-goal/scripts/migrate-quality-pruning.mjs --slug old-harness --apply --json
```

| Variable | What it does |
| --- | --- |
| `OPENAI_API_KEY` | Optional. Enables LLM repo-review questions during intake. Captured into `.env.local` by the key runtime, never printed. |
| `ZEP_API_KEY` | Optional. Preflighted alongside the OpenAI key. |
| `OH_MY_GOAL_PLUGIN_ROOT` | Overrides where generated harnesses look for the plugin scripts. |

---

## Building and testing

```bash
npm install
npm run build                 # tsc → dist/, makes dist/cli/omg.js executable
npm run lint                  # biome lint src
npm run check:no-unused       # stricter unused-code tsconfig
npm run verify:plugin-bundle  # validates the packaged plugin structure and public surface
npm run test:node             # node --test: plugin, package contract, goal harness and workflow suites
npm test                      # build + verify + test:node
npm run smoke:packed-install  # packs the tarball and installs it into a temp project
```

CI ([`ci.yml`](.github/workflows/ci.yml)) runs build, lint, unused-code check, plugin-bundle verification, the Node tests and `npm pack --dry-run` on every push to `main` and every pull request. To develop the plugin against a local checkout:

```bash
node plugins/oh-my-goal/scripts/create-harness.mjs --objective "Ship this safely" --print-interview
codex plugin marketplace add "$PWD"
codex plugin add oh-my-goal@oh-my-goal-local
```

---

## Scripts

| Script | What it does |
| --- | --- |
| `scripts/create-harness.mjs` | Writes `.omg/harness/<slug>/`. `--print-interview` prints the questionnaire; generation requires `--interview-complete --answers-json`. |
| `scripts/intake-question-engine.mjs` | Builds the two-stage questionnaire payload; `--repo-review --llm auto` adds folder-aware questions; `--locale ko\|en` overrides detection. |
| `scripts/intake-question-runtime.mjs` | Renders intake in cmux, tmux, a macOS Terminal window, or sequential fallback. |
| `scripts/openai-key-runtime.mjs` | `offer` / `ensure` API-key preflight with hidden input into `.env.local`. |
| `scripts/team-runtime.mjs` + `team-core.mjs` | `plan`, `launch`, `tick`, `watch`, `status`, `collect`, `shutdown` for worker lanes and their state files. |
| `scripts/pressure-runtime.mjs` | `init`, `status`, `record`, `select`, `step`, `perturb`, `team-command`, `import-team`, `gate`. |
| `scripts/design-system-runtime.mjs` | Project-specific `design-system.md` without the upstream UI/UX Pro Max CLI. |
| `scripts/deployment-runtime.mjs` | `plan`, `check`, `setup-env`, `deploy` for Vercel, API keys, auth and env readiness. |
| `scripts/cmux-bridge-runtime.mjs` + `cmux-bridge-client.mjs` | File bridge for cmux when the Codex sandbox cannot reach the socket. |
| `scripts/migrate-quality-pruning.mjs` | Adds quality-pruning scaffolds to older harnesses without overwriting existing files. |
| `omg` (`dist/cli/omg.js`) | Compatibility CLI: `refine`, `interview`, `plan`, `create`, `start`, `status`, `sync-goal`, `record-trajectory`, `select`, `step`, `perturb`, `team-plan`, `team-packet`, `import-worker-result`, `challenge`, `worker-instruction`, `gate`, `complete`. `omg help` lists them. |

---

## Repository structure

| Path | What lives there |
| --- | --- |
| `plugins/oh-my-goal/` | The Codex plugin: `.codex-plugin/plugin.json`, the `oh-my-goal` skill (SKILL, FLOW, flows, templates, references) and the runtime `scripts/*.mjs`. |
| `.agents/plugins/marketplace.json` | The `oh-my-goal-local` marketplace entry that `codex plugin add` resolves. |
| `src/cli/` | `omg.ts` (bin shim), `omg-main.ts` (subcommands and help), `goal-harness.ts`. |
| `src/goal-harness/` | Harness policy, planning, runtime, status, completion, perturbation, team packets and results. |
| `src/goal-workflows/` | Artifact writers, Codex goal snapshot, handoff and validation helpers. |
| `src/scripts/` | Plugin bundle verification, packed-install smoke, git-build preparation. |
| `src/**/__tests__/` | Colocated `node:test` suites, run from `dist/` after build. |
| `AGENTS.md` | Repository guidelines for agents working on this codebase. |
| `.github/` | CI workflow, issue and PR templates, Dependabot. |

---

## Project status

**Working today.** The plugin skill, two-stage intake with Korean localization, interactive intake in cmux/tmux/macOS Terminal with sequential fallback, harness generation, the Team runtime with visible panes and leader-side `tick`/`watch`, the pressure runtime and gate, design-system and deployment runtimes, the cmux file bridge, the migration script and the `omg` compatibility CLI. Version `0.18.29`; the plugin manifest carries the same version with a `+codex.<timestamp>` build suffix.

**Known limitations.** Visible worker lanes need an attached cmux or tmux surface; without one `--mode auto` keeps the same worker packets so Codex runs lanes sequentially. Mandatory-Team harnesses with `--require-interactive` report the blocker rather than continuing leader-only. `deploy` and `setup-env --execute` require an attached terminal. Runtime state under `.omg/runtime/`, `.omg/goals/` and `.omg/design-systems/` is git-ignored by design.

**Scope.** This repository is scoped around the Codex plugin skill and its supporting CLI helpers. Keep new public docs, tests and package contents aligned with that plugin-first surface; do not reintroduce launcher-only flows as the primary UX.

---

## License

`package.json` and the plugin manifest declare MIT, but no LICENSE file is committed yet, so default copyright applies: all rights reserved until one is added.
