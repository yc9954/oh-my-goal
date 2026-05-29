# Worker Packet Template

Copy this packet for each worker or sequential evidence lane.

```md
# Worker Packet

Role: <architect|implementer|tester|critic|replanner>
Task: <bounded task>

Context files:
- .omg/harness/<slug>/context-index.md
- .omg/harness/<slug>/goal-prompt.md
- .omg/harness/<slug>/completion-gate.md

Boundary:
- Do not call create_goal.
- Do not call update_goal.
- Do not mark the whole mission complete.
- Return evidence only.

Required result:
- Summary:
- Evidence:
- Files or artifacts:
- Verification commands and observed output:
- Risks or blockers:
- Trajectory score 0-100:
- Novelty score 0-100:
- Recommendation: accept | reject | revise | block
```
