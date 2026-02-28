use neo4rs::{Graph, Query};
use uuid::Uuid;

pub struct Neo4jClient {
    graph: Graph,
}

impl Neo4jClient {
    pub async fn new(url: &str, user: &str, pass: &str) -> Result<Self, neo4rs::Error> {
        let graph = Graph::new(url, user, pass).await?;
        Ok(Self { graph })
    }

    pub async fn store_relation(
        &self,
        event_id: Uuid,
        related_id: Uuid,
        relation_type: &str,
    ) -> Result<(), neo4rs::Error> {
        let query_str = format!(
            "MERGE (e1:Event {{id: $event_id}}) 
             MERGE (e2:Event {{id: $related_id}}) 
             MERGE (e1)-[:{}]->(e2)",
            relation_type
        );
        let query = Query::new(query_str)
            .param("event_id", event_id.to_string())
            .param("related_id", related_id.to_string());

        self.graph.run(query).await?;
        Ok(())
    }

    pub async fn query_relations(&self, event_id: Uuid) -> Result<Vec<Uuid>, neo4rs::Error> {
        let query = Query::new(
            "MATCH (e:Event {id: $event_id})-[r]->(related:Event) 
             RETURN related.id as id"
                .to_string(),
        )
        .param("event_id", event_id.to_string());

        let mut result = self.graph.execute(query).await?;
        let mut related_ids = Vec::new();

        while let Ok(Some(row)) = result.next().await {
            if let Ok(id_str) = row.get::<String>("id") {
                if let Ok(id) = Uuid::parse_str(&id_str) {
                    related_ids.push(id);
                }
            }
        }

        Ok(related_ids)
    }
}
