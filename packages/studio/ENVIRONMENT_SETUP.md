# Environment Setup for Studio Pipeline

## Problem

Root `.env` files are **NOT** automatically loaded by Next.js. The Studio app needs environment variables in its own directory.

## Solution

### Quick Setup

```bash
# 1. Navigate to studio package
cd packages/studio

# 2. Copy the example file
cp .env.local.example .env.local

# 3. Edit .env.local with your API key
# Choose ONE of:
#   - ANTHROPIC_API_KEY (recommended)
#   - XAI_API_KEY
#   - OPENAI_API_KEY
#   - Or leave blank to use local Ollama
```

### Option 1: Use Existing Root .env (Automatic Sync)

If you already have API keys in the root `.env`, create a symlink:

```bash
cd packages/studio

# Windows
mklink .env.local ..\..\..env

# Mac/Linux
ln -s ../../.env .env.local
```

### Option 2: Manual Copy

```bash
# Copy specific vars from root .env
grep ANTHROPIC_API_KEY ../../.env >> .env.local
grep XAI_API_KEY ../../.env >> .env.local
grep OPENAI_API_KEY ../../.env >> .env.local
```

### Option 3: Direct Edit

```bash
# Create .env.local manually
cat > .env.local << 'EOF'
ANTHROPIC_API_KEY=sk-ant-your-key-here
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
NEXTAUTH_SECRET=generate-random-secret-32chars
NEXTAUTH_URL=http://localhost:3000
EOF
```

## Verification

After setup, verify the LLM provider is detected:

```bash
# Start dev server
pnpm dev

# In another terminal, check provider
curl http://localhost:3000/api/pipeline/provider
```

Expected output:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250929"
}
```

## Why .env.local?

- ✅ Next.js automatically loads `.env.local`
- ✅ Git-ignored by default (safe for secrets)
- ✅ Overrides `.env` (for local development)
- ❌ Root `.env` is NOT loaded by Next.js apps

## LLM Provider Priority

The pipeline tries providers in order:

1. **Anthropic** (`ANTHROPIC_API_KEY`)
2. **xAI** (`XAI_API_KEY`)
3. **OpenAI** (`OPENAI_API_KEY`)
4. **Ollama** (local, `OLLAMA_URL`, no key needed)

Only the first available provider is used.

## Troubleshooting

### "No API key set"

- Check `.env.local` exists in `packages/studio/`
- Restart dev server after editing `.env.local`
- Verify file is not `.env.local.example`

### "Ollama selected but I have API keys"

- Environment variables not loading
- Check file path: must be `packages/studio/.env.local`
- Print env vars: `printenv | grep API_KEY`

### "401 Unauthorized"

- Invalid API key
- Key expired
- Wrong key for provider (e.g., OpenAI key in ANTHROPIC_API_KEY)

## Security Notes

- **NEVER commit `.env.local`** (already in .gitignore)
- Use separate keys for dev/prod
- Rotate keys if accidentally exposed
- Use read-only API keys when possible
