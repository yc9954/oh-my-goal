# Orchestration

Use available Codex subagent, agent, or task tools only as evidence lanes. If no multi-agent runtime is available, run the same lanes sequentially and record results in the harness files.

## Leader And Workers

- Leader owns the single Codex goal, plan selection, state ledger, and completion.
- Workers own bounded evidence: facts, diffs, tests, risks, blockers, and scores.
- Workers do not call `create_goal`.
- Workers do not call `update_goal`.
- Workers do not mark the whole mission complete.

Use `templates/worker-packet.md` for each worker or sequential lane.

## OMX-Style Planning Voices

- Metis: clarify material ambiguity and source facts before asking the user.
- Momus: challenge assumptions, validation gaps, and overbroad scope.
- Oracle: synthesize the goal prompt, worker lanes, and completion gate.

## Local-Optimum Pressure

Before selecting a plan or finishing:

1. Generate at least two materially different trajectories.
2. Include one conservative baseline and one novelty-seeking or constraint-inverting path.
3. Run a critic pass that tries to disprove completion.
4. Add perturbation when the same blocker repeats.
5. Reject novelty unless it improves evidence against acceptance checks.

Completion requires objective-to-artifact audit, implementation or research evidence, external verification output, adversarial review with blockers cleared, and a basin-escape challenge comparing alternatives.
