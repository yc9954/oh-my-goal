import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();
const skillRoot = join(root, 'plugins', 'oh-my-goal', 'skills', 'oh-my-goal');
const skillPath = join(skillRoot, 'SKILL.md');
const generatorPath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'create-harness.mjs');

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
    assert.match(skill, /--interview-complete/i);
    assert.ok(skill.length < 2600, 'SKILL.md should stay a compact router');
  });

  it('splits the workflow into explicit flow, template, and reference files', () => {
    const files = [
      'FLOW.md',
      'flows/00-entrypoint.md',
      'flows/01-intake-gate.md',
      'flows/02-artifact-generation.md',
      'flows/03-goal-handoff.md',
      'flows/04-orchestration.md',
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
    assert.match(topFlow, /create files, run generator, code, create goal/i);

    const flow = readSkillRelative('flows/00-entrypoint.md');
    assert.match(flow, /State Machine/i);
    assert.match(flow, /INTAKE_PENDING/);
    assert.match(flow, /Stop after questions/i);
    assert.match(flow, /Do not create files/i);

    const intake = readSkillRelative('flows/01-intake-gate.md');
    assert.match(intake, /ambiguity map/i);
    assert.match(intake, /Batch questions into one structured form/i);
    assert.match(intake, /Gap-Fill Passes/i);

    const orchestration = readSkillRelative('flows/04-orchestration.md');
    assert.match(orchestration, /Metis/i);
    assert.match(orchestration, /Momus/i);
    assert.match(orchestration, /Oracle/i);
    assert.match(orchestration, /Local-Optimum Pressure/i);
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
      assert.match(result.stdout, /Reply with choices/i);
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

      const harnessRoot = join(cwd, summary.root);
      const goalPrompt = readFileSync(join(harnessRoot, 'goal-prompt.md'), 'utf-8');
      const ambiguityMap = readFileSync(join(harnessRoot, 'ambiguity-map.md'), 'utf-8');
      const questionnaire = readFileSync(join(harnessRoot, 'intake-questionnaire.md'), 'utf-8');

      assert.match(goalPrompt, /Complete the user objective: ralpli PRD draft/);
      assert.doesNotMatch(goalPrompt, /Complete the user objective: \$oh-my-goal/);
      assert.match(ambiguityMap, /OMX deep-interview pattern/i);
      assert.match(questionnaire, /Batch independent high-leverage questions/i);
      assert.match(questionnaire, /Gap-fill contract/i);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
