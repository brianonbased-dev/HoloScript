# HoloScript LLM Service ("Brittney Cloud")

**Multi-provider LLM inference gateway for HoloScript / Brittney — with an optional fully-local mode**

A lightweight service that powers Brittney chat and HoloScript code generation. It is a **provider-routing gateway**, not a model host: it streams from whichever inference provider you configure.

> **⚠️ Deployment reality — read before quoting "local" or "free":**
> - **Default / cloud (Railway):** routes to **external, paid GPU LLM clouds** — **Fireworks** (default, `BRITTNEY_PROVIDER=fireworks`) and **Together**, with the Pro tier (Kimi K2.5) served via Fireworks. These require API keys and bill per token. This is what `railway.toml` deploys ("Lightweight API gateway proxying to GPU inference (Fireworks/Together)").
> - **Optional / fully-local:** set `BRITTNEY_PROVIDER=ollama` (or run with no cloud keys and a reachable Ollama-compatible endpoint) to route through the **HoloLLama local path**. This path is genuinely local and private **only because you supply the machine and the downloaded model weights**; it is not weightless and not "free CPU inference."
>
> The routing logic is in [`src/services/InferenceRouter.ts`](src/services/InferenceRouter.ts). With no provider configured, the service returns: *"No inference provider available. Set FIREWORKS_API_KEY, TOGETHER_API_KEY, or start Ollama."*

## Quick Start (HoloLLama local compatibility mode)

This is the **opt-in local path**. For the default cloud path, set `FIREWORKS_API_KEY` (or `TOGETHER_API_KEY`) instead of running a local compatibility endpoint.

```bash
# 1. Start Ollama (if not running)
ollama serve

# 2. Pull a model (first time only)
ollama pull mistral

# 3. Route the service at your local Ollama
export BRITTNEY_PROVIDER=ollama   # otherwise it defaults to fireworks (cloud)

# 4. Start HoloScript LLM Service
npm run dev

# 5. Open http://localhost:8000
# Login with: user / password
# Start building!
```

## Features

- ✅ **Provider-flexible** - Routes to Fireworks/Together (cloud, default) or HoloLLama local compatibility serving (opt-in)
- ✅ **Optional fully-local mode** - With `BRITTNEY_PROVIDER=ollama` + your own model weights, no data leaves your machine
- ✅ **Simple login** - Basic user authentication
- ✅ **Natural language to HoloScript** - Describe what you want, get code
- ✅ **Live preview** - See your HoloScript code in real-time
- ✅ **Build history** - Save and manage your creations
- ✅ **HoloLLama local serving** - Plug-and-play with Ollama-compatible local LLM endpoints

## Architecture

```
HoloScript LLM Service (port 8000)
├── Frontend (Next.js App Router)
│   ├── /login - Simple login page
│   ├── /builder - Main HoloScript builder
│   ├── /gallery - Saved builds
│   └── /settings - Model/API config
├── Backend API (/api)
│   ├── /api/auth/* - Login/logout
│   ├── /api/generate - Generate HoloScript from prompt
│   ├── /api/builds/* - CRUD for builds
│   ├── /api/models/* - LLM model management
│   └── /api/llm/inference - Direct LLM calls
└── Storage
    └── .holoscript-llm/ - Local data (builds, history)
```

## Environment Setup

```bash
# .env.local
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=mistral
SESSION_SECRET=your-secret-key
```

## API Examples

### Generate HoloScript

```bash
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a red cube in the center of the screen that rotates",
    "context": "holoscript"
  }'
```

Response:

```json
{
  "success": true,
  "code": "program demo {\n  shape cube { ... }",
  "description": "Red rotating cube",
  "variables": { ... }
}
```

### Save a Build

```bash
curl -X POST http://localhost:8000/api/builds \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My First Scene",
    "code": "program demo { ... }",
    "description": "Created via AI"
  }'
```

## Development

### Invalidate persisted local auth state

When the local service is stopped, an operator can invalidate the three durable
auth, session, and rate-limit state classes without displaying their contents:

```bash
pnpm security:scrub-runtime -- --dry-run
pnpm security:scrub-runtime
```

The command targets only the canonical `services/.holoscript-llm` runtime root,
holds the same process lease as the service, refuses to run when a state-store
lock or configured-port listener is present, and emits a count-only JSON
receipt. Use `--port <number>` when the service uses a non-default port. It
never prints usernames, credential hashes, session tokens, rate-limit keys,
file names, or file hashes. Run it under the same operating-system identity as
the service so existing access metadata can be preserved. Replacement is
fail-secure: sessions are invalidated first, so an interrupted later step does
not leave an old session valid against a cleared user store.

This command invalidates persisted state; it does not rotate bootstrap, dev, or
static API-key values supplied by the environment. Rotate or unset those values
before restarting the service. A reset receipt is not evidence that external
credentials were rotated.

```bash
npm run dev        # Start dev server (port 8000)
npm run build      # Build for production
npm run start      # Start production server
npm run type-check # TypeScript validation
```

## Storage Format

Builds are stored as JSON in `.holoscript-llm/`:

```
.holoscript-llm/
├── builds/
│   ├── build_1705312345.json
│   ├── build_1705312450.json
│   └── ...
├── models/
│   └── models.json
└── sessions/
    └── session_xyz.json
```

## Self-Preservation Features (Built-in)

- **Build History** - Every creation is automatically saved
- **Learning** - Inference metrics tracked locally
- **Model Snapshots** - Can backup model configurations
- **Pattern Library** - Common HoloScript patterns stored

---

**Pattern**: P.HOLOSCRIPT.LLM_SERVICE.01 - Provider-routing inference gateway (cloud default, optional local)
**Wisdom**: W.HOLOSCRIPT.LLM_SERVICE.01 - Sovereignty is the *opt-in* Ollama path (user-supplied weights), not the default; the default routes to paid external GPU clouds
