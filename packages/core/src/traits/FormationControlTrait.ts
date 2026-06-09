/**
 * FormationControl Trait
 *
 * Declarative multi-agent geometric formation for swarm scenes.
 * Accepts a shape enum, inter-agent spacing, and a reference anchor entity,
 * then emits per-agent target positions that PID controllers or navmesh
 * solvers can consume.
 *
 * Suggested API in HoloScript:
 *   `@formation_control(shape: 'triangle', spacing: 3.0, anchor: 'Commander', sync_rate_hz: 10)`
 *
 * Emitted events:
 *   - `formation_control_attached`   — on attach, carries initial slot assignments
 *   - `formation_control_updated`    — each sync tick; carries per-slot target positions
 *   - `formation_control_agent_added`   — when a new member joins via `formation:add_agent`
 *   - `formation_control_agent_removed` — when a member leaves via `formation:remove_agent`
 *   - `formation_control_shape_changed` — when shape/spacing/anchor is reconfigured
 *
 * Consumed events:
 *   - `formation:add_agent`    — { agentId: string; slotHint?: number }
 *   - `formation:remove_agent` — { agentId: string }
 *   - `formation:reconfigure`  — Partial<FormationControlConfig>
 *   - `formation:sync`         — (manual tick; use when sync_rate_hz is 0)
 *
 * @version 1.0.0
 */

import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

// =============================================================================
// Types
// =============================================================================

/** Supported formation geometries. */
export type FormationShape = 'triangle' | 'v' | 'column' | 'circle' | 'line' | 'wedge';

export interface FormationControlConfig {
  /** Geometric shape of the formation. */
  shape: FormationShape;
  /** Spacing between agents in world units. */
  spacing: number;
  /** ID of the anchor entity (typically the leader / commander). */
  anchor: string;
  /**
   * How many times per second target positions are recomputed and emitted.
   * 0 = manual only (trigger via `formation:sync` event).
   */
  sync_rate_hz: number;
  /**
   * Rotation of the entire formation around the anchor in radians.
   * Defaults to 0 (facing +Z of the anchor).
   */
  rotation_offset_rad: number;
  /**
   * Fixed Y offset applied to all slot positions (useful for ground-following agents
   * that should hover at a set height above the formation anchor).
   */
  y_offset: number;
}

export interface FormationSlot {
  /** 0-based slot index. */
  slotIndex: number;
  /** Agent currently assigned to this slot, or null if empty. */
  agentId: string | null;
  /** World-space target position for this slot, relative to anchor. */
  localOffset: Readonly<[number, number, number]>;
}

interface FormationControlState {
  /** Ordered slot map — index → slot. */
  slots: FormationSlot[];
  /** agentId → slot index for O(1) lookup. */
  agentSlotMap: Map<string, number>;
  /** Timestamp (ms) of the last sync. */
  lastSyncMs: number;
  /** Accumulated time since last sync in seconds. */
  accumDt: number;
  /** Monotonically-increasing tick counter. */
  tick: number;
}

interface FormationHSPlusNode extends HSPlusNode {
  __formationControlState?: FormationControlState;
}

// =============================================================================
// Geometry helpers
// =============================================================================

/**
 * Compute local 2-D offsets for each slot, centred on the anchor origin.
 * Returns an array of [x, 0, z] vectors; y is applied separately via y_offset.
 */
function computeSlotOffsets(
  shape: FormationShape,
  spacing: number,
  slotCount: number,
  rotationOffsetRad: number
): ReadonlyArray<[number, number, number]> {
  const raw: [number, number][] = [];

  switch (shape) {
    case 'triangle': {
      // Equilateral-ish triangle: leader at front, two flanks behind
      const rowOffsets: [number, number][] = [
        [0, 0],
        [-spacing, spacing],
        [spacing, spacing],
      ];
      for (let i = 0; i < slotCount; i++) {
        raw.push(rowOffsets[i % rowOffsets.length]);
      }
      break;
    }
    case 'wedge': {
      // Symmetrical V pointing forward; leader at tip
      for (let i = 0; i < slotCount; i++) {
        const side = i % 2 === 0 ? 1 : -1; // alternate left/right
        const depth = Math.ceil(i / 2);
        raw.push([side * depth * spacing * 0.8, depth * spacing]);
      }
      break;
    }
    case 'v': {
      // Like wedge but leader is NOT included in the formation slots —
      // the two arms spread symmetrically behind the anchor.
      for (let i = 0; i < slotCount; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const depth = Math.floor(i / 2) + 1;
        raw.push([side * depth * spacing, depth * spacing]);
      }
      break;
    }
    case 'column': {
      // Single-file line directly behind the anchor along +Z.
      for (let i = 0; i < slotCount; i++) {
        raw.push([0, (i + 1) * spacing]);
      }
      break;
    }
    case 'line': {
      // Side-by-side line perpendicular to the facing direction.
      const halfWidth = ((slotCount - 1) / 2) * spacing;
      for (let i = 0; i < slotCount; i++) {
        raw.push([i * spacing - halfWidth, 0]);
      }
      break;
    }
    case 'circle': {
      // Evenly distributed around the anchor.
      const angleStep = (2 * Math.PI) / Math.max(slotCount, 1);
      for (let i = 0; i < slotCount; i++) {
        const a = i * angleStep;
        raw.push([Math.cos(a) * spacing, Math.sin(a) * spacing]);
      }
      break;
    }
    default: {
      // Fallback to column
      for (let i = 0; i < slotCount; i++) {
        raw.push([0, (i + 1) * spacing]);
      }
    }
  }

  // Apply rotation offset
  const cos = Math.cos(rotationOffsetRad);
  const sin = Math.sin(rotationOffsetRad);
  return raw.map(([x, z]): [number, number, number] => [
    x * cos - z * sin,
    0,
    x * sin + z * cos,
  ]);
}

/**
 * Rebuild the slots array for the given number of members.
 * Preserves existing agent assignments where possible.
 */
function rebuildSlots(
  shape: FormationShape,
  spacing: number,
  memberCount: number,
  rotationOffsetRad: number,
  existingAgentSlotMap: Map<string, number>
): { slots: FormationSlot[]; agentSlotMap: Map<string, number> } {
  const offsets = computeSlotOffsets(shape, spacing, memberCount, rotationOffsetRad);
  const slots: FormationSlot[] = offsets.map((offset, i) => ({
    slotIndex: i,
    agentId: null,
    localOffset: offset,
  }));

  // Re-assign agents that still fit within the new slot count
  const newMap = new Map<string, number>();
  for (const [agentId, slotIdx] of existingAgentSlotMap) {
    if (slotIdx < slots.length) {
      slots[slotIdx].agentId = agentId;
      newMap.set(agentId, slotIdx);
    }
  }

  return { slots, agentSlotMap: newMap };
}

// =============================================================================
// Trait handler
// =============================================================================

export const formationControlHandler: TraitHandler<FormationControlConfig> = {
  name: 'formation_control' as const,

  defaultConfig: {
    shape: 'triangle',
    spacing: 3.0,
    anchor: '',
    sync_rate_hz: 10,
    rotation_offset_rad: 0,
    y_offset: 0,
  },

  onAttach(node: HSPlusNode, config: FormationControlConfig, context: TraitContext): void {
    const state: FormationControlState = {
      slots: [],
      agentSlotMap: new Map(),
      lastSyncMs: Date.now(),
      accumDt: 0,
      tick: 0,
    };

    (node as FormationHSPlusNode).__formationControlState = state;

    context.emit?.('formation_control_attached', {
      nodeId: node.id,
      shape: config.shape,
      spacing: config.spacing,
      anchor: config.anchor,
      sync_rate_hz: config.sync_rate_hz,
      slotCount: state.slots.length,
    });
  },

  onDetach(node: HSPlusNode, _config: FormationControlConfig, _context: TraitContext): void {
    delete (node as FormationHSPlusNode).__formationControlState;
  },

  onUpdate(
    node: HSPlusNode,
    config: FormationControlConfig,
    context: TraitContext,
    delta: number
  ): void {
    if (config.sync_rate_hz <= 0) return;

    const state = (node as FormationHSPlusNode).__formationControlState;
    if (!state) return;

    state.accumDt += delta;
    const periodS = 1 / config.sync_rate_hz;

    if (state.accumDt >= periodS) {
      state.accumDt -= periodS;
      emitTargetPositions(node, config, context, state);
    }
  },

  onEvent(
    node: HSPlusNode,
    config: FormationControlConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = (node as FormationHSPlusNode).__formationControlState;
    if (!state) return;

    switch (event.type) {
      case 'formation:add_agent': {
        const agentId = event.agentId as string | undefined;
        if (!agentId) break;
        if (state.agentSlotMap.has(agentId)) break; // already present

        const slotHint = typeof event.slotHint === 'number' ? event.slotHint : -1;

        // Grow the formation by one slot
        const newSlotCount = state.slots.length + 1;
        const { slots, agentSlotMap } = rebuildSlots(
          config.shape,
          config.spacing,
          newSlotCount,
          config.rotation_offset_rad,
          state.agentSlotMap
        );

        // Assign the new agent to its preferred slot or the first empty one
        let targetSlot = -1;
        if (slotHint >= 0 && slotHint < slots.length && slots[slotHint].agentId === null) {
          targetSlot = slotHint;
        } else {
          for (let i = 0; i < slots.length; i++) {
            if (slots[i].agentId === null) {
              targetSlot = i;
              break;
            }
          }
        }

        if (targetSlot >= 0) {
          slots[targetSlot].agentId = agentId;
          agentSlotMap.set(agentId, targetSlot);
        }

        state.slots = slots;
        state.agentSlotMap = agentSlotMap;

        context.emit?.('formation_control_agent_added', {
          nodeId: node.id,
          agentId,
          slotIndex: targetSlot,
          slotCount: state.slots.length,
        });
        break;
      }

      case 'formation:remove_agent': {
        const agentId = event.agentId as string | undefined;
        if (!agentId) break;

        const slotIdx = state.agentSlotMap.get(agentId);
        if (slotIdx === undefined) break;

        state.agentSlotMap.delete(agentId);
        if (slotIdx < state.slots.length) {
          state.slots[slotIdx].agentId = null;
        }

        context.emit?.('formation_control_agent_removed', {
          nodeId: node.id,
          agentId,
          slotIndex: slotIdx,
          slotCount: state.slots.length,
        });
        break;
      }

      case 'formation:reconfigure': {
        // Merge partial config into current working config (immutable; emit the new state)
        const newShape: FormationShape =
          (event.shape as FormationShape | undefined) ?? config.shape;
        const newSpacing: number = (event.spacing as number | undefined) ?? config.spacing;
        const newAnchor: string = (event.anchor as string | undefined) ?? config.anchor;
        const newRotation: number =
          (event.rotation_offset_rad as number | undefined) ?? config.rotation_offset_rad;

        const { slots, agentSlotMap } = rebuildSlots(
          newShape,
          newSpacing,
          state.slots.length,
          newRotation,
          state.agentSlotMap
        );
        state.slots = slots;
        state.agentSlotMap = agentSlotMap;

        context.emit?.('formation_control_shape_changed', {
          nodeId: node.id,
          shape: newShape,
          spacing: newSpacing,
          anchor: newAnchor,
          rotation_offset_rad: newRotation,
          slotCount: state.slots.length,
        });
        break;
      }

      case 'formation:sync': {
        // Manual sync tick
        emitTargetPositions(node, config, context, state);
        break;
      }

      default:
        break;
    }
  },
};

// =============================================================================
// Helper — emit per-agent target positions
// =============================================================================

function emitTargetPositions(
  node: HSPlusNode,
  config: FormationControlConfig,
  context: TraitContext,
  state: FormationControlState
): void {
  state.tick++;
  state.lastSyncMs = Date.now();

  const targets: Array<{
    agentId: string;
    slotIndex: number;
    localOffset: Readonly<[number, number, number]>;
  }> = [];

  for (const slot of state.slots) {
    if (slot.agentId !== null) {
      targets.push({
        agentId: slot.agentId,
        slotIndex: slot.slotIndex,
        localOffset: [
          slot.localOffset[0],
          slot.localOffset[1] + config.y_offset,
          slot.localOffset[2],
        ],
      });
    }
  }

  context.emit?.('formation_control_updated', {
    nodeId: node.id,
    anchor: config.anchor,
    tick: state.tick,
    targets,
  });
}

export default formationControlHandler;
