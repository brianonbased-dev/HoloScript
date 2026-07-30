// HoloScript Energy Discovery Lab
//
// A positive residual is an anomaly to reproduce, not proof of energy creation.
// All energy arguments use the same caller-declared unit (for example, joules).
//
// Classification:
//   0 = invalid measurement boundary
//   1 = accounted energy
//   2 = unexplained anomaly requiring stronger evidence
//   3 = replicated candidate for independent investigation

function classify_energy_claim(
  output_energy,
  measured_source_energy,
  storage_energy_before,
  storage_energy_after,
  controller_input_energy,
  chemical_input_energy,
  uncertainty_energy,
  replicated_runs,
  independent_meters,
  boundary_closed
) {
  if (
    output_energy < 0 ||
    measured_source_energy < 0 ||
    storage_energy_before < 0 ||
    storage_energy_after < 0 ||
    controller_input_energy < 0 ||
    chemical_input_energy < 0 ||
    uncertainty_energy < 0 ||
    replicated_runs < 0 ||
    independent_meters < 0
  ) {
    return 0
  }

  let storage_draw = 0
  if (storage_energy_before > storage_energy_after) {
    storage_draw = storage_energy_before - storage_energy_after
  }

  const accounted_input =
    measured_source_energy +
    storage_draw +
    controller_input_energy +
    chemical_input_energy
  const residual_energy = output_energy - accounted_input

  if (residual_energy <= uncertainty_energy) {
    return 1
  }

  if (replicated_runs < 3 || independent_meters < 2 || boundary_closed != 1) {
    return 2
  }

  return 3
}
