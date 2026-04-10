/**
 * AccessibilitySystem.ts
 *
 * Accessibility features: screen reader support, font scaling,
 * contrast modes, input remapping, and focus management.
 *
 * @module accessibility
 */

// =============================================================================
// TYPES
// =============================================================================

export type ContrastMode =
  | 'normal'
  | 'high'
  | 'inverted'
  | 'deuteranopia'
  | 'protanopia'
  | 'tritanopia';

export interface AccessibilityConfig {
  fontScale: number; // 0.5 - 3.0
  contrastMode: ContrastMode;
  reduceMotion: boolean;
  screenReaderEnabled: boolean;
  focusHighlight: boolean;
  cursorSize: number; // 1-3
  audioDescriptions: boolean;
  hapticFeedback: boolean;
}

export interface FocusableElement {
  id: string;
  label: string;
  role: string; // 'button' | 'slider' | 'input' | 'link' | 'heading'
  tabIndex: number;
  ariaLabel?: string;
}

export interface ScreenReaderEntry {
  timestamp: number;
  text: string;
  priority: 'polite' | 'assertive';
}

// =============================================================================
// ACCESSIBILITY SYSTEM
// =============================================================================

export class AccessibilitySystem {
  private config: AccessibilityConfig = {
    fontScale: 1.0,
    contrastMode: 'normal',
    reduceMotion: false,
    screenReaderEnabled: false,
    focusHighlight: true,
    cursorSize: 1,
    audioDescriptions: false,
    hapticFeedback: true,
  };

  private focusables: FocusableElement[] = [];
  private focusIndex = -1;
  private readerQueue: ScreenReaderEntry[] = [];
  private remappings: Map<string, string> = new Map(); // from → to
  private listeners: Array<(config: AccessibilityConfig) => void> = [];

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setConfig(config: Partial<AccessibilityConfig>): void {
    Object.assign(this.config, config);
    this.listeners.forEach((cb) => cb(this.config));
  }

  getConfig(): AccessibilityConfig {
    return { ...this.config };
  }

  onConfigChange(callback: (config: AccessibilityConfig) => void): void {
    this.listeners.push(callback);
  }

  // ---------------------------------------------------------------------------
  // Font Scaling
  // ---------------------------------------------------------------------------

  setFontScale(scale: number): void {
    this.config.fontScale = Math.max(0.5, Math.min(3.0, scale));
  }

  scaledFontSize(basePx: number): number {
    return Math.round(basePx * this.config.fontScale);
  }

  // ---------------------------------------------------------------------------
  // Contrast
  // ---------------------------------------------------------------------------

  setContrastMode(mode: ContrastMode): void {
    this.config.contrastMode = mode;
  }

  getContrastColors(): { bg: string; fg: string; accent: string } {
    switch (this.config.contrastMode) {
      case 'high':
        return { bg: '#000000', fg: '#FFFFFF', accent: '#FFFF00' };
      case 'inverted':
        return { bg: '#FFFFFF', fg: '#000000', accent: '#0000FF' };
      case 'deuteranopia':
        return { bg: '#1a1a2e', fg: '#e0e0e0', accent: '#4a9eff' };
      case 'protanopia':
        return { bg: '#1a1a2e', fg: '#e0e0e0', accent: '#ffcc00' };
      case 'tritanopia':
        return { bg: '#1a1a2e', fg: '#e0e0e0', accent: '#ff6b6b' };
      default:
        return { bg: '#1a1a2e', fg: '#e0e0e0', accent: '#6c63ff' };
    }
  }

  // ---------------------------------------------------------------------------
  // Screen Reader
  // ---------------------------------------------------------------------------

  announce(text: string, priority: 'polite' | 'assertive' = 'polite'): void {
    if (!this.config.screenReaderEnabled) return;
    this.readerQueue.push({ timestamp: Date.now(), text, priority });
  }

  flushAnnouncements(): ScreenReaderEntry[] {
    const entries = [...this.readerQueue];
    this.readerQueue = [];
    return entries;
  }

  // ---------------------------------------------------------------------------
  // Focus Management
  // ---------------------------------------------------------------------------

  registerFocusable(element: FocusableElement): void {
    this.focusables.push(element);
    this.focusables.sort((a, b) => a.tabIndex - b.tabIndex);
  }

  focusNext(): FocusableElement | null {
    if (this.focusables.length === 0) return null;
    this.focusIndex = (this.focusIndex + 1) % this.focusables.length;
    return this.focusables[this.focusIndex];
  }

  focusPrevious(): FocusableElement | null {
    if (this.focusables.length === 0) return null;
    this.focusIndex = (this.focusIndex - 1 + this.focusables.length) % this.focusables.length;
    return this.focusables[this.focusIndex];
  }

  getCurrentFocus(): FocusableElement | null {
    return this.focusIndex >= 0 ? this.focusables[this.focusIndex] : null;
  }

  // ---------------------------------------------------------------------------
  // Input Remapping
  // ---------------------------------------------------------------------------

  remapInput(from: string, to: string): void {
    this.remappings.set(from, to);
  }
  resolveInput(input: string): string {
    return this.remappings.get(input) ?? input;
  }
  getRemappings(): Map<string, string> {
    return new Map(this.remappings);
  }
  clearRemappings(): void {
    this.remappings.clear();
  }
}
