#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_ENV_FILE = '.env.local';
const DEFAULT_KEYS = ['OPENAI_API_KEY', 'ZEP_API_KEY'];
const OPTIONAL_KEY_DESCRIPTIONS = {
  OPENAI_API_KEY: 'local LLM question generation outside the Codex model',
  ZEP_API_KEY: 'Zep memory/social graph sync for agent simulations',
};

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'ensure';
  const parsed = {
    command,
    cwd: process.cwd(),
    envFile: DEFAULT_ENV_FILE,
    json: false,
    execute: false,
    force: false,
    keys: DEFAULT_KEYS,
  };
  const start = command === 'ensure' && argv[0]?.startsWith('--') ? 0 : 1;
  for (let index = start; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--execute') {
      parsed.execute = true;
      continue;
    }
    if (arg === '--force') {
      parsed.force = true;
      continue;
    }
    if (arg === '--cwd') {
      parsed.cwd = argv[++index];
      continue;
    }
    if (arg === '--env-file') {
      parsed.envFile = argv[++index];
      continue;
    }
    if (arg === '--keys') {
      parsed.keys = parseKeys(argv[++index]);
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function printHelp() {
  console.log(`oh-my-goal openai-key-runtime

Usage:
  node scripts/openai-key-runtime.mjs offer [--cwd <dir>] [--env-file .env.local] [--keys OPENAI_API_KEY,ZEP_API_KEY] [--execute] [--force] [--json]
  node scripts/openai-key-runtime.mjs ensure [--cwd <dir>] [--env-file .env.local] [--keys OPENAI_API_KEY,ZEP_API_KEY] [--execute] [--force] [--json]
  node scripts/openai-key-runtime.mjs status [--cwd <dir>] [--env-file .env.local] [--keys OPENAI_API_KEY,ZEP_API_KEY] [--json]

Behavior:
  status checks process.env or the local env file.
  offer asks whether to enable optional local capabilities; --execute prompts in
  an attached terminal and writes accepted keys only to the local env file.
  ensure is the strict form for workflows that truly require keys.
  Key values are never printed, logged, or written to harness Markdown.
`);
}

function parseKeys(value) {
  const keys = safeString(value)
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  if (keys.length === 0) throw new Error('--keys must include at least one env var name');
  for (const key of keys) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) throw new Error(`invalid env var name in --keys: ${key}`);
  }
  return [...new Set(keys)];
}

function isLikelySecret(name, value) {
  const trimmed = safeString(value).trim();
  if (name === 'OPENAI_API_KEY') return /^sk-[A-Za-z0-9_-]{20,}$/.test(trimmed);
  return trimmed.length >= 8 && !/\s/.test(trimmed);
}

async function readText(path) {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return '';
  }
}

function parseEnvNamesAndValues(text) {
  const values = new Map();
  for (const line of safeString(text).split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const raw = match[2].trim().replace(/^['"]|['"]$/g, '');
    values.set(match[1], raw);
  }
  return values;
}

async function inspectKeys(cwd, envFile, keys) {
  const envPath = resolve(cwd, envFile);
  const envText = await readText(envPath);
  const envValues = parseEnvNamesAndValues(envText);
  const items = keys.map((name) => {
    const processValue = safeString(process.env[name]).trim();
    if (isLikelySecret(name, processValue)) {
      return { name, configured: true, source: 'process.env' };
    }
    const fileValue = safeString(envValues.get(name)).trim();
    if (isLikelySecret(name, fileValue)) {
      return { name, configured: true, source: envFile };
    }
    return { name, configured: false, source: null };
  });
  return {
    configured: items.every((item) => item.configured),
    missing: items.filter((item) => !item.configured).map((item) => item.name),
    keys: items,
    env_file: envFile,
    env_path: envPath,
  };
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf-8');
  await rename(tmp, path);
}

async function writeStatus(cwd, payload) {
  const statusPath = join(cwd, '.omg', 'runtime', 'secrets', 'openai-key-status.json');
  await writeJsonAtomic(statusPath, {
    kind: 'oh-my-goal.secret-preflight-status/v1',
    updated_at: new Date().toISOString(),
    ...payload,
    // Do not persist secret values in runtime state.
    secret_values: undefined,
  });
  return statusPath;
}

function isAttachedTerminal() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && typeof process.stdin.setRawMode === 'function');
}

function promptHidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!isAttachedTerminal()) {
      reject(new Error('secure API key prompt requires an attached terminal'));
      return;
    }
    let value = '';
    const stdin = process.stdin;
    const stdout = process.stdout;
    const onData = (chunk) => {
      const text = chunk.toString('utf-8');
      for (const char of text) {
        const code = char.charCodeAt(0);
        if (code === 3) {
          cleanup();
          stdout.write('\n');
          reject(new Error('API key input aborted'));
          return;
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value.trim());
          return;
        }
        if (code === 127 || code === 8) {
          value = value.slice(0, -1);
          continue;
        }
        if (code >= 32) value += char;
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

function promptLine(prompt) {
  return new Promise((resolve, reject) => {
    if (!isAttachedTerminal()) {
      reject(new Error('interactive prompt requires an attached terminal'));
      return;
    }
    let value = '';
    const stdin = process.stdin;
    const stdout = process.stdout;
    const onData = (chunk) => {
      const text = chunk.toString('utf-8');
      for (const char of text) {
        const code = char.charCodeAt(0);
        if (code === 3) {
          cleanup();
          stdout.write('\n');
          reject(new Error('API key setup aborted'));
          return;
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value.trim());
          return;
        }
        if (code === 127 || code === 8) {
          value = value.slice(0, -1);
          stdout.write('\b \b');
          continue;
        }
        if (code >= 32) {
          value += char;
          stdout.write(char);
        }
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

function upsertEnvValue(text, name, value) {
  const lines = safeString(text).split(/\r?\n/);
  let replaced = false;
  const next = lines.map((line) => {
    if (new RegExp(`^\\s*${name}\\s*=`).test(line)) {
      replaced = true;
      return `${name}=${value}`;
    }
    return line;
  });
  if (!replaced) {
    if (next.length > 0 && next[next.length - 1] !== '') next.push('');
    next.push(`${name}=${value}`);
  }
  return next.join('\n').replace(/\n{3,}$/g, '\n\n');
}

async function writeEnvKeys(cwd, envFile, values) {
  const envPath = resolve(cwd, envFile);
  let next = await readText(envPath);
  for (const [name, value] of values) {
    next = upsertEnvValue(next, name, value);
  }
  await mkdir(dirname(envPath), { recursive: true });
  await writeFile(envPath, next.endsWith('\n') ? next : `${next}\n`, 'utf-8');
  await chmod(envPath, 0o600);
  return envPath;
}

async function ensureGitignore(cwd, envFile) {
  const gitignorePath = join(cwd, '.gitignore');
  const existing = await readText(gitignorePath);
  const entries = new Set(existing.split(/\r?\n/).map((line) => line.trim()));
  const additions = [];
  for (const entry of [envFile, '.env*.local']) {
    if (!entries.has(entry)) additions.push(entry);
  }
  if (additions.length === 0) return false;
  const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
  await writeFile(gitignorePath, `${existing}${prefix}${additions.join('\n')}\n`, 'utf-8');
  return true;
}

async function commandStatus(args) {
  const cwd = resolve(args.cwd || process.cwd());
  const inspected = await inspectKeys(cwd, args.envFile, args.keys);
  const statusPath = await writeStatus(cwd, {
    status: inspected.configured ? 'configured' : 'missing',
    configured: inspected.configured,
    keys: inspected.keys,
    missing: inspected.missing,
    env_file: args.envFile,
  });
  return {
    ok: inspected.configured,
    command: 'status',
    status: inspected.configured ? 'configured' : 'missing',
    configured: inspected.configured,
    keys: inspected.keys,
    missing: inspected.missing,
    env_file: args.envFile,
    status_path: statusPath,
  };
}

async function commandOffer(args) {
  const cwd = resolve(args.cwd || process.cwd());
  const inspected = await inspectKeys(cwd, args.envFile, args.keys);
  if (inspected.configured && !args.force) {
    const statusPath = await writeStatus(cwd, {
      status: 'configured',
      optional: true,
      configured: true,
      keys: inspected.keys,
      missing: [],
      env_file: args.envFile,
    });
    return {
      ok: true,
      command: 'offer',
      status: 'configured',
      optional: true,
      configured: true,
      keys: inspected.keys,
      missing: [],
      env_file: args.envFile,
      status_path: statusPath,
      message: 'Optional local API capabilities are configured; values were not printed.',
    };
  }

  if (!args.execute) {
    const statusPath = await writeStatus(cwd, {
      status: 'optional_setup_available',
      optional: true,
      configured: false,
      keys: inspected.keys,
      missing: inspected.missing,
      env_file: args.envFile,
    });
    return {
      ok: false,
      command: 'offer',
      status: 'optional_setup_available',
      optional: true,
      configured: false,
      keys: inspected.keys,
      missing: inspected.missing,
      env_file: args.envFile,
      status_path: statusPath,
      prompt: `Optional local capabilities are available for ${inspected.missing.join(', ')}. To configure them safely, run in an attached terminal: node scripts/openai-key-runtime.mjs offer --cwd ${JSON.stringify(cwd)} --keys ${args.keys.join(',')} --execute --json`,
      safety: 'Missing keys do not block Codex-native intake. Do not paste API keys into chat; accepted keys are written only to the local env file.',
    };
  }

  const values = [];
  const skipped = [];
  for (const item of inspected.keys) {
    if (item.configured && !args.force) continue;
    const description = OPTIONAL_KEY_DESCRIPTIONS[item.name] || 'optional local capability';
    const answer = await promptLine(`Enable optional ${item.name} for ${description}? [y/N]: `);
    if (!/^y(?:es)?$/i.test(answer)) {
      skipped.push(item.name);
      continue;
    }
    const key = await promptHidden(`Enter ${item.name} (hidden input): `);
    if (!isLikelySecret(item.name, key)) {
      throw new Error(`${item.name} does not look like a valid API key.`);
    }
    values.push([item.name, key]);
  }

  const envPath = values.length > 0 ? await writeEnvKeys(cwd, args.envFile, values) : null;
  const gitignoreUpdated = values.length > 0 ? await ensureGitignore(cwd, args.envFile) : false;
  const refreshed = await inspectKeys(cwd, args.envFile, args.keys);
  const status =
    refreshed.configured ? 'configured' : values.length > 0 ? 'partially_configured' : 'skipped';
  const statusPath = await writeStatus(cwd, {
    status,
    optional: true,
    configured: refreshed.configured,
    keys: refreshed.keys,
    missing: refreshed.missing,
    skipped,
    env_file: args.envFile,
  });
  return {
    ok: true,
    command: 'offer',
    status,
    optional: true,
    configured: refreshed.configured,
    keys: refreshed.keys,
    missing: refreshed.missing,
    skipped,
    env_file: args.envFile,
    env_path: envPath,
    gitignore_updated: gitignoreUpdated,
    status_path: statusPath,
    message:
      values.length > 0
        ? 'Accepted optional keys were saved locally; values were not printed.'
        : 'Optional API key setup was skipped; Codex-native intake can continue.',
  };
}

async function commandEnsure(args) {
  const cwd = resolve(args.cwd || process.cwd());
  const inspected = await inspectKeys(cwd, args.envFile, args.keys);
  if (inspected.configured && !args.force) {
    const statusPath = await writeStatus(cwd, {
      status: 'configured',
      configured: true,
      keys: inspected.keys,
      missing: [],
      env_file: args.envFile,
    });
    return {
      ok: true,
      command: 'ensure',
      status: 'configured',
      configured: true,
      keys: inspected.keys,
      missing: [],
      env_file: args.envFile,
      status_path: statusPath,
      message: 'Required API keys are configured; values were not printed.',
    };
  }
  if (!args.execute) {
    const statusPath = await writeStatus(cwd, {
      status: 'prompt_required',
      configured: false,
      keys: inspected.keys,
      missing: inspected.missing,
      env_file: args.envFile,
    });
    return {
      ok: false,
      command: 'ensure',
      status: 'prompt_required',
      configured: false,
      keys: inspected.keys,
      missing: inspected.missing,
      env_file: args.envFile,
      status_path: statusPath,
      prompt: `Run this in an attached terminal before intake: node scripts/openai-key-runtime.mjs ensure --cwd ${JSON.stringify(cwd)} --keys ${args.keys.join(',')} --execute --json`,
      safety: 'Do not paste API keys into Codex chat. The secure prompt writes only to the local env file.',
    };
  }
  const values = [];
  for (const name of inspected.missing) {
    const key = await promptHidden(`Enter ${name} (hidden input): `);
    if (!isLikelySecret(name, key)) {
      throw new Error(`${name} does not look like a valid API key.`);
    }
    values.push([name, key]);
  }
  const envPath = await writeEnvKeys(cwd, args.envFile, values);
  const gitignoreUpdated = await ensureGitignore(cwd, args.envFile);
  const refreshed = await inspectKeys(cwd, args.envFile, args.keys);
  const statusPath = await writeStatus(cwd, {
    status: 'configured',
    configured: refreshed.configured,
    keys: refreshed.keys,
    missing: refreshed.missing,
    env_file: args.envFile,
  });
  return {
    ok: refreshed.configured,
    command: 'ensure',
    status: refreshed.configured ? 'configured' : 'missing',
    configured: refreshed.configured,
    keys: refreshed.keys,
    missing: refreshed.missing,
    env_file: args.envFile,
    env_path: envPath,
    gitignore_updated: gitignoreUpdated,
    status_path: statusPath,
    message: 'Required API keys saved locally; values were not printed.',
  };
}

function printPayload(payload, json) {
  if (json) console.log(JSON.stringify(payload, null, 2));
  else if (payload.prompt) console.log(payload.prompt);
  else console.log(`${payload.status}: ${payload.message || payload.safety || ''}`.trim());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  let payload;
  if (args.command === 'status') payload = await commandStatus(args);
  else if (args.command === 'offer') payload = await commandOffer(args);
  else if (args.command === 'ensure') payload = await commandEnsure(args);
  else throw new Error(`Unknown command: ${args.command}`);
  printPayload(payload, args.json);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    await main();
  } catch (error) {
    console.error(`[oh-my-goal openai-key-runtime] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
