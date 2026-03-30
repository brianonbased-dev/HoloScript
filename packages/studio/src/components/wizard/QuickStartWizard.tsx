'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles, Check, Code2 } from 'lucide-react';
import { useSceneStore } from '@/lib/stores';

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
  const roomList = rooms
    .map((id) => {
      const r = (ROOMS_BY_SETTING[setting] ?? []).find((rm) => rm.id === id);
      return r
        ? `  object "${r.label}" { @room @position(${Math.random() * 20 - 10}, 0, ${Math.random() * 20 - 10}) }`
        : '';
    })
    .filter(Boolean)
    .join('\n');

  const npcList = npcs
    .map((id) => {
      const n = NPCS.find((npc) => npc.id === id);
      return n
        ? `  npc "${n.label}" { @role("${n.role}") @position(${Math.random() * 10 - 5}, 0, ${Math.random() * 10 - 5}) }`
        : '';
    })
    .filter(Boolean)
    .join('\n');

  return `world "${settingObj.label} World" {
  @setting("${setting}")
  @lighting("ambient")
  @skybox("${setting}")

${roomList}

${npcList}
}`;
}

// ── Animated step wrapper ─────────────────────────────────────────────────────

function AnimatedStep({
  visible,
  direction,
  children,
}: {
  visible: boolean;
  direction: 'left' | 'right';
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
    } else {
      const timer = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!mounted) return null;

  const enterFrom = direction === 'right' ? 'translate-x-8' : '-translate-x-8';

  return (
    <div
      ref={ref}
      className={`transition-all duration-300 ease-out ${
        visible ? 'opacity-100 translate-x-0' : `opacity-0 ${enterFrom}`
      }`}
    >
      {children}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface QuickStartWizardProps {
  onClose: () => void;
}

export function QuickStartWizard({ onClose }: QuickStartWizardProps) {
  const setCode = useSceneStore((s) => s.setCode);
  const [step, setStep] = useState(0);
  const [prevStep, setPrevStep] = useState(0);
  const [setting, setSetting] = useState<string | null>(null);
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(
    new Set(['entrance', 'boss', 'hangar', 'bridge', 'lobby', 'glade'])
  );
  const [selectedNpcs, setSelectedNpcs] = useState<Set<string>>(new Set(['merchant', 'enemy']));
  const [showPreview, setShowPreview] = useState(false);
  const [created, setCreated] = useState(false);

  const rooms = ROOMS_BY_SETTING[setting ?? 'medieval'] ?? [];
  const direction: 'left' | 'right' = step >= prevStep ? 'right' : 'left';

  // Live preview code
  const previewCode = useMemo(() => {
    if (!setting) return '// Select a setting to preview';
    return buildSceneCode(setting, [...selectedRooms], [...selectedNpcs]);
  }, [setting, selectedRooms, selectedNpcs]);

  const goToStep = useCallback(
    (next: number) => {
      setPrevStep(step);
      setStep(next);
    },
    [step]
  );

  const toggleRoom = (id: string) => {
    setSelectedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleNpc = (id: string) => {
    setSelectedNpcs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDone = () => {
    if (!setting) return;
    const code = buildSceneCode(setting, [...selectedRooms], [...selectedNpcs]);
    setCode(code);
    if (typeof window !== 'undefined') window.localStorage.setItem('studio-wizard-seen', '1');
    setCreated(true);
    setTimeout(onClose, 800);
  };

  const canNext = step === 0 ? !!setting : true;

  const stepTitles = ['🎯 Quick Start', '🏠 Choose Rooms', '🧙 Add Characters'];

  // Success flash animation
  if (created) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4 animate-bounce">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 shadow-2xl shadow-emerald-500/50">
            <Check className="h-10 w-10 text-white" />
          </div>
          <p className="text-lg font-semibold text-emerald-400">World Created!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-studio-border bg-studio-panel shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-border px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-studio-text">{stepTitles[step]}</p>
            <p className="text-xs text-studio-muted">Step {step + 1} of 3</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Preview toggle on step 2 */}
            {step === 2 && setting && (
              <button
                onClick={() => setShowPreview(!showPreview)}
                className={`rounded-lg p-1.5 transition ${
                  showPreview
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'text-studio-muted hover:bg-white/10 hover:text-studio-text'
                }`}
                title="Preview HoloScript"
              >
                <Code2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-studio-muted hover:bg-white/10 hover:text-studio-text transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-black/20">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500 ease-out"
            style={{ width: `${((step + 1) / 3) * 100}%` }}
          />
        </div>

        {/* Step content — animated */}
        <div className="relative min-h-[220px] p-6">
          <AnimatedStep visible={step === 0} direction={direction}>
            <p className="mb-4 text-sm text-studio-muted">What kind of world are you building?</p>
            <div className="grid grid-cols-2 gap-3">
              {SETTINGS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSetting(s.id)}
                  className={`relative flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all duration-200 ${
                    setting === s.id
                      ? 'border-emerald-500/60 bg-emerald-500/10 scale-[1.02] shadow-lg shadow-emerald-500/10'
                      : 'border-studio-border bg-black/20 hover:border-studio-border/60 hover:bg-white/5'
                  }`}
                >
                  <span className="text-2xl">{s.emoji}</span>
                  <span className="text-sm font-medium text-studio-text">{s.label}</span>
                  <span className="text-[11px] text-studio-muted">{s.desc}</span>
                  {setting === s.id && (
                    <Check className="absolute top-3 right-3 h-4 w-4 text-emerald-400" />
                  )}
                </button>
              ))}
            </div>
          </AnimatedStep>

          <AnimatedStep visible={step === 1} direction={direction}>
            <p className="mb-4 text-sm text-studio-muted">Which rooms do you need? (pick any)</p>
            <div className="grid grid-cols-2 gap-2">
              {rooms.map((r) => (
                <button
                  key={r.id}
                  onClick={() => toggleRoom(r.id)}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all duration-200 ${
                    selectedRooms.has(r.id)
                      ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                      : 'border-studio-border bg-black/20 text-studio-muted hover:text-studio-text'
                  }`}
                >
                  <span className="text-lg">{r.emoji}</span>
                  <span className="text-xs font-medium">{r.label}</span>
                  {selectedRooms.has(r.id) && (
                    <Check className="ml-auto h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </AnimatedStep>

          <AnimatedStep visible={step === 2} direction={direction}>
            <p className="mb-4 text-sm text-studio-muted">Add NPCs and characters to your world</p>

            {/* NPC grid or code preview */}
            {showPreview ? (
              <div className="rounded-lg border border-studio-border bg-black/40 p-3 max-h-48 overflow-auto">
                <pre className="text-[11px] leading-relaxed text-emerald-300/80 font-mono whitespace-pre-wrap">
                  {previewCode}
                </pre>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {NPCS.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => toggleNpc(n.id)}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all duration-200 ${
                      selectedNpcs.has(n.id)
                        ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                        : 'border-studio-border bg-black/20 text-studio-muted hover:text-studio-text'
                    }`}
                  >
                    <span className="text-xl">{n.emoji}</span>
                    <div>
                      <p className="text-xs font-medium">{n.label}</p>
                      <p
                        className={`text-[10px] ${n.role === 'Hostile' ? 'text-red-400' : n.role === 'Friendly' ? 'text-emerald-400' : 'text-studio-muted'}`}
                      >
                        {n.role}
                      </p>
                    </div>
                    {selectedNpcs.has(n.id) && (
                      <Check className="ml-auto h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </AnimatedStep>
        </div>

        {/* Summary chips — what you've selected */}
        {step > 0 && setting && (
          <div className="px-6 pb-2">
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] text-studio-muted">
                {SETTINGS.find((s) => s.id === setting)?.emoji}{' '}
                {SETTINGS.find((s) => s.id === setting)?.label}
              </span>
              {step >= 1 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] text-studio-muted">
                  🏠 {selectedRooms.size} rooms
                </span>
              )}
              {step >= 2 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] text-studio-muted">
                  🧙 {selectedNpcs.size} NPCs
                </span>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-studio-border px-6 py-4">
          <button
            onClick={() => (step > 0 ? goToStep(step - 1) : onClose())}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-studio-muted transition hover:text-studio-text"
          >
            <ChevronLeft className="h-4 w-4" />
            {step === 0 ? 'Skip' : 'Back'}
          </button>

          {step < 2 ? (
            <button
              onClick={() => goToStep(step + 1)}
              disabled={!canNext}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-4 py-1.5 text-sm font-medium text-emerald-400 transition hover:bg-emerald-500/30 disabled:opacity-40"
            >
              Next: {step === 0 ? 'Add Rooms' : 'Add Characters'}
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleDone}
              className="flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-1.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:scale-[1.02] active:scale-95"
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
