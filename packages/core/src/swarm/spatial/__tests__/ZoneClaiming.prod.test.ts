import { describe, it, expect, vi } from 'vitest';
import { ZoneClaiming } from '../ZoneClaiming';
import { Vector3 } from '../Vector3';

// ─── helpers ────────────────────────────────────────────────────────────────

function mkZC(cfg?: ConstructorParameters<typeof ZoneClaiming>[0]) {
  return new ZoneClaiming(cfg);
}

function v(x: number, y = 0, z = 0) { return new Vector3(x, y, z); }

function makeZone(zc: ZoneClaiming, id = 'z1', center = v(0), radius = 10) {
  return zc.createZone(id, center, radius);
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('ZoneClaiming — defaultConfig', () => {
  it('claimThreshold = 0.3', () => expect(mkZC().getConfig().claimThreshold).toBe(0.3));
  it('captureThreshold = 0.7', () => expect(mkZC().getConfig().captureThreshold).toBe(0.7));
  it('strengthDecayRate = 0.05', () => expect(mkZC().getConfig().strengthDecayRate).toBe(0.05));
  it('reinforceRate = 0.1', () => expect(mkZC().getConfig().reinforceRate).toBe(0.1));
  it('defenseBonus = 0.15', () => expect(mkZC().getConfig().defenseBonus).toBe(0.15));
});

describe('ZoneClaiming — zone CRUD', () => {
  it('createZone stores zone', () => {
    const zc = mkZC();
    zc.createZone('z1', v(0), 10);
    expect(zc.getZone('z1')).toBeDefined();
  });
  it('createZone initial state = unclaimed', () => {
    const zc = mkZC();
    zc.createZone('z2', v(0), 10);
    expect(zc.getZone('z2')!.state).toBe('unclaimed');
  });
  it('createZone sets value', () => {
    const zc = mkZC();
    zc.createZone('z3', v(0), 10, { value: 5 });
    expect(zc.getZone('z3')!.value).toBe(5);
  });
  it('createZone default value = 1', () => {
    const zc = mkZC();
    makeZone(zc);
    expect(zc.getZone('z1')!.value).toBe(1);
  });
  it('removeZone returns true', () => {
    const zc = mkZC();
    makeZone(zc);
    expect(zc.removeZone('z1')).toBe(true);
  });
  it('removeZone deletes zone', () => {
    const zc = mkZC();
    makeZone(zc);
    zc.removeZone('z1');
    expect(zc.getZone('z1')).toBeUndefined();
  });
  it('removeZone missing id returns false', () => {
    expect(mkZC().removeZone('nope')).toBe(false);
  });
  it('getAllZones returns all', () => {
    const zc = mkZC();
    zc.createZone('a', v(0), 5); zc.createZone('b', v(10), 5);
    expect(zc.getAllZones()).toHaveLength(2);
  });
});

describe('ZoneClaiming — spatial queries', () => {
  it('findZonesAt finds overlapping zone', () => {
    const zc = mkZC();
    makeZone(zc, 'z1', v(0), 10);
    expect(zc.findZonesAt(v(5))).toHaveLength(1);
  });
  it('findZonesAt excludes non-overlapping zones', () => {
    const zc = mkZC();
    makeZone(zc, 'z1', v(0), 5);
    expect(zc.findZonesAt(v(100))).toHaveLength(0);
  });
  it('isAgentInZone true when inside', () => {
    const zc = mkZC();
    makeZone(zc, 'z1', v(0), 10);
    expect(zc.isAgentInZone('a1', 'z1', v(5))).toBe(true);
  });
  it('isAgentInZone false when outside', () => {
    const zc = mkZC();
    makeZone(zc, 'z1', v(0), 5);
    expect(zc.isAgentInZone('a1', 'z1', v(100))).toBe(false);
  });
});

describe('ZoneClaiming — claimZone', () => {
  it('creates a claim', () => {
    const zc = mkZC();
    makeZone(zc);
    zc.claimZone('agent1', 'z1', { strength: 0.5 });
    expect(zc.getClaimStrength('agent1', 'z1')).toBeCloseTo(0.5, 5);
  });
  it('reinforces existing claim', () => {
    const zc = mkZC();
    makeZone(zc);
    zc.claimZone('a', 'z1', { strength: 0.3 });
    zc.claimZone('a', 'z1', { strength: 0.3 });
    expect(zc.getClaimStrength('a', 'z1')).toBeCloseTo(0.6, 5);
  });
  it('returns null for missing zone', () => {
    expect(mkZC().claimZone('a', 'nonexistent')).toBeNull();
  });
  it('zone state = claimed after sufficient strength', () => {
    const zc = mkZC({ claimThreshold: 0.3, captureThreshold: 0.7 });
    makeZone(zc);
    zc.claimZone('a', 'z1', { strength: 0.8 });
    expect(zc.getZone('z1')!.state).toBe('claimed');
  });
  it('zone owner set after claim', () => {
    const zc = mkZC({ captureThreshold: 0.5 });
    makeZone(zc);
    zc.claimZone('agent1', 'z1', { strength: 0.9 });
    expect(zc.getZone('z1')!.owner).toBe('agent1');
  });
  it('zone = contested when two agents have similar strength', () => {
    const zc = mkZC({ claimThreshold: 0.1, captureThreshold: 0.9 });
    makeZone(zc);
    zc.claimZone('a', 'z1', { strength: 0.5 });
    zc.claimZone('b', 'z1', { strength: 0.4 });
    // secondStrength (0.4) >= highestStrength (0.5) * 0.5 → contested
    expect(zc.getZone('z1')!.state).toBe('contested');
  });
  it('getAgentClaims returns zones agent has claims in', () => {
    const zc = mkZC();
    zc.createZone('z1', v(0), 5); zc.createZone('z2', v(10), 5);
    zc.claimZone('ag', 'z1', { strength: 0.5 });
    zc.claimZone('ag', 'z2', { strength: 0.5 });
    expect(zc.getAgentClaims('ag')).toHaveLength(2);
  });
});

describe('ZoneClaiming — releaseClaim', () => {
  it('release removes claim', () => {
    const zc = mkZC();
    makeZone(zc);
    zc.claimZone('a', 'z1', { strength: 0.5 });
    zc.releaseClaim('a', 'z1');
    expect(zc.getClaimStrength('a', 'z1')).toBe(0);
  });
  it('release on missing zone returns false', () => {
    expect(mkZC().releaseClaim('a', 'nope')).toBe(false);
  });
  it('release on missing claim returns false', () => {
    const zc = mkZC(); makeZone(zc);
    expect(zc.releaseClaim('nobody', 'z1')).toBe(false);
  });
  it('release by owner emits abandoned event', () => {
    const zc = mkZC({ captureThreshold: 0.5 });
    makeZone(zc);
    zc.claimZone('owner', 'z1', { strength: 0.9 });
    const events: any[] = [];
    zc.onEvent(e => events.push(e));
    zc.releaseClaim('owner', 'z1');
    expect(events.some(e => e.type === 'abandoned')).toBe(true);
  });
});

describe('ZoneClaiming — events', () => {
  it('onEvent fires claimed event when zone first captured', () => {
    const zc = mkZC({ captureThreshold: 0.5 });
    makeZone(zc);
    const events: any[] = [];
    zc.onEvent(e => events.push(e));
    zc.claimZone('agent', 'z1', { strength: 0.9 });
    expect(events.some(e => e.type === 'claimed')).toBe(true);
  });
  it('onEvent unsubscribe stops receiving events', () => {
    const zc = mkZC({ captureThreshold: 0.5 });
    makeZone(zc);
    const events: any[] = [];
    const unsub = zc.onEvent(e => events.push(e));
    unsub();
    zc.claimZone('agent', 'z1', { strength: 0.9 });
    expect(events).toHaveLength(0);
  });
});

describe('ZoneClaiming — applyDecay', () => {
  it('decays claim strength over time', () => {
    const zc = mkZC({ strengthDecayRate: 0.1 });
    makeZone(zc);
    zc.claimZone('a', 'z1', { strength: 0.5 });
    zc.applyDecay(1); // 1 second → -0.1
    expect(zc.getClaimStrength('a', 'z1')).toBeCloseTo(0.4, 5);
  });
  it('removes claim when strength reaches 0', () => {
    const zc = mkZC({ strengthDecayRate: 1 });
    makeZone(zc);
    zc.claimZone('a', 'z1', { strength: 0.5 });
    zc.applyDecay(1); // strength → -0.5 → removed
    expect(zc.getClaimStrength('a', 'z1')).toBe(0);
  });
});

describe('ZoneClaiming — statistics', () => {
  it('getStatistics returns total count', () => {
    const zc = mkZC();
    zc.createZone('z1', v(0), 5); zc.createZone('z2', v(10), 5);
    expect(zc.getStatistics().total).toBe(2);
  });
  it('getStatistics counts unclaimed', () => {
    const zc = mkZC();
    makeZone(zc);
    expect(zc.getStatistics().unclaimed).toBe(1);
  });
  it('getTotalValue sums owned zone values', () => {
    const zc = mkZC({ captureThreshold: 0.5 });
    zc.createZone('z1', v(0), 5, { value: 3 });
    zc.createZone('z2', v(10), 5, { value: 7 });
    zc.claimZone('owner', 'z1', { strength: 0.9 });
    zc.claimZone('owner', 'z2', { strength: 0.9 });
    expect(zc.getTotalValue('owner')).toBe(10);
  });
  it('getContestedZones only returns contested', () => {
    const zc = mkZC({ claimThreshold: 0.1, captureThreshold: 0.9 });
    makeZone(zc);
    zc.claimZone('a', 'z1', { strength: 0.5 });
    zc.claimZone('b', 'z1', { strength: 0.4 });
    expect(zc.getContestedZones()).toHaveLength(1);
  });
  it('getUnclaimedZones returns unclaimed', () => {
    const zc = mkZC();
    makeZone(zc);
    expect(zc.getUnclaimedZones()).toHaveLength(1);
  });
  it('getZonesByState filters by state', () => {
    const zc = mkZC({ captureThreshold: 0.5 });
    zc.createZone('z1', v(0), 5); zc.createZone('z2', v(10), 5);
    zc.claimZone('a', 'z1', { strength: 0.9 });
    expect(zc.getZonesByState('claimed')).toHaveLength(1);
    expect(zc.getZonesByState('unclaimed')).toHaveLength(1);
  });
});
