/**
 * threatIntelligence.scenario.ts — LIVING-SPEC: CyberSecurity Security Ops Center 
 *
 * Persona: Cipher — a SOC Analyst investigating spatial node breaches,
 * zero-day telemetry anomalies, and isolating internal network threats.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateThreatLevel,
  isolateCompromisedNodes,
  generateFirewallRule,
  type NetworkNode
} from '@/lib/threatIntelligence';

describe('Scenario: SOC Threat Intelligence', () => {
  const nodes: NetworkNode[] = [
    { id: '1', ip: '1.1.1.1', status: 'active', encryptionProtocols: [], anomalousTrafficKbps: 0 },
    { id: '2', ip: '2.2.2.2', status: 'active', encryptionProtocols: [], anomalousTrafficKbps: 6000 }, // elevated traffic
    { id: '4', ip: '3.3.3.3', status: 'compromised', encryptionProtocols: [], anomalousTrafficKbps: 9000 },
  ];

  it('evaluates threat level based on compromised and high-traffic nodes', () => {
    // 1 compromised, 1 active with high traffic -> HIGH
    expect(evaluateThreatLevel(nodes)).toBe('HIGH');
    
    const severeNodes: NetworkNode[] = [
      ...nodes,
      { id: '5', ip: '5.5.5.5', status: 'compromised', encryptionProtocols: [], anomalousTrafficKbps: 100 },
      { id: '6', ip: '6.6.6.6', status: 'compromised', encryptionProtocols: [], anomalousTrafficKbps: 100 },
    ];
    // > 2 compromised -> SEVERE
    expect(evaluateThreatLevel(severeNodes)).toBe('SEVERE');

    const lowNodes: NetworkNode[] = [
      { id: '1', ip: 'local', status: 'active', encryptionProtocols: [], anomalousTrafficKbps: 0 }
    ];
    expect(evaluateThreatLevel(lowNodes)).toBe('LOW');
  });

  it('isolates compromised nodes by setting them offline', () => {
    const isolated = isolateCompromisedNodes(nodes);
    
    // Original compromised node 3.3.3.3 is now offline and traffic zeroed out
    const node4 = isolated.find((n: NetworkNode) => n.id === '4');
    expect(node4?.status).toBe('offline');
    expect(node4?.anomalousTrafficKbps).toBe(0);
    
    // Active node remains active
    const node2 = isolated.find((n: NetworkNode) => n.id === '2');
    expect(node2?.status).toBe('active');
  });

  it('generates dynamic firewall heuristics', () => {
    expect(generateFirewallRule(nodes[0])).toBe('ALLOW IPv4 1.1.1.1 PORT 443,80');
    expect(generateFirewallRule(nodes[1])).toBe('THROTTLE IPv4 2.2.2.2 BANDWIDTH 500Kbps --reason "ANOMALOUS_SPIKE"');
    expect(generateFirewallRule(nodes[2])).toBe('BLOCK_ALL IPv4 3.3.3.3 PORT * --reason "ACTIVE_COMPROMISE"');
  });
});
