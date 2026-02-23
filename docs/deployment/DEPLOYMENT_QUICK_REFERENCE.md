# HoloScript Deployment Quick Reference

**🚀 Fast commands for common deployment tasks**

---

## 📚 Documentation (GitHub Pages)

### Deploy Documentation
```bash
# Auto-deploys on push to main
git push origin main

# Manual trigger via GitHub Actions UI:
# Actions → Deploy Docs → Run workflow
```

### Preview Documentation Locally
```bash
cd docs/
pnpm install
pnpm dev
# → http://localhost:5173
```

### Build Documentation
```bash
cd docs/
pnpm build
# Output: docs/.vitepress/dist/
```

### Check Documentation Links
```bash
cd docs/
pnpm build  # Warnings show broken links
```

---

## 🚀 Railway Web Apps

### Initial Setup (One-Time)

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Link repository
railway link
# Select: brianonbased-dev/HoloScript
```

### Deploy Single Service

```bash
# HoloScript Studio
railway up --service studio

# Marketplace Web
railway up --service marketplace-web

# Marketplace API
railway up --service marketplace-api

# Render Service
railway up --service render-service

# LLM Service
railway up --service llm-service
```

### Deploy All Services

```bash
# Via GitHub Actions (recommended)
# Push to main branch or:
# Actions → Deploy to Railway → Run workflow → Select "all"

# Via Railway CLI (manual)
railway up --service studio && \
railway up --service marketplace-web && \
railway up --service marketplace-api && \
railway up --service render-service && \
railway up --service llm-service
```

### View Logs

```bash
# Real-time logs
railway logs --service studio --tail

# Recent logs
railway logs --service marketplace-api

# Specific time range
railway logs --service llm-service --since 1h
```

### Run Commands in Production

```bash
# Run database migration
railway run --service marketplace-api npm run migrate

# Run seed script
railway run --service marketplace-api npm run seed

# Open shell in production container
railway shell --service marketplace-api
```

### Environment Variables

```bash
# View variables
railway variables --service studio

# Set variable
railway variables --service studio set ANTHROPIC_API_KEY=sk-ant-...

# Delete variable
railway variables --service studio delete DEPRECATED_VAR
```

### Rollback Deployment

```bash
# Via Railway CLI
railway rollback --service studio

# Via Dashboard
# railway.app → Service → Deployments → Select previous → Redeploy
```

---

## 🔧 Local Development

### Setup Development Environment

```bash
# 1. Clone repository
git clone https://github.com/brianonbased-dev/HoloScript.git
cd HoloScript

# 2. Install dependencies (monorepo)
pnpm install

# 3. Copy environment variables
cp .env.example .env
# Edit .env with your local values

# 4. Start development servers
pnpm dev  # Starts all packages in watch mode
```

### Run Specific Service

```bash
# HoloScript Studio
cd packages/studio
pnpm dev  # → http://localhost:3000

# Marketplace Web
cd packages/marketplace-web
pnpm dev  # → http://localhost:3001

# Marketplace API
cd packages/marketplace-api
pnpm dev  # → http://localhost:4000
```

### Run Tests

```bash
# All tests
pnpm test

# Specific package
pnpm --filter @holoscript/studio test

# Coverage
pnpm test:coverage
```

### Build for Production

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @holoscript/studio build
```

---

## 🗄️ Database Management

### Local PostgreSQL Setup

```bash
# Using Docker
docker run --name holoscript-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=holoscript_marketplace \
  -p 5432:5432 \
  -d postgres:16

# Update .env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/holoscript_marketplace
```

### Migrations (Prisma)

```bash
# Create migration (development)
cd packages/marketplace-api
pnpm prisma migrate dev --name add_plugin_ratings

# Apply migrations (production)
railway run --service marketplace-api pnpm prisma migrate deploy

# Reset database (CAUTION: deletes all data)
pnpm prisma migrate reset
```

### Database Backup

```bash
# Railway PostgreSQL backup
railway run --service marketplace-api pg_dump > backup.sql

# Restore
railway run --service marketplace-api psql < backup.sql
```

---

## 🔒 Security

### Rotate API Keys

```bash
# 1. Generate new key (Anthropic, OpenAI, etc.)
# 2. Update in Railway
railway variables --service studio set ANTHROPIC_API_KEY=sk-ant-new-key

# 3. Redeploy service
railway up --service studio
```

### Check for Vulnerabilities

```bash
# Audit dependencies
pnpm audit

# Auto-fix vulnerabilities
pnpm audit --fix

# Check for outdated packages
pnpm outdated
```

---

## 📊 Monitoring

### Check Service Health

```bash
# HoloScript Studio
curl https://studio.holoscript.net/api/health

# Marketplace API
curl https://marketplace-api.holoscript.net/health
```

### View Railway Metrics

```bash
# Via Dashboard
# railway.app → Service → Observability → Metrics

# Via CLI (limited)
railway status --service studio
```

---

## 🆘 Emergency Procedures

### Service Down - Quick Recovery

```bash
# 1. Check service status
railway status --service studio

# 2. View recent logs
railway logs --service studio --tail

# 3. Restart service
railway restart --service studio

# 4. If restart fails, rollback
railway rollback --service studio
```

### Database Connection Issues

```bash
# 1. Verify DATABASE_URL is set
railway variables --service marketplace-api | grep DATABASE_URL

# 2. Test database connection
railway run --service marketplace-api -- node -e "console.log(process.env.DATABASE_URL)"

# 3. Check PostgreSQL service status
# Dashboard → PostgreSQL service → Status
```

### High Memory/CPU Usage

```bash
# 1. View current resource usage
# Dashboard → Service → Metrics

# 2. Scale resources (if needed)
# Dashboard → Service → Settings → Resources
# Increase Memory/CPU limits

# 3. Check for memory leaks in logs
railway logs --service studio | grep "heap"
```

---

## 🔄 Common Workflows

### Hotfix Deployment

```bash
# 1. Create hotfix branch
git checkout -b hotfix/fix-studio-crash

# 2. Make fix
code packages/studio/src/bug.ts

# 3. Test locally
cd packages/studio && pnpm test

# 4. Commit and push
git add packages/studio/
git commit -m "fix: resolve studio crash on scene load"
git push origin hotfix/fix-studio-crash

# 5. Create PR and merge to main
gh pr create --title "Hotfix: Studio crash" --body "Fixes #123"

# 6. Auto-deploys via GitHub Actions
# Or manually: railway up --service studio
```

### Feature Deployment

```bash
# 1. Feature branch → main (via PR)
# 2. GitHub Actions auto-deploys
# 3. Monitor logs for errors
railway logs --service studio --tail

# 4. If issues detected, rollback
railway rollback --service studio
```

### Staging Environment

```bash
# Create staging environment (Railway Dashboard)
# 1. Project → Environments → New Environment → "staging"
# 2. Deploy to staging first
railway up --service studio --environment staging

# 3. Test staging
curl https://studio-staging.holoscript.net/api/health

# 4. If successful, deploy to production
railway up --service studio --environment production
```

---

## 📱 Mobile/Edge Cases

### Deploy from Mobile (GitHub Codespaces)

```bash
# 1. Open repository in Codespaces
# github.com/brianonbased-dev/HoloScript → Code → Create codespace

# 2. Railway CLI works in Codespaces
railway login --browserless  # Generates login link
railway up --service studio
```

### Deploy without CLI (Web UI Only)

```text
1. Go to railway.app
2. Select project → Service
3. Click "Deploy" (if auto-deploy disabled)
4. Or: Settings → Deployments → Trigger Deploy
```

---

## 🎓 Learning Resources

### Railway Specific
- **Railway Docs**: https://docs.railway.app
- **Railway Templates**: https://railway.app/templates
- **Railway CLI Reference**: https://docs.railway.app/develop/cli

### GitHub Actions
- **Workflow Syntax**: https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions
- **Environment Protection**: https://docs.github.com/en/actions/deployment/targeting-different-environments

### Debugging
- **Railway Logs**: `railway logs --service <name> --tail`
- **Local Debugging**: `pnpm dev` (runs in watch mode)
- **Production Debugging**: `railway shell --service <name>` (SSH into container)

---

**🔗 Quick Links**

- [Full Deployment Plan](FRONTEND_DEPLOYMENT_PLAN.md) - Comprehensive guide
- [Environment Variables](.env.example) - Configuration template
- [GitHub Actions](.github/workflows/deploy-railway.yml) - CI/CD workflow
- [Railway Dashboard](https://railway.app/project/holoscript) - Service management
- [GitHub Pages](https://www.holoscript.net) - Live documentation

---

**Last Updated**: 2026-02-21
