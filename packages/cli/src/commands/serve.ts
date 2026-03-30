/**
 * DevServer — `holoscript serve` with HMR
 *
 * File-watching dev server that re-parses .holo/.hs/.hsplus files on save
 * and pushes updates to connected WebSocket clients for hot module replacement.
 *
 * Part of HoloScript v5.9 "Developer Portal".
 *
 * @version 1.0.0
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync, statSync, readdirSync, watch } from 'fs';
import { resolve, extname, join, relative } from 'path';
import { EventEmitter } from 'events';

// =============================================================================
// TYPES
// =============================================================================

export interface DevServerConfig {
  /** Port to listen on (default: 8080) */
  port?: number;
  /** Root directory to serve (default: cwd) */
  root?: string;
  /** Whether to watch for file changes (default: true) */
  watch?: boolean;
  /** File extensions to watch (default: .holo, .hs, .hsplus) */
  extensions?: string[];
  /** Whether to open browser on start (default: false) */
  open?: boolean;
  /** Custom parser function */
  parser?: (code: string, filename: string) => ParseResult;
}

export interface ParseResult {
  success: boolean;
  ast?: unknown;
  errors?: ParseError[];
  warnings?: string[];
}

export interface ParseError {
  message: string;
  line?: number;
  column?: number;
  source?: string;
}

export interface HMRUpdate {
  type: 'update' | 'error' | 'full-reload';
  file: string;
  timestamp: number;
  composition?: unknown;
  errors?: ParseError[];
}

export interface DevServerStats {
  port: number;
  root: string;
  watching: boolean;
  connectedClients: number;
  filesWatched: number;
  totalUpdates: number;
  totalErrors: number;
  uptime: number;
}

// =============================================================================
// DEV SERVER
// =============================================================================

export class DevServer extends EventEmitter {
  private config: Required<Omit<DevServerConfig, 'parser'>> & {
    parser?: DevServerConfig['parser'];
  };
  private server: ReturnType<typeof createServer> | null = null;
  private wsClients: Set<ServerResponse> = new Set();
  private watchers: Array<ReturnType<typeof watch>> = [];
  private watchedFiles: Set<string> = new Set();
  private startTime = 0;
  private totalUpdates = 0;
  private totalErrors = 0;
  private compositions: Map<string, { ast: unknown; raw: string }> = new Map();

  constructor(config?: DevServerConfig) {
    super();
    this.config = {
      port: config?.port ?? 8080,
      root: config?.root ?? process.cwd(),
      watch: config?.watch ?? true,
      extensions: config?.extensions ?? ['.holo', '.hs', '.hsplus'],
      open: config?.open ?? false,
      parser: config?.parser,
    };
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Start the dev server.
   */
  async start(): Promise<void> {
    this.startTime = Date.now();

    // Scan for existing files
    this.scanDirectory(this.config.root);

    // Parse all found files
    for (const file of this.watchedFiles) {
      this.parseFile(file);
    }

    // Create HTTP server
    this.server = createServer((req, res) => this.handleRequest(req, res));

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.config.port, '127.0.0.1', () => {
        // Capture the actual assigned port (important when port=0)
        const addr = this.server!.address();
        if (addr && typeof addr === 'object') {
          this.config.port = addr.port;
        }
        this.emit('started', { port: this.config.port, root: this.config.root });
        resolve();
      });
      this.server!.on('error', reject);
    });

    // Start watching
    if (this.config.watch) {
      this.startWatching();
    }
  }

  /**
   * Stop the dev server.
   */
  async stop(): Promise<void> {
    // Close watchers
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];

    // Close SSE clients
    for (const client of this.wsClients) {
      client.end();
    }
    this.wsClients.clear();

    // Close server
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    this.emit('stopped');
  }

  // ===========================================================================
  // HTTP HANDLER
  // ===========================================================================

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url || '/';

    if (url === '/__hmr') {
      this.handleSSE(req, res);
      return;
    }

    if (url === '/dashboard') {
      this.serveDashboard(res);
      return;
    }

    if (url === '/__api/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.getStats()));
      return;
    }

    if (url === '/__api/compositions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const comps: Record<string, unknown> = {};
      for (const [file, data] of this.compositions) {
        comps[relative(this.config.root, file)] = data.ast;
      }
      res.end(JSON.stringify(comps));
      return;
    }

    // Serve error overlay page
    if (url === '/' || url === '/index.html') {
      this.serveOverlay(res);
      return;
    }

    // Static file serving
    const filePath = join(this.config.root, url);
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      const ext = extname(filePath);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(readFileSync(filePath));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }

  // ===========================================================================
  // SSE (Server-Sent Events for HMR)
  // ===========================================================================

  private handleSSE(_req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    this.wsClients.add(res);
    this.emit('client_connected', { total: this.wsClients.size });

    res.on('close', () => {
      this.wsClients.delete(res);
      this.emit('client_disconnected', { total: this.wsClients.size });
    });

    // Send initial state
    this.sendSSE(res, {
      type: 'full-reload',
      file: '',
      timestamp: Date.now(),
    });
  }

  private sendSSE(client: ServerResponse, update: HMRUpdate): void {
    client.write(`data: ${JSON.stringify(update)}\n\n`);
  }

  private broadcastUpdate(update: HMRUpdate): void {
    for (const client of this.wsClients) {
      this.sendSSE(client, update);
    }
  }

  // ===========================================================================
  // FILE WATCHING
  // ===========================================================================

  private startWatching(): void {
    const watcher = watch(this.config.root, { recursive: true }, (event, filename) => {
      if (!filename) return;
      const fullPath = resolve(this.config.root, filename);
      const ext = extname(fullPath);

      if (!this.config.extensions.includes(ext)) return;

      if (event === 'change' || event === 'rename') {
        if (existsSync(fullPath)) {
          this.watchedFiles.add(fullPath);
          this.onFileChange(fullPath);
        } else {
          this.watchedFiles.delete(fullPath);
          this.compositions.delete(fullPath);
        }
      }
    });

    this.watchers.push(watcher);
  }

  private onFileChange(filePath: string): void {
    const result = this.parseFile(filePath);
    const relPath = relative(this.config.root, filePath);

    if (result.success) {
      this.totalUpdates++;
      const update: HMRUpdate = {
        type: 'update',
        file: relPath,
        timestamp: Date.now(),
        composition: result.ast,
      };
      this.broadcastUpdate(update);
      this.emit('file_updated', { file: relPath, ast: result.ast });
    } else {
      this.totalErrors++;
      const update: HMRUpdate = {
        type: 'error',
        file: relPath,
        timestamp: Date.now(),
        errors: result.errors,
      };
      this.broadcastUpdate(update);
      this.emit('file_error', { file: relPath, errors: result.errors });
    }
  }

  // ===========================================================================
  // FILE SCANNING & PARSING
  // ===========================================================================

  private scanDirectory(dir: string): void {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return;

    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          this.scanDirectory(fullPath);
        } else if (entry.isFile() && this.config.extensions.includes(extname(entry.name))) {
          this.watchedFiles.add(fullPath);
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  private parseFile(filePath: string): ParseResult {
    try {
      const code = readFileSync(filePath, 'utf-8');

      if (this.config.parser) {
        const result = this.config.parser(code, filePath);
        if (result.success && result.ast) {
          this.compositions.set(filePath, { ast: result.ast, raw: code });
        }
        return result;
      }

      // Default: store raw code as composition
      this.compositions.set(filePath, {
        ast: { source: code, lines: code.split('\n').length },
        raw: code,
      });
      return { success: true, ast: { source: code, lines: code.split('\n').length } };
    } catch (err) {
      return {
        success: false,
        errors: [
          {
            message: err instanceof Error ? err.message : String(err),
            source: filePath,
          },
        ],
      };
    }
  }

  // ===========================================================================
  // OVERLAY & DASHBOARD PAGES
  // ===========================================================================

  private serveOverlay(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html><head><title>HoloScript Dev Server</title>
<style>
body { font-family: monospace; background: #1a1a2e; color: #e0e0e0; margin: 20px; }
h1 { color: #00d4ff; }
.error { background: #2d1b1b; border-left: 4px solid #ff4444; padding: 12px; margin: 8px 0; }
.update { background: #1b2d1b; border-left: 4px solid #44ff44; padding: 12px; margin: 8px 0; }
#events { max-height: 600px; overflow-y: auto; }
</style></head>
<body>
<h1>HoloScript Dev Server</h1>
<p>Watching for changes... <a href="/dashboard" style="color:#00d4ff">Dashboard</a></p>
<div id="events"></div>
<script>
const evtSource = new EventSource('/__hmr');
const events = document.getElementById('events');
evtSource.onmessage = (e) => {
  const data = JSON.parse(e.data);
  const div = document.createElement('div');
  div.className = data.type === 'error' ? 'error' : 'update';
  const time = new Date(data.timestamp).toLocaleTimeString();
  if (data.type === 'error') {
    div.innerHTML = '<b>[' + time + '] Error: ' + data.file + '</b><br>' +
      (data.errors || []).map(e => e.message).join('<br>');
  } else if (data.type === 'update') {
    div.textContent = '[' + time + '] Updated: ' + data.file;
  } else {
    div.textContent = '[' + time + '] Connected to dev server';
  }
  events.prepend(div);
};
</script></body></html>`);
  }

  private serveDashboard(res: ServerResponse): void {
    const stats = this.getStats();
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html><head><title>HoloScript Dashboard</title>
<style>
body { font-family: monospace; background: #1a1a2e; color: #e0e0e0; margin: 20px; }
h1, h2 { color: #00d4ff; }
.panel { background: #16213e; border: 1px solid #0f3460; border-radius: 8px; padding: 16px; margin: 12px 0; }
.stat { display: inline-block; margin: 8px 16px; }
.stat-value { font-size: 24px; color: #00d4ff; }
.stat-label { font-size: 12px; color: #888; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 8px; border-bottom: 1px solid #0f3460; }
</style></head>
<body>
<h1>HoloScript Developer Dashboard</h1>
<div class="panel">
<div class="stat"><div class="stat-value">${stats.filesWatched}</div><div class="stat-label">Files Watched</div></div>
<div class="stat"><div class="stat-value">${stats.connectedClients}</div><div class="stat-label">Connected Clients</div></div>
<div class="stat"><div class="stat-value">${stats.totalUpdates}</div><div class="stat-label">Updates</div></div>
<div class="stat"><div class="stat-value">${stats.totalErrors}</div><div class="stat-label">Errors</div></div>
<div class="stat"><div class="stat-value">${Math.floor(stats.uptime / 1000)}s</div><div class="stat-label">Uptime</div></div>
</div>
<h2>Compositions</h2>
<div class="panel"><table><tr><th>File</th><th>Status</th></tr>
${[...this.compositions.entries()]
  .map(([f]) => `<tr><td>${relative(this.config.root, f)}</td><td>OK</td></tr>`)
  .join('')}
</table></div>
<script>setTimeout(() => location.reload(), 5000);</script>
</body></html>`);
  }

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  /**
   * Get server stats.
   */
  getStats(): DevServerStats {
    return {
      port: this.config.port,
      root: this.config.root,
      watching: this.config.watch,
      connectedClients: this.wsClients.size,
      filesWatched: this.watchedFiles.size,
      totalUpdates: this.totalUpdates,
      totalErrors: this.totalErrors,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
    };
  }

  /**
   * Get all parsed compositions.
   */
  getCompositions(): Map<string, { ast: unknown; raw: string }> {
    return new Map(this.compositions);
  }

  /**
   * Get a specific composition by relative path.
   */
  getComposition(relativePath: string): { ast: unknown; raw: string } | undefined {
    const fullPath = resolve(this.config.root, relativePath);
    return this.compositions.get(fullPath);
  }

  /**
   * Check if server is running.
   */
  isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }
}

// =============================================================================
// MIME TYPES
// =============================================================================

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.holo': 'text/plain',
  '.hs': 'text/plain',
  '.hsplus': 'text/plain',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
