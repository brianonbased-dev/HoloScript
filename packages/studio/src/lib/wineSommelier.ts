/**
 * wineSommelier.ts — Wine Sommelier & Cellar Engine
 *
 * Tasting notes, food pairing, cellar management,
 * aging curves, terroir analysis, and vintage scoring.
 */

export type WineColor = 'red' | 'white' | 'rosé' | 'sparkling' | 'dessert' | 'fortified';
export type GrapeVarietal = 'cabernet-sauvignon' | 'merlot' | 'pinot-noir' | 'chardonnay' | 'sauvignon-blanc' | 'riesling' | 'syrah' | 'tempranillo' | 'nebbiolo' | 'sangiovese';
export type TastingNote = 'cherry' | 'blackberry' | 'plum' | 'citrus' | 'apple' | 'peach' | 'vanilla' | 'oak' | 'pepper' | 'earth' | 'mineral' | 'floral' | 'honey' | 'tobacco' | 'leather';
export type FoodCategory = 'beef' | 'poultry' | 'fish' | 'pasta' | 'cheese' | 'dessert' | 'salad' | 'pork' | 'lamb' | 'shellfish';

export interface WineProfile {
  id: string;
  name: string;
  color: WineColor;
  varietal: GrapeVarietal;
  region: string;
  vintage: number;
  abv: number;                // Alcohol by volume %
  tastingNotes: TastingNote[];
  acidity: number;            // 1-5 (low to high)
  tannins: number;            // 1-5
  body: number;               // 1-5 (light to full)
  sweetness: number;          // 1-5 (dry to sweet)
  score: number;              // 0-100 (critic score)
  priceUSD: number;
}

export interface CellarEntry {
  wine: WineProfile;
  quantity: number;
  purchaseDate: number;
  drinkByYear: number;
  location: string;           // e.g., 'Rack A, Row 3'
  peakYear: number;
}

export interface PairingResult {
  food: FoodCategory;
  wine: WineProfile;
  compatibility: number;      // 0-100
  reason: string;
}

// ═══════════════════════════════════════════════════════════════════
// Pairing Rules
// ═══════════════════════════════════════════════════════════════════

const PAIRING_MATRIX: Record<FoodCategory, { preferColors: WineColor[]; preferBody: [number, number]; preferTannins: [number, number] }> = {
  beef:      { preferColors: ['red'], preferBody: [4, 5], preferTannins: [3, 5] },
  lamb:      { preferColors: ['red'], preferBody: [3, 5], preferTannins: [3, 5] },
  pork:      { preferColors: ['red', 'white', 'rosé'], preferBody: [2, 4], preferTannins: [1, 3] },
  poultry:   { preferColors: ['white', 'rosé', 'red'], preferBody: [2, 4], preferTannins: [1, 3] },
  fish:      { preferColors: ['white', 'rosé'], preferBody: [1, 3], preferTannins: [1, 2] },
  shellfish: { preferColors: ['white', 'sparkling'], preferBody: [1, 3], preferTannins: [1, 2] },
  pasta:     { preferColors: ['red', 'white'], preferBody: [2, 4], preferTannins: [1, 4] },
  cheese:    { preferColors: ['red', 'white', 'dessert', 'fortified'], preferBody: [2, 5], preferTannins: [1, 4] },
  salad:     { preferColors: ['white', 'rosé', 'sparkling'], preferBody: [1, 3], preferTannins: [1, 2] },
  dessert:   { preferColors: ['dessert', 'sparkling', 'fortified'], preferBody: [2, 5], preferTannins: [1, 3] },
};

export function pairingScore(food: FoodCategory, wine: WineProfile): number {
  const rules = PAIRING_MATRIX[food];
  let score = 0;
  if (rules.preferColors.includes(wine.color)) score += 40;
  if (wine.body >= rules.preferBody[0] && wine.body <= rules.preferBody[1]) score += 30;
  if (wine.tannins >= rules.preferTannins[0] && wine.tannins <= rules.preferTannins[1]) score += 30;
  return score;
}

export function bestPairing(food: FoodCategory, wines: WineProfile[]): WineProfile | null {
  if (wines.length === 0) return null;
  return wines.reduce((best, w) => pairingScore(food, w) > pairingScore(food, best) ? w : best);
}

// ═══════════════════════════════════════════════════════════════════
// Cellar Management
// ═══════════════════════════════════════════════════════════════════

export function cellarValue(entries: CellarEntry[]): number {
  return entries.reduce((sum, e) => sum + e.wine.priceUSD * e.quantity, 0);
}

export function cellarTotalBottles(entries: CellarEntry[]): number {
  return entries.reduce((sum, e) => sum + e.quantity, 0);
}

export function winesAtPeak(entries: CellarEntry[], currentYear: number): CellarEntry[] {
  return entries.filter(e => currentYear >= e.peakYear && currentYear <= e.drinkByYear);
}

export function winesPastPrime(entries: CellarEntry[], currentYear: number): CellarEntry[] {
  return entries.filter(e => currentYear > e.drinkByYear);
}

// ═══════════════════════════════════════════════════════════════════
// Aging & Scoring
// ═══════════════════════════════════════════════════════════════════

export function agingPotential(wine: WineProfile): number {
  // Years wine can age based on tannins, acidity, ABV
  return Math.round(wine.tannins * 3 + wine.acidity * 2 + (wine.abv > 13 ? 3 : 0));
}

export function servingTemperatureC(color: WineColor): { min: number; max: number } {
  const temps: Record<WineColor, { min: number; max: number }> = {
    red: { min: 16, max: 18 }, white: { min: 8, max: 12 }, rosé: { min: 8, max: 10 },
    sparkling: { min: 6, max: 8 }, dessert: { min: 10, max: 14 }, fortified: { min: 14, max: 18 },
  };
  return temps[color];
}

export function decantTimeMinutes(tannins: number, vintage: number, currentYear: number): number {
  const age = currentYear - vintage;
  if (tannins >= 4 && age < 5) return 120;
  if (tannins >= 3 && age < 10) return 60;
  if (tannins >= 2) return 30;
  return 0;
}
