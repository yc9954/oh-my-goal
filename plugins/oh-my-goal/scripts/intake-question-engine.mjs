#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

// Ported from the OMX question engine in src/question/types.ts. Keep the
// canonical question/answer schema aligned with omx question rather than
// inventing a plugin-only prompt format.

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeOption(raw, index) {
  if (typeof raw === 'string') {
    const label = raw.trim();
    if (!label) throw new Error(`options[${index}] must be a non-empty string`);
    return { label, value: label };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`options[${index}] must be a string or object`);
  }
  const label = safeString(raw.label).trim();
  const value = safeString(raw.value).trim() || label;
  const description = safeString(raw.description).trim() || undefined;
  if (!label) throw new Error(`options[${index}].label must be a non-empty string`);
  if (!value) throw new Error(`options[${index}].value must be a non-empty string`);
  return { label, value, ...(description ? { description } : {}) };
}

function parseQuestionType(raw) {
  const normalized = safeString(raw).trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'multi-answerable' || normalized === 'multi-select') return 'multi-answerable';
  if (normalized === 'single-answerable' || normalized === 'single-select') return 'single-answerable';
  throw new Error('type must be one of: single-answerable, multi-answerable');
}

function getNormalizedQuestionType(input) {
  return input.type ?? (input.multi_select === true ? 'multi-answerable' : 'single-answerable');
}

function normalizeQuestionItem(raw, index, inheritedHeader) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`questions[${index}] must be a JSON object`);
  }
  const question = safeString(raw.question).trim();
  const header = safeString(raw.header).trim() || (index === 0 ? inheritedHeader : undefined);
  const other_label = safeString(raw.other_label).trim() || 'Other';
  const allow_other = raw.allow_other !== false;
  const rawMultiSelect = raw.multi_select;
  const parsedType = parseQuestionType(raw.type);
  const rawOptions = Array.isArray(raw.options) ? raw.options : [];
  const id = safeString(raw.id).trim() || `q-${index + 1}`;

  if (!question) throw new Error(`questions[${index}].question must be a non-empty string`);
  if (!id) throw new Error(`questions[${index}].id must be a non-empty string`);
  if (rawOptions.length === 0 && !allow_other) {
    throw new Error(`questions[${index}].options must be a non-empty array unless allow_other is true`);
  }
  if (parsedType === 'single-answerable' && rawMultiSelect === true) {
    throw new Error(`questions[${index}] type=single-answerable conflicts with multi_select=true`);
  }
  if (parsedType === 'multi-answerable' && rawMultiSelect === false) {
    throw new Error(`questions[${index}] type=multi-answerable conflicts with multi_select=false`);
  }

  const type = getNormalizedQuestionType({
    type: parsedType,
    multi_select: rawMultiSelect === true,
  });
  return {
    id,
    ...(header ? { header } : {}),
    question,
    options: rawOptions.map((option, optionIndex) => normalizeOption(option, optionIndex)),
    allow_other,
    other_label,
    multi_select: type === 'multi-answerable',
    type,
  };
}

function normalizeLegacyQuestion(raw, header) {
  return normalizeQuestionItem({ ...raw, id: safeString(raw.id).trim() || 'q-1', header }, 0, header);
}

export function normalizeQuestionInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('question input must be a JSON object');
  }

  const header = safeString(raw.header).trim() || undefined;
  const source = safeString(raw.source).trim() || undefined;
  const session_id = safeString(raw.session_id).trim() || undefined;
  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : undefined;

  const questions = rawQuestions
    ? rawQuestions.map((item, index) => normalizeQuestionItem(item, index, header))
    : [normalizeLegacyQuestion(raw, header)];

  if (questions.length === 0) throw new Error('questions must be a non-empty array');
  const seenIds = new Set();
  for (const question of questions) {
    if (seenIds.has(question.id)) throw new Error(`questions id must be unique: ${question.id}`);
    seenIds.add(question.id);
  }

  const first = questions[0];
  return {
    ...(header ? { header } : {}),
    question: first.question,
    options: first.options,
    allow_other: first.allow_other,
    other_label: first.other_label,
    multi_select: first.multi_select,
    type: first.type,
    questions,
    ...(source ? { source } : {}),
    ...(session_id ? { session_id } : {}),
  };
}

function option(label, value, description) {
  return { label, value, ...(description ? { description } : {}) };
}

function planningQuestions() {
  return [
    {
      id: 'deliverableScope',
      question: 'Which deliverable scope should this target?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Next-version PRD', 'next-version-prd', 'Plan the next product/version direction.'),
        option('Current-product PRD', 'current-product-prd', 'Document the product as it exists now.'),
        option('Single-feature PRD', 'single-feature-prd', 'Focus on one feature or workflow.'),
      ],
    },
    {
      id: 'audience',
      question: 'Who is the primary reader?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Builder or PM', 'builder-pm', 'Use implementation-ready product language.'),
        option('Stakeholder', 'stakeholder', 'Use decision and scope language.'),
        option('Codex goal executor', 'codex-goal-executor', 'Optimize for a follow-up Codex goal.'),
      ],
    },
    {
      id: 'sourceContext',
      question: 'What source context should be used?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Repo plus user answers', 'repo-plus-user-answers', 'Inspect repo files and combine them with this intake.'),
        option('User answers only', 'user-answers-only', 'Avoid inferring from repo structure.'),
        option('Repo plus external research', 'repo-plus-external-research', 'Use web/research sources where needed.'),
      ],
    },
    {
      id: 'nonGoals',
      question: 'Which non-goals must stay out of scope?',
      type: 'multi-answerable',
      allow_other: true,
      options: [
        option('No implementation yet', 'no-implementation-yet', 'Produce planning artifacts only.'),
        option('No broad refactor', 'no-broad-refactor', 'Avoid unrelated architecture cleanup.'),
        option('No new dependencies', 'no-new-dependencies', 'Keep the existing stack unchanged.'),
      ],
    },
    {
      id: 'verification',
      question: 'What should verify the result?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Markdown inspection', 'markdown-inspection', 'Review generated artifacts directly.'),
        option('Repo checks', 'repo-checks', 'Run lightweight repository commands where applicable.'),
        option('Stakeholder review', 'stakeholder-review', 'Treat review feedback as the validation gate.'),
      ],
    },
    {
      id: 'handoffTarget',
      question: 'What should the handoff produce?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Goal prompt plus PRD harness', 'goal-prompt-plus-prd-harness', 'Create both planning docs and a goal-ready prompt.'),
        option('PRD only', 'prd-only', 'Stop at the PRD/spec artifact.'),
        option('Implementation after approval', 'implementation-after-approval', 'Prepare for coding after you approve the plan.'),
      ],
    },
  ];
}

function implementationQuestions() {
  return [
    {
      id: 'deliverableScope',
      question: 'Which implementation scope should this target?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Polished single-screen implementation', 'polished-single-screen', 'Recommended for small web apps and empty folders.'),
        option('Minimal working implementation', 'minimal-working', 'Prioritize behavior over polish.'),
        option('Full-featured implementation', 'full-featured', 'Include richer states and secondary features.'),
      ],
    },
    {
      id: 'stack',
      question: 'Which stack should be used?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Static HTML/CSS/JS', 'static-html-css-js', 'Best default for empty folders.'),
        option('React/Vite', 'react-vite', 'Use a modern app scaffold.'),
        option('Match existing repo stack', 'match-existing-repo-stack', 'Follow current project conventions.'),
      ],
    },
    {
      id: 'ux',
      question: 'Which UX direction should guide the result?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Clean app UI', 'clean-app-ui', 'Simple, polished, and task-focused.'),
        option('Platform-inspired UI', 'platform-inspired-ui', 'Lean toward a familiar OS/app style.'),
        option('Domain-specific UI', 'domain-specific-ui', 'Use visual styling tailored to the product domain.'),
      ],
    },
    {
      id: 'acceptance',
      question: 'What functionality proves the implementation is complete?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Mouse plus keyboard and core edge cases', 'mouse-keyboard-core-edge-cases', 'Recommended for calculator-like tools.'),
        option('Basic click-only behavior', 'basic-click-only', 'Smallest useful behavior.'),
        option('History, memory, or settings included', 'history-memory-settings', 'Include richer app behavior.'),
      ],
    },
    {
      id: 'verification',
      question: 'What should verify the implementation?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Browser check plus lightweight tests', 'browser-check-plus-lightweight-tests', 'Best balance when practical.'),
        option('Browser check only', 'browser-check-only', 'Manual UI validation.'),
        option('Tests only', 'tests-only', 'Automated verification focus.'),
      ],
    },
    {
      id: 'outputMode',
      question: 'What should happen after intake?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Create harness and implement after approval', 'harness-and-implement-after-approval', 'Generate the harness, then proceed if approved.'),
        option('Create harness only', 'harness-only', 'Stop after goal-ready artifacts.'),
        option('Write spec or PRD first', 'spec-first', 'Clarify requirements before coding.'),
      ],
    },
    {
      id: 'nonGoals',
      question: 'What should stay out of scope?',
      type: 'multi-answerable',
      allow_other: true,
      options: [
        option('No backend, auth, or persistence', 'no-backend-auth-persistence', 'Keep the first pass frontend-only.'),
        option('No new dependencies', 'no-new-dependencies', 'Use plain platform APIs or existing packages.'),
        option('No styling beyond functional layout', 'no-extra-styling', 'Keep visuals basic.'),
      ],
    },
  ];
}

function genericQuestions() {
  return [
    {
      id: 'acceptance',
      question: 'What concrete output proves this is complete?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Repo-local harness plus goal prompt', 'harness-plus-goal-prompt', 'Create Markdown artifacts and a recommended Codex goal.'),
        option('Goal prompt only', 'goal-prompt-only', 'Return only the create_goal-ready prompt.'),
        option('Implemented code plus tests', 'implemented-code-plus-tests', 'Proceed toward implementation after intake.'),
      ],
    },
    {
      id: 'nonGoals',
      question: 'Which non-goals must stay out of scope?',
      type: 'multi-answerable',
      allow_other: true,
      options: [
        option('No implementation until approval', 'no-implementation-until-approval', 'Do not code before goal prompt approval.'),
        option('No broad repo refactor', 'no-broad-refactor', 'Avoid unrelated cleanup.'),
        option('No new dependencies', 'no-new-dependencies', 'Avoid adding packages.'),
      ],
    },
    {
      id: 'verification',
      question: 'What should verify the result?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Markdown inspection plus lightweight checks', 'markdown-plus-lightweight-checks', 'Inspect artifacts and run small repo checks.'),
        option('Full test suite', 'full-test-suite', 'Use project tests as the gate.'),
        option('Manual review only', 'manual-review-only', 'No commands unless requested.'),
      ],
    },
    {
      id: 'workerLanes',
      question: 'Which independent evidence lanes are useful?',
      type: 'multi-answerable',
      allow_other: true,
      options: [
        option('Architect', 'architect', 'Architecture and boundaries.'),
        option('Critic', 'critic', 'Challenge assumptions and completion.'),
        option('Tester', 'tester', 'Verification probes and gaps.'),
      ],
    },
    {
      id: 'localOptimum',
      question: 'How should local-optimum pressure work?',
      type: 'single-answerable',
      allow_other: true,
      options: [
        option('Baseline plus novelty plus critic', 'baseline-novelty-critic', 'Compare alternatives before commitment.'),
        option('Critic review only', 'critic-review-only', 'A lighter pressure pass.'),
        option('Skip local-optimum pressure', 'skip-local-optimum-pressure', 'Only when the task is trivial.'),
      ],
    },
  ];
}

function classifyObjective(objective) {
  const text = objective.toLowerCase();
  if (/(prd|product requirements|requirements|요구사항|기획|스펙|spec)/i.test(text)) return 'planning';
  if (/(app|website|web\s*site|frontend|ui|page|tool|calculator|build|implement|make|create|앱|웹|웹사이트|사이트|페이지|도구|계산기|만들|구현)/i.test(text)) return 'implementation';
  return 'generic';
}

export function intakeQuestionsForObjective(objective) {
  const intent = classifyObjective(objective);
  if (intent === 'planning') return planningQuestions();
  if (intent === 'implementation') return implementationQuestions();
  return genericQuestions();
}

export function buildIntakeQuestionInput(objective, options = {}) {
  const normalizedObjective = safeString(objective).trim();
  if (!normalizedObjective) throw new Error('Missing objective.');
  return normalizeQuestionInput({
    header: options.header || 'Oh My Goal Intake',
    source: options.source || 'oh-my-goal',
    ...(options.sessionId ? { session_id: options.sessionId } : {}),
    questions: intakeQuestionsForObjective(normalizedObjective),
  });
}

function alphaLabel(index) {
  return String.fromCharCode(65 + index);
}

export function renderQuestionInputMarkdown(input) {
  const lines = [
    'Before I create harness files or implementation files, answer these in one reply.',
    '',
    'OMX question schema fallback:',
    `- source: ${input.source || 'oh-my-goal'}`,
    '- contract: `questions[]` with `single-answerable` / `multi-answerable`; reply with selected option keys.',
    '- answer shape: `answers[] -> { question_id, answer: { selected_values: [...] } }`.',
    '',
    'questions[]:',
  ];
  for (const [questionIndex, question] of input.questions.entries()) {
    lines.push(
      `${questionIndex + 1}. [${question.type}] id=${question.id} multi_select=${question.multi_select ? 'true' : 'false'}`,
      `   question: ${question.question}`,
    );
    for (const [optionIndex, item] of question.options.entries()) {
      const description = item.description ? ` - ${item.description}` : '';
      lines.push(`   ${alphaLabel(optionIndex)}) label="${item.label}" value="${item.value}"${description}`);
    }
    if (question.allow_other) {
      lines.push(`   ${alphaLabel(question.options.length)}) other_label="${question.other_label}" value="<free text>"`);
    }
  }
  const example = input.questions.map((_, index) => `${index + 1}A`).join(' ');
  const multi = input.questions.find((question, index) => question.multi_select && index > 0);
  const multiExample = multi ? `; multi-select example: ${input.questions.indexOf(multi) + 1}A,B` : '';
  lines.push('', `Reply with OMX selections, for example: ${example}${multiExample}.`);
  return lines.join('\n');
}

function shellSingleQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function parseArgs(argv) {
  const parsed = { format: 'markdown', source: 'oh-my-goal' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--objective') {
      parsed.objective = argv[++index];
      continue;
    }
    if (arg.startsWith('--objective=')) {
      parsed.objective = arg.slice('--objective='.length);
      continue;
    }
    if (arg === '--format') {
      parsed.format = argv[++index];
      continue;
    }
    if (arg.startsWith('--format=')) {
      parsed.format = arg.slice('--format='.length);
      continue;
    }
    if (arg === '--source') {
      parsed.source = argv[++index];
      continue;
    }
    if (arg === '--session-id') {
      parsed.sessionId = argv[++index];
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    parsed.objective = [parsed.objective, arg].filter(Boolean).join(' ');
  }
  return parsed;
}

function printHelp() {
  console.log(`oh-my-goal intake-question-engine

Usage:
  node scripts/intake-question-engine.mjs --objective "<objective>" [--format markdown|payload|omx-command]

Formats:
  markdown     Last-resort numbered prose fallback for non-structured surfaces.
  payload      Canonical OMX question JSON payload with questions[].
  omx-command  Shell command that passes the payload to omx question --input.
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const input = buildIntakeQuestionInput(args.objective, {
    source: args.source,
    sessionId: args.sessionId,
  });
  if (args.format === 'payload' || args.format === 'json') {
    console.log(JSON.stringify(input, null, 2));
    return;
  }
  if (args.format === 'omx-command') {
    console.log(`omx question --input ${shellSingleQuote(JSON.stringify(input))} --json`);
    return;
  }
  if (args.format === 'markdown') {
    console.log(renderQuestionInputMarkdown(input));
    return;
  }
  throw new Error(`Unknown --format: ${args.format}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    main();
  } catch (error) {
    console.error(`[oh-my-goal intake-question-engine] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
