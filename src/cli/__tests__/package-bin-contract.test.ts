import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const legacyCliName = ['o', 'm', 'x'].join('');
const legacyCliPascal = `${legacyCliName[0]?.toUpperCase()}${legacyCliName.slice(1)}`;
const legacyProductName = ['oh', 'my', 'codex'].join('-');
const legacyWorkspaceManifest = ['Car', 'go'].join('');
const legacyWorkspaceDir = ['cra', 'tes'].join('');
const legacyHeavyTerms = ['explore', 'sparkshell', 'native', legacyWorkspaceManifest, legacyWorkspaceDir, legacyProductName];

type PackageJson = {
  main?: string;
  files?: string[];
  bin?: string | Record<string, string>;
  scripts?: Record<string, string>;
};

type NpmPackDryRunFile = {
  path: string;
  mode?: number;
};

type NpmPackDryRunResult = {
  files?: NpmPackDryRunFile[];
};

function packedFiles(): string[] {
  const packed = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });

  assert.equal(packed.status, 0, packed.stderr || packed.stdout);
  const jsonStart = packed.stdout.indexOf('[');
  assert.notEqual(jsonStart, -1, `expected npm pack --json output in stdout\n${packed.stdout}`);
  const results = JSON.parse(packed.stdout.slice(jsonStart)) as NpmPackDryRunResult[];
  assert.equal(Array.isArray(results), true, 'expected npm pack --json array output');
  return results[0]?.files?.map((file) => file.path) ?? [];
}

describe('package bin contract', () => {
  it('declares an OMG-only product entry point and package allowlist', () => {
    const packageJsonPath = join(process.cwd(), 'package.json');
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as PackageJson;

    assert.equal(pkg.main, 'dist/cli/omg-main.js');
    assert.deepEqual(pkg.bin, { 'oh-my-goal': 'dist/cli/omg.js', omg: 'dist/cli/omg.js' });
    assert.equal(pkg.files?.includes('dist/'), false, 'do not ship the broad compiled runtime tree');
    assert.equal(pkg.files?.includes(`${legacyWorkspaceManifest}.toml`), false, 'do not ship removed workspace manifest files');
    assert.equal(pkg.files?.includes(`${legacyWorkspaceManifest}.lock`), false, 'do not ship removed workspace lockfiles');
    assert.equal(pkg.files?.includes(`${legacyWorkspaceDir}/`), false, 'do not ship removed workspace directories');
    assert.equal(pkg.files?.includes('skills/'), false, 'do not ship root skill catalogs');
    assert.equal(pkg.files?.includes('prompts/'), false, 'do not ship root prompt catalogs');
    assert.equal(pkg.files?.includes('templates/'), false, 'do not ship root setup templates');
    assert.equal(pkg.files?.includes('plugins/'), false, 'do not ship the broad plugin tree');
    assert.ok(pkg.files?.includes('plugins/oh-my-goal/'));
    assert.ok(pkg.files?.includes('.agents/plugins/marketplace.json'));
    assert.ok(pkg.files?.includes('dist/cli/omg.*'));
    assert.ok(pkg.files?.includes('dist/cli/omg-main.*'));
    assert.ok(pkg.files?.includes('dist/cli/goal-harness.*'));
    assert.ok(pkg.files?.includes('dist/goal-harness/*.js'));
    assert.ok(pkg.files?.includes('dist/goal-workflows/*.js'));
    assert.ok(pkg.files?.includes('dist/hooks/task-size-detector.*'));

    const scriptText = JSON.stringify(pkg.scripts ?? {});
    const previousScriptSurface = new RegExp(legacyHeavyTerms.join('|'), 'i');
    assert.equal(previousScriptSurface.test(scriptText), false, 'package scripts should stay focused on Oh My Goal');
    assert.equal(pkg.scripts?.test, 'npm run build && npm run verify:plugin-bundle && npm run test:node');
    assert.equal(pkg.scripts?.prepack, 'npm run build && npm run verify:plugin-bundle');
    assert.ok(pkg.scripts?.['test:plugin']);
    assert.ok(pkg.scripts?.['test:package']);
    assert.ok(pkg.scripts?.['test:goal']);
    assert.equal(pkg.scripts?.['verify:plugin-bundle'], 'node dist/scripts/verify-oh-my-goal-plugin.js');
  });

  it('runs the installed CLI help without loading the broad compatibility runtime', () => {
    const goalBinPath = join(process.cwd(), 'dist', 'cli', 'omg.js');
    const goalMainPath = join(process.cwd(), 'dist', 'cli', 'omg-main.js');
    const goalBinSource = readFileSync(goalBinPath, 'utf-8');
    const goalMainSource = readFileSync(goalMainPath, 'utf-8');

    assert.match(goalBinSource, /^#!\/usr\/bin\/env node/);
    assert.equal(goalBinSource.includes(`remember${legacyCliPascal}LaunchContext`), false);
    assert.equal(goalBinSource.includes(`dist/cli/${legacyCliName}`), false);
    assert.doesNotMatch(goalMainSource, /from ['"]\.\/index\.js['"]/);

    const goalHelp = spawnSync(process.execPath, [goalBinPath, '--help'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 5_000,
    });

    assert.equal(goalHelp.status, 0, goalHelp.stderr || goalHelp.stdout);
    assert.match(goalHelp.stdout, /Oh My Goal/);
    assert.match(goalHelp.stdout, /npx oh-my-goal/);
    assert.match(goalHelp.stdout, /\$oh-my-goal/);
    assert.doesNotMatch(goalHelp.stdout, /omg setup|--madmax/);
  });

  it('packs only the plugin-first OMG surface', () => {
    const files = packedFiles();
    const hasFile = (path: string) => files.includes(path);

    assert.ok(hasFile('dist/cli/omg.js'), 'expected npm pack output to include the OMG bin');
    assert.ok(hasFile('dist/cli/omg-main.js'), 'expected npm pack output to include the OMG CLI implementation');
    assert.ok(hasFile('dist/cli/goal-harness.js'), 'expected npm pack output to include goal-harness commands');
    assert.ok(hasFile('dist/goal-harness/policy.js'), 'expected npm pack output to include goal-harness policy');
    assert.ok(hasFile('dist/goal-workflows/artifacts.js'), 'expected npm pack output to include workflow artifacts');
    assert.ok(hasFile('dist/hooks/task-size-detector.js'), 'expected npm pack output to include task-size routing');
    assert.ok(hasFile('dist/scripts/verify-oh-my-goal-plugin.js'), 'expected npm pack output to include the OMG plugin verifier referenced by package scripts');
    assert.ok(hasFile('plugins/oh-my-goal/.codex-plugin/plugin.json'), 'expected npm pack output to include the plugin manifest');
    assert.ok(hasFile('plugins/oh-my-goal/skills/oh-my-goal/SKILL.md'), 'expected npm pack output to include the skill');
    assert.ok(hasFile('plugins/oh-my-goal/scripts/create-harness.mjs'), 'expected npm pack output to include the harness generator');
    assert.ok(hasFile('plugins/oh-my-goal/scripts/intake-question-runtime.mjs'), 'expected npm pack output to include the intake runtime');

    const legacyPaths = files.filter((path) =>
      /^(crates|skills|prompts|templates)\//.test(path)
      || new RegExp(`(^|/)dist/cli/(?:index|${legacyCliName})\\.`).test(path)
      || new RegExp(`(^|/)dist/config/${legacyCliName}`, 'i').test(path)
      || new RegExp(`${legacyProductName}|(^|/)${legacyCliName}(?:-|/|\\.)`, 'i').test(path)
    );
    assert.deepEqual(legacyPaths, [], `unexpected compatibility files in npm pack output:\n${legacyPaths.join('\n')}`);
  });
});
