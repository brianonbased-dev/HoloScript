use crate::database::event_store::MemoryRouter;
use crate::perception::fusion::FusedObservationVector;
use std::sync::Arc;
use uuid::Uuid;

pub struct HierarchicalPlanner {
    pub memory: Arc<MemoryRouter>,
}

pub enum SelectedAction {
    MoveToLocation(f64, f64, f64),
    InteractWithObject(Uuid),
    Flee,
    Idle,
}

impl HierarchicalPlanner {
    pub fn new(memory: Arc<MemoryRouter>) -> Self {
        Self { memory }
    }

    /// Selects an optimal goal and action sequence allocating only 2ms budget
    pub async fn select_action(
        &self,
        current_position: (f64, f64, f64),
        perception: &FusedObservationVector,
    ) -> Result<SelectedAction, Box<dyn std::error::Error>> {
        // 1. Reactive overrides (0.2ms)
        // If high threat detected during fusion, instinctually override high-level planning
        if perception.threat_level > 0.6 {
            return Ok(SelectedAction::Flee);
        }

        // 2. Query Unified Memory Architecture for salient historical context (1.0ms)
        let relevant_memories = self
            .memory
            .perceive_memory(
                current_position,
                5.0,                                   // 5 meter spatial radius
                Some(perception.raw_features.clone()), // Semantic nearest-neighbor embedding
            )
            .await?;

        // 3. Goal Selection & Path Planning (0.8ms)
        // A placeholder for actual A* or LLM-based logic bounded to completion

        if relevant_memories.is_empty() {
            // Routine local exploration pattern
            Ok(SelectedAction::MoveToLocation(
                current_position.0 + 1.0,
                current_position.1,
                current_position.2,
            ))
        } else {
            // In context of historical event, interact with the entity
            // Normally this would parse the specific memory action outcome
            Ok(SelectedAction::InteractWithObject(relevant_memories[0]))
        }
    }
}
