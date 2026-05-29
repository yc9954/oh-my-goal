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
  localizeQuestionForLocale,
  renderQuestionInputMarkdown,
} from './intake-question-engine.mjs';
import {
  buildAnswer,
  isMultiAnswerableQuestion,
  promptForAnswersWithArrows,
  recordQuestions,
  supportsInteractiveArrowUi,
} from './omx-question-core.mjs';

const DEFAULT_WAIT_TIMEOUT_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 100;
const RESIDUAL_AMBIGUITY_THRESHOLD = 0.35;
const MAX_QUESTIONS = 16;
const QUALITY_QUESTION_IDS = ['qualityFrontier', 'qualityPruning', 'pruningRule'];
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
  completionArtifacts: [0.54, 'medium', 'Exact artifacts make completion auditable.'],
  edgeCases: [0.52, 'medium', 'Feature-rich implementations need explicit edge-case boundaries.'],
  visualPolishLevel: [0.46, 'medium', 'Visual direction prevents vague polish loops.'],
  verificationCommand: [0.5, 'medium', 'A concrete verification path lowers completion risk.'],
  dependencyPolicy: [0.44, 'medium', 'Dependency policy prevents accidental stack expansion.'],
  dataPersistence: [0.48, 'medium', 'State persistence changes implementation and tests.'],
  prdDecision: [0.5, 'medium', 'PRD depth depends on the decision it must support.'],
  releaseHorizon: [0.44, 'medium', 'Planning horizon changes scope and specificity.'],
  qualityFrontier: [0.76, 'medium-high', 'Quality frontier opens competing improvement paths before premature convergence.'],
  qualityPruning: [0.72, 'medium-high', 'Pruning decides which quality paths are worth spending tokens and worker lanes on.'],
  pruningRule: [0.68, 'medium', 'The pruning rule prevents quality work from becoming vague polish or scope creep.'],
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
    if (arg === '--locale') {
      parsed.locale = argv[++index];
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
  node scripts/intake-question-runtime.mjs --objective "<objective>" [--mode auto|cmux|tmux|inline|markdown|sequential] [--locale ko|en] [--json]
  node scripts/intake-question-runtime.mjs --mode status --state-path <path> [--json]
  node scripts/intake-question-runtime.mjs --mode sequential-answer --state-path <path> --answer <selection> [--json]
  node scripts/intake-question-runtime.mjs --ui --state-path <path>

Modes:
  auto      Open cmux/tmux arrow-key UI when attached; on macOS open Terminal UI; return prompting state instead of blocking.
  cmux      Require cmux pane arrow-key UI and return prompting state.
  tmux      Require tmux pane arrow-key UI and block until answered.
  inline    Ask in the current terminal; uses arrow-key UI when TTY is available.
  markdown  Print the non-interactive fallback block.
  sequential Ask one OMX-schema question at a time with ambiguity scoring.
  status    Read a question record and return answered or prompting state.
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
    objective: input.objective,
    locale: input.locale,
    questions: input.questions,
  };
}

function tmux(args) {
  return spawnSync('tmux', args, { encoding: 'utf-8' });
}

function cmuxBin() {
  return safeString(process.env.CMUX_BUNDLED_CLI_PATH).trim() || 'cmux';
}

function cmux(args) {
  return spawnSync(cmuxBin(), args, { encoding: 'utf-8' });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function isPaneId(value) {
  return /^%\d+$/.test(safeString(value).trim());
}

function currentTmuxPane() {
  if (!safeString(process.env.TMUX).trim()) return null;
  const target = safeString(process.env.TMUX_PANE).trim();
  if (isPaneId(target)) return target;
  const result = tmux(['display-message', '-p', '#{pane_id}']);
  if (result.status !== 0) return null;
  const pane = safeString(result.stdout).trim();
  return isPaneId(pane) ? pane : null;
}

function tmuxAvailable() {
  return Boolean(currentTmuxPane() && isCurrentTmuxSessionAttached());
}

function isCurrentTmuxSessionAttached() {
  if (!safeString(process.env.TMUX).trim()) return false;
  const target = currentTmuxPane();
  const result = tmux(['display-message', '-p', ...(target ? ['-t', target] : []), '#{session_attached}']);
  if (result.status !== 0) return false;
  return Number.parseInt(safeString(result.stdout).trim(), 10) > 0;
}

function parsePaneIdFromTmuxOutput(output) {
  const pane = safeString(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => isPaneId(line));
  return pane || null;
}

function isTmuxPaneAlive(paneId) {
  if (!isPaneId(paneId)) return false;
  const result = tmux(['list-panes', '-t', paneId, '-F', '#{pane_dead}\t#{pane_id}']);
  if (result.status !== 0) return false;
  return safeString(result.stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .some((line) => {
      const [paneDead = '', resolvedPaneId = ''] = line.split('\t');
      return resolvedPaneId === paneId && paneDead !== '1';
    });
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
  if (!isCurrentTmuxSessionAttached()) throw new Error('tmux mode requires an attached tmux client.');
  const result = tmux([
    'split-window',
    '-v',
    '-l',
    estimatePaneHeight(record),
    '-t',
    leaderPane,
    '-P',
    '-F',
    '#{pane_id}',
    '-c',
    record.cwd || process.cwd(),
    '-e',
    `OMG_QUESTION_RETURN_PANE=${leaderPane}`,
    '-e',
    'OMG_QUESTION_RETURN_TRANSPORT=state',
    process.execPath,
    scriptPath,
    '--ui',
    '--state-path',
    statePath,
  ]);
  if (result.status !== 0) {
    throw new Error(safeString(result.stderr).trim() || 'failed to launch tmux question pane');
  }
  const paneId = parsePaneIdFromTmuxOutput(result.stdout);
  if (!paneId) throw new Error('failed to resolve tmux question pane id');
  return {
    renderer: 'tmux-pane',
    target: paneId,
    leader_pane: leaderPane,
    return_target: leaderPane,
    return_transport: 'state',
    launched_at: new Date().toISOString(),
  };
}

function cmuxBridgeDisabled() {
  return safeString(process.env.OMG_DISABLE_CMUX_BRIDGE).trim() === '1';
}

function parseCmuxRefs(output) {
  const refs = { workspace: [], pane: [], surface: [] };
  const matches = safeString(output).match(/\b(?:workspace|pane|surface):[A-Za-z0-9._-]+\b/g) || [];
  for (const ref of matches) {
    const [kind] = ref.split(':');
    if (refs[kind] && !refs[kind].includes(ref)) refs[kind].push(ref);
  }
  return refs;
}

function parseCmuxIdentify(output) {
  try {
    const payload = JSON.parse(safeString(output));
    const caller = payload.caller || {};
    const focused = payload.focused || {};
    return {
      workspace: caller.workspace_ref || focused.workspace_ref || safeString(process.env.CMUX_WORKSPACE_ID).trim(),
      surface: caller.surface_ref || safeString(process.env.CMUX_SURFACE_ID).trim(),
      pane: caller.pane_ref || '',
      focused_surface: focused.surface_ref || '',
      focused_pane: focused.pane_ref || '',
    };
  } catch {
    return null;
  }
}

function currentCmuxContext() {
  if (cmuxBridgeDisabled()) return null;
  const result = cmux(['identify']);
  if (result.status === 0) {
    const parsed = parseCmuxIdentify(result.stdout);
    if (parsed?.workspace) return parsed;
  }
  const workspace = safeString(process.env.CMUX_WORKSPACE_ID).trim();
  const surface = safeString(process.env.CMUX_SURFACE_ID).trim();
  if (!workspace && !surface) return null;
  return { workspace, surface, pane: '', focused_surface: '', focused_pane: '' };
}

function cmuxAvailable() {
  return Boolean(currentCmuxContext()?.workspace);
}

function cmuxTargetFromNewPane(output, workspace) {
  const refs = parseCmuxRefs(output);
  let surface = refs.surface[0] || '';
  const pane = refs.pane[0] || '';
  if (!surface && pane) {
    const surfaces = cmux(['list-pane-surfaces', '--workspace', workspace, '--pane', pane]);
    if (surfaces.status === 0) surface = parseCmuxRefs(surfaces.stdout).surface[0] || '';
  }
  if (!surface) {
    const identity = parseCmuxIdentify(cmux(['identify']).stdout);
    surface = identity?.focused_surface || '';
  }
  return { pane, surface };
}

function envAssignment(name, value) {
  const trimmed = safeString(value).trim();
  return trimmed ? `${name}=${shellQuote(trimmed)}` : '';
}

function buildQuestionUiCommand(statePath, cwd, env = {}) {
  const scriptPath = fileURLToPath(import.meta.url);
  const envPrefix = [
    envAssignment('OMG_QUESTION_RETURN_TRANSPORT', 'state'),
    envAssignment('OMG_QUESTION_RETURN_CMUX_WORKSPACE', env.cmuxWorkspace),
    envAssignment('OMG_QUESTION_RETURN_CMUX_SURFACE', env.cmuxSurface),
    envAssignment('OMG_QUESTION_RETURN_CMUX_PANE', env.cmuxPane),
    envAssignment('OMG_QUESTION_RETURN_MESSAGE', env.returnMessage),
  ].filter(Boolean).join(' ');
  return [
    `cd ${shellQuote(cwd)}`,
    `printf '\\\\033]0;Oh My Goal Intake\\\\007'`,
    `${envPrefix} ${shellQuote(process.execPath)} ${shellQuote(scriptPath)} --ui --state-path ${shellQuote(statePath)}`,
    'exit',
  ].join('; ');
}

function launchCmuxUi(statePath, record) {
  const context = currentCmuxContext();
  if (!context?.workspace) throw new Error('cmux mode requires an active cmux workspace.');
  const result = cmux([
    'new-pane',
    '--type',
    'terminal',
    '--direction',
    'down',
    '--workspace',
    context.workspace,
    '--focus',
    'true',
  ]);
  if (result.status !== 0) throw new Error(safeString(result.stderr).trim() || 'failed to launch cmux question pane');
  const target = cmuxTargetFromNewPane(`${result.stdout}\n${result.stderr}`, context.workspace);
  if (!target.surface) throw new Error('failed to resolve cmux question surface');
  const send = cmux([
    'send',
    '--workspace',
    context.workspace,
    '--surface',
    target.surface,
    '--',
    `${buildQuestionUiCommand(statePath, record.cwd || process.cwd(), {
      cmuxWorkspace: context.workspace,
      cmuxSurface: context.surface,
      cmuxPane: context.pane,
      returnMessage: 'continue',
    })}\n`,
  ]);
  if (send.status !== 0) throw new Error(safeString(send.stderr).trim() || 'failed to send cmux question command');
  return {
    renderer: 'cmux-pane',
    target: target.surface,
    pane: target.pane || undefined,
    workspace: context.workspace,
    leader_surface: context.surface || undefined,
    return_target: context.surface || undefined,
    return_transport: 'state',
    launched_at: new Date().toISOString(),
  };
}

function macosTerminalBridgeAvailable() {
  if (process.platform !== 'darwin') return false;
  if (safeString(process.env.OMG_DISABLE_TERMINAL_BRIDGE).trim() === '1') return false;
  return true;
}

function launchMacosTerminalUi(statePath, record) {
  const cwd = record.cwd || process.cwd();
  const command = buildQuestionUiCommand(statePath, cwd);
  const appleScript = [
    'tell application "Terminal"',
    `  do script ${JSON.stringify(command)}`,
    '  activate',
    'end tell',
  ].join('\n');
  const result = spawnSync('osascript', ['-e', appleScript], { encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error(safeString(result.stderr).trim() || 'failed to launch macOS Terminal question UI');
  }
  return {
    renderer: 'macos-terminal',
    target: 'Terminal.app',
    return_transport: 'state',
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
  const parts = multiSelect ? trimmed.split(',') : [trimmed];
  const values = parts
    .map((part) => parseSelectionToken(part.trim().split(':')[0] || part.trim(), questionNumber))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  if (!multiSelect && values.length !== 1) return null;
  if (values.some((value) => value < 1 || value > optionCount)) return null;
  return [...new Set(values)];
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

function option(label, value, description) {
  return { label, value, ...(description ? { description } : {}) };
}

function ambiguityForQuestion(question, index) {
  const configured = AMBIGUITY_BY_ID[question.id] || [Math.max(0.42, 0.7 - index * 0.03), 'medium', 'This answer materially affects the harness defaults.'];
  return {
    score: configured[0],
    level: configured[1],
    reason: configured[2],
  };
}

function answerEntries(record) {
  return Array.isArray(record.answers) ? record.answers : [];
}

function answerValuesMap(answers) {
  const map = new Map();
  for (const entry of answers || []) {
    if (!entry?.question_id) continue;
    const values = Array.isArray(entry.answer?.selected_values)
      ? entry.answer.selected_values.map((value) => safeString(value)).filter(Boolean)
      : [];
    if (entry.answer?.other_text) values.push(safeString(entry.answer.other_text));
    map.set(entry.question_id, values);
  }
  return map;
}

function selectedValueSet(answers, questionId) {
  return new Set(answerValuesMap(answers).get(questionId) || []);
}

function hasQuestion(record, questionId) {
  return recordQuestions(record).some((question) => question.id === questionId);
}

function selectedAny(answers, questionId, values) {
  const selected = selectedValueSet(answers, questionId);
  return values.some((value) => selected.has(value));
}

function questionCount(record) {
  return recordQuestions(record).length;
}

function hasAnswered(answers, questionId) {
  const values = answerValuesMap(answers);
  return values.has(questionId) && (values.get(questionId) || []).length > 0;
}

function qualityPruningStatus(record, answers) {
  const questions = recordQuestions(record);
  const present = new Set(questions.map((question) => question.id));
  const missingQuestions = QUALITY_QUESTION_IDS.filter((id) => !present.has(id));
  const missingAnswers = QUALITY_QUESTION_IDS.filter((id) => present.has(id) && !hasAnswered(answers, id));
  const complete = missingQuestions.length === 0 && missingAnswers.length === 0;
  return {
    complete,
    stage: complete ? 'complete' : 'pending',
    missing_questions: missingQuestions,
    missing_answers: missingAnswers,
    required: QUALITY_QUESTION_IDS,
  };
}

function isImplementationRecord(record) {
  const ids = new Set(recordQuestions(record).map((question) => question.id));
  return ids.has('stack') || ids.has('ux') || ids.has('outputMode');
}

function isPlanningRecord(record) {
  const ids = new Set(recordQuestions(record).map((question) => question.id));
  return ids.has('handoffTarget') || ids.has('audience');
}

function residualAmbiguity(record, answers) {
  const values = answerValuesMap(answers);
  const risks = [];
  const add = (dimension, score, reason) => risks.push({ dimension, score, reason });
  const has = (id) => values.has(id) && (values.get(id) || []).length > 0;

  if (isImplementationRecord(record)) {
    if (!has('deliverableScope')) add('deliverableScope', 0.86, 'Implementation scope is still unknown.');
    else if (selectedAny(answers, 'deliverableScope', ['full-featured']) && !has('edgeCases')) add('edgeCases', 0.62, 'Full-featured scope needs explicit feature and edge-case boundaries.');
    else add('deliverableScope', 0.18, 'Scope is concrete enough.');

    if (!has('acceptance')) add('acceptance', 0.9, 'Completion behavior is still unknown.');
    else if (selectedAny(answers, 'acceptance', ['history-memory-settings']) && (!has('edgeCases') || !has('dataPersistence'))) add('acceptance', 0.66, 'History, memory, or settings require explicit edge cases and persistence rules.');
    else add('acceptance', 0.24, 'Completion behavior is concrete enough.');

    if (!has('ux')) add('ux', 0.64, 'UX direction is still unknown.');
    else if (selectedAny(answers, 'ux', ['domain-specific-ui', 'platform-inspired-ui']) && !has('visualPolishLevel')) add('visualPolishLevel', 0.52, 'The selected UX direction needs a concrete visual target.');
    else add('ux', 0.2, 'UX direction is bounded.');

    if (!has('verification')) add('verification', 0.82, 'Verification is still unknown.');
    else if (!has('verificationCommand') && selectedAny(answers, 'verification', ['browser-check-only', 'tests-only'])) add('verificationCommand', 0.48, 'Verification choice needs an executable or inspectable path.');
    else add('verification', 0.18, 'Verification path is concrete enough.');

    const nonGoals = selectedValueSet(answers, 'nonGoals');
    if (!has('nonGoals')) add('nonGoals', 0.88, 'Non-goals are still unknown.');
    else if (!nonGoals.has('no-new-dependencies') && !has('dependencyPolicy')) add('dependencyPolicy', 0.42, 'Dependency policy is still open.');
    else add('nonGoals', 0.2, 'Boundaries are concrete enough.');
  } else if (isPlanningRecord(record)) {
    if (!has('deliverableScope')) add('deliverableScope', 0.8, 'Planning scope is still unknown.');
    else add('deliverableScope', 0.22, 'Planning scope is bounded.');
    if (!has('handoffTarget')) add('handoffTarget', 0.78, 'Handoff target is still unknown.');
    else add('handoffTarget', 0.24, 'Handoff target is bounded.');
    if (!has('prdDecision')) add('prdDecision', 0.5, 'The decision the PRD must support is still unclear.');
    else add('prdDecision', 0.18, 'PRD decision target is concrete enough.');
    if (!has('releaseHorizon')) add('releaseHorizon', 0.42, 'Planning horizon is still vague.');
    else add('releaseHorizon', 0.18, 'Planning horizon is concrete enough.');
  } else {
    if (!has('acceptance')) add('acceptance', 0.9, 'Completion evidence is still unknown.');
    else add('acceptance', 0.26, 'Completion evidence is bounded.');
    if (!has('workerLanes')) add('workerLanes', 0.62, 'Evidence lanes are still unknown.');
    else add('workerLanes', 0.22, 'Evidence lanes are bounded.');
    if (!has('verification')) add('verification', 0.82, 'Verification is still unknown.');
    else if (!has('verificationCommand')) add('verificationCommand', 0.46, 'Verification choice needs a concrete path.');
    else add('verification', 0.18, 'Verification path is concrete enough.');
  }

  const highest = risks.reduce((best, item) => item.score > best.score ? item : best, { dimension: 'complete', score: 0.12, reason: 'Residual ambiguity is low enough.' });
  return {
    score: Math.max(0.12, Math.min(0.99, highest.score)),
    level: highest.score >= 0.75 ? 'high' : highest.score >= 0.5 ? 'medium-high' : highest.score >= RESIDUAL_AMBIGUITY_THRESHOLD ? 'medium' : 'low',
    dimension: highest.dimension,
    reason: highest.reason,
    threshold: RESIDUAL_AMBIGUITY_THRESHOLD,
    risks: risks.sort((left, right) => right.score - left.score).slice(0, 5),
  };
}

function implementationFollowup(record, answers, residual) {
  if (residual.score <= RESIDUAL_AMBIGUITY_THRESHOLD) return null;
  if (questionCount(record) >= MAX_QUESTIONS) return null;
  if (selectedAny(answers, 'deliverableScope', ['full-featured']) && !hasQuestion(record, 'edgeCases')) {
    return {
      id: 'edgeCases',
      question: 'Which edge cases or secondary behaviors must be included?',
      type: 'multi-answerable',
      multi_select: true,
      allow_other: true,
      other_label: 'Other edge case',
      options: [
        option('Decimals, negative numbers, and chained operations', 'numeric-edge-cases', 'Important for calculator-like tools.'),
        option('Responsive layout and keyboard accessibility', 'responsive-keyboard-accessibility', 'Important for web apps.'),
        option('Clear error states for invalid input', 'invalid-input-states', 'Prevents silent wrong behavior.'),
      ],
    };
  }
  if (selectedAny(answers, 'acceptance', ['history-memory-settings']) && !hasQuestion(record, 'dataPersistence')) {
    return {
      id: 'dataPersistence',
      question: 'How should history, memory, or settings persist?',
      type: 'single-answerable',
      multi_select: false,
      allow_other: true,
      other_label: 'Other persistence rule',
      options: [
        option('No persistence after refresh', 'no-refresh-persistence', 'Keep state in memory only.'),
        option('Persist locally in the browser', 'local-browser-persistence', 'Use localStorage or equivalent.'),
        option('Session-only persistence', 'session-only-persistence', 'Persist only while the tab/session is open.'),
      ],
    };
  }
  if (selectedAny(answers, 'ux', ['domain-specific-ui', 'platform-inspired-ui']) && !hasQuestion(record, 'visualPolishLevel')) {
    return {
      id: 'visualPolishLevel',
      question: 'What visual target should constrain polish?',
      type: 'single-answerable',
      multi_select: false,
      allow_other: true,
      other_label: 'Other visual target',
      options: [
        option('Compact mobile-app feel', 'compact-mobile-app', 'Prioritize touch-friendly layout.'),
        option('Desktop web tool feel', 'desktop-web-tool', 'Prioritize keyboard and workspace ergonomics.'),
        option('Distinct branded theme', 'distinct-branded-theme', 'Use a stronger custom visual identity.'),
      ],
    };
  }
  if (!hasQuestion(record, 'verificationCommand')) {
    return {
      id: 'verificationCommand',
      question: 'Which concrete verification path should the leader use?',
      type: 'single-answerable',
      multi_select: false,
      allow_other: true,
      other_label: 'Other verification path',
      options: [
        option('Open the page in a browser and inspect core flows', 'browser-core-flow-check', 'Best for simple static web apps.'),
        option('Add and run a lightweight automated smoke test', 'lightweight-smoke-test', 'Use when behavior can be tested cheaply.'),
        option('Use the project test command if one exists', 'project-test-command', 'Match existing repo checks.'),
      ],
    };
  }
  if (!selectedValueSet(answers, 'nonGoals').has('no-new-dependencies') && !hasQuestion(record, 'dependencyPolicy')) {
    return {
      id: 'dependencyPolicy',
      question: 'What dependency policy should constrain implementation?',
      type: 'single-answerable',
      multi_select: false,
      allow_other: true,
      other_label: 'Other dependency policy',
      options: [
        option('No new dependencies', 'no-new-dependencies', 'Use platform APIs or existing packages.'),
        option('Allow dev dependencies for tests only', 'dev-dependencies-for-tests-only', 'Keep runtime dependency surface stable.'),
        option('Allow a small framework scaffold if useful', 'allow-small-framework-scaffold', 'Prefer speed and structure.'),
      ],
    };
  }
  return null;
}

function qualityFollowup(record, answers) {
  if (questionCount(record) >= MAX_QUESTIONS) return null;
  const status = qualityPruningStatus(record, answers);
  if (status.complete) return null;
  const missingId = status.missing_questions[0];
  if (missingId === 'qualityFrontier') {
    return {
      id: 'qualityFrontier',
      question: 'Which quality-improvement directions should be explored before choosing a path?',
      type: 'multi-answerable',
      multi_select: true,
      allow_other: true,
      other_label: 'Other quality direction',
      options: [
        option('User workflow polish', 'user-workflow-polish', 'Improve actual task flow, layout, and interaction feel.'),
        option('Reliability and edge cases', 'reliability-edge-cases', 'Catch false completion beyond happy-path behavior.'),
        option('Maintainable simple structure', 'maintainable-simple-structure', 'Improve quality without creating architecture bloat.'),
        option('Verification depth', 'verification-depth', 'Design probes that can falsify weak solutions.'),
      ],
    };
  }
  if (missingId === 'qualityPruning') {
    return {
      id: 'qualityPruning',
      question: 'Which quality directions should survive pruning into the execution strategy?',
      type: 'multi-answerable',
      multi_select: true,
      allow_other: true,
      other_label: 'Other surviving direction',
      options: [
        option('User-visible value first', 'user-visible-value-first', 'Keep improvements that noticeably improve the user outcome.'),
        option('Verification and reliability first', 'verification-reliability-first', 'Keep improvements that reduce false completion risk.'),
        option('Simple maintainable core first', 'simple-maintainable-core-first', 'Keep improvements that improve quality without bloating scope.'),
        option('Novel alternative lane', 'novel-alternative-lane', 'Keep one structurally different path for comparison.'),
      ],
    };
  }
  if (missingId === 'pruningRule') {
    return {
      id: 'pruningRule',
      question: 'What rule should prune quality candidates?',
      type: 'single-answerable',
      multi_select: false,
      allow_other: true,
      other_label: 'Other pruning rule',
      options: [
        option('Maximize useful quality within current scope', 'maximize-quality-within-scope', 'Improve quality without expanding the goal.'),
        option('Minimize false-completion risk', 'minimize-false-completion-risk', 'Prefer candidates that create stronger evidence.'),
        option('Best quality per implementation cost', 'best-quality-per-cost', 'Prefer high leverage improvements and reject expensive polish.'),
      ],
    };
  }
  return null;
}

function planningFollowup(record, answers, residual) {
  if (residual.score <= RESIDUAL_AMBIGUITY_THRESHOLD) return null;
  if (questionCount(record) >= MAX_QUESTIONS) return null;
  if (!hasQuestion(record, 'prdDecision')) {
    return {
      id: 'prdDecision',
      question: 'What decision should the PRD make possible?',
      type: 'single-answerable',
      multi_select: false,
      allow_other: true,
      other_label: 'Other decision',
      options: [
        option('Scope and acceptance alignment', 'scope-acceptance-alignment', 'Clarify what should be built.'),
        option('Roadmap or version planning', 'roadmap-version-planning', 'Clarify sequencing and milestones.'),
        option('Implementation handoff', 'implementation-handoff', 'Prepare tasks for builders or Codex goal execution.'),
      ],
    };
  }
  if (!hasQuestion(record, 'releaseHorizon')) {
    return {
      id: 'releaseHorizon',
      question: 'What planning horizon should this target?',
      type: 'single-answerable',
      multi_select: false,
      allow_other: true,
      other_label: 'Other horizon',
      options: [
        option('Immediate next iteration', 'immediate-next-iteration', 'Optimize for near-term execution.'),
        option('Next product version', 'next-product-version', 'Plan a larger coherent release.'),
        option('Long-term product direction', 'long-term-direction', 'Emphasize strategy and constraints.'),
      ],
    };
  }
  return null;
}

function genericFollowup(record, answers, residual) {
  if (residual.score <= RESIDUAL_AMBIGUITY_THRESHOLD) return null;
  if (questionCount(record) >= MAX_QUESTIONS) return null;
  if (!hasQuestion(record, 'verificationCommand')) {
    return {
      id: 'verificationCommand',
      question: 'Which concrete verification path should the leader use?',
      type: 'single-answerable',
      multi_select: false,
      allow_other: true,
      other_label: 'Other verification path',
      options: [
        option('Inspect generated artifacts', 'inspect-generated-artifacts', 'Use direct file review.'),
        option('Run lightweight repo checks', 'run-lightweight-repo-checks', 'Use available commands.'),
        option('Run full project validation', 'run-full-project-validation', 'Use the strongest available gate.'),
      ],
    };
  }
  return null;
}

function nextFollowupQuestion(record, answers) {
  const residual = residualAmbiguity(record, answers);
  let question = null;
  let phase = 'ambiguity';
  if (isImplementationRecord(record)) question = implementationFollowup(record, answers, residual);
  else if (isPlanningRecord(record)) question = planningFollowup(record, answers, residual);
  else question = genericFollowup(record, answers, residual);
  if (!question && residual.score <= RESIDUAL_AMBIGUITY_THRESHOLD) {
    question = qualityFollowup(record, answers);
    if (question) phase = 'quality-pruning';
  }
  return { residual, question, quality: qualityPruningStatus(record, answers), phase };
}

function mergeAnswerEntries(existing, incoming) {
  const byIndex = new Map();
  for (const entry of existing || []) byIndex.set(entry.index, entry);
  for (const entry of incoming || []) byIndex.set(entry.index, entry);
  return [...byIndex.values()].sort((left, right) => left.index - right.index);
}

function pendingQuestions(record, answers) {
  const answeredIds = new Set((answers || []).map((entry) => entry.question_id));
  return recordQuestions(record)
    .map((question, index) => ({ question, index }))
    .filter((entry) => !answeredIds.has(entry.question.id));
}

async function promptForPendingAnswersWithArrows(record, existingAnswers) {
  const pending = pendingQuestions(record, existingAnswers);
  if (pending.length === 0) return [];
  const pendingRecord = {
    ...record,
    questions: pending.map((entry) => entry.question),
  };
  const answers = await promptForAnswersWithArrows(pendingRecord, {}, {
    renderQuestionMeta: (question, relativeIndex) => {
      const sourceIndex = pending[relativeIndex]?.index ?? relativeIndex;
      const ambiguity = ambiguityForQuestion(question, sourceIndex);
      const ambiguityLabel = record.locale === 'ko' ? '모호도' : 'Ambiguity';
      return [
        `${ambiguityLabel}: ${ambiguity.score.toFixed(2)} (${ambiguity.level}) - ${ambiguity.reason}`,
        `[${question.type}] id=${question.id} multi_select=${isMultiAnswerableQuestion(question) ? 'true' : 'false'}`,
      ].join('\n');
    },
  });
  return answers.map((entry) => ({
    ...entry,
    question_id: pending[entry.index].question.id,
    index: pending[entry.index].index,
  }));
}

async function finalizeOrExtendRecord(statePath, record, answers) {
  const { residual, question, quality, phase } = nextFollowupQuestion(record, answers);
  const now = new Date().toISOString();
  if (question) {
    const localizedQuestion = localizeQuestionForLocale(question, record.locale);
    const questions = [...recordQuestions(record), localizedQuestion];
    const extended = {
      ...record,
      status: 'prompting',
      updated_at: now,
      current_index: questions.length - 1,
      questions,
      answers,
      residual_ambiguity: residual,
      quality_pruning: quality,
      followup_phase: phase,
      followup_required: true,
    };
    await writeJsonAtomic(statePath, extended);
    return { complete: false, record: extended };
  }
  const answered = {
    ...record,
    status: 'answered',
    updated_at: now,
    current_index: Math.max(0, recordQuestions(record).length - 1),
    answers,
    answer: answers[0]?.answer,
    residual_ambiguity: residual,
    quality_pruning: qualityPruningStatus(record, answers),
    followup_phase: 'complete',
    followup_required: false,
  };
  await writeJsonAtomic(statePath, answered);
  return { complete: true, record: answered };
}

function notifyQuestionReturn(_record, statePath) {
  const workspace = safeString(process.env.OMG_QUESTION_RETURN_CMUX_WORKSPACE).trim();
  const surface = safeString(process.env.OMG_QUESTION_RETURN_CMUX_SURFACE).trim();
  const pane = safeString(process.env.OMG_QUESTION_RETURN_CMUX_PANE).trim();
  if (!workspace || !surface) return;
  const message = safeString(process.env.OMG_QUESTION_RETURN_MESSAGE).trim() || 'continue';
  if (pane) {
    cmux([
      'focus-pane',
      '--workspace',
      workspace,
      '--pane',
      pane,
    ]);
  }
  cmux([
    'send',
    '--workspace',
    workspace,
    '--surface',
    surface,
    '--',
    message,
  ]);
  cmux([
    'send-key',
    '--workspace',
    workspace,
    '--surface',
    surface,
    'enter',
  ]);
}

function renderSequentialPrompt(record) {
  const questions = Array.isArray(record.questions) ? record.questions : [];
  const index = Number.isInteger(record.current_index) ? record.current_index : 0;
  const question = questions[index];
  if (!question) return '';
  const ambiguity = ambiguityForQuestion(question, index);
  const multi = question.type === 'multi-answerable' || question.multi_select;
  const ko = record.locale === 'ko';
  const lines = [
    record.header || 'Oh My Goal Intake',
    ko ? `질문 ${index + 1}/${questions.length}` : `Question ${index + 1} of ${questions.length}`,
    ko ? `모호도: ${ambiguity.score.toFixed(2)} (${ambiguity.level}) - ${ambiguity.reason}` : `Ambiguity: ${ambiguity.score.toFixed(2)} (${ambiguity.level}) - ${ambiguity.reason}`,
    `[${question.type}] id=${question.id} multi_select=${multi ? 'true' : 'false'}`,
    `${ko ? '질문' : 'question'}: ${question.question}`,
    '',
  ];
  question.options.forEach((option, optionIndex) => {
    const description = option.description ? ` - ${option.description}` : '';
    lines.push(`${String.fromCharCode(65 + optionIndex)}) ${option.label}${description}`);
  });
  if (question.allow_other) lines.push(`${String.fromCharCode(65 + question.options.length)}) ${question.other_label}`);
  lines.push('');
  if (ko) {
    lines.push(multi ? `하나 이상 선택해서 답해주세요. 예: ${index + 1}A,B. 직접 입력: ${index + 1}${String.fromCharCode(65 + question.options.length)}: <text>` : `하나를 선택해서 답해주세요. 예: ${index + 1}A. 직접 입력: ${index + 1}${String.fromCharCode(65 + question.options.length)}: <text>`);
  } else {
    lines.push(multi ? `Reply with one or more selections, e.g. ${index + 1}A,B. For Other: ${index + 1}${String.fromCharCode(65 + question.options.length)}: <text>` : `Reply with one selection, e.g. ${index + 1}A. For Other: ${index + 1}${String.fromCharCode(65 + question.options.length)}: <text>`);
  }
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
    residual_ambiguity: record.residual_ambiguity,
    quality_pruning: record.quality_pruning,
    followup_phase: record.followup_phase,
    prompt: renderSequentialPrompt(record),
  };
}

function interactivePromptPayload(record) {
  const rendererName = record.renderer?.renderer || 'interactive-renderer';
  return {
    ok: false,
    renderer: rendererName,
    status: record.status || 'prompting',
    question_id: record.question_id,
    record_path: record.record_path,
    interactive: true,
    answers: record.answers || [],
    renderer_state: record.renderer,
    prompt: `Oh My Goal intake is open in ${rendererName}. Answer in that window, then continue so Codex can read ${record.record_path}.`,
  };
}

function statusPayload(record) {
  if (record.status === 'answered') return successPayload(record);
  if (record.renderer?.renderer && record.renderer.renderer !== 'sequential') return interactivePromptPayload(record);
  return sequentialPromptPayload(record);
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
    const result = await finalizeOrExtendRecord(statePath, record, answers);
    return result.complete ? successPayload(result.record) : sequentialPromptPayload(result.record);
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
  let record = await readJson(statePath);
  const scriptedLines = process.stdin.isTTY ? null : readFileSync(0, 'utf-8').split(/\r?\n/);
  if (!scriptedLines && supportsInteractiveArrowUi()) {
    let answers = answerEntries(record);
    while (true) {
      answers = mergeAnswerEntries(answers, await promptForPendingAnswersWithArrows(record, answers));
      const result = await finalizeOrExtendRecord(statePath, record, answers);
      record = result.record;
      if (result.complete) {
        notifyQuestionReturn(record, statePath);
        return;
      }
      answers = answerEntries(record);
    }
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
  let answers = answerEntries(record);
  try {
    console.log('Oh My Goal Intake');
    while (true) {
      for (const { question, index } of pendingQuestions(record, answers)) {
        const answer = await askQuestion(question, ask, Boolean(scriptedLines));
        answers = mergeAnswerEntries(answers, [{ question_id: question.id, index, answer }]);
      }
      const result = await finalizeOrExtendRecord(statePath, record, answers);
      record = result.record;
      if (result.complete) break;
      answers = answerEntries(record);
    }
  } finally {
    rl?.close();
  }
  notifyQuestionReturn(record, statePath);
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
      if (record.renderer?.renderer === 'tmux-pane' && !isTmuxPaneAlive(record.renderer.target)) {
        throw new Error(`question renderer ${record.renderer.target} exited before answering`);
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
    residual_ambiguity: record.residual_ambiguity,
    quality_pruning: record.quality_pruning,
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
  const current = await readJson(statePath);
  await writeJsonAtomic(statePath, {
    ...current,
    status: current.status === 'answered' ? 'answered' : 'prompting',
    updated_at: current.updated_at || new Date().toISOString(),
    renderer: current.renderer || renderer,
  });
  return successPayload(await waitForAnswer(statePath, timeoutMs));
}

async function runInteractiveStart(cwd, input, launchRenderer) {
  const { record, statePath } = await createRecord(cwd, input);
  const renderer = launchRenderer(statePath, record);
  const current = await readJson(statePath);
  const updated = {
    ...current,
    status: current.status === 'answered' ? 'answered' : 'prompting',
    updated_at: current.updated_at || new Date().toISOString(),
    renderer: current.renderer || renderer,
  };
  await writeJsonAtomic(statePath, updated);
  return statusPayload(updated);
}

async function runMacosTerminal(cwd, input) {
  return runInteractiveStart(cwd, input, launchMacosTerminalUi);
}

async function runCmuxStart(cwd, input) {
  return runInteractiveStart(cwd, input, launchCmuxUi);
}

async function runTmuxStart(cwd, input) {
  return runInteractiveStart(cwd, input, launchTmuxUi);
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

  if (args.mode === 'status') {
    if (!args.statePath) throw new Error('--mode status requires --state-path');
    printPayload(statusPayload(await readJson(resolve(args.statePath))), args.json);
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
  const input = buildIntakeQuestionInput(objective, { locale: args.locale });
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
  if (args.mode === 'cmux') {
    printPayload(await runCmuxStart(cwd, input), args.json);
    return;
  }
  if (args.mode === 'auto') {
    if (cmuxAvailable()) {
      try {
        printPayload(await runCmuxStart(cwd, input), args.json);
        return;
      } catch (error) {
        if (!tmuxAvailable() && !macosTerminalBridgeAvailable()) {
          printPayload({
            ...await runSequentialStart(cwd, input),
            fallback_reason: `cmux-unavailable: ${error instanceof Error ? error.message : String(error)}`,
          }, args.json);
          return;
        }
      }
    }
    if (tmuxAvailable()) {
      printPayload(await runTmuxStart(cwd, input), args.json);
      return;
    }
    if (macosTerminalBridgeAvailable()) {
      try {
        printPayload(await runMacosTerminal(cwd, input), args.json);
      } catch (error) {
        printPayload({
          ...await runSequentialStart(cwd, input),
          fallback_reason: `macos-terminal-unavailable: ${error instanceof Error ? error.message : String(error)}`,
        }, args.json);
      }
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
