/**
 * Tests for CodebaseTrustGate (HoloLand World Build Cockpit)
 *
 * First slice verification for task_1779267196745_rhwb
 */

import { describe, it, expect } from 'vitest';
import { renderCodebaseTrustGate, type CodebaseTrustGateProps } from './codebase-trust-gate';

describe('CodebaseTrustGate', () => {
  const baseProps: CodebaseTrustGateProps = {
    worldId: 'world_abc123',
    jepaVerified: true,
    trustScore: 92,
    receiptCount: 17,
    solverType: 'gazebo+ros2',
    lastVerifiedAt: '2026-05-20T18:50:00Z',
  };

  it('returns trusted state for high trust + JEPA verified + receipts', () => {
    const result = renderCodebaseTrustGate(baseProps);
    expect(result.status).toBe('trusted');
    expect(result.badge).toContain('JEPA + Receipt Verified');
    expect(result.deepLink).toContain('holomesh.public');
    expect(result.actions.length).toBeGreaterThan(0);
  });

  it('returns warning for medium trust', () => {
    const result = renderCodebaseTrustGate({ ...baseProps, trustScore: 65, jepaVerified: false });
    expect(result.status).toBe('warning');
    expect(result.badge).toContain('Partial Verification');
  });

  it('returns unverified for low trust or no receipts', () => {
    const result = renderCodebaseTrustGate({ ...baseProps, trustScore: 30, receiptCount: 0, jepaVerified: false });
    expect(result.status).toBe('unverified');
    expect(result.actions.some(a => a.includes('Generate SimulationContract'))).toBe(true);
  });

  it('includes deep link to D.055 public surface for the world', () => {
    const result = renderCodebaseTrustGate(baseProps);
    expect(result.deepLink).toMatch(/holomesh\.public.*receipts/);
  });
});