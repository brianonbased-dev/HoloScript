'use client';

/**
 * FashionRunwayPanel — Outfit designer, fabric library, runway timeline.
 */

import { useState, useCallback } from 'react';
import { Shirt, Palette, Clock, Plus, Trash2, Star, Eye, Sparkles } from 'lucide-react';

export type FabricType =
  | 'silk'
  | 'cotton'
  | 'leather'
  | 'denim'
  | 'wool'
  | 'lace'
  | 'satin'
  | 'chiffon';
export type Season = 'spring' | 'summer' | 'fall' | 'winter';

export interface GarmentPiece {
  id: string;
  name: string;
  type: string;
  fabric: FabricType;
  color: string;
  pattern: string;
}
export interface Outfit {
  id: string;
  name: string;
  pieces: GarmentPiece[];
  season: Season;
  rating: number;
  notes: string;
}

const FABRIC_COLORS: Record<FabricType, string> = {
  silk: '#f0e6d3',
  cotton: '#ffffff',
  leather: '#4a3728',
  denim: '#4a6fa5',
  wool: '#c9b99a',
  lace: '#f5e6f0',
  satin: '#d4af37',
  chiffon: '#f0f0f0',
};

const DEMO_OUTFITS: Outfit[] = [
  {
    id: '1',
    name: 'Evening Elegance',
    rating: 5,
    season: 'winter',
    notes: 'Opening look',
    pieces: [
      {
        id: 'a',
        name: 'Column Gown',
        type: 'dress',
        fabric: 'silk',
        color: '#1a1a2e',
        pattern: 'solid',
      },
      {
        id: 'b',
        name: 'Opera Gloves',
        type: 'accessories',
        fabric: 'satin',
        color: '#1a1a2e',
        pattern: 'solid',
      },
    ],
  },
  {
    id: '2',
    name: 'Urban Edge',
    rating: 4,
    season: 'fall',
    notes: 'Streetwear crossover',
    pieces: [
      {
        id: 'c',
        name: 'Moto Jacket',
        type: 'outerwear',
        fabric: 'leather',
        color: '#2d2d2d',
        pattern: 'solid',
      },
      {
        id: 'd',
        name: 'Slim Jeans',
        type: 'bottoms',
        fabric: 'denim',
        color: '#2c3e6b',
        pattern: 'solid',
      },
      {
        id: 'e',
        name: 'Band Tee',
        type: 'tops',
        fabric: 'cotton',
        color: '#1a1a1a',
        pattern: 'graphic',
      },
    ],
  },
  {
    id: '3',
    name: 'Garden Party',
    rating: 4,
    season: 'spring',
    notes: 'Finale look',
    pieces: [
      {
        id: 'f',
        name: 'Floral Midi',
        type: 'dress',
        fabric: 'chiffon',
        color: '#f5e1e8',
        pattern: 'floral',
      },
      {
        id: 'g',
        name: 'Lace Shawl',
        type: 'accessories',
        fabric: 'lace',
        color: '#ffffff',
        pattern: 'lace',
      },
    ],
  },
];

export function FashionRunwayPanel() {
  const [outfits, setOutfits] = useState<Outfit[]>(DEMO_OUTFITS);
  const [selected, setSelected] = useState<string | null>('1');
  const [view, setView] = useState<'outfits' | 'runway' | 'fabrics'>('outfits');

  const setRating = useCallback((id: string, r: number) => {
    setOutfits((prev) => prev.map((o) => (o.id === id ? { ...o, rating: r } : o)));
  }, []);

  const sel = outfits.find((o) => o.id === selected);
  const SEASONS: Season[] = ['spring', 'summer', 'fall', 'winter'];
  const SEASON_EMOJI = { spring: '🌸', summer: '☀️', fall: '🍂', winter: '❄️' };

  return (
    <div className="flex flex-col overflow-auto">
      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
        <Shirt className="h-4 w-4 text-pink-400" />
        <span className="text-sm font-semibold text-studio-text">Fashion Runway</span>
      </div>

      <div className="flex gap-1 border-b border-studio-border p-1">
        {(['outfits', 'runway', 'fabrics'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 rounded px-2 py-1 text-[10px] ${view === v ? 'bg-pink-500/20 text-pink-400' : 'text-studio-muted'}`}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {view === 'outfits' && (
        <>
          {outfits.map((o) => (
            <div
              key={o.id}
              onClick={() => setSelected(o.id)}
              className={`flex items-start gap-2 border-b border-studio-border/30 px-3 py-2 cursor-pointer ${selected === o.id ? 'bg-pink-500/10' : 'hover:bg-studio-panel/50'}`}
            >
              <div className="flex gap-0.5 mt-0.5">
                {o.pieces.slice(0, 3).map((p) => (
                  <div key={p.id} className="h-4 w-4 rounded" style={{ background: p.color }} />
                ))}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-studio-text">{o.name}</div>
                <div className="text-[10px] text-studio-muted">
                  {o.pieces.length} pieces · {SEASON_EMOJI[o.season]} {o.season}
                </div>
              </div>
              <div className="flex">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRating(o.id, s);
                    }}
                    className={s <= o.rating ? 'text-amber-400' : 'text-studio-muted/20'}
                  >
                    <Star className="h-3 w-3" fill={s <= o.rating ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {view === 'runway' && (
        <div className="px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted mb-2">
            Runway Order
          </div>
          <div className="flex flex-col gap-1">
            {outfits.map((o, i) => (
              <div
                key={o.id}
                className="flex items-center gap-2 rounded border border-studio-border/50 px-2 py-1.5"
              >
                <span className="text-[10px] font-bold text-studio-muted">{i + 1}</span>
                <div className="flex gap-0.5">
                  {o.pieces.slice(0, 3).map((p) => (
                    <div key={p.id} className="h-3 w-3 rounded" style={{ background: p.color }} />
                  ))}
                </div>
                <span className="flex-1 text-xs text-studio-text">{o.name}</span>
                <span className="text-[9px] text-studio-muted">{o.notes}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'fabrics' && (
        <div className="grid grid-cols-2 gap-1 p-2">
          {(Object.entries(FABRIC_COLORS) as [FabricType, string][]).map(([fabric, color]) => (
            <div
              key={fabric}
              className="flex items-center gap-2 rounded border border-studio-border/50 px-2 py-1.5"
            >
              <div
                className="h-6 w-6 rounded"
                style={{ background: color, border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <span className="text-[11px] text-studio-text capitalize">{fabric}</span>
            </div>
          ))}
        </div>
      )}

      {/* Selected Outfit Detail */}
      {sel && view === 'outfits' && (
        <div className="border-t border-studio-border px-3 py-2">
          <div className="text-xs font-semibold text-studio-text mb-1">
            {sel.name} — {sel.pieces.length} Pieces
          </div>
          {sel.pieces.map((piece) => (
            <div key={piece.id} className="flex items-center gap-2 py-1 text-[11px]">
              <div className="h-5 w-5 rounded" style={{ background: piece.color }} />
              <span className="text-studio-text">{piece.name}</span>
              <span className="text-studio-muted/50">{piece.fabric}</span>
              <span className="text-[9px] text-studio-muted/30">{piece.pattern}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
