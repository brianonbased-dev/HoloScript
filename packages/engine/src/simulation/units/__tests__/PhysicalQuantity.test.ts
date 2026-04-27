/**
 * PhysicalQuantity — unit conversion and branded constructor tests.
 * W4-T2 coverage pass: targets 30% → ≥70% line coverage.
 */

import { describe, it, expect } from 'vitest';
import {
  // Constructors
  temperature, pressure, force, length, area, volume, time, mass, density,
  velocity, thermalConductivity, specificHeat, thermalDiffusivity,
  heatTransferCoefficient, power, energy, youngsModulus, yieldStrength,
  stress, acceleration, strain, poissonRatio, dynamicViscosity,
  kinematicViscosity, flowRate, roughness,
  // Temperature
  celsiusToKelvin, kelvinToCelsius, fahrenheitToKelvin, kelvinToFahrenheit,
  // Pressure
  barToPascal, pascalToBar, psiToPascal, pascalToPsi, atmToPascal, pascalToAtm,
  // Length
  millimetersToMeters, metersToMillimeters, inchesToMeters, metersToInches,
} from '../PhysicalQuantity';

// ── Constructors ─────────────────────────────────────────────────────────────

describe('Physical quantity constructors', () => {
  it.each([
    ['temperature', temperature, 300],
    ['pressure', pressure, 101325],
    ['force', force, 9.81],
    ['length', length, 2.5],
    ['area', area, 6.28],
    ['volume', volume, 1.0],
    ['time', time, 0.016],
    ['mass', mass, 70],
    ['density', density, 1000],
    ['velocity', velocity, 5],
    ['thermalConductivity', thermalConductivity, 0.6],
    ['specificHeat', specificHeat, 4186],
    ['thermalDiffusivity', thermalDiffusivity, 1.43e-7],
    ['heatTransferCoefficient', heatTransferCoefficient, 25],
    ['power', power, 1000],
    ['energy', energy, 500],
    ['youngsModulus', youngsModulus, 200e9],
    ['yieldStrength', yieldStrength, 250e6],
    ['stress', stress, 1e6],
    ['acceleration', acceleration, 9.81],
    ['strain', strain, 0.001],
    ['poissonRatio', poissonRatio, 0.3],
    ['dynamicViscosity', dynamicViscosity, 0.001],
    ['kinematicViscosity', kinematicViscosity, 1e-6],
    ['flowRate', flowRate, 0.01],
    ['roughness', roughness, 0.05],
  ])('%s wraps number identity', (_, ctor, val) => {
    const q = (ctor as (v: number) => number)(val);
    expect(q).toBe(val);
  });

  it('temperature(0) is 0', () => {
    expect(temperature(0)).toBe(0);
  });

  it('negative values are preserved', () => {
    expect(temperature(-1)).toBe(-1);
    expect(force(-9.81)).toBe(-9.81);
  });
});

// ── Temperature conversions ───────────────────────────────────────────────────

describe('Temperature conversions', () => {
  it('0°C is 273.15 K', () => {
    expect(celsiusToKelvin(0)).toBeCloseTo(273.15);
  });

  it('100°C is 373.15 K', () => {
    expect(celsiusToKelvin(100)).toBeCloseTo(373.15);
  });

  it('273.15 K is 0°C', () => {
    expect(kelvinToCelsius(temperature(273.15))).toBeCloseTo(0);
  });

  it('373.15 K is 100°C', () => {
    expect(kelvinToCelsius(temperature(373.15))).toBeCloseTo(100);
  });

  it('32°F is 273.15 K', () => {
    expect(fahrenheitToKelvin(32)).toBeCloseTo(273.15);
  });

  it('212°F is 373.15 K', () => {
    expect(fahrenheitToKelvin(212)).toBeCloseTo(373.15);
  });

  it('273.15 K is 32°F', () => {
    expect(kelvinToFahrenheit(temperature(273.15))).toBeCloseTo(32);
  });

  it('273.15 K → °C → K round-trips', () => {
    const k = temperature(300);
    expect(celsiusToKelvin(kelvinToCelsius(k))).toBeCloseTo(300);
  });
});

// ── Pressure conversions ──────────────────────────────────────────────────────

describe('Pressure conversions', () => {
  it('1 bar = 100000 Pa', () => {
    expect(barToPascal(1)).toBeCloseTo(100000);
  });

  it('100000 Pa = 1 bar', () => {
    expect(pascalToBar(pressure(100000))).toBeCloseTo(1);
  });

  it('1 psi ≈ 6894.757 Pa', () => {
    expect(psiToPascal(1)).toBeCloseTo(6894.757);
  });

  it('psi → Pa → psi round-trips', () => {
    expect(pascalToPsi(psiToPascal(14.7))).toBeCloseTo(14.7, 3);
  });

  it('1 atm = 101325 Pa', () => {
    expect(atmToPascal(1)).toBeCloseTo(101325);
  });

  it('101325 Pa = 1 atm', () => {
    expect(pascalToAtm(pressure(101325))).toBeCloseTo(1);
  });

  it('atm → Pa → atm round-trips', () => {
    expect(pascalToAtm(atmToPascal(2))).toBeCloseTo(2, 5);
  });
});

// ── Length conversions ────────────────────────────────────────────────────────

describe('Length conversions', () => {
  it('1000 mm = 1 m', () => {
    expect(millimetersToMeters(1000)).toBeCloseTo(1);
  });

  it('1 m = 1000 mm', () => {
    expect(metersToMillimeters(length(1))).toBeCloseTo(1000);
  });

  it('1 inch ≈ 0.0254 m', () => {
    expect(inchesToMeters(1)).toBeCloseTo(0.0254);
  });

  it('0.0254 m = 1 inch', () => {
    expect(metersToInches(length(0.0254))).toBeCloseTo(1);
  });

  it('mm → m → mm round-trips', () => {
    expect(metersToMillimeters(millimetersToMeters(25.4))).toBeCloseTo(25.4, 5);
  });

  it('inch → m → inch round-trips', () => {
    expect(metersToInches(inchesToMeters(12))).toBeCloseTo(12, 5);
  });
});
