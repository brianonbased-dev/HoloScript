'use client';

/**
 * BiomechanicsPanel — Sports biomechanics analysis with joint angles and force data.
 */

import { useState } from 'react';
import { Activity, Dumbbell, Target, BarChart3, Eye, Play } from 'lucide-react';

export interface JointData { name: string; angle: number; velocity: number; torque: number; rom: [number, number]; }
export interface MotionCapture { id: string; name: string; sport: string; duration: number; fps: number; joints: JointData[]; peakForce: number; notes: string; }

const DEMO_CAPTURES: MotionCapture[] = [
  { id: '1', name: 'Sprint Start', sport: 'Track', duration: 2.5, fps: 240, peakForce: 2400, notes: 'Left leg push-off analysis',
    joints: [
      { name: 'Hip L', angle: 145, velocity: 320, torque: 180, rom: [0, 180] },
      { name: 'Knee L', angle: 85, velocity: 450, torque: 220, rom: [0, 160] },
      { name: 'Ankle L', angle: 110, velocity: 280, torque: 95, rom: [60, 140] },
      { name: 'Hip R', angle: 60, velocity: 180, torque: 140, rom: [0, 180] },
      { name: 'Knee R', angle: 130, velocity: 200, torque: 160, rom: [0, 160] },
    ]},
  { id: '2', name: 'Tennis Serve', sport: 'Tennis', duration: 1.8, fps: 300, peakForce: 1800, notes: 'Flat serve technique',
    joints: [
      { name: 'Shoulder R', angle: 170, velocity: 1200, torque: 80, rom: [0, 180] },
      { name: 'Elbow R', angle: 90, velocity: 900, torque: 50, rom: [0, 160] },
      { name: 'Wrist R', angle: 160, velocity: 1500, torque: 25, rom: [80, 200] },
      { name: 'Trunk Rot', angle: 45, velocity: 400, torque: 200, rom: [-90, 90] },
    ]},
  { id: '3', name: 'Vertical Jump', sport: 'Basketball', duration: 0.8, fps: 240, peakForce: 3200, notes: 'Countermovement jump',
    joints: [
      { name: 'Hip', angle: 175, velocity: 500, torque: 250, rom: [0, 180] },
      { name: 'Knee', angle: 170, velocity: 600, torque: 280, rom: [0, 160] },
      { name: 'Ankle', angle: 140, velocity: 700, torque: 120, rom: [60, 140] },
    ]},
];

export function BiomechanicsPanel() {
  const [captures] = useState<MotionCapture[]>(DEMO_CAPTURES);
  const [selected, setSelected] = useState<string>('1');
  const sel = captures.find(c => c.id === selected);

  return (
    <div className="flex flex-col overflow-auto">
      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
        <Dumbbell className="h-4 w-4 text-orange-400" />
        <span className="text-sm font-semibold text-studio-text">Biomechanics</span>
      </div>

      {/* Capture List */}
      {captures.map(c => (
        <div key={c.id} onClick={() => setSelected(c.id)} className={`flex items-center gap-2 border-b border-studio-border/30 px-3 py-2 cursor-pointer ${selected === c.id ? 'bg-orange-500/10' : 'hover:bg-studio-panel/50'}`}>
          <Activity className="h-3.5 w-3.5 text-studio-muted/40" />
          <div className="flex-1">
            <div className="text-xs font-semibold text-studio-text">{c.name}</div>
            <div className="text-[10px] text-studio-muted">{c.sport} · {c.fps}fps · {c.duration}s</div>
          </div>
          <span className="font-mono text-[10px] text-orange-400">{c.peakForce}N</span>
        </div>
      ))}

      {/* Joint Data */}
      {sel && <>
        <div className="border-t border-studio-border px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted">Joint Analysis — {sel.name}</span>
            <span className="text-[9px] text-studio-muted">Peak: {sel.peakForce}N</span>
          </div>
          {sel.joints.map(j => (
            <div key={j.name} className="flex items-center gap-2 py-1.5 border-b border-studio-border/20">
              <span className="w-20 text-[11px] text-studio-text">{j.name}</span>
              {/* Angle bar */}
              <div className="flex-1">
                <div className="flex justify-between text-[8px] text-studio-muted"><span>Angle</span><span>{j.angle}°</span></div>
                <div className="h-1.5 rounded-full bg-studio-panel"><div className="h-1.5 rounded-full bg-orange-400" style={{ width: `${(j.angle / j.rom[1]) * 100}%` }} /></div>
              </div>
              {/* Velocity */}
              <div className="w-16 text-right">
                <div className="text-[8px] text-studio-muted">Vel</div>
                <div className="font-mono text-[10px] text-blue-400">{j.velocity}°/s</div>
              </div>
              {/* Torque */}
              <div className="w-14 text-right">
                <div className="text-[8px] text-studio-muted">Torque</div>
                <div className="font-mono text-[10px] text-emerald-400">{j.torque}Nm</div>
              </div>
            </div>
          ))}
        </div>
        <div className="px-3 py-2 text-[11px] text-studio-muted italic">{sel.notes}</div>
      </>}
    </div>
  );
}
