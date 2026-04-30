'use client';

/**
 * AvatarComposer — Part selection and customization panel
 *
 * Two-column layout:
 *   Left: Part category tabs + grid of selectable parts
 *   Right: Color picker + trait info + current selection summary
 */

import { useState } from 'react';
import { Palette, Check, X, Plus, Minus } from 'lucide-react';
import {
  useAvatarStore,
  AVATAR_PARTS,
  getPartsByType,
  getPartById,
  type AvatarPartType,
} from '@/lib/stores/avatarStore';
import { logger } from '@/lib/logger';

const PART_CATEGORIES: Array<{ id: AvatarPartType; label: string; emoji: string }> = [
  { id: 'head', label: 'Head', emoji: '😊' },
  { id: 'body', label: 'Body', emoji: '🧍' },
  { id: 'hair', label: 'Hair', emoji: '💇' },
  { id: 'eyes', label: 'Eyes', emoji: '👁️' },
  { id: 'mouth', label: 'Mouth', emoji: '😊' },
  { id: 'clothing', label: 'Clothing', emoji: '👕' },
  { id: 'accessory', label: 'Accessories', emoji: '👓' },
];

const PRESET_COLORS = [
  '#e8beac', '#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#ffdbac',
  '#3d2314', '#5c3a1e', '#8b6914', '#c0c0c0', '#ffd700', '#ffffff',
  '#d32f2f', '#1976d2', '#388e3c', '#f57c00', '#7b1fa2', '#333333',
];

export function AvatarComposer() {
  const [activeCategory, setActiveCategory] = useState<AvatarPartType>('head');
  const config = useAvatarStore((s) => s.config);
  const setPart = useAvatarStore((s) => s.setPart);
  const addClothing = useAvatarStore((s) => s.addClothing);
  const removeClothing = useAvatarStore((s) => s.removeClothing);
  const addAccessory = useAvatarStore((s) => s.addAccessory);
  const removeAccessory = useAvatarStore((s) => s.removeAccessory);
  const setPartColor = useAvatarStore((s) => s.setPartColor);
  const setScale = useAvatarStore((s) => s.setScale);

  const parts = getPartsByType(activeCategory);

  const isSelected = (partId: string) => {
    if (activeCategory === 'clothing') return config.clothing.includes(partId);
    if (activeCategory === 'accessory') return config.accessories.includes(partId);
    return config[activeCategory] === partId;
  };

  const handleSelect = (partId: string) => {
    if (activeCategory === 'clothing') {
      if (isSelected(partId)) {
        removeClothing(partId);
      } else {
        addClothing(partId);
      }
    } else if (activeCategory === 'accessory') {
      if (isSelected(partId)) {
        removeAccessory(partId);
      } else {
        addAccessory(partId);
      }
    } else {
      setPart(activeCategory, isSelected(partId) ? null : partId);
    }
    logger.debug('[AvatarComposer] Selected part:', partId);
  };

  const selectedPartId =
    activeCategory === 'clothing'
      ? config.clothing[config.clothing.length - 1] || null
      : activeCategory === 'accessory'
        ? config.accessories[config.accessories.length - 1] || null
        : config[activeCategory];

  const selectedPart = getPartById(selectedPartId);

  return (
    <div className="flex h-full">
      {/* Left: Category tabs + part grid */}
      <div className="flex w-80 flex-col border-r border-studio-border bg-studio-panel">
        {/* Category tabs */}
        <div data-testid="composer-categories" className="flex overflow-x-auto border-b border-studio-border px-2 py-2">
          {PART_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                activeCategory === cat.id
                  ? 'bg-purple-500/20 text-purple-300'
                  : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <span>{cat.emoji}</span>
              {cat.label}
            </button>
          ))}
        </div>

        {/* Part grid */}
        <div data-testid="composer-part-grid" className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-3 gap-2">
            {parts.map((part) => {
              const selected = isSelected(part.id);
              return (
                <button
                  key={part.id}
                  onClick={() => handleSelect(part.id)}
                  className={`relative flex flex-col items-center gap-1 rounded-xl border p-3 transition hover:border-purple-500/40 ${
                    selected
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-studio-border bg-black/20'
                  }`}
                >
                  <span className="text-2xl">{part.thumbnail}</span>
                  <span className="text-[10px] text-studio-text">{part.name}</span>
                  {selected && (
                    <div className="absolute right-1 top-1 rounded-full bg-purple-500 p-0.5">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right: Customization panel */}
      <div className="flex w-72 flex-col border-r border-studio-border bg-studio-panel">
        <div className="border-b border-studio-border p-4">
          <h3 className="text-sm font-semibold text-white">Customization</h3>
          <p className="mt-1 text-xs text-studio-muted">
            {selectedPart ? selectedPart.name : 'Select a part to customize'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Color picker */}
          {selectedPart?.colorizable && (
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold text-white">
                <Palette className="h-3.5 w-3.5" /> Color
              </label>
              <div className="mt-2 grid grid-cols-6 gap-1">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => selectedPartId && setPartColor(selectedPartId, color)}
                    className={`h-7 w-7 rounded-full border transition hover:scale-110 ${
                      selectedPartId && config.colors[selectedPartId] === color
                        ? 'border-white'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="color"
                  value={selectedPartId ? config.colors[selectedPartId] || '#ffffff' : '#ffffff'}
                  onChange={(e) => selectedPartId && setPartColor(selectedPartId, e.target.value)}
                  className="h-8 w-8 rounded border border-studio-border bg-transparent"
                />
                <span className="text-xs text-studio-muted">
                  {selectedPartId ? config.colors[selectedPartId] || '#ffffff' : '#ffffff'}
                </span>
              </div>
            </div>
          )}

          {/* Scale */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-white">
              <Minus className="h-3.5 w-3.5" /> Scale<Plus className="h-3.5 w-3.5" />
            </label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={config.scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="mt-2 w-full accent-purple-500"
            />
            <div className="mt-1 text-right text-xs text-studio-muted">{config.scale.toFixed(1)}x</div>
          </div>

          {/* Traits */}
          {selectedPart && selectedPart.traits.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-white">Traits</label>
              <div className="mt-2 flex flex-wrap gap-1">
                {selectedPart.traits.map((trait) => (
                  <span
                    key={trait}
                    className="rounded bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-300"
                  >
                    {trait}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Current selection summary */}
          <div className="rounded-lg border border-studio-border bg-black/20 p-3">
            <p className="text-xs font-semibold text-white">Active Parts</p>
            <div className="mt-2 space-y-1">
              {[
                ['Head', config.head],
                ['Body', config.body],
                ['Hair', config.hair],
                ['Eyes', config.eyes],
                ['Mouth', config.mouth],
                ...config.clothing.map((id) => ['Clothing', id]),
                ...config.accessories.map((id) => ['Accessory', id]),
              ]
                .filter(([, id]) => id)
                .map(([type, id]) => {
                  const part = getPartById(id as string);
                  return (
                    <div key={id} className="flex items-center justify-between text-xs">
                      <span className="text-studio-muted">
                        {type}: <span className="text-white">{part?.name || id}</span>
                      </span>
                      <div
                        className="h-3 w-3 rounded-full border border-studio-border"
                        style={{
                          backgroundColor: part?.colorizable ? config.colors[id as string] || part.defaultColor : 'transparent',
                        }}
                      />
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>

      {/* Center: Composition preview (placeholder) */}
      <div className="flex flex-1 flex-col items-center justify-center bg-studio-bg">
        <div className="text-center">
          <div className="text-8xl mb-4">🧑‍🎨</div>
          <p className="text-lg font-semibold text-white">Avatar Composer</p>
          <p className="mt-2 text-sm text-studio-muted max-w-md">
            Select parts from the left panel to assemble your avatar.
            Use the Preview tab for a 3D view.
          </p>

          <div className="mt-6 inline-flex flex-wrap justify-center gap-2">
            {config.head && <span className="text-2xl" title="Head">{getPartById(config.head)?.thumbnail}</span>}
            {config.body && <span className="text-2xl" title="Body">{getPartById(config.body)?.thumbnail}</span>}
            {config.hair && <span className="text-2xl" title="Hair">{getPartById(config.hair)?.thumbnail}</span>}
            {config.eyes && <span className="text-2xl" title="Eyes">{getPartById(config.eyes)?.thumbnail}</span>}
            {config.mouth && <span className="text-2xl" title="Mouth">{getPartById(config.mouth)?.thumbnail}</span>}
            {config.clothing.map((id) => (
              <span key={id} className="text-2xl" title={getPartById(id)?.name}>{getPartById(id)?.thumbnail}</span>
            ))}
            {config.accessories.map((id) => (
              <span key={id} className="text-2xl" title={getPartById(id)?.name}>{getPartById(id)?.thumbnail}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
