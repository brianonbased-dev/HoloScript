# HoloScript LLM Service

**Self-contained local LLM service for HoloScript generation**

A lightweight standalone service that users can run locally to build HoloScript programs using natural language. No external APIs required - everything runs on your machine.

## Quick Start

```bash
# 1. Start Ollama (if not running)
ollama serve

# 2. Pull a model (first time only)
ollama pull mistral

# 3. Start HoloScript LLM Service
npm run dev

# 4. Open http://localhost:8000
# Login with: user / password
# Start building!
```

## Features

- ✅ **Zero external APIs** - Everything runs locally
- ✅ **Simple login** - Basic user authentication
- ✅ **Natural language to HoloScript** - Describe what you want, get code
- ✅ **Live preview** - See your HoloScript code in real-time
- ✅ **Build history** - Save and manage your creations
- ✅ **Ollama integration** - Plug-and-play with local LLMs

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

**Pattern**: P.HOLOSCRIPT.LLM_SERVICE.01 - Sovereign local AI service
**Wisdom**: W.HOLOSCRIPT.LLM_SERVICE.01 - Users own their data, models run locally
