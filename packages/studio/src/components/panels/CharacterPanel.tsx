'use client';
/**
 * CharacterPanel — Avatar & NPC character customizer
 *
 * Wires useBrittneyCustomizer for voice/text command processing,
 * provides visual character preview, body/outfit controls, and
 * preset character templates.
 */
import React, { useState, useCallback } from 'react';
import { useStudioBus } from '../../hooks/useStudioBus';

// ─── Character Types ────────────────────────────────────────────────

interface CharacterPreset {
  id: string;
  name: string;
  icon: string;
  body: { height: number; build: string; skinTone: string };
  outfit: string;
  tags: string[];
}

const CHARACTER_PRESETS: CharacterPreset[] = [
  { id: 'hero', name: 'Hero', icon: '🦸', body: { height: 1.8, build: 'athletic', skinTone: '#c68642' }, outfit: 'armor', tags: ['game', 'action'] },
  { id: 'npc-merchant', name: 'Merchant', icon: '🧑‍💼', body: { height: 1.7, build: 'average', skinTone: '#f5d0a9' }, outfit: 'robes', tags: ['game', 'rpg'] },
  { id: 'robot', name: 'Robot', icon: '🤖', body: { height: 2.0, build: 'heavy', skinTone: '#888888' }, outfit: 'plating', tags: ['sci-fi', 'iot'] },
  { id: 'avatar', name: 'Avatar', icon: '👤', body: { height: 1.75, build: 'average', skinTone: '#e0ac69' }, outfit: 'casual', tags: ['vr', 'social'] },
  { id: 'creature', name: 'Creature', icon: '🐉', body: { height: 3.0, build: 'heavy', skinTone: '#2d6a4f' }, outfit: 'scales', tags: ['game', 'fantasy'] },
  { id: 'brittney', name: 'Brittney', icon: '✨', body: { height: 1.7, build: 'slim', skinTone: '#f0c8a0' }, outfit: 'holographic', tags: ['ai', 'agent'] },
];

const BODY_BUILDS = ['slim', 'average', 'athletic', 'heavy'];
const SKIN_PRESETS = ['#f5d0a9', '#e0ac69', '#c68642', '#8d5524', '#3b1f0c', '#fde7d6', '#888888'];

interface ActiveCharacter {
  preset: CharacterPreset;
  height: number;
  build: string;
  skinTone: string;
  outfit: string;
  expression: string;
}

export function CharacterPanel() {
  const { emit } = useStudioBus();
  const [active, setActive] = useState<ActiveCharacter | null>(null);
  const [command, setCommand] = useState('');
  const [chatLog, setChatLog] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);

  const selectPreset = useCallback((preset: CharacterPreset) => {
    const char: ActiveCharacter = {
      preset,
      height: preset.body.height,
      build: preset.body.build,
      skinTone: preset.body.skinTone,
      outfit: preset.outfit,
      expression: 'neutral',
    };
    setActive(char);
    emit('character:changed', { id: preset.id, name: preset.name, ...char });
  }, [emit]);

  const updateChar = useCallback((updates: Partial<ActiveCharacter>) => {
    setActive(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...updates };
      emit('character:changed', { id: prev.preset.id, ...next });
      return next;
    });
  }, [emit]);

  const processCommand = useCallback((text: string) => {
    setChatLog(prev => [...prev, { role: 'user', text }]);
    // Simple intent parsing
    const lower = text.toLowerCase();
    let response = '🤔 Try: "make taller", "change skin", "set outfit armor"';
    if (lower.includes('tall')) { updateChar({ height: (active?.height ?? 1.8) + 0.1 }); response = '📏 Made character taller!'; }
    else if (lower.includes('short')) { updateChar({ height: (active?.height ?? 1.8) - 0.1 }); response = '📏 Made character shorter!'; }
    else if (lower.includes('slim')) { updateChar({ build: 'slim' }); response = '🏋️ Set build to slim!'; }
    else if (lower.includes('athletic')) { updateChar({ build: 'athletic' }); response = '🏋️ Set build to athletic!'; }
    else if (lower.includes('heavy')) { updateChar({ build: 'heavy' }); response = '🏋️ Set build to heavy!'; }
    else if (lower.includes('smile')) { updateChar({ expression: 'happy' }); response = '😊 Character is smiling!'; }
    else if (lower.includes('angry')) { updateChar({ expression: 'angry' }); response = '😠 Character looks angry!'; }
    setChatLog(prev => [...prev, { role: 'assistant', text: response }]);
    setCommand('');
  }, [active, updateChar]);

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🧑‍🎨 Character</h3>
        <span className="text-[10px] text-studio-muted">{active ? active.preset.name : 'No character'}</span>
      </div>

      {/* Preset grid */}
      <div className="grid grid-cols-3 gap-1">
        {CHARACTER_PRESETS.map(p => (
          <button key={p.id} onClick={() => selectPreset(p)}
            className={`flex flex-col items-center gap-0.5 p-1.5 rounded transition text-[10px]
              ${active?.preset.id === p.id ? 'bg-studio-accent/20 text-studio-accent ring-1 ring-studio-accent/30' : 'bg-studio-panel/30 text-studio-muted hover:text-studio-text hover:bg-studio-panel/50'}`}>
            <span className="text-lg">{p.icon}</span>
            <span>{p.name}</span>
          </button>
        ))}
      </div>

      {/* Character controls */}
      {active && (
        <div className="space-y-2">
          {/* Body */}
          <div className="bg-studio-panel/30 rounded-lg p-2 space-y-1.5">
            <span className="text-studio-muted font-medium text-[10px]">Body</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-studio-muted w-10">Height</span>
              <input type="range" min={1.2} max={3.0} step={0.05} value={active.height}
                onChange={e => updateChar({ height: Number(e.target.value) })}
                className="flex-1 h-1 accent-studio-accent" />
              <span className="text-studio-text font-mono text-[10px] w-8">{active.height.toFixed(1)}m</span>
            </div>
            <div className="flex gap-1">
              {BODY_BUILDS.map(b => (
                <button key={b} onClick={() => updateChar({ build: b })}
                  className={`flex-1 px-1 py-0.5 rounded text-[10px] capitalize transition
                    ${active.build === b ? 'bg-studio-accent/20 text-studio-accent' : 'bg-studio-panel/40 text-studio-muted hover:text-studio-text'}`}>
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Skin */}
          <div className="bg-studio-panel/30 rounded-lg p-2 space-y-1">
            <span className="text-studio-muted font-medium text-[10px]">Skin</span>
            <div className="flex gap-1">
              {SKIN_PRESETS.map(c => (
                <button key={c} onClick={() => updateChar({ skinTone: c })}
                  className={`w-5 h-5 rounded-full transition ${active.skinTone === c ? 'ring-2 ring-studio-accent' : 'ring-1 ring-studio-border/30'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          {/* Expression */}
          <div className="flex gap-1">
            {['neutral', 'happy', 'angry', 'surprised', 'sad'].map(expr => (
              <button key={expr} onClick={() => updateChar({ expression: expr })}
                className={`flex-1 px-1 py-1 rounded text-[10px] capitalize transition
                  ${active.expression === expr ? 'bg-studio-accent/20 text-studio-accent' : 'bg-studio-panel/30 text-studio-muted hover:text-studio-text'}`}>
                {expr === 'neutral' ? '😐' : expr === 'happy' ? '😊' : expr === 'angry' ? '😠' : expr === 'surprised' ? '😲' : '😢'} {expr}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Voice command */}
      <div className="space-y-1">
        <span className="text-studio-muted font-medium text-[10px]">✨ Voice Command</span>
        <div className="flex gap-1">
          <input type="text" placeholder="e.g. make taller, smile..."
            value={command} onChange={e => setCommand(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && command.trim()) processCommand(command.trim()); }}
            className="flex-1 px-2 py-1 bg-studio-panel/40 rounded text-[10px] text-studio-text placeholder-studio-muted border border-studio-border/20 focus:border-studio-accent/40 outline-none" />
          <button onClick={() => command.trim() && processCommand(command.trim())}
            className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded text-[10px]">Send</button>
        </div>
        {chatLog.length > 0 && (
          <div className="max-h-[60px] overflow-y-auto space-y-0.5">
            {chatLog.slice(-4).map((m, i) => (
              <div key={i} className={`text-[9px] px-1.5 py-0.5 rounded ${m.role === 'user' ? 'text-studio-muted' : 'text-studio-accent bg-studio-accent/5'}`}>
                {m.role === 'user' ? '> ' : '✨ '}{m.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
