/**
 * Multi-Domain Simulation Traits (Thermal, Structural, Hydraulic, Saturation)
 */
export const SIMULATION_DOMAIN_TRAITS = [
  'thermal_simulation',
  'thermal_conduction',
  'thermal_convection',
  'thermal_radiation',
  'thermal_source',
  'thermal_boundary',
  'structural_fem',
  'structural_static',
  'structural_dynamic',
  'structural_constraint',
  'structural_load',
  'structural_material',
  'hydraulic_pipe',
  'hydraulic_junction',
  'hydraulic_reservoir',
  'hydraulic_valve',
  'hydraulic_pump',
  'scalar_field_overlay',
  'colormap_jet',
  'colormap_viridis',
  'colormap_turbo',
  'colormap_inferno',
  'colormap_coolwarm',
  // 10 trait names (saturation_* x6 + phase_transition + threshold_* x3) retired
  // 2026-05-17 per founder ruling task_1778979065243_dksg. Design intent preserved
  // at docs/simulation/SATURATION_MONITORING_DESIGN.md with full default tables.
  // Rebuild path: re-add the names here when the consumer-side use case appears
  // and the new trait handlers wire to the existing SaturationManager. Second-
  // pass re-apply after peer commit a9daad4d3 silently re-introduced them.
] as const;

export type SimulationDomainTraitName =
  (typeof SIMULATION_DOMAIN_TRAITS)[number];
