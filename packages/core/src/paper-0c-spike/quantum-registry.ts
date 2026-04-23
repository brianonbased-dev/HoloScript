/**
 * paper-0c spike quantum registry — mirrors the FIELD_QUANTUM_REGISTRY from
 * packages/engine/src/simulation/SimulationContract.ts:814 so the spike-encoder
 * can auto-select the right q_f per field name without cross-package imports.
 *
 * Intentional duplication: the engine's registry is `private static` inside
 * ContractedSimulation; extracting it to a shared module is refactor work
 * beyond this ship. Kept byte-identical to the engine source; a sync test
 * verifies this if the two diverge.
 */

/** (pattern, quantum). First-match wins, same semantics as the engine. */
export const FIELD_QUANTUM_REGISTRY: ReadonlyArray<readonly [RegExp, number]> = [
  // Stress-family fields: characteristic scale ~10^6 Pa → q = 1000 Pa
  [/^(stress|vonMises|principal[A-Z]|deviatoric|cauchy|pk[12])/i, 1_000],
  // Strain fields: dimensionless, characteristic scale ~10^-3 → q = 1e-6
  [/^(strain|deformation)/i, 1e-6],
  // Displacement/position: characteristic scale ~10^-2 m → q = 1e-5 m
  [/^(displacement|position|offset|translation|coord)/i, 1e-5],
  // Velocity: characteristic scale ~1 m/s → q = 1e-3 m/s
  [/^(velocity|velo|speed)/i, 1e-3],
  // Acceleration / force per mass: characteristic scale ~10 m/s² → q = 1e-2
  [/^(acceleration|accel|force)/i, 1e-2],
  // Temperature: characteristic scale ~10^2 K → q = 0.1 K
  [/^(temperature|temp|thermal)/i, 0.1],
  // Pressure: same family as stress; characteristic scale ~10^5 Pa → q = 100 Pa
  [/^(pressure|press)/i, 100],
  // Energy: characteristic scale ~10^1 J (per-element) → q = 1e-2 J
  [/^(energy|strainEnergy|kineticEnergy|potentialEnergy)/i, 1e-2],
];

/** Fallback for unrecognized field names. Matches engine's FALLBACK_QUANTUM. */
export const FALLBACK_QUANTUM = 1e-6;

/**
 * Resolve q_f for a given field name via first-match lookup against
 * FIELD_QUANTUM_REGISTRY, falling back to FALLBACK_QUANTUM.
 */
export function quantumForField(name: string): number {
  for (const [pattern, q] of FIELD_QUANTUM_REGISTRY) {
    if (pattern.test(name)) return q;
  }
  return FALLBACK_QUANTUM;
}

/**
 * Build a FieldQuanta object for a set of field names by applying the
 * registry to each. Useful when calling encodeStep / decodeStep with
 * auto-resolved quanta.
 */
export function buildQuantaFor(fields: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of fields) out[f] = quantumForField(f);
  return out;
}
