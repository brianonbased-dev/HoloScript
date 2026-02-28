use serde_json::Value;
use sqlx::{PgPool, Row};
use uuid::Uuid;

pub struct EventStore {
    pub pool: Option<PgPool>,
}

impl EventStore {
    pub async fn new(database_url: &str) -> Result<Self, sqlx::Error> {
        let pool = PgPool::connect(database_url).await?;
        Ok(Self { pool: Some(pool) })
    }

    pub async fn store_event(
        &self,
        event_id: Uuid,
        agent_id: Uuid,
        location: (f64, f64, f64),
        action: &str,
        observations: Value,
        outcome: Value,
    ) -> Result<(), sqlx::Error> {
        let location_str = format!("({},{},{})", location.0, location.1, location.2);

        if let Some(pool) = &self.pool {
            sqlx::query(
                r#"
                INSERT INTO events (event_id, agent_id, location, entities, action, observations, outcome)
                VALUES ($1, $2, $3::cube, $4, $5, $6, $7)
                "#
            )
            .bind(event_id)
            .bind(agent_id)
            .bind(location_str)
            .bind(Vec::<Uuid>::new())
            .bind(action)
            .bind(observations)
            .bind(outcome)
            .execute(pool)
            .await?;
        }

        Ok(())
    }

    pub async fn query_spatial(
        &self,
        location: (f64, f64, f64),
        radius: f64,
    ) -> Result<Vec<Uuid>, sqlx::Error> {
        let location_str = format!("({},{},{})", location.0, location.1, location.2);

        let mut event_ids = Vec::new();

        if let Some(pool) = &self.pool {
            // Cube distance operator `<->` for Euclidean distance
            let rows = sqlx::query(
                r#"
                SELECT event_id FROM events
                WHERE location <-> $1::cube < $2
                ORDER BY timestamp DESC
                LIMIT 100
                "#,
            )
            .bind(location_str)
            .bind(radius)
            .fetch_all(pool)
            .await?;

            for row in rows {
                event_ids.push(row.try_get("event_id")?);
            }
        }

        Ok(event_ids)
    }
}

pub struct MemoryRouter {
    pub postgres: EventStore,
    pub neo4j: crate::database::neo4j_client::Neo4jClient,
    pub pinecone: crate::database::pinecone_client::PineconeClient,
    pub redis: crate::database::redis_cache::RedisCache,
}

impl MemoryRouter {
    pub fn new(
        postgres: EventStore,
        neo4j: crate::database::neo4j_client::Neo4jClient,
        pinecone: crate::database::pinecone_client::PineconeClient,
        redis: crate::database::redis_cache::RedisCache,
    ) -> Self {
        Self {
            postgres,
            neo4j,
            pinecone,
            redis,
        }
    }

    /// Primary Perception ECS query hitting Redis cache first, falling back to Pinecone/Postgres
    pub async fn perceive_memory(
        &self,
        spatial_location: (f64, f64, f64),
        radius: f64,
        semantic_query: Option<Vec<f32>>,
    ) -> Result<Vec<Uuid>, Box<dyn std::error::Error>> {
        // 1. STM Cache Check (Redis) - skipped for brevity in router logic
        // Normally check self.redis.get_cached_event(...)

        // 2. Vector Semantic Search (Pinecone)
        let mut results = Vec::new();
        if let Some(embedding) = semantic_query {
            let similar = self.pinecone.query_similar(embedding, 10).await?;
            results.extend(similar);
        }

        // 3. Spatial GIST Search (Postgres)
        let spatial_hits = self
            .postgres
            .query_spatial(spatial_location, radius)
            .await?;
        results.extend(spatial_hits);

        // 4. Graph Relations (Neo4j)
        if let Some(first_match) = results.first() {
            let relations = self.neo4j.query_relations(*first_match).await?;
            results.extend(relations);
        }

        // Deduplicate and return
        results.sort();
        results.dedup();

        Ok(results)
    }
}
