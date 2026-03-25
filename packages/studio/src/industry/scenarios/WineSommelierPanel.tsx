/**
 * WineSommelierPanel.tsx — Wine Sommelier & Cellar Manager
 *
 * Food pairing engine, cellar inventory, aging calculator,
 * serving temperature guide — powered by wineSommelier.ts.
 */

import React, { useState, useMemo } from 'react';
import {
  pairingScore,
  bestPairing,
  cellarValue,
  cellarTotalBottles,
  winesAtPeak,
  winesPastPrime,
  agingPotential,
  servingTemperatureC,
  decantTimeMinutes,
  type WineProfile,
  type CellarEntry,
  type FoodCategory,
} from '@/lib/wineSommelier';

const FOOD_EMOJIS: Record<FoodCategory, string> = {
  beef: '🥩',
  poultry: '🍗',
  fish: '🐟',
  pasta: '🍝',
  cheese: '🧀',
  dessert: '🍰',
  salad: '🥗',
  pork: '🥓',
  lamb: '🍖',
  shellfish: '🦞',
};

const WINES: WineProfile[] = [
  {
    id: 'w1',
    name: 'Napa Cabernet',
    color: 'red',
    varietal: 'cabernet-sauvignon',
    region: 'Napa Valley',
    vintage: 2018,
    abv: 14.5,
    tastingNotes: ['blackberry', 'oak', 'vanilla'],
    acidity: 3,
    tannins: 5,
    body: 5,
    sweetness: 1,
    score: 92,
    priceUSD: 85,
  },
  {
    id: 'w2',
    name: 'Burgundy Chardonnay',
    color: 'white',
    varietal: 'chardonnay',
    region: 'Burgundy',
    vintage: 2020,
    abv: 13,
    tastingNotes: ['apple', 'citrus', 'mineral'],
    acidity: 4,
    tannins: 1,
    body: 3,
    sweetness: 1,
    score: 88,
    priceUSD: 55,
  },
  {
    id: 'w3',
    name: 'Mosel Riesling',
    color: 'white',
    varietal: 'riesling',
    region: 'Mosel',
    vintage: 2021,
    abv: 11,
    tastingNotes: ['peach', 'honey', 'floral'],
    acidity: 5,
    tannins: 1,
    body: 2,
    sweetness: 3,
    score: 90,
    priceUSD: 35,
  },
  {
    id: 'w4',
    name: 'Barolo Nebbiolo',
    color: 'red',
    varietal: 'nebbiolo',
    region: 'Piedmont',
    vintage: 2016,
    abv: 14,
    tastingNotes: ['cherry', 'leather', 'tobacco'],
    acidity: 4,
    tannins: 5,
    body: 5,
    sweetness: 1,
    score: 95,
    priceUSD: 120,
  },
  {
    id: 'w5',
    name: 'Provence Rosé',
    color: 'rosé',
    varietal: 'syrah',
    region: 'Provence',
    vintage: 2023,
    abv: 12.5,
    tastingNotes: ['peach', 'floral', 'citrus'],
    acidity: 3,
    tannins: 1,
    body: 2,
    sweetness: 1,
    score: 86,
    priceUSD: 25,
  },
];

const s = {
  panel: {
    background: 'linear-gradient(180deg, #1a0f1e 0%, #201020 100%)',
    borderRadius: 12,
    padding: 20,
    color: '#e8d0e0',
    fontFamily: "'Inter', sans-serif",
    minHeight: 600,
    maxWidth: 720,
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottom: '1px solid rgba(186,85,130,0.2)',
    paddingBottom: 12,
  } as React.CSSProperties,
  title: {
    fontSize: 18,
    fontWeight: 700,
    background: 'linear-gradient(135deg, #ba5582, #e8b84e)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  } as React.CSSProperties,
  section: {
    marginBottom: 18,
    padding: 14,
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    border: '1px solid rgba(186,85,130,0.08)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#ba5582',
    marginBottom: 10,
  } as React.CSSProperties,
  foodBtn: (active: boolean) =>
    ({
      padding: '6px 10px',
      background: active ? 'rgba(186,85,130,0.2)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${active ? 'rgba(186,85,130,0.4)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 6,
      fontSize: 12,
      cursor: 'pointer',
      transition: 'all 0.2s',
      color: active ? '#e8b84e' : '#889',
    }) as React.CSSProperties,
  wineRow: (best: boolean) =>
    ({
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 12px',
      background: best ? 'rgba(232,184,78,0.08)' : 'rgba(255,255,255,0.02)',
      border: `1px solid ${best ? 'rgba(232,184,78,0.2)' : 'rgba(255,255,255,0.04)'}`,
      borderRadius: 8,
      marginBottom: 6,
      fontSize: 12,
    }) as React.CSSProperties,
  scoreBar: (pct: number) =>
    ({
      height: 6,
      width: `${pct}%`,
      background:
        pct >= 80
          ? 'linear-gradient(90deg, #22c55e, #4ade80)'
          : pct >= 50
            ? 'linear-gradient(90deg, #e8b84e, #fbbf24)'
            : 'linear-gradient(90deg, #ef4444, #f87171)',
      borderRadius: 3,
      transition: 'width 0.3s',
    }) as React.CSSProperties,
  noteTag: {
    display: 'inline-block',
    padding: '2px 6px',
    background: 'rgba(186,85,130,0.12)',
    border: '1px solid rgba(186,85,130,0.2)',
    borderRadius: 8,
    fontSize: 10,
    color: '#d4a',
    marginRight: 3,
    marginBottom: 3,
  } as React.CSSProperties,
  tempCard: {
    padding: 10,
    background: 'rgba(78,205,196,0.06)',
    border: '1px solid rgba(78,205,196,0.15)',
    borderRadius: 8,
    textAlign: 'center' as const,
  } as React.CSSProperties,
};

export function WineSommelierPanel() {
  const [food, setFood] = useState<FoodCategory>('beef');
  const foods = Object.keys(FOOD_EMOJIS) as FoodCategory[];
  const ranked = useMemo(
    () => [...WINES].sort((a, b) => pairingScore(food, b) - pairingScore(food, a)),
    [food]
  );
  const best = useMemo(() => bestPairing(food, WINES), [food]);
  const cellar: CellarEntry[] = WINES.map((w) => ({
    wine: w,
    quantity: 3,
    purchaseDate: Date.now(),
    drinkByYear: w.vintage + agingPotential(w),
    location: 'A1',
    peakYear: w.vintage + Math.round(agingPotential(w) * 0.6),
  }));

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>🍷 Wine Sommelier</span>
        <span style={{ fontSize: 12, color: '#ba5582' }}>{WINES.length} wines</span>
      </div>

      {/* Food Pairing */}
      <div style={s.section}>
        <div style={s.sectionTitle}>🍽️ Pair With</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {foods.map((f) => (
            <button key={f} style={s.foodBtn(f === food)} onClick={() => setFood(f)}>
              {FOOD_EMOJIS[f]} {f}
            </button>
          ))}
        </div>
        {ranked.map((w) => {
          const score = pairingScore(food, w);
          return (
            <div key={w.id} style={s.wineRow(w.id === best?.id)}>
              <span style={{ fontSize: 16 }}>
                {w.color === 'red' ? '🍷' : w.color === 'rosé' ? '🌸' : '🥂'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: '#f0e0f0' }}>
                  {w.name} {w.id === best?.id ? '⭐' : ''}
                </div>
                <div style={{ color: '#889', fontSize: 11 }}>
                  {w.region} · {w.vintage} · {w.abv}%
                </div>
              </div>
              <div style={{ width: 60, textAlign: 'right' }}>
                <div
                  style={{
                    fontWeight: 700,
                    color: score >= 80 ? '#4ade80' : score >= 50 ? '#fbbf24' : '#f87171',
                  }}
                >
                  {score}
                </div>
                <div
                  style={{
                    height: 6,
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 3,
                    marginTop: 3,
                  }}
                >
                  <div style={s.scoreBar(score)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Wine Details */}
      {best && (
        <div style={s.section}>
          <div style={s.sectionTitle}>🏆 Best Match: {best.name}</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
              marginBottom: 10,
            }}
          >
            {[
              ['Acidity', best.acidity],
              ['Tannins', best.tannins],
              ['Body', best.body],
              ['Sweet', best.sweetness],
            ].map(([label, val]) => (
              <div key={label as string} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#e8b84e' }}>{val}/5</div>
                <div style={{ fontSize: 10, color: '#889' }}>{label as string}</div>
              </div>
            ))}
          </div>
          <div>
            {best.tastingNotes.map((n) => (
              <span key={n} style={s.noteTag}>
                {n}
              </span>
            ))}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              marginTop: 10,
            }}
          >
            <div style={s.tempCard}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#4ecdc4' }}>
                {servingTemperatureC(best.color).min}-{servingTemperatureC(best.color).max}°C
              </div>
              <div style={{ fontSize: 10, color: '#889' }}>Serve Temp</div>
            </div>
            <div style={s.tempCard}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#ba5582' }}>
                {decantTimeMinutes(best.tannins, best.vintage, 2026)} min
              </div>
              <div style={{ fontSize: 10, color: '#889' }}>Decant</div>
            </div>
            <div style={s.tempCard}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#e8b84e' }}>
                {agingPotential(best)} yr
              </div>
              <div style={{ fontSize: 10, color: '#889' }}>Aging Potential</div>
            </div>
          </div>
        </div>
      )}

      {/* Cellar */}
      <div style={s.section}>
        <div style={s.sectionTitle}>🏰 Cellar</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <div
            style={{
              textAlign: 'center',
              padding: 8,
              background: 'rgba(232,184,78,0.06)',
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: '#e8b84e' }}>
              ${cellarValue(cellar).toLocaleString()}
            </div>
            <div style={{ fontSize: 10, color: '#889' }}>Value</div>
          </div>
          <div
            style={{
              textAlign: 'center',
              padding: 8,
              background: 'rgba(186,85,130,0.06)',
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: '#ba5582' }}>
              {cellarTotalBottles(cellar)}
            </div>
            <div style={{ fontSize: 10, color: '#889' }}>Bottles</div>
          </div>
          <div
            style={{
              textAlign: 'center',
              padding: 8,
              background: 'rgba(78,205,196,0.06)',
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: '#4ecdc4' }}>
              {winesAtPeak(cellar, 2026).length}
            </div>
            <div style={{ fontSize: 10, color: '#889' }}>At Peak</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WineSommelierPanel;
