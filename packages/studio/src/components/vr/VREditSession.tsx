/**
 * VREditSession — Orchestrates all VR editing sub-components.
 *
 * Mounts inside the R3F Canvas when XR is active.
 * Wraps the scene in <XR> provider and renders:
 *   - VREditHUD  (floating scene graph + inspector)
 *   - VRHandControllers  (ray-cast select + pinch drag)
 *   - VRBrittney  (floating AI assistant bubble)
 */

import { createXRStore, XR } from '@react-three/xr';
import { VREditHUD } from './VREditHUD';
import { VRHandControllers } from './VRHandController';
import { VRBrittney } from './VRBrittney';

// Create a shared XR store (module-level singleton)
export const xrStore = createXRStore({
  hand: { rayPointer: { rayModel: { color: '#6366f1', opacity: 0.6, maxLength: 3 } } },
  controller: { rayPointer: { rayModel: { color: '#6366f1', opacity: 0.6, maxLength: 3 } } },
});

export function VREditSession() {
  return (
    <XR store={xrStore}>
      {/* Floating world-space UI panels */}
      <VREditHUD />

      {/* Ray-cast select + pinch drag controllers */}
      <VRHandControllers />

      {/* Brittney floating assistant */}
      <VRBrittney />
    </XR>
  );
}
