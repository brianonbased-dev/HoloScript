/**
 * Regression test: W.025 — protocol-tools dynamic import exports
 *
 * Ensures that all symbols used in the `await import('@holoscript/core')` call
 * inside protocol-tools.ts are actually present in the @holoscript/core build.
 * If any of these are missing, the tool handler silently returns wrong data
 * at runtime.
 */
import { describe, it, expect } from 'vitest';
import {
  generateProvenance,
  calculateRevenueDistribution,
  formatRevenueDistribution,
  ethToWei,
  weiToEth,
  PROTOCOL_CONSTANTS,
  parse,
} from '@holoscript/core';

describe('protocol-tools required exports from @holoscript/core', () => {
  it('exports ethToWei as a function', () => {
    expect(typeof ethToWei).toBe('function');
  });

  it('converts ETH to wei correctly', () => {
    expect(ethToWei('1')).toBe('1000000000000000000');
    expect(ethToWei('0.000777')).toBe('777000000000000');
  });

  it('exports weiToEth as a function', () => {
    expect(typeof weiToEth).toBe('function');
  });

  it('exports generateProvenance as a function', () => {
    expect(typeof generateProvenance).toBe('function');
  });

  it('exports calculateRevenueDistribution as a function', () => {
    expect(typeof calculateRevenueDistribution).toBe('function');
  });

  it('exports formatRevenueDistribution as a function', () => {
    expect(typeof formatRevenueDistribution).toBe('function');
  });

  it('exports PROTOCOL_CONSTANTS with expected fields', () => {
    expect(PROTOCOL_CONSTANTS).toBeDefined();
    expect(typeof PROTOCOL_CONSTANTS.PLATFORM_FEE_BPS).toBe('number');
    expect(typeof PROTOCOL_CONSTANTS.IMPORT_ROYALTY_BPS).toBe('number');
  });

  it('exports parse as a function', () => {
    expect(typeof parse).toBe('function');
  });

  it('parse handles a simple composition', () => {
    const result = parse('composition "Test" {}');
    expect(result).toBeDefined();
  });
});
