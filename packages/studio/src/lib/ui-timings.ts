/**
 * ui-timings.ts — Named UI timing constants
 *
 * Replaces magic numbers scattered across components.
 * All values are in milliseconds.
 *
 * Categories:
 *   FEEDBACK_*  — transient state reset after user action (copy, save, apply)
 *   TOAST_*     — toast notification auto-dismiss durations
 *   DEBOUNCE_*  — debounce intervals for user input
 *   POLL_*      — polling intervals for status checks
 *   ANIM_*      — animation/transition durations
 */

// ── Feedback reset durations ─────────────────────────────────────────────────
/** How long a "Copied!" button state stays visible before resetting (1.5s) */
export const COPY_FEEDBACK_DURATION = 1500;

/** How long a "Saved!" or success state stays visible before resetting (2s) */
export const SAVE_FEEDBACK_DURATION = 2000;

/** How long an "Applied!" badge stays visible before clearing (2s) */
export const APPLY_FEEDBACK_DURATION = 2000;

/** How long a status message lingers before auto-clearing (3s) */
export const STATUS_RESET_DURATION = 3000;

// ── Toast auto-dismiss durations ─────────────────────────────────────────────
/** Short notice — info/minor feedback (2s) */
export const TOAST_SHORT = 2000;

/** Standard notice — confirmations, progress (3s) */
export const TOAST_STANDARD = 3000;

/** Important notice — warnings, multi-step completions (4s) */
export const TOAST_IMPORTANT = 4000;

// ── Debounce intervals ───────────────────────────────────────────────────────
/** Input debounce for search/filter fields (300ms) */
export const DEBOUNCE_INPUT = 300;

/** Batch flush debounce for annotation/event buffering (500ms) */
export const DEBOUNCE_FLUSH = 500;

/** Debounce for heavy recalculations triggered by slider input (800ms) */
export const DEBOUNCE_HEAVY = 800;

// ── Polling intervals ────────────────────────────────────────────────────────
/** Fast status poll — AI generation, deploy progress (3s) */
export const POLL_FAST = 3000;

/** Standard status poll — Ollama health, connection checks (5s) */
export const POLL_STANDARD = 5000;

/** Slow housekeeping poll — collab cursor eviction (10s) */
export const POLL_SLOW = 10000;

// ── Animation / transition durations ────────────────────────────────────────
/** Wizard step transition (600ms) */
export const ANIM_WIZARD_STEP = 600;

/** UI element hide-then-navigate (800ms) */
export const ANIM_NAVIGATE = 800;
