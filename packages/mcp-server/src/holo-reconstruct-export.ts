/**
 * Turn a HoloMap ReconstructionManifest into a minimal .holo composition and
 * run it through ExportManager (same path as holo_compile_to_target).
 */

import { getExportManager, parseHolo, type ExportTarget } from '@holoscript/core';
import type { ReconstructionManifest } from '@holoscript/core/reconstruction';

const TARGET_ALIASES: Record<string, ExportTarget> = {
  r3f: 'r3f',
  'react-three-fiber': 'r3f',
  three: 'r3f',
  threejs: 'r3f',
  unity: 'unity',
  godot: 'godot',
  usd: 'usd',
  'usd-physics': 'usd',
  usdz: 'usdz',
  unreal: 'unreal',
  'unreal-engine': 'unreal',
  webgpu: 'webgpu',
  vrr: 'vrr',
  babylon: 'babylon',
  wasm: 'wasm',
  urdf: 'urdf',
  sdf: 'sdf',
};

export function normalizeReconstructExportTarget(raw: string): ExportTarget {
  const key = raw.trim().toLowerCase();
  if (TARGET_ALIASES[key]) return TARGET_ALIASES[key];

  getExportManager({ useMemoryMonitoring: false });
  const supported = getExportManager().getSupportedTargets();
  if (supported.includes(key as ExportTarget)) return key as ExportTarget;

  throw new Error(
    `holo_reconstruct_export: unsupported target "${raw}". Common: r3f, unity, godot, usd, unreal, webgpu, vrr.`,
  );
}

export function holoStubSourceFromManifest(m: ReconstructionManifest): string {
  const id = m.replayHash.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48) || 'holomap';
  return `
composition "HoloMapExport_${id}" {
  object "holomap_anchor" {
    geometry: "sphere"
    position: [0, 1.6, 0]
  }
}
`.trim();
}

export async function compileManifestToTarget(
  manifest: ReconstructionManifest,
  target: string,
): Promise<{ exportTarget: ExportTarget; output: string; usedFallback: boolean }> {
  const exportTarget = normalizeReconstructExportTarget(target);
  const src = holoStubSourceFromManifest(manifest);
  const parsed = parseHolo(src);
  if (!parsed.success || !parsed.ast) {
    throw new Error(
      `holo_reconstruct_export: internal parse failed: ${parsed.errors?.[0]?.message ?? 'unknown'}`,
    );
  }

  getExportManager({ useMemoryMonitoring: false });
  const exportManager = getExportManager();
  const result = await exportManager.export(exportTarget, parsed.ast, {
    agentToken: process.env.HOLOSCRIPT_MCP_AGENT_TOKEN?.trim() || 'mcp-holomap-reconstruct',
    compilerOptions: {
      provenanceHash: manifest.simulationContract.replayFingerprint,
    },
  });

  if (!result.success) {
    throw new Error(result.error?.message || `Export to ${exportTarget} failed`);
  }

  const output =
    typeof result.output === 'string'
      ? result.output
      : result.output != null
        ? JSON.stringify(result.output)
        : '';

  return {
    exportTarget,
    output,
    usedFallback: result.usedFallback || false,
  };
}
