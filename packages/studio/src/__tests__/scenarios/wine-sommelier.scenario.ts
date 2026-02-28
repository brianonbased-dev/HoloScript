/**
 * wine-sommelier.scenario.ts — LIVING-SPEC: Wine Sommelier
 *
 * Persona: Isabelle — master sommelier who pairs wines with cuisine,
 * manages a cellar, and scores aging potential.
 */

import { describe, it, expect } from 'vitest';
import {
  pairingScore, bestPairing, cellarValue, cellarTotalBottles,
  winesAtPeak, winesPastPrime, agingPotential,
  servingTemperatureC, decantTimeMinutes,
  type WineProfile, type CellarEntry,
} from '@/lib/wineSommelier';

const cabernet: WineProfile = { id: 'w1', name: 'Napa Cab', color: 'red', varietal: 'cabernet-sauvignon', region: 'Napa Valley', vintage: 2018, abv: 14.5, tastingNotes: ['blackberry', 'oak', 'vanilla'], acidity: 3, tannins: 5, body: 5, sweetness: 1, score: 92, priceUSD: 85 };
const chardonnay: WineProfile = { id: 'w2', name: 'Burgundy Chard', color: 'white', varietal: 'chardonnay', region: 'Burgundy', vintage: 2020, abv: 13, tastingNotes: ['apple', 'citrus', 'mineral'], acidity: 4, tannins: 1, body: 3, sweetness: 1, score: 88, priceUSD: 55 };
const riesling: WineProfile = { id: 'w3', name: 'Mosel Riesling', color: 'white', varietal: 'riesling', region: 'Mosel', vintage: 2021, abv: 11, tastingNotes: ['peach', 'honey', 'floral'], acidity: 5, tannins: 1, body: 2, sweetness: 3, score: 90, priceUSD: 35 };

describe('Scenario: Wine Sommelier — Food Pairing', () => {
  it('red cab pairs well with beef (high score)', () => {
    expect(pairingScore('beef', cabernet)).toBe(100);
  });

  it('white pairs better with fish than red', () => {
    expect(pairingScore('fish', chardonnay)).toBeGreaterThan(pairingScore('fish', cabernet));
  });

  it('bestPairing(beef) picks cabernet over chardonnay', () => {
    const best = bestPairing('beef', [cabernet, chardonnay, riesling]);
    expect(best!.id).toBe('w1');
  });

  it('bestPairing(fish) picks chardonnay', () => {
    const best = bestPairing('fish', [cabernet, chardonnay, riesling]);
    expect(best!.color).toBe('white');
  });

  it('bestPairing returns null for empty array', () => {
    expect(bestPairing('beef', [])).toBeNull();
  });
});

describe('Scenario: Wine Sommelier — Cellar', () => {
  const entries: CellarEntry[] = [
    { wine: cabernet, quantity: 6, purchaseDate: Date.now(), drinkByYear: 2035, location: 'A3', peakYear: 2026 },
    { wine: chardonnay, quantity: 3, purchaseDate: Date.now(), drinkByYear: 2025, location: 'B1', peakYear: 2023 },
  ];

  it('cellarValue = 6×85 + 3×55 = 675', () => {
    expect(cellarValue(entries)).toBe(675);
  });

  it('cellarTotalBottles = 9', () => {
    expect(cellarTotalBottles(entries)).toBe(9);
  });

  it('winesAtPeak(2026) includes cabernet', () => {
    const peak = winesAtPeak(entries, 2026);
    expect(peak).toHaveLength(1);
    expect(peak[0].wine.name).toBe('Napa Cab');
  });

  it('winesPastPrime(2036) includes cabernet', () => {
    expect(winesPastPrime(entries, 2036)).toHaveLength(2);
  });
});

describe('Scenario: Wine Sommelier — Aging & Service', () => {
  it('agingPotential: high-tannin cab ages longest', () => {
    expect(agingPotential(cabernet)).toBeGreaterThan(agingPotential(riesling));
  });

  it('servingTemperatureC: red = 16-18°C', () => {
    const temp = servingTemperatureC('red');
    expect(temp.min).toBe(16);
    expect(temp.max).toBe(18);
  });

  it('servingTemperatureC: sparkling = 6-8°C', () => {
    const temp = servingTemperatureC('sparkling');
    expect(temp.max).toBe(8);
  });

  it('decantTimeMinutes: young tannic wine = 120 min', () => {
    expect(decantTimeMinutes(5, 2022, 2024)).toBe(120);
  });

  it('decantTimeMinutes: low tannin = 0', () => {
    expect(decantTimeMinutes(1, 2020, 2024)).toBe(0);
  });

  it.todo('blind tasting — feature extraction from aroma/palate descriptors');
  it.todo('terroir map — soil type × altitude × microclimate visualization');
});
