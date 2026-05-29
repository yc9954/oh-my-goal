import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

// Ported from the OMX Team contracts in src/team/tmux-session.ts,
// src/team/state/types.ts, src/team/state/*, and src/team/worker-bootstrap.ts.
// Keep state, worker identity, task files, and worker prompt shape here; keep
// cmux/tmux rendering in team-runtime.mjs as transport adapters.

export const MAX_WORKERS = 8;
export const DEFAULT_WORKERS = 3;
export const ROLE_ORDER = ['architect', 'implementer', 'tester', 'critic', 'researcher', 'writer', 'replanner'];

export function safeString(value) {
  return typeof value === 'string' ? value : '';
}

// Ported from OMX src/team/tmux-session.ts.
export function sanitizeTeamName(name) {
  const lowered = safeString(name).toLowerCase();
  const replaced = lowered
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-/, '')
    .replace(/-$/, '');
  const truncated = replaced.slice(0, 30).replace(/-$/, '');
  if (truncated.trim() === '') throw new Error('sanitizeTeamName: empty after sanitization');
  return truncated;
}

export function normalizeObjective(value) {
  return safeString(value)
    .replace(/^\s*(?:use\s+)?\$oh-my-goal\b[:\s-]*/i, '')
    .trim();
}

function resolveWorkerCount(value) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`worker count must be >= 1 (got ${value})`);
  return Math.min(value, MAX_WORKERS);
}

function cleanFragment(value) {
  return safeString(value)
    .replace(/^\s*(?:[-*•]|\[\s?[xX]?\]|\d+[.)])\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitObjective(objective) {
  const text = normalizeObjective(objective);
  const rawLines = text.split(/\r?\n/).filter(Boolean);
  const bulletLines = rawLines
    .filter((line) => /^\s*(?:[-*•]|\[\s?[xX]?\]|\d+[.)])/.test(line))
    .map(cleanFragment);
  if (bulletLines.length > 1) return bulletLines.map(cleanFragment);

  const numbered = [...text.matchAll(/(?:^|\s)\d+[.)]\s+(.+?)(?=\s+\d+[.)]\s+|$)/gs)]
    .map((match) => cleanFragment(match[1]))
    .filter(Boolean);
  if (numbered.length > 1) return numbered;

  const semicolon = text.split(/[;\n]+/).map(cleanFragment).filter(Boolean);
  if (semicolon.length > 1) return semicolon;

  const comma = text
    .replace(/\s+\band\b\s+/gi, ', ')
    .replace(/\s+\b그리고\b\s+/g, ', ')
    .split(/\s*,\s+/)
    .map(cleanFragment)
    .filter(Boolean);
  if (comma.length > 1 && comma.every((part) => part.split(/\s+/).length <= 12)) return comma;

  return [text];
}

function roleFor(text) {
  const value = safeString(text).toLowerCase();
  if (/(test|verify|validation|qa|coverage|검증|테스트)/i.test(value)) return 'tester';
  if (/\b(?:critic|review|risk|audit|challenge|basin)\b|local optimum|반박|리뷰|위험/i.test(value)) return 'critic';
  if (/(research|analy[sz]e|investigate|study|survey|조사|연구|분석)/i.test(value)) return 'researcher';
  if (/(doc|readme|prd|spec|write|문서|기획|요구사항)/i.test(value)) return 'writer';
  if (/(architect|design|plan|structure|설계|구조|계획)/i.test(value)) return 'architect';
  if (/(replan|fallback|rollback|revise|수정|재계획)/i.test(value)) return 'replanner';
  if (/(implement|build|fix|code|refactor|ship|개발|구현|수정)/i.test(value)) return 'implementer';
  return 'team-executor';
}

function aspectSubtasks(objective, workerCount) {
  const aspects = [
    ['Plan', 'architect', `Design the execution path and identify repo constraints for: ${objective}`],
    ['Implement', 'implementer', `Implement the smallest useful path for: ${objective}`],
    ['Verify', 'tester', `Find and run verification evidence for: ${objective}`],
    ['Critique', 'critic', `Challenge assumptions, local-optimum risk, and completion evidence for: ${objective}`],
    ['Research', 'researcher', `Inspect prior art, source context, or unknowns for: ${objective}`],
    ['Document', 'writer', `Document the resulting contract, usage, and residual risks for: ${objective}`],
    ['Replan', 'replanner', `Prepare a fallback trajectory if the main path stalls for: ${objective}`],
  ];
  return aspects.slice(0, workerCount).map(([subject, role, description], index) => ({
    id: String(index + 1),
    subject,
    description,
    role,
  }));
}

export function buildTeamExecutionPlan(objective, requestedWorkers = DEFAULT_WORKERS, explicitWorkers = false) {
  const normalizedObjective = normalizeObjective(objective);
  if (!normalizedObjective) throw new Error('Missing objective.');
  const workerCount = resolveWorkerCount(requestedWorkers);
  const fragments = splitObjective(normalizedObjective);
  let tasks = fragments.map((fragment, index) => ({
    id: String(index + 1),
    subject: fragment.split(/\s+/).slice(0, 8).join(' '),
    description: fragment,
    role: roleFor(fragment),
  }));

  if (explicitWorkers && tasks.length <= 1 && workerCount > 1) {
    tasks = aspectSubtasks(normalizedObjective, workerCount);
  }
  if (explicitWorkers && tasks.length < workerCount) {
    const existingRoles = new Set(tasks.map((task) => task.role));
    for (const role of ROLE_ORDER) {
      if (tasks.length >= workerCount) break;
      if (existingRoles.has(role)) continue;
      tasks.push({
        id: String(tasks.length + 1),
        subject: `${role} support`,
        description: `Provide ${role} evidence for: ${normalizedObjective}`,
        role,
      });
      existingRoles.add(role);
    }
  }

  const effectiveWorkerCount = explicitWorkers ? workerCount : Math.min(workerCount, Math.max(1, tasks.length));
  const assignedTasks = tasks.map((task, index) => ({
    ...task,
    owner: `worker-${(index % effectiveWorkerCount) + 1}`,
    status: 'pending',
    created_at: new Date().toISOString(),
  }));

  return {
    objective: normalizedObjective,
    worker_count: effectiveWorkerCount,
    tasks: assignedTasks,
  };
}

export function teamRuntimeRoot(cwd, teamName) {
  return join(cwd, '.omg', 'runtime', 'team', teamName);
}

export function teamStateRoot(cwd) {
  return join(cwd, '.omg', 'runtime');
}

export function relativePath(cwd, path) {
  return relative(cwd, path).replace(/\\/g, '/');
}

export async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf-8');
  await rename(tmp, path);
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf-8'));
}

export async function appendEvent(root, event) {
  await mkdir(root, { recursive: true });
  const path = join(root, 'events.ndjson');
  const existing = existsSync(path) ? await readFile(path, 'utf-8') : '';
  await writeFile(path, `${existing}${JSON.stringify({ event_id: `event-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, created_at: new Date().toISOString(), ...event })}\n`, 'utf-8');
}

export function workerBuckets(plan) {
  const buckets = new Map();
  for (let index = 1; index <= plan.worker_count; index += 1) {
    buckets.set(`worker-${index}`, []);
  }
  for (const task of plan.tasks) {
    if (!buckets.has(task.owner)) buckets.set(task.owner, []);
    buckets.get(task.owner).push(task);
  }
  return buckets;
}

export function workerRole(tasks, index) {
  const firstRole = tasks[0]?.role;
  if (firstRole) return firstRole;
  return ROLE_ORDER[(index - 1) % ROLE_ORDER.length] || 'team-executor';
}

function renderWorkerPacket({ teamName, objective, workerName, role, tasks, resultPath, cwd, stateRoot }) {
  const taskLines = tasks.length > 0
    ? tasks.map((task) => `- Task ${task.id} (${task.role}): ${task.description}`)
    : [`- Provide ${role} evidence for: ${objective}`];
  const relResult = relativePath(cwd, resultPath);
  const relStateRoot = relativePath(cwd, stateRoot);
  return [
    '# Oh My Goal Worker Packet',
    '',
    `Team: ${teamName}`,
    `Worker: ${workerName}`,
    `Role: ${role}`,
    `Objective: ${objective}`,
    `Team state root: ${relStateRoot}`,
    '',
    'Assigned tasks:',
    ...taskLines,
    '',
    'Context files:',
    '- `.omg/harness/<slug>/context-index.md` when present',
    '- `.omg/harness/<slug>/goal-prompt.md` when present',
    '- `.omg/harness/<slug>/completion-gate.md` when present',
    '',
    'OMX-derived lifecycle contract:',
    '- Read task files at `.omg/runtime/team/<team>/tasks/task-<id>.json`.',
    '- Write worker status to `.omg/runtime/team/<team>/workers/<worker>/status.json`.',
    '- Treat `name`, `index`, `role`, `assigned_tasks`, `pane_id`, and `working_dir` as worker identity fields.',
    '',
    'Boundary:',
    '- Do not call `create_goal`.',
    '- Do not call `update_goal`.',
    '- Do not mark the whole mission complete.',
    '- Return evidence only.',
    '',
    'Write your final evidence to:',
    `- \`${relResult}\``,
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
  ].join('\n');
}

function renderWorkerPrompt(packet) {
  return [
    'You are an Oh My Goal worker lane running under a leader-owned Codex goal.',
    'Read the packet below, complete only your bounded lane, and write the required evidence file before your final response.',
    'Never call create_goal or update_goal.',
    '',
    packet,
  ].join('\n');
}

function createTaskRecord(task) {
  return {
    id: task.id,
    subject: task.subject,
    description: task.description,
    status: 'pending',
    role: task.role,
    owner: task.owner,
    created_at: task.created_at ?? new Date().toISOString(),
    version: 1,
  };
}

function buildPolicy(mode) {
  return {
    display_mode: 'auto',
    worker_launch_mode: mode === 'dry-run' ? 'prompt' : 'interactive',
    dispatch_mode: 'transport_direct',
    dispatch_ack_timeout_ms: 30000,
  };
}

function buildGovernance() {
  return {
    delegation_only: true,
    plan_approval_required: false,
    nested_teams_allowed: false,
    one_team_per_leader_session: true,
    cleanup_requires_all_workers_inactive: false,
  };
}

function buildPermissionsSnapshot() {
  return {
    approval_mode: 'leader-owned',
    sandbox_mode: 'codex-session',
    network_access: true,
  };
}

export async function materializeTeamState({ cwd, teamName, objective, plan, mode, agent }) {
  const root = teamRuntimeRoot(cwd, teamName);
  const stateRoot = teamStateRoot(cwd);
  const createdAt = new Date().toISOString();
  await mkdir(root, { recursive: true });
  const buckets = workerBuckets(plan);
  const workers = [];
  let index = 0;

  for (const [workerName, tasks] of buckets.entries()) {
    index += 1;
    const workerDir = join(root, 'workers', workerName);
    const resultPath = join(workerDir, 'result.md');
    const role = workerRole(tasks, index);
    const packet = renderWorkerPacket({ teamName, objective, workerName, role, tasks, resultPath, cwd, stateRoot });
    const prompt = renderWorkerPrompt(packet);
    await mkdir(workerDir, { recursive: true });
    await writeFile(join(workerDir, 'inbox.md'), packet, 'utf-8');
    await writeFile(join(workerDir, 'prompt.md'), prompt, 'utf-8');

    const worker = {
      name: workerName,
      worker_id: workerName,
      index,
      role,
      worker_cli: agent === 'shell' ? undefined : agent,
      assigned_tasks: tasks.map((task) => task.id),
      tasks,
      pane_id: null,
      working_dir: cwd,
      team_state_root: stateRoot,
      inbox: relativePath(cwd, join(workerDir, 'inbox.md')),
      prompt: relativePath(cwd, join(workerDir, 'prompt.md')),
      result: relativePath(cwd, resultPath),
      worker_dir: relativePath(cwd, workerDir),
    };

    await writeJsonAtomic(join(workerDir, 'identity.json'), {
      name: worker.name,
      index: worker.index,
      role: worker.role,
      worker_cli: worker.worker_cli,
      assigned_tasks: worker.assigned_tasks,
      working_dir: worker.working_dir,
      team_state_root: worker.team_state_root,
    });
    await writeJsonAtomic(join(workerDir, 'status.json'), {
      state: 'idle',
      status: 'planned',
      current_task_id: worker.assigned_tasks[0],
      updated_at: new Date().toISOString(),
    });
    workers.push(worker);
  }

  await mkdir(join(root, 'tasks'), { recursive: true });
  for (const task of plan.tasks) {
    await writeJsonAtomic(join(root, 'tasks', `task-${task.id}.json`), createTaskRecord(task));
  }

  const policy = buildPolicy(mode);
  const governance = buildGovernance();
  const config = {
    kind: 'omg.team-runtime/v1',
    schema_source: 'omx.team/state/v2',
    name: teamName,
    team: teamName,
    task: objective,
    objective,
    cwd,
    mode,
    agent,
    agent_type: agent,
    worker_launch_mode: policy.worker_launch_mode,
    lifecycle_profile: 'default',
    status: 'planned',
    worker_count: plan.worker_count,
    max_workers: MAX_WORKERS,
    workers,
    tasks: plan.tasks,
    next_task_id: plan.tasks.length + 1,
    created_at: createdAt,
    updated_at: createdAt,
    tmux_session: `omg-team-${teamName}`,
    leader_cwd: cwd,
    team_state_root: stateRoot,
    leader_pane_id: null,
    hud_pane_id: null,
    resize_hook_name: null,
    resize_hook_target: null,
    policy,
    governance,
  };
  await writeJsonAtomic(join(root, 'config.json'), config);
  await writeJsonAtomic(join(root, 'manifest.json'), {
    schema_version: 2,
    name: teamName,
    task: objective,
    leader: {
      session_id: 'plugin-local',
      worker_id: 'leader-fixed',
      role: 'leader',
    },
    policy,
    governance,
    lifecycle_profile: 'default',
    permissions_snapshot: buildPermissionsSnapshot(),
    tmux_session: config.tmux_session,
    worker_count: plan.worker_count,
    workers,
    next_task_id: config.next_task_id,
    created_at: createdAt,
    leader_cwd: cwd,
    team_state_root: stateRoot,
    leader_pane_id: null,
    hud_pane_id: null,
    resize_hook_name: null,
    resize_hook_target: null,
    plugin_compat: {
      runtime: 'oh-my-goal',
      state_root: relativePath(cwd, root),
      result_collection: 'worker result.md files',
    },
  });
  await appendEvent(root, { team: teamName, type: 'team_started', worker: 'leader-fixed', worker_count: plan.worker_count });
  return { root, config };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function buildWorkerCommand({ cwd, agent, worker, teamName }) {
  const promptPath = join(cwd, worker.prompt);
  const workerDir = join(cwd, worker.worker_dir);
  const resultPath = join(cwd, worker.result);
  const agentCommand = safeString(agent).trim() || 'codex';
  const title = `OMG ${worker.name ?? worker.worker_id} ${worker.role}`;
  const promptArg = `"$(cat ${shellQuote(promptPath)})"`;
  const workerName = worker.name ?? worker.worker_id;
  const startupEnv = [
    `OMG_TEAM_NAME=${shellQuote(teamName)}`,
    `OMG_TEAM_WORKER=${shellQuote(workerName)}`,
    `OMG_TEAM_WORKER_DIR=${shellQuote(workerDir)}`,
    `OMG_TEAM_RESULT_PATH=${shellQuote(resultPath)}`,
    `OMX_TEAM_WORKER=${shellQuote(`${teamName}/${workerName}`)}`,
    `OMX_TEAM_INTERNAL_WORKER=${shellQuote(`${teamName}/${workerName}`)}`,
    `OMX_TEAM_STATE_ROOT=${shellQuote(teamStateRoot(cwd))}`,
  ];
  const banner = `printf '\\\\033]0;%s\\\\007Oh My Goal %s (%s)\\nPacket: %s\\nResult: %s\\n\\n' ${shellQuote(title)} ${shellQuote(workerName)} ${shellQuote(worker.role)} ${shellQuote(promptPath)} ${shellQuote(resultPath)}`;
  const runAgent = agentCommand === 'shell'
    ? `printf 'Oh My Goal worker ready. Read %s and write %s\\n' ${shellQuote(promptPath)} ${shellQuote(resultPath)}; exec \${SHELL:-sh}`
    : `if command -v ${shellQuote(agentCommand)} >/dev/null 2>&1; then ${shellQuote(agentCommand)} ${promptArg}; else printf 'Agent ${agentCommand} not found. Read %s and write %s\\n' ${shellQuote(promptPath)} ${shellQuote(resultPath)}; exec \${SHELL:-sh}; fi`;
  return [
    `cd ${shellQuote(cwd)}`,
    `export ${startupEnv.join(' ')}`,
    banner,
    runAgent,
  ].join(' && ');
}

export async function updateWorkerStatus(cwd, worker, patch) {
  const statusPath = join(cwd, worker.worker_dir, 'status.json');
  const current = existsSync(statusPath) ? await readJson(statusPath) : {};
  await writeJsonAtomic(statusPath, {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  });
}
