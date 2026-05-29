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
    if (arg === '--interview-complete') {
      parsed.interviewComplete = true;
      continue;
    }
    if (arg === '--print-interview') {
      parsed.printInterview = true;
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

function normalizeObjective(value) {
  return String(value || '')
    .replace(/^\s*(?:use\s+)?\$oh-my-goal\b[:\s-]*/i, '')
    .trim();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .replace(/-+$/g, '') || 'oh-my-goal';
}

function lines(values) {
  return values.filter((line) => line !== undefined).join('\n');
}

function answerValue(answers, key, fallback = 'Unresolved') {
  const value = answers[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function formatQuestion({ question, options }) {
  if (!options?.length) return `${question} `;
  return lines([
    question,
    ...options.map((option, index) => `  ${index + 1}) ${option}`),
    'Choose a number or answer in your own words: ',
  ]);
}

function renderInterviewBlock(objective) {
  const questions = interviewQuestions(objective);
  const example = questions.map((_, index) => `${index + 1}A`).join(' ');
  return lines([
    'Before I create harness files or implementation files, answer these in one reply.',
    '',
    ...questions.flatMap((entry, index) => [
      `${index + 1}. ${entry.question}`,
      ...(entry.options || []).map((option, optionIndex) => `   ${String.fromCharCode(65 + optionIndex)}) ${option}`),
    ]),
    '',
    `Reply with choices or short answers, for example: ${example}.`,
  ]);
}

function interviewQuestions(objective) {
  const text = objective.toLowerCase();
  const questions = [];
  const isPlanning = /(prd|product requirements|requirements|요구사항|기획|스펙|spec)/i.test(text);
  const isImplementation = !isPlanning && /(app|website|web\s*site|frontend|ui|page|tool|calculator|build|implement|make|create|앱|웹|웹사이트|사이트|페이지|도구|계산기|만들|구현)/i.test(text);
  if (isPlanning) {
    questions.push(
      {
        key: 'deliverableScope',
        question: 'Which deliverable scope should this target?',
        options: ['next-version PRD (recommended)', 'current-product PRD', 'single-feature PRD'],
      },
      {
        key: 'audience',
        question: 'Who is the primary reader?',
        options: ['builder/PM making implementation decisions (recommended)', 'stakeholder reviewing product direction', 'Codex goal executor'],
      },
      {
        key: 'sourceContext',
        question: 'What source context should be used?',
        options: ['repo README/docs/source plus user answers (recommended)', 'user answers only', 'repo plus external research'],
      },
      {
        key: 'nonGoals',
        question: 'What should stay out of scope?',
        options: ['no implementation until the goal prompt is approved (recommended)', 'no broad repo refactor', 'no new dependencies'],
      },
      {
        key: 'verification',
        question: 'What should verify the result?',
        options: ['inspect generated Markdown and run lightweight repo checks (recommended)', 'full test suite', 'manual review only'],
      },
      {
        key: 'handoffTarget',
        question: 'What should the handoff produce?',
        options: ['goal prompt plus PRD harness (recommended)', 'PRD only', 'implementation after approval'],
      },
    );
  } else if (isImplementation) {
    questions.push(
      {
        key: 'deliverableScope',
        question: 'Which implementation scope should this target?',
        options: ['polished single-screen implementation (recommended)', 'minimal working implementation', 'full-featured implementation'],
      },
      {
        key: 'stack',
        question: 'Which stack should be used?',
        options: ['static HTML/CSS/JS (recommended for empty folders)', 'React/Vite', 'match the existing repository stack'],
      },
      {
        key: 'ux',
        question: 'Which UX direction should guide the result?',
        options: ['clean app UI (recommended)', 'platform-inspired UI', 'domain-specific UI'],
      },
      {
        key: 'acceptance',
        question: 'What functionality proves the implementation is complete?',
        options: ['mouse plus keyboard behavior and core edge cases (recommended)', 'basic click-only behavior', 'history, memory, or settings included'],
      },
      {
        key: 'verification',
        question: 'What should verify the implementation?',
        options: ['browser check plus lightweight tests when practical (recommended)', 'browser check only', 'tests only'],
      },
      {
        key: 'outputMode',
        question: 'What should happen after intake?',
        options: ['create harness and implement after approval (recommended)', 'create harness only', 'write spec/PRD first'],
      },
      {
        key: 'nonGoals',
        question: 'What should stay out of scope?',
        options: ['no backend, auth, or persistence unless requested (recommended)', 'no new dependencies', 'no styling beyond functional layout'],
      },
    );
  }
  if (!isPlanning && !isImplementation) {
    questions.push(
      {
        key: 'acceptance',
        question: 'What concrete output proves this is complete?',
        options: ['repo-local document plus recommended Codex goal prompt (recommended)', 'goal prompt only', 'implemented code plus tests'],
      },
      {
        key: 'nonGoals',
        question: 'What should stay out of scope?',
        options: ['no implementation until the goal prompt is approved (recommended)', 'no broad repo refactor', 'no new dependencies'],
      },
      {
        key: 'verification',
        question: 'What should verify the result?',
        options: ['inspect generated Markdown and run lightweight repo checks (recommended)', 'full test suite', 'manual review only'],
      },
      {
        key: 'workerLanes',
        question: 'Which independent evidence lanes are useful?',
        options: ['architect, researcher, critic, and tester lanes (recommended)', 'critic and tester only', 'no worker lanes'],
      },
      {
        key: 'localOptimum',
        question: 'How should local-optimum pressure work?',
        options: ['compare baseline, novelty, critic, and replanner paths (recommended)', 'critic review only', 'skip local-optimum pressure'],
      },
    );
  }
  return questions;
}

function markdownTable(headers, rows) {
  return lines([
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ]);
}

function ambiguityRows(objective, answers) {
  const prdDefault = /(prd|product requirements|requirements|요구사항|기획|스펙|spec)/i.test(objective)
    ? 'Assume next-version PRD'
    : 'Infer from objective';
  return [
    ['objective', objective.replace(/\|/g, '/'), 'low', 'Trailing text after `$oh-my-goal` is the objective.'],
    ['deliverable scope', answerValue(answers, 'deliverableScope', prdDefault), 'medium', 'Confirm if this changes output shape.'],
    ['primary reader', answerValue(answers, 'audience', 'Assume builder/PM'), 'medium', 'Tune document and prompt language to reader.'],
    ['source context', answerValue(answers, 'sourceContext', 'Assume repo plus user answers'), 'medium', 'Do not inspect vendor/generated trees by default.'],
    ['completion evidence', answerValue(answers, 'acceptance', 'Needs concrete artifact or behavior'), 'high', 'Map every deliverable to evidence.'],
    ['scope boundary', answerValue(answers, 'nonGoals', 'Needs explicit non-goals'), 'high', 'Prevent useful-looking expansion.'],
    ['verification', answerValue(answers, 'verification', 'Needs command or inspectable artifact'), 'high', 'Run or record the verification path.'],
  ];
}

async function askMissing(objective, answers) {
  const next = { ...answers };
  const rl = createInterface({ input, output });
  try {
    if (!objective.trim()) {
      objective = (await rl.question('What do you want to build or improve? ')).trim();
    }
    for (const entry of interviewQuestions(objective)) {
      const { key } = entry;
      if (typeof next[key] === 'string' && next[key].trim()) continue;
      next[key] = (await rl.question(formatQuestion(entry))).trim();
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
    'Interview choices and assumptions:',
    `- Deliverable scope: ${answerValue(answers, 'deliverableScope', 'infer from objective')}`,
    `- Primary reader: ${answerValue(answers, 'audience', 'builder/PM')}`,
    `- Source context: ${answerValue(answers, 'sourceContext', 'repo plus user answers')}`,
    '',
    'Execution policy:',
    '- Keep one Codex goal as the single top-level objective.',
    '- Treat trailing text after `$oh-my-goal` as the objective; do not ask for it again.',
    '- Start with the ambiguity map and deep-interview artifacts; preserve unresolved assumptions.',
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
      '2. `ambiguity-map.md`',
      '3. `intake-questionnaire.md`',
      '4. `deep-interview.md`',
      '5. `harness.md`',
      '6. `agents.md`',
      '7. `orchestration.md`',
      '8. `team-system.md`',
      '9. `worker-packet-template.md`',
      '10. `trajectory-ledger.md`',
      '11. `state-ledger.md`',
      '12. `local-optimum-pressure.md`',
      '13. `completion-gate.md`',
      '',
      'The Codex goal owns active focus and token accounting. These files provide local durable context and evidence structure.',
    ]),
    'ambiguity-map.md': lines([
      '# Ambiguity Map',
      '',
      `Objective: ${objective}`,
      '',
      'This map follows the OMX deep-interview pattern: resolve material ambiguity, record safe assumptions, and keep non-goals plus decision boundaries explicit.',
      '',
      markdownTable(['Dimension', 'Current default or answer', 'Risk', 'Resolution rule'], ambiguityRows(objective, answers)),
    ]),
    'intake-questionnaire.md': lines([
      '# Intake Questionnaire',
      '',
      'Invocation contract:',
      '- `$oh-my-goal <objective>` means the trailing text is the objective.',
      '- Do not ask for the objective again when trailing text exists.',
      '- Batch independent high-leverage questions into one structured round when the surface supports it.',
      '- If structured input is unavailable, ask a numbered prose block and wait for all answers in one user turn.',
      '',
      'Gap-fill contract:',
      '1. Assimilate the answer into scope, non-goals, acceptance, verification, and handoff target.',
      '2. Rescan repo context, prior turns, and conservative defaults. Ask another round only for surviving critical ambiguity.',
      '',
      markdownTable(
        ['Key', 'Question', 'Recorded answer'],
        interviewQuestions(objective).map((entry) => [
          entry.key,
          entry.question.replace(/\|/g, '/'),
          answerValue(answers, entry.key, 'Unresolved'),
        ]),
      ),
    ]),
    'deep-interview.md': lines([
      '# Deep Interview',
      '',
      `## Objective`,
      objective,
      '',
      '## Deliverable Scope',
      answerValue(answers, 'deliverableScope', 'Infer from objective.'),
      '',
      '## Primary Reader',
      answerValue(answers, 'audience', 'Assume builder/PM.'),
      '',
      '## Source Context',
      answerValue(answers, 'sourceContext', 'Assume repo plus user answers.'),
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
      '1. Treat trailing text after `$oh-my-goal` as the objective.',
      '2. Build an ambiguity map before asking questions.',
      '3. Batch independent high-leverage questions into one structured intake round when possible.',
      '4. Run two gap-fill passes after answers: assimilation, then residual critical-gap scan.',
      '5. Create or reuse one Codex goal with the prompt in `goal-prompt.md`.',
      '6. Record candidate trajectories before selecting a plan.',
      '7. Execute the selected trajectory with evidence checkpoints.',
      '8. Add worker lanes only when they create independent evidence.',
      '9. Give every worker a packet from `worker-packet-template.md`.',
      '10. Record candidate paths in `trajectory-ledger.md`.',
      '11. Checkpoint leader decisions in `state-ledger.md`.',
      '12. Run local-optimum pressure before late completion.',
      '13. Complete only after the gate in `completion-gate.md` passes.',
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
      'Planning voices:',
      '- Metis: clarify material ambiguity and source facts before asking the user.',
      '- Momus: challenge assumptions, validation gaps, and overbroad scope.',
      '- Oracle: synthesize the goal prompt, worker lanes, and completion gate.',
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
  let objective = normalizeObjective(args.objective);
  if (args.printInterview) {
    if (!objective.trim()) throw new Error('Missing objective for --print-interview.');
    console.log(renderInterviewBlock(objective));
    return;
  }
  const providedAnswers = Boolean(args.answersJson || args.answersFile);
  if (providedAnswers && !args.interviewComplete) {
    throw new Error('Refusing --answers-json/--answers-file without --interview-complete. Ask the user first, or pass --interview-complete only after the user approves answers/defaults.');
  }
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
