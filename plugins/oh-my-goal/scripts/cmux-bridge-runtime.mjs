#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cmuxBridgeRoot, safeString } from './cmux-bridge-client.mjs';

const REQUEST_KIND = 'oh-my-goal.cmux-bridge/request';
const DEFAULT_POLL_MS = 100;
const DEFAULT_TIMEOUT_MS = 10_000;

function parseArgs(argv) {
  const parsed = { command: argv[0] || 'help', cwd: process.cwd(), json: false, pollMs: DEFAULT_POLL_MS };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--cwd') {
      parsed.cwd = argv[++index];
      continue;
    }
    if (arg === '--root') {
      parsed.root = argv[++index];
      continue;
    }
    if (arg === '--poll-ms') {
      parsed.pollMs = Number.parseInt(argv[++index] || '', 10);
      continue;
    }
  }
  return parsed;
}

function cmuxBin() {
  return safeString(process.env.CMUX_BUNDLED_CLI_PATH).trim() || 'cmux';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
  renameSync(tmp, path);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function rootDirs(root) {
  return {
    requests: join(root, 'requests'),
    processing: join(root, 'processing'),
    results: join(root, 'results'),
    stop: join(root, 'stop'),
    status: join(root, 'status.json'),
    events: join(root, 'events.jsonl'),
  };
}

function ensureRoot(root) {
  const dirs = rootDirs(root);
  mkdirSync(dirs.requests, { recursive: true });
  mkdirSync(dirs.processing, { recursive: true });
  mkdirSync(dirs.results, { recursive: true });
}

function appendEvent(root, event) {
  const line = `${JSON.stringify({ ...event, at: new Date().toISOString(), pid: process.pid })}\n`;
  writeFileSync(rootDirs(root).events, line, { encoding: 'utf-8', flag: 'a' });
}

function writeStatus(root, status) {
  writeJsonAtomic(rootDirs(root).status, {
    kind: 'oh-my-goal.cmux-bridge/status',
    version: 1,
    pid: process.pid,
    root,
    cmux_socket: safeString(process.env.CMUX_SOCKET).trim(),
    cmux_workspace: safeString(process.env.CMUX_WORKSPACE_ID).trim(),
    updated_at: new Date().toISOString(),
    ...status,
  });
}

function executeRequest(root, requestPath, cwd) {
  const dirs = rootDirs(root);
  const processingPath = join(dirs.processing, basename(requestPath));
  try {
    renameSync(requestPath, processingPath);
  } catch {
    return false;
  }

  let request;
  try {
    request = readJson(processingPath);
  } catch (error) {
    const id = basename(processingPath).replace(/\.json$/, '') || `invalid-${Date.now()}`;
    writeJsonAtomic(join(dirs.results, `${id}.json`), {
      id,
      status: 1,
      signal: null,
      stdout: '',
      stderr: `invalid cmux bridge request: ${error instanceof Error ? error.message : String(error)}`,
      reason: 'cmux_bridge_invalid_request',
      completed_at: new Date().toISOString(),
    });
    rmSync(processingPath, { force: true });
    return true;
  }

  const id = safeString(request.id).trim() || basename(processingPath).replace(/\.json$/, '') || `request-${Date.now()}`;
  if (safeString(request.kind).trim() && safeString(request.kind).trim() !== REQUEST_KIND) {
    writeJsonAtomic(join(dirs.results, `${id}.json`), {
      id,
      status: 1,
      signal: null,
      stdout: '',
      stderr: `unsupported cmux bridge request kind: ${safeString(request.kind)}`,
      reason: 'cmux_bridge_invalid_request',
      completed_at: new Date().toISOString(),
    });
    rmSync(processingPath, { force: true });
    return true;
  }
  const args = Array.isArray(request.args) ? request.args.map((arg) => String(arg)) : [];
  if (args.length === 0) {
    writeJsonAtomic(join(dirs.results, `${id}.json`), {
      id,
      status: 1,
      signal: null,
      stdout: '',
      stderr: 'cmux bridge request has no args.',
      reason: 'cmux_bridge_invalid_request',
      completed_at: new Date().toISOString(),
    });
    rmSync(processingPath, { force: true });
    return true;
  }

  const result = spawnSync(cmuxBin(), args, {
    cwd: safeString(request.cwd).trim() || cwd,
    env: { ...process.env, OMG_CMUX_BRIDGE_WORKER: '1' },
    encoding: 'utf-8',
    timeout: Number.isFinite(request.timeout_ms) ? Number(request.timeout_ms) : DEFAULT_TIMEOUT_MS,
  });
  writeJsonAtomic(join(dirs.results, `${id}.json`), {
    id,
    status: typeof result.status === 'number' ? result.status : 1,
    signal: result.signal || null,
    stdout: safeString(result.stdout),
    stderr: safeString(result.stderr),
    error: result.error?.message,
    bridge_pid: process.pid,
    completed_at: new Date().toISOString(),
  });
  appendEvent(root, { event: 'request-completed', id, args: args.slice(0, 2), status: result.status });
  rmSync(processingPath, { force: true });
  return true;
}

function processPending(root, cwd) {
  ensureRoot(root);
  const dirs = rootDirs(root);
  const files = readdirSync(dirs.requests).filter((file) => file.endsWith('.json')).sort();
  let processed = 0;
  for (const file of files) {
    if (executeRequest(root, join(dirs.requests, file), cwd)) processed += 1;
  }
  return processed;
}

function render(payload, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  if (payload.ok) {
    process.stdout.write(`oh-my-goal cmux bridge: ${payload.status || 'ok'}\nroot: ${payload.root}\n`);
  } else {
    process.stderr.write(`oh-my-goal cmux bridge: ${payload.reason || 'failed'}\n${payload.message || ''}\n`);
  }
}

async function commandStart(args) {
  const root = resolve(args.root || cmuxBridgeRoot(args.cwd));
  ensureRoot(root);
  rmSync(rootDirs(root).stop, { force: true });
  writeStatus(root, { status: 'running', cwd: args.cwd, started_at: new Date().toISOString() });
  appendEvent(root, { event: 'bridge-started', cwd: args.cwd });
  render({ ok: true, command: 'start', status: 'running', root, pid: process.pid }, args.json);

  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  while (!stopping && !existsSync(rootDirs(root).stop)) {
    const processed = processPending(root, args.cwd);
    if (processed > 0) writeStatus(root, { status: 'running', cwd: args.cwd, last_processed_at: new Date().toISOString() });
    await sleep(Number.isFinite(args.pollMs) && args.pollMs > 0 ? args.pollMs : DEFAULT_POLL_MS);
  }
  writeStatus(root, { status: 'stopped', cwd: args.cwd, stopped_at: new Date().toISOString() });
  appendEvent(root, { event: 'bridge-stopped', cwd: args.cwd });
}

function commandOnce(args) {
  const root = resolve(args.root || cmuxBridgeRoot(args.cwd));
  const processed = processPending(root, args.cwd);
  render({ ok: true, command: 'once', root, processed }, args.json);
}

function commandStatus(args) {
  const root = resolve(args.root || cmuxBridgeRoot(args.cwd));
  const statusPath = rootDirs(root).status;
  if (!existsSync(statusPath)) {
    render({ ok: false, command: 'status', root, reason: 'not_running', message: 'cmux bridge status file was not found.' }, args.json);
    return;
  }
  render({ ok: true, command: 'status', root, status: readJson(statusPath) }, args.json);
}

function commandStop(args) {
  const root = resolve(args.root || cmuxBridgeRoot(args.cwd));
  ensureRoot(root);
  writeFileSync(rootDirs(root).stop, `${new Date().toISOString()}\n`, 'utf-8');
  render({ ok: true, command: 'stop', root, status: 'stop_requested' }, args.json);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'start') return commandStart(args);
  if (args.command === 'once') return commandOnce(args);
  if (args.command === 'status') return commandStatus(args);
  if (args.command === 'stop') return commandStop(args);
  process.stdout.write(`oh-my-goal cmux bridge runtime

Usage:
  node scripts/cmux-bridge-runtime.mjs start [--cwd <project>] [--root <path>] [--poll-ms 100] [--json]
  node scripts/cmux-bridge-runtime.mjs once [--cwd <project>] [--root <path>] [--json]
  node scripts/cmux-bridge-runtime.mjs status [--cwd <project>] [--root <path>] [--json]
  node scripts/cmux-bridge-runtime.mjs stop [--cwd <project>] [--root <path>] [--json]

Run start from an unsandboxed cmux/terminal process. Sandboxed Codex plugin
runtimes write cmux requests into the root; this bridge executes cmux and writes
results back.
`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    await main();
  } catch (error) {
    console.error(`[oh-my-goal cmux-bridge-runtime] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
