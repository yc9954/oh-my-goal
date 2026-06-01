# Intake Fallback Template

Use this only when the sequential runtime is unavailable. Normally ask one sequential runtime `prompt` at a time. If this fallback is needed, the block must still render the Oh My Goal `questions[]` schema, not an invented prose survey. Ask the block, then stop and wait.

```text
Before I create harness files or implementation files, answer these in one reply:

Oh My Goal question schema fallback:
- source: oh-my-goal
- contract: questions[] with single-answerable / multi-answerable; reply with selected option keys.
- answer shape: answers[] -> { question_id, answer: { selected_values: [...] } }.

questions[]:
1. [single-answerable] id=deliverableScope multi_select=false
   question: Which implementation scope should this target?
   A) label="Polished single-screen implementation" value="polished-single-screen"
   B) label="Minimal working implementation" value="minimal-working"
   C) label="Full-featured implementation" value="full-featured"
   D) other_label="Other" value="<free text>"

Reply with Oh My Goal selections, for example: 1A 2A 3A 4A 5A 6A 7A 8A 9A 10A 11A 12A 13A,B 14A 15A; multi-select example: 12A,B.
```

For PRD/spec/planning requests, use the same schema-rendered shape with planning question IDs:

```text
1. [single-answerable] id=deliverableScope multi_select=false
   question: Which deliverable scope should this target?
   A) label="Next-version PRD" value="next-version-prd"
   B) label="Current-product PRD" value="current-product-prd"
   C) label="Single-feature PRD" value="single-feature-prd"
   D) other_label="Other" value="<free text>"
```
