export type ThreatLevel = 'LOW' | 'GUARDED' | 'ELEVATED' | 'HIGH' | 'SEVERE';

export interface NetworkNode {
  id: string;
  ip: string;
  status: 'active' | 'compromised' | 'offline';
  encryptionProtocols: string[];
  anomalousTrafficKbps: number;
}

export function evaluateThreatLevel(nodes: NetworkNode[]): ThreatLevel {
  const compromisedCount = nodes.filter(n => n.status === 'compromised').length;
  const highTrafficCount = nodes.filter(n => Math.abs(n.anomalousTrafficKbps) > 5000).length;

  if (compromisedCount > 2 || highTrafficCount > 5) return 'SEVERE';
  if (compromisedCount > 0 || highTrafficCount > 2) return 'HIGH';
  if (highTrafficCount > 0) return 'ELEVATED';
  
  const offlineCount = nodes.filter(n => n.status === 'offline').length;
  if (offlineCount > 0) return 'GUARDED';

  return 'LOW';
}

export function isolateCompromisedNodes(nodes: NetworkNode[]): NetworkNode[] {
  return nodes.map(n => {
    if (n.status === 'compromised') {
      return { ...n, status: 'offline', anomalousTrafficKbps: 0 };
    }
    return n;
  });
}

export function generateFirewallRule(node: NetworkNode): string {
  if (node.status === 'compromised') {
    return `BLOCK_ALL IPv4 ${node.ip} PORT * --reason "ACTIVE_COMPROMISE"`;
  }
  if (node.anomalousTrafficKbps > 1000) {
    return `THROTTLE IPv4 ${node.ip} BANDWIDTH 500Kbps --reason "ANOMALOUS_SPIKE"`;
  }
  return `ALLOW IPv4 ${node.ip} PORT 443,80`;
}
