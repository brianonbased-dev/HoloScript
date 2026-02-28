/**
 * theme-park.scenario.ts — LIVING-SPEC: Theme Park Designer
 *
 * Persona: Sam — Imagineer who designs roller coasters, optimizes
 * queue flows, and balances thrill levels across park sections.
 */

import { describe, it, expect } from 'vitest';
import {
  velocityFromDrop, gForceInLoop, gForceInBank, isSafeGForce,
  totalRideDuration, peakGForce, peakSpeed,
  estimatedWaitMinutes, dailyThroughput, canRide,
  parkCapacity, thrillScore,
  type RideProfile, type RideSegment, type ParkSection,
} from '@/lib/themeParkDesigner';

describe('Scenario: Theme Park — Ride Physics', () => {
  it('50m drop → ≈ 113 km/h', () => {
    const v = velocityFromDrop(50);
    expect(v).toBeCloseTo(113, -1);
  });

  it('30m drop produces less speed than 50m', () => {
    expect(velocityFromDrop(30)).toBeLessThan(velocityFromDrop(50));
  });

  it('gForceInLoop at 80km/h, 10m radius ≈ 6G', () => {
    const g = gForceInLoop(80, 10);
    expect(g).toBeGreaterThan(5);
    expect(g).toBeLessThan(7);
  });

  it('gForceInBank at 60km/h, 20m, 45° bank', () => {
    const g = gForceInBank(60, 20, 45);
    expect(g).toBeGreaterThan(1);
  });

  it('isSafeGForce: 4G = safe, 7G = unsafe', () => {
    expect(isSafeGForce(4)).toBe(true);
    expect(isSafeGForce(7)).toBe(false);
  });

  it('negative G beyond -1 is unsafe', () => {
    expect(isSafeGForce(-0.5)).toBe(true);
    expect(isSafeGForce(-1.5)).toBe(false);
  });
});

describe('Scenario: Theme Park — Ride Segments', () => {
  const segments: RideSegment[] = [
    { id: 'r1', name: 'Lift Hill', velocityKmh: 10, heightM: 40, gForce: 1, bankAngleDeg: 0, durationSec: 30 },
    { id: 'r2', name: 'First Drop', velocityKmh: 100, heightM: 0, gForce: 3.5, bankAngleDeg: 0, durationSec: 5 },
    { id: 'r3', name: 'Loop', velocityKmh: 90, heightM: 25, gForce: 5.2, bankAngleDeg: 0, durationSec: 4 },
    { id: 'r4', name: 'Brakes', velocityKmh: 20, heightM: 2, gForce: 0.5, bankAngleDeg: 0, durationSec: 8 },
  ];

  it('totalRideDuration = 47 seconds', () => {
    expect(totalRideDuration(segments)).toBe(47);
  });

  it('peakGForce = 5.2 (loop)', () => {
    expect(peakGForce(segments)).toBe(5.2);
  });

  it('peakSpeed = 100 km/h (first drop)', () => {
    expect(peakSpeed(segments)).toBe(100);
  });
});

describe('Scenario: Theme Park — Queues & Capacity', () => {
  it('estimatedWaitMinutes: 300 guests, 1200/hr, 20% fastpass = 18.75 min', () => {
    expect(estimatedWaitMinutes(300, 1200, 0.2)).toBeCloseTo(18.75, 0);
  });

  it('dailyThroughput: 1200/hr × 12 hrs = 14400', () => {
    const ride: RideProfile = { id: '', name: '', type: 'coaster', thrillLevel: 'thrill', topSpeedKmh: 100, heightM: 40, maxGForce: 5, durationSec: 90, capacityPerHour: 1200, minHeightCm: 120 };
    expect(dailyThroughput(ride, 12)).toBe(14400);
  });

  it('canRide: 130cm guest on 120cm min ride = true', () => {
    const ride: RideProfile = { id: '', name: '', type: 'coaster', thrillLevel: 'thrill', topSpeedKmh: 100, heightM: 40, maxGForce: 5, durationSec: 90, capacityPerHour: 1200, minHeightCm: 120 };
    expect(canRide(ride, 130)).toBe(true);
    expect(canRide(ride, 110)).toBe(false);
  });

  it('parkCapacity sums all sections', () => {
    const sections: ParkSection[] = [
      { id: 's1', name: 'Adventureland', theme: 'jungle', rides: [], restaurants: 3, restrooms: 2, capacity: 5000 },
      { id: 's2', name: 'Tomorrowland', theme: 'space', rides: [], restaurants: 4, restrooms: 3, capacity: 6000 },
    ];
    expect(parkCapacity(sections)).toBe(11000);
  });

  it('thrillScore reflects speed + height + gForce', () => {
    const family: RideProfile = { id: '', name: '', type: 'dark-ride', thrillLevel: 'family', topSpeedKmh: 15, heightM: 5, maxGForce: 1, durationSec: 180, capacityPerHour: 2000, minHeightCm: 90 };
    const extreme: RideProfile = { id: '', name: '', type: 'coaster', thrillLevel: 'extreme', topSpeedKmh: 150, heightM: 80, maxGForce: 5, durationSec: 120, capacityPerHour: 1200, minHeightCm: 140 };
    expect(thrillScore(extreme)).toBeGreaterThan(thrillScore(family));
  });

  it.todo('crowd flow simulation — agent-based movement through park');
  it.todo('VR ride overlay — mixed reality enhancements on physical rides');
});
