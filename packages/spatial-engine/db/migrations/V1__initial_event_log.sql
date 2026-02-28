-- Enable the cube extension for 3D spatial indexing
CREATE EXTENSION IF NOT EXISTS cube;
-- Enable pgvector plugin
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE events (
    event_id UUID PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    agent_id UUID NOT NULL,
    -- Spatial data (represented as 3D points using cube)
    location cube NOT NULL,
    entities UUID [] NOT NULL,
    -- Episodic data
    action VARCHAR(255) NOT NULL,
    observations JSONB NOT NULL,
    outcome JSONB NOT NULL,
    -- Semantic data (OpenAI ada-002 sized embeddings)
    embedding VECTOR(1536),
    salience FLOAT DEFAULT 0.5,
    -- Procedural data
    skill VARCHAR(255),
    parameters JSONB
);
-- Four core query interfaces as specified in the UI
CREATE INDEX idx_spatial ON events USING gist(location);
CREATE INDEX idx_temporal ON events (timestamp DESC);
CREATE INDEX idx_semantic ON events USING ivfflat(embedding vector_cosine_ops);
CREATE INDEX idx_skill ON events (skill, agent_id);