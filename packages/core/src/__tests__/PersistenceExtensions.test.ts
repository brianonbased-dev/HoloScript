import { describe, it, expect } from 'vitest';
import { SaveSerializer } from '../persistence/SaveSerializer';
import { MigrationManager } from '../persistence/MigrationManager';
import { AutoSaveSystem } from '../persistence/AutoSaveSystem';

describe('Cycle 164: Persistence Extensions', () => {
  // -------------------------------------------------------------------------
  // SaveSerializer
  // -------------------------------------------------------------------------

  it('should encode and decode with checksum validation', () => {
    const ser = new SaveSerializer({
      version: 1,
      fields: [
        { name: 'score', type: 'number' },
        { name: 'name', type: 'string' },
      ],
    });

    const save = ser.encode({ score: 100, name: 'Alice', extra: 'ignored' });
    expect(save.header.version).toBe(1);
    expect(save.header.fieldCount).toBe(2);

    const decoded = ser.decode(save)!;
    expect(decoded.score).toBe(100);
    expect(decoded.name).toBe('Alice');
    expect(decoded).not.toHaveProperty('extra');
  });

  it('should reject tampered saves', () => {
    const ser = new SaveSerializer({
      version: 1,
      fields: [{ name: 'hp', type: 'number' }],
    });

    const save = ser.encode({ hp: 50 });
    save.payload.hp = 9999; // Tamper
    const decoded = ser.decode(save);
    expect(decoded).toBeNull(); // Checksum mismatch
  });

  // -------------------------------------------------------------------------
  // MigrationManager
  // -------------------------------------------------------------------------

  it('should chain migrations across versions', () => {
    const mgr = new MigrationManager(3);

    mgr.registerMigration({
      fromVersion: 1,
      toVersion: 2,
      migrate: (d) => ({ ...d, newField: 'default' }),
      description: 'Added newField',
    });
    mgr.registerMigration({
      fromVersion: 2,
      toVersion: 3,
      migrate: (d) => {
        const { oldField, ...rest } = d;
        return rest;
      },
      description: 'Removed oldField',
    });

    const result = mgr.migrate({ oldField: 'x', score: 10 }, 1);
    expect(result.version).toBe(3);
    expect(result.steps).toHaveLength(2);
    expect(result.data).toHaveProperty('newField');
    expect(result.data).not.toHaveProperty('oldField');
  });

  // -------------------------------------------------------------------------
  // AutoSaveSystem
  // -------------------------------------------------------------------------

  it('should auto-save at intervals', () => {
    const auto = new AutoSaveSystem(5, 1000);

    const saved = auto.checkAutoSave(0, () => ({ level: 1 }));
    expect(saved).toBe(true);

    // Too soon
    const skipped = auto.checkAutoSave(500, () => ({ level: 1 }));
    expect(skipped).toBe(false);

    // Interval passed
    const saved2 = auto.checkAutoSave(1500, () => ({ level: 2 }));
    expect(saved2).toBe(true);
    expect(auto.getSlotCount()).toBe(2);
  });

  it('should evict oldest autosave when at max slots', () => {
    const auto = new AutoSaveSystem(2, 100);

    auto.save('s1', 'Manual', { x: 1 });
    auto.save('auto1', 'Auto', { x: 2 }, true);

    // At max — manual won't be evicted, auto will
    const ok = auto.save('auto2', 'Auto 2', { x: 3 }, true);
    expect(ok).toBe(true);
    expect(auto.getSlotCount()).toBe(2);
    expect(auto.load('auto1')).toBeNull(); // Evicted
  });
});
