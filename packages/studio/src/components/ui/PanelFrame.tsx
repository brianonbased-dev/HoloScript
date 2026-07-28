'use client';

/**
 * PanelFrame — Studio-local panel wrapper primitive.
 *
 * Provides a consistent header (icon + title + optional badge + close button)
 * and body area for right-rail descriptor panels, extending the
 * RightRailPanelHost pattern.  Uses studio Tailwind tokens so it must stay
 * studio-local (not in @holoscript/ui which has no studio theme).
 *
 * Part of B2 studio consolidation (splendid-popping-lark plan).
 *
 * Usage:
 *   <PanelFrame title="Models" icon="📐" onClose={onClose}>
 *     <ModelList />
 *   </PanelFrame>
 */

import React from 'react';
import { X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PanelFrameProps {
  /** Panel heading text */
  title: React.ReactNode;
  /** Optional emoji or React icon prepended to the title */
  icon?: React.ReactNode;
  /** Optional badge text shown to the right of the title (e.g. item count) */
  badge?: React.ReactNode;
  /** Called when the close button is clicked.  Omit to hide the close button. */
  onClose?: () => void;
  /** Content rendered in the scrollable body area */
  children: React.ReactNode;
  /** Extra class names on the outer wrapper */
  className?: string;
  /** Extra class names on the body div */
  bodyClassName?: string;
  /** When true the body is rendered without padding (useful for full-bleed lists) */
  noPadding?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PanelFrame({
  title,
  icon,
  badge,
  onClose,
  children,
  className,
  bodyClassName,
  noPadding = false,
}: PanelFrameProps) {
  return (
    <div
      className={`flex flex-col h-full bg-studio-panel text-studio-text text-xs ${className ?? ''}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-studio-border/20 shrink-0">
        <div className="flex items-center gap-1.5">
          {icon && <span className="shrink-0">{icon}</span>}
          <h3 className="text-sm font-semibold text-studio-text">{title}</h3>
          {badge !== undefined && (
            <span className="text-[10px] text-studio-muted ml-1">{badge}</span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded p-0.5 text-studio-muted transition-colors hover:bg-white/10 hover:text-studio-text"
            aria-label="Close panel"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className={`flex-1 overflow-y-auto ${noPadding ? '' : 'p-3'} ${bodyClassName ?? ''}`}>
        {children}
      </div>
    </div>
  );
}
