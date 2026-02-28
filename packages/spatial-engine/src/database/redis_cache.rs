use redis::{AsyncCommands, Client, RedisResult};
use serde_json::Value;
use std::collections::HashMap;
use uuid::Uuid;

pub struct RedisCache {
    client: Client,
}

impl RedisCache {
    pub fn new(redis_url: &str) -> RedisResult<Self> {
        let client = Client::open(redis_url)?;
        Ok(Self { client })
    }

    /// Store a rapid Short-Term Memory (STM) event with a TTL
    pub async fn cache_event(
        &self,
        event_id: Uuid,
        event_data: &Value,
        ttl_seconds: u64,
    ) -> RedisResult<()> {
        let mut con = self.client.get_multiplexed_async_connection().await?;
        let data_str = serde_json::to_string(event_data).unwrap_or_default();

        let key = format!("event:{}", event_id);
        let _: () = con.set_ex(&key, data_str, ttl_seconds).await?;

        Ok(())
    }

    /// Retrieve a single event from hot memory
    pub async fn get_cached_event(&self, event_id: Uuid) -> RedisResult<Option<Value>> {
        let mut con = self.client.get_multiplexed_async_connection().await?;
        let key = format!("event:{}", event_id);

        let result: Option<String> = con.get(&key).await?;

        if let Some(data_str) = result {
            if let Ok(value) = serde_json::from_str(&data_str) {
                return Ok(Some(value));
            }
        }

        Ok(None)
    }

    /// Predictively preload memories based on anticipated spatial trajectory
    pub async fn preload_memories(
        &self,
        agent_id: Uuid,
        anticipated_events: HashMap<Uuid, Value>,
    ) -> RedisResult<()> {
        let mut con = self.client.get_multiplexed_async_connection().await?;

        // Use a pipeline for high-performance batch insertion
        let mut pipe = redis::pipe();
        let preload_key_prefix = format!("preload:{}:", agent_id);

        for (event_id, data) in anticipated_events {
            let data_str = serde_json::to_string(&data).unwrap_or_default();
            pipe.set_ex(format!("{}{}", preload_key_prefix, event_id), data_str, 60);
            // 60s TTL
        }

        let _: () = pipe.query_async(&mut con).await?;
        Ok(())
    }
}
