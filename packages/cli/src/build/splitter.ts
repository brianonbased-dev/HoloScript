import { HoloComposition, HoloObjectDecl, HoloZone } from '@holoscript/core';

export interface Chunk {
  id: string;
  objects: HoloObjectDecl[];
  metadata: Record<string, unknown>;
}

export interface Manifest {
  entry: string;
  chunks: Record<string, ChunkInfo>;
}

export interface ChunkInfo {
  file: string;
  bounds?: number[][];
  dependencies: string[];
}

export class SceneSplitter {
  /**
   * Split a composition into chunks
   */
  public split(composition: HoloComposition): Chunk[] {
    const chunks: Map<string, Chunk> = new Map();
    const defaultChunk: Chunk = { id: 'main', objects: [], metadata: {} };
    chunks.set('main', defaultChunk);

    // Identify zones for spatial splitting
    const zones = composition.zones || [];
    const zoneBounds = this.extractZoneBounds(zones);

    // Process objects
    for (const obj of composition.objects) {
      const chunkId = this.determineChunk(obj, zoneBounds);

      if (!chunks.has(chunkId)) {
        const metadata: any = {};
        if (zoneBounds.has(chunkId)) {
          metadata.bounds = zoneBounds.get(chunkId);
        }
        chunks.set(chunkId, { id: chunkId, objects: [], metadata });
      }

      chunks.get(chunkId)!.objects.push(obj);
    }

    // Process spatial groups (recursive)
    for (const group of composition.spatialGroups || []) {
      // For now, we keep groups in main or split them?
      // Usually groups should remain together.
      // We'll treat groups like objects for chunk determination.
      const chunkId = this.determineChunkForGroup(group, zoneBounds);
      if (!chunks.has(chunkId)) {
        chunks.set(chunkId, { id: chunkId, objects: [], metadata: {} });
      }
      // We might need to handle groups specifically in the output
    }

    return Array.from(chunks.values());
  }

  private extractZoneBounds(zones: HoloZone[]): Map<string, number[][]> {
    const boundsMap = new Map<string, number[][]>();
    for (const zone of zones) {
      const boundsProp = zone.properties.find((p) => p.key === 'bounds');
      if (boundsProp && Array.isArray(boundsProp.value)) {
        boundsMap.set(zone.name, boundsProp.value as number[][]);
      }
    }
    return boundsMap;
  }

  private determineChunk(obj: HoloObjectDecl, zoneBounds: Map<string, number[][]>): string {
    // 1. Check for manual @chunk annotation
    const chunkTrait = obj.traits?.find((t) => t.name === 'chunk');
    if (chunkTrait && chunkTrait.config.name) {
      return String(chunkTrait.config.name);
    }

    // 2. Spatial check
    const posProp = obj.properties.find((p) => p.key === 'position');
    if (posProp && Array.isArray(posProp.value)) {
      const [x, y, z] = posProp.value as number[];
      for (const [zoneName, bounds] of zoneBounds.entries()) {
        if (this.isPointInBounds([x, y, z], bounds)) {
          return zoneName;
        }
      }
    }

    return 'main';
  }

  private determineChunkForGroup(group: any, zoneBounds: Map<string, number[][]>): string {
    // Similar to object, but maybe based on group center
    const posProp = group.properties?.find((p: any) => p.key === 'position');
    if (posProp && Array.isArray(posProp.value)) {
      const [x, y, z] = posProp.value as number[];
      for (const [zoneName, bounds] of zoneBounds.entries()) {
        if (this.isPointInBounds([x, y, z], bounds)) {
          return zoneName;
        }
      }
    }
    return 'main';
  }

  private isPointInBounds(point: number[], bounds: number[][]): boolean {
    if (bounds.length < 2) return false;
    const [min, max] = bounds;
    return (
      point[0] >= min[0] &&
      point[0] <= max[0] &&
      point[1] >= min[1] &&
      point[1] <= max[1] &&
      point[2] >= min[2] &&
      point[2] <= max[2]
    );
  }
}
