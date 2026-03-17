/**
 * VersionedStateTrait — Wisdom/Gotcha Atom #4
 *
 * Branchable state history with CRDT or manual merge strategy.
 * Enables fork/merge workflows for collaborative editing and undo trees.
 *
 * Gotcha guarded: Merge conflict cascades in collaborative edits.
 *
 * Events emitted:
 *  versioned_state_initialized  { node, strategy, branches }
 *  state_branch_created         { node, branchId, parentBranch }
 *  state_merged                 { node, sourceBranch, targetBranch, conflicts }
 *  state_conflict               { node, branchA, branchB, key }
 *  versioned_state_error        { node, error }
 *
 * @see proposals/WISDOM_GOTCHA_ATOMS_BATCH1_RFC.md
 * @version 1.0.0
 */

import type { TraitHandler, TraitContext } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VersionedStateStrategy = 'crdt' | 'manual';

export interface VersionedStateConfig {
  /** Merge strategy */
  strategy: VersionedStateStrategy;
  /** Max concurrent branches (>= 1) */
  branches: number;
  /** Auto-merge on conflict for CRDT strategy (last-writer-wins fallback) */
  auto_merge_lww: boolean;
}

interface StateBranch {
  id: string;
  parentId: string | null;
  snapshot: Record<string, unknown>;
  createdAt: number;
}

interface VersionedStateState {
  initialized: boolean;
  activeBranch: string;
  branches: Map<string, StateBranch>;
  mergeCount: number;
  conflictCount: number;
}

type VersionedNode = HSPlusNode & {
  __versionedStateState?: VersionedStateState;
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: VersionedStateConfig = {
  strategy: 'crdt',
  branches: 4,
  auto_merge_lww: true,
};

// ─── Handler ──────────────────────────────────────────────────────────────────

export const versionedStateHandler: TraitHandler<VersionedStateConfig> = {
  name: 'versioned_state',
  defaultConfig: DEFAULT_CONFIG,

  onAttach(node: HSPlusNode, config: VersionedStateConfig, context: TraitContext): void {
    const vNode = node as VersionedNode;

    // Validate config
    if (config.branches < 1) {
      context.emit('versioned_state_error', {
        node,
        error: `branches must be >= 1, got ${config.branches}`,
      });
      return;
    }

    // Gotcha: manual strategy in multiplayer targets is risky
    if (config.strategy === 'manual' && node.traits?.has('networked')) {
      context.emit('versioned_state_error', {
        node,
        warning: 'manual merge strategy on a networked object risks unresolved conflict cascades. Consider strategy: "crdt".',
      });
    }

    const mainBranch: StateBranch = {
      id: 'main',
      parentId: null,
      snapshot: {},
      createdAt: Date.now(),
    };

    const state: VersionedStateState = {
      initialized: true,
      activeBranch: 'main',
      branches: new Map([['main', mainBranch]]),
      mergeCount: 0,
      conflictCount: 0,
    };
    vNode.__versionedStateState = state;

    context.emit('versioned_state_initialized', {
      node,
      strategy: config.strategy,
      branches: config.branches,
    });
  },

  onDetach(node: HSPlusNode): void {
    delete (node as VersionedNode).__versionedStateState;
  },

  onUpdate(): void {
    // No per-frame work needed
  },

  onEvent(node: HSPlusNode, config: VersionedStateConfig, context: TraitContext, event: { type: string; [key: string]: unknown }): void {
    const vNode = node as VersionedNode;
    const state = vNode.__versionedStateState;
    if (!state?.initialized) return;

    if (event.type === 'state_branch_request') {
      const parentBranch = (event.from as string) || state.activeBranch;
      const branchId = (event.branchId as string) || `branch-${state.branches.size}`;

      if (state.branches.size >= config.branches) {
        context.emit('versioned_state_error', {
          node,
          error: `Max branches (${config.branches}) reached. Cannot create "${branchId}".`,
        });
        return;
      }

      const parent = state.branches.get(parentBranch);
      if (!parent) {
        context.emit('versioned_state_error', {
          node,
          error: `Parent branch "${parentBranch}" not found.`,
        });
        return;
      }

      const newBranch: StateBranch = {
        id: branchId,
        parentId: parentBranch,
        snapshot: { ...parent.snapshot },
        createdAt: Date.now(),
      };
      state.branches.set(branchId, newBranch);

      context.emit('state_branch_created', {
        node,
        branchId,
        parentBranch,
        totalBranches: state.branches.size,
      });
    }

    if (event.type === 'state_merge_request') {
      const source = event.source as string;
      const target = (event.target as string) || 'main';
      const sourceBranch = state.branches.get(source);
      const targetBranch = state.branches.get(target);

      if (!sourceBranch || !targetBranch) {
        context.emit('versioned_state_error', {
          node,
          error: `Merge failed: branch "${!sourceBranch ? source : target}" not found.`,
        });
        return;
      }

      // Detect conflicts
      const conflicts: string[] = [];
      for (const key of Object.keys(sourceBranch.snapshot)) {
        if (
          key in targetBranch.snapshot &&
          sourceBranch.snapshot[key] !== targetBranch.snapshot[key]
        ) {
          conflicts.push(key);
        }
      }

      if (conflicts.length > 0 && config.strategy === 'manual') {
        state.conflictCount += conflicts.length;
        for (const key of conflicts) {
          context.emit('state_conflict', {
            node,
            branchA: source,
            branchB: target,
            key,
          });
        }
        return; // Manual strategy: conflicts must be resolved externally
      }

      // CRDT / auto-merge: last-writer-wins
      Object.assign(targetBranch.snapshot, sourceBranch.snapshot);
      state.branches.delete(source);
      state.mergeCount++;

      context.emit('state_merged', {
        node,
        sourceBranch: source,
        targetBranch: target,
        conflicts: conflicts.length,
        autoResolved: conflicts.length > 0,
      });
    }
  },
};
