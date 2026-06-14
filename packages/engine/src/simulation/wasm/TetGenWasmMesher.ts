/**
 * TetGenWasmMesher — Wrapper for the TetGen WebAssembly binary.
 *
 * This mesher generates high-quality constrained Delaunay tetrahedralizations.
 * It is used for complex surface-to-volume meshing where the structured
 * box mesher is insufficient.
 */

import type { TetMesh, WasmMesher, SurfaceMesh, SurfaceMeshOptions } from '../AutoMesher';

let cachedWasm: { initialized: true; url: string } | null = null;

export class TetGenWasmMesher implements WasmMesher {
  readonly id = 'tetgen';
  readonly name = 'TetGen (High-Fidelity)';

  private wasmUrls: string[];

  constructor(wasmUrl: string | string[] = ['/wasm/tetgen.wasm', '/assets/tetgen.wasm']) {
    this.wasmUrls = Array.isArray(wasmUrl) ? wasmUrl : [wasmUrl];
  }

  async init(): Promise<void> {
    if (cachedWasm) return;

    let lastError: unknown = null;

    for (const url of this.wasmUrls) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} loading tetgen.wasm from ${url}`);
        }
        cachedWasm = { initialized: true, url };
        return;
      } catch (err) {
        lastError = err;
      }
    }

    const attempted = this.wasmUrls.join(', ');
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(
      `TetGen initialization failed. Could not load tetgen.wasm from any configured path (${attempted}). ` +
        `Place the binary in Studio public/wasm or public/assets. Last error: ${reason}`
    );
  }

  async tetrahedralize(surface: SurfaceMesh, options?: SurfaceMeshOptions): Promise<TetMesh> {
    if (!cachedWasm) await this.init();

    console.log(
      `TetGen meshing surface with ${surface.vertices.length / 3} vertices and ${surface.triangles.length / 3} triangles...`
    );

    throw new Error(
      'TetGen WASM execution not yet implemented — binary interop pending. ' +
        'File a LARGE_BUILD task to wire real tetgen.wasm once the binary is provisioned.'
    );
  }
}
