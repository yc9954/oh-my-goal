#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildIntakeQuestionInput,
  renderQuestionInputMarkdown,
} from './intake-question-engine.mjs';

const DEFAULT_WAIT_TIMEOUT_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 100;

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
  node scripts/intake-question-runtime.mjs --objective "<objective>" [--mode auto|tmux|inline|markdown] [--json]
  node scripts/intake-question-runtime.mjs --ui --state-path <path>

Modes:
  auto      Open tmux UI when attached; otherwise return/render markdown fallback.
  tmux      Require tmux pane UI and block until answered.
  inline    Ask in the current terminal and return structured answers.
  markdown  Print the non-interactive fallback block.
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

function parseSelection(raw, optionCount, multiSelect) {
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
    selections = parseSelection(await ask(prompt), optionCount, multi);
    if (!selections && scripted) throw new Error(`Invalid scripted selection for question ${question.id}.`);
    if (!selections) console.log('Invalid selection. Try again.');
  }
  let otherText = '';
  if (question.allow_other && selections.includes(question.options.length + 1)) {
    otherText = await ask(`${question.other_label}: `);
  }
  return buildAnswer(question, selections, otherText);
}

async function runUi(statePath) {
  const record = await readJson(statePath);
  const questions = Array.isArray(record.questions) ? record.questions : [];
  const scriptedLines = process.stdin.isTTY ? null : readFileSync(0, 'utf-8').split(/\r?\n/);
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
    printPayload({
      ok: false,
      renderer: 'markdown',
      reason: 'tmux_not_attached',
      payload: input,
      markdown,
    }, args.json);
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
