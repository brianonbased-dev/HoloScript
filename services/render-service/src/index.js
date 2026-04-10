import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import QRCode from 'qrcode';
import { pathToFileURL } from 'url';
import { parseHoloScriptCode } from './parseScene.js';

export function createApp(options = {}) {
  const port = options.port ?? process.env.PORT ?? 3000;
  const baseUrl = options.baseUrl ?? process.env.BASE_URL ?? `http://localhost:${port}`;
  const playgroundUrl = options.playgroundUrl ?? process.env.PLAYGROUND_URL ?? baseUrl;

  const app = express();
  const scenes = new Map();

  app.use(cors());
  app.use(compression());
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'holoscript-render',
      parser: 'parseScene.js',
      sceneCount: scenes.size,
    });
  });

  app.post('/share', (req, res) => {
    const { code, title, description } = req.body ?? {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'code is required' });
    }

    const id = Math.random().toString(36).slice(2, 10);
    scenes.set(id, {
      id,
      code,
      title: title || 'HoloScript Scene',
      description: description || 'Interactive 3D scene built with HoloScript',
      createdAt: new Date().toISOString(),
    });

    return res.json({
      id,
      playground: `${playgroundUrl}?scene=${id}`,
      embed: `${baseUrl}/embed/${id}`,
      preview: `${baseUrl}/preview/${id}`,
      qr: `${baseUrl}/qr/${id}`,
      raw: `${baseUrl}/scene/${id}`,
    });
  });

  app.get('/scene/:id', (req, res) => {
    const scene = scenes.get(req.params.id);
    if (!scene) return res.status(404).json({ error: 'Scene not found' });
    return res.json(scene);
  });

  app.get('/scene/:id/parsed', (req, res) => {
    const scene = scenes.get(req.params.id);
    if (!scene) return res.status(404).json({ error: 'Scene not found' });
    return res.json(parseHoloScriptCode(scene.code));
  });

  app.get('/qr/:id', async (req, res) => {
    try {
      const url = `${playgroundUrl}?scene=${req.params.id}`;
      const qrDataUrl = await QRCode.toDataURL(url, {
        width: 200,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      });

      const base64 = qrDataUrl.split(',')[1];
      const buffer = Buffer.from(base64, 'base64');
      return res.type('image/png').send(buffer);
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to generate QR code' });
    }
  });

  app.get('/embed/:id', (req, res) => {
    const scene = scenes.get(req.params.id);
    if (!scene) return res.status(404).send('Scene not found');
    return res.type('text/html').send(`<html><body><h1>${scene.title}</h1><p>${scene.description}</p></body></html>`);
  });

  app.get('/preview/:id', (req, res) => {
    const scene = scenes.get(req.params.id);
    if (!scene) return res.status(404).send('Scene not found');
    return res.type('application/json').send(JSON.stringify(parseHoloScriptCode(scene.code), null, 2));
  });

  return app;
}

export function startServer(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? 3000);
  const app = createApp({ ...options, port });
  const server = app.listen(port, () => {
    console.log(`HoloScript Render Service listening on port ${port}`);
  });
  return { app, server, port };
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  startServer();
}
