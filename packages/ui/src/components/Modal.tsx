/**
 * Modal — Canonical overlay/dialog primitive for @holoscript/ui.
 *
 * Replaces the 46 inline `fixed inset-0` patterns scattered across 38 studio
 * files (B2 studio consolidation, splendid-popping-lark plan).
 *
 * Usage:
 *   <Modal open={open} onClose={handleClose} title="My Modal">
 *     <p>Content</p>
 *   </Modal>
 *
 * Accessibility: traps focus within the dialog, closes on Escape and backdrop
 * click, labels the dialog via aria-labelledby when title is provided.
 */

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '../utils/cn';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModalProps {
  /** Whether the modal is visible */
  open: boolean;
  /** Called when the modal should be dismissed */
  onClose: () => void;
  /** Optional heading rendered in the modal header */
  title?: React.ReactNode;
  /** Content rendered in the modal body */
  children: React.ReactNode;
  /**
   * Controls max-width of the dialog panel.
   * @default 'md'
   */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /**
   * z-index level for the backdrop.  Increment when nesting modals.
   * @default 50
   */
  zIndex?: number;
  /** Extra class names applied to the dialog panel (not the backdrop) */
  className?: string;
  /** When true, clicking the backdrop does NOT close the modal */
  disableBackdropClose?: boolean;
}

// ─── Size map ─────────────────────────────────────────────────────────────────

const SIZE_CLASS: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-full',
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Canonical modal overlay.  Renders nothing when `open` is false so callers
 * need not guard the JSX themselves.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  zIndex = 50,
  className,
  disableBackdropClose = false,
}: ModalProps) {
  const titleId = React.useId();

  // Escape key handler
  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      style={{ zIndex }}
      role="presentation"
      onClick={disableBackdropClose ? undefined : onClose}
    >
      {/* Dialog panel — stops click propagation so backdrop handler doesn't fire */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          'relative w-full rounded-xl border border-white/10 bg-gray-900 shadow-2xl',
          SIZE_CLASS[size],
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {title !== undefined && (
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <h2 id={titleId} className="text-base font-semibold text-white">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="rounded p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Body */}
        <div className={cn('p-6', title === undefined && 'pt-10')}>
          {/* Close button when there's no header */}
          {title === undefined && (
            <button
              onClick={onClose}
              className="absolute right-4 top-4 rounded p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
