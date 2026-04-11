import { describe, it, expect } from 'vitest';
import { UnitRegistry, DimensionalMismatchError, registry } from '../units/UnitRegistry';
import {
  celsiusToKelvin, kelvinToCelsius, fahrenheitToKelvin, barToPascal, psiToPascal,
  millimetersToMeters,
  type Temperature, type Pressure
} from '../units/PhysicalQuantity';

describe('UnitRegistry and Dimensionality', () => {

  describe('Dimensional mismatch rejection', () => {
    it('throws when converting differing dimensions (e.g., Length to Mass)', () => {
      expect(() => {
        registry.convert(1, 'm', 'kg');
      }).toThrow(/Dimensional mismatch/);
    });

    it('throws when converting Temperature to Pressure', () => {
      expect(() => {
        registry.convert(300, 'K', 'Pa');
      }).toThrow(/Dimensional mismatch/);
    });
  });

  describe('Temperature conversion', () => {
    it('converts C to K', () => {
      expect(registry.convert(0, 'C', 'K')).toBeCloseTo(273.15, 4);
      expect(registry.convert(100, 'C', 'K')).toBeCloseTo(373.15, 4);
    });

    it('converts K to C', () => {
      expect(registry.convert(273.15, 'K', 'C')).toBeCloseTo(0, 4);
      expect(registry.convert(373.15, 'K', 'C')).toBeCloseTo(100, 4);
    });

    it('converts F to C', () => {
      expect(registry.convert(32, 'F', 'C')).toBeCloseTo(0, 4);
      expect(registry.convert(212, 'F', 'C')).toBeCloseTo(100, 4);
    });

    it('converts F to K', () => {
      expect(registry.convert(32, 'F', 'K')).toBeCloseTo(273.15, 4);
    });
    
    it('PhysicalQuantity manual conversions work', () => {
       expect(celsiusToKelvin(0)).toBeCloseTo(273.15, 4);
       expect(kelvinToCelsius(273.15 as Temperature)).toBeCloseTo(0, 4);
       expect(fahrenheitToKelvin(32)).toBeCloseTo(273.15, 4);
    });
  });

  describe('Pressure conversion', () => {
    it('converts kPa to Pa', () => {
      expect(registry.convert(100, 'kPa', 'Pa')).toBeCloseTo(100000, 4);
    });

    it('converts MPa to Pa', () => {
      expect(registry.convert(1, 'MPa', 'Pa')).toBeCloseTo(1000000, 4);
    });

    it('converts bar to Pa', () => {
      expect(registry.convert(1.5, 'bar', 'Pa')).toBeCloseTo(150000, 4);
    });

    it('converts atm to Pa', () => {
      expect(registry.convert(1, 'atm', 'Pa')).toBeCloseTo(101325, 4);
    });

    it('converts psi to Pa', () => {
      expect(registry.convert(1, 'psi', 'Pa')).toBeCloseTo(6894.757, 3);
    });

    it('PhysicalQuantity manual conversions work', () => {
      expect(barToPascal(1.5)).toBeCloseTo(150000, 4);
      expect(psiToPascal(1)).toBeCloseTo(6894.757, 3);
    });
  });

  describe('Length conversion', () => {
    it('converts cm to m', () => {
      expect(registry.convert(100, 'cm', 'm')).toBeCloseTo(1, 4);
    });

    it('converts mm to m', () => {
      expect(registry.convert(1000, 'mm', 'm')).toBeCloseTo(1, 4);
    });

    it('converts in to m', () => {
      expect(registry.convert(1, 'in', 'm')).toBeCloseTo(0.0254, 4);
    });

    it('converts ft to m', () => {
      expect(registry.convert(1, 'ft', 'm')).toBeCloseTo(0.3048, 4);
      expect(registry.convert(3.28084, 'ft', 'm')).toBeCloseTo(1, 4);
    });
    
    it('PhysicalQuantity manual conversions work', () => {
      expect(millimetersToMeters(1000)).toBeCloseTo(1, 4);
    });
  });

  describe('Mass and Time conversion', () => {
    it('converts g to kg', () => {
      expect(registry.convert(500, 'g', 'kg')).toBeCloseTo(0.5, 4);
    });

    it('converts minutes to seconds', () => {
      expect(registry.convert(1.5, 'minute', 's')).toBeCloseTo(90, 4);
    });

    it('converts hours to seconds', () => {
      expect(registry.convert(1, 'h', 's')).toBeCloseTo(3600, 4);
    });
  });

  // ── Derived simulation units ─────────────────────────────────────────────

  describe('Derived unit conversions (simulation-relevant)', () => {
    it('converts kW to W', () => {
      expect(registry.convert(1, 'kW', 'W')).toBeCloseTo(1000, 4);
    });

    it('converts BTU/hr to W', () => {
      expect(registry.convert(1, 'BTU/hr', 'W')).toBeCloseTo(0.29307107, 5);
    });

    it('converts L/s to m³/s', () => {
      expect(registry.convert(1, 'L/s', 'm3/s')).toBeCloseTo(0.001, 8);
    });

    it('converts gpm to m³/s', () => {
      expect(registry.convert(1, 'gpm', 'm3/s')).toBeCloseTo(6.30902e-5, 8);
    });

    it('converts GPa to Pa', () => {
      expect(registry.convert(1, 'GPa', 'Pa')).toBeCloseTo(1e9, 4);
    });

    it('converts kJ to J', () => {
      expect(registry.convert(1, 'kJ', 'J')).toBeCloseTo(1000, 4);
    });

    it('converts mm² to m²', () => {
      expect(registry.convert(1, 'mm2', 'm2')).toBeCloseTo(1e-6, 12);
    });
  });

  // ── toSI / fromSI ───────────────────────────────────────────────────────

  describe('toSI and fromSI', () => {
    it('toSI: 100 C → 373.15 K', () => {
      expect(registry.toSI(100, 'C')).toBeCloseTo(373.15, 4);
    });

    it('fromSI: 373.15 K → 100 C', () => {
      expect(registry.fromSI(373.15, 'C')).toBeCloseTo(100, 4);
    });

    it('toSI: 1 atm → 101325 Pa', () => {
      expect(registry.toSI(1, 'atm')).toBeCloseTo(101325, 2);
    });

    it('fromSI: 101325 Pa → 1 atm', () => {
      expect(registry.fromSI(101325, 'atm')).toBeCloseTo(1, 4);
    });

    it('round-trips toSI → fromSI for temperature', () => {
      const celsius = 37; // body temperature
      const si = registry.toSI(celsius, 'C');
      expect(registry.fromSI(si, 'C')).toBeCloseTo(celsius, 8);
    });

    it('round-trips toSI → fromSI for pressure', () => {
      const psi = 14.696;
      const si = registry.toSI(psi, 'psi');
      expect(registry.fromSI(si, 'psi')).toBeCloseTo(psi, 4);
    });
  });

  // ── isCompatible ─────────────────────────────────────────────────────────

  describe('isCompatible', () => {
    it('returns true for same-dimension units', () => {
      expect(registry.isCompatible('Pa', 'atm')).toBe(true);
      expect(registry.isCompatible('m', 'ft')).toBe(true);
      expect(registry.isCompatible('K', 'C')).toBe(true);
      expect(registry.isCompatible('K', 'F')).toBe(true);
      expect(registry.isCompatible('W', 'kW')).toBe(true);
      expect(registry.isCompatible('L/s', 'm3/s')).toBe(true);
    });

    it('returns false for different-dimension units', () => {
      expect(registry.isCompatible('Pa', 'm')).toBe(false);
      expect(registry.isCompatible('K', 'Pa')).toBe(false);
      expect(registry.isCompatible('W', 'J')).toBe(false);
      expect(registry.isCompatible('m/s', 'kg')).toBe(false);
    });
  });

  // ── DimensionalMismatchError ─────────────────────────────────────────────

  describe('DimensionalMismatchError', () => {
    it('is thrown with correct type', () => {
      try {
        registry.convert(1, 'Pa', 'm');
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(DimensionalMismatchError);
        if (e instanceof DimensionalMismatchError) {
          expect(e.fromSymbol).toBe('Pa');
          expect(e.toSymbol).toBe('m');
          expect(e.name).toBe('DimensionalMismatchError');
        }
      }
    });

    it('throws for power vs energy (W vs J)', () => {
      expect(() => registry.convert(1, 'W', 'J')).toThrow(DimensionalMismatchError);
    });

    it('throws for density vs pressure (kg/m³ vs Pa)', () => {
      expect(() => registry.convert(1, 'kg/m3', 'Pa')).toThrow(DimensionalMismatchError);
    });
  });

  // ── Registry operations ──────────────────────────────────────────────────

  describe('Registry operations', () => {
    it('lists all registered units (>20)', () => {
      const units = registry.listUnits();
      expect(units.length).toBeGreaterThan(20);
      expect(units).toContain('K');
      expect(units).toContain('Pa');
      expect(units).toContain('m');
      expect(units).toContain('W/(m*K)');
      expect(units).toContain('J/(kg*K)');
    });

    it('getUnit returns correct definition', () => {
      const kelvin = registry.getUnit('K');
      expect(kelvin.name).toBe('Kelvin');
      expect(kelvin.scale).toBe(1);
      expect(kelvin.offset).toBe(0);
    });

    it('throws on unknown unit symbol', () => {
      expect(() => registry.getUnit('lightyear')).toThrow('Unknown unit');
    });

    it('new registry instance has all built-in units', () => {
      const fresh = new UnitRegistry();
      expect(fresh.convert(1, 'km', 'm')).toBeCloseTo(1000, 5);
      expect(fresh.convert(100, 'C', 'K')).toBeCloseTo(373.15, 4);
    });

    it('throws on duplicate registration', () => {
      const fresh = new UnitRegistry();
      expect(() =>
        fresh.register({
          symbol: 'K',
          name: 'Duplicate',
          dimension: [0, 0, 0, 1, 0, 0, 0],
          scale: 1,
          offset: 0,
        })
      ).toThrow('already registered');
    });
  });
});
