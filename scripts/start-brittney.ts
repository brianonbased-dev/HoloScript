#!/usr/bin/env npx tsx
/**
 * Auto-start Brittney AI Service
 * 
 * Detects GGUF model and starts the Brittney service on port 11435
 * for HoloScript MCP tools to use.
 *
 * Legacy adapter/projection only: the desktop surface contract is owned by
 * apps/holoshell/source/holoshell-brittney-desktop-cockpit.hsplus and runtime
 * receipts. This gateway preserves older chat/API routes; it does not own the
 * Brittney Studio desktop behavior.
 * 
 * Usage:
 *   npx tsx scripts/start-brittney.ts
 *   npm run brittney
 */

import { existsSync, readFileSync } from 'fs';
import { spawn, exec } from 'child_process';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

interface ModelArtifactEntry {
  file: string;
  repoFallback?: string;
}

interface ModelArtifactLaneConfig {
  explicitModelPathEnv?: string;
  artifactRootEnv?: string[];
  models?: ModelArtifactEntry[];
}

const FALLBACK_MODEL_LANE_CONFIG: Required<ModelArtifactLaneConfig> = {
  explicitModelPathEnv: 'BRITTNEY_MODEL_PATH',
  artifactRootEnv: ['BRITTNEY_MODEL_ROOT', 'HOLOLAND_MODEL_ROOT', 'HOLOLAND_ARTIFACT_MODEL_ROOT'],
  models: [
    { file: 'brittney-qwen-v43-q8_0.gguf', repoFallback: 'models/brittney-qwen-v43-q8_0.gguf' },
    { file: 'brittney-qwen-v23.gguf', repoFallback: 'models/brittney-qwen-v23.gguf' },
    { file: 'brittney-qwen-v23.gguf', repoFallback: 'packages/brittney/service/models/brittney-qwen-v23.gguf' },
  ],
};

function loadModelLaneConfig(): Required<ModelArtifactLaneConfig> {
  const configPath = path.join(ROOT, 'config', 'model-artifact-lanes.json');
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as ModelArtifactLaneConfig;
    return {
      explicitModelPathEnv: parsed.explicitModelPathEnv || FALLBACK_MODEL_LANE_CONFIG.explicitModelPathEnv,
      artifactRootEnv: parsed.artifactRootEnv?.length
        ? parsed.artifactRootEnv
        : FALLBACK_MODEL_LANE_CONFIG.artifactRootEnv,
      models: parsed.models?.length ? parsed.models : FALLBACK_MODEL_LANE_CONFIG.models,
    };
  } catch {
    return FALLBACK_MODEL_LANE_CONFIG;
  }
}

function splitEnvPaths(value: string | undefined): string[] {
  return String(value || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.filter(Boolean))];
}

// GGUF model locations (in priority order): explicit path, artifact roots, then
// repo-local compatibility fallbacks. Repo-local weights are canonicality debt.
function buildGGUFPaths(): string[] {
  const config = loadModelLaneConfig();
  const paths: string[] = [];
  const explicitPath = process.env[config.explicitModelPathEnv];
  if (explicitPath) paths.push(path.resolve(explicitPath));

  const artifactRoots = config.artifactRootEnv.flatMap((envName) => splitEnvPaths(process.env[envName]));
  for (const artifactRoot of artifactRoots) {
    for (const model of config.models) {
      paths.push(path.resolve(artifactRoot, model.file));
    }
  }

  for (const model of config.models) {
    if (model.repoFallback) paths.push(path.resolve(ROOT, model.repoFallback));
  }

  return uniquePaths(paths);
}

const GGUF_PATHS = buildGGUFPaths();

const BRITTNEY_PORT = 11435;
const BRITTNEY_HOST = 'localhost';
const HOLOSHELL_DESKTOP_SOURCE_CONTRACT = 'apps/holoshell/source/holoshell-brittney-desktop-cockpit.hsplus';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const OLLAMA_MODEL_PREFERENCE = [
  'brittney-edge:v0-4',
  'brittney-v4-expert:latest',
  'brittney-qwen-v23:latest',
  'brittney-qwen:latest',
];

interface BrittneyStartupMode {
  inferenceMode: 'ollama' | 'gguf';
  modelPath?: string | null;
  ollamaModel?: string | null;
}

interface BrittneyChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface BrittneyChatRequest {
  messages?: BrittneyChatMessage[];
  context?: unknown;
  maxTokens?: number;
  temperature?: number;
}

async function checkPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' 
      ? `netstat -ano | findstr :${port}`
      : `lsof -i :${port}`;
    
    exec(cmd, (error, stdout) => {
      const output = stdout.toString();
      if (process.platform === 'win32') {
        resolve(output
          .split(/\r?\n/)
          .some((line) => line.includes(`:${port}`) && /\sLISTENING\s/i.test(line)));
        return;
      }

      resolve(output.trim().length > 0);
    });
  });
}

async function checkBrittneyHealth(): Promise<boolean> {
  try {
    const response = await fetch(`http://${BRITTNEY_HOST}:${BRITTNEY_PORT}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

function findGGUFModel(): string | null {
  for (const ggufPath of GGUF_PATHS) {
    if (existsSync(ggufPath)) {
      return ggufPath;
    }
  }
  return null;
}

function isRepoLocalFallbackModel(modelPath: string): boolean {
  const relativePath = path.relative(ROOT, modelPath).replace(/\\/g, '/');
  return !relativePath.startsWith('..')
    && !path.isAbsolute(relativePath)
    && (
      relativePath.startsWith('models/')
      || relativePath.startsWith('.proprietary/models/')
      || relativePath.startsWith('packages/brittney/service/models/')
    );
}

async function findOllamaBrittneyModel(): Promise<string | null> {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!response.ok) return null;

    const data = await response.json() as { models?: Array<{ name?: string }> };
    const modelNames = (data.models || [])
      .map((model) => model.name)
      .filter((name): name is string => Boolean(name));

    for (const preferred of OLLAMA_MODEL_PREFERENCE) {
      if (modelNames.includes(preferred)) return preferred;
    }

    return modelNames.find((name) => name.toLowerCase().includes('brittney')) || null;
  } catch {
    return null;
  }
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendText(res: ServerResponse, statusCode: number, body: string, contentType = 'text/plain'): void {
  res.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

async function runOllamaChat(model: string, request: BrittneyChatRequest): Promise<{
  content: string;
  promptTokens: number;
  completionTokens: number;
}> {
  const messages = Array.isArray(request.messages) && request.messages.length
    ? request.messages
    : [{ role: 'user' as const, content: 'Hello Brittney.' }];

  const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        temperature: request.temperature ?? 0.2,
        num_predict: request.maxTokens ?? 512,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama chat failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    message?: { content?: string };
    response?: string;
    prompt_eval_count?: number;
    eval_count?: number;
  };

  const content = data.message?.content || data.response || '';
  return {
    content,
    promptTokens: data.prompt_eval_count || Math.ceil(JSON.stringify(messages).length / 4),
    completionTokens: data.eval_count || Math.ceil(content.length / 4),
  };
}

async function startOllamaCompatibilityGateway(model: string): Promise<void> {
  console.log('🚀 Starting Brittney HoloLLama local compatibility gateway...');
  console.log(`🧠 Primary inference: HoloLLama local compatibility route (${model})`);
  console.log('🛡️  Deprecated GGUF service bypassed to protect local GPU memory.');
  console.log(`🌐 URL: http://${BRITTNEY_HOST}:${BRITTNEY_PORT}`);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${BRITTNEY_HOST}:${BRITTNEY_PORT}`);

      if (req.method === 'OPTIONS') {
        sendText(res, 204, '');
        return;
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, {
          status: 'ok',
          version: '1.0.0',
          model,
          modelLoaded: false,
          cloudConfigured: false,
          ollama: { available: true, model },
          primaryInference: 'ollama',
          gateway: 'start-brittney-ollama-compat',
          desktopSourceContract: HOLOSHELL_DESKTOP_SOURCE_CONTRACT,
        });
        return;
      }

      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/chat.html')) {
        sendText(
          res,
          200,
          `<!doctype html><title>Brittney</title><body><h1>Brittney HoloLLama Local Gateway</h1><p>Ollama-compatible endpoint ready on ${model}.</p></body>`,
          'text/html',
        );
        return;
      }

      if (req.method === 'GET' && url.pathname === '/model/status') {
        sendJson(res, 200, {
          loaded: false,
          name: model,
          path: null,
          memoryUsage: null,
          primaryInference: 'ollama',
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/assets/manifest') {
        sendJson(res, 200, {
          base_url: `http://${BRITTNEY_HOST}:${BRITTNEY_PORT}`,
          assets: [],
        });
        return;
      }

      if (url.pathname === '/config') {
        if (req.method === 'PUT' || req.method === 'POST') {
          await readJson(req);
        }
        sendJson(res, 200, {
          modelName: model,
          cloudProvider: null,
          preferCloud: false,
          apiKeysConfigured: {},
          primaryInference: 'ollama',
          saved: req.method !== 'GET',
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/chat') {
        const request = await readJson(req) as BrittneyChatRequest;
        const result = await runOllamaChat(model, request);
        sendJson(res, 200, {
          id: `ollama_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          content: result.content,
          model,
          provider: 'local',
          usage: {
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            totalTokens: result.promptTokens + result.completionTokens,
          },
          routing: { reason: 'HoloLLama local compatibility gateway' },
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
        const request = await readJson(req) as BrittneyChatRequest;
        const result = await runOllamaChat(model, request);
        sendJson(res, 200, {
          id: `ollama_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          object: 'chat.completion',
          created: Date.now(),
          model,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: result.content },
              finish_reason: 'stop',
            },
          ],
          usage: {
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            totalTokens: result.promptTokens + result.completionTokens,
          },
        });
        return;
      }

      sendJson(res, 404, { error: `Unknown Brittney gateway route: ${url.pathname}` });
    } catch (error: any) {
      sendJson(res, 500, { error: error.message || 'Brittney gateway error' });
    }
  });

  server.on('error', (error: any) => {
    console.error('❌ Failed to start Brittney HoloLLama local gateway:', error.message);
    process.exit(1);
  });

  process.on('SIGINT', () => server.close(() => process.exit(0)));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));

  await new Promise<void>((resolve) => {
    server.listen(BRITTNEY_PORT, BRITTNEY_HOST, () => {
      console.log(`✅ Brittney HoloLLama local gateway is ready at http://${BRITTNEY_HOST}:${BRITTNEY_PORT}`);
      console.log('');
      console.log('🔧 Compatibility routes are now available:');
      console.log('   - GET  /health');
      console.log('   - POST /chat');
      console.log('   - POST /v1/chat/completions');
      console.log('');
      resolve();
    });
  });
}

async function startBrittneyService(startup: BrittneyStartupMode): Promise<void> {
  console.log('🚀 Starting Brittney AI Service...');
  if (startup.inferenceMode === 'ollama') {
    console.log(`🧠 Primary inference: HoloLLama local compatibility route (${startup.ollamaModel})`);
    console.log('🛡️  GGUF auto-load disabled to protect local GPU memory.');
  } else {
    console.log(`📦 Model: ${startup.modelPath}`);
  }
  console.log(`🌐 URL: http://${BRITTNEY_HOST}:${BRITTNEY_PORT}`);
  
  const serviceDir = path.join(ROOT, 'packages', 'brittney', 'service');
  
  // Check if service is built
  const distPath = path.join(serviceDir, 'dist', 'server.js');
  if (!existsSync(distPath)) {
    console.log('📦 Building Brittney service first...');
    await new Promise<void>((resolve, reject) => {
      const build = spawn('pnpm', ['build'], { 
        cwd: serviceDir, 
        shell: true,
        stdio: 'inherit' 
      });
      build.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Build failed with code ${code}`));
      });
    });
  }
  
  // Start the service
  const env = {
    ...process.env,
    BRITTNEY_PORT: String(BRITTNEY_PORT),
    BRITTNEY_AUTO_LOAD: startup.inferenceMode === 'ollama'
      ? 'false'
      : process.env.BRITTNEY_AUTO_LOAD || 'true',
    ...(startup.modelPath ? { BRITTNEY_MODEL_PATH: startup.modelPath } : {}),
    ...(startup.ollamaModel ? { OLLAMA_MODEL: startup.ollamaModel } : {}),
    NODE_ENV: 'production',
  };
  
  const server = spawn('node', ['dist/server.js'], {
    cwd: serviceDir,
    env,
    stdio: 'inherit',
    detached: false,
  });
  
  server.on('error', (err) => {
    console.error('❌ Failed to start Brittney:', err.message);
    process.exit(1);
  });
  
  // Wait for health check
  let retries = 30;
  while (retries > 0) {
    await new Promise(r => setTimeout(r, 1000));
    if (await checkBrittneyHealth()) {
      console.log('✅ Brittney AI Service is ready!');
      console.log('');
      console.log('🔧 MCP tools are now available:');
      console.log('   - mcp_hololand_brittney_generate_holoscript');
      console.log('   - mcp_hololand_brittney_create_and_inject');
      console.log('   - mcp_hololand_brittney_learn_holoscript');
      console.log('');
      return;
    }
    retries--;
  }
  
  console.log('⚠️ Brittney started but health check failed. Check logs above.');
}

async function main() {
  console.log('');
  console.log('🐿️  Brittney AI Auto-Start');
  console.log('═══════════════════════════════════════');
  console.log('');
  
  // Check if already running
  if (await checkBrittneyHealth()) {
    console.log('✅ Brittney is already running at http://localhost:11435');
    console.log('');
    return;
  }
  
  // Check if port is in use by something else - with retry for TIME_WAIT
  let portRetries = 10;
  while (await checkPortInUse(BRITTNEY_PORT) && portRetries > 0) {
    // Port in use but Brittney not responding - might be TIME_WAIT
    if (portRetries === 10) {
      console.log(`⏳ Port ${BRITTNEY_PORT} is in use (possibly TIME_WAIT). Waiting...`);
    }
    await new Promise(r => setTimeout(r, 3000));
    portRetries--;
    
    // Re-check if Brittney became available
    if (await checkBrittneyHealth()) {
      console.log('✅ Brittney is already running at http://localhost:11435');
      console.log('');
      return;
    }
  }
  
  if (await checkPortInUse(BRITTNEY_PORT) && portRetries === 0) {
    console.log(`⚠️ Port ${BRITTNEY_PORT} is still in use after waiting.`);
    console.log('   Another service may be using this port.');
    console.log('');
    return;
  }
  
  // Find GGUF model
  const ollamaModel = await findOllamaBrittneyModel();
  if (ollamaModel) {
    console.log(`✅ Found Ollama Brittney model: ${ollamaModel}`);
    console.log('');
    await startOllamaCompatibilityGateway(ollamaModel);
    return;
  }

  const modelPath = findGGUFModel();
  
  if (!modelPath) {
    console.log('❌ No Brittney GGUF model found.');
    console.log('');
    console.log('   Expected locations:');
    GGUF_PATHS.forEach(p => console.log(`   - ${p}`));
    console.log('');
    console.log('   Preferred setup: set BRITTNEY_MODEL_PATH, BRITTNEY_MODEL_ROOT,');
    console.log('   HOLOLAND_MODEL_ROOT, or HOLOLAND_ARTIFACT_MODEL_ROOT to an artifact-lane path.');
    console.log('');
    console.log('   Download the model:');
    console.log('   npm run brittney:download');
    console.log('');
    process.exit(1);
  }
  
  console.log(`✅ Found GGUF model: ${path.basename(modelPath)}`);
  if (isRepoLocalFallbackModel(modelPath)) {
    console.log('⚠️  Using repo-local GGUF fallback. This is supported for compatibility,');
    console.log('   but model weights should move to the artifact lane and be referenced');
    console.log('   with BRITTNEY_MODEL_PATH or a *_MODEL_ROOT environment variable.');
  }
  console.log('');
  
  await startBrittneyService({
    inferenceMode: 'gguf',
    modelPath,
  });
}

main().catch(console.error);
