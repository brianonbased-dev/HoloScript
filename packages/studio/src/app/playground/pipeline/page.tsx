/**
 * /playground/pipeline — the asset production pipeline as a walkable manufacturing
 * warehouse. The scene is authored natively in HoloScript and loaded from the
 * examples library (examples/asset-pipeline-warehouse.holo) — NOT inlined here.
 * Each pipeline stage is a colour-coded station on the line; an asset entity
 * travels the conveyor through them (driven by scripts/pipeline-warehouse-driver.mjs
 * via the world-state loop), and the user walks the floor in VR via the shared
 * @holoscript/xr-embodiment locomotion baked into ImmersiveViewer.
 *
 * Open with ?agent=<assetId> to render the flowing asset (the product on the line):
 *   /playground/pipeline?agent=pipeline-asset-1
 *
 * Server component: reads the .holo source and hands it to the client viewer,
 * which compiles it with @holoscript/core's R3FCompiler (faithful native render).
 */

import { ImmersiveViewer } from '@/app/shared/[id]/ImmersiveViewer.client';
import { loadHoloExample } from '@/lib/loadHoloExample';

const EXAMPLE = 'asset-pipeline-warehouse.holo';

export default function PipelineWarehousePage() {
  const loaded = loadHoloExample(EXAMPLE);

  if ('error' in loaded) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#07070f',
          color: '#fca5a5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 13,
          textAlign: 'center',
        }}
      >
        Could not load the native scene — {loaded.error}
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#07070f' }}>
      <ImmersiveViewer code={loaded.source} name="Asset Pipeline Warehouse" />
    </div>
  );
}
