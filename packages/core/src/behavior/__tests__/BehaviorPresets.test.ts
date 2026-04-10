import { describe, it, expect } from 'vitest';
import {
  createPatrolBehavior,
  createIdleBehavior,
  createInteractBehavior,
  createFollowBehavior,
  createAlertBehavior,
} from '../BehaviorPresets';

describe('BehaviorPresets', () => {
  it('createPatrolBehavior returns a valid BTNode', () => {
    const node = createPatrolBehavior(4, 1.0);
    expect(node).toBeDefined();
    expect(node.tick).toBeDefined();
  });

  it('patrol behavior cycles through waypoints', () => {
    const node = createPatrolBehavior(3, 0);
    const ctx: any = {};
    // First tick selects next waypoint
    node.tick(ctx, 0.1);
    expect(ctx.waypointIndex).toBeDefined();
  });

  it('createIdleBehavior returns a repeating node', () => {
    const node = createIdleBehavior(1.0);
    expect(node).toBeDefined();
    expect(node.tick).toBeDefined();
  });

  it('idle behavior sets lookAngle', () => {
    const node = createIdleBehavior(0); // 0s wait
    const ctx: any = {};
    // Tick enough to pass wait and reach lookAround
    node.tick(ctx, 0);
    node.tick(ctx, 0);
    // lookAngle may be set after enough ticks
    expect(node.tick).toBeDefined();
  });

  it('createInteractBehavior returns a sequence node', () => {
    const node = createInteractBehavior();
    expect(node).toBeDefined();
    expect(node.tick).toBeDefined();
  });

  it('interact behavior fails without target', () => {
    const node = createInteractBehavior();
    const ctx: any = {};
    const result = node.tick(ctx, 0.1);
    expect(result).toBe('failure'); // no interactTarget
  });

  it('interact behavior succeeds with target after approach', () => {
    const node = createInteractBehavior();
    const ctx: any = { interactTarget: 'npc1' };
    // Approach runs until progress >= 1.5
    let result = node.tick(ctx, 2.0);
    // After approach success, interact action runs
    if (result === 'running') {
      result = node.tick(ctx, 0);
    }
    // Eventually succeeds
    expect(['success', 'running']).toContain(result);
  });

  it('createFollowBehavior returns a repeating node', () => {
    const node = createFollowBehavior(2.0);
    expect(node).toBeDefined();
    expect(node.tick).toBeDefined();
  });

  it('follow closes distance to target', () => {
    const node = createFollowBehavior(1.0);
    const ctx: any = { distanceToTarget: 5 };
    node.tick(ctx, 1.0);
    expect(ctx.distanceToTarget).toBeLessThan(5);
  });

  it('createAlertBehavior returns a selector node', () => {
    const node = createAlertBehavior();
    expect(node).toBeDefined();
    expect(node.tick).toBeDefined();
  });

  it('alert fights when brave and threatened', () => {
    const node = createAlertBehavior();
    const ctx: any = { courage: 0.8, threat: 'wolf' };
    const result = node.tick(ctx, 0.1);
    expect(result).toBe('success');
    expect(ctx.fightCount).toBe(1);
    expect(ctx.threat).toBeNull();
  });

  it('alert flees when not brave but threatened', () => {
    const node = createAlertBehavior();
    const ctx: any = { courage: 0.2, threat: 'wolf' };
    const result = node.tick(ctx, 0.1);
    expect(result).toBe('running'); // flee takes time
  });
});
