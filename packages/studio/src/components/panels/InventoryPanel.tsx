'use client';
/** InventoryPanel — Item inventory manager */
import React from 'react';
import { useInventory } from '../../hooks/useInventory';

const RARITY_COLORS: Record<string, string> = {
  common: 'text-gray-400',
  uncommon: 'text-emerald-400',
  rare: 'text-blue-400',
  epic: 'text-purple-400',
  legendary: 'text-amber-400',
};
const CAT_ICONS: Record<string, string> = {
  weapon: '⚔️',
  armor: '🛡️',
  consumable: '🧪',
  material: '💎',
  quest: '📜',
  misc: '🔮',
};

export function InventoryPanel() {
  const {
    slots,
    weight,
    maxWeight,
    slotCount,
    maxSlots,
    sampleItems,
    addItem,
    removeItem,
    sortBy,
    addRandom,
    reset,
  } = useInventory();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🎒 Inventory</h3>
        <span className="text-[10px] text-studio-muted">
          {slotCount}/{maxSlots} slots · {weight}/{maxWeight} kg
        </span>
      </div>

      {/* Weight bar */}
      <div className="w-full bg-studio-panel rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${weight / maxWeight > 0.8 ? 'bg-red-500' : 'bg-studio-accent'}`}
          style={{ width: `${Math.min(100, (weight / maxWeight) * 100)}%` }}
        />
      </div>

      {/* Add item buttons */}
      <div className="grid grid-cols-3 gap-1">
        {sampleItems.map((item) => (
          <button
            key={item.id}
            onClick={() => addItem(item)}
            className={`flex items-center gap-1 px-1.5 py-1 rounded text-[10px] transition bg-studio-panel/40 hover:bg-studio-accent/20 ${RARITY_COLORS[item.rarity]}`}
          >
            {CAT_ICONS[item.category]} {item.name.split(' ')[0]}
          </button>
        ))}
      </div>

      <div className="flex gap-1">
        <button
          onClick={addRandom}
          className="flex-1 px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          🎲 Random
        </button>
        <select
          onChange={(e) => sortBy(e.target.value as any)}
          className="px-2 py-1 bg-studio-panel text-studio-muted rounded text-[10px]"
        >
          <option value="name">Sort: Name</option>
          <option value="rarity">Sort: Rarity</option>
          <option value="category">Sort: Category</option>
          <option value="weight">Sort: Weight</option>
        </select>
        <button
          onClick={reset}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺
        </button>
      </div>

      {/* Slot list */}
      <div className="space-y-1 max-h-[140px] overflow-y-auto">
        {slots.length === 0 && <p className="text-studio-muted">Add items to begin.</p>}
        {slots.map((slot) => (
          <div
            key={slot.slotIndex}
            className="flex items-center justify-between bg-studio-panel/30 rounded px-2 py-1"
          >
            <div className="flex items-center gap-1.5">
              <span>{CAT_ICONS[slot.item.category]}</span>
              <span className={`font-medium ${RARITY_COLORS[slot.item.rarity]}`}>
                {slot.item.name}
              </span>
              {slot.quantity > 1 && (
                <span className="text-studio-muted text-[10px]">×{slot.quantity}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-studio-muted text-[10px]">
                {(slot.item.weight * slot.quantity).toFixed(1)}kg
              </span>
              <button onClick={() => removeItem(slot.item.id)} className="text-red-400 text-[10px]">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
