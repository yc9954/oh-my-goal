# Oh My Goal

Oh My Goal is a Codex-native goal harness plugin for long-running work. It keeps one Codex goal as the single top-level objective, then writes repo-local harness artifacts for deep interview, planning, agent lanes, local-optimum pressure, and completion gates.

The primary surface is the `oh-my-goal` Codex plugin skill. The `omg` CLI remains a compatibility helper, but the plugin does not require an `omx` launcher.

## Plugin-First Flow

Install the Codex plugin directly from the GitHub marketplace source:

```bash
codex --version
codex plugin marketplace add yc9954/oh-my-goal --ref main
codex plugin add oh-my-goal@oh-my-goal-local
```

In Codex, invoke the skill:

```text
$oh-my-goal ralpli PRD 작성하고 싶어
```

Text after `$oh-my-goal` is treated as the objective. The skill runs an OMX-style structured intake round, resolves ambiguity, then writes:

```text
.omg/harness/<slug>/
  context-index.md
  ambiguity-map.md
  intake-questionnaire.md
  deep-interview.md
  goal-prompt.md
  harness.md
  agents.md
  orchestration.md
  team-system.md
  worker-packet-template.md
  trajectory-ledger.md
  state-ledger.md
  local-optimum-pressure.md
  completion-gate.md
```

Use `goal-prompt.md` as the recommended `create_goal` payload after checking the active Codex goal.

## Local Development

```bash
npm install
npm run build
node plugins/oh-my-goal/scripts/create-harness.mjs --objective "Ship this safely"
codex plugin marketplace add "$PWD"
codex plugin add oh-my-goal@oh-my-goal-local
```

## What It Does

- Refines a raw request into a single Codex goal prompt.
- Parses `$oh-my-goal <objective>` directly without re-asking for the objective.
- Runs OMX-style structured deep-interview intake when scope or acceptance criteria are unclear.
- Writes Markdown harness files under `.omg/harness/<slug>/`.
- Sets up leader, architect, implementer, tester, critic, and replanner lane instructions.
- Treats execution as trajectory search instead of premature convergence.
- Uses optional Codex subagent/worker lanes for research, implementation, testing, critique, or replanning evidence.
- Requires objective audit, implementation evidence, external verification, adversarial review, and basin-escape convergence checks before completion.

Codex goal ownership remains with the leader session. Workers must not call `create_goal` or `update_goal`; they return evidence, diffs, blockers, risks, test output, and candidate trajectory scores.

## Development

```bash
npm run build
npm run lint
npm run check:no-unused
node --test dist/cli/__tests__/goal-harness.test.js
npm run smoke:packed-install
```

The broader codebase still contains OMX compatibility surfaces while this project is being separated. Public documentation should treat the Codex plugin skill as the primary product surface.

## License

MIT
