# HoloScript Documentation Deployment

## Quick Deploy Options

### Vercel (Recommended - Free)

```bash
cd docs
npx vercel
```

Then add custom domain `holoscript.net` in Vercel dashboard.

### Netlify

```bash
cd docs
npx netlify deploy --prod --dir .vitepress/dist
```

### Cloudflare Pages

1. Push to GitHub
2. Connect repo to Cloudflare Pages
3. Build command: `cd docs && pnpm build`
4. Output directory: `docs/.vitepress/dist`
5. Add custom domain: holoscript.net

### AWS (Hololamba - S3 + CloudFront)

```bash
# Build
cd docs && pnpm build

# Deploy to S3
aws s3 sync .vitepress/dist s3://holoscript-docs --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id XXXXX --paths "/*"
```

## Domain Setup (holoscript.net)

### DNS Records

| Type  | Name | Value          |
| ----- | ---- | -------------- |
| A     | @    | (platform IP)  |
| CNAME | www  | holoscript.net |

### SSL

All platforms above provide free SSL certificates.

## CI/CD with GitHub Actions

Create `.github/workflows/docs.yml`:

```yaml
name: Deploy Docs

on:
  push:
    branches: [main]
    paths: ['docs/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install and Build
        run: |
          cd docs
          pnpm install
          pnpm build

      # Add deployment step for your platform
```
