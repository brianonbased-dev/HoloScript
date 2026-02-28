use crate::components::agent::SpatialPosition;
use bevy::prelude::*;

#[derive(Component, Debug)]
pub struct SyntheticMicrophone {
    pub sensitivity: f32,
    pub noise_floor: f32,
}

#[derive(Debug, Clone)]
pub struct AudioObservation {
    pub decibel_level: f32,
    pub transient_events: Vec<String>,
}

/// Simulate a 0.3ms frame audio capture
pub fn capture_audio(_mic: &SyntheticMicrophone, _position: &SpatialPosition) -> AudioObservation {
    // Simulating spatialized audio collision detection

    AudioObservation {
        decibel_level: 45.0, // Ambient room noise
        transient_events: vec!["footstep_approaching".to_string()],
    }
}
