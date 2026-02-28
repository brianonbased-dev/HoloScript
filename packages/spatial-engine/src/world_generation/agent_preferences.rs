use crate::database::event_store::MemoryRouter;
use crate::world_generation::solver::SpatialConstraint;
use std::sync::Arc;

pub struct PreferenceMapper {
    pub memory: Arc<MemoryRouter>,
}

impl PreferenceMapper {
    pub fn new(memory: Arc<MemoryRouter>) -> Self {
        Self { memory }
    }

    /// Evaluates the agent's historical context to produce SMT bounds
    pub async fn generate_constraints(&self) -> SpatialConstraint {
        // Query the agent's persistent memory back-end
        // For demonstration, simulating a memory where the agent prefers wide, open spaces
        // rather than cramped layouts (claustrophobic traits)

        // This is where we would normally call:
        // self.memory.pinecone.query_similar(vec![...], 1).await?
        let prefers_open_spaces = true;

        if prefers_open_spaces {
            SpatialConstraint {
                min_width: 15,
                max_width: 30,
                min_length: 15,
                max_length: 30,
                target_area: 400, // Optimize heavily towards 20x20 feeling
            }
        } else {
            // Crawlspace behavior
            SpatialConstraint {
                min_width: 3,
                max_width: 8,
                min_length: 3,
                max_length: 12,
                target_area: 25,
            }
        }
    }
}
