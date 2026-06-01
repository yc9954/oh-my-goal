# Repository Guidelines

## Project Structure & Module Organization

Oh My Goal is a Codex plugin-first goal harness. Plugin assets live under `plugins/oh-my-goal/`, with the skill in `plugins/oh-my-goal/skills/oh-my-goal/` and runtime scripts in `plugins/oh-my-goal/scripts/`. TypeScript source is intentionally narrow: CLI entry points are in `src/cli/`, goal harness logic in `src/goal-harness/`, goal workflow helpers in `src/goal-workflows/`, scripts in `src/scripts/`, and shared utilities in `src/utils/`. Tests are colocated in `src/**/__tests__/`.

## Build, Test, and Development Commands

- `npm install`: install Node dependencies. Requires Node.js 20 or newer.
- `npm run build`: compile TypeScript to `dist/` and make the CLI executable.
- `npm run test`: run build, plugin-bundle verification, and all Node tests.
- `npm run lint`: run Biome linting over `src`.
- `npm run check:no-unused`: run the stricter unused-code TypeScript config.
- `npm run verify:plugin-bundle`: validate the packaged plugin structure and public surface.

## Coding Style & Naming Conventions

Use strict TypeScript with ES modules and NodeNext resolution. Keep files focused by product surface or harness concern. Prefer named exports for shared helpers, kebab-case filenames for modules, PascalCase for exported types, and `*.test.ts` for tests. Plugin runtime scripts are plain Node `.mjs`; keep them dependency-light and runnable from a Codex plugin cache path.

## Testing Guidelines

Add targeted tests in the nearest `__tests__` directory. For plugin changes, run `npm run build && npm run verify:plugin-bundle` before targeted tests. For package-surface changes, run `npm run test:package`; for goal policy/runtime changes, run `npm run test:goal`. Avoid editing generated `dist/` files directly.

## Commit & Pull Request Guidelines

Use concise, intent-first commit messages, preferably `feat:`, `fix:`, `docs:`, or `chore:`. PRs should describe scope, list verification commands, call out plugin install or marketplace effects, and include screenshots or terminal transcripts when changing interactive intake, cmux/tmux behavior, or generated Markdown artifacts.

## Agent-Specific Instructions

Keep `$oh-my-goal <objective>` plugin-first. Do not reintroduce launcher-only flows as the primary UX. Intake must reduce ambiguity first, then run quality pruning before harness generation. Generated harnesses should point the leader at one Codex goal, repo-local `.omg/harness/<slug>/` artifacts, optional worker lanes, pressure gates, design-system checks, and deployment readiness checks.
