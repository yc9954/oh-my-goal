# Orchestration

Use available Codex subagent, agent, or task tools only as evidence lanes. Before selecting a path, initialize the pressure runtime. For implementation goals, Team Runtime Auto-Start is mandatory by default: launch visible cmux/tmux worker lanes before coding and do not silently collapse into a leader-only run. Only skip visible workers when the harness explicitly records leader-only/no-worker mode or the user approves sequential fallback after a blocked launch. Path rule: `<plugin-root>` is two directories above this skill directory, so runtimes such as `<plugin-root>/scripts/pressure-runtime.mjs`, `<plugin-root>/scripts/team-runtime.mjs`, `<plugin-root>/scripts/design-system-runtime.mjs`, and `<plugin-root>/scripts/deployment-runtime.mjs` are not under `skills/oh-my-goal/scripts/`.

```sh
node <plugin-root>/scripts/pressure-runtime.mjs init \
  --objective "<bounded objective>" \
  --slug <slug> \
  --json
```

The pressure runtime is the local-optimum backpressure layer. It writes `.omg/runtime/pressure/<slug>/state.json`, seeds baseline/novelty/critic trajectories, records evidence-backed alternatives, tracks repeated blockers, writes perturbation artifacts, and blocks completion until the pressure gate passes.

```sh
node <plugin-root>/scripts/team-runtime.mjs launch \
  --objective "<bounded objective>" \
  --workers 3 \
  --mode auto \
  --require-interactive \
  --json
```

The Team bridge owns plugin-local state. `scripts/team-core.mjs` owns Oh My Goal worker contracts; `scripts/team-runtime.mjs` is the cmux/tmux adapter.

- task decomposition and role routing,
- `.omg/runtime/team/<team>/config.json` with `schema_source: "oh-my-goal.team/state/v2"`,
- `.omg/runtime/team/<team>/manifest.json` with `schema_version: 2`,
- `.omg/runtime/team/<team>/tasks/task-<id>.json`,
- worker `identity.json`, `inbox.md`, `prompt.md`, `status.json`, and `result.md` paths,
- required cmux/tmux panes when `--require-interactive` is present,
- optional cmux/tmux panes otherwise when launched from an attached interactive session,
- cmux-visible surfaces renamed by worker id and role when cmux is available,
- `watch`, `tick`, `status`, `collect`, and `shutdown` commands for sustained orchestration, inspection, idle-pane hibernation, relaunch, and cleanup.

If `--require-interactive` is present and cmux/tmux is unavailable, `--mode auto` returns `status: "blocked"` with a next action. Stop and report that blocker; use planned/sequential packets only after explicit user approval. Without `--require-interactive`, `--mode auto` degrades to planned state and worker packets.

If the blocker is `cmux_socket_permission_blocked`, cmux is healthy but Codex cannot reach `cmux.sock` from the seatbelt sandbox. First try the file bridge: ask the user to start `scripts/cmux-bridge-runtime.mjs start --cwd "$PWD" --root .omg/runtime/cmux-bridge` from an unsandboxed cmux/terminal surface, leave it running, then rerun Team Runtime Auto-Start. Do not treat this as ordinary `cmux_unavailable`. The bridge preserves visible worker launch, pane renaming, `send`, `watch --notify`, `close-completed`, idle hibernation, and reopen behavior.

Best cmux entry for native Codex-visible subagent panes is `cmux codex-teams`. Normal `codex` sessions can still use Oh My Goal's explicit worker panes, but `cmux codex-teams` also lets Codex-created child/subagent threads appear as managed cmux splits.

When cmux is available, inspect visible worker lanes with:

```sh
cmux tree --workspace "$CMUX_WORKSPACE_ID"
cmux read-screen --workspace "$CMUX_WORKSPACE_ID" --surface <surface:id> --lines 80
```

Use cmux screen reads for observation only. Worker `result.md` files remain the durable evidence source.

## Leader And Workers

- Leader owns the single Codex goal, plan selection, state ledger, and completion.
- Workers own bounded evidence: facts, diffs, tests, risks, blockers, and scores.
- Workers do not call `create_goal`.
- Workers do not call `update_goal`.
- Workers do not mark the whole mission complete.

Use `scripts/team-runtime.mjs plan` or `templates/worker-packet.md` for each worker or sequential lane.

Inspect and collect Team work with:

```sh
node <plugin-root>/scripts/team-runtime.mjs tick --team <team> --pressure-slug <slug> --close-idle-minutes 10 --json
node <plugin-root>/scripts/team-runtime.mjs watch --team <team> --pressure-slug <slug> --interval-ms 5000 --close-idle-minutes 10 --close-completed --notify --json
node <plugin-root>/scripts/team-runtime.mjs status --team <team> --json
node <plugin-root>/scripts/team-runtime.mjs collect --team <team> --json
node <plugin-root>/scripts/pressure-runtime.mjs import-team --slug <slug> --team <team> --json
node <plugin-root>/scripts/team-runtime.mjs shutdown --team <team> --json
```

Use `watch` while worker panes are open and the goal is still moving. Each cycle runs `tick -> collect -> pressure import-team -> pressure status -> follow-up tick`, writes `watch.ndjson`, notifies visible workers when new inbox work is assigned, closes completed worker panes with no open tasks when `--close-completed` is set, and keeps pressure-driven follow-up tasks flowing without waiting for manual leader prompts. Use `tick` for a single manual cycle after workers report, block, or go stale. It reads worker `status.json` and `result.md`, marks accepted tasks complete, creates follow-up tasks for revise/reject/block/low-score results, reclaims inactive work, routes ready tasks to available lanes using the Team rebalance policy, adds bounded dynamic worker lanes up to `--max-workers` when ready work exceeds available lanes, closes idle visible panes with no open tasks when `--close-idle-minutes` is set, and reopens hibernated lanes when later assigned work. Use `--notify` only when visible cmux/tmux worker panes should receive a short "read inbox" prompt.

Use `import-team` after workers write `result.md`; it parses each worker Summary, Evidence, Trajectory score, Novelty score, and Recommendation into pressure-runtime trajectories.

## Planning Voices

- Metis: clarify material ambiguity and source facts before asking the user.
- Momus: challenge assumptions, validation gaps, and overbroad scope.
- Oracle: synthesize the goal prompt, worker lanes, and completion gate.

## Local-Optimum Pressure

Before selecting a plan or finishing:

1. Generate at least two materially different trajectories.
2. Include one conservative baseline and one novelty-seeking or constraint-inverting path.
3. Run a critic pass that tries to disprove completion.
4. Add perturbation when the same blocker repeats.
5. Reject novelty unless it improves evidence against acceptance checks.

Completion requires objective-to-artifact audit, implementation or research evidence, external verification output, adversarial review with blockers cleared, and a basin-escape challenge comparing alternatives. For web/app goals, also require design-system evidence. For LLM/API or auth goals, require secret/auth evidence without exposing secret values. For Vercel-scoped goals, require a deployment URL or a concrete deployment blocker with next commands.

For Vercel-scoped goals, the leader should use deployment runtime stages:

```sh
node <plugin-root>/scripts/deployment-runtime.mjs plan --objective "<bounded objective>" --slug <slug> --json
node <plugin-root>/scripts/deployment-runtime.mjs check --objective "<bounded objective>" --slug <slug> --json
node <plugin-root>/scripts/deployment-runtime.mjs setup-env --objective "<bounded objective>" --slug <slug> --json
node <plugin-root>/scripts/deployment-runtime.mjs deploy --objective "<bounded objective>" --slug <slug> --json
```

`setup-env` is a dry run by default. Use `setup-env --execute --json` only in an attached terminal so Vercel can prompt securely for secret values. After that, rerun readiness with `--credential-setup already-configured-vercel-env --execute`. `deploy` is also a dry run by default. Use `deploy --execute --json` only after readiness blockers are clear, tests/build pass, and required env vars are configured through Vercel/dashboard/local env without exposing secret values.

Run the runtime gate before completing:

```sh
node <plugin-root>/scripts/pressure-runtime.mjs gate --slug <slug> --evidence-json <completion-evidence-json-or-path> --json
```
