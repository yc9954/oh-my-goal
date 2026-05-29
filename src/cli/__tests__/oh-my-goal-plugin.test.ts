import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();
const skillRoot = join(root, 'plugins', 'oh-my-goal', 'skills', 'oh-my-goal');
const skillPath = join(skillRoot, 'SKILL.md');
const generatorPath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'create-harness.mjs');
const questionEnginePath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'intake-question-engine.mjs');
const questionRuntimePath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'intake-question-runtime.mjs');
const teamRuntimePath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'team-runtime.mjs');

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
    assert.match(skill, /intake-question-engine\.mjs/);
    assert.match(skill, /intake-question-runtime\.mjs/);
    assert.match(skill, /--mode auto/);
    assert.match(skill, /--mode sequential/);
    assert.match(skill, /sequential-answer/);
    assert.match(skill, /ambiguity score/i);
    assert.match(skill, /team-runtime\.mjs/);
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
      'references/omx-patterns.md',
    ];

    for (const file of files) {
      assert.ok(readSkillRelative(file).trim().length > 0, `${file} should exist`);
    }

    const topFlow = readSkillRelative('FLOW.md');
    assert.match(topFlow, /Phase Router/i);
    assert.match(topFlow, /INTAKE_PENDING/);
    assert.match(topFlow, /one question at a time/i);
    assert.match(topFlow, /create files, run harness generator, code, create goal/i);
    assert.match(topFlow, /templates\/first-turn-response\.md/);

    const flow = readSkillRelative('flows/00-entrypoint.md');
    assert.match(flow, /State Machine/i);
    assert.match(flow, /INTAKE_PENDING/);
    assert.match(flow, /Stop after questions/i);
    assert.match(flow, /Do not create files/i);

    const intake = readSkillRelative('flows/01-intake-gate.md');
    assert.match(intake, /ambiguity map/i);
    assert.match(intake, /intake-question-engine\.mjs/i);
    assert.match(intake, /not `skills\/oh-my-goal\/scripts\/intake-question-engine\.mjs`/);
    assert.match(intake, /questions\[\]/i);
    assert.match(intake, /multi-answerable/i);
    assert.match(intake, /selected_values/i);
    assert.match(intake, /sequential-answer/i);
    assert.match(intake, /ambiguity score/i);
    assert.match(intake, /Gap-Fill Passes/i);

    const orchestration = readSkillRelative('flows/04-orchestration.md');
    assert.match(orchestration, /Metis/i);
    assert.match(orchestration, /Momus/i);
    assert.match(orchestration, /Oracle/i);
    assert.match(orchestration, /team-runtime\.mjs/i);
    assert.match(orchestration, /not `skills\/oh-my-goal\/scripts\/team-runtime\.mjs`/);
    assert.match(orchestration, /tmux panes/i);
    assert.match(orchestration, /collect/i);
    assert.match(orchestration, /Local-Optimum Pressure/i);

    const firstTurnTemplate = readSkillRelative('templates/first-turn-response.md');
    assert.match(firstTurnTemplate, /Stop immediately/i);
    assert.match(firstTurnTemplate, /Do not add a plan/i);
    assert.match(firstTurnTemplate, /Question 1 of <n>/i);
    assert.match(firstTurnTemplate, /Ambiguity: <score>/i);
  });

  it('ports the OMX question schema into the plugin intake question engine', () => {
    const result = spawnSync(
      process.execPath,
      [questionEnginePath, '--objective', '계산기 앱을 웹사이트 형태로 만들어줘', '--format', 'payload'],
      { cwd: root, encoding: 'utf-8' },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout) as {
      source: string;
      questions: Array<{
        id: string;
        type: string;
        multi_select: boolean;
        options: Array<{ label: string; value: string; description?: string }>;
      }>;
    };
    assert.equal(payload.source, 'oh-my-goal');
    assert.equal(payload.questions.length, 7);
    assert.equal(payload.questions[0]?.id, 'deliverableScope');
    assert.equal(payload.questions[0]?.type, 'single-answerable');
    assert.equal(payload.questions[0]?.multi_select, false);
    assert.equal(payload.questions[6]?.id, 'nonGoals');
    assert.equal(payload.questions[6]?.type, 'multi-answerable');
    assert.equal(payload.questions[6]?.multi_select, true);
    assert.equal(payload.questions[6]?.options[1]?.value, 'no-new-dependencies');

    const markdownResult = spawnSync(
      process.execPath,
      [questionEnginePath, '--objective', '계산기 앱을 웹사이트 형태로 만들어줘', '--format', 'markdown'],
      { cwd: root, encoding: 'utf-8' },
    );
    assert.equal(markdownResult.status, 0, markdownResult.stderr || markdownResult.stdout);
    assert.match(markdownResult.stdout, /OMX question schema fallback/);
    assert.match(markdownResult.stdout, /questions\[\]/);
    assert.match(markdownResult.stdout, /\[single-answerable\] id=deliverableScope multi_select=false/);
    assert.match(markdownResult.stdout, /label="Polished single-screen implementation" value="polished-single-screen"/);
    assert.match(markdownResult.stdout, /\[multi-answerable\] id=nonGoals multi_select=true/);
    assert.match(markdownResult.stdout, /answers\[\] -> \{ question_id, answer: \{ selected_values: \[\.\.\.\] \} \}/);

    const commandResult = spawnSync(
      process.execPath,
      [questionEnginePath, '--objective', '계산기 앱을 웹사이트 형태로 만들어줘', '--format', 'omx-command'],
      { cwd: root, encoding: 'utf-8' },
    );
    assert.equal(commandResult.status, 0, commandResult.stderr || commandResult.stdout);
    assert.match(commandResult.stdout, /omx question --input/);
    assert.match(commandResult.stdout, /questions/);
  });

  it('provides an optional question runtime with arrow UI support, sequential fallback, and structured inline answers', () => {
    const runtimeSource = readFileSync(questionRuntimePath, 'utf-8');
    assert.match(runtimeSource, /emitKeypressEvents/);
    assert.match(runtimeSource, /renderQuestionWizardFrame/);
    assert.match(runtimeSource, /↑↓ move/);
    assert.match(runtimeSource, /split-window/);
    assert.match(runtimeSource, /#\{pane_id\}/);
    assert.match(runtimeSource, /OMG_QUESTION_RETURN_PANE/);
    assert.match(runtimeSource, /isCurrentTmuxSessionAttached/);
    assert.match(runtimeSource, /launchMacosTerminalUi/);
    assert.match(runtimeSource, /osascript/);
    const cwd = mkdtempSync(join(tmpdir(), 'oh-my-goal-runtime-'));
    try {
      const fakeBin = join(cwd, 'bin');
      mkdirSync(fakeBin);
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
      assert.equal(bridgePayload.answers.length, 7);
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
        assert.equal(terminalPayload.answers.length, 7);
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
          env: { ...process.env, TMUX: '', TMUX_PANE: '', OMG_DISABLE_TERMINAL_BRIDGE: '1' },
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
      assert.match(fallbackPayload.prompt, /Question 1 of 7/);
      assert.match(fallbackPayload.prompt, /Ambiguity: 0\.86 \(high\)/);

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
        { cwd: root, encoding: 'utf-8', env: { ...process.env, TMUX: '', TMUX_PANE: '', OMG_DISABLE_TERMINAL_BRIDGE: '1' } },
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
      assert.match(sequentialPayload.prompt, /Question 1 of 7/);
      assert.match(sequentialPayload.prompt, /Ambiguity: 0\.86 \(high\)/);
      assert.match(sequentialPayload.prompt, /\[single-answerable\] id=deliverableScope multi_select=false/);

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
      assert.match(nextPayload.prompt, /Question 2 of 7/);

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
          input: ['1', '1', '1', '1', '1', '1', '1,2', ''].join('\n'),
          env: { ...process.env, TMUX: '', TMUX_PANE: '' },
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
      assert.equal(payload.answers.length, 7);
      assert.equal(payload.answers[0]?.answer.selected_values[0], 'polished-single-screen');
      assert.equal(payload.answers[6]?.question_id, 'nonGoals');
      assert.equal(payload.answers[6]?.answer.kind, 'multi');
      assert.deepEqual(payload.answers[6]?.answer.selected_values, ['no-backend-auth-persistence', 'no-new-dependencies']);
      assert.match(payload.record_path, /\.omg\/runtime\/questions\/question-/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('ports the useful OMX Team surface into an optional plugin team runtime', () => {
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
        workers: Array<{ inbox: string; prompt: string; result: string }>;
      };
      assert.equal(launchPayload.ok, true);
      assert.equal(launchPayload.status, 'planned');
      assert.equal(launchPayload.state_root, '.omg/runtime/team/implement-ui-write-tests-updat');
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
        workers: Array<{ status: string; result_exists: boolean }>;
      };
      assert.equal(statusPayload.workers.length, 3);
      assert.equal(statusPayload.workers[0]?.status, 'planned');
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
          'calculator website',
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
      assert.match(result.stdout, /OMX question schema fallback/i);
      assert.match(result.stdout, /\[single-answerable\] id=deliverableScope multi_select=false/);
      assert.match(result.stdout, /\[multi-answerable\] id=nonGoals multi_select=true/);
      assert.match(result.stdout, /1A 2A 3A 4A 5A 6A 7A/);
      assert.doesNotMatch(result.stdout, /^8\./m);
      assert.match(result.stdout, /Reply with OMX selections/i);
      assert.doesNotMatch(result.stdout, /oh-my-goal harness:/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('generates OMX-style ambiguity and questionnaire artifacts from trailing objective text', () => {
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
            workerLanes: 'architect researcher critic tester',
            localOptimum: 'baseline versus novelty plus critic',
          }),
          '--json',
        ],
        { cwd: root, encoding: 'utf-8' },
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);

      const summary = JSON.parse(result.stdout) as { root: string; files: string[] };
      assert.equal(summary.root, '.omg/harness/ralpli-prd-draft');
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/ambiguity-map.md'));
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/intake-questionnaire.md'));
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/runtime-commands.md'));

      const harnessRoot = join(cwd, summary.root);
      const goalPrompt = readFileSync(join(harnessRoot, 'goal-prompt.md'), 'utf-8');
      const ambiguityMap = readFileSync(join(harnessRoot, 'ambiguity-map.md'), 'utf-8');
      const questionnaire = readFileSync(join(harnessRoot, 'intake-questionnaire.md'), 'utf-8');
      const runtimeCommands = readFileSync(join(harnessRoot, 'runtime-commands.md'), 'utf-8');
      const orchestration = readFileSync(join(harnessRoot, 'orchestration.md'), 'utf-8');

      assert.match(goalPrompt, /Complete the user objective: ralpli PRD draft/);
      assert.doesNotMatch(goalPrompt, /Complete the user objective: \$oh-my-goal/);
      assert.match(goalPrompt, /runtime-commands\.md/);
      assert.match(goalPrompt, /Do not ask the user to run Team runtime manually/);
      assert.match(goalPrompt, /Auto-start command: node '.+team-runtime\.mjs' launch/);
      assert.match(goalPrompt, /tmux_not_attached/);
      assert.match(ambiguityMap, /OMX deep-interview pattern/i);
      assert.match(questionnaire, /Batch independent high-leverage questions/i);
      assert.match(questionnaire, /Gap-fill contract/i);
      assert.match(runtimeCommands, /Team Runtime Auto-Start/);
      assert.match(runtimeCommands, /The user should not need to run them manually/);
      assert.match(runtimeCommands, /--team 'ralpli-prd-draft'/);
      assert.match(orchestration, /The leader should auto-start the plugin Team runtime/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
