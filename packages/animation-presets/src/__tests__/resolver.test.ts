import { describe, it, expect } from 'vitest';
import { resolvePreset, resolveMultiple, getDefaultRegistry } from '../resolver.js';
import { walkPreset, idlePreset } from '../presets/index.js';
import { PresetRegistry } from '../registry.js';

describe('resolvePreset()', () => {
  // -----------------------------------------------------------------------
  // Basic Resolution
  // -----------------------------------------------------------------------

  describe('basic resolution', () => {
    it('should resolve a preset by name string', () => {
      const resolved = resolvePreset('walk');
      expect(resolved).toBeDefined();
      expect(resolved.annotation).toBe('@animated');
      expect(resolved.animationBlock).toContain('animation "walk"');
      expect(resolved.fullOutput).toContain('@animated');
      expect(resolved.preset.name).toBe('walk');
    });

    it('should resolve a preset by object', () => {
      const resolved = resolvePreset(walkPreset);
      expect(resolved.preset.name).toBe('walk');
      expect(resolved.animationBlock).toContain('Walking');
    });

    it('should throw for unknown preset name', () => {
      expect(() => resolvePreset('nonexistent')).toThrow(
        'Animation preset "nonexistent" not found'
      );
    });
  });

  // -----------------------------------------------------------------------
  // Annotation Output
  // -----------------------------------------------------------------------

  describe('annotation output', () => {
    it('should produce @animated annotation', () => {
      const resolved = resolvePreset('idle');
      expect(resolved.annotation).toBe('@animated');
    });
  });

  // -----------------------------------------------------------------------
  // Animation Block Output
  // -----------------------------------------------------------------------

  describe('animation block output', () => {
    it('should include animation name in quotes', () => {
      const resolved = resolvePreset('walk');
      expect(resolved.animationBlock).toContain('animation "walk"');
    });

    it('should include loop mode', () => {
      const walkResolved = resolvePreset('walk');
      expect(walkResolved.animationBlock).toContain('loop: true');

      const jumpResolved = resolvePreset('jump');
      expect(jumpResolved.animationBlock).toContain('loop: false');

      const crouchResolved = resolvePreset('crouch');
      expect(crouchResolved.animationBlock).toContain('loop: "clamp"');
    });

    it('should include duration', () => {
      const resolved = resolvePreset('walk');
      expect(resolved.animationBlock).toContain('duration: 1.0');
    });

    it('should include speed', () => {
      const resolved = resolvePreset('run');
      expect(resolved.animationBlock).toContain('speed: 1.4');
    });

    it('should include blend weight', () => {
      const resolved = resolvePreset('speak');
      expect(resolved.animationBlock).toContain('blend_weight: 0.8');
    });

    it('should include easing', () => {
      const resolved = resolvePreset('jump');
      expect(resolved.animationBlock).toContain('easing: "ease-out"');
    });

    it('should include Mixamo clip reference', () => {
      const resolved = resolvePreset('dance');
      expect(resolved.animationBlock).toContain('Mixamo clip: Hip Hop Dancing');
      expect(resolved.animationBlock).toContain('clip: "Hip Hop Dancing"');
    });
  });

  // -----------------------------------------------------------------------
  // Full Output
  // -----------------------------------------------------------------------

  describe('full output', () => {
    it('should combine annotation and animation block', () => {
      const resolved = resolvePreset('idle');
      expect(resolved.fullOutput).toContain('@animated');
      expect(resolved.fullOutput).toContain('auto_play: "idle"');
      expect(resolved.fullOutput).toContain('animation "idle"');
    });

    it('should include speed and blend_time properties', () => {
      const resolved = resolvePreset('walk');
      expect(resolved.fullOutput).toContain('speed: 1.0');
      expect(resolved.fullOutput).toContain('blend_time: 0.2');
    });
  });

  // -----------------------------------------------------------------------
  // Overrides
  // -----------------------------------------------------------------------

  describe('overrides', () => {
    it('should override speed multiplier', () => {
      const resolved = resolvePreset('walk', { speedMultiplier: 2.5 });
      expect(resolved.preset.speedMultiplier).toBe(2.5);
      expect(resolved.animationBlock).toContain('speed: 2.5');
    });

    it('should override blend weight', () => {
      const resolved = resolvePreset('walk', { blendWeight: 0.5 });
      expect(resolved.preset.blendWeight).toBe(0.5);
      expect(resolved.animationBlock).toContain('blend_weight: 0.5');
    });

    it('should override loop mode', () => {
      const resolved = resolvePreset('walk', { loopMode: 'once' });
      expect(resolved.preset.loopMode).toBe('once');
      expect(resolved.animationBlock).toContain('loop: false');
    });

    it('should override timing duration', () => {
      const resolved = resolvePreset('walk', {
        timing: { duration: 3.0 },
      });
      expect(resolved.preset.timing.duration).toBe(3.0);
      expect(resolved.animationBlock).toContain('duration: 3.0');
    });

    it('should override timing easing', () => {
      const resolved = resolvePreset('walk', {
        timing: { easing: 'ease-in-out' },
      });
      expect(resolved.preset.timing.easing).toBe('ease-in-out');
      expect(resolved.animationBlock).toContain('easing: "ease-in-out"');
    });

    it('should preserve non-overridden values', () => {
      const resolved = resolvePreset('walk', { speedMultiplier: 2.0 });
      expect(resolved.preset.timing.duration).toBe(walkPreset.timing.duration);
      expect(resolved.preset.loopMode).toBe(walkPreset.loopMode);
      expect(resolved.preset.blendWeight).toBe(walkPreset.blendWeight);
    });
  });

  // -----------------------------------------------------------------------
  // Custom Registry
  // -----------------------------------------------------------------------

  describe('custom registry', () => {
    it('should use a provided registry', () => {
      const customRegistry = new PresetRegistry(false);
      customRegistry.register({
        ...walkPreset,
        name: 'walk',
        timing: { ...walkPreset.timing, duration: 99.0 },
      });
      const resolved = resolvePreset('walk', undefined, customRegistry);
      expect(resolved.preset.timing.duration).toBe(99.0);
    });

    it('should throw if preset not in custom registry', () => {
      const emptyRegistry = new PresetRegistry(false);
      expect(() => resolvePreset('walk', undefined, emptyRegistry)).toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // All 15 Presets Resolvable
  // -----------------------------------------------------------------------

  describe('all presets resolvable', () => {
    const presetNames = [
      'walk',
      'idle',
      'attack',
      'speak',
      'dance',
      'run',
      'jump',
      'wave',
      'sit',
      'sleep',
      'crouch',
      'swim',
      'fly',
      'climb',
      'emote',
    ];

    for (const name of presetNames) {
      it(`should resolve "${name}" without error`, () => {
        const resolved = resolvePreset(name);
        expect(resolved.annotation).toBe('@animated');
        expect(resolved.animationBlock).toContain(`animation "${name}"`);
        expect(resolved.fullOutput.length).toBeGreaterThan(0);
        expect(resolved.preset.name).toBe(name);
      });
    }
  });
});

describe('resolveMultiple()', () => {
  it('should combine multiple presets into one output', () => {
    const output = resolveMultiple(['idle', 'walk', 'run']);
    expect(output).toContain('@animated');
    expect(output).toContain('auto_play: "idle"');
    expect(output).toContain('animation "idle"');
    expect(output).toContain('animation "walk"');
    expect(output).toContain('animation "run"');
  });

  it('should use the first preset for auto_play', () => {
    const output = resolveMultiple(['walk', 'idle']);
    expect(output).toContain('auto_play: "walk"');
  });

  it('should return empty string for empty input', () => {
    const output = resolveMultiple([]);
    expect(output).toBe('');
  });

  it('should apply per-preset overrides', () => {
    const output = resolveMultiple(['walk', 'run'], {
      walk: { speedMultiplier: 0.5 },
      run: { speedMultiplier: 3.0 },
    });
    // Walk block should show speed 0.5
    expect(output).toContain('speed: 0.5');
    // Run block should show speed 3
    expect(output).toContain('speed: 3');
  });

  it('should produce valid HoloScript with all 15 presets', () => {
    const output = resolveMultiple([
      'idle',
      'walk',
      'run',
      'jump',
      'crouch',
      'swim',
      'fly',
      'climb',
      'attack',
      'speak',
      'wave',
      'dance',
      'emote',
      'sit',
      'sleep',
    ]);
    expect(output).toContain('@animated');
    // Should have 15 animation blocks
    const matches = output.match(/animation "/g);
    expect(matches).toHaveLength(15);
  });
});

describe('getDefaultRegistry()', () => {
  it('should return a registry with 15 presets', () => {
    const reg = getDefaultRegistry();
    expect(reg.size).toBe(15);
  });

  it('should return the same instance on repeated calls', () => {
    const a = getDefaultRegistry();
    const b = getDefaultRegistry();
    expect(a).toBe(b);
  });
});
