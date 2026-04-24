import { describe, it, expect } from 'vitest';
import { parseMessage, applyOrbUpdate } from '../messageParser';
import type { OrbData } from '../../types';

function makeOrb(id: string, name: string, x = 0, y = 0, z = 0): OrbData {
  return {
    id,
    name,
    position: { x, y, z },
    properties: {},
  };
}

describe('parseMessage', () => {
  it('returns null for invalid JSON', () => {
    expect(parseMessage('not json')).toBeNull();
    expect(parseMessage('')).toBeNull();
    expect(parseMessage('{broken')).toBeNull();
  });

  it('parses init message with orbs', () => {
    const raw = JSON.stringify({
      type: 'init',
      orbs: [makeOrb('sun', 'Sun'), makeOrb('earth', 'Earth', 1, 0, 0)],
      time: { julianDate: 2460000, date: '2026-04-02', timeScale: 1, isPaused: false },
    });
    const result = parseMessage(raw);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('init');
    if (result!.type === 'init') {
      expect(result.orbs.size).toBe(2);
      expect(result.orbs.get('sun')?.name).toBe('Sun');
      expect(result.orbs.get('earth')?.position.x).toBe(1);
      expect(result.time?.julianDate).toBe(2460000);
    }
  });

  it('parses init message without time', () => {
    const raw = JSON.stringify({
      type: 'init',
      orbs: [makeOrb('a', 'Alpha')],
    });
    const result = parseMessage(raw);
    expect(result?.type).toBe('init');
    if (result?.type === 'init') {
      expect(result.time).toBeNull();
    }
  });

  it('parses orb_update message', () => {
    const raw = JSON.stringify({
      type: 'orb_update',
      payload: { orb: makeOrb('mars', 'Mars', 1.5, 0, 0) },
    });
    const result = parseMessage(raw);
    expect(result?.type).toBe('orb_update');
    if (result?.type === 'orb_update') {
      expect(result.orb.id).toBe('mars');
      expect(result.orb.position.x).toBe(1.5);
    }
  });

  it('parses orb_created message as orb_update type', () => {
    const raw = JSON.stringify({
      type: 'orb_created',
      payload: { orb: makeOrb('venus', 'Venus') },
    });
    const result = parseMessage(raw);
    expect(result?.type).toBe('orb_update');
  });

  it('returns unknown for orb_update without payload.orb', () => {
    const raw = JSON.stringify({ type: 'orb_update', payload: {} });
    const result = parseMessage(raw);
    expect(result?.type).toBe('unknown');
  });

  it('parses time_update message', () => {
    const raw = JSON.stringify({
      type: 'time_update',
      payload: { julianDate: 2460001, date: '2026-04-03', timeScale: 10, isPaused: true },
    });
    const result = parseMessage(raw);
    expect(result?.type).toBe('time_update');
    if (result?.type === 'time_update') {
      expect(result.time.isPaused).toBe(true);
      expect(result.time.timeScale).toBe(10);
    }
  });

  it('returns unknown for unrecognized message types', () => {
    const raw = JSON.stringify({ type: 'custom_event', data: 42 });
    const result = parseMessage(raw);
    expect(result?.type).toBe('unknown');
    if (result?.type === 'unknown') {
      expect(result.rawType).toBe('custom_event');
    }
  });
});

describe('applyOrbUpdate', () => {
  it('replaces entire map on init', () => {
    const existing = new Map<string, OrbData>();
    existing.set('old', makeOrb('old', 'Old'));

    const initMsg = parseMessage(
      JSON.stringify({ type: 'init', orbs: [makeOrb('new', 'New')] }),
    )!;
    const result = applyOrbUpdate(existing, initMsg);

    expect(result).not.toBeNull();
    expect(result!.size).toBe(1);
    expect(result!.has('new')).toBe(true);
    expect(result!.has('old')).toBe(false);
  });

  it('merges orb_update into existing map', () => {
    const existing = new Map<string, OrbData>();
    existing.set('earth', makeOrb('earth', 'Earth', 0, 0, 0));

    const updateMsg = parseMessage(
      JSON.stringify({
        type: 'orb_update',
        // Use the {x,y,z} form consistently with makeOrb() + the file's other
        // tests. parseMessage passes payload.orb through unchanged, so the
        // inline payload shape must match the shape the assertions expect.
        payload: { orb: { id: 'earth', name: 'Earth', position: { x: 1, y: 0, z: 0 }, properties: {} } },
      }),
    )!;
    const result = applyOrbUpdate(existing, updateMsg);

    expect(result).not.toBeNull();
    expect(result!.get('earth')?.position.x).toBe(1);
  });

  it('adds new orb via orb_update', () => {
    const existing = new Map<string, OrbData>();
    const updateMsg = parseMessage(
      JSON.stringify({
        type: 'orb_created',
        payload: { orb: makeOrb('jupiter', 'Jupiter', 5, 0, 0) },
      }),
    )!;
    const result = applyOrbUpdate(existing, updateMsg);
    expect(result!.get('jupiter')?.name).toBe('Jupiter');
  });

  it('returns null for time_update (no orb change)', () => {
    const existing = new Map<string, OrbData>();
    const timeMsg = parseMessage(
      JSON.stringify({
        type: 'time_update',
        payload: { julianDate: 0, date: '', timeScale: 1, isPaused: false },
      }),
    )!;
    const result = applyOrbUpdate(existing, timeMsg);
    expect(result).toBeNull();
  });

  it('does not mutate the original map on update', () => {
    const existing = new Map<string, OrbData>();
    existing.set('a', makeOrb('a', 'A'));

    const updateMsg = parseMessage(
      JSON.stringify({
        type: 'orb_update',
        payload: { orb: makeOrb('a', 'A-updated', 99, 0, 0) },
      }),
    )!;
    const result = applyOrbUpdate(existing, updateMsg);

    // Original unchanged
    expect(existing.get('a')?.position.x).toBe(0);
    // New map has update
    expect(result!.get('a')?.position.x).toBe(99);
  });
});
