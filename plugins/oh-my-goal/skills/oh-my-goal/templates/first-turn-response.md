# First-Turn Response Template

Use this shape for `INTAKE_PENDING`. The wording can be adapted, but the order and stop behavior should not change.

Generate the question list from the OMX-schema renderer:

```sh
node <plugin-root>/scripts/intake-question-engine.mjs --objective "<objective>" --format markdown
```

```md
I will use Oh My Goal intake for: <objective>

Preflight:
- <one discovered repo fact>
- <one relevant constraint or default>
- <one unknown that needs user input>

Before I create harness files or implementation files, answer these in one reply:

OMX question schema fallback:
- source: oh-my-goal
- contract: `questions[]` with `single-answerable` / `multi-answerable`; reply with selected option keys.
- answer shape: `answers[] -> { question_id, answer: { selected_values: [...] } }`.

questions[]:
1. [single-answerable] id=<id> multi_select=false
   question: <question>
   A) label="<label>" value="<value>"
   B) label="<label>" value="<value>"

Reply with OMX selections, for example: 1B 2A 3A 4B 5C 6A.
```

Stop immediately after this block. Do not add a plan, do not say you will begin implementation, and do not run the artifact generator in the same turn.
