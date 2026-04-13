import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPatrolBehavior,
  createIdleBehavior,
  createInteractBehavior,
  createFollowBehavior,
  createAlertBehavior,
} from '@holoscript/framework/behavior';

describe('BehaviorPresets', () => {
  it('createPatrolBehavior returns repeater node', () => {
    const node = createPatrolBehavior(4, 1.0);
    expect(node).toBeDefined();
    expect(node.type).toBe('repeater');
  });

  it('patrol cycles through waypoints', () => {
    const node = createPatrolBehavior(3, 0);
    const ctx: any = {};
    // First tick selects waypoint, second tick starts movement
    node.tick(ctx, 0.01);
    expect(ctx.waypointIndex).toBe(1);
  });

  it('patrol movement completes with enough delta', () => {
    const node = createPatrolBehavior(3, 0);
    const ctx: any = {};
    // Select waypoint
    node.tick(ctx, 0.01);
    // Move with large delta to complete
    node.tick(ctx, 3);
    expect(ctx.targetReached).toBe(true);
  });

  it('createIdleBehavior returns repeater', () => {
    const node = createIdleBehavior(1.0);
    expect(node.type).toBe('repeater');
  });

  it('idle sets lookAngle after waiting', () => {
    const node = createIdleBehavior(0);
    const ctx: any = {};
    node.tick(ctx, 0.01);
    expect(typeof ctx.lookAngle).toBe('number');
    expect(ctx.lookAngle).toBeGreaterThanOrEqual(0);
    expect(ctx.lookAngle).toBeLessThan(Math.PI * 2);
  });

  it('createInteractBehavior fails without target', () => {
    const node = createInteractBehavior();
    const ctx: any = {};
    const result = node.tick(ctx, 0.01);
    expect(result).toBe('failure');
  });

  it('interact completes full sequence with target', () => {
    const node = createInteractBehavior();
    const ctx: any = { interactTarget: 'npc' };
    // Approach needs multiple ticks
    node.tick(ctx, 0.01); // condition passes + approach starts
    node.tick(ctx, 2); // approach completes + interact runs
    expect(ctx.interactionCount).toBe(1);
    expect(ctx.interactTarget).toBeNull();
  });

  it('createFollowBehavior idles when close', () => {
    const node = createFollowBehavior(2.0);
    const ctx: any = { distanceToTarget: 1 }; // within minDist
    const result = node.tick(ctx, 0.01);
    expect(result).toBe('running'); // waiting idle
  });

  it('follow moves toward target when far', () => {
    const node = createFollowBehavior(2.0);
    const ctx: any = { distanceToTarget: 10 };
    node.tick(ctx, 1);
    expect(ctx.distanceToTarget).toBeLessThan(10);
  });

  it('createAlertBehavior fights when brave with threat', () => {
    const node = createAlertBehavior();
    const ctx: any = { courage: 0.8, threat: 'enemy' };
    node.tick(ctx, 0.01);
    expect(ctx.fightCount).toBe(1);
    expect(ctx.threat).toBeNull();
  });

  it('alert flees when not brave but has threat', () => {
    const node = createAlertBehavior();
    const ctx: any = { courage: 0.2, threat: 'enemy' };
    node.tick(ctx, 0.01); // starts fleeing
    expect(ctx.fleeProgress).toBeGreaterThan(0);
    // Complete the flee
    node.tick(ctx, 3);
    expect(ctx.threat).toBeNull();
  });
});
