/**
 * AgentHierarchy.prod.test.ts — Sprint CLXVIII
 *
 * Production tests for HierarchyManager.
 * Covers hierarchy CRUD, subordinate management,
 * delegation rules, escalation paths, stats.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HierarchyManager,
  getHierarchyManager,
  resetHierarchyManager,
  type CreateHierarchyOptions,
} from '../AgentHierarchy';
import type { AgentManifest } from '../../agents/AgentManifest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeManifest(id: string, capabilities: string[] = []): AgentManifest {
  return {
    id,
    name: `Agent ${id}`,
    version: '1.0.0',
    description: 'Test agent',
    capabilities: capabilities.map((type) => ({
      type,
      description: `Can do ${type}`,
      inputSchema: {},
      outputSchema: {},
    })),
    endpoints: {},
    metadata: {},
  } as unknown as AgentManifest;
}

function makeOpts(overrides: Partial<CreateHierarchyOptions> = {}): CreateHierarchyOptions {
  return {
    name: 'Test Hierarchy',
    supervisor: makeManifest('supervisor-1'),
    subordinates: [makeManifest('sub-1'), makeManifest('sub-2')],
    ...overrides,
  };
}

let manager: HierarchyManager;

beforeEach(() => {
  manager = new HierarchyManager();
});

// ---------------------------------------------------------------------------
// Hierarchy CRUD
// ---------------------------------------------------------------------------

describe('HierarchyManager', () => {
  describe('createHierarchy', () => {
    it('creates with auto-generated ID', () => {
      const h = manager.createHierarchy(makeOpts());
      expect(h.id).toBeTruthy();
      expect(h.name).toBe('Test Hierarchy');
      expect(h.subordinates).toHaveLength(2);
    });

    it('creates with explicit ID', () => {
      const h = manager.createHierarchy(makeOpts({ id: 'my-h' }));
      expect(h.id).toBe('my-h');
    });

    it('throws on duplicate ID', () => {
      manager.createHierarchy(makeOpts({ id: 'dup', supervisor: makeManifest('ds') }));
      expect(() =>
        manager.createHierarchy(makeOpts({ id: 'dup', supervisor: makeManifest('ds2'), subordinates: [] })),
      ).toThrow(/already exists/i);
    });

    it('throws when supervisor is already in another hierarchy', () => {
      const sup = makeManifest('shared-sup');
      manager.createHierarchy({ name: 'H1', supervisor: sup });
      expect(() => manager.createHierarchy({ name: 'H2', supervisor: sup })).toThrow(/already in a hierarchy/i);
    });

    it('throws when subordinate is already in another hierarchy', () => {
      const sub = makeManifest('shared-sub');
      manager.createHierarchy({ name: 'H1', supervisor: makeManifest('sA'), subordinates: [sub] });
      expect(() =>
        manager.createHierarchy({ name: 'H2', supervisor: makeManifest('sB'), subordinates: [sub] }),
      ).toThrow(/already in a hierarchy/i);
    });

    it('emits hierarchyCreated event', () => {
      const handler = vi.fn();
      manager.on('hierarchyCreated', handler);
      manager.createHierarchy(makeOpts());
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('initializes escalation path to [supervisorId]', () => {
      const h = manager.createHierarchy({ name: 'H', supervisor: makeManifest('sup-X') });
      expect(h.escalationPath).toEqual(['sup-X']);
    });
  });

  describe('getHierarchy', () => {
    it('retrieves existing hierarchy', () => {
      manager.createHierarchy(makeOpts({ id: 'get-h' }));
      expect(manager.getHierarchy('get-h').id).toBe('get-h');
    });

    it('throws for unknown ID', () => {
      expect(() => manager.getHierarchy('nope')).toThrow(/not found/i);
    });
  });

  describe('listHierarchies', () => {
    it('returns all hierarchies', () => {
      manager.createHierarchy(makeOpts({ id: 'l1', supervisor: makeManifest('s1'), subordinates: [] }));
      manager.createHierarchy(makeOpts({ id: 'l2', supervisor: makeManifest('s2'), subordinates: [] }));
      expect(manager.listHierarchies()).toHaveLength(2);
    });

    it('returns empty when none', () => {
      expect(manager.listHierarchies()).toHaveLength(0);
    });
  });

  describe('updateHierarchy', () => {
    it('updates name', () => {
      manager.createHierarchy(makeOpts({ id: 'upd' }));
      const updated = manager.updateHierarchy('upd', { name: 'New Name' });
      expect(updated.name).toBe('New Name');
    });

    it('updates escalation path', () => {
      manager.createHierarchy(makeOpts({ id: 'esc-upd' }));
      const u = manager.updateHierarchy('esc-upd', { escalationPath: ['s1', 'admin'] });
      expect(u.escalationPath).toEqual(['s1', 'admin']);
    });

    it('emits hierarchyUpdated event', () => {
      const handler = vi.fn();
      manager.createHierarchy(makeOpts({ id: 'evt-upd' }));
      manager.on('hierarchyUpdated', handler);
      manager.updateHierarchy('evt-upd', { name: 'X' });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteHierarchy', () => {
    it('removes and frees agents', () => {
      const sup = makeManifest('del-sup');
      manager.createHierarchy({ name: 'H', supervisor: sup, id: 'del-h' });
      manager.deleteHierarchy('del-h');
      expect(() => manager.getHierarchy('del-h')).toThrow();
      expect(() => manager.createHierarchy({ name: 'H2', supervisor: sup, id: 'del-h2' })).not.toThrow();
    });

    it('emits hierarchyDeleted event', () => {
      const handler = vi.fn();
      manager.createHierarchy(makeOpts({ id: 'del-evt' }));
      manager.on('hierarchyDeleted', handler);
      manager.deleteHierarchy('del-evt');
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Subordinate management
  // -------------------------------------------------------------------------

  describe('addSubordinate / removeSubordinate', () => {
    it('adds a new subordinate', () => {
      manager.createHierarchy({ name: 'H', supervisor: makeManifest('s'), id: 'sub-h', subordinates: [] });
      manager.addSubordinate('sub-h', makeManifest('new-sub'));
      expect(manager.getHierarchy('sub-h').subordinates).toHaveLength(1);
    });

    it('throws when adding already-registered agent', () => {
      const sub = makeManifest('reg-sub');
      manager.createHierarchy({ name: 'H', supervisor: makeManifest('s'), id: 'add-h', subordinates: [sub] });
      expect(() => manager.addSubordinate('add-h', sub)).toThrow(/already in a hierarchy/i);
    });

    it('removes an existing subordinate', () => {
      const sub = makeManifest('rem-sub');
      manager.createHierarchy({ name: 'H', supervisor: makeManifest('s'), id: 'rem-h', subordinates: [sub] });
      manager.removeSubordinate('rem-h', 'rem-sub');
      expect(manager.getHierarchy('rem-h').subordinates).toHaveLength(0);
    });

    it('throws when removing non-existent subordinate', () => {
      manager.createHierarchy({ name: 'H', supervisor: makeManifest('s'), id: 'rem-err', subordinates: [] });
      expect(() => manager.removeSubordinate('rem-err', 'ghost')).toThrow(/not a subordinate/i);
    });
  });

  describe('role helpers', () => {
    beforeEach(() => {
      manager.createHierarchy({
        id: 'role-h',
        name: 'Role Hierarchy',
        supervisor: makeManifest('sup'),
        subordinates: [makeManifest('sub-a'), makeManifest('sub-b')],
      });
    });

    it('getSubordinates returns subordinates', () => {
      const subs = manager.getSubordinates('sup');
      expect(subs.map((s) => s.id)).toContain('sub-a');
    });

    it('getSubordinates returns [] for non-supervisor', () => {
      expect(manager.getSubordinates('sub-a')).toHaveLength(0);
    });

    it('getSupervisor returns supervisor for subordinate', () => {
      expect(manager.getSupervisor('sub-a')?.id).toBe('sup');
    });

    it('getSupervisor returns undefined for supervisor', () => {
      expect(manager.getSupervisor('sup')).toBeUndefined();
    });

    it('isSupervisor / isSubordinate', () => {
      expect(manager.isSupervisor('sup')).toBe(true);
      expect(manager.isSupervisor('sub-a')).toBe(false);
      expect(manager.isSubordinate('sub-a')).toBe(true);
      expect(manager.isSubordinate('sup')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Delegation rules
  // -------------------------------------------------------------------------

  describe('delegation rules', () => {
    beforeEach(() => {
      manager.createHierarchy({
        id: 'rule-h',
        name: 'Rule Hierarchy',
        supervisor: makeManifest('rs'),
        subordinates: [makeManifest('rsa', ['render']), makeManifest('rsb', ['data'])],
      });
    });

    it('addDelegationRule adds a rule', () => {
      const rule = manager.addDelegationRule('rule-h', {
        taskType: 'render',
        targetCapability: 'render',
        maxRetries: 2,
        escalateOnFailure: false,
        timeout: 30000,
        priority: 10,
        requiresApproval: false,
      });
      expect(rule.id).toBeTruthy();
      expect(rule.taskType).toBe('render');
    });

    it('findDelegationRule returns highest-priority rule', () => {
      manager.addDelegationRule('rule-h', {
        taskType: 'render', targetCapability: 'render', maxRetries: 1,
        escalateOnFailure: false, timeout: 10000, priority: 5, requiresApproval: false,
      });
      manager.addDelegationRule('rule-h', {
        taskType: 'render', targetCapability: 'render', maxRetries: 3,
        escalateOnFailure: true, timeout: 60000, priority: 20, requiresApproval: false,
      });
      const rule = manager.findDelegationRule('rule-h', 'render');
      expect(rule?.priority).toBe(20);
    });

    it('findDelegationRule returns wildcard when no specific match', () => {
      manager.addDelegationRule('rule-h', {
        taskType: '*', targetCapability: 'any', maxRetries: 1,
        escalateOnFailure: false, timeout: 5000, priority: 1, requiresApproval: false,
      });
      expect(manager.findDelegationRule('rule-h', 'unknown-task')?.taskType).toBe('*');
    });

    it('findDelegationRule returns undefined when no rules', () => {
      expect(manager.findDelegationRule('rule-h', 'nope')).toBeUndefined();
    });

    it('removeDelegationRule removes the rule', () => {
      const rule = manager.addDelegationRule('rule-h', {
        taskType: 'data', targetCapability: 'data', maxRetries: 1,
        escalateOnFailure: false, timeout: 5000, priority: 1, requiresApproval: false,
      });
      manager.removeDelegationRule('rule-h', rule.id);
      expect(manager.findDelegationRule('rule-h', 'data')).toBeUndefined();
    });

    it('throws when removing nonexistent rule', () => {
      expect(() => manager.removeDelegationRule('rule-h', 'ghost-rule')).toThrow(/not found/i);
    });

    it('findSubordinateByCapability finds matching agent', () => {
      expect(manager.findSubordinateByCapability('rule-h', 'render')?.id).toBe('rsa');
    });

    it('findSubordinateByCapability returns undefined when no match', () => {
      expect(manager.findSubordinateByCapability('rule-h', 'vr')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Escalation path
  // -------------------------------------------------------------------------

  describe('escalation path', () => {
    beforeEach(() => {
      manager.createHierarchy({
        id: 'esc-h',
        name: 'Escalation Hierarchy',
        supervisor: makeManifest('esc-sup'),
        subordinates: [makeManifest('esc-sub-1')],
        escalationPath: ['esc-sub-1', 'esc-sup', 'admin'],
      });
    });

    it('getEscalationPath returns path', () => {
      expect(manager.getEscalationPath('esc-h')).toEqual(['esc-sub-1', 'esc-sup', 'admin']);
    });

    it('getNextEscalationTarget returns next in path', () => {
      expect(manager.getNextEscalationTarget('esc-h', 'esc-sub-1')).toBe('esc-sup');
      expect(manager.getNextEscalationTarget('esc-h', 'esc-sup')).toBe('admin');
    });

    it('getNextEscalationTarget returns undefined at end', () => {
      expect(manager.getNextEscalationTarget('esc-h', 'admin')).toBeUndefined();
    });

    it('getNextEscalationTarget returns first when not in path', () => {
      expect(manager.getNextEscalationTarget('esc-h', 'unknown')).toBe('esc-sub-1');
    });
  });

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  describe('stats', () => {
    beforeEach(() => {
      manager.createHierarchy({
        id: 'stats-h',
        name: 'Stats Hierarchy',
        supervisor: makeManifest('stats-sup'),
        subordinates: [makeManifest('stats-sub')],
      });
    });

    it('initializes with zeroes', () => {
      const stats = manager.getStats('stats-h');
      expect(stats.totalTasks).toBe(0);
      expect(stats.completedTasks).toBe(0);
      expect(stats.successRate).toBe(0);
    });

    it('recordTaskCompletion tracks completed', () => {
      manager.recordTaskCompletion('stats-h', 'stats-sub', true, 1000);
      const stats = manager.getStats('stats-h');
      expect(stats.totalTasks).toBe(1);
      expect(stats.completedTasks).toBe(1);
      expect(stats.successRate).toBe(1.0);
    });

    it('recordTaskCompletion tracks failures', () => {
      manager.recordTaskCompletion('stats-h', 'stats-sub', false, 500);
      expect(manager.getStats('stats-h').failedTasks).toBe(1);
      expect(manager.getStats('stats-h').successRate).toBe(0);
    });

    it('tracks tasks per subordinate', () => {
      manager.recordTaskCompletion('stats-h', 'stats-sub', true, 200);
      manager.recordTaskCompletion('stats-h', 'stats-sub', true, 400);
      expect(manager.getStats('stats-h').tasksPerSubordinate['stats-sub']).toBe(2);
    });

    it('recordEscalation increments escalations', () => {
      manager.recordEscalation('stats-h');
      expect(manager.getStats('stats-h').escalatedTasks).toBe(1);
    });

    it('returns immutable stats copy', () => {
      const s1 = manager.getStats('stats-h');
      s1.totalTasks = 9999;
      expect(manager.getStats('stats-h').totalTasks).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getHierarchyByAgent
  // -------------------------------------------------------------------------

  describe('getHierarchyByAgent', () => {
    it('returns hierarchy for member', () => {
      manager.createHierarchy({
        id: 'ba-h',
        name: 'BA Hierarchy',
        supervisor: makeManifest('ba-sup'),
        subordinates: [makeManifest('ba-sub')],
      });
      expect(manager.getHierarchyByAgent('ba-sup')?.id).toBe('ba-h');
      expect(manager.getHierarchyByAgent('ba-sub')?.id).toBe('ba-h');
    });

    it('returns undefined for unknown agent', () => {
      expect(manager.getHierarchyByAgent('nobody')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Singleton factory
  // -------------------------------------------------------------------------

  describe('singleton', () => {
    it('returns same instance', () => {
      resetHierarchyManager();
      expect(getHierarchyManager()).toBe(getHierarchyManager());
      resetHierarchyManager();
    });

    it('resetHierarchyManager creates fresh instance', () => {
      const m1 = getHierarchyManager();
      resetHierarchyManager();
      expect(getHierarchyManager()).not.toBe(m1);
      resetHierarchyManager();
    });
  });
});
