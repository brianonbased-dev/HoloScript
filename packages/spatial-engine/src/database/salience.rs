use chrono::{DateTime, Utc};

pub struct SalienceScorer;

impl SalienceScorer {
    /// Calculate composite salience score based on novelty, emotion, and goals
    pub fn calculate_salience(novelty: f64, emotional_intensity: f64, goal_relevance: f64) -> f64 {
        // Weights derived from AI Persistence Research phase 5
        let w_novelty = 0.3;
        let w_emotion = 0.4;
        let w_goal = 0.3;

        (novelty * w_novelty) + (emotional_intensity * w_emotion) + (goal_relevance * w_goal)
    }

    /// Calculate memory decay over time
    pub fn calculate_retention(
        base_salience: f64,
        creation_time: DateTime<Utc>,
        current_time: DateTime<Utc>,
    ) -> f64 {
        let age_seconds = (current_time - creation_time).num_seconds() as f64;

        // Ebbinghaus forgetting curve simulation
        // R = e^(-t/S) where S is strength (salience)
        let strength = base_salience.max(0.1) * 100000.0; // Scale factor

        f64::exp(-age_seconds / strength)
    }
}
