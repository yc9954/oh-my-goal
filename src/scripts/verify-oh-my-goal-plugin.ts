#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const pluginRoot = join(root, 'plugins', 'oh-my-goal');
const manifestPath = join(pluginRoot, '.codex-plugin', 'plugin.json');
const skillRoot = join(pluginRoot, 'skills', 'oh-my-goal');

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function assertFile(path: string): void {
  assert.equal(existsSync(path), true, `${path} should exist`);
}

function nodeCheck(path: string): void {
  const checked = spawnSync(process.execPath, ['--check', path], {
    cwd: root,
    encoding: 'utf-8',
  });
  assert.equal(checked.status, 0, checked.stderr || checked.stdout);
}

const requiredSkillFiles = [
  'SKILL.md',
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

const requiredScripts = [
  'create-harness.mjs',
  'deployment-runtime.mjs',
  'design-system-runtime.mjs',
  'intake-question-engine.mjs',
  'intake-question-runtime.mjs',
  'migrate-quality-pruning.mjs',
  'openai-key-runtime.mjs',
  'pressure-runtime.mjs',
  'question-core.mjs',
  'team-core.mjs',
  'team-runtime.mjs',
];

const manifest = readJson<{ name?: string; skills?: string }>(manifestPath);
assert.equal(manifest.name, 'oh-my-goal');
assert.equal(manifest.skills, './skills/');

for (const file of requiredSkillFiles) assertFile(join(skillRoot, file));
for (const file of requiredScripts) {
  const path = join(pluginRoot, 'scripts', file);
  assertFile(path);
  nodeCheck(path);
}

const publicText = [
  readFileSync(join(root, 'README.md'), 'utf-8'),
  readFileSync(join(root, 'package.json'), 'utf-8'),
  ...requiredSkillFiles.map((file) => readFileSync(join(skillRoot, file), 'utf-8')),
  ...requiredScripts.map((file) => readFileSync(join(pluginRoot, 'scripts', file), 'utf-8')),
].join('\n');

const previousProductName = ['oh', 'my', 'codex'].join('-');
const previousCliName = ['o', 'm', 'x'].join('');

assert.equal(new RegExp(previousProductName, 'i').test(publicText), false, 'public plugin surface should not mention the previous product name');
assert.equal(new RegExp(`(^|[^a-zA-Z])${previousCliName}([^a-zA-Z]|$)`, 'i').test(publicText), false, 'public plugin surface should not expose previous CLI wording');

console.log('Oh My Goal plugin verification passed.');
