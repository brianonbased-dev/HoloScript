/**
 * Built-in wardrobe item catalogue
 * Extracted from WardrobePanel.tsx for clean imports in tests.
 */

import type { WardrobeItem } from '@/lib/stores';

export const BUILTIN_ITEMS: WardrobeItem[] = [
  // Hair (4)
  { id: 'hair_short', name: 'Short Cut', slot: 'hair', thumbnail: '💇', category: 'hair' },
  { id: 'hair_long', name: 'Long Flow', slot: 'hair', thumbnail: '💇‍♀️', category: 'hair' },
  { id: 'hair_mohawk', name: 'Mohawk', slot: 'hair', thumbnail: '🦔', category: 'hair' },
  { id: 'hair_bun', name: 'Top Bun', slot: 'hair', thumbnail: '🧑‍🦰', category: 'hair' },

  // Tops (4)
  { id: 'top_tshirt', name: 'T-Shirt', slot: 'top', thumbnail: '👕', category: 'casual' },
  { id: 'top_hoodie', name: 'Hoodie', slot: 'top', thumbnail: '🧥', category: 'casual' },
  { id: 'top_blazer', name: 'Blazer', slot: 'top', thumbnail: '🤵', category: 'formal' },
  { id: 'top_armor', name: 'Plate Armor', slot: 'top', thumbnail: '🛡️', category: 'fantasy' },

  // Bottoms (3)
  { id: 'bot_jeans', name: 'Jeans', slot: 'bottom', thumbnail: '👖', category: 'casual' },
  { id: 'bot_shorts', name: 'Shorts', slot: 'bottom', thumbnail: '🩳', category: 'casual' },
  { id: 'bot_skirt', name: 'Skirt', slot: 'bottom', thumbnail: '💃', category: 'formal' },

  // Shoes (3)
  { id: 'shoe_sneakers', name: 'Sneakers', slot: 'shoes', thumbnail: '👟', category: 'casual' },
  { id: 'shoe_boots', name: 'Boots', slot: 'shoes', thumbnail: '🥾', category: 'adventure' },
  { id: 'shoe_heels', name: 'Heels', slot: 'shoes', thumbnail: '👠', category: 'formal' },

  // Accessories (6)
  {
    id: 'acc_glasses',
    name: 'Glasses',
    slot: 'accessory_1',
    thumbnail: '👓',
    category: 'accessories',
  },
  { id: 'acc_hat', name: 'Cap', slot: 'accessory_1', thumbnail: '🧢', category: 'accessories' },
  { id: 'acc_wings', name: 'Wings', slot: 'accessory_2', thumbnail: '🪽', category: 'fantasy' },
  {
    id: 'acc_backpack',
    name: 'Backpack',
    slot: 'accessory_2',
    thumbnail: '🎒',
    category: 'accessories',
  },
  {
    id: 'acc_necklace',
    name: 'Necklace',
    slot: 'accessory_1',
    thumbnail: '📿',
    category: 'accessories',
  },
  { id: 'acc_mask', name: 'Mask', slot: 'accessory_2', thumbnail: '🎭', category: 'fantasy' },
];
