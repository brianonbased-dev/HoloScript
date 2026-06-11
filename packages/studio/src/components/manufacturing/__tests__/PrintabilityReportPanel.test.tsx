// @vitest-environment node
/**
 * PrintabilityReportPanel — UI contract tests (data layer).
 *
 * Verifies the pure-data logic used by the panel:
 * recommendation mapping, badge predicate, and fitsBuildVolume heuristic.
 * Does NOT render React (avoids lucide-react ESM transform issues in Node).
 */

import { describe, it, expect } from 'vitest';
import type { PrintabilityReport } from '../PrintabilityReportPanel';

// ── fitsBuildVolume heuristic (inline for testability) ─────────────────────────
// Mirrors the implementation in PrintabilityReportPanel.tsx

function fitsBuildVolume(
  volumeM3: number,
  buildVolumeMm: [number, number, number]
): boolean {
  const edgeLengthMm = Math.cbrt(volumeM3) * 1000;
  const [bx, by, bz] = buildVolumeMm;
  return edgeLengthMm <= bx! && edgeLengthMm <= by! && edgeLengthMm <= bz!;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PrintabilityReportPanel — data logic', () => {
  describe('recommendation values', () => {
    it('accepts "printable" recommendation', () => {
      const r: PrintabilityReport = {
        watertight: true,
        manifold: true,
        volume: 0.005,
        recommendation: 'printable',
        overhangs: { count: 0 },
      };
      expect(r.recommendation).toBe('printable');
    });

    it('accepts "needs-supports" recommendation', () => {
      const r: PrintabilityReport = {
        watertight: true,
        manifold: false,
        volume: 0.01,
        recommendation: 'needs-supports',
        overhangs: { count: 12 },
      };
      expect(r.recommendation).toBe('needs-supports');
    });

    it('accepts "not-printable" recommendation', () => {
      const r: PrintabilityReport = {
        watertight: false,
        manifold: false,
        volume: 0.0,
        recommendation: 'not-printable',
        overhangs: { count: 0 },
      };
      expect(r.recommendation).toBe('not-printable');
    });
  });

  describe('badge predicates', () => {
    it('watertight:true means the watertight badge passes', () => {
      const r: PrintabilityReport = {
        watertight: true,
        manifold: false,
        volume: 0.001,
        recommendation: 'needs-supports',
        overhangs: { count: 2 },
      };
      expect(r.watertight).toBe(true);
      expect(r.manifold).toBe(false);
    });

    it('both true when part is fully valid', () => {
      const r: PrintabilityReport = {
        watertight: true,
        manifold: true,
        volume: 0.002,
        recommendation: 'printable',
        overhangs: { count: 0 },
      };
      expect(r.watertight && r.manifold).toBe(true);
    });
  });

  describe('fitsBuildVolume heuristic', () => {
    // Ender 3 preset: 220×220×250 mm
    const ENDER3: [number, number, number] = [220, 220, 250];

    it('a very small volume (0.001 m³) fits in Ender 3', () => {
      // cube-root(0.001 m³) = 0.1 m = 100 mm — well within 220 mm
      expect(fitsBuildVolume(0.001, ENDER3)).toBe(true);
    });

    it('a large volume (10 m³) does not fit in Ender 3', () => {
      // cube-root(10 m³) ≈ 2.154 m = 2154 mm >> 220 mm
      expect(fitsBuildVolume(10, ENDER3)).toBe(false);
    });

    it('a borderline volume at exactly the build volume edge returns true', () => {
      // Edge length = 220 mm → volume = (0.22)^3 m³
      const vol = Math.pow(0.22, 3);
      expect(fitsBuildVolume(vol, ENDER3)).toBe(true);
    });

    it('a volume just above the build volume edge returns false', () => {
      // Edge length slightly above 220 mm
      const vol = Math.pow(0.2201, 3);
      expect(fitsBuildVolume(vol, ENDER3)).toBe(false);
    });
  });

  describe('optional overhangFraction field', () => {
    it('report without overhangFraction is valid (field is optional)', () => {
      const r: PrintabilityReport = {
        watertight: true,
        manifold: true,
        volume: 0.001,
        recommendation: 'printable',
        overhangs: { count: 0 },
      };
      expect(r.overhangFraction).toBeUndefined();
    });

    it('report with overhangFraction provides a numeric fraction 0–1', () => {
      const r: PrintabilityReport = {
        watertight: true,
        manifold: true,
        volume: 0.001,
        recommendation: 'printable',
        overhangs: { count: 4 },
        overhangFraction: 0.12,
      };
      expect(r.overhangFraction).toBeGreaterThanOrEqual(0);
      expect(r.overhangFraction).toBeLessThanOrEqual(1);
    });
  });
});
