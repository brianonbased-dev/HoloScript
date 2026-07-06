/**
 * HoloEmbedProvider -- Absorb GraphRAG adapter for @holoscript/holoembed.
 *
 * The embedding algorithm lives in `@holoscript/holoembed`; this class only
 * adapts Absorb's `EmbeddingProvider` and `ExternalSymbolDefinition` contracts.
 * Keeping the vector math in one package prevents GraphRAG, HoloEmbed, and GEV
 * from drifting into separate embedding spaces.
 */

import { HoloEmbedEncoder } from '@holoscript/holoembed';
import type { GraphEnrichment, SymbolInput } from '@holoscript/holoembed';
import type { EmbeddingProvider } from './EmbeddingProvider';
import type { ExternalSymbolDefinition } from '../types';

export const ABSORB_HOLOEMBED_STRUCTURAL_WEIGHT = 0.12;

export class HoloEmbedProvider implements EmbeddingProvider {
  readonly name = 'holoembed';

  constructor(
    private readonly encoder = new HoloEmbedEncoder({
      structuralWeight: ABSORB_HOLOEMBED_STRUCTURAL_WEIGHT,
      weightSemanticAliases: true,
    })
  ) {}

  async getEmbeddings(texts: string[]): Promise<number[][]> {
    return texts.map((text) => Array.from(this.encoder.encodeText(text)));
  }

  embedSymbol(sym: ExternalSymbolDefinition, opts: GraphEnrichment = {}): Float32Array {
    return this.encoder.encode(toSymbolInput(sym), opts);
  }
}

function toSymbolInput(sym: ExternalSymbolDefinition): SymbolInput {
  return {
    name: sym.name,
    type: sym.type,
    filePath: sym.filePath,
    line: sym.line,
    column: sym.column,
    signature: sym.signature,
    docComment: sym.docComment,
    isExported: sym.isExported,
    visibility: sym.visibility,
    owner: sym.owner,
    lineCount: sym.lineCount,
  };
}
