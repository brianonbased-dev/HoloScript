use futures::{sink::SinkExt, stream::StreamExt};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use uuid::Uuid;
use serde::Deserialize;
use serde_json::Value;

use crate::database::event_store::MemoryRouter;

#[derive(Deserialize, Debug)]
pub struct InboundDelta {
    pub id: String,
    pub field: String,
    pub value: Value,
    pub time: i64,
}

#[derive(Deserialize, Debug)]
pub struct InboundPayload {
    pub deltas: Vec<InboundDelta>,
}

#[derive(Deserialize, Debug)]
pub struct ClientMessage {
    pub r#type: String, // "client_deltas"
    pub payload: InboundPayload,
}

pub struct ConnectedClient {
    pub id: Uuid,
    pub address: SocketAddr,
    pub tx: mpsc::UnboundedSender<Message>,
}

pub struct NetworkServer {
    pub clients: Arc<Mutex<HashMap<Uuid, ConnectedClient>>>,
    pub memory: Option<Arc<MemoryRouter>>,
}

impl NetworkServer {
    pub fn new(memory: Option<Arc<MemoryRouter>>) -> Self {
        Self {
            clients: Arc::new(Mutex::new(HashMap::new())),
            memory,
        }
    }

    /// Spin up the authoritative WebSocket server on port 8080
    pub async fn start(&self) -> Result<(), Box<dyn std::error::Error>> {
        let addr = "0.0.0.0:8080";
        let listener = TcpListener::bind(&addr).await?;
        println!("Authoritative Spatial Server running on ws://{}", addr);

        while let Ok((stream, addr)) = listener.accept().await {
            let clients = Arc::clone(&self.clients);
            let mem = self.memory.clone();
            tokio::spawn(async move {
                if let Err(e) = handle_connection(stream, addr, clients, mem).await {
                    eprintln!("Error handling connection {}: {}", addr, e);
                }
            });
        }

        Ok(())
    }

    /// Broadcast a single string payload to all connected observer clients
    pub async fn broadcast_state(&self, payload: String) {
        let clients = self.clients.lock().await;
        for (_, client) in clients.iter() {
            let _ = client.tx.send(Message::Text(payload.clone()));
        }
    }
}

async fn handle_connection(
    stream: TcpStream,
    addr: SocketAddr,
    clients_map: Arc<Mutex<HashMap<Uuid, ConnectedClient>>>,
    memory_router: Option<Arc<MemoryRouter>>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let ws_stream = accept_async(stream).await?;
    println!("New WebSocket connection from: {}", addr);

    let client_id = Uuid::new_v4();
    let (tx, mut rx) = mpsc::unbounded_channel();

    // Register 
    let mut clients = clients_map.lock().await;
    clients.insert(
        client_id,
        ConnectedClient {
            id: client_id,
            address: addr,
            tx,
        },
    );
    drop(clients);

    // Split stream to read messages
    let (mut outgoing, mut incoming) = ws_stream.split();

    // Setup send loop
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let _ = outgoing.send(msg).await;
        }
    });

    // Setup receive loop
    while let Some(Ok(msg)) = incoming.next().await {
        if msg.is_text() {
            // Processing Client inbound messages for Phase 7
            let txt = msg.to_text().unwrap_or("");
            
            if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(txt) {
                if client_msg.r#type == "client_deltas" {
                    println!("Received {} deltas from client {}", client_msg.payload.deltas.len(), client_id);
                    // Wire the inbound messages into the learning buffers
                    if let Some(mem) = &memory_router {
                        for delta in client_msg.payload.deltas {
                            // Map Delta to EventStore
                            let event_uuid = Uuid::new_v4();
                            // Attempt to parse agent id if it's a uuid, otherwise generate one
                            let agent_uuid = Uuid::parse_str(&delta.id).unwrap_or_else(|_| Uuid::new_v4());
                            
                            let _ = mem.postgres.store_event(
                                event_uuid,
                                agent_uuid,
                                (0.0, 0.0, 0.0), // Need richer spatial state in V8
                                &format!("STATE_SYNC_{}", delta.field),
                                serde_json::json!({ "value": delta.value, "time": delta.time }),
                                serde_json::json!({ "status": "received" }),
                            ).await;
                        }
                    }
                }
            } else {
                println!("Received raw message from {}: {:?}", client_id, msg);
            }
        }
    }

    // Unregister on disconnect
    let mut clients = clients_map.lock().await;
    clients.remove(&client_id);
    println!("Client disconnected: {}", addr);

    Ok(())
}
