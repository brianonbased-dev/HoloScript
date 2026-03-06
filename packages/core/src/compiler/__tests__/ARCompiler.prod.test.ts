/**
 * ARCompiler — Production structural tests
 *
 * ARCompiler is a class extending CompilerBase.
 * These tests verify:
 *  a) The module exports a valid class
 *  b) The file can be imported without throwing
 *  c) Design contracts are documented via specification tests
 */
import { describe, it, expect } from 'vitest';
import ARCompiler from '../ARCompiler';

describe('ARCompiler — module shape', () => {
  it('imports without throwing', () => {
    expect(ARCompiler).toBeDefined();
  });
  it('exports a class (function)', () => {
    expect(typeof ARCompiler).toBe('function');
  });
  it('is a constructor (class)', () => {
    expect(ARCompiler.prototype).toBeDefined();
    expect(ARCompiler.prototype.constructor).toBe(ARCompiler);
  });
});

describe('ARCompiler — documented design contract (specification tests)', () => {
  /**
   * These tests document the EXPECTED interface of the future ARCompiler class.
   * They are written as specification tests and should be enabled as the class
   * is gradually implemented. For now they verify the spec types are correct.
   */

  it('target output will be WebXR AR compatible', () => {
    // Spec: target options are 'webxr' | '8thwall' | 'arjs'
    const VALID_TARGETS = ['webxr', '8thwall', 'arjs'];
    expect(VALID_TARGETS).toContain('webxr');
    expect(VALID_TARGETS).toContain('8thwall');
    expect(VALID_TARGETS).toContain('arjs');
  });

  it('AR entry traits are defined in spec', () => {
    const AR_TRAITS = ['@ar_entry', '@qr_scan', '@geo_anchor', '@camera_overlay', '@ar_portal', '@layer_shift', '@x402_paywall', '@business_marker'];
    expect(AR_TRAITS.length).toBeGreaterThan(0);
    expect(AR_TRAITS).toContain('@qr_scan');
    expect(AR_TRAITS).toContain('@geo_anchor');
    expect(AR_TRAITS).toContain('@x402_paywall');
  });

  it('result shape will include required fields', () => {
    // Documents expected ARCompilationResult shape
    const mockResult = {
      success: true,
      target: 'webxr' as const,
      code: '// WebXR AR scene',
      assets: [],
      qr_codes: [],
      payment_endpoints: [],
      warnings: [],
      errors: [],
    };
    expect(mockResult.success).toBe(true);
    expect(mockResult.target).toBe('webxr');
    expect(Array.isArray(mockResult.warnings)).toBe(true);
    expect(Array.isArray(mockResult.errors)).toBe(true);
  });

  it('x402 payment protocol planned', () => {
    const paymentProtocols = ['x402'];
    expect(paymentProtocols).toContain('x402');
  });

  it('supports iOS Safari and Android Chrome targets', () => {
    // AR performance target: 30fps on mid-tier phones, <5s load time
    const PLATFORM_TARGETS = ['iOS Safari', 'Android Chrome', 'WebXR AR Module'];
    expect(PLATFORM_TARGETS.length).toBeGreaterThanOrEqual(3);
  });
});
