// HoloScript Experiment Quest
//
// A reusable progression contract for scientific campaigns. It rewards
// evidence quality instead of dramatic outcomes, so accounted and null results
// advance the lab when the procedure is sound.
//
// Classification:
//   0 = invalid run
//   1 = accounted or null result
//   2 = anomaly requiring stronger evidence
//   3 = replicated candidate ready for independent investigation
//
// Rank:
//   0 = observer
//   1 = calibrator
//   2 = investigator
//   3 = replicator
//   4 = lab steward

function score_experiment_run(
  classification,
  calibration_complete,
  raw_data_captured,
  independent_meters,
  unique_run,
  safety_incidents
) {
  if (
    classification < 0 ||
    classification > 3 ||
    calibration_complete < 0 ||
    calibration_complete > 1 ||
    raw_data_captured < 0 ||
    raw_data_captured > 1 ||
    independent_meters < 0 ||
    unique_run < 0 ||
    unique_run > 1 ||
    safety_incidents < 0
  ) {
    return -1
  }

  if (unique_run != 1 || classification == 0) {
    return 0
  }

  let evidence_xp = 20
  if (classification == 2) {
    evidence_xp = 30
  }
  if (classification == 3) {
    evidence_xp = 40
  }

  if (calibration_complete == 1) {
    evidence_xp = evidence_xp + 5
  }
  if (raw_data_captured == 1) {
    evidence_xp = evidence_xp + 5
  }

  let meter_bonus = independent_meters * 3
  if (meter_bonus > 6) {
    meter_bonus = 6
  }
  evidence_xp = evidence_xp + meter_bonus

  const safety_penalty = safety_incidents * 20
  evidence_xp = evidence_xp - safety_penalty
  if (evidence_xp < 0) {
    return 0
  }

  return evidence_xp
}

function experiment_rank(
  total_evidence_xp,
  completed_runs,
  calibrated_runs,
  replicated_hypotheses
) {
  if (
    total_evidence_xp < 0 ||
    completed_runs < 0 ||
    calibrated_runs < 0 ||
    replicated_hypotheses < 0
  ) {
    return -1
  }

  let rank = 0

  if (
    total_evidence_xp >= 20 &&
    completed_runs >= 1 &&
    calibrated_runs >= 1
  ) {
    rank = 1
  }

  if (
    total_evidence_xp >= 75 &&
    completed_runs >= 3 &&
    calibrated_runs >= 2
  ) {
    rank = 2
  }

  if (
    total_evidence_xp >= 180 &&
    completed_runs >= 8 &&
    calibrated_runs >= 4 &&
    replicated_hypotheses >= 1
  ) {
    rank = 3
  }

  if (
    total_evidence_xp >= 400 &&
    completed_runs >= 20 &&
    calibrated_runs >= 8 &&
    replicated_hypotheses >= 3
  ) {
    rank = 4
  }

  return rank
}
