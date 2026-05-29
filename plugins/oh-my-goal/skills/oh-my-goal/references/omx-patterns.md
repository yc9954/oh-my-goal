# OMX-Derived Patterns

Oh My Goal preserves selected OMX behaviors without requiring the OMX runtime.

## Deep Interview

- Parse trailing arguments as the initial objective.
- Inspect repo context before asking facts that can be discovered.
- Build an ambiguity map before the first question.
- Use the canonical OMX question schema from `src/question/types.ts`: `questions[]`, `single-answerable`, `multi-answerable`, `answers[]`, and `selected_values`.
- Ask only material questions whose answers affect scope, acceptance, verification, or handoff.
- Record non-goals and decision boundaries explicitly.

## Prometheus-Strict

- Batch independent high-leverage questions into one structured round.
- Use Metis-style clarification for unclear requirements.
- Use Momus-style critique for hidden assumptions and overbroad scope.
- Use Oracle-style synthesis to turn answers into the final goal prompt and completion gate.

## Ralplan And Team

- Keep one leader-owned Codex goal.
- Treat workers as evidence lanes, not owners of completion.
- Use explicit packets instead of vague delegation.
- Compare trajectories before selecting a path.
- Persist state in Markdown so work can resume from files.

## Anti-Local-Optimum Pressure

- Force baseline vs novelty path comparison before major commitment.
- Add critic/tester/replanner pressure before completion.
- Use perturbation only when it improves evidence or escapes repeated blockers.
- Reject novelty that does not improve acceptance coverage, verification confidence, or risk.
