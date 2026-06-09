import { describe, it, expect, beforeEach } from 'vitest';
import {
  telescopeOpticsHandler,
  computeTelescopeOptics,
  validateTelescopeOptics,
  type TelescopeOpticsConfig,
} from './TelescopeOpticsTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './__tests__/traitTestHelpers';

// ---------------------------------------------------------------------------
// Reference setup from the A-009 task description:
//   objective 600 mm, fl 2400 mm, eyepiece 12 mm, barlow 1.0
//   → magnification=200, fov≈0.26°, exit_pupil=3.0 mm
// ---------------------------------------------------------------------------
const A009_CONFIG: TelescopeOpticsConfig = {
  objective_diameter_mm: 600,
  focal_length_mm: 2400,
  eyepiece_focal_length_mm: 12,
  barlow_factor: 1.0,
  apparent_fov_deg: 52,
  max_eye_pupil_mm: 7.0,
};

describe('TelescopeOpticsTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('telescope-node');
    ctx = createMockContext();
  });

  // ── Pure optics math ────────────────────────────────────────────────────

  describe('computeTelescopeOptics — pure math', () => {
    it('derives correct magnification from A-009 reference config', () => {
      const d = computeTelescopeOptics(A009_CONFIG);
      // magnification = 2400 / 12 × 1.0 = 200
      expect(d.magnification).toBeCloseTo(200, 5);
    });

    it('derives correct true FOV from A-009 reference config', () => {
      const d = computeTelescopeOptics(A009_CONFIG);
      // fov = 52 / 200 = 0.26°
      expect(d.fov_deg).toBeCloseTo(0.26, 5);
    });

    it('derives correct exit pupil from A-009 reference config', () => {
      const d = computeTelescopeOptics(A009_CONFIG);
      // exit_pupil = 600 / 200 = 3.0 mm
      expect(d.exit_pupil_mm).toBeCloseTo(3.0, 5);
    });

    it('derives correct limiting magnitude for 600 mm aperture', () => {
      const d = computeTelescopeOptics(A009_CONFIG);
      // 2.1 + 5 × log10(600) ≈ 2.1 + 5 × 2.778 ≈ 15.99
      const expected = 2.1 + 5 * Math.log10(600);
      expect(d.limiting_magnitude).toBeCloseTo(expected, 5);
    });

    it('derives correct Dawes limit for 600 mm aperture', () => {
      const d = computeTelescopeOptics(A009_CONFIG);
      // 116 / 600 ≈ 0.1933 arc-seconds
      expect(d.dawes_limit_arcsec).toBeCloseTo(116 / 600, 5);
    });

    it('flags diffraction rings when magnification > 0.75 × aperture', () => {
      // 200 × > 0.75 × 600 = 450 → false (200 < 450)
      const d = computeTelescopeOptics(A009_CONFIG);
      expect(d.diffraction_rings_visible).toBe(false);
    });

    it('flags diffraction rings visible for high-power setup', () => {
      // 200 mm aperture, 400 mm fl, 2 mm eyepiece → mag = 200 > 0.75 × 200 = 150
      const d = computeTelescopeOptics({
        ...A009_CONFIG,
        objective_diameter_mm: 200,
        focal_length_mm: 400,
        eyepiece_focal_length_mm: 2,
      });
      expect(d.diffraction_rings_visible).toBe(true);
    });

    it('applies barlow factor to magnification and exit pupil', () => {
      const d = computeTelescopeOptics({ ...A009_CONFIG, barlow_factor: 2.0 });
      // mag = 2400 / 12 × 2 = 400
      expect(d.magnification).toBeCloseTo(400, 5);
      // exit_pupil = 600 / 400 = 1.5 mm
      expect(d.exit_pupil_mm).toBeCloseTo(1.5, 5);
    });

    it('uses default config without throwing', () => {
      const d = computeTelescopeOptics(telescopeOpticsHandler.defaultConfig!);
      // mag = 1000 / 10 × 1.0 = 100
      expect(d.magnification).toBeCloseTo(100, 5);
      // fov = 52 / 100 = 0.52°
      expect(d.fov_deg).toBeCloseTo(0.52, 5);
    });
  });

  // ── Validation ──────────────────────────────────────────────────────────

  describe('validateTelescopeOptics — warnings', () => {
    it('no warnings for a reasonable setup (A-009 reference)', () => {
      const d = computeTelescopeOptics(A009_CONFIG);
      const w = validateTelescopeOptics(A009_CONFIG, d);
      expect(w.exit_pupil_too_large).toBeUndefined();
      expect(w.exit_pupil_too_small).toBeUndefined();
      expect(w.magnification_exceeds_max).toBeUndefined();
    });

    it('warns when exit pupil exceeds max_eye_pupil (low-power binocular config)', () => {
      // 70 mm aperture, 350 mm fl, 35 mm eyepiece → mag = 10, exit_pupil = 7 mm (borderline)
      // Use 40 mm eyepiece → mag = 8.75, exit_pupil ≈ 8 mm > 7 mm
      const cfg: TelescopeOpticsConfig = {
        ...A009_CONFIG,
        objective_diameter_mm: 70,
        focal_length_mm: 350,
        eyepiece_focal_length_mm: 40,
        max_eye_pupil_mm: 7.0,
      };
      const d = computeTelescopeOptics(cfg);
      const w = validateTelescopeOptics(cfg, d);
      expect(d.exit_pupil_mm).toBeGreaterThan(7);
      expect(w.exit_pupil_too_large).toBe(true);
    });

    it('warns when exit pupil < 0.5 mm (extremely high magnification)', () => {
      // 50 mm aperture, 250 mm fl, 2 mm eyepiece → mag = 125, exit_pupil = 0.4 mm
      const cfg: TelescopeOpticsConfig = {
        ...A009_CONFIG,
        objective_diameter_mm: 50,
        focal_length_mm: 250,
        eyepiece_focal_length_mm: 2,
      };
      const d = computeTelescopeOptics(cfg);
      const w = validateTelescopeOptics(cfg, d);
      expect(d.exit_pupil_mm).toBeLessThan(0.5);
      expect(w.exit_pupil_too_small).toBe(true);
    });

    it('warns when magnification exceeds 2× aperture in mm', () => {
      // 50 mm aperture, 500 mm fl, 1 mm eyepiece → mag = 500, limit = 100
      const cfg: TelescopeOpticsConfig = {
        ...A009_CONFIG,
        objective_diameter_mm: 50,
        focal_length_mm: 500,
        eyepiece_focal_length_mm: 1,
      };
      const d = computeTelescopeOptics(cfg);
      const w = validateTelescopeOptics(cfg, d);
      expect(d.magnification).toBeGreaterThan(2 * cfg.objective_diameter_mm);
      expect(w.magnification_exceeds_max).toBe(true);
    });
  });

  // ── Lifecycle ───────────────────────────────────────────────────────────

  describe('Lifecycle', () => {
    it('emits telescope_optics_ready on attach with derived values', () => {
      attachTrait(telescopeOpticsHandler, node, A009_CONFIG, ctx);
      expect(getEventCount(ctx, 'telescope_optics_ready')).toBe(1);
      const data = getLastEvent(ctx, 'telescope_optics_ready') as Record<string, unknown>;
      expect(data.nodeId).toBe('telescope-node');
      expect(data.magnification as number).toBeCloseTo(200, 5);
      expect(data.fov_deg as number).toBeCloseTo(0.26, 5);
      expect(data.exit_pupil_mm as number).toBeCloseTo(3.0, 5);
    });

    it('ready event includes all derived fields', () => {
      attachTrait(telescopeOpticsHandler, node, A009_CONFIG, ctx);
      const data = getLastEvent(ctx, 'telescope_optics_ready') as Record<string, unknown>;
      expect(typeof data.limiting_magnitude).toBe('number');
      expect(typeof data.dawes_limit_arcsec).toBe('number');
      expect(typeof data.diffraction_rings_visible).toBe('boolean');
    });

    it('ready event includes warnings bag (empty for valid config)', () => {
      attachTrait(telescopeOpticsHandler, node, A009_CONFIG, ctx);
      const data = getLastEvent(ctx, 'telescope_optics_ready') as Record<string, unknown>;
      expect(data.warnings).toEqual({});
    });

    it('ready event includes populated warnings for problematic config', () => {
      const cfg: Partial<TelescopeOpticsConfig> = {
        objective_diameter_mm: 50,
        focal_length_mm: 500,
        eyepiece_focal_length_mm: 1,
      };
      attachTrait(telescopeOpticsHandler, node, cfg, ctx);
      const data = getLastEvent(ctx, 'telescope_optics_ready') as Record<string, unknown>;
      expect((data.warnings as Record<string, unknown>).magnification_exceeds_max).toBe(true);
    });

    it('stores state in WeakMap, not directly on node', () => {
      attachTrait(telescopeOpticsHandler, node, A009_CONFIG, ctx);
      const keys = Object.keys(node).filter((k) => k.startsWith('__telescope'));
      expect(keys).toHaveLength(0);
    });

    it('emits telescope_optics_detach on detach', () => {
      attachTrait(telescopeOpticsHandler, node, A009_CONFIG, ctx);
      const fullConfig = {
        ...telescopeOpticsHandler.defaultConfig,
        ...A009_CONFIG,
      } as TelescopeOpticsConfig;
      telescopeOpticsHandler.onDetach!(
        node as Parameters<typeof telescopeOpticsHandler.onDetach>[0],
        fullConfig,
        ctx as Parameters<typeof telescopeOpticsHandler.onDetach>[2]
      );
      expect(getEventCount(ctx, 'telescope_optics_detach')).toBe(1);
      const data = getLastEvent(ctx, 'telescope_optics_detach') as Record<string, unknown>;
      expect(data.nodeId).toBe('telescope-node');
    });

    it('no detach event when detach called before attach', () => {
      const fullConfig = { ...telescopeOpticsHandler.defaultConfig } as TelescopeOpticsConfig;
      telescopeOpticsHandler.onDetach!(
        node as Parameters<typeof telescopeOpticsHandler.onDetach>[0],
        fullConfig,
        ctx as Parameters<typeof telescopeOpticsHandler.onDetach>[2]
      );
      expect(getEventCount(ctx, 'telescope_optics_detach')).toBe(0);
    });
  });

  // ── Default config ──────────────────────────────────────────────────────

  describe('Default config', () => {
    it('has all required fields with sensible values', () => {
      const d = telescopeOpticsHandler.defaultConfig!;
      expect(d.objective_diameter_mm).toBe(200);
      expect(d.focal_length_mm).toBe(1000);
      expect(d.eyepiece_focal_length_mm).toBe(10);
      expect(d.barlow_factor).toBe(1.0);
      expect(d.apparent_fov_deg).toBe(52);
      expect(d.max_eye_pupil_mm).toBe(7.0);
    });

    it('default config gives a warning-free result', () => {
      const cfg = telescopeOpticsHandler.defaultConfig!;
      const d = computeTelescopeOptics(cfg);
      const w = validateTelescopeOptics(cfg, d);
      expect(w.exit_pupil_too_large).toBeUndefined();
      expect(w.exit_pupil_too_small).toBeUndefined();
      expect(w.magnification_exceeds_max).toBeUndefined();
    });
  });

  // ── Event API ───────────────────────────────────────────────────────────

  describe('telescope_optics_reconfigure event', () => {
    it('recalculates and emits telescope_optics_updated', () => {
      attachTrait(telescopeOpticsHandler, node, A009_CONFIG, ctx);
      ctx.clearEvents();
      // Switch to 6 mm eyepiece → mag = 400, exit_pupil = 1.5 mm
      sendEvent(telescopeOpticsHandler, node, A009_CONFIG, ctx, {
        type: 'telescope_optics_reconfigure',
        config: { eyepiece_focal_length_mm: 6 },
      });
      expect(getEventCount(ctx, 'telescope_optics_updated')).toBe(1);
      const data = getLastEvent(ctx, 'telescope_optics_updated') as Record<string, unknown>;
      expect(data.magnification as number).toBeCloseTo(400, 5);
      expect(data.exit_pupil_mm as number).toBeCloseTo(1.5, 5);
    });

    it('ignores reconfigure with missing config payload', () => {
      attachTrait(telescopeOpticsHandler, node, A009_CONFIG, ctx);
      ctx.clearEvents();
      sendEvent(telescopeOpticsHandler, node, A009_CONFIG, ctx, {
        type: 'telescope_optics_reconfigure',
      });
      expect(getEventCount(ctx, 'telescope_optics_updated')).toBe(0);
    });
  });

  describe('telescope_optics_query event', () => {
    it('emits telescope_optics_info with current state', () => {
      attachTrait(telescopeOpticsHandler, node, A009_CONFIG, ctx);
      ctx.clearEvents();
      sendEvent(telescopeOpticsHandler, node, A009_CONFIG, ctx, {
        type: 'telescope_optics_query',
        queryId: 'q-42',
      });
      expect(getEventCount(ctx, 'telescope_optics_info')).toBe(1);
      const data = getLastEvent(ctx, 'telescope_optics_info') as Record<string, unknown>;
      expect(data.queryId).toBe('q-42');
      expect(data.nodeId).toBe('telescope-node');
      expect(data.magnification as number).toBeCloseTo(200, 5);
    });

    it('no query response when called before attach', () => {
      sendEvent(telescopeOpticsHandler, node, A009_CONFIG, ctx, {
        type: 'telescope_optics_query',
        queryId: 'q-cold',
      });
      expect(getEventCount(ctx, 'telescope_optics_info')).toBe(0);
    });
  });

  // ── Trait metadata ──────────────────────────────────────────────────────

  describe('metadata', () => {
    it('has correct trait name', () => {
      expect(telescopeOpticsHandler.name).toBe('telescope_optics');
    });
  });
});
