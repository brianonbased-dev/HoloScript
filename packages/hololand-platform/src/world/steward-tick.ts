/**
 * Steward Tick — advances autonomous world state when no human is present.
 *
 * The steward tick is the heartbeat of a HoloLand shard: it increments the
 * world clock, evaluates NPC schedules, and emits a verifiable receipt for
 * every tick so the runtime can prove the world advanced even with zero
 * players connected.
 */

export interface NPCScheduleEntry {
  npcId: string;
  nextTick: number;
  interval: number;
}

export interface RuntimeZoneState {
  zoneId: string;
  tick: number;
  worldClock: number;
  playerCount: number;
  npcSchedules: NPCScheduleEntry[];
}

export interface StewardTickReceipt {
  tick: number;
  zoneId: string;
  worldClock: number;
  playerCount: number;
  events: string[];
  timestamp: number;
}

export interface StewardTickResult {
  state: RuntimeZoneState;
  receipt: StewardTickReceipt;
}

/**
 * Advance a zone by one steward tick.
 *
 * Rules:
 * - tick increments monotonically
 * - worldClock increments by 1 unit per tick
 * - NPC schedules fire when tick >= nextTick, then reschedule by interval
 * - A receipt is emitted capturing every event so the runtime can audit it
 */
export function stewardTick(state: RuntimeZoneState): StewardTickResult {
  const nextTick = state.tick + 1;
  const nextClock = state.worldClock + 1;
  const events: string[] = [];

  events.push(`world-clock-advanced:${nextClock}`);

  const updatedSchedules: NPCScheduleEntry[] = [];
  for (const sched of state.npcSchedules) {
    if (nextTick >= sched.nextTick) {
      events.push(`npc-action:${sched.npcId}`);
      updatedSchedules.push({
        ...sched,
        nextTick: sched.nextTick + sched.interval,
      });
    } else {
      updatedSchedules.push({ ...sched });
    }
  }

  const nextState: RuntimeZoneState = {
    ...state,
    tick: nextTick,
    worldClock: nextClock,
    npcSchedules: updatedSchedules,
  };

  const receipt: StewardTickReceipt = {
    tick: nextTick,
    zoneId: state.zoneId,
    worldClock: nextClock,
    playerCount: state.playerCount,
    events,
    timestamp: Date.now(),
  };

  return { state: nextState, receipt };
}

/**
 * Run N steward ticks in sequence, returning the final state and all receipts.
 */
export function stewardTickN(
  state: RuntimeZoneState,
  n: number
): { state: RuntimeZoneState; receipts: StewardTickReceipt[] } {
  let current = state;
  const receipts: StewardTickReceipt[] = [];
  for (let i = 0; i < n; i++) {
    const result = stewardTick(current);
    current = result.state;
    receipts.push(result.receipt);
  }
  return { state: current, receipts };
}
