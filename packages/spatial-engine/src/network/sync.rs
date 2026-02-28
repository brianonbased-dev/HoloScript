use crate::components::agent::{PersistentAgent, SpatialPosition};
use crate::network::server::NetworkServer;
use crate::world_generation::spawner::GeneratedRoom;
use bevy::prelude::*;
use serde::Serialize;
use std::sync::Arc;
use tokio::runtime::Runtime;

#[derive(Serialize)]
pub struct AgentDelta {
    pub id: String,
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

#[derive(Serialize)]
pub struct RoomDelta {
    pub width: f32,
    pub length: f32,
}

#[derive(Serialize)]
pub struct WorldStatePayload {
    pub timestamp: i64,
    pub agent_updates: Vec<AgentDelta>,
    pub room_updates: Vec<RoomDelta>,
}

#[derive(Resource, Clone)]
pub struct ServerResource(pub Arc<NetworkServer>);

#[derive(Resource, Clone)]
pub struct RuntimeResource(pub Arc<Runtime>);

/// A Bevy System that extracts the current ECS state and pushes it to the
/// background Tokio runtime to be broadcast over WebSockets
pub fn broadcast_world_state(
    agent_query: Query<(&PersistentAgent, &SpatialPosition), Changed<SpatialPosition>>,
    room_query: Query<&GeneratedRoom, Added<GeneratedRoom>>,
    server: Res<ServerResource>,
    io_runtime: Res<RuntimeResource>,
) {
    let mut payload = WorldStatePayload {
        timestamp: chrono::Utc::now().timestamp_millis(),
        agent_updates: Vec::new(),
        room_updates: Vec::new(),
    };

    // Extract Agent Move Deltas
    for (agent, pos) in agent_query.iter() {
        payload.agent_updates.push(AgentDelta {
            id: agent.id.to_string(),
            x: pos.x as f32,
            y: pos.y as f32,
            z: pos.z as f32,
        });
    }

    // Extract New Room Generations
    for room in room_query.iter() {
        payload.room_updates.push(RoomDelta {
            width: room.width,
            length: room.length,
        });
    }

    // Only broadcast if something changed
    if !payload.agent_updates.is_empty() || !payload.room_updates.is_empty() {
        if let Ok(json_string) = serde_json::to_string(&payload) {
            let server_ptr = Arc::clone(&server.0);
            let runtime_ptr = Arc::clone(&io_runtime.0);

            runtime_ptr.spawn(async move {
                server_ptr.broadcast_state(json_string).await;
            });
        }
    }
}
