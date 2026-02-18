/**
 * HotReloader Production Tests
 *
 * Template hot-reload: registerTemplate, registerInstance, unregisterInstance,
 * no-change reload, and accessor methods.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HotReloader, type TemplateInstance } from '../HotReloader';

// =============================================================================
// HELPERS
// =============================================================================

function makeTemplate(name: string, version = 1, state: any = null) {
  return { name, version, state } as any;
}

function makeInstance(holoId: string, templateName: string, version = 1): TemplateInstance {
  return {
    __holo_id: holoId,
    templateName,
    version,
    state: new Map<string, any>(),
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('HotReloader — Production', () => {
  let reloader: HotReloader;

  beforeEach(() => {
    vi.clearAllMocks();
    reloader = new HotReloader({ devMode: true });
  });

  describe('template registration', () => {
    it('registers a template', () => {
      const tpl = makeTemplate('Counter');
      reloader.registerTemplate(tpl);
      expect(reloader.getTemplates().has('Counter')).toBe(true);
    });

    it('overwrites existing template', () => {
      reloader.registerTemplate(makeTemplate('Counter', 1));
      reloader.registerTemplate(makeTemplate('Counter', 2));
      expect(reloader.getTemplates().get('Counter')?.version).toBe(2);
    });
  });

  describe('instance management', () => {
    it('registers instances', () => {
      const tpl = makeTemplate('Widget');
      reloader.registerTemplate(tpl);
      reloader.registerInstance(makeInstance('w1', 'Widget'));
      reloader.registerInstance(makeInstance('w2', 'Widget'));

      expect(reloader.getInstances('Widget').length).toBe(2);
    });

    it('creates instance list for unregistered template', () => {
      reloader.registerInstance(makeInstance('x1', 'UnknownTpl'));
      expect(reloader.getInstances('UnknownTpl').length).toBe(1);
    });

    it('unregisters instance by holoid', () => {
      reloader.registerTemplate(makeTemplate('Btn'));
      reloader.registerInstance(makeInstance('b1', 'Btn'));
      reloader.registerInstance(makeInstance('b2', 'Btn'));

      reloader.unregisterInstance('b1');
      expect(reloader.getInstances('Btn').length).toBe(1);
      expect(reloader.getInstances('Btn')[0].__holo_id).toBe('b2');
    });

    it('unregister of unknown id is a no-op', () => {
      reloader.registerTemplate(makeTemplate('X'));
      reloader.unregisterInstance('nonexistent');
      // No crash
    });
  });

  describe('no-change reload', () => {
    it('succeeds with no diff and same version', async () => {
      const onReload = vi.fn();
      const r = new HotReloader({ onReload });

      const tpl = makeTemplate('Static', 1, null);
      r.registerTemplate(tpl);

      const result = await r.reload(makeTemplate('Static', 1, null));

      expect(result.success).toBe(true);
      expect(result.instancesMigrated).toBe(0);
      expect(result.rollback).toBe(false);
      expect(onReload).toHaveBeenCalledWith(result);
    });
  });

  describe('accessors', () => {
    it('getTemplates returns all', () => {
      reloader.registerTemplate(makeTemplate('A'));
      reloader.registerTemplate(makeTemplate('B'));
      expect(reloader.getTemplates().size).toBe(2);
    });

    it('getInstances returns empty for unknown', () => {
      expect(reloader.getInstances('missing')).toEqual([]);
    });
  });

  describe('migration executor', () => {
    it('sets migration executor', () => {
      const executor = vi.fn();
      reloader.setMigrationExecutor(executor);
      // No crash, executor stored internally
    });
  });
});
