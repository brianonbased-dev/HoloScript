import { IncrementalParser, ChunkBasedIncrementalParser } from './IncrementalParser';
import { ASTNode } from '../types/base';
import * as crypto from 'crypto';

export interface SpatialEntity {
  id: string;
  ast: ASTNode;
  position: { x: number; y: number; z: number };
  velocity?: [number, number, number];
  traits: Map<string, Record<string, unknown>>;
  author: string;
  content: string;
  tier: number;
}

/**
 * FeedParser parses a continuous, growing HoloScript document representing a spatial feed.
 * It uses ChunkBasedIncrementalParser under the hood to only re-parse the newly appended
 * chunks rather than the entire document.
 */
export class FeedParser {
  private parser: ChunkBasedIncrementalParser;
  private version = 0;
  private lastParsedLength = 0;
  private nodes: Map<string, ASTNode> = new Map();

  constructor() {
    this.parser = new ChunkBasedIncrementalParser();
  }

  /** Called when CRDT text changes */
  public onFeedUpdate(fullSource: string): ASTNode[] {
    if (fullSource.length === this.lastParsedLength) {
      return [...this.nodes.values()];
    }

    const parseResult = this.parser.parse(fullSource);
    this.lastParsedLength = fullSource.length;
    this.version++;

    // Walk the AST fragment to extract orb/Insight nodes
    const root = parseResult.ast as any;
    const children = root.type === 'fragment' ? root.children : [root];

    for (const node of children) {
      if ((node.type === 'orb' || node.type === 'Insight') && node.id) {
        // Extract provenance from comments or traits if needed
        if (!node.provenance) {
          const authorTrait = node.traits?.get('author') as any;
          node.provenance = {
            author: authorTrait?.value || authorTrait?.[0] || 'anonymous',
            timestamp: Date.now(),
            provenanceHash: crypto.createHash('sha256').update(JSON.stringify(node)).digest('hex')
          };
        }
        this.nodes.set(node.id, node);
      }
    }

    return [...this.nodes.values()];
  }

  /** Get all entities with spatial data ready for R3F */
  public getSpatialEntities(): SpatialEntity[] {
    return [...this.nodes.values()]
      .filter(n => n.position)
      .map(n => {
        // Extract thought trait content
        const thoughtTrait = n.traits?.get('thought') as any;
        const content = thoughtTrait?.value || thoughtTrait?.[0] || '';
        
        // Extract velocity if present
        const velocityTrait = n.traits?.get('velocity') as any;
        const vArgs = velocityTrait?.args || [0, 0, 0];
        
        return {
          id: n.id!,
          ast: n,
          position: n.position!,
          velocity: [vArgs[0] || 0, vArgs[1] || 0, vArgs[2] || 0],
          traits: n.traits || new Map(),
          author: n.provenance?.author || 'anonymous',
          content,
          tier: n.position!.y > 30 ? 3 : n.position!.y > 10 ? 2 : 1
        };
      });
  }
}
