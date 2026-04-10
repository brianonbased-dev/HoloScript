# HoloScript LLM Service - Self-Contained Architecture

## 🎯 What You Just Got

A **complete standalone LLM service** that users can run locally with **zero external API dependencies**.

```
┌─────────────────────────────────────────────────────────────┐
│           HoloScript LLM Service (Port 8000)                 │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   LOGIN UI   │  │  BUILDER UI   │  │   GALLERY    │      │
│  │ login.html   │  │  index.html   │  │ Saved Builds │      │
│  └──────┬───────┘  └──────┬────────┘  └──────┬───────┘      │
│         │                  │                   │              │
│         └──────────────────┼───────────────────┘              │
│                            │                                  │
│                    ┌───────▼────────┐                        │
│                    │   Express.js    │                        │
│                    │   REST API      │                        │
│                    └───────┬────────┘                        │
│                            │                                  │
│  ┌─────────────────────────┼─────────────────────────────┐  │
│  │  /api/auth/login       /api/generate   /api/builds    │  │
│  │  /api/auth/logout      /api/models     /api/health    │  │
│  │  /api/auth/me                                         │  │
│  └─────────────────────────┼─────────────────────────────┘  │
│                            │                                  │
│        ┌───────────────────┼───────────────────┐             │
│        │                   │                   │             │
│   ┌────▼────┐      ┌───────▼──────┐   ┌──────▼─────┐       │
│   │ Storage │      │  OllamaService│   │  BuildService│       │
│   │ Service │      │   (Inference)│   │ (Generation) │       │
│   └────┬────┘      └───────┬──────┘   └──────┬──────┘       │
│        │                   │                   │             │
│        │            ┌──────▼──────┐            │             │
│        │            │   Ollama     │            │             │
│        │            │  (Local LLM) │            │             │
│        │            └──────┬──────┘            │             │
│        │                   │                   │             │
│   ┌────▼────────┐  ┌───────▼──────┐   ┌──────▼──────────┐  │
│   │.holoscript  │  │ Mistral, etc │   │ Generate Code   │  │
│   │ -llm/       │  │ (GPU/CPU)    │   │ Save Builds     │  │
│   │ ├─ builds/  │  └──────────────┘   │ Track History   │  │
│   │ └─ users/   │                     └─────────────────┘  │
│   └────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
                        Zero External APIs
                        All Data Local
                        Fully Self-Contained
```

---

## 📦 Service Structure

```
services/llm-service/
├── src/
│   ├── server.ts              # Main Express server
│   ├── services/
│   │   ├── StorageService.ts  # File-based persistence
│   │   ├── OllamaService.ts   # LLM inference
│   │   ├── AuthService.ts     # User authentication
│   │   └── BuildService.ts    # HoloScript generation
│   └── utils/
│       └── logger.ts          # Logging
├── public/
│   ├── login.html             # Login UI
│   └── index.html             # Builder UI (700 lines, zero framework)
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript config
├── .env.local.example         # Configuration template
├── README.md                  # Features & overview
└── QUICKSTART.md              # Installation guide
```

---

## 🔄 Workflow: User to Code

```
1. USER LOGS IN
   │
   ├─ POST /api/auth/login
   ├─ AuthService.authenticate()
   ├─ Generate session token
   └─ Return to builder

2. USER DESCRIBES BUILD
   │
   ├─ Type: "Create a red sphere that bounces"
   ├─ Click "Generate HoloScript"
   └─ Send to API

3. API PROCESSES REQUEST
   │
   ├─ POST /api/generate
   ├─ Verify auth token
   ├─ Call BuildService.generateFromPrompt()
   └─ Pass to LLM

4. LLM GENERATES CODE
   │
   ├─ OllamaService.generate()
   ├─ Connect to Ollama server (localhost:11434)
   ├─ Send system prompt + user description
   ├─ Model generates HoloScript code
   └─ Return response

5. DISPLAY & SAVE
   │
   ├─ Show code in editor
   ├─ Display line count and status
   ├─ User clicks "Save Build"
   ├─ POST /api/builds
   ├─ StorageService.saveBuild()
   ├─ Save to .holoscript-llm/builds/
   └─ ✓ Complete!
```

---

## 🎯 Self-Preservation Features (Built-in)

| Feature                | How It Works             | Data Location             |
| ---------------------- | ------------------------ | ------------------------- |
| **Build History**      | Every save auto-stored   | `.holoscript-llm/builds/` |
| **User Data**          | Local session management | `.holoscript-llm/users/`  |
| **Inference Learning** | Stats tracked per model  | In-memory + logs          |
| **Pattern Library**    | Common HoloScript saved  | Build descriptions        |
| **Offline Support**    | Works without internet   | 100% local-first          |

---

## 🚀 Quick Commands

```bash
# Installation (one-time)
cd services/llm-service
npm install
cp .env.local.example .env.local

# Start Ollama (required, separate terminal)
ollama serve

# Start LLM Service
npm run dev

# Open in browser
http://localhost:8000
```

---

## 🔐 Security & Privacy

✅ **No external API calls**  
✅ **No data leaves your machine**  
✅ **All storage is local JSON**  
✅ **Simple session management**  
✅ **Demo authentication (production: use JWT + bcrypt)**

---

## 📊 User Data Example

**Build file** (`.holoscript-llm/builds/abc123.json`):

```json
{
  "id": "abc123",
  "userId": "user",
  "name": "Spinning Cube",
  "code": "program demo {\n  shape cube { ... }",
  "description": "Create a red cube that rotates",
  "createdAt": "2026-01-15T10:30:00Z",
  "updatedAt": "2026-01-15T10:30:00Z"
}
```

---

## 🎨 User Interface

### Login Screen

- Username/password input
- Demo credentials pre-filled
- Service health check
- Professional dark theme

### Builder Screen

- **Left panel**: Describe what you want
- **Right panel**: Generated HoloScript code
- **Bottom**: All saved builds in a searchable list
- **Real-time stats**: Line count, status indicator
- **Buttons**: Generate, Save, Copy Code, Refresh

All in **pure HTML/CSS/JS** - no frameworks needed, ~1500 lines total.

---

## 📈 Extensibility

Easy to add:

- ✅ Different LLM providers (GPT, Claude, etc.)
- ✅ More authentication methods (OAuth, SAML)
- ✅ Database backend (Supabase, PostgreSQL)
- ✅ Team collaboration
- ✅ Version control
- ✅ Advanced code editor (Monaco, CodeMirror)
- ✅ Live preview
- ✅ Export to multiple formats

---

## ⚡ Performance Characteristics

| Operation             | Time   | Notes                 |
| --------------------- | ------ | --------------------- |
| Login                 | <100ms | In-memory             |
| Generate (first)      | 30-60s | Model loading         |
| Generate (subsequent) | 5-20s  | Depends on model size |
| Save build            | <100ms | Local file write      |
| List builds           | <50ms  | File read             |
| Copy code             | <10ms  | Browser clipboard     |

---

## 🎯 Why This Architecture?

1. **User-Friendly**: Simple login, intuitive interface
2. **Self-Contained**: No external APIs or subscriptions
3. **Locally Sovereign**: Data stays on user's machine
4. **Extensible**: Easy to add features/providers
5. **Low Resource**: Works on any machine with Node.js
6. **Self-Preserving**: Automatic build history & learning

---

## 🔄 Integration with Other Services

This service can integrate with:

- **@holoscript/core** - Execute generated code
- **@holoscript/cli** - CLI interface
- **@holoscript/infinityassistant** - AI building integration
- **Hololand** - Save to world/creator program

---

**Architecture**: Self-contained, offline-first, local-storage  
**Version**: 1.0.0-alpha.1  
**Status**: ✅ Ready for users to run locally  
**Philosophy**: Users own their data, AI runs locally
