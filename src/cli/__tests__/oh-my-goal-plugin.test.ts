import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();
const skillPath = join(root, 'plugins', 'oh-my-goal', 'skills', 'oh-my-goal', 'SKILL.md');
const generatorPath = join(root, 'plugins', 'oh-my-goal', 'scripts', 'create-harness.mjs');

describe('oh-my-goal plugin contract', () => {
  it('ports OMX structured interview behavior into the plugin skill', () => {
    const skill = readFileSync(skillPath, 'utf-8');

    assert.match(skill, /\$oh-my-goal <objective>/);
    assert.match(skill, /do not ask for it again/i);
    assert.match(skill, /ambiguity map/i);
    assert.match(skill, /Batch independent high-leverage questions/i);
    assert.match(skill, /structured form|structured input/i);
    assert.match(skill, /numbered prose block/i);
    assert.match(skill, /gap-fill passes/i);
    assert.match(skill, /Metis-style clarification/i);
    assert.match(skill, /Momus-style critique/i);
    assert.match(skill, /Oracle-style synthesis/i);
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
