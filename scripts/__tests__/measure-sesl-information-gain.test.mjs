import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { test, describe } from 'node:test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'measure-sesl-information-gain.mjs');

function tmpFile(name) {
  return path.join(os.tmpdir(), `sesl-info-gain-test-${Date.now()}-${name}`);
}

function writeJsonl(filePath, records) {
  fs.writeFileSync(filePath, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

function run(args) {
  const cmd = `node "${SCRIPT}" ${args.join(' ')}`;
  return JSON.parse(execSync(cmd, { encoding: 'utf8', cwd: REPO_ROOT }));
}

// ── Test helpers ───────────────────────────────────────────────────────────

function seedRecord(id, traits, shapeHash) {
  return {
    pair_id: `seed-${id}`,
    trait_family_set: traits,
    composition_shape_hash: shapeHash || `shape-${traits.join('-')}`,
  };
}

function generatedRecord(id, traits, shapeHash) {
  return {
    pair_id: `gen-${id}`,
    provenance: {
      trait_family_set: traits,
      composition_shape_hash: shapeHash || `shape-${traits.join('-')}`,
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('measure-sesl-information-gain', () => {
  const filesToClean = [];

  test('detects entropy gain when generated corpus diversifies', () => {
    const seedPath = tmpFile('seed-gain.jsonl');
    const genPath = tmpFile('gen-gain.jsonl');
    filesToClean.push(seedPath, genPath);

    // Seed: 4 records, 2 unique trait sets (50/50)
    writeJsonl(seedPath, [
      seedRecord(1, ['structural']),
      seedRecord(2, ['structural']),
      seedRecord(3, ['physics']),
      seedRecord(4, ['physics']),
    ]);

    // Generated: 8 records, 4 unique trait sets (uniform)
    writeJsonl(genPath, [
      generatedRecord(1, ['structural']),
      generatedRecord(2, ['physics']),
      generatedRecord(3, ['interaction']),
      generatedRecord(4, ['material']),
      generatedRecord(5, ['structural']),
      generatedRecord(6, ['physics']),
      generatedRecord(7, ['interaction']),
      generatedRecord(8, ['material']),
    ]);

    const report = run(['--seed', seedPath, '--generated', genPath, '--json']);
    assert.strictEqual(report.comparison.infoGain > 0, true, 'expected positive info gain');
    assert.strictEqual(report.comparison.collapseFlag, false, 'expected no collapse');
    assert.ok(
      report.comparison.verdict.includes('GAIN'),
      `verdict was: ${report.comparison.verdict}`
    );

    for (const f of filesToClean) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
    filesToClean.length = 0;
  });

  test('detects collapse when generated corpus loses diversity', () => {
    const seedPath = tmpFile('seed-collapse.jsonl');
    const genPath = tmpFile('gen-collapse.jsonl');
    filesToClean.push(seedPath, genPath);

    // Seed: 8 records, 4 unique trait sets (uniform)
    writeJsonl(seedPath, [
      seedRecord(1, ['structural']),
      seedRecord(2, ['physics']),
      seedRecord(3, ['interaction']),
      seedRecord(4, ['material']),
      seedRecord(5, ['structural']),
      seedRecord(6, ['physics']),
      seedRecord(7, ['interaction']),
      seedRecord(8, ['material']),
    ]);

    // Generated: 8 records, 1 trait set only (complete collapse)
    writeJsonl(genPath, [
      generatedRecord(1, ['structural']),
      generatedRecord(2, ['structural']),
      generatedRecord(3, ['structural']),
      generatedRecord(4, ['structural']),
      generatedRecord(5, ['structural']),
      generatedRecord(6, ['structural']),
      generatedRecord(7, ['structural']),
      generatedRecord(8, ['structural']),
    ]);

    const report = run(['--seed', seedPath, '--generated', genPath, '--json']);
    assert.strictEqual(report.comparison.infoGain < 0, true, 'expected negative info gain');
    assert.strictEqual(report.comparison.collapseFlag, true, 'expected collapse flagged');
    assert.ok(report.comparison.collapseReasons.length > 0, 'expected collapse reasons');
    assert.ok(
      report.comparison.verdict.includes('COLLAPSE'),
      `verdict was: ${report.comparison.verdict}`
    );

    for (const f of filesToClean) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
    filesToClean.length = 0;
  });

  test('reports flat when generated equals seed diversity', () => {
    const seedPath = tmpFile('seed-flat.jsonl');
    const genPath = tmpFile('gen-flat.jsonl');
    filesToClean.push(seedPath, genPath);

    const records = [
      seedRecord(1, ['structural']),
      seedRecord(2, ['physics']),
      seedRecord(3, ['interaction']),
    ];
    writeJsonl(seedPath, records);
    writeJsonl(
      genPath,
      records.map((r, i) => generatedRecord(i + 10, r.trait_family_set, r.composition_shape_hash))
    );

    const report = run(['--seed', seedPath, '--generated', genPath, '--json']);
    assert.strictEqual(report.comparison.infoGain, 0, 'expected zero info gain');
    assert.strictEqual(report.comparison.collapseFlag, false, 'expected no collapse');
    assert.ok(
      report.comparison.verdict.includes('FLAT'),
      `verdict was: ${report.comparison.verdict}`
    );

    for (const f of filesToClean) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
    filesToClean.length = 0;
  });

  test('markdown output contains expected sections', () => {
    const seedPath = tmpFile('seed-md.jsonl');
    const genPath = tmpFile('gen-md.jsonl');
    filesToClean.push(seedPath, genPath);

    writeJsonl(seedPath, [seedRecord(1, ['structural'])]);
    writeJsonl(genPath, [generatedRecord(1, ['physics'])]);

    const md = execSync(
      `node "${SCRIPT}" --seed "${seedPath}" --generated "${genPath}" --markdown`,
      { encoding: 'utf8', cwd: REPO_ROOT }
    );
    assert.ok(md.includes('# SESL Information-Gain Measurement'));
    assert.ok(md.includes('## Seed corpus'));
    assert.ok(md.includes('## Generated corpus'));
    assert.ok(md.includes('## Comparison'));
    assert.ok(md.includes('Verdict:'));

    for (const f of filesToClean) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
    filesToClean.length = 0;
  });

  test('fail-gate exits non-zero on collapse', () => {
    const seedPath = tmpFile('seed-fail.jsonl');
    const genPath = tmpFile('gen-fail.jsonl');
    filesToClean.push(seedPath, genPath);

    writeJsonl(seedPath, [seedRecord(1, ['structural']), seedRecord(2, ['physics'])]);
    writeJsonl(genPath, [generatedRecord(1, ['structural']), generatedRecord(2, ['structural'])]);

    let exitCode = 0;
    try {
      execSync(
        `node "${SCRIPT}" --seed "${seedPath}" --generated "${genPath}" --json --fail-gate`,
        { encoding: 'utf8', cwd: REPO_ROOT }
      );
    } catch (err) {
      exitCode = err.status;
    }
    assert.strictEqual(exitCode, 2, 'expected exit code 2 on collapse with --fail-gate');

    for (const f of filesToClean) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
    filesToClean.length = 0;
  });
});
