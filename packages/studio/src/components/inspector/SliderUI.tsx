import React, { useState, useCallback } from 'react';
import { RotateCcw, ChevronDown } from 'lucide-react';

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  onReset?: () => void;
  tooltip?: string;
  accent?: string;
}

export function PBRSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  onReset,
  tooltip,
  accent,
}: SliderProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const startEdit = useCallback(() => {
    setEditing(true);
    setEditValue(value.toFixed(step < 0.01 ? 3 : 2));
  }, [value, step]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed)) {
      onChange(Math.max(min, Math.min(max, parsed)));
    }
  }, [editValue, onChange, min, max]);

  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="group" title={tooltip}>
      <div className="flex items-center justify-between text-[10px] text-studio-muted mb-0.5">
        <span className="flex items-center gap-1">
          {label}
          {onReset && value !== 0 && (
            <button
              onClick={onReset}
              className="opacity-0 group-hover:opacity-100 transition text-studio-muted/40 hover:text-studio-text"
            >
              <RotateCcw className="h-2 w-2" />
            </button>
          )}
        </span>
        {editing ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
            className="w-12 text-right bg-transparent border-b border-studio-accent text-studio-text text-[10px] font-mono outline-none"
            autoFocus
          />
        ) : (
          <span
            className="font-mono cursor-text hover:text-studio-text"
            role="button"
            tabIndex={0}
            onClick={startEdit}
            onKeyDown={(e) => e.key === 'Enter' && startEdit()}
          >
            {value.toFixed(step < 0.01 ? 3 : 2)}
          </span>
        )}
      </div>
      <div className="relative h-1.5 w-full rounded-full bg-studio-bg">
        <div
          className="absolute h-1.5 rounded-full transition-all duration-100"
          style={{
            width: `${pct}%`,
            backgroundColor: accent || 'var(--studio-accent)',
          }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        className="w-full -mt-1.5 opacity-0 cursor-pointer h-4"
        style={{ position: 'relative', zIndex: 1 }}
      />
    </div>
  );
}

export interface SectionProps {
  id?: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  active: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  accent?: string;
}

export function Section({
  id,
  label,
  icon: Icon,
  active,
  onToggle,
  children,
  accent,
}: SectionProps) {
  return (
    <div id={id} className="border-b border-studio-border">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-studio-muted hover:text-studio-text"
      >
        <Icon className="h-3 w-3" style={{ color: accent }} />
        {label}
        <ChevronDown className={`h-3 w-3 ml-auto transition ${active ? 'rotate-180' : ''}`} />
      </button>
      {active && <div className="flex flex-col gap-2 px-3 pb-3">{children}</div>}
    </div>
  );
}
