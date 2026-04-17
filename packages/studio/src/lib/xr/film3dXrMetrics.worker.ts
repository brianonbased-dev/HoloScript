/**
 * Off-main-thread batching for Film3D XR telemetry. The WebXR session and `collectFilm3dXrSample`
 * stay on the main thread; plain serializable samples are posted here for throttled forwarding.
 */

import type { Film3DXrVerificationSample } from './film3dXrVerification';

export type Film3dWorkerToMain = {
  type: 'sample';
  sample: Film3DXrVerificationSample;
};

const THROTTLE_MS = 200;
let lastEmit = 0;
let maxHitTests = 0;

self.onmessage = (ev: MessageEvent<{ sample: Film3DXrVerificationSample }>) => {
  const { sample } = ev.data;
  if (typeof sample.hitTestCount === 'number') {
    maxHitTests = Math.max(maxHitTests, sample.hitTestCount);
  }
  const now = Date.now();
  if (now - lastEmit < THROTTLE_MS) {
    return;
  }
  lastEmit = now;
  const out: Film3DXrVerificationSample = {
    ...sample,
    hitTestCount: maxHitTests,
    occlusionProofAcquired: maxHitTests > 0 || sample.occlusionProofAcquired === true,
  };
  (self as DedicatedWorkerGlobalScope).postMessage({
    type: 'sample',
    sample: out,
  } satisfies Film3dWorkerToMain);
};
