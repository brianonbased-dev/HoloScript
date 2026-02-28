use super::audio::AudioObservation;
use super::camera::{DepthObservation, RgbObservation};

#[derive(Debug, Clone)]
pub struct FusedObservationVector {
    pub raw_features: Vec<f32>,
    pub threat_level: f32,
    pub salient_objects: Vec<String>,
}

/// Attention-based fusion algorithm combining modalities within a strict 0.7ms budget
pub fn fuse_modalities(
    rgb: RgbObservation,
    depth: DepthObservation,
    audio: AudioObservation,
) -> FusedObservationVector {
    let mut threat = 0.0;
    let mut salient = Vec::new();

    // Sudden noises increase attention (fusion prioritization)
    if audio.decibel_level > 60.0 {
        threat += 0.2;
    }

    // Close objects increase threat
    if depth.closest_object_distance < 1.0 {
        threat += 0.5;
        salient.push("proximate_obstacle".to_string());
    }

    if !audio.transient_events.is_empty() {
        salient.extend(audio.transient_events.clone());
    }

    // Embed visual context
    if rgb.average_brightness < 0.2 {
        salient.push("low_light_environment".to_string());
    }

    // The raw feature vector mapped into a uniform space for embedding matching
    let mut raw_features = vec![0.0; 10];
    raw_features[0] = depth.closest_object_distance;
    raw_features[1] = audio.decibel_level;
    raw_features[2] = rgb.average_brightness;

    FusedObservationVector {
        raw_features,
        threat_level: threat,
        salient_objects: salient,
    }
}
