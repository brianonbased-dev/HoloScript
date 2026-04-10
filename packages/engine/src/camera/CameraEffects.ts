/**
 * CameraEffects.ts
 *
 * Post-camera effects: screen shake, zoom pulses, flash,
 * letterbox, split-screen, and vignette overlays.
 *
 * @module camera
 */

// =============================================================================
// TYPES
// =============================================================================

export type EffectType = 'shake' | 'zoom' | 'flash' | 'letterbox' | 'vignette' | 'fade';

export interface ActiveEffect {
  id: string;
  type: EffectType;
  duration: number;
  elapsed: number;
  intensity: number;
  params: Record<string, unknown>;
  active: boolean;
}

export interface ShakeParams {
  frequency: number;
  decay: number;
}
export interface ZoomParams {
  targetZoom: number;
  easeBack: boolean;
}
export interface FlashParams {
  color: { r: number; g: number; b: number };
}
export interface LetterboxParams {
  ratio: number;
}
export interface FadeParams {
  fadeIn: boolean;
  color: { r: number; g: number; b: number };
}

// =============================================================================
// CAMERA EFFECTS
// =============================================================================

let _effectId = 0;

export class CameraEffects {
  private effects: ActiveEffect[] = [];
  private shakeOffset = { x: 0, y: 0 };
  private zoomMultiplier = 1;
  private flashAlpha = 0;
  private flashColor = { r: 1, g: 1, b: 1 };
  private letterboxAmount = 0;
  private vignetteIntensity = 0;
  private fadeAlpha = 0;

  // ---------------------------------------------------------------------------
  // Effect Triggers
  // ---------------------------------------------------------------------------

  shake(duration: number, intensity = 5, frequency = 20, decay = 1): string {
    return this.addEffect('shake', duration, intensity, { frequency, decay });
  }

  zoomPulse(duration: number, targetZoom = 1.2, easeBack = true): string {
    return this.addEffect('zoom', duration, targetZoom, { targetZoom, easeBack });
  }

  flash(duration = 0.1, color = { r: 1, g: 1, b: 1 }, intensity = 1): string {
    return this.addEffect('flash', duration, intensity, { color });
  }

  letterbox(duration: number, ratio = 2.35): string {
    return this.addEffect('letterbox', duration, ratio, { ratio });
  }

  vignette(duration: number, intensity = 0.5): string {
    return this.addEffect('vignette', duration, intensity, {});
  }

  fade(duration: number, fadeIn = false, color = { r: 0, g: 0, b: 0 }): string {
    return this.addEffect('fade', duration, 1, { fadeIn, color });
  }

  private addEffect(
    type: EffectType,
    duration: number,
    intensity: number,
    params: Record<string, unknown>
  ): string {
    const id = `fx_${_effectId++}`;
    this.effects.push({ id, type, duration, elapsed: 0, intensity, params, active: true });
    return id;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    this.shakeOffset = { x: 0, y: 0 };
    this.zoomMultiplier = 1;
    this.flashAlpha = 0;
    this.vignetteIntensity = 0;

    for (const effect of this.effects) {
      if (!effect.active) continue;
      effect.elapsed += dt;
      const t = Math.min(effect.elapsed / effect.duration, 1);

      switch (effect.type) {
        case 'shake': {
          const p = effect.params as unknown as ShakeParams;
          const decay = 1 - t * p.decay;
          if (decay > 0) {
            this.shakeOffset.x += (Math.random() - 0.5) * 2 * effect.intensity * decay;
            this.shakeOffset.y += (Math.random() - 0.5) * 2 * effect.intensity * decay;
          }
          break;
        }
        case 'zoom': {
          const p = effect.params as unknown as ZoomParams;
          if (p.easeBack) {
            const curve = t < 0.5 ? t * 2 : (1 - t) * 2;
            this.zoomMultiplier *= 1 + (p.targetZoom - 1) * curve;
          } else {
            this.zoomMultiplier *= 1 + (p.targetZoom - 1) * (1 - t);
          }
          break;
        }
        case 'flash': {
          const p = effect.params as unknown as FlashParams;
          this.flashAlpha = Math.max(this.flashAlpha, effect.intensity * (1 - t));
          this.flashColor = p.color;
          break;
        }
        case 'letterbox': {
          const p = effect.params as unknown as LetterboxParams;
          this.letterboxAmount = Math.max(this.letterboxAmount, p.ratio * Math.min(t * 4, 1));
          break;
        }
        case 'vignette':
          this.vignetteIntensity = Math.max(
            this.vignetteIntensity,
            effect.intensity * Math.min(t * 3, 1)
          );
          break;
        case 'fade': {
          const p = effect.params as unknown as FadeParams;
          this.fadeAlpha = p.fadeIn ? 1 - t : t;
          break;
        }
      }

      if (t >= 1) effect.active = false;
    }

    this.effects = this.effects.filter((e) => e.active);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getShakeOffset(): { x: number; y: number } {
    return { ...this.shakeOffset };
  }
  getZoomMultiplier(): number {
    return this.zoomMultiplier;
  }
  getFlashAlpha(): number {
    return this.flashAlpha;
  }
  getFlashColor(): { r: number; g: number; b: number } {
    return { ...this.flashColor };
  }
  getLetterboxAmount(): number {
    return this.letterboxAmount;
  }
  getVignetteIntensity(): number {
    return this.vignetteIntensity;
  }
  getFadeAlpha(): number {
    return this.fadeAlpha;
  }
  getActiveEffectCount(): number {
    return this.effects.length;
  }

  cancelEffect(id: string): boolean {
    const idx = this.effects.findIndex((e) => e.id === id);
    if (idx < 0) return false;
    this.effects.splice(idx, 1);
    return true;
  }

  cancelAll(): void {
    this.effects = [];
  }
}

