'use client';

import { useRef, useState } from 'react';
import {
  Video,
  Camera,
  Sun,
  Layers,
  Play,
  Square,
  SkipBack,
  SkipForward,
  Scissors,
  SlidersHorizontal,
  Aperture,
  Focus,
  Film,
  Clapperboard,
  ChevronRight,
} from 'lucide-react';

// ── Scene Hierarchy (Actor / Camera / Light only) ────────────────────────────

const SCENE_ITEMS = [
  { id: 'cam-main', type: 'camera', label: 'Main Camera', icon: <Camera className="h-3.5 w-3.5" /> },
  { id: 'cam-dly', type: 'camera', label: 'Dolly Cam', icon: <Camera className="h-3.5 w-3.5" /> },
  { id: 'light-key', type: 'light', label: 'Key Light', icon: <Sun className="h-3.5 w-3.5" /> },
  { id: 'light-fill', type: 'light', label: 'Fill Light', icon: <Sun className="h-3.5 w-3.5" /> },
  { id: 'actor-hero', type: 'actor', label: 'Hero', icon: <Layers className="h-3.5 w-3.5" /> },
  { id: 'actor-npc', type: 'actor', label: 'NPC Guard', icon: <Layers className="h-3.5 w-3.5" /> },
];

const TYPE_COLOR: Record<string, string> = {
  camera: 'text-amber-400',
  light: 'text-yellow-300',
  actor: 'text-blue-400',
};

function FilmSceneTree() {
  const [selected, setSelected] = useState<string | null>('cam-main');
  return (
    <div className="flex h-full w-52 shrink-0 flex-col border-r border-studio-border bg-studio-panel">
      <div className="flex items-center justify-between border-b border-studio-border px-3 py-2.5">
        <p className="text-xs font-semibold text-studio-text">Scene</p>
        <button className="rounded p-0.5 text-studio-muted hover:text-studio-accent transition">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Groups */}
      {(['camera', 'light', 'actor'] as const).map((group) => (
        <div key={group}>
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-studio-muted">
            {group === 'camera' ? '📷 Cameras' : group === 'light' ? '💡 Lights' : '🎭 Actors'}
          </p>
          {SCENE_ITEMS.filter((i) => i.type === group).map((item) => (
            <button
              key={item.id}
              onClick={() => setSelected(item.id)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-all ${
                selected === item.id
                  ? 'bg-studio-accent/10 text-studio-accent'
                  : 'text-studio-muted hover:bg-white/5 hover:text-studio-text'
              }`}
            >
              <span className={TYPE_COLOR[item.type]}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      ))}

      {/* Add buttons */}
      <div className="mt-auto border-t border-studio-border p-2 flex flex-col gap-1">
        {[
          { label: '+ Camera', emoji: '📷' },
          { label: '+ Light', emoji: '💡' },
          { label: '+ Actor', emoji: '🎭' },
        ].map((b) => (
          <button
            key={b.label}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-studio-muted hover:bg-white/5 hover:text-studio-text transition"
          >
            {b.emoji} {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Camera Inspector ─────────────────────────────────────────────────────────

function CameraInspector() {
  const [fov, setFov] = useState(50);
  const [dof, setDof] = useState(false);
  const [aperture, setAperture] = useState(2.8);
  const [rig, setRig] = useState('Handheld');
  const [activeShot, setActiveShot] = useState('Medium');
  const [activeLook, setActiveLook] = useState('Natural');

  const SHOT_CONFIGS: Record<string, number> = {
    'Wide': 75,
    'Medium': 50,
    'Close-Up': 28,
    'POV': 15,
  };

  const applyShot = (shot: string) => {
    setActiveShot(shot);
    setFov(SHOT_CONFIGS[shot] ?? 50);
  };

  return (
    <div className="flex w-60 shrink-0 flex-col border-l border-studio-border bg-studio-panel">
      <div className="border-b border-studio-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-amber-400" />
          <p className="text-xs font-semibold text-studio-text">Main Camera</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Shot type */}
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-studio-muted">Shot Type</p>
          <div className="grid grid-cols-2 gap-1">
            {['Wide', 'Medium', 'Close-Up', 'POV'].map((s) => (
              <button
                key={s}
                onClick={() => applyShot(s)}
                className={`rounded-md border py-1.5 text-xs transition ${
                  activeShot === s
                    ? 'border-amber-500/60 bg-amber-500/15 text-amber-400'
                    : 'border-studio-border bg-black/20 text-studio-muted hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-400'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Rig */}
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-studio-muted">Camera Rig</p>
          <div className="grid grid-cols-2 gap-1">
            {['Dolly', 'Orbit', 'Drone', 'Handheld', 'Steadicam', 'Static'].map((r) => (
              <button
                key={r}
                onClick={() => setRig(r)}
                className={`rounded-md border py-1.5 text-xs transition ${
                  rig === r
                    ? 'border-amber-500/60 bg-amber-500/15 text-amber-400'
                    : 'border-studio-border bg-black/20 text-studio-muted hover:text-studio-text'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* FOV */}
        <div>
          <div className="mb-1 flex justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-studio-muted">Field of View</p>
            <span className="text-[10px] text-amber-400">{fov}°</span>
          </div>
          <input
            type="range" min={10} max={120} value={fov}
            onChange={(e) => setFov(Number(e.target.value))}
            className="w-full accent-amber-400"
          />
          <div className="mt-0.5 flex justify-between text-[9px] text-studio-muted">
            <span>Telephoto</span><span>Fisheye</span>
          </div>
        </div>

        {/* DOF */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-studio-muted">Depth of Field</p>
            <button
              onClick={() => setDof((v) => !v)}
              className={`h-5 w-9 rounded-full border transition-all ${
                dof ? 'border-amber-500/60 bg-amber-500/30' : 'border-studio-border bg-black/20'
              }`}
            >
              <div className={`h-3.5 w-3.5 rounded-full bg-white/80 transition-all mx-0.5 ${dof ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
          </div>
          {dof && (
            <div>
              <div className="mb-1 flex justify-between">
                <span className="text-[10px] text-studio-muted">Aperture</span>
                <span className="text-[10px] text-amber-400">f/{aperture.toFixed(1)}</span>
              </div>
              <input
                type="range" min={1.2} max={22} step={0.1} value={aperture}
                onChange={(e) => setAperture(Number(e.target.value))}
                className="w-full accent-amber-400"
              />
            </div>
          )}
        </div>

        {/* Post-FX */}
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-studio-muted">Film Look</p>
          <div className="grid grid-cols-2 gap-1">
            {['Natural', 'Cinematic', 'Vintage', 'Neon Noir', 'Documentary', 'Bleach'].map((look) => (
              <button
                key={look}
                onClick={() => setActiveLook(look)}
                className={`rounded-md border py-1 text-[11px] transition ${
                  activeLook === look
                    ? 'border-amber-500/60 bg-amber-500/15 text-amber-400'
                    : 'border-studio-border bg-black/20 text-studio-muted hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-400'
                }`}
              >
                {look}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Export */}
      <div className="border-t border-studio-border p-3">
        <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500/20 py-2 text-xs font-semibold text-amber-400 transition hover:bg-amber-500/30">
          <Film className="h-4 w-4" />
          Export Film
        </button>
      </div>
    </div>
  );
}

// ── Cinematic Timeline ────────────────────────────────────────────────────────

function CinematicTimeline() {
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [time, setTime] = useState(0);
  const duration = 10;

  return (
    <div className="shrink-0 border-t border-studio-border bg-studio-panel">
      {/* Playback controls */}
      <div className="flex items-center gap-3 border-b border-studio-border px-4 py-2">
        <div className="flex items-center gap-1">
          <button className="rounded p-1 text-studio-muted hover:text-studio-text transition"><SkipBack className="h-3.5 w-3.5" /></button>
          <button
            onClick={() => setPlaying((v) => !v)}
            className="rounded-lg bg-amber-500/20 p-1.5 text-amber-400 transition hover:bg-amber-500/30"
          >
            {playing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button className="rounded p-1 text-studio-muted hover:text-studio-text transition"><SkipForward className="h-3.5 w-3.5" /></button>
        </div>

        <span className="font-mono text-[11px] text-studio-muted">
          {String(Math.floor(time / 60)).padStart(2, '0')}:{String(time % 60).padStart(2, '0')} / 00:{String(duration).padStart(2, '0')}
        </span>

        <input
          type="range" min={0} max={duration} value={time}
          onChange={(e) => setTime(Number(e.target.value))}
          className="flex-1 accent-amber-400"
        />

        <button
          onClick={() => setRecording((v) => !v)}
          title={recording ? 'Stop recording' : 'Record live camera movement as keyframes'}
          className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition ${
            recording
              ? 'animate-pulse border-red-500/60 bg-red-500/15 text-red-400'
              : 'border-studio-border bg-black/20 text-studio-muted hover:text-red-400'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${recording ? 'bg-red-400' : 'bg-current'}`} />
          {recording ? 'Stop' : 'Rec'}
        </button>
        <button className="flex items-center gap-1 rounded-md border border-studio-border bg-black/20 px-2 py-1 text-[11px] text-studio-muted hover:text-studio-text transition">
          <Scissors className="h-3 w-3" /> Cut
        </button>
        <button className="flex items-center gap-1 rounded-md border border-studio-border bg-black/20 px-2 py-1 text-[11px] text-studio-muted hover:text-studio-text transition">
          <Clapperboard className="h-3 w-3" /> Add Shot
        </button>
      </div>

      {/* Track lanes */}
      <div className="h-24 overflow-y-auto">
        {['Main Camera', 'Dolly Cam', 'Key Light', 'Hero'].map((track, i) => (
          <div key={track} className="flex items-center border-b border-studio-border/40">
            <div className="w-28 shrink-0 border-r border-studio-border px-2 py-1">
              <p className="text-[10px] text-studio-muted truncate">{track}</p>
            </div>
            <div className="relative h-6 flex-1">
              {/* Sample keyframe blocks */}
              <div
                className="absolute top-1 h-4 rounded bg-amber-500/25 border border-amber-500/40"
                style={{ left: `${10 + i * 5}%`, width: '30%' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Viewport overlay: cinematic guides ───────────────────────────────────────

function CinematicOverlay() {
  const [showGuides, setShowGuides] = useState(true);

  return (
    <>
      {showGuides && (
        <div className="pointer-events-none absolute inset-0 z-10">
          {/* Rule of thirds lines */}
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr 1fr 1fr' }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="border border-white/10" />
            ))}
          </div>
          {/* Safe frame */}
          <div className="absolute inset-[5%] border border-amber-400/30" />
          {/* Letterbox bars */}
          <div className="absolute inset-x-0 top-0 h-[8%] bg-black/50" />
          <div className="absolute inset-x-0 bottom-0 h-[8%] bg-black/50" />
        </div>
      )}
      {/* Guide toggle */}
      <button
        onClick={() => setShowGuides((v) => !v)}
        title="Toggle cinematic guides"
        className="absolute right-2 top-2 z-20 rounded-md border border-studio-border bg-studio-panel/80 px-2 py-1 text-[10px] text-studio-muted backdrop-blur transition hover:text-amber-400"
      >
        {showGuides ? '✕ Guides' : '⊞ Guides'}
      </button>
    </>
  );
}

// ── Layout ───────────────────────────────────────────────────────────────────

interface FilmmakerLayoutProps {
  viewportSlot: React.ReactNode;
}

export function FilmmakerLayout({ viewportSlot }: FilmmakerLayoutProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <FilmSceneTree />
        <div className="relative flex-1 overflow-hidden">
          {viewportSlot}
          <CinematicOverlay />
        </div>
        <CameraInspector />
      </div>
      <CinematicTimeline />
    </div>
  );
}
