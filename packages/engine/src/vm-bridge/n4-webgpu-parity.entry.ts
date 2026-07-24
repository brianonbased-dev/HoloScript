import {
  inferN4Cpu,
  inferN4WebGPU,
  verifyN4RuntimeParity,
  type N4WeightsManifest,
} from '@holoscript/core/world-model';

declare const __N4_MANIFEST__: N4WeightsManifest;
declare const __N4_FEATURES__: readonly number[];

interface N4BrowserParityArtifact {
  readonly protocol: 'holoscript.n4-runtime-parity.v0.1.0';
  readonly executionMode: 'webgpu';
  readonly navigatorGpu: true;
  readonly adapterAcquired: true;
  readonly deviceAcquired: true;
  readonly dispatchCompleted: true;
  readonly readbackCompleted: true;
  readonly adapter: Record<string, string>;
  readonly userAgent: string;
  readonly cpu: Awaited<ReturnType<typeof inferN4Cpu>>;
  readonly webgpu: Awaited<ReturnType<typeof inferN4WebGPU>>;
  readonly parity: ReturnType<typeof verifyN4RuntimeParity>;
  readonly tensorChecksum: string;
}

declare global {
  interface Window {
    __N4_WEBGPU_PARITY_ARTIFACT__?: N4BrowserParityArtifact;
    __N4_WEBGPU_PARITY_ERROR__?: { name: string; message: string; stack?: string };
  }
}

async function adapterInfo(adapter: GPUAdapter): Promise<Record<string, string>> {
  const withLegacy = adapter as GPUAdapter & {
    requestAdapterInfo?: () => Promise<Partial<GPUAdapterInfo>>;
  };
  let info: Partial<GPUAdapterInfo> = adapter.info ?? {};
  if (Object.keys(info).length === 0 && withLegacy.requestAdapterInfo) {
    info = await withLegacy.requestAdapterInfo();
  }
  return Object.fromEntries(
    Object.entries(info)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)])
  );
}

export async function runN4BrowserWebGPUParity(): Promise<N4BrowserParityArtifact> {
  if (!navigator.gpu) throw new Error('navigator.gpu is unavailable');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('navigator.gpu.requestAdapter() returned null');
  const device = await adapter.requestDevice();
  if (!device) throw new Error('GPUAdapter.requestDevice() returned no device');

  const cpu = inferN4Cpu(__N4_MANIFEST__, __N4_FEATURES__);
  const webgpu = await inferN4WebGPU(device, __N4_MANIFEST__, __N4_FEATURES__);
  const parity = verifyN4RuntimeParity(cpu, webgpu);
  if (!parity.valid) throw new Error(`WebGPU parity failed: ${parity.reason}`);
  await device.queue.onSubmittedWorkDone();
  return {
    protocol: 'holoscript.n4-runtime-parity.v0.1.0',
    executionMode: 'webgpu',
    navigatorGpu: true,
    adapterAcquired: true,
    deviceAcquired: true,
    dispatchCompleted: true,
    readbackCompleted: true,
    adapter: await adapterInfo(adapter),
    userAgent: navigator.userAgent,
    cpu,
    webgpu,
    parity,
    tensorChecksum: __N4_MANIFEST__.tensorChecksum,
  };
}

void runN4BrowserWebGPUParity()
  .then((artifact) => {
    window.__N4_WEBGPU_PARITY_ARTIFACT__ = artifact;
  })
  .catch((error: unknown) => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    window.__N4_WEBGPU_PARITY_ERROR__ = {
      name: normalized.name,
      message: normalized.message,
      stack: normalized.stack,
    };
  });
