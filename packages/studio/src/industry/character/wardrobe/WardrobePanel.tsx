'use client';

/**
 * WardrobePanel — Hair, Clothing & Accessories equip panel
 *
 * Tabbed interface for browsing and equipping wardrobe items on
 * the character. Items are organized by slot: Hair, Tops, Bottoms,
 * Shoes, and Accessories.
 */

import { useState } from 'react';
import {
  useCharacterStore,
  useWardrobeStore,
  type WardrobeSlot,
  type WardrobeItem,
} from '@/lib/stores';
import { Shirt, Scissors, Footprints, Sparkles, X } from 'lucide-react';
import { BUILTIN_ITEMS } from '@/data/wardrobeItems';

// ── Slot tab config ─────────────────────────────────────────────────────────

const SLOT_TABS: { slot: WardrobeSlot | 'all'; label: string; icon: React.ReactNode }[] = [
  { slot: 'hair', label: 'Hair', icon: <Scissors className="h-3 w-3" /> },
  { slot: 'top', label: 'Tops', icon: <Shirt className="h-3 w-3" /> },
  { slot: 'bottom', label: 'Bottoms', icon: <Shirt className="h-3 w-3 rotate-180" /> },
  { slot: 'shoes', label: 'Shoes', icon: <Footprints className="h-3 w-3" /> },
  { slot: 'accessory_1', label: 'Acc', icon: <Sparkles className="h-3 w-3" /> },
];

// ── Item card ───────────────────────────────────────────────────────────────

function ItemCard({ item, isEquipped }: { item: WardrobeItem; isEquipped: boolean }) {
  const equipItem = useWardrobeStore((s) => s.equipItem);
  const unequipSlot = useWardrobeStore((s) => s.unequipSlot);

  return (
    <button
      onClick={() => (isEquipped ? unequipSlot(item.slot) : equipItem(item))}
      className={`relative flex flex-col items-center gap-1 rounded-lg border p-2 transition ${
        isEquipped
          ? 'border-purple-500 bg-purple-500/10 text-purple-300'
          : 'border-studio-border bg-black/10 text-studio-muted hover:border-purple-500/40 hover:text-studio-text'
      }`}
      title={isEquipped ? `Unequip ${item.name}` : `Equip ${item.name}`}
    >
      <span className="text-xl">{item.thumbnail}</span>
      <span className="text-[9px] font-medium truncate w-full text-center">{item.name}</span>
      {isEquipped && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-purple-500 text-[8px] text-white">
          <X className="h-2.5 w-2.5" />
        </span>
      )}
    </button>
  );
}

// ── Main panel ──────────────────────────────────────────────────────────────

export function WardrobePanel() {
  const [activeSlot, setActiveSlot] = useState<WardrobeSlot | 'all'>('hair');
  const equippedItems = useWardrobeStore((s) => s.equippedItems);
  const clearWardrobe = useWardrobeStore((s) => s.clearWardrobe);
  const glbUrl = useCharacterStore((s) => s.glbUrl);

  const filteredItems =
    activeSlot === 'all' ? BUILTIN_ITEMS : BUILTIN_ITEMS.filter((i) => i.slot === activeSlot);

  const equippedCount = Object.keys(equippedItems).length;

  return (
    <div className="flex h-full w-56 shrink-0 flex-col border-r border-studio-border bg-studio-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-studio-border px-3 py-2">
        <p className="text-xs font-semibold text-studio-text">
          Wardrobe {equippedCount > 0 && <span className="text-purple-400">({equippedCount})</span>}
        </p>
      </div>

      {/* Slot tabs */}
      <div className="flex border-b border-studio-border overflow-x-auto">
        {SLOT_TABS.map((tab) => (
          <button
            key={tab.slot}
            onClick={() => setActiveSlot(tab.slot)}
            className={`flex flex-1 items-center justify-center gap-1 py-1.5 text-[10px] font-medium transition ${
              activeSlot === tab.slot
                ? 'border-b-2 border-purple-500 text-purple-400'
                : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Item grid */}
      {!glbUrl ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <span className="text-3xl">👔</span>
          <p className="text-xs text-studio-muted">Load a character to browse wardrobe</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          <div className="grid grid-cols-3 gap-1.5">
            {filteredItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                isEquipped={equippedItems[item.slot]?.id === item.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Equipped summary + clear */}
      {equippedCount > 0 && (
        <div className="border-t border-studio-border p-2">
          <div className="mb-1.5 flex flex-wrap gap-1">
            {Object.values(equippedItems).map(
              (item) =>
                item && (
                  <span
                    key={item.id}
                    className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[9px] text-purple-300"
                  >
                    {item.thumbnail} {item.name}
                  </span>
                )
            )}
          </div>
          <button
            onClick={clearWardrobe}
            className="w-full rounded-lg border border-studio-border py-1 text-[10px] text-studio-muted transition hover:border-red-400/40 hover:text-red-400"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

export { BUILTIN_ITEMS };
