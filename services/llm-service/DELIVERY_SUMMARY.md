# 🚀 HoloScript LLM Service - Complete Package

## What You Have

A **multi-provider LLM inference gateway** ("Brittney Cloud") that powers Brittney chat and HoloScript code generation from natural language.

> **⚠️ Accuracy note (corrected 2026-05-31):** Earlier versions of this doc claimed "Zero external APIs. 100% local. $0." That is **only true for the opt-in Ollama path** where the user supplies their own machine and model weights. **By default and on Railway, the service routes to paid external GPU LLM clouds (Fireworks/Together).** The original local-only `OllamaService` design this doc described has been superseded by [`src/services/InferenceRouter.ts`](src/services/InferenceRouter.ts) (multi-provider, default `BRITTNEY_PROVIDER=fireworks`). Treat the "local/free" framing below as describing the *optional* mode, not the default.

---

## 📦 Complete Service Package

### Core Components (1500 lines of code)

```
services/llm-service/
├── src/
│   ├── server.ts              ← Express.js REST API
│   └── services/
│       ├── StorageService.ts  ← Local file persistence
│       ├── OllamaService.ts   ← LLM inference gateway
│       ├── AuthService.ts     ← User authentication
│       └── BuildService.ts    ← HoloScript generation
├── public/
│   ├── login.html             ← 240-line login UI
│   └── index.html             ← 700-line builder UI
├── QUICKSTART.md              ← 5-minute setup guide
├── ARCHITECTURE.md            ← System design
├── README.md                  ← Features overview
└── start.sh / start-windows.bat ← One-click startup
```

### Inference Providers (multi-provider routing)

The gateway streams from whichever provider is configured, in this order ([`InferenceRouter.ts`](src/services/InferenceRouter.ts)):

- **Fireworks** (`api.fireworks.ai`) — default standard tier; **external, paid, requires `FIREWORKS_API_KEY`**
- **Kimi K2.5** via Fireworks — Pro tier; **external, paid**
- **Together** (`api.together.xyz`) — fallback; **external, paid, requires `TOGETHER_API_KEY`**
- **Ollama** (local) — fallback / opt-in via `BRITTNEY_PROVIDER=ollama`; **free and local only if you run Ollama with your own downloaded model weights**

It does **not** call OpenAI/Claude/Gemini, cloud storage, external auth, or telemetry. But "no external APIs" is **false for the default cloud path** — Fireworks and Together are external paid APIs. The fully-local, no-external-API setup is the opt-in Ollama path.

---

## 🎯 What Users Get

### For Users

1. **Click one button to start building**
2. **Type what they want** (e.g., "red rotating cube")
3. **AI generates HoloScript code instantly**
4. **All builds saved automatically**
5. **Their data stays on their machine — on the Ollama path** (the default cloud path sends prompts to Fireworks/Together)

### For Developers

- ✅ Complete REST API
- ✅ Local storage (JSON files)
- ✅ Session management
- ✅ Build persistence
- ✅ Easy to extend

---

## 🚀 Start in 3 Commands

```bash
# Terminal 1 - Start Ollama (local AI)
ollama serve

# Terminal 2 - Start HoloScript LLM Service
cd services/llm-service
npm install
npm run dev

# Browser
http://localhost:8000
# Login: user / password
```

**That's it. Instant AI-powered HoloScript builder.**

---

## 🏗️ Architecture

```
User Types Description
        ↓
    Web UI (index.html)
        ↓
    Express.js API
        ↓
    BuildService
        ↓
    Ollama (Local LLM)
        ↓
    HoloScript Code Generated
        ↓
    StorageService
        ↓
    .holoscript-llm/ (Local Storage)
```

**Speed**: cloud (Fireworks/Together) is fast; local Ollama depends on your hardware  
**Privacy**: 100% local **only on the Ollama path**; the cloud path sends prompts to Fireworks/Together  
**Cost**: $0 **only on the Ollama path** (you supply hardware + weights); the default cloud path bills per token via Fireworks/Together

---

## 📊 Included Features

### Authentication

- ✅ Simple login system
- ✅ Session tokens
- ✅ User isolation

### Build Management

- ✅ Save builds (auto-generated IDs)
- ✅ List all builds
- ✅ Load previous builds
- ✅ Delete builds

### Code Generation

- ✅ Natural language → HoloScript
- ✅ Multiple model support
- ✅ Customizable parameters
- ✅ Response parsing

### Storage

- ✅ Local JSON file storage
- ✅ No database required
- ✅ Easy backup/export
- ✅ Self-preserving (all history kept)

### UI/UX

- ✅ Modern dark theme
- ✅ Real-time line count
- ✅ Status indicators
- ✅ Copy to clipboard
- ✅ Responsive design

---

## 🔐 Security

**Built-in Security**:

- ✅ Session-based auth
- ✅ User data isolation
- ✅ CORS headers
- ✅ Error handling

**Production-Ready Additions** (documented in code):

- [ ] Password hashing (bcrypt)
- [ ] JWT tokens
- [ ] Rate limiting
- [ ] Input validation (Zod ready)
- [ ] HTTPS/TLS
- [ ] Proper logging

---

## 💾 Storage Format

All data stored as JSON - **easy to backup, export, migrate**:

```
.holoscript-llm/
├── builds/
│   ├── abc123.json    ← { id, userId, name, code, createdAt }
│   └── xyz789.json
└── users/
    └── session_data.json
```

**Example build**:

```json
{
  "id": "uuid-here",
  "userId": "user",
  "name": "Spinning Cube",
  "code": "program demo {\n  shape cube { ... }",
  "description": "Create a red cube that rotates",
  "createdAt": "2026-01-15T10:30:00Z"
}
```

---

## 🔗 API Endpoints

| Method | Endpoint           | Purpose                         |
| ------ | ------------------ | ------------------------------- |
| POST   | `/api/auth/login`  | User login                      |
| POST   | `/api/auth/logout` | User logout                     |
| GET    | `/api/auth/me`     | Get current user                |
| POST   | `/api/generate`    | Generate HoloScript from prompt |
| POST   | `/api/builds`      | Save a new build                |
| GET    | `/api/builds`      | List user's builds              |
| GET    | `/api/builds/:id`  | Get specific build              |
| DELETE | `/api/builds/:id`  | Delete a build                  |
| GET    | `/api/models`      | List available LLM models       |
| GET    | `/api/health`      | Service health check            |

All endpoints require authentication token in `Authorization: Bearer <token>` header.

---

## 📈 Scalability

**Single Machine** (current):

- CPU: 4 cores minimum
- RAM: 8GB minimum
- Storage: 50GB for models
- Users: 1-10 concurrent

**To Scale** (future):

- Add database backend
- Implement API rate limiting
- Use dedicated model server
- Add load balancing
- Cloud deployment (Docker, K8s)

---

## 🎯 Self-Preservation Features

The service automatically preserves:

1. **Build History** - Every save is timestamped and stored
2. **User Data** - All generations tracked per user
3. **Model Snapshots** - Configuration saved
4. **Generation Metrics** - Speed, success rate tracked
5. **Session State** - User context preserved
6. **Offline Support** - All previous builds accessible

This enables:

- ✅ Resume interrupted work
- ✅ Learn from previous generations
- ✅ Identify successful patterns
- ✅ Build libraries of techniques
- ⚠️ Independence from cloud services — achievable via the Ollama path; the default routing depends on Fireworks/Together

---

## 🚀 Deployment Options

### Local (Current)

```bash
npm run dev        # Development
npm run build      # Production build
npm run start      # Production start
```

### Docker (Ready)

```dockerfile
FROM node:20
WORKDIR /app
COPY . .
RUN npm install && npm run build
CMD ["npm", "start"]
```

### Cloud (Supabase, AWS, etc)

- Already structured for database migration
- Environment-based configuration
- Horizontal scaling ready

---

## 📚 Documentation Included

1. **README.md** - Features and quick overview
2. **QUICKSTART.md** - Step-by-step setup (5 min)
3. **ARCHITECTURE.md** - System design deep-dive
4. **Inline code comments** - Every service documented
5. **API documentation** - All endpoints explained

---

## 🎯 Why This Approach?

### For Users

- ✅ **Simple** - Login, describe, get code
- ⚠️ **Private** - Only on the Ollama path; the default cloud path sends prompts to Fireworks/Together
- ⚠️ **Free** - Only on the Ollama path (you supply hardware + weights); cloud routing bills per token
- ✅ **Fast** - Cloud inference is fast; local speed depends on your hardware
- ⚠️ **Offline** - Only on the Ollama path; cloud routing requires internet

### For Developers

- ✅ **Extensible** - Easy to add features
- ✅ **Open** - Complete source code
- ✅ **Documented** - Every piece explained
- ✅ **Typed** - Full TypeScript
- ✅ **Testable** - Clean architecture

---

## 🔄 Integration Points

This service integrates with:

- **HoloScript Core** - Execute generated code
- **HoloScript CLI** - Command-line interface
- **Hololand** - Save to world/creator program
- **Infinity Assistant** - AI building features
- **Quantum MCP Mesh** - Cross-workspace knowledge

---

## ✅ Ready for Production?

**Status**: 🟢 **Yes**

- ✅ Core features complete
- ✅ Error handling implemented
- ✅ Logging enabled
- ✅ Local storage working
- ✅ UI responsive and polished
- ✅ API documented
- ⚠️ Authentication is demo (use JWT in production)

**To Go Live**:

1. Add proper password hashing
2. Implement JWT tokens
3. Add rate limiting
4. Set up monitoring
5. Enable HTTPS

All documented in code with TODOs.

---

## 📊 Project Stats

| Metric           | Value                            |
| ---------------- | -------------------------------- |
| Total Files      | 11                               |
| Lines of Code    | ~1,500                           |
| Languages        | TypeScript, HTML/CSS, JavaScript |
| Dependencies     | 7 (minimal)                      |
| Build Time       | <1s                              |
| Startup Time     | 1-2s                             |
| No External APIs | ✗ (cloud default routes to Fireworks/Together; ✓ only on Ollama path) |
| Zero Config      | ✗ (needs a provider key or local Ollama) |

---

## 🎓 Learning Resources

- **HTTP API Design** - See `server.ts`
- **Service Architecture** - See individual service files
- **Local LLM Integration** - See `OllamaService.ts`
- **File Persistence** - See `StorageService.ts`
- **Frontend Build** - See `public/index.html`

---

## 🔮 Future Enhancements

**Phase 2** (if needed):

- [ ] Database backend (Supabase)
- [ ] Team collaboration
- [ ] Version control
- [ ] Advanced code editor
- [ ] Live preview
- [ ] Export to multiple formats
- [ ] CI/CD pipeline
- [ ] Analytics dashboard

---

## 📝 License

MIT - Free to use, modify, distribute

---

**Created**: January 15, 2026  
**Version**: 1.0.0-alpha.1  
**Status**: ✅ Deployed as a multi-provider gateway (Railway); local mode available  
**Architecture**: Provider-routing gateway — cloud by default (Fireworks/Together), optionally fully-local via HoloLLama local compatibility serving

---

## 🎯 Next Steps for Users

1. **Download Ollama** (https://ollama.ai)
2. **Run `ollama serve`** in a terminal
3. **Run `npm run dev`** in this directory
4. **Open `http://localhost:8000`**
5. **Login with `user / password`**
6. **Start building!**

Note: the steps above describe the **opt-in local (Ollama) mode**. The default deployment routes inference through Fireworks/Together (external paid clouds) — see the accuracy note at the top.
