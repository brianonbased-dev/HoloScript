import { describe, it, expect } from 'vitest';
import { formatSpeed, statusLabel, statusColor, distanceFromOrigin } from '../format';

describe('formatSpeed', () => {
  it('formats 365.25 as year-per-day label', () => {
    expect(formatSpeed(365.25)).toBe('1Y/24H');
  });

  it('formats 1000 as 1k', () => {
    expect(formatSpeed(1000)).toBe('1k');
  });

  it('formats 10000 as 10k', () => {
    expect(formatSpeed(10000)).toBe('10k');
  });

  it('formats small values as plain number string', () => {
    expect(formatSpeed(1)).toBe('1');
    expect(formatSpeed(10)).toBe('10');
    expect(formatSpeed(100)).toBe('100');
  });
});

describe('statusLabel', () => {
  it('returns SYSTEM ONLINE for connected', () => {
    expect(statusLabel('connected')).toBe('SYSTEM ONLINE');
  });

  it('returns SYNCING... for connecting', () => {
    expect(statusLabel('connecting')).toBe('SYNCING...');
  });

  it('returns CORE ERROR for error', () => {
    expect(statusLabel('error')).toBe('CORE ERROR');
  });

  it('returns OFFLINE for disconnected and unknown', () => {
    expect(statusLabel('disconnected')).toBe('OFFLINE');
    expect(statusLabel('anything-else')).toBe('OFFLINE');
  });
});

describe('statusColor', () => {
  it('returns green for connected', () => {
    expect(statusColor('connected')).toBe('#00ff00');
  });

  it('returns amber for connecting', () => {
    expect(statusColor('connecting')).toBe('#ffaa00');
  });

  it('returns red for disconnected/error/unknown', () => {
    expect(statusColor('disconnected')).toBe('#ff0000');
    expect(statusColor('error')).toBe('#ff0000');
  });
});

describe('distanceFromOrigin', () => {
  it('returns 0 for origin', () => {
    expect(distanceFromOrigin({ x: 0, y: 0, z: 0 })).toBe(0);
  });

  it('computes correct distance for unit axes', () => {
    expect(distanceFromOrigin({ x: 1, y: 0, z: 0 })).toBeCloseTo(1);
    expect(distanceFromOrigin({ x: 0, y: 1, z: 0 })).toBeCloseTo(1);
    expect(distanceFromOrigin({ x: 0, y: 0, z: 1 })).toBeCloseTo(1);
  });

  it('computes correct distance for 3-4-5 triangle variant', () => {
    // sqrt(3^2 + 4^2 + 0^2) = 5
    expect(distanceFromOrigin({ x: 3, y: 4, z: 0 })).toBeCloseTo(5);
  });

  it('handles negative coordinates', () => {
    const d = distanceFromOrigin({ x: -3, y: -4, z: 0 });
    expect(d).toBeCloseTo(5);
  });
});
