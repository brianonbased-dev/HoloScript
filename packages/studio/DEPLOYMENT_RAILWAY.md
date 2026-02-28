# HoloScript Studio - Railway Deployment Guide

**Cost-Effective Deployment:** ~$15-30/month total (vs $150-200/month on AWS)

Railway is a Platform-as-a-Service that handles all infrastructure automatically. Perfect for HoloScript Studio!

---

## Why Railway?

- ✅ **Cheap:** $5-30/month for everything (vs $150-200 on AWS)
- ✅ **Simple:** No DevOps knowledge required
- ✅ **Fast:** Deploy in minutes, not hours
- ✅ **Scalable:** Auto-scales with traffic
- ✅ **Integrated:** PostgreSQL, Redis, domains all included
- ✅ **Free Tier:** Great for development/testing

---

## Cost Breakdown (Realistic)

### Small Deployment (10-100 users)

| Service | Railway Cost | AWS Equivalent |
|---------|-------------|----------------|
| Studio Frontend (Next.js) | $8-15/month | $30-50/month |
| PostgreSQL (1GB) | $5-8/month | $15-25/month |
| Redis (256MB) | $2-5/month | $10-15/month |
| WebSocket Server | $5-10/month | $20-40/month |
| Marketplace API | $5-10/month | $20-40/month |
| Cloud Deploy API | $5-10/month | $20-40/month |
| **TOTAL** | **$30-58/month** | **$115-210/month** |

### Development (Free Tier)

- Railway Free: $5 credit/month
  - Can run 1-2 services (frontend + database OR websocket + database)
  - Perfect for testing and development
- **Total: $0/month** ✅ (with careful resource management)

### Medium Deployment (100-1000 users)
- Railway Pro: ~$50-80/month
- Still way cheaper than AWS: ~$200-400/month

---

## Quick Start (5 Minutes)

### 1. Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

### 2. Create New Project

```bash
railway init
# Choose: "Empty Project"
# Name: holoscript-studio
```

### 3. Add Services

```bash
# Add PostgreSQL
railway add --database postgresql

# Add Redis
railway add --database redis

# Get connection strings
railway variables
```

---

## Service Deployment

### Service 1: Collaboration WebSocket Server

**File:** `packages/collab-ws/server.js`

```javascript
import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';
import Redis from 'ioredis';

const PORT = process.env.PORT || 8080;
const REDIS_URL = process.env.REDIS_URL;

const redis = REDIS_URL ? new Redis(REDIS_URL) : null;
const wss = new WebSocketServer({ port: PORT });

console.log(`WebSocket server listening on port ${PORT}`);

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'ws://localhost');
  const sessionId = url.searchParams.get('room');
  const userId = url.searchParams.get('userId');

  console.log(`User ${userId} joined session ${sessionId}`);

  setupWSConnection(ws, req, {
    docName: sessionId,
    gc: true,
  });

  // Track active users (if Redis available)
  if (redis && sessionId && userId) {
    redis.sadd(`session:${sessionId}:users`, userId);
    ws.on('close', () => {
      redis.srem(`session:${sessionId}:users`, userId);
    });
  }
});
```

**Deploy to Railway:**

```bash
cd packages/collab-ws
npm init -y
npm install ws y-websocket ioredis

# Create railway.json
cat > railway.json << 'EOF'
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node server.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
EOF

# Deploy
railway up

# Set custom domain
railway domain
# Enter: collab.holoscript.net
```

**Environment Variables (Railway Dashboard):**
```
PORT=8080
REDIS_URL=${{Redis.REDIS_URL}}  # Auto-linked
NODE_ENV=production
```

**Cost:** ~$5-10/month (scales with connections)

---

### Service 2: Marketplace API

**File:** `packages/marketplace-api/index.js`

```javascript
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') }));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get templates
app.get('/api/templates', async (req, res) => {
  const { category, search, limit = 20 } = req.query;

  const templates = await prisma.template.findMany({
    where: {
      ...(category && { category }),
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
    },
    take: parseInt(limit),
    orderBy: { downloads: 'desc' },
  });

  res.json(templates);
});

// Upload template
app.post('/api/templates', async (req, res) => {
  const { name, description, category, tags, fileUrl, authorId } = req.body;

  const template = await prisma.template.create({
    data: { name, description, category, tags, fileUrl, authorId },
  });

  res.json(template);
});

// Download template
app.get('/api/templates/:id/download', async (req, res) => {
  const template = await prisma.template.update({
    where: { id: req.params.id },
    data: { downloads: { increment: 1 } },
  });

  res.json(template);
});

app.listen(PORT, () => {
  console.log(`Marketplace API listening on port ${PORT}`);
});
```

**Deploy:**

```bash
cd packages/marketplace-api
npm init -y
npm install express cors @prisma/client
npm install -D prisma

# Initialize Prisma
npx prisma init

# Create schema (prisma/schema.prisma)
# ... see DEPLOYMENT.md for schema

# Deploy
railway up

# Run migrations
railway run npx prisma migrate deploy

# Set custom domain
railway domain
# Enter: marketplace.holoscript.net
```

**Environment Variables:**
```
DATABASE_URL=${{Postgres.DATABASE_URL}}  # Auto-linked
REDIS_URL=${{Redis.REDIS_URL}}           # Auto-linked
ALLOWED_ORIGINS=https://studio.holoscript.net
NODE_ENV=production
```

**Cost:** ~$5-10/month (API) + $5-8/month (PostgreSQL)

---

### Service 3: Cloud Deployment API

**Similar to Marketplace API but with AWS SDK integration**

**Cost:** ~$5-10/month

---

### Service 4: Studio Frontend (Next.js)

**Deploy to Railway:**

```bash
cd packages/studio

# Deploy
railway up

# Set custom domain
railway domain
# Enter: studio.holoscript.net
```

**Environment Variables (Railway Dashboard):**
```
NEXT_PUBLIC_MARKETPLACE_URL=https://marketplace.holoscript.net/api
NEXT_PUBLIC_CLOUD_API_URL=https://cloud.holoscript.net/api
NEXT_PUBLIC_COLLABORATION_WS=wss://collab.holoscript.net
NODE_ENV=production
```

**railway.json (optional - for optimization):**
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

**Cost:** ~$8-15/month (Next.js can use more RAM)

---

## Railway Project Structure

```
holoscript-studio/
├── studio-frontend    ($8-15/month) - Next.js
├── collab-ws          ($5-10/month)
├── marketplace-api    ($5-10/month)
├── cloud-api          ($5-10/month)
├── postgres           ($5-8/month)
└── redis              ($2-5/month)
```

**Total:** ~$30-58/month (vs $150-200 on AWS)
**Savings:** Still 70-80% cheaper than AWS!

---

## Environment Variables Setup

### Railway Dashboard

For each service, set these variables:

**collab-ws:**
```bash
PORT=8080
REDIS_URL=${{Redis.REDIS_URL}}
ALLOWED_ORIGINS=https://studio.holoscript.net
NODE_ENV=production
```

**marketplace-api:**
```bash
PORT=3000
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
ALLOWED_ORIGINS=https://studio.holoscript.net
S3_BUCKET=holoscript-marketplace
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=<your-key>
S3_SECRET_ACCESS_KEY=<your-secret>
NODE_ENV=production
```

**cloud-api:**
```bash
PORT=3001
DATABASE_URL=${{Postgres.DATABASE_URL}}
AWS_ACCESS_KEY_ID=<your-key>
AWS_SECRET_ACCESS_KEY=<your-secret>
AWS_REGION=us-east-1
NODE_ENV=production
```

---

## Custom Domains

Railway makes custom domains easy:

```bash
# For each service
railway domain

# Enter your subdomain:
# - collab.holoscript.net
# - marketplace.holoscript.net
# - cloud.holoscript.net
```

Then add DNS records (Railway shows exact CNAME):
```
CNAME collab      -> <railway-provided-url>
CNAME marketplace -> <railway-provided-url>
CNAME cloud       -> <railway-provided-url>
```

---

## Scaling

Railway auto-scales based on usage:

**Free Tier (Development):**
- 512MB RAM per service
- $5 credit/month
- Perfect for testing

**Hobby Plan ($5/month):**
- Up to 8GB RAM total
- Great for small apps (10-100 users)

**Pro Plan ($20/month + usage):**
- Up to 32GB RAM total
- Better for 100-1000 users
- Priority support

---

## Monitoring

Railway provides built-in monitoring:

```bash
# View logs
railway logs

# View metrics (CPU, RAM, Network)
railway status

# View deployments
railway list
```

**Dashboard shows:**
- CPU/RAM usage
- Request count
- Error rates
- Response times

---

## Cost Optimization Tips

### 1. Use Vercel for Frontend ($0)
Instead of Railway for Next.js, use Vercel free tier.

### 2. Start Small
Use Railway Free tier ($5 credit) for development. Upgrade to Hobby ($5/month) only when needed.

### 3. Combine Services
Run Marketplace + Cloud API in same container to save costs.

### 4. Use Cloudflare R2 instead of S3
- Cloudflare R2: $0.015/GB/month
- AWS S3: $0.023/GB/month
- Saves ~35% on storage

### 5. Enable Caching
Use Redis for API responses to reduce database queries.

---

## Real-World Costs

### Scenario 1: Solo Developer (Free!)
- Railway Free: $5 credit (enough for 1-2 services)
- Vercel Free: Frontend
- Cloudflare Free: DNS + CDN
- **Total: $0/month** ✅

### Scenario 2: Small Startup (10-50 users)
- Railway Hobby: $5/month
- Services: ~$15-25/month usage
- Vercel Free: Frontend
- **Total: $20-30/month** ✅

### Scenario 3: Growing Project (100-500 users)
- Railway Pro: $20/month
- Services: ~$30-60/month usage
- Vercel Pro: $20/month (optional)
- **Total: $50-100/month** ✅

Still way cheaper than AWS ($200-400/month)!

---

## Migration from Development to Production

### Step 1: Test Locally
```bash
# Set up local .env with Railway URLs
railway variables --json > .env

# Test all services
npm run dev
```

### Step 2: Deploy Staging
```bash
# Create staging environment
railway environment create staging

# Deploy to staging
railway up --environment staging
```

### Step 3: Deploy Production
```bash
# Switch to production
railway environment create production

# Deploy
railway up --environment production

# Set custom domains
railway domain
```

---

## Troubleshooting

### Service Won't Start
```bash
# Check logs
railway logs --tail

# Check environment variables
railway variables

# Restart service
railway restart
```

### Database Connection Issues
```bash
# Verify DATABASE_URL is set
railway variables | grep DATABASE_URL

# Test connection
railway run npx prisma db pull
```

### WebSocket Connection Fails
- Check CORS settings (ALLOWED_ORIGINS)
- Verify custom domain DNS (CNAME record)
- Check Railway firewall (should be open by default)

---

## Comparison: Railway vs AWS

| Feature | Railway | AWS |
|---------|---------|-----|
| **Setup Time** | 5 minutes | 2-4 hours |
| **DevOps Required** | None | Lots |
| **Monthly Cost (small)** | $20-30 | $150-200 |
| **Scaling** | Automatic | Manual |
| **SSL/TLS** | Free, automatic | $5-10/month |
| **Domains** | Included | Extra setup |
| **Monitoring** | Built-in | Extra cost |
| **Learning Curve** | Easy | Steep |

**Winner:** Railway (for most cases) ✅

---

## When to Use AWS Instead

Only consider AWS if:
- You need 1000+ concurrent WebSocket connections
- You're processing 100+ deployments per day
- You need multi-region deployment
- You have specific compliance requirements
- You have enterprise budget ($500+/month)

For 99% of HoloScript Studio deployments, **Railway is perfect**.

---

## Next Steps

1. **Sign up for Railway:** https://railway.app
2. **Deploy Collaboration WS** (highest priority)
3. **Deploy Marketplace API** (second priority)
4. **Deploy Cloud API** (optional - can mock initially)
5. **Deploy Studio on Vercel** (free!)

**Estimated setup time:** 30-60 minutes for all services

---

## Support

- **Railway Docs:** https://docs.railway.app
- **Railway Discord:** https://discord.gg/railway
- **HoloScript Discord:** https://discord.gg/holoscript

---

**Last Updated:** February 28, 2026
**Estimated Monthly Cost:** $15-30 (vs $150-200 on AWS)
**Deployment Time:** 30-60 minutes (vs 4-8 hours on AWS)
