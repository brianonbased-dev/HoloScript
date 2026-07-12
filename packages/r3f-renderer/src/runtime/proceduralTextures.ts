/**
 * proceduralTextures — data-declared procedural detail maps (I.007 dogfooding pillar 3).
 *
 * The lotus's normal/roughness maps are PROCEDURAL (generateBotanicalNormalMap /
 * generateBotanicalRoughnessMap in core → pure RGBA8 pixel data, no canvas). The
 * material compiler only emits texture FILE PATHS (`useTexture("path")`), so these
 * maps were hand-built in LotusProgram.tsx. This is the missing capability: a
 * `.holo` material declares a map as DATA — `{ generator: 'botanical_normal',
 * params }` — and the renderer resolves the named generator to a `DataTexture`.
 *
 * The registry + resolver are pure (no three.js needed to dispatch), so they're
 * unit-testable with the REAL core generators (which are pure). `proceduralDataToTexture`
 * is the thin three.js conversion. Keeping the registry generator-agnostic means
 * r3f-renderer stays decoupled from core/lotus specifics — the lotus wiring
 * registers the botanical generators at its own site.
 *
 * @cites I.007, D.012, F.099, plan §0.7 / task_1780467909796_0qfk
 */
import * as THREE from 'three';

/** RGBA8 pixel buffer (structurally compatible with core's ProceduralTextureData). */
export interface ProceduralPixelData {
  width: number;
  height: number;
  /** RGBA8, row-major, length = width * height * 4. */
  data: Uint8Array;
}

/** A `.holo` material's declaration of a procedural map. */
export interface ProceduralTextureSpec {
  /** Registry key, e.g. 'botanical_normal'. */
  generator: string;
  /** Generator parameters (pattern, size, seed, strength, …). */
  params?: Record<string, unknown>;
}

export type ProceduralTextureGenerator = (params: Record<string, unknown>) => ProceduralPixelData;

const registry = new Map<string, ProceduralTextureGenerator>();
const dataCache = new Map<string, ProceduralPixelData>();

/** Register a named procedural generator. Idempotent (last registration wins). */
export function registerProceduralTexture(
  name: string,
  generator: ProceduralTextureGenerator
): void {
  registry.set(name, generator);
}

export function hasProceduralTexture(name: string): boolean {
  return registry.has(name);
}

/** Clear the registry + cache (test isolation). */
export function clearProceduralTextures(): void {
  registry.clear();
  dataCache.clear();
}

function specKey(spec: ProceduralTextureSpec): string {
  return `${spec.generator}:${JSON.stringify(spec.params ?? {})}`;
}

/**
 * Resolve a spec to pixel data via its registered generator (cached by spec, so
 * the same declaration never regenerates). Returns null if the generator is
 * unregistered — the caller falls back to a plain material map.
 */
export function resolveProceduralData(spec: ProceduralTextureSpec): ProceduralPixelData | null {
  const generator = registry.get(spec.generator);
  if (!generator) return null;
  const key = specKey(spec);
  const cached = dataCache.get(key);
  if (cached) return cached;
  const data = generator(spec.params ?? {});
  dataCache.set(key, data);
  return data;
}

/** Convert RGBA8 pixel data to a three.js DataTexture (GL-free construction). */
export function proceduralDataToTexture(data: ProceduralPixelData): THREE.DataTexture {
  const pixels = new Uint8Array(new ArrayBuffer(data.data.byteLength));
  pixels.set(data.data);
  const tex = new THREE.DataTexture(
    pixels,
    data.width,
    data.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Resolve a spec all the way to a three.js texture, or null when unregistered. */
export function resolveProceduralTexture(spec: ProceduralTextureSpec): THREE.DataTexture | null {
  const data = resolveProceduralData(spec);
  return data ? proceduralDataToTexture(data) : null;
}
