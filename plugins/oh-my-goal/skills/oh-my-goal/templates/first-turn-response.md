# First-Turn Response Template

Use this shape for `INTAKE_PENDING`. The wording can be adapted, but the order and stop behavior should not change.

Generate the question list from:

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

1. <question with A/B/C choices>
2. <question with A/B/C choices>
3. <question with A/B/C choices>
4. <question with A/B/C choices>
5. <question with A/B/C choices>
6. <question with A/B/C choices>

Reply like: 1B 2A 3A 4B 5C 6A
```

Stop immediately after this block. Do not add a plan, do not say you will begin implementation, and do not run the artifact generator in the same turn.
