'use client';

/**
 * NodeInspectorPanel — per-object property editor.
 * Uses useNodeInspector to get typed property groups from the scene code.
 */

import { SlidersHorizontal, X, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';
import { useNodeInspector } from '@/hooks/useNodeInspector';
import type { PropGroup, SceneProp } from '@/hooks/useNodeInspector';
import { useSceneStore } from '@/lib/store';

interface NodeInspectorPanelProps { onClose: () => void; }

// ─── Property controls ────────────────────────────────────────────────────────

function ColorProp({ prop, onChange }: { prop: SceneProp; onChange: (v: string) => void }) {
  const color = (prop.value as string) || '#ffffff';
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={color.startsWith('"') ? color.slice(1, -1) : color}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-10 cursor-pointer rounded border border-studio-border bg-transparent p-0" />
      <span className="font-mono text-[9px] text-studio-muted">{typeof color === 'string' ? color.replace(/"/g, '') : color}</span>
    </div>
  );
}

function FloatProp({ prop, onChange }: { prop: SceneProp; onChange: (v: number) => void }) {
  const val = typeof prop.value === 'number' ? prop.value : parseFloat(String(prop.value)) || 0;
  return (
    <div className="flex items-center gap-2">
      <input
        type="range" min={prop.min ?? 0} max={prop.max ?? 1} step={prop.step ?? 0.01}
        value={val} onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer accent-studio-accent"
      />
      <input
        type="number" value={val}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-14 rounded border border-studio-border bg-studio-surface px-1.5 py-0.5 text-[9px] text-center outline-none focus:border-studio-accent"
        step={prop.step ?? 0.01} min={prop.min} max={prop.max}
      />
    </div>
  );
}

function Vec3Prop({ prop, onChange }: { prop: SceneProp; onChange: (v: [number,number,number]) => void }) {
  const vec = Array.isArray(prop.value) ? prop.value as [number,number,number] : [0,0,0] as [number,number,number];
  const labels = ['X', 'Y', 'Z'];
  const colors = ['text-red-400', 'text-green-400', 'text-blue-400'];
  return (
    <div className="grid grid-cols-3 gap-1">
      {vec.map((v, i) => (
        <div key={i} className="flex items-center gap-0.5">
          <span className={`text-[8px] font-bold w-3 shrink-0 ${colors[i]}`}>{labels[i]}</span>
          <input type="number" value={v.toFixed(3)}
            onChange={(e) => {
              const next: [number,number,number] = [...vec] as [number,number,number];
              next[i] = parseFloat(e.target.value) || 0;
              onChange(next);
            }}
            className="w-full rounded border border-studio-border bg-studio-surface px-1 py-0.5 text-[8px] outline-none focus:border-studio-accent text-center"
            step={prop.step ?? 0.001}
          />
        </div>
      ))}
    </div>
  );
}

function BoolProp({ prop, onChange }: { prop: SceneProp; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!prop.value)}
      className={`flex h-5 w-10 items-center rounded-full transition-colors duration-200 px-0.5 ${prop.value ? 'bg-studio-accent' : 'bg-studio-muted/30'}`}
    >
      <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${prop.value ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

function EnumProp({ prop, onChange }: { prop: SceneProp; onChange: (v: string) => void }) {
  return (
    <select value={String(prop.value)} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-studio-border bg-studio-surface px-2 py-1 text-[9px] text-studio-text outline-none focus:border-studio-accent">
      {(prop.options ?? []).map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}

function StringProp({ prop, onChange }: { prop: SceneProp; onChange: (v: string) => void }) {
  return (
    <input value={String(prop.value)} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-studio-border bg-studio-surface px-2 py-1 text-[9px] text-studio-text outline-none focus:border-studio-accent" />
  );
}

// ─── Group card ───────────────────────────────────────────────────────────────

function GroupCard({ group, onSet }: { group: PropGroup; onSet: (key: string, v: SceneProp['value']) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-studio-border overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 bg-studio-surface px-3 py-2 text-left hover:bg-studio-surface/80">
        <span>{group.icon}</span>
        <span className="flex-1 text-[10px] font-semibold">{group.label}</span>
        {open ? <ChevronDown className="h-3 w-3 text-studio-muted" /> : <ChevronRight className="h-3 w-3 text-studio-muted" />}
      </button>
      {open && (
        <div className="divide-y divide-studio-border/40">
          {group.props.map((prop) => (
            <div key={prop.key} className="grid grid-cols-[auto_1fr] items-center gap-2 px-3 py-2">
              <span className="text-[8px] text-studio-muted w-20 shrink-0">{prop.label}</span>
              <div className="min-w-0">
                {prop.type === 'color'   && <ColorProp   prop={prop} onChange={(v) => onSet(prop.key, v)} />}
                {prop.type === 'float'   && <FloatProp   prop={prop} onChange={(v) => onSet(prop.key, v)} />}
                {prop.type === 'vec3'    && <Vec3Prop    prop={prop} onChange={(v) => onSet(prop.key, v)} />}
                {prop.type === 'boolean' && <BoolProp    prop={prop} onChange={(v) => onSet(prop.key, v)} />}
                {prop.type === 'enum'    && <EnumProp    prop={prop} onChange={(v) => onSet(prop.key, v)} />}
                {prop.type === 'string'  && <StringProp  prop={prop} onChange={(v) => onSet(prop.key, v)} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function NodeInspectorPanel({ onClose }: NodeInspectorPanelProps) {
  const [objectName, setObjectName] = useState<string | null>(null);
  const [inputVal, setInputVal] = useState('');

  // Extract object names from scene code for autocomplete
  const code = useSceneStore((s) => s.code) ?? '';
  const objectNames = useMemo(() => {
    const matches = code.matchAll(/^\s*(?:object|scene|group)\s+(\w+)\s*/gm);
    return [...matches].map((m) => m[1]).filter(Boolean);
  }, [code]);

  const { objectType, groups, lineRange, setProperty } = useNodeInspector(objectName);

  const handleSet = useCallback((trait: string, key: string, value: SceneProp['value']) => {
    setProperty(trait, key, value);
  }, [setProperty]);

  const handleSubmit = () => {
    const trimmed = inputVal.trim();
    setObjectName(trimmed || null);
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <SlidersHorizontal className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Inspector</span>
        {objectName && (
          <code className="ml-1 rounded bg-studio-surface px-1.5 py-0.5 text-[9px] text-studio-accent">{objectName}</code>
        )}
        {lineRange && (
          <span className="text-[7px] text-studio-muted/60">L{lineRange[0]}–{lineRange[1]}</span>
        )}
        <button onClick={onClose} className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Object picker */}
      <div className="shrink-0 border-b border-studio-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Search className="h-3.5 w-3.5 text-studio-muted shrink-0" />
          <input
            list="inspector-obj-list"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            placeholder="Type object name…"
            className="flex-1 bg-transparent text-[10px] text-studio-text placeholder:text-studio-muted/60 outline-none"
          />
          <datalist id="inspector-obj-list">
            {objectNames.map((n) => <option key={n} value={n} />)}
          </datalist>
          <button onClick={handleSubmit}
            className="rounded-lg bg-studio-accent/20 px-2 py-0.5 text-[8px] text-studio-accent hover:bg-studio-accent/30 transition">
            Inspect
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!objectName && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <SlidersHorizontal className="h-10 w-10 text-studio-muted/20" />
            <p className="text-[10px] text-studio-muted">Type an object name above</p>
            <p className="text-[8px] text-studio-muted/60">
              {objectNames.length > 0 ? `${objectNames.length} objects in scene` : 'No objects found'}
            </p>
          </div>
        )}

        {objectName && groups.length === 0 && (
          <div className="rounded-xl border border-studio-border bg-studio-surface/40 p-4 text-center text-[9px] text-studio-muted">
            No @trait blocks found in <code>{objectName}</code>.<br />
            <span className="text-[8px]">Add @transform, @material, etc. to your object.</span>
          </div>
        )}

        {groups.map((group) => (
          <GroupCard key={group.trait} group={group} onSet={(key, val) => handleSet(group.trait, key, val)} />
        ))}
      </div>

      {/* Footer */}
      {objectName && (
        <div className="shrink-0 border-t border-studio-border px-3 py-2 flex items-center gap-2 text-[7px] text-studio-muted">
          <span className="capitalize">{objectType ?? 'object'}</span>
          {lineRange && <><span>·</span><span>{lineRange[1] - lineRange[0] + 1} lines</span></>}
          {groups.length > 0 && <><span>·</span><span>{groups.reduce((a, g) => a + g.props.length, 0)} props</span></>}
          <span className="ml-auto">writes to code ↑</span>
        </div>
      )}
    </div>
  );
}
