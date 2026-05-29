# First-Turn Response Template

Use this shape for `INTAKE_PENDING`. The wording can be adapted, but the order and stop behavior should not change.

Generate intake from the OMX-style runtime in `auto` mode. In cmux, this opens an in-workspace ↑↓/Space/Enter selector pane and returns `continue` to the leader when submitted. In attached tmux, it opens a selector pane. On macOS outside cmux/tmux, it can open a Terminal selector window. Single-answer questions require Enter to select. In non-interactive text surfaces, it returns the next single-question prompt.

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

If `auto` returns an interactive prompting payload instead of a text `prompt`, say only: "Oh My Goal intake is open in <renderer>. Select answers there; cmux will continue automatically when possible." Keep `record_path` for the next turn and do not show fallback choices.
