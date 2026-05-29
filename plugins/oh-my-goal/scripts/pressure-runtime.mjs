#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  appendEvent,
  readJson,
  relativePath,
  safeString,
  sanitizeTeamName,
  writeJsonAtomic,
} from './omx-team-core.mjs';

const PRESSURE_VERSION = 1;
const DEFAULT_ROUTE = 'goal_first';
const VALID_PHASES = new Set(['early', 'middle', 'late', 'stuck']);
const VALID_ROLES = new Set(['researcher', 'implementer', 'tester', 'critic', 'architect', 'replanner']);
const VALID_SOURCES = new Set(['leader', 'worker']);
const VALID_STATUSES = new Set(['candidate', 'accepted', 'rejected', 'blocked']);

function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'help';
  const parsed = {
    command,
    cwd: process.cwd(),
    route: DEFAULT_ROUTE,
    phase: 'early',
    json: false,
    force: false,
    status: 'candidate',
    workers: 4,
    mode: 'auto',
    agent: 'codex',
  };
  const startIndex = command === 'help' ? 0 : 1;
  for (let index = startIndex; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--force') {
      parsed.force = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    const valueFlags = new Set([
      '--objective',
      '--slug',
      '--team',
      '--cwd',
      '--route',
      '--phase',
      '--source',
      '--role',
      '--summary',
      '--evidence',
      '--score',
      '--novelty-score',
      '--status',
      '--id',
      '--trajectory-id',
      '--blocker',
      '--outcome',
      '--next-action',
      '--evidence-json',
      '--workers',
      '--mode',
      '--agent',
    ]);
    if (valueFlags.has(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}.`);
      parsed[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    parsed.objective = [parsed.objective, arg].filter(Boolean).join(' ');
  }
  parsed.workers = Number.parseInt(String(parsed.workers || '4'), 10);
  return parsed;
}

function printHelp() {
  console.log(`oh-my-goal pressure-runtime

Usage:
  node scripts/pressure-runtime.mjs init --objective "<objective>" [--slug <slug>] [--json]
  node scripts/pressure-runtime.mjs status --slug <slug> [--json]
  node scripts/pressure-runtime.mjs record --slug <slug> --summary <text> --evidence <text> [--source leader|worker] [--role critic] [--score 0-100] [--novelty-score 0-100] [--id <id>] [--json]
  node scripts/pressure-runtime.mjs select --slug <slug> --trajectory-id <id> --evidence <text> [--json]
  node scripts/pressure-runtime.mjs step --slug <slug> --outcome <progress|blocked|ready-for-gate> --evidence <text> [--json]
  node scripts/pressure-runtime.mjs perturb --slug <slug> [--blocker <text>] [--json]
  node scripts/pressure-runtime.mjs team-command --slug <slug> [--mode auto|cmux|tmux|dry-run] [--json]
  node scripts/pressure-runtime.mjs gate --slug <slug> --evidence-json <json-or-path> [--json]

Purpose:
  Runtime-level local-optimum pressure for Oh My Goal. It forces evidence-backed
  trajectory comparison, critic/tester/replanner pressure, perturbation on
  repeated blockers, and a completion gate before the leader marks a Codex goal
  complete.
`);
}

function normalizeObjective(value) {
  return safeString(value)
    .replace(/^\s*(?:use\s+)?\$oh-my-goal\b[:\s-]*/i, '')
    .trim();
}

function nowIso() {
  return new Date().toISOString();
}

function pressureRoot(cwd, slug) {
  return join(cwd, '.omg', 'runtime', 'pressure', slug);
}

function pressureStatePath(cwd, slug) {
  return join(pressureRoot(cwd, slug), 'state.json');
}

function scriptPath(name) {
  return join(dirname(fileURLToPath(import.meta.url)), name);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function compact(value) {
  return safeString(value).replace(/\s+/g, ' ').trim();
}

function parseScore(value, label) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`${label} must be a number between 0 and 100.`);
  }
  return Math.round(parsed * 100) / 100;
}

function normalizeEvidence(value) {
  if (Array.isArray(value)) return value.map((item) => compact(String(item))).filter(Boolean);
  return safeString(value).split(/\r?\n/).map(compact).filter(Boolean);
}

function evidenceBacked(trajectory) {
  return normalizeEvidence(trajectory.evidence).some((item) => !/^pending$/i.test(item));
}

function pressureRole(role) {
  return role === 'critic' || role === 'tester' || role === 'replanner';
}

function buildAnnealingChallenge(phase, route = DEFAULT_ROUTE) {
  if (phase === 'early') {
    return {
      phase,
      label: 'early broad-exploration pass',
      strategy: 'explore',
      max_alternative_strategies: route === 'agent_orchestrated' ? 5 : 3,
      max_critic_passes: 1,
      worker_lanes: route === 'agent_orchestrated' ? ['researcher', 'architect', 'critic'] : ['critic'],
      required_probes: [
        'generate independent candidate trajectories',
        'identify non-goals and acceptance gaps',
        'score at least one novelty-seeking alternative',
      ],
      stop_rule: 'stop exploration after a clear route and acceptance checklist exist',
    };
  }
  if (phase === 'middle') {
    return {
      phase,
      label: 'middle exploit-with-pressure pass',
      strategy: 'exploit',
      max_alternative_strategies: 2,
      max_critic_passes: 2,
      worker_lanes: route === 'agent_orchestrated' ? ['implementer', 'tester', 'critic'] : ['tester', 'critic'],
      required_probes: [
        'compare current trajectory against one simpler alternative',
        'run targeted verification before widening scope',
        'record blocker evidence before replanning',
      ],
      stop_rule: 'continue only while evidence improves or a concrete blocker is being resolved',
    };
  }
  if (phase === 'stuck') {
    return {
      phase,
      label: 'stuck perturbation pass',
      strategy: 'perturb',
      max_alternative_strategies: 4,
      max_critic_passes: 2,
      worker_lanes: ['replanner', 'critic', 'tester'],
      required_probes: [
        'reframe the objective without weakening acceptance criteria',
        'try a distant strategy from the novelty archive',
        'isolate the repeated blocker and decide whether user input is truly required',
      ],
      stop_rule: 'stop perturbing after two repeated identical blockers and report the blocker plainly',
    };
  }
  return {
    phase,
    label: 'late basin-escape completion challenge',
    strategy: 'converge',
    max_alternative_strategies: 2,
    max_critic_passes: 2,
    worker_lanes: ['critic', 'tester', 'architect'],
    required_probes: [
      'attack the completion claim with missed-requirement and edge-case checks',
      'compare the current solution with an independent alternative trajectory',
      'confirm external verification covers the objective rather than only the changed code',
      'reject completion if review evidence is self-review or lacks concrete artifacts',
    ],
    stop_rule: 'allow completion only if the current trajectory survives the basin-escape challenge with concrete evidence',
  };
}

function seedTrajectories(objective, timestamp) {
  return [
    {
      id: 'T001-baseline',
      source: 'leader',
      role: 'architect',
      summary: `Conservative direct path for: ${objective}`,
      evidence: [],
      score: undefined,
      novelty_score: 10,
      status: 'candidate',
      planned: true,
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: 'T002-novelty',
      source: 'worker',
      role: 'replanner',
      summary: `Constraint-inverting or structurally different path for: ${objective}`,
      evidence: [],
      score: undefined,
      novelty_score: 75,
      status: 'candidate',
      planned: true,
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: 'T003-critic-probe',
      source: 'worker',
      role: 'critic',
      summary: `Adversarial probe against the obvious completion path for: ${objective}`,
      evidence: [],
      score: undefined,
      novelty_score: 55,
      status: 'candidate',
      planned: true,
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
}

function renderTrajectoryLedger(state) {
  return [
    '# Pressure Trajectory Ledger',
    '',
    `Slug: ${state.slug}`,
    `Objective: ${state.objective}`,
    `Phase: ${state.phase}`,
    state.active_trajectory_id ? `Active trajectory: ${state.active_trajectory_id}` : 'Active trajectory: none',
    '',
    '| ID | Source | Role | Summary | Evidence | Score | Novelty | Status |',
    '| --- | --- | --- | --- | --- | ---: | ---: | --- |',
    ...state.trajectories.map((trajectory) => [
      trajectory.id,
      trajectory.source,
      trajectory.role || '',
      safeString(trajectory.summary).replace(/\|/g, '/'),
      evidenceBacked(trajectory) ? normalizeEvidence(trajectory.evidence).join('<br>').replace(/\|/g, '/') : 'Pending',
      trajectory.score ?? '',
      trajectory.novelty_score ?? '',
      trajectory.status,
    ]).map((row) => `| ${row.join(' | ')} |`),
    '',
    'Selection rule:',
    '- Select only after at least two evidence-backed, materially different trajectories exist.',
    '- Require at least one critic, tester, or replanner pressure lane before completion.',
    '- If the same blocker repeats, run perturbation before returning to completion.',
    '',
  ].join('\n');
}

function renderPressureReport(state) {
  const backed = state.trajectories.filter(evidenceBacked);
  const pressure = backed.filter((trajectory) => pressureRole(trajectory.role));
  const repeated = Object.entries(state.blocker_counts || {}).filter(([, count]) => count >= 2);
  return [
    '# Local-Optimum Pressure Report',
    '',
    `Slug: ${state.slug}`,
    `Phase: ${state.phase}`,
    `Evidence-backed trajectories: ${backed.length}`,
    `Pressure trajectories: ${pressure.length}`,
    `Perturbations: ${state.perturbations.length}`,
    `Repeated blockers: ${repeated.length}`,
    '',
    'Current challenge:',
    `- ${state.challenge.label}`,
    `- strategy: ${state.challenge.strategy}`,
    `- stop rule: ${state.challenge.stop_rule}`,
    '',
    'Required probes:',
    ...state.challenge.required_probes.map((probe) => `- ${probe}`),
    '',
    'Completion pressure status:',
    `- active trajectory: ${state.active_trajectory_id || 'none'}`,
    `- independent alternatives: ${countIndependentAlternatives(state)}`,
    `- critic/tester/replanner evidence: ${pressure.length}`,
    '',
  ].join('\n');
}

async function writeStateBundle(cwd, state) {
  const root = pressureRoot(cwd, state.slug);
  await mkdir(root, { recursive: true });
  state.updated_at = nowIso();
  await writeJsonAtomic(join(root, 'state.json'), state);
  await writeFile(join(root, 'trajectory-ledger.md'), renderTrajectoryLedger(state), 'utf-8');
  await writeFile(join(root, 'pressure-report.md'), renderPressureReport(state), 'utf-8');
}

async function loadState(cwd, slug) {
  const path = pressureStatePath(cwd, sanitizeTeamName(slug));
  if (!existsSync(path)) throw new Error(`pressure state not found: ${relativePath(cwd, path)}`);
  return readJson(path);
}

function normalizePhase(phase) {
  const normalized = safeString(phase).trim() || 'early';
  if (!VALID_PHASES.has(normalized)) throw new Error('Invalid --phase; expected early, middle, late, or stuck.');
  return normalized;
}

function normalizeRole(role) {
  const normalized = safeString(role).trim();
  if (!normalized) return undefined;
  if (!VALID_ROLES.has(normalized)) throw new Error('Invalid --role.');
  return normalized;
}

function normalizeSource(source) {
  const normalized = safeString(source).trim() || 'leader';
  if (!VALID_SOURCES.has(normalized)) throw new Error('Invalid --source; expected leader or worker.');
  return normalized;
}

function normalizeStatus(status) {
  const normalized = safeString(status).trim() || 'candidate';
  if (!VALID_STATUSES.has(normalized)) throw new Error('Invalid --status.');
  return normalized;
}

function hasIndependenceSignal(selected, alternative) {
  if (alternative.id === selected.id) return false;
  if (!evidenceBacked(alternative)) return false;
  if (alternative.source !== selected.source) return true;
  if (alternative.role && alternative.role !== selected.role) return true;
  if ((alternative.novelty_score ?? 0) >= 30) return true;
  if (alternative.novelty_score !== undefined && selected.novelty_score !== undefined) {
    return Math.abs(alternative.novelty_score - selected.novelty_score) >= 20;
  }
  return false;
}

function countIndependentAlternatives(state) {
  const selected = state.active_trajectory_id
    ? state.trajectories.find((trajectory) => trajectory.id === state.active_trajectory_id)
    : undefined;
  if (!selected) return 0;
  return state.trajectories.filter((trajectory) => hasIndependenceSignal(selected, trajectory)).length;
}

function nextTrajectoryId(state, summary) {
  const next = state.trajectories.length + 1;
  const fragment = compact(summary)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/g, '') || 'trajectory';
  return `T${String(next).padStart(3, '0')}-${fragment}`;
}

function blockerKey(value) {
  return compact(value).toLowerCase().slice(0, 180);
}

function pressureTeamObjective(state) {
  return [
    `Run Oh My Goal local-optimum pressure for: ${state.objective}`,
    '',
    'Required lanes:',
    '- architect: refine the conservative baseline trajectory and acceptance map.',
    '- replanner: propose a structurally different or constraint-inverting trajectory.',
    '- critic: attack hidden assumptions and false completion.',
    '- tester: define or run a verification probe that could falsify the current path.',
    '',
    'Each worker must return evidence, score 0-100, novelty score 0-100, blockers, and recommendation.',
    `Record results with: node ${shellQuote(scriptPath('pressure-runtime.mjs'))} record --slug ${shellQuote(state.slug)} --source worker --role <role> --summary "<summary>" --evidence "<evidence>" --score <0-100> --novelty-score <0-100> --json`,
  ].join('\n');
}

function pressureTeamCommand(state, args) {
  return [
    'node',
    shellQuote(scriptPath('team-runtime.mjs')),
    'launch',
    '--objective',
    shellQuote(pressureTeamObjective(state)),
    '--team',
    shellQuote(`${state.slug}-pressure`),
    '--workers',
    String(args.workers || 4),
    '--mode',
    shellQuote(args.mode || 'auto'),
    '--agent',
    shellQuote(args.agent || 'codex'),
    '--json',
  ].join(' ');
}

async function commandInit(args) {
  const cwd = resolve(args.cwd || process.cwd());
  const objective = normalizeObjective(args.objective);
  if (!objective) throw new Error('Missing --objective.');
  const slug = sanitizeTeamName(args.slug || objective);
  const root = pressureRoot(cwd, slug);
  if (existsSync(join(root, 'state.json')) && !args.force) {
    throw new Error(`Pressure state already exists at ${relativePath(cwd, join(root, 'state.json'))}. Pass --force to replace.`);
  }
  const timestamp = nowIso();
  const phase = normalizePhase(args.phase);
  const state = {
    kind: 'omg.pressure-runtime/v1',
    schema_source: 'omx.goal-harness/runtime+perturbation',
    version: PRESSURE_VERSION,
    slug,
    objective,
    route: args.route || DEFAULT_ROUTE,
    phase,
    challenge: buildAnnealingChallenge(phase, args.route || DEFAULT_ROUTE),
    active_trajectory_id: null,
    trajectories: seedTrajectories(objective, timestamp),
    leader_steps: [],
    perturbations: [],
    gates: [],
    blocker_counts: {},
    created_at: timestamp,
    updated_at: timestamp,
    state_root: relativePath(cwd, root),
  };
  await writeStateBundle(cwd, state);
  await appendEvent(root, { type: 'pressure_initialized', slug, trajectory_count: state.trajectories.length });
  return {
    ok: true,
    command: 'init',
    slug,
    state_root: relativePath(cwd, root),
    state: relativePath(cwd, join(root, 'state.json')),
    trajectory_ledger: relativePath(cwd, join(root, 'trajectory-ledger.md')),
    pressure_report: relativePath(cwd, join(root, 'pressure-report.md')),
    team_command: pressureTeamCommand(state, args),
    next_action: 'Collect evidence for at least two trajectories, including one critic/tester/replanner pressure lane.',
  };
}

async function commandStatus(args) {
  if (!args.slug) throw new Error('status requires --slug <slug>.');
  const cwd = resolve(args.cwd || process.cwd());
  const state = await loadState(cwd, args.slug);
  const root = pressureRoot(cwd, state.slug);
  const backed = state.trajectories.filter(evidenceBacked);
  const pressure = backed.filter((trajectory) => pressureRole(trajectory.role));
  return {
    ok: true,
    command: 'status',
    slug: state.slug,
    phase: state.phase,
    active_trajectory_id: state.active_trajectory_id,
    trajectory_count: state.trajectories.length,
    evidence_backed_trajectories: backed.length,
    pressure_trajectories: pressure.length,
    independent_alternatives: countIndependentAlternatives(state),
    repeated_blockers: Object.entries(state.blocker_counts || {}).filter(([, count]) => count >= 2).length,
    last_gate: state.gates.at(-1) || null,
    state: relativePath(cwd, join(root, 'state.json')),
    trajectory_ledger: relativePath(cwd, join(root, 'trajectory-ledger.md')),
    pressure_report: relativePath(cwd, join(root, 'pressure-report.md')),
    team_command: pressureTeamCommand(state, args),
  };
}

async function commandRecord(args) {
  if (!args.slug) throw new Error('record requires --slug <slug>.');
  const cwd = resolve(args.cwd || process.cwd());
  const state = await loadState(cwd, args.slug);
  const source = args.source ? normalizeSource(args.source) : undefined;
  const role = normalizeRole(args.role);
  const status = normalizeStatus(args.status);
  const summary = compact(args.summary);
  const evidence = normalizeEvidence(args.evidence);
  if (!summary) throw new Error('record requires --summary <text>.');
  if (evidence.length === 0) throw new Error('record requires --evidence <text>.');
  if (source === 'worker' && !role) throw new Error('worker trajectories require --role.');
  const score = parseScore(args.score, '--score');
  const noveltyScore = parseScore(args.noveltyScore, '--novelty-score');
  const id = args.id || nextTrajectoryId(state, summary);
  const timestamp = nowIso();
  const existing = state.trajectories.find((trajectory) => trajectory.id === id);
  const finalSource = source || existing?.source || 'leader';
  const finalRole = role || existing?.role;
  const finalScore = score ?? existing?.score;
  if (finalSource === 'worker' && (status === 'candidate' || status === 'accepted') && finalScore === undefined) {
    throw new Error('worker candidate trajectories require --score 0-100.');
  }
  const patch = {
    id,
    source: finalSource,
    role: finalRole,
    summary,
    evidence,
    score: finalScore,
    novelty_score: noveltyScore ?? existing?.novelty_score,
    status,
    planned: false,
    created_at: existing?.created_at || timestamp,
    updated_at: timestamp,
  };
  if (existing) Object.assign(existing, patch);
  else state.trajectories.push(patch);
  await writeStateBundle(cwd, state);
  await appendEvent(pressureRoot(cwd, state.slug), { type: 'trajectory_recorded', trajectory_id: id, role: finalRole, status });
  return {
    ok: true,
    command: 'record',
    slug: state.slug,
    trajectory: patch,
    next_action: 'Select a trajectory only after two evidence-backed independent candidates exist.',
  };
}

async function commandSelect(args) {
  if (!args.slug) throw new Error('select requires --slug <slug>.');
  if (!args.trajectoryId) throw new Error('select requires --trajectory-id <id>.');
  const evidence = compact(args.evidence);
  if (!evidence) throw new Error('select requires --evidence <text>.');
  const cwd = resolve(args.cwd || process.cwd());
  const state = await loadState(cwd, args.slug);
  const selected = state.trajectories.find((trajectory) => trajectory.id === args.trajectoryId);
  if (!selected) throw new Error(`Trajectory not found: ${args.trajectoryId}`);
  if (!evidenceBacked(selected)) throw new Error('selected trajectory must have evidence before selection.');
  const backed = state.trajectories.filter((trajectory) => trajectory.status !== 'rejected' && evidenceBacked(trajectory));
  if (backed.length < 2) throw new Error('selection requires at least two evidence-backed trajectories.');
  if (!backed.some((trajectory) => hasIndependenceSignal(selected, trajectory))) {
    throw new Error('selection requires an independent alternative with distinct source, role, or novelty evidence.');
  }
  const timestamp = nowIso();
  for (const trajectory of state.trajectories) {
    if (trajectory.id === selected.id) {
      trajectory.status = 'accepted';
      trajectory.selection_evidence = evidence;
      trajectory.updated_at = timestamp;
    } else if (trajectory.status === 'accepted') {
      trajectory.status = 'candidate';
      trajectory.updated_at = timestamp;
    }
  }
  state.active_trajectory_id = selected.id;
  state.phase = state.phase === 'early' ? 'middle' : state.phase;
  state.challenge = buildAnnealingChallenge(state.phase, state.route);
  await writeStateBundle(cwd, state);
  await appendEvent(pressureRoot(cwd, state.slug), { type: 'trajectory_selected', trajectory_id: selected.id, evidence });
  return {
    ok: true,
    command: 'select',
    slug: state.slug,
    active_trajectory_id: selected.id,
    phase: state.phase,
    next_action: 'Execute the selected path, record tester/critic pressure, then run the gate before completion.',
  };
}

async function commandStep(args) {
  if (!args.slug) throw new Error('step requires --slug <slug>.');
  const evidence = compact(args.evidence);
  if (!evidence) throw new Error('step requires --evidence <text>.');
  const outcome = safeString(args.outcome).trim();
  if (!['progress', 'blocked', 'ready-for-gate', 'ready_for_gate'].includes(outcome)) {
    throw new Error('step requires --outcome progress|blocked|ready-for-gate.');
  }
  const cwd = resolve(args.cwd || process.cwd());
  const state = await loadState(cwd, args.slug);
  const timestamp = nowIso();
  const step = {
    id: `S${String(state.leader_steps.length + 1).padStart(3, '0')}`,
    outcome: outcome.replace(/-/g, '_'),
    evidence,
    next_action: args.nextAction || '',
    created_at: timestamp,
  };
  state.leader_steps.push(step);
  if (step.outcome === 'blocked') {
    const key = blockerKey(evidence);
    state.blocker_counts[key] = (state.blocker_counts[key] || 0) + 1;
    if (state.blocker_counts[key] >= 2) {
      state.phase = 'stuck';
      state.challenge = buildAnnealingChallenge('stuck', state.route);
    }
  }
  if (step.outcome === 'ready_for_gate' && state.phase !== 'stuck') {
    state.phase = 'late';
    state.challenge = buildAnnealingChallenge('late', state.route);
  }
  await writeStateBundle(cwd, state);
  await appendEvent(pressureRoot(cwd, state.slug), { type: 'leader_step', outcome: step.outcome, phase: state.phase });
  return {
    ok: true,
    command: 'step',
    slug: state.slug,
    step,
    phase: state.phase,
    repeated_blockers: Object.entries(state.blocker_counts || {}).filter(([, count]) => count >= 2),
    next_action: state.phase === 'stuck'
      ? 'Run pressure-runtime perturb before attempting completion.'
      : 'Continue collecting trajectory and verification evidence.',
  };
}

function perturbationStrategies(state, blocker, timestamp) {
  return [
    {
      id: nextTrajectoryId(state, 'constraint preserving reframe'),
      source: 'worker',
      role: 'replanner',
      summary: `Constraint-preserving reframe for repeated blocker: ${blocker}`,
      evidence: [],
      score: undefined,
      novelty_score: 72,
      status: 'candidate',
      planned: true,
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: nextTrajectoryId({ ...state, trajectories: [...state.trajectories, {}] }, 'distant implementation path'),
      source: 'worker',
      role: 'replanner',
      summary: 'Distant implementation path that avoids the blocked dependency or assumption.',
      evidence: [],
      score: undefined,
      novelty_score: 88,
      status: 'candidate',
      planned: true,
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: nextTrajectoryId({ ...state, trajectories: [...state.trajectories, {}, {}] }, 'disconfirming probe'),
      source: 'worker',
      role: 'tester',
      summary: 'Disconfirming verification probe that could prove the active trajectory is still viable.',
      evidence: [],
      score: undefined,
      novelty_score: 66,
      status: 'candidate',
      planned: true,
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
}

function renderPerturbationMarkdown({ state, perturbation, strategies }) {
  return [
    `# Pressure Perturbation: ${perturbation.id}`,
    '',
    `Slug: ${state.slug}`,
    `Phase: ${state.phase}`,
    state.active_trajectory_id ? `Active trajectory: ${state.active_trajectory_id}` : 'Active trajectory: none',
    '',
    '## Blocker',
    '',
    perturbation.blocker,
    '',
    '## Required Perturbation',
    '',
    '- Reframe the objective without weakening acceptance criteria.',
    '- Try a structurally distant path.',
    '- Run a disconfirming verification probe.',
    '- Reject any path that removes objective audit, external verification, adversarial review, or convergence challenge requirements.',
    '',
    '## Candidate Strategies',
    '',
    ...strategies.flatMap((strategy) => [
      `### ${strategy.id}`,
      '',
      `Role: ${strategy.role}`,
      `Novelty: ${strategy.novelty_score}`,
      '',
      strategy.summary,
      '',
      `Record evidence: \`node ${shellQuote(scriptPath('pressure-runtime.mjs'))} record --slug ${shellQuote(state.slug)} --id ${shellQuote(strategy.id)} --source worker --role ${shellQuote(strategy.role)} --summary ${shellQuote(strategy.summary)} --evidence "<evidence>" --score <0-100> --novelty-score ${strategy.novelty_score} --json\``,
      '',
    ]),
    '## Team Command',
    '',
    '```sh',
    pressureTeamCommand(state, { mode: 'auto', agent: 'codex', workers: 4 }),
    '```',
    '',
  ].join('\n');
}

async function commandPerturb(args) {
  if (!args.slug) throw new Error('perturb requires --slug <slug>.');
  const cwd = resolve(args.cwd || process.cwd());
  const state = await loadState(cwd, args.slug);
  const blocker = compact(args.blocker) || [...state.leader_steps].reverse().find((step) => step.outcome === 'blocked')?.evidence || '';
  if (!blocker) throw new Error('perturb requires --blocker or prior blocked step evidence.');
  const timestamp = nowIso();
  state.phase = 'stuck';
  state.challenge = buildAnnealingChallenge('stuck', state.route);
  const perturbation = {
    id: `B${String(state.perturbations.length + 1).padStart(3, '0')}`,
    blocker,
    active_trajectory_id: state.active_trajectory_id,
    created_at: timestamp,
  };
  const strategies = perturbationStrategies(state, blocker, timestamp);
  state.trajectories.push(...strategies);
  const root = pressureRoot(cwd, state.slug);
  const artifact = join(root, 'perturbations', `${perturbation.id}.md`);
  perturbation.artifact = relativePath(cwd, artifact);
  state.perturbations.push(perturbation);
  await mkdir(dirname(artifact), { recursive: true });
  await writeFile(artifact, renderPerturbationMarkdown({ state, perturbation, strategies }), 'utf-8');
  await writeStateBundle(cwd, state);
  await appendEvent(root, { type: 'perturbation_created', perturbation_id: perturbation.id, blocker });
  return {
    ok: true,
    command: 'perturb',
    slug: state.slug,
    perturbation,
    strategies,
    team_command: pressureTeamCommand(state, args),
    next_action: 'Collect evidence for at least one perturbation strategy, then select or reject it.',
  };
}

function readEvidenceInput(raw, cwd) {
  const trimmed = safeString(raw).trim();
  if (!trimmed) throw new Error('gate requires --evidence-json <json-or-path>.');
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed);
  return readJson(resolve(cwd, trimmed));
}

function hasText(value) {
  return Boolean(safeString(value).trim());
}

function evaluateCompletionEvidence(evidence) {
  const missing = [];
  const blockers = [];
  if (evidence?.actor !== 'leader') blockers.push('only the leader may complete the Codex goal');
  if (!hasText(evidence?.objectiveAudit)) missing.push('objective audit');
  if (!Array.isArray(evidence?.implementationEvidence) || evidence.implementationEvidence.filter(hasText).length === 0) {
    missing.push('implementation evidence');
  }
  const verification = Array.isArray(evidence?.externalVerification) ? evidence.externalVerification : [];
  const passing = verification.filter((item) => item?.status === 'pass' && hasText(item.evidence));
  if (passing.length === 0) {
    missing.push('passing external verification evidence');
  } else if (!passing.some((item) => hasText(item.command) || hasText(item.artifactPath))) {
    missing.push('concrete external verification command or artifact path');
  }
  if (verification.some((item) => item?.status === 'fail' || item?.status === 'blocked')) {
    blockers.push('external verification has failing or blocked entries');
  }
  if (!hasText(evidence?.adversarialReview?.evidence)) {
    missing.push('clear adversarial review evidence');
  } else if (evidence.adversarialReview.status !== 'clear') {
    blockers.push(`adversarial review is ${evidence.adversarialReview.status}`);
  }
  const convergence = evidence?.convergenceChallenge;
  if (!hasText(convergence?.evidence) || !Number.isFinite(convergence?.alternativesConsidered) || convergence.alternativesConsidered < 2) {
    missing.push('passed basin-escape convergence challenge with at least two alternatives');
  } else if (convergence.status !== 'passed') {
    blockers.push(`basin-escape convergence challenge is ${convergence.status}`);
  }
  return { missing, blockers };
}

function evaluateRuntimePressure(state) {
  const missing = [];
  const blockers = [];
  const backed = state.trajectories.filter((trajectory) => trajectory.status !== 'rejected' && evidenceBacked(trajectory));
  const pressure = backed.filter((trajectory) => pressureRole(trajectory.role));
  const selected = state.active_trajectory_id
    ? state.trajectories.find((trajectory) => trajectory.id === state.active_trajectory_id)
    : undefined;
  if (!selected) {
    missing.push('selected active trajectory');
  } else {
    if (selected.status !== 'accepted') blockers.push('active trajectory is not accepted');
    if (!evidenceBacked(selected)) missing.push('evidence-backed selected trajectory');
    if ((selected.score ?? 0) < 60) blockers.push('active trajectory score is below 60');
  }
  if (backed.length < 2) missing.push('at least two evidence-backed trajectories');
  if (selected && !backed.some((trajectory) => hasIndependenceSignal(selected, trajectory))) {
    missing.push('independent alternative trajectory');
  }
  if (pressure.length < 1) missing.push('critic, tester, or replanner pressure evidence');
  const repeated = Object.entries(state.blocker_counts || {}).filter(([, count]) => count >= 2);
  if (repeated.length > 0 && state.perturbations.length === 0) {
    blockers.push('repeated blocker requires perturbation before completion');
  }
  return { missing, blockers };
}

async function commandGate(args) {
  if (!args.slug) throw new Error('gate requires --slug <slug>.');
  const cwd = resolve(args.cwd || process.cwd());
  const state = await loadState(cwd, args.slug);
  const evidence = await readEvidenceInput(args.evidenceJson, cwd);
  const completion = evaluateCompletionEvidence(evidence);
  const pressure = evaluateRuntimePressure(state);
  const missing = [...completion.missing, ...pressure.missing];
  const blockers = [...completion.blockers, ...pressure.blockers];
  const allowed = missing.length === 0 && blockers.length === 0;
  const gate = {
    id: `G${String(state.gates.length + 1).padStart(3, '0')}`,
    allowed,
    missing,
    blockers,
    checked_at: nowIso(),
    evidence,
    active_trajectory_id: state.active_trajectory_id,
  };
  state.gates.push(gate);
  state.phase = allowed ? 'late' : state.phase;
  state.challenge = buildAnnealingChallenge(state.phase, state.route);
  const root = pressureRoot(cwd, state.slug);
  await mkdir(join(root, 'gates'), { recursive: true });
  await writeJsonAtomic(join(root, 'gates', `${gate.id}.json`), gate);
  await writeStateBundle(cwd, state);
  await appendEvent(root, { type: 'completion_gate_checked', gate_id: gate.id, allowed, missing, blockers });
  return {
    ok: allowed,
    command: 'gate',
    slug: state.slug,
    gate,
    next_action: allowed
      ? 'Leader may call update_goal({status: "complete"}) after capturing a fresh goal snapshot.'
      : 'Resolve missing evidence or blockers, then rerun pressure-runtime gate.',
  };
}

async function commandTeamCommand(args) {
  if (!args.slug) throw new Error('team-command requires --slug <slug>.');
  const cwd = resolve(args.cwd || process.cwd());
  const state = await loadState(cwd, args.slug);
  return {
    ok: true,
    command: 'team-command',
    slug: state.slug,
    objective: pressureTeamObjective(state),
    team_command: pressureTeamCommand(state, args),
  };
}

function printPayload(payload, json) {
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (payload.command === 'init') {
    console.log(`pressure initialized: ${payload.slug}`);
    console.log(`state: ${payload.state}`);
    console.log(`team command: ${payload.team_command}`);
    return;
  }
  if (payload.command === 'team-command') {
    console.log(payload.team_command);
    return;
  }
  console.log(JSON.stringify(payload, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'help' || args.help || args.command === '--help' || args.command === '-h') {
    printHelp();
    return;
  }
  const command = args.command;
  if (command === 'init') return printPayload(await commandInit(args), args.json);
  if (command === 'status') return printPayload(await commandStatus(args), args.json);
  if (command === 'record') return printPayload(await commandRecord(args), args.json);
  if (command === 'select') return printPayload(await commandSelect(args), args.json);
  if (command === 'step') return printPayload(await commandStep(args), args.json);
  if (command === 'perturb') return printPayload(await commandPerturb(args), args.json);
  if (command === 'team-command') return printPayload(await commandTeamCommand(args), args.json);
  if (command === 'gate') return printPayload(await commandGate(args), args.json);
  throw new Error(`Unknown command: ${command}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || join(tmpdir(), 'missing')).href) {
  try {
    await main();
  } catch (error) {
    console.error(`[oh-my-goal pressure-runtime] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
