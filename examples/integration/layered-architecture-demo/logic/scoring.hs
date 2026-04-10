// Scoring system logic - pure business logic, no visuals
// File type: .hs (Logic Layer)

function calculateScore(hits, time, accuracy) {
  base_score = hits * 10
  time_bonus = max(0, 100 - time)
  accuracy_multiplier = accuracy / 100

  return (base_score + time_bonus) * accuracy_multiplier
}

function updateHighScore(current_score, high_score) {
  if (current_score > high_score) {
    return current_score
  }
  return high_score
}

function resetScore() {
  return 0
}
