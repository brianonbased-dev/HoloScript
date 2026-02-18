import { describe, it, expect } from 'vitest';
import { MigrationRunner } from '../migrate/MigrationRunner';
import { migration_v2_1_to_v2_5 } from '../migrate/migrations/v2_1_to_v2_5';
import { migration_v2_5_to_v3_0 } from '../migrate/migrations/v2_5_to_v3_0';

const allMigrations = [migration_v2_1_to_v2_5, migration_v2_5_to_v3_0];

describe('MigrationRunner', () => {
  describe('findMigrationPath', () => {
    it('returns direct migration path', () => {
      const runner = new MigrationRunner(allMigrations);
      const path = runner.findMigrationPath('2.1.0', '2.5.0');
      expect(path).toHaveLength(1);
      expect(path[0].from).toBe('2.1.0');
      expect(path[0].to).toBe('2.5.0');
    });

    it('returns multi-hop migration path', () => {
      const runner = new MigrationRunner(allMigrations);
      const path = runner.findMigrationPath('2.1.0', '3.0.0');
      expect(path).toHaveLength(2);
      expect(path[0].from).toBe('2.1.0');
      expect(path[1].from).toBe('2.5.0');
    });

    it('returns empty array when no migration path found', () => {
      const runner = new MigrationRunner(allMigrations);
      const path = runner.findMigrationPath('1.0.0', '2.1.0');
      expect(path).toHaveLength(0);
    });

    it('returns empty array when from equals to', () => {
      const runner = new MigrationRunner(allMigrations);
      const path = runner.findMigrationPath('2.1.0', '2.1.0');
      expect(path).toHaveLength(0);
    });
  });

  describe('dryRun', () => {
    it('returns empty changes when no files match', () => {
      const runner = new MigrationRunner(allMigrations);
      const files = new Map([['test.hs', 'object myThing { }']]);
      const results = runner.dryRun(files, '2.1.0', '2.5.0');
      expect(results).toHaveLength(1);
      expect(results[0].modifiedFiles).toBe(0);
      expect(results[0].skippedFiles).toBe(1);
    });

    it('detects changed files', () => {
      const runner = new MigrationRunner(allMigrations);
      const files = new Map([['a.hs', '@clickable myBtn { }']]);
      const results = runner.dryRun(files, '2.1.0', '2.5.0');
      expect(results[0].modifiedFiles).toBe(1);
      expect(results[0].changes[0].changeDescriptions).toContain('Rename @clickable trait to @interactive');
    });

    it('does not modify original content', () => {
      const runner = new MigrationRunner(allMigrations);
      const files = new Map([['a.hs', '@clickable myBtn { }']]);
      const results = runner.dryRun(files, '2.1.0', '2.5.0');
      expect(results[0].changes[0].originalContent).toBe('@clickable myBtn { }');
      expect(results[0].changes[0].migratedContent).toBe('@interactive myBtn { }');
    });

    it('returns correct totalFiles count', () => {
      const runner = new MigrationRunner(allMigrations);
      const files = new Map([['a.hs','@clickable btn {}'],['b.hs','no change here']]);
      const results = runner.dryRun(files, '2.1.0', '2.5.0');
      expect(results[0].totalFiles).toBe(2);
      expect(results[0].modifiedFiles).toBe(1);
      expect(results[0].skippedFiles).toBe(1);
    });
  });

  describe('apply', () => {
    it('returns transformed map', () => {
      const runner = new MigrationRunner(allMigrations);
      const files = new Map([['a.hs', '@clickable myBtn { }']]);
      const result = runner.apply(files, '2.1.0', '2.5.0');
      expect(result.get('a.hs')).toBe('@interactive myBtn { }');
    });

    it('preserves unchanged files in output map', () => {
      const runner = new MigrationRunner(allMigrations);
      const files = new Map([['a.hs','@clickable btn {}'],['b.hs','no match here']]);
      const result = runner.apply(files, '2.1.0', '2.5.0');
      expect(result.get('b.hs')).toBe('no match here');
    });

    it('returns empty map for empty input', () => {
      const runner = new MigrationRunner(allMigrations);
      const result = runner.apply(new Map(), '2.1.0', '2.5.0');
      expect(result.size).toBe(0);
    });
  });

  describe('formatReport', () => {
    it('returns no-migrations message for empty array', () => {
      const runner = new MigrationRunner(allMigrations);
      const report = runner.formatReport([]);
      expect(report).toBe('No migrations to apply.\n');
    });

    it('includes file paths in report', () => {
      const runner = new MigrationRunner(allMigrations);
      const files = new Map([['src/main.hs', '@clickable btn {}']]);
      const results = runner.dryRun(files, '2.1.0', '2.5.0');
      const report = runner.formatReport(results);
      expect(report).toContain('src/main.hs');
    });

    it('includes change count in report', () => {
      const runner = new MigrationRunner(allMigrations);
      const files = new Map([['a.hs', '@clickable btn {}']]);
      const results = runner.dryRun(files, '2.1.0', '2.5.0');
      const report = runner.formatReport(results);
      expect(report).toContain('1 change(s)');
    });

    it('includes migration version range in report', () => {
      const runner = new MigrationRunner(allMigrations);
      const files = new Map([['a.hs', '@clickable btn {}']]);
      const results = runner.dryRun(files, '2.1.0', '2.5.0');
      const report = runner.formatReport(results);
      expect(report).toContain('2.1.0');
      expect(report).toContain('2.5.0');
    });
  });

  describe('v2.1 to v2.5 migration transforms', () => {
    it('renames @clickable to @interactive', () => {
      const runner = new MigrationRunner([migration_v2_1_to_v2_5]);
      const files = new Map([['a.hs', '@clickable myButton { }']]);
      const result = runner.apply(files, '2.1.0', '2.5.0');
      expect(result.get('a.hs')).toBe('@interactive myButton { }');
    });

    it('converts physics gravity scalar to vector', () => {
      const runner = new MigrationRunner([migration_v2_1_to_v2_5]);
      const files = new Map([['a.hs', '@physics(gravity: 9.8)']]);
      const result = runner.apply(files, '2.1.0', '2.5.0');
      expect(result.get('a.hs')).toBe('@physics(gravity: [0, -9.8, 0])');
    });

    it('renames orb to object', () => {
      const runner = new MigrationRunner([migration_v2_1_to_v2_5]);
      const files = new Map([['a.hs', 'orb myShape { }']]);
      const result = runner.apply(files, '2.1.0', '2.5.0');
      expect(result.get('a.hs')).toBe('object myShape { }');
    });

    it('leaves non-matching content unchanged', () => {
      const runner = new MigrationRunner([migration_v2_1_to_v2_5]);
      const files = new Map([['a.hs', 'object myThing { }']]);
      const result = runner.apply(files, '2.1.0', '2.5.0');
      expect(result.get('a.hs')).toBe('object myThing { }');
    });
  });

  describe('v2.5 to v3.0 migration transforms', () => {
    it('renames @interactive to @interactable', () => {
      const runner = new MigrationRunner([migration_v2_5_to_v3_0]);
      const files = new Map([['a.hs', '@interactive myBtn { }']]);
      const result = runner.apply(files, '2.5.0', '3.0.0');
      expect(result.get('a.hs')).toBe('@interactable myBtn { }');
    });

    it('updates scene keyword to composition', () => {
      const runner = new MigrationRunner([migration_v2_5_to_v3_0]);
      const files = new Map([["a.hs", "scene \"myScene\" { }"]]);
      const result = runner.apply(files, "2.5.0", "3.0.0");
      expect(result.get("a.hs")).toBe("composition \"myScene\" { }");
    });
  });

  describe('multi-hop migration', () => {
    it('chains v2.1->v2.5->v3.0 correctly', () => {
      const runner = new MigrationRunner(allMigrations);
      const src = '@clickable myBtn { }';
      const files = new Map([['a.hs', src]]);
      const result = runner.apply(files, '2.1.0', '3.0.0');
      expect(result.get('a.hs')).toBe('@interactable myBtn { }');
    });

    it('dryRun returns two migration results for multi-hop', () => {
      const runner = new MigrationRunner(allMigrations);
      const files = new Map([['a.hs', '@clickable btn {}']]);
      const results = runner.dryRun(files, '2.1.0', '3.0.0');
      expect(results).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('handles empty file content', () => {
      const runner = new MigrationRunner(allMigrations);
      const files = new Map([['a.hs', '']]);
      const result = runner.apply(files, '2.1.0', '2.5.0');
      expect(result.get('a.hs')).toBe('');
    });

    it('returns empty results for unknown version range', () => {
      const runner = new MigrationRunner(allMigrations);
      const files = new Map([['a.hs', '@clickable btn {}']]);
      const results = runner.dryRun(files, '5.0.0', '6.0.0');
      expect(results).toHaveLength(0);
    });

    it('does not mutate the original files map', () => {
      const runner = new MigrationRunner(allMigrations);
      const original = '@clickable btn {}';
      const files = new Map([['a.hs', original]]);
      runner.apply(files, '2.1.0', '2.5.0');
      expect(files.get('a.hs')).toBe(original);
    });
  });
});
