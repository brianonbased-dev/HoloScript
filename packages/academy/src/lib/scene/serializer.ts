/**
 * Scene Serializer — save/restore/share full studio state
 *
 * `.holo` file format (JSON, version 2):
 * {
 *   v: 2,
 *   metadata: SceneMetadata,
 *   code: string,           // HoloScript source
 *   nodes: SceneNode[],     // scene graph
 *   assets: Asset[],        // user-added assets (base64 or src URL)
 * }
 *
 * URL sharing: JSON → UTF-8 → deflate via CompressionStream → base64url
 * Server environments that don't support CompressionStream fall back to
 * simple base64 (no compression).
 */

import type { SceneNode, TraitConfig } from '@/lib/stores';
import type { Asset } from '@/components/assets/useAssetStore';

// ─── Format types ────────────────────────────────────────────────────────────

export interface HoloSceneMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface HoloScene {
  v: 2;
  metadata: HoloSceneMetadata;
  code: string;
  nodes: SceneNode[];
  assets: Asset[];
}

// ─── Serialize ───────────────────────────────────────────────────────────────

export function serializeScene(
  metadata: HoloSceneMetadata,
  code: string,
  nodes: SceneNode[],
  assets: Asset[]
): HoloScene {
  return {
    v: 2,
    metadata: { ...metadata, updatedAt: new Date().toISOString() },
    code,
    nodes,
    assets,
  };
}

export function serializeToJSON(scene: HoloScene): string {
  return JSON.stringify(scene, null, 2);
}

// ─── Deserialize ─────────────────────────────────────────────────────────────

export interface DeserializeResult {
  ok: boolean;
  scene?: HoloScene;
  error?: string;
}

export function deserializeScene(raw: string): DeserializeResult {
  try {
    const parsed = JSON.parse(raw);

    // Support v1 (code-only) — migrate to v2
    if ((!parsed.v || parsed.v === 1) && parsed.code !== undefined) {
      return {
        ok: true,
        scene: {
          v: 2,
          metadata: parsed.metadata ?? {
            id: '',
            name: parsed.name ?? 'Imported Scene',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          code: parsed.code,
          nodes: [],
          assets: [],
        },
      };
    }

    if (parsed.v !== 2) {
      return { ok: false, error: `Unsupported .holo version: ${parsed.v}` };
    }

    return { ok: true, scene: parsed as HoloScene };
  } catch (e) {
    return { ok: false, error: `Parse error: ${String(e)}` };
  }
}

// ─── File download ────────────────────────────────────────────────────────────

export function downloadHoloFile(scene: HoloScene): void {
  const json = serializeToJSON(scene);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = scene.metadata.name.replace(/\s+/g, '-').toLowerCase() || 'scene';
  a.href = url;
  a.download = `${slug}.holo`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── File open ───────────────────────────────────────────────────────────────

export function openHoloFile(): Promise<DeserializeResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.holo,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve({ ok: false, error: 'No file selected' });
      const reader = new FileReader();
      reader.onload = () => resolve(deserializeScene(reader.result as string));
      reader.onerror = () => resolve({ ok: false, error: 'File read error' });
      reader.readAsText(file);
    };
    input.click();
  });
}

// ─── URL sharing ─────────────────────────────────────────────────────────────

// Encode: JSON → Uint8Array → deflate-raw → base64url
export async function encodeSceneToURL(scene: HoloScene): Promise<string> {
  const json = serializeToJSON(scene);

  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(json);

    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(data);
    writer.close();

    const compressed = await new Response(cs.readable).arrayBuffer();
    const bytes = new Uint8Array(compressed);
    const b64 = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    return b64;
  } catch {
    // Fallback: plain base64 (no compression)
    return btoa(encodeURIComponent(json)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
}

// Decode: base64url → inflate-raw → JSON
export async function decodeSceneFromURL(encoded: string): Promise<DeserializeResult> {
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64 + '=='.slice(b64.length % 4 || 4));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));

    try {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const raw = await new Response(ds.readable).text();
      return deserializeScene(raw);
    } catch {
      // Fallback: assume plain base64
      const raw = decodeURIComponent(atob(b64 + '=='.slice(b64.length % 4 || 4)));
      return deserializeScene(raw);
    }
  } catch (e) {
    return { ok: false, error: `URL decode error: ${String(e)}` };
  }
}

export async function copyShareURL(scene: HoloScene): Promise<void> {
  const encoded = await encodeSceneToURL(scene);
  const url = `${window.location.origin}/create?scene=${encoded}`;
  await navigator.clipboard.writeText(url);
}
