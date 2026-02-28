use bevy::prelude::*;
use std::sync::Arc;
use uuid::Uuid;

mod action;
mod cognition;
mod components;
mod database;
mod learning;
mod network;
mod perception;
mod world_generation;

fn main() {
    let io_runtime = Arc::new(tokio::runtime::Runtime::new().unwrap());

    // Initialize Memory Router & Experience Replay FIRST
    let memory = io_runtime.block_on(async {
        let postgres =
            database::event_store::EventStore::new("postgres://postgres:postgres@localhost:5432/postgres")
                .await
                .unwrap_or(database::event_store::EventStore { pool: None });
        let neo4j =
            database::neo4j_client::Neo4jClient::new("bolt://localhost:7687", "neo4j", "test")
                .await
                .unwrap();
        let pinecone =
            database::pinecone_client::PineconeClient::new("API_KEY".to_string(), "example-index".to_string());
        let redis = database::redis_cache::RedisCache::new("redis://127.0.0.1:6379")
            .unwrap();

        Arc::new(database::event_store::MemoryRouter::new(
            postgres, neo4j, pinecone, redis,
        ))
    });

    // 1. Initialize Authoritative Network Server with Memory integration
    let server = Arc::new(network::server::NetworkServer::new(Some(Arc::clone(&memory))));
    let server_clone = Arc::clone(&server);

    io_runtime.spawn(async move {
        if let Err(e) = server_clone.start().await {
            eprintln!("WebSocket Server crashed: {}", e);
        }
    });

    let replay_system = learning::replay::ExperienceReplay::new(Arc::clone(&memory), 64);

    io_runtime.spawn(async move {
        replay_system.start_learning_loop().await;
    });

    App::new()
        .add_plugins(MinimalPlugins)
        .insert_resource(network::sync::RuntimeResource(io_runtime))
        .insert_resource(network::sync::ServerResource(server))
        .add_systems(Startup, setup)
        .add_systems(Update, perception_system)
        .add_systems(Update, network::sync::broadcast_world_state)
        .run();
}

fn setup(mut commands: Commands) {
    commands.spawn((
        components::agent::PersistentAgent {
            id: Uuid::new_v4(),
            name: "Brittney".to_string(),
        },
        components::agent::SpatialPosition {
            x: 0.0,
            y: 0.0,
            z: 0.0,
        },
        components::agent::PerceptionBudget {
            current_budget_ms: 2.0,
            fused_modalities: vec!["RGB".into(), "Depth".into()],
        },
        components::agent::SpatialMemory {
            last_sync_time: chrono::Utc::now(),
            known_entities: vec![],
        },
    ));
    println!("Spawned Persistent AI Agent 'Brittney' with 2.0ms perception budget.");
}

fn perception_system(
    query: Query<(
        &components::agent::PersistentAgent,
        &components::agent::SpatialPosition,
    )>,
) {
    for (_agent, _pos) in query.iter() {
        // AI processing loop heartbeat
    }
}
