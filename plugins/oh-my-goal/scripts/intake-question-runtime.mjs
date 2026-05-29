#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildIntakeQuestionInput,
  renderQuestionInputMarkdown,
} from './intake-question-engine.mjs';

const DEFAULT_WAIT_TIMEOUT_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 100;
const AMBIGUITY_BY_ID = {
  deliverableScope: [0.86, 'high', 'Scope changes artifacts, implementation shape, and completion evidence.'],
  acceptance: [0.9, 'high', 'Acceptance determines whether the goal can be completed safely.'],
  nonGoals: [0.88, 'high', 'Boundaries prevent useful-looking scope drift.'],
  verification: [0.82, 'high', 'Verification decides which external evidence is required.'],
  outputMode: [0.78, 'medium-high', 'Output mode decides whether execution starts after harness creation.'],
  handoffTarget: [0.78, 'medium-high', 'Handoff target changes the final artifact and goal prompt.'],
  stack: [0.74, 'medium-high', 'Stack choice affects files, commands, and dependencies.'],
  sourceContext: [0.72, 'medium-high', 'Source context affects repo inspection and research depth.'],
  audience: [0.66, 'medium', 'Reader changes wording and detail level.'],
  ux: [0.64, 'medium', 'UX direction affects layout and polish.'],
  workerLanes: [0.62, 'medium', 'Lane selection affects orchestration cost and evidence quality.'],
  localOptimum: [0.58, 'medium', 'Pressure level affects search breadth and critique.'],
};

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

function parseArgs(argv) {
  const parsed = { cwd: process.cwd(), mode: 'auto', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--ui') {
      parsed.ui = true;
      continue;
    }
    if (arg === '--objective') {
      parsed.objective = argv[++index];
      continue;
    }
    if (arg.startsWith('--objective=')) {
      parsed.objective = arg.slice('--objective='.length);
      continue;
    }
    if (arg === '--cwd') {
      parsed.cwd = argv[++index];
      continue;
    }
    if (arg === '--mode') {
      parsed.mode = argv[++index];
      continue;
    }
    if (arg === '--state-path') {
      parsed.statePath = argv[++index];
      continue;
    }
    if (arg === '--record-path') {
      parsed.statePath = argv[++index];
      continue;
    }
    if (arg === '--answer') {
      parsed.answer = argv[++index];
      continue;
    }
    if (arg.startsWith('--answer=')) {
      parsed.answer = arg.slice('--answer='.length);
      continue;
    }
    if (arg === '--timeout-ms') {
      parsed.timeoutMs = Number.parseInt(argv[++index] || '', 10);
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
  console.log(`oh-my-goal intake-question-runtime

Usage:
  node scripts/intake-question-runtime.mjs --objective "<objective>" [--mode auto|tmux|inline|markdown|sequential] [--json]
  node scripts/intake-question-runtime.mjs --mode sequential-answer --state-path <path> --answer <selection> [--json]
  node scripts/intake-question-runtime.mjs --ui --state-path <path>

Modes:
  auto      Open tmux arrow-key UI when attached; otherwise start sequential fallback.
  tmux      Require tmux pane arrow-key UI and block until answered.
  inline    Ask in the current terminal; uses arrow-key UI when TTY is available.
  markdown  Print the non-interactive fallback block.
  sequential Ask one OMX-schema question at a time with ambiguity scoring.
`);
}

function questionRuntimeRoot(cwd) {
  return join(cwd, '.omg', 'runtime', 'questions');
}

function makeQuestionId() {
  return `question-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf-8');
  await rename(tmp, path);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf-8'));
}

function buildRecord(input, cwd) {
  const now = new Date().toISOString();
  const questionId = makeQuestionId();
  return {
    kind: 'omg.question/v1',
    question_id: questionId,
    created_at: now,
    updated_at: now,
    status: 'pending',
    cwd,
    header: input.header,
    question: input.question,
    options: input.options,
    allow_other: input.allow_other,
    other_label: input.other_label,
    multi_select: input.multi_select,
    type: input.type,
    source: input.source,
    questions: input.questions,
  };
}

function tmux(args) {
  return spawnSync('tmux', args, { encoding: 'utf-8' });
}

function currentTmuxPane() {
  if (!safeString(process.env.TMUX).trim()) return null;
  const target = safeString(process.env.TMUX_PANE).trim();
  if (/^%\d+$/.test(target)) return target;
  const result = tmux(['display-message', '-p', '#{pane_id}']);
  if (result.status !== 0) return null;
  const pane = safeString(result.stdout).trim();
  return /^%\d+$/.test(pane) ? pane : null;
}

function tmuxAvailable() {
  return Boolean(currentTmuxPane());
}

function estimatePaneHeight(record) {
  const questionCount = Array.isArray(record.questions) ? record.questions.length : 1;
  const optionCount = (record.questions || []).reduce((sum, question) => {
    return sum + (Array.isArray(question.options) ? question.options.length : 0) + (question.allow_other ? 1 : 0);
  }, 0);
  return String(Math.min(Math.max(18, questionCount * 3 + optionCount + 6), 36));
}

function launchTmuxUi(statePath, record) {
  const scriptPath = fileURLToPath(import.meta.url);
  const leaderPane = currentTmuxPane();
  if (!leaderPane) throw new Error('tmux mode requires an attached tmux pane.');
  const result = tmux([
    'split-window',
    '-v',
    '-l',
    estimatePaneHeight(record),
    '-t',
    leaderPane,
    process.execPath,
    scriptPath,
    '--ui',
    '--state-path',
    statePath,
  ]);
  if (result.status !== 0) {
    throw new Error(safeString(result.stderr).trim() || 'failed to launch tmux question pane');
  }
  return {
    renderer: 'tmux-pane',
    leader_pane: leaderPane,
    launched_at: new Date().toISOString(),
  };
}

function parseSelectionToken(raw, questionNumber) {
  const trimmed = raw.trim();
  if (!trimmed) return Number.NaN;
  const upper = trimmed.toUpperCase();
  const prefixed = upper.match(/^(\d+)([A-Z])$/);
  if (prefixed) return prefixed[1] === String(questionNumber) ? prefixed[2].charCodeAt(0) - 64 : Number.NaN;
  if (/^[A-Z]$/.test(upper)) return upper.charCodeAt(0) - 64;
  return Number.parseInt(trimmed, 10);
}

function parseSelection(raw, optionCount, multiSelect, questionNumber = null) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withoutOtherText = trimmed.split(':')[0] || trimmed;
  const parts = multiSelect ? trimmed.split(',') : [trimmed];
  const values = parts
    .map((part) => parseSelectionToken(part.trim().split(':')[0] || part.trim(), questionNumber))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  if (!multiSelect && values.length !== 1) return null;
  if (values.some((value) => value < 1 || value > optionCount)) return null;
  return [...new Set(values)];
}

function buildAnswer(question, selections, otherText) {
  const optionCount = question.options.length;
  const otherIndex = optionCount + 1;
  const selectedOptions = selections
    .filter((value) => value <= optionCount)
    .map((value) => question.options[value - 1])
    .filter(Boolean);
  const includesOther = question.allow_other && selections.includes(otherIndex);
  const selectedLabels = selectedOptions.map((option) => option.label);
  const selectedValues = selectedOptions.map((option) => option.value);
  const resolvedOther = includesOther ? safeString(otherText).trim() : '';
  if (includesOther && !resolvedOther) throw new Error('Other response text is required.');

  if (question.type === 'multi-answerable' || question.multi_select) {
    const labels = includesOther ? [...selectedLabels, question.other_label] : selectedLabels;
    const values = includesOther ? [...selectedValues, resolvedOther] : selectedValues;
    return {
      kind: 'multi',
      value: values,
      selected_labels: labels,
      selected_values: values,
      ...(resolvedOther ? { other_text: resolvedOther } : {}),
    };
  }

  if (includesOther) {
    return {
      kind: 'other',
      value: resolvedOther,
      selected_labels: [question.other_label],
      selected_values: [resolvedOther],
      other_text: resolvedOther,
    };
  }

  const selected = selectedOptions[0];
  if (!selected) throw new Error('No option selected.');
  return {
    kind: 'option',
    value: selected.value,
    selected_labels: [selected.label],
    selected_values: [selected.value],
  };
}

function recordQuestions(record) {
  if (Array.isArray(record.questions) && record.questions.length > 0) return record.questions;
  return [{
    id: 'q-1',
    ...(record.header ? { header: record.header } : {}),
    question: record.question,
    options: record.options,
    allow_other: record.allow_other,
    other_label: record.other_label,
    multi_select: record.multi_select,
    type: record.type || (record.multi_select ? 'multi-answerable' : 'single-answerable'),
  }];
}

function isMultiAnswerableQuestion(question) {
  return question.type === 'multi-answerable' || question.multi_select === true;
}

function optionKeyLabel(index) {
  return String.fromCharCode(65 + index);
}

function getOptionEntries(question) {
  const entries = question.options.map((option, index) => ({
    label: `${optionKeyLabel(index)}) ${option.label}`,
    description: typeof option.description === 'string' && option.description.trim() ? option.description.trim() : undefined,
  }));
  if (question.allow_other) {
    entries.push({
      label: `${optionKeyLabel(question.options.length)}) ${question.other_label}`,
      description: undefined,
    });
  }
  return entries;
}

function supportsInteractiveArrowUi(input = process.stdin, output = process.stdout) {
  return Boolean(input.isTTY && output.isTTY && typeof input.setRawMode === 'function');
}

function toggleSelection(selectedIndices, index) {
  return selectedIndices.includes(index)
    ? selectedIndices.filter((value) => value !== index)
    : [...selectedIndices, index].sort((left, right) => left - right);
}

function createInitialInteractiveSelectionState() {
  return { cursorIndex: 0, selectedIndices: [] };
}

function createInitialQuestionWizardState(record) {
  const questions = recordQuestions(record);
  return {
    currentQuestionIndex: 0,
    selections: questions.map(() => createInitialInteractiveSelectionState()),
    otherTexts: questions.map(() => undefined),
    mode: 'answering',
  };
}

function explicitOptionIndexFromKey(key, optionCount) {
  const sequence = safeString(key.sequence).trim().toUpperCase();
  if (/^[1-9]$/.test(sequence)) {
    const index = Number.parseInt(sequence, 10) - 1;
    return index < optionCount ? index : null;
  }
  if (/^[A-Z]$/.test(sequence)) {
    const index = sequence.charCodeAt(0) - 65;
    return index < optionCount ? index : null;
  }
  return null;
}

function applyInteractiveSelectionKey(record, state, key) {
  const question = recordQuestions(record)[0];
  const optionCount = getOptionEntries(question).length;
  if (optionCount === 0) throw new Error('Interactive question UI requires at least one selectable option.');

  const moveCursor = (delta) => ({
    submit: false,
    state: { ...state, cursorIndex: (state.cursorIndex + delta + optionCount) % optionCount, error: undefined },
  });

  if (key.name === 'up') return moveCursor(-1);
  if (key.name === 'down') return moveCursor(1);

  const explicitIndex = explicitOptionIndexFromKey(key, optionCount);
  if (explicitIndex !== null) {
    return {
      submit: !isMultiAnswerableQuestion(question),
      state: {
        ...state,
        cursorIndex: explicitIndex,
        selectedIndices: isMultiAnswerableQuestion(question) ? toggleSelection(state.selectedIndices, explicitIndex) : state.selectedIndices,
        error: undefined,
      },
    };
  }

  if (key.name === 'space') {
    if (!isMultiAnswerableQuestion(question)) return { submit: true, state: { ...state, error: undefined } };
    return { submit: false, state: { ...state, selectedIndices: toggleSelection(state.selectedIndices, state.cursorIndex), error: undefined } };
  }

  if (key.name === 'return' || key.name === 'enter') {
    if (!isMultiAnswerableQuestion(question)) return { submit: true, state: { ...state, error: undefined } };
    if (state.selectedIndices.length > 0) return { submit: true, state: { ...state, error: undefined } };
    return { submit: false, state: { ...state, error: 'Select one or more options with Space before pressing Enter.' } };
  }

  return { submit: false, state };
}

function selectedNumbersForQuestion(question, state) {
  if (isMultiAnswerableQuestion(question)) return state.selectedIndices.map((index) => index + 1);
  return [state.cursorIndex + 1];
}

function isQuestionSelectionValid(question, state) {
  return !isMultiAnswerableQuestion(question) || state.selectedIndices.length > 0;
}

function advanceWizard(record, state) {
  const questions = recordQuestions(record);
  const current = questions[state.currentQuestionIndex];
  if (!isQuestionSelectionValid(current, state.selections[state.currentQuestionIndex])) {
    const selections = state.selections.map((item, index) => index === state.currentQuestionIndex ? { ...item, error: 'Select one or more options with Space before continuing.' } : item);
    return { ...state, selections };
  }
  if (state.currentQuestionIndex >= questions.length - 1) return { ...state, mode: 'review', error: undefined };
  return { ...state, currentQuestionIndex: state.currentQuestionIndex + 1, error: undefined };
}

function questionNeedsOtherTextNow(question, selectionState, otherText) {
  if (!question.allow_other) return false;
  if (otherText !== undefined) return false;
  const selectedNumbers = selectedNumbersForQuestion(question, selectionState);
  const otherIndex = question.options.length + 1;
  return selectedNumbers.includes(otherIndex);
}

function clearStaleOtherText(question, selectionState, otherText) {
  if (otherText === undefined) return undefined;
  if (!question.allow_other) return undefined;
  const selectedNumbers = selectedNumbersForQuestion(question, selectionState);
  const otherIndex = question.options.length + 1;
  return selectedNumbers.includes(otherIndex) ? otherText : undefined;
}

function applyQuestionWizardKey(record, state, key) {
  if (state.mode === 'review') {
    if (key.name === 'left' || key.name === 'backspace') {
      return { submit: false, state: { ...state, mode: 'answering', currentQuestionIndex: recordQuestions(record).length - 1 } };
    }
    if (key.name === 'return' || key.name === 'enter') return { submit: true, state };
    return { submit: false, state };
  }

  if (key.name === 'left' || key.name === 'backspace') {
    return { submit: false, state: { ...state, currentQuestionIndex: Math.max(0, state.currentQuestionIndex - 1), error: undefined } };
  }

  const questions = recordQuestions(record);
  const current = questions[state.currentQuestionIndex];
  const currentSelection = state.selections[state.currentQuestionIndex];
  if (key.name === 'right') {
    if (questionNeedsOtherTextNow(current, currentSelection, state.otherTexts[state.currentQuestionIndex])) {
      return { submit: false, state, needsOtherText: state.currentQuestionIndex };
    }
    return { submit: false, state: advanceWizard(record, state) };
  }

  const update = applyInteractiveSelectionKey({ ...record, ...current, questions: [current] }, currentSelection, key);
  const nextSelections = state.selections.map((item, index) => index === state.currentQuestionIndex ? update.state : item);
  const nextOtherTexts = state.otherTexts.map((value, index) => index === state.currentQuestionIndex ? clearStaleOtherText(current, update.state, value) : value);
  const nextState = { ...state, selections: nextSelections, otherTexts: nextOtherTexts };
  if (!update.submit) return { submit: false, state: nextState };
  if (questionNeedsOtherTextNow(current, update.state, nextOtherTexts[state.currentQuestionIndex])) {
    return { submit: false, state: nextState, needsOtherText: state.currentQuestionIndex };
  }
  return { submit: false, state: advanceWizard(record, nextState) };
}

function formatSelectedLabels(question, state, otherText) {
  const selections = selectedNumbersForQuestion(question, state);
  const otherIndex = question.options.length + 1;
  return selections
    .map((selection) => {
      if (selection === otherIndex && question.allow_other) return otherText ? `${question.other_label}: ${otherText}` : question.other_label;
      return question.options[selection - 1]?.label || question.other_label;
    })
    .join(', ');
}

function renderQuestionWizardFrame(record, state) {
  const questions = recordQuestions(record);
  if (state.mode === 'review') {
    const lines = [record.header || 'Review answers', ''];
    questions.forEach((question, index) => {
      lines.push(`${index + 1}. ${question.question}`);
      lines.push(`   ${formatSelectedLabels(question, state.selections[index], state.otherTexts[index])}`);
    });
    lines.push('', 'Press Enter to submit, ←/Backspace to edit.');
    return `${lines.join('\n')}\n`;
  }

  const question = questions[state.currentQuestionIndex];
  const selection = state.selections[state.currentQuestionIndex];
  const optionEntries = getOptionEntries(question);
  const ambiguity = ambiguityForQuestion(question, state.currentQuestionIndex);
  const lines = [];
  if (record.header) lines.push(record.header);
  if (questions.length > 1) lines.push(`Question ${state.currentQuestionIndex + 1} of ${questions.length}`);
  lines.push(`Ambiguity: ${ambiguity.score.toFixed(2)} (${ambiguity.level}) - ${ambiguity.reason}`);
  lines.push(`[${question.type}] id=${question.id} multi_select=${isMultiAnswerableQuestion(question) ? 'true' : 'false'}`);
  lines.push(question.question);
  optionEntries.forEach((entry, index) => {
    const isActive = selection.cursorIndex === index;
    const isChecked = isMultiAnswerableQuestion(question) ? selection.selectedIndices.includes(index) : isActive;
    const cursor = isActive ? '›' : ' ';
    const box = `[${isChecked ? 'x' : ' '}]`;
    lines.push(entry.description ? `${cursor} ${box} ${entry.label} - ${entry.description}` : `${cursor} ${box} ${entry.label}`);
  });
  lines.push(isMultiAnswerableQuestion(question) ? '↑↓ move · Space toggle · Enter/→ next · ← back' : '↑↓ move · Enter/→ next · ← back');
  if (selection.error || state.error) lines.push(selection.error || state.error || '');
  return `${lines.join('\n')}\n`;
}

function syncOtherTexts(record, state) {
  return recordQuestions(record).map((question, index) => clearStaleOtherText(question, state.selections[index], state.otherTexts[index]));
}

function buildAnswerEntries(record, state, otherTexts = []) {
  return recordQuestions(record).map((question, index) => ({
    question_id: question.id,
    index,
    answer: buildAnswer(question, selectedNumbersForQuestion(question, state.selections[index]), otherTexts[index]),
  }));
}

async function promptForOtherText(label) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const candidate = (await rl.question(`${label}: `)).trim();
      if (candidate) return candidate;
      process.stdout.write('Please enter a response.\n');
    }
  } finally {
    rl.close();
  }
}

function runWizardSegment(record, initialState) {
  return new Promise((resolve, reject) => {
    let state = initialState;
    let finished = false;
    const cleanup = () => {
      process.stdin.off('keypress', onKeypress);
      process.stdin.setRawMode?.(false);
      process.stdin.pause?.();
      process.stdout.write('\u001b[?25h');
    };
    const settle = (result) => {
      if (finished) return;
      finished = true;
      cleanup();
      process.stdout.write('\n');
      resolve(result);
    };
    const fail = (error) => {
      if (finished) return;
      finished = true;
      cleanup();
      process.stdout.write('\n');
      reject(error);
    };
    const render = () => {
      process.stdout.write('\u001b[H\u001b[J');
      process.stdout.write('\u001b[?25l');
      process.stdout.write(renderQuestionWizardFrame(record, state));
    };
    const onKeypress = (_str, key) => {
      if (key.ctrl && key.name === 'c') {
        fail(new Error('Question UI cancelled by user.'));
        return;
      }
      const update = applyQuestionWizardKey(record, state, key);
      state = update.state;
      render();
      if (update.needsOtherText !== undefined) {
        settle({ kind: 'needs-other-text', state, needsOtherText: update.needsOtherText });
        return;
      }
      if (update.submit) settle({ kind: 'submit', state, needsOtherText: -1 });
    };
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode?.(true);
    process.stdin.resume?.();
    process.stdin.on('keypress', onKeypress);
    render();
  });
}

async function promptForAnswersWithArrows(record) {
  if (!supportsInteractiveArrowUi()) throw new Error('Interactive arrow UI requires TTY stdin/stdout with raw-mode support.');
  let state = createInitialQuestionWizardState(record);
  while (true) {
    const segment = await runWizardSegment(record, state);
    state = segment.state;
    if (segment.kind === 'submit') return buildAnswerEntries(record, state, syncOtherTexts(record, state));
    const question = recordQuestions(record)[segment.needsOtherText];
    const text = await promptForOtherText(question.other_label);
    const nextOtherTexts = state.otherTexts.map((value, index) => index === segment.needsOtherText ? text : value);
    state = advanceWizard(record, { ...state, otherTexts: nextOtherTexts });
  }
}

async function askQuestion(question, ask, scripted) {
  console.log('');
  if (question.header) console.log(question.header);
  console.log(question.question);
  question.options.forEach((option, index) => {
    const description = option.description ? ` - ${option.description}` : '';
    console.log(`  ${index + 1}) ${option.label}${description}`);
  });
  if (question.allow_other) console.log(`  ${question.options.length + 1}) ${question.other_label}`);

  const optionCount = question.options.length + (question.allow_other ? 1 : 0);
  const multi = question.type === 'multi-answerable' || question.multi_select;
  let selections = null;
  while (!selections) {
    const prompt = multi ? 'Choose one or more options by number (comma-separated): ' : 'Choose an option by number: ';
    selections = parseSelection(await ask(prompt), optionCount, multi, null);
    if (!selections && scripted) throw new Error(`Invalid scripted selection for question ${question.id}.`);
    if (!selections) console.log('Invalid selection. Try again.');
  }
  let otherText = '';
  if (question.allow_other && selections.includes(question.options.length + 1)) {
    otherText = await ask(`${question.other_label}: `);
  }
  return buildAnswer(question, selections, otherText);
}

function ambiguityForQuestion(question, index) {
  const configured = AMBIGUITY_BY_ID[question.id] || [Math.max(0.42, 0.7 - index * 0.03), 'medium', 'This answer materially affects the harness defaults.'];
  return {
    score: configured[0],
    level: configured[1],
    reason: configured[2],
  };
}

function renderSequentialPrompt(record) {
  const questions = Array.isArray(record.questions) ? record.questions : [];
  const index = Number.isInteger(record.current_index) ? record.current_index : 0;
  const question = questions[index];
  if (!question) return '';
  const ambiguity = ambiguityForQuestion(question, index);
  const multi = question.type === 'multi-answerable' || question.multi_select;
  const lines = [
    record.header || 'Oh My Goal Intake',
    `Question ${index + 1} of ${questions.length}`,
    `Ambiguity: ${ambiguity.score.toFixed(2)} (${ambiguity.level}) - ${ambiguity.reason}`,
    `[${question.type}] id=${question.id} multi_select=${multi ? 'true' : 'false'}`,
    `question: ${question.question}`,
    '',
  ];
  question.options.forEach((option, optionIndex) => {
    const description = option.description ? ` - ${option.description}` : '';
    lines.push(`${String.fromCharCode(65 + optionIndex)}) ${option.label}${description}`);
  });
  if (question.allow_other) lines.push(`${String.fromCharCode(65 + question.options.length)}) ${question.other_label}`);
  lines.push('');
  lines.push(multi ? `Reply with one or more selections, e.g. ${index + 1}A,B. For Other: ${index + 1}${String.fromCharCode(65 + question.options.length)}: <text>` : `Reply with one selection, e.g. ${index + 1}A. For Other: ${index + 1}${String.fromCharCode(65 + question.options.length)}: <text>`);
  return lines.join('\n');
}

function sequentialPromptPayload(record) {
  const index = Number.isInteger(record.current_index) ? record.current_index : 0;
  const question = record.questions[index];
  return {
    ok: false,
    renderer: 'sequential',
    status: 'prompting',
    question_id: record.question_id,
    record_path: record.record_path,
    current_index: index,
    progress: `${index + 1}/${record.questions.length}`,
    ambiguity: ambiguityForQuestion(question, index),
    question,
    answers: record.answers || [],
    prompt: renderSequentialPrompt(record),
  };
}

function extractOtherText(raw) {
  const match = raw.match(/:\s*(.+)$/);
  return match ? match[1].trim() : '';
}

async function runSequentialStart(cwd, input) {
  const { record, statePath } = await createRecord(cwd, input);
  const prompting = {
    ...record,
    status: 'prompting',
    current_index: 0,
    answers: [],
    renderer: {
      renderer: 'sequential',
      launched_at: new Date().toISOString(),
    },
  };
  await writeJsonAtomic(statePath, prompting);
  return sequentialPromptPayload(prompting);
}

async function runSequentialAnswer(statePath, rawAnswer) {
  const record = await readJson(statePath);
  const questions = Array.isArray(record.questions) ? record.questions : [];
  const index = Number.isInteger(record.current_index) ? record.current_index : 0;
  const question = questions[index];
  if (!question) throw new Error('No pending sequential question.');
  const optionCount = question.options.length + (question.allow_other ? 1 : 0);
  const multi = question.type === 'multi-answerable' || question.multi_select;
  const selections = parseSelection(safeString(rawAnswer), optionCount, multi, index + 1);
  if (!selections) {
    return {
      ...sequentialPromptPayload(record),
      error: `Invalid selection for question ${index + 1}.`,
    };
  }
  const otherIndex = question.options.length + 1;
  const needsOther = question.allow_other && selections.includes(otherIndex);
  const otherText = needsOther ? extractOtherText(safeString(rawAnswer)) : '';
  if (needsOther && !otherText) {
    return {
      ...sequentialPromptPayload(record),
      status: 'needs_other',
      error: `Other text is required. Reply like ${index + 1}${String.fromCharCode(64 + otherIndex)}: <text>.`,
    };
  }
  const answer = buildAnswer(question, selections, otherText);
  const answers = [
    ...(Array.isArray(record.answers) ? record.answers.filter((entry) => entry.index !== index) : []),
    { question_id: question.id, index, answer },
  ].sort((left, right) => left.index - right.index);
  const now = new Date().toISOString();
  if (index >= questions.length - 1) {
    const answered = {
      ...record,
      status: 'answered',
      updated_at: now,
      current_index: index,
      answers,
      answer: answers[0]?.answer,
    };
    await writeJsonAtomic(statePath, answered);
    return successPayload(answered);
  }
  const next = {
    ...record,
    status: 'prompting',
    updated_at: now,
    current_index: index + 1,
    answers,
  };
  await writeJsonAtomic(statePath, next);
  return sequentialPromptPayload(next);
}

async function runUi(statePath) {
  const record = await readJson(statePath);
  const questions = Array.isArray(record.questions) ? record.questions : [];
  const scriptedLines = process.stdin.isTTY ? null : readFileSync(0, 'utf-8').split(/\r?\n/);
  if (!scriptedLines && supportsInteractiveArrowUi()) {
    const answers = await promptForAnswersWithArrows(record);
    const now = new Date().toISOString();
    await writeJsonAtomic(statePath, {
      ...record,
      status: 'answered',
      updated_at: now,
      answers,
      answer: answers[0]?.answer,
    });
    return;
  }
  let scriptedIndex = 0;
  const rl = scriptedLines ? null : createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (prompt) => {
    if (scriptedLines) {
      process.stdout.write(prompt);
      const value = scriptedLines[scriptedIndex++];
      if (value === undefined) throw new Error(`Missing scripted input for prompt: ${prompt}`);
      process.stdout.write(`${value}\n`);
      return value;
    }
    return rl.question(prompt);
  };
  const answers = [];
  try {
    console.log('Oh My Goal Intake');
    for (const [index, question] of questions.entries()) {
      const answer = await askQuestion(question, ask, Boolean(scriptedLines));
      answers.push({ question_id: question.id, index, answer });
    }
  } finally {
    rl?.close();
  }
  const now = new Date().toISOString();
  await writeJsonAtomic(statePath, {
    ...record,
    status: 'answered',
    updated_at: now,
    answers,
    answer: answers[0]?.answer,
  });
}

async function waitForAnswer(statePath, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    if (existsSync(statePath)) {
      const record = await readJson(statePath);
      if (record.status === 'answered') return record;
      if (record.status === 'error' || record.status === 'aborted') {
        throw new Error(`question ended with status ${record.status}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`question timed out after ${timeoutMs}ms`);
}

function successPayload(record) {
  return {
    ok: true,
    question_id: record.question_id,
    questions: record.questions,
    answers: record.answers,
    answer: record.answer,
    record_path: record.record_path,
    renderer: record.renderer,
  };
}

async function createRecord(cwd, input) {
  const record = buildRecord(input, cwd);
  const statePath = join(questionRuntimeRoot(cwd), `${record.question_id}.json`);
  const withPath = { ...record, record_path: statePath };
  await writeJsonAtomic(statePath, withPath);
  return { record: withPath, statePath };
}

async function runInline(cwd, input) {
  const { statePath } = await createRecord(cwd, input);
  await runUi(statePath);
  return successPayload(await readJson(statePath));
}

async function runTmux(cwd, input, timeoutMs) {
  const { record, statePath } = await createRecord(cwd, input);
  const renderer = launchTmuxUi(statePath, record);
  await writeJsonAtomic(statePath, {
    ...record,
    status: 'prompting',
    updated_at: new Date().toISOString(),
    renderer,
  });
  return successPayload(await waitForAnswer(statePath, timeoutMs));
}

function printPayload(payload, json) {
  if (json) console.log(JSON.stringify(payload, null, 2));
  else if (payload.prompt) console.log(payload.prompt);
  else if (payload.ok === false && payload.markdown) console.log(payload.markdown);
  else console.log(JSON.stringify(payload, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (args.ui) {
    if (!args.statePath) throw new Error('--ui requires --state-path');
    await runUi(resolve(args.statePath));
    return;
  }

  if (args.mode === 'sequential-answer') {
    if (!args.statePath) throw new Error('--mode sequential-answer requires --state-path');
    if (!args.answer) throw new Error('--mode sequential-answer requires --answer');
    printPayload(await runSequentialAnswer(resolve(args.statePath), args.answer), args.json);
    return;
  }

  const objective = safeString(args.objective).trim();
  if (!objective) throw new Error('Missing objective.');
  const cwd = resolve(args.cwd || process.cwd());
  const input = buildIntakeQuestionInput(objective);
  const markdown = renderQuestionInputMarkdown(input);
  const timeoutMs = Number.isFinite(args.timeoutMs) && args.timeoutMs > 0 ? args.timeoutMs : DEFAULT_WAIT_TIMEOUT_MS;

  if (args.mode === 'markdown') {
    printPayload(args.json ? { ok: false, renderer: 'markdown', payload: input, markdown } : { ok: false, markdown }, args.json);
    return;
  }
  if (args.mode === 'sequential') {
    printPayload(await runSequentialStart(cwd, input), args.json);
    return;
  }
  if (args.mode === 'inline') {
    printPayload(await runInline(cwd, input), args.json);
    return;
  }
  if (args.mode === 'tmux') {
    printPayload(await runTmux(cwd, input, timeoutMs), args.json);
    return;
  }
  if (args.mode === 'auto') {
    if (tmuxAvailable()) {
      printPayload(await runTmux(cwd, input, timeoutMs), args.json);
      return;
    }
    printPayload(await runSequentialStart(cwd, input), args.json);
    return;
  }
  throw new Error(`Unknown --mode: ${args.mode}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || join(tmpdir(), 'missing')).href) {
  try {
    await main();
  } catch (error) {
    console.error(`[oh-my-goal intake-question-runtime] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
