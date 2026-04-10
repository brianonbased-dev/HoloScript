'use client';

/**
 * KeyframeEditor — Animation timeline with easing presets.
 */

import { useState, useCallback } from 'react';
import { Play, Pause, SkipBack, Repeat, Plus, Trash2, Copy, Diamond, Clock } from 'lucide-react';

export type EasingType =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'bounce-out'
  | 'elastic-out';
export type AnimProperty =
  | 'position.x'
  | 'position.y'
  | 'position.z'
  | 'rotation.x'
  | 'rotation.y'
  | 'rotation.z'
  | 'scale.x'
  | 'scale.y'
  | 'scale.z'
  | 'opacity';

export interface Keyframe {
  time: number;
  value: number;
  easing: EasingType;
}
export interface AnimTrack {
  property: AnimProperty;
  keyframes: Keyframe[];
  enabled: boolean;
}
export interface AnimationClip {
  name: string;
  duration: number;
  tracks: AnimTrack[];
  loop: boolean;
  speed: number;
}

export const EASING_FNS: Record<EasingType, (t: number) => number> = {
  linear: (t) => t,
  'ease-in': (t) => t * t,
  'ease-out': (t) => t * (2 - t),
  'ease-in-out': (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  'bounce-out': (t) => {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  },
  'elastic-out': (t) =>
    t === 0
      ? 0
      : t === 1
        ? 1
        : Math.pow(2, -10 * t) * Math.sin(((t - 0.075) * 2 * Math.PI) / 0.3) + 1,
};

export function evaluateTrack(track: AnimTrack, time: number): number {
  const kfs = track.keyframes;
  if (kfs.length === 0) return 0;
  if (kfs.length === 1 || time <= kfs[0].time) return kfs[0].value;
  if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;
  for (let i = 0; i < kfs.length - 1; i++) {
    if (time >= kfs[i].time && time <= kfs[i + 1].time) {
      const t = (time - kfs[i].time) / (kfs[i + 1].time - kfs[i].time);
      return kfs[i].value + (kfs[i + 1].value - kfs[i].value) * EASING_FNS[kfs[i + 1].easing](t);
    }
  }
  return kfs[kfs.length - 1].value;
}

const DEFAULT_CLIP: AnimationClip = {
  name: 'Untitled',
  duration: 3,
  loop: true,
  speed: 1,
  tracks: [
    {
      property: 'position.y',
      enabled: true,
      keyframes: [
        { time: 0, value: 0, easing: 'linear' },
        { time: 1.5, value: 2, easing: 'ease-out' },
        { time: 3, value: 0, easing: 'ease-in' },
      ],
    },
  ],
};

export function KeyframeEditor({
  onClipChange,
  onClose,
}: {
  onClipChange?: (c: AnimationClip) => void;
  onClose?: () => void;
}) {
  const [clip, setClip] = useState<AnimationClip>(DEFAULT_CLIP);
  const [selTrack, setSelTrack] = useState(0);
  const [selKf, setSelKf] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);

  const update = useCallback(
    (p: Partial<AnimationClip>) => {
      setClip((prev) => {
        const n = { ...prev, ...p };
        onClipChange?.(n);
        return n;
      });
    },
    [onClipChange]
  );

  const addTrack = useCallback(
    (prop: AnimProperty) => {
      update({
        tracks: [
          ...clip.tracks,
          {
            property: prop,
            enabled: true,
            keyframes: [
              { time: 0, value: 0, easing: 'linear' },
              { time: clip.duration, value: 0, easing: 'ease-in-out' },
            ],
          },
        ],
      });
    },
    [clip, update]
  );

  const addKf = useCallback(
    (ti: number, ti2: number, val: number) => {
      const tracks = [...clip.tracks];
      const t = {
        ...tracks[ti],
        keyframes: [
          ...tracks[ti].keyframes,
          { time: ti2, value: val, easing: 'ease-in-out' as EasingType },
        ].sort((a, b) => a.time - b.time),
      };
      tracks[ti] = t;
      update({ tracks });
    },
    [clip, update]
  );

  const updateKf = useCallback(
    (ti: number, ki: number, p: Partial<Keyframe>) => {
      const tracks = [...clip.tracks];
      const t = { ...tracks[ti], keyframes: [...tracks[ti].keyframes] };
      t.keyframes[ki] = { ...t.keyframes[ki], ...p };
      tracks[ti] = t;
      update({ tracks });
    },
    [clip, update]
  );

  const deleteKf = useCallback(
    (ti: number, ki: number) => {
      const tracks = [...clip.tracks];
      tracks[ti] = { ...tracks[ti], keyframes: tracks[ti].keyframes.filter((_, i) => i !== ki) };
      update({ tracks });
      setSelKf(null);
    },
    [clip, update]
  );

  const copyTrait = useCallback(() => {
    const lines = [
      `@animation "${clip.name}" {`,
      `  duration: ${clip.duration}`,
      `  loop: ${clip.loop}`,
    ];
    clip.tracks.forEach((t) => {
      lines.push(`  track "${t.property}" {`);
      t.keyframes.forEach((k) => lines.push(`    ${k.time}s: ${k.value} (${k.easing})`));
      lines.push('  }');
    });
    lines.push('}');
    navigator.clipboard?.writeText(lines.join('\n'));
  }, [clip]);

  const track = clip.tracks[selTrack];
  const unused: AnimProperty[] = (
    [
      'position.x',
      'position.y',
      'position.z',
      'rotation.x',
      'rotation.y',
      'rotation.z',
      'scale.x',
      'scale.y',
      'scale.z',
      'opacity',
    ] as AnimProperty[]
  ).filter((p) => !clip.tracks.some((t) => t.property === p));

  return (
    <div className="flex flex-col overflow-auto">
      <div className="flex items-center justify-between border-b border-studio-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-semibold text-studio-text">Keyframes</span>
        </div>
        <button
          onClick={copyTrait}
          className="rounded p-1 text-studio-muted hover:text-studio-text"
        >
          <Copy className="h-3 w-3" />
        </button>
      </div>

      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
        <button onClick={() => setTime(0)} className="text-studio-muted hover:text-studio-text">
          <SkipBack className="h-3.5 w.3.5" />
        </button>
        <button
          onClick={() => setPlaying(!playing)}
          className={playing ? 'text-amber-400' : 'text-emerald-400'}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
        </button>
        <button
          onClick={() => update({ loop: !clip.loop })}
          className={clip.loop ? 'text-studio-accent' : 'text-studio-muted'}
        >
          <Repeat className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1" />
        <span className="font-mono text-[10px] text-studio-muted">
          {time.toFixed(1)}s/{clip.duration}s
        </span>
        <input
          type="range"
          min={0}
          max={clip.duration * 100}
          value={time * 100}
          onChange={(e) => setTime(parseFloat(e.target.value) / 100)}
          className="w-24 accent-studio-accent"
        />
      </div>

      <div className="flex gap-2 border-b border-studio-border px-3 py-2">
        <label className="flex items-center gap-1 text-[10px] text-studio-muted">
          Dur
          <input
            type="number"
            value={clip.duration}
            min={0.1}
            step={0.1}
            onChange={(e) => update({ duration: parseFloat(e.target.value) || 1 })}
            className="w-14 rounded border border-studio-border bg-transparent px-1 py-0.5 text-studio-text outline-none"
          />
          s
        </label>
        <label className="flex items-center gap-1 text-[10px] text-studio-muted">
          Spd
          <input
            type="number"
            value={clip.speed}
            min={0.1}
            step={0.1}
            onChange={(e) => update({ speed: parseFloat(e.target.value) || 1 })}
            className="w-14 rounded border border-studio-border bg-transparent px-1 py-0.5 text-studio-text outline-none"
          />
          x
        </label>
      </div>

      <div className="flex flex-col border-b border-studio-border">
        {clip.tracks.map((t, i) => (
          <div
            key={i}
            onClick={() => setSelTrack(i)}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition ${selTrack === i ? 'bg-studio-accent/10 text-studio-accent' : 'text-studio-muted hover:bg-studio-panel/50'}`}
          >
            <Diamond className="h-3 w-3" />
            <span className="flex-1 font-mono text-[10px]">{t.property}</span>
            <span className="text-[9px] text-studio-muted/60">{t.keyframes.length}kf</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const ts = [...clip.tracks];
                ts.splice(i, 1);
                update({ tracks: ts });
              }}
              className="text-studio-muted/40 hover:text-red-400"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {unused.length > 0 && (
          <details className="px-3 py-1">
            <summary className="flex items-center gap-1 text-[10px] text-studio-muted cursor-pointer">
              <Plus className="h-3 w-3" /> Add
            </summary>
            <div className="flex flex-wrap gap-1 py-1">
              {unused.map((p) => (
                <button
                  key={p}
                  onClick={() => addTrack(p)}
                  className="rounded border border-studio-border px-1.5 py-0.5 text-[9px] text-studio-muted hover:text-studio-text"
                >
                  {p}
                </button>
              ))}
            </div>
          </details>
        )}
      </div>

      {track && (
        <div className="border-b border-studio-border px-3 py-2">
          <div className="relative h-8 rounded bg-studio-panel/50">
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <div
                key={t}
                className="absolute top-0 h-full border-l border-studio-border/30"
                style={{ left: `${t * 100}%` }}
              >
                <span className="absolute -top-3 text-[8px] text-studio-muted/40">
                  {(t * clip.duration).toFixed(1)}
                </span>
              </div>
            ))}
            {track.keyframes.map((kf, i) => (
              <button
                key={i}
                onClick={() => {
                  setSelKf(i);
                  setTime(kf.time);
                }}
                className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 transition ${selKf === i ? 'h-3.5 w-3.5 bg-studio-accent shadow-lg' : 'h-2.5 w-2.5 bg-blue-400 hover:bg-studio-accent'}`}
                style={{ left: `${(kf.time / clip.duration) * 100}%` }}
              />
            ))}
            <div
              className="absolute top-0 h-full w-px bg-emerald-400"
              style={{ left: `${(time / clip.duration) * 100}%` }}
            />
          </div>
          <button
            onClick={() => addKf(selTrack, time, evaluateTrack(track, time))}
            className="mt-1 flex items-center gap-1 text-[10px] text-studio-muted hover:text-studio-text"
          >
            <Plus className="h-3 w-3" />
            Add at {time.toFixed(1)}s
          </button>
        </div>
      )}

      {track && selKf !== null && track.keyframes[selKf] && (
        <div className="flex flex-col gap-2 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted">
            Keyframe {selKf + 1}
          </div>
          <div className="flex gap-2">
            <label className="flex flex-col gap-0.5 text-[10px] text-studio-muted">
              Time
              <input
                type="number"
                value={track.keyframes[selKf].time}
                step={0.1}
                min={0}
                max={clip.duration}
                onChange={(e) => updateKf(selTrack, selKf, { time: parseFloat(e.target.value) })}
                className="w-16 rounded border border-studio-border bg-transparent px-1 py-0.5 text-studio-text outline-none"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[10px] text-studio-muted">
              Value
              <input
                type="number"
                value={track.keyframes[selKf].value}
                step={0.1}
                onChange={(e) => updateKf(selTrack, selKf, { value: parseFloat(e.target.value) })}
                className="w-16 rounded border border-studio-border bg-transparent px-1 py-0.5 text-studio-text outline-none"
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(Object.keys(EASING_FNS) as EasingType[]).map((e) => (
              <button
                key={e}
                onClick={() => updateKf(selTrack, selKf, { easing: e })}
                className={`rounded px-1 py-0.5 text-[8px] transition ${track.keyframes[selKf].easing === e ? 'bg-blue-500/20 text-blue-400' : 'text-studio-muted hover:text-studio-text'}`}
              >
                {e}
              </button>
            ))}
          </div>
          <button
            onClick={() => deleteKf(selTrack, selKf)}
            className="flex items-center gap-1 text-[10px] text-red-400"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
