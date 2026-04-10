// @ts-nocheck
'use client';

/**
 * CharacterExportPanel — Character export UI
 *
 * Renamed from ExportPanel to avoid naming collision with the scene-level
 * ExportPanel at '@/components/export/ExportPanel'.
 *
 * Provides a download button that packages the current character state
 * (morph targets, wardrobe, skin color, expression) into a JSON bundle
 * for use in other tools or the HoloScript runtime.
 *
 * Uses the existing /api/export route for GLB/GLTF scene export,
 * and offers a lightweight JSON "Character Card" for the avatar state.
 */

import { useState } from 'react';
import { useCharacterStore, type WardrobeSlot, type WardrobeItem } from '@/lib/stores';
import { Download, FileJson, Package } from 'lucide-react';
import { logger } from '@/lib/logger';

// ── Character Card export ───────────────────────────────────────────────────

export interface CharacterCard {
  version: '1.0';
  exportedAt: string;
  generator: string;
  character: {
    morphTargets: Record<string, number>;
    skinColor: string;
    equippedItems: Partial<Record<WardrobeSlot, WardrobeItem>>;
  };
}

export function buildCharacterCard(store: {
  morphTargets: Record<string, number>;
  skinColor: string;
  equippedItems: Partial<Record<WardrobeSlot, WardrobeItem>>;
}): CharacterCard {
  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    generator: 'HoloScript Studio',
    character: {
      morphTargets: { ...store.morphTargets },
      skinColor: store.skinColor,
      equippedItems: { ...store.equippedItems },
    },
  };
}

// ── Download helper ─────────────────────────────────────────────────────────

function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Panel ───────────────────────────────────────────────────────────────────

export function CharacterExportPanel() {
  const [exporting, setExporting] = useState(false);
  const morphTargets = useCharacterStore((s) => s.morphTargets);
  const skinColor = useCharacterStore((s) => s.skinColor);
  const equippedItems = useCharacterStore((s) => s.equippedItems);
  const glbUrl = useCharacterStore((s) => s.glbUrl);

  const morphCount = Object.keys(morphTargets).length;
  const equippedCount = Object.keys(equippedItems).length;

  const handleExportCard = () => {
    const card = buildCharacterCard({ morphTargets, skinColor, equippedItems });
    downloadJSON(card, `character_${Date.now()}.json`);
  };

  const handleExportBundle = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: '',
          format: 'json',
          sceneName: 'Character',
          nodes: [
            {
              id: 'character_root',
              name: 'Character',
              type: 'avatar',
              traits: [
                { name: '@morph', properties: morphTargets },
                { name: '@skin', properties: { color: skinColor } },
                ...Object.entries(equippedItems).map(([slot, item]) => ({
                  name: '@equipped',
                  properties: { slot, itemId: item?.id, itemName: item?.name },
                })),
              ],
              position: [0, 0, 0],
              rotation: [0, 0, 0],
              scale: [1, 1, 1],
            },
          ],
        }),
      });

      if (!res.ok) throw new Error(`Export failed: ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `character_bundle_${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      logger.error('[ExportPanel] Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs font-semibold text-studio-text">Export Character</p>

      {/* Stats */}
      <div className="flex gap-2 text-[10px] text-studio-muted">
        <span>🎛️ {morphCount} morphs</span>
        <span>👔 {equippedCount} items</span>
        <span>🎨 {skinColor}</span>
      </div>

      {/* Character Card (JSON) */}
      <button
        onClick={handleExportCard}
        disabled={!glbUrl}
        className="flex items-center gap-2 rounded-lg border border-studio-border px-3 py-2 text-[11px] transition
                   hover:border-purple-500/40 hover:text-purple-300 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <FileJson className="h-4 w-4 text-purple-400" />
        <div className="flex flex-col items-start">
          <span className="font-medium text-studio-text">Character Card (.json)</span>
          <span className="text-[9px] text-studio-muted">Morphs + wardrobe + skin</span>
        </div>
      </button>

      {/* Full Bundle (ZIP) */}
      <button
        onClick={handleExportBundle}
        disabled={!glbUrl || exporting}
        className="flex items-center gap-2 rounded-lg border border-studio-border px-3 py-2 text-[11px] transition
                   hover:border-purple-500/40 hover:text-purple-300 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Package className="h-4 w-4 text-blue-400" />
        <div className="flex flex-col items-start">
          <span className="font-medium text-studio-text">
            {exporting ? 'Exporting…' : 'Full Bundle (.zip)'}
          </span>
          <span className="text-[9px] text-studio-muted">JSON + source via /api/export</span>
        </div>
      </button>

      {/* Download icon link */}
      {glbUrl && (
        <a
          href={glbUrl}
          download="character_model.glb"
          className="flex items-center gap-2 rounded-lg border border-studio-border px-3 py-2 text-[11px] transition
                     hover:border-green-500/40 hover:text-green-300"
        >
          <Download className="h-4 w-4 text-green-400" />
          <div className="flex flex-col items-start">
            <span className="font-medium text-studio-text">Download GLB</span>
            <span className="text-[9px] text-studio-muted">Raw model file</span>
          </div>
        </a>
      )}
    </div>
  );
}

/** @deprecated Use CharacterExportPanel instead */
export const ExportPanel = CharacterExportPanel;
