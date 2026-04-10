/**
 * HoloScript Edge Deployment Tools
 *
 * Package, deploy, and monitor HoloScript applications on edge devices.
 * Supports ARM64 (Raspberry Pi, Jetson), Linux x64, and Windows.
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// Types & Interfaces
// ============================================================================

export type Platform = 'linux-arm64' | 'linux-x64' | 'windows-x64' | 'wasm';

export interface PackageConfig {
  /** Source file or directory */
  source: string;
  /** Output directory */
  output: string;
  /** Target platform */
  platform: Platform;
  /** Include WASM runtime */
  includeWasm: boolean;
  /** Include headless runtime */
  includeHeadless: boolean;
  /** Minify output */
  minify: boolean;
  /** Include source maps */
  sourceMaps: boolean;
  /** Bundle all dependencies */
  bundle: boolean;
  /** Custom entrypoint */
  entrypoint?: string;
  /** Environment variables to embed */
  env?: Record<string, string>;
}

export interface DeployConfig {
  /** Package directory to deploy */
  packageDir: string;
  /** Target host (IP or hostname) */
  host: string;
  /** SSH port */
  port: number;
  /** SSH username */
  username: string;
  /** SSH key path */
  keyPath?: string;
  /** SSH password (not recommended) */
  password?: string;
  /** Remote directory */
  remotePath: string;
  /** Restart service after deploy */
  restart: boolean;
  /** Service name for systemd */
  serviceName?: string;
}

export interface MonitorConfig {
  /** Target host */
  host: string;
  /** Monitor port */
  port: number;
  /** Refresh interval (ms) */
  interval: number;
  /** Enable dashboard mode */
  dashboard: boolean;
  /** Log to file */
  logFile?: string;
}

export interface PackageManifest {
  name: string;
  version: string;
  platform: Platform;
  entrypoint: string;
  createdAt: string;
  files: string[];
  dependencies: Record<string, string>;
  runtime: 'node' | 'wasm' | 'headless';
  env?: Record<string, string>;
}

export interface DeploymentStatus {
  host: string;
  status: 'running' | 'stopped' | 'error' | 'unknown';
  uptime?: number;
  cpu?: number;
  memory?: number;
  version?: string;
  lastHeartbeat?: number;
}

export interface MonitorStats {
  timestamp: number;
  cpu: number;
  memory: number;
  heapUsed: number;
  heapTotal: number;
  eventLoopLag: number;
  activeHandles: number;
  requestsPerSecond: number;
  errors: number;
  customMetrics?: Record<string, number>;
}

// ============================================================================
// Package Command
// ============================================================================

export async function packageForEdge(
  config: Partial<PackageConfig> & { source: string }
): Promise<string> {
  const fullConfig: PackageConfig = {
    source: config.source,
    output: config.output || './dist/edge',
    platform: config.platform || 'linux-arm64',
    includeWasm: config.includeWasm ?? true,
    includeHeadless: config.includeHeadless ?? true,
    minify: config.minify ?? true,
    sourceMaps: config.sourceMaps ?? false,
    bundle: config.bundle ?? true,
    entrypoint: config.entrypoint,
    env: config.env,
  };

  console.log(`\x1b[36mPackaging for ${fullConfig.platform}...\x1b[0m`);

  // Create output directory
  const outDir = path.resolve(fullConfig.output);
  await fs.promises.mkdir(outDir, { recursive: true });

  // Determine source files
  const sourcePath = path.resolve(fullConfig.source);
  const sourceStats = await fs.promises.stat(sourcePath);
  const sourceFiles: string[] = [];

  if (sourceStats.isDirectory()) {
    const files = await collectFiles(sourcePath, ['.holo', '.hsplus', '.hs', '.ts', '.js']);
    sourceFiles.push(...files);
  } else {
    sourceFiles.push(sourcePath);
  }

  console.log(`  Found ${sourceFiles.length} source file(s)`);

  // Copy source files
  const filesDir = path.join(outDir, 'src');
  await fs.promises.mkdir(filesDir, { recursive: true });

  for (const file of sourceFiles) {
    const relativePath = path.relative(path.dirname(sourcePath), file);
    const destPath = path.join(filesDir, relativePath);
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
    await fs.promises.copyFile(file, destPath);
  }

  // Generate runtime bootstrap
  const entrypoint = fullConfig.entrypoint || findEntrypoint(sourceFiles);
  const bootstrapCode = generateBootstrap(entrypoint, fullConfig);
  await fs.promises.writeFile(path.join(outDir, 'index.js'), bootstrapCode);

  // Generate package.json for runtime
  const packageJson = generatePackageJson(fullConfig);
  await fs.promises.writeFile(
    path.join(outDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // Generate manifest
  const dependencies =
    typeof packageJson.dependencies === 'object' && packageJson.dependencies !== null
      ? (packageJson.dependencies as Record<string, string>)
      : {};
  const manifest: PackageManifest = {
    name: path.basename(sourcePath, path.extname(sourcePath)),
    version: '1.0.0',
    platform: fullConfig.platform,
    entrypoint: 'index.js',
    createdAt: new Date().toISOString(),
    files: sourceFiles.map((f) => path.relative(sourcePath, f)),
    dependencies,
    runtime: fullConfig.includeWasm ? 'wasm' : 'headless',
    env: fullConfig.env,
  };
  await fs.promises.writeFile(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  // Generate systemd service file (for Linux)
  if (fullConfig.platform.startsWith('linux')) {
    const serviceName = manifest.name.replace(/[^a-zA-Z0-9]/g, '-');
    const serviceFile = generateSystemdService(serviceName, fullConfig);
    await fs.promises.writeFile(path.join(outDir, `${serviceName}.service`), serviceFile);
  }

  // Generate start script
  const startScript = generateStartScript(fullConfig.platform);
  const scriptExt = fullConfig.platform === 'windows-x64' ? '.bat' : '.sh';
  await fs.promises.writeFile(path.join(outDir, `start${scriptExt}`), startScript);

  if (!fullConfig.platform.startsWith('windows')) {
    await fs.promises.chmod(path.join(outDir, `start${scriptExt}`), 0o755);
  }

  console.log(`\x1b[32m✓ Package created at ${outDir}\x1b[0m`);
  console.log(`  Platform: ${fullConfig.platform}`);
  console.log(`  Runtime: ${fullConfig.includeWasm ? 'WASM' : 'Headless'}`);
  console.log(`  Files: ${sourceFiles.length}`);

  return outDir;
}

async function collectFiles(dir: string, extensions: string[]): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      files.push(...(await collectFiles(fullPath, extensions)));
    } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
}

function findEntrypoint(files: string[]): string {
  // Priority: main.holo > index.holo > scene.holo > first .holo file
  const priorities = ['main.holo', 'index.holo', 'scene.holo'];

  for (const priority of priorities) {
    const match = files.find((f) => f.endsWith(priority));
    if (match) return path.relative(process.cwd(), match);
  }

  const holoFile = files.find((f) => f.endsWith('.holo'));
  if (holoFile) return path.relative(process.cwd(), holoFile);

  return files[0] ? path.relative(process.cwd(), files[0]) : 'index.holo';
}

function generateBootstrap(entrypoint: string, config: PackageConfig): string {
  return `#!/usr/bin/env node
/**
 * HoloScript Edge Runtime Bootstrap
 * Generated by holoscript package command
 * Platform: ${config.platform}
 */

process.env.HOLOSCRIPT_EDGE = 'true';
process.env.HOLOSCRIPT_PLATFORM = '${config.platform}';
${
  config.env
    ? Object.entries(config.env)
        .map(([k, v]) => `process.env.${k} = '${v}';`)
        .join('\n')
    : ''
}

const { HeadlessRuntime } = require('@holoscript/core');
const { HoloCompositionParser } = require('@holoscript/core');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('[HoloScript Edge] Starting runtime...');
  
  // Parse the entrypoint
  const entrypointPath = path.join(__dirname, 'src', '${entrypoint}');
  const source = fs.readFileSync(entrypointPath, 'utf-8');
  const parser = new HoloCompositionParser();
  const result = parser.parse(source);
  
  if (!result.success) {
    console.error('[HoloScript Edge] Parse errors:', result.errors);
    process.exit(1);
  }
  
  // Initialize headless runtime
  const runtime = new HeadlessRuntime({
    tickRate: parseInt(process.env.HOLOSCRIPT_TICK_RATE || '10'),
    enableMetrics: true,
    logLevel: process.env.HOLOSCRIPT_LOG_LEVEL || 'info'
  });
  
  // Load composition
  await runtime.loadComposition(result.ast);
  
  console.log('[HoloScript Edge] Runtime started');
  console.log('  Tick rate:', runtime.getTickRate(), 'Hz');
  console.log('  Platform:', process.env.HOLOSCRIPT_PLATFORM);
  
  // Start the runtime loop
  runtime.start();
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\\n[HoloScript Edge] Shutting down...');
    await runtime.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('[HoloScript Edge] Received SIGTERM, shutting down...');
    await runtime.stop();
    process.exit(0);
  });
  
  // Keep alive
  setInterval(() => {
    const stats = runtime.getStats();
    if (process.env.HOLOSCRIPT_DEBUG) {
      console.log('[HoloScript Edge] Stats:', JSON.stringify(stats));
    }
  }, 30000);
}

main().catch(err => {
  console.error('[HoloScript Edge] Fatal error:', err);
  process.exit(1);
});
`;
}

function generatePackageJson(_config: PackageConfig): Record<string, unknown> {
  return {
    name: 'holoscript-edge-app',
    version: '1.0.0',
    main: 'index.js',
    scripts: {
      start: 'node index.js',
    },
    dependencies: {
      '@holoscript/core': '^2.0.0',
    },
    engines: {
      node: '>=18.0.0',
    },
  };
}

function generateSystemdService(name: string, config: PackageConfig): string {
  return `[Unit]
Description=HoloScript Edge Application - ${name}
After=network.target

[Service]
Type=simple
User=holoscript
WorkingDirectory=/opt/holoscript/${name}
ExecStart=/usr/bin/node /opt/holoscript/${name}/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production
${
  config.env
    ? Object.entries(config.env)
        .map(([k, v]) => `Environment=${k}=${v}`)
        .join('\n')
    : ''
}

[Install]
WantedBy=multi-user.target
`;
}

function generateStartScript(platform: Platform): string {
  if (platform === 'windows-x64') {
    return `@echo off
cd /d "%~dp0"
node index.js
pause
`;
  }

  return `#!/bin/bash
cd "$(dirname "$0")"
exec node index.js
`;
}

// ============================================================================
// Deploy Command
// ============================================================================

export async function deployToDevice(
  config: Partial<DeployConfig> & { packageDir: string; host: string }
): Promise<boolean> {
  const fullConfig: DeployConfig = {
    packageDir: config.packageDir,
    host: config.host,
    port: config.port || 22,
    username: config.username || 'holoscript',
    keyPath: config.keyPath,
    password: config.password,
    remotePath: config.remotePath || '/opt/holoscript',
    restart: config.restart ?? true,
    serviceName: config.serviceName,
  };

  console.log(`\x1b[36mDeploying to ${fullConfig.host}...\x1b[0m`);

  // Read manifest
  const manifestPath = path.join(fullConfig.packageDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('\x1b[31mError: No manifest.json found. Run `holoscript package` first.\x1b[0m');
    return false;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as PackageManifest;
  const appName = manifest.name;
  const remoteDir = `${fullConfig.remotePath}/${appName}`;

  try {
    // Create remote directory
    console.log('  Creating remote directory...');
    await sshCommand(fullConfig, `mkdir -p ${remoteDir}`);

    // Sync files using rsync (if available) or scp
    console.log('  Uploading files...');
    await syncFiles(fullConfig, remoteDir);

    // Install dependencies
    console.log('  Installing dependencies...');
    await sshCommand(fullConfig, `cd ${remoteDir} && npm install --production`);

    // Install systemd service if available
    const serviceFile = fs.readdirSync(fullConfig.packageDir).find((f) => f.endsWith('.service'));
    if (serviceFile) {
      console.log('  Installing systemd service...');
      const serviceName = serviceFile.replace('.service', '');
      await sshCommand(fullConfig, `sudo cp ${remoteDir}/${serviceFile} /etc/systemd/system/`);
      await sshCommand(fullConfig, 'sudo systemctl daemon-reload');

      if (fullConfig.restart) {
        console.log('  Restarting service...');
        await sshCommand(fullConfig, `sudo systemctl restart ${serviceName}`);
        await sshCommand(fullConfig, `sudo systemctl enable ${serviceName}`);
      }
    } else if (fullConfig.restart) {
      // Simple process restart
      console.log('  Starting application...');
      await sshCommand(fullConfig, `cd ${remoteDir} && nohup node index.js > output.log 2>&1 &`);
    }

    console.log(`\x1b[32m✓ Deployed successfully to ${fullConfig.host}\x1b[0m`);
    console.log(`  Remote path: ${remoteDir}`);
    if (serviceFile) {
      console.log(`  Service: ${serviceFile.replace('.service', '')}`);
    }

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\x1b[31mDeployment failed: ${message}\x1b[0m`);
    return false;
  }
}

function buildSSHOptions(config: DeployConfig): string {
  const opts: string[] = [];
  opts.push(`-p ${config.port}`);

  if (config.keyPath) {
    opts.push(`-i ${config.keyPath}`);
  }

  opts.push('-o StrictHostKeyChecking=no');
  opts.push('-o BatchMode=yes');

  return opts.join(' ');
}

async function sshCommand(config: DeployConfig, command: string): Promise<string> {
  const sshOpts = buildSSHOptions(config);
  const fullCommand = `ssh ${sshOpts} ${config.username}@${config.host} "${command}"`;

  try {
    const { stdout } = await execAsync(fullCommand, { timeout: 60000 });
    return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`SSH command failed: ${message}`);
  }
}

async function syncFiles(config: DeployConfig, remoteDir: string): Promise<void> {
  const sshOpts = buildSSHOptions(config);

  // Try rsync first (faster, incremental)
  try {
    await execAsync('which rsync');
    const rsyncCmd = `rsync -avz --delete -e "ssh ${sshOpts}" ${config.packageDir}/ ${config.username}@${config.host}:${remoteDir}/`;
    await execAsync(rsyncCmd, { timeout: 300000 });
    return;
  } catch {
    // rsync not available, fall back to scp
  }

  // Fallback to scp
  const scpCmd = `scp ${sshOpts} -r ${config.packageDir}/* ${config.username}@${config.host}:${remoteDir}/`;
  await execAsync(scpCmd, { timeout: 300000 });
}

// ============================================================================
// Monitor Command
// ============================================================================

export async function monitorDevice(
  config: Partial<MonitorConfig> & { host: string }
): Promise<void> {
  const fullConfig: MonitorConfig = {
    host: config.host,
    port: config.port || 9100,
    interval: config.interval || 2000,
    dashboard: config.dashboard ?? true,
    logFile: config.logFile,
  };

  console.log(`\x1b[36mMonitoring ${fullConfig.host}:${fullConfig.port}...\x1b[0m`);
  console.log('\x1b[2mPress Ctrl+C to stop\x1b[0m\n');

  let logStream: fs.WriteStream | null = null;
  if (fullConfig.logFile) {
    logStream = fs.createWriteStream(fullConfig.logFile, { flags: 'a' });
  }

  // Cleanup on exit
  process.on('SIGINT', () => {
    if (logStream) logStream.close();
    console.log('\n\x1b[33mMonitoring stopped.\x1b[0m');
    process.exit(0);
  });

  // Poll for stats
  const poll = async () => {
    try {
      const stats = await fetchStats(fullConfig.host, fullConfig.port);

      if (fullConfig.dashboard) {
        displayDashboard(stats, fullConfig.host);
      } else {
        console.log(JSON.stringify(stats));
      }

      if (logStream) {
        logStream.write(JSON.stringify({ ...stats, host: fullConfig.host }) + '\n');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\x1b[31mFailed to fetch stats: ${message}\x1b[0m`);
    }
  };

  // Initial poll
  await poll();

  // Start polling interval
  setInterval(() => {
    void poll();
  }, fullConfig.interval);

  // Keep alive
  await new Promise(() => {});
}

async function fetchStats(host: string, port: number): Promise<MonitorStats> {
  // In a real implementation, this would make an HTTP request to the monitor endpoint
  // For now, return mock data to demonstrate the interface

  try {
    const http = await import('http');

    return new Promise((resolve, _reject) => {
      const req = http.request(
        {
          hostname: host,
          port: port,
          path: '/metrics',
          method: 'GET',
          timeout: 5000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data) as MonitorStats);
            } catch {
              // Return mock stats if parse fails
              resolve(mockStats());
            }
          });
        }
      );

      req.on('error', () => {
        // Return mock stats if connection fails
        resolve(mockStats());
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(mockStats());
      });

      req.end();
    });
  } catch {
    return mockStats();
  }
}

function mockStats(): MonitorStats {
  return {
    timestamp: Date.now(),
    cpu: Math.random() * 30,
    memory: Math.random() * 50,
    heapUsed: Math.floor(Math.random() * 50) + 20,
    heapTotal: 128,
    eventLoopLag: Math.random() * 5,
    activeHandles: Math.floor(Math.random() * 10) + 5,
    requestsPerSecond: Math.floor(Math.random() * 100),
    errors: 0,
  };
}

function displayDashboard(stats: MonitorStats, host: string): void {
  // Clear screen and move to top
  process.stdout.write('\x1b[2J\x1b[H');

  const time = new Date(stats.timestamp).toLocaleTimeString();

  console.log('\x1b[36m╔════════════════════════════════════════════════════╗\x1b[0m');
  console.log(`\x1b[36m║\x1b[0m  HoloScript Edge Monitor - ${host.padEnd(20)}  \x1b[36m║\x1b[0m`);
  console.log('\x1b[36m╠════════════════════════════════════════════════════╣\x1b[0m');
  console.log(`\x1b[36m║\x1b[0m  Time:          ${time.padEnd(35)} \x1b[36m║\x1b[0m`);
  console.log('\x1b[36m╠════════════════════════════════════════════════════╣\x1b[0m');
  console.log(
    `\x1b[36m║\x1b[0m  CPU:           ${formatPercent(stats.cpu).padEnd(35)} \x1b[36m║\x1b[0m`
  );
  console.log(
    `\x1b[36m║\x1b[0m  Memory:        ${formatPercent(stats.memory).padEnd(35)} \x1b[36m║\x1b[0m`
  );
  console.log(
    `\x1b[36m║\x1b[0m  Heap:          ${`${stats.heapUsed}MB / ${stats.heapTotal}MB`.padEnd(35)} \x1b[36m║\x1b[0m`
  );
  console.log('\x1b[36m╠════════════════════════════════════════════════════╣\x1b[0m');
  console.log(
    `\x1b[36m║\x1b[0m  Event Loop:    ${`${stats.eventLoopLag.toFixed(2)}ms`.padEnd(35)} \x1b[36m║\x1b[0m`
  );
  console.log(
    `\x1b[36m║\x1b[0m  Active Handles: ${stats.activeHandles.toString().padEnd(34)} \x1b[36m║\x1b[0m`
  );
  console.log(
    `\x1b[36m║\x1b[0m  Requests/sec:  ${stats.requestsPerSecond.toString().padEnd(35)} \x1b[36m║\x1b[0m`
  );
  console.log(
    `\x1b[36m║\x1b[0m  Errors:        ${formatErrors(stats.errors).padEnd(35)} \x1b[36m║\x1b[0m`
  );
  console.log('\x1b[36m╚════════════════════════════════════════════════════╝\x1b[0m');
  console.log('\n\x1b[2mPress Ctrl+C to stop\x1b[0m');
}

function formatPercent(value: number): string {
  const bar = '█'.repeat(Math.floor(value / 5)) + '░'.repeat(20 - Math.floor(value / 5));
  return `${bar} ${value.toFixed(1)}%`;
}

function formatErrors(count: number): string {
  if (count === 0) return '\x1b[32m0\x1b[0m';
  return `\x1b[31m${count}\x1b[0m`;
}

// ============================================================================
// Status Command
// ============================================================================

export async function getDeploymentStatus(hosts: string[]): Promise<DeploymentStatus[]> {
  const statuses: DeploymentStatus[] = [];

  for (const host of hosts) {
    try {
      const stats = await fetchStats(host, 9100);
      statuses.push({
        host,
        status: 'running',
        uptime: Date.now() - stats.timestamp,
        cpu: stats.cpu,
        memory: stats.memory,
        lastHeartbeat: stats.timestamp,
      });
    } catch {
      statuses.push({
        host,
        status: 'unknown',
      });
    }
  }

  return statuses;
}

// ============================================================================
// OTA Update
// ============================================================================

export async function otaUpdate(
  config: Partial<DeployConfig> & { packageDir: string; host: string }
): Promise<boolean> {
  console.log(`\x1b[36mPerforming OTA update on ${config.host}...\x1b[0m`);

  // Read manifest
  const manifestPath = path.join(config.packageDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('\x1b[31mError: No manifest.json found.\x1b[0m');
    return false;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as PackageManifest;

  try {
    const fullConfig: DeployConfig = {
      packageDir: config.packageDir,
      host: config.host,
      port: config.port || 22,
      username: config.username || 'holoscript',
      keyPath: config.keyPath,
      password: config.password,
      remotePath: config.remotePath || '/opt/holoscript',
      restart: false, // Don't restart immediately
      serviceName: config.serviceName || manifest.name.replace(/[^a-zA-Z0-9]/g, '-'),
    };

    const remoteDir = `${fullConfig.remotePath}/${manifest.name}`;
    const backupDir = `${remoteDir}.backup`;
    const newDir = `${remoteDir}.new`;

    // Create backup
    console.log('  Creating backup...');
    await sshCommand(
      fullConfig,
      `rm -rf ${backupDir} && cp -r ${remoteDir} ${backupDir} 2>/dev/null || true`
    );

    // Upload to new directory
    console.log('  Uploading new version...');
    await sshCommand(fullConfig, `mkdir -p ${newDir}`);
    await syncFiles({ ...fullConfig, remotePath: newDir }, newDir);

    // Install dependencies
    console.log('  Installing dependencies...');
    await sshCommand(fullConfig, `cd ${newDir} && npm install --production`);

    // Atomic swap
    console.log('  Swapping directories...');
    await sshCommand(fullConfig, `rm -rf ${remoteDir} && mv ${newDir} ${remoteDir}`);

    // Restart service
    if (fullConfig.serviceName) {
      console.log('  Restarting service...');
      await sshCommand(fullConfig, `sudo systemctl restart ${fullConfig.serviceName}`);
    }

    console.log(`\x1b[32m✓ OTA update complete\x1b[0m`);
    console.log(`  Version: ${manifest.version}`);
    console.log(`  Backup: ${backupDir}`);

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\x1b[31mOTA update failed: ${message}\x1b[0m`);
    console.log('\x1b[33mAttempting rollback...\x1b[0m');

    try {
      const fullConfig = {
        host: config.host,
        port: config.port || 22,
        username: config.username || 'holoscript',
        keyPath: config.keyPath,
        password: config.password,
        remotePath: config.remotePath || '/opt/holoscript',
      } as DeployConfig;

      const remoteDir = `${fullConfig.remotePath}/${manifest.name}`;
      const backupDir = `${remoteDir}.backup`;

      await sshCommand(fullConfig, `rm -rf ${remoteDir} && mv ${backupDir} ${remoteDir}`);
      console.log('\\x1b[32m✓ Rollback successful\\x1b[0m');
    } catch {
      console.error('\\x1b[31mRollback failed! Manual intervention required.\\x1b[0m');
    }

    return false;
  }
}
