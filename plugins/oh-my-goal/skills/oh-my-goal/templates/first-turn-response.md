# First-Turn Response Template

Use this shape for `INTAKE_PENDING`. The wording can be adapted, but the order and stop behavior should not change.

First run the optional capability setup offer for local OpenAI/Zep features. Do not ask the user to paste keys into chat. If an attached terminal is available, use `--execute` so the runtime asks yes/no and hidden-inputs accepted keys into uncommitted `.env.local`. Missing or skipped keys do not block Codex-native intake; they only disable local Node-based LLM question generation and later Zep-backed memory features until configured.

```sh
node <plugin-root>/scripts/openai-key-runtime.mjs offer --cwd "<cwd>" --keys OPENAI_API_KEY,ZEP_API_KEY --json
```

Then generate intake from the Oh My Goal runtime in `auto` mode. It first reviews the current folder, then uses that review plus the objective to generate repo-specific questions. If `OPENAI_API_KEY` is configured, `--llm auto` lets the LLM add high-leverage questions; otherwise deterministic repo-aware fallback questions are used. In cmux, this opens an in-workspace ↑↓/Space/Enter selector pane, returns `continue` to the leader when submitted, and closes the temporary question surface. In attached tmux or macOS Terminal it does the same cleanup after final answer. Single-answer questions require Enter to select. In non-interactive text surfaces, it returns the next single-question prompt. The intake covers ambiguity reduction, quality pruning, design-system, Vercel deployment, LLM/API, auth, secret-handling, and credential setup decisions.

```sh
node <plugin-root>/scripts/intake-question-runtime.mjs --objective "<objective>" --cwd "<cwd>" --repo-review --llm auto --mode auto --json
```

```md
I will use Oh My Goal intake for: <objective>

Preflight:
- <one discovered repo fact>
- <one relevant constraint or default>
- <one unknown that needs user input>

Before I create harness files or implementation files, answer this Oh My Goal intake question:

Question 1 of <n>
Ambiguity: <score> (<level>) - <reason>
[single-answerable] id=<id> multi_select=false
question: <question>

A) <label>
B) <label>
C) <label>
D) Other

Reply with one selection, e.g. 1A.
```

Stop immediately after this block. Do not add a plan, do not say you will begin implementation, and do not run the artifact generator in the same turn.

If `auto` returns an interactive prompting payload instead of a text `prompt`, say only: "Oh My Goal intake is open in <renderer>. Select answers there; cmux will continue automatically when possible." Keep `record_path` for the next turn and do not show fallback choices.
