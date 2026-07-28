/**
 * TabGroup — Canonical tab switcher primitive for @holoscript/ui.
 *
 * Replaces the 17+ inline tab-header patterns scattered across studio panels
 * (B2 studio consolidation, splendid-popping-lark plan).
 *
 * Usage:
 *   <TabGroup
 *     tabs={[
 *       { id: 'controls', label: 'Controls' },
 *       { id: 'dof',      label: 'DoF' },
 *     ]}
 *     active="controls"
 *     onChange={setActiveTab}
 *   />
 */

import * as React from 'react';
import { cn } from '../utils/cn';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TabItem {
  /** Stable identifier — used as active/onChange value */
  id: string;
  /** Text or element shown on the tab button */
  label: React.ReactNode;
  /** When true the tab button is rendered but cannot be clicked */
  disabled?: boolean;
  /** Optional icon prepended to the label */
  icon?: React.ReactNode;
}

export interface TabGroupProps<T extends string = string> {
  tabs: TabItem[];
  active: T;
  onChange: (id: T) => void;
  /**
   * Visual style variant.
   * - `pill`   — rounded pills with accent fill (default, matches most studio panels)
   * - `line`   — bottom-border underline style
   * - `filled` — filled square tiles
   */
  variant?: 'pill' | 'line' | 'filled';
  /** Extra class names on the tab bar container */
  className?: string;
  /** Extra class names applied to every tab button */
  tabClassName?: string;
}

// ─── Variant styles ───────────────────────────────────────────────────────────

const CONTAINER_VARIANT: Record<NonNullable<TabGroupProps['variant']>, string> = {
  pill: 'flex gap-0.5',
  line: 'flex border-b border-white/10',
  filled: 'flex',
};

function tabVariantClass(variant: NonNullable<TabGroupProps['variant']>, active: boolean): string {
  switch (variant) {
    case 'pill':
      return active
        ? 'bg-emerald-500/20 text-emerald-400'
        : 'bg-white/5 text-gray-400 hover:text-gray-200 hover:bg-white/10';
    case 'line':
      return active
        ? 'border-b-2 border-emerald-500 text-white -mb-px'
        : 'text-gray-400 hover:text-gray-200';
    case 'filled':
      return active
        ? 'bg-emerald-600 text-white'
        : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TabGroup<T extends string = string>({
  tabs,
  active,
  onChange,
  variant = 'pill',
  className,
  tabClassName,
}: TabGroupProps<T>) {
  return (
    <div role="tablist" className={cn(CONTAINER_VARIANT[variant], className)}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.id as T)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[10px] capitalize transition',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
              'disabled:pointer-events-none disabled:opacity-40',
              tabVariantClass(variant, isActive),
              tabClassName
            )}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
