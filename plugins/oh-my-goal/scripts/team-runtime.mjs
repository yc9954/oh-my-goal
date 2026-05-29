#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  DEFAULT_WORKERS,
  appendEvent,
  buildTeamExecutionPlan,
  buildWorkerCommand,
  materializeTeamState,
  normalizeObjective,
  readJson,
  relativePath,
  safeString,
  sanitizeTeamName,
  teamRuntimeRoot,
  updateWorkerStatus,
  workerBuckets,
  workerRole,
  writeJsonAtomic,
} from './omx-team-core.mjs';

export { buildTeamExecutionPlan, sanitizeTeamName } from './omx-team-core.mjs';

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
    workers: DEFAULT_WORKERS,
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
  node scripts/team-runtime.mjs launch --objective "<objective>" [--workers 3] [--mode auto|cmux|tmux|dry-run] [--json]
  node scripts/team-runtime.mjs status --team <team> [--json]
  node scripts/team-runtime.mjs collect --team <team> [--json]
  node scripts/team-runtime.mjs shutdown --team <team> [--kill-panes] [--json]

Purpose:
  Optional OMX-derived Team bridge for Codex plugin runs. It writes bounded worker
  packets under .omg/runtime/team/<team>/ and can open visible cmux or tmux
  worker panes when launched from an attached interactive surface.
`);
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
    const result = cmux([
      'new-pane',
      '--type',
      'terminal',
      '--direction',
      index === 0 ? 'right' : 'down',
      '--workspace',
      context.workspace,
      '--focus',
      'true',
    ]);
    if (result.status !== 0) {
      throw new Error(safeString(result.stderr).trim() || `failed to launch ${worker.worker_id}`);
    }
    const target = cmuxTargetFromNewPane(`${result.stdout}\n${result.stderr}`, context.workspace);
    if (!target.surface) throw new Error(`failed to resolve cmux surface for ${worker.worker_id}`);
    const command = `${buildWorkerCommand({ cwd, agent: config.agent, worker, teamName: config.team })}\n`;
    const title = `OMG ${worker.worker_id} ${worker.role}`;
    cmux([
      'rename-tab',
      '--workspace',
      context.workspace,
      '--surface',
      target.surface,
      title,
    ]);
    const send = cmux([
      'send',
      '--workspace',
      context.workspace,
      '--surface',
      target.surface,
      '--',
      command,
    ]);
    if (send.status !== 0) {
      throw new Error(safeString(send.stderr).trim() || `failed to send command for ${worker.worker_id}`);
    }
    const launchedWorker = {
      ...worker,
      pane_id: target.pane || null,
      surface_id: target.surface,
      title,
      renderer: 'cmux-pane',
    };
    workers.push(launchedWorker);
    await updateWorkerStatus(cwd, worker, {
      state: 'running',
      status: 'launched',
      pane_id: launchedWorker.pane_id,
      surface_id: launchedWorker.surface_id,
      title: launchedWorker.title,
      renderer: launchedWorker.renderer,
    });
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
    if (cmuxAvailable()) {
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
        if (!tmuxAvailable()) {
          await appendEvent(root, { type: 'launch_degraded', reason: 'cmux_unavailable', message: error instanceof Error ? error.message : String(error) });
          return {
            ok: false,
            command: 'launch',
            status: 'planned',
            reason: 'cmux_unavailable',
            team: teamName,
            state_root: relativePath(cwd, root),
            workers: config.workers,
          };
        }
      }
    }
    if (!tmuxAvailable()) {
      await appendEvent(root, { type: 'launch_degraded', reason: 'tmux_not_attached' });
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

async function commandShutdown(args) {
  if (!args.team) throw new Error('shutdown requires --team <team>');
  const cwd = resolve(args.cwd || process.cwd());
  const { root, config } = await loadConfig(cwd, args.team);
  const killed = [];
  if (args.killPanes) {
    for (const worker of config.workers || []) {
      if (worker.surface_id) {
        const workspace = config.cmux_workspace || safeString(process.env.CMUX_WORKSPACE_ID).trim();
        const result = cmux([
          'close-surface',
          ...(workspace ? ['--workspace', workspace] : []),
          '--surface',
          worker.surface_id,
        ]);
        if (result.status === 0) killed.push(worker.surface_id);
        continue;
      }
      if (!worker.pane_id) continue;
      const result = tmux(['kill-pane', '-t', worker.pane_id]);
      if (result.status === 0) killed.push(worker.pane_id);
    }
  }
  const updated = {
    ...config,
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
