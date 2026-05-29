#!/usr/bin/env node
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const tscBin = process.platform === 'win32'
  ? join(cwd, 'node_modules', '.bin', 'tsc.cmd')
  : join(cwd, 'node_modules', '.bin', 'tsc');

function npmArgs(args) {
  const npmExecPath = process.env.npm_execpath;
  return npmExecPath
    ? { command: process.execPath, args: [npmExecPath, ...args] }
    : { command: 'npm', args };
}

function runNpm(args) {
  const cmd = npmArgs(args);
  const result = spawnSync(cmd.command, cmd.args, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_global: 'false',
      npm_config_prefix: cwd,
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

let installedDependencies = false;
if (!existsSync(tscBin)) {
  runNpm(['install', '--ignore-scripts', '--include=dev', '--no-audit', '--no-fund', '--global=false', '--prefix', cwd]);
  installedDependencies = true;
}

runNpm(['run', 'build']);

if (installedDependencies && process.env.OMG_KEEP_PREPARE_NODE_MODULES !== '1') {
  rmSync(join(cwd, 'node_modules'), { recursive: true, force: true });
}
