# Railway Maintenance Guide

## Managing Existing HoloScript Deployments

**Status**: Production deployments active via Railway CLI
**Last Updated**: 2026-02-21

---

## 🎯 Quick Reference

Your HoloScript services are **already deployed on Railway**. This guide covers:

- ✅ Updating existing deployments
- ✅ Managing environment variables
- ✅ Viewing logs and metrics
- ✅ Troubleshooting common issues
- ✅ Scaling and optimization

---

## 📊 Current Deployment Status

### Check Overall Status

```bash
# View project and environment
cd /c/Users/josep/Documents/GitHub/HoloScript
railway status

# Should show:
# Project: HoloScript
# Environment: production
```

### List All Services

```bash
# View all deployed services in Railway Dashboard
# Or check railway.toml files:
find . -name "railway.toml" -type f
```

**Your Services**:

- `packages/studio/railway.toml` → HoloScript Studio
- `packages/marketplace-web/railway.toml` → Marketplace Web
- `packages/marketplace-api/railway.toml` → Marketplace API
- `services/render-service/railway.toml` → Render Service
- `services/llm-service/railway.toml` → LLM Service

---

## 🔄 Updating Deployments

### Option 1: Push to Git (Auto-Deploy)

**If auto-deploy is enabled** (recommended):

```bash
# 1. Make changes
code packages/studio/src/components/SceneBuilder.tsx

# 2. Commit and push
git add packages/studio/
git commit -m "feat: improve scene builder UI"
git push origin main

# Railway automatically detects changes and deploys
# ✅ Live in ~3-5 minutes
```

### Option 2: Manual Deploy via CLI

**For immediate deployment** without pushing to git:

```bash
# Deploy specific service
railway up --service studio

# Deploy with detach (don't wait for completion)
railway up --service studio --detach

# Deploy all services (one by one)
railway up --service studio && \
railway up --service marketplace-web && \
railway up --service marketplace-api && \
railway up --service render-service && \
railway up --service llm-service
```

### Option 3: Deploy via Railway Dashboard

```text
1. Go to railway.app
2. Select HoloScript project
3. Select service (e.g., "studio")
4. Click "Deployments" tab
5. Click "New Deployment" → "Redeploy"
```

---

## 🔍 Monitoring Deployments

### View Real-Time Logs

```bash
# Tail logs for specific service
railway logs --service studio --tail

# View recent logs (last 100 lines)
railway logs --service marketplace-api

# View logs since specific time
railway logs --service llm-service --since 1h
railway logs --service render-service --since 2024-02-21
```

### Check Deployment Status

```bash
# View recent deployments
# Railway Dashboard → Service → Deployments tab

# Or via CLI (shows build status)
railway status --service studio
```

### Monitor Health

```bash
# Studio health check
curl https://studio.holoscript.net/api/health

# Marketplace API health check
curl https://marketplace-api.holoscript.net/health

# Expected response:
# {"status":"healthy","version":"3.4.0","timestamp":"2026-02-21T..."}
```

---

## ⚙️ Environment Variables

### View Current Variables

```bash
# List all variables for a service
railway variables --service studio

# View specific variable (careful with secrets!)
railway variables --service studio | grep ANTHROPIC_API_KEY
```

### Update Variables

```bash
# Set new variable
railway variables --service studio set NEW_FEATURE_FLAG=true

# Update existing variable
railway variables --service studio set ANTHROPIC_API_KEY=sk-ant-new-key

# Delete variable
railway variables --service studio delete DEPRECATED_VAR

# Bulk update (via Railway Dashboard)
# Dashboard → Service → Variables → Bulk Edit
```

### Important Variables by Service

**Studio**:

```bash
railway variables --service studio set ANTHROPIC_API_KEY=sk-ant-...
railway variables --service studio set OPENAI_API_KEY=sk-...
railway variables --service studio set ENABLE_WEBGPU=true
```

**Marketplace API**:

```bash
# Database URL is auto-managed by Railway
railway variables --service marketplace-api | grep DATABASE_URL

# Set CORS origins
railway variables --service marketplace-api set ALLOWED_ORIGINS=https://marketplace.holoscript.net
```

**LLM Service**:

```bash
railway variables --service llm-service set ANTHROPIC_API_KEY=sk-ant-...
railway variables --service llm-service set MAX_TOKENS=4096
```

---

## 🗄️ Database Management

### View Database Connection

```bash
# PostgreSQL URL (auto-provided by Railway)
railway variables --service marketplace-api | grep DATABASE_URL

# Or via Dashboard:
# PostgreSQL service → Connect tab → Copy connection string
```

### Run Migrations

```bash
# Apply pending migrations
railway run --service marketplace-api npm run migrate

# Or if using Prisma:
railway run --service marketplace-api npx prisma migrate deploy

# Check migration status
railway run --service marketplace-api npx prisma migrate status
```

### Database Backup

```bash
# Backup PostgreSQL database
railway run pg_dump > holoscript_backup_$(date +%Y%m%d).sql

# Restore from backup
railway run psql < holoscript_backup_20260221.sql
```

### Connect to Database

```bash
# Interactive PostgreSQL shell
railway connect marketplace-api

# Or use psql directly
railway run --service marketplace-api psql $DATABASE_URL
```

---

## 📈 Scaling & Performance

### Check Resource Usage

```bash
# Via Railway Dashboard:
# Service → Metrics tab
# - CPU Usage
# - Memory Usage
# - Network Traffic
# - Request Count
```

### Increase Resources

```text
Railway Dashboard → Service → Settings → Resources

Adjust:
- Memory (512MB - 32GB)
- CPU (0.5 - 32 vCPU)
- Replicas (1-10 instances)
```

### Auto-Scaling Configuration

```bash
# Via Railway Dashboard:
# Service → Settings → Autoscaling

Enable:
- Min Replicas: 1
- Max Replicas: 5
- Target CPU: 70%
- Target Memory: 80%
```

---

## 🔧 Troubleshooting

### Service Not Responding

```bash
# 1. Check service status
railway status --service studio

# 2. View recent logs for errors
railway logs --service studio --tail

# 3. Restart service
railway restart --service studio

# 4. If restart fails, redeploy
railway up --service studio
```

### Build Failures

```bash
# 1. View build logs
railway logs --service studio

# Common issues:
# - Missing dependencies → Check package.json
# - TypeScript errors → Run `pnpm build` locally first
# - Memory limit → Increase build memory in Dashboard

# 2. Increase build memory
# Dashboard → Service → Settings → Build Memory → 8GB

# 3. Retry deployment
railway up --service studio
```

### Database Connection Errors

```bash
# 1. Verify DATABASE_URL exists
railway variables --service marketplace-api | grep DATABASE_URL

# 2. Check PostgreSQL service status
# Dashboard → PostgreSQL service

# 3. Test connection
railway run --service marketplace-api -- node -e "console.log(process.env.DATABASE_URL)"

# 4. Restart PostgreSQL (if needed)
# Dashboard → PostgreSQL → Settings → Restart
```

### High Memory Usage

```bash
# 1. Check current usage
# Dashboard → Service → Metrics → Memory

# 2. If >90%, increase memory limit
# Dashboard → Service → Settings → Memory → 2GB+

# 3. Check for memory leaks in logs
railway logs --service studio | grep -i "memory"

# 4. Consider optimizations:
# - Enable garbage collection
# - Reduce cache size
# - Optimize image/texture sizes
```

### Slow Response Times

```bash
# 1. Check metrics
# Dashboard → Service → Metrics → Response Time

# 2. Common causes:
# - Database queries (add indexes)
# - Large payloads (enable compression)
# - Cold starts (keep service warm)

# 3. Enable caching
railway variables --service marketplace-api set REDIS_URL=${{Redis.REDIS_URL}}

# 4. Add Redis service if not present
# Dashboard → New → Database → Redis
```

---

## 🚨 Emergency Procedures

### Service Down - Immediate Recovery

```bash
# Step 1: Quick restart
railway restart --service studio

# Step 2: If restart fails, check logs
railway logs --service studio --tail | tail -50

# Step 3: Rollback to previous deployment
railway rollback --service studio

# Step 4: Verify health
curl https://studio.holoscript.net/api/health
```

### Rollback Deployment

```bash
# Via CLI (rolls back to previous version)
railway rollback --service studio

# Via Dashboard (choose specific version):
# 1. Service → Deployments
# 2. Find last working deployment
# 3. Click "..." → "Redeploy"
```

### Critical Bug Fix Deployment

```bash
# 1. Fix bug locally
code packages/studio/src/critical-bug.ts

# 2. Test fix
cd packages/studio && pnpm test

# 3. Deploy immediately (skip CI)
railway up --service studio --detach

# 4. Monitor logs
railway logs --service studio --tail

# 5. Verify fix
curl https://studio.holoscript.net/api/health
```

---

## 🔐 Security Maintenance

### Rotate API Keys

```bash
# 1. Generate new key (Anthropic/OpenAI dashboard)

# 2. Update in Railway (zero downtime)
railway variables --service studio set ANTHROPIC_API_KEY=sk-ant-NEW-KEY

# 3. Restart service to pick up new key
railway restart --service studio

# 4. Verify service works with new key
railway logs --service studio --tail
```

### Update Dependencies

```bash
# 1. Update locally
pnpm update

# 2. Check for vulnerabilities
pnpm audit

# 3. Fix vulnerabilities
pnpm audit --fix

# 4. Test locally
pnpm test

# 5. Deploy updates
git add package.json pnpm-lock.yaml
git commit -m "chore: update dependencies"
git push origin main
# Auto-deploys via Railway
```

### Security Audit

```bash
# Run security scan
pnpm audit

# Check for outdated packages
pnpm outdated

# Check Railway security settings
# Dashboard → Service → Settings → Security
# - Enable HTTPS only
# - Set CORS policies
# - Review environment variables
```

---

## 📊 Performance Optimization

### Enable Caching

```bash
# Add Redis for caching
# Dashboard → New → Database → Redis

# Connect to service
railway variables --service marketplace-api set REDIS_URL=${{Redis.REDIS_URL}}

# Enable caching in code
railway variables --service marketplace-api set ENABLE_RESPONSE_CACHING=true
```

### Database Optimization

```bash
# Add database indexes
railway run --service marketplace-api -- npx prisma migrate dev --name add_indexes

# Analyze slow queries
# Dashboard → PostgreSQL → Logs
# Look for "slow query" warnings

# Enable connection pooling
railway variables --service marketplace-api set DATABASE_POOL_SIZE=20
```

### CDN for Static Assets

```text
1. Upload static assets to Cloudflare/AWS CloudFront
2. Update environment variables:
   railway variables --service studio set CDN_URL=https://cdn.holoscript.net
3. Reference CDN in app code
```

---

## 🔄 Regular Maintenance Tasks

### Daily

- [ ] Monitor service health (`railway status`)
- [ ] Check error logs (`railway logs --service <name>`)
- [ ] Review resource usage (Dashboard → Metrics)

### Weekly

- [ ] Review deployment history
- [ ] Check for failed builds
- [ ] Update dependencies (`pnpm update`)
- [ ] Run security audit (`pnpm audit`)

### Monthly

- [ ] Database backup
- [ ] Review and optimize queries
- [ ] Update Railway plan if needed
- [ ] Rotate API keys (if required by policy)
- [ ] Review and archive old logs

---

## 📞 Getting Help

### Railway Support

```bash
# Railway Discord: https://discord.gg/railway
# Railway Docs: https://docs.railway.app
# Railway Status: https://status.railway.app
```

### HoloScript Team

- **Deployment Issues**: Check [FRONTEND_DEPLOYMENT_PLAN.md](FRONTEND_DEPLOYMENT_PLAN.md)
- **Quick Commands**: See [DEPLOYMENT_QUICK_REFERENCE.md](DEPLOYMENT_QUICK_REFERENCE.md)
- **Environment Setup**: Reference [.env.example](.env.example)

---

## 🎯 Common Tasks Quick Reference

```bash
# Deploy update
railway up --service studio

# View logs
railway logs --service studio --tail

# Update environment variable
railway variables --service studio set KEY=value

# Restart service
railway restart --service studio

# Rollback deployment
railway rollback --service studio

# Run database migration
railway run --service marketplace-api npm run migrate

# Check health
curl https://studio.holoscript.net/api/health

# Connect to database
railway connect marketplace-api
```

---

**Last Updated**: 2026-02-21
**Deployment Status**: ✅ Production Live
**Next Review**: 2026-03-21
