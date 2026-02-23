'use client';

/**
 * SaveBar — scene save / open / share / export toolbar widget
 *
 * Sits in StudioHeader right cluster. Provides:
 *   Save (.holo)  — downloads full scene as JSON
 *   Open (.holo)  — file picker → restore stores
 *   Share URL     — deflate-compressed URL → clipboard; shows toast
 *   Export glTF   — POST /api/export/gltf → download .glb
 */

import { useState, useCallback } from 'react';
import { Save, FolderOpen, Share2, Package, Check, Loader2 } from 'lucide-react';
import { useSceneStore, useSceneGraphStore } from '@/lib/store';
import { useAssetStore } from '@/components/assets/useAssetStore';
import {
  serializeScene,
  downloadHoloFile,
  openHoloFile,
  copyShareURL,
} from '@/lib/serializer';
import type { HoloScene } from '@/lib/serializer';

// ─── Toast indicator ──────────────────────────────────────────────────────────

function Toast({ message }: { message: string }) {
  return (
    <div className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-studio-border bg-studio-panel px-3 py-1.5 text-xs text-studio-text shadow-xl">
      {message}
    </div>
  );
}

// ─── Main SaveBar ─────────────────────────────────────────────────────────────

export function SaveBar() {
  const [toast, setToast] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Store accessors
  const metadata = useSceneStore((s) => s.metadata);
  const code = useSceneStore((s) => s.code);
  const setCode = useSceneStore((s) => s.setCode);
  const setMetadata = useSceneStore((s) => s.setMetadata);
  const markClean = useSceneStore((s) => s.markClean);

  const nodes = useSceneGraphStore((s) => s.nodes);
  const addNode = useSceneGraphStore((s) => s.addNode);

  const assets = useAssetStore((s) => s.assets);
  const addAsset = useAssetStore((s) => s.addAsset);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const buildScene = useCallback((): HoloScene => {
    return serializeScene(
      {
        id: metadata.id ?? '',
        name: metadata.name,
        createdAt: metadata.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      code,
      nodes,
      assets
    );
  }, [metadata, code, nodes, assets]);

  const restoreScene = useCallback(
    (scene: HoloScene) => {
      // Restore code
      if (scene.code) setCode(scene.code);

      // Restore metadata
      setMetadata({
        id: scene.metadata.id,
        name: scene.metadata.name,
        createdAt: scene.metadata.createdAt,
        updatedAt: scene.metadata.updatedAt,
      });

      // Restore scene graph nodes
      for (const node of scene.nodes ?? []) {
        addNode(node);
      }

      // Restore assets (skip duplicates by id)
      for (const asset of scene.assets ?? []) {
        addAsset(asset);
      }

      markClean();
    },
    [setCode, setMetadata, addNode, addAsset, markClean]
  );

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    downloadHoloFile(buildScene());
    showToast('Scene saved!');
    markClean();
  }, [buildScene, markClean]);

  const handleOpen = useCallback(async () => {
    const result = await openHoloFile();
    if (!result.ok || !result.scene) {
      showToast(result.error ?? 'Failed to open file');
      return;
    }
    restoreScene(result.scene);
    showToast(`Opened "${result.scene.metadata.name}"`);
  }, [restoreScene]);

  const handleShare = useCallback(async () => {
    setSharing(true);
    try {
      await copyShareURL(buildScene());
      showToast('Share URL copied!');
    } catch {
      showToast('Could not copy URL');
    }
    setSharing(false);
  }, [buildScene]);

  const handleExportGltf = useCallback(async () => {
    setExporting(true);
    try {
      const scene = buildScene();
      const res = await fetch('/api/export/gltf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scene),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        showToast(`Export failed: ${err.error}`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const slug = scene.metadata.name.replace(/\s+/g, '-').toLowerCase() || 'scene';
      a.href = url;
      a.download = `${slug}.glb`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('glTF exported!');
    } catch (e) {
      showToast(`Export error: ${String(e)}`);
    }
    setExporting(false);
  }, [buildScene]);

  // ── Render ───────────────────────────────────────────────────────────────────

  const btnBase =
    'relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition';
  const btnGhost = `${btnBase} bg-studio-surface text-studio-text hover:bg-studio-border disabled:opacity-30`;
  const btnAccent = `${btnBase} bg-studio-accent/10 text-studio-accent border border-studio-accent/30 hover:bg-studio-accent hover:text-white disabled:opacity-30`;

  return (
    <div className="relative flex items-center gap-1.5">
      {/* Save */}
      <button
        onClick={handleSave}
        title="Save scene as .holo file"
        className={btnGhost}
      >
        <Save className="h-3.5 w-3.5" />
        Save
      </button>

      {/* Open */}
      <button
        onClick={handleOpen}
        title="Open a .holo file"
        className={btnGhost}
      >
        <FolderOpen className="h-3.5 w-3.5" />
        Open
      </button>

      {/* Share URL */}
      <button
        onClick={handleShare}
        disabled={sharing}
        title="Copy shareable URL"
        className={btnGhost}
      >
        {sharing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : toast === 'Share URL copied!' ? (
          <Check className="h-3.5 w-3.5 text-studio-success" />
        ) : (
          <Share2 className="h-3.5 w-3.5" />
        )}
        Share
      </button>

      {/* Export glTF */}
      <button
        onClick={handleExportGltf}
        disabled={exporting}
        title="Export scene as glTF binary (.glb)"
        className={btnAccent}
      >
        {exporting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Package className="h-3.5 w-3.5" />
        )}
        .glb
      </button>

      {/* Toast */}
      {toast && <Toast message={toast} />}
    </div>
  );
}
