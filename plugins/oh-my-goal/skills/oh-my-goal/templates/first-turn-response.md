# First-Turn Response Template

Use this shape for `INTAKE_PENDING`. The wording can be adapted, but the order and stop behavior should not change.

Generate intake from the OMX-style runtime in `auto` mode. In attached tmux, this opens the ↑↓/Space/Enter selector pane and returns structured answers. On macOS outside tmux, it can open a Terminal selector window. In non-interactive text surfaces, it returns the next single-question prompt.

```sh
node <plugin-root>/scripts/intake-question-runtime.mjs --objective "<objective>" --mode auto --json
```

```md
I will use Oh My Goal intake for: <objective>

Preflight:
- <one discovered repo fact>
- <one relevant constraint or default>
- <one unknown that needs user input>

Before I create harness files or implementation files, answer this OMX intake question:

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
