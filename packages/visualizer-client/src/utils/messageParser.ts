import type { OrbData } from '../types';

export interface TimeState {
  julianDate: number;
  date: string;
  timeScale: number;
  isPaused: boolean;
}

export interface ParsedInit {
  type: 'init';
  orbs: Map<string, OrbData>;
  time: TimeState | null;
}

export interface ParsedOrbUpdate {
  type: 'orb_update';
  orb: OrbData;
}

export interface ParsedTimeUpdate {
  type: 'time_update';
  time: TimeState;
}

export interface ParsedUnknown {
  type: 'unknown';
  rawType: string;
}

export type ParsedMessage = ParsedInit | ParsedOrbUpdate | ParsedTimeUpdate | ParsedUnknown;

/**
 * Parse a raw WebSocket message string into a typed message.
 * Returns null if JSON parsing fails.
 */
export function parseMessage(raw: string): ParsedMessage | null {
  try {
    const message = JSON.parse(raw);
    const { type, payload, orbs: initialOrbs, time } = message;

    if (type === 'init') {
      const orbMap = new Map<string, OrbData>();
      if (Array.isArray(initialOrbs)) {
        initialOrbs.forEach((orb: OrbData) => orbMap.set(orb.id, orb));
      }
      return { type: 'init', orbs: orbMap, time: time ?? null };
    }

    if (type === 'orb_created' || type === 'orb_update') {
      if (payload?.orb) {
        return { type: 'orb_update', orb: payload.orb };
      }
      return { type: 'unknown', rawType: type };
    }

    if (type === 'time_update') {
      return { type: 'time_update', time: payload };
    }

    return { type: 'unknown', rawType: type ?? 'undefined' };
  } catch {
    return null;
  }
}

/**
 * Apply a parsed message to the current orb map, returning the updated map.
 * Returns null if the message doesn't affect the orb map.
 */
export function applyOrbUpdate(
  current: Map<string, OrbData>,
  message: ParsedMessage,
): Map<string, OrbData> | null {
  if (message.type === 'init') {
    return message.orbs;
  }

  if (message.type === 'orb_update') {
    const next = new Map(current);
    const existing = next.get(message.orb.id);
    next.set(message.orb.id, { ...existing, ...message.orb });
    return next;
  }

  return null;
}
