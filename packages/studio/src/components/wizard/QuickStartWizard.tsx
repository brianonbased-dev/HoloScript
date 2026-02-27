'use client';

import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles, Check } from 'lucide-react';
import { useSceneStore } from '@/lib/store';

// ── Step data ────────────────────────────────────────────────────────────────

type Setting = { id: string; label: string; emoji: string; desc: string };
const SETTINGS: Setting[] = [
  { id: 'medieval', label: 'Medieval Fantasy', emoji: '🏰', desc: 'Dungeons, taverns, castles' },
  { id: 'scifi', label: 'Sci-Fi Space', emoji: '🚀', desc: 'Space stations, alien worlds' },
  { id: 'modern', label: 'Modern City', emoji: '🏙️', desc: 'Streets, apartments, cafes' },
  { id: 'nature', label: 'Nature / Wilderness', emoji: '🌲', desc: 'Forests, caves, mountains' },
];

type Room = { id: string; label: string; emoji: string };
const ROOMS_BY_SETTING: Record<string, Room[]> = {
  medieval: [
    { id: 'entrance', label: 'Entrance Hall', emoji: '🚪' },
    { id: 'treasure', label: 'Treasure Room', emoji: '💰' },
    { id: 'boss', label: 'Boss Fight Arena', emoji: '⚔️' },
    { id: 'puzzle', label: 'Puzzle Chamber', emoji: '🧩' },
    { id: 'trap', label: 'Trap Hallway', emoji: '🪤' },
    { id: 'secret', label: 'Secret Room', emoji: '🔐' },
  ],
  scifi: [
    { id: 'hangar', label: 'Docking Hangar', emoji: '🛸' },
    { id: 'bridge', label: 'Command Bridge', emoji: '🖥️' },
    { id: 'engine', label: 'Engine Room', emoji: '⚙️' },
    { id: 'lab', label: 'Research Lab', emoji: '🔬' },
    { id: 'cryo', label: 'Cryo Chamber', emoji: '❄️' },
    { id: 'escape', label: 'Escape Pods', emoji: '🚀' },
  ],
  modern: [
    { id: 'lobby', label: 'Lobby', emoji: '🏢' },
    { id: 'office', label: 'Office Space', emoji: '💼' },
    { id: 'cafe', label: 'Rooftop Café', emoji: '☕' },
    { id: 'garage', label: 'Parking Garage', emoji: '🚗' },
    { id: 'gym', label: 'Gym', emoji: '🏋️' },
    { id: 'penthouse', label: 'Penthouse', emoji: '🌆' },
  ],
  nature: [
    { id: 'glade', label: 'Forest Clearing', emoji: '🌿' },
    { id: 'cave', label: 'Crystal Cave', emoji: '💎' },
    { id: 'waterfall', label: 'Waterfall', emoji: '💧' },
    { id: 'camp', label: 'Campsite', emoji: '🔥' },
    { id: 'peak', label: 'Mountain Peak', emoji: '🏔️' },
    { id: 'ruin', label: 'Ancient Ruins', emoji: '🏛️' },
  ],
};

type NPC = { id: string; label: string; emoji: string; role: string };
const NPCS: NPC[] = [
  { id: 'merchant', label: 'Merchant', emoji: '🧙', role: 'Friendly' },
  { id: 'guard', label: 'Guard', emoji: '⚔️', role: 'Neutral' },
  { id: 'enemy', label: 'Enemy', emoji: '👹', role: 'Hostile' },
  { id: 'companion', label: 'Companion', emoji: '🐾', role: 'Friendly' },
  { id: 'questgiver', label: 'Quest Giver', emoji: '📜', role: 'Friendly' },
  { id: 'boss', label: 'Boss', emoji: '💀', role: 'Hostile' },
];

// ── Code generator ────────────────────────────────────────────────────────────

export function buildSceneCode(setting: string, rooms: string[], npcs: string[]): string {
  const settingObj = SETTINGS.find((s) => s.id === setting)!;
  const roomList = rooms.map((id) => {
    const r = (ROOMS_BY_SETTING[setting] ?? []).find((rm) => rm.id === id);
    return r ? `  object "${r.label}" { @room @position(${Math.random() * 20 - 10}, 0, ${Math.random() * 20 - 10}) }` : '';
  }).filter(Boolean).join('\n');

  const npcList = npcs.map((id) => {
    const n = NPCS.find((npc) => npc.id === id);
    return n ? `  npc "${n.label}" { @role("${n.role}") @position(${Math.random() * 10 - 5}, 0, ${Math.random() * 10 - 5}) }` : '';
  }).filter(Boolean).join('\n');

  return `world "${settingObj.label} World" {
  @setting("${setting}")
  @lighting("ambient")
  @skybox("${setting}")

${roomList}

${npcList}
}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface QuickStartWizardProps {
  onClose: () => void;
}

export function QuickStartWizard({ onClose }: QuickStartWizardProps) {
  const setCode = useSceneStore((s) => s.setCode);
  const [step, setStep] = useState(0);
  const [setting, setSetting] = useState<string | null>(null);
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set(['entrance', 'boss', 'hangar', 'bridge', 'lobby', 'glade']));
  const [selectedNpcs, setSelectedNpcs] = useState<Set<string>>(new Set(['merchant', 'enemy']));

  const rooms = ROOMS_BY_SETTING[setting ?? 'medieval'] ?? [];

  const toggleRoom = (id: string) => {
    setSelectedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleNpc = (id: string) => {
    setSelectedNpcs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDone = () => {
    if (!setting) return;
    const code = buildSceneCode(setting, [...selectedRooms], [...selectedNpcs]);
    setCode(code);
    if (typeof window !== 'undefined') window.localStorage.setItem('studio-wizard-seen', '1');
    onClose();
  };

  const canNext = step === 0 ? !!setting : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-studio-border bg-studio-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-border px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-studio-text">
              {step === 0 ? '🎯 Quick Start' : step === 1 ? '🏠 Choose Rooms' : '🧙 Add Characters'}
            </p>
            <p className="text-xs text-studio-muted">Step {step + 1} of 3</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-studio-muted hover:bg-white/10 hover:text-studio-text transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-black/20">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${((step + 1) / 3) * 100}%` }}
          />
        </div>

        {/* Step content */}
        <div className="p-6">
          {step === 0 && (
            <div>
              <p className="mb-4 text-sm text-studio-muted">What kind of world are you building?</p>
              <div className="grid grid-cols-2 gap-3">
                {SETTINGS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSetting(s.id)}
                    className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all ${
                      setting === s.id
                        ? 'border-emerald-500/60 bg-emerald-500/10'
                        : 'border-studio-border bg-black/20 hover:border-studio-border/60 hover:bg-white/5'
                    }`}
                  >
                    <span className="text-2xl">{s.emoji}</span>
                    <span className="text-sm font-medium text-studio-text">{s.label}</span>
                    <span className="text-[11px] text-studio-muted">{s.desc}</span>
                    {setting === s.id && <Check className="absolute top-3 right-3 h-4 w-4 text-emerald-400" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <p className="mb-4 text-sm text-studio-muted">Which rooms do you need? (pick any)</p>
              <div className="grid grid-cols-2 gap-2">
                {rooms.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => toggleRoom(r.id)}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all ${
                      selectedRooms.has(r.id)
                        ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                        : 'border-studio-border bg-black/20 text-studio-muted hover:text-studio-text'
                    }`}
                  >
                    <span className="text-lg">{r.emoji}</span>
                    <span className="text-xs font-medium">{r.label}</span>
                    {selectedRooms.has(r.id) && <Check className="ml-auto h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <p className="mb-4 text-sm text-studio-muted">Add NPCs and characters to your world</p>
              <div className="grid grid-cols-2 gap-2">
                {NPCS.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => toggleNpc(n.id)}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all ${
                      selectedNpcs.has(n.id)
                        ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                        : 'border-studio-border bg-black/20 text-studio-muted hover:text-studio-text'
                    }`}
                  >
                    <span className="text-xl">{n.emoji}</span>
                    <div>
                      <p className="text-xs font-medium">{n.label}</p>
                      <p className={`text-[10px] ${n.role === 'Hostile' ? 'text-red-400' : n.role === 'Friendly' ? 'text-emerald-400' : 'text-studio-muted'}`}>
                        {n.role}
                      </p>
                    </div>
                    {selectedNpcs.has(n.id) && <Check className="ml-auto h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-studio-border px-6 py-4">
          <button
            onClick={() => step > 0 ? setStep(step - 1) : onClose()}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-studio-muted transition hover:text-studio-text"
          >
            <ChevronLeft className="h-4 w-4" />
            {step === 0 ? 'Skip' : 'Back'}
          </button>

          {step < 2 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canNext}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-4 py-1.5 text-sm font-medium text-emerald-400 transition hover:bg-emerald-500/30 disabled:opacity-40"
            >
              Next: {step === 0 ? 'Add Rooms' : 'Add Characters'}
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleDone}
              className="flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-1.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400"
            >
              <Sparkles className="h-4 w-4" />
              Build My World!
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
