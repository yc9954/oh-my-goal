import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_MS = 50;

export function safeString(value) {
  return typeof value === 'string' ? value : '';
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function sleepSync(ms) {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, ms);
}

export function cmuxBridgeRoot(cwd = process.cwd(), env = process.env) {
  const configured = safeString(env.OMG_CMUX_BRIDGE_ROOT).trim();
  return resolve(configured || join(cwd, '.omg', 'runtime', 'cmux-bridge'));
}

export function cmuxBridgeStartCommand(cwd = process.cwd(), env = process.env) {
  const scriptPath = join(dirname(fileURLToPath(import.meta.url)), 'cmux-bridge-runtime.mjs');
  const root = cmuxBridgeRoot(cwd, env);
  return `node ${shellQuote(scriptPath)} start --cwd ${shellQuote(cwd)} --root ${shellQuote(root)}`;
}

export function isCmuxSocketPermissionFailure(value) {
  const message = [
    value?.reason,
    value?.error?.message,
    value?.message,
    value?.stderr,
    value?.stdout,
  ].map(safeString).filter(Boolean).join('\n').toLowerCase();
  return /\boperation not permitted\b|\berrno\s*1\b|\beperm\b|permission denied/.test(message);
}

export function isCmuxFileBridgeFailure(value) {
  return /^cmux_bridge_/.test(safeString(value?.reason));
}

export function cmuxBridgeIsUsable(root) {
  return existsSync(join(root, 'status.json'));
}

function nextRequestId() {
  return `request-${Date.now()}-${randomBytes(4).toString('hex')}`;
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
  renameSync(tmp, path);
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

export function requestCmuxViaBridge(args, options = {}) {
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const root = cmuxBridgeRoot(cwd, env);
  if (safeString(env.OMG_DISABLE_CMUX_FILE_BRIDGE).trim() === '1') {
    return {
      status: 1,
      signal: null,
      stdout: '',
      stderr: 'Oh My Goal cmux file bridge is disabled by OMG_DISABLE_CMUX_FILE_BRIDGE=1.',
      reason: 'cmux_bridge_disabled',
    };
  }
  if (!cmuxBridgeIsUsable(root)) {
    return {
      status: 1,
      signal: null,
      stdout: '',
      stderr: `Oh My Goal cmux bridge is not running. Start it outside Codex sandbox: ${cmuxBridgeStartCommand(cwd, env)}`,
      reason: 'cmux_bridge_unavailable',
    };
  }

  const id = nextRequestId();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const pollMs = Number.isFinite(options.pollMs) ? Number(options.pollMs) : DEFAULT_POLL_MS;
  const requestPath = join(root, 'requests', `${id}.json`);
  const resultPath = join(root, 'results', `${id}.json`);
  writeJsonAtomic(requestPath, {
    kind: 'oh-my-goal.cmux-bridge/request',
    version: 1,
    id,
    cwd,
    args,
    timeout_ms: timeoutMs,
    created_at: new Date().toISOString(),
  });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const result = readJsonIfExists(resultPath);
    if (result?.id === id) {
      rmSync(resultPath, { force: true });
      return {
        status: typeof result.status === 'number' ? result.status : 1,
        signal: result.signal || null,
        stdout: safeString(result.stdout),
        stderr: safeString(result.stderr),
        error: result.error ? new Error(safeString(result.error)) : undefined,
        reason: result.reason || undefined,
        via_bridge: true,
        bridge_root: root,
      };
    }
    sleepSync(pollMs);
  }

  rmSync(requestPath, { force: true });
  return {
    status: 1,
    signal: null,
    stdout: '',
    stderr: `Oh My Goal cmux bridge timed out after ${timeoutMs}ms. Check bridge status or restart it: ${cmuxBridgeStartCommand(cwd, env)}`,
    reason: 'cmux_bridge_timeout',
  };
}
