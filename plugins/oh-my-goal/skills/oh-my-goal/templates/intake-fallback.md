# Intake Fallback Template

Use this when structured input is unavailable. Ask the block, then stop and wait.

```text
Before I create harness files or implementation files, answer these in one reply:

1. Scope: A minimal / B polished / C full-featured
2. Stack: A static HTML/CSS/JS / B React/Vite / C match existing repo
3. UX: A clean app / B platform-inspired / C domain-specific
4. Functionality: A basic / B keyboard + edge cases / C history/settings
5. Verification: A browser check / B tests / C both
6. Output: A implement now / B harness only / C spec first

Reply like: 1B 2A 3A 4B 5C 6A
```

For PRD/spec/planning requests, adapt the labels:

```text
1. Scope: A next-version PRD / B current-product PRD / C single-feature PRD
2. Reader: A builder or PM / B stakeholder / C Codex goal executor
3. Source: A repo plus answers / B repo only / C repo plus research
4. Non-goals: A no implementation yet / B no broad refactor / C no new dependencies
5. Verification: A Markdown inspection / B repo checks / C stakeholder review
6. Handoff: A goal prompt / B PRD only / C implementation after approval
```
