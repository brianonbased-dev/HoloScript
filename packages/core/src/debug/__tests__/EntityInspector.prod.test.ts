/**
 * EntityInspector Production Tests
 *
 * Register, select, getComponent, setProperty, filter, watch.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EntityInspector, type InspectedEntity } from '../EntityInspector';

function makeEntity(id: string, name: string, tags: string[] = [], active = true): InspectedEntity {
  return {
    id, name, tags, active, parentId: null,
    components: new Map([
      ['Transform', { x: 0, y: 0, z: 0 }],
      ['Health', { hp: 100, max: 100 }],
    ]),
  };
}

describe('EntityInspector — Production', () => {
  let inspector: EntityInspector;

  beforeEach(() => {
    inspector = new EntityInspector();
  });

  describe('register / remove', () => {
    it('registers entity', () => {
      inspector.registerEntity(makeEntity('e1', 'Player'));
      expect(inspector.getEntityCount()).toBe(1);
    });

    it('removes entity', () => {
      inspector.registerEntity(makeEntity('e1', 'Player'));
      expect(inspector.removeEntity('e1')).toBe(true);
      expect(inspector.getEntityCount()).toBe(0);
    });
  });

  describe('select', () => {
    it('selects and retrieves', () => {
      inspector.registerEntity(makeEntity('e1', 'Player'));
      expect(inspector.select('e1')).toBe(true);
      expect(inspector.getSelected()?.name).toBe('Player');
    });

    it('select nonexistent returns false', () => {
      expect(inspector.select('nope')).toBe(false);
    });
  });

  describe('getComponent', () => {
    it('returns component data', () => {
      inspector.registerEntity(makeEntity('e1', 'Player'));
      const health = inspector.getComponent('e1', 'Health');
      expect(health?.hp).toBe(100);
    });
  });

  describe('setProperty', () => {
    it('edits component property', () => {
      inspector.registerEntity(makeEntity('e1', 'Player'));
      expect(inspector.setProperty('e1', 'Health', 'hp', 50)).toBe(true);
      expect(inspector.getComponent('e1', 'Health')?.hp).toBe(50);
    });

    it('returns false for missing', () => {
      expect(inspector.setProperty('nope', 'Health', 'hp', 50)).toBe(false);
    });
  });

  describe('filter', () => {
    it('by name', () => {
      inspector.registerEntity(makeEntity('e1', 'Player'));
      inspector.registerEntity(makeEntity('e2', 'Enemy'));
      expect(inspector.filter({ nameQuery: 'play' })).toHaveLength(1);
    });

    it('by tag', () => {
      inspector.registerEntity(makeEntity('e1', 'Player', ['hero']));
      inspector.registerEntity(makeEntity('e2', 'Enemy', ['villain']));
      expect(inspector.filter({ tag: 'hero' })).toHaveLength(1);
    });

    it('by component', () => {
      inspector.registerEntity(makeEntity('e1', 'Player'));
      expect(inspector.filter({ componentType: 'Transform' })).toHaveLength(1);
    });

    it('activeOnly', () => {
      inspector.registerEntity(makeEntity('e1', 'Active', [], true));
      inspector.registerEntity(makeEntity('e2', 'Inactive', [], false));
      expect(inspector.filter({ activeOnly: true })).toHaveLength(1);
    });
  });

  describe('watch', () => {
    it('sets and gets watched properties', () => {
      inspector.watch('e1', ['Transform.x', 'Health.hp']);
      expect(inspector.getWatched().get('e1')).toEqual(['Transform.x', 'Health.hp']);
    });
  });
});
