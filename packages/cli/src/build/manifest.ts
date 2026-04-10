import { Chunk, Manifest, ChunkInfo } from './splitter';

export class ManifestGenerator {
  /**
   * Generate manifest from chunks
   */
  public generate(chunks: Chunk[], _outputDir: string): Manifest {
    const manifest: Manifest = {
      entry: 'main.chunk.js',
      chunks: {},
    };

    // Build a map of object names to chunk IDs for reference analysis
    const objectToChunk = new Map<string, string>();
    for (const chunk of chunks) {
      for (const obj of chunk.objects) {
        if (obj.name) {
          objectToChunk.set(obj.name, chunk.id);
        }
      }
    }

    for (const chunk of chunks) {
      const fileName = `${chunk.id}.chunk.js`;

      // Analyze cross-chunk references
      const dependencies = this.analyzeDependencies(chunk, objectToChunk);

      const info: ChunkInfo = {
        file: fileName,
        dependencies,
      };

      // Add spatial bounds if available in chunk metadata/zones
      if (chunk.metadata.bounds) {
        info.bounds = chunk.metadata.bounds;
      }

      manifest.chunks[chunk.id] = info;
    }

    return manifest;
  }

  /**
   * Analyze a chunk's objects for references to objects in other chunks
   */
  private analyzeDependencies(chunk: Chunk, objectToChunk: Map<string, string>): string[] {
    const dependencies = new Set<string>();

    for (const obj of chunk.objects) {
      // Check object properties for references to other objects
      if (obj.properties) {
        for (const prop of obj.properties) {
          // Look for string values that might be object references
          if (typeof prop.value === 'string') {
            const refChunk = objectToChunk.get(prop.value);
            if (refChunk && refChunk !== chunk.id) {
              dependencies.add(refChunk);
            }
          }

          // Check array values for references
          if (Array.isArray(prop.value)) {
            for (const item of prop.value) {
              if (typeof item === 'string') {
                const refChunk = objectToChunk.get(item);
                if (refChunk && refChunk !== chunk.id) {
                  dependencies.add(refChunk);
                }
              }
            }
          }
        }
      }

      // Check trait configs for references
      if (obj.traits) {
        for (const trait of obj.traits) {
          if (trait.config) {
            for (const [_key, value] of Object.entries(trait.config)) {
              if (typeof value === 'string') {
                const refChunk = objectToChunk.get(value);
                if (refChunk && refChunk !== chunk.id) {
                  dependencies.add(refChunk);
                }
              }
            }
          }
        }
      }
    }

    return Array.from(dependencies);
  }
}
