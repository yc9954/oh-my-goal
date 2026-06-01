#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DEFAULT_WORKERS,
  MAX_WORKERS,
  ROLE_ORDER,
  appendEvent,
  buildRebalanceDecisions,
  buildTeamExecutionPlan,
  buildWorkerCommand,
  createTaskRecord,
  materializeTeamState,
  normalizeObjective,
  readJson,
  relativePath,
  roleFor,
  safeString,
  sanitizeTeamName,
  teamStateRoot,
  teamRuntimeRoot,
  updateWorkerStatus,
  workerBuckets,
  workerRole,
  writeJsonAtomic,
} from './team-core.mjs';

export { buildTeamExecutionPlan, sanitizeTeamName } from './team-core.mjs';

function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'help';
  const parsed = {
    command,
    cwd: process.cwd(),
    mode: 'auto',
    agent: 'codex',
    json: false,
    force: false,
    explicitWorkers: false,
    notify: false,
    workers: DEFAULT_WORKERS,
    staleMinutes: 0,
    closeIdleMinutes: 0,
    intervalMs: 5000,
    iterations: 0,
    idleStopCount: 1,
    closeCompleted: false,
    reopenClosed: true,
    importTeam: true,
    pressureStatus: true,
    stopWhenIdle: false,
    maxNewTasks: 4,
    maxWorkers: MAX_WORKERS,
    maxNewWorkers: 2,
    scaleWorkers: true,
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
    if (arg === '--kill-panes') {
      parsed.killPanes = true;
      continue;
    }
    if (arg === '--notify') {
      parsed.notify = true;
      continue;
    }
    if (arg === '--no-reopen-closed') {
      parsed.reopenClosed = false;
      continue;
    }
    if (arg === '--close-completed') {
      parsed.closeCompleted = true;
      continue;
    }
    if (arg === '--no-close-completed') {
      parsed.closeCompleted = false;
      continue;
    }
    if (arg === '--no-import-team') {
      parsed.importTeam = false;
      continue;
    }
    if (arg === '--no-pressure-status') {
      parsed.pressureStatus = false;
      continue;
    }
    if (arg === '--scale-workers') {
      parsed.scaleWorkers = true;
      continue;
    }
    if (arg === '--no-scale-workers') {
      parsed.scaleWorkers = false;
      continue;
    }
    if (arg === '--stop-when-idle') {
      parsed.stopWhenIdle = true;
      continue;
    }
    if (arg === '--require-interactive') {
      parsed.requireInteractive = true;
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
    if (arg === '--team' || arg === '--slug') {
      parsed.team = argv[++index];
      continue;
    }
    if (arg === '--pressure-slug') {
      parsed.pressureSlug = argv[++index];
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
    if (arg === '--agent') {
      parsed.agent = argv[++index];
      continue;
    }
    if (arg === '--workers' || arg === '--worker-count') {
      parsed.workers = Number.parseInt(argv[++index] || '', 10);
      parsed.explicitWorkers = true;
      continue;
    }
    if (arg === '--stale-minutes') {
      parsed.staleMinutes = Number.parseInt(argv[++index] || '', 10);
      continue;
    }
    if (arg === '--close-idle-minutes') {
      parsed.closeIdleMinutes = Number.parseInt(argv[++index] || '', 10);
      continue;
    }
    if (arg === '--interval-ms') {
      parsed.intervalMs = Number.parseInt(argv[++index] || '', 10);
      continue;
    }
    if (arg === '--iterations') {
      parsed.iterations = Number.parseInt(argv[++index] || '', 10);
      continue;
    }
    if (arg === '--idle-stop-count') {
      parsed.idleStopCount = Number.parseInt(argv[++index] || '', 10);
      continue;
    }
    if (arg === '--max-new-tasks') {
      parsed.maxNewTasks = Number.parseInt(argv[++index] || '', 10);
      continue;
    }
    if (arg === '--max-workers') {
      parsed.maxWorkers = Number.parseInt(argv[++index] || '', 10);
      continue;
    }
    if (arg === '--max-new-workers') {
      parsed.maxNewWorkers = Number.parseInt(argv[++index] || '', 10);
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
  console.log(`oh-my-goal team-runtime

Usage:
  node scripts/team-runtime.mjs plan --objective "<objective>" [--workers 3] [--json]
  node scripts/team-runtime.mjs launch --objective "<objective>" [--workers 3] [--mode auto|cmux|tmux|dry-run] [--require-interactive] [--json]
  node scripts/team-runtime.mjs tick --team <team> [--pressure-slug <slug>] [--notify] [--stale-minutes <n>] [--close-idle-minutes <n>] [--close-completed] [--max-workers 8] [--json]
  node scripts/team-runtime.mjs watch --team <team> --pressure-slug <slug> [--interval-ms 5000] [--iterations <n>] [--stop-when-idle] [--close-completed] [--notify] [--max-workers 8] [--json]
  node scripts/team-runtime.mjs status --team <team> [--json]
  node scripts/team-runtime.mjs collect --team <team> [--json]
  node scripts/team-runtime.mjs shutdown --team <team> [--kill-panes] [--json]

Purpose:
  Optional Oh My Goal Team bridge for Codex plugin runs. It writes bounded worker
  packets under .omg/runtime/team/<team>/ and can open visible cmux or tmux
  worker panes when launched from an attached interactive surface. The tick
  command is the leader-side orchestrator loop: it reads worker status/result
  files, creates follow-up work, reclaims blocked work, and reassigns ready
  tasks to available lanes. With --close-idle-minutes, it closes visible cmux
  or tmux worker panes that have no open work and have been idle long enough;
  hibernated workers stay in state and are reopened automatically when new work
  is assigned, unless --no-reopen-closed is set. When pressure/follow-up work
  creates more ready tasks than available lanes, it can add bounded dynamic
  worker lanes up to --max-workers, unless --no-scale-workers is set.

  The watch command is the sustained leader-side orchestrator loop. Each cycle
  runs tick -> collect -> pressure import-team -> pressure status -> follow-up
  tick, appends .omg/runtime/team/<team>/watch.ndjson, and optionally stops
  after repeated idle cycles.

  Use --require-interactive for goals that must not silently collapse into a
  leader-only sequential run. In that mode, auto launch reports blocked instead
  of planned when cmux/tmux panes cannot be opened.
`);
}

function tmux(args) {
  return spawnSync('tmux', args, { encoding: 'utf-8' });
}

function pressureRuntimePath() {
  return join(dirname(fileURLToPath(import.meta.url)), 'pressure-runtime.mjs');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizedPositiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function runPressureRuntime(args, cwd) {
  const result = spawnSync(
    process.execPath,
    [pressureRuntimePath(), ...args, '--cwd', cwd, '--json'],
    { encoding: 'utf-8' },
  );
  const stdout = safeString(result.stdout).trim();
  const stderr = safeString(result.stderr).trim();
  if (result.status !== 0) {
    return {
      ok: false,
      command: args[0] || 'pressure-runtime',
      status: 'failed',
      exit_status: result.status,
      stderr,
      stdout,
    };
  }
  try {
    return JSON.parse(stdout);
  } catch {
    return {
      ok: false,
      command: args[0] || 'pressure-runtime',
      status: 'invalid_json',
      stdout,
      stderr,
    };
  }
}

function cmuxBin() {
  return safeString(process.env.CMUX_BUNDLED_CLI_PATH).trim() || 'cmux';
}

function cmux(args) {
  return spawnSync(cmuxBin(), args, { encoding: 'utf-8' });
}

let lastCmuxProbeFailure = null;

function cmuxSocketBlockedNextAction() {
  return [
    'Codex is running inside the macOS seatbelt sandbox and cannot connect to the cmux Unix socket.',
    'Run Team Runtime Auto-Start from an unsandboxed external terminal, or allow an escalated cmux command in Codex, then rerun the Oh My Goal team launch.',
    'Do not silently continue as a leader-only run unless the user explicitly accepts sequential fallback.',
  ].join(' ');
}

function cmuxFailureText(value) {
  if (value instanceof Error) return safeString(value.message).trim();
  if (value && typeof value === 'object') {
    return [
      value.error?.message,
      value.message,
      value.stderr,
      value.stdout,
    ].map(safeString).filter(Boolean).join('\n').trim();
  }
  return String(value || '').trim();
}

function classifyCmuxFailure(value) {
  const message = cmuxFailureText(value);
  const lowered = message.toLowerCase();
  const socketBlocked = /\boperation not permitted\b|\berrno\s*1\b|\beperm\b|permission denied/.test(lowered);
  if (value?.reason === 'cmux_socket_permission_blocked' || socketBlocked) {
    return {
      reason: 'cmux_socket_permission_blocked',
      message: message || 'cmux Unix socket access was blocked by the Codex sandbox.',
      next_action: cmuxSocketBlockedNextAction(),
    };
  }
  return {
    reason: 'cmux_unavailable',
    message: message || 'cmux command failed.',
    next_action: 'Open the project in cmux or tmux and rerun Team Runtime Auto-Start.',
  };
}

function cmuxErrorFromResult(result, fallback) {
  const failure = classifyCmuxFailure(result);
  const error = new Error(failure.message || fallback);
  error.reason = failure.reason;
  error.next_action = failure.next_action;
  return error;
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

function currentTmuxWindow() {
  const result = tmux(['display-message', '-p', '#S:#I']);
  if (result.status !== 0) return null;
  const target = safeString(result.stdout).trim();
  return target.includes(':') ? target : null;
}

function tmuxAvailable() {
  return Boolean(currentTmuxPane() && currentTmuxWindow());
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
    lastCmuxProbeFailure = null;
    const parsed = parseCmuxIdentify(result.stdout);
    if (parsed?.workspace) return parsed;
  } else {
    lastCmuxProbeFailure = classifyCmuxFailure(result);
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

function workerName(worker) {
  return worker.worker_id || worker.name;
}

function workerInteractiveTarget(worker) {
  if (worker.surface_id) return { kind: 'cmux', id: worker.surface_id };
  if (worker.pane_id) return { kind: 'tmux', id: worker.pane_id };
  return null;
}

function isProtectedInteractiveTarget(config, target) {
  if (!target) return false;
  if (target.kind === 'cmux') {
    return target.id === config.leader_surface_id || target.id === config.hud_surface_id;
  }
  return target.id === config.leader_pane_id || target.id === config.hud_pane_id;
}

function clearWorkerInteractiveTarget(worker, now, closeResult) {
  return {
    ...worker,
    pane_id: null,
    surface_id: null,
    renderer: null,
    closed_at: now,
    last_closed_target: closeResult.target,
    last_closed_renderer: closeResult.renderer,
    last_closed_reason: closeResult.reason,
  };
}

function closeWorkerInteractiveTarget(config, worker, reason) {
  const target = workerInteractiveTarget(worker);
  if (!target) return { ok: false, target: null, renderer: null, reason: 'no interactive target' };
  if (isProtectedInteractiveTarget(config, target)) {
    return { ok: false, target: target.id, renderer: target.kind, reason: 'target is protected leader/HUD surface' };
  }
  if (target.kind === 'cmux') {
    const workspace = config.cmux_workspace || safeString(process.env.CMUX_WORKSPACE_ID).trim();
    if (!workspace) return { ok: false, target: target.id, renderer: 'cmux-pane', reason: 'missing cmux workspace' };
    const result = cmux(['close-surface', '--workspace', workspace, '--surface', target.id]);
    return {
      ok: result.status === 0,
      target: target.id,
      renderer: 'cmux-pane',
      reason: result.status === 0 ? reason : safeString(result.stderr).trim() || 'cmux close-surface failed',
    };
  }
  const result = tmux(['kill-pane', '-t', target.id]);
  return {
    ok: result.status === 0,
    target: target.id,
    renderer: 'tmux-pane',
    reason: result.status === 0 ? reason : safeString(result.stderr).trim() || 'tmux kill-pane failed',
  };
}

function idleCloseEligible({ worker, status, ownedTasks, closeIdleMinutes, nowMs }) {
  if (!Number.isInteger(closeIdleMinutes) || closeIdleMinutes <= 0) return false;
  if (!workerInteractiveTarget(worker)) return false;
  if (ownedTasks.length > 0) return false;
  const state = safeString(status.state).trim();
  const statusText = safeString(status.status).trim();
  const activeValues = new Set(['running', 'working', 'in_progress', 'busy']);
  if (activeValues.has(state) || activeValues.has(statusText)) return false;
  const terminalBadValues = new Set(['failed', 'blocked', 'terminated', 'shutdown_requested']);
  if (terminalBadValues.has(state) || terminalBadValues.has(statusText)) return false;
  const updatedAtMs = Date.parse(status.updated_at);
  if (!Number.isFinite(updatedAtMs)) return false;
  return nowMs - updatedAtMs >= closeIdleMinutes * 60 * 1000;
}

function completedCloseEligible({ worker, status, ownedTasks, closeCompleted }) {
  if (!closeCompleted) return false;
  if (!workerInteractiveTarget(worker)) return false;
  if (ownedTasks.length > 0) return false;
  const values = new Set([safeString(status.state).trim(), safeString(status.status).trim()]);
  return ['done', 'reported', 'completed'].some((value) => values.has(value));
}

async function launchCmuxWorker(cwd, _root, config, worker, options = {}) {
  const context = options.context || currentCmuxContext();
  const workspace = options.workspace || context?.workspace || config.cmux_workspace;
  if (!workspace) throw new Error('cmux worker launch requires an active cmux workspace.');
  const result = cmux([
    'new-pane',
    '--type',
    'terminal',
    '--direction',
    options.direction || 'down',
    '--workspace',
    workspace,
    '--focus',
    'true',
  ]);
  if (result.status !== 0) {
    throw cmuxErrorFromResult(result, `failed to launch ${workerName(worker)}`);
  }
  const target = cmuxTargetFromNewPane(`${result.stdout}\n${result.stderr}`, workspace);
  if (!target.surface) throw new Error(`failed to resolve cmux surface for ${workerName(worker)}`);
  const command = `${buildWorkerCommand({ cwd, agent: config.agent, worker, teamName: config.team })}\n`;
  const title = `OMG ${workerName(worker)} ${worker.role}`;
  cmux([
    'rename-tab',
    '--workspace',
    workspace,
    '--surface',
    target.surface,
    title,
  ]);
  const send = cmux([
    'send',
    '--workspace',
    workspace,
    '--surface',
    target.surface,
    '--',
    command,
  ]);
  if (send.status !== 0) {
    throw new Error(safeString(send.stderr).trim() || `failed to send command for ${workerName(worker)}`);
  }
  const launchedWorker = {
    ...worker,
    pane_id: target.pane || null,
    surface_id: target.surface,
    title,
    renderer: 'cmux-pane',
  };
  await updateWorkerStatus(cwd, launchedWorker, {
    state: 'running',
    status: 'launched',
    pane_id: launchedWorker.pane_id,
    surface_id: launchedWorker.surface_id,
    title: launchedWorker.title,
    renderer: launchedWorker.renderer,
    reopened_at: options.reopenedAt,
  });
  return launchedWorker;
}

async function launchTmuxWorker(cwd, _root, config, worker) {
  const leaderPane = config.leader_pane_id || currentTmuxPane();
  const windowTarget = config.tmux_window || currentTmuxWindow();
  if (!leaderPane || !windowTarget) throw new Error('tmux worker relaunch requires an attached tmux pane.');
  const command = buildWorkerCommand({ cwd, agent: config.agent, worker, teamName: config.team });
  const result = tmux([
    'split-window',
    '-v',
    '-t',
    leaderPane,
    '-d',
    '-P',
    '-F',
    '#{pane_id}',
    '-c',
    cwd,
    command,
  ]);
  if (result.status !== 0) {
    throw new Error(safeString(result.stderr).trim() || `failed to relaunch ${workerName(worker)}`);
  }
  const paneId = safeString(result.stdout).split('\n')[0]?.trim();
  if (!paneId?.startsWith('%')) throw new Error(`failed to capture pane id for ${workerName(worker)}`);
  tmux(['select-layout', '-t', windowTarget, 'main-vertical']);
  const launchedWorker = {
    ...worker,
    pane_id: paneId,
    renderer: 'tmux-pane',
  };
  await updateWorkerStatus(cwd, launchedWorker, {
    state: 'running',
    status: 'launched',
    pane_id: launchedWorker.pane_id,
    renderer: launchedWorker.renderer,
  });
  return launchedWorker;
}

async function reopenWorkerIfNeeded(cwd, root, config, worker, now) {
  if (workerInteractiveTarget(worker)) return { worker, reopened: false, attempted: false, target: null, renderer: null, reason: 'already has interactive target' };
  try {
    if (config.cmux_workspace) {
      const reopenedWorker = await launchCmuxWorker(cwd, root, config, worker, {
        workspace: config.cmux_workspace,
        direction: 'down',
        reopenedAt: now,
      });
      return {
        worker: reopenedWorker,
        reopened: true,
        attempted: true,
        target: reopenedWorker.surface_id,
        renderer: reopenedWorker.renderer,
        reason: 'assigned work to hibernated cmux worker',
      };
    }
    if (config.tmux_window || tmuxAvailable()) {
      const reopenedWorker = await launchTmuxWorker(cwd, root, config, worker);
      return {
        worker: reopenedWorker,
        reopened: true,
        attempted: true,
        target: reopenedWorker.pane_id,
        renderer: reopenedWorker.renderer,
        reason: 'assigned work to hibernated tmux worker',
      };
    }
    return { worker, reopened: false, attempted: false, target: null, renderer: null, reason: 'no interactive transport available' };
  } catch (error) {
    return {
      worker,
      reopened: false,
      attempted: true,
      target: null,
      renderer: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function launchTmuxWorkers(cwd, root, config) {
  const leaderPane = currentTmuxPane();
  const windowTarget = currentTmuxWindow();
  if (!leaderPane || !windowTarget) throw new Error('tmux mode requires an attached tmux pane.');
  const panes = [];
  let rightStackRoot = null;
  for (const [index, worker] of config.workers.entries()) {
    const command = buildWorkerCommand({ cwd, agent: config.agent, worker, teamName: config.team });
    const splitDirection = index === 0 ? '-h' : '-v';
    const splitTarget = index === 0 ? leaderPane : (rightStackRoot || leaderPane);
    const result = tmux([
      'split-window',
      splitDirection,
      '-t',
      splitTarget,
      '-d',
      '-P',
      '-F',
      '#{pane_id}',
      '-c',
      cwd,
      command,
    ]);
    if (result.status !== 0) {
      throw new Error(safeString(result.stderr).trim() || `failed to launch ${worker.worker_id}`);
    }
    const paneId = safeString(result.stdout).split('\n')[0]?.trim();
    if (!paneId?.startsWith('%')) throw new Error(`failed to capture pane id for ${worker.worker_id}`);
    if (index === 0) rightStackRoot = paneId;
    panes.push({ ...worker, pane_id: paneId });
    await updateWorkerStatus(cwd, worker, { state: 'running', status: 'launched', pane_id: paneId });
  }
  tmux(['select-layout', '-t', windowTarget, 'main-vertical']);
  const launched = {
    ...config,
    status: 'launched',
    leader_pane_id: leaderPane,
    tmux_window: windowTarget,
    workers: panes,
    updated_at: new Date().toISOString(),
  };
  await writeJsonAtomic(join(root, 'config.json'), launched);
  await appendEvent(root, { type: 'launched', team: config.team, panes: panes.map((worker) => worker.pane_id) });
  return launched;
}

async function launchCmuxWorkers(cwd, root, config) {
  const context = currentCmuxContext();
  if (!context?.workspace) throw new Error('cmux mode requires an active cmux workspace.');
  const workers = [];
  for (const [index, worker] of config.workers.entries()) {
    const launchedWorker = await launchCmuxWorker(cwd, root, config, worker, {
      context,
      workspace: context.workspace,
      direction: index === 0 ? 'right' : 'down',
    });
    workers.push(launchedWorker);
  }
  const launched = {
    ...config,
    status: 'launched',
    leader_surface_id: context.surface || null,
    cmux_workspace: context.workspace,
    cmux_tree_command: `cmux tree --workspace ${context.workspace}`,
    workers,
    updated_at: new Date().toISOString(),
  };
  await writeJsonAtomic(join(root, 'config.json'), launched);
  await appendEvent(root, { type: 'launched', team: config.team, renderer: 'cmux-pane', surfaces: workers.map((worker) => worker.surface_id) });
  return launched;
}

async function commandPlan(args) {
  const objective = normalizeObjective(args.objective);
  const plan = buildTeamExecutionPlan(objective, args.workers, args.explicitWorkers);
  const teamName = sanitizeTeamName(args.team || objective);
  return {
    ok: true,
    command: 'plan',
    team: teamName,
    objective,
    worker_count: plan.worker_count,
    workers: [...workerBuckets(plan)].map(([workerId, tasks], index) => ({
      worker_id: workerId,
      role: workerRole(tasks, index + 1),
      tasks,
    })),
    tasks: plan.tasks,
  };
}

async function commandLaunch(args) {
  const cwd = resolve(args.cwd || process.cwd());
  const objective = normalizeObjective(args.objective);
  const teamName = sanitizeTeamName(args.team || objective);
  const plan = buildTeamExecutionPlan(objective, args.workers, args.explicitWorkers);
  const { root, config } = await materializeTeamState({
    cwd,
    teamName,
    objective,
    plan,
    mode: args.mode,
    agent: args.agent,
  });

  if (args.mode === 'dry-run') {
    return {
      ok: true,
      command: 'launch',
      status: 'planned',
      team: teamName,
      state_root: relativePath(cwd, root),
      workers: config.workers,
    };
  }
  if (args.mode === 'tmux') {
    const launched = await launchTmuxWorkers(cwd, root, config);
    return {
      ok: true,
      command: 'launch',
      status: 'launched',
      team: teamName,
      state_root: relativePath(cwd, root),
      workers: launched.workers,
    };
  }
  if (args.mode === 'cmux') {
    const launched = await launchCmuxWorkers(cwd, root, config);
    return {
      ok: true,
      command: 'launch',
      status: 'launched',
      team: teamName,
      state_root: relativePath(cwd, root),
      workers: launched.workers,
    };
  }
  if (args.mode === 'auto') {
    const hasCmux = cmuxAvailable();
    const cmuxProbeFailure = lastCmuxProbeFailure;
    if (hasCmux) {
      try {
        const launched = await launchCmuxWorkers(cwd, root, config);
        return {
          ok: true,
          command: 'launch',
          status: 'launched',
          team: teamName,
          state_root: relativePath(cwd, root),
          workers: launched.workers,
        };
      } catch (error) {
        const cmuxFailure = classifyCmuxFailure(error);
        if (!tmuxAvailable()) {
          await appendEvent(root, {
            type: 'launch_degraded',
            reason: cmuxFailure.reason,
            message: cmuxFailure.message,
            next_action: cmuxFailure.next_action,
          });
          if (args.requireInteractive) {
            return {
              ok: false,
              command: 'launch',
              status: 'blocked',
              reason: cmuxFailure.reason,
              message: cmuxFailure.message,
              team: teamName,
              state_root: relativePath(cwd, root),
              workers: config.workers,
              next_action: cmuxFailure.next_action,
            };
          }
          return {
            ok: false,
            command: 'launch',
            status: 'planned',
            reason: cmuxFailure.reason,
            message: cmuxFailure.message,
            team: teamName,
            state_root: relativePath(cwd, root),
            workers: config.workers,
            next_action: cmuxFailure.next_action,
          };
        }
      }
    } else if (cmuxProbeFailure?.reason === 'cmux_socket_permission_blocked' && !tmuxAvailable()) {
      await appendEvent(root, {
        type: 'launch_degraded',
        reason: cmuxProbeFailure.reason,
        message: cmuxProbeFailure.message,
        next_action: cmuxProbeFailure.next_action,
      });
      if (args.requireInteractive) {
        return {
          ok: false,
          command: 'launch',
          status: 'blocked',
          reason: cmuxProbeFailure.reason,
          message: cmuxProbeFailure.message,
          team: teamName,
          state_root: relativePath(cwd, root),
          workers: config.workers,
          next_action: cmuxProbeFailure.next_action,
        };
      }
      return {
        ok: false,
        command: 'launch',
        status: 'planned',
        reason: cmuxProbeFailure.reason,
        message: cmuxProbeFailure.message,
        team: teamName,
        state_root: relativePath(cwd, root),
        workers: config.workers,
        next_action: cmuxProbeFailure.next_action,
      };
    }
    if (!tmuxAvailable()) {
      await appendEvent(root, { type: 'launch_degraded', reason: 'tmux_not_attached' });
      if (args.requireInteractive) {
        return {
          ok: false,
          command: 'launch',
          status: 'blocked',
          reason: 'interactive_surface_unavailable',
          team: teamName,
          state_root: relativePath(cwd, root),
          workers: config.workers,
          next_action: 'Start Codex from cmux/tmux and rerun Team Runtime Auto-Start. Recommended cmux entry: cmux codex-teams, then invoke $oh-my-goal again or resume the goal.',
        };
      }
      return {
        ok: false,
        command: 'launch',
        status: 'planned',
        reason: 'tmux_not_attached',
        team: teamName,
        state_root: relativePath(cwd, root),
        workers: config.workers,
      };
    }
    const launched = await launchTmuxWorkers(cwd, root, config);
    return {
      ok: true,
      command: 'launch',
      status: 'launched',
      team: teamName,
      state_root: relativePath(cwd, root),
      workers: launched.workers,
    };
  }
  throw new Error(`Unknown --mode: ${args.mode}`);
}

async function loadConfig(cwd, teamName) {
  const root = teamRuntimeRoot(cwd, sanitizeTeamName(teamName));
  const configPath = join(root, 'config.json');
  if (!existsSync(configPath)) throw new Error(`team state not found: ${relativePath(cwd, configPath)}`);
  return { root, config: await readJson(configPath) };
}

function taskPath(root, taskId) {
  return join(root, 'tasks', `task-${taskId}.json`);
}

async function readTeamTasks(root, config) {
  const tasksDir = join(root, 'tasks');
  const tasks = [];
  if (existsSync(tasksDir)) {
    for (const file of await readdir(tasksDir)) {
      if (!/^task-.+\.json$/.test(file)) continue;
      tasks.push(await readJson(join(tasksDir, file)));
    }
  }
  if (tasks.length === 0) {
    for (const task of config.tasks || []) tasks.push(createTaskRecord(task));
  }
  return tasks.sort((left, right) => Number(left.id) - Number(right.id));
}

async function readWorkerRuntimeStatus(cwd, worker) {
  const statusPath = join(cwd, worker.worker_dir, 'status.json');
  return existsSync(statusPath) ? await readJson(statusPath) : { state: 'unknown', status: 'unknown' };
}

function isTerminalTaskStatus(status) {
  return ['completed', 'failed', 'cancelled'].includes(safeString(status));
}

function isActiveTaskStatus(status) {
  return ['pending', 'in_progress'].includes(safeString(status));
}

function resultDigest(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function compactLine(value) {
  return safeString(value).replace(/\s+/g, ' ').trim();
}

function firstSectionLine(content, label) {
  const pattern = new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, 'im');
  return compactLine(content.match(pattern)?.[1] || '');
}

function firstNumber(content, label) {
  const line = firstSectionLine(content, label);
  const match = line.match(/\b(?:100|[1-9]?\d)\b/);
  return match ? Number.parseInt(match[0], 10) : undefined;
}

function parseWorkerResult(content) {
  const recommendation = firstSectionLine(content, 'Recommendation').toLowerCase();
  const summary = firstSectionLine(content, 'Summary') || compactLine(content).slice(0, 160);
  const risks = firstSectionLine(content, 'Risks or blockers') || firstSectionLine(content, 'Blockers');
  const score = firstNumber(content, 'Trajectory score(?: 0-100)?');
  const noveltyScore = firstNumber(content, 'Novelty score(?: 0-100)?');
  const normalizedRecommendation = ['accept', 'reject', 'revise', 'block'].find((item) => recommendation.includes(item)) || '';
  return {
    summary,
    risks,
    score,
    novelty_score: noveltyScore,
    recommendation: normalizedRecommendation,
  };
}

function resultNeedsFollowup(review) {
  if (review.recommendation === 'accept' && (review.score === undefined || review.score >= 60)) return false;
  if (['reject', 'revise', 'block'].includes(review.recommendation)) return true;
  if (review.score !== undefined && review.score < 60) return true;
  return !review.recommendation && review.score === undefined;
}

function followupRole(task, worker, review) {
  if (review.recommendation === 'block') return 'replanner';
  if (safeString(worker.role) === 'critic') return 'replanner';
  if (safeString(worker.role) === 'tester') return 'implementer';
  if (review.score !== undefined && review.score < 60) return 'critic';
  return roleFor(`${task.description} revise implement test`);
}

function nextTaskId(tasks, config) {
  const fromTasks = tasks.reduce((max, task) => Math.max(max, Number.parseInt(task.id, 10) || 0), 0);
  const fromConfig = Number.parseInt(String(config.next_task_id || ''), 10) || 1;
  return Math.max(fromTasks + 1, fromConfig);
}

function makeFollowupTask({ id, parentTask, worker, review, createdAt, key }) {
  const role = followupRole(parentTask, worker, review);
  const reason = review.recommendation || (review.score !== undefined ? `score ${review.score}` : 'missing structured result');
  return {
    id: String(id),
    subject: `Follow up task ${parentTask.id}`,
    description: [
      `Resolve follow-up from ${worker.worker_id || worker.name} on task ${parentTask.id}.`,
      `Reason: ${reason}.`,
      review.summary ? `Summary: ${review.summary}.` : '',
      review.risks ? `Risks or blockers: ${review.risks}.` : '',
      `Original task: ${parentTask.description}`,
    ].filter(Boolean).join(' '),
    status: 'pending',
    role,
    owner: undefined,
    parent_task_id: parentTask.id,
    triggered_by_worker: worker.worker_id || worker.name,
    orchestrator_key: key,
    created_at: createdAt,
    version: 1,
  };
}

function pressureRoot(cwd, slug) {
  return join(cwd, '.omg', 'runtime', 'pressure', sanitizeTeamName(slug));
}

function evidenceBackedTrajectory(trajectory) {
  const evidence = Array.isArray(trajectory.evidence) ? trajectory.evidence : [];
  return evidence.some((item) => safeString(item).trim() && !/^pending$/i.test(item));
}

function pressureRole(role) {
  return ['critic', 'tester', 'replanner'].includes(safeString(role));
}

function createPressureTasks({ tasks, pressure, maxNewTasks, nextId, createdAt }) {
  if (!pressure) return { tasks: [], nextId };
  const additions = [];
  const activeKeys = new Set(tasks.filter((task) => !isTerminalTaskStatus(task.status)).map((task) => task.orchestrator_key).filter(Boolean));
  const trajectories = Array.isArray(pressure.trajectories) ? pressure.trajectories : [];
  const backed = trajectories.filter((trajectory) => trajectory.status !== 'rejected' && evidenceBackedTrajectory(trajectory));
  const pressureBacked = backed.filter((trajectory) => pressureRole(trajectory.role));
  const push = (key, role, subject, description) => {
    if (additions.length >= maxNewTasks) return;
    if (activeKeys.has(key)) return;
    additions.push({
      id: String(nextId),
      subject,
      description,
      status: 'pending',
      role,
      owner: undefined,
      orchestrator_key: key,
      created_at: createdAt,
      version: 1,
    });
    activeKeys.add(key);
    nextId += 1;
  };
  if (backed.length < 2) {
    push(
      `pressure:${pressure.slug}:independent-alternative`,
      'replanner',
      'Independent alternative',
      `Produce an evidence-backed alternative trajectory for ${pressure.objective}. Compare it against the baseline and include Trajectory score, Novelty score, and Recommendation.`,
    );
  }
  if (pressureBacked.length < 1) {
    push(
      `pressure:${pressure.slug}:critic-tester`,
      'critic',
      'Pressure critique',
      `Attack false completion for ${pressure.objective}. Identify a concrete falsification probe or blocker and include structured result sections.`,
    );
  }
  if (!pressure.active_trajectory_id && backed.length >= 2) {
    push(
      `pressure:${pressure.slug}:selection-brief`,
      'architect',
      'Trajectory selection brief',
      `Compare evidence-backed trajectories for ${pressure.objective} and recommend which one the leader should select. Do not call goal tools.`,
    );
  }
  return { tasks: additions, nextId };
}

async function loadPressureState(cwd, slug) {
  if (!slug) return null;
  const statePath = join(pressureRoot(cwd, slug), 'state.json');
  if (!existsSync(statePath)) return null;
  return readJson(statePath);
}

function openTasksForWorker(tasks, workerName) {
  return tasks.filter((task) => task.owner === workerName && !isTerminalTaskStatus(task.status));
}

async function writeWorkerIdentity(cwd, worker) {
  await writeJsonAtomic(join(cwd, worker.worker_dir, 'identity.json'), {
    name: worker.name,
    index: worker.index,
    role: worker.role,
    worker_cli: worker.worker_cli,
    assigned_tasks: worker.assigned_tasks,
    working_dir: worker.working_dir,
    team_state_root: worker.team_state_root,
  });
}

async function appendWorkerInbox(cwd, worker, assignments, reason) {
  if (assignments.length === 0) return;
  const inboxPath = join(cwd, worker.inbox);
  const current = existsSync(inboxPath) ? await readFile(inboxPath, 'utf-8') : '';
  const block = [
    '',
    `## Dynamic Assignment ${new Date().toISOString()}`,
    '',
    `Reason: ${reason}`,
    '',
    'New assigned tasks:',
    ...assignments.map((task) => `- Task ${task.id} (${task.role}): ${task.description}`),
    '',
    'Action:',
    '- Read the task files under `.omg/runtime/team/<team>/tasks/`.',
    '- Update your `status.json` while working.',
    '- Write final evidence to your existing `result.md` using the required result format.',
    '',
  ].join('\n');
  await writeFile(inboxPath, `${current.trimEnd()}\n${block}`, 'utf-8');
}

async function refreshWorkerPromptFromInbox(cwd, worker) {
  const inboxPath = join(cwd, worker.inbox);
  const promptPath = join(cwd, worker.prompt);
  const inbox = existsSync(inboxPath) ? await readFile(inboxPath, 'utf-8') : '';
  const prompt = [
    'You are an Oh My Goal worker lane running under a leader-owned Codex goal.',
    'Read the current inbox below, complete only your bounded assigned lane, and write the required evidence file before your final response.',
    'Never call create_goal or update_goal.',
    '',
    inbox.trim() || '# Oh My Goal Worker Inbox\n\nNo assigned tasks yet. Wait for the leader orchestrator to append work.',
    '',
  ].join('\n');
  await writeFile(promptPath, prompt, 'utf-8');
}

function dynamicWorkerName(index) {
  return `worker-${index}`;
}

function nextWorkerIndex(workers) {
  return (workers || []).reduce((max, worker) => {
    const fromIndex = Number.parseInt(worker.index, 10);
    const fromName = Number.parseInt(safeString(worker.worker_id || worker.name).replace(/^worker-/, ''), 10);
    return Math.max(max, Number.isFinite(fromIndex) ? fromIndex : 0, Number.isFinite(fromName) ? fromName : 0);
  }, 0) + 1;
}

function taskDependenciesSatisfied(task, taskById) {
  const dependencies = task.depends_on ?? task.blocked_by ?? [];
  if (dependencies.length === 0) return true;
  return dependencies.every((id) => taskById.get(id)?.status === 'completed');
}

function openAssignableTasks(tasks) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  return tasks.filter((task) => task.status === 'pending' && !task.owner && taskDependenciesSatisfied(task, taskById));
}

function workerCanAcceptMore(status, activeTaskCount) {
  if (activeTaskCount > 0) return false;
  const state = safeString(status.state).trim() || 'unknown';
  const statusText = safeString(status.status).trim() || 'unknown';
  const bad = new Set(['failed', 'blocked', 'terminated', 'shutdown_requested']);
  if (bad.has(state) || bad.has(statusText)) return false;
  return ['idle', 'done', 'unknown', 'planned', 'hibernated'].includes(state);
}

async function createDynamicWorkerLane({ cwd, root, config, index, role, createdAt }) {
  const workerNameValue = dynamicWorkerName(index);
  const workerDir = join(root, 'workers', workerNameValue);
  const resultPath = join(workerDir, 'result.md');
  const inboxPath = join(workerDir, 'inbox.md');
  const promptPath = join(workerDir, 'prompt.md');
  const stateRoot = teamStateRoot(cwd);
  const worker = {
    name: workerNameValue,
    worker_id: workerNameValue,
    index,
    role,
    worker_cli: config.agent === 'shell' ? undefined : config.agent,
    assigned_tasks: [],
    tasks: [],
    pane_id: null,
    surface_id: null,
    renderer: null,
    dynamic: true,
    created_at: createdAt,
    working_dir: cwd,
    team_state_root: stateRoot,
    inbox: relativePath(cwd, inboxPath),
    prompt: relativePath(cwd, promptPath),
    result: relativePath(cwd, resultPath),
    worker_dir: relativePath(cwd, workerDir),
  };
  await mkdir(workerDir, { recursive: true });
  await writeFile(inboxPath, [
    '# Oh My Goal Dynamic Worker Packet',
    '',
    `Team: ${config.team}`,
    `Worker: ${workerNameValue}`,
    `Role: ${role}`,
    `Objective: ${config.objective || config.task}`,
    `Team state root: ${relativePath(cwd, stateRoot)}`,
    '',
    'Assigned tasks:',
    '- No task assigned yet. The watch loop will append Dynamic Assignment blocks here.',
    '',
    'Boundary:',
    '- Do not call `create_goal`.',
    '- Do not call `update_goal`.',
    '- Do not mark the whole mission complete.',
    '- Return evidence only.',
    '',
    'Write your final evidence to:',
    `- \`${relativePath(cwd, resultPath)}\``,
    '',
    'Required result format:',
    '- Summary:',
    '- Evidence:',
    '- Files or artifacts:',
    '- Verification commands and observed output:',
    '- Risks or blockers:',
    '- Trajectory score 0-100:',
    '- Novelty score 0-100:',
    '- Recommendation: accept | reject | revise | block',
    '',
  ].join('\n'), 'utf-8');
  await refreshWorkerPromptFromInbox(cwd, worker);
  await writeJsonAtomic(join(workerDir, 'identity.json'), {
    name: worker.name,
    index: worker.index,
    role: worker.role,
    worker_cli: worker.worker_cli,
    assigned_tasks: [],
    working_dir: worker.working_dir,
    team_state_root: worker.team_state_root,
    dynamic: true,
  });
  await writeJsonAtomic(join(workerDir, 'status.json'), {
    state: 'idle',
    status: 'planned',
    current_task_id: null,
    updated_at: createdAt,
    dynamic: true,
  });
  return worker;
}

async function scaleWorkersForReadyTasks({ cwd, root, config, tasks, workerStatuses, createdAt, args }) {
  if (args.scaleWorkers === false) return { workers: [], decisions: [] };
  const maxWorkers = Math.max(1, Math.min(MAX_WORKERS, normalizedPositiveInteger(args.maxWorkers, MAX_WORKERS)));
  const requestedNewWorkers = Number.isInteger(args.maxNewWorkers) && args.maxNewWorkers >= 0 ? args.maxNewWorkers : 2;
  const maxNewWorkers = Math.max(0, Math.min(maxWorkers, requestedNewWorkers));
  if (maxNewWorkers === 0) return { workers: [], decisions: [] };
  const currentWorkers = config.workers || [];
  if (currentWorkers.length >= maxWorkers) return { workers: [], decisions: [] };

  const activeTaskCounts = new Map();
  for (const task of tasks) {
    if (task.owner && isActiveTaskStatus(task.status)) {
      activeTaskCounts.set(task.owner, (activeTaskCounts.get(task.owner) || 0) + 1);
    }
  }
  const readyTasks = openAssignableTasks(tasks);
  const availableWorkers = currentWorkers.filter((worker) => {
    const name = worker.worker_id || worker.name;
    const status = workerStatuses.get(name) || { state: 'unknown', status: 'unknown' };
    return workerCanAcceptMore(status, activeTaskCounts.get(name) || 0);
  });
  const shortage = Math.max(0, readyTasks.length - availableWorkers.length);
  const createCount = Math.min(shortage, maxWorkers - currentWorkers.length, maxNewWorkers);
  const workers = [];
  const decisions = [];
  let index = nextWorkerIndex(currentWorkers);
  for (let offset = 0; offset < createCount; offset += 1) {
    const sourceTask = readyTasks[availableWorkers.length + offset] || readyTasks[offset];
    const role = sourceTask?.role || ROLE_ORDER[(index - 1) % ROLE_ORDER.length] || 'team-executor';
    const worker = await createDynamicWorkerLane({ cwd, root, config, index, role, createdAt });
    currentWorkers.push(worker);
    workerStatuses.set(worker.worker_id, { state: 'idle', status: 'planned', updated_at: createdAt });
    workers.push(worker);
    decisions.push({
      type: 'scale-worker',
      workerName: worker.worker_id,
      role,
      reason: `ready work exceeds available lanes (${readyTasks.length} ready, ${availableWorkers.length + offset} available)`,
    });
    index += 1;
  }
  config.workers = currentWorkers;
  return { workers, decisions };
}

function notifyWorker(config, worker, message) {
  if (worker.surface_id) {
    const workspace = config.cmux_workspace || safeString(process.env.CMUX_WORKSPACE_ID).trim();
    if (!workspace) return { ok: false, target: worker.surface_id, reason: 'missing cmux workspace' };
    const result = cmux(['send', '--workspace', workspace, '--surface', worker.surface_id, '--', `${message}\n`]);
    return { ok: result.status === 0, target: worker.surface_id, reason: safeString(result.stderr).trim() };
  }
  if (worker.pane_id) {
    const result = tmux(['send-keys', '-t', worker.pane_id, message, 'Enter']);
    return { ok: result.status === 0, target: worker.pane_id, reason: safeString(result.stderr).trim() };
  }
  return { ok: false, target: null, reason: 'no interactive pane' };
}

async function commandTick(args) {
  if (!args.team) throw new Error('tick requires --team <team>');
  const cwd = resolve(args.cwd || process.cwd());
  const { root, config } = await loadConfig(cwd, args.team);
  const createdAt = new Date().toISOString();
  const tasks = await readTeamTasks(root, config);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const decisions = [];
  const createdTasks = [];
  const reclaimedTaskIds = [];
  const workerStatuses = new Map();
  const maxNewTasks = Number.isInteger(args.maxNewTasks) && args.maxNewTasks >= 0 ? args.maxNewTasks : 4;
  const staleMinutes = Number.isInteger(args.staleMinutes) && args.staleMinutes > 0 ? args.staleMinutes : 0;
  const closeIdleMinutes = Number.isInteger(args.closeIdleMinutes) && args.closeIdleMinutes > 0 ? args.closeIdleMinutes : 0;
  let nextId = nextTaskId(tasks, config);

  for (const worker of config.workers || []) {
    const workerName = worker.worker_id || worker.name;
    const status = await readWorkerRuntimeStatus(cwd, worker);
    workerStatuses.set(workerName, status);
    const resultPath = join(cwd, worker.result);
    const hasResult = existsSync(resultPath);
    const workerTasks = (worker.assigned_tasks || [])
      .map((taskId) => taskById.get(taskId))
      .filter(Boolean);

    if (hasResult) {
      const content = await readFile(resultPath, 'utf-8');
      const digest = resultDigest(content);
      if (digest !== status.last_result_digest) {
        const review = parseWorkerResult(content);
        const activeWorkerTasks = workerTasks.filter((task) => isActiveTaskStatus(task.status));
        for (const task of activeWorkerTasks) {
          const needsFollowup = resultNeedsFollowup(review);
          task.owner = workerName;
          task.result_path = worker.result;
          task.result_summary = review.summary;
          task.result_digest = digest;
          task.recommendation = review.recommendation || undefined;
          task.score = review.score;
          task.novelty_score = review.novelty_score;
          task.status = needsFollowup ? 'failed' : 'completed';
          task.completed_at = createdAt;
          task.version = (task.version || 1) + 1;
          decisions.push({
            type: needsFollowup ? 'followup-needed' : 'complete',
            taskId: task.id,
            workerName,
            reason: needsFollowup
              ? `worker result needs follow-up (${review.recommendation || review.score || 'missing structured score'})`
              : 'worker result accepted by score/recommendation',
          });
          if (needsFollowup && !task.followup_task_id && createdTasks.length < maxNewTasks) {
            const key = `followup:${task.id}:${digest}`;
            const followup = makeFollowupTask({ id: nextId, parentTask: task, worker, review, createdAt, key });
            task.followup_task_id = followup.id;
            task.version += 1;
            tasks.push(followup);
            taskById.set(followup.id, followup);
            createdTasks.push(followup);
            nextId += 1;
          }
        }
        await updateWorkerStatus(cwd, worker, { state: 'done', status: 'reported', last_result_digest: digest });
        workerStatuses.set(workerName, { ...status, state: 'done', status: 'reported', last_result_digest: digest });
        continue;
      }
    }

    const inactive = ['failed', 'blocked', 'terminated', 'shutdown_requested'].includes(status.state)
      || ['failed', 'blocked', 'terminated', 'shutdown_requested'].includes(status.status);
    const updatedAtMs = Number.isFinite(Date.parse(status.updated_at)) ? Date.parse(status.updated_at) : Date.now();
    const stale = staleMinutes > 0 && Date.now() - updatedAtMs > staleMinutes * 60 * 1000;
    if (inactive || stale) {
      for (const task of workerTasks) {
        if (!isActiveTaskStatus(task.status) || task.owner !== workerName) continue;
        task.owner = undefined;
        task.status = 'pending';
        task.reclaimed_from = workerName;
        task.reclaimed_reason = inactive ? 'worker inactive' : `worker stale for ${staleMinutes} minutes`;
        task.version = (task.version || 1) + 1;
        reclaimedTaskIds.push(task.id);
        decisions.push({ type: 'reclaim', taskId: task.id, workerName, reason: task.reclaimed_reason });
      }
    }
  }

  const pressure = await loadPressureState(cwd, args.pressureSlug);
  const pressureAdditions = createPressureTasks({
    tasks,
    pressure,
    maxNewTasks: Math.max(0, maxNewTasks - createdTasks.length),
    nextId,
    createdAt,
  });
  for (const task of pressureAdditions.tasks) {
    tasks.push(task);
    taskById.set(task.id, task);
    createdTasks.push(task);
    decisions.push({ type: 'pressure-followup', taskId: task.id, reason: task.description });
  }
  nextId = pressureAdditions.nextId;

  const scaled = await scaleWorkersForReadyTasks({
    cwd,
    root,
    config,
    tasks,
    workerStatuses,
    createdAt,
    args,
  });
  decisions.push(...scaled.decisions);

  const activeTaskCounts = new Map();
  for (const task of tasks) {
    if (task.owner && isActiveTaskStatus(task.status)) {
      activeTaskCounts.set(task.owner, (activeTaskCounts.get(task.owner) || 0) + 1);
    }
  }
  const rebalanceWorkers = (config.workers || []).map((worker) => {
    const workerName = worker.worker_id || worker.name;
    const status = workerStatuses.get(workerName) || { state: 'unknown', status: 'unknown' };
    const busy = (activeTaskCounts.get(workerName) || 0) > 0;
    return {
      name: workerName,
      role: worker.role,
      alive: !['failed', 'blocked', 'terminated', 'shutdown_requested'].includes(status.state)
        && !['failed', 'blocked', 'terminated', 'shutdown_requested'].includes(status.status),
      status: busy ? { ...status, state: 'running' } : { ...status, state: status.state || 'idle' },
    };
  });
  const rebalanceDecisions = buildRebalanceDecisions({ tasks, workers: rebalanceWorkers, reclaimedTaskIds });
  const assignmentsByWorker = new Map();
  for (const decision of rebalanceDecisions) {
    const task = taskById.get(decision.taskId);
    if (!task) continue;
    task.owner = decision.workerName;
    task.assigned_at = createdAt;
    task.allocation_reason = decision.reason;
    task.version = (task.version || 1) + 1;
    if (!assignmentsByWorker.has(decision.workerName)) assignmentsByWorker.set(decision.workerName, []);
    assignmentsByWorker.get(decision.workerName).push(task);
    decisions.push(decision);
  }

  const updatedWorkers = [];
  const notifications = [];
  for (const worker of config.workers || []) {
    const workerName = worker.worker_id || worker.name;
    const ownedTasks = openTasksForWorker(tasks, workerName);
    let updated = {
      ...worker,
      assigned_tasks: ownedTasks.map((task) => task.id),
      tasks: ownedTasks,
      role: ownedTasks[0]?.role || worker.role,
    };
    const assigned = assignmentsByWorker.get(workerName) || [];
    if (assigned.length > 0) {
      await appendWorkerInbox(cwd, updated, assigned, assigned.map((task) => task.allocation_reason).join('; '));
      await refreshWorkerPromptFromInbox(cwd, updated);
      if (args.reopenClosed !== false && !workerInteractiveTarget(updated)) {
        const reopen = await reopenWorkerIfNeeded(cwd, root, config, updated, createdAt);
        updated = reopen.worker;
        if (reopen.reopened) {
          decisions.push({
            type: 'reopen-worker',
            workerName,
            target: reopen.target,
            renderer: reopen.renderer,
            reason: reopen.reason,
          });
        } else if (reopen.attempted) {
          decisions.push({
            type: 'reopen-worker-failed',
            workerName,
            reason: reopen.reason,
          });
        }
      }
      await updateWorkerStatus(cwd, updated, {
        state: 'idle',
        status: 'assigned',
        current_task_id: assigned[0].id,
      });
      if (args.notify) {
        notifications.push(notifyWorker(config, updated, `Oh My Goal dynamic assignment: read ${updated.inbox}`));
      }
    } else {
      const status = workerStatuses.get(workerName) || { state: 'unknown', status: 'unknown' };
      const shouldCloseCompleted = completedCloseEligible({
        worker: updated,
        status,
        ownedTasks,
        closeCompleted: args.closeCompleted,
      });
      const shouldCloseIdle = idleCloseEligible({ worker: updated, status, ownedTasks, closeIdleMinutes, nowMs: Date.now() });
      if (shouldCloseCompleted || shouldCloseIdle) {
        const reason = shouldCloseCompleted
          ? 'completed with no open tasks'
          : `idle with no open tasks for ${closeIdleMinutes} minutes`;
        const close = closeWorkerInteractiveTarget(config, updated, reason);
        if (close.ok) {
          updated = clearWorkerInteractiveTarget(updated, createdAt, close);
          decisions.push({
            type: shouldCloseCompleted ? 'close-completed-worker' : 'close-idle-worker',
            workerName,
            target: close.target,
            renderer: close.renderer,
            reason: close.reason,
          });
          await updateWorkerStatus(cwd, updated, {
            state: 'hibernated',
            status: 'idle_closed',
            pane_id: null,
            surface_id: null,
            renderer: null,
            closed_at: createdAt,
            last_closed_target: close.target,
            last_closed_renderer: close.renderer,
            close_reason: close.reason,
          });
          workerStatuses.set(workerName, {
            ...status,
            state: 'hibernated',
            status: 'idle_closed',
            pane_id: null,
            surface_id: null,
            renderer: null,
            closed_at: createdAt,
            updated_at: createdAt,
          });
        } else {
          decisions.push({
            type: shouldCloseCompleted ? 'close-completed-worker-failed' : 'close-idle-worker-failed',
            workerName,
            target: close.target,
            renderer: close.renderer,
            reason: close.reason,
          });
        }
      }
    }
    updatedWorkers.push(updated);
    await writeWorkerIdentity(cwd, updated);
  }

  for (const task of tasks) await writeJsonAtomic(taskPath(root, task.id), task);
  const updatedConfig = {
    ...config,
    status: decisions.length > 0 ? 'orchestrating' : config.status,
    workers: updatedWorkers,
    worker_count: updatedWorkers.length,
    tasks,
    next_task_id: nextId,
    updated_at: createdAt,
    last_orchestrator_tick_at: createdAt,
  };
  await writeJsonAtomic(join(root, 'config.json'), updatedConfig);
  const manifestPath = join(root, 'manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = await readJson(manifestPath);
    await writeJsonAtomic(manifestPath, {
      ...manifest,
      workers: updatedWorkers,
      tasks,
      next_task_id: nextId,
      updated_at: createdAt,
      last_orchestrator_tick_at: createdAt,
    });
  }
  await appendEvent(root, {
    type: 'orchestrator_tick',
    team: config.team,
    decisions: decisions.map((decision) => ({ type: decision.type, task_id: decision.taskId, worker: decision.workerName, reason: decision.reason })),
    created_tasks: createdTasks.map((task) => task.id),
    reclaimed_task_ids: reclaimedTaskIds,
  });
  return {
    ok: true,
    command: 'tick',
    team: config.team,
    state_root: relativePath(cwd, root),
    decisions,
    created_tasks: createdTasks,
    assigned: [...assignmentsByWorker].map(([worker, assignedTasks]) => ({
      worker,
      tasks: assignedTasks.map((task) => task.id),
    })),
    reclaimed_task_ids: reclaimedTaskIds,
    notifications,
    next_action: decisions.length > 0
      ? 'Workers should read updated inbox files; run status/collect/import-team after results land.'
      : 'No dynamic reallocation needed on this tick.',
  };
}

async function commandStatus(args) {
  if (!args.team) throw new Error('status requires --team <team>');
  const cwd = resolve(args.cwd || process.cwd());
  const { root, config } = await loadConfig(cwd, args.team);
  const workers = [];
  for (const worker of config.workers || []) {
    const statusPath = join(cwd, worker.worker_dir, 'status.json');
    const resultPath = join(cwd, worker.result);
    const status = existsSync(statusPath) ? await readJson(statusPath) : {};
    workers.push({
      worker_id: worker.worker_id,
      role: worker.role,
      pane_id: worker.pane_id || status.pane_id || null,
      surface_id: worker.surface_id || status.surface_id || null,
      title: worker.title || status.title || null,
      renderer: worker.renderer || status.renderer || null,
      state: status.state || null,
      status: status.status || 'unknown',
      result_exists: existsSync(resultPath),
      inbox: worker.inbox,
      result: worker.result,
    });
  }
  return {
    ok: true,
    command: 'status',
    team: config.team,
    status: config.status,
    state_root: relativePath(cwd, root),
    workers,
  };
}

async function commandCollect(args) {
  if (!args.team) throw new Error('collect requires --team <team>');
  const cwd = resolve(args.cwd || process.cwd());
  const { root, config } = await loadConfig(cwd, args.team);
  const results = [];
  for (const worker of config.workers || []) {
    const resultPath = join(cwd, worker.result);
    results.push({
      worker_id: worker.worker_id,
      role: worker.role,
      status: existsSync(resultPath) ? 'reported' : 'pending',
      result: worker.result,
      content: existsSync(resultPath) ? await readFile(resultPath, 'utf-8') : '',
    });
  }
  const summary = [
    '# Oh My Goal Team Result Collection',
    '',
    `Team: ${config.team}`,
    `Objective: ${config.objective}`,
    '',
    ...results.map((result) => [
      `## ${result.worker_id} (${result.role})`,
      '',
      result.content.trim() || `Pending result at \`${result.result}\`.`,
      '',
    ].join('\n')),
  ].join('\n');
  await writeFile(join(root, 'summary.md'), summary, 'utf-8');
  await appendEvent(root, { type: 'collected', reported: results.filter((result) => result.status === 'reported').length });
  return {
    ok: true,
    command: 'collect',
    team: config.team,
    summary: relativePath(cwd, join(root, 'summary.md')),
    results: results.map(({ content, ...result }) => result),
  };
}

function openTaskCount(tasks) {
  return tasks.filter((task) => !isTerminalTaskStatus(task.status)).length;
}

async function appendWatchCycle(root, cycle) {
  await appendFile(join(root, 'watch.ndjson'), `${JSON.stringify(cycle)}\n`, 'utf-8');
}

async function commandWatch(args) {
  if (!args.team) throw new Error('watch requires --team <team>.');
  const cwd = resolve(args.cwd || process.cwd());
  const intervalMs = Math.max(250, normalizedPositiveInteger(args.intervalMs, 5000));
  const iterations = Number.isInteger(args.iterations) && args.iterations > 0 ? args.iterations : 0;
  const idleStopCount = normalizedPositiveInteger(args.idleStopCount, 1);
  const cycles = [];
  let idleCycles = 0;
  let cycleNumber = 0;
  let lastRoot = null;

  while (iterations === 0 || cycleNumber < iterations) {
    cycleNumber += 1;
    const cycleStartedAt = new Date().toISOString();
    const tick = await commandTick(args);
    const collect = await commandCollect(args);
    const importTeam = args.pressureSlug && args.importTeam !== false
      ? runPressureRuntime(['import-team', '--slug', args.pressureSlug, '--team', args.team], cwd)
      : null;
    const pressureStatus = args.pressureSlug && args.pressureStatus !== false
      ? runPressureRuntime(['status', '--slug', args.pressureSlug], cwd)
      : null;
    const followupTick = args.pressureSlug ? await commandTick(args) : null;
    const status = await commandStatus(args);
    const { root, config } = await loadConfig(cwd, args.team);
    lastRoot = root;
    const tasks = await readTeamTasks(root, config);
    const openTasks = openTaskCount(tasks);
    const cycle = {
      cycle: cycleNumber,
      started_at: cycleStartedAt,
      finished_at: new Date().toISOString(),
      team: config.team,
      open_tasks: openTasks,
      tick,
      collect,
      import_team: importTeam,
      pressure_status: pressureStatus,
      followup_tick: followupTick,
      status,
    };
    await appendWatchCycle(root, cycle);
    await appendEvent(root, {
      type: 'watch_cycle',
      cycle: cycleNumber,
      open_tasks: openTasks,
      tick_decisions: tick.decisions?.length || 0,
      followup_decisions: followupTick?.decisions?.length || 0,
      imported: importTeam?.imported?.length || 0,
      skipped: importTeam?.skipped?.length || 0,
    });
    cycles.push(cycle);

    if (!args.json) {
      console.log(`watch cycle ${cycleNumber}: open_tasks=${openTasks} tick=${tick.decisions?.length || 0} followup=${followupTick?.decisions?.length || 0}`);
    }

    if (args.stopWhenIdle) {
      idleCycles = openTasks === 0 ? idleCycles + 1 : 0;
      if (idleCycles >= idleStopCount) break;
    }
    if (iterations !== 0 && cycleNumber >= iterations) break;
    await sleep(intervalMs);
  }

  const watchLog = lastRoot ? relativePath(cwd, join(lastRoot, 'watch.ndjson')) : null;
  return {
    ok: true,
    command: 'watch',
    team: sanitizeTeamName(args.team),
    cycles: cycles.length,
    watch_log: watchLog,
    last_cycle: cycles.at(-1) || null,
    next_action: 'Keep watch running while worker panes are active; stop it before final shutdown or after pressure/completion gates pass.',
  };
}

async function commandShutdown(args) {
  if (!args.team) throw new Error('shutdown requires --team <team>');
  const cwd = resolve(args.cwd || process.cwd());
  const { root, config } = await loadConfig(cwd, args.team);
  const killed = [];
  let shutdownWorkers = config.workers || [];
  if (args.killPanes) {
    shutdownWorkers = [];
    for (const worker of config.workers || []) {
      const close = closeWorkerInteractiveTarget(config, worker, 'shutdown requested');
      if (close.ok) {
        killed.push(close.target);
        shutdownWorkers.push(clearWorkerInteractiveTarget(worker, new Date().toISOString(), close));
        await updateWorkerStatus(cwd, worker, {
          state: 'shutdown_requested',
          status: 'pane_closed',
          pane_id: null,
          surface_id: null,
          renderer: null,
          closed_at: new Date().toISOString(),
          close_reason: close.reason,
        });
      } else {
        shutdownWorkers.push(worker);
      }
    }
  }
  const updated = {
    ...config,
    workers: shutdownWorkers,
    status: 'shutdown_requested',
    shutdown_requested_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await writeJsonAtomic(join(root, 'config.json'), updated);
  await writeJsonAtomic(join(root, 'shutdown.json'), {
    team: config.team,
    requested_at: updated.shutdown_requested_at,
    kill_panes: Boolean(args.killPanes),
    killed_panes: killed,
  });
  await appendEvent(root, { type: 'shutdown_requested', kill_panes: Boolean(args.killPanes), killed });
  return {
    ok: true,
    command: 'shutdown',
    team: config.team,
    status: updated.status,
    killed_panes: killed,
  };
}

function printPayload(payload, json) {
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (payload.command === 'plan') {
    console.log(`oh-my-goal team plan: ${payload.team}`);
    for (const worker of payload.workers) {
      console.log(`- ${worker.worker_id} (${worker.role})`);
      for (const task of worker.tasks) console.log(`  - ${task.description}`);
    }
    return;
  }
  console.log(JSON.stringify(payload, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.command === 'help') {
    printHelp();
    return;
  }
  const command = args.command;
  if (command === 'plan') return printPayload(await commandPlan(args), args.json);
  if (command === 'launch') return printPayload(await commandLaunch(args), args.json);
  if (command === 'tick') return printPayload(await commandTick(args), args.json);
  if (command === 'watch') return printPayload(await commandWatch(args), args.json);
  if (command === 'status') return printPayload(await commandStatus(args), args.json);
  if (command === 'collect') return printPayload(await commandCollect(args), args.json);
  if (command === 'shutdown') return printPayload(await commandShutdown(args), args.json);
  throw new Error(`Unknown command: ${command}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || join(tmpdir(), 'missing')).href) {
  try {
    await main();
  } catch (error) {
    console.error(`[oh-my-goal team-runtime] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
