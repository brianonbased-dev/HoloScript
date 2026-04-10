/**
 * nonspatial.scenario.ts — LIVING-SPEC: NonSpatial Web Developer
 *
 * Persona: Avery — a traditional MERN/NextJS developer testing out HoloScript,
 * trying to map stateless HTTP REST logic to Spatial CRDT updates.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateSpatialSyncLatency,
  estimateStateMutationCost,
  validateSpatialMapping,
  type RouteEndpoint,
} from '@/lib/nonspatialScenario';

describe('Scenario: NonSpatial Developer', () => {
  const endpoints: RouteEndpoint[] = [
    { path: '/api/v1/ping', method: 'GET', dataPayloadKb: 0.1 },
    { path: 'ws://crdt-sync', method: 'WS', dataPayloadKb: 2.0 },
    { path: '/api/v1/huge-dump', method: 'GET', dataPayloadKb: 1024.0 }, // 1MB
  ];

  it('calculates latency across architectures for 1000 users', () => {
    // Monolith: 45 + (1000 * 0.5) = 545
    expect(calculateSpatialSyncLatency('monolith', 1000)).toBe(545);

    // Serverless: 45 + 150 + (1000 * 1.5) = 1695
    expect(calculateSpatialSyncLatency('serverless', 1000)).toBe(1695);

    // P2P CRDT: 45 + (1000 * 0.1) = 145
    expect(calculateSpatialSyncLatency('p2p-crdt', 1000)).toBe(145);
  });

  it('computes mutation costs based on verb and payload size', () => {
    // GET (w=1) * 0.1 = 0.1
    // WS  (w=5) * 2.0 = 10.0
    // GET (w=1) * 1024 = 1024.0
    // Total: 1034.1
    const cost = estimateStateMutationCost(endpoints);
    expect(cost).toBeCloseTo(1034.1, 2);
  });

  it('validates spatial readiness and emits payload warnings', () => {
    const { valid, warnings } = validateSpatialMapping(endpoints);
    expect(valid).toBe(false);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('large payload (1024KB)');
  });

  it('warns if no WS endpoint is defined', () => {
    const noWs: RouteEndpoint[] = [{ path: '/api/update', method: 'POST', dataPayloadKb: 50 }];
    const validation = validateSpatialMapping(noWs);
    expect(validation.valid).toBe(false);
    expect(validation.warnings[0]).toContain('No WebSocket (WS) endpoint');
  });

  it('passes cleanly for valid spatial web setups', () => {
    const perfect: RouteEndpoint[] = [{ path: 'ws://loro-crdt', method: 'WS', dataPayloadKb: 1.5 }];
    const result = validateSpatialMapping(perfect);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBe(0);
  });
});
