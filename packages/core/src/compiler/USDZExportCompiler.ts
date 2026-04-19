/**
 * Thin adapter: HoloComposition → USDZ bytes → base64 string for MCP/HTTP transports.
 */

import type { HoloComposition } from '../parser/HoloCompositionTypes';
import { USDZPipeline } from './USDZPipeline';

export class USDZExportCompiler {
  constructor(private readonly options: Record<string, unknown> = {}) {}

  compile(composition: HoloComposition, ..._rest: unknown[]): string {
    void this.options;
    const pipeline = new USDZPipeline();
    const bytes = pipeline.generateUSDZ(composition);
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64');
    }
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  }
}
