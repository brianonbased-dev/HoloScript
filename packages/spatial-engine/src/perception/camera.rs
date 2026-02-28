use crate::components::agent::SpatialPosition;
use bevy::prelude::*;

#[derive(Component, Debug)]
pub struct SyntheticCamera {
    pub resolution: (u32, u32),
    pub fov: f32,
    pub depth_range: (f32, f32),
}

#[derive(Debug, Clone)]
pub struct RgbObservation {
    pub average_brightness: f32,
    pub dominant_color_hex: String,
}

#[derive(Debug, Clone)]
pub struct DepthObservation {
    pub closest_object_distance: f32,
    pub spatial_density: f32,
}

/// Simulate a 0.5ms frame capture
pub fn capture_rgb_depth(
    _camera: &SyntheticCamera,
    _position: &SpatialPosition,
) -> (RgbObservation, DepthObservation) {
    // In a real environment, this binds to the Bevy render pipiline via GPU compute.
    // Simulating the extracted spatial feature vector:

    (
        RgbObservation {
            average_brightness: 0.8,
            dominant_color_hex: "#3498db".to_string(), // Typical sky/light color
        },
        DepthObservation {
            closest_object_distance: 2.5, // meters
            spatial_density: 0.15,
        },
    )
}
