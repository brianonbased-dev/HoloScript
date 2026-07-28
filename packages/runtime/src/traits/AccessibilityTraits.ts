import * as THREE from 'three';
import { TraitHandler, TraitContext } from './TraitSystem';

// ============================================================================
// Accessible Trait
// ARIA-like semantics, keyboard navigation, and focus management for 3D objects.
// ============================================================================

export const AccessibleTrait: TraitHandler = {
  name: 'accessible',
  onApply: (context: TraitContext) => {
    context.object.userData.accessible = true;
    context.object.userData.accessibleRole = context.config.role || 'button';
    context.object.userData.accessibleLabel = context.config.label || '';
    context.object.userData.accessibleTabIndex = context.config.tab_index ?? 0;
    context.data.announceQueue = [] as string[];
    context.data.lastAnnounceTime = 0;
    context.data.isFocused = false;

    if (typeof document !== 'undefined') {
      const el = context.object.userData.domElement as HTMLElement | undefined;
      if (el) {
        el.setAttribute('role', String(context.object.userData.accessibleRole));
        if (context.object.userData.accessibleLabel) {
          el.setAttribute('aria-label', String(context.object.userData.accessibleLabel));
        }
        el.setAttribute('tabindex', String(context.object.userData.accessibleTabIndex));
      }
    }
  },
  onUpdate: (context: TraitContext, _delta: number) => {
    const queue = context.data.announceQueue as string[];
    if (!queue || queue.length === 0) return;

    const now = Date.now();
    if (now - (context.data.lastAnnounceTime as number) > 500) {
      const message = queue.shift();
      if (message && typeof document !== 'undefined') {
        const live = document.getElementById('holo-a11y-live');
        if (live) live.textContent = message;
      }
      context.data.lastAnnounceTime = now;
    }
  },
  onRemove: (context: TraitContext) => {
    context.object.userData.accessible = false;
    delete context.object.userData.accessibleRole;
    delete context.object.userData.accessibleLabel;
    delete context.object.userData.accessibleTabIndex;
  },
};

// ============================================================================
// AltText Trait
// Alternative text descriptions for 3D objects (screen reader support).
// ============================================================================

export const AltTextTrait: TraitHandler = {
  name: 'alt_text',
  onApply: (context: TraitContext) => {
    const text = (context.config.text as string) || '';
    const verbose = (context.config.verbose as string) || '';
    const language = (context.config.language as string) || 'en';

    context.object.userData.altText = text;
    context.object.userData.altTextVerbose = verbose;
    context.object.userData.altTextLanguage = language;

    if (typeof document !== 'undefined') {
      const el = context.object.userData.domElement as HTMLElement | undefined;
      if (el && text) {
        el.setAttribute('aria-label', text);
        el.setAttribute('lang', language);
      }
    }
  },
  onRemove: (context: TraitContext) => {
    delete context.object.userData.altText;
    delete context.object.userData.altTextVerbose;
    delete context.object.userData.altTextLanguage;
  },
};

// ============================================================================
// HighContrast Trait
// High-contrast visual mode for low-vision accessibility.
// ============================================================================

const CONTRAST_PALETTES: Record<string, { fg: string; bg: string }> = {
  auto: { fg: '#FFFFFF', bg: '#000000' },
  light: { fg: '#000000', bg: '#FFFFFF' },
  dark: { fg: '#FFFFFF', bg: '#000000' },
  high: { fg: '#FFFF00', bg: '#000000' },
  inverted: { fg: '#000000', bg: '#FFFFFF' },
  off: { fg: '', bg: '' },
};

export const HighContrastTrait: TraitHandler = {
  name: 'high_contrast',
  onApply: (context: TraitContext) => {
    const mode = (context.config.mode as string) || 'auto';
    context.object.userData.highContrast = true;
    context.object.userData.highContrastMode = mode;
    context.data.isActive = false;
    context.data.originalColor = null;

    if (mode === 'auto' && typeof window !== 'undefined') {
      const preferHigh = window.matchMedia('(prefers-contrast: high)').matches;
      if (preferHigh) {
        applyContrastPalette(context, 'high');
      }
    } else if (mode !== 'off' && mode !== 'auto') {
      applyContrastPalette(context, mode);
    }
  },
  onRemove: (context: TraitContext) => {
    if (context.data.isActive && context.data.originalColor !== null) {
      const mesh = context.object as THREE.Mesh;
      if (mesh.material && 'color' in mesh.material) {
        (mesh.material as THREE.MeshStandardMaterial).color.set(
          context.data.originalColor as string
        );
      }
    }
    delete context.object.userData.highContrast;
    delete context.object.userData.highContrastMode;
  },
};

function applyContrastPalette(context: TraitContext, mode: string): void {
  const palette = CONTRAST_PALETTES[mode];
  if (!palette?.fg) return;

  const mesh = context.object as THREE.Mesh;
  if (mesh.material && 'color' in mesh.material) {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!context.data.isActive) {
      context.data.originalColor = '#' + mat.color.getHexString();
    }
    mat.color.set(palette.fg);
    context.data.isActive = true;
  }
}

// ============================================================================
// MotionReduced Trait
// Velocity clamping and animation interception for vestibular sensitivity.
// ============================================================================

export const MotionReducedTrait: TraitHandler = {
  name: 'motion_reduced',
  onApply: (context: TraitContext) => {
    const maxVelocity = (context.config.max_velocity as number) ?? 2;
    const autoDetect = (context.config.auto_detect as boolean) ?? true;

    context.object.userData.motionReduced = true;
    context.object.userData.motionReducedMaxVelocity = maxVelocity;
    context.data.isActive = false;

    if (autoDetect && typeof window !== 'undefined') {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        context.data.isActive = true;
      }
    }
  },
  onUpdate: (context: TraitContext, _delta: number) => {
    if (!context.data.isActive) return;

    const maxVelocity = context.object.userData.motionReducedMaxVelocity as number;
    const vel = context.object.userData.velocity as [number, number, number] | undefined;
    if (!vel) return;

    const speed = Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2]);
    if (speed > maxVelocity) {
      const scale = maxVelocity / speed;
      vel[0] *= scale;
      vel[1] *= scale;
      vel[2] *= scale;
    }
  },
  onRemove: (context: TraitContext) => {
    delete context.object.userData.motionReduced;
    delete context.object.userData.motionReducedMaxVelocity;
  },
};
