/**
 * Multi-Domain Simulation Traits (Thermal, Structural, Hydraulic)
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
] as const;
