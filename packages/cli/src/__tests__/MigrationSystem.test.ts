/**
 * Migration System Production Tests — MigrationRunner + v2.1→v2.5 + v2.5→v3.0
 *
 * Tests MigrationRunner (path finding, dry run, apply, report formatting)
 * and all migration transforms (clickable→interactive, physics gravity,
 * orb→object, interactive→interactable, scene→composition).
 */

import { describe, it, expect } from 'vitest';
import { MigrationRunner } from '../migrate/MigrationRunner';
import { migration_v2_1_to_v2_5 } from '../migrate/migrations/v2_1_to_v2_5';
import { migration_v2_5_to_v3_0 } from '../migrate/migrations/v2_5_to_v3_0';

// ─── MigrationRunner ─────────────────────────────────────────────────────

describe('MigrationRunner — Production', () => {
  const runner = new MigrationRunner([migration_v2_1_to_v2_5, migration_v2_5_to_v3_0]);

  it('findMigrationPath returns correct chain 2.1.0 → 3.0.0', () => {
    const path = runner.findMigrationPath('2.1.0', '3.0.0');
    expect(path.length).toBe(2);
    expect(path[0].from).toBe('2.1.0');
    expect(path[0].to).toBe('2.5.0');
    expect(path[1].from).toBe('2.5.0');
    expect(path[1].to).toBe('3.0.0');
  });

  it('findMigrationPath returns single step', () => {
    const path = runner.findMigrationPath('2.1.0', '2.5.0');
    expect(path.length).toBe(1);
    expect(path[0].to).toBe('2.5.0');
  });

  it('findMigrationPath returns empty for unknown version', () => {
    const path = runner.findMigrationPath('1.0.0', '2.0.0');
    expect(path.length).toBe(0);
  });

  it('apply migrates files through chain', () => {
    const files = new Map([
      ['scene.holo', 'orb "player" { @clickable @physics(gravity: 9.8) }'],
    ]);
    const result = runner.apply(files, '2.1.0', '3.0.0');
    const migrated = result.get('scene.holo')!;
    // v2.1→v2.5: clickable→interactive, gravity scalar→vector, orb→object
    // v2.5→v3.0: interactive→interactable
    expect(migrated).toContain('@interactable');
    expect(migrated).toContain('object');
    expect(migrated).not.toContain('orb');
    expect(migrated).not.toContain('@clickable');
  });

  it('dryRun reports changes correctly', () => {
    const files = new Map([
      ['a.holo', '@clickable some code'],
      ['b.holo', 'no changes here'],
    ]);
    const results = runner.dryRun(files, '2.1.0', '2.5.0');
    expect(results.length).toBe(1);
    expect(results[0].totalFiles).toBe(2);
    expect(results[0].modifiedFiles).toBe(1);
    expect(results[0].skippedFiles).toBe(1);
    expect(results[0].changes[0].filePath).toBe('a.holo');
  });

  it('formatReport produces readable output', () => {
    const results = runner.dryRun(
      new Map([['test.holo', '@clickable']]),
      '2.1.0',
      '2.5.0',
    );
    const report = runner.formatReport(results);
    expect(report).toContain('Migration: 2.1.0 => 2.5.0');
    expect(report).toContain('test.holo');
  });

  it('formatReport handles empty migrations', () => {
    const report = runner.formatReport([]);
    expect(report).toContain('No migrations to apply.');
  });
});

// ─── v2.1 → v2.5 Transforms ─────────────────────────────────────────────

describe('Migration v2.1→v2.5 Transforms', () => {
  const transforms = migration_v2_1_to_v2_5.transforms;

  it('renames @clickable to @interactive', () => {
    const t = transforms.find(t => t.name === 'rename-clickable-to-interactive')!;
    expect(t.transform('@clickable(mode: tap)', '')).toBe('@interactive(mode: tap)');
  });

  it('updates @physics gravity from scalar to vector', () => {
    const t = transforms.find(t => t.name === 'update-physics-gravity')!;
    const result = t.transform('@physics(gravity: 9.8)', '');
    expect(result).toBe('@physics(gravity: [0, -9.8, 0])');
  });

  it('renames orb to object', () => {
    const t = transforms.find(t => t.name === 'rename-orb-to-object')!;
    expect(t.transform('orb "player" { }', '')).toBe('object "player" { }');
  });

  it('preserves content without matches', () => {
    for (const t of transforms) {
      expect(t.transform('no matches here', '')).toBe('no matches here');
    }
  });
});

// ─── v2.5 → v3.0 Transforms ─────────────────────────────────────────────

describe('Migration v2.5→v3.0 Transforms', () => {
  const transforms = migration_v2_5_to_v3_0.transforms;

  it('renames @interactive to @interactable', () => {
    const t = transforms.find(t => t.name === 'rename-interactive-to-interactable')!;
    expect(t.transform('@interactive', '')).toBe('@interactable');
  });

  it('updates scene to composition', () => {
    const t = transforms.find(t => t.name === 'update-composition-syntax')!;
    expect(t.transform('scene "MyScene" {', '')).toBe('composition "MyScene" {');
  });

  it('handles multiple occurrences', () => {
    const t = transforms.find(t => t.name === 'rename-interactive-to-interactable')!;
    const result = t.transform('@interactive @interactive', '');
    expect(result).toBe('@interactable @interactable');
  });
});
