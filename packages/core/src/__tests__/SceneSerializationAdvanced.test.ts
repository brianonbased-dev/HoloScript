import { describe, it, expect } from 'vitest';
import { ProjectManager } from '../scene/ProjectManager';
import { VersionMigration, CURRENT_SCHEMA_VERSION } from '../scene/VersionMigration';

describe('Cycle 115: Scene Serialization', () => {
  // -------------------------------------------------------------------------
  // ProjectManager
  // -------------------------------------------------------------------------

  it('should manage scenes and set start scene', () => {
    const pm = new ProjectManager('TestProject');
    pm.addScene({
      id: 'scene1',
      name: 'Main Menu',
      path: '/scenes/menu.json',
      isStartScene: false,
    });
    pm.addScene({
      id: 'scene2',
      name: 'Level 1',
      path: '/scenes/level1.json',
      isStartScene: false,
    });

    expect(pm.getScenes()).toHaveLength(2);
    expect(pm.getStartScene()).toBeUndefined();

    pm.setStartScene('scene1');
    expect(pm.getStartScene()!.id).toBe('scene1');
  });

  it('should track assets and find unused ones', () => {
    const pm = new ProjectManager('TestProject');
    pm.addAsset({
      id: 'tex1',
      type: 'texture',
      path: '/t1.png',
      usedByScenes: ['scene1'],
      sizeBytes: 1024,
    });
    pm.addAsset({
      id: 'tex2',
      type: 'texture',
      path: '/t2.png',
      usedByScenes: [],
      sizeBytes: 2048,
    });

    const unused = pm.findUnusedAssets();
    expect(unused).toHaveLength(1);
    expect(unused[0].id).toBe('tex2');
    expect(pm.getTotalAssetSize()).toBe(3072);
  });

  it('should serialize and deserialize project', () => {
    const pm = new ProjectManager('MyGame', '2.0.0');
    pm.addScene({ id: 's1', name: 'Start', path: '/start.json', isStartScene: true });
    pm.setSetting('physics.gravity', 9.8);

    const json = pm.serialize();
    const restored = ProjectManager.deserialize(json);
    const file = restored.getProjectFile();

    expect(file.name).toBe('MyGame');
    expect(file.version).toBe('2.0.0');
    expect(file.scenes).toHaveLength(1);
    expect(restored.getSetting('physics.gravity')).toBe(9.8);
  });

  it('should configure build settings', () => {
    const pm = new ProjectManager('BuildTest');
    pm.setBuildConfig({ target: 'production', optimizeAssets: true, minifyScripts: true });

    const cfg = pm.getBuildConfig();
    expect(cfg.target).toBe('production');
    expect(cfg.optimizeAssets).toBe(true);
    expect(cfg.minifyScripts).toBe(true);
  });

  it('should remove scene and clean asset references', () => {
    const pm = new ProjectManager('CleanTest');
    pm.addScene({ id: 'x', name: 'X', path: '/x.json', isStartScene: false });
    pm.addAsset({ id: 'a1', type: 'model', path: '/m.glb', usedByScenes: ['x'], sizeBytes: 500 });

    pm.removeScene('x');
    expect(pm.getScenes()).toHaveLength(0);
    expect(pm.getAsset('a1')!.usedByScenes).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // VersionMigration
  // -------------------------------------------------------------------------

  it('should migrate from v0 to latest', () => {
    const migration = new VersionMigration();
    const oldData = {
      version: 0,
      name: 'OldScene',
      entities: [{ id: 42, name: 'Player' }],
    };

    const result = migration.migrate(oldData as unknown as Record<string, unknown>);
    expect(result.success).toBe(true);
    expect(result.toVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.stepsApplied.length).toBeGreaterThan(0);

    const data = result.data;
    expect(data.metadata).toBeDefined();
    const entities = data.entities as Array<Record<string, unknown>>;
    expect(typeof entities[0].id).toBe('string');
    expect(entities[0].active).toBe(true);
    expect(data.globals).toBeDefined();
    expect(Array.isArray(entities[0].tags)).toBe(true);
  });

  it('should detect when migration is needed', () => {
    const migration = new VersionMigration();
    expect(migration.needsMigration({ version: 0 })).toBe(true);
    expect(migration.needsMigration({ version: CURRENT_SCHEMA_VERSION })).toBe(false);
  });

  it('should skip migration for up-to-date data', () => {
    const migration = new VersionMigration();
    const result = migration.migrate({ version: CURRENT_SCHEMA_VERSION, name: 'Current' });
    expect(result.success).toBe(true);
    expect(result.stepsApplied).toHaveLength(0);
  });

  it('should log migration history', () => {
    const migration = new VersionMigration();
    migration.migrate({ version: 0, entities: [] });
    migration.migrate({ version: 2, entities: [] });

    const logs = migration.getLogs();
    expect(logs).toHaveLength(2);
    expect(logs[0].fromVersion).toBe(0);
  });

  it('should register custom migration steps', () => {
    const migration = new VersionMigration();
    const initialCount = migration.getMigrationCount();

    migration.register({
      fromVersion: 5,
      toVersion: 6,
      name: 'add_custom_field',
      migrate: (data) => ({ ...data, customField: 'hello' }),
    });

    expect(migration.getMigrationCount()).toBe(initialCount + 1);
    const result = migration.migrate({ version: 5 }, 6);
    expect(result.success).toBe(true);
    expect(result.data.customField).toBe('hello');
  });
});
