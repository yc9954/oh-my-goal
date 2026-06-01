#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { join, relative } from 'node:path';
import {
  buildIntakeQuestionInput,
  intakeQuestionsForObjective,
  renderQuestionInputMarkdown,
} from './intake-question-engine.mjs';
import {
  buildDesignSystem,
  formatDesignSystemMarkdown,
  normalizeDesignSystemMode,
} from './design-system-runtime.mjs';

const VALUE_FLAGS = new Set(['--objective', '--slug', '--cwd', '--answers-json', '--answers-file']);

function parseArgs(argv) {
  const parsed = { cwd: process.cwd(), force: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--force') {
      parsed.force = true;
      continue;
    }
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--interview-complete') {
      parsed.interviewComplete = true;
      continue;
    }
    if (arg === '--print-interview') {
      parsed.printInterview = true;
      continue;
    }
    if (VALUE_FLAGS.has(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}.`);
      parsed[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    parsed.objective = [parsed.objective, arg].filter(Boolean).join(' ');
  }
  return parsed;
}

function normalizeObjective(value) {
  return String(value || '')
    .replace(/^\s*(?:use\s+)?\$oh-my-goal\b[:\s-]*/i, '')
    .trim();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .replace(/-+$/g, '') || 'oh-my-goal';
}

function lines(values) {
  return values.filter((line) => line !== undefined).join('\n');
}

function answerValue(answers, key, fallback = 'Unresolved') {
  const value = answers[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

const CANONICAL_ALIASES = {
  authProvider: {
    'clerk authentication': 'clerk',
    clerk: 'clerk',
    'nextauth/auth.js': 'nextauth',
    'nextauth auth.js': 'nextauth',
    nextauth: 'nextauth',
    'auth.js': 'nextauth',
    'supabase auth': 'supabase',
    supabase: 'supabase',
    'no authentication': 'no-auth',
    'no auth': 'no-auth',
    'no-auth': 'no-auth',
  },
  credentialSetup: {
    'use vercel cli secure prompts': 'secure-terminal-prompt',
    'secure terminal prompt': 'secure-terminal-prompt',
    'secure-terminal-prompt': 'secure-terminal-prompt',
    'already configured in vercel': 'already-configured-vercel-env',
    'already-configured-vercel-env': 'already-configured-vercel-env',
    'already configured locally': 'already-configured-local-env',
    'already-configured-local-env': 'already-configured-local-env',
    'generate .env.example and stop': 'env-example-and-stop',
    'generate env.example and stop': 'env-example-and-stop',
    'env-example-and-stop': 'env-example-and-stop',
    'no secrets needed': 'no-secrets-needed',
    'no-secrets-needed': 'no-secrets-needed',
  },
  deploymentTarget: {
    'vercel preview deployment': 'vercel-preview',
    'vercel preview': 'vercel-preview',
    'vercel-preview': 'vercel-preview',
    'vercel production deployment': 'vercel-production',
    'vercel production': 'vercel-production',
    'vercel-production': 'vercel-production',
    'deployment plan only': 'deployment-plan-only',
    'deployment-plan-only': 'deployment-plan-only',
    'no deployment': 'no-deployment',
    'no-deployment': 'no-deployment',
  },
  llmApi: {
    'openai api': 'openai-api',
    openai: 'openai-api',
    'openai-api': 'openai-api',
    'openai-compatible api': 'openai-compatible-api',
    'openai compatible api': 'openai-compatible-api',
    'openai-compatible-api': 'openai-compatible-api',
    'no llm api': 'no-llm-api',
    'no-llm-api': 'no-llm-api',
  },
  stack: {
    'static html/css/js': 'static',
    'static html css js': 'static',
    static: 'static',
    'react/vite': 'vite',
    'react vite': 'vite',
    vite: 'vite',
    'next.js / react app': 'nextjs',
    'next.js react app': 'nextjs',
    'nextjs / react app': 'nextjs',
    nextjs: 'nextjs',
    'next.js': 'nextjs',
    'match existing repo stack': 'auto',
    auto: 'auto',
  },
  designSystemMode: {
    'generate design-system.md before implementation': 'generate-design-system',
    'generate design system md before implementation': 'generate-design-system',
    'generate and enforce a design system': 'generate-design-system',
    'generate-design-system': 'generate-design-system',
    'use a lightweight design checklist': 'lightweight-design-checklist',
    'lightweight design checklist': 'lightweight-design-checklist',
    'lightweight-design-checklist': 'lightweight-design-checklist',
    'match the existing design system': 'match-existing-design-system',
    'match existing design system': 'match-existing-design-system',
    'match-existing-design-system': 'match-existing-design-system',
    'skip design system': 'skip-design-system',
    'skip-design-system': 'skip-design-system',
  },
};

function comparable(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[`'"]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9가-힣.+/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalAnswerValue(answers, key, fallback = 'Unresolved') {
  const value = answerValue(answers, key, fallback);
  const aliases = CANONICAL_ALIASES[key];
  if (!aliases) return value;
  const normalized = comparable(value);
  return aliases[normalized] || value;
}

function selectedDesignSystemMode(answers) {
  return normalizeDesignSystemMode(canonicalAnswerValue(answers, 'designSystemMode', 'generate-design-system'));
}

function objectiveNeedsZep(objective) {
  return /\b(zep|mirofish|memory)\b/i.test(String(objective || ''));
}

const NEGATIVE_PROMPT_SIGNAL_RE = /^(?:no|none|skip|without|exclude|excluding)[ -]|^(?:없음|불필요)$/;
const NEGATED_AUTH_RE = /\b(?:no|without|skip|exclude|excluding)\s+(?:auth|authentication|login)\b|(?:auth|authentication|login)\s+(?:not needed|unneeded)|(?:로그인|인증)\s*(?:없|없이|제외|불필요)/i;
const NEGATED_DEPLOYMENT_RE = /\b(?:no|without|skip|exclude|excluding)\s+(?:deployment|deploy|vercel)\b|(?:deployment|deploy|vercel)\s+(?:not needed|unneeded)|배포\s*(?:없|없이|하지 않|제외|불필요)/i;
const NEGATED_LLM_RE = /\b(?:no|without|skip|exclude|excluding)\s+(?:llm|openai|gpt|ai api|api key)\b|(?:llm|openai|gpt|api key)\s+(?:not needed|unneeded)|(?:llm|openai|gpt|api\s*key|api키)\s*(?:없|없이|제외|불필요)/i;
const NEGATED_ZEP_RE = /\b(?:no|without|skip|exclude|excluding)\s+(?:zep|memory)\b|(?:zep|memory)\s+(?:not needed|unneeded)|(?:zep|memory|메모리)\s*(?:없|없이|제외|불필요)/i;
const AUTH_RE = /\b(?:auth|authentication|login|clerk|nextauth|supabase)\b|로그인|인증/i;
const DEPLOYMENT_RE = /\bvercel\b|배포/i;
const GITHUB_RE = /\bgithub\b|git hub|new repo|레포|저장소|push/i;
const LLM_RE = /\b(?:openai|llm|gpt|chatgpt)\b|api key|api키/i;
const ZEP_RE = /\bzep\b/i;
const MARKET_RESEARCH_RE = /market research|시장조사|시장 조사|survey|설문|persona|페르소나|시장 반응|소비자|응답|신뢰도|불확실성|synthetic/i;
const WEB_APP_RE = /\b(?:web|app|dashboard|platform|vercel)\b|웹|앱|사이트|플랫폼/i;
const MVP_RE = /\b(?:mvp|minimum viable|local mvp)\b|로컬 mvp/i;
const SERVER_SIDE_RE = /server-side|server side|서버 사이드|api route|serverless/i;
const KOREAN_RE = /한국|korean|\bkr\b/i;
const PLANNING_RE = /\b(?:prd|spec|requirements)\b|요구사항|기획/i;

function hasPositiveSignal(text, includePattern, excludePattern) {
  return includePattern.test(text) && !(excludePattern && excludePattern.test(text));
}

function contributesToPromptSignals(answers, key, value) {
  const canonical = canonicalAnswerValue(answers, key, '');
  const normalized = comparable(canonical || value);
  return Boolean(normalized)
    && !NEGATIVE_PROMPT_SIGNAL_RE.test(normalized)
    && !normalized.includes('no deployment')
    && !normalized.includes('no secrets')
    && !normalized.includes('필요 없음')
    && !normalized.includes('제외');
}

function envRequirementsFromAnswers(answers, objective = '') {
  const llm = canonicalAnswerValue(answers, 'llmApi', 'no-llm-api');
  const auth = canonicalAnswerValue(answers, 'authProvider', 'no-auth');
  const vars = [];
  if (llm === 'openai-api') vars.push(['OPENAI_API_KEY', 'server-only OpenAI API key.']);
  if (llm === 'openai-compatible-api') {
    vars.push(['OPENAI_API_KEY', 'server-only provider API key.']);
    vars.push(['OPENAI_BASE_URL', 'provider base URL.']);
  }
  if (objectiveNeedsZep(objective)) {
    vars.push(['ZEP_API_KEY', 'server-only Zep memory API key.']);
  }
  if (auth === 'clerk') {
    vars.push(['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'public Clerk key.']);
    vars.push(['CLERK_SECRET_KEY', 'server-only Clerk secret.']);
  }
  if (auth === 'nextauth') {
    vars.push(['AUTH_SECRET', 'Auth.js/NextAuth secret.']);
    vars.push(['AUTH_URL', 'deployed auth callback base URL.']);
  }
  if (auth === 'supabase') {
    vars.push(['NEXT_PUBLIC_SUPABASE_URL', 'public Supabase URL.']);
    vars.push(['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public Supabase anon key.']);
    vars.push(['SUPABASE_SERVICE_ROLE_KEY', 'server-only Supabase service role key if needed.']);
  }
  return vars;
}

function formatQuestion({ question, options }) {
  if (!options?.length) return `${question} `;
  return lines([
    question,
    ...options.map((option, index) => {
      const description = option.description ? ` - ${option.description}` : '';
      return `  ${index + 1}) ${option.label}${description}`;
    }),
    'Choose a number or answer in your own words: ',
  ]);
}

function renderInterviewBlock(objective) {
  return renderQuestionInputMarkdown(buildIntakeQuestionInput(objective));
}

function markdownTable(headers, rows) {
  return lines([
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ]);
}

function splitAnswer(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '')
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function answerList(answers, key, fallback) {
  const values = splitAnswer(answers[key]);
  return values.length > 0 ? values : fallback;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function pluginRootResolverPath(slug) {
  return `.omg/harness/${slug}/plugin-root-resolver.mjs`;
}

function objectiveFilePath(slug) {
  return `.omg/harness/${slug}/objective.txt`;
}

function objectiveFileShellArg(slug) {
  return `"$(cat ${shellQuote(objectiveFilePath(slug))})"`;
}

function pluginScriptCommand({ slug, script, args = [] }) {
  return [
    `OMG_PLUGIN_ROOT="$(node ${shellQuote(pluginRootResolverPath(slug))})"`,
    '&&',
    'node',
    `"$OMG_PLUGIN_ROOT/scripts/${script}"`,
    ...args,
  ].join(' ');
}

function pluginRootResolverSource() {
  return lines([
    '#!/usr/bin/env node',
    "import { existsSync, readdirSync, statSync } from 'node:fs';",
    "import { createRequire } from 'node:module';",
    "import { dirname, join, resolve } from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    '',
    'const here = dirname(fileURLToPath(import.meta.url));',
    'const cwd = process.cwd();',
    'const require = createRequire(import.meta.url);',
    '',
    'function validRoot(root) {',
    '  if (!root) return false;',
    '  const resolved = resolve(root);',
    "  return existsSync(join(resolved, 'scripts', 'create-harness.mjs'))",
    "    && existsSync(join(resolved, 'scripts', 'team-runtime.mjs'))",
    "    && (existsSync(join(resolved, '.codex-plugin', 'plugin.json')) || existsSync(join(resolved, 'skills', 'oh-my-goal', 'SKILL.md')));",
    '}',
    '',
    'function addCandidate(candidates, root) {',
    '  if (!root) return;',
    '  const resolved = resolve(root);',
    '  if (!candidates.includes(resolved)) candidates.push(resolved);',
    '}',
    '',
    'function ancestors(start) {',
    '  const result = [];',
    '  let current = resolve(start);',
    '  while (true) {',
    '    result.push(current);',
    '    const parent = dirname(current);',
    '    if (parent === current) break;',
    '    current = parent;',
    '  }',
    '  return result;',
    '}',
    '',
    'function scanForPluginRoots(candidates, root, depth) {',
    '  if (!root || depth < 0 || !existsSync(root)) return;',
    '  if (validRoot(root)) addCandidate(candidates, root);',
    '  let entries = [];',
    '  try {',
    '    entries = readdirSync(root).sort().reverse();',
    '  } catch {',
    '    return;',
    '  }',
    '  for (const entry of entries) {',
    '    const path = join(root, entry);',
    '    try {',
    '      if (!statSync(path).isDirectory()) continue;',
    '    } catch {',
    '      continue;',
    '    }',
    '    scanForPluginRoots(candidates, path, depth - 1);',
    '  }',
    '}',
    '',
    'const candidates = [];',
    'addCandidate(candidates, process.env.OH_MY_GOAL_PLUGIN_ROOT);',
    '',
    'for (const base of [cwd, here]) {',
    '  for (const dir of ancestors(base)) {',
    '    addCandidate(candidates, dir);',
    "    addCandidate(candidates, join(dir, 'plugins', 'oh-my-goal'));",
    "    addCandidate(candidates, join(dir, 'node_modules', 'oh-my-goal', 'plugins', 'oh-my-goal'));",
    '  }',
    '}',
    '',
    'try {',
    "  const packageJson = require.resolve('oh-my-goal/package.json', { paths: [cwd, here] });",
    "  addCandidate(candidates, join(dirname(packageJson), 'plugins', 'oh-my-goal'));",
    '} catch {',
    '  // The plugin is often installed through Codex instead of node_modules.',
    '}',
    '',
    'const home = process.env.HOME || process.env.USERPROFILE || "";',
    "const codexHome = process.env.CODEX_HOME || (home ? join(home, '.codex') : '');",
    "scanForPluginRoots(candidates, join(codexHome, 'plugins', 'cache'), 5);",
    '',
    'for (const candidate of candidates) {',
    '  if (validRoot(candidate)) {',
    '    console.log(resolve(candidate));',
    '    process.exit(0);',
    '  }',
    '}',
    '',
    "console.error('Could not resolve the Oh My Goal plugin root. Set OH_MY_GOAL_PLUGIN_ROOT to the directory containing scripts/create-harness.mjs.');",
    'process.exit(2);',
  ]);
}

function teamRuntimeCommand({ objective, slug, requireInteractive = false, mode = 'auto' }) {
  return pluginScriptCommand({
    slug,
    script: 'team-runtime.mjs',
    args: [
      'launch',
      '--objective',
      objectiveFileShellArg(slug),
      '--team',
      shellQuote(slug),
      '--workers',
      '3',
      '--mode',
      mode,
      ...(requireInteractive ? ['--require-interactive'] : []),
      '--json',
    ],
  });
}

function pressureRuntimeInitCommand({ objective, slug, route }) {
  return pluginScriptCommand({
    slug,
    script: 'pressure-runtime.mjs',
    args: [
      'init',
      '--objective',
      objectiveFileShellArg(slug),
      '--slug',
      shellQuote(slug),
      '--route',
      shellQuote(route),
      '--json',
    ],
  });
}

function pressureRuntimeGateCommand({ slug }) {
  return pluginScriptCommand({
    slug,
    script: 'pressure-runtime.mjs',
    args: [
      'gate',
      '--slug',
      shellQuote(slug),
      '--evidence-json',
      '<completion-evidence-json-or-path>',
      '--json',
    ],
  });
}

function designSystemCommand({ objective, slug, answers }) {
  const mode = selectedDesignSystemMode(answers);
  return pluginScriptCommand({
    slug,
    script: 'design-system-runtime.mjs',
    args: [
      '--objective',
      objectiveFileShellArg(slug),
      '--slug',
      shellQuote(slug),
      '--stack',
      shellQuote(answerValue(answers, 'stack', 'auto')),
      '--mode',
      shellQuote(mode),
      '--persist',
      '--json',
    ],
  });
}

function deploymentRuntimeCommand({ objective, slug, answers, command = 'plan', execute = false, credentialSetup }) {
  return pluginScriptCommand({
    slug,
    script: 'deployment-runtime.mjs',
    args: [
      command,
      '--objective',
      objectiveFileShellArg(slug),
      '--slug',
      shellQuote(slug),
      '--target',
      shellQuote(canonicalAnswerValue(answers, 'deploymentTarget', 'deployment-plan-only')),
      '--llm',
      shellQuote(canonicalAnswerValue(answers, 'llmApi', 'no-llm-api')),
      '--auth',
      shellQuote(canonicalAnswerValue(answers, 'authProvider', 'no-auth')),
      '--framework',
      shellQuote(canonicalAnswerValue(answers, 'stack', 'auto')),
      '--credential-setup',
      shellQuote(credentialSetup || canonicalAnswerValue(answers, 'credentialSetup', 'secure-terminal-prompt')),
      ...(execute ? ['--execute'] : []),
      '--json',
    ],
  });
}

function postSecretCredentialSetup(answers) {
  const selected = canonicalAnswerValue(answers, 'credentialSetup', 'secure-terminal-prompt');
  if (selected === 'secure-terminal-prompt') return 'already-configured-vercel-env';
  return selected;
}

function ambiguityRows(objective, answers) {
  const prdDefault = /(prd|product requirements|requirements|요구사항|기획|스펙|spec)/i.test(objective)
    ? 'Assume next-version PRD'
    : 'Infer from objective';
  return [
    ['objective', objective.replace(/\|/g, '/'), 'low', 'Trailing text after `$oh-my-goal` is the objective.'],
    ['deliverable scope', answerValue(answers, 'deliverableScope', prdDefault), 'medium', 'Confirm if this changes output shape.'],
    ['primary reader', answerValue(answers, 'audience', 'Assume builder/PM'), 'medium', 'Tune document and prompt language to reader.'],
    ['source context', answerValue(answers, 'sourceContext', 'Assume repo plus user answers'), 'medium', 'Do not inspect vendor/generated trees by default.'],
    ['completion evidence', answerValue(answers, 'acceptance', 'Needs concrete artifact or behavior'), 'high', 'Map every deliverable to evidence.'],
    ['scope boundary', answerValue(answers, 'nonGoals', 'Needs explicit non-goals'), 'high', 'Prevent useful-looking expansion.'],
    ['verification', answerValue(answers, 'verification', 'Needs command or inspectable artifact'), 'high', 'Run or record the verification path.'],
  ];
}

function designIntegrationLines(mode) {
  if (mode === 'skip-design-system') {
    return [
      '## Integration With Oh My Goal',
      '- Design-system generation was explicitly skipped in intake.',
      '- The designer lane should enforce only the minimal UI safety gate in this file.',
      '- The implementer lane should preserve existing UI conventions and avoid broad styling work.',
      '- The tester lane should still reject text overlap, mobile overflow, broken focus states, and unreadable contrast.',
    ];
  }
  if (mode === 'lightweight-design-checklist') {
    return [
      '## Integration With Oh My Goal',
      '- The designer lane owns the lightweight checklist, not a full token system.',
      '- The implementer lane should use existing repo styles unless the checklist exposes a concrete gap.',
      '- The tester lane must verify responsive breakpoints, contrast, focus states, and text overflow.',
      '- The critic lane must reject speculative polish that was not kept in `pruning-matrix.md`.',
    ];
  }
  if (mode === 'match-existing-design-system') {
    return [
      '## Integration With Oh My Goal',
      '- The designer lane must inspect existing repo tokens, CSS variables, components, spacing, typography, and icons before adding anything new.',
      '- The implementer lane must map UI files/components back to existing conventions first, then to the fallback guidance in this file only when gaps remain.',
      '- The tester lane must verify responsive breakpoints, contrast, focus states, and text overflow.',
      '- The critic lane must reject UI that conflicts with established repository design patterns.',
    ];
  }
  return [
    '## Integration With Oh My Goal',
    '- The designer lane owns first-pass interpretation of this file.',
    '- The implementer lane must map UI files/components back to this file.',
    '- The tester lane must verify responsive breakpoints, contrast, focus states, and text overflow.',
    '- The critic lane must reject decorative UI that violates the selected design system or expands scope.',
  ];
}

function designRuntimeSection(mode, slug, designCommand) {
  if (mode === 'skip-design-system') {
    return [
      '## Design-System Runtime',
      '',
      'Skipped by intake. Do not auto-start a design-system generator for this harness unless the user changes the design-system mode.',
      '',
      'Use `design-system.md` only as the explicit skip record and minimal UI safety gate.',
    ];
  }
  if (mode === 'lightweight-design-checklist') {
    return [
      '## Design-System Runtime',
      '',
      'A lightweight checklist was already written to `design-system.md`. Do not auto-start the full design-system runtime unless UI quality becomes a material blocker or the user approves a deeper design pass.',
      '',
      'Optional refresh command if the leader needs a persisted lightweight copy:',
      '',
      '```sh',
      designCommand,
      '```',
    ];
  }
  const intro = mode === 'match-existing-design-system'
    ? 'Run this before UI implementation after inspecting existing repo UI conventions. It persists `.omg/design-systems/' + slug + '/MASTER.md` with repository-first alignment plus fallback guidance.'
    : 'Run this before UI implementation. It persists `.omg/design-systems/' + slug + '/MASTER.md` and keeps website/app design choices explicit.';
  return [
    '## Design-System Runtime Auto-Start',
    '',
    intro,
    '',
    '```sh',
    designCommand,
    '```',
    '',
    'Use `design-system.md` as the harness-local copy and `.omg/design-systems/' + slug + '/MASTER.md` as durable runtime state.',
  ];
}

function designHarnessStep(mode) {
  if (mode === 'skip-design-system') return '6. Design-system mode is `skip-design-system`; follow the minimal UI safety gate in `design-system.md` without generating a full visual system.';
  if (mode === 'lightweight-design-checklist') return '6. Design-system mode is `lightweight-design-checklist`; apply the compact UI checklist in `design-system.md` before UI implementation.';
  if (mode === 'match-existing-design-system') return '6. Design-system mode is `match-existing-design-system`; inspect existing repo conventions first, then use `design-system.md` only to fill gaps.';
  return '6. Generate or refresh `design-system.md` before UI implementation.';
}

function designCompletionEvidence(mode) {
  if (mode === 'skip-design-system') return { status: 'skipped', evidence: 'design-system.md records skip decision and minimal UI safety checks were considered' };
  if (mode === 'lightweight-design-checklist') return { status: 'passed', evidence: 'lightweight design checklist applied and responsive/a11y checks recorded' };
  if (mode === 'match-existing-design-system') return { status: 'passed', evidence: 'existing repo design conventions were inspected and applied; fallback guidance used only for gaps' };
  return { status: 'passed', evidence: 'design-system.md applied and responsive/a11y checks recorded' };
}

async function askMissing(objective, answers) {
  const next = { ...answers };
  const rl = createInterface({ input, output });
  try {
    if (!objective.trim()) {
      objective = (await rl.question('What do you want to build or improve? ')).trim();
    }
    for (const entry of intakeQuestionsForObjective(objective)) {
      const key = entry.id;
      if (typeof next[key] === 'string' && next[key].trim()) continue;
      next[key] = (await rl.question(formatQuestion(entry))).trim();
    }
  } finally {
    rl.close();
  }
  return { objective, answers: next };
}

async function readAnswers(args) {
  const raw = args.answersFile ? await readFile(args.answersFile, 'utf-8') : args.answersJson;
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return answersArrayToObject(parsed);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('answers JSON must be an object.');
  }
  if (Array.isArray(parsed.answers)) return answersArrayToObject(parsed.answers);
  return parsed;
}

function answersArrayToObject(answers) {
  const normalized = {};
  for (const entry of answers) {
    if (!entry || typeof entry !== 'object') continue;
    const key = typeof entry.question_id === 'string' ? entry.question_id.trim() : '';
    if (!key) continue;
    const selected = Array.isArray(entry.answer?.selected_values)
      ? entry.answer.selected_values.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    const value = selected.length > 0
      ? selected.join(', ')
      : String(entry.answer?.value || entry.answer?.other_text || '').trim();
    if (value) normalized[key] = value;
  }
  return normalized;
}

function complexTeamSignalText(objective, answers) {
  return `${objective}\n${Object.values(answers).join('\n')}`.toLowerCase();
}

function hasComplexProductShape(text) {
  const bulletCount = text.split(/\r?\n/).filter((line) => /^\s*(?:[-*•]|\d+[.)]|단계\s*\d+)/i.test(line)).length;
  const stageCount = (text.match(/단계\s*\d+|step\s*\d+|산출물|데이터 모델|구현 지시|adapter|resolver|service|graph|api route|serverless|vercel|테스트|검증|배포/gi) || []).length;
  return bulletCount >= 8 || stageCount >= 6;
}

function routeFor(objective, answers) {
  const text = complexTeamSignalText(objective, answers);
  if (/(agent|worker|team|parallel|orchestrat|multi|subagent|swarm|mirofish|oasis|에이전트|멀티|병렬|오케스트|팀|워커|시뮬레이션)/.test(text)) return 'agent_orchestrated';
  if (hasComplexProductShape(text)) return 'agent_orchestrated';
  if (/(long|persistent|loop|resume|goal|harness|autonom)/.test(text)) return 'persistent_goal_loop';
  return 'goal_first';
}

function outputModeDefersImplementation(answers) {
  const text = comparable([
    answerValue(answers, 'outputMode', ''),
    answerValue(answers, 'handoffTarget', ''),
    answerValue(answers, 'deliverableScope', ''),
    answerValue(answers, 'nonGoals', ''),
  ].join(' '));
  return /harness only|harness-only|goal prompt only|goal-prompt-only|prd only|prd-only|spec first|spec-first|no implementation|no-implementation|문서 먼저|하네스만|구현하지 않|구현 금지/.test(text);
}

function explicitlyDisablesTeam(answers) {
  const text = comparable([
    answerValue(answers, 'workerLanes', ''),
    answerValue(answers, 'localOptimum', ''),
  ].join(' '));
  return /leader only|leader-only|single session|single-session|sequential only|sequential-only|skip workers|no workers|no-workers|skip team|no team|팀 없음|워커 없음|단일 세션/.test(text);
}

function hasImplementationSignal(objective, answers) {
  const text = comparable(complexTeamSignalText(objective, answers));
  const implementationKeys = ['stack', 'ux', 'outputMode', 'edgeCases', 'dataPersistence', 'visualPolishLevel'];
  return implementationKeys.some((key) => typeof answers[key] === 'string' && answers[key].trim())
    || /(implement|build|make|create|ship|fix|code|website|web app|frontend|ui|app|tool|dashboard|calculator|구현|개발|만들|웹|앱|사이트|도구|계산기)/i.test(text);
}

function requiresVisibleTeam(objective, answers, route) {
  if (explicitlyDisablesTeam(answers)) return false;
  if (outputModeDefersImplementation(answers)) return false;
  const text = complexTeamSignalText(objective, answers);
  return hasImplementationSignal(objective, answers)
    || route === 'agent_orchestrated'
    || hasComplexProductShape(text)
    || /(multi-agent|multi agent|subagent|worker lanes|parallel|swarm|mirofish|oasis|멀티에이전트|멀티 에이전트|병렬|팀 세션|워커)/i.test(text);
}

function promptSignalText(objective, answers) {
  const values = Object.entries(answers).flatMap(([key, value]) => {
    if (!contributesToPromptSignals(answers, key, value)) return [];
    return [String(value || '')];
  });
  return `${objective} ${values.join(' ')}`.toLowerCase();
}

function promptSignals(objective, answers) {
  const text = promptSignalText(objective, answers);
  const deploymentTarget = canonicalAnswerValue(answers, 'deploymentTarget', 'deployment-plan-only');
  const llmApi = canonicalAnswerValue(answers, 'llmApi', 'no-llm-api');
  const authProvider = canonicalAnswerValue(answers, 'authProvider', 'no-auth');
  const zepRequested = objectiveNeedsZep(objective) || hasPositiveSignal(text, ZEP_RE, NEGATED_ZEP_RE);
  return {
    text,
    vercel: deploymentTarget.includes('vercel') || hasPositiveSignal(text, DEPLOYMENT_RE, NEGATED_DEPLOYMENT_RE),
    github: GITHUB_RE.test(text),
    llm: llmApi !== 'no-llm-api' || hasPositiveSignal(text, LLM_RE, NEGATED_LLM_RE),
    auth: authProvider !== 'no-auth' || hasPositiveSignal(text, AUTH_RE, NEGATED_AUTH_RE),
    zep: zepRequested && !NEGATED_ZEP_RE.test(text),
    marketResearch: MARKET_RESEARCH_RE.test(text),
    webApp: WEB_APP_RE.test(text),
    mvp: MVP_RE.test(text),
    serverSide: SERVER_SIDE_RE.test(text),
  };
}

function promptTargetOutcome(objective, answers, signals = promptSignals(objective, answers)) {
  const scope = comparable(answerValue(answers, 'deliverableScope', ''));
  if (signals.marketResearch && signals.webApp) {
    const locale = KOREAN_RE.test(signals.text) ? 'Korean ' : '';
    const deployment = signals.vercel ? 'Vercel-deployable ' : '';
    const depth = signals.mvp || /minimal|mvp/.test(scope) ? 'MVP' : 'product slice';
    return `Target outcome: ${deployment}${depth} of the ${locale}AI-first market-research simulation platform.`;
  }
  if (signals.vercel && signals.webApp) return 'Target outcome: Vercel-deployable web MVP unless execution-spec.md narrows scope.';
  if (PLANNING_RE.test(signals.text)) return 'Target outcome: goal-ready planning artifacts and a completion-auditable handoff.';
  return 'Target outcome: satisfy execution-spec.md exactly; avoid broadening scope.';
}

function promptConstraintLines(objective, answers) {
  const signals = promptSignals(objective, answers);
  const constraints = [promptTargetOutcome(objective, answers, signals)];
  if (signals.llm || signals.auth || signals.zep || signals.serverSide) {
    const services = [
      signals.llm ? 'OpenAI/LLM' : undefined,
      signals.auth ? 'auth' : undefined,
      signals.zep ? 'Zep' : undefined,
    ].filter(Boolean).join(', ');
    constraints.push(`Keep ${services || 'external API'} calls server-side only; never expose raw secrets.`);
  }
  if (signals.zep) constraints.push('Use only ZEP_API_KEY for Zep; show sync failed in UI/report instead of ignoring memory errors.');
  if (signals.github || signals.vercel || signals.llm || signals.auth || signals.zep) {
    const gates = [
      signals.github ? 'GitHub' : undefined,
      signals.vercel ? 'Vercel' : undefined,
      signals.llm ? 'OpenAI/LLM' : undefined,
      signals.auth ? 'auth' : undefined,
      signals.zep ? 'Zep' : undefined,
    ].filter(Boolean).join('/');
    constraints.push(`${gates} credentials/URLs count only after real operations succeed; otherwise record explicit blockers.`);
  }
  if (signals.marketResearch) {
    constraints.push('Generate survey items from objective/problem signals only; never mix demo, calculator, or dummy questions into real questionnaires.');
    constraints.push('Report individual-vs-swarm comparison as synthetic stability/confidence, not factual market truth.');
  }
  return constraints.slice(0, 6);
}

function goalPrompt({ objective, slug, route, answers }) {
  const teamRequired = requiresVisibleTeam(objective, answers, route);
  return lines([
    `Complete the Oh My Goal harness objective in .omg/harness/${slug}/.`,
    '',
    `Full request: .omg/harness/${slug}/objective.txt. One Codex goal; harness files are authoritative.`,
    '',
    'Read before work: context-index.md, execution-spec.md, runtime-commands.md, completion-gate.md.',
    '',
    'Execution focus:',
    ...promptConstraintLines(objective, answers).map((constraint) => `- ${constraint}`),
    teamRequired
      ? '- Startup: run pressure + Team Auto-Start first; require "launched". If blocked, report cmux/tmux; no leader-only fallback.'
      : '- Use Team Auto-Start when worker lanes improve evidence; otherwise record why leader-only is sufficient.',
    '',
    'Before implementation, follow quality pruning, design, secret/auth, deployment, orchestration, and pressure-gate instructions.',
    'Only the leader may call update_goal({status: "complete"}) after the harness completion gate and pressure gate pass.',
    '',
    `Harness route: ${route}`,
  ]);
}

function specSectionValue(answers, key, fallback) {
  return answerValue(answers, key, fallback).replace(/\n{3,}/g, '\n\n');
}

function executionSpec({ objective, slug, route, answers }) {
  return lines([
    '# Execution Spec',
    '',
    `Objective: ${objective}`,
    `Harness: .omg/harness/${slug}/`,
    `Route: ${route}`,
    '',
    '## Product Intent',
    specSectionValue(answers, 'intent', 'Deliver the smallest result that satisfies the user objective while preserving explicit scope, verification, and non-goals.'),
    '',
    '## Scope Decisions',
    '- Deliverable scope: ' + specSectionValue(answers, 'deliverableScope', 'Infer from objective; confirm before broadening.'),
    '- Target reader/user: ' + specSectionValue(answers, 'audience', 'Builder/PM or Codex goal executor.'),
    '- Source context: ' + specSectionValue(answers, 'sourceContext', 'Repository plus user-approved intake answers.'),
    '- Handoff mode: ' + specSectionValue(answers, 'handoffTarget', specSectionValue(answers, 'outputMode', 'Goal-ready harness plus recommended prompt.')),
    '',
    '## Functional Requirements',
    specSectionValue(answers, 'acceptance', 'Define concrete behavior or artifacts before implementation. Map each requirement to evidence in `completion-gate.md`.'),
    '',
    '## UX And Interface Requirements',
    '- UX direction: ' + specSectionValue(answers, 'ux', 'Use the repository/product default.'),
    '- Design-system mode: ' + selectedDesignSystemMode(answers),
    '- Visual polish level: ' + specSectionValue(answers, 'visualPolishLevel', 'Polished enough for the selected scope; avoid unrelated decorative work.'),
    '- Accessibility and edge cases: ' + specSectionValue(answers, 'edgeCases', 'Cover core happy path, obvious invalid input, and responsive behavior when relevant.'),
    '- Quality frontier: ' + answerList(answers, 'qualityFrontier', ['User-visible quality, reliability, maintainability, and verification strength.']).join('; '),
    '- Pruned quality focus: ' + answerList(answers, 'qualityPruning', ['Prefer quality improvements that improve user value or reduce false completion without scope creep.']).join('; '),
    '- Pruning rule: ' + specSectionValue(answers, 'pruningRule', 'Maximize useful quality within the current scope.'),
    '',
    '## Technical Constraints',
    '- Stack: ' + specSectionValue(answers, 'stack', 'Match existing repository stack unless the user approved a new scaffold.'),
    '- Dependency policy: ' + specSectionValue(answers, 'dependencyPolicy', 'Do not add dependencies without evidence that they reduce risk or complexity.'),
    '- State and persistence: ' + specSectionValue(answers, 'dataPersistence', 'Do not add persistence unless the objective or intake requires it.'),
    '- LLM API: ' + specSectionValue(answers, 'llmApi', 'No LLM API unless explicitly selected.'),
    '- Auth provider: ' + specSectionValue(answers, 'authProvider', 'No auth unless explicitly selected.'),
    '- Secret handling: ' + specSectionValue(answers, 'secretHandling', 'Use secure env prompts or placeholders; never commit real secrets.'),
    '- Credential setup: ' + specSectionValue(answers, 'credentialSetup', 'Use secure terminal prompts or preconfigured environment variables; never paste raw secrets into chat.'),
    '',
    '## Deployment Constraints',
    '- Deployment target: ' + specSectionValue(answers, 'deploymentTarget', 'Deployment plan only unless Vercel was selected.'),
    '- Vercel evidence: deployment URL, inspected build output, and env-var configuration proof without exposing secret values.',
    '- OpenAI/API evidence: server-side env var name, route boundary, and a smoke path that proves client code does not contain secret values.',
    '- Auth evidence: provider configuration, protected route or auth smoke check, and callback URL handling when deployment is enabled.',
    '',
    '## Non-Goals',
    specSectionValue(answers, 'nonGoals', 'No unrelated refactors, broad rewrites, external releases, or scope expansion without approval.'),
    '',
    '## Verification Plan',
    '- Verification choice: ' + specSectionValue(answers, 'verification', 'Identify and run an appropriate repository-specific check.'),
    '- Concrete verification path: ' + specSectionValue(answers, 'verificationCommand', 'Record command, browser inspection path, or artifact review before completion.'),
    '- Required evidence: command output or inspected artifact path, plus a short note explaining what passed.',
    '',
    '## Agent Work Breakdown',
    '- Leader: owns the single Codex goal, spec interpretation, trajectory selection, and completion gate.',
    '- Architect lane: checks structure, integration points, and constraints.',
    '- Implementer lane: executes the selected path and reports files changed.',
    '- Tester lane: runs or designs verification probes and records observed output.',
    '- Critic lane: challenges scope, hidden assumptions, and false completion.',
    '- Replanner lane: proposes an alternate trajectory if evidence weakens the selected path.',
    '',
    '## Completion Contract',
    'Completion requires every functional requirement, non-goal, and verification item above to map to evidence in `completion-gate.md`; the leader may call `update_goal({status: "complete"})` only after that audit passes.',
  ]);
}

function artifactMap({ objective, slug, route, answers }) {
  const prompt = goalPrompt({ objective, slug, route, answers });
  const designSystemMode = selectedDesignSystemMode(answers);
  const teamRequired = requiresVisibleTeam(objective, answers, route);
  const autoTeamCommand = teamRuntimeCommand({ objective, slug, requireInteractive: teamRequired });
  const plannedTeamCommand = teamRuntimeCommand({ objective, slug, mode: 'dry-run' });
  const pressureInitCommand = pressureRuntimeInitCommand({ objective, slug, route });
  const pressureGateCommand = pressureRuntimeGateCommand({ slug });
  const designCommand = designSystemCommand({ objective, slug, answers });
  const deploymentCommand = deploymentRuntimeCommand({ objective, slug, answers });
  const deploymentCheckCommand = deploymentRuntimeCommand({ objective, slug, answers, command: 'check' });
  const deploymentSetupEnvCommand = deploymentRuntimeCommand({ objective, slug, answers, command: 'setup-env' });
  const deploymentSetupEnvExecuteCommand = deploymentRuntimeCommand({ objective, slug, answers, command: 'setup-env', execute: true });
  const deploymentDeployCommand = deploymentRuntimeCommand({ objective, slug, answers, command: 'deploy' });
  const deploymentPostSecretCheckCommand = deploymentRuntimeCommand({ objective, slug, answers, command: 'check', execute: true, credentialSetup: postSecretCredentialSetup(answers) });
  const deploymentPostSecretExecuteCommand = deploymentRuntimeCommand({ objective, slug, answers, command: 'deploy', execute: true, credentialSetup: postSecretCredentialSetup(answers) });
  const designSystem = buildDesignSystem({
    objective,
    projectName: slug,
    stack: answerValue(answers, 'stack', 'auto'),
    mode: designSystemMode,
  });
  const designSystemMarkdown = formatDesignSystemMarkdown(designSystem);
  const pressureStatusCommand = pluginScriptCommand({ slug, script: 'pressure-runtime.mjs', args: ['status', '--slug', shellQuote(slug), '--json'] });
  const pressureTeamCommand = pluginScriptCommand({ slug, script: 'pressure-runtime.mjs', args: ['team-command', '--slug', shellQuote(slug), '--json'] });
  const cmuxBridgeStartCommand = pluginScriptCommand({ slug, script: 'cmux-bridge-runtime.mjs', args: ['start', '--cwd', '"$PWD"', '--root', shellQuote('.omg/runtime/cmux-bridge')] });
  const cmuxBridgeStatusCommand = pluginScriptCommand({ slug, script: 'cmux-bridge-runtime.mjs', args: ['status', '--cwd', '"$PWD"', '--root', shellQuote('.omg/runtime/cmux-bridge'), '--json'] });
  const cmuxBridgeStopCommand = pluginScriptCommand({ slug, script: 'cmux-bridge-runtime.mjs', args: ['stop', '--cwd', '"$PWD"', '--root', shellQuote('.omg/runtime/cmux-bridge'), '--json'] });
  const pressureRecordBaselineCommand = pluginScriptCommand({
    slug,
    script: 'pressure-runtime.mjs',
    args: ['record', '--slug', shellQuote(slug), '--id', 'T001-baseline', '--summary', '"<baseline path>"', '--evidence', '"<files/commands/observations>"', '--score', '<0-100>', '--novelty-score', '10', '--json'],
  });
  const pressureRecordNoveltyCommand = pluginScriptCommand({
    slug,
    script: 'pressure-runtime.mjs',
    args: ['record', '--slug', shellQuote(slug), '--id', 'T002-novelty', '--source', 'worker', '--role', 'replanner', '--summary', '"<different path>"', '--evidence', '"<files/commands/observations>"', '--score', '<0-100>', '--novelty-score', '70', '--json'],
  });
  const pressureSelectCommand = pluginScriptCommand({
    slug,
    script: 'pressure-runtime.mjs',
    args: ['select', '--slug', shellQuote(slug), '--trajectory-id', '<id>', '--evidence', '"<why this path beats alternatives>"', '--json'],
  });
  const teamStatusCommand = pluginScriptCommand({ slug, script: 'team-runtime.mjs', args: ['status', '--team', shellQuote(slug), '--json'] });
  const teamTickCommand = pluginScriptCommand({ slug, script: 'team-runtime.mjs', args: ['tick', '--team', shellQuote(slug), '--pressure-slug', shellQuote(slug), '--close-idle-minutes', '10', '--json'] });
  const teamWatchCommand = pluginScriptCommand({ slug, script: 'team-runtime.mjs', args: ['watch', '--team', shellQuote(slug), '--pressure-slug', shellQuote(slug), '--interval-ms', '5000', '--stale-minutes', '10', '--close-idle-minutes', '10', '--close-completed', '--notify', '--json'] });
  const teamCollectCommand = pluginScriptCommand({ slug, script: 'team-runtime.mjs', args: ['collect', '--team', shellQuote(slug), '--json'] });
  const teamShutdownCommand = pluginScriptCommand({ slug, script: 'team-runtime.mjs', args: ['shutdown', '--team', shellQuote(slug), '--json'] });
  const pressureImportTeamCommand = pluginScriptCommand({ slug, script: 'pressure-runtime.mjs', args: ['import-team', '--slug', shellQuote(slug), '--team', shellQuote(slug), '--json'] });
  return {
    'objective.txt': objective,
    'context-index.md': lines([
      `# Oh My Goal Harness: ${slug}`,
      '',
      `Objective: ${objective}`,
      `Route: ${route}`,
      '',
      'Read order for the Codex goal:',
      '1. `goal-prompt.md`',
      '2. `objective.txt`',
      '3. `ambiguity-map.md`',
      '4. `intake-questionnaire.md`',
      '5. `deep-interview.md`',
      '6. `execution-spec.md`',
      '7. `quality-frontier.md`',
      '8. `pruning-matrix.md`',
      '9. `selected-strategy.md`',
      '10. `design-system.md`',
      '11. `secrets-and-auth.md`',
      '12. `deployment.md`',
      '13. `harness.md`',
      '14. `runtime-commands.md`',
      '15. `plugin-root-resolver.mjs`',
      '16. `agents.md`',
      '17. `orchestration.md`',
      '18. `team-system.md`',
      '19. `worker-packet-template.md`',
      '20. `trajectory-ledger.md`',
      '21. `state-ledger.md`',
      '22. `local-optimum-pressure.md`',
      '23. `completion-gate.md`',
      '',
      'The Codex goal owns active focus and token accounting. These files provide local durable context and evidence structure.',
    ]),
    'ambiguity-map.md': lines([
      '# Ambiguity Map',
      '',
      `Objective: ${objective}`,
      '',
      'This map follows the Oh My Goal deep-interview pattern: resolve material ambiguity, record safe assumptions, and keep non-goals plus decision boundaries explicit.',
      '',
      markdownTable(['Dimension', 'Current default or answer', 'Risk', 'Resolution rule'], ambiguityRows(objective, answers)),
    ]),
    'intake-questionnaire.md': lines([
      '# Intake Questionnaire',
      '',
      'Invocation contract:',
      '- `$oh-my-goal <objective>` means the trailing text is the objective.',
      '- Do not ask for the objective again when trailing text exists.',
      '- Batch independent high-leverage questions into one structured round when the surface supports it.',
      '- If structured input is unavailable, ask a numbered prose block and wait for all answers in one user turn.',
      '',
      'Gap-fill contract:',
      '1. Assimilate the answer into scope, non-goals, acceptance, verification, and handoff target.',
      '2. Rescan repo context, prior turns, and conservative defaults. Ask focused follow-up questions until residual ambiguity is below threshold.',
      '',
      markdownTable(
        ['Key', 'Question', 'Recorded answer'],
        intakeQuestionsForObjective(objective).map((entry) => [
          entry.id,
          entry.question.replace(/\|/g, '/'),
          answerValue(answers, entry.id, 'Unresolved'),
        ]),
      ),
    ]),
    'deep-interview.md': lines([
      '# Deep Interview',
      '',
      `## Objective`,
      objective,
      '',
      '## Deliverable Scope',
      answerValue(answers, 'deliverableScope', 'Infer from objective.'),
      '',
      '## Primary Reader',
      answerValue(answers, 'audience', 'Assume builder/PM.'),
      '',
      '## Source Context',
      answerValue(answers, 'sourceContext', 'Assume repo plus user answers.'),
      '',
      '## Acceptance',
      answers.acceptance || 'Unresolved. Ask the user for concrete completion evidence.',
      '',
      '## Non-goals',
      answers.nonGoals || 'Unresolved. Ask what must stay out of scope.',
      '',
      '## Verification',
      answers.verification || 'Unresolved. Discover repo checks and confirm with the user.',
      '',
      '## Constraints And Risks',
      answers.constraints || 'None recorded yet.',
      '',
      '## Worker Lanes',
      answers.workerLanes || 'Default to sequential leader work unless independent evidence lanes are useful.',
      '',
      '## Local-Optimum Pressure',
      answers.localOptimum || 'Use baseline vs novelty path, critic review, and verification probes before completion.',
      '',
      '## Quality Pruning',
      '- Quality frontier: ' + answerList(answers, 'qualityFrontier', ['Unresolved. Generate candidates across UX, reliability, maintainability, verification, and extensibility before selecting a path.']).join('; '),
      '- Pruned focus: ' + answerList(answers, 'qualityPruning', ['Unresolved. Keep only quality candidates that improve the objective without scope creep.']).join('; '),
      '- Pruning rule: ' + answerValue(answers, 'pruningRule', 'Maximize useful quality within current scope.'),
    ]),
    'goal-prompt.md': lines([
      '# Recommended Codex Goal Prompt',
      '',
      '```text',
      prompt,
      '```',
    ]),
    'execution-spec.md': executionSpec({ objective, slug, route, answers }),
    'quality-frontier.md': lines([
      '# Quality Frontier',
      '',
      'Purpose: expand the search space before the goal converges on the first plausible plan. This is separate from ambiguity reduction.',
      '',
      `Objective: ${objective}`,
      '',
      '## User-Approved Frontier',
      ...answerList(answers, 'qualityFrontier', [
        'User-visible value and workflow polish',
        'Reliability, edge cases, and failure handling',
        'Maintainable structure and future change cost',
        'Verification depth that can catch false completion',
      ]).map((item) => `- ${item}`),
      '',
      '## Candidate Quality Lenses',
      markdownTable(
        ['Lens', 'What Better Means', 'Evidence Probe'],
        [
          ['User workflow', 'The result feels natural and efficient for the target task.', 'Inspect the main flow, friction, responsive behavior, and empty/error states.'],
          ['Reliability', 'Important edge cases fail clearly or work correctly.', 'List edge cases and test or manually verify representative ones.'],
          ['Maintainability', 'The implementation remains simple, local, and easy to change.', 'Review file boundaries, duplication, dependency cost, and naming.'],
          ['Verification', 'The chosen checks can disprove false completion.', 'Prefer concrete commands, browser probes, artifacts, or reviewed outputs.'],
          ['Extensibility', 'Future change is possible without doing speculative scope work now.', 'Name extension points and explicitly reject premature features.'],
        ],
      ),
      '',
      'Rule: generate candidates broadly, but do not implement every improvement. Use `pruning-matrix.md` to cut low-leverage or scope-expanding ideas.',
    ]),
    'pruning-matrix.md': lines([
      '# Pruning Matrix',
      '',
      'Purpose: choose which quality improvements survive before worker lanes spend time on them.',
      '',
      'User-approved pruning focus:',
      ...answerList(answers, 'qualityPruning', [
        'User-visible value first',
        'Verification and reliability first',
        'Simple maintainable core first',
      ]).map((item) => `- ${item}`),
      '',
      `Pruning rule: ${answerValue(answers, 'pruningRule', 'Maximize useful quality within current scope.')}`,
      '',
      markdownTable(
        ['Candidate', 'Keep / Cut', 'Reason', 'Owner Lane', 'Evidence Needed'],
        [
          ['Baseline direct implementation', 'Keep', 'Always compare against the simplest viable path.', 'leader/implementer', 'Files changed and core verification output.'],
          ['Highest user-visible quality candidate', 'Keep if scope-bounded', 'Useful when it improves the actual task experience.', 'architect/implementer', 'Workflow inspection or UI evidence.'],
          ['Reliability or verification candidate', 'Keep', 'Reduces false completion risk.', 'tester/critic', 'Edge-case probe or failing-risk analysis.'],
          ['Speculative polish or broad rewrite', 'Cut by default', 'Usually expands scope without proving the objective better.', 'critic', 'Only revive with explicit user approval.'],
          ['Novel alternate path', 'Keep one lane when uncertainty is high', 'Escapes local optima by testing a materially different route.', 'replanner', 'Comparison evidence against baseline.'],
        ],
      ),
      '',
      'Pruning invariant: a cut candidate must have a reason. A kept candidate must have an owner lane and evidence probe.',
    ]),
    'selected-strategy.md': lines([
      '# Selected Strategy',
      '',
      'Fill this before implementation or before committing to a PRD/spec direction.',
      '',
      '## Selected Path',
      '- ID: TBD',
      '- Summary: TBD',
      '- Why it satisfies the objective: TBD',
      '- How it uses the pruned quality focus: TBD',
      '',
      '## Rejected Or Deferred Quality Candidates',
      markdownTable(
        ['Candidate', 'Decision', 'Reason', 'Revisit Trigger'],
        [
          ['Speculative polish', 'defer', 'Not required unless it improves acceptance evidence.', 'User asks for higher polish or evidence shows UX is weak.'],
          ['Broad rewrite', 'reject by default', 'Too much blast radius for an initial goal path.', 'Architecture evidence shows current structure blocks acceptance.'],
        ],
      ),
      '',
      '## Required Comparison',
      '- Compare selected path against baseline direct path.',
      '- Compare selected path against at least one quality or novelty alternative when the task is non-trivial.',
      '- Record comparison evidence in `trajectory-ledger.md` or pressure runtime state before completion.',
    ]),
    'design-system.md': lines([
      designSystemMarkdown,
      '',
      ...designIntegrationLines(designSystemMode),
    ]),
    'secrets-and-auth.md': lines([
      '# Secrets And Auth',
      '',
      'Secret policy: never paste raw API keys or auth secrets into Codex chat, committed Markdown, screenshots, or generated source files.',
      '',
      `LLM API: ${answerValue(answers, 'llmApi', 'no-llm-api')}`,
      `Auth provider: ${answerValue(answers, 'authProvider', 'no-auth')}`,
      `Secret handling: ${answerValue(answers, 'secretHandling', 'vercel-env-secure-prompt')}`,
      `Credential setup: ${answerValue(answers, 'credentialSetup', 'secure-terminal-prompt')}`,
      '',
      '## Required Environment Variables',
      ...(envRequirementsFromAnswers(answers, objective).length > 0
        ? envRequirementsFromAnswers(answers, objective).map(([name, reason]) => `- \`${name}\` - ${reason}`)
        : ['- None from current intake answers.']),
      '',
      '## Safe Setup Flow',
      '1. Generate `.env.example` with variable names only when implementation needs it.',
      '2. For Vercel, use `vercel env add <NAME> preview` or `vercel env add <NAME> production`; enter values only in the secure prompt.',
      '3. For local runs, use `.env.local`, shell env, or platform secrets. Keep `.env.local` uncommitted.',
      '4. Verify server-only variables never appear in client bundles, public env names, or screenshots.',
      '5. If intake selected `env-example-and-stop`, stop before deploy and report the generated `.omg/runtime/deployment/<slug>/.env.example` path.',
    ]),
    'deployment.md': lines([
      '# Deployment',
      '',
      `Deployment target: ${answerValue(answers, 'deploymentTarget', 'deployment-plan-only')}`,
      `Stack: ${answerValue(answers, 'stack', 'auto')}`,
      '',
      'Leader-owned deployment plan command:',
      '',
      '```sh',
      deploymentCommand,
      '```',
      '',
      'Leader-owned readiness and deployment commands:',
      '',
      '```sh',
      deploymentCheckCommand,
      deploymentSetupEnvCommand,
      deploymentSetupEnvExecuteCommand,
      deploymentPostSecretCheckCommand,
      deploymentDeployCommand,
      deploymentPostSecretExecuteCommand,
      '```',
      '',
      '## Vercel Policy',
      '- If target is `vercel-preview`, produce a preview URL after build verification when Vercel CLI is authenticated.',
      '- If target is `vercel-production`, deploy production only after tests/build and completion-gate evidence pass.',
      '- If Vercel CLI is not installed or authenticated, record that blocker and leave exact commands in `.omg/runtime/deployment/<slug>/deployment-plan.md`.',
      '- If secrets are required, run `setup-env` as a dry run first; run `setup-env --execute` only in an attached terminal so Vercel can prompt securely.',
      '- Never block local implementation on secrets that can be represented as placeholders, but do block deployment completion until required env vars are configured.',
      '- Use `deploy --execute` only when readiness passes and secrets are configured outside chat.',
      '',
      '## Evidence Required',
      '- Build command and inspected output.',
      '- Vercel URL or explicit deployment blocker.',
      '- Required environment variable names configured without exposing values.',
      '- Auth/LLM smoke check when selected.',
      '- `.omg/runtime/deployment/<slug>/.env.example` generated when env vars are required.',
    ]),
    'harness.md': lines([
      '# Harness',
      '',
      '1. Treat trailing text after `$oh-my-goal` as the objective.',
      '2. Build an ambiguity map before asking questions.',
      '3. Batch independent high-leverage ambiguity questions into one structured intake round when possible.',
      '4. Run gap-fill passes after answers: assimilation, residual critical-gap scan, then follow-up questions until ambiguity is low enough.',
      '5. Run quality frontier expansion and pruning before selecting a path.',
      designHarnessStep(designSystemMode),
      '7. Read `secrets-and-auth.md` before adding LLM API calls or auth.',
      '8. Read `deployment.md` before Vercel setup or deploy attempts.',
      '9. Create or reuse one Codex goal with the prompt in `goal-prompt.md`.',
      '10. Read `runtime-commands.md` and initialize pressure runtime before selecting a path.',
      '11. Auto-start Team runtime when independent lanes improve quality.',
      '12. Execute the selected trajectory with evidence checkpoints.',
      '13. Add worker lanes only when they create independent evidence.',
      '14. Give every worker a packet from `worker-packet-template.md`.',
      '15. Record candidate paths in `trajectory-ledger.md`.',
      '16. Checkpoint leader decisions in `state-ledger.md`.',
      '17. Run pressure runtime gate before late completion.',
      '18. Complete only after design, secret/auth, deployment, completion, and pressure gates pass for the selected scope.',
      '',
      'State convention:',
      '- Append leader notes and evidence to these Markdown files.',
      '- Keep generated code and tests in normal project paths.',
      '- Keep goal ownership in the leader session.',
    ]),
    'agents.md': lines([
      '# Agent And Worker Lanes',
      '',
      'Leader:',
      '- owns get_goal, create_goal, update_goal, final selection, and completion.',
      '- maps every result back to acceptance criteria.',
      '',
      'Architect lane:',
      '- proposes architecture and risk boundaries.',
      '',
      'Implementer lane:',
      '- produces focused diffs or implementation notes.',
      '',
      'Tester lane:',
      '- identifies and runs verification probes.',
      '',
      'Designer lane:',
      '- applies `design-system.md`, checks responsive/a11y/polish requirements, and rejects ungrounded decorative UI.',
      '',
      'Deployer lane:',
      '- prepares Vercel/env evidence from `deployment.md` and never handles raw secrets in chat.',
      '',
      'Critic lane:',
      '- tries to disprove the selected trajectory and completion claim.',
      '',
      'Replanner lane:',
      '- proposes a different path when evidence shows the current path is stuck.',
      '',
      'Worker boundary:',
      '- workers do not call create_goal.',
      '- workers do not call update_goal.',
      '- workers return evidence, diffs, risks, blockers, and scores.',
    ]),
    'runtime-commands.md': lines([
      '# Runtime Commands',
      '',
      'These commands are for the Codex goal leader. The user should not need to run them manually, except the optional cmux bridge start command when Codex reports `cmux_socket_permission_blocked` because that bridge must run outside the Codex sandbox.',
      '',
      'The commands resolve the installed Oh My Goal plugin root at runtime through `plugin-root-resolver.mjs`; no generated command depends on the machine that created this harness.',
      'Commands read the full user objective from `objective.txt`, so the recommended Codex goal prompt can stay below the objective-length limit.',
      'If resolution fails on a new machine, set `OH_MY_GOAL_PLUGIN_ROOT` to the installed plugin directory that contains `scripts/create-harness.mjs`.',
      '',
      '## Pressure Runtime Auto-Start',
      '',
      'Run this before selecting or implementing a path. It creates `.omg/runtime/pressure/' + slug + '/state.json` and seeds baseline, novelty, and critic trajectories that must later receive evidence.',
      '',
      '```sh',
      pressureInitCommand,
      '```',
      '',
      'Inspect pressure state:',
      '',
      '```sh',
      pressureStatusCommand,
      pressureTeamCommand,
      '```',
      '',
      'Record evidence-backed trajectories as work proceeds:',
      '',
      '```sh',
      pressureRecordBaselineCommand,
      pressureRecordNoveltyCommand,
      pressureSelectCommand,
      '```',
      '',
      'Before completion, run the pressure gate with the same evidence JSON used for the completion audit:',
      '',
      '```sh',
      pressureGateCommand,
      '```',
      '',
      ...designRuntimeSection(designSystemMode, slug, designCommand),
      '',
      '## Deployment And Secret Runtime',
      '',
      'Run this before Vercel deploy attempts or env setup. It writes `.omg/runtime/deployment/' + slug + '/deployment-plan.md`.',
      '',
      '```sh',
      deploymentCommand,
      '```',
      '',
      'After implementation, verify readiness and dry-run deployment:',
      '',
      '```sh',
      deploymentCheckCommand,
      deploymentSetupEnvCommand,
      deploymentDeployCommand,
      '```',
      '',
      'If secret env vars are required, run setup in an attached terminal before final readiness/deploy:',
      '',
      '```sh',
      deploymentSetupEnvExecuteCommand,
      deploymentPostSecretCheckCommand,
      '```',
      '',
      'Only after tests/build pass and required secrets are configured outside chat, execute deployment:',
      '',
      '```sh',
      deploymentPostSecretExecuteCommand,
      '```',
      '',
      'Secret rule: do not paste raw API keys into Codex chat. Use Vercel secure prompts, dashboard env vars, shell env, or uncommitted `.env.local` files.',
      '',
      '## CMUX Sandbox Bridge',
      '',
      'If Codex reports `cmux_socket_permission_blocked`, cmux itself is healthy but the Codex seatbelt sandbox cannot connect to `cmux.sock`. Start this bridge once from a normal cmux/terminal surface outside the sandbox, leave it running, then retry the Team or intake command. The bridge preserves realtime behavior by proxying `identify`, `new-pane`, `send`, `rename-tab`, `close-surface`, and related cmux calls through `.omg/runtime/cmux-bridge/` request/result files.',
      '',
      '```sh',
      cmuxBridgeStartCommand,
      '```',
      '',
      'Bridge status/stop:',
      '',
      '```sh',
      cmuxBridgeStatusCommand,
      cmuxBridgeStopCommand,
      '```',
      '',
      '## Team Runtime Auto-Start',
      '',
      teamRequired
        ? 'This harness requires visible worker lanes before implementation. Run this command and require `status: "launched"`; if it returns `blocked`, stop and report the cmux/tmux blocker instead of continuing as a leader-only run:'
        : 'Run this before implementation when independent evidence lanes improve quality, the route is `agent_orchestrated`, or architect/tester/critic separation is useful:',
      '',
      '```sh',
      autoTeamCommand,
      '```',
      '',
      'Explicit sequential fallback command, only after the user accepts no visible worker panes:',
      '',
      '```sh',
      plannedTeamCommand,
      '```',
      '',
      'Expected behavior:',
      '- Inside cmux, this opens visible worker panes in the current workspace, renames each surface as `OMG <worker> <role>`, and writes worker state.',
      '- Inside attached tmux, this opens visible worker panes and writes worker state.',
      teamRequired
        ? '- Outside cmux/tmux, the strict command returns `blocked`; do not silently collapse into single-session execution.'
        : '- Outside cmux/tmux, it returns planned state, still writes `.omg/runtime/team/' + slug + '/`, and the leader continues sequentially from worker packets.',
      '- Workers must write evidence to `.omg/runtime/team/' + slug + '/workers/<worker>/result.md`.',
      '- The leader should run the orchestrator tick after worker status/results change; it reclaims blocked work, creates follow-up tasks, assigns ready tasks, closes idle worker panes, and reopens hibernated lanes when new work lands.',
      '',
      'Sustained watch loop, recommended while worker panes are open:',
      '',
      '```sh',
      teamWatchCommand,
      '```',
      '',
      'The watch loop repeatedly runs `tick -> collect -> pressure import-team -> pressure status -> follow-up tick`, notifies visible workers when new work is assigned, creates bounded dynamic worker lanes when ready work exceeds available lanes, closes completed worker panes with no open tasks, and writes `.omg/runtime/team/' + slug + '/watch.ndjson`. Stop it before final shutdown or after pressure/completion gates pass.',
      '',
      '## CMUX Visibility',
      '',
      '```sh',
      'cmux tree --workspace "$CMUX_WORKSPACE_ID"',
      'cmux read-screen --workspace "$CMUX_WORKSPACE_ID" --surface <surface:id> --lines 80',
      '```',
      '',
      'Use `cmux tree` to see worker panes and renamed surfaces. Use `read-screen` only for observation; worker result files remain the source of truth.',
      '',
      '## Inspect And Collect',
      '',
      '```sh',
      teamStatusCommand,
      teamTickCommand,
      teamCollectCommand,
      pressureImportTeamCommand,
      '```',
      '',
      'Use `tick` before and after collection when worker output reveals blockers, low scores, missing evidence, or pressure-gate gaps. `--close-idle-minutes 10` hibernates visible panes with no open tasks and relaunches them automatically if later assigned work. Use `import-team` after workers write `result.md`; it converts Team evidence into pressure-runtime trajectories.',
      '',
      '## Cleanup',
      '',
      '```sh',
      teamShutdownCommand,
      '```',
      '',
      'If the resolver cannot locate the plugin after moving machines, install the plugin there or set `OH_MY_GOAL_PLUGIN_ROOT` explicitly.',
    ]),
    'plugin-root-resolver.mjs': pluginRootResolverSource(),
    'orchestration.md': lines([
      '# Orchestration',
      '',
      'Use native Codex subagents or available agent tools when present. If none are available, run the same lanes sequentially.',
      '',
      'This borrows the useful part of Oh My Goal Team: independent evidence lanes with explicit boundaries. It does not require an Oh My Goal launcher. The leader should auto-start the plugin Team runtime when independent lanes are useful.',
      '',
      'Auto-start command:',
      '',
      '```sh',
      pressureInitCommand,
      autoTeamCommand,
      '```',
      '',
      'The pressure runtime decides whether the apparent best path has enough independent evidence. Team runtime supplies optional visible worker lanes for that evidence.',
      '',
      'Dynamic allocation:',
      '- Run `team-runtime.mjs tick --team ' + slug + ' --pressure-slug ' + slug + ' --close-idle-minutes 10 --json` after workers report, block, or go stale.',
      '- For sustained execution, run `team-runtime.mjs watch --team ' + slug + ' --pressure-slug ' + slug + ' --interval-ms 5000 --close-idle-minutes 10 --close-completed --notify --json`; it repeats tick, collection, pressure import/status, follow-up assignment, bounded dynamic worker scaling, worker notification, and cleanup for completed worker panes.',
      '- The tick loop reads worker `status.json` and `result.md`, marks accepted tasks complete, creates follow-up work for revise/reject/block/low-score results, reclaims inactive work, routes ready tasks to available workers, closes idle visible panes, and reopens hibernated workers when new work is assigned.',
      '- Use `--notify` only when you want the runtime to send a short prompt into visible cmux/tmux worker panes.',
      '',
      teamRequired
        ? 'If the runtime reports `blocked`, `tmux_not_attached`, `cmux_unavailable`, `cmux_socket_permission_blocked`, or another non-launched response, first try the cmux sandbox bridge from `runtime-commands.md` when the blocker is socket permission. Otherwise stop and ask the user to restart from `cmux codex-teams`, an unsandboxed cmux terminal, or an attached tmux surface. Use sequential packets only after explicit user approval.'
        : 'If the runtime reports `tmux_not_attached`, `cmux_unavailable`, `cmux_socket_permission_blocked`, or another planned-state response, try the cmux sandbox bridge when the blocker is socket permission; otherwise use the generated `.omg/runtime/team/' + slug + '/workers/<worker>/prompt.md` packets sequentially.',
      '',
      'Recommended sequence:',
      '1. Leader frames the objective and acceptance map.',
      '2. Leader reads `execution-spec.md`, `quality-frontier.md`, `pruning-matrix.md`, `design-system.md`, `secrets-and-auth.md`, and `deployment.md`.',
      '3. Architect, designer, deployer, and critic propose competing trajectories, including at least one quality-focused alternative.',
      '4. Leader records the selected/pruned strategy in `selected-strategy.md`.',
      '5. Implementer executes the selected trajectory.',
      '6. Tester runs verification and records output.',
      '7. Deployer records Vercel/env evidence when deployment is in scope.',
      '8. Critic challenges completion, quality pruning, design fit, and deployment readiness.',
      '9. Leader updates the Codex goal only after the completion gate passes.',
      '',
      'Planning voices:',
      '- Metis: clarify material ambiguity and source facts before asking the user.',
      '- Momus: challenge assumptions, validation gaps, and overbroad scope.',
      '- Oracle: synthesize the goal prompt, worker lanes, and completion gate.',
      '',
      'Trajectory scoring:',
      '- score: confidence that the path satisfies acceptance criteria.',
      '- novelty score: how different the path is from the current plan.',
      '- risk: expected cost or failure mode.',
      '- evidence: file paths, commands, outputs, or concrete observations.',
    ]),
    'team-system.md': lines([
      '# Team System',
      '',
      'Goal:',
      'Preserve the useful Team orchestration pattern inside a Codex-native plugin harness.',
      '',
      'Core rules:',
      '- The leader owns the single Codex goal.',
      '- Workers own bounded evidence lanes.',
      '- Workers do not call create_goal.',
      '- Workers do not call update_goal.',
      '- Workers do not mark the mission complete.',
      '- Every lane returns evidence in a packet format.',
      teamRequired
        ? '- The leader must auto-start visible Team runtime from `runtime-commands.md` before implementation.'
        : '- The leader auto-starts Team runtime from `runtime-commands.md` when lane separation is useful.',
      '- In cmux, worker panes must be visible through `cmux tree` and named by worker id plus role.',
      '- The orchestrator may hibernate idle worker panes after the configured idle window and relaunch them when new work is assigned.',
      '',
      'Recommended lanes:',
      '',
      '| Lane | Purpose | Output |',
      '| --- | --- | --- |',
      '| architect | find architecture, boundaries, and integration risks | design notes, affected files, risk list |',
      '| implementer | produce focused changes or implementation plan | diff summary, files changed, blockers |',
      '| tester | validate behavior and failure modes | commands, outputs, missing coverage |',
      '| designer | apply the design-system artifact and UI quality checks | visual/a11y/responsive findings |',
      '| deployer | prepare Vercel/env/deployment evidence without raw secrets | deployment plan, URL, or blocker |',
      '| critic | attack assumptions and completion claim | unresolved blockers, false-positive risks |',
      '| replanner | escape stuck or low-quality paths | alternate trajectory and migration plan |',
      '',
      'When true parallel agents are unavailable, run the lanes sequentially and paste each result into `trajectory-ledger.md`.',
    ]),
    'worker-packet-template.md': lines([
      '# Worker Packet Template',
      '',
      'Copy this packet for each worker or sequential lane.',
      '',
      '```md',
      '# Worker Packet',
      '',
      'Role: <architect|implementer|tester|designer|deployer|critic|replanner>',
      'Task: <bounded task>',
      'Context files:',
      '- .omg/harness/' + slug + '/context-index.md',
      '- .omg/harness/' + slug + '/goal-prompt.md',
      '- .omg/harness/' + slug + '/completion-gate.md',
      '- .omg/harness/' + slug + '/design-system.md',
      '- .omg/harness/' + slug + '/secrets-and-auth.md',
      '- .omg/harness/' + slug + '/deployment.md',
      '',
      'Boundary:',
      '- Do not call create_goal.',
      '- Do not call update_goal.',
      '- Do not mark the whole mission complete.',
      '- Return evidence only.',
      '',
      'Required result:',
      '- Summary:',
      '- Evidence:',
      '- Files or artifacts:',
      '- Verification commands and observed output:',
      '- Risks or blockers:',
      '- Trajectory score 0-100:',
      '- Novelty score 0-100:',
      '- Recommendation: accept | reject | revise | block',
      '```',
    ]),
    'trajectory-ledger.md': lines([
      '# Trajectory Ledger',
      '',
      'Record candidate paths before selecting a plan. Keep at least two materially different trajectories before major commitment.',
      '',
      '| ID | Source | Role | Summary | Evidence | Score | Novelty | Status |',
      '| --- | --- | --- | --- | --- | ---: | ---: | --- |',
      '| T001 | leader | baseline | Conservative direct path | Pending | 0 | 0 | candidate |',
      '| T002 | worker | critic/replanner | Different path or constraint inversion | Pending | 0 | 0 | candidate |',
      '',
      'Selection rule:',
      '- Select a trajectory only after evidence beats alternatives.',
      '- Prefer the baseline only when the novelty path fails on evidence.',
      '- Prefer novelty only when it improves acceptance coverage, risk, or verification.',
      '- Prefer a quality candidate only when it survives `pruning-matrix.md` and has evidence beyond subjective polish.',
    ]),
    'state-ledger.md': lines([
      '# State Ledger',
      '',
      'Use this as a lightweight persistent leader loop. Append checkpoints instead of relying on memory.',
      '',
      '| Time | Phase | Decision | Evidence | Next action |',
      '| --- | --- | --- | --- | --- |',
      '| TBD | intake | Harness created | See deep-interview.md | Confirm unresolved questions |',
      '',
      'Phases:',
      '- intake: clarify objective and boundaries.',
      '- plan: compare trajectories.',
      '- execute: implement selected path.',
      '- pressure: critic/tester/replanner challenge.',
      '- gate: validate completion evidence.',
      '- complete: update Codex goal only after gate passes.',
    ]),
    'local-optimum-pressure.md': lines([
      '# Local-Optimum Pressure',
      '',
      'The harness treats execution as search, not immediate convergence. Runtime state is authoritative; do not rely only on this prose file.',
      '',
      'Pressure runtime:',
      '',
      '```sh',
      pressureInitCommand,
      pressureStatusCommand,
      pressureTeamCommand,
      pressureGateCommand,
      '```',
      '',
      'Runtime artifacts:',
      '- `.omg/runtime/pressure/' + slug + '/state.json`',
      '- `.omg/runtime/pressure/' + slug + '/trajectory-ledger.md`',
      '- `.omg/runtime/pressure/' + slug + '/pressure-report.md`',
      '- `.omg/runtime/pressure/' + slug + '/gates/<gate>.json`',
      '',
      'Required pressure points:',
      '- before plan selection: compare baseline, persistent, team-assisted, and novelty-seeking trajectories.',
      '- before implementation: compare quality-frontier candidates and prune low-leverage or scope-expanding improvements.',
      designSystemMode === 'skip-design-system'
        ? '- before UI implementation: keep the explicit design-system skip decision and verify only the minimal UI safety gate.'
        : '- before UI implementation: compare the selected design-system direction against at least one alternative when visual quality materially affects success.',
      '- before deployment: verify build, env configuration, and auth/LLM smoke evidence when Vercel is in scope.',
      '- after repeated blockers: perturb the constraints and ask for a disconfirming probe.',
      '- before completion: run critic review and basin-escape challenge.',
      '',
      'Runtime gate requirements:',
      '- one accepted active trajectory with evidence.',
      '- at least two evidence-backed independent trajectories.',
      '- at least one critic, tester, or replanner pressure trajectory.',
      '- no repeated blocker without perturbation.',
      '- completion evidence includes objective audit, implementation evidence, external verification, adversarial review, and convergence challenge.',
      '- completion evidence includes quality pruning evidence: frontier considered, finalists kept, candidates cut, and selected strategy rationale.',
      designSystemMode === 'skip-design-system'
        ? '- completion evidence includes the explicit design-system skip record and minimal UI safety check for UI work.'
        : '- completion evidence includes design-system evidence for UI work and deployment evidence for Vercel-scoped work.',
      '',
      'Basin-escape challenge:',
      '1. Restate the current solution and why it seems complete.',
      '2. Generate two alternatives that could satisfy the same objective.',
      '3. Identify one hidden assumption in the selected path.',
      '4. Run or specify a verification probe that could falsify completion.',
      '5. Keep the current path only if evidence beats alternatives.',
      '',
      'Do not reward novelty for its own sake. Novelty must improve evidence or reduce risk.',
    ]),
    'completion-gate.md': lines([
      '# Completion Gate',
      '',
      'The leader may call update_goal({status: "complete"}) only after all items are true:',
      '',
      '- Objective audit maps every user requirement to evidence.',
      '- Implementation or research artifacts are listed by path.',
      '- External verification passed and output was inspected.',
      '- Critic review found no unresolved blocker.',
      '- Basin-escape challenge compared at least two alternatives.',
      '- Quality pruning compared improvement candidates and rejected low-leverage or scope-expanding candidates.',
      designSystemMode === 'skip-design-system'
        ? '- Design-system skip evidence is recorded when UI or website work is in scope.'
        : '- Design-system evidence is recorded when UI or website work is in scope.',
      '- Secret/auth evidence is recorded when LLM API or auth is selected, without exposing secret values.',
      '- Vercel deployment evidence or a concrete deployment blocker is recorded when deployment target includes Vercel.',
      '- Remaining non-goals are still out of scope.',
      '- Pressure runtime gate passed.',
      '',
      'Pressure gate command:',
      '',
      '```sh',
      pressureGateCommand,
      '```',
      '',
      'Completion evidence template:',
      '',
      '```json',
      JSON.stringify({
        objectiveAudit: 'Every requirement maps to evidence.',
        implementationEvidence: ['path/or/artifact'],
        externalVerification: [{ command: 'npm test', status: 'pass', evidence: 'inspected output' }],
        adversarialReview: { status: 'clear', evidence: 'critic findings resolved' },
        convergenceChallenge: { status: 'passed', alternativesConsidered: 2, evidence: 'alternatives compared' },
        qualityPruning: {
          status: 'passed',
          frontierConsidered: 3,
          finalistsKept: 2,
          candidatesCut: ['speculative polish'],
          selectedStrategyEvidence: 'selected-strategy.md maps quality focus to implementation evidence',
        },
        designSystemEvidence: designCompletionEvidence(designSystemMode),
        secretAndAuthEvidence: { status: 'passed', evidence: 'required env vars configured without exposing values' },
        deploymentEvidence: { status: 'passed', url: 'https://example.vercel.app', evidence: 'deployment.md and runtime deployment plan inspected' },
      }, null, 2),
      '```',
    ]),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let objective = normalizeObjective(args.objective);
  if (args.printInterview) {
    if (!objective.trim()) throw new Error('Missing objective for --print-interview.');
    console.log(renderInterviewBlock(objective));
    return;
  }
  const providedAnswers = Boolean(args.answersJson || args.answersFile);
  if (providedAnswers && !args.interviewComplete) {
    throw new Error('Refusing --answers-json/--answers-file without --interview-complete. Ask the user first, or pass --interview-complete only after the user approves answers/defaults.');
  }
  let answers = await readAnswers(args);
  if (!objective || Object.keys(answers).length === 0) {
    const result = await askMissing(objective, answers);
    objective = result.objective;
    answers = result.answers;
  }
  if (!objective.trim()) throw new Error('Missing objective.');

  const slug = slugify(args.slug || objective);
  const route = routeFor(objective, answers);
  const root = join(args.cwd, '.omg', 'harness', slug);
  if (existsSync(root) && !args.force) {
    throw new Error(`Harness already exists at ${relative(args.cwd, root)}. Pass --force to overwrite files.`);
  }
  await mkdir(root, { recursive: true });

  const files = artifactMap({ objective, slug, route, answers });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(root, name), `${content}\n`, 'utf-8');
  }
  const recommendedGoalPrompt = goalPrompt({ objective, slug, route, answers });

  const summary = {
    slug,
    route,
    root: relative(args.cwd, root),
    goalPrompt: relative(args.cwd, join(root, 'goal-prompt.md')),
    goalPromptText: recommendedGoalPrompt,
    contextIndex: relative(args.cwd, join(root, 'context-index.md')),
    files: Object.keys(files).map((name) => relative(args.cwd, join(root, name))),
  };
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(`oh-my-goal harness: ${summary.slug}`);
    console.log(`route: ${summary.route}`);
    console.log(`context: ${summary.contextIndex}`);
    console.log(`goal prompt: ${summary.goalPrompt}`);
    console.log('');
    console.log('recommended Codex goal prompt:');
    console.log(recommendedGoalPrompt);
  }
}

main().catch((error) => {
  console.error(`[oh-my-goal] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
