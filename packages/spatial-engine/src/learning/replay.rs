use crate::database::event_store::MemoryRouter;
use std::sync::Arc;
use tokio::time::{sleep, Duration};

pub struct ExperienceReplay {
    pub memory: Arc<MemoryRouter>,
    pub batch_size: i64,
}

impl ExperienceReplay {
    pub fn new(memory: Arc<MemoryRouter>, batch_size: i64) -> Self {
        Self { memory, batch_size }
    }

    /// Launches the endless background learning loop for the AI agents
    pub async fn start_learning_loop(&self) {
        println!("Neural Network Experience Replay Background Job Started.");

        loop {
            // 1. Fetch random batch of recent experiences from the Unified PostgreSQL Event Log
            match self.extract_training_batch().await {
                Ok(events) => {
                    if events.is_empty() {
                        sleep(Duration::from_secs(5)).await;
                        continue;
                    }

                    // 2. Process experiences (Simulated Backpropagation)
                    self.train_on_batch(events).await;
                }
                Err(e) => {
                    eprintln!("Experience Replay Failed to extract batch: {}", e);
                }
            }

            // Sleep to prevent trashing the Postgres DB on the IO thread
            sleep(Duration::from_secs(10)).await;
        }
    }

    async fn extract_training_batch(&self) -> Result<Vec<String>, Box<dyn std::error::Error + Send + Sync>> {
        let mut event_ids = Vec::new();

        if let Some(pool) = &self.memory.postgres.pool {
            // We use the SQLx Postgres pool directly to sample random historical EpisodicEvents
            let rows = sqlx::query(
                r#"
                SELECT id FROM "EpisodicEvent"
                ORDER BY RANDOM()
                LIMIT $1
                "#,
            )
            .bind(self.batch_size)
            .fetch_all(pool)
            .await?;

            for row in rows {
                use sqlx::Row;
                event_ids.push(row.try_get("id")?);
            }
        }

        Ok(event_ids)
    }

    async fn train_on_batch(&self, batch: Vec<String>) {
        // In a full implementation (Phase 8), this would push the tensor arrays mapping
        // the Observations -> Actions into a local Torch/ONNX model to update the agent's weights.

        // For Phase 6/7, we simulate the workload delay of 150ms per batch
        sleep(Duration::from_millis(150)).await;
        println!(
            "Experience Replay: Successfully ran backpropagation simulation on batch of {} Episodic Events.",
            batch.len()
        );
    }
}
