/**
 * Turn a HoloMap ReconstructionManifest into a .holo composition (bounds + anchor)
 * and run it through ExportManager (same path as holo_compile_to_target).
 */

import {
  getExportManager,
  parseHolo,
  type ExportTarget,
  type HolomapPointCloudPayload,
} from '@holoscript/core';
import type { ReconstructionManifest } from '@holoscript/core/reconstruction';
import { Buffer } from 'node:buffer';

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

function fmtNum(n: number): string {
  const r = Math.round(n * 10_000) / 10_000;
  if (Number.isInteger(r)) return String(r);
  return String(r);
}

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

/** Composition derived from manifest bounds, counts, and contract fingerprint (compilers emit provenance). */
export function holoStubSourceFromManifest(
  m: ReconstructionManifest,
  boundsOverride?: { min: [number, number, number]; max: [number, number, number] },
): string {
  const id = m.replayHash.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48) || 'holomap';
  const b = boundsOverride ?? m.bounds;
  const [minx, miny, minz] = b.min;
  const [maxx, maxy, maxz] = b.max;
  const cx = (minx + maxx) / 2;
  const cy = (miny + maxy) / 2;
  const cz = (minz + maxz) / 2;
  const sx = Math.max(0.05, maxx - minx);
  const sy = Math.max(0.05, maxy - miny);
  const sz = Math.max(0.05, maxz - minz);
  const lift = Math.min(sy, 2) * 0.2;

  return `
composition "HoloMapExport_${id}_f${m.frameCount}_p${m.pointCount}" {
  environment {
    skybox: "neutral"
  }

  object "holomap_room_bounds" {
    geometry: "box"
    position: [${fmtNum(cx)}, ${fmtNum(cy)}, ${fmtNum(cz)}]
    scale: [${fmtNum(sx)}, ${fmtNum(sy)}, ${fmtNum(sz)}]
  }

  object "holomap_anchor" {
    geometry: "sphere"
    position: [${fmtNum(cx)}, ${fmtNum(cy + lift)}, ${fmtNum(cz)}]
  }
}
`.trim();
}

/** Binary-packed cloud for r3f / Unity exporters (same cap as PLY aggregation). */
export function holomapPayloadFromAggregatedPoints(
  positions: number[],
  colors: number[],
): HolomapPointCloudPayload | undefined {
  const n = Math.min(Math.floor(positions.length / 3), Math.floor(colors.length / 3));
  if (n < 1) return undefined;
  const pos = new Float32Array(n * 3);
  const col = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const b = i * 3;
    pos[b] = positions[b];
    pos[b + 1] = positions[b + 1];
    pos[b + 2] = positions[b + 2];
    col[b] = colors[b];
    col[b + 1] = colors[b + 1];
    col[b + 2] = colors[b + 2];
  }
  return {
    positionsB64: Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength).toString('base64'),
    colorsB64: Buffer.from(col.buffer, col.byteOffset, col.byteLength).toString('base64'),
    pointCount: n,
  };
}

export async function compileManifestToTarget(
  manifest: ReconstructionManifest,
  target: string,
  boundsOverride?: { min: [number, number, number]; max: [number, number, number] },
  holomapPointCloud?: HolomapPointCloudPayload,
): Promise<{ exportTarget: ExportTarget; output: string; usedFallback: boolean }> {
  const exportTarget = normalizeReconstructExportTarget(target);
  const src = holoStubSourceFromManifest(manifest, boundsOverride);
  const parsed = parseHolo(src);
  if (!parsed.success || !parsed.ast) {
    throw new Error(
      `holo_reconstruct_export: internal parse failed: ${parsed.errors?.[0]?.message ?? 'unknown'}`,
    );
  }

  getExportManager({ useMemoryMonitoring: false });
  const exportManager = getExportManager();
  const compilerOptions: Record<string, unknown> = {
    provenanceHash: manifest.simulationContract.replayFingerprint,
  };
  if (holomapPointCloud) {
    compilerOptions.holomapPointCloud = holomapPointCloud;
  }
  const agentToken = process.env.HOLOSCRIPT_MCP_AGENT_TOKEN?.trim() ?? '';
  const result = await exportManager.export(exportTarget, parsed.ast, {
    // Empty string skips compiler RBAC (same as createTestCompilerToken); set env for real JWT.
    agentToken,
    compilerOptions,
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
