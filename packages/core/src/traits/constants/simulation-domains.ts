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
  'saturation_thermal',
  'saturation_moisture',
  'saturation_pressure',
  'saturation_electrical',
  'saturation_chemical',
  'saturation_structural',
  'phase_transition',
  'threshold_warning',
  'threshold_critical',
  'threshold_recovery',
] as const;

export type SimulationDomainTraitName =
  (typeof SIMULATION_DOMAIN_TRAITS)[number];
