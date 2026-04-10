# HoloScript Frontend Deployment Plan

## GitHub Pages (Docs) + Railway (Web Apps)

**Status**: Production Ready
**Last Updated**: 2026-02-21
**Owner**: Development Team

---

## 📊 Executive Summary

HoloScript uses a **dual deployment strategy**:

1. **GitHub Pages** → Static documentation site (VitePress)
2. **Railway** → Dynamic web applications (Studio, Marketplace, Services)

**Current Status**:

- ✅ GitHub Pages: **LIVE** at [www.holoscript.net](https://www.holoscript.net)
- ✅ Railway: **DEPLOYED & LIVE** (via Railway CLI)

---

## 🎯 Part 1: GitHub Pages Deployment

### Overview

- **Purpose**: Host HoloScript documentation
- **Technology**: VitePress (Vue-based static site generator)
- **Build Source**: `docs/` directory
- **Build Output**: `docs/.vitepress/dist/`
- **Deployment URL**: https://www.holoscript.net
- **SSL Certificate**: Valid until 2026-04-25

### Current Configuration

**GitHub Actions Workflow**: `.github/workflows/deploy-docs.yml`

**Trigger Conditions**:

- Push to `main` branch with changes to:
  - `docs/**`
  - `packages/*/src/**/*.ts` (for TypeDoc API docs)
  - `typedoc.json`
  - `.github/workflows/deploy-docs.yml`
- Manual trigger via GitHub Actions UI

**Build Process**:

```yaml
1. Checkout repository
2. Setup Node.js 20 + pnpm
3. Install root dependencies
4. Install Rust toolchain + wasm-pack
5. Build @holoscript/core package (TypeScript types)
6. Generate TypeDoc API reference → docs/api/
7. Install docs site dependencies
8. Build VitePress site → docs/.vitepress/dist/
9. Upload artifact to GitHub Pages
10. Deploy to production
```

**Build Duration**: ~5-8 minutes (includes Rust compilation)

### Site Structure

```
docs/
├── .vitepress/
│   ├── config.ts          # VitePress configuration
│   ├── dist/              # Build output (deployed)
│   └── cache/             # Build cache
├── index.md               # Homepage
├── guides/                # User guides
├── academy/               # Interactive tutorials
├── traits/                # Trait reference docs
├── compilers/             # Compiler target docs
├── api/                   # Auto-generated TypeDoc API
├── examples/              # Code examples
└── cookbook/              # Recipes & patterns
```

### Maintenance Tasks

#### Update Documentation Content

```bash
# 1. Edit markdown files in docs/
cd docs/
code getting-started/quickstart.md

# 2. Preview locally
npm run dev  # or pnpm dev

# 3. Commit and push
git add docs/
git commit -m "docs: update quickstart guide"
git push origin main

# GitHub Actions will auto-deploy
```

#### Update API Reference (TypeDoc)

```bash
# API docs are auto-generated from TypeScript source comments
# 1. Update JSDoc comments in packages/*/src/**/*.ts
# 2. Push to main - TypeDoc regenerates automatically
```

#### Custom Domain Management

**Current Domain**: www.holoscript.net (CNAME configured)

To update custom domain:

```bash
# 1. GitHub repo → Settings → Pages
# 2. Custom domain field → enter new domain
# 3. Update DNS CNAME record:
#    CNAME www.holoscript.net → brianonbased-dev.github.io
```

### Troubleshooting

**Issue**: Documentation not updating after push

- **Check**: GitHub Actions workflow status (Actions tab)
- **Fix**: Re-run failed workflow or check build logs

**Issue**: Broken links in deployed site

- **Check**: VitePress build warnings (`npm run build`)
- **Fix**: Update broken markdown links or excluded files in `config.ts`

**Issue**: TypeDoc API reference missing/outdated

- **Check**: Build logs for `pnpm docs:api` step
- **Fix**: Ensure `@holoscript/core` builds successfully

---

## 🚀 Part 2: Railway Deployment (Web Applications)

### Overview

**Deployment Platform**: Railway (https://railway.app)
**Strategy**: Monorepo with multiple services
**Source**: GitHub repository (auto-deploy on push)
**Status**: ✅ **DEPLOYED & LIVE** (via Railway CLI)

> **📘 Maintenance**: Since services are already deployed, see [RAILWAY_MAINTENANCE_GUIDE.md](RAILWAY_MAINTENANCE_GUIDE.md) for:
>
> - Updating existing deployments
> - Managing environment variables
> - Viewing logs and metrics
> - Troubleshooting and rollback procedures

### Deployed Services

| Service               | Package Path               | Port | Purpose                     | Dependencies              |
| --------------------- | -------------------------- | ---- | --------------------------- | ------------------------- |
| **HoloScript Studio** | `packages/studio`          | 3000 | AI-powered 3D scene builder | React, Three.js, AI SDKs  |
| **Marketplace Web**   | `packages/marketplace-web` | 3000 | Plugin marketplace frontend | Next.js                   |
| **Marketplace API**   | `packages/marketplace-api` | 4000 | Plugin marketplace backend  | Express, PostgreSQL       |
| **Render Service**    | `services/render-service`  | 5000 | Scene rendering service     | WebGPU, WASM              |
| **LLM Service**       | `services/llm-service`     | 6000 | AI/LLM integration          | Anthropic SDK, OpenAI SDK |

### Railway Configuration Files

Each service has a `railway.toml` file defining build/deploy settings:

**Example**: `packages/studio/railway.toml`

```toml
[build]
dockerfilePath = "packages/studio/Dockerfile"
watchPatterns = ["packages/studio/**", "packages/core/**"]

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3

[service]
internalPort = 3000
```

### Updating Deployments

Since your services are already deployed, here are the recommended update methods:

#### Option 1: Git Push (Recommended - Auto-Deploy)

```bash
# 1. Make changes to your code
code packages/studio/src/components/SceneBuilder.tsx

# 2. Commit and push
git add packages/studio/
git commit -m "feat: improve scene builder"
git push origin main

# Railway automatically deploys if auto-deploy is enabled
# ✅ Live in ~3-5 minutes
```

#### Option 2: Manual Deploy via Railway CLI

**Option A: Via Railway Dashboard (Recommended for first deploy)**

1. **Go to Railway Dashboard** → Create New Project
2. **Deploy from GitHub** → Select `brianonbased-dev/HoloScript`
3. **Add Service** → Select service type:
   - For Studio/Marketplace Web: **Web Service**
   - For APIs/Services: **Backend Service**
4. **Configure Service**:
   - Root Directory: `packages/studio` (or respective path)
   - Build Command: Auto-detected from `railway.toml`
   - Start Command: Auto-detected from `package.json`
5. **Add Environment Variables** (see section below)
6. **Deploy** → Railway builds and deploys automatically

**Option B: Via Railway CLI**

```bash
# Deploy HoloScript Studio
cd packages/studio
railway up

# Deploy Marketplace Web
cd ../../packages/marketplace-web
railway up

# Deploy Marketplace API
cd ../marketplace-api
railway up

# Deploy Services
cd ../../services/render-service
railway up
cd ../llm-service
railway up
```

#### Step 3: Configure Custom Domains

**Studio**: studio.holoscript.net
**Marketplace**: marketplace.holoscript.net

```bash
# In Railway Dashboard:
# 1. Select service → Settings → Domains
# 2. Add custom domain: studio.holoscript.net
# 3. Update DNS CNAME:
#    CNAME studio.holoscript.net → [railway-generated-domain]
# 4. Railway auto-provisions SSL certificate
```

#### Step 4: Link Services (Service Discovery)

**Marketplace Web** needs to connect to **Marketplace API**:

```bash
# Railway automatically creates internal DNS for services
# In Marketplace Web environment variables:
MARKETPLACE_API_URL=${{MARKETPLACE_API.RAILWAY_PRIVATE_DOMAIN}}
# Or use public domain for external access
```

### Environment Variables

#### HoloScript Studio

```bash
NODE_ENV=production
PORT=3000

# AI Integration
ANTHROPIC_API_KEY=<secret>
OPENAI_API_KEY=<secret>

# Three.js/WebGPU
ENABLE_WEBGPU=true
MAX_TEXTURE_SIZE=4096

# Authentication (if needed)
AUTH0_DOMAIN=<your-auth0-domain>
AUTH0_CLIENT_ID=<client-id>
AUTH0_CLIENT_SECRET=<secret>

# Analytics
ANALYTICS_ID=<google-analytics-id>
```

#### Marketplace Web

```bash
NODE_ENV=production
PORT=3000

# API Connection
NEXT_PUBLIC_API_URL=https://marketplace-api-production.up.railway.app
# Or use Railway private domain:
# NEXT_PUBLIC_API_URL=${{MARKETPLACE_API.RAILWAY_PRIVATE_DOMAIN}}

# Authentication
NEXT_PUBLIC_AUTH_DOMAIN=<auth0-domain>
```

#### Marketplace API

```bash
NODE_ENV=production
PORT=4000

# Database (Railway PostgreSQL)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# CORS (allow Marketplace Web)
ALLOWED_ORIGINS=https://marketplace.holoscript.net,https://www.holoscript.net

# Authentication
JWT_SECRET=<random-secret>
AUTH0_DOMAIN=<auth0-domain>
```

#### Render Service

```bash
NODE_ENV=production
PORT=5000

# WebGPU Configuration
ENABLE_GPU_ACCELERATION=true
MAX_CONCURRENT_RENDERS=10

# Storage (for rendered outputs)
S3_BUCKET=holoscript-renders
AWS_ACCESS_KEY_ID=<aws-key>
AWS_SECRET_ACCESS_KEY=<secret>
AWS_REGION=us-east-1
```

#### LLM Service

```bash
NODE_ENV=production
PORT=6000

# LLM Providers
ANTHROPIC_API_KEY=<secret>
OPENAI_API_KEY=<secret>

# Rate Limiting
MAX_REQUESTS_PER_MINUTE=60
MAX_TOKENS_PER_REQUEST=4096
```

### Database Setup (PostgreSQL)

Railway provides managed PostgreSQL:

```bash
# 1. Railway Dashboard → Add Database → PostgreSQL
# 2. Database is auto-provisioned
# 3. Connection string available as ${{Postgres.DATABASE_URL}}
# 4. Run migrations:

railway run --service marketplace-api npm run migrate
```

**Migrations** (if using Prisma/TypeORM):

```bash
# Add migration script to package.json:
"migrate": "prisma migrate deploy"  # or
"migrate": "typeorm migration:run"
```

### CI/CD Integration

#### GitHub Actions → Railway Auto-Deploy

Create `.github/workflows/deploy-railway.yml`:

```yaml
name: Deploy to Railway

on:
  push:
    branches: [main]
    paths:
      - 'packages/studio/**'
      - 'packages/marketplace-web/**'
      - 'packages/marketplace-api/**'
      - 'services/**'
  workflow_dispatch:

jobs:
  deploy-studio:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Deploy to Railway
        uses: bervProject/railway-deploy@main
        with:
          railway_token: ${{ secrets.RAILWAY_TOKEN }}
          service: holoscript-studio

  deploy-marketplace-web:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Deploy to Railway
        uses: bervProject/railway-deploy@main
        with:
          railway_token: ${{ secrets.RAILWAY_TOKEN }}
          service: marketplace-web

  # Repeat for other services...
```

**Setup**:

1. Railway Dashboard → Project Settings → Tokens → Create Token
2. GitHub repo → Settings → Secrets → New Secret
   - Name: `RAILWAY_TOKEN`
   - Value: `<railway-token>`

### Monitoring & Logging

#### Railway Dashboard

- **Metrics**: CPU, Memory, Network usage per service
- **Logs**: Real-time logs for each service
- **Deployments**: Deployment history and rollback

#### Health Checks

Each service should expose `/api/health` or `/health` endpoint:

```typescript
// packages/studio/src/api/health.ts
export async function GET() {
  return Response.json({
    status: 'healthy',
    version: process.env.npm_package_version,
    timestamp: new Date().toISOString(),
  });
}
```

Railway pings this endpoint based on `healthcheckPath` in `railway.toml`.

### Rollback Strategy

**Automatic Rollback**: Railway keeps last 10 deployments

```bash
# Via Railway CLI:
railway rollback

# Or via Dashboard:
# Deployments tab → Select previous deployment → Redeploy
```

### Cost Estimation

**Railway Pricing** (as of 2026):

- **Hobby Plan**: $5/month + $0.000231/GB-hr RAM + $0.000463/vCPU-hr
- **Pro Plan**: $20/month + usage

**Estimated Monthly Cost** (5 services):

- ~$25-50/month for development/staging
- ~$100-200/month for production (depending on traffic)

**Optimization Tips**:

- Use Railway's **sleep mode** for dev services (auto-sleep after inactivity)
- Enable **autoscaling** for production (scales to zero during low traffic)
- Use **shared databases** (one PostgreSQL instance for multiple services)

---

## 🔄 Complete Deployment Workflow

### For Documentation Updates

```bash
# 1. Edit docs
cd docs/
code guides/quickstart.md

# 2. Preview locally
pnpm dev  # http://localhost:5173

# 3. Commit and push
git add docs/
git commit -m "docs: update quickstart"
git push origin main

# 4. GitHub Actions auto-deploys to www.holoscript.net
# ✅ Live in ~5-8 minutes
```

### For Web Application Updates

```bash
# 1. Develop feature
cd packages/studio/
code src/components/SceneBuilder.tsx

# 2. Test locally
pnpm dev  # http://localhost:3000

# 3. Commit and push
git add packages/studio/
git commit -m "feat: add new scene builder UI"
git push origin main

# 4. Railway auto-deploys (if GitHub Actions configured)
# OR manually deploy:
railway up --service holoscript-studio

# ✅ Live in ~3-5 minutes
```

### For Database Migrations

```bash
# 1. Create migration
cd packages/marketplace-api/
pnpm prisma migrate dev --name add_plugin_ratings

# 2. Test locally
pnpm dev

# 3. Commit migration files
git add prisma/migrations/
git commit -m "db: add plugin ratings table"
git push origin main

# 4. Run migration on Railway
railway run --service marketplace-api pnpm prisma migrate deploy

# ✅ Migration applied
```

---

## 🛡️ Security Checklist

### Environment Variables

- [ ] Never commit `.env` files to git
- [ ] Use Railway's **Variables** tab for secrets
- [ ] Rotate API keys quarterly
- [ ] Use different keys for dev/staging/production

### CORS Configuration

- [ ] Restrict `ALLOWED_ORIGINS` to known domains
- [ ] Don't use wildcard `*` in production

### Database Access

- [ ] Use Railway's internal network for DB connections
- [ ] Don't expose database ports publicly
- [ ] Enable SSL for database connections

### SSL/TLS

- [ ] Verify SSL certificates are active (Railway auto-provisions)
- [ ] Enforce HTTPS redirects
- [ ] Set HSTS headers

### Rate Limiting

- [ ] Implement rate limiting on API endpoints
- [ ] Use Redis for distributed rate limiting (if multiple instances)

---

## 📊 Monitoring & Alerts

### Railway Metrics to Monitor

1. **CPU Usage**: Alert if >80% for >5 minutes
2. **Memory Usage**: Alert if >90%
3. **Response Time**: Alert if p95 >500ms
4. **Error Rate**: Alert if >5%
5. **Deployment Status**: Notify on deploy success/failure

### Setup Alerts

```bash
# Railway Dashboard → Service → Observability → Alerts
# Configure webhooks to Slack/Discord/Email
```

**Slack Integration**:

1. Railway → Integrations → Slack
2. Select channel for deployment notifications
3. Configure alert thresholds

---

## 🚨 Troubleshooting

### Issue: Railway build fails

**Check**:

```bash
# View build logs
railway logs --service holoscript-studio

# Common issues:
# - Missing dependencies in package.json
# - TypeScript errors
# - Memory limit exceeded during build
```

**Fix**:

```bash
# Increase build memory (Railway Dashboard):
# Service → Settings → Resources → Build Memory → 8GB
```

### Issue: Service crashes after deploy

**Check**:

```bash
# View runtime logs
railway logs --service holoscript-studio --tail

# Common issues:
# - Missing environment variables
# - Port binding (must use $PORT or defined port)
# - Database connection failures
```

**Fix**:

```typescript
// Ensure app binds to correct port:
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0'); // Important: bind to 0.0.0.0
```

### Issue: Inter-service communication fails

**Check**:

```bash
# Use Railway private domains:
# Service A → ${{SERVICE_B.RAILWAY_PRIVATE_DOMAIN}}
# Example: marketplace-api.railway.internal
```

**Fix**:

```bash
# In Marketplace Web:
MARKETPLACE_API_URL=${{MARKETPLACE_API.RAILWAY_PRIVATE_DOMAIN}}
# Not: https://marketplace-api-production.up.railway.app
```

### Issue: Database migrations not applied

**Check**:

```bash
# Verify DATABASE_URL is set
railway variables --service marketplace-api
```

**Fix**:

```bash
# Manually run migrations
railway run --service marketplace-api pnpm prisma migrate deploy
# Or add to start script:
"start": "prisma migrate deploy && node dist/index.js"
```

---

## 📅 Deployment Checklist

### Pre-Deployment

- [ ] All tests passing (`pnpm test`)
- [ ] Linting clean (`pnpm lint`)
- [ ] No TypeScript errors (`pnpm build`)
- [ ] Environment variables documented
- [ ] Database migrations tested
- [ ] Security scan passed (`pnpm audit`)

### GitHub Pages (Docs)

- [ ] VitePress builds locally (`cd docs && pnpm build`)
- [ ] No broken links
- [ ] TypeDoc API reference generates
- [ ] Custom domain SSL valid

### Railway (Web Apps)

- [ ] Railway services created
- [ ] Environment variables configured
- [ ] Custom domains configured
- [ ] Health check endpoints implemented
- [ ] Database migrations applied
- [ ] Inter-service connections tested
- [ ] Monitoring/alerts configured

### Post-Deployment

- [ ] Verify all services accessible
- [ ] Test critical user flows
- [ ] Check logs for errors
- [ ] Confirm metrics reporting
- [ ] Update deployment documentation

---

## 📞 Support & Resources

### Documentation

- **VitePress**: https://vitepress.dev
- **Railway**: https://docs.railway.app
- **GitHub Pages**: https://docs.github.com/pages

### Community

- **HoloScript Discord**: https://discord.gg/holoscript
- **Railway Discord**: https://discord.gg/railway

### Emergency Contacts

- **Deployment Issues**: [Your team contact]
- **Infrastructure**: [Your DevOps contact]

---

**Last Updated**: 2026-02-21
**Next Review**: 2026-03-21
**Document Owner**: Development Team
