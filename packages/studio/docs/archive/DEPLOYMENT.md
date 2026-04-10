# HoloScript Studio - Production Deployment Guide

This guide covers deploying HoloScript Studio with all Phase 3 enhancements: Marketplace, Plugin System, Cloud Deployment, Collaborative Editing, and Version Control.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Configuration](#environment-configuration)
3. [Backend Services](#backend-services)
4. [Frontend Deployment](#frontend-deployment)
5. [Production Checklist](#production-checklist)
6. [Monitoring & Analytics](#monitoring--analytics)

---

## Prerequisites

### Required Services

- **Next.js 15.5+** - Frontend framework
- **Node.js 18+** - Runtime environment
- **PostgreSQL 14+** - Database for marketplace, user data
- **Redis 7+** - Session storage, caching
- **WebSocket Server** - Real-time collaboration (Yjs)
- **S3-compatible storage** - Asset storage (AWS S3, Cloudflare R2, MinIO)

### Required Domains/Subdomains

- `holoscript.net` - Main website
- `studio.holoscript.net` - Studio application
- `marketplace.holoscript.net` - Marketplace API
- `cloud.holoscript.net` - Cloud deployment API
- `collab.holoscript.net` - Collaboration WebSocket server

---

## Environment Configuration

### Studio Frontend (.env.production)

```bash
# Core Configuration
NEXT_PUBLIC_APP_URL=https://studio.holoscript.net
NODE_ENV=production

# API Endpoints
NEXT_PUBLIC_MARKETPLACE_URL=https://marketplace.holoscript.net/api
NEXT_PUBLIC_CLOUD_API_URL=https://cloud.holoscript.net/api
NEXT_PUBLIC_COLLABORATION_WS=wss://collab.holoscript.net

# Authentication (choose one)
NEXTAUTH_URL=https://studio.holoscript.net
NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>

# OAuth Providers (optional)
GITHUB_CLIENT_ID=<your-github-oauth-client-id>
GITHUB_CLIENT_SECRET=<your-github-oauth-secret>
GOOGLE_CLIENT_ID=<your-google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<your-google-oauth-secret>

# Analytics
NEXT_PUBLIC_GTAG_ID=G-XXXXXXXXXX

# Feature Flags
NEXT_PUBLIC_ENABLE_COLLABORATION=true
NEXT_PUBLIC_ENABLE_MARKETPLACE=true
NEXT_PUBLIC_ENABLE_CLOUD_DEPLOY=true
NEXT_PUBLIC_ENABLE_PLUGINS=true

# Rate Limiting
RATE_LIMIT_REQUESTS_PER_MINUTE=100
RATE_LIMIT_REQUESTS_PER_HOUR=1000
```

### Marketplace API (.env.production)

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/marketplace
REDIS_URL=redis://localhost:6379

# Storage
S3_BUCKET=holoscript-marketplace
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=<aws-access-key>
S3_SECRET_ACCESS_KEY=<aws-secret-key>
S3_ENDPOINT=https://s3.amazonaws.com  # or Cloudflare R2

# Security
API_SECRET_KEY=<generate-with-openssl-rand-hex-32>
ALLOWED_ORIGINS=https://studio.holoscript.net

# Moderation
ENABLE_AUTO_MODERATION=true
MAX_TEMPLATE_SIZE_MB=10
MAX_UPLOAD_SIZE_MB=50
```

### Cloud Deployment API (.env.production)

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/cloud_deploy
REDIS_URL=redis://localhost:6379

# Cloud Providers
AWS_ACCESS_KEY_ID=<aws-key>
AWS_SECRET_ACCESS_KEY=<aws-secret>
AWS_REGION=us-east-1

CLOUDFLARE_ACCOUNT_ID=<cloudflare-account>
CLOUDFLARE_API_TOKEN=<cloudflare-token>

# Deployment Limits
MAX_DEPLOYMENTS_PER_USER=10
MAX_MEMORY_MB=3072
MAX_TIMEOUT_SECONDS=900
```

### Collaboration WebSocket Server (.env.production)

```bash
# Server Configuration
WS_PORT=8080
WS_HOST=0.0.0.0

# Redis (for scaling across multiple servers)
REDIS_URL=redis://localhost:6379

# Security
ALLOWED_ORIGINS=https://studio.holoscript.net
WS_SECRET_KEY=<generate-with-openssl-rand-hex-32>

# Performance
MAX_CONNECTIONS_PER_SESSION=50
MESSAGE_RATE_LIMIT=100  # messages per minute per user
SESSION_TIMEOUT_MS=3600000  # 1 hour
```

---

## Backend Services

### 1. Marketplace API

**Technology:** Node.js + Express + Prisma

```bash
# Install dependencies
cd packages/marketplace-api
npm install

# Run database migrations
npx prisma migrate deploy

# Start production server
npm run start
```

**Database Schema (Prisma):**

```prisma
model Template {
  id          String   @id @default(cuid())
  type        String   // 'workflow' | 'behavior-tree'
  name        String
  description String
  author      User     @relation(fields: [authorId], references: [id])
  authorId    String
  category    String
  tags        String[]
  thumbnail   String
  fileUrl     String   // S3 URL
  downloads   Int      @default(0)
  rating      Float    @default(0)
  ratings     Rating[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model User {
  id        String     @id @default(cuid())
  email     String     @unique
  name      String
  avatar    String?
  templates Template[]
  ratings   Rating[]
}

model Rating {
  id         String   @id @default(cuid())
  template   Template @relation(fields: [templateId], references: [id])
  templateId String
  user       User     @relation(fields: [userId], references: [id])
  userId     String
  rating     Int      // 1-5
  comment    String?
  createdAt  DateTime @default(now())
}
```

**Deployment (Docker):**

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "start"]
```

### 2. Cloud Deployment API

**Technology:** Node.js + Express + AWS SDK

```bash
cd packages/cloud-api
npm install
npm run start
```

**Key Features:**

- Workflow compilation to serverless functions
- Multi-cloud support (AWS Lambda, Cloudflare Workers, Vercel Edge)
- Execution monitoring and logs
- API key management

**Example Route:**

```typescript
// POST /deployments
router.post('/deployments', authenticate, async (req, res) => {
  const { workflowId, name, target } = req.body;

  // Compile workflow to function
  const compiled = await compileWorkflow(workflowId);

  // Deploy to target
  const deployment = await deployToProvider(target, compiled);

  // Store deployment metadata
  await prisma.deployment.create({
    data: {
      userId: req.user.id,
      workflowId,
      name,
      endpoint: deployment.url,
      status: 'active',
    },
  });

  res.json({ endpoint: deployment.url });
});
```

### 3. Collaboration WebSocket Server

**Technology:** Node.js + y-websocket + Redis

```typescript
import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws, req) => {
  const sessionId = new URL(req.url, 'ws://localhost').searchParams.get('room');

  setupWSConnection(ws, req, {
    docName: sessionId,
    gc: true, // Enable garbage collection
  });

  // Track active users in Redis
  const userId = new URL(req.url, 'ws://localhost').searchParams.get('userId');
  redis.sadd(`session:${sessionId}:users`, userId);

  ws.on('close', () => {
    redis.srem(`session:${sessionId}:users`, userId);
  });
});
```

**Deployment (Systemd Service):**

```ini
[Unit]
Description=HoloScript Collaboration WebSocket Server
After=network.target

[Service]
Type=simple
User=holoscript
WorkingDirectory=/var/www/collab-ws
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=WS_PORT=8080

[Install]
WantedBy=multi-user.target
```

---

## Frontend Deployment

### Build & Deploy

```bash
# Build Studio
cd packages/studio
npm run build

# Deploy to Vercel (recommended)
vercel --prod

# Or deploy to custom server
npm run start  # Starts Next.js production server on port 3100
```

### Nginx Configuration

```nginx
# Studio Frontend
server {
  listen 443 ssl http2;
  server_name studio.holoscript.net;

  ssl_certificate /etc/letsencrypt/live/holoscript.net/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/holoscript.net/privkey.pem;

  location / {
    proxy_pass http://localhost:3100;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}

# Collaboration WebSocket
server {
  listen 443 ssl http2;
  server_name collab.holoscript.net;

  ssl_certificate /etc/letsencrypt/live/holoscript.net/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/holoscript.net/privkey.pem;

  location / {
    proxy_pass http://localhost:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;  # 24 hours for long-lived connections
  }
}
```

---

## Production Checklist

### Security

- [ ] Enable HTTPS/TLS on all domains
- [ ] Set up CORS policies (restrict origins)
- [ ] Implement rate limiting (API & WebSocket)
- [ ] Use environment variables for secrets (never commit)
- [ ] Enable API key authentication
- [ ] Set up Web Application Firewall (Cloudflare, AWS WAF)
- [ ] Sanitize user-uploaded templates (prevent XSS)
- [ ] Enable Content Security Policy (CSP)

### Performance

- [ ] Enable CDN for static assets (Cloudflare, CloudFront)
- [ ] Set up Redis caching for API responses
- [ ] Enable database connection pooling
- [ ] Configure WebSocket horizontal scaling (Redis adapter)
- [ ] Optimize Docker images (multi-stage builds)
- [ ] Enable gzip/brotli compression

### Monitoring

- [ ] Set up error tracking (Sentry, Rollbar)
- [ ] Configure application logs (CloudWatch, Datadog)
- [ ] Set up uptime monitoring (UptimeRobot, Pingdom)
- [ ] Monitor WebSocket connection health
- [ ] Track API response times (p50, p95, p99)
- [ ] Set up alerts for high error rates

### Backup & Recovery

- [ ] Daily database backups (PostgreSQL)
- [ ] Weekly full system snapshots
- [ ] S3 bucket versioning enabled
- [ ] Disaster recovery plan documented
- [ ] Test restore procedures quarterly

---

## Monitoring & Analytics

### Google Analytics Setup

```typescript
// packages/studio/src/lib/gtag.ts
export const GA_TRACKING_ID = process.env.NEXT_PUBLIC_GTAG_ID;

export const pageview = (url: string) => {
  window.gtag('config', GA_TRACKING_ID, {
    page_path: url,
  });
};

export const event = ({
  action,
  category,
  label,
  value,
}: {
  action: string;
  category: string;
  label: string;
  value?: number;
}) => {
  window.gtag('event', action, {
    event_category: category,
    event_label: label,
    value: value,
  });
};
```

**Key Events to Track:**

- `workflow_created` - User creates new workflow
- `template_used` - User loads template from marketplace
- `plugin_installed` - Plugin installation
- `deployment_created` - Workflow deployed to cloud
- `collaboration_joined` - User joins collaborative session
- `commit_created` - Version control commit

### Grafana Dashboard

Example metrics to visualize:

```promql
# Active WebSocket connections
holoscript_ws_connections{service="collab"}

# API latency
histogram_quantile(0.95, holoscript_api_request_duration_seconds)

# Deployment success rate
rate(holoscript_deployments_total{status="success"}[5m]) /
rate(holoscript_deployments_total[5m])

# Marketplace downloads
rate(holoscript_marketplace_downloads_total[1h])
```

---

## Scaling Considerations

### Horizontal Scaling

**Studio Frontend:**

- Deploy behind load balancer (ALB, Nginx)
- Use Next.js multi-instance mode
- Share session state via Redis

**Collaboration WebSocket:**

- Use Redis adapter for multi-server synchronization
- Sticky sessions for WebSocket connections
- Auto-scaling based on connection count

**Database:**

- Read replicas for heavy read operations
- Connection pooling (PgBouncer)
- Partitioning for large tables (templates, ratings)

---

## Support & Resources

- **Documentation:** https://holoscript.net/docs
- **Community Forum:** https://holoscript.net/community
- **GitHub Issues:** https://github.com/holoscript/holoscript/issues
- **Discord:** https://discord.gg/holoscript

---

## License

MIT License - see LICENSE file for details.

**Last Updated:** February 2026
