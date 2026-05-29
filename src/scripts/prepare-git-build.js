#!/usr/bin/env node
import { existsSync } from 'node:fs';
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
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(tscBin)) {
  runNpm(['install', '--ignore-scripts', '--include=dev', '--no-audit', '--no-fund']);
}

runNpm(['run', 'build']);
