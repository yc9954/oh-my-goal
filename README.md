# Oh My Goal

Oh My Goal (`omg`) is a Codex goal-native autonomy harness for long-running work. It keeps one Codex goal as the single top-level objective, then adds lightweight planning, persistence, Team evidence lanes, annealing pressure, and strict completion gates around it.

This repository is a standalone productized fork of the goal-harness work. It intentionally keeps some OMX-compatible internals while making `omg` the public entrypoint.

## Install & Run

Recommended first run from GitHub now:

```bash
codex --version
npm install -g --install-links=true github:yc9954/oh-my-goal
omg setup
omg start "Build the thing I actually want"
omg --madmax --high
```

From npm after package ownership is resolved and published:

```bash
codex --version
npm install -g oh-my-goal
omg setup
omg start "Build the thing I actually want"
omg --madmax --high
```

One-off GitHub execution is also supported:

```bash
npx --yes github:yc9954/oh-my-goal --help
npx --yes --package github:yc9954/oh-my-goal omg refine --objective "Ship this safely"
```

From this repository:

```bash
npm install
npm run build
node dist/cli/omg.js --help
node dist/cli/omg.js start "Ship this safely"
```

## What It Does

- Refines a raw request into a single Codex goal prompt.
- Runs deep-interview intake when scope or acceptance criteria are unclear.
- Writes ralplan-style candidate plans and critiques.
- Maintains lightweight Ralph-style runtime state under `.omx/goals/goal-harness/<slug>/`.
- Treats execution as trajectory search instead of premature convergence.
- Uses optional Team worker lanes for research, implementation, testing, critique, or replanning evidence.
- Requires objective audit, implementation evidence, external verification, adversarial review, and basin-escape convergence checks before completion.

## Core Flow

```bash
omg start "Build the feature safely"

# Or use the lower-level flow explicitly:
omg create --objective "Build the feature safely" --slug safe-feature
omg interview --slug safe-feature
omg plan --slug safe-feature
omg start --slug safe-feature
omg record-trajectory --slug safe-feature --summary "Minimal patch" --evidence "Small diff and tests identified" --score 80
omg record-trajectory --slug safe-feature --summary "Critic-pressure path" --evidence "Independent review before completion" --score 90 --novelty-score 60
omg select --slug safe-feature --trajectory-id <id> --evidence "Best verified path"
omg gate --slug safe-feature --evidence-json completion-evidence.json
omg complete --slug safe-feature --codex-goal-json get-goal-complete.json
```

Codex goal ownership remains with the leader session. Workers must not call `create_goal` or `update_goal`; they return evidence, diffs, blockers, risks, test output, and candidate trajectory scores.

## Development

```bash
npm run build
npm run lint
npm run check:no-unused
node --test dist/cli/__tests__/goal-harness.test.js
npm run smoke:packed-install
```

The broader codebase still contains OMX compatibility surfaces while this project is being separated. Public documentation and npm metadata should use `oh-my-goal` / `omg` unless a compatibility path is being described explicitly.

## License

MIT
