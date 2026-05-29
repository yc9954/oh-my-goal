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
const questionCorePath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'omx-question-core.mjs');
const questionRuntimePath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'intake-question-runtime.mjs');
const teamCorePath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'omx-team-core.mjs');
const teamRuntimePath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'team-runtime.mjs');
const pressureRuntimePath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'pressure-runtime.mjs');

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
    assert.match(skill, /cmux/i);
    assert.match(skill, /ambiguity score/i);
    assert.match(skill, /quality-pruning/i);
    assert.match(skill, /team-runtime\.mjs/);
    assert.match(skill, /pressure-runtime\.mjs/);
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
      'references/omx-port-map.md',
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
    assert.match(intake, /Quality Frontier And Pruning/i);
    assert.match(intake, /quality_pruning/i);
    assert.match(intake, /Gap-Fill Passes/i);

    const generation = readSkillRelative('flows/02-artifact-generation.md');
    assert.match(generation, /exact recommended Codex goal prompt/i);
    assert.match(generation, /Do not only summarize it/i);
    assert.match(generation, /execution-spec\.md/);
    assert.match(generation, /quality-frontier\.md/);
    assert.match(generation, /pruning-matrix\.md/);
    assert.match(generation, /selected-strategy\.md/);
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
    assert.match(orchestration, /not under `skills\/oh-my-goal\/scripts\/`/);
    assert.match(orchestration, /tmux panes/i);
    assert.match(orchestration, /cmux tree/);
    assert.match(orchestration, /read-screen/);
    assert.match(orchestration, /collect/i);
    assert.match(orchestration, /Local-Optimum Pressure/i);
    assert.match(orchestration, /pressure gate/i);

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
    assert.equal(payload.questions.length, 10);
    assert.equal(payload.questions[0]?.id, 'deliverableScope');
    assert.equal(payload.questions[0]?.type, 'single-answerable');
    assert.equal(payload.questions[0]?.multi_select, false);
    assert.equal(payload.questions[6]?.id, 'nonGoals');
    assert.equal(payload.questions[6]?.type, 'multi-answerable');
    assert.equal(payload.questions[6]?.multi_select, true);
    assert.equal(payload.questions[6]?.options[1]?.value, 'no-new-dependencies');
    assert.equal(payload.questions[7]?.id, 'qualityFrontier');
    assert.equal(payload.questions[7]?.type, 'multi-answerable');
    assert.equal(payload.questions[8]?.id, 'qualityPruning');
    assert.equal(payload.questions[9]?.id, 'pruningRule');

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
    assert.match(markdownResult.stdout, /\[multi-answerable\] id=qualityFrontier multi_select=true/);
    assert.match(markdownResult.stdout, /\[multi-answerable\] id=qualityPruning multi_select=true/);
    assert.match(markdownResult.stdout, /\[single-answerable\] id=pruningRule multi_select=false/);
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
    const coreSource = readFileSync(questionCorePath, 'utf-8');
    const runtimeSource = readFileSync(questionRuntimePath, 'utf-8');
    assert.match(coreSource, /Ported from OMX src\/question\/ui\.ts/);
    assert.match(coreSource, /emitKeypressEvents/);
    assert.match(coreSource, /renderQuestionWizardFrame/);
    assert.match(coreSource, /↑↓ move/);
    assert.match(runtimeSource, /omx-question-core\.mjs/);
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
if (args[0] === 'send-key' || args[0] === 'focus-pane') {
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
      assert.equal(cmuxPayload.answers.length, 10);
      assert.equal(cmuxPayload.answers[0]?.answer.selected_values[0], 'polished-single-screen');

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
      assert.equal(bridgePayload.answers.length, 10);
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
        assert.equal(terminalPayload.answers.length, 10);
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
      assert.match(fallbackPayload.prompt, /Question 1 of 10/);
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
      assert.match(sequentialPayload.prompt, /Question 1 of 10/);
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
      assert.match(nextPayload.prompt, /Question 2 of 10/);

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
      for (const answer of ['1C', '2A', '3B', '4C', '5B', '6A', '7A', '8A,B', '9A,B', '10A']) {
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
        question: { id: string };
        ambiguity: { score: number; level: string };
        answers: unknown[];
      };
      assert.equal(complexFollowup.ok, false);
      assert.equal(complexFollowup.current_index, 10);
      assert.equal(complexFollowup.progress, '11/11');
      assert.equal(complexFollowup.question.id, 'edgeCases');
      assert.ok(complexFollowup.ambiguity.score > 0.35);
      assert.equal(complexFollowup.answers.length, 10);

      for (const answer of ['11A,B', '12A', '13A', '14A', '15A']) {
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
      assert.equal(complexComplete.answers.length, 15);
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
          input: ['1', '1', '1', '1', '1', '1', '1,2', '1,2', '1,2', '1', ''].join('\n'),
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
      assert.match(readFileSync(cmuxNotifyLog, 'utf-8'), /"send"/);
      assert.match(readFileSync(cmuxNotifyLog, 'utf-8'), /"send-key"/);
      assert.match(readFileSync(cmuxNotifyLog, 'utf-8'), /"focus-pane"/);
      assert.match(readFileSync(cmuxNotifyLog, 'utf-8'), /"surface:1"/);
      assert.match(readFileSync(cmuxNotifyLog, 'utf-8'), /"pane:1"/);
      assert.match(readFileSync(cmuxNotifyLog, 'utf-8'), /"enter"/);
      assert.match(readFileSync(cmuxNotifyLog, 'utf-8'), /continue/);

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
          input: ['1', '1', '1', '1', '1', '1', '1,2', '1,2', '1,2', '1', ''].join('\n'),
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
      assert.equal(payload.answers.length, 10);
      assert.equal(payload.answers[0]?.answer.selected_values[0], 'polished-single-screen');
      assert.equal(payload.answers[6]?.question_id, 'nonGoals');
      assert.equal(payload.answers[6]?.answer.kind, 'multi');
      assert.deepEqual(payload.answers[6]?.answer.selected_values, ['no-backend-auth-persistence', 'no-new-dependencies']);
      assert.equal(payload.answers[7]?.question_id, 'qualityFrontier');
      assert.deepEqual(payload.answers[7]?.answer.selected_values, ['user-workflow-polish', 'reliability-edge-cases']);
      assert.equal(payload.answers[8]?.question_id, 'qualityPruning');
      assert.deepEqual(payload.answers[8]?.answer.selected_values, ['user-visible-value-first', 'verification-reliability-first']);
      assert.equal(payload.answers[9]?.question_id, 'pruningRule');
      assert.match(payload.record_path, /\.omg\/runtime\/questions\/question-/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('keeps the plugin question core aligned with OMX wizard semantics', async () => {
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

  it('ports the useful OMX Team surface into an optional plugin team runtime', () => {
    const teamCoreSource = readFileSync(teamCorePath, 'utf-8');
    const teamRuntimeSource = readFileSync(teamRuntimePath, 'utf-8');
    assert.match(teamCoreSource, /Ported from the OMX Team contracts/);
    assert.match(teamCoreSource, /src\/team\/tmux-session\.ts/);
    assert.match(teamCoreSource, /schema_source: 'omx\.team\/state\/v2'/);
    assert.match(teamCoreSource, /schema_version: 2/);
    assert.match(teamCoreSource, /OMX_TEAM_STATE_ROOT/);
    assert.match(teamRuntimeSource, /omx-team-core\.mjs/);
    assert.match(teamRuntimeSource, /launchCmuxWorkers/);
    assert.match(teamRuntimeSource, /CMUX_WORKSPACE_ID/);
    assert.match(teamRuntimeSource, /cmux-pane/);
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
      assert.equal(config.schema_source, 'omx.team/state/v2');
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
      };
      assert.equal(task.id, '1');
      assert.equal(task.status, 'pending');
      assert.equal(task.owner, 'worker-1');

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
          env: {
            ...process.env,
            PATH: `${fakeBin}:${process.env.PATH || ''}`,
            CMUX_BUNDLED_CLI_PATH: fakeCmux,
            CMUX_WORKSPACE_ID: 'workspace:1',
            CMUX_SURFACE_ID: 'surface:1',
            TMUX: '',
            TMUX_PANE: '',
            OMG_FAKE_CMUX_LOG: cmuxLog,
          },
        },
      );
      assert.equal(cmuxLaunch.status, 0, cmuxLaunch.stderr || cmuxLaunch.stdout);
      const cmuxLaunchPayload = JSON.parse(cmuxLaunch.stdout) as {
        ok: boolean;
        status: string;
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
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('enforces local-optimum pressure with trajectory evidence and a runtime gate', () => {
    const pressureSource = readFileSync(pressureRuntimePath, 'utf-8');
    assert.match(pressureSource, /omx\.goal-harness\/runtime\+perturbation/);
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
      assert.match(result.stdout, /Which quality-improvement directions should be explored/i);
      assert.match(result.stdout, /Which quality directions should survive pruning/i);
      assert.match(result.stdout, /What rule should prune quality candidates/i);
      assert.match(result.stdout, /OMX question schema fallback/i);
      assert.match(result.stdout, /\[single-answerable\] id=deliverableScope multi_select=false/);
      assert.match(result.stdout, /\[multi-answerable\] id=nonGoals multi_select=true/);
      assert.match(result.stdout, /\[multi-answerable\] id=qualityFrontier multi_select=true/);
      assert.match(result.stdout, /\[multi-answerable\] id=qualityPruning multi_select=true/);
      assert.match(result.stdout, /\[single-answerable\] id=pruningRule multi_select=false/);
      assert.match(result.stdout, /1A 2A 3A 4A 5A 6A 7A 8A 9A 10A/);
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
      assert.match(summary.goalPromptText, /Complete the user objective: ralpli PRD draft/);
      assert.match(summary.goalPromptText, /Use the Oh My Goal harness artifacts/);
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/ambiguity-map.md'));
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/intake-questionnaire.md'));
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/execution-spec.md'));
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/quality-frontier.md'));
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/pruning-matrix.md'));
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/selected-strategy.md'));
      assert.ok(summary.files.includes('.omg/harness/ralpli-prd-draft/runtime-commands.md'));

      const harnessRoot = join(cwd, summary.root);
      const goalPrompt = readFileSync(join(harnessRoot, 'goal-prompt.md'), 'utf-8');
      const executionSpec = readFileSync(join(harnessRoot, 'execution-spec.md'), 'utf-8');
      const qualityFrontier = readFileSync(join(harnessRoot, 'quality-frontier.md'), 'utf-8');
      const pruningMatrix = readFileSync(join(harnessRoot, 'pruning-matrix.md'), 'utf-8');
      const selectedStrategy = readFileSync(join(harnessRoot, 'selected-strategy.md'), 'utf-8');
      const ambiguityMap = readFileSync(join(harnessRoot, 'ambiguity-map.md'), 'utf-8');
      const questionnaire = readFileSync(join(harnessRoot, 'intake-questionnaire.md'), 'utf-8');
      const runtimeCommands = readFileSync(join(harnessRoot, 'runtime-commands.md'), 'utf-8');
      const orchestration = readFileSync(join(harnessRoot, 'orchestration.md'), 'utf-8');

      assert.match(goalPrompt, /Complete the user objective: ralpli PRD draft/);
      assert.doesNotMatch(goalPrompt, /Complete the user objective: \$oh-my-goal/);
      assert.match(goalPrompt, /runtime-commands\.md/);
      assert.match(goalPrompt, /quality-frontier\.md/);
      assert.match(goalPrompt, /pruning-matrix\.md/);
      assert.match(goalPrompt, /selected-strategy\.md/);
      assert.match(goalPrompt, /Do not ask the user to run Team runtime manually/);
      assert.match(goalPrompt, /Pressure init command: node '.+pressure-runtime\.mjs' init/);
      assert.match(goalPrompt, /Pressure gate command before completion: node '.+pressure-runtime\.mjs' gate/);
      assert.match(goalPrompt, /Auto-start command: node '.+team-runtime\.mjs' launch/);
      assert.match(goalPrompt, /tmux_not_attached/);
      assert.match(executionSpec, /# Execution Spec/);
      assert.match(executionSpec, /## Verification Plan/);
      assert.match(executionSpec, /## Agent Work Breakdown/);
      assert.match(executionSpec, /Quality frontier:/);
      assert.match(qualityFrontier, /# Quality Frontier/);
      assert.match(qualityFrontier, /Candidate Quality Lenses/);
      assert.match(pruningMatrix, /# Pruning Matrix/);
      assert.match(pruningMatrix, /Keep \/ Cut/);
      assert.match(selectedStrategy, /# Selected Strategy/);
      assert.match(selectedStrategy, /Rejected Or Deferred Quality Candidates/);
      assert.match(ambiguityMap, /OMX deep-interview pattern/i);
      assert.match(questionnaire, /Batch independent high-leverage questions/i);
      assert.match(questionnaire, /qualityFrontier/);
      assert.match(questionnaire, /Gap-fill contract/i);
      assert.match(runtimeCommands, /Team Runtime Auto-Start/);
      assert.match(runtimeCommands, /Pressure Runtime Auto-Start/);
      assert.match(runtimeCommands, /pressure-runtime\.mjs' init/);
      assert.match(runtimeCommands, /pressure-runtime\.mjs' gate/);
      assert.match(runtimeCommands, /pressure-runtime\.mjs' import-team/);
      assert.match(runtimeCommands, /CMUX Visibility/);
      assert.match(runtimeCommands, /cmux tree/);
      assert.match(runtimeCommands, /read-screen/);
      assert.match(runtimeCommands, /The user should not need to run them manually/);
      assert.match(runtimeCommands, /--team 'ralpli-prd-draft'/);
      assert.match(orchestration, /The leader should auto-start the plugin Team runtime/);
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
          'calculator website',
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
      assert.match(summary.goalPromptText, /mouse-keyboard-core-edge-cases/);
      assert.match(readFileSync(join(harnessRoot, 'execution-spec.md'), 'utf-8'), /user-workflow-polish; verification-depth/);
      assert.match(readFileSync(join(harnessRoot, 'pruning-matrix.md'), 'utf-8'), /user-visible-value-first/);
      assert.match(readFileSync(join(harnessRoot, 'deep-interview.md'), 'utf-8'), /maximize-quality-within-scope/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
