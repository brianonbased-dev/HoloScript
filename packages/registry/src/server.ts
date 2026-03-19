/**
 * HoloScript Registry Server
 *
 * Package registry + team workspace API.
 * Runs as a standalone Express service on Railway.
 */

import express from 'express';
import { workspacesRouter } from './api/workspaces.js';
import { LocalRegistry } from './LocalRegistry.js';
import { PackageResolver } from './PackageResolver.js';
import { AccessControl } from './access/AccessControl.js';
import { TokenManager } from './auth/TokenManager.js';
import { CertificationChecker, generateBadge, generateBadgeSVG } from './certification/Checker.js';
import type { Package } from './types.js';

// ─── Singletons ──────────────────────────────────────────────────────────────

const registry = new LocalRegistry();
const resolver = new PackageResolver(registry);
const accessControl = new AccessControl();
const tokenManager = new TokenManager();

// ─── Express App ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '10mb' }));

// CORS
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (_req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'holoscript-registry',
    version: '3.9.0',
    uptime: process.uptime(),
    packages: registry.size,
    tokens: tokenManager.size,
  });
});

// ─── Package Routes ──────────────────────────────────────────────────────────

// Search packages
app.get('/api/packages', (req, res) => {
  const query = req.query.q as string | undefined;
  const tag = req.query.tag as string | undefined;

  if (query) {
    return res.json({ packages: registry.search(query) });
  }
  res.json({ packages: registry.list(tag) });
});

// Get package
app.get('/api/packages/:name', (req, res) => {
  const pkg = registry.getPackage(req.params.name);
  if (!pkg) return res.status(404).json({ error: 'Package not found' });
  registry.recordDownload(req.params.name);
  res.json(pkg);
});

// Get specific version
app.get('/api/packages/:name/:version', (req, res) => {
  const version = registry.getVersion(req.params.name, req.params.version);
  if (!version) return res.status(404).json({ error: 'Version not found' });
  res.json(version);
});

// Resolve version range
app.get('/api/resolve/:name', (req, res) => {
  const range = (req.query.range as string) || '*';
  const resolved = resolver.resolve(req.params.name, range);
  if (!resolved) return res.status(404).json({ error: 'No matching version' });
  res.json(resolved);
});

// Publish package (requires auth)
app.post('/api/packages', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const result = tokenManager.validate(authHeader.slice(7));
  if (!result.valid) {
    return res.status(401).json({ error: result.reason });
  }

  if (!tokenManager.hasPermission(result.record!, 'publish')) {
    return res.status(403).json({ error: 'Token lacks publish permission' });
  }

  const { name, version, description, author, tags, content } = req.body;
  if (!name || !version || !content) {
    return res.status(400).json({ error: 'name, version, and content are required' });
  }

  // Check access control for private packages
  if (!accessControl.canAccess(name, result.record!.orgScope, 'write')) {
    return res.status(403).json({ error: 'No write access to this package' });
  }

  try {
    const manifest = registry.publish({ name, version, description, author, tags, content });
    res.status(201).json(manifest);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Publish failed';
    res.status(409).json({ error: message });
  }
});

// Unpublish package
app.delete('/api/packages/:name', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const result = tokenManager.validate(authHeader.slice(7));
  if (!result.valid || !tokenManager.hasPermission(result.record!, 'admin')) {
    return res.status(403).json({ error: 'Admin permission required' });
  }

  const deleted = registry.unpublish(req.params.name);
  if (!deleted) return res.status(404).json({ error: 'Package not found' });
  res.status(204).end();
});

// Unpublish specific version
app.delete('/api/packages/:name/:version', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const result = tokenManager.validate(authHeader.slice(7));
  if (!result.valid || !tokenManager.hasPermission(result.record!, 'admin')) {
    return res.status(403).json({ error: 'Admin permission required' });
  }

  const deleted = registry.unpublishVersion(req.params.name, req.params.version);
  if (!deleted) return res.status(404).json({ error: 'Version not found' });
  res.status(204).end();
});

// ─── Access Control Routes ───────────────────────────────────────────────────

// Create organization
app.post('/api/orgs', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const result = tokenManager.validate(authHeader.slice(7));
  if (!result.valid) return res.status(401).json({ error: result.reason });

  const { name, displayName } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  try {
    const org = accessControl.createOrg(name, result.record!.orgScope, displayName);
    res.status(201).json(org);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create org';
    res.status(409).json({ error: message });
  }
});

// List organizations
app.get('/api/orgs', (_req, res) => {
  res.json({ organizations: accessControl.listOrgs() });
});

// ─── Token Routes ────────────────────────────────────────────────────────────

// Create token (admin only)
app.post('/api/tokens', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const authResult = tokenManager.validate(authHeader.slice(7));
  if (!authResult.valid || !tokenManager.hasPermission(authResult.record!, 'admin')) {
    return res.status(403).json({ error: 'Admin permission required' });
  }

  const { name, orgScope, permissions, readonly, expiresIn } = req.body;
  if (!name || !orgScope) {
    return res.status(400).json({ error: 'name and orgScope are required' });
  }

  const { rawToken, record } = tokenManager.create({
    name,
    orgScope,
    permissions,
    readonly,
    expiresIn,
  });

  res.status(201).json({ token: rawToken, id: record.id, expiresAt: record.expiresAt });
});

// Revoke token
app.delete('/api/tokens/:id', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const authResult = tokenManager.validate(authHeader.slice(7));
  if (!authResult.valid || !tokenManager.hasPermission(authResult.record!, 'admin')) {
    return res.status(403).json({ error: 'Admin permission required' });
  }

  const revoked = tokenManager.revoke(req.params.id);
  if (!revoked) return res.status(404).json({ error: 'Token not found' });
  res.status(204).end();
});

// ─── Certification Routes ────────────────────────────────────────────────────

// Certify a package
app.post('/api/certify/:name', async (req, res) => {
  const pkg = registry.getPackage(req.params.name);
  if (!pkg) return res.status(404).json({ error: 'Package not found' });

  const packageInfo: Package = {
    name: pkg.name,
    version: pkg.latest,
    description: pkg.description,
    author: pkg.author || 'unknown',
    createdAt: new Date(),
    updatedAt: new Date(),
    downloads: pkg.downloads,
    tags: pkg.tags || [],
  };

  const files = new Map<string, string>();
  // In a real implementation, extract and read package files
  // For now, provide minimal info for certification
  files.set('package.json', JSON.stringify({ name: pkg.name, version: pkg.latest, dependencies: {} }));

  const checker = new CertificationChecker(packageInfo, files);
  const result = await checker.check();
  const badge = generateBadge(result, pkg.name, pkg.latest);

  res.json({ certification: result, badge });
});

// Get badge SVG
app.get('/badge/:name/:level.svg', (req, res) => {
  const pkg = registry.getPackage(req.params.name);
  if (!pkg) return res.status(404).send('Package not found');

  const badge = {
    packageName: req.params.name,
    version: pkg.latest,
    level: req.params.level as 'bronze' | 'silver' | 'gold' | 'platinum',
    certifiedAt: new Date(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    score: 0,
    badgeUrl: '',
  };

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(generateBadgeSVG(badge));
});

// ─── Workspace Routes ────────────────────────────────────────────────────────

app.use('/api/workspaces', workspacesRouter);

// ─── Bootstrap Admin Token ───────────────────────────────────────────────────

const BOOTSTRAP_TOKEN = process.env.REGISTRY_BOOTSTRAP_TOKEN;
if (BOOTSTRAP_TOKEN) {
  // Create an admin token for initial setup
  const { rawToken } = tokenManager.create({
    name: 'bootstrap-admin',
    orgScope: 'holoscript',
    permissions: ['admin'],
    expiresIn: 365 * 24 * 60 * 60, // 1 year
  });
  console.log(`[registry] Bootstrap admin token created (use REGISTRY_BOOTSTRAP_TOKEN env to disable)`);
  console.log(`[registry] Token: ${rawToken}`);
}

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3001', 10);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[registry] HoloScript Registry v3.9.0 listening on port ${PORT}`);
  console.log(`[registry] Health:     http://localhost:${PORT}/health`);
  console.log(`[registry] Packages:   http://localhost:${PORT}/api/packages`);
  console.log(`[registry] Workspaces: http://localhost:${PORT}/api/workspaces`);
  console.log(`[registry] Orgs:       http://localhost:${PORT}/api/orgs`);
});

export { app, registry, resolver, accessControl, tokenManager };
