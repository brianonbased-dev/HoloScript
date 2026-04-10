import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for NPC role traits (63 traits).
 * NPC character roles — subtle emissive/color hints at character type.
 */
export const NPC_ROLES_VISUALS: Record<string, TraitVisualConfig> = {
  relationship: {
    material: { roughness: 0.5 },
    emissive: { color: '#FF69B4', intensity: 0.2 },
    tags: ['social'],
    layer: 'mood',
  },
  reputation: {
    material: { roughness: 0.4 },
    emissive: { color: '#FFD700', intensity: 0.15 },
    tags: ['social', 'status'],
    layer: 'mood',
  },
  schedule: {
    material: { roughness: 0.5 },
    tags: ['system'],
    layer: 'mood',
  },
  routine: {
    material: { roughness: 0.5 },
    tags: ['system'],
    layer: 'mood',
  },
  barter: {
    material: { roughness: 0.4, metalness: 0.3, color: '#C9A94E' },
    tags: ['commerce'],
    layer: 'mood',
  },
  negotiate: {
    material: { roughness: 0.4 },
    emissive: { color: '#4488CC', intensity: 0.15 },
    tags: ['social'],
    layer: 'mood',
  },
  betray: {
    material: { roughness: 0.6, color: '#4A0000' },
    emissive: { color: '#FF0000', intensity: 0.1 },
    tags: ['dark'],
    layer: 'mood',
  },
  ally: {
    material: { roughness: 0.4 },
    emissive: { color: '#44CC44', intensity: 0.15 },
    tags: ['social', 'friendly'],
    layer: 'mood',
  },
  rival: {
    material: { roughness: 0.5 },
    emissive: { color: '#CC4444', intensity: 0.15 },
    tags: ['social', 'hostile'],
    layer: 'mood',
  },
  mentor: {
    material: { roughness: 0.3 },
    emissive: { color: '#88AAFF', intensity: 0.2 },
    tags: ['wise', 'friendly'],
    layer: 'mood',
  },
  apprentice: {
    material: { roughness: 0.6 },
    emissive: { color: '#AACCFF', intensity: 0.1 },
    tags: ['young'],
    layer: 'mood',
  },
  follower: {
    material: { roughness: 0.5 },
    tags: ['social'],
    layer: 'mood',
  },
  leader: {
    material: { roughness: 0.3, metalness: 0.2 },
    emissive: { color: '#FFD700', intensity: 0.2 },
    tags: ['authority', 'status'],
    layer: 'mood',
  },
  merchant: {
    material: { roughness: 0.4, color: '#8B7355' },
    tags: ['commerce'],
    layer: 'mood',
  },
  quest_giver: {
    material: { roughness: 0.4 },
    emissive: { color: '#FFCC00', intensity: 0.3 },
    tags: ['quest', 'important'],
    layer: 'mood',
  },
  guard: {
    material: { roughness: 0.3, metalness: 0.6, color: '#708090' },
    tags: ['metallic', 'authority'],
    layer: 'mood',
  },
  healer_npc: {
    material: { roughness: 0.4 },
    emissive: { color: '#00FF88', intensity: 0.25 },
    tags: ['healing', 'magic'],
    layer: 'mood',
  },
  blacksmith: {
    material: { roughness: 0.7, metalness: 0.5, color: '#333333' },
    emissive: { color: '#FF4400', intensity: 0.15 },
    tags: ['metallic', 'fire'],
    layer: 'mood',
  },
  innkeeper: {
    material: { roughness: 0.6, color: '#8B6914' },
    tags: ['warm', 'wooden'],
    layer: 'mood',
  },
  scholar: {
    material: { roughness: 0.4, color: '#1C2951' },
    emissive: { color: '#6688CC', intensity: 0.1 },
    tags: ['wisdom'],
    layer: 'mood',
  },
  thief: {
    material: { roughness: 0.5, color: '#2C2C2C' },
    opacity: 0.85,
    tags: ['dark', 'stealth'],
    layer: 'mood',
  },
  spy: {
    material: { roughness: 0.4 },
    opacity: 0.8,
    tags: ['stealth'],
    layer: 'mood',
  },
  diplomat: {
    material: { roughness: 0.3, color: '#4A3C8C' },
    tags: ['authority', 'social'],
    layer: 'mood',
  },
  general: {
    material: { roughness: 0.3, metalness: 0.5, color: '#556B2F' },
    tags: ['authority', 'military'],
    layer: 'mood',
  },
  prophet: {
    material: { roughness: 0.3 },
    emissive: { color: '#FFFFFF', intensity: 0.3 },
    tags: ['divine', 'magic'],
    layer: 'mood',
  },
  hermit: {
    material: { roughness: 0.8, color: '#6B5B3C' },
    tags: ['worn', 'organic'],
    layer: 'mood',
  },
  bard: {
    material: { roughness: 0.4, color: '#8B008B' },
    emissive: { color: '#CC88FF', intensity: 0.15 },
    tags: ['musical', 'social'],
    layer: 'mood',
  },
  jester: {
    material: { roughness: 0.4, color: '#FF6347' },
    emissive: { color: '#FFDD00', intensity: 0.15 },
    tags: ['colorful'],
    layer: 'mood',
  },
  assassin: {
    material: { roughness: 0.5, color: '#1A1A2E' },
    opacity: 0.9,
    tags: ['dark', 'stealth'],
    layer: 'mood',
  },
  monk: {
    material: { roughness: 0.5, color: '#8B4513' },
    emissive: { color: '#FFE4B5', intensity: 0.1 },
    tags: ['spiritual'],
    layer: 'mood',
  },
  pirate: {
    material: { roughness: 0.7, color: '#2F1810' },
    tags: ['worn', 'maritime'],
    layer: 'mood',
  },
  ranger: {
    material: { roughness: 0.6, color: '#2E5E1E' },
    tags: ['nature', 'outdoor'],
    layer: 'mood',
  },
  necromancer: {
    material: { roughness: 0.5, color: '#1A0A2E' },
    emissive: { color: '#8844AA', intensity: 0.3 },
    tags: ['dark', 'magic'],
    layer: 'mood',
  },
  alchemist: {
    material: { roughness: 0.4, color: '#4A6741' },
    emissive: { color: '#88FF44', intensity: 0.2 },
    tags: ['magic', 'chemical'],
    layer: 'mood',
  },
  enchanter: {
    material: { roughness: 0.3 },
    emissive: { color: '#9966FF', intensity: 0.3 },
    tags: ['magic', 'enchanted'],
    layer: 'mood',
  },
  artificer: {
    material: { roughness: 0.4, metalness: 0.4 },
    emissive: { color: '#FFAA22', intensity: 0.2 },
    tags: ['mechanical', 'magic'],
    layer: 'mood',
  },
  summoner_npc: {
    material: { roughness: 0.4 },
    emissive: { color: '#FF44FF', intensity: 0.25 },
    tags: ['magic', 'portal'],
    layer: 'mood',
  },
  warden: {
    material: { roughness: 0.4, metalness: 0.4, color: '#4A5568' },
    tags: ['authority', 'metallic'],
    layer: 'mood',
  },
  oracle: {
    material: { roughness: 0.2 },
    emissive: { color: '#88CCFF', intensity: 0.3 },
    tags: ['divine', 'mystical'],
    layer: 'mood',
  },
  ferryman: {
    material: { roughness: 0.7, color: '#3C3C3C' },
    emissive: { color: '#446688', intensity: 0.1 },
    tags: ['dark', 'water'],
    layer: 'mood',
  },
  shopkeeper: {
    material: { roughness: 0.5, color: '#8B7355' },
    tags: ['commerce'],
    layer: 'mood',
  },
  bartender: {
    material: { roughness: 0.5, color: '#5C4033' },
    tags: ['warm', 'wooden'],
    layer: 'mood',
  },
  librarian: {
    material: { roughness: 0.4, color: '#4A3728' },
    tags: ['wisdom'],
    layer: 'mood',
  },
  archaeologist: {
    material: { roughness: 0.6, color: '#C4A882' },
    tags: ['outdoor', 'explorer'],
    layer: 'mood',
  },
  pilot: {
    material: { roughness: 0.3, metalness: 0.3, color: '#2C3E50' },
    tags: ['technical'],
    layer: 'mood',
  },
  engineer: {
    material: { roughness: 0.4, metalness: 0.3 },
    emissive: { color: '#FF8800', intensity: 0.1 },
    tags: ['technical', 'mechanical'],
    layer: 'mood',
  },
  scientist: {
    material: { roughness: 0.3, color: '#E8E8E8' },
    emissive: { color: '#44CCFF', intensity: 0.15 },
    tags: ['technical', 'clean'],
    layer: 'mood',
  },
  doctor: {
    material: { roughness: 0.3, color: '#F0F0F0' },
    emissive: { color: '#00CC66', intensity: 0.1 },
    tags: ['healing', 'clean'],
    layer: 'mood',
  },
  farmer: {
    material: { roughness: 0.7, color: '#6B4423' },
    tags: ['organic', 'outdoor'],
    layer: 'mood',
  },
  miner_npc: {
    material: { roughness: 0.8, color: '#4A4A4A' },
    tags: ['dirty', 'underground'],
    layer: 'mood',
  },
  fisher_npc: {
    material: { roughness: 0.6, color: '#4682B4' },
    tags: ['maritime', 'outdoor'],
    layer: 'mood',
  },
  hunter: {
    material: { roughness: 0.6, color: '#3B5323' },
    tags: ['nature', 'outdoor'],
    layer: 'mood',
  },
  gatherer: {
    material: { roughness: 0.6, color: '#6B8E23' },
    tags: ['nature', 'organic'],
    layer: 'mood',
  },
  nomad: {
    material: { roughness: 0.7, color: '#C4A882' },
    tags: ['worn', 'outdoor'],
    layer: 'mood',
  },
  refugee: {
    material: { roughness: 0.8, color: '#8B8378' },
    tags: ['worn', 'distressed'],
    layer: 'mood',
  },
  prisoner: {
    material: { roughness: 0.7, color: '#666666' },
    tags: ['confined', 'worn'],
    layer: 'mood',
  },
  royalty: {
    material: { roughness: 0.2, metalness: 0.4, color: '#800020' },
    emissive: { color: '#FFD700', intensity: 0.2 },
    tags: ['luxury', 'status'],
    layer: 'mood',
  },
  peasant: {
    material: { roughness: 0.8, color: '#8B7355' },
    tags: ['worn', 'simple'],
    layer: 'mood',
  },
  noble: {
    material: { roughness: 0.2, metalness: 0.3, color: '#191970' },
    emissive: { color: '#FFD700', intensity: 0.15 },
    tags: ['luxury', 'status'],
    layer: 'mood',
  },
  outlaw: {
    material: { roughness: 0.6, color: '#2F1B0E' },
    tags: ['dark', 'worn'],
    layer: 'mood',
  },
  vigilante: {
    material: { roughness: 0.5, color: '#1A1A2E' },
    emissive: { color: '#FF4444', intensity: 0.1 },
    tags: ['dark', 'combat'],
    layer: 'mood',
  },
  companion: {
    material: { roughness: 0.4 },
    emissive: { color: '#66BBFF', intensity: 0.15 },
    tags: ['friendly', 'social'],
    layer: 'mood',
  },
};
