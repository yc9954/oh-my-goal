#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { join, relative } from 'node:path';

const VALUE_FLAGS = new Set(['--objective', '--slug', '--cwd', '--answers-json', '--answers-file']);

function parseArgs(argv) {
  const parsed = { cwd: process.cwd(), force: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--force') {
      parsed.force = true;
      continue;
    }
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (VALUE_FLAGS.has(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}.`);
      parsed[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    parsed.objective = [parsed.objective, arg].filter(Boolean).join(' ');
  }
  return parsed;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .replace(/-+$/g, '') || 'oh-my-goal';
}

async function askMissing(objective, answers) {
  const next = { ...answers };
  const rl = createInterface({ input, output });
  try {
    if (!objective.trim()) {
      objective = (await rl.question('What do you want to build or improve? ')).trim();
    }
    const questions = [
      ['acceptance', 'What concrete outputs or behavior prove this is complete? '],
      ['nonGoals', 'What should stay out of scope? '],
      ['verification', 'What commands, checks, or artifacts should verify the result? '],
      ['constraints', 'What constraints, risks, credentials, or release boundaries matter? '],
      ['workerLanes', 'Which independent worker lanes would be useful, if any? '],
      ['localOptimum', 'How should the harness pressure-test against a local optimum? '],
    ];
    for (const [key, question] of questions) {
      if (typeof next[key] === 'string' && next[key].trim()) continue;
      next[key] = (await rl.question(question)).trim();
    }
  } finally {
    rl.close();
  }
  return { objective, answers: next };
}

async function readAnswers(args) {
  const raw = args.answersFile ? await readFile(args.answersFile, 'utf-8') : args.answersJson;
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('answers JSON must be an object.');
  }
  return parsed;
}

function routeFor(objective, answers) {
  const text = `${objective} ${Object.values(answers).join(' ')}`.toLowerCase();
  if (/(agent|worker|team|parallel|orchestrat|multi)/.test(text)) return 'agent_orchestrated';
  if (/(long|persistent|loop|resume|goal|harness|autonom)/.test(text)) return 'persistent_goal_loop';
  return 'goal_first';
}

function lines(values) {
  return values.filter((line) => line !== undefined).join('\n');
}

function goalPrompt({ objective, slug, route, answers }) {
  return lines([
    `Complete the user objective: ${objective}`,
    '',
    `Use the Oh My Goal harness artifacts in .omg/harness/${slug}/ as the execution contract.`,
    '',
    'Acceptance criteria:',
    answers.acceptance || '- Confirm concrete deliverables with the user before implementation.',
    '',
    'Non-goals and boundaries:',
    answers.nonGoals || '- Do not expand scope without explicit user approval.',
    '',
    'Verification:',
    answers.verification || '- Identify and run the appropriate repository-specific checks before completion.',
    '',
    'Execution policy:',
    '- Keep one Codex goal as the single top-level objective.',
    '- Start with the deep-interview artifact and preserve unresolved assumptions.',
    '- Use Team-style worker packets when independent evidence lanes improve quality.',
    '- Select a trajectory only after comparing at least two materially different paths.',
    '- Use worker lanes only for evidence-producing research, implementation, testing, critique, or replanning.',
    '- Workers must not call create_goal, update_goal, or mark the mission complete.',
    '- Apply the local-optimum pressure protocol before major commitments and before completion.',
    '- Only the leader may call update_goal({status: "complete"}) after the completion gate passes.',
    '',
    `Recommended harness route: ${route}`,
  ]);
}

function artifactMap({ objective, slug, route, answers }) {
  const prompt = goalPrompt({ objective, slug, route, answers });
  return {
    'context-index.md': lines([
      `# Oh My Goal Harness: ${slug}`,
      '',
      `Objective: ${objective}`,
      `Route: ${route}`,
      '',
      'Read order for the Codex goal:',
      '1. `goal-prompt.md`',
      '2. `deep-interview.md`',
      '3. `harness.md`',
      '4. `agents.md`',
      '5. `orchestration.md`',
      '6. `team-system.md`',
      '7. `worker-packet-template.md`',
      '8. `trajectory-ledger.md`',
      '9. `state-ledger.md`',
      '10. `local-optimum-pressure.md`',
      '11. `completion-gate.md`',
      '',
      'The Codex goal owns active focus and token accounting. These files provide local durable context and evidence structure.',
    ]),
    'deep-interview.md': lines([
      '# Deep Interview',
      '',
      `## Objective`,
      objective,
      '',
      '## Acceptance',
      answers.acceptance || 'Unresolved. Ask the user for concrete completion evidence.',
      '',
      '## Non-goals',
      answers.nonGoals || 'Unresolved. Ask what must stay out of scope.',
      '',
      '## Verification',
      answers.verification || 'Unresolved. Discover repo checks and confirm with the user.',
      '',
      '## Constraints And Risks',
      answers.constraints || 'None recorded yet.',
      '',
      '## Worker Lanes',
      answers.workerLanes || 'Default to sequential leader work unless independent evidence lanes are useful.',
      '',
      '## Local-Optimum Pressure',
      answers.localOptimum || 'Use baseline vs novelty path, critic review, and verification probes before completion.',
    ]),
    'goal-prompt.md': lines([
      '# Recommended Codex Goal Prompt',
      '',
      '```text',
      prompt,
      '```',
    ]),
    'harness.md': lines([
      '# Harness',
      '',
      '1. Confirm unresolved interview questions.',
      '2. Create or reuse one Codex goal with the prompt in `goal-prompt.md`.',
      '3. Record candidate trajectories before selecting a plan.',
      '4. Execute the selected trajectory with evidence checkpoints.',
      '5. Add worker lanes only when they create independent evidence.',
      '6. Give every worker a packet from `worker-packet-template.md`.',
      '7. Record candidate paths in `trajectory-ledger.md`.',
      '8. Checkpoint leader decisions in `state-ledger.md`.',
      '9. Run local-optimum pressure before late completion.',
      '10. Complete only after the gate in `completion-gate.md` passes.',
      '',
      'State convention:',
      '- Append leader notes and evidence to these Markdown files.',
      '- Keep generated code and tests in normal project paths.',
      '- Keep goal ownership in the leader session.',
    ]),
    'agents.md': lines([
      '# Agent And Worker Lanes',
      '',
      'Leader:',
      '- owns get_goal, create_goal, update_goal, final selection, and completion.',
      '- maps every result back to acceptance criteria.',
      '',
      'Architect lane:',
      '- proposes architecture and risk boundaries.',
      '',
      'Implementer lane:',
      '- produces focused diffs or implementation notes.',
      '',
      'Tester lane:',
      '- identifies and runs verification probes.',
      '',
      'Critic lane:',
      '- tries to disprove the selected trajectory and completion claim.',
      '',
      'Replanner lane:',
      '- proposes a different path when evidence shows the current path is stuck.',
      '',
      'Worker boundary:',
      '- workers do not call create_goal.',
      '- workers do not call update_goal.',
      '- workers return evidence, diffs, risks, blockers, and scores.',
    ]),
    'orchestration.md': lines([
      '# Orchestration',
      '',
      'Use native Codex subagents or available agent tools when present. If none are available, run the same lanes sequentially.',
      '',
      'This borrows the useful part of OMX Team: independent evidence lanes with explicit boundaries. It does not require an OMX launcher, tmux session, or Team runtime.',
      '',
      'Recommended sequence:',
      '1. Leader frames the objective and acceptance map.',
      '2. Architect and critic propose competing trajectories.',
      '3. Implementer executes the selected trajectory.',
      '4. Tester runs verification and records output.',
      '5. Critic challenges completion.',
      '6. Leader updates the Codex goal only after the completion gate passes.',
      '',
      'Trajectory scoring:',
      '- score: confidence that the path satisfies acceptance criteria.',
      '- novelty score: how different the path is from the current plan.',
      '- risk: expected cost or failure mode.',
      '- evidence: file paths, commands, outputs, or concrete observations.',
    ]),
    'team-system.md': lines([
      '# Team System',
      '',
      'Goal:',
      'Preserve the useful Team orchestration pattern inside a Codex-native plugin harness.',
      '',
      'Core rules:',
      '- The leader owns the single Codex goal.',
      '- Workers own bounded evidence lanes.',
      '- Workers do not call create_goal.',
      '- Workers do not call update_goal.',
      '- Workers do not mark the mission complete.',
      '- Every lane returns evidence in a packet format.',
      '',
      'Recommended lanes:',
      '',
      '| Lane | Purpose | Output |',
      '| --- | --- | --- |',
      '| architect | find architecture, boundaries, and integration risks | design notes, affected files, risk list |',
      '| implementer | produce focused changes or implementation plan | diff summary, files changed, blockers |',
      '| tester | validate behavior and failure modes | commands, outputs, missing coverage |',
      '| critic | attack assumptions and completion claim | unresolved blockers, false-positive risks |',
      '| replanner | escape stuck or low-quality paths | alternate trajectory and migration plan |',
      '',
      'When true parallel agents are unavailable, run the lanes sequentially and paste each result into `trajectory-ledger.md`.',
    ]),
    'worker-packet-template.md': lines([
      '# Worker Packet Template',
      '',
      'Copy this packet for each worker or sequential lane.',
      '',
      '```md',
      '# Worker Packet',
      '',
      'Role: <architect|implementer|tester|critic|replanner>',
      'Task: <bounded task>',
      'Context files:',
      '- .omg/harness/' + slug + '/context-index.md',
      '- .omg/harness/' + slug + '/goal-prompt.md',
      '- .omg/harness/' + slug + '/completion-gate.md',
      '',
      'Boundary:',
      '- Do not call create_goal.',
      '- Do not call update_goal.',
      '- Do not mark the whole mission complete.',
      '- Return evidence only.',
      '',
      'Required result:',
      '- Summary:',
      '- Evidence:',
      '- Files or artifacts:',
      '- Verification commands and observed output:',
      '- Risks or blockers:',
      '- Trajectory score 0-100:',
      '- Novelty score 0-100:',
      '- Recommendation: accept | reject | revise | block',
      '```',
    ]),
    'trajectory-ledger.md': lines([
      '# Trajectory Ledger',
      '',
      'Record candidate paths before selecting a plan. Keep at least two materially different trajectories before major commitment.',
      '',
      '| ID | Source | Role | Summary | Evidence | Score | Novelty | Status |',
      '| --- | --- | --- | --- | --- | ---: | ---: | --- |',
      '| T001 | leader | baseline | Conservative direct path | Pending | 0 | 0 | candidate |',
      '| T002 | worker | critic/replanner | Different path or constraint inversion | Pending | 0 | 0 | candidate |',
      '',
      'Selection rule:',
      '- Select a trajectory only after evidence beats alternatives.',
      '- Prefer the baseline only when the novelty path fails on evidence.',
      '- Prefer novelty only when it improves acceptance coverage, risk, or verification.',
    ]),
    'state-ledger.md': lines([
      '# State Ledger',
      '',
      'Use this as a lightweight persistent leader loop. Append checkpoints instead of relying on memory.',
      '',
      '| Time | Phase | Decision | Evidence | Next action |',
      '| --- | --- | --- | --- | --- |',
      '| TBD | intake | Harness created | See deep-interview.md | Confirm unresolved questions |',
      '',
      'Phases:',
      '- intake: clarify objective and boundaries.',
      '- plan: compare trajectories.',
      '- execute: implement selected path.',
      '- pressure: critic/tester/replanner challenge.',
      '- gate: validate completion evidence.',
      '- complete: update Codex goal only after gate passes.',
    ]),
    'local-optimum-pressure.md': lines([
      '# Local-Optimum Pressure',
      '',
      'The harness treats execution as search, not immediate convergence.',
      '',
      'Required pressure points:',
      '- before plan selection: compare baseline, persistent, team-assisted, and novelty-seeking trajectories.',
      '- after repeated blockers: perturb the constraints and ask for a disconfirming probe.',
      '- before completion: run critic review and basin-escape challenge.',
      '',
      'Basin-escape challenge:',
      '1. Restate the current solution and why it seems complete.',
      '2. Generate two alternatives that could satisfy the same objective.',
      '3. Identify one hidden assumption in the selected path.',
      '4. Run or specify a verification probe that could falsify completion.',
      '5. Keep the current path only if evidence beats alternatives.',
      '',
      'Do not reward novelty for its own sake. Novelty must improve evidence or reduce risk.',
    ]),
    'completion-gate.md': lines([
      '# Completion Gate',
      '',
      'The leader may call update_goal({status: "complete"}) only after all items are true:',
      '',
      '- Objective audit maps every user requirement to evidence.',
      '- Implementation or research artifacts are listed by path.',
      '- External verification passed and output was inspected.',
      '- Critic review found no unresolved blocker.',
      '- Basin-escape challenge compared at least two alternatives.',
      '- Remaining non-goals are still out of scope.',
      '',
      'Completion evidence template:',
      '',
      '```json',
      JSON.stringify({
        objectiveAudit: 'Every requirement maps to evidence.',
        implementationEvidence: ['path/or/artifact'],
        externalVerification: [{ command: 'npm test', status: 'pass', evidence: 'inspected output' }],
        adversarialReview: { status: 'clear', evidence: 'critic findings resolved' },
        convergenceChallenge: { status: 'passed', alternativesConsidered: 2, evidence: 'alternatives compared' },
      }, null, 2),
      '```',
    ]),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let objective = String(args.objective || '').trim();
  let answers = await readAnswers(args);
  if (!objective || Object.keys(answers).length === 0) {
    const result = await askMissing(objective, answers);
    objective = result.objective;
    answers = result.answers;
  }
  if (!objective.trim()) throw new Error('Missing objective.');

  const slug = slugify(args.slug || objective);
  const route = routeFor(objective, answers);
  const root = join(args.cwd, '.omg', 'harness', slug);
  if (existsSync(root) && !args.force) {
    throw new Error(`Harness already exists at ${relative(args.cwd, root)}. Pass --force to overwrite files.`);
  }
  await mkdir(root, { recursive: true });

  const files = artifactMap({ objective, slug, route, answers });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(root, name), `${content}\n`, 'utf-8');
  }

  const summary = {
    slug,
    route,
    root: relative(args.cwd, root),
    goalPrompt: relative(args.cwd, join(root, 'goal-prompt.md')),
    contextIndex: relative(args.cwd, join(root, 'context-index.md')),
    files: Object.keys(files).map((name) => relative(args.cwd, join(root, name))),
  };
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(`oh-my-goal harness: ${summary.slug}`);
    console.log(`route: ${summary.route}`);
    console.log(`context: ${summary.contextIndex}`);
    console.log(`goal prompt: ${summary.goalPrompt}`);
  }
}

main().catch((error) => {
  console.error(`[oh-my-goal] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
