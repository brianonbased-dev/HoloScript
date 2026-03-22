# Studio Integration Hub — Architecture & Implementation Guide

**Status:** Foundation Complete (4/5 connectors)
**Vision:** [research/2026-03-21_studio-integration-hub-vision-AUTONOMIZE.md](../research/2026-03-21_studio-integration-hub-vision-AUTONOMIZE.md)

## Overview

The Studio Integration Hub connects external developer services (GitHub, Railway, VSCode, App Store, Upstash) to enable deployment, testing, and collaboration workflows from a single viewport.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Studio Frontend (/integrations)                             │
│ ┌─────────────────────┐  ┌──────────────────────────────┐  │
│ │ ServiceConnectorPanel│  │ ImportRepoWizard             │  │
│ │ - 5 tabs (services) │  │ - GitHub OAuth flow          │  │
│ │ - Connection status │  │ - Repo browser               │  │
│ │ - Config forms      │  │ - Import + Absorb + Pipeline │  │
│ │ - Activity logs     │  └──────────────────────────────┘  │
│ └─────────────────────┘                                     │
│         ↓                           ↓                        │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ connectorStore (Zustand)                              │  │
│ │ - connect/disconnect/updateConfig                     │  │
│ │ - Activity log (max 50, SSE streaming)                │  │
│ │ - localStorage persistence (no credentials)           │  │
│ └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ API Routes                                                   │
│ - POST /api/connectors/connect   → ServiceConnector.connect │
│ - POST /api/connectors/disconnect → ServiceConnector.disconn│
│ - GET  /api/connectors/activity (SSE) → Real-time events    │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Connector Packages (@holoscript/connector-*)                │
│ ┌─────────────┐ ┌─────────────┐ ┌──────────────┐ ┌────────┐│
│ │ core (17T)  │ │ railway(19T)│ │ github (30T) │ │appstore││
│ │ - ServiceCon│ │ - 6 tools   │ │ - 12 tools   │ │- Dual  ││
│ │ - McpRegistr│ │ - Rate limit│ │ - Octokit    │ │  Apple ││
│ │ - Interfaces│ │ - Backoff   │ │ - OAuth ready│ │  Google││
│ └─────────────┘ └─────────────┘ └──────────────┘ └────────┘│
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ MCP Orchestrator (mcp-orchestrator-production-45f9.up.rai..│
│ - Server registry                                            │
│ - Tool discovery                                             │
│ - Cross-workspace federation                                 │
└─────────────────────────────────────────────────────────────┘
```

## Connector Packages

### ✅ @holoscript/connector-core
- **Status:** Complete, 17 tests pass
- **Location:** `packages/connector-core/`
- **Exports:**
  - `ServiceConnector` — Abstract base class
  - `McpRegistrar` — Auto-registration helper
  - `CredentialVault`, `DeploymentPipeline` — Interfaces

### ✅ @holoscript/connector-railway
- **Status:** Complete, 19 tests pass
- **Location:** `packages/connector-railway/`
- **Tools:** 6 MCP tools
  - `railway_project_create`, `railway_service_create`, `railway_deploy`
  - `railway_variable_set`, `railway_domain_add`, `railway_deployment_status`
- **Features:**
  - Rate limiting with exponential backoff (1s, 2s, 4s)
  - X-RateLimit-Remaining header monitoring
  - GraphQL API wrapper

### ✅ @holoscript/connector-github
- **Status:** Complete, 30 tests pass
- **Location:** `packages/connector-github/`
- **Tools:** 12 MCP tools
  - `github_repo_get`, `github_repo_list`, `github_repo_create`
  - `github_branches_list`
  - `github_pr_create`, `github_pr_list`, `github_pr_comment`
  - `github_issues_create`, `github_issues_list`
  - `github_actions_list`, `github_actions_trigger`
  - `github_content_read`, `github_gist_create`
- **Features:**
  - Uses @octokit/rest for GitHub REST API v3
  - OAuth token auth (GITHUB_TOKEN env var)
  - GitHub Actions workflow templates included

### ✅ @holoscript/connector-appstore
- **Status:** Exists, not yet committed
- **Location:** `packages/connector-appstore/`
- **Features:**
  - **Dual-platform:** Apple App Store Connect + Google Play Developer API
  - JWT auth for Apple, Service Account for Google
  - TestFlight management
  - Build upload automation
  - Metadata management

### ⚠️ @holoscript/connector-vscode
- **Status:** Not yet created
- **Priority:** 2 (next 2 weeks)
- **Features planned:**
  - MCP HttpServerDefinition for `mcp.holoscript.net`
  - Live preview panel in VSCode
  - Bidirectional sync (Studio ↔ VSCode)
  - Syntax highlighting for .holo/.hsplus

### ⚠️ @holoscript/connector-upstash
- **Status:** Not yet created
- **Priority:** 3 (weeks 5-8)
- **Features planned:**
  - Redis cache for compiled scenes
  - Vector DB for semantic search (extend semantic-search-hub)
  - QStash for scheduled deployments

## Studio Integration

### ServiceConnectorPanel Component
- **Location:** `packages/studio/src/components/integrations/ServiceConnectorPanel.tsx`
- **Features:**
  - 5-tab interface (GitHub, Railway, VSCode, App Store, Upstash)
  - Connection status indicators (green/yellow/red dots)
  - Service-specific config forms
  - Real-time activity logs
  - Connect/Disconnect buttons with confirmation

### Connector Store (Zustand)
- **Location:** `packages/studio/src/lib/stores/connectorStore.ts`
- **Features:**
  - Connection lifecycle management
  - Activity log (max 50 entries, SSE streaming)
  - localStorage persistence (excludes sensitive credentials)
  - Actions: `connect`, `disconnect`, `updateConfig`, `addActivity`
  - SSE lifecycle: `startActivityStream`, `stopActivityStream`

### Integration Page
- **URL:** `/integrations`
- **Location:** `packages/studio/src/app/integrations/page.tsx`
- **Features:**
  - Full-screen panel
  - Breadcrumb navigation
  - Auto-starts SSE activity stream on mount

## Implementation Status

### ✅ Completed (Today's Session)
1. Connector foundation (core, railway, github) — **66 tests, 100% pass**
2. ServiceConnectorPanel UI component
3. connectorStore with SSE streaming
4. /integrations page
5. absorbPipelineBridge integration

### 🚧 In Progress (Next Steps)
1. **API Routes** — `/api/connectors/connect`, `/api/connectors/disconnect`, `/api/connectors/activity`
2. **GitHub OAuth Device Flow** — Replace GITHUB_TOKEN with OAuth popup/device code
3. **ImportRepoWizard Integration** — Use connectorStore GitHub connection instead of separate auth
4. **Navigation Link** — Add `/integrations` to Studio home page

### 📋 Planned (Priority 2-3)
5. VSCode connector + extension
6. Upstash connector (Redis + Vector + QStash)
7. App Store connector (commit + test)
8. FirstRunWizard enhancement (5-minute onboarding)

## API Routes (To Implement)

### POST /api/connectors/connect
**Purpose:** Establish connection to a service connector

**Request:**
```json
{
  "serviceId": "github" | "railway" | "vscode" | "appstore" | "upstash",
  "credentials": {
    "token": "ghp_..." // GitHub
    // or
    "token": "railway-token", // Railway
    "project": "proj_holoscript"
  }
}
```

**Response:**
```json
{
  "success": true,
  "config": {
    "token": "********", // Masked
    "repo": "username/repository" // GitHub-specific
  }
}
```

**Implementation:**
```typescript
// packages/studio/src/app/api/connectors/connect/route.ts
import { GitHubConnector } from '@holoscript/connector-github';
import { RailwayConnector } from '@holoscript/connector-railway';

export async function POST(req: NextRequest) {
  const { serviceId, credentials } = await req.json();

  switch (serviceId) {
    case 'github': {
      process.env.GITHUB_TOKEN = credentials.token;
      const github = new GitHubConnector();
      await github.connect();
      const healthy = await github.health();
      if (!healthy) throw new Error('Health check failed');
      return NextResponse.json({ success: true, config: { ... } });
    }
    case 'railway': {
      // Similar pattern
    }
    // ...
  }
}
```

### POST /api/connectors/disconnect
**Purpose:** Disconnect from a service

**Request:**
```json
{
  "serviceId": "github"
}
```

**Response:**
```json
{
  "success": true
}
```

### GET /api/connectors/activity (SSE)
**Purpose:** Real-time activity stream for all connectors

**Response:** Server-Sent Events
```
data: {"serviceId":"railway","action":"Deployed to production","status":"success"}

data: {"serviceId":"github","action":"PR #42 merged","status":"success"}
```

## OAuth Flow (GitHub Example)

### Current: Personal Access Token
1. User generates PAT on GitHub
2. User pastes token in Studio config form
3. Token stored in connectorStore (not persisted)
4. Token used for all GitHub API calls

### Future: OAuth Device Flow
1. User clicks "Connect GitHub" in Studio
2. Studio calls `/api/connectors/oauth/github/start`
3. Backend generates device code
4. User visits GitHub auth URL, enters code
5. Studio polls `/api/connectors/oauth/github/poll`
6. On success, access token stored securely
7. Refresh token used for long-term access

## ImportRepoWizard Integration

### Current Flow
```
ImportRepoWizard
  ↓
useGitHubRepos hook (separate auth)
  ↓
/api/github/repos (custom endpoint)
  ↓
GitHub REST API
```

### Target Flow
```
ImportRepoWizard
  ↓
connectorStore (check if GitHub connected)
  ↓
If connected: useConnectorStore((s) => s.connections.github)
  ↓
/api/connectors/github/repos (uses GitHubConnector)
  ↓
GitHubConnector.executeTool('github_repo_list')
```

## Test Coverage

| Package | Tests | Status |
|---------|-------|--------|
| connector-core | 17 | ✅ 100% |
| connector-railway | 19 | ✅ 100% |
| connector-github | 30 | ✅ 100% |
| connector-appstore | ? | ⚠️ Not committed |
| **Total** | **66** | **✅ All pass** |

## Commits

1. `fcef65bb` — test: connector packages (36 tests)
2. `05696e55` — feat: ServiceConnectorPanel component
3. `4e5e7fa6` — feat: Zustand connector store with SSE
4. `49fbe3bf` — feat: GitHub connector (30 tests, Octokit)

## References

- **Vision Doc:** `research/2026-03-21_studio-integration-hub-vision-AUTONOMIZE.md`
- **Memory:** `.claude/projects/c--Users-josep--ai-ecosystem/memory/MEMORY.md` (W.164-W.171, P.STUDIO.01-04, G.STUDIO.01-08)
- **MCP Orchestrator:** `https://mcp-orchestrator-production-45f9.up.railway.app`
- **HoloScript MCP:** `https://mcp.holoscript.net`

## Next Session Tasks

1. Create `/api/connectors/connect` route with GitHub + Railway support
2. Create `/api/connectors/disconnect` route
3. Create `/api/connectors/activity` SSE stream
4. Update `ImportRepoWizard` to use `connectorStore` GitHub connection
5. Add OAuth device flow for GitHub
6. Add `/integrations` link to Studio home page navigation
7. Test end-to-end: Connect GitHub → Browse repos → Import → Absorb → Pipeline
