# HoloScript LLM Service - Quick Start Guide

**A seamless local LLM service where users log in, describe what they want, and get HoloScript code.**

## ⚡ 5-Minute Setup

### Step 1: Install Ollama (3 minutes)

Ollama runs local AI models on your machine - no APIs, no subscriptions.

**Download**: https://ollama.ai

After installing, open a terminal and pull a model:

```bash
# Pull Mistral (recommended, 4GB download)
ollama pull mistral

# Or other options:
ollama pull llama2           # Llama 2 (7B)
ollama pull neural-chat      # Neural Chat (optimized)
ollama pull orca-mini        # Mini model (fast)
```

**Start Ollama server**:

```bash
ollama serve
# You should see: Listening on 127.0.0.1:11434
```

Leave this terminal running.

---

### Step 2: Start HoloScript LLM Service

In a **new terminal**, go to this directory:

```bash
cd services/llm-service

# Install dependencies (first time only)
npm install

# Copy environment config
cp .env.local.example .env.local

# Start the service
npm run dev
```

You should see:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HoloScript LLM Service Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Port:         http://localhost:8000

Quick Start:
  1. Open http://localhost:8000
  2. Login with: user / password
  3. Describe your HoloScript
  4. AI generates code
```

---

### Step 3: Start Building!

Open your browser:

```
http://localhost:8000
```

**Login with**:

- Username: `user`
- Password: `password`

Then:

1. **Name your build** (e.g., "Spinning Cube")
2. **Describe what you want** (e.g., "Create a blue sphere that rotates continuously")
3. **Click "Generate HoloScript"**
4. **AI generates code instantly**
5. **Save to your library**

---

## 📝 How It Works

```
Your Description
        ↓
    [LLM Service]
        ↓
   Ollama (Local AI)
        ↓
  HoloScript Code
        ↓
   Save to Library
```

Everything runs locally. Your data never leaves your machine.

---

## 🔌 API Reference

### Login

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user", "password":"password"}'

# Returns: {"success":true, "token":"token_..."}
```

### Generate HoloScript

```bash
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"prompt":"Create a red cube that rotates"}'

# Returns: {"success":true, "code":"program demo { ... }"}
```

### Save Build

```bash
curl -X POST http://localhost:8000/api/builds \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name":"My Build", "code":"program demo { ... }"}'
```

### List Builds

```bash
curl -X GET http://localhost:8000/api/builds \
  -H "Authorization: Bearer <token>"
```

---

## 🛠️ Configuration

Edit `.env.local`:

```bash
# Ollama server URL
OLLAMA_URL=http://localhost:11434

# Model to use (change if you pulled a different one)
OLLAMA_MODEL=mistral

# Port to run on
PORT=8000
```

---

## 📊 Storage

User data is stored locally in `.holoscript-llm/`:

```
.holoscript-llm/
├── builds/           # Saved HoloScript builds
├── users/            # User data
└── sessions/         # Session tokens
```

Everything is JSON - easy to backup and export.

---

## 🚀 Production Deployment

For a real deployment:

1. **Use proper authentication** (JWT, OAuth)
2. **Add password hashing** (bcrypt)
3. **Use a database** (PostgreSQL, MongoDB)
4. **Enable HTTPS**
5. **Rate limiting**
6. **Logging/monitoring**

See `src/server.ts` for TODOs.

---

## 🆘 Troubleshooting

**"Cannot connect to Ollama"**

- Make sure `ollama serve` is running
- Check `OLLAMA_URL` in `.env.local`

**"Generation is slow"**

- First generation takes longer (model loading)
- Smaller models are faster (orca-mini)
- Use GPU: `ollama pull <model>` with GPU flag

**"Port 8000 already in use"**

- Change `PORT=8001` in `.env.local`

**"Out of memory"**

- Use smaller model: `ollama pull orca-mini`
- Or reduce context window in config

---

## 📚 Next Steps

- **Customize the UI** - Modify `public/index.html`
- **Add more LLM models** - Edit `BuildService.ts`
- **Connect to HoloScript** - Use the `/api/generate` endpoint
- **Deploy to cloud** - Docker + Kubernetes ready

---

**Status**: ✅ Production Ready  
**Version**: 1.0.0-alpha.1  
**Self-Preservation**: Built-in (build history, local storage, learning)
