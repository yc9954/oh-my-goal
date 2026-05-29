#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

function parseArgs(argv) {
  const parsed = { cwd: process.cwd(), apply: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      parsed.apply = true;
      continue;
    }
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--slug' || arg === '--harness' || arg === '--cwd') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}.`);
      parsed[arg.slice(2)] = value;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function printHelp() {
  console.log(`oh-my-goal migrate-quality-pruning

Usage:
  node scripts/migrate-quality-pruning.mjs --slug <slug> [--apply] [--json]
  node scripts/migrate-quality-pruning.mjs --harness <path> [--apply] [--json]

Purpose:
  Produce migration guidance for older .omg/harness/<slug>/ directories that
  predate quality-frontier, pruning-matrix, selected-strategy, and
  qualityPruning completion evidence.
`);
}

function lines(values) {
  return values.filter((line) => line !== undefined).join('\n');
}

function harnessRoot(args) {
  const cwd = resolve(args.cwd || process.cwd());
  if (args.harness) return resolve(cwd, args.harness);
  if (!args.slug) throw new Error('Missing --slug <slug> or --harness <path>.');
  return join(cwd, '.omg', 'harness', args.slug);
}

async function readIfExists(path) {
  if (!existsSync(path)) return '';
  return readFile(path, 'utf-8');
}

function scaffold(name) {
  if (name === 'quality-frontier.md') {
    return lines([
      '# Quality Frontier',
      '',
      'Migration scaffold for an older Oh My Goal harness.',
      '',
      'List at least three quality candidates before selecting a path:',
      '',
      '| Candidate | Quality Lens | Why It Could Improve The Goal | Evidence Probe |',
      '| --- | --- | --- | --- |',
      '| baseline direct path | maintainability | simplest viable path for comparison | files changed and core verification |',
      '| reliability candidate | reliability / edge cases | reduces false completion risk | edge-case probe or test |',
      '| user-visible quality candidate | workflow / UX | improves the actual user outcome | workflow inspection or screenshot/browser check |',
    ]);
  }
  if (name === 'pruning-matrix.md') {
    return lines([
      '# Pruning Matrix',
      '',
      'Migration scaffold for quality candidate keep/cut decisions.',
      '',
      '| Candidate | Keep / Cut | Reason | Owner Lane | Evidence Needed |',
      '| --- | --- | --- | --- | --- |',
      '| baseline direct path | keep | required comparison point | leader/implementer | implementation evidence |',
      '| reliability candidate | keep | reduces false completion risk | tester/critic | verification probe |',
      '| speculative polish | cut | expands scope without proving acceptance | critic | revive only with user approval |',
    ]);
  }
  if (name === 'selected-strategy.md') {
    return lines([
      '# Selected Strategy',
      '',
      'Migration scaffold for the selected path and rejected quality candidates.',
      '',
      '## Selected Path',
      '- ID: TBD',
      '- Summary: TBD',
      '- How it uses the pruned quality focus: TBD',
      '- Evidence: TBD',
      '',
      '## Rejected Or Deferred Quality Candidates',
      '| Candidate | Decision | Reason | Revisit Trigger |',
      '| --- | --- | --- | --- |',
      '| speculative polish | cut/defer | not required for current acceptance | user asks for higher polish or evidence shows UX risk |',
    ]);
  }
  return '';
}

function renderGuide({ root, cwd, missingFiles, completionNeedsQuality }) {
  const relRoot = relative(cwd, root) || '.';
  return lines([
    '# Quality Pruning Migration',
    '',
    `Harness: ${relRoot}`,
    '',
    'This harness appears to predate the quality-pruning completion contract. Do not mark a Codex goal complete until the old completion evidence is extended with explicit quality-pruning evidence.',
    '',
    '## Required Migration Steps',
    '',
    '1. Add or review `quality-frontier.md` with at least three quality candidates.',
    '2. Add or review `pruning-matrix.md` with keep/cut decisions, reasons, owner lanes, and evidence probes.',
    '3. Add or review `selected-strategy.md` with the selected path and rejected/deferred quality candidates.',
    '4. Update the completion evidence JSON passed to `pressure-runtime.mjs gate` with `qualityPruning`.',
    '5. Re-run the pressure gate before calling `update_goal({status: "complete"})`.',
    '',
    '## Missing Files',
    ...(missingFiles.length > 0 ? missingFiles.map((file) => `- ${file}`) : ['- None detected. Review existing files for substance.']),
    '',
    '## Completion Evidence Patch',
    '',
    'Add this object to the evidence JSON used with `pressure-runtime.mjs gate`:',
    '',
    '```json',
    JSON.stringify({
      qualityPruning: {
        status: 'passed',
        frontierConsidered: 3,
        finalistsKept: 1,
        candidatesCut: ['speculative polish or other rejected candidate'],
        selectedStrategyEvidence: `${relRoot}/selected-strategy.md maps the selected path to pruned quality focus`,
      },
    }, null, 2),
    '```',
    '',
    completionNeedsQuality
      ? 'Current `completion-gate.md` does not mention `qualityPruning`; keep this migration guide next to the harness until the gate evidence has been updated.'
      : 'Current `completion-gate.md` already mentions quality pruning. Verify the actual gate evidence includes the JSON object above.',
  ]);
}

async function run(args) {
  const cwd = resolve(args.cwd || process.cwd());
  const root = harnessRoot(args);
  if (!existsSync(root)) throw new Error(`Harness not found: ${relative(cwd, root)}`);
  const required = ['quality-frontier.md', 'pruning-matrix.md', 'selected-strategy.md'];
  const missingFiles = required.filter((name) => !existsSync(join(root, name)));
  const completionGate = await readIfExists(join(root, 'completion-gate.md'));
  const completionNeedsQuality = !/qualityPruning|Quality pruning|quality-pruning/i.test(completionGate);
  const guide = renderGuide({ root, cwd, missingFiles, completionNeedsQuality });
  const written = [];
  if (args.apply) {
    await mkdir(root, { recursive: true });
    for (const name of missingFiles) {
      await writeFile(join(root, name), `${scaffold(name)}\n`, 'utf-8');
      written.push(relative(cwd, join(root, name)));
    }
    await writeFile(join(root, 'quality-pruning-migration.md'), `${guide}\n`, 'utf-8');
    written.push(relative(cwd, join(root, 'quality-pruning-migration.md')));
  }
  return {
    ok: true,
    harness: relative(cwd, root),
    missing_files: missingFiles,
    completion_needs_quality_pruning: completionNeedsQuality,
    guide_path: relative(cwd, join(root, 'quality-pruning-migration.md')),
    written,
    guide,
  };
}

function printPayload(payload, json) {
  if (json) console.log(JSON.stringify(payload, null, 2));
  else console.log(payload.guide);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  printPayload(await run(args), args.json);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    await main();
  } catch (error) {
    console.error(`[oh-my-goal migrate-quality-pruning] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
