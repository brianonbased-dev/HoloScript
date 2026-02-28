use reqwest::Client;
use serde_json::json;
use std::error::Error;
use uuid::Uuid;

pub struct PineconeClient {
    client: Client,
    api_key: String,
    endpoint: String,
}

impl PineconeClient {
    pub fn new(api_key: String, endpoint: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            endpoint,
        }
    }

    pub async fn upsert_vector(
        &self,
        event_id: Uuid,
        embedding: Vec<f32>,
    ) -> Result<(), Box<dyn Error>> {
        let url = format!("{}/vectors/upsert", self.endpoint);

        let payload = json!({
            "vectors": [
                {
                    "id": event_id.to_string(),
                    "values": embedding,
                }
            ]
        });

        let res = self
            .client
            .post(&url)
            .header("Api-Key", &self.api_key)
            .json(&payload)
            .send()
            .await?;

        if !res.status().is_success() {
            let error_text = res.text().await?;
            return Err(format!("Pinecone upsert failed: {}", error_text).into());
        }

        Ok(())
    }

    pub async fn query_similar(
        &self,
        embedding: Vec<f32>,
        top_k: u32,
    ) -> Result<Vec<Uuid>, Box<dyn Error>> {
        let url = format!("{}/query", self.endpoint);

        let payload = json!({
            "vector": embedding,
            "topK": top_k,
            "includeValues": false
        });

        let res = self
            .client
            .post(&url)
            .header("Api-Key", &self.api_key)
            .json(&payload)
            .send()
            .await?;

        if !res.status().is_success() {
            let error_text = res.text().await?;
            return Err(format!("Pinecone query failed: {}", error_text).into());
        }

        let json_res: serde_json::Value = res.json().await?;
        let mut matches = Vec::new();

        if let Some(matches_arr) = json_res.get("matches").and_then(|m| m.as_array()) {
            for m in matches_arr {
                if let Some(id_str) = m.get("id").and_then(|id| id.as_str()) {
                    if let Ok(uuid) = Uuid::parse_str(id_str) {
                        matches.push(uuid);
                    }
                }
            }
        }

        Ok(matches)
    }
}
