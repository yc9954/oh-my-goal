import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const skillRoot = join(root, 'plugins', 'oh-my-goal', 'skills', 'oh-my-goal');
const skillPath = join(skillRoot, 'SKILL.md');
const generatorPath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'create-harness.mjs');
const questionEnginePath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'intake-question-engine.mjs');
const questionCorePath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'question-core.mjs');
const questionRuntimePath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'intake-question-runtime.mjs');
const openaiKeyRuntimePath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'openai-key-runtime.mjs');
const teamCorePath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'team-core.mjs');
const teamRuntimePath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'team-runtime.mjs');
const pressureRuntimePath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'pressure-runtime.mjs');
const designRuntimePath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'design-system-runtime.mjs');
const deploymentRuntimePath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'deployment-runtime.mjs');
const qualityMigrationPath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'migrate-quality-pruning.mjs');

function readSkillRelative(path: string): string {
  return readFileSync(join(skillRoot, path), 'utf-8');
}

describe('oh-my-goal plugin contract', () => {
  it('keeps SKILL.md as a thin router with a mandatory flow entrypoint', () => {
    const skill = readFileSync(skillPath, 'utf-8');

    assert.match(skill, /\$oh-my-goal <objective>/);
    assert.match(skill, /do not ask for it again/i);
    assert.match(skill, /FLOW\.md/);
    assert.match(skill, /flows\/00-entrypoint\.md/);
    assert.match(skill, /Do not create harness files/i);
    assert.match(skill, /openai-key-runtime\.mjs/);
    assert.match(skill, /offer --cwd/);
    assert.match(skill, /OPENAI_API_KEY/);
    assert.match(skill, /ZEP_API_KEY/);
    assert.match(skill, /Never ask for raw API keys in chat/i);
    assert.match(skill, /intake-question-engine\.mjs/);
    assert.match(skill, /intake-question-runtime\.mjs/);
    assert.match(skill, /--mode auto/);
    assert.match(skill, /--mode sequential/);
    assert.match(skill, /sequential-answer/);
    assert.match(skill, /cmux/i);
    assert.match(skill, /ambiguity score/i);
    assert.match(skill, /quality-pruning/i);
    assert.match(skill, /team-runtime\.mjs/);
    assert.match(skill, /team-runtime\.mjs watch/);
    assert.match(skill, /pressure-runtime\.mjs/);
    assert.match(skill, /design-system-runtime\.mjs/);
    assert.match(skill, /deployment-runtime\.mjs/);
    assert.match(skill, /runtime-commands\.md/);
    assert.match(skill, /two levels above this skill directory/i);
    assert.match(skill, /Do not look for scripts under `skills\/oh-my-goal\/scripts\/`/);
    assert.match(skill, /questions\[\]/);
    assert.match(skill, /selected_values/);
    assert.match(skill, /--interview-complete/i);
    assert.ok(skill.length < 3900, 'SKILL.md should stay a compact router');
  });

  it('splits the workflow into explicit flow, template, and reference files', () => {
    const files = [
      'FLOW.md',
      'flows/00-entrypoint.md',
      'flows/01-intake-gate.md',
      'flows/02-artifact-generation.md',
      'flows/03-goal-handoff.md',
      'flows/04-orchestration.md',
      'templates/first-turn-response.md',
      'templates/intake-fallback.md',
      'templates/worker-packet.md',
      'references/omg-patterns.md',
      'references/omg-port-map.md',
      'references/ui-ux-pro-max-analysis.md',
    ];

    for (const file of files) {
      assert.ok(readSkillRelative(file).trim().length > 0, `${file} should exist`);
    }

    const topFlow = readSkillRelative('FLOW.md');
    assert.match(topFlow, /Phase Router/i);
    assert.match(topFlow, /CAPABILITY_PREFLIGHT/);
    assert.match(topFlow, /openai-key-runtime\.mjs/);
    assert.match(topFlow, /offer --cwd/);
    assert.match(topFlow, /Missing keys do not block/i);
    assert.match(topFlow, /INTAKE_PENDING/);
    assert.match(topFlow, /one question at a time/i);
    assert.match(topFlow, /create files, run harness generator, code, create goal/i);
    assert.match(topFlow, /templates\/first-turn-response\.md/);

    const flow = readSkillRelative('flows/00-entrypoint.md');
    assert.match(flow, /State Machine/i);
    assert.match(flow, /CAPABILITY_PREFLIGHT/);
    assert.match(flow, /raw keys in chat/i);
    assert.match(flow, /not a blocker/i);
    assert.match(flow, /INTAKE_PENDING/);
    assert.match(flow, /Stop after questions/i);
    assert.match(flow, /Do not create files/i);

    const intake = readSkillRelative('flows/01-intake-gate.md');
    assert.match(intake, /ambiguity map/i);
    assert.match(intake, /intake-question-engine\.mjs/i);
    assert.match(intake, /not `skills\/oh-my-goal\/scripts\/intake-question-engine\.mjs`/);
    assert.match(intake, /--repo-review/);
    assert.match(intake, /--llm auto/);
    assert.match(intake, /questions\[\]/i);
    assert.match(intake, /multi-answerable/i);
    assert.match(intake, /selected_values/i);
    assert.match(intake, /sequential-answer/i);
    assert.match(intake, /ambiguity score/i);
    assert.match(intake, /Quality Frontier And Pruning/i);
    assert.match(intake, /Web App, Secret, Auth, And Deployment Decisions/i);
    assert.match(intake, /deploymentTarget/i);
    assert.match(intake, /secretHandling/i);
    assert.match(intake, /credentialSetup/i);
    assert.match(intake, /quality_pruning/i);
    assert.match(intake, /Gap-Fill Passes/i);

    const generation = readSkillRelative('flows/02-artifact-generation.md');
    assert.match(generation, /exact recommended Codex goal prompt/i);
    assert.match(generation, /Do not only summarize it/i);
    assert.match(generation, /execution-spec\.md/);
    assert.match(generation, /quality-frontier\.md/);
    assert.match(generation, /pruning-matrix\.md/);
    assert.match(generation, /selected-strategy\.md/);
    assert.match(generation, /design-system\.md/);
    assert.match(generation, /secrets-and-auth\.md/);
    assert.match(generation, /deployment\.md/);
    assert.match(generation, /do not ask whether to implement now/i);

    const handoff = readSkillRelative('flows/03-goal-handoff.md');
    assert.match(handoff, /exact prompt text/i);
    assert.match(handoff, /fenced `text` block/i);
    assert.match(handoff, /no implementation offer/i);

    const orchestration = readSkillRelative('flows/04-orchestration.md');
    assert.match(orchestration, /Metis/i);
    assert.match(orchestration, /Momus/i);
    assert.match(orchestration, /Oracle/i);
    assert.match(orchestration, /team-runtime\.mjs/i);
    assert.match(orchestration, /pressure-runtime\.mjs/i);
    assert.match(orchestration, /design-system-runtime\.mjs/i);
    assert.match(orchestration, /deployment-runtime\.mjs/i);
    assert.match(orchestration, /setup-env/i);
    assert.match(orchestration, /not under `skills\/oh-my-goal\/scripts\/`/);
    assert.match(orchestration, /tmux panes/i);
    assert.match(orchestration, /cmux tree/);
    assert.match(orchestration, /read-screen/);
    assert.match(orchestration, /tick/i);
    assert.match(orchestration, /reclaims inactive work/i);
    assert.match(orchestration, /collect/i);
    assert.match(orchestration, /Local-Optimum Pressure/i);
    assert.match(orchestration, /pressure gate/i);

    const firstTurnTemplate = readSkillRelative('templates/first-turn-response.md');
    assert.match(firstTurnTemplate, /openai-key-runtime\.mjs/);
    assert.match(firstTurnTemplate, /Do not ask the user to paste keys into chat/i);
    assert.match(firstTurnTemplate, /Stop immediately/i);
    assert.match(firstTurnTemplate, /Do not add a plan/i);
    assert.match(firstTurnTemplate, /Question 1 of <n>/i);
    assert.match(firstTurnTemplate, /Ambiguity: <score>/i);
  });

  it('detects optional OpenAI and Zep capabilities without blocking intake or exposing key values', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'oh-my-goal-openai-key-'));
    const openaiSecret = 'sk-test_abcdefghijklmnopqrstuvwxyz1234567890';
    const zepSecret = 'zep_test_abcdefghijklmnopqrstuvwxyz';
    try {
      const missing = spawnSync(
        process.execPath,
        [openaiKeyRuntimePath, 'offer', '--cwd', cwd, '--json'],
        { cwd: root, encoding: 'utf-8', env: { ...process.env, OPENAI_API_KEY: '', ZEP_API_KEY: '' } },
      );
      assert.equal(missing.status, 0, missing.stderr || missing.stdout);
      const missingPayload = JSON.parse(missing.stdout) as {
        ok: boolean;
        status: string;
        missing: string[];
        status_path: string;
        prompt: string;
        safety: string;
      };
      assert.equal(missingPayload.ok, false);
      assert.equal(missingPayload.status, 'optional_setup_available');
      assert.deepEqual(missingPayload.missing, ['OPENAI_API_KEY', 'ZEP_API_KEY']);
      assert.match(missingPayload.prompt, /offer/);
      assert.match(missingPayload.prompt, /--execute/);
      assert.match(missingPayload.safety, /Missing keys do not block/);
      assert.ok(existsSync(missingPayload.status_path));
      assert.doesNotMatch(missing.stdout, /prompt_required/);
      assert.doesNotMatch(missing.stdout, /sk-test_/);
      assert.doesNotMatch(missing.stdout, /zep_test_/);

      writeFileSync(join(cwd, '.env.local'), `OPENAI_API_KEY=${openaiSecret}\nZEP_API_KEY=${zepSecret}\n`, 'utf-8');
      const configured = spawnSync(
        process.execPath,
        [openaiKeyRuntimePath, 'status', '--cwd', cwd, '--json'],
        { cwd: root, encoding: 'utf-8', env: { ...process.env, OPENAI_API_KEY: '', ZEP_API_KEY: '' } },
      );
      assert.equal(configured.status, 0, configured.stderr || configured.stdout);
      const configuredPayload = JSON.parse(configured.stdout) as {
        ok: boolean;
        status: string;
        keys: Array<{ name: string; source: string }>;
        status_path: string;
      };
      assert.equal(configuredPayload.ok, true);
      assert.equal(configuredPayload.status, 'configured');
      assert.deepEqual(configuredPayload.keys.map((item) => item.name), ['OPENAI_API_KEY', 'ZEP_API_KEY']);
      assert.ok(configuredPayload.keys.every((item) => item.source === '.env.local'));
      assert.doesNotMatch(configured.stdout, new RegExp(openaiSecret));
      assert.doesNotMatch(configured.stdout, new RegExp(zepSecret));
      const statusText = readFileSync(configuredPayload.status_path, 'utf-8');
      assert.doesNotMatch(statusText, new RegExp(openaiSecret));
      assert.doesNotMatch(statusText, new RegExp(zepSecret));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('ports the Oh My Goal question schema into the plugin intake question engine', () => {
    const result = spawnSync(
      process.execPath,
      [questionEnginePath, '--objective', '계산기 앱을 웹사이트 형태로 만들어줘', '--format', 'payload'],
      { cwd: root, encoding: 'utf-8' },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout) as {
      source: string;
      locale: string;
      questions: Array<{
        id: string;
        question: string;
        other_label: string;
        type: string;
        multi_select: boolean;
        options: Array<{ label: string; value: string; description?: string }>;
      }>;
    };
    assert.equal(payload.source, 'oh-my-goal');
    assert.equal(payload.locale, 'ko');
    assert.equal(payload.questions.length, 11);
    assert.equal(payload.questions[0]?.id, 'deliverableScope');
    assert.match(payload.questions[0]?.question || '', /구현 범위|산출물/);
    assert.equal(payload.questions[0]?.type, 'single-answerable');
    assert.equal(payload.questions[0]?.multi_select, false);
    assert.equal(payload.questions[0]?.other_label, '직접 입력');
    assert.equal(payload.questions[0]?.options[0]?.label, '완성도 있는 단일 화면 구현');
    assert.equal(payload.questions[0]?.options[0]?.value, 'polished-single-screen');
    assert.equal(payload.questions[1]?.options[2]?.value, 'nextjs-vercel');
    assert.equal(payload.questions[6]?.id, 'designSystemMode');
    assert.equal(payload.questions[7]?.id, 'nonGoals');
    assert.equal(payload.questions[7]?.type, 'multi-answerable');
    assert.equal(payload.questions[7]?.multi_select, true);
    assert.equal(payload.questions[7]?.options[1]?.value, 'no-new-dependencies');
    assert.equal(payload.questions[8]?.id, 'qualityFrontier');
    assert.equal(payload.questions[8]?.type, 'multi-answerable');
    assert.equal(payload.questions[9]?.id, 'qualityPruning');
    assert.equal(payload.questions[10]?.id, 'pruningRule');

    const markdownResult = spawnSync(
      process.execPath,
      [questionEnginePath, '--objective', '계산기 앱을 웹사이트 형태로 만들어줘', '--format', 'markdown'],
      { cwd: root, encoding: 'utf-8' },
    );
    assert.equal(markdownResult.status, 0, markdownResult.stderr || markdownResult.stdout);
    assert.match(markdownResult.stdout, /Oh My Goal question schema fallback/);
    assert.match(markdownResult.stdout, /questions\[\]/);
    assert.match(markdownResult.stdout, /\[single-answerable\] id=deliverableScope multi_select=false/);
    assert.match(markdownResult.stdout, /질문: 이번 목표의 산출물 또는 구현 범위/);
    assert.match(markdownResult.stdout, /label="완성도 있는 단일 화면 구현" value="polished-single-screen"/);
    assert.match(markdownResult.stdout, /other_label="직접 입력"/);
    assert.doesNotMatch(markdownResult.stdout, /\[single-answerable\] id=deploymentTarget multi_select=false/);
    assert.doesNotMatch(markdownResult.stdout, /\[single-answerable\] id=llmApi multi_select=false/);
    assert.doesNotMatch(markdownResult.stdout, /\[single-answerable\] id=authProvider multi_select=false/);
    assert.doesNotMatch(markdownResult.stdout, /\[single-answerable\] id=secretHandling multi_select=false/);
    assert.doesNotMatch(markdownResult.stdout, /\[single-answerable\] id=credentialSetup multi_select=false/);
    assert.match(markdownResult.stdout, /\[single-answerable\] id=designSystemMode multi_select=false/);
    assert.match(markdownResult.stdout, /\[multi-answerable\] id=nonGoals multi_select=true/);
    assert.match(markdownResult.stdout, /\[multi-answerable\] id=qualityFrontier multi_select=true/);
    assert.match(markdownResult.stdout, /\[multi-answerable\] id=qualityPruning multi_select=true/);
    assert.match(markdownResult.stdout, /\[single-answerable\] id=pruningRule multi_select=false/);
    assert.match(markdownResult.stdout, /answers\[\] -> \{ question_id, answer: \{ selected_values: \[\.\.\.\] \} \}/);

    const englishResult = spawnSync(
      process.execPath,
      [questionEnginePath, '--objective', 'calculator website', '--format', 'payload'],
      { cwd: root, encoding: 'utf-8' },
    );
    assert.equal(englishResult.status, 0, englishResult.stderr || englishResult.stdout);
    const englishPayload = JSON.parse(englishResult.stdout) as {
      locale: string;
      questions: Array<{ question: string; options: Array<{ label: string; value: string }> }>;
    };
    assert.equal(englishPayload.locale, 'en');
    assert.equal(englishPayload.questions[0]?.question, 'Which implementation scope should this target?');
    assert.equal(englishPayload.questions[0]?.options[0]?.label, 'Polished single-screen implementation');
    assert.equal(englishPayload.questions[0]?.options[0]?.value, 'polished-single-screen');

    const aiVercelResult = spawnSync(
      process.execPath,
      [
        questionEnginePath,
        '--objective',
        'build AI chatbot website with Vercel deployment and login using mirofish zep memory',
        '--format',
        'payload',
      ],
      { cwd: root, encoding: 'utf-8' },
    );
    assert.equal(aiVercelResult.status, 0, aiVercelResult.stderr || aiVercelResult.stdout);
    const aiVercelPayload = JSON.parse(aiVercelResult.stdout) as {
      questions: Array<{ id: string; options: Array<{ value: string }> }>;
    };
    const aiVercelIds = aiVercelPayload.questions.map((question) => question.id);
    assert.ok(aiVercelIds.includes('deploymentTarget'));
    assert.ok(aiVercelIds.includes('llmApi'));
    assert.ok(aiVercelIds.includes('authProvider'));
    assert.ok(aiVercelIds.includes('secretHandling'));
    assert.ok(aiVercelIds.includes('credentialSetup'));

    const badFormat = spawnSync(
      process.execPath,
      [questionEnginePath, '--objective', '계산기 앱을 웹사이트 형태로 만들어줘', '--format', 'legacy-command'],
      { cwd: root, encoding: 'utf-8' },
    );
    assert.notEqual(badFormat.status, 0);
  });

  it('reviews the current folder before generating repo-aware intake questions', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'oh-my-goal-repo-review-'));
    try {
      mkdirSync(join(cwd, 'src'));
      mkdirSync(join(cwd, 'docs'));
      writeFileSync(
        join(cwd, 'package.json'),
        JSON.stringify({
          scripts: {
            build: 'vite build',
            test: 'vitest run',
            lint: 'biome lint src',
          },
          dependencies: { '@vitejs/plugin-react': '^latest', react: '^latest' },
          devDependencies: { vite: '^latest', vitest: '^latest' },
        }, null, 2),
        'utf-8',
      );
      writeFileSync(join(cwd, 'README.md'), '# Demo App\n\nExisting React/Vite app.\n', 'utf-8');
      writeFileSync(join(cwd, 'src', 'main.tsx'), 'export const app = true;\n', 'utf-8');
      writeFileSync(join(cwd, 'docs', 'prd.md'), '# PRD\n', 'utf-8');

      const result = spawnSync(
        process.execPath,
        [
          questionEnginePath,
          '--objective',
          'build dashboard app feature',
          '--cwd',
          cwd,
          '--repo-review',
          '--llm',
          'off',
          '--format',
          'payload',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout) as {
        repo_review: {
          summary: string;
          detected_stack: string[];
          package_scripts: string[];
          source_roots: string[];
        };
        question_generation: { mode: string; llm_status: string; added_question_ids: string[] };
        questions: Array<{ id: string; options: Array<{ label: string; value: string; description?: string }> }>;
      };
      assert.match(payload.repo_review.summary, /stack/);
      assert.ok(payload.repo_review.detected_stack.includes('react'));
      assert.ok(payload.repo_review.package_scripts.includes('npm run build'));
      assert.ok(payload.repo_review.source_roots.includes('src'));
      assert.equal(payload.question_generation.mode, 'repo-review+fallback');
      assert.equal(payload.question_generation.llm_status, 'disabled');
      assert.ok(payload.question_generation.added_question_ids.includes('repoReviewFocus'));
      assert.ok(payload.question_generation.added_question_ids.includes('verificationCommand'));
      const ids = payload.questions.map((question) => question.id);
      assert.ok(ids.indexOf('repoReviewFocus') > ids.indexOf('outputMode'));
      assert.ok(ids.indexOf('repoReviewFocus') < ids.indexOf('qualityFrontier'));
      const verification = payload.questions.find((question) => question.id === 'verificationCommand');
      assert.equal(verification?.options[0]?.label, 'npm run build');
      assert.equal(verification?.options[0]?.value, 'npm-run-build');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('provides an optional question runtime with arrow UI support, sequential fallback, and structured inline answers', () => {
    const coreSource = readFileSync(questionCorePath, 'utf-8');
    const runtimeSource = readFileSync(questionRuntimePath, 'utf-8');
    assert.match(coreSource, /Ported from Oh My Goal src\/question\/ui\.ts/);
    assert.match(coreSource, /emitKeypressEvents/);
    assert.match(coreSource, /renderQuestionWizardFrame/);
    assert.match(coreSource, /↑↓ move/);
    assert.match(runtimeSource, /question-core\.mjs/);
    assert.match(runtimeSource, /renderQuestionMeta/);
    assert.match(runtimeSource, /split-window/);
    assert.match(runtimeSource, /#\{pane_id\}/);
    assert.match(runtimeSource, /OMG_QUESTION_RETURN_PANE/);
    assert.match(runtimeSource, /isCurrentTmuxSessionAttached/);
    assert.match(runtimeSource, /launchCmuxUi/);
    assert.match(runtimeSource, /CMUX_WORKSPACE_ID/);
    assert.match(runtimeSource, /cmux-pane/);
    assert.match(runtimeSource, /RESIDUAL_AMBIGUITY_THRESHOLD/);
    assert.match(runtimeSource, /nextFollowupQuestion/);
    assert.match(runtimeSource, /notifyQuestionReturn/);
    assert.match(runtimeSource, /cleanupQuestionRenderer/);
    assert.match(runtimeSource, /OMG_QUESTION_CLOSE_ON_COMPLETE/);
    assert.match(runtimeSource, /close-surface/);
    assert.match(runtimeSource, /launchMacosTerminalUi/);
    assert.match(runtimeSource, /osascript/);
    const cwd = mkdtempSync(join(tmpdir(), 'oh-my-goal-runtime-'));
    try {
      const fakeBin = join(cwd, 'bin');
      mkdirSync(fakeBin);
      const fakeCmux = join(fakeBin, 'cmux');
      writeFileSync(
        fakeCmux,
        `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'identify') {
  process.stdout.write(JSON.stringify({
    caller: { workspace_ref: 'workspace:1', surface_ref: 'surface:1', pane_ref: 'pane:1' },
    focused: { workspace_ref: 'workspace:1', surface_ref: 'surface:99', pane_ref: 'pane:99' }
  }));
  process.exit(0);
}
if (args[0] === 'new-pane') {
  process.stdout.write('pane:99\\nsurface:99\\n');
  process.exit(0);
}
if (args[0] === 'list-pane-surfaces') {
  process.stdout.write('surface:99\\n');
  process.exit(0);
}
if (args[0] === 'send') {
  if (process.env.OMG_FAKE_CMUX_LOG) fs.appendFileSync(process.env.OMG_FAKE_CMUX_LOG, JSON.stringify(args) + '\\n');
  if (process.env.OMG_FAKE_CMUX_WRITE_ANSWER !== '0') {
    const command = args[args.length - 1] || '';
    const match = command.match(/--state-path '([^']+)'/);
    if (!match) process.exit(0);
    const statePath = match[1];
    const record = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const answers = record.questions.map((question, index) => {
      const selected = question.options[0];
      const multi = question.type === 'multi-answerable' || question.multi_select === true;
      return {
        question_id: question.id,
        index,
        answer: multi
          ? { kind: 'multi', value: [selected.value], selected_labels: [selected.label], selected_values: [selected.value] }
          : { kind: 'option', value: selected.value, selected_labels: [selected.label], selected_values: [selected.value] }
      };
    });
    fs.writeFileSync(statePath, JSON.stringify({
      ...record,
      status: 'answered',
      updated_at: new Date().toISOString(),
      answers,
      answer: answers[0].answer
    }, null, 2));
  }
  process.exit(0);
}
if (args[0] === 'send-key' || args[0] === 'focus-pane' || args[0] === 'close-surface') {
  if (process.env.OMG_FAKE_CMUX_LOG) fs.appendFileSync(process.env.OMG_FAKE_CMUX_LOG, JSON.stringify(args) + '\\n');
  process.exit(0);
}
process.exit(0);
`,
        'utf-8',
      );
      chmodSync(fakeCmux, 0o755);

      const fakeTmux = join(fakeBin, 'tmux');
      writeFileSync(
        fakeTmux,
        `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'display-message') {
  const format = args[args.length - 1];
  if (format === '#{pane_id}') process.stdout.write('%1\\n');
  else if (format === '#{session_attached}') process.stdout.write('1\\n');
  else if (format === '#{pane_height}') process.stdout.write('40\\n');
  process.exit(0);
}
if (args[0] === 'list-panes') {
  process.stdout.write('0\\t%99\\n');
  process.exit(0);
}
if (args[0] === 'split-window') {
  const statePath = args[args.indexOf('--state-path') + 1];
  const record = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const answers = record.questions.map((question, index) => {
    const selected = question.options[0];
    const multi = question.type === 'multi-answerable' || question.multi_select === true;
    return {
      question_id: question.id,
      index,
      answer: multi
        ? { kind: 'multi', value: [selected.value], selected_labels: [selected.label], selected_values: [selected.value] }
        : { kind: 'option', value: selected.value, selected_labels: [selected.label], selected_values: [selected.value] }
    };
  });
  fs.writeFileSync(statePath, JSON.stringify({
    ...record,
    status: 'answered',
    updated_at: new Date().toISOString(),
    answers,
    answer: answers[0].answer
  }, null, 2));
  process.stdout.write('%99\\n');
  process.exit(0);
}
process.exit(0);
`,
        'utf-8',
      );
      chmodSync(fakeTmux, 0o755);

      const cmuxBridgeLog = join(cwd, 'cmux-bridge.log');
      const cmuxBridge = spawnSync(
        process.execPath,
        [
          questionRuntimePath,
          '--objective',
          '계산기 앱을 웹사이트 형태로 만들어줘',
          '--mode',
          'auto',
          '--cwd',
          cwd,
          '--json',
        ],
        {
          cwd: root,
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${fakeBin}:${process.env.PATH || ''}`,
            CMUX_BUNDLED_CLI_PATH: fakeCmux,
            CMUX_WORKSPACE_ID: 'workspace:1',
            CMUX_SURFACE_ID: 'surface:1',
            TMUX: '',
            TMUX_PANE: '',
            OMG_DISABLE_TERMINAL_BRIDGE: '1',
            OMG_FAKE_CMUX_LOG: cmuxBridgeLog,
          },
        },
      );
      assert.equal(cmuxBridge.status, 0, cmuxBridge.stderr || cmuxBridge.stdout);
      const cmuxPayload = JSON.parse(cmuxBridge.stdout) as {
        ok: boolean;
        renderer?: { renderer?: string; target?: string; return_target?: string; workspace?: string };
        answers: Array<{ answer: { selected_values: string[] } }>;
      };
      assert.equal(cmuxPayload.ok, true);
      assert.equal(cmuxPayload.renderer?.renderer, 'cmux-pane');
      assert.equal(cmuxPayload.renderer?.target, 'surface:99');
      assert.equal(cmuxPayload.renderer?.return_target, 'surface:1');
      assert.equal(cmuxPayload.renderer?.workspace, 'workspace:1');
      assert.equal(cmuxPayload.answers.length, 11);
      assert.equal(cmuxPayload.answers[0]?.answer.selected_values[0], 'polished-single-screen');
      const cmuxBridgeLogText = readFileSync(cmuxBridgeLog, 'utf-8');
      assert.match(cmuxBridgeLogText, /--ui/);
      assert.match(cmuxBridgeLogText, /; exit/);

      const cmuxPrompting = spawnSync(
        process.execPath,
        [
          questionRuntimePath,
          '--objective',
          '계산기 앱을 웹사이트 형태로 만들어줘',
          '--mode',
          'auto',
          '--cwd',
          cwd,
          '--json',
        ],
        {
          cwd: root,
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${fakeBin}:${process.env.PATH || ''}`,
            CMUX_BUNDLED_CLI_PATH: fakeCmux,
            CMUX_WORKSPACE_ID: 'workspace:1',
            CMUX_SURFACE_ID: 'surface:1',
            TMUX: '',
            TMUX_PANE: '',
            OMG_DISABLE_TERMINAL_BRIDGE: '1',
            OMG_FAKE_CMUX_WRITE_ANSWER: '0',
          },
        },
      );
      assert.equal(cmuxPrompting.status, 0, cmuxPrompting.stderr || cmuxPrompting.stdout);
      const cmuxPromptingPayload = JSON.parse(cmuxPrompting.stdout) as {
        ok: boolean;
        interactive?: boolean;
        renderer: string;
        status: string;
        record_path: string;
      };
      assert.equal(cmuxPromptingPayload.ok, false);
      assert.equal(cmuxPromptingPayload.interactive, true);
      assert.equal(cmuxPromptingPayload.renderer, 'cmux-pane');
      assert.equal(cmuxPromptingPayload.status, 'prompting');

      const cmuxPromptingStatus = spawnSync(
        process.execPath,
        [
          questionRuntimePath,
          '--mode',
          'status',
          '--state-path',
          cmuxPromptingPayload.record_path,
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(cmuxPromptingStatus.status, 0, cmuxPromptingStatus.stderr || cmuxPromptingStatus.stdout);
      const cmuxPromptingStatusPayload = JSON.parse(cmuxPromptingStatus.stdout) as {
        ok: boolean;
        interactive?: boolean;
        renderer: string;
        status: string;
      };
      assert.equal(cmuxPromptingStatusPayload.ok, false);
      assert.equal(cmuxPromptingStatusPayload.interactive, true);
      assert.equal(cmuxPromptingStatusPayload.renderer, 'cmux-pane');
      assert.equal(cmuxPromptingStatusPayload.status, 'prompting');

      const tmuxBridge = spawnSync(
        process.execPath,
        [
          questionRuntimePath,
          '--objective',
          '계산기 앱을 웹사이트 형태로 만들어줘',
          '--mode',
          'auto',
          '--cwd',
          cwd,
          '--json',
        ],
        {
          cwd: root,
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: `${fakeBin}:${process.env.PATH || ''}`,
            TMUX: '/tmp/fake-tmux',
            TMUX_PANE: '%1',
            OMG_DISABLE_CMUX_BRIDGE: '1',
          },
        },
      );
      assert.equal(tmuxBridge.status, 0, tmuxBridge.stderr || tmuxBridge.stdout);
      const bridgePayload = JSON.parse(tmuxBridge.stdout) as {
        ok: boolean;
        renderer?: { renderer?: string; target?: string; return_target?: string };
        answers: Array<{ answer: { selected_values: string[] } }>;
      };
      assert.equal(bridgePayload.ok, true);
      assert.equal(bridgePayload.renderer?.renderer, 'tmux-pane');
      assert.equal(bridgePayload.renderer?.target, '%99');
      assert.equal(bridgePayload.renderer?.return_target, '%1');
      assert.equal(bridgePayload.answers.length, 11);
      assert.equal(bridgePayload.answers[0]?.answer.selected_values[0], 'polished-single-screen');

      if (process.platform === 'darwin') {
        const fakeOsascript = join(fakeBin, 'osascript');
        writeFileSync(
          fakeOsascript,
          `#!/usr/bin/env node
const fs = require('node:fs');
const script = process.argv.slice(2).join('\\n');
const match = script.match(/--state-path '([^']+)'/);
if (!match) {
  console.error('missing state path');
  process.exit(1);
}
const statePath = match[1];
const record = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const answers = record.questions.map((question, index) => {
  const selected = question.options[0];
  const multi = question.type === 'multi-answerable' || question.multi_select === true;
  return {
    question_id: question.id,
    index,
    answer: multi
      ? { kind: 'multi', value: [selected.value], selected_labels: [selected.label], selected_values: [selected.value] }
      : { kind: 'option', value: selected.value, selected_labels: [selected.label], selected_values: [selected.value] }
  };
});
fs.writeFileSync(statePath, JSON.stringify({
  ...record,
  status: 'answered',
  updated_at: new Date().toISOString(),
  answers,
  answer: answers[0].answer
}, null, 2));
process.exit(0);
`,
          'utf-8',
        );
        chmodSync(fakeOsascript, 0o755);

        const terminalBridge = spawnSync(
          process.execPath,
          [
            questionRuntimePath,
            '--objective',
            '계산기 앱을 웹사이트 형태로 만들어줘',
            '--mode',
            'auto',
            '--cwd',
            cwd,
            '--json',
          ],
          {
            cwd: root,
            encoding: 'utf-8',
            env: {
              ...process.env,
              PATH: `${fakeBin}:${process.env.PATH || ''}`,
              TMUX: '',
              TMUX_PANE: '',
              OMG_DISABLE_CMUX_BRIDGE: '1',
            },
          },
        );
        assert.equal(terminalBridge.status, 0, terminalBridge.stderr || terminalBridge.stdout);
        const terminalPayload = JSON.parse(terminalBridge.stdout) as {
          ok: boolean;
          renderer?: { renderer?: string; target?: string };
          answers: Array<{ answer: { selected_values: string[] } }>;
        };
        assert.equal(terminalPayload.ok, true);
        assert.equal(terminalPayload.renderer?.renderer, 'macos-terminal');
        assert.equal(terminalPayload.renderer?.target, 'Terminal.app');
        assert.equal(terminalPayload.answers.length, 11);
        assert.equal(terminalPayload.answers[0]?.answer.selected_values[0], 'polished-single-screen');

        writeFileSync(
          fakeOsascript,
          `#!/usr/bin/env node
process.exit(0);
`,
          'utf-8',
        );
        chmodSync(fakeOsascript, 0o755);
        const terminalPrompting = spawnSync(
          process.execPath,
          [
            questionRuntimePath,
            '--objective',
            '계산기 앱을 웹사이트 형태로 만들어줘',
            '--mode',
            'auto',
            '--cwd',
            cwd,
            '--json',
          ],
          {
            cwd: root,
            encoding: 'utf-8',
            env: {
              ...process.env,
              PATH: `${fakeBin}:${process.env.PATH || ''}`,
              TMUX: '',
              TMUX_PANE: '',
              OMG_DISABLE_CMUX_BRIDGE: '1',
            },
          },
        );
        assert.equal(terminalPrompting.status, 0, terminalPrompting.stderr || terminalPrompting.stdout);
        const promptingPayload = JSON.parse(terminalPrompting.stdout) as {
          ok: boolean;
          interactive?: boolean;
          renderer: string;
          status: string;
          record_path: string;
          prompt: string;
        };
        assert.equal(promptingPayload.ok, false);
        assert.equal(promptingPayload.interactive, true);
        assert.equal(promptingPayload.renderer, 'macos-terminal');
        assert.equal(promptingPayload.status, 'prompting');
        assert.match(promptingPayload.prompt, /Answer in that window/);

        const promptingStatus = spawnSync(
          process.execPath,
          [
            questionRuntimePath,
            '--mode',
            'status',
            '--state-path',
            promptingPayload.record_path,
            '--json',
          ],
          { cwd: root, encoding: 'utf-8' },
        );
        assert.equal(promptingStatus.status, 0, promptingStatus.stderr || promptingStatus.stdout);
        const promptingStatusPayload = JSON.parse(promptingStatus.stdout) as {
          ok: boolean;
          interactive?: boolean;
          renderer: string;
          status: string;
        };
        assert.equal(promptingStatusPayload.ok, false);
        assert.equal(promptingStatusPayload.interactive, true);
        assert.equal(promptingStatusPayload.renderer, 'macos-terminal');
        assert.equal(promptingStatusPayload.status, 'prompting');
      }

      const fallback = spawnSync(
        process.execPath,
        [
          questionRuntimePath,
          '--objective',
          '계산기 앱을 웹사이트 형태로 만들어줘',
          '--mode',
          'auto',
          '--cwd',
          cwd,
          '--json',
        ],
        {
          cwd: root,
          encoding: 'utf-8',
          env: { ...process.env, TMUX: '', TMUX_PANE: '', OMG_DISABLE_CMUX_BRIDGE: '1', OMG_DISABLE_TERMINAL_BRIDGE: '1' },
        },
      );
      assert.equal(fallback.status, 0, fallback.stderr || fallback.stdout);
      const fallbackPayload = JSON.parse(fallback.stdout) as {
        ok: boolean;
        renderer: string;
        status: string;
        prompt: string;
      };
      assert.equal(fallbackPayload.ok, false);
      assert.equal(fallbackPayload.renderer, 'sequential');
      assert.equal(fallbackPayload.status, 'prompting');
      assert.match(fallbackPayload.prompt, /질문 1\/11/);
      assert.match(fallbackPayload.prompt, /모호도: 0\.86 \(high\)/);

      const sequential = spawnSync(
        process.execPath,
        [
          questionRuntimePath,
          '--objective',
          '계산기 앱을 웹사이트 형태로 만들어줘',
          '--mode',
          'sequential',
          '--cwd',
          cwd,
          '--json',
        ],
        { cwd: root, encoding: 'utf-8', env: { ...process.env, TMUX: '', TMUX_PANE: '', OMG_DISABLE_CMUX_BRIDGE: '1', OMG_DISABLE_TERMINAL_BRIDGE: '1' } },
      );
      assert.equal(sequential.status, 0, sequential.stderr || sequential.stdout);
      const sequentialPayload = JSON.parse(sequential.stdout) as {
        ok: boolean;
        status: string;
        record_path: string;
        current_index: number;
        ambiguity: { score: number; level: string };
        prompt: string;
      };
      assert.equal(sequentialPayload.ok, false);
      assert.equal(sequentialPayload.status, 'prompting');
      assert.equal(sequentialPayload.current_index, 0);
      assert.equal(sequentialPayload.ambiguity.score, 0.86);
      assert.match(sequentialPayload.prompt, /질문 1\/11/);
      assert.match(sequentialPayload.prompt, /모호도: 0\.86 \(high\)/);
      assert.match(sequentialPayload.prompt, /\[single-answerable\] id=deliverableScope multi_select=false/);
      assert.match(sequentialPayload.prompt, /완성도 있는 단일 화면 구현/);

      const nextSequential = spawnSync(
        process.execPath,
        [
          questionRuntimePath,
          '--mode',
          'sequential-answer',
          '--state-path',
          sequentialPayload.record_path,
          '--answer',
          '1A',
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(nextSequential.status, 0, nextSequential.stderr || nextSequential.stdout);
      const nextPayload = JSON.parse(nextSequential.stdout) as {
        ok: boolean;
        current_index: number;
        answers: Array<{ answer: { selected_values: string[] } }>;
        prompt: string;
      };
      assert.equal(nextPayload.ok, false);
      assert.equal(nextPayload.current_index, 1);
      assert.equal(nextPayload.answers[0]?.answer.selected_values[0], 'polished-single-screen');
      assert.match(nextPayload.prompt, /질문 2\/11/);

      const complexStart = spawnSync(
        process.execPath,
        [
          questionRuntimePath,
          '--objective',
          '계산기 웹사이트 만들어줘',
          '--mode',
          'sequential',
          '--cwd',
          cwd,
          '--json',
        ],
        { cwd: root, encoding: 'utf-8', env: { ...process.env, TMUX: '', TMUX_PANE: '', OMG_DISABLE_CMUX_BRIDGE: '1', OMG_DISABLE_TERMINAL_BRIDGE: '1' } },
      );
      assert.equal(complexStart.status, 0, complexStart.stderr || complexStart.stdout);
      const complexStartPayload = JSON.parse(complexStart.stdout) as { record_path: string };
      let complexOutput = '';
      for (const answer of ['1C', '2A', '3B', '4C', '5B', '6A', '7A', '8A', '9A,B', '10A,B', '11A']) {
        const step = spawnSync(
          process.execPath,
          [
            questionRuntimePath,
            '--mode',
            'sequential-answer',
            '--state-path',
            complexStartPayload.record_path,
            '--answer',
            answer,
            '--json',
          ],
          { cwd: root, encoding: 'utf-8' },
        );
        assert.equal(step.status, 0, step.stderr || step.stdout);
        complexOutput = step.stdout;
      }
      const complexFollowup = JSON.parse(complexOutput) as {
        ok: boolean;
        current_index: number;
        progress: string;
        question: { id: string; question: string; options: Array<{ label: string; value: string }>; other_label: string };
        ambiguity: { score: number; level: string };
        answers: unknown[];
        prompt: string;
      };
      assert.equal(complexFollowup.ok, false);
      assert.equal(complexFollowup.current_index, 11);
      assert.equal(complexFollowup.progress, '12/12');
      assert.equal(complexFollowup.question.id, 'edgeCases');
      assert.match(complexFollowup.question.question, /edge case|보조 동작/);
      assert.equal(complexFollowup.question.options[0]?.label, '소수, 음수, 연속 연산');
      assert.equal(complexFollowup.question.options[0]?.value, 'numeric-edge-cases');
      assert.equal(complexFollowup.question.other_label, '직접 입력');
      assert.match(complexFollowup.prompt, /질문 12\/12/);
      assert.match(complexFollowup.prompt, /소수, 음수, 연속 연산/);
      assert.ok(complexFollowup.ambiguity.score > 0.35);
      assert.equal(complexFollowup.answers.length, 11);

      for (const answer of ['12A,B', '13A', '14A', '15A', '16A']) {
        const step = spawnSync(
          process.execPath,
          [
            questionRuntimePath,
            '--mode',
            'sequential-answer',
            '--state-path',
            complexStartPayload.record_path,
            '--answer',
            answer,
            '--json',
          ],
          { cwd: root, encoding: 'utf-8' },
        );
        assert.equal(step.status, 0, step.stderr || step.stdout);
        complexOutput = step.stdout;
      }
      const complexComplete = JSON.parse(complexOutput) as {
        ok: boolean;
        answers: unknown[];
        residual_ambiguity: { score: number; level: string; threshold: number };
        quality_pruning: { complete: boolean };
      };
      assert.equal(complexComplete.ok, true);
      assert.equal(complexComplete.answers.length, 16);
      assert.ok(complexComplete.residual_ambiguity.score <= complexComplete.residual_ambiguity.threshold);
      assert.equal(complexComplete.residual_ambiguity.level, 'low');
      assert.equal(complexComplete.quality_pruning.complete, true);

      const notifyStart = spawnSync(
        process.execPath,
        [
          questionRuntimePath,
          '--objective',
          '계산기 앱을 웹사이트 형태로 만들어줘',
          '--mode',
          'sequential',
          '--cwd',
          cwd,
          '--json',
        ],
        { cwd: root, encoding: 'utf-8', env: { ...process.env, TMUX: '', TMUX_PANE: '', OMG_DISABLE_CMUX_BRIDGE: '1', OMG_DISABLE_TERMINAL_BRIDGE: '1' } },
      );
      assert.equal(notifyStart.status, 0, notifyStart.stderr || notifyStart.stdout);
      const notifyStartPayload = JSON.parse(notifyStart.stdout) as { record_path: string };
      const cmuxNotifyLog = join(cwd, 'cmux-notify.log');
      const notifyUi = spawnSync(
        process.execPath,
        [
          questionRuntimePath,
          '--ui',
          '--state-path',
          notifyStartPayload.record_path,
        ],
        {
          cwd: root,
          encoding: 'utf-8',
          input: ['1', '1', '1', '1', '1', '1', '1', '1,2', '1,2', '1,2', '1', ''].join('\n'),
          env: {
            ...process.env,
            PATH: `${fakeBin}:${process.env.PATH || ''}`,
            CMUX_BUNDLED_CLI_PATH: fakeCmux,
            OMG_QUESTION_RETURN_CMUX_WORKSPACE: 'workspace:1',
            OMG_QUESTION_RETURN_CMUX_SURFACE: 'surface:1',
            OMG_QUESTION_RETURN_CMUX_PANE: 'pane:1',
            OMG_QUESTION_RETURN_MESSAGE: 'continue',
            OMG_FAKE_CMUX_LOG: cmuxNotifyLog,
          },
        },
      );
      assert.equal(notifyUi.status, 0, notifyUi.stderr || notifyUi.stdout);
      const cmuxNotifyLogText = readFileSync(cmuxNotifyLog, 'utf-8');
      assert.match(cmuxNotifyLogText, /"send"/);
      assert.match(cmuxNotifyLogText, /"focus-pane"/);
      assert.match(cmuxNotifyLogText, /"surface:1"/);
      assert.match(cmuxNotifyLogText, /"pane:1"/);
      assert.match(cmuxNotifyLogText, /continue/);
      assert.doesNotMatch(cmuxNotifyLogText, /"send-key"/);

      const cmuxCleanupLog = join(cwd, 'cmux-cleanup.log');
      const cleanupUi = spawnSync(
        process.execPath,
        [
          questionRuntimePath,
          '--ui',
          '--state-path',
          notifyStartPayload.record_path,
        ],
        {
          cwd: root,
          encoding: 'utf-8',
          input: ['1', '1', '1', '1', '1', '1', '1', '1,2', '1,2', '1,2', '1', ''].join('\n'),
          env: {
            ...process.env,
            PATH: `${fakeBin}:${process.env.PATH || ''}`,
            CMUX_BUNDLED_CLI_PATH: fakeCmux,
            OMG_QUESTION_CLOSE_ON_COMPLETE: '1',
            OMG_QUESTION_SELF_RENDERER: 'cmux-pane',
            OMG_QUESTION_SELF_CMUX_WORKSPACE: 'workspace:1',
            OMG_QUESTION_SELF_CMUX_SURFACE: 'surface:99',
            OMG_QUESTION_RETURN_CMUX_WORKSPACE: 'workspace:1',
            OMG_QUESTION_RETURN_CMUX_SURFACE: 'surface:1',
            OMG_QUESTION_RETURN_CMUX_PANE: 'pane:1',
            OMG_QUESTION_RETURN_MESSAGE: 'continue',
            OMG_FAKE_CMUX_LOG: cmuxCleanupLog,
          },
        },
      );
      assert.equal(cleanupUi.status, 0, cleanupUi.stderr || cleanupUi.stdout);
      const cmuxCleanupLogText = readFileSync(cmuxCleanupLog, 'utf-8');
      assert.match(cmuxCleanupLogText, /"close-surface"/);
      assert.match(cmuxCleanupLogText, /"surface:99"/);

      const inline = spawnSync(
        process.execPath,
        [
          questionRuntimePath,
          '--objective',
          '계산기 앱을 웹사이트 형태로 만들어줘',
          '--mode',
          'inline',
          '--cwd',
          cwd,
          '--json',
        ],
        {
          cwd: root,
          encoding: 'utf-8',
          input: ['1', '1', '1', '1', '1', '1', '1', '1,2', '1,2', '1,2', '1', ''].join('\n'),
          env: { ...process.env, TMUX: '', TMUX_PANE: '', OMG_DISABLE_CMUX_BRIDGE: '1' },
        },
      );
      assert.equal(inline.status, 0, inline.stderr || inline.stdout);
      const jsonStart = inline.stdout.indexOf('{');
      assert.ok(jsonStart >= 0, inline.stdout);
      const payload = JSON.parse(inline.stdout.slice(jsonStart)) as {
        ok: boolean;
        answers: Array<{ question_id: string; answer: { kind: string; selected_values: string[] } }>;
        record_path: string;
      };
      assert.equal(payload.ok, true);
      assert.equal(payload.answers.length, 11);
      assert.equal(payload.answers[0]?.answer.selected_values[0], 'polished-single-screen');
      assert.equal(payload.answers[6]?.question_id, 'designSystemMode');
      assert.equal(payload.answers[7]?.question_id, 'nonGoals');
      assert.equal(payload.answers[7]?.answer.kind, 'multi');
      assert.deepEqual(payload.answers[7]?.answer.selected_values, ['no-backend-auth-persistence', 'no-new-dependencies']);
      assert.equal(payload.answers[8]?.question_id, 'qualityFrontier');
      assert.deepEqual(payload.answers[8]?.answer.selected_values, ['user-workflow-polish', 'reliability-edge-cases']);
      assert.equal(payload.answers[9]?.question_id, 'qualityPruning');
      assert.deepEqual(payload.answers[9]?.answer.selected_values, ['user-visible-value-first', 'verification-reliability-first']);
      assert.equal(payload.answers[10]?.question_id, 'pruningRule');
      assert.match(payload.record_path, /\.omg\/runtime\/questions\/question-/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('keeps the plugin question core aligned with Oh My Goal wizard semantics', async () => {
    const core = await import(pathToFileURL(questionCorePath).href) as {
      createInitialQuestionWizardState(record: unknown): {
        currentQuestionIndex: number;
        mode: 'answering' | 'review';
        selections: Array<{ cursorIndex: number; selectedIndices: number[] }>;
      };
      applyQuestionWizardKey(record: unknown, state: unknown, key: { name?: string; sequence?: string }): {
        state: {
          currentQuestionIndex: number;
          mode: 'answering' | 'review';
          selections: Array<{ cursorIndex: number; selectedIndices: number[] }>;
        };
        submit: boolean;
      };
      renderQuestionWizardFrame(record: unknown, state: unknown): string;
    };
    const record = {
      kind: 'omg.question/v1',
      question_id: 'question-test',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'prompting',
      header: 'Oh My Goal Intake',
      questions: [
        {
          id: 'scope',
          question: 'Which scope?',
          type: 'single-answerable',
          multi_select: false,
          allow_other: true,
          other_label: 'Other',
          options: [{ label: 'First', value: 'first' }, { label: 'Second', value: 'second' }],
        },
        {
          id: 'verification',
          question: 'Which verification?',
          type: 'single-answerable',
          multi_select: false,
          allow_other: false,
          other_label: 'Other',
          options: [{ label: 'Smoke', value: 'smoke' }],
        },
      ],
    };

    const initial = core.createInitialQuestionWizardState(record);
    assert.match(core.renderQuestionWizardFrame(record, initial), /1\. First/);
    assert.match(core.renderQuestionWizardFrame(record, initial), /↑↓ move · Enter\/→ next · ← back/);

    const moved = core.applyQuestionWizardKey(record, initial, { name: 'down' });
    assert.equal(moved.state.currentQuestionIndex, 0);
    assert.equal(moved.state.selections[0]?.cursorIndex, 1);

    const advanced = core.applyQuestionWizardKey(record, moved.state, { name: 'right' });
    assert.equal(advanced.submit, false);
    assert.equal(advanced.state.currentQuestionIndex, 1);
    assert.equal(advanced.state.mode, 'answering');
  });

  it('ports the useful Oh My Goal Team surface into an optional plugin team runtime', () => {
    const teamCoreSource = readFileSync(teamCorePath, 'utf-8');
    const teamRuntimeSource = readFileSync(teamRuntimePath, 'utf-8');
    assert.match(teamCoreSource, /Oh My Goal Team contracts/);
    assert.match(teamCoreSource, /src\/team\/tmux-session\.ts/);
    assert.match(teamCoreSource, /schema_source: 'oh-my-goal\.team\/state\/v2'/);
    assert.match(teamCoreSource, /schema_version: 2/);
    assert.match(teamCoreSource, /OMG_TEAM_STATE_ROOT/);
    assert.match(teamCoreSource, /codex exec --skip-git-repo-check/);
    assert.match(teamCoreSource, /buildRebalanceDecisions/);
    assert.match(teamRuntimeSource, /team-core\.mjs/);
    assert.match(teamRuntimeSource, /commandTick/);
    assert.match(teamRuntimeSource, /commandWatch/);
    assert.match(teamRuntimeSource, /watch\.ndjson/);
    assert.match(teamRuntimeSource, /closeCompleted/);
    assert.match(teamRuntimeSource, /close-completed-worker/);
    assert.match(teamRuntimeSource, /refreshWorkerPromptFromInbox/);
    assert.match(teamRuntimeSource, /scaleWorkersForReadyTasks/);
    assert.match(teamRuntimeSource, /scale-worker/);
    assert.match(teamRuntimeSource, /--max-workers/);
    assert.match(teamRuntimeSource, /launchCmuxWorkers/);
    assert.match(teamRuntimeSource, /CMUX_WORKSPACE_ID/);
    assert.match(teamRuntimeSource, /cmux-pane/);
    assert.match(teamRuntimeSource, /requireInteractive/);
    const plan = spawnSync(
      process.execPath,
      [
        teamRuntimePath,
        'plan',
        '--objective',
        'implement UI, write tests, update docs',
        '--workers',
        '3',
        '--json',
      ],
      { cwd: root, encoding: 'utf-8' },
    );
    assert.equal(plan.status, 0, plan.stderr || plan.stdout);
    const planPayload = JSON.parse(plan.stdout) as {
      team: string;
      worker_count: number;
      workers: Array<{ worker_id: string; role: string; tasks: unknown[] }>;
    };
    assert.equal(planPayload.team, 'implement-ui-write-tests-updat');
    assert.equal(planPayload.worker_count, 3);
    assert.deepEqual(
      planPayload.workers.map((worker) => worker.role),
      ['implementer', 'tester', 'writer'],
    );

    const cwd = mkdtempSync(join(tmpdir(), 'oh-my-goal-team-'));
    try {
      const launch = spawnSync(
        process.execPath,
        [
          teamRuntimePath,
          'launch',
          '--objective',
          'implement UI, write tests, update docs',
          '--workers',
          '3',
          '--mode',
          'dry-run',
          '--cwd',
          cwd,
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(launch.status, 0, launch.stderr || launch.stdout);
      const launchPayload = JSON.parse(launch.stdout) as {
        ok: boolean;
        status: string;
        team: string;
        state_root: string;
        workers: Array<{ worker_id: string; inbox: string; prompt: string; result: string }>;
      };
      assert.equal(launchPayload.ok, true);
      assert.equal(launchPayload.status, 'planned');
      assert.equal(launchPayload.state_root, '.omg/runtime/team/implement-ui-write-tests-updat');

      const stateRoot = join(cwd, launchPayload.state_root);
      const config = JSON.parse(readFileSync(join(stateRoot, 'config.json'), 'utf-8')) as {
        schema_source: string;
        name: string;
        task: string;
      };
      assert.equal(config.schema_source, 'oh-my-goal.team/state/v2');
      assert.equal(config.name, launchPayload.team);
      assert.match(config.task, /implement UI/);

      const manifest = JSON.parse(readFileSync(join(stateRoot, 'manifest.json'), 'utf-8')) as {
        schema_version: number;
        name: string;
        leader: { worker_id: string };
        workers: Array<{ name: string; assigned_tasks: string[] }>;
      };
      assert.equal(manifest.schema_version, 2);
      assert.equal(manifest.name, launchPayload.team);
      assert.equal(manifest.leader.worker_id, 'leader-fixed');
      assert.equal(manifest.workers[0]?.name, 'worker-1');
      assert.deepEqual(manifest.workers[0]?.assigned_tasks, ['1']);

      const task = JSON.parse(readFileSync(join(stateRoot, 'tasks', 'task-1.json'), 'utf-8')) as {
        id: string;
        status: string;
        owner: string;
        allocation_reason: string;
      };
      assert.equal(task.id, '1');
      assert.equal(task.status, 'pending');
      assert.equal(task.owner, 'worker-1');
      assert.match(task.allocation_reason, /matches worker role|balances current load/);

      const identity = JSON.parse(
        readFileSync(join(stateRoot, 'workers', 'worker-1', 'identity.json'), 'utf-8'),
      ) as {
        name: string;
        index: number;
        role: string;
        assigned_tasks: string[];
      };
      assert.equal(identity.name, 'worker-1');
      assert.equal(identity.index, 1);
      assert.equal(identity.role, 'implementer');
      assert.deepEqual(identity.assigned_tasks, ['1']);

      for (const worker of launchPayload.workers) {
        assert.ok(existsSync(join(cwd, worker.inbox)), `${worker.inbox} should exist`);
        assert.ok(existsSync(join(cwd, worker.prompt)), `${worker.prompt} should exist`);
        assert.match(readFileSync(join(cwd, worker.prompt), 'utf-8'), /Never call create_goal or update_goal/);
      }

      const status = spawnSync(
        process.execPath,
        [teamRuntimePath, 'status', '--team', launchPayload.team, '--cwd', cwd, '--json'],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(status.status, 0, status.stderr || status.stdout);
      const statusPayload = JSON.parse(status.stdout) as {
        workers: Array<{ status: string; state: string; result_exists: boolean }>;
      };
      assert.equal(statusPayload.workers.length, 3);
      assert.equal(statusPayload.workers[0]?.status, 'planned');
      assert.equal(statusPayload.workers[0]?.state, 'idle');
      assert.equal(statusPayload.workers[0]?.result_exists, false);

      writeFileSync(
        join(cwd, launchPayload.workers[0]!.result),
        'Summary: implemented UI lane\nEvidence: inspected files\n',
        'utf-8',
      );
      const collect = spawnSync(
        process.execPath,
        [teamRuntimePath, 'collect', '--team', launchPayload.team, '--cwd', cwd, '--json'],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(collect.status, 0, collect.stderr || collect.stdout);
      const collectPayload = JSON.parse(collect.stdout) as {
        summary: string;
        results: Array<{ status: string }>;
      };
      assert.equal(collectPayload.results[0]?.status, 'reported');
      assert.equal(collectPayload.results[1]?.status, 'pending');
      assert.ok(existsSync(join(cwd, collectPayload.summary)));

      const tick = spawnSync(
        process.execPath,
        [teamRuntimePath, 'tick', '--team', launchPayload.team, '--cwd', cwd, '--json'],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(tick.status, 0, tick.stderr || tick.stdout);
      const tickPayload = JSON.parse(tick.stdout) as {
        ok: boolean;
        decisions: Array<{ type: string; taskId: string; workerName?: string }>;
        created_tasks: Array<{ id: string; owner?: string; status: string; parent_task_id?: string }>;
        assigned: Array<{ worker: string; tasks: string[] }>;
      };
      assert.equal(tickPayload.ok, true);
      assert.ok(tickPayload.decisions.some((decision) => decision.type === 'followup-needed' && decision.taskId === '1'));
      assert.ok(tickPayload.decisions.some((decision) => decision.type === 'assign' && decision.workerName === 'worker-1'));
      assert.equal(tickPayload.created_tasks[0]?.parent_task_id, '1');
      assert.equal(tickPayload.created_tasks[0]?.owner, 'worker-1');
      assert.equal(tickPayload.created_tasks[0]?.status, 'pending');
      assert.deepEqual(tickPayload.assigned[0]?.tasks, [tickPayload.created_tasks[0]!.id]);
      const followupTask = JSON.parse(
        readFileSync(join(stateRoot, 'tasks', `task-${tickPayload.created_tasks[0]!.id}.json`), 'utf-8'),
      ) as { owner: string; parent_task_id: string; allocation_reason: string };
      assert.equal(followupTask.owner, 'worker-1');
      assert.equal(followupTask.parent_task_id, '1');
      assert.match(followupTask.allocation_reason, /idle worker pickup/);
      assert.match(readFileSync(join(cwd, launchPayload.workers[0]!.inbox), 'utf-8'), /Dynamic Assignment/);

      const duplicateTick = spawnSync(
        process.execPath,
        [teamRuntimePath, 'tick', '--team', launchPayload.team, '--cwd', cwd, '--json'],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(duplicateTick.status, 0, duplicateTick.stderr || duplicateTick.stdout);
      const duplicateTickPayload = JSON.parse(duplicateTick.stdout) as {
        decisions: Array<{ type: string; taskId: string }>;
        created_tasks: Array<{ id: string }>;
      };
      assert.deepEqual(duplicateTickPayload.decisions, []);
      assert.deepEqual(duplicateTickPayload.created_tasks, []);
      const stillPendingFollowup = JSON.parse(
        readFileSync(join(stateRoot, 'tasks', `task-${tickPayload.created_tasks[0]!.id}.json`), 'utf-8'),
      ) as { owner: string; status: string; result_digest?: string };
      assert.equal(stillPendingFollowup.owner, 'worker-1');
      assert.equal(stillPendingFollowup.status, 'pending');
      assert.equal(stillPendingFollowup.result_digest, undefined);

      const initPressure = spawnSync(
        process.execPath,
        [
          pressureRuntimePath,
          'init',
          '--objective',
          'implement UI, write tests, update docs',
          '--slug',
          launchPayload.team,
          '--cwd',
          cwd,
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(initPressure.status, 0, initPressure.stderr || initPressure.stdout);

      const watch = spawnSync(
        process.execPath,
        [
          teamRuntimePath,
          'watch',
          '--team',
          launchPayload.team,
          '--pressure-slug',
          launchPayload.team,
          '--cwd',
          cwd,
          '--iterations',
          '1',
          '--interval-ms',
          '1',
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(watch.status, 0, watch.stderr || watch.stdout);
      const watchPayload = JSON.parse(watch.stdout) as {
        command: string;
        cycles: number;
        watch_log: string;
        last_cycle: {
          tick: { decisions: Array<{ type: string }> };
          collect: { command: string };
          import_team: { command: string; skipped: Array<{ reason: string }> };
          pressure_status: { command: string; evidence_backed_trajectories: number };
          followup_tick: { decisions: Array<{ type: string }> };
        };
      };
      assert.equal(watchPayload.command, 'watch');
      assert.equal(watchPayload.cycles, 1);
      assert.ok(existsSync(join(cwd, watchPayload.watch_log)));
      assert.equal(watchPayload.last_cycle.collect.command, 'collect');
      assert.equal(watchPayload.last_cycle.import_team.command, 'import-team');
      assert.ok(watchPayload.last_cycle.import_team.skipped.some((item) => item.reason === 'missing trajectory score'));
      assert.equal(watchPayload.last_cycle.pressure_status.command, 'status');
      assert.ok(
        [...watchPayload.last_cycle.tick.decisions, ...watchPayload.last_cycle.followup_tick.decisions]
          .some((decision) => decision.type === 'pressure-followup'),
      );

      const blockedInteractive = spawnSync(
        process.execPath,
        [
          teamRuntimePath,
          'launch',
          '--objective',
          'interactive required lanes',
          '--workers',
          '2',
          '--mode',
          'auto',
          '--require-interactive',
          '--agent',
          'shell',
          '--cwd',
          cwd,
          '--json',
        ],
        {
          cwd: root,
          encoding: 'utf-8',
          env: {
            ...process.env,
            OMG_DISABLE_CMUX_BRIDGE: '1',
            TMUX: '',
            TMUX_PANE: '',
          },
        },
      );
      assert.equal(blockedInteractive.status, 0, blockedInteractive.stderr || blockedInteractive.stdout);
      const blockedInteractivePayload = JSON.parse(blockedInteractive.stdout) as {
        ok: boolean;
        status: string;
        reason: string;
        next_action: string;
      };
      assert.equal(blockedInteractivePayload.ok, false);
      assert.equal(blockedInteractivePayload.status, 'blocked');
      assert.equal(blockedInteractivePayload.reason, 'interactive_surface_unavailable');
      assert.match(blockedInteractivePayload.next_action, /cmux codex-teams/);

      const fakeBin = join(cwd, 'bin');
      mkdirSync(fakeBin);
      const fakeCmux = join(fakeBin, 'cmux');
      writeFileSync(
        fakeCmux,
        `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const logPath = process.env.OMG_FAKE_CMUX_LOG;
const args = process.argv.slice(2);
if (logPath) fs.appendFileSync(logPath, JSON.stringify(args) + '\\n');
if (args[0] === 'identify') {
  process.stdout.write(JSON.stringify({
    caller: { workspace_ref: 'workspace:1', surface_ref: 'surface:1', pane_ref: 'pane:1' },
    focused: { workspace_ref: 'workspace:1', surface_ref: 'surface:10', pane_ref: 'pane:10' }
  }));
  process.exit(0);
}
if (args[0] === 'new-pane') {
  const countPath = path.join(path.dirname(logPath), 'count.txt');
  const count = fs.existsSync(countPath) ? Number(fs.readFileSync(countPath, 'utf8')) + 1 : 1;
  fs.writeFileSync(countPath, String(count));
  process.stdout.write('pane:' + (90 + count) + '\\nsurface:' + (90 + count) + '\\n');
  process.exit(0);
}
if (args[0] === 'list-pane-surfaces') {
  process.stdout.write('surface:99\\n');
  process.exit(0);
}
if (args[0] === 'send' || args[0] === 'close-surface') process.exit(0);
process.exit(0);
`,
        'utf-8',
      );
      chmodSync(fakeCmux, 0o755);
      const cmuxLog = join(cwd, 'cmux.log');
      const cmuxEnv = {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH || ''}`,
        CMUX_BUNDLED_CLI_PATH: fakeCmux,
        CMUX_WORKSPACE_ID: 'workspace:1',
        CMUX_SURFACE_ID: 'surface:1',
        TMUX: '',
        TMUX_PANE: '',
        OMG_FAKE_CMUX_LOG: cmuxLog,
      };
      const cmuxLaunch = spawnSync(
        process.execPath,
        [
          teamRuntimePath,
          'launch',
          '--objective',
          'cmux worker lanes',
          '--workers',
          '2',
          '--mode',
          'auto',
          '--agent',
          'shell',
          '--cwd',
          cwd,
          '--json',
        ],
        {
          cwd: root,
          encoding: 'utf-8',
          env: cmuxEnv,
        },
      );
      assert.equal(cmuxLaunch.status, 0, cmuxLaunch.stderr || cmuxLaunch.stdout);
      const cmuxLaunchPayload = JSON.parse(cmuxLaunch.stdout) as {
        ok: boolean;
        status: string;
        team: string;
        state_root: string;
        workers: Array<{ renderer?: string; surface_id?: string; pane_id?: string }>;
      };
      assert.equal(cmuxLaunchPayload.ok, true);
      assert.equal(cmuxLaunchPayload.status, 'launched');
      assert.equal(cmuxLaunchPayload.workers[0]?.renderer, 'cmux-pane');
      assert.equal(cmuxLaunchPayload.workers[0]?.surface_id, 'surface:91');
      assert.equal(cmuxLaunchPayload.workers[1]?.pane_id, 'pane:92');
      assert.match(readFileSync(cmuxLog, 'utf-8'), /"new-pane"/);
      assert.match(readFileSync(cmuxLog, 'utf-8'), /"rename-tab"/);
      assert.match(readFileSync(cmuxLog, 'utf-8'), /OMG worker-1/);
      assert.match(readFileSync(cmuxLog, 'utf-8'), /"send"/);

      const cmuxStateRoot = join(cwd, cmuxLaunchPayload.state_root);
      for (const taskId of ['1', '2']) {
        const taskPath = join(cmuxStateRoot, 'tasks', `task-${taskId}.json`);
        const taskRecord = JSON.parse(readFileSync(taskPath, 'utf-8')) as Record<string, unknown>;
        writeFileSync(
          taskPath,
          JSON.stringify({ ...taskRecord, status: 'completed', owner: `worker-${taskId}`, completed_at: '2026-01-01T00:00:00.000Z' }, null, 2),
          'utf-8',
        );
      }
      for (const workerId of ['worker-1', 'worker-2']) {
        writeFileSync(
          join(cmuxStateRoot, 'workers', workerId, 'status.json'),
          JSON.stringify({ state: 'done', status: 'reported', updated_at: '2000-01-01T00:00:00.000Z' }, null, 2),
          'utf-8',
        );
      }

      const closeIdle = spawnSync(
        process.execPath,
        [
          teamRuntimePath,
          'tick',
          '--team',
          cmuxLaunchPayload.team,
          '--cwd',
          cwd,
          '--close-completed',
          '--json',
        ],
        {
          cwd: root,
          encoding: 'utf-8',
          env: cmuxEnv,
        },
      );
      assert.equal(closeIdle.status, 0, closeIdle.stderr || closeIdle.stdout);
      const closeIdlePayload = JSON.parse(closeIdle.stdout) as {
        decisions: Array<{ type: string; workerName?: string; target?: string }>;
      };
      assert.ok(closeIdlePayload.decisions.some((decision) => decision.type === 'close-completed-worker' && decision.workerName === 'worker-1'));
      assert.match(readFileSync(cmuxLog, 'utf-8'), /"close-surface"/);
      const closedStatus = JSON.parse(
        readFileSync(join(cmuxStateRoot, 'workers', 'worker-1', 'status.json'), 'utf-8'),
      ) as { state: string; status: string; surface_id: string | null };
      assert.equal(closedStatus.state, 'hibernated');
      assert.equal(closedStatus.status, 'idle_closed');
      assert.equal(closedStatus.surface_id, null);

      const reopenedTaskPath = join(cmuxStateRoot, 'tasks', 'task-1.json');
      const reopenedTaskRecord = JSON.parse(readFileSync(reopenedTaskPath, 'utf-8')) as Record<string, unknown>;
      writeFileSync(
        reopenedTaskPath,
        JSON.stringify({ ...reopenedTaskRecord, status: 'pending', owner: undefined, completed_at: undefined }, null, 2),
        'utf-8',
      );
      const reopenTick = spawnSync(
        process.execPath,
        [
          teamRuntimePath,
          'tick',
          '--team',
          cmuxLaunchPayload.team,
          '--cwd',
          cwd,
          '--close-idle-minutes',
          '1',
          '--json',
        ],
        {
          cwd: root,
          encoding: 'utf-8',
          env: cmuxEnv,
        },
      );
      assert.equal(reopenTick.status, 0, reopenTick.stderr || reopenTick.stdout);
      const reopenPayload = JSON.parse(reopenTick.stdout) as {
        decisions: Array<{ type: string; workerName?: string; target?: string }>;
      };
      assert.ok(reopenPayload.decisions.some((decision) => decision.type === 'reopen-worker' && decision.workerName === 'worker-1'));
      const reopenedStatus = JSON.parse(
        readFileSync(join(cmuxStateRoot, 'workers', 'worker-1', 'status.json'), 'utf-8'),
      ) as { state: string; status: string; surface_id: string | null };
      assert.equal(reopenedStatus.status, 'assigned');
      assert.equal(reopenedStatus.surface_id, 'surface:93');
      assert.match(readFileSync(join(cmuxStateRoot, 'workers', 'worker-1', 'prompt.md'), 'utf-8'), /Dynamic Assignment/);

      for (const [taskId, owner] of [['1', 'worker-1'], ['2', 'worker-2']] as const) {
        const busyTaskPath = join(cmuxStateRoot, 'tasks', `task-${taskId}.json`);
        const busyTask = JSON.parse(readFileSync(busyTaskPath, 'utf-8')) as Record<string, unknown>;
        writeFileSync(
          busyTaskPath,
          JSON.stringify({ ...busyTask, status: 'in_progress', owner }, null, 2),
          'utf-8',
        );
        writeFileSync(
          join(cmuxStateRoot, 'workers', owner, 'status.json'),
          JSON.stringify({ state: 'running', status: 'working', current_task_id: taskId, updated_at: new Date().toISOString() }, null, 2),
          'utf-8',
        );
      }
      for (const [taskId, role] of [['3', 'tester'], ['4', 'critic']] as const) {
        writeFileSync(
          join(cmuxStateRoot, 'tasks', `task-${taskId}.json`),
          JSON.stringify({
            id: taskId,
            subject: `${role} dynamic work`,
            description: `Provide ${role} evidence for dynamic orchestration.`,
            role,
            status: 'pending',
            created_at: new Date().toISOString(),
            version: 1,
          }, null, 2),
          'utf-8',
        );
      }

      const scaleTick = spawnSync(
        process.execPath,
        [
          teamRuntimePath,
          'tick',
          '--team',
          cmuxLaunchPayload.team,
          '--cwd',
          cwd,
          '--max-workers',
          '4',
          '--max-new-workers',
          '2',
          '--json',
        ],
        {
          cwd: root,
          encoding: 'utf-8',
          env: cmuxEnv,
        },
      );
      assert.equal(scaleTick.status, 0, scaleTick.stderr || scaleTick.stdout);
      const scalePayload = JSON.parse(scaleTick.stdout) as {
        decisions: Array<{ type: string; workerName?: string; taskId?: string }>;
      };
      assert.ok(scalePayload.decisions.some((decision) => decision.type === 'scale-worker' && decision.workerName === 'worker-3'));
      assert.ok(scalePayload.decisions.some((decision) => decision.type === 'assign' && decision.workerName === 'worker-3' && decision.taskId === '3'));
      assert.ok(scalePayload.decisions.some((decision) => decision.type === 'assign' && decision.workerName === 'worker-4' && decision.taskId === '4'));
      const scaledConfig = JSON.parse(readFileSync(join(cmuxStateRoot, 'config.json'), 'utf-8')) as {
        workers: Array<{ worker_id: string; surface_id?: string }>;
      };
      assert.equal(scaledConfig.workers.length, 4);
      assert.equal(scaledConfig.workers[2]?.surface_id, 'surface:94');
      assert.match(readFileSync(join(cmuxStateRoot, 'workers', 'worker-3', 'prompt.md'), 'utf-8'), /Task 3/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('uses the OMX allocation policy for initial team task ownership', () => {
    const plan = spawnSync(
      process.execPath,
      [
        teamRuntimePath,
        'plan',
        '--objective',
        'implement src/calculator.ts core; implement src/calculator.ts edge cases; update docs/calculator.md usage',
        '--workers',
        '2',
        '--json',
      ],
      { cwd: root, encoding: 'utf-8' },
    );
    assert.equal(plan.status, 0, plan.stderr || plan.stdout);
    const payload = JSON.parse(plan.stdout) as {
      tasks: Array<{ id: string; owner: string; allocation_reason: string }>;
    };

    assert.equal(payload.tasks[0]?.owner, 'worker-1');
    assert.equal(payload.tasks[1]?.owner, 'worker-1');
    assert.match(payload.tasks[1]?.allocation_reason || '', /preserves file\/domain ownership/);
    assert.equal(payload.tasks[2]?.owner, 'worker-2');
  });

  it('enforces local-optimum pressure with trajectory evidence and a runtime gate', () => {
    const pressureSource = readFileSync(pressureRuntimePath, 'utf-8');
    assert.match(pressureSource, /oh-my-goal\.runtime\/pressure\+perturbation/);
    assert.match(pressureSource, /buildAnnealingChallenge/);
    assert.match(pressureSource, /commandImportTeam/);
    assert.match(pressureSource, /at least two evidence-backed trajectories/);
    assert.match(pressureSource, /critic, tester, or replanner pressure evidence/);
    assert.match(pressureSource, /quality pruning evidence/);

    const cwd = mkdtempSync(join(tmpdir(), 'oh-my-goal-pressure-'));
    try {
      const init = spawnSync(
        process.execPath,
        [
          pressureRuntimePath,
          'init',
          '--objective',
          'build calculator website',
          '--slug',
          'calculator',
          '--cwd',
          cwd,
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(init.status, 0, init.stderr || init.stdout);
      const initPayload = JSON.parse(init.stdout) as {
        ok: boolean;
        slug: string;
        state: string;
        team_command: string;
      };
      assert.equal(initPayload.ok, true);
      assert.equal(initPayload.slug, 'calculator');
      assert.match(initPayload.team_command, /team-runtime\.mjs' launch/);
      assert.ok(existsSync(join(cwd, initPayload.state)));

      const earlyGate = spawnSync(
        process.execPath,
        [
          pressureRuntimePath,
          'gate',
          '--slug',
          'calculator',
          '--cwd',
          cwd,
          '--evidence-json',
          JSON.stringify({
            actor: 'leader',
            objectiveAudit: 'mapped',
            implementationEvidence: ['index.html'],
            externalVerification: [{ command: 'node test', status: 'pass', evidence: 'passed' }],
            adversarialReview: { status: 'clear', evidence: 'critic clear' },
            convergenceChallenge: { status: 'passed', alternativesConsidered: 2, evidence: 'compared' },
            qualityPruning: {
              status: 'passed',
              frontierConsidered: 3,
              finalistsKept: 1,
              candidatesCut: ['speculative polish'],
              selectedStrategyEvidence: 'selected-strategy.md reviewed',
            },
          }),
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(earlyGate.status, 0, earlyGate.stderr || earlyGate.stdout);
      const earlyGatePayload = JSON.parse(earlyGate.stdout) as {
        ok: boolean;
        gate: { missing: string[] };
      };
      assert.equal(earlyGatePayload.ok, false);
      assert.ok(earlyGatePayload.gate.missing.includes('selected active trajectory'));
      assert.ok(earlyGatePayload.gate.missing.includes('at least two evidence-backed trajectories'));

      const teamLaunch = spawnSync(
        process.execPath,
        [
          teamRuntimePath,
          'launch',
          '--objective',
          'critic pressure, tester verification',
          '--team',
          'calculator-pressure',
          '--workers',
          '2',
          '--mode',
          'dry-run',
          '--cwd',
          cwd,
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(teamLaunch.status, 0, teamLaunch.stderr || teamLaunch.stdout);
      const teamLaunchPayload = JSON.parse(teamLaunch.stdout) as {
        workers: Array<{ result: string }>;
      };
      writeFileSync(
        join(cwd, teamLaunchPayload.workers[0]!.result),
        [
          'Summary: critic pressure lane',
          'Evidence: found a false-completion risk in the calculator path',
          'Files or artifacts: .omg/harness/calculator/completion-gate.md',
          'Verification commands and observed output: inspected completion gate',
          'Risks or blockers: missing keyboard edge case',
          'Trajectory score 0-100: 82',
          'Novelty score 0-100: 55',
          'Recommendation: revise',
          '',
        ].join('\n'),
        'utf-8',
      );
      writeFileSync(
        join(cwd, teamLaunchPayload.workers[1]!.result),
        [
          'Summary: tester verification lane',
          'Evidence: keyboard-first alternative is testable with browser events',
          'Verification commands and observed output: planned DOM event probe',
          'Trajectory score 0-100: 78',
          'Novelty score 0-100: 45',
          'Recommendation: accept',
          '',
        ].join('\n'),
        'utf-8',
      );
      const importedTeam = spawnSync(
        process.execPath,
        [
          pressureRuntimePath,
          'import-team',
          '--slug',
          'calculator',
          '--team',
          'calculator-pressure',
          '--cwd',
          cwd,
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(importedTeam.status, 0, importedTeam.stderr || importedTeam.stdout);
      const importedTeamPayload = JSON.parse(importedTeam.stdout) as {
        ok: boolean;
        imported: Array<{ id: string; source: string; role: string; score: number; evidence: string[] }>;
        skipped: unknown[];
      };
      assert.equal(importedTeamPayload.ok, true);
      assert.equal(importedTeamPayload.imported.length, 2);
      assert.deepEqual(importedTeamPayload.skipped, []);
      assert.equal(importedTeamPayload.imported[0]?.source, 'worker');
      assert.equal(importedTeamPayload.imported[0]?.role, 'critic');
      assert.equal(importedTeamPayload.imported[0]?.score, 82);
      assert.match(importedTeamPayload.imported[0]?.id || '', /^W-calculator-pressure-worker-1$/);
      assert.ok(importedTeamPayload.imported[0]?.evidence.some((item) => item.includes('false-completion risk')));

      const baseline = spawnSync(
        process.execPath,
        [
          pressureRuntimePath,
          'record',
          '--slug',
          'calculator',
          '--cwd',
          cwd,
          '--id',
          'T001-baseline',
          '--summary',
          'static HTML calculator baseline',
          '--evidence',
          'index.html can implement core operations',
          '--score',
          '72',
          '--novelty-score',
          '10',
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(baseline.status, 0, baseline.stderr || baseline.stdout);

      const novelty = spawnSync(
        process.execPath,
        [
          pressureRuntimePath,
          'record',
          '--slug',
          'calculator',
          '--cwd',
          cwd,
          '--id',
          'T002-novelty',
          '--source',
          'worker',
          '--role',
          'replanner',
          '--summary',
          'keyboard-first interaction trajectory',
          '--evidence',
          'replanner compared keyboard-first path against click-only baseline',
          '--score',
          '84',
          '--novelty-score',
          '75',
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(novelty.status, 0, novelty.stderr || novelty.stdout);

      const selected = spawnSync(
        process.execPath,
        [
          pressureRuntimePath,
          'select',
          '--slug',
          'calculator',
          '--cwd',
          cwd,
          '--trajectory-id',
          'T002-novelty',
          '--evidence',
          'novelty path gives better acceptance coverage while preserving scope',
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(selected.status, 0, selected.stderr || selected.stdout);

      const passingGate = spawnSync(
        process.execPath,
        [
          pressureRuntimePath,
          'gate',
          '--slug',
          'calculator',
          '--cwd',
          cwd,
          '--evidence-json',
          JSON.stringify({
            actor: 'leader',
            objectiveAudit: 'mapped',
            implementationEvidence: ['index.html'],
            externalVerification: [{ command: 'node test', status: 'pass', evidence: 'passed' }],
            adversarialReview: { status: 'clear', evidence: 'critic clear' },
            convergenceChallenge: { status: 'passed', alternativesConsidered: 2, evidence: 'baseline versus novelty' },
            qualityPruning: {
              status: 'passed',
              frontierConsidered: 3,
              finalistsKept: 2,
              candidatesCut: ['speculative polish'],
              selectedStrategyEvidence: 'selected-strategy.md maps keyboard-first quality focus to evidence',
            },
          }),
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(passingGate.status, 0, passingGate.stderr || passingGate.stdout);
      const passingGatePayload = JSON.parse(passingGate.stdout) as {
        ok: boolean;
        gate: { allowed: boolean; missing: string[]; blockers: string[] };
      };
      assert.equal(passingGatePayload.ok, true);
      assert.equal(passingGatePayload.gate.allowed, true);
      assert.deepEqual(passingGatePayload.gate.missing, []);
      assert.deepEqual(passingGatePayload.gate.blockers, []);

      const state = JSON.parse(readFileSync(join(cwd, '.omg/runtime/pressure/calculator/state.json'), 'utf-8')) as {
        active_trajectory_id: string;
        gates: unknown[];
      };
      assert.equal(state.active_trajectory_id, 'T002-novelty');
      assert.equal(state.gates.length, 2);
      assert.ok(existsSync(join(cwd, '.omg/runtime/pressure/calculator/trajectory-ledger.md')));
      assert.ok(existsSync(join(cwd, '.omg/runtime/pressure/calculator/pressure-report.md')));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('requires an explicit completed interview before accepting supplied answers', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'oh-my-goal-plugin-'));
    try {
      const result = spawnSync(
        process.execPath,
        [
          generatorPath,
          '--objective',
          'mirofish zep memory assistant',
          '--cwd',
          cwd,
          '--answers-json',
          JSON.stringify({ acceptance: 'implemented calculator' }),
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /without --interview-complete/i);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('prints a one-turn structured interview block without creating files', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'oh-my-goal-plugin-'));
    try {
      const result = spawnSync(
        process.execPath,
        [generatorPath, '--objective', 'calculator website', '--cwd', cwd, '--print-interview'],
        { cwd: root, encoding: 'utf-8' },
      );

      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /Before I create harness files/i);
      assert.match(result.stdout, /Which implementation scope should this target/i);
      assert.match(result.stdout, /Which stack should be used/i);
      assert.match(result.stdout, /What should happen after intake/i);
      assert.doesNotMatch(result.stdout, /What deployment target should the harness prepare/i);
      assert.doesNotMatch(result.stdout, /Will this need an LLM API/i);
      assert.doesNotMatch(result.stdout, /What auth setup is needed/i);
      assert.doesNotMatch(result.stdout, /How should API keys and auth secrets be handled/i);
      assert.doesNotMatch(result.stdout, /If LLM API or auth credentials are needed/i);
      assert.match(result.stdout, /How should design-system guidance be applied/i);
      assert.match(result.stdout, /Which quality-improvement directions should be explored/i);
      assert.match(result.stdout, /Which quality directions should survive pruning/i);
      assert.match(result.stdout, /What rule should prune quality candidates/i);
      assert.match(result.stdout, /Oh My Goal question schema fallback/i);
      assert.match(result.stdout, /\[single-answerable\] id=deliverableScope multi_select=false/);
      assert.match(result.stdout, /\[multi-answerable\] id=nonGoals multi_select=true/);
      assert.match(result.stdout, /\[multi-answerable\] id=qualityFrontier multi_select=true/);
      assert.match(result.stdout, /\[multi-answerable\] id=qualityPruning multi_select=true/);
      assert.match(result.stdout, /\[single-answerable\] id=pruningRule multi_select=false/);
      assert.match(result.stdout, /1A 2A 3A 4A 5A 6A 7A 8A 9A 10A 11A/);
      assert.match(result.stdout, /Reply with Oh My Goal selections/i);
      assert.doesNotMatch(result.stdout, /oh-my-goal harness:/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('generates Oh My Goal-style ambiguity and questionnaire artifacts from trailing objective text', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'oh-my-goal-plugin-'));
    try {
      const result = spawnSync(
        process.execPath,
        [
          generatorPath,
          '$oh-my-goal ralpli PRD draft',
          '--cwd',
          cwd,
          '--interview-complete',
          '--answers-json',
          JSON.stringify({
            deliverableScope: 'next-version PRD',
            audience: 'builder/PM',
            sourceContext: 'repo README/docs/source plus user answers',
            acceptance: 'repo-local PRD plus goal prompt',
            nonGoals: 'no implementation yet',
            verification: 'inspect generated Markdown',
            deploymentTarget: 'vercel-preview',
            llmApi: 'openai-api',
            authProvider: 'clerk',
            secretHandling: 'vercel-env-secure-prompt',
            credentialSetup: 'secure-terminal-prompt',
            designSystemMode: 'generate-design-system',
            workerLanes: 'architect researcher critic tester',
            localOptimum: 'baseline versus novelty plus critic',
            qualityFrontier: 'decision clarity, execution readiness, risk mapping',
            qualityPruning: 'verification and reliability first, simple maintainable core first',
            pruningRule: 'best quality per implementation cost',
          }),
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);

      const summary = JSON.parse(result.stdout) as { root: string; files: string[]; goalPromptText: string };
      assert.equal(summary.root, '.omg/harness/ralpli-prd-draft');
      assert.match(summary.goalPromptText, /Complete the Oh My Goal harness objective/);
      assert.match(summary.goalPromptText, /\.omg\/harness\/ralpli-prd-draft/);
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/objective.txt'));
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/ambiguity-map.md'));
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/intake-questionnaire.md'));
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/execution-spec.md'));
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/quality-frontier.md'));
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/pruning-matrix.md'));
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/selected-strategy.md'));
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/design-system.md'));
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/secrets-and-auth.md'));
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/deployment.md'));
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/runtime-commands.md'));
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/plugin-root-resolver.mjs'));

      const harnessRoot = join(cwd, summary.root);
      const goalPrompt = readFileSync(join(harnessRoot, 'goal-prompt.md'), 'utf-8');
      const objectiveFile = readFileSync(join(harnessRoot, 'objective.txt'), 'utf-8');
      const executionSpec = readFileSync(join(harnessRoot, 'execution-spec.md'), 'utf-8');
      const qualityFrontier = readFileSync(join(harnessRoot, 'quality-frontier.md'), 'utf-8');
      const pruningMatrix = readFileSync(join(harnessRoot, 'pruning-matrix.md'), 'utf-8');
      const selectedStrategy = readFileSync(join(harnessRoot, 'selected-strategy.md'), 'utf-8');
      const designSystem = readFileSync(join(harnessRoot, 'design-system.md'), 'utf-8');
      const secretsAndAuth = readFileSync(join(harnessRoot, 'secrets-and-auth.md'), 'utf-8');
      const deployment = readFileSync(join(harnessRoot, 'deployment.md'), 'utf-8');
      const ambiguityMap = readFileSync(join(harnessRoot, 'ambiguity-map.md'), 'utf-8');
      const questionnaire = readFileSync(join(harnessRoot, 'intake-questionnaire.md'), 'utf-8');
      const runtimeCommands = readFileSync(join(harnessRoot, 'runtime-commands.md'), 'utf-8');
      const orchestration = readFileSync(join(harnessRoot, 'orchestration.md'), 'utf-8');

      assert.match(goalPrompt, /Complete the Oh My Goal harness objective/);
      assert.equal(objectiveFile.trim(), 'ralpli PRD draft');
      assert.doesNotMatch(goalPrompt, /Complete the user objective: \$oh-my-goal/);
      assert.ok(summary.goalPromptText.length < 1200, 'create_goal payload should stay compact and defer detail to harness files');
      assert.match(goalPrompt, /runtime-commands\.md/);
      assert.match(goalPrompt, /context-index\.md/);
      assert.match(goalPrompt, /execution-spec\.md/);
      assert.match(goalPrompt, /completion-gate\.md/);
      assert.match(goalPrompt, /quality pruning, design, secret\/auth, deployment, orchestration, and pressure-gate/i);
      assert.doesNotMatch(goalPrompt, /OPENAI_API_KEY/);
      assert.doesNotMatch(goalPrompt, /OMG_PLUGIN_ROOT/);
      assert.doesNotMatch(goalPrompt, /Deployment plan command:/);
      assert.doesNotMatch(goalPrompt, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.match(executionSpec, /# Execution Spec/);
      assert.match(executionSpec, /## Verification Plan/);
      assert.match(executionSpec, /## Agent Work Breakdown/);
      assert.match(executionSpec, /## Deployment Constraints/);
      assert.match(executionSpec, /LLM API:/);
      assert.match(executionSpec, /Credential setup:/);
      assert.match(executionSpec, /Quality frontier:/);
      assert.match(designSystem, /# Design System:/);
      assert.match(designSystem, /Token Architecture/);
      assert.match(designSystem, /Priority QA Rules/);
      assert.match(designSystem, /Pre-Delivery Checklist/);
      assert.match(designSystem, /ui-ux-pro-max-skill code snippets/);
      assert.match(designSystem, /Ported Search Evidence/);
      assert.match(secretsAndAuth, /OPENAI_API_KEY/);
      assert.match(secretsAndAuth, /CLERK_SECRET_KEY/);
      assert.match(secretsAndAuth, /Credential setup: secure-terminal-prompt/);
      assert.match(secretsAndAuth, /never paste raw API keys/i);
      assert.match(deployment, /Deployment target: vercel-preview/);
      assert.match(deployment, /deployment-runtime\.mjs/);
      assert.match(deployment, /--credential-setup 'secure-terminal-prompt'/);
      assert.match(deployment, /scripts\/deployment-runtime\.mjs" check/);
      assert.match(deployment, /scripts\/deployment-runtime\.mjs" setup-env/);
      assert.match(deployment, /scripts\/deployment-runtime\.mjs" deploy/);
      assert.match(deployment, /--execute/);
      assert.doesNotMatch(deployment, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.match(qualityFrontier, /# Quality Frontier/);
      assert.match(qualityFrontier, /Candidate Quality Lenses/);
      assert.match(pruningMatrix, /# Pruning Matrix/);
      assert.match(pruningMatrix, /Keep \/ Cut/);
      assert.match(selectedStrategy, /# Selected Strategy/);
      assert.match(selectedStrategy, /Rejected Or Deferred Quality Candidates/);
      assert.match(ambiguityMap, /Oh My Goal deep-interview pattern/i);
      assert.match(questionnaire, /Batch independent high-leverage questions/i);
      assert.match(questionnaire, /qualityFrontier/);
      assert.match(questionnaire, /Gap-fill contract/i);
      assert.match(runtimeCommands, /Team Runtime Auto-Start/);
      assert.match(runtimeCommands, /Pressure Runtime Auto-Start/);
      assert.match(runtimeCommands, /Design-System Runtime Auto-Start/);
      assert.match(runtimeCommands, /Deployment And Secret Runtime/);
      assert.match(runtimeCommands, /plugin-root-resolver\.mjs/);
      assert.match(runtimeCommands, /objective\.txt/);
      assert.match(runtimeCommands, /OH_MY_GOAL_PLUGIN_ROOT/);
      assert.match(runtimeCommands, /design-system-runtime\.mjs/);
      assert.match(runtimeCommands, /--mode 'generate-design-system'/);
      assert.match(runtimeCommands, /deployment-runtime\.mjs/);
      assert.match(runtimeCommands, /scripts\/deployment-runtime\.mjs" check/);
      assert.match(runtimeCommands, /scripts\/deployment-runtime\.mjs" setup-env/);
      assert.match(runtimeCommands, /scripts\/deployment-runtime\.mjs" deploy/);
      assert.match(runtimeCommands, /--credential-setup already-configured-vercel-env|--credential-setup 'already-configured-vercel-env'/);
      assert.match(runtimeCommands, /--execute/);
      assert.match(runtimeCommands, /scripts\/pressure-runtime\.mjs" init/);
      assert.match(runtimeCommands, /scripts\/pressure-runtime\.mjs" gate/);
      assert.match(runtimeCommands, /scripts\/pressure-runtime\.mjs" import-team/);
      assert.match(runtimeCommands, /scripts\/team-runtime\.mjs" watch/);
      assert.match(runtimeCommands, /--close-completed/);
      assert.match(runtimeCommands, /--notify/);
      assert.match(runtimeCommands, /watch\.ndjson/);
      assert.match(runtimeCommands, /CMUX Visibility/);
      assert.match(runtimeCommands, /cmux tree/);
      assert.match(runtimeCommands, /read-screen/);
      assert.match(runtimeCommands, /The user should not need to run them manually/);
      assert.match(runtimeCommands, /--team 'ralpli-prd-draft'/);
      assert.doesNotMatch(runtimeCommands, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      const resolver = readFileSync(join(harnessRoot, 'plugin-root-resolver.mjs'), 'utf-8');
      assert.match(resolver, /OH_MY_GOAL_PLUGIN_ROOT/);
      assert.match(resolver, /plugins', 'cache/);
      const resolverResult = spawnSync(
        process.execPath,
        [join(harnessRoot, 'plugin-root-resolver.mjs')],
        { cwd, encoding: 'utf-8', env: { ...process.env, OH_MY_GOAL_PLUGIN_ROOT: join(root, 'plugins', 'oh-my-goal') } },
      );
      assert.equal(resolverResult.status, 0, resolverResult.stderr || resolverResult.stdout);
      assert.equal(resolverResult.stdout.trim(), join(root, 'plugins', 'oh-my-goal'));
      assert.match(orchestration, /The leader should auto-start the plugin Team runtime/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('honors designSystemMode when generating harness design artifacts and runtime commands', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'oh-my-goal-design-mode-'));
    try {
      const result = spawnSync(
        process.execPath,
        [
          generatorPath,
          '--objective',
          'small internal dashboard',
          '--cwd',
          cwd,
          '--slug',
          'skip-design',
          '--interview-complete',
          '--answers-json',
          JSON.stringify({
            deliverableScope: 'minimal working implementation',
            stack: 'static html/css/js',
            acceptance: 'working dashboard shell',
            verification: 'inspect generated files',
            designSystemMode: 'skip-design-system',
            deploymentTarget: 'no-deployment',
            llmApi: 'no-llm-api',
            authProvider: 'no-auth',
            qualityFrontier: 'maintainability, verification depth, user workflow',
            qualityPruning: 'simple maintainable core first',
            pruningRule: 'maximize quality within scope',
          }),
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);

      const summary = JSON.parse(result.stdout) as { root: string };
      const harnessRoot = join(cwd, summary.root);
      const executionSpec = readFileSync(join(harnessRoot, 'execution-spec.md'), 'utf-8');
      const designSystem = readFileSync(join(harnessRoot, 'design-system.md'), 'utf-8');
      const runtimeCommands = readFileSync(join(harnessRoot, 'runtime-commands.md'), 'utf-8');
      const completionGate = readFileSync(join(harnessRoot, 'completion-gate.md'), 'utf-8');

      assert.match(executionSpec, /Design-system mode: skip-design-system/);
      assert.match(designSystem, /Design system mode: skip-design-system/);
      assert.match(designSystem, /Skipped By Intake/);
      assert.match(designSystem, /minimal UI safety gate/i);
      assert.match(runtimeCommands, /## Design-System Runtime/);
      assert.doesNotMatch(runtimeCommands, /Design-System Runtime Auto-Start/);
      assert.doesNotMatch(runtimeCommands, /design-system-runtime\.mjs/);
      assert.match(completionGate, /Design-system skip evidence/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('accepts raw runtime answers arrays when generating harness artifacts', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'oh-my-goal-plugin-'));
    try {
      const runtimePayload = {
        ok: true,
        answers: [
          { question_id: 'deliverableScope', answer: { selected_values: ['polished-single-screen'] } },
          { question_id: 'stack', answer: { selected_values: ['static-html-css-js'] } },
          { question_id: 'ux', answer: { selected_values: ['clean-app-ui'] } },
          { question_id: 'acceptance', answer: { selected_values: ['mouse-keyboard-core-edge-cases'] } },
          { question_id: 'verification', answer: { selected_values: ['browser-check-plus-lightweight-tests'] } },
          { question_id: 'outputMode', answer: { selected_values: ['harness-only'] } },
          { question_id: 'deploymentTarget', answer: { selected_values: ['vercel-preview'] } },
          { question_id: 'llmApi', answer: { selected_values: ['openai-api'] } },
          { question_id: 'authProvider', answer: { selected_values: ['clerk'] } },
          { question_id: 'secretHandling', answer: { selected_values: ['vercel-env-secure-prompt'] } },
          { question_id: 'credentialSetup', answer: { selected_values: ['secure-terminal-prompt'] } },
          { question_id: 'designSystemMode', answer: { selected_values: ['generate-design-system'] } },
          { question_id: 'nonGoals', answer: { selected_values: ['no-backend-auth-persistence', 'no-new-dependencies'] } },
          { question_id: 'qualityFrontier', answer: { selected_values: ['user-workflow-polish', 'verification-depth'] } },
          { question_id: 'qualityPruning', answer: { selected_values: ['user-visible-value-first', 'verification-reliability-first'] } },
          { question_id: 'pruningRule', answer: { selected_values: ['maximize-quality-within-scope'] } },
        ],
      };
      const result = spawnSync(
        process.execPath,
        [
          generatorPath,
          '--objective',
          'mirofish zep memory assistant',
          '--cwd',
          cwd,
          '--slug',
          'runtime-answer-array',
          '--interview-complete',
          '--answers-json',
          JSON.stringify(runtimePayload),
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const summary = JSON.parse(result.stdout) as { root: string; goalPromptText: string };
      const harnessRoot = join(cwd, summary.root);
      assert.match(summary.goalPromptText, /Complete the Oh My Goal harness objective/);
      assert.ok(summary.goalPromptText.length < 1200);
      assert.match(readFileSync(join(harnessRoot, 'execution-spec.md'), 'utf-8'), /user-workflow-polish; verification-depth/);
      assert.match(readFileSync(join(harnessRoot, 'pruning-matrix.md'), 'utf-8'), /user-visible-value-first/);
      assert.match(readFileSync(join(harnessRoot, 'deep-interview.md'), 'utf-8'), /maximize-quality-within-scope/);
      assert.match(readFileSync(join(harnessRoot, 'secrets-and-auth.md'), 'utf-8'), /ZEP_API_KEY/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('keeps create_goal payload under the Codex objective limit for long objectives', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'oh-my-goal-long-goal-'));
    try {
      const longObjective = `Build a release-ready AI workspace with LONG_OBJECTIVE_SENTINEL ${'detailed requirement '.repeat(260)}`;
      assert.ok(longObjective.length > 4000);
      const result = spawnSync(
        process.execPath,
        [
          generatorPath,
          '--objective',
          longObjective,
          '--cwd',
          cwd,
          '--slug',
          'long-objective',
          '--interview-complete',
          '--answers-json',
          JSON.stringify({
            deliverableScope: 'full-featured-implementation',
            stack: 'nextjs',
            acceptance: 'release-ready implementation with tests and deployment plan',
            verification: 'build, tests, browser smoke check, and deployment readiness',
            deploymentTarget: 'vercel-preview',
            llmApi: 'openai-api',
            authProvider: 'clerk',
            secretHandling: 'vercel-env-secure-prompt',
            credentialSetup: 'secure-terminal-prompt',
            designSystemMode: 'generate-design-system',
            qualityFrontier: 'UX ergonomics, maintainability, reliability, verification depth',
            qualityPruning: 'compare multiple strategies before implementation',
            pruningRule: 'maximize quality within scope',
          }),
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);

      const summary = JSON.parse(result.stdout) as { root: string; goalPromptText: string };
      const harnessRoot = join(cwd, summary.root);
      const goalPrompt = readFileSync(join(harnessRoot, 'goal-prompt.md'), 'utf-8');
      const executionSpec = readFileSync(join(harnessRoot, 'execution-spec.md'), 'utf-8');
      const runtimeCommands = readFileSync(join(harnessRoot, 'runtime-commands.md'), 'utf-8');
      const deployment = readFileSync(join(harnessRoot, 'deployment.md'), 'utf-8');
      const objectiveFile = readFileSync(join(harnessRoot, 'objective.txt'), 'utf-8');

      assert.ok(summary.goalPromptText.length < 1000, `goal prompt should stay compact, got ${summary.goalPromptText.length}`);
      assert.ok(goalPrompt.length < 1200, `goal-prompt.md should stay compact, got ${goalPrompt.length}`);
      assert.doesNotMatch(summary.goalPromptText, /LONG_OBJECTIVE_SENTINEL/);
      assert.match(summary.goalPromptText, /execution-spec\.md/);
      assert.match(executionSpec, /LONG_OBJECTIVE_SENTINEL/);
      assert.match(objectiveFile, /LONG_OBJECTIVE_SENTINEL/);
      assert.doesNotMatch(runtimeCommands, /LONG_OBJECTIVE_SENTINEL/);
      assert.doesNotMatch(deployment, /LONG_OBJECTIVE_SENTINEL/);
      assert.match(runtimeCommands, /--objective "\$\(cat '\.omg\/harness\/long-objective\/objective\.txt'\)"/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('distills complex product objectives into a compact execution-focused goal prompt', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'oh-my-goal-complex-prompt-'));
    try {
      const complexObjective = [
        '한국인 페르소나 기반 AI-first 시장조사 플랫폼을 만든다.',
        '프로젝트별 문제상황, 타겟 조건, 설문지, 페르소나, 개별 AI 응답, MiroFish 스타일 swarm simulation, Zep sync 상태, 최종 리포트를 저장한다.',
        '문제상황 기반으로 실제 설문 문항을 자동 생성하고 테스트용 계산기/더미 문항은 절대 섞지 않는다.',
        'OpenAI 호출과 Zep 호출은 서버 사이드 API route에서만 처리하고 Zep은 ZEP_API_KEY만 사용한다.',
        'GitHub 새 레포지토리에 push하고 Vercel 배포 URL을 최종 보고한다.',
        '개별 AI survey와 swarm 결과를 비교해 synthetic stability/confidence로 표시한다.',
      ].join('\n');

      const result = spawnSync(
        process.execPath,
        [
          generatorPath,
          '--objective',
          complexObjective,
          '--cwd',
          cwd,
          '--slug',
          'korean-market-research',
          '--interview-complete',
          '--answers-json',
          JSON.stringify({
            deliverableScope: 'Vercel-deployable MVP',
            stack: 'Next.js / React app',
            acceptance: 'local MVP, GitHub push, Vercel deployment URL or explicit blocker',
            verification: 'build, tests, smoke test, deployment readiness',
            deploymentTarget: 'Vercel preview deployment',
            llmApi: 'OpenAI API',
            authProvider: 'no-auth',
            secretHandling: 'Use secure env prompts, never commit secrets',
            credentialSetup: 'Use Vercel CLI secure prompts',
            designSystemMode: 'match-existing-design-system',
            qualityFrontier: 'survey quality, persona realism, swarm stability, Zep sync reliability',
            qualityPruning: 'verification and reliability first, user-visible value first',
            pruningRule: 'best quality per implementation cost',
          }),
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);

      const summary = JSON.parse(result.stdout) as { root: string; goalPromptText: string; route: string };
      const harnessRoot = join(cwd, summary.root);
      const goalPrompt = readFileSync(join(harnessRoot, 'goal-prompt.md'), 'utf-8');
      const executionSpec = readFileSync(join(harnessRoot, 'execution-spec.md'), 'utf-8');
      const runtimeCommands = readFileSync(join(harnessRoot, 'runtime-commands.md'), 'utf-8');
      const objectiveFile = readFileSync(join(harnessRoot, 'objective.txt'), 'utf-8');

      assert.equal(summary.route, 'agent_orchestrated');
      assert.match(goalPrompt, /# Recommended Codex Goal Prompt/);
      assert.match(goalPrompt, /```text/);
      assert.ok(goalPrompt.includes(summary.goalPromptText));
      assert.ok(summary.goalPromptText.length < 1400, `complex goal prompt should stay compact, got ${summary.goalPromptText.length}`);
      assert.match(summary.goalPromptText, /Full request: \.omg\/harness\/korean-market-research\/objective\.txt/);
      assert.match(summary.goalPromptText, /Vercel-deployable MVP of the Korean AI-first market-research simulation platform/);
      assert.match(summary.goalPromptText, /OpenAI\/LLM, Zep calls server-side only/);
      assert.match(summary.goalPromptText, /ZEP_API_KEY/);
      assert.match(summary.goalPromptText, /sync failed in UI\/report/);
      assert.match(summary.goalPromptText, /GitHub\/Vercel\/OpenAI\/LLM\/Zep credentials\/URLs/);
      assert.match(summary.goalPromptText, /demo, calculator, or dummy questions/);
      assert.match(summary.goalPromptText, /synthetic stability\/confidence/);
      assert.match(summary.goalPromptText, /Startup: run pressure \+ Team Auto-Start first/);
      assert.match(runtimeCommands, /--require-interactive/);
      assert.match(runtimeCommands, /status: "launched"/);
      assert.match(runtimeCommands, /Explicit sequential fallback command/);
      assert.match(runtimeCommands, /scripts\/team-runtime\.mjs" watch/);
      assert.match(runtimeCommands, /--close-completed/);
      assert.match(runtimeCommands, /--notify/);
      assert.doesNotMatch(summary.goalPromptText, /프로젝트별 문제상황/);
      assert.doesNotMatch(summary.goalPromptText, /OpenAI 호출과 Zep 호출은 서버 사이드/);
      assert.match(objectiveFile, /프로젝트별 문제상황/);
      assert.match(executionSpec, /survey quality; persona realism; swarm stability; Zep sync reliability/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('requires visible Team Auto-Start for ordinary implementation goals', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'oh-my-goal-simple-team-'));
    try {
      const result = spawnSync(
        process.execPath,
        [
          generatorPath,
          '--objective',
          'Build a calculator website.',
          '--cwd',
          cwd,
          '--slug',
          'calculator-website',
          '--interview-complete',
          '--answers-json',
          JSON.stringify({
            deliverableScope: 'Minimal working implementation',
            stack: 'Static HTML/CSS/JS',
            ux: 'Clean app UI',
            acceptance: 'calculator page supports basic arithmetic and opens locally',
            verification: 'browser smoke check plus lightweight test',
            outputMode: 'Create harness and implement after approval',
            deploymentTarget: 'No deployment',
            llmApi: 'No LLM API',
            authProvider: 'No authentication',
            secretHandling: 'No secrets needed',
            credentialSetup: 'No secrets needed',
            designSystemMode: 'Use a lightweight design checklist',
            qualityFrontier: 'usable interaction, responsive layout, arithmetic correctness',
            qualityPruning: 'compare simple static implementation against heavier app scaffold',
            pruningRule: 'prefer the smallest implementation that still feels polished',
          }),
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);

      const summary = JSON.parse(result.stdout) as { root: string; goalPromptText: string };
      const harnessRoot = join(cwd, summary.root);
      const runtimeCommands = readFileSync(join(harnessRoot, 'runtime-commands.md'), 'utf-8');

      assert.match(summary.goalPromptText, /Startup: run pressure \+ Team Auto-Start first/);
      assert.match(summary.goalPromptText, /require "launched"/);
      assert.match(runtimeCommands, /--require-interactive/);
      assert.match(runtimeCommands, /status: "launched"/);
      assert.match(runtimeCommands, /Explicit sequential fallback command/);
      assert.match(runtimeCommands, /scripts\/team-runtime\.mjs" watch/);
      assert.match(runtimeCommands, /--close-completed/);
      assert.match(runtimeCommands, /--notify/);
      assert.doesNotMatch(summary.goalPromptText, /leader-only is sufficient/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('does not promote negative intake choices into external-service goal constraints', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'oh-my-goal-negative-signals-'));
    try {
      const result = spawnSync(
        process.execPath,
        [
          generatorPath,
          '--objective',
          'Create a small static website with no login, no OpenAI, and no deployment.',
          '--cwd',
          cwd,
          '--slug',
          'static-no-services',
          '--interview-complete',
          '--answers-json',
          JSON.stringify({
            deliverableScope: 'Minimal working implementation',
            stack: 'Static HTML/CSS/JS',
            acceptance: 'static page opens locally',
            verification: 'browser smoke check',
            deploymentTarget: 'No deployment',
            llmApi: 'No LLM API',
            authProvider: 'No authentication',
            secretHandling: 'No secrets needed',
            credentialSetup: 'No secrets needed',
            designSystemMode: 'Use a lightweight design checklist',
          }),
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);

      const summary = JSON.parse(result.stdout) as { goalPromptText: string; root: string };
      const harnessRoot = join(cwd, summary.root);
      const goalPrompt = readFileSync(join(harnessRoot, 'goal-prompt.md'), 'utf-8');

      assert.match(summary.goalPromptText, /satisfy execution-spec\.md exactly/);
      assert.doesNotMatch(summary.goalPromptText, /server-side only/);
      assert.doesNotMatch(summary.goalPromptText, /credentials\/URLs/);
      assert.doesNotMatch(summary.goalPromptText, /OpenAI\/LLM/);
      assert.doesNotMatch(summary.goalPromptText, /ZEP_API_KEY/);
      assert.doesNotMatch(summary.goalPromptText, /Vercel-deployable/);
      assert.ok(goalPrompt.includes(summary.goalPromptText));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('normalizes human-readable intake labels before deployment and secret planning', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'oh-my-goal-labels-'));
    try {
      const result = spawnSync(
        process.execPath,
        [
          generatorPath,
          'AI web app with login and Vercel preview',
          '--cwd',
          cwd,
          '--slug',
          'ai-webapp-labels',
          '--interview-complete',
          '--answers-json',
          JSON.stringify({
            deliverableScope: 'Polished single-screen implementation',
            stack: 'Next.js / React app',
            acceptance: 'working web app',
            verification: 'build plus browser smoke check',
            deploymentTarget: 'Vercel preview deployment',
            llmApi: 'OpenAI API',
            authProvider: 'Clerk authentication',
            secretHandling: 'Use secure env prompts, never commit secrets',
            credentialSetup: 'Use Vercel CLI secure prompts',
            designSystemMode: 'Generate design-system.md before implementation',
            qualityFrontier: 'UX ergonomics, maintainability, reliability',
            qualityPruning: 'Compare multiple strategies before implementation',
            pruningRule: 'Choose simplest path that satisfies quality gates',
          }),
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);

      const summary = JSON.parse(result.stdout) as { root: string };
      const harnessRoot = join(cwd, summary.root);
      const secretsAndAuth = readFileSync(join(harnessRoot, 'secrets-and-auth.md'), 'utf-8');
      const deployment = readFileSync(join(harnessRoot, 'deployment.md'), 'utf-8');
      const runtimeCommands = readFileSync(join(harnessRoot, 'runtime-commands.md'), 'utf-8');

      assert.match(secretsAndAuth, /OPENAI_API_KEY/);
      assert.match(secretsAndAuth, /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/);
      assert.match(secretsAndAuth, /CLERK_SECRET_KEY/);
      assert.match(deployment, /--target 'vercel-preview'/);
      assert.match(deployment, /--llm 'openai-api'/);
      assert.match(deployment, /--auth 'clerk'/);
      assert.match(deployment, /--framework 'nextjs'/);
      assert.match(deployment, /--credential-setup 'secure-terminal-prompt'/);
      assert.match(runtimeCommands, /--credential-setup 'already-configured-vercel-env'/);
      assert.match(runtimeCommands, /plugin-root-resolver\.mjs/);
      assert.doesNotMatch(runtimeCommands, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('generates design-system and deployment runtime artifacts for web goals', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'oh-my-goal-web-runtime-'));
    try {
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { build: 'next build' }, dependencies: { next: '^15.0.0' } }), 'utf-8');

      const design = spawnSync(
        process.execPath,
        [
          designRuntimePath,
          '--objective',
          'AI SaaS website with chat assistant and mirofish zep memory',
          '--slug',
          'ai-saas',
          '--stack',
          'nextjs-vercel',
          '--cwd',
          cwd,
          '--persist',
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(design.status, 0, design.stderr || design.stdout);
      const designPayload = JSON.parse(design.stdout) as { system: { category: string; mode: string; source: string; ui_pro_max: { category: string; matches: { product: Array<{ label: string; score: number }>; color: Array<{ label: string; score: number }> } }; priority_rules: unknown[]; tokens: { primitive: Record<string, string>; semantic: Record<string, string> } }; persisted: { written: string[] }; markdown: string };
      assert.equal(designPayload.system.category, 'ai-saas');
      assert.equal(designPayload.system.mode, 'generate-design-system');
      assert.equal(designPayload.system.source, 'oh-my-goal/design-system-runtime:ported-ui-ux-pro-max-core');
      assert.equal(designPayload.system.ui_pro_max.category, 'AI/Chatbot Platform');
      assert.equal(designPayload.system.ui_pro_max.matches.product[0]?.label, 'AI/Chatbot Platform');
      assert.equal(designPayload.system.ui_pro_max.matches.color[0]?.label, 'AI/Chatbot Platform');
      assert.equal(designPayload.system.priority_rules.length, 10);
      assert.equal(designPayload.system.tokens.primitive['color-primary-base'], '#2563EB');
      assert.ok(designPayload.system.tokens.primitive['font-body-base']);
      assert.equal(designPayload.system.tokens.semantic['color-primary-foreground'], 'var(--color-white)');
      assert.equal(designPayload.system.tokens.semantic['font-body'], 'var(--font-body-base)');
      assert.equal(designPayload.system.tokens.semantic['font-display'], 'var(--font-heading-base)');
      assert.match(designPayload.markdown, /Ported Search Evidence/);
      assert.match(designPayload.markdown, /core\.py` BM25 search/);
      assert.match(designPayload.markdown, /Token Architecture/);
      assert.match(designPayload.markdown, /\| On Primary \| #FFFFFF \| --color-primary-foreground \|/);
      assert.match(designPayload.markdown, /\| Card \| #FFFFFF \| --color-card \|/);
      assert.match(designPayload.markdown, /\| Destructive \| #DC2626 \| --color-destructive \|/);
      assert.match(designPayload.markdown, /\| Focus Ring \| #2563EB \| --color-ring \|/);
      assert.match(designPayload.markdown, /b7e3af80f6e331f6fb456667b82b12cade7c9d35/);
      assert.match(designPayload.markdown, /Priority QA Rules/);
      assert.doesNotMatch(designPayload.markdown, /\| 1 \| 1 \|/);
      assert.match(designPayload.markdown, /Pre-Delivery Checklist/);
      assert.ok(designPayload.persisted.written.includes('.omg/design-systems/ai-saas/MASTER.md'));
      assert.match(readFileSync(join(cwd, '.omg/design-systems/ai-saas/MASTER.md'), 'utf-8'), /Design System: ai-saas/);

      const skippedDesign = spawnSync(
        process.execPath,
        [
          designRuntimePath,
          '--objective',
          'plain internal admin page',
          '--slug',
          'skip-ui-system',
          '--stack',
          'static',
          '--mode',
          'skip-design-system',
          '--cwd',
          cwd,
          '--persist',
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(skippedDesign.status, 0, skippedDesign.stderr || skippedDesign.stdout);
      const skippedDesignPayload = JSON.parse(skippedDesign.stdout) as { system: { mode: string }; persisted: { written: string[] }; markdown: string };
      assert.equal(skippedDesignPayload.system.mode, 'skip-design-system');
      assert.match(skippedDesignPayload.markdown, /Skipped By Intake/);
      assert.match(skippedDesignPayload.markdown, /Minimal UI Safety Gate/);
      assert.doesNotMatch(skippedDesignPayload.markdown, /Ported Search Evidence/);
      assert.doesNotMatch(skippedDesignPayload.markdown, /Token Architecture/);
      assert.ok(skippedDesignPayload.persisted.written.includes('.omg/design-systems/skip-ui-system/MASTER.md'));

      const deployment = spawnSync(
        process.execPath,
        [
          deploymentRuntimePath,
          'plan',
          '--objective',
          'AI SaaS website with chat assistant and mirofish zep memory',
          '--slug',
          'ai-saas',
          '--target',
          'vercel-production',
          '--llm',
          'openai-api',
          '--auth',
          'clerk',
          '--credential-setup',
          'secure-terminal-prompt',
          '--cwd',
          cwd,
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(deployment.status, 0, deployment.stderr || deployment.stdout);
      const deploymentPayload = JSON.parse(deployment.stdout) as { plan_path: string; written: string[]; plan: { framework: string; credentialSetup: string; credentialStatus: string; buildCommand: string; deployCommand: string; envVars: Array<{ name: string }>; commands: string[] }; markdown: string };
      assert.equal(deploymentPayload.plan.framework, 'nextjs');
      assert.equal(deploymentPayload.plan.credentialSetup, 'secure-terminal-prompt');
      assert.equal(deploymentPayload.plan.credentialStatus, 'secure_prompt_required');
      assert.equal(deploymentPayload.plan.buildCommand, 'npm run build');
      assert.equal(deploymentPayload.plan.deployCommand, 'vercel deploy --prod --yes');
      assert.ok(deploymentPayload.plan.envVars.some((item) => item.name === 'OPENAI_API_KEY'));
      assert.ok(deploymentPayload.plan.envVars.some((item) => item.name === 'ZEP_API_KEY'));
      assert.ok(deploymentPayload.plan.envVars.some((item) => item.name === 'CLERK_SECRET_KEY'));
      assert.ok(deploymentPayload.plan.commands.includes('vercel deploy --prod --yes'));
      assert.ok(deploymentPayload.written.includes('.omg/runtime/deployment/ai-saas/.env.example'));
      assert.match(deploymentPayload.markdown, /never in committed files or chat logs/i);
      assert.match(deploymentPayload.markdown, /\.env\.example Template/);
      assert.match(deploymentPayload.markdown, /Automated Runtime Path/);
      assert.match(deploymentPayload.markdown, /setup-env --json/);
      assert.match(readFileSync(join(cwd, deploymentPayload.plan_path), 'utf-8'), /Vercel Commands/);
      assert.match(readFileSync(join(cwd, '.omg/runtime/deployment/ai-saas/.env.example'), 'utf-8'), /OPENAI_API_KEY=/);
      assert.match(readFileSync(join(cwd, '.omg/runtime/deployment/ai-saas/.env.example'), 'utf-8'), /ZEP_API_KEY=/);

      const setupEnvDryRun = spawnSync(
        process.execPath,
        [
          deploymentRuntimePath,
          'setup-env',
          '--objective',
          'AI SaaS website with chat assistant and mirofish zep memory',
          '--slug',
          'ai-saas',
          '--target',
          'vercel-production',
          '--llm',
          'openai-api',
          '--auth',
          'clerk',
          '--credential-setup',
          'secure-terminal-prompt',
          '--cwd',
          cwd,
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(setupEnvDryRun.status, 0, setupEnvDryRun.stderr || setupEnvDryRun.stdout);
      const setupEnvPayload = JSON.parse(setupEnvDryRun.stdout) as { dry_run: boolean; setup_path: string; setup_commands: string[]; next_action: string };
      assert.equal(setupEnvPayload.dry_run, true);
      assert.ok(setupEnvPayload.setup_commands.includes('vercel link --yes'));
      assert.ok(setupEnvPayload.setup_commands.includes('vercel env add OPENAI_API_KEY production'));
      assert.ok(setupEnvPayload.setup_commands.includes('vercel env add ZEP_API_KEY production'));
      assert.ok(setupEnvPayload.setup_commands.includes('vercel env add CLERK_SECRET_KEY preview'));
      assert.match(setupEnvPayload.next_action, /attached terminal/);
      assert.match(readFileSync(join(cwd, setupEnvPayload.setup_path), 'utf-8'), /Secret Setup/);
      assert.match(readFileSync(join(cwd, setupEnvPayload.setup_path), 'utf-8'), /Do not paste values into chat/);

      const deploymentDryRun = spawnSync(
        process.execPath,
        [
          deploymentRuntimePath,
          'deploy',
          '--objective',
          'AI SaaS website with chat assistant',
          '--slug',
          'ai-saas',
          '--target',
          'vercel-production',
          '--llm',
          'no-llm-api',
          '--auth',
          'no-auth',
          '--credential-setup',
          'no-secrets-needed',
          '--cwd',
          cwd,
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(deploymentDryRun.status, 0, deploymentDryRun.stderr || deploymentDryRun.stdout);
      const dryRunPayload = JSON.parse(deploymentDryRun.stdout) as { dry_run: boolean; deploy_steps: string[]; readiness: { checks: Array<{ id: string }>; blockers: string[] } };
      assert.equal(dryRunPayload.dry_run, true);
      assert.ok(dryRunPayload.deploy_steps.includes('npm run build'));
      assert.ok(dryRunPayload.deploy_steps.includes('vercel deploy --prod --yes'));
      assert.ok(dryRunPayload.readiness.checks.some((check) => check.id === 'vercel-cli'));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('provides migration guidance for old harnesses missing quality pruning evidence', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'oh-my-goal-migration-'));
    try {
      const harnessRoot = join(cwd, '.omg', 'harness', 'old-harness');
      mkdirSync(harnessRoot, { recursive: true });
      writeFileSync(join(harnessRoot, 'completion-gate.md'), '# Completion Gate\n\n- External verification passed.\n', 'utf-8');

      const dryRun = spawnSync(
        process.execPath,
        [
          qualityMigrationPath,
          '--slug',
          'old-harness',
          '--cwd',
          cwd,
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
      const dryPayload = JSON.parse(dryRun.stdout) as {
        missing_files: string[];
        completion_needs_quality_pruning: boolean;
        written: string[];
        guide: string;
      };
      assert.equal(dryPayload.completion_needs_quality_pruning, true);
      assert.deepEqual(dryPayload.missing_files, ['quality-frontier.md', 'pruning-matrix.md', 'selected-strategy.md']);
      assert.deepEqual(dryPayload.written, []);
      assert.match(dryPayload.guide, /qualityPruning/);
      assert.match(dryPayload.guide, /frontierConsidered/);

      const applied = spawnSync(
        process.execPath,
        [
          qualityMigrationPath,
          '--slug',
          'old-harness',
          '--cwd',
          cwd,
          '--apply',
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(applied.status, 0, applied.stderr || applied.stdout);
      const appliedPayload = JSON.parse(applied.stdout) as { written: string[]; guide_path: string };
      assert.ok(appliedPayload.written.includes('.omg/harness/old-harness/quality-pruning-migration.md'));
      assert.ok(existsSync(join(harnessRoot, 'quality-frontier.md')));
      assert.ok(existsSync(join(harnessRoot, 'pruning-matrix.md')));
      assert.ok(existsSync(join(harnessRoot, 'selected-strategy.md')));
      assert.match(readFileSync(join(cwd, appliedPayload.guide_path), 'utf-8'), /Completion Evidence Patch/);
      assert.match(readFileSync(join(harnessRoot, 'pruning-matrix.md'), 'utf-8'), /speculative polish/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
