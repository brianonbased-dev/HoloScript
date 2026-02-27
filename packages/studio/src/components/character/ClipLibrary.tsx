'use client';

import { useState } from 'react';
import { useCharacterStore } from '@/lib/store';
import { Play, Square, Circle, Trash2, Edit3, Check, X, Download } from 'lucide-react';

function formatDuration(ms: number): string {
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

function ClipRow({
  clip,
  isActive,
  onExport
}: {
  clip: { id: string; name: string; duration: number };
  isActive: boolean;
  onExport?: (clipId: string) => void;
}) {
  const setActiveClipId = useCharacterStore((s) => s.setActiveClipId);
  const removeRecordedClip = useCharacterStore((s) => s.removeRecordedClip);
  const renameRecordedClip = useCharacterStore((s) => s.renameRecordedClip);
  const activeClipId = useCharacterStore((s) => s.activeClipId);

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(clip.name);

  const commitRename = () => {
    if (editValue.trim()) renameRecordedClip(clip.id, editValue.trim());
    setEditing(false);
  };

  return (
    <div className={`group flex items-center gap-2 rounded-lg border px-2 py-1.5 transition ${
      isActive ? 'border-purple-500/60 bg-purple-500/10' : 'border-studio-border hover:border-studio-border/80 hover:bg-white/5'
    }`}>
      {/* Play/Stop */}
      <button
        onClick={() => setActiveClipId(activeClipId === clip.id ? null : clip.id)}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition ${
          isActive ? 'bg-purple-500/30 text-purple-400' : 'bg-white/5 text-studio-muted hover:text-purple-400'
        }`}
      >
        {isActive ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      </button>

      {/* Name + duration */}
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false); }}
              className="w-full rounded bg-black/30 px-1 py-0.5 text-[11px] text-studio-text outline-none focus:ring-1 focus:ring-purple-500/40"
            />
            <button onClick={commitRename}><Check className="h-3 w-3 text-emerald-400" /></button>
            <button onClick={() => setEditing(false)}><X className="h-3 w-3 text-red-400" /></button>
          </div>
        ) : (
          <p className="truncate text-[11px] font-medium text-studio-text">{clip.name}</p>
        )}
        <p className="text-[9px] text-studio-muted">{formatDuration(clip.duration)}</p>
      </div>

      {/* Actions */}
      {!editing && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
          {onExport && (
            <button
              onClick={() => onExport(clip.id)}
              className="rounded p-0.5 text-studio-muted hover:text-green-400"
              title="Export to MP4"
            >
              <Download className="h-3 w-3" />
            </button>
          )}
          <button onClick={() => setEditing(true)} className="rounded p-0.5 text-studio-muted hover:text-studio-text">
            <Edit3 className="h-3 w-3" />
          </button>
          <button onClick={() => removeRecordedClip(clip.id)} className="rounded p-0.5 text-studio-muted hover:text-red-400">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

export function RecordingControls() {
  const isRecording = useCharacterStore((s) => s.isRecording);
  const setIsRecording = useCharacterStore((s) => s.setIsRecording);
  const glbUrl = useCharacterStore((s) => s.glbUrl);

  const [elapsedMs, setElapsedMs] = useState(0);
  const intervalRef = { current: null as ReturnType<typeof setInterval> | null };

  const toggleRecord = () => {
    if (isRecording) {
      setIsRecording(false);
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    } else {
      setElapsedMs(0);
      setIsRecording(true);
      intervalRef.current = setInterval(() => setElapsedMs((t) => t + 100), 100);
    }
  };

  const disabled = !glbUrl;

  return (
    <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
      <button
        onClick={toggleRecord}
        disabled={disabled}
        title={isRecording ? 'Stop recording' : 'Start recording bone movement as animation'}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
          isRecording
            ? 'animate-pulse border-red-500/60 bg-red-500/15 text-red-400'
            : disabled
            ? 'cursor-not-allowed border-studio-border text-studio-muted/40'
            : 'border-red-500/40 bg-black/20 text-red-400 hover:bg-red-500/10'
        }`}
      >
        {isRecording ? <Square className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" fill={disabled ? 'none' : 'currentColor'} />}
        {isRecording
          ? `Stop  ${(elapsedMs / 1000).toFixed(1)}s`
          : '⏺ Record'}
      </button>

      {!glbUrl && (
        <p className="text-[10px] text-studio-muted">Load a model first</p>
      )}
    </div>
  );
}

export function ClipLibrary({ onExport }: { onExport?: (clipId: string) => void }) {
  const recordedClips = useCharacterStore((s) => s.recordedClips);
  const activeClipId = useCharacterStore((s) => s.activeClipId);
  const builtinAnimations = useCharacterStore((s) => s.builtinAnimations);
  const activeBuiltinAnimation = useCharacterStore((s) => s.activeBuiltinAnimation);
  const setActiveBuiltinAnimation = useCharacterStore((s) => s.setActiveBuiltinAnimation);
  const setActiveClipId = useCharacterStore((s) => s.setActiveClipId);

  return (
    <div className="flex h-full w-56 shrink-0 flex-col border-l border-studio-border bg-studio-panel">
      {/* Recording controls at top */}
      <RecordingControls />

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {/* Recorded Clips */}
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-studio-muted">
            <span className="text-red-400">●</span> Recorded Clips
          </p>
          {recordedClips.length === 0 ? (
            <p className="rounded-lg border border-dashed border-studio-border p-3 text-center text-[10px] text-studio-muted">
              Hit ⏺ Record and move bones in the viewport to create a clip
            </p>
          ) : (
            <div className="space-y-1">
              {recordedClips.map((clip) => (
                <ClipRow key={clip.id} clip={clip} isActive={activeClipId === clip.id} onExport={onExport} />
              ))}
            </div>
          )}
        </div>

        {/* Built-in Animations */}
        {builtinAnimations.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-studio-muted">
              Built-in Animations
            </p>
            <div className="space-y-1">
              {builtinAnimations.map(({ name, duration }) => {
                const isActive = activeBuiltinAnimation === name;
                return (
                  <button
                    key={name}
                    onClick={() => {
                      setActiveClipId(null);
                      setActiveBuiltinAnimation(isActive ? null : name);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
                      isActive ? 'border-amber-500/60 bg-amber-500/10' : 'border-studio-border hover:bg-white/5'
                    }`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${isActive ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-studio-muted'}`}>
                      {isActive ? <Square className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] text-studio-text">{name}</p>
                      <p className="text-[9px] text-studio-muted">{formatDuration(duration)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
