import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AvatarPartType = 'head' | 'body' | 'hair' | 'eyes' | 'mouth' | 'clothing' | 'accessory';

export interface AvatarPart {
  id: string;
  name: string;
  type: AvatarPartType;
  thumbnail: string; // emoji or URL
  traits: string[]; // HoloScript trait names
  colorizable: boolean;
  defaultColor?: string;
}

export interface AvatarConfiguration {
  head: string | null;
  body: string | null;
  hair: string | null;
  eyes: string | null;
  mouth: string | null;
  clothing: string[];
  accessories: string[];
  colors: Record<string, string>;
  scale: number;
}

export interface AvatarState {
  config: AvatarConfiguration;
  selectedPartType: AvatarPartType | null;
  isLoading: boolean;

  // Actions
  setPart: (type: AvatarPartType, partId: string | null) => void;
  addClothing: (partId: string) => void;
  removeClothing: (partId: string) => void;
  addAccessory: (partId: string) => void;
  removeAccessory: (partId: string) => void;
  setPartColor: (partId: string, color: string) => void;
  setScale: (scale: number) => void;
  setSelectedPartType: (type: AvatarPartType | null) => void;
  reset: () => void;
}

// ─── Default Parts Catalog ───────────────────────────────────────────────────

export const AVATAR_PARTS: AvatarPart[] = [
  // Heads
  { id: 'head-round', name: 'Round Head', type: 'head', thumbnail: '😊', traits: ['round_face'], colorizable: true, defaultColor: '#e8beac' },
  { id: 'head-square', name: 'Square Head', type: 'head', thumbnail: '😐', traits: ['square_face'], colorizable: true, defaultColor: '#e8beac' },
  { id: 'head-oval', name: 'Oval Head', type: 'head', thumbnail: '😌', traits: ['oval_face'], colorizable: true, defaultColor: '#e8beac' },
  { id: 'head-angular', name: 'Angular Head', type: 'head', thumbnail: '😏', traits: ['angular_face'], colorizable: true, defaultColor: '#e8beac' },

  // Bodies
  { id: 'body-standard', name: 'Standard Body', type: 'body', thumbnail: '🧍', traits: ['standard_body'], colorizable: true, defaultColor: '#e8beac' },
  { id: 'body-athletic', name: 'Athletic Body', type: 'body', thumbnail: '🏋️', traits: ['athletic_body'], colorizable: true, defaultColor: '#e8beac' },
  { id: 'body-slim', name: 'Slim Body', type: 'body', thumbnail: '🤸', traits: ['slim_body'], colorizable: true, defaultColor: '#e8beac' },
  { id: 'body-heavy', name: 'Heavy Body', type: 'body', thumbnail: '🧍‍♂️', traits: ['heavy_body'], colorizable: true, defaultColor: '#e8beac' },

  // Hair
  { id: 'hair-short', name: 'Short Hair', type: 'hair', thumbnail: '💇', traits: ['short_hair'], colorizable: true, defaultColor: '#3d2314' },
  { id: 'hair-long', name: 'Long Hair', type: 'hair', thumbnail: '💇‍♀️', traits: ['long_hair'], colorizable: true, defaultColor: '#3d2314' },
  { id: 'hair-curly', name: 'Curly Hair', type: 'hair', thumbnail: '🦱', traits: ['curly_hair'], colorizable: true, defaultColor: '#3d2314' },
  { id: 'hair-bald', name: 'Bald', type: 'hair', thumbnail: '👨‍🦲', traits: ['bald'], colorizable: false },
  { id: 'hair-spiky', name: 'Spiky Hair', type: 'hair', thumbnail: '🦹', traits: ['spiky_hair'], colorizable: true, defaultColor: '#3d2314' },

  // Eyes
  { id: 'eyes-round', name: 'Round Eyes', type: 'eyes', thumbnail: '👁️', traits: ['round_eyes'], colorizable: true, defaultColor: '#4a90d9' },
  { id: 'eyes-almond', name: 'Almond Eyes', type: 'eyes', thumbnail: '👀', traits: ['almond_eyes'], colorizable: true, defaultColor: '#4a90d9' },
  { id: 'eyes-narrow', name: 'Narrow Eyes', type: 'eyes', thumbnail: '😑', traits: ['narrow_eyes'], colorizable: true, defaultColor: '#4a90d9' },

  // Mouth
  { id: 'mouth-smile', name: 'Smile', type: 'mouth', thumbnail: '😊', traits: ['smile'], colorizable: false },
  { id: 'mouth-neutral', name: 'Neutral', type: 'mouth', thumbnail: '😐', traits: ['neutral_mouth'], colorizable: false },
  { id: 'mouth-frown', name: 'Frown', type: 'mouth', thumbnail: '🙁', traits: ['frown'], colorizable: false },
  { id: 'mouth-open', name: 'Open Mouth', type: 'mouth', thumbnail: '😮', traits: ['open_mouth'], colorizable: false },

  // Clothing
  { id: 'shirt-tshirt', name: 'T-Shirt', type: 'clothing', thumbnail: '👕', traits: ['tshirt'], colorizable: true, defaultColor: '#ffffff' },
  { id: 'shirt-hoodie', name: 'Hoodie', type: 'clothing', thumbnail: '🧥', traits: ['hoodie'], colorizable: true, defaultColor: '#808080' },
  { id: 'shirt-jacket', name: 'Jacket', type: 'clothing', thumbnail: '🧥', traits: ['jacket'], colorizable: true, defaultColor: '#4a4a4a' },
  { id: 'pants-jeans', name: 'Jeans', type: 'clothing', thumbnail: '👖', traits: ['jeans'], colorizable: true, defaultColor: '#2b4f81' },
  { id: 'pants-shorts', name: 'Shorts', type: 'clothing', thumbnail: '🩳', traits: ['shorts'], colorizable: true, defaultColor: '#808080' },
  { id: 'shoes-sneakers', name: 'Sneakers', type: 'clothing', thumbnail: '👟', traits: ['sneakers'], colorizable: true, defaultColor: '#ffffff' },
  { id: 'shoes-boots', name: 'Boots', type: 'clothing', thumbnail: '🥾', traits: ['boots'], colorizable: true, defaultColor: '#4a3c2a' },

  // Accessories
  { id: 'acc-glasses', name: 'Glasses', type: 'accessory', thumbnail: '👓', traits: ['glasses'], colorizable: true, defaultColor: '#333333' },
  { id: 'acc-sunglasses', name: 'Sunglasses', type: 'accessory', thumbnail: '🕶️', traits: ['sunglasses'], colorizable: true, defaultColor: '#1a1a1a' },
  { id: 'acc-hat', name: 'Hat', type: 'accessory', thumbnail: '🧢', traits: ['hat'], colorizable: true, defaultColor: '#d32f2f' },
  { id: 'acc-crown', name: 'Crown', type: 'accessory', thumbnail: '👑', traits: ['crown'], colorizable: true, defaultColor: '#ffd700' },
  { id: 'acc-earrings', name: 'Earrings', type: 'accessory', thumbnail: '💎', traits: ['earrings'], colorizable: true, defaultColor: '#ffd700' },
  { id: 'acc-necklace', name: 'Necklace', type: 'accessory', thumbnail: '📿', traits: ['necklace'], colorizable: true, defaultColor: '#ffd700' },
  { id: 'acc-watch', name: 'Watch', type: 'accessory', thumbnail: '⌚', traits: ['watch'], colorizable: true, defaultColor: '#c0c0c0' },
];

// ─── Default Configuration ─────────────────────────────────────────────────

const DEFAULT_CONFIG: AvatarConfiguration = {
  head: 'head-round',
  body: 'body-standard',
  hair: 'hair-short',
  eyes: 'eyes-round',
  mouth: 'mouth-smile',
  clothing: ['shirt-tshirt', 'pants-jeans', 'shoes-sneakers'],
  accessories: [],
  colors: {
    'head-round': '#e8beac',
    'body-standard': '#e8beac',
    'hair-short': '#3d2314',
    'eyes-round': '#4a90d9',
    'shirt-tshirt': '#ffffff',
    'pants-jeans': '#2b4f81',
    'shoes-sneakers': '#ffffff',
  },
  scale: 1.0,
};

// ─── Store ───────────────────────────────────────────────────────────────────

export const useAvatarStore = create<AvatarState>()(
  devtools(
    (set) => ({
      config: { ...DEFAULT_CONFIG },
      selectedPartType: null,
      isLoading: false,

      setPart: (type, partId) =>
        set((state) => {
          const part = AVATAR_PARTS.find((p) => p.id === partId);
          const newColors = { ...state.config.colors };
          if (part?.colorizable && part.defaultColor && partId) {
            newColors[partId] = part.defaultColor;
          }
          return {
            config: {
              ...state.config,
              [type]: partId,
              colors: newColors,
            },
          };
        }),

      addClothing: (partId) =>
        set((state) => ({
          config: {
            ...state.config,
            clothing: [...state.config.clothing, partId],
            colors: {
              ...state.config.colors,
              [partId]: AVATAR_PARTS.find((p) => p.id === partId)?.defaultColor || '#ffffff',
            },
          },
        })),

      removeClothing: (partId) =>
        set((state) => {
          const newColors = { ...state.config.colors };
          delete newColors[partId];
          return {
            config: {
              ...state.config,
              clothing: state.config.clothing.filter((id) => id !== partId),
              colors: newColors,
            },
          };
        }),

      addAccessory: (partId) =>
        set((state) => ({
          config: {
            ...state.config,
            accessories: [...state.config.accessories, partId],
            colors: {
              ...state.config.colors,
              [partId]: AVATAR_PARTS.find((p) => p.id === partId)?.defaultColor || '#ffd700',
            },
          },
        })),

      removeAccessory: (partId) =>
        set((state) => {
          const newColors = { ...state.config.colors };
          delete newColors[partId];
          return {
            config: {
              ...state.config,
              accessories: state.config.accessories.filter((id) => id !== partId),
              colors: newColors,
            },
          };
        }),

      setPartColor: (partId, color) =>
        set((state) => ({
          config: {
            ...state.config,
            colors: { ...state.config.colors, [partId]: color },
          },
        })),

      setScale: (scale) =>
        set((state) => ({
          config: { ...state.config, scale: Math.max(0.5, Math.min(2.0, scale)) },
        })),

      setSelectedPartType: (type) => set({ selectedPartType: type }),

      reset: () => set({ config: { ...DEFAULT_CONFIG }, selectedPartType: null }),
    }),
    { name: 'avatar-store' }
  )
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getPartById(id: string | null): AvatarPart | undefined {
  return AVATAR_PARTS.find((p) => p.id === id);
}

export function getPartsByType(type: AvatarPartType): AvatarPart[] {
  return AVATAR_PARTS.filter((p) => p.type === type);
}

export function getActiveTraits(config: AvatarConfiguration): string[] {
  const traits: string[] = [];
  const addPartTraits = (id: string | null) => {
    const part = getPartById(id);
    if (part) traits.push(...part.traits);
  };

  addPartTraits(config.head);
  addPartTraits(config.body);
  addPartTraits(config.hair);
  addPartTraits(config.eyes);
  addPartTraits(config.mouth);
  config.clothing.forEach(addPartTraits);
  config.accessories.forEach(addPartTraits);

  return [...new Set(traits)];
}

export function exportAvatarConfig(config: AvatarConfiguration): object {
  return {
    version: '1.0',
    parts: {
      head: config.head,
      body: config.body,
      hair: config.hair,
      eyes: config.eyes,
      mouth: config.mouth,
      clothing: config.clothing,
      accessories: config.accessories,
    },
    colors: config.colors,
    scale: config.scale,
    traits: getActiveTraits(config),
    exportedAt: new Date().toISOString(),
  };
}
