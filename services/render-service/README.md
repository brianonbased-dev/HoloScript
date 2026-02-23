# HoloScript Render Service

HTTP service for rendering HoloScript previews and enabling social sharing on X (Twitter).

**Live Deployment:** https://holoscript-render.onrender.com

## Features

- **Share Endpoint** - Create shareable scene links
- **Embed Pages** - Twitter Card compatible embeds
- **Preview Rendering** - Live Three.js previews
- **QR Codes** - For mobile XR access
- **WebXR Support** - VR/AR ready renders
- **Playground** - Interactive editor

## Quick Start

```bash
# Install dependencies
npm install

# Start server
npm start

# Development mode (auto-reload)
npm run dev
```

## API Endpoints

### POST /share

Create a shareable scene.

```bash
curl -X POST http://localhost:3000/share \
  -H "Content-Type: application/json" \
  -d '{
    "code": "object Ball @grabbable { geometry: sphere }",
    "title": "My Scene",
    "description": "A cool 3D scene"
  }'
```

Response:

```json
{
  "id": "abc12345",
  "playground": "https://play.holoscript.net?scene=abc12345",
  "embed": "https://api.holoscript.net/embed/abc12345",
  "preview": "https://api.holoscript.net/preview/abc12345",
  "qr": "https://api.holoscript.net/qr/abc12345"
}
```

### GET /embed/:id

Returns HTML page with Twitter Card meta tags for rich embeds on X.

### GET /preview/:id

Returns a Three.js rendered preview of the scene.

### GET /render/:id

Returns full WebXR-enabled render page.

### GET /qr/:id

Returns QR code PNG for mobile access.

### GET /inline?code=BASE64

Render code directly from base64-encoded query param.

### GET /playground

Interactive HoloScript editor and preview.

## Deployment

### Docker

```bash
docker build -t holoscript-render .
docker run -p 3000:3000 -e BASE_URL=https://api.holoscript.net holoscript-render
```

### Environment Variables

| Variable         | Default                     | Description          |
| ---------------- | --------------------------- | -------------------- |
| `PORT`           | 3000                        | HTTP port            |
| `BASE_URL`       | https://api.holoscript.net  | Public URL for links |
| `PLAYGROUND_URL` | https://play.holoscript.net | Playground URL       |

### Cloud Deployment

**Fly.io:**

```bash
fly launch
fly deploy
```

**Railway:**

```bash
railway up
```

**Render.com:**

- Create new Web Service
- Connect GitHub repo
- Set root directory to `services/render-service`
- Deploy

## Twitter Card Integration

The embed pages include proper Twitter Card meta tags:

```html
<meta name="twitter:card" content="player" />
<meta name="twitter:player" content="https://api.holoscript.net/render/abc123" />
<meta name="twitter:player:width" content="480" />
<meta name="twitter:player:height" content="480" />
```

When shared on X, scenes will show as interactive player cards.

## License

MIT
