import { emitKeypressEvents } from 'node:readline';
import { createInterface as createPromptInterface } from 'node:readline/promises';

// Ported from OMX src/question/ui.ts and src/question/types.ts.
// Keep this file as the plugin-local source for question UI/state behavior;
// transports such as cmux/tmux belong in intake-question-runtime.mjs.

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

export function isMultiAnswerableQuestion(input) {
  return (input.type ?? (input.multi_select === true ? 'multi-answerable' : 'single-answerable')) === 'multi-answerable';
}

export function recordQuestions(record) {
  if (Array.isArray(record.questions) && record.questions.length > 0) return record.questions;
  return [{
    id: 'q-1',
    ...(record.header ? { header: record.header } : {}),
    question: record.question,
    options: record.options,
    allow_other: record.allow_other,
    other_label: record.other_label,
    multi_select: record.multi_select,
    type: record.type ?? (record.multi_select ? 'multi-answerable' : 'single-answerable'),
  }];
}

function getOptionEntries(question) {
  const entries = question.options.map((option, index) => ({
    label: `${index + 1}. ${option.label}`,
    description: typeof option.description === 'string' && option.description.trim()
      ? option.description.trim()
      : undefined,
  }));
  if (question.allow_other) {
    entries.push({
      label: `${question.options.length + 1}. ${question.other_label}`,
      description: undefined,
    });
  }
  return entries;
}

function getOptionLabels(question) {
  return getOptionEntries(question).map((entry) => entry.label);
}

function renderOptions(question) {
  return getOptionEntries(question).flatMap((entry) => {
    const lines = [`  [ ] ${entry.label}`];
    if (entry.description) lines.push(`      ${entry.description}`);
    return lines;
  });
}

export function parseNumericSelection(raw, optionCount, multiSelect) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parts = multiSelect ? trimmed.split(',') : [trimmed];
  const values = parts
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  if (!multiSelect && values.length !== 1) return null;
  if (values.some((value) => value < 1 || value > optionCount)) return null;
  return [...new Set(values)];
}

export function buildAnswer(question, selections, otherText) {
  const optionCount = question.options.length;
  const otherIndex = optionCount + 1;
  const selectedOptions = selections
    .filter((value) => value <= optionCount)
    .map((value) => question.options[value - 1]);
  const selectedLabels = selectedOptions.map((option) => option.label);
  const selectedValues = selectedOptions.map((option) => option.value);
  const includesOther = question.allow_other && selections.includes(otherIndex);

  if (includesOther && !otherText) throw new Error('Other response text is required.');
  const resolvedOtherText = includesOther ? otherText : undefined;

  if (isMultiAnswerableQuestion(question)) {
    const values = resolvedOtherText ? [...selectedValues, resolvedOtherText] : selectedValues;
    const labels = includesOther ? [...selectedLabels, question.other_label] : selectedLabels;
    return {
      kind: 'multi',
      value: values,
      selected_labels: labels,
      selected_values: values,
      ...(resolvedOtherText ? { other_text: resolvedOtherText } : {}),
    };
  }

  if (includesOther) {
    return {
      kind: 'other',
      value: resolvedOtherText,
      selected_labels: [question.other_label],
      selected_values: [resolvedOtherText],
      other_text: resolvedOtherText,
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

export function supportsInteractiveArrowUi(input = process.stdin, output = process.stdout) {
  return Boolean(input.isTTY && output.isTTY && typeof input.setRawMode === 'function');
}

function toggleSelection(selectedIndices, index) {
  return selectedIndices.includes(index)
    ? selectedIndices.filter((value) => value !== index)
    : [...selectedIndices, index].sort((left, right) => left - right);
}

export function createInitialInteractiveSelectionState() {
  return { cursorIndex: 0, selectedIndices: [] };
}

export function applyInteractiveSelectionKey(record, state, key) {
  const question = recordQuestions(record)[0];
  const optionCount = getOptionLabels(question).length;
  if (optionCount === 0) throw new Error('Interactive question UI requires at least one selectable option.');

  const moveCursor = (delta) => ({
    submit: false,
    state: { ...state, cursorIndex: (state.cursorIndex + delta + optionCount) % optionCount, error: undefined },
  });

  if (key.name === 'up') return moveCursor(-1);
  if (key.name === 'down') return moveCursor(1);

  if (key.sequence && /^[1-9]$/.test(key.sequence)) {
    const explicitIndex = Number.parseInt(key.sequence, 10) - 1;
    if (explicitIndex < optionCount) {
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

export function createInitialQuestionWizardState(record) {
  const questions = recordQuestions(record);
  return {
    currentQuestionIndex: 0,
    selections: questions.map(() => createInitialInteractiveSelectionState()),
    otherTexts: questions.map(() => undefined),
    mode: 'answering',
  };
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

function syncOtherTexts(record, state) {
  return recordQuestions(record).map((question, index) => clearStaleOtherText(question, state.selections[index], state.otherTexts[index]));
}

export function applyQuestionWizardKey(record, state, key) {
  if (state.mode === 'review') {
    if (key.name === 'left' || key.name === 'backspace') return { submit: false, state: { ...state, mode: 'answering', currentQuestionIndex: recordQuestions(record).length - 1 } };
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
      if (selection === otherIndex && question.allow_other) {
        return otherText ? `${question.other_label}: ${otherText}` : question.other_label;
      }
      return question.options[selection - 1]?.label ?? question.other_label;
    })
    .join(', ');
}

export function renderQuestionWizardFrame(record, state, options = {}) {
  const questions = recordQuestions(record);
  if (state.mode === 'review') {
    const lines = [record.header ?? 'Review answers', ''];
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
  const lines = [];
  if (record.header) lines.push(record.header);
  if (question.header && question.header !== record.header) lines.push(question.header);
  if (questions.length > 1) lines.push(`Question ${state.currentQuestionIndex + 1} of ${questions.length}`);
  const meta = options.renderQuestionMeta?.(question, state.currentQuestionIndex, record);
  if (typeof meta === 'string' && meta.trim()) lines.push(...meta.split(/\r?\n/));
  lines.push(question.question);
  optionEntries.forEach((entry, index) => {
    const isActive = selection.cursorIndex === index;
    const isChecked = isMultiAnswerableQuestion(question) ? selection.selectedIndices.includes(index) : isActive;
    const cursor = isActive ? '›' : ' ';
    const box = `[${isChecked ? 'x' : ' '}]`;
    lines.push(entry.description ? `${cursor} ${box} ${entry.label} - ${entry.description}` : `${cursor} ${box} ${entry.label}`);
  });
  lines.push(isMultiAnswerableQuestion(question) ? '↑↓ move · Space toggle · Enter/→ next · ← back' : '↑↓ move · Enter/→ next · ← back');
  if (selection.error || state.error) lines.push(selection.error ?? state.error ?? '');
  return `${lines.join('\n')}\n`;
}

function buildAnswerEntries(record, state, otherTexts = []) {
  return recordQuestions(record).map((question, index) => ({
    question_id: question.id,
    index,
    answer: buildAnswer(question, selectedNumbersForQuestion(question, state.selections[index]), otherTexts[index]),
  }));
}

async function promptForOtherText(label, deps = {}) {
  const input = deps.input ?? process.stdin;
  const output = deps.output ?? process.stdout;
  const rl = createPromptInterface({ input, output });
  try {
    while (true) {
      const candidate = (await rl.question(`${label}: `)).trim();
      if (candidate) return candidate;
      output.write('Please enter a response.\n');
    }
  } finally {
    rl.close();
  }
}

function runWizardSegment(record, initialState, deps = {}, options = {}) {
  const input = deps.input ?? process.stdin;
  const output = deps.output ?? process.stdout;
  return new Promise((resolve, reject) => {
    let state = initialState;
    let finished = false;
    const cleanup = () => {
      input.off('keypress', onKeypress);
      input.setRawMode?.(false);
      input.pause?.();
      output.write('\u001b[?25h');
    };
    const settle = (result) => {
      if (finished) return;
      finished = true;
      cleanup();
      output.write('\n');
      resolve(result);
    };
    const fail = (error) => {
      if (finished) return;
      finished = true;
      cleanup();
      output.write('\n');
      reject(error);
    };
    const render = () => {
      output.write('\u001b[H\u001b[J');
      output.write('\u001b[?25l');
      output.write(renderQuestionWizardFrame(record, state, options));
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
    emitKeypressEvents(input);
    input.setRawMode?.(true);
    input.resume?.();
    input.on('keypress', onKeypress);
    render();
  });
}

export async function promptForAnswersWithArrows(record, deps = {}, options = {}) {
  const input = deps.input ?? process.stdin;
  const output = deps.output ?? process.stdout;
  if (!supportsInteractiveArrowUi(input, output)) throw new Error('Interactive arrow UI requires TTY stdin/stdout with raw-mode support.');
  let state = createInitialQuestionWizardState(record);
  while (true) {
    const segment = await runWizardSegment(record, state, { input, output }, options);
    state = segment.state;
    if (segment.kind === 'submit') return buildAnswerEntries(record, state, syncOtherTexts(record, state));
    const question = recordQuestions(record)[segment.needsOtherText];
    const text = await promptForOtherText(question.other_label, { input, output });
    const nextOtherTexts = state.otherTexts.map((value, index) => index === segment.needsOtherText ? text : value);
    state = advanceWizard(record, { ...state, otherTexts: nextOtherTexts });
  }
}

export async function promptForQuestionWithNumbers(question, deps = {}) {
  const input = deps.input ?? process.stdin;
  const output = deps.output ?? process.stdout;
  const rl = createPromptInterface({ input, output });
  try {
    output.write('\n');
    if (question.header) output.write(`${question.header}\n`);
    output.write(`${question.question}\n\n`);
    output.write(`${renderOptions(question).join('\n')}\n\n`);
    const optionCount = question.options.length + (question.allow_other ? 1 : 0);
    const prompt = isMultiAnswerableQuestion(question) ? 'Choose one or more options by number (comma-separated): ' : 'Choose an option by number: ';
    let selections = null;
    while (!selections) {
      selections = parseNumericSelection(await rl.question(prompt), optionCount, isMultiAnswerableQuestion(question));
      if (!selections) output.write('Invalid selection. Please try again.\n');
    }
    return selections;
  } finally {
    rl.close();
  }
}
