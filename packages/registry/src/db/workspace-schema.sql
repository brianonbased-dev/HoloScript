-- =============================================================================
-- HoloScript Registry — Team Workspace Schema
-- =============================================================================
-- Compatible with: PostgreSQL 14+, Neon Serverless Postgres
-- Run order: this file must be applied after the base registry schema
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid(), pgp_sym_encrypt

-- =============================================================================
-- workspaces
-- =============================================================================
CREATE TABLE IF NOT EXISTS workspaces (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(64)  NOT NULL UNIQUE,
  display_name  VARCHAR(128) NOT NULL,
  description   TEXT,
  owner_id      UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  settings      JSONB        NOT NULL DEFAULT '{
    "visibility": "private",
    "formatter": {
      "tabWidth": 2,
      "useTabs": false,
      "printWidth": 100,
      "trailingComma": false
    },
    "linter": {
      "rules": {}
    },
    "packages": {}
  }',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspaces_owner_id  ON workspaces(owner_id);
CREATE INDEX idx_workspaces_name      ON workspaces(name);

-- =============================================================================
-- workspace_members
-- =============================================================================
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  role          VARCHAR(16) NOT NULL CHECK (role IN ('owner', 'admin', 'developer', 'viewer')),
  invited_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_user_id      ON workspace_members(user_id);
CREATE INDEX idx_workspace_members_workspace_id ON workspace_members(workspace_id);

-- =============================================================================
-- workspace_secrets  (values encrypted at rest with AES-256)
-- =============================================================================
CREATE TABLE IF NOT EXISTS workspace_secrets (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID         NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            VARCHAR(128) NOT NULL CHECK (name ~ '^[A-Z_][A-Z0-9_]*$'),
  encrypted_value BYTEA        NOT NULL,  -- pgp_sym_encrypt(value, key)
  created_by      UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ,

  UNIQUE (workspace_id, name)
);

CREATE INDEX idx_workspace_secrets_workspace_id ON workspace_secrets(workspace_id);

-- =============================================================================
-- workspace_activity
-- =============================================================================
CREATE TABLE IF NOT EXISTS workspace_activity (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID         NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID         REFERENCES users(id) ON DELETE SET NULL,
  action        VARCHAR(64)  NOT NULL,
  details       JSONB        NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspace_activity_workspace_id ON workspace_activity(workspace_id);
CREATE INDEX idx_workspace_activity_created_at   ON workspace_activity(created_at DESC);

-- =============================================================================
-- workspace_invitations  (pending email invites)
-- =============================================================================
CREATE TABLE IF NOT EXISTS workspace_invitations (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID         NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email         VARCHAR(320) NOT NULL,
  role          VARCHAR(16)  NOT NULL CHECK (role IN ('admin', 'developer', 'viewer')),
  token         VARCHAR(128) NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(48), 'hex'),
  invited_by    UUID         REFERENCES users(id) ON DELETE SET NULL,
  expires_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspace_invitations_workspace_id ON workspace_invitations(workspace_id);
CREATE INDEX idx_workspace_invitations_email        ON workspace_invitations(email);
CREATE INDEX idx_workspace_invitations_token        ON workspace_invitations(token);

-- =============================================================================
-- Helper: auto-update updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- Helper views
-- =============================================================================

-- workspace_members_with_users: join for member listings
CREATE OR REPLACE VIEW workspace_members_view AS
  SELECT
    wm.workspace_id,
    wm.role,
    wm.joined_at,
    u.id        AS user_id,
    u.username,
    u.email,
    u.display_name,
    u.avatar_url
  FROM workspace_members wm
  JOIN users u ON u.id = wm.user_id;

-- workspace_summary: quick stats per workspace
CREATE OR REPLACE VIEW workspace_summary AS
  SELECT
    w.id,
    w.name,
    w.display_name,
    w.owner_id,
    w.settings->>'visibility' AS visibility,
    w.created_at,
    COUNT(DISTINCT wm.user_id) AS member_count,
    COUNT(DISTINCT ws.id)      AS secret_count
  FROM workspaces w
  LEFT JOIN workspace_members wm ON wm.workspace_id = w.id
  LEFT JOIN workspace_secrets  ws ON ws.workspace_id = w.id
  GROUP BY w.id;

-- =============================================================================
-- Row-level security (enable with Supabase or managed Postgres)
-- =============================================================================

ALTER TABLE workspaces          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_secrets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_activity  ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;

-- Policy: members can view their own workspaces
CREATE POLICY workspaces_select ON workspaces
  FOR SELECT USING (
    id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = current_setting('app.user_id')::UUID
    )
  );

-- Policy: only owners/admins can modify workspace
CREATE POLICY workspaces_modify ON workspaces
  FOR ALL USING (
    id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = current_setting('app.user_id')::UUID
        AND role IN ('owner', 'admin')
    )
  );

-- Policy: members can view workspace_members for their workspaces
CREATE POLICY workspace_members_select ON workspace_members
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = current_setting('app.user_id')::UUID
    )
  );

-- Policy: only owners/admins can add/remove members
CREATE POLICY workspace_members_modify ON workspace_members
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = current_setting('app.user_id')::UUID
        AND role IN ('owner', 'admin')
    )
  );

-- Policy: members can view activity feed
CREATE POLICY workspace_activity_select ON workspace_activity
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = current_setting('app.user_id')::UUID
    )
  );

-- Policy: only owners/admins can manage secrets
CREATE POLICY workspace_secrets_select ON workspace_secrets
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = current_setting('app.user_id')::UUID
        AND role IN ('owner', 'admin', 'developer')
    )
  );

CREATE POLICY workspace_secrets_modify ON workspace_secrets
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = current_setting('app.user_id')::UUID
        AND role IN ('owner', 'admin')
    )
  );
