use bevy::prelude::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Component, Debug, Clone, Serialize, Deserialize)]
pub struct PersistentAgent {
    pub id: Uuid,
    pub name: String,
}

#[derive(Component, Debug, Clone, Serialize, Deserialize)]
pub struct SpatialMemory {
    pub last_sync_time: chrono::DateTime<chrono::Utc>,
    pub known_entities: Vec<Uuid>,
}

#[derive(Component, Debug, Clone)]
pub struct PerceptionBudget {
    pub current_budget_ms: f32,
    pub fused_modalities: Vec<String>,
}

#[derive(Component, Debug, Clone, Serialize, Deserialize)]
pub struct SpatialPosition {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}
