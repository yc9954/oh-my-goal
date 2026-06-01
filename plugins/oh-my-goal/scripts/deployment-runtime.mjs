#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

function slugify(value) {
  return safeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .replace(/-+$/g, '') || 'oh-my-goal-deploy';
}

function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'plan';
  const parsed = { command, cwd: process.cwd(), json: false, execute: false, target: 'vercel-preview', llm: 'no-llm-api', auth: 'no-auth', framework: 'auto', credentialSetup: 'secure-terminal-prompt' };
  const start = command === 'plan' && argv[0]?.startsWith('--') ? 0 : 1;
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
    if (['--objective', '--slug', '--cwd', '--target', '--llm', '--auth', '--framework', '--credential-setup'].includes(arg)) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}.`);
      parsed[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
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

function packageManager(cwd) {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock'))) return 'bun';
  return 'npm';
}

async function readPackageJson(cwd) {
  const path = join(cwd, 'package.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch {
    return null;
  }
}

async function detectFramework(cwd, requested) {
  if (requested && requested !== 'auto') return requested;
  const pkg = await readPackageJson(cwd);
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  if (deps.next) return 'nextjs';
  if (deps.vite) return 'vite';
  if (existsSync(join(cwd, 'next.config.js')) || existsSync(join(cwd, 'next.config.mjs'))) return 'nextjs';
  if (existsSync(join(cwd, 'vite.config.ts')) || existsSync(join(cwd, 'vite.config.js'))) return 'vite';
  if (existsSync(join(cwd, 'index.html'))) return 'static';
  return 'unknown';
}

async function detectBuildCommand(cwd, framework) {
  const pkg = await readPackageJson(cwd);
  if (pkg?.scripts?.build) {
    const manager = packageManager(cwd);
    if (manager === 'pnpm') return 'pnpm build';
    if (manager === 'yarn') return 'yarn build';
    if (manager === 'bun') return 'bun run build';
    return 'npm run build';
  }
  if (framework === 'static') return null;
  return null;
}

function objectiveNeedsZep(objective) {
  return /\b(zep|mirofish|memory)\b/i.test(safeString(objective));
}

function pushUniqueEnv(vars, item) {
  if (!vars.some((existing) => existing.name === item.name)) vars.push(item);
}

function envRequirements({ llm, auth, objective }) {
  const vars = [];
  if (llm === 'openai-api') vars.push({ name: 'OPENAI_API_KEY', scope: 'server', reason: 'OpenAI server-side API calls' });
  if (llm === 'openai-compatible-api') {
    vars.push({ name: 'OPENAI_API_KEY', scope: 'server', reason: 'OpenAI-compatible provider key' });
    vars.push({ name: 'OPENAI_BASE_URL', scope: 'server', reason: 'Provider base URL' });
  }
  if (objectiveNeedsZep(objective)) {
    pushUniqueEnv(vars, { name: 'ZEP_API_KEY', scope: 'server', reason: 'Zep memory API calls' });
  }
  if (auth === 'clerk') {
    vars.push({ name: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', scope: 'public', reason: 'Clerk client initialization' });
    vars.push({ name: 'CLERK_SECRET_KEY', scope: 'server', reason: 'Clerk server auth' });
  }
  if (auth === 'nextauth') {
    vars.push({ name: 'AUTH_SECRET', scope: 'server', reason: 'Auth.js session signing' });
    vars.push({ name: 'AUTH_URL', scope: 'server', reason: 'Canonical deployed auth URL' });
  }
  if (auth === 'supabase') {
    vars.push({ name: 'NEXT_PUBLIC_SUPABASE_URL', scope: 'public', reason: 'Supabase client URL' });
    vars.push({ name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', scope: 'public', reason: 'Supabase browser auth' });
    vars.push({ name: 'SUPABASE_SERVICE_ROLE_KEY', scope: 'server', reason: 'Server-only admin operations when needed' });
  }
  return vars;
}

function vercelDeployCommand(target) {
  return target === 'vercel-production' ? 'vercel deploy --prod --yes' : 'vercel deploy --yes';
}

function vercelCommands({ target, envVars, buildCommand }) {
  return [
    'vercel whoami || vercel login',
    'vercel link --yes',
    ...vercelEnvSetupCommands({ target, envVars }),
    ...(buildCommand ? [buildCommand] : []),
    vercelDeployCommand(target),
  ];
}

function vercelEnvTargets(target) {
  return target === 'vercel-production' ? ['production', 'preview'] : ['preview'];
}

function vercelEnvSetupCommands({ target, envVars }) {
  const envTargets = vercelEnvTargets(target);
  return envVars.flatMap((item) => envTargets.map((envTarget) => `vercel env add ${item.name} ${envTarget}`));
}

function credentialStatus({ credentialSetup, envVars }) {
  if (envVars.length === 0 || credentialSetup === 'no-secrets-needed') return 'not_required';
  if (credentialSetup === 'already-configured-vercel-env') return 'verify_vercel_env';
  if (credentialSetup === 'already-configured-local-env') return 'verify_local_env';
  if (credentialSetup === 'env-example-and-stop') return 'write_placeholders_then_pause';
  return 'secure_prompt_required';
}

export async function buildDeploymentPlan({ cwd, objective, slug, target, llm, auth, framework, credentialSetup }) {
  const resolvedFramework = await detectFramework(cwd, framework);
  const buildCommand = await detectBuildCommand(cwd, resolvedFramework);
  const envVars = envRequirements({ llm, auth, objective });
  const vercel = target === 'vercel-production' || target === 'vercel-preview';
  const commands = vercel ? vercelCommands({ target, envVars, buildCommand }) : buildCommand ? [buildCommand] : [];
  const credentials = credentialStatus({ credentialSetup, envVars });
  return {
    slug,
    objective,
    target,
    framework: resolvedFramework,
    llm,
    auth,
    credentialSetup,
    credentialStatus: credentials,
    buildCommand,
    deployCommand: vercel ? vercelDeployCommand(target) : null,
    envVars,
    commands,
    blockers: [
      ...(vercel ? ['Vercel CLI must be installed and authenticated before automatic deployment can complete.'] : []),
      ...(credentials === 'secure_prompt_required' ? ['Secrets must be entered via Vercel CLI/dashboard or local env files; do not paste secret values into Codex chat.'] : []),
      ...(credentials === 'write_placeholders_then_pause' ? ['Create `.env.example` placeholders and pause before deploy until real secret values are configured outside chat.'] : []),
      ...(vercel && !buildCommand && resolvedFramework !== 'static' ? ['No build script was detected; add or confirm the build command before deployment.'] : []),
    ],
  };
}

function commandAvailable(name) {
  const result = spawnSync('sh', ['-lc', `command -v ${name}`], { encoding: 'utf-8', timeout: 5_000 });
  return result.status === 0;
}

async function localEnvNames(cwd) {
  const names = new Set();
  for (const file of ['.env.local', '.env', '.env.production.local']) {
    const path = join(cwd, file);
    if (!existsSync(path)) continue;
    const text = await readFile(path, 'utf-8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (match) names.add(match[1]);
    }
  }
  for (const name of Object.keys(process.env)) names.add(name);
  return names;
}

function redactedOutput(value) {
  return safeString(value)
    .split(/\r?\n/)
    .filter((line) => !/(key|secret|token|password)\s*=/i.test(line))
    .join('\n')
    .slice(0, 4000);
}

function runShell(command, cwd) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf-8',
    timeout: 120_000,
  });
  return {
    command,
    status: result.status ?? 1,
    stdout: redactedOutput(result.stdout),
    stderr: redactedOutput(result.stderr),
  };
}

export async function checkDeploymentReadiness(plan, { cwd, execute = false } = {}) {
  const checks = [];
  const blockers = [];
  const vercelTarget = plan.target === 'vercel-production' || plan.target === 'vercel-preview';
  const vercelCli = vercelTarget ? commandAvailable('vercel') : false;
  if (vercelTarget) {
    checks.push({ id: 'vercel-cli', status: vercelCli ? 'pass' : 'blocked', evidence: vercelCli ? 'vercel command is available' : 'vercel CLI is not installed or not on PATH' });
    if (!vercelCli) blockers.push('Install Vercel CLI or make `vercel` available on PATH.');
  }
  if (plan.buildCommand) {
    checks.push({ id: 'build-command', status: 'pass', evidence: plan.buildCommand });
  } else if (plan.framework === 'static') {
    checks.push({ id: 'build-command', status: 'pass', evidence: 'static project does not require a build command' });
  } else {
    checks.push({ id: 'build-command', status: 'blocked', evidence: 'No package build script detected' });
    blockers.push('Add or confirm a build command before deployment.');
  }

  let envReady = plan.envVars.length === 0 || plan.credentialStatus === 'not_required';
  if (plan.envVars.length > 0 && plan.credentialSetup === 'already-configured-local-env') {
    const names = await localEnvNames(cwd);
    const missing = plan.envVars.map((item) => item.name).filter((name) => !names.has(name));
    envReady = missing.length === 0;
    checks.push({ id: 'local-env', status: envReady ? 'pass' : 'blocked', evidence: envReady ? 'required env names are present locally' : `missing env names: ${missing.join(', ')}` });
    if (!envReady) blockers.push(`Missing local env vars: ${missing.join(', ')}`);
  } else if (plan.envVars.length > 0 && plan.credentialSetup === 'already-configured-vercel-env') {
    if (execute && vercelCli) {
      const envList = runShell('vercel env ls', cwd);
      envReady = envList.status === 0;
      checks.push({ id: 'vercel-env', status: envReady ? 'pass' : 'blocked', evidence: envReady ? 'vercel env ls completed; verify names in Vercel dashboard if needed' : envList.stderr || envList.stdout || 'vercel env ls failed' });
      if (!envReady) blockers.push('Vercel env verification failed.');
    } else {
      envReady = true;
      checks.push({ id: 'vercel-env', status: 'manual', evidence: 'intake says Vercel env is already configured; run check --execute to verify CLI access' });
    }
  } else if (plan.envVars.length > 0 && plan.credentialSetup === 'secure-terminal-prompt') {
    checks.push({ id: 'secrets', status: 'blocked', evidence: 'run the listed `vercel env add` commands or configure dashboard env vars before deploy --execute' });
    blockers.push('Required secrets are not yet proven configured.');
  } else if (plan.envVars.length > 0 && plan.credentialSetup === 'env-example-and-stop') {
    checks.push({ id: 'secrets', status: 'blocked', evidence: '.env.example placeholders are generated; real secrets must be configured outside chat before deploy' });
    blockers.push('Credential setup selected env-example-and-stop.');
  } else {
    checks.push({ id: 'secrets', status: 'pass', evidence: 'no required secret vars for selected intake' });
  }

  if (execute && vercelTarget && vercelCli) {
    const whoami = runShell('vercel whoami', cwd);
    const authenticated = whoami.status === 0;
    checks.push({ id: 'vercel-auth', status: authenticated ? 'pass' : 'blocked', evidence: authenticated ? 'vercel whoami passed' : whoami.stderr || whoami.stdout || 'vercel whoami failed' });
    if (!authenticated) blockers.push('Run `vercel login` before deploy --execute.');
  } else if (vercelTarget) {
    checks.push({ id: 'vercel-auth', status: 'manual', evidence: 'run check --execute or `vercel whoami` to verify auth' });
  }

  const canDeploy = vercelTarget
    && (vercelCli || !execute)
    && envReady
    && (Boolean(plan.buildCommand) || plan.framework === 'static')
    && blockers.length === 0;
  return { ok: blockers.length === 0, canDeploy, execute, checks, blockers };
}

export function renderDeploymentPlanMarkdown(plan) {
  return [
    '# Deployment Plan',
    '',
    `Objective: ${plan.objective}`,
    `Target: ${plan.target}`,
    `Detected framework: ${plan.framework}`,
    `LLM API: ${plan.llm}`,
    `Auth: ${plan.auth}`,
    `Credential setup: ${plan.credentialSetup}`,
    `Credential status: ${plan.credentialStatus}`,
    `Build command: ${plan.buildCommand || 'none required or not detected'}`,
    `Deploy command: ${plan.deployCommand || 'not applicable'}`,
    '',
    '## Secret Handling',
    plan.envVars.length > 0
      ? 'Required environment variables. Store real values only in Vercel env, local shell, or `.env.local`; never in committed files or chat logs.'
      : 'No secret environment variables are required by the current intake answers.',
    '',
    ...plan.envVars.map((item) => `- ${item.name} (${item.scope}): ${item.reason}`),
    '',
    '## Vercel Commands',
    plan.commands.length > 0
      ? ['```sh', ...plan.commands, '```'].join('\n')
      : 'Deployment is out of scope for this harness.',
    '',
    '## Automated Runtime Path',
    '- Run `deployment-runtime.mjs check --json` after implementation to verify build, Vercel CLI, auth, and env readiness.',
    '- Run `deployment-runtime.mjs setup-env --json` to preview secure Vercel env prompts; run with `--execute` only in an attached terminal.',
    '- Run `deployment-runtime.mjs deploy --json` for a dry-run deployment plan.',
    '- Run `deployment-runtime.mjs deploy --execute --json` only after build/tests pass and required secrets are configured outside chat.',
    '',
    '## .env.example Template',
    plan.envVars.length > 0
      ? ['```dotenv', ...plan.envVars.map((item) => `${item.name}=`), '```'].join('\n')
      : 'No `.env.example` entries are required.',
    '',
    '## Completion Evidence',
    '- Build command and inspected output.',
    '- Vercel preview or production URL when deployment target includes Vercel.',
    '- Confirmation that required env vars were configured without exposing secret values.',
    '- Auth smoke check when auth is enabled.',
    '',
    '## Blockers',
    ...plan.blockers.map((item) => `- ${item}`),
  ].join('\n');
}

async function writeAtomic(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, content, 'utf-8');
  await rename(tmp, path);
}

async function commandPlan(args) {
  const cwd = resolve(args.cwd || process.cwd());
  const objective = safeString(args.objective).trim() || 'Oh My Goal deployment';
  const slug = slugify(args.slug || objective);
  const plan = await buildDeploymentPlan({
    cwd,
    objective,
    slug,
    target: args.target,
    llm: args.llm,
    auth: args.auth,
    framework: args.framework,
    credentialSetup: args.credentialSetup,
  });
  const markdown = renderDeploymentPlanMarkdown(plan);
  const root = join(cwd, '.omg', 'runtime', 'deployment', slug);
  const planPath = join(root, 'deployment-plan.md');
  await writeAtomic(planPath, `${markdown}\n`);
  const written = [relative(cwd, planPath)];
  if (plan.envVars.length > 0) {
    const examplePath = join(root, '.env.example');
    await writeAtomic(examplePath, `${plan.envVars.map((item) => `${item.name}=`).join('\n')}\n`);
    written.push(relative(cwd, examplePath));
  }
  return {
    ok: true,
    slug,
    root: relative(cwd, root),
    plan_path: relative(cwd, planPath),
    written,
    plan,
    markdown,
  };
}

async function commandCheck(args) {
  const cwd = resolve(args.cwd || process.cwd());
  const objective = safeString(args.objective).trim() || 'Oh My Goal deployment';
  const slug = slugify(args.slug || objective);
  const plan = await buildDeploymentPlan({
    cwd,
    objective,
    slug,
    target: args.target,
    llm: args.llm,
    auth: args.auth,
    framework: args.framework,
    credentialSetup: args.credentialSetup,
  });
  const readiness = await checkDeploymentReadiness(plan, { cwd, execute: args.execute });
  return { ok: readiness.ok, slug, plan, readiness };
}

async function commandSetupEnv(args) {
  const cwd = resolve(args.cwd || process.cwd());
  const objective = safeString(args.objective).trim() || 'Oh My Goal deployment';
  const slug = slugify(args.slug || objective);
  const plan = await buildDeploymentPlan({
    cwd,
    objective,
    slug,
    target: args.target,
    llm: args.llm,
    auth: args.auth,
    framework: args.framework,
    credentialSetup: args.credentialSetup,
  });
  const root = join(cwd, '.omg', 'runtime', 'deployment', slug);
  const setupPath = join(root, 'secret-setup.md');
  const vercelTarget = plan.target === 'vercel-production' || plan.target === 'vercel-preview';
  const setupCommands = vercelTarget ? ['vercel link --yes', ...vercelEnvSetupCommands({ target: plan.target, envVars: plan.envVars })] : [];
  const markdown = [
    '# Secret Setup',
    '',
    `Objective: ${plan.objective}`,
    `Target: ${plan.target}`,
    `Credential setup: ${plan.credentialSetup}`,
    '',
    'Real values must be entered only in secure CLI/dashboard prompts or local env files. Do not paste values into chat or committed artifacts.',
    '',
    '## Required Environment Variables',
    plan.envVars.length > 0 ? plan.envVars.map((item) => `- ${item.name} (${item.scope}): ${item.reason}`).join('\n') : '- None.',
    '',
    '## Secure Prompt Commands',
    setupCommands.length > 0 ? ['```sh', ...setupCommands, '```'].join('\n') : 'No Vercel env commands are required for this target.',
    '',
    '## Next Step',
    plan.envVars.length > 0
      ? 'After running these prompts, verify with `deployment-runtime.mjs check --credential-setup already-configured-vercel-env --execute --json`, then run deployment dry-run and execute.'
      : 'No secret setup is required. Continue to deployment readiness check.',
  ].join('\n');
  await writeAtomic(setupPath, `${markdown}\n`);

  if (!args.execute) {
    return {
      ok: true,
      dry_run: true,
      slug,
      setup_path: relative(cwd, setupPath),
      plan,
      setup_commands: setupCommands,
      next_action: setupCommands.length > 0
        ? 'Run the same command with --execute in an attached terminal to enter values through Vercel secure prompts, or configure them in the Vercel dashboard.'
        : 'No secret setup is required; continue to deployment-runtime check.',
    };
  }

  if (plan.envVars.length === 0) {
    return { ok: true, dry_run: false, slug, setup_path: relative(cwd, setupPath), plan, results: [], next_action: 'No secret setup was required.' };
  }
  if (!vercelTarget) throw new Error('setup-env --execute requires a Vercel deployment target.');
  if (!commandAvailable('vercel')) throw new Error('Vercel CLI is not installed or not on PATH.');
  if (!process.stdin.isTTY) {
    throw new Error('setup-env --execute requires an attached terminal so Vercel can prompt securely for secret values.');
  }

  const results = [];
  for (const command of setupCommands) {
    const result = spawnSync(command, {
      cwd,
      shell: true,
      stdio: 'inherit',
      timeout: 300_000,
    });
    const status = result.status ?? 1;
    results.push({ command, status });
    if (status !== 0) return { ok: false, dry_run: false, slug, setup_path: relative(cwd, setupPath), plan, results, blocker: `${command} failed` };
  }
  return {
    ok: true,
    dry_run: false,
    slug,
    setup_path: relative(cwd, setupPath),
    plan,
    results,
    next_action: 'Run deployment-runtime check --credential-setup already-configured-vercel-env --execute --json, then deploy.',
  };
}

async function commandDeploy(args) {
  const cwd = resolve(args.cwd || process.cwd());
  const objective = safeString(args.objective).trim() || 'Oh My Goal deployment';
  const slug = slugify(args.slug || objective);
  const plan = await buildDeploymentPlan({
    cwd,
    objective,
    slug,
    target: args.target,
    llm: args.llm,
    auth: args.auth,
    framework: args.framework,
    credentialSetup: args.credentialSetup,
  });
  const readiness = await checkDeploymentReadiness(plan, { cwd, execute: args.execute });
  const deploySteps = [
    ...(plan.buildCommand ? [plan.buildCommand] : []),
    ...(plan.deployCommand ? [plan.deployCommand] : []),
  ];
  if (!args.execute) {
    return {
      ok: readiness.ok,
      dry_run: true,
      slug,
      plan,
      readiness,
      deploy_steps: deploySteps,
      next_action: readiness.canDeploy
        ? 'Run the same command with --execute after confirming tests, build output, and deployment target.'
        : 'Resolve readiness blockers before deploy --execute.',
    };
  }
  if (!readiness.canDeploy) {
    throw new Error(`Deployment is not ready: ${readiness.blockers.join('; ') || 'unknown blocker'}`);
  }
  const results = [];
  for (const command of deploySteps) {
    const result = runShell(command, cwd);
    results.push(result);
    if (result.status !== 0) {
      return { ok: false, slug, plan, readiness, results, blocker: `${command} failed` };
    }
  }
  return { ok: true, slug, plan, readiness, results };
}

function printHelp() {
  console.log(`oh-my-goal deployment-runtime

Usage:
  node scripts/deployment-runtime.mjs plan --objective "<objective>" --slug <slug> [--target vercel-preview|vercel-production|deployment-plan-only|no-deployment] [--llm openai-api|openai-compatible-api|no-llm-api] [--auth clerk|nextauth|supabase|no-auth] [--credential-setup secure-terminal-prompt|already-configured-vercel-env|already-configured-local-env|env-example-and-stop|no-secrets-needed] [--json]
  node scripts/deployment-runtime.mjs check --objective "<objective>" --slug <slug> [same options] [--execute] [--json]
  node scripts/deployment-runtime.mjs setup-env --objective "<objective>" --slug <slug> [same options] [--execute] [--json]
  node scripts/deployment-runtime.mjs deploy --objective "<objective>" --slug <slug> [same options] [--execute] [--json]

Purpose:
  Create, check, and optionally execute deployment steps for the goal leader.
  The runtime is safe by default: plan/check/deploy without --execute never
  deploys. Real secret values must be entered only through Vercel/dashboard,
  local env files, or shell env, never through Codex chat or committed files.
  setup-env --execute requires an attached terminal and uses Vercel's secure
  env prompts; without --execute it only prints and records the prompt commands.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  let payload;
  if (args.command === 'plan') payload = await commandPlan(args);
  else if (args.command === 'check') payload = await commandCheck(args);
  else if (args.command === 'setup-env') payload = await commandSetupEnv(args);
  else if (args.command === 'deploy') payload = await commandDeploy(args);
  else throw new Error(`Unknown command: ${args.command}`);
  if (args.json) console.log(JSON.stringify(payload, null, 2));
  else if (payload.markdown) console.log(payload.markdown);
  else console.log(JSON.stringify(payload, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    await main();
  } catch (error) {
    console.error(`[oh-my-goal deployment-runtime] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
