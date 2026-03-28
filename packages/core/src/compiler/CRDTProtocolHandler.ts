import type { HoloMeshWorldState } from '../../../../mcp-server/src/holomesh/crdt-sync';

/**
 * Resolves crdt:// protocol URIs into source code strings.
 */
export function resolveCRDTUri(uri: string, worldState: HoloMeshWorldState): string {
  // crdt://holomesh/feed → worldState.getFeedSource()
  // crdt://holomesh/knowledge/security → worldState.getKnowledgeDomain('security')
  const path = uri.replace('crdt://', '').split('/');
  const collection = path.shift();

  if (collection === 'holomesh') {
    if (path[0] === 'feed' || path[0] === 'insights') {
      return worldState.getFeedSource();
    }
    if (path[0] === 'knowledge' && path[1]) {
      return worldState.getKnowledgeDomainSource(path[1]);
    }
  }
  
  throw new Error(`Unknown CRDT URI collection or path: ${uri}`);
}
