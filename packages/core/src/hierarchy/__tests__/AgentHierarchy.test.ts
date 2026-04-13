import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HierarchyManager, resetHierarchyManager } from '../AgentHierarchy';
import type { AgentManifest, AgentCapability } from '@holoscript/framework/agents';

function makeManifest(
  id: string,
  caps: Partial<AgentCapability>[] = [{ type: 'render', domain: 'spatial' }]
): AgentManifest {
  return {
    id,
    name: `Agent ${id}`,
    version: '1.0.0',
    capabilities: caps as AgentCapability[],
    endpoints: [{ protocol: 'local', address: 'localhost' }],
    trustLevel: 'local',
    status: 'online',
  } as AgentManifest;
}

describe('HierarchyManager', () => {
  let mgr: HierarchyManager;
  const sup = makeManifest('sup');
  const sub1 = makeManifest('sub1');
  const sub2 = makeManifest('sub2', [{ type: 'analyze', domain: 'vision' }]);

  beforeEach(() => {
    mgr = new HierarchyManager();
  });

  // CRUD
  it('creates a hierarchy and returns it', () => {
    const h = mgr.createHierarchy({ id: 'h1', name: 'Test', supervisor: sup });
    expect(h.id).toBe('h1');
    expect(h.name).toBe('Test');
    expect(h.supervisor.id).toBe('sup');
    expect(h.subordinates).toEqual([]);
  });

  it('auto-generates id if not provided', () => {
    const h = mgr.createHierarchy({ name: 'Auto', supervisor: makeManifest('x') });
    expect(h.id).toBeTruthy();
    expect(h.id.startsWith('hier_')).toBe(true);
  });

  it('throws on duplicate hierarchy id', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup });
    expect(() =>
      mgr.createHierarchy({ id: 'h1', name: 'B', supervisor: makeManifest('other') })
    ).toThrow();
  });

  it('throws if supervisor already in a hierarchy', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup });
    expect(() => mgr.createHierarchy({ id: 'h2', name: 'B', supervisor: sup })).toThrow();
  });

  it('getHierarchy returns created hierarchy', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup });
    expect(mgr.getHierarchy('h1').name).toBe('A');
  });

  it('getHierarchy throws for missing id', () => {
    expect(() => mgr.getHierarchy('nope')).toThrow();
  });

  it('getHierarchyByAgent finds hierarchy by supervisor', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup });
    expect(mgr.getHierarchyByAgent('sup')?.id).toBe('h1');
  });

  it('getHierarchyByAgent returns undefined for unknown agent', () => {
    expect(mgr.getHierarchyByAgent('nope')).toBeUndefined();
  });

  it('listHierarchies returns all', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup });
    mgr.createHierarchy({ id: 'h2', name: 'B', supervisor: makeManifest('s2') });
    expect(mgr.listHierarchies().length).toBe(2);
  });

  it('updateHierarchy changes name and metadata', () => {
    mgr.createHierarchy({ id: 'h1', name: 'Old', supervisor: sup });
    const h = mgr.updateHierarchy('h1', { name: 'New', metadata: { tags: ['fast'] } });
    expect(h.name).toBe('New');
    expect(h.metadata.tags).toContain('fast');
  });

  it('deleteHierarchy removes hierarchy and unregisters agents', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup, subordinates: [sub1] });
    mgr.deleteHierarchy('h1');
    expect(() => mgr.getHierarchy('h1')).toThrow();
    expect(mgr.getHierarchyByAgent('sup')).toBeUndefined();
    expect(mgr.getHierarchyByAgent('sub1')).toBeUndefined();
  });

  // Subordinate management
  it('addSubordinate adds agent', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup });
    mgr.addSubordinate('h1', sub1);
    expect(mgr.getSubordinates('sup')).toHaveLength(1);
  });

  it('addSubordinate throws if agent already in hierarchy', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup, subordinates: [sub1] });
    expect(() => mgr.addSubordinate('h1', sub1)).toThrow();
  });

  it('removeSubordinate removes agent', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup, subordinates: [sub1] });
    mgr.removeSubordinate('h1', 'sub1');
    expect(mgr.getSubordinates('sup')).toHaveLength(0);
  });

  it('removeSubordinate throws for non-subordinate', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup });
    expect(() => mgr.removeSubordinate('h1', 'nope')).toThrow();
  });

  it('getSubordinates returns empty for non-supervisor', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup, subordinates: [sub1] });
    expect(mgr.getSubordinates('sub1')).toEqual([]);
  });

  it('getSupervisor returns supervisor for subordinate', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup, subordinates: [sub1] });
    expect(mgr.getSupervisor('sub1')?.id).toBe('sup');
  });

  it('getSupervisor returns undefined for supervisor itself', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup });
    expect(mgr.getSupervisor('sup')).toBeUndefined();
  });

  it('isSupervisor / isSubordinate', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup, subordinates: [sub1] });
    expect(mgr.isSupervisor('sup')).toBe(true);
    expect(mgr.isSupervisor('sub1')).toBe(false);
    expect(mgr.isSubordinate('sub1')).toBe(true);
    expect(mgr.isSubordinate('sup')).toBe(false);
  });

  // Delegation rules
  it('addDelegationRule and findDelegationRule', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup, subordinates: [sub1] });
    const rule = mgr.addDelegationRule('h1', {
      taskType: 'render',
      targetAgentId: 'sub1',
      priority: 10,
    });
    expect(rule.id).toBeTruthy();
    expect(mgr.findDelegationRule('h1', 'render')?.targetAgentId).toBe('sub1');
  });

  it('findDelegationRule returns wildcard rule', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup });
    mgr.addDelegationRule('h1', { taskType: '*', targetAgentId: 'fallback', priority: 1 });
    expect(mgr.findDelegationRule('h1', 'anything')?.targetAgentId).toBe('fallback');
  });

  it('findDelegationRule returns highest-priority match', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup });
    mgr.addDelegationRule('h1', { taskType: 'render', targetAgentId: 'low', priority: 1 });
    mgr.addDelegationRule('h1', { taskType: 'render', targetAgentId: 'high', priority: 99 });
    expect(mgr.findDelegationRule('h1', 'render')?.targetAgentId).toBe('high');
  });

  it('removeDelegationRule', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup });
    const rule = mgr.addDelegationRule('h1', { taskType: 'x', targetAgentId: 'a', priority: 1 });
    mgr.removeDelegationRule('h1', rule.id);
    expect(mgr.findDelegationRule('h1', 'x')).toBeUndefined();
  });

  it('findSubordinateByCapability', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup, subordinates: [sub1, sub2] });
    expect(mgr.findSubordinateByCapability('h1', 'analyze')?.id).toBe('sub2');
    expect(mgr.findSubordinateByCapability('h1', 'nonexistent')).toBeUndefined();
  });

  // Escalation
  it('getEscalationPath returns path copy', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup, escalationPath: ['a', 'b', 'c'] });
    const path = mgr.getEscalationPath('h1');
    expect(path).toEqual(['a', 'b', 'c']);
  });

  it('getNextEscalationTarget returns next in path', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup, escalationPath: ['a', 'b', 'c'] });
    expect(mgr.getNextEscalationTarget('h1', 'a')).toBe('b');
    expect(mgr.getNextEscalationTarget('h1', 'c')).toBeUndefined();
    expect(mgr.getNextEscalationTarget('h1', 'unknown')).toBe('a');
  });

  // Stats
  it('getStats returns initial stats', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup, subordinates: [sub1] });
    const stats = mgr.getStats('h1');
    expect(stats.totalTasks).toBe(0);
    expect(stats.activeSubordinates).toBe(1);
  });

  it('recordTaskCompletion updates stats', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup, subordinates: [sub1] });
    mgr.recordTaskCompletion('h1', 'sub1', true, 100);
    mgr.recordTaskCompletion('h1', 'sub1', false, 200);
    const stats = mgr.getStats('h1');
    expect(stats.totalTasks).toBe(2);
    expect(stats.completedTasks).toBe(1);
    expect(stats.failedTasks).toBe(1);
    expect(stats.successRate).toBe(0.5);
  });

  it('recordEscalation increments escalatedTasks', () => {
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup });
    mgr.recordEscalation('h1');
    expect(mgr.getStats('h1').escalatedTasks).toBe(1);
  });

  // Events
  it('emits hierarchyCreated event', () => {
    const cb = vi.fn();
    mgr.on('hierarchyCreated', cb);
    mgr.createHierarchy({ id: 'h1', name: 'A', supervisor: sup });
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
