/**
 * BehaviorPresets.ts
 *
 * Pre-built behavior tree patterns for common NPC and object behaviors.
 */

import {
  BTNode,
  ActionNode,
  ConditionNode,
  WaitNode,
  SequenceNode,
  SelectorNode,
  RepeaterNode,
  InverterNode,
} from './BehaviorTree';

/**
 * Patrol: Move between waypoints with pauses.
 */
export function createPatrolBehavior(
  waypointCount: number = 3,
  pauseDuration: number = 2.0
): BTNode {
  return new RepeaterNode(
    new SequenceNode([
      new ActionNode('selectNextWaypoint', (ctx) => {
        ctx.waypointIndex = ((ctx.waypointIndex || 0) + 1) % waypointCount;
        ctx.targetReached = false;
        return 'success';
      }),
      new ActionNode('moveToWaypoint', (ctx, delta) => {
        ctx.moveProgress = (ctx.moveProgress || 0) + delta * 0.5;
        if (ctx.moveProgress >= 1) {
          ctx.moveProgress = 0;
          ctx.targetReached = true;
          return 'success';
        }
        return 'running';
      }),
      new WaitNode(pauseDuration),
    ]),
    -1 // Infinite loop
  );
}

/**
 * Idle: Wait, look around, repeat.
 */
export function createIdleBehavior(idleDuration: number = 3.0): BTNode {
  return new RepeaterNode(
    new SequenceNode([
      new WaitNode(idleDuration),
      new ActionNode('lookAround', (ctx) => {
        ctx.lookAngle = Math.random() * Math.PI * 2;
        return 'success';
      }),
    ]),
    -1
  );
}

/**
 * Interact: Approach target, interact, return to origin.
 */
export function createInteractBehavior(): BTNode {
  return new SequenceNode([
    new ConditionNode('hasTarget', (ctx) => !!ctx.interactTarget),
    new ActionNode('approach', (ctx, delta) => {
      ctx.approachProgress = (ctx.approachProgress || 0) + delta;
      if (ctx.approachProgress >= 1.5) {
        ctx.approachProgress = 0;
        return 'success';
      }
      return 'running';
    }),
    new ActionNode('interact', (ctx) => {
      ctx.interactionCount = (ctx.interactionCount || 0) + 1;
      ctx.interactTarget = null;
      return 'success';
    }),
  ]);
}

/**
 * Follow: Follow a target entity, maintaining distance.
 */
export function createFollowBehavior(minDist: number = 1.5): BTNode {
  return new RepeaterNode(
    new SelectorNode([
      // If close enough, idle
      new SequenceNode([
        new ConditionNode('closeEnough', (ctx) => {
          const dist = ctx.distanceToTarget || 0;
          return dist <= minDist;
        }),
        new WaitNode(0.5),
      ]),
      // Otherwise, move toward target
      new ActionNode('moveToTarget', (ctx, delta) => {
        ctx.distanceToTarget = Math.max(0, (ctx.distanceToTarget || 5) - delta * 2);
        return ctx.distanceToTarget <= minDist ? 'success' : 'running';
      }),
    ]),
    -1
  );
}

/**
 * Alert: Check for threats, flee or fight.
 */
export function createAlertBehavior(): BTNode {
  return new SelectorNode([
    // Fight if brave
    new SequenceNode([
      new ConditionNode('isBrave', (ctx) => ctx.courage > 0.5),
      new ConditionNode('hasThreat', (ctx) => !!ctx.threat),
      new ActionNode('fight', (ctx) => {
        ctx.fightCount = (ctx.fightCount || 0) + 1;
        ctx.threat = null;
        return 'success';
      }),
    ]),
    // Flee if threatened
    new SequenceNode([
      new ConditionNode('hasThreat', (ctx) => !!ctx.threat),
      new ActionNode('flee', (ctx, delta) => {
        ctx.fleeProgress = (ctx.fleeProgress || 0) + delta;
        if (ctx.fleeProgress >= 2.0) {
          ctx.fleeProgress = 0;
          ctx.threat = null;
          return 'success';
        }
        return 'running';
      }),
    ]),
    // Default: idle
    new WaitNode(1.0),
  ]);
}
