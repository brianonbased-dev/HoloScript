export type ArchitectureType = 'monolith' | 'microservices' | 'serverless' | 'p2p-crdt';

export interface RouteEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'WS';
  dataPayloadKb: number;
}

export function calculateSpatialSyncLatency(architecture: ArchitectureType, connections: number): number {
  // Base network latency + proxy overhead
  const baseLatency = 45; // ms
  
  switch(architecture) {
    case 'monolith': return baseLatency + (connections * 0.5);
    case 'microservices': return baseLatency + 20 + (connections * 0.8);
    case 'serverless': return baseLatency + 150 + (connections * 1.5); // Cold start hits
    case 'p2p-crdt': return baseLatency + (connections * 0.1); // High efficiency local-first
    default: return baseLatency;
  }
}

export function estimateStateMutationCost(endpoints: RouteEndpoint[]): number {
  return endpoints.reduce((acc, ep) => {
    const methodWeight = ep.method === 'WS' ? 5 : (ep.method === 'GET' ? 1 : 3);
    return acc + (ep.dataPayloadKb * methodWeight);
  }, 0);
}

export function validateSpatialMapping(endpoints: RouteEndpoint[]): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  let wsFound = false;

  endpoints.forEach(ep => {
    if (ep.method === 'WS') wsFound = true;
    if (ep.dataPayloadKb > 500) {
      warnings.push(`Endpoint ${ep.path} has large payload (${ep.dataPayloadKb}KB), consider chunking for VR framerates.`);
    }
  });

  if (!wsFound) {
    warnings.push('No WebSocket (WS) endpoint found. Polling via HTTP is highly discouraged for HoloScript real-time networking.');
  }

  return {
    valid: warnings.length === 0,
    warnings
  };
}
