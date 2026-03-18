'use client';
/**
 * useBehaviorTree — Hook for BT editing, simulation, and trace inspection
 */
import { useState, useCallback, useRef } from 'react';
import {
  BehaviorTree,
  Blackboard,
  SequenceNode,
  SelectorNode,
  ActionNode,
  ConditionNode,
  WaitNode,
} from '@holoscript/core';

type BehaviorTreeInstance = InstanceType<typeof BehaviorTree>;
type BTStatus = ReturnType<BehaviorTreeInstance['tick']>;
type BTTreeDef = ReturnType<BehaviorTreeInstance['createTree']>;
type SequenceNodeInstance = InstanceType<typeof SequenceNode>;
type SelectorNodeInstance = InstanceType<typeof SelectorNode>;

export interface BTTraceEntry {
  tree: string;
  node: string;
  status: BTStatus;
  tick: number;
}

export interface UseBehaviorTreeReturn {
  bt: BehaviorTreeInstance;
  trees: BTTreeDef[];
  trace: BTTraceEntry[];
  lastStatus: BTStatus;
  createTree: (id: string, rootType: 'patrol' | 'guard' | 'idle', entity?: string) => BTTreeDef;
  tick: (id: string, dt?: number) => BTStatus;
  tickAll: (dt?: number) => void;
  abort: (id: string) => void;
  remove: (id: string) => void;
  reset: () => void;
}

/** Build a demo patrol tree */
function buildPatrolTree(): SequenceNodeInstance {
  return new SequenceNode('patrol-root', [
    new ActionNode('move-to-waypoint', () => 'success'),
    new WaitNode('wait-at-waypoint', 2),
    new ActionNode('look-around', () => 'success'),
  ]);
}

/** Build a demo guard tree */
function buildGuardTree(): SelectorNodeInstance {
  return new SelectorNode('guard-root', [
    new SequenceNode('chase-intruder', [
      new ConditionNode('see-intruder', () => Math.random() > 0.7),
      new ActionNode('pursue', () => 'running'),
    ]),
    new ActionNode('stand-guard', () => 'success'),
  ]);
}

/** Build a demo idle tree */
function buildIdleTree(): SelectorNodeInstance {
  return new SelectorNode('idle-root', [
    new ActionNode('wander', () => 'success'),
    new WaitNode('rest', 3),
  ]);
}

const TREE_BUILDERS: Record<string, () => SequenceNodeInstance | SelectorNodeInstance> = {
  patrol: buildPatrolTree,
  guard: buildGuardTree,
  idle: buildIdleTree,
};

export function useBehaviorTree(): UseBehaviorTreeReturn {
  const btRef = useRef(new BehaviorTree());
  const [trees, setTrees] = useState<BTTreeDef[]>([]);
  const [trace, setTrace] = useState<BTTraceEntry[]>([]);
  const [lastStatus, setLastStatus] = useState<BTStatus>('ready');

  // Always enable tracing for the Studio
  if (!btRef.current.getTrace().length) btRef.current.enableTracing();

  const syncState = useCallback(() => {
    const bt = btRef.current;
    const allTrees: BTTreeDef[] = [];
    for (let i = 0; i < bt.getTreeCount(); i++) {
      const t = bt.getTree(`tree-${i}`);
      if (t) allTrees.push(t);
    }
    setTrees(allTrees);
    setTrace(bt.getTrace());
  }, []);

  const createTree = useCallback(
    (id: string, rootType: 'patrol' | 'guard' | 'idle', entity = 'npc-1') => {
      const builder = TREE_BUILDERS[rootType] || buildPatrolTree;
      const tree = btRef.current.createTree(id, builder(), entity, new Blackboard());
      syncState();
      return tree;
    },
    [syncState]
  );

  const tick = useCallback((id: string, dt = 1 / 60) => {
    const status = btRef.current.tick(id, dt);
    setLastStatus(status);
    setTrace(btRef.current.getTrace());
    return status;
  }, []);

  const tickAll = useCallback((dt = 1 / 60) => {
    btRef.current.tickAll(dt);
    setTrace(btRef.current.getTrace());
  }, []);

  const abort = useCallback(
    (id: string) => {
      btRef.current.abort(id);
      syncState();
    },
    [syncState]
  );

  const remove = useCallback(
    (id: string) => {
      btRef.current.removeTree(id);
      syncState();
    },
    [syncState]
  );

  const reset = useCallback(() => {
    btRef.current = new BehaviorTree();
    btRef.current.enableTracing();
    setTrees([]);
    setTrace([]);
    setLastStatus('ready');
  }, []);

  return {
    bt: btRef.current,
    trees,
    trace,
    lastStatus,
    createTree,
    tick,
    tickAll,
    abort,
    remove,
    reset,
  };
}
