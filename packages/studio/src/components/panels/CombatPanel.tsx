'use client';
/** CombatPanel — Combat system designer and simulator */
import React from 'react';
import { useCombat } from '../../hooks/useCombat';

const HP_COLORS = (hp: number, max: number) => {
  const pct = hp / max;
  if (pct > 0.6) return 'bg-emerald-500';
  if (pct > 0.3) return 'bg-amber-500';
  return 'bg-red-500';
};

export function CombatPanel() {
  const {
    entities,
    combos,
    hitLog,
    spawnEntity,
    attack,
    registerCombo,
    advanceCombo,
    tick,
    reset,
  } = useCombat();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">⚔️ Combat</h3>
        <span className="text-[10px] text-studio-muted">
          {entities.length} fighters · {hitLog.length} hits
        </span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => spawnEntity('Warrior')}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          + Warrior
        </button>
        <button
          onClick={() => spawnEntity('Mage')}
          className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition"
        >
          + Mage
        </button>
        <button
          onClick={() => registerCombo('Jab-Cross-Upper')}
          className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 transition"
        >
          + Combo
        </button>
        <button
          onClick={() => tick()}
          className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
        >
          ⟳ Tick
        </button>
        <button
          onClick={reset}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺
        </button>
      </div>

      {/* Entities */}
      <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
        {entities.length === 0 && <p className="text-studio-muted">Spawn fighters to begin.</p>}
        {entities.map((e) => (
          <div key={e.id} className="bg-studio-panel/30 rounded p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-studio-text font-medium">{e.name}</span>
              <span className="text-studio-muted text-[10px]">
                {e.hp}/{e.maxHp} HP
              </span>
            </div>
            <div className="w-full bg-studio-panel rounded-full h-1.5 mb-1">
              <div
                className={`h-1.5 rounded-full transition-all ${HP_COLORS(e.hp, e.maxHp)}`}
                style={{ width: `${(e.hp / e.maxHp) * 100}%` }}
              />
            </div>
            <div className="flex gap-1">
              {entities
                .filter((t) => t.id !== e.id)
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => attack(e.id, t.id)}
                    className="px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded text-[10px] hover:bg-red-500/20 transition"
                  >
                    ⚔ {t.name}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* Combos */}
      {combos.length > 0 && (
        <div>
          <h4 className="text-studio-muted font-medium mb-1">Combos</h4>
          {combos.map((c) => (
            <div key={c.id} className="bg-studio-panel/30 rounded p-1.5 mb-1">
              <div className="flex items-center gap-1 mb-1">
                {c.steps.map((s, i) => (
                  <span
                    key={i}
                    className={`px-1 py-0.5 rounded text-[10px] ${i < c.currentStep ? 'bg-emerald-500/20 text-emerald-400' : i === c.currentStep ? 'bg-amber-500/20 text-amber-400' : 'bg-studio-panel text-studio-muted'}`}
                  >
                    {s.name} [{s.input}]
                  </span>
                ))}
                {c.completed && <span className="text-emerald-400 text-[10px]">✓ COMPLETE</span>}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => advanceCombo(c.id, 'A')}
                  className="px-1.5 py-0.5 bg-studio-panel rounded text-studio-muted text-[10px] hover:text-studio-text"
                >
                  A
                </button>
                <button
                  onClick={() => advanceCombo(c.id, 'B')}
                  className="px-1.5 py-0.5 bg-studio-panel rounded text-studio-muted text-[10px] hover:text-studio-text"
                >
                  B
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hit log */}
      {hitLog.length > 0 && (
        <div>
          <h4 className="text-studio-muted font-medium mb-1">Hit Log ({hitLog.length})</h4>
          <div className="space-y-0.5 max-h-[60px] overflow-y-auto">
            {hitLog.slice(-5).map((h, i) => (
              <div key={i} className="text-[10px] text-red-400 font-mono">
                {h.hitboxId} → {h.hurtboxId}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
