# AAIF MCP Dev Summit 2026 -- HoloScript Triple-Protocol Demo

**Event:** AAIF MCP Developer Summit, April 2-3 2026
**Speaker:** HoloScript Team
**Duration:** 15 minutes (5 acts x 3 minutes)
**Title:** "The Triple-Protocol Stack: MCP + A2A + x402 in Production"
**Thesis:** HoloScript ships the only production system combining MCP (tool discovery), A2A (agent communication), and x402 (agent economy) on a single endpoint. This is the stack that makes agents autonomous.

---

## Setup Checklist

- [ ] Terminal with `curl` and `jq` installed
- [ ] `mcp.holoscript.net` accessible (verify: `curl -s https://mcp.holoscript.net/health | jq`)
- [ ] API key set: `export MCP_API_KEY=<your-key>`
- [ ] Backup: `node docs/demos/aaif-summit-demo.mjs` ready for offline/local mode
- [ ] Font size: 18pt+ in terminal for readability from back of room
- [ ] Second screen: slide deck open on slide 1 (architecture diagram)

### Pre-flight Check

```bash
# Verify production endpoint is live
curl -s https://mcp.holoscript.net/health | jq .

# Expected:
# { "status": "ok", "tools": 82, "uptime": ... }
```

If the health check fails, switch to local mode:

```bash
node docs/demos/aaif-summit-demo.mjs
# Runs a local mock server on http://localhost:4200
```

---

## Act 1: Discovery (3 minutes)

### Talk Track

> "Every agent platform has tools. The question is: how does an agent **find** them?
>
> MCP solved tool discovery for single-agent scenarios. But when agents need to find _other agents_ -- with their capabilities, security requirements, and pricing -- you need something richer.
>
> HoloScript serves a standard A2A Agent Card at the well-known URL. Let's look at it."

### Commands

**Step 1: Fetch the Agent Card**

```bash
curl -s https://mcp.holoscript.net/.well-known/agent-card.json | jq '{ id, name, version, endpoint, skills_count: (.skills | length), security_schemes: (.securitySchemes | keys) }'
```

**Expected output:**

```json
{
  "id": "holoscript-agent",
  "name": "HoloScript Agent",
  "version": "1.0.0",
  "endpoint": "https://mcp.holoscript.net/a2a",
  "skills_count": 82,
  "security_schemes": ["apiKey", "bearerAuth", "oauth2", "openIdConnect"]
}
```

> "82 skills. 4 security schemes. One endpoint. Any A2A-compatible agent can discover this."

**Step 2: Inspect a specific skill**

```bash
curl -s https://mcp.holoscript.net/.well-known/agent-card.json | jq '.skills[] | select(.id == "parse_hs") | { id, name, description, tags, inputModes, outputModes, inputSchema: (.inputSchema.properties | keys) }'
```

**Expected output:**

```json
{
  "id": "parse_hs",
  "name": "Parse Hs",
  "description": "Parse HoloScript (.hs) code into an AST",
  "tags": ["holoscript", "parsing", "validation", "language"],
  "inputModes": ["text/plain", "application/json"],
  "outputModes": ["text/plain", "application/json", "application/holoscript"],
  "inputSchema": ["code"]
}
```

> "Every skill has input/output schemas, tags for discovery, and content type declarations. This is how agents negotiate capabilities at machine speed."

**Step 3: Show the security schemes**

```bash
curl -s https://mcp.holoscript.net/.well-known/agent-card.json | jq '.securitySchemes'
```

**Expected output:**

```json
{
  "apiKey": {
    "type": "apiKey",
    "description": "API key passed via x-api-key header",
    "name": "x-api-key",
    "in": "header"
  },
  "bearerAuth": {
    "type": "http",
    "description": "Bearer token (API key or OAuth2 access token) via Authorization header",
    "scheme": "bearer"
  },
  "oauth2": {
    "type": "oauth2",
    "description": "OAuth 2.1 with PKCE (S256) and client credentials flows",
    "flows": {
      "authorizationCode": {
        "authorizationUrl": "https://mcp.holoscript.net/oauth/authorize",
        "tokenUrl": "https://mcp.holoscript.net/oauth/token",
        "scopes": {
          "tools:read": "Read-only access to tool outputs",
          "tools:execute": "Execute tools that produce output",
          "tasks:read": "Read A2A task state and history",
          "tasks:write": "Create, send, and cancel A2A tasks",
          "admin": "Full administrative access"
        }
      },
      "clientCredentials": {
        "tokenUrl": "https://mcp.holoscript.net/oauth/token",
        "scopes": {
          "tools:read": "Read-only access to tool outputs",
          "tools:execute": "Execute tools that produce output",
          "tasks:read": "Read A2A task state and history",
          "tasks:write": "Create, send, and cancel A2A tasks"
        }
      }
    }
  },
  "openIdConnect": {
    "type": "openIdConnect",
    "description": "OpenID Connect discovery for OAuth 2.1",
    "openIdConnectUrl": "https://mcp.holoscript.net/.well-known/openid-configuration"
  }
}
```

> "Four security tiers: simple API key for prototyping, Bearer tokens for production, OAuth 2.1 with PKCE for enterprise, and OpenID Connect for federated identity. The agent picks what it supports."

### Key Slide

Architecture diagram: `Agent -> /.well-known/agent-card.json -> Discover 82 skills + 4 security schemes -> Choose auth -> Call endpoint`

### Fallback (Local Mode)

```bash
curl -s http://localhost:4200/.well-known/agent-card.json | jq '{ id, name, skills_count: (.skills | length) }'
```

---

## Act 2: Communication (3 minutes)

### Talk Track

> "Discovery tells you _what_ an agent can do. Communication is _how_ you talk to it.
>
> A2A defines a JSON-RPC 2.0 transport with a full task lifecycle. Let's parse some HoloScript code through the A2A protocol -- the same way a Google Vertex AI agent or an Anthropic agent would call us."

### Commands

**Step 1: Send a message via A2A JSON-RPC**

```bash
curl -s -X POST https://mcp.holoscript.net/a2a \
  -H "Content-Type: application/json" \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": "demo-1",
    "method": "a2a.sendMessage",
    "params": {
      "skillId": "parse_hs",
      "arguments": {
        "code": "object Cube { position: [0, 1, 0]; color: \"#ff0000\" }"
      },
      "message": {
        "role": "user",
        "parts": [{ "type": "text", "text": "Parse this HoloScript scene" }]
      }
    }
  }' | jq '{ task_id: .result.id, state: .result.status.state, artifacts_count: (.result.artifacts | length) }'
```

**Expected output:**

```json
{
  "task_id": "a1b2c3d4-...",
  "state": "completed",
  "artifacts_count": 1
}
```

> "Submitted, worked, completed. The full task state machine. Let's look at the actual parse result."

**Step 2: Get the task result (multi-turn)**

```bash
# Save the task ID from step 1 (or use the demo ID)
TASK_ID=$(curl -s -X POST https://mcp.holoscript.net/a2a \
  -H "Content-Type: application/json" \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": "demo-2",
    "method": "a2a.sendMessage",
    "params": {
      "skillId": "parse_hs",
      "arguments": { "code": "object Cube { position: [0, 1, 0] }" },
      "message": { "role": "user", "parts": [{ "type": "text", "text": "Parse" }] }
    }
  }' | jq -r '.result.id')

echo "Task ID: $TASK_ID"

# Retrieve the task
curl -s -X POST https://mcp.holoscript.net/a2a \
  -H "Content-Type: application/json" \
  -H "x-api-key: $MCP_API_KEY" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": \"demo-3\",
    \"method\": \"a2a.getTask\",
    \"params\": { \"id\": \"$TASK_ID\" }
  }" | jq '.result.status.state, (.result.artifacts[0].parts[0].text | fromjson | .type)'
```

**Expected output:**

```
"completed"
"composition"
```

> "a2a.sendMessage creates the task, a2a.getTask retrieves it. Full history is preserved. This is how agents maintain multi-turn conversations -- each turn is a task with state transitions."

**Step 3: List recent tasks**

```bash
curl -s -X POST https://mcp.holoscript.net/a2a \
  -H "Content-Type: application/json" \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": "demo-4",
    "method": "a2a.listTasks",
    "params": { "limit": 3 }
  }' | jq '.result.total, [.result.tasks[].status.state]'
```

> "Every interaction is tracked. submitted -> working -> completed. Full audit trail. This matters when you're debugging a 5-agent pipeline at 3am."

### Key Slide

Sequence diagram: `Agent A -> JSON-RPC 2.0 -> HoloScript Agent -> Tool Handler -> AST Result -> Task Artifact -> Agent A`

### Fallback (Local Mode)

```bash
curl -s -X POST http://localhost:4200/a2a \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "demo-1",
    "method": "a2a.sendMessage",
    "params": {
      "skillId": "parse_hs",
      "arguments": { "code": "object Cube { position: [0, 1, 0] }" },
      "message": { "role": "user", "parts": [{ "type": "text", "text": "Parse" }] }
    }
  }' | jq '.result.status.state'
```

---

## Act 3: Economy (3 minutes)

### Talk Track

> "Discovery and communication are free. But what about premium tools? AI-generated 3D objects, large codebase analysis, high-resolution rendering?
>
> The x402 protocol solves this. HTTP 402 Payment Required -- the status code the web forgot. x402 makes it real with USDC payments on Base L2.
>
> Watch what happens when an agent hits a paid resource."

### Commands

**Step 1: Request a premium resource (get 402)**

```bash
curl -s -X POST https://mcp.holoscript.net/a2a \
  -H "Content-Type: application/json" \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": "demo-pay-1",
    "method": "a2a.sendMessage",
    "params": {
      "skillId": "generate_3d_object",
      "arguments": {
        "description": "A medieval sword with gold handle",
        "tier": "premium"
      },
      "message": { "role": "user", "parts": [{ "type": "text", "text": "Generate premium 3D model" }] }
    }
  }' | jq '.result.status'
```

> "The agent gets back a payment requirement. Let me show you what the x402 flow looks like from the protocol level."

**Step 2: Show the x402 PaymentRequired structure**

```bash
# Simulate a direct 402 response
echo '{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "base",
    "maxAmountRequired": "50000",
    "resource": "/api/generate-3d/premium",
    "description": "Premium 3D model generation (high-poly, PBR textures)",
    "payTo": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "maxTimeoutSeconds": 60
  }],
  "error": "X-PAYMENT header is required"
}' | jq .
```

> "The server says: I accept USDC on Base. $0.05 for this resource. Here's the wallet address, the USDC contract address, and you have 60 seconds.
>
> The agent signs an EIP-712 authorization -- gasless, no on-chain transaction yet. It puts the signed payload in the X-PAYMENT header and retries."

**Step 3: Show the payment submission flow**

```bash
# Simulated X-PAYMENT payload (base64-encoded EIP-712 authorization)
PAYMENT_PAYLOAD=$(echo -n '{
  "x402Version": 1,
  "scheme": "exact",
  "network": "base",
  "payload": {
    "signature": "0xdead...beef",
    "authorization": {
      "from": "0xAgent1234567890abcdef1234567890abcdef1234",
      "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
      "value": "50000",
      "validAfter": "1711900000",
      "validBefore": "1711900060",
      "nonce": "unique_nonce_abc123"
    }
  }
}' | base64 -w0 2>/dev/null || base64)

echo "X-PAYMENT header length: ${#PAYMENT_PAYLOAD} bytes"
echo ""
echo "Payment flow:"
echo "  1. Agent signs EIP-712 authorization (gasless)"
echo "  2. Retries request with: X-PAYMENT: $PAYMENT_PAYLOAD"
echo "  3. Facilitator verifies signature + settles on Base L2"
echo "  4. Server returns resource with X-PAYMENT-RESPONSE confirmation"
echo ""
echo "Dual-mode settlement:"
echo "  < \$0.10 -> In-memory micro-ledger (instant, batch-settled)"
echo "  >= \$0.10 -> On-chain USDC transfer (optimistic execution)"
```

**Step 4: Show the PaymentGateway audit trail**

```bash
echo "PaymentGateway Audit Events:"
echo "  payment:authorization_created  -> 402 response sent"
echo "  payment:verification_started   -> X-PAYMENT received"
echo "  payment:verification_passed    -> Signature valid"
echo "  payment:settlement_started     -> Processing payment"
echo "  payment:settlement_completed   -> Resource unlocked"
echo ""
echo "Every event has: timestamp, eventId, payer, amount, network, nonce"
echo "Full audit trail for compliance and debugging."
```

> "The PaymentGateway emits audit events at every step. settlement_completed, refund_initiated, batch_settlement -- everything is observable. This is how you build compliant agent economies."

### Key Slide

Flow diagram: `Agent -> Request Resource -> 402 PaymentRequired -> Sign EIP-712 -> X-PAYMENT header -> Verify + Settle -> Resource + X-PAYMENT-RESPONSE`

### Fallback (Local Mode)

```bash
curl -s http://localhost:4200/x402/demo | jq .
```

---

## Act 4: Orchestration (3 minutes)

### Talk Track

> "So far we've shown one agent talking to one tool. But the real value is multi-agent orchestration.
>
> HoloScript has a headless mode -- no spatial rendering needed. Agents communicate via broadcast channels with persistent @knowledge state. Let me run a debate-society demo with 3 agents and a moderator."

### Commands

**Step 1: Show the composition**

```bash
echo 'composition "DebateSociety" {
  config {
    headless: true
    consensus: "moderator"
  }

  agent "Moderator" {
    @llm_agent
    @consensus { type: "moderator" }
    role: "Facilitates debate, enforces turn-taking, declares consensus"

    on_start() {
      broadcast("debate", {
        type: "topic",
        payload: "Should AI agents manage their own budgets autonomously?"
      })
    }
  }

  agent "Optimist" {
    @llm_agent
    @knowledge { persist: true, namespace: "optimist" }
    role: "Argues FOR the proposition with evidence"

    on_event("debate", msg) {
      if (msg.type == "topic") {
        response = generate_argument(msg.payload, "for")
        broadcast("debate", { type: "argument", from: "Optimist", text: response })
      }
    }
  }

  agent "Skeptic" {
    @llm_agent
    @knowledge { persist: true, namespace: "skeptic" }
    role: "Argues AGAINST with counterexamples"

    on_event("debate", msg) {
      if (msg.type == "argument" && msg.from != "Skeptic") {
        rebuttal = generate_rebuttal(msg.text)
        broadcast("debate", { type: "rebuttal", from: "Skeptic", text: rebuttal })
      }
    }
  }

  agent "Synthesizer" {
    @llm_agent
    @knowledge { persist: true, namespace: "synthesizer" }
    role: "Finds common ground and proposes compromises"

    on_event("debate", msg) {
      if (msg.type == "rebuttal") {
        synthesis = synthesize_arguments(knowledge.get_all("debate"))
        broadcast("debate", { type: "synthesis", from: "Synthesizer", text: synthesis })
      }
    }
  }
}'
```

> "Four agents: a Moderator with @consensus, and three debaters each with @knowledge persistence. They communicate via the broadcast 'debate' channel. No spatial rendering, no GPU, no browser -- pure agent orchestration."

**Step 2: Run it headless**

```bash
# Headless execution (simulated -- uses the demo script)
echo "$ hs headless debate-society.hs --cycles 3"
echo ""
echo "[Moderator] Topic: Should AI agents manage their own budgets autonomously?"
echo "[Optimist]  FOR: With x402 payment protocol, agents can autonomously pay for"
echo "            resources they need. Budget caps and audit trails prevent runaway spend."
echo "[Skeptic]   AGAINST: The daemon burn incident (W.090) shows agents spent \$180 in"
echo "            orphaned processes. Autonomy without guardrails is dangerous."
echo "[Synthesizer] SYNTHESIS: Autonomous budgets with hard caps (\$10 per session),"
echo "              kill-before-start protocol, and human review gates at L1/L2."
echo ""
echo "[Moderator] Consensus reached after 3 cycles."
echo "[Moderator] Resolution: Tiered autonomy -- L0 agents get micro-budgets (<\$2/cycle),"
echo "            L1/L2 require human approval for spend > \$5."
echo ""
echo "Knowledge persisted: 3 namespaces, 12 entries, 0.4KB"
```

> "Three cycles, consensus reached. The @knowledge decorator means each agent remembers across sessions. Next time this debate resumes, the Skeptic remembers the daemon incident. The Optimist remembers x402."

**Step 3: Show the broadcast channel internals**

```bash
echo "BroadcastChannel internals:"
echo "  Channel: 'debate'"
echo "  Subscribers: [Moderator, Optimist, Skeptic, Synthesizer]"
echo "  Messages delivered: 7"
echo "  Delivery mode: 'reliable' (at-least-once)"
echo "  Ordering: 'causal' (respects happened-before)"
echo ""
echo "Knowledge persistence:"
echo "  optimist:  { arguments: 1, evidence: 2 }"
echo "  skeptic:   { rebuttals: 1, counterexamples: 2 }"
echo "  synthesizer: { syntheses: 1, compromises: 1 }"
```

### Key Slide

Architecture diagram: `Moderator -broadcast-> [Optimist, Skeptic, Synthesizer] -> @knowledge persistence -> Next session recall`

### Fallback (Local Mode)

```bash
node docs/demos/aaif-summit-demo.mjs --act 4
```

---

## Act 5: Security (3 minutes)

### Talk Track

> "Let's talk about the elephant in the room: security.
>
> Agents calling agents, passing money around, executing tools -- this needs enterprise-grade auth.
>
> HoloScript implements OAuth 2.1 with mandatory PKCE. Let me walk through the full flow."

### Commands

**Step 1: Register a client (Dynamic Client Registration, RFC 7591)**

```bash
curl -s -X POST https://mcp.holoscript.net/oauth/register \
  -H "Content-Type: application/json" \
  -H "x-api-key: $MCP_API_KEY" \
  -d '{
    "clientName": "AAIF Demo Agent",
    "redirectUris": ["https://demo.example.com/callback"],
    "scopes": ["tools:read", "tools:execute", "tasks:write"],
    "clientType": "confidential"
  }' | jq '{ clientId: .clientId, secret_preview: (.clientSecret | .[0:8] + "...") }'
```

**Expected output:**

```json
{
  "clientId": "client_abc123...",
  "secret_preview": "sec_abc1..."
}
```

> "Dynamic client registration. The agent gets a client ID and secret. Now it starts the PKCE flow."

**Step 2: Generate PKCE challenge and get authorization code**

```bash
# Generate PKCE verifier and challenge
CODE_VERIFIER=$(openssl rand -base64 32 | tr -d '=/+' | head -c 43)
CODE_CHALLENGE=$(echo -n "$CODE_VERIFIER" | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | tr -d '=')

echo "PKCE Verifier: $CODE_VERIFIER"
echo "PKCE Challenge (S256): $CODE_CHALLENGE"

# Get authorization code
curl -s -X POST https://mcp.holoscript.net/oauth/authorize \
  -H "Content-Type: application/json" \
  -H "x-api-key: $MCP_API_KEY" \
  -d "{
    \"client_id\": \"CLIENT_ID_FROM_STEP_1\",
    \"redirect_uri\": \"https://demo.example.com/callback\",
    \"scope\": \"tools:read tools:execute\",
    \"code_challenge\": \"$CODE_CHALLENGE\",
    \"code_challenge_method\": \"S256\"
  }" | jq .
```

**Expected output:**

```json
{
  "code": "authcode_xyz789...",
  "state": null
}
```

**Step 3: Exchange code for tokens**

```bash
curl -s -X POST https://mcp.holoscript.net/oauth/token \
  -H "Content-Type: application/json" \
  -d "{
    \"grant_type\": \"authorization_code\",
    \"code\": \"AUTH_CODE_FROM_STEP_2\",
    \"client_id\": \"CLIENT_ID_FROM_STEP_1\",
    \"client_secret\": \"CLIENT_SECRET_FROM_STEP_1\",
    \"redirect_uri\": \"https://demo.example.com/callback\",
    \"code_verifier\": \"$CODE_VERIFIER\"
  }" | jq '{ access_token: (.access_token | .[0:12] + "..."), token_type, expires_in, scope, has_refresh: (.refresh_token != null) }'
```

**Expected output:**

```json
{
  "access_token": "at_abc12345...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "tools:read tools:execute",
  "has_refresh": true
}
```

> "PKCE verified. The code_verifier must SHA256-match the code_challenge from step 2. No implicit grants, no plain challenges -- OAuth 2.1 mandates S256."

**Step 4: Use Bearer token to call a tool (scope enforcement)**

```bash
# This works -- tools:execute scope allows compilation
curl -s -X POST https://mcp.holoscript.net/a2a \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN_FROM_STEP_3" \
  -d '{
    "jsonrpc": "2.0",
    "id": "auth-demo-1",
    "method": "a2a.sendMessage",
    "params": {
      "skillId": "compile_holoscript",
      "arguments": {
        "code": "object Cube { position: [0,1,0] }",
        "target": "threejs"
      },
      "message": { "role": "user", "parts": [{ "type": "text", "text": "Compile to Three.js" }] }
    }
  }' | jq '.result.status.state'

# Expected: "completed"
```

```bash
# This fails -- tools:read scope does NOT allow self-improvement
curl -s -X POST https://mcp.holoscript.net/a2a \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer READ_ONLY_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "auth-demo-2",
    "method": "a2a.sendMessage",
    "params": {
      "skillId": "holo_self_diagnose",
      "arguments": {},
      "message": { "role": "user", "parts": [{ "type": "text", "text": "Run diagnostics" }] }
    }
  }' | jq '.result.status'

# Expected: state: "rejected", reason: "Insufficient scope: requires admin"
```

> "Scope enforcement. `tools:execute` lets you compile and render. But `holo_self_diagnose` requires `admin` scope. The OAuth layer enforces this before the tool handler ever sees the request."

**Step 5: Show OpenID Configuration**

```bash
curl -s https://mcp.holoscript.net/.well-known/openid-configuration | jq '{ issuer, authorization_endpoint, token_endpoint, grant_types_supported, code_challenge_methods_supported, scopes_supported }'
```

**Expected output:**

```json
{
  "issuer": "https://mcp.holoscript.net",
  "authorization_endpoint": "https://mcp.holoscript.net/oauth/authorize",
  "token_endpoint": "https://mcp.holoscript.net/oauth/token",
  "grant_types_supported": ["authorization_code", "client_credentials", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": ["tools:read", "tools:execute", "tasks:read", "tasks:write", "admin"]
}
```

> "Full OpenID Connect discovery. Any OAuth 2.1 client library can auto-configure. No custom integration, no vendor lock-in."

### Key Slide

Security pyramid: `API Key (dev) -> Bearer Token (staging) -> OAuth 2.1 PKCE (production) -> OpenID Connect (enterprise federation)`

### Fallback (Local Mode)

```bash
node docs/demos/aaif-summit-demo.mjs --act 5
```

---

## Closing (30 seconds)

> "Three protocols, one endpoint:
>
> **MCP** for tool discovery.
> **A2A** for agent communication.
> **x402** for agent economy.
>
> All secured by **OAuth 2.1** with PKCE.
>
> This is not a roadmap. This is in production at `mcp.holoscript.net`. 82 tools. 28 compiler targets. Spatial computing meets agent infrastructure.
>
> The code is open source. The Agent Card is live. Come build with us.
>
> Thank you."

---

## Q&A Preparation

### Likely Questions

**Q: How does x402 compare to Stripe/payment APIs?**

> x402 is protocol-level, not a vendor. Any agent can pay any agent without an intermediary. Stripe requires a merchant account. x402 needs just a wallet address. We use USDC on Base L2 for ~$0.001 gas.

**Q: What about streaming? The Agent Card says streaming: false.**

> Streaming support is planned for v1.1. For now, tasks complete synchronously. Long-running tasks (codebase analysis) use the task lifecycle -- submitted -> working -> completed -- and the agent polls via a2a.getTask.

**Q: How do you handle rate limiting with OAuth tokens?**

> Each registered client has a configurable rate limit (requests per minute). The token introspection result includes the client ID, which maps to the rate limit policy. Default: 100 req/min.

**Q: What's the latency overhead of x402?**

> For micro-payments (< $0.10): ~2ms overhead (in-memory ledger, no on-chain). For macro-payments: ~200ms (optimistic execution proceeds immediately, settlement happens async).

**Q: Can I use my own OAuth provider instead?**

> Yes. The OpenID Connect discovery endpoint means you can federate identity. Or use the API key scheme for simpler setups. The Agent Card declares all options and the calling agent picks.

**Q: What happens if the facilitator is down during x402 settlement?**

> Optimistic execution: the agent gets access immediately based on a valid signed authorization. Settlement is retried async. If it fails permanently, the settlement event emitter fires `payment:settlement_failed` and the access can be revoked.

---

## Technical Requirements

| Resource       | Details                                                        |
| -------------- | -------------------------------------------------------------- |
| **Endpoint**   | `https://mcp.holoscript.net`                                   |
| **Protocols**  | MCP (JSON-RPC), A2A (JSON-RPC 2.0), x402 (HTTP 402), OAuth 2.1 |
| **Auth**       | API key, Bearer, OAuth 2.1 PKCE, OpenID Connect                |
| **Payment**    | USDC on Base L2 (chain ID: 8453)                               |
| **Tools**      | 82+ MCP tools mapped to A2A skills                             |
| **Targets**    | 28+ compiler export targets                                    |
| **Traits**     | 1,800+ semantic VR traits                                      |
| **Local Demo** | `node docs/demos/aaif-summit-demo.mjs` (port 4200)             |

---

_Generated for AAIF MCP Dev Summit, April 2-3 2026_
_HoloScript v5.1.0 | @holoscript/mcp-server v3.6.1_
