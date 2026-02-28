use crate::cognition::planner::SelectedAction;
use crate::components::agent::{PersistentAgent, SpatialPosition};
use crate::database::event_store::MemoryRouter;
use crate::perception::fusion::FusedObservationVector;
use serde_json::json;
use std::sync::Arc;
use tokio::runtime::Runtime;

pub struct ActionExecutor {
    pub memory: Arc<MemoryRouter>,
    pub io_runtime: Arc<Runtime>,
}

impl ActionExecutor {
    pub fn new(memory: Arc<MemoryRouter>, io_runtime: Arc<Runtime>) -> Self {
        Self { memory, io_runtime }
    }

    /// Binding actions back to the Bevy ECS for physics iteration (0.5ms) and async event logging
    pub fn execute_and_log(
        &self,
        agent: &PersistentAgent,
        position: &mut SpatialPosition,
        action: SelectedAction,
        observation: FusedObservationVector,
    ) {
        let (action_str, outcome) = match action {
            SelectedAction::MoveToLocation(x, y, z) => {
                position.x = x;
                position.y = y;
                position.z = z;
                ("MoveToLocation", json!({"x": x, "y": y, "z": z}))
            }
            SelectedAction::InteractWithObject(target_id) => (
                "InteractWithObject",
                json!({"target": target_id.to_string()}),
            ),
            SelectedAction::Flee => {
                // Simplified flee vector
                position.x -= 5.0;
                position.y -= 5.0;
                ("Flee", json!({"status": "evaded"}))
            }
            SelectedAction::Idle => ("Idle", json!({})),
        };

        // Autonomously log experience to PostgreSQL event store in a background thread
        // to prevent blocking the 16ms application frame-rate
        let memory_clone = Arc::clone(&self.memory);
        let event_id = uuid::Uuid::new_v4();
        let agent_id = agent.id.clone();
        let location = (position.x, position.y, position.z);
        let action_name = action_str.to_string();

        let observation_json = json!({
            "features": observation.raw_features,
            "threat": observation.threat_level,
            "salient_objects": observation.salient_objects,
        });

        self.io_runtime.spawn(async move {
            let res = memory_clone
                .postgres
                .store_event(
                    event_id,
                    agent_id,
                    location,
                    &action_name,
                    observation_json,
                    outcome,
                )
                .await;

            if let Err(e) = res {
                eprintln!("Failed to log autonomous event: {}", e);
            }
        });
    }
}
