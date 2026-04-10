import { describe, it, expect } from 'vitest';
import { RevenueSplitter } from '../economy/RevenueSplitter';

describe('RevenueSplitter', () => {
  it('splits 50/50 correctly', () => {
    const splitter = new RevenueSplitter([
      { id: 'creator', basisPoints: 5000 },
      { id: 'platform', basisPoints: 5000 },
    ]);
    const result = splitter.split(1_000_000n);
    expect(result.shares.get('creator')).toBe(500_000n);
    expect(result.shares.get('platform')).toBe(500_000n);
    expect(RevenueSplitter.validate(result)).toBe(true);
  });

  it('splits with dust allocation to first recipient', () => {
    const splitter = new RevenueSplitter([
      { id: 'creator', basisPoints: 3333 },
      { id: 'platform', basisPoints: 3334 },
      { id: 'referrer', basisPoints: 3333 },
    ]);
    const result = splitter.split(100n);
    // Sum must equal 100
    let sum = 0n;
    for (const v of result.shares.values()) sum += v;
    expect(sum).toBe(100n);
    expect(RevenueSplitter.validate(result)).toBe(true);
  });

  it('handles zero amount', () => {
    const splitter = new RevenueSplitter([
      { id: 'a', basisPoints: 7000 },
      { id: 'b', basisPoints: 3000 },
    ]);
    const result = splitter.split(0n);
    expect(result.shares.get('a')).toBe(0n);
    expect(result.shares.get('b')).toBe(0n);
    expect(RevenueSplitter.validate(result)).toBe(true);
  });

  it('throws on basis points not summing to 10000', () => {
    expect(
      () =>
        new RevenueSplitter([
          { id: 'a', basisPoints: 5000 },
          { id: 'b', basisPoints: 4000 },
        ])
    ).toThrow('sum to 10000');
  });

  it('throws on empty recipients', () => {
    expect(() => new RevenueSplitter([])).toThrow('At least one');
  });

  it('throws on negative basis points', () => {
    expect(
      () =>
        new RevenueSplitter([
          { id: 'a', basisPoints: -1000 },
          { id: 'b', basisPoints: 11000 },
        ])
    ).toThrow('Negative');
  });

  it('throws on duplicate IDs', () => {
    expect(
      () =>
        new RevenueSplitter([
          { id: 'a', basisPoints: 5000 },
          { id: 'a', basisPoints: 5000 },
        ])
    ).toThrow('Duplicate');
  });

  it('throws on negative amount', () => {
    const splitter = new RevenueSplitter([{ id: 'a', basisPoints: 10000 }]);
    expect(() => splitter.split(-1n)).toThrow('negative');
  });

  it('splitNumeric works as convenience wrapper', () => {
    const splitter = new RevenueSplitter([
      { id: 'creator', basisPoints: 8000 },
      { id: 'platform', basisPoints: 2000 },
    ]);
    const result = splitter.splitNumeric(1_000_000);
    expect(result.shares.get('creator')).toBe(800_000n);
    expect(result.shares.get('platform')).toBe(200_000n);
  });

  it('provides breakdown with percentages', () => {
    const splitter = new RevenueSplitter([
      { id: 'creator', basisPoints: 7000 },
      { id: 'platform', basisPoints: 3000 },
    ]);
    const result = splitter.split(1_000_000n);
    expect(result.breakdown).toHaveLength(2);
    expect(result.breakdown[0].percentage).toBe('70.00%');
    expect(result.breakdown[1].percentage).toBe('30.00%');
  });

  it('getRecipients returns configured recipients', () => {
    const splitter = new RevenueSplitter([
      { id: 'a', basisPoints: 6000 },
      { id: 'b', basisPoints: 4000 },
    ]);
    const recipients = splitter.getRecipients();
    expect(recipients).toHaveLength(2);
    expect(recipients[0].id).toBe('a');
  });

  it('maintains sum invariant for large amounts', () => {
    const splitter = new RevenueSplitter([
      { id: 'creator', basisPoints: 3333 },
      { id: 'platform', basisPoints: 1667 },
      { id: 'referrer', basisPoints: 2500 },
      { id: 'treasury', basisPoints: 2500 },
    ]);
    const result = splitter.split(999_999_999_999n);
    expect(RevenueSplitter.validate(result)).toBe(true);
  });
});
