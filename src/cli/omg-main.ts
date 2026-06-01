import { readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GoalWorkflowRun } from '../goal-workflows/artifacts.js';
import { GOAL_HARNESS_WORKFLOW, startGoalHarnessRun } from '../goal-harness/artifacts.js';
import { GOAL_HARNESS_HELP, goalHarnessCommand } from './goal-harness.js';

export const OMG_HELP = `omg - Oh My Goal, a Codex goal-native autonomy harness

Usage:
  omg help
  omg refine [--objective <text> | --objective-file <path>] [--json]
  omg interview [--slug <slug> | --objective <text> | --objective-file <path>] [--json]
  omg plan [--slug <slug> | --objective <text> | --objective-file <path>] [--json]
  omg create [--objective <text> | --objective-file <path>] [--slug <slug>] [--force] [--json]
  omg start "<objective>"
  omg start [--slug <slug>] [--objective <text> | --objective-file <path>] [--force] [--json]
  omg status --slug <slug> [--json]
  omg sync-goal --slug <slug> --codex-goal-json <json-or-path> [--evidence <text>] [--json]
  omg summary --slug <slug> [--json]
  omg next --slug <slug> [--json]
  omg record-trajectory --slug <slug> --summary <text> --evidence <text> [--source <leader|worker>] [--role <role>] [--score <0-100>] [--novelty-score <0-100>] [--status <candidate|accepted|rejected|blocked>] [--id <id>] [--json]
  omg select --slug <slug> --trajectory-id <id> --evidence <text> [--json]
  omg step --slug <slug> --outcome <progress|blocked|ready-for-late-gate|needs-team-pressure> --evidence <text> [--action <text>] [--next-action <text>] [--json]
  omg perturb --slug <slug> [--blocker <text>] [--json]
  omg team-plan --slug <slug> [--task <text>] [--json]
  omg team-packet --slug <slug> [--plan-id <id>] [--json]
  omg import-worker-result --slug <slug> --result <path> [--id <id>] [--status <candidate|accepted|rejected|blocked>] [--json]
  omg challenge [--objective <text>] [--phase <early|middle|late|stuck>] [--json]
  omg worker-instruction --role <researcher|architect|designer|implementer|tester|deployer|critic|replanner> --task <text> [--context <text>] [--json]
  omg gate [--slug <slug>] --evidence-json <json-or-path> [--json]
  omg complete --slug <slug> --codex-goal-json <json-or-path> [--evidence <text>] [--json]
  omg version

npx:
  npx oh-my-goal --help
  npx -p oh-my-goal omg refine --objective "Ship this safely"

Recommended plugin-first flow:
  codex --version
  codex plugin marketplace add yc9954/oh-my-goal --ref main
  codex plugin add oh-my-goal@oh-my-goal-local
  codex
  $oh-my-goal Build the thing I actually want

Boundary:
  OMG keeps one Codex goal as the top-level objective. Workers never call
  create_goal or update_goal; they return evidence to the leader.

Launcher compatibility:
  This package does not install or launch a separate runtime. Use Codex with the
  $oh-my-goal skill, or use omg start/create/refine to generate goal handoffs.
`;

function packageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = join(here, '..', '..', 'package.json');
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: string };
  return pkg.version ?? 'unknown';
}

function translateHelp(command: string): string {
  return command === 'help' || command === '--help' || command === '-h'
    ? 'help'
    : command;
}

function displayOmgText(text: string): string {
  return text;
}

export function shouldHandleOmgCompatibilityInvocation(args: readonly string[]): boolean {
  const command = translateHelp(args[0] ?? 'help');
  if (command === 'help' || command === 'version' || command === '--version' || command === '-v') return false;
  if (command === 'setup' || command === 'doctor' || command === 'launch') return true;
  if (command.startsWith('-')) return true;
  return false;
}

const CODEX_VALUE_FLAGS = new Set([
  '-c',
  '--config',
  '-m',
  '--model',
  '--model-provider',
  '--profile',
  '--cd',
  '--cwd',
  '-C',
  '--sandbox',
  '--ask-for-approval',
  '--approval-policy',
  '--config-profile',
  '--color',
  '--search',
  '--worktree',
  '-w',
  '--custom',
]);

function isLaunchLikeOmgInvocation(args: readonly string[]): boolean {
  const command = translateHelp(args[0] ?? 'help');
  return command.startsWith('-') || command === 'launch';
}

function hasExplicitLaunchPrompt(args: readonly string[]): boolean {
  const launchArgs = args[0] === 'launch' ? args.slice(1) : args;
  let passthrough = false;
  for (let index = 0; index < launchArgs.length; index += 1) {
    const arg = launchArgs[index] ?? '';
    if (passthrough) return true;
    if (arg === '--') {
      passthrough = true;
      continue;
    }
    if (CODEX_VALUE_FLAGS.has(arg)) {
      index += 1;
      continue;
    }
    if (arg.startsWith('-')) continue;
    return true;
  }
  return false;
}

async function readRun(path: string): Promise<GoalWorkflowRun | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf-8')) as GoalWorkflowRun;
    return parsed.version === 1 && parsed.workflow === GOAL_HARNESS_WORKFLOW && parsed.slug
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

export async function findLatestLaunchableGoalHarnessRun(cwd: string): Promise<GoalWorkflowRun | undefined> {
  const root = join(cwd, '.omg', 'goals', GOAL_HARNESS_WORKFLOW);
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return undefined;
  }
  const runs = (await Promise.all(entries.map((entry) => readRun(join(root, entry, 'status.json')))))
    .filter((run): run is GoalWorkflowRun => Boolean(run))
    .filter((run) => run.status === 'pending' || run.status === 'in_progress' || run.status === 'validation_passed');
  runs.sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt));
  return runs[0];
}

export async function resolveOmgLaunchArgs(args: string[], cwd = process.cwd()): Promise<{ args: string[]; slug?: string }> {
  if (!isLaunchLikeOmgInvocation(args) || hasExplicitLaunchPrompt(args)) return { args };
  const run = await findLatestLaunchableGoalHarnessRun(cwd);
  if (!run) return { args };
  const handoff = await startGoalHarnessRun(cwd, run.slug);
  const prompt = [
    'Use the existing OMG goal-harness run for this Codex session.',
    '',
    displayOmgText(handoff.instruction),
  ].join('\n');
  return { args: [...args, prompt], slug: handoff.run.slug };
}

export async function main(args: string[]): Promise<void> {
  const command = translateHelp(args[0] ?? 'help');
  if (command === 'help') {
    console.log(OMG_HELP);
    return;
  }
  if (command === 'version' || command === '--version' || command === '-v') {
    console.log(packageVersion());
    return;
  }
  if (command === 'harness-help') {
    console.log(GOAL_HARNESS_HELP);
    return;
  }
  if (shouldHandleOmgCompatibilityInvocation(args)) {
    const launch = await resolveOmgLaunchArgs(args);
    console.log('Oh My Goal is plugin-first; this CLI does not launch a separate runtime.');
    console.log('Use Codex in the target project and invoke:');
    console.log('');
    console.log('$oh-my-goal <objective>');
    if (launch.slug) {
      console.log('');
      console.log(`Latest goal-harness run: ${launch.slug}`);
      console.log('Recommended prompt for Codex:');
      console.log('');
      console.log(launch.args.at(-1) ?? '');
    }
    return;
  }

  await goalHarnessCommand(args, { commandPrefix: 'omg' });
}
