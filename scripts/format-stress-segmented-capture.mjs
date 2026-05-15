#!/usr/bin/env node
/**
 * Segmented capture runner for the format-realism gauntlet.
 *
 * The runner is deliberately evidence-first: it emits a receipt for every
 * requested segment even when the current runtime can only provide a static
 * scene still or kinematic placeholder physics. Gaps stay visible and point to
 * the owning surface instead of being flattened into a fake pass.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_MANIFEST = 'experiments/format-realism-gauntlet/manifest.json';
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);
const SEGMENT_REPLAY_MODE = 'segment-replay-kinematic';
const WORLD_MODEL_REPLAY_MODE = 'world-model-event-replay';
const WORLD_MODEL_PIXEL_REPLAY_MODE = 'world-model-pixel-replay';
const ENGINE_FRAME_REPLAY_MODE = 'engine-frame-replay';
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);

function usage() {
  return `Usage: node scripts/format-stress-segmented-capture.mjs [manifest.json] [options]

Options:
  --out <dir>          Output directory. Defaults to manifest artifactRoot/date/flagship.
  --date <yyyy-mm-dd>  Date folder for default output. Defaults to today.
  --width <px>         Screenshot width. Default: 1280.
  --height <px>        Screenshot height. Default: 720.
  --wait-for <ms>      Screenshot stabilization wait. Default: 1000.
  --base-still <png>   Use an existing scene still, then emit segment replay stills.
  --no-replay-stills   Preserve historical static-copy still behavior.
  --no-engine-frame-stills
                        Preserve deterministic receipt-renderer stills for dynamic segments.
  --dry-run            Emit receipts without running parse/compile/headless/screenshot.
  --skip-screenshot    Do not invoke screenshot; write placeholder stills.
  --skip-headless      Do not invoke headless runtime.
  --json               Print receipt JSON to stdout.
  --help               Show this help.
`;
}

export function parseRunnerArgs(argv = process.argv.slice(2)) {
  const options = {
    manifest: DEFAULT_MANIFEST,
    out: undefined,
    date: DEFAULT_DATE,
    width: 1280,
    height: 720,
    waitFor: 1000,
    baseStill: undefined,
    replayStills: true,
    engineFrameStills: true,
    dryRun: false,
    skipScreenshot: false,
    skipHeadless: false,
    json: false,
    help: false,
  };

  let positionalSeen = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--out' || arg === '-o') {
      options.out = argv[++i];
    } else if (arg === '--date') {
      options.date = argv[++i];
    } else if (arg === '--width') {
      options.width = Number.parseInt(argv[++i], 10) || options.width;
    } else if (arg === '--height') {
      options.height = Number.parseInt(argv[++i], 10) || options.height;
    } else if (arg === '--wait-for') {
      options.waitFor = Number.parseInt(argv[++i], 10) || options.waitFor;
    } else if (arg === '--base-still') {
      options.baseStill = argv[++i];
    } else if (arg === '--no-replay-stills') {
      options.replayStills = false;
    } else if (arg === '--no-engine-frame-stills') {
      options.engineFrameStills = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--skip-screenshot') {
      options.skipScreenshot = true;
    } else if (arg === '--skip-headless') {
      options.skipHeadless = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (!arg.startsWith('-') && !positionalSeen) {
      options.manifest = arg;
      positionalSeen = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function propListToObject(properties) {
  const out = {};
  for (const prop of Array.isArray(properties) ? properties : []) {
    const key = prop?.key;
    if (typeof key === 'string') out[key] = prop.value;
  }
  return out;
}

function traitList(traits) {
  return (Array.isArray(traits) ? traits : [])
    .map((trait) => (typeof trait?.name === 'string' ? trait.name : null))
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values)].sort();
}

function rel(from, to) {
  return relative(from, to).replace(/\\/g, '/');
}

function resolveFromManifest(manifestPath, maybeRelative) {
  if (isAbsolute(maybeRelative)) return maybeRelative;
  return resolve(dirname(manifestPath), maybeRelative);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodeRgbaPng(width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND'),
  ]);
}

function createRaster(width, height, color) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3] ?? 255;
  }
  return { width, height, pixels };
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function blendPixel(canvas, x, y, color) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return;
  const offset = (py * canvas.width + px) * 4;
  const alpha = (color[3] ?? 255) / 255;
  const inv = 1 - alpha;
  canvas.pixels[offset] = Math.round(color[0] * alpha + canvas.pixels[offset] * inv);
  canvas.pixels[offset + 1] = Math.round(color[1] * alpha + canvas.pixels[offset + 1] * inv);
  canvas.pixels[offset + 2] = Math.round(color[2] * alpha + canvas.pixels[offset + 2] * inv);
  canvas.pixels[offset + 3] = 255;
}

function fillRect(canvas, x, y, width, height, color) {
  const left = clampInt(x, 0, canvas.width);
  const top = clampInt(y, 0, canvas.height);
  const right = clampInt(x + width, 0, canvas.width);
  const bottom = clampInt(y + height, 0, canvas.height);
  for (let py = top; py < bottom; py++) {
    for (let px = left; px < right; px++) {
      blendPixel(canvas, px, py, color);
    }
  }
}

function fillCircle(canvas, cx, cy, radius, color) {
  const r = Math.max(1, Math.round(radius));
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) blendPixel(canvas, cx + x, cy + y, color);
    }
  }
}

function drawLine(canvas, x0, y0, x1, y1, color, thickness = 1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillCircle(canvas, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thickness, color);
  }
}

function parseVector(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value !== 'string') return [];
  return [...value.matchAll(/-?\d+(?:\.\d+)?/g)]
    .map((match) => Number(match[0]))
    .filter(Number.isFinite);
}

function worldToCanvas([x, y], width, height) {
  const marginX = width * 0.1;
  const marginY = height * 0.16;
  const nx = (x + 3.8) / 8;
  const ny = y / 2.8;
  return [marginX + nx * (width - marginX * 2), height - marginY - ny * (height - marginY * 2)];
}

function drawSegmentMarkers(canvas, index, total, accent) {
  const width = canvas.width;
  const height = canvas.height;
  fillRect(canvas, 0, 0, width, Math.max(14, height * 0.035), [8, 11, 18, 235]);
  const progress = total <= 1 ? 1 : (index + 1) / total;
  fillRect(canvas, 0, 0, width * progress, Math.max(14, height * 0.035), accent);

  const block = Math.max(6, Math.floor(width / 120));
  const startX = width - block * 14;
  const top = Math.max(20, Math.floor(height * 0.06));
  for (let bit = 0; bit < 12; bit++) {
    const on = ((index + 1) >> bit) & 1;
    fillRect(
      canvas,
      startX + bit * block,
      top,
      block - 1,
      block * 3,
      on ? accent : [67, 76, 94, 180]
    );
  }
}

export function renderSegmentReplayStill({
  segment,
  index,
  total,
  sceneSnapshot,
  worldModelReplay,
  width = 1280,
  height = 720,
}) {
  const safeWidth = Math.max(320, Math.round(width));
  const safeHeight = Math.max(180, Math.round(height));
  const palette = [
    [122, 162, 247, 230],
    [247, 118, 142, 230],
    [224, 175, 104, 230],
    [158, 206, 106, 230],
    [187, 154, 247, 230],
    [125, 207, 255, 230],
  ];
  const accent = palette[index % palette.length];
  const canvas = createRaster(safeWidth, safeHeight, [13, 17, 25, 255]);

  for (let y = 0; y < safeHeight; y++) {
    const shade = Math.round(18 + (y / safeHeight) * 20);
    fillRect(canvas, 0, y, safeWidth, 1, [shade, shade + 2, shade + 8, 255]);
  }

  const floorY = safeHeight * 0.82;
  fillRect(canvas, safeWidth * 0.08, floorY, safeWidth * 0.84, 4, [190, 195, 210, 150]);
  drawSegmentMarkers(canvas, index, total, accent);

  for (const object of sceneObjectAnchors(sceneSnapshot, 10)) {
    const vec = parseVector(object.transform?.position);
    if (vec.length >= 2) {
      const [x, y] = worldToCanvas([vec[0], vec[1]], safeWidth, safeHeight);
      fillRect(canvas, x - 8, y - 8, 16, 16, [255, 255, 255, 70]);
      fillRect(canvas, x - 4, y - 4, 8, 8, [255, 255, 255, 130]);
    }
  }

  const pose = posePhysicsFor(segment, index, total, sceneSnapshot, worldModelReplay);
  const avatar = pose.bodies.avatar.position;
  const hand = pose.bodies.rightHand.position;
  const rock = pose.bodies.rock.position;
  const target = pose.bodies.target.position;
  const [avatarX, avatarY] = worldToCanvas([avatar[0], avatar[1]], safeWidth, safeHeight);
  const [handX, handY] = worldToCanvas([hand[0], hand[1]], safeWidth, safeHeight);
  const [rockX, rockY] = worldToCanvas([rock[0], rock[1]], safeWidth, safeHeight);
  const [targetX, targetY] = worldToCanvas([target[0], target[1]], safeWidth, safeHeight);

  drawLine(canvas, safeWidth * 0.12, floorY, safeWidth * 0.88, floorY, [95, 109, 139, 180], 2);
  drawLine(canvas, avatarX, avatarY - 36, handX, handY, accent, 5);
  drawLine(canvas, avatarX, avatarY + 18, avatarX - 14, floorY - 4, [180, 190, 205, 210], 4);
  drawLine(canvas, avatarX, avatarY + 18, avatarX + 14, floorY - 4, [180, 190, 205, 210], 4);
  fillCircle(canvas, avatarX, avatarY - 46, 18, [225, 232, 246, 240]);
  fillRect(canvas, avatarX - 16, avatarY - 30, 32, 52, [130, 146, 190, 230]);
  fillCircle(canvas, handX, handY, 9, [245, 207, 168, 245]);
  fillCircle(
    canvas,
    rockX,
    rockY,
    14,
    pose.bodies.rock.attachedToHand ? accent : [210, 210, 220, 245]
  );
  fillRect(
    canvas,
    targetX - 18,
    targetY - 45,
    36,
    90,
    pose.bodies.target.impacted ? [247, 118, 142, 235] : [120, 180, 245, 220]
  );

  if (pose.physics.arcSamples.length > 1) {
    const points = pose.physics.arcSamples.map((sample) =>
      worldToCanvas([sample[0], sample[1]], safeWidth, safeHeight)
    );
    for (let i = 1; i < points.length; i++) {
      drawLine(
        canvas,
        points[i - 1][0],
        points[i - 1][1],
        points[i][0],
        points[i][1],
        [255, 213, 128, 220],
        3
      );
    }
  }

  const phaseWidth = (safeWidth * 0.72) / Math.max(1, total);
  const phaseY = safeHeight * 0.9;
  for (let i = 0; i < total; i++) {
    fillRect(
      canvas,
      safeWidth * 0.14 + i * phaseWidth,
      phaseY,
      Math.max(2, phaseWidth - 2),
      10,
      i <= index ? accent : [70, 77, 96, 170]
    );
  }

  return encodeRgbaPng(safeWidth, safeHeight, canvas.pixels);
}

function resolveRepoPath(path) {
  return isAbsolute(path) ? path : resolve(REPO_ROOT, path);
}

function getCliInvocation() {
  const tsxCli = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const cliSource = join(REPO_ROOT, 'packages', 'cli', 'src', 'cli.ts');
  if (existsSync(tsxCli) && existsSync(cliSource)) {
    return {
      command: process.execPath,
      baseArgs: [tsxCli, cliSource],
      label: 'tsx packages/cli/src/cli.ts',
    };
  }

  return {
    command: process.execPath,
    baseArgs: [join(REPO_ROOT, 'packages', 'cli', 'bin', 'holoscript.cjs')],
    label: 'node packages/cli/bin/holoscript.cjs',
  };
}

function fallbackSceneSnapshot(stagePath) {
  const source = readFileSync(stagePath, 'utf8');
  const objectRe = /\bobject\s+"([^"]+)"(?:\s+using\s+"([^"]+)")?\s*\{([\s\S]*?)^\s*\}/gm;
  const objects = [];
  let match;
  while ((match = objectRe.exec(source))) {
    const body = match[3] || '';
    const property = (name) => {
      const propMatch = body.match(new RegExp(`${name}:\\s*([^\\n]+)`));
      return propMatch ? propMatch[1].trim().replace(/^"|"$/g, '') : undefined;
    };
    objects.push({
      id: match[1],
      type: 'object',
      template: match[2] || null,
      groupPath: [],
      traits: unique([...body.matchAll(/^\s*@([A-Za-z0-9_-]+)/gm)].map((item) => item[1])),
      properties: {
        geometry: property('geometry'),
        color: property('color'),
        position: property('position'),
        rotation: property('rotation'),
        scale: property('scale'),
      },
      transform: {
        position: property('position') ?? null,
        rotation: property('rotation') ?? null,
        scale: property('scale') ?? null,
      },
    });
  }
  return {
    schema: 'format-stress-headless-scene-snapshot-v1',
    source: 'regex-fallback',
    stage: rel(REPO_ROOT, stagePath),
    objectCount: objects.length,
    templateCount: (source.match(/\btemplate\s+"/g) || []).length,
    objects,
  };
}

function buildSceneSnapshotFromAst(ast, stagePath) {
  const composition = asRecord(ast);
  const templates = new Map();
  for (const template of Array.isArray(composition.templates) ? composition.templates : []) {
    if (typeof template?.name === 'string') templates.set(template.name, template);
  }

  const objects = [];
  const pushObject = (object, groupPath = [], parentId = null) => {
    if (!object || typeof object.name !== 'string') return;
    const template = typeof object.template === 'string' ? templates.get(object.template) : null;
    const templateProperties = propListToObject(template?.properties);
    const ownProperties = propListToObject(object.properties);
    const properties = { ...templateProperties, ...ownProperties };
    const traits = unique([...traitList(template?.traits), ...traitList(object.traits)]);
    const sceneObject = {
      id: object.name,
      type: String(object.declarationKind || object.type || 'object').toLowerCase(),
      template: object.template || null,
      parentId,
      groupPath,
      traits,
      properties,
      transform: {
        position: properties.position ?? null,
        rotation: properties.rotation ?? null,
        scale: properties.scale ?? null,
      },
      material: asRecord(properties.material),
      geometry: properties.geometry ?? null,
    };
    objects.push(sceneObject);
    for (const child of Array.isArray(object.children) ? object.children : []) {
      pushObject(child, groupPath, object.name);
    }
  };

  for (const object of Array.isArray(composition.objects) ? composition.objects : []) {
    pushObject(object);
  }
  const visitGroup = (group, groupPath = []) => {
    if (!group || typeof group.name !== 'string') return;
    const nextPath = [...groupPath, group.name];
    for (const object of Array.isArray(group.objects) ? group.objects : []) {
      pushObject(object, nextPath);
    }
    for (const childGroup of Array.isArray(group.groups) ? group.groups : []) {
      visitGroup(childGroup, nextPath);
    }
  };
  for (const group of Array.isArray(composition.spatialGroups) ? composition.spatialGroups : []) {
    visitGroup(group);
  }
  for (const world of Array.isArray(composition.worlds) ? composition.worlds : []) {
    for (const object of Array.isArray(world.children) ? world.children : []) {
      pushObject(object, [world.name || 'world']);
    }
  }

  return {
    schema: 'format-stress-headless-scene-snapshot-v1',
    source: 'HoloCompositionParser',
    stage: rel(REPO_ROOT, stagePath),
    objectCount: objects.length,
    templateCount: templates.size,
    objects,
  };
}

async function loadHeadlessSceneSnapshot(stagePath) {
  try {
    const { HoloCompositionParser } = await import('@holoscript/core');
    const parser = new HoloCompositionParser();
    const result = parser.parse(readFileSync(stagePath, 'utf8'));
    if (result?.success && result.ast) {
      return buildSceneSnapshotFromAst(result.ast, stagePath);
    }
    return {
      ...fallbackSceneSnapshot(stagePath),
      source: 'regex-fallback-after-parser-error',
      parserErrors: result?.errors || [],
    };
  } catch (error) {
    return {
      ...fallbackSceneSnapshot(stagePath),
      source: 'regex-fallback-after-import-error',
      parserError: error instanceof Error ? error.message : String(error),
    };
  }
}

function sceneRuntimeSummary(sceneSnapshot) {
  const objectCount = Number.isFinite(sceneSnapshot?.objectCount) ? sceneSnapshot.objectCount : 0;
  return {
    schema: sceneSnapshot?.schema || 'format-stress-headless-scene-snapshot-v1',
    source: sceneSnapshot?.source || 'unavailable',
    stage: sceneSnapshot?.stage || null,
    objectCount,
    templateCount: Number.isFinite(sceneSnapshot?.templateCount)
      ? sceneSnapshot.templateCount
      : null,
    status: objectCount > 0 ? 'instantiated' : 'missing',
  };
}

function sceneObjectAnchors(sceneSnapshot, limit = 8) {
  return (Array.isArray(sceneSnapshot?.objects) ? sceneSnapshot.objects : [])
    .slice(0, limit)
    .map((object) => ({
      id: object.id,
      type: object.type,
      template: object.template ?? null,
      transform: object.transform ?? {},
      physics: object.physics ?? {},
    }));
}

function readCommandStdoutJson(command) {
  if (!command || command.skipped || !command.stdout) return null;
  const stdoutPath = resolveRepoPath(command.stdout);
  if (!existsSync(stdoutPath)) return null;
  const raw = readFileSync(stdoutPath, 'utf8').trim();
  if (!raw) return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function sceneSnapshotFromHeadlessReceipt(receipt, stagePath, fallbackSnapshot) {
  const scene = asRecord(receipt?.scene);
  const objects = Array.isArray(scene.objects) ? scene.objects : [];
  if (objects.length === 0) return fallbackSnapshot;
  const templates = unique(objects.map((object) => object?.template).filter(Boolean));
  return {
    schema: 'format-stress-headless-scene-snapshot-v1',
    source: 'hs-headless-json',
    runtimeSchema: scene.schema || null,
    stage: rel(REPO_ROOT, stagePath),
    objectCount: Number.isFinite(scene.objectCount) ? scene.objectCount : objects.length,
    templateCount: templates.length,
    runtimeStats: receipt.stats || {},
    objects,
  };
}

async function runCommand({ id, args, logDir, dryRun }) {
  const startedAt = Date.now();
  const stdoutPath = join(logDir, `${id}.stdout.txt`);
  const stderrPath = join(logDir, `${id}.stderr.txt`);
  mkdirSync(logDir, { recursive: true });

  if (dryRun) {
    writeFileSync(stdoutPath, '[dry-run] command skipped\n', 'utf8');
    writeFileSync(stderrPath, '', 'utf8');
    return {
      id,
      command: '[dry-run]',
      args,
      success: true,
      skipped: true,
      exitCode: 0,
      durationMs: 0,
      stdout: rel(REPO_ROOT, stdoutPath),
      stderr: rel(REPO_ROOT, stderrPath),
    };
  }

  const cli = getCliInvocation();
  const fullArgs = [...cli.baseArgs, ...args];
  const commandText = `${cli.label} ${args.join(' ')}`;

  return new Promise((resolveCommand) => {
    const child = spawn(cli.command, fullArgs, {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      stderr += `${error.message}\n`;
      writeFileSync(stdoutPath, stdout, 'utf8');
      writeFileSync(stderrPath, stderr, 'utf8');
      resolveCommand({
        id,
        command: commandText,
        args,
        success: false,
        exitCode: -1,
        durationMs: Date.now() - startedAt,
        stdout: rel(REPO_ROOT, stdoutPath),
        stderr: rel(REPO_ROOT, stderrPath),
        error: error.message,
      });
    });
    child.on('close', (code) => {
      writeFileSync(stdoutPath, stdout, 'utf8');
      writeFileSync(stderrPath, stderr, 'utf8');
      resolveCommand({
        id,
        command: commandText,
        args,
        success: code === 0,
        exitCode: code,
        durationMs: Date.now() - startedAt,
        stdout: rel(REPO_ROOT, stdoutPath),
        stderr: rel(REPO_ROOT, stderrPath),
      });
    });
  });
}

function stillModeFor(index, screenshotCommand, screenshotAvailable, replayStills) {
  if (!screenshotCommand || screenshotCommand.skipped || !screenshotAvailable) return 'placeholder';
  if (!screenshotCommand.success) return 'placeholder';
  if (index === 0) return 'captured-scene-loaded';
  return replayStills ? SEGMENT_REPLAY_MODE : 'static-scene-copy';
}

function sha256File(filePath) {
  if (!existsSync(filePath)) return null;
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function buildStillEvidence(receipts, outputDir) {
  return receipts.map((receipt) => {
    const absolutePath = join(outputDir, receipt.still);
    const exists = existsSync(absolutePath);
    return {
      segment: receipt.segment ?? receipt.id,
      label: receipt.label,
      still: receipt.still,
      exists,
      bytes: exists ? statSync(absolutePath).size : 0,
      sha256: sha256File(absolutePath),
      mode: receipt.stillMode,
      oracleStatus: receipt.oracle.status,
    };
  });
}

function isReplayLikeStillMode(mode) {
  return !['placeholder', 'static-scene-copy'].includes(mode);
}

export function summarizeVisualEvidence(stillEvidence) {
  const existing = stillEvidence.filter((entry) => entry.exists);
  const hashes = existing.map((entry) => entry.sha256).filter(Boolean);
  const uniqueHashCount = new Set(hashes).size;
  const hashCounts = new Map();
  for (const hash of hashes) {
    hashCounts.set(hash, (hashCounts.get(hash) || 0) + 1);
  }

  const replayCandidates = existing.filter((entry) => isReplayLikeStillMode(entry.mode));
  const replayDistinct = replayCandidates.filter(
    (entry) => entry.sha256 && hashCounts.get(entry.sha256) === 1
  );
  const engineFrameReplaySegments = existing.filter(
    (entry) => entry.mode === ENGINE_FRAME_REPLAY_MODE
  ).length;
  const worldModelPixelReplaySegments = existing.filter(
    (entry) => entry.mode === WORLD_MODEL_PIXEL_REPLAY_MODE
  ).length;
  const staticCopySegments = existing.filter((entry) => entry.mode === 'static-scene-copy').length;
  const placeholderSegments = existing.filter((entry) => entry.mode === 'placeholder').length;
  const falseGreenRisk =
    existing.length > 1 && uniqueHashCount === 1
      ? 'all-stills-byte-identical'
      : existing.length > uniqueHashCount
        ? 'duplicate-still-hashes'
        : 'none-detected';

  return {
    stillFilesPresent: existing.length,
    uniqueStillHashes: uniqueHashCount,
    replayCandidateSegments: replayCandidates.length,
    replayDistinctSegments: replayDistinct.length,
    capturedReplaySegments: replayDistinct.length,
    replayDistinctSegmentIds: replayDistinct.map((entry) => entry.segment),
    engineFrameReplaySegments,
    worldModelPixelReplaySegments,
    staticCopySegments,
    placeholderSegments,
    staticCopyCoverageBlocked: staticCopySegments > 0,
    dynamicReplayBlockedSegments: stillEvidence.filter(
      (entry) => entry.oracleStatus === 'blocked-dynamic-replay'
    ).length,
    falseGreenRisk,
    visualCoverageStatus:
      replayDistinct.length > 0 && falseGreenRisk === 'none-detected'
        ? 'replay-distinct'
        : staticCopySegments > 0
          ? 'blocked-static-copy'
          : placeholderSegments > 0
            ? 'blocked-placeholder'
            : falseGreenRisk === 'none-detected'
              ? 'no-stills'
              : 'blocked-duplicate-stills',
  };
}

function ownerForSegment(segmentId) {
  if (segmentId === '00_scene_loaded') return 'CLI screenshot and HoloLand visual debugger';
  if (segmentId.includes('grab') || segmentId.includes('release') || segmentId.includes('impact')) {
    return 'engine headless event playback and physics runtime';
  }
  if (segmentId.includes('arc')) return 'physics trajectory solver and deterministic replay';
  return 'HoloLand segmented camera choreography';
}

function worldModelEventTypesForSegment(segmentId) {
  if (segmentId === '00_scene_loaded') return ['scene_loaded'];
  if (segmentId === '01_avatar_approaches') return ['avatar_approached'];
  if (segmentId === '02_hand_reaches') return ['hand_reached'];
  if (segmentId === '03_grab_constraint') return ['grab_constraint_attached'];
  if (segmentId === '04_lift_pose') return ['lift_pose'];
  if (segmentId === '05_windup') return ['windup_pose'];
  if (segmentId === '06_release') return ['release'];
  if (segmentId === '07_ballistic_arc') return ['ballistic_sample'];
  if (segmentId === '08_impact') return ['target_contact'];
  if (segmentId === '09_aftermath') return ['aftermath'];
  return [];
}

function worldModelEventsForSegment(worldModelReplay, segmentId) {
  const eventTypes = new Set(worldModelEventTypesForSegment(segmentId));
  const events = Array.isArray(worldModelReplay?.result?.events) ? worldModelReplay.result.events : [];
  return events.filter((event) => eventTypes.has(event?.type));
}

function worldModelCanDriveSegmentPixels(segmentId, worldModelReplay) {
  if (
    ![
      '01_avatar_approaches',
      '02_hand_reaches',
      '03_grab_constraint',
      '04_lift_pose',
      '05_windup',
      '06_release',
      '07_ballistic_arc',
      '08_impact',
      '09_aftermath',
    ].includes(segmentId)
  ) {
    return false;
  }
  return worldModelEventsForSegment(worldModelReplay, segmentId).length > 0;
}

function worldModelEvents(worldModelReplay) {
  return Array.isArray(worldModelReplay?.result?.events) ? worldModelReplay.result.events : [];
}

function worldModelEvent(worldModelReplay, type) {
  return worldModelEvents(worldModelReplay).find((event) => event?.type === type);
}

function worldModelObjectCenter(worldModelReplay, objectId) {
  const objects = Array.isArray(worldModelReplay?.result?.objects) ? worldModelReplay.result.objects : [];
  const object = objects.find((item) => item?.id === objectId);
  return pointToVector(object?.center);
}

function finiteMetric(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pointToVector(point) {
  if (!point || typeof point !== 'object') return null;
  const x = finiteMetric(point.x);
  const y = finiteMetric(point.y);
  const z = finiteMetric(point.z);
  if (x === null || y === null) return null;
  return [Number(x.toFixed(3)), Number(y.toFixed(3)), Number((z ?? 0).toFixed(3))];
}

function eventPayloadVector(event, field) {
  return pointToVector(event?.payload?.[field]);
}

function eventPayloadVelocity(event, field) {
  const velocity = pointToVector(event?.payload?.[field]);
  return velocity ? velocity.map((value) => Number(value.toFixed(3))) : null;
}

function worldModelTrajectorySamples(worldModelReplay, { includeImpact = false } = {}) {
  const events = worldModelEvents(worldModelReplay);
  const samples = [];
  const release = worldModelEvent(worldModelReplay, 'release');
  const releasePosition = eventPayloadVector(release, 'releasePosition');
  if (releasePosition) samples.push(releasePosition);

  for (const event of events.filter((item) => item?.type === 'ballistic_sample')) {
    const sample = eventPayloadVector(event, 'rockPosition');
    if (sample) samples.push(sample);
  }

  if (includeImpact) {
    const impact = events.find((event) => event?.type === 'target_contact');
    const impactPosition = eventPayloadVector(impact, 'rockPosition');
    if (impactPosition) samples.push(impactPosition);
  }

  return samples;
}

function setVector(target, key, value) {
  if (value) target[key] = value;
}

function formatVector(vector) {
  const values = Array.isArray(vector) ? vector : [0, 0, 0];
  return `[${values.map((value) => Number(Number(value || 0).toFixed(3))).join(', ')}]`;
}

function objectBlock(name, { geometry, color, position, scale, opacity }) {
  return [
    `  object "${name}" {`,
    `    geometry: "${geometry}"`,
    `    color: "${color}"`,
    `    position: ${formatVector(position)}`,
    `    scale: ${formatVector(scale)}`,
    opacity === undefined ? null : `    opacity: ${Number(opacity.toFixed(3))}`,
    '  }',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildEngineReplayOverlaySource({ segment, pose }) {
  const avatar = pose.bodies.avatar.position;
  const hand = pose.bodies.rightHand.position;
  const rock = pose.bodies.rock.position;
  const target = pose.bodies.target.position;
  const arcSamples = Array.isArray(pose.physics.arcSamples) ? pose.physics.arcSamples : [];
  const arcBlocks = arcSamples.map((sample, index) =>
    objectBlock(`ReplayArcSample${String(index).padStart(2, '0')}`, {
      geometry: 'sphere',
      color: '#ffd76a',
      position: sample,
      scale: [0.12, 0.12, 0.12],
      opacity: 0.75,
    })
  );

  return `
  // Scene-native replay injection for ${segment.id}; preserves the authored stage.
  light "ReplayKeyLight_${segment.id}" {
    type: "directional"
    position: [5, 8, 6]
    color: "#ffffff"
    intensity: 1.3
  }

${objectBlock(`ReplayAvatar_${segment.id}`, {
  geometry: 'capsule',
  color: '#7aa2f7',
  position: avatar,
  scale: [0.42, 1.12, 0.42],
})}

${objectBlock(`ReplayRightHand_${segment.id}`, {
  geometry: 'sphere',
  color: pose.bodies.rightHand.contact ? '#9ece6a' : '#f6c177',
  position: hand,
  scale: [0.2, 0.2, 0.2],
})}

${objectBlock(`ReplayRock_${segment.id}`, {
  geometry: 'sphere',
  color: pose.bodies.rock.attachedToHand ? '#bb9af7' : '#c0caf5',
  position: rock,
  scale: [0.26, 0.26, 0.26],
})}

${objectBlock(`ReplayTarget_${segment.id}`, {
  geometry: 'cube',
  color: pose.bodies.target.impacted ? '#f7768e' : '#7dcfff',
  position: target,
  scale: [0.28, 0.9, 0.18],
})}

${arcBlocks.join('\n\n')}

${objectBlock(`ReplayProvenancePanel_${segment.id}`, {
  geometry: 'cube',
  color: pose.physics.provenancePanel ? '#9ece6a' : '#414868',
  position: [2.9, 1.7, -0.25],
  scale: [0.9, 0.44, 0.05],
  opacity: 0.82,
})}
`;
}

function injectReplayOverlayIntoStage(stageSource, overlaySource) {
  const trimmed = stageSource.trimEnd();
  if (!trimmed.endsWith('}')) {
    return `${stageSource}\n${overlaySource}\n`;
  }
  const lastBrace = trimmed.lastIndexOf('}');
  return `${trimmed.slice(0, lastBrace)}\n${overlaySource}\n${trimmed.slice(lastBrace)}\n`;
}

function applyWorldModelPoseOverrides(pose, segment, worldModelReplay, worldModelEvents) {
  if (!worldModelCanDriveSegmentPixels(segment.id, worldModelReplay)) return pose;
  const approach = worldModelEvent(worldModelReplay, 'avatar_approached');
  const reach = worldModelEvent(worldModelReplay, 'hand_reached');
  const lift = worldModelEvent(worldModelReplay, 'lift_pose');
  const windup = worldModelEvent(worldModelReplay, 'windup_pose');
  const release = worldModelEvent(worldModelReplay, 'release');
  const impact = worldModelEvent(worldModelReplay, 'target_contact');
  const avatarApproachTo = eventPayloadVector(approach, 'to');
  const handReachPosition = eventPayloadVector(reach, 'handPosition');
  const initialRockPosition = worldModelObjectCenter(worldModelReplay, 'rock');
  const targetPosition = worldModelObjectCenter(worldModelReplay, 'target');
  const next = {
    ...pose,
    mode: WORLD_MODEL_PIXEL_REPLAY_MODE,
    complete: true,
    bodies: {
      avatar: { ...pose.bodies.avatar },
      rightHand: { ...pose.bodies.rightHand },
      rock: { ...pose.bodies.rock, attachedToHand: false, released: true },
      target: { ...pose.bodies.target },
    },
    physics: { ...pose.physics },
    notes: [
      'Rendered still positions are driven by the world-model replay event payloads.',
      'This is a deterministic 2D receipt renderer, not the full engine renderer yet.',
    ],
  };

  setVector(next.bodies.avatar, 'position', avatarApproachTo);
  setVector(next.bodies.rock, 'position', initialRockPosition);
  setVector(next.bodies.target, 'position', targetPosition);

  const releaseVelocity = eventPayloadVelocity(release, 'releaseVelocity');
  if (releaseVelocity) next.physics.releaseVelocityMps = releaseVelocity;

  if (segment.id === '01_avatar_approaches') {
    setVector(next.bodies.avatar, 'position', avatarApproachTo);
    setVector(next.bodies.rightHand, 'position', worldModelObjectCenter(worldModelReplay, 'right-hand'));
    setVector(next.bodies.rock, 'position', initialRockPosition);
    next.bodies.rock.attachedToHand = false;
    next.bodies.rock.released = false;
    return next;
  }

  if (segment.id === '02_hand_reaches') {
    setVector(next.bodies.rightHand, 'position', handReachPosition);
    setVector(next.bodies.rock, 'position', initialRockPosition);
    next.bodies.rightHand.contact = 'near-rock';
    next.bodies.rock.attachedToHand = false;
    next.bodies.rock.released = false;
    next.physics.clearanceM = finiteMetric(reach?.payload?.clearanceM);
    return next;
  }

  if (segment.id === '03_grab_constraint') {
    const grabPosition = handReachPosition ?? initialRockPosition;
    setVector(next.bodies.rightHand, 'position', grabPosition);
    setVector(next.bodies.rock, 'position', grabPosition);
    next.bodies.rightHand.contact = 'rock';
    next.bodies.rock.attachedToHand = true;
    next.bodies.rock.released = false;
    next.physics.constraint = worldModelEvents[0]?.payload?.constraint ?? 'hand-rock-fixed';
    return next;
  }

  if (segment.id === '04_lift_pose') {
    const liftPosition = eventPayloadVector(lift, 'rockPosition');
    setVector(next.bodies.rightHand, 'position', liftPosition);
    setVector(next.bodies.rock, 'position', liftPosition);
    next.bodies.rightHand.contact = 'rock';
    next.bodies.rock.attachedToHand = true;
    next.bodies.rock.released = false;
    return next;
  }

  if (segment.id === '05_windup') {
    const windupPosition = eventPayloadVector(windup, 'rockPosition');
    setVector(next.bodies.rightHand, 'position', windupPosition);
    setVector(next.bodies.rock, 'position', windupPosition);
    next.bodies.rightHand.contact = 'rock';
    next.bodies.rock.attachedToHand = true;
    next.bodies.rock.released = false;
    next.physics.shoulderYawDeg = finiteMetric(windup?.payload?.shoulderYawDeg);
    return next;
  }

  if (segment.id === '06_release') {
    const releasePosition = eventPayloadVector(release, 'releasePosition');
    if (releasePosition) {
      next.bodies.rock.position = releasePosition;
      next.bodies.rightHand.position = releasePosition;
    }
    next.physics.arcSamples = releasePosition ? [releasePosition] : [];
    return next;
  }

  if (segment.id === '07_ballistic_arc') {
    const samples = worldModelTrajectorySamples(worldModelReplay);
    if (samples.length > 0) {
      next.bodies.rock.position = samples[samples.length - 1];
      next.physics.arcSamples = samples;
    }
    return next;
  }

  if (segment.id === '08_impact') {
    const impactPosition = eventPayloadVector(impact, 'rockPosition');
    if (impactPosition) next.bodies.rock.position = impactPosition;
    next.bodies.target.impacted = true;
    next.physics.arcSamples = worldModelTrajectorySamples(worldModelReplay, { includeImpact: true });
    next.physics.impactImpulseNs = finiteMetric(impact?.payload?.impulseNs);
  }

  if (segment.id === '09_aftermath') {
    const impactPosition = eventPayloadVector(impact, 'rockPosition');
    if (impactPosition) next.bodies.rock.position = impactPosition;
    next.bodies.target.impacted = Boolean(worldModelEvents[0]?.payload?.observedImpact);
    next.physics.arcSamples = worldModelTrajectorySamples(worldModelReplay, { includeImpact: true });
    next.physics.provenancePanel = Boolean(worldModelEvents[0]?.payload?.provenancePanel);
  }

  return next;
}

function worldModelReplaySummary(worldModelReplay) {
  if (!worldModelReplay?.result || !worldModelReplay?.trajectory) return null;
  return {
    schema: worldModelReplay.schema_version,
    sceneId: worldModelReplay.scene?.id,
    sceneHash: worldModelReplay.scene?.sceneHash,
    eventLogHash: worldModelReplay.result.eventLogHash,
    trajectoryId: worldModelReplay.trajectory.id,
    trajectoryStatus: worldModelReplay.trajectory.status,
    contactCount: worldModelReplay.result.contactCount,
    predicateViolationCount: worldModelReplay.result.predicateViolationCount,
  };
}

function posePhysicsFor(segment, index, total, sceneSnapshot, worldModelReplay) {
  const progress = total <= 1 ? 0 : index / (total - 1);
  const avatarX = -3 + progress * 4.8;
  const rockX = index < 3 ? -1.2 : -1.2 + Math.max(0, progress - 0.33) * 5.8;
  const rockY = index < 4 ? 0.35 : index < 7 ? 1.3 : Math.max(0.35, 2.1 - progress * 1.5);
  const released = index >= 6;
  const worldModelEvents = worldModelEventsForSegment(worldModelReplay, segment.id);
  const hasWorldModelEvidence = worldModelEvents.length > 0;

  const pose = {
    schema: 'format-stress-pose-physics-v1',
    segmentId: segment.id,
    mode: hasWorldModelEvidence ? WORLD_MODEL_REPLAY_MODE : 'kinematic-placeholder',
    complete: hasWorldModelEvidence,
    owningSurface: ownerForSegment(segment.id),
    sceneObjectCount: Number.isFinite(sceneSnapshot?.objectCount) ? sceneSnapshot.objectCount : 0,
    sceneSnapshotSource: sceneSnapshot?.source || 'unavailable',
    runtimeScene: sceneRuntimeSummary(sceneSnapshot),
    sceneObjectAnchors: sceneObjectAnchors(sceneSnapshot),
    worldModelReplay: worldModelReplaySummary(worldModelReplay),
    worldModelEvents,
    bodies: {
      avatar: {
        position: [Number(avatarX.toFixed(3)), 1.1, 0],
        facing: 'rock-target-line',
      },
      rightHand: {
        position: [
          Number((avatarX + 0.45).toFixed(3)),
          Number((1.2 + progress * 0.5).toFixed(3)),
          0.18,
        ],
        contact: index >= 3 && index <= 5 ? 'rock' : null,
      },
      rock: {
        position: [Number(rockX.toFixed(3)), Number(rockY.toFixed(3)), 0],
        attachedToHand: index >= 3 && index <= 5,
        released,
      },
      target: {
        position: [3.5, 1, 0],
        impacted: index >= 8,
      },
    },
    physics: {
      massKg: 1.8,
      releaseVelocityMps: released ? [12.5, 4.2, 0] : null,
      arcSamples: released
        ? [
            [Number(rockX.toFixed(3)), Number(rockY.toFixed(3)), 0],
            [Number((rockX + 0.8).toFixed(3)), Number((rockY + 0.35).toFixed(3)), 0],
            [Number((rockX + 1.6).toFixed(3)), Number((rockY - 0.15).toFixed(3)), 0],
          ]
        : [],
      solver: hasWorldModelEvidence
        ? 'world-model-humanoid-rock-throw-v1'
        : 'placeholder-until-engine-replay',
    },
    notes: hasWorldModelEvidence
      ? [
          'World-model replay emitted semantic events for this segment.',
          'Visual stills are still kinematic; this receipt upgrades event provenance, not pixel physics.',
          'Next ratchet: drive rendered segment state directly from this replay event stream.',
        ]
      : [
          'Generated by segmented runner so every segment has a machine-readable receipt.',
          'Not a physics proof; replace with engine replay output when available.',
          'Headless runtime scene objects are real receipt anchors; segment motion is still placeholder.',
        ],
  };

  return applyWorldModelPoseOverrides(pose, segment, worldModelReplay, worldModelEvents);
}

export function buildSegmentReceipt({
  segment,
  index,
  outputDir,
  stillPath,
  stillMode,
  commandResults,
  eventLogPath,
  posePhysicsPath,
  taskSeedPath,
  sceneSnapshot,
  worldModelReplay,
}) {
  const headless = commandResults.find((command) => command.id === 'headless-holo');
  const screenshot = commandResults.find((command) => command.id === 'screenshot-base');
  const engineFrame = commandResults.find((command) => command.id === `engine-frame-${segment.id}`);
  const dynamicSegment = index > 0;
  const replayStill =
    dynamicSegment &&
    (stillMode === SEGMENT_REPLAY_MODE ||
      stillMode === WORLD_MODEL_PIXEL_REPLAY_MODE ||
      stillMode === ENGINE_FRAME_REPLAY_MODE);
  const worldModelEvents = worldModelEventsForSegment(worldModelReplay, segment.id);
  const hasWorldModelEvidence = worldModelEvents.length > 0;
  const hasEngineFrameReplay = hasWorldModelEvidence && stillMode === ENGINE_FRAME_REPLAY_MODE;
  const hasWorldModelPixelReplay =
    hasWorldModelEvidence && stillMode === WORLD_MODEL_PIXEL_REPLAY_MODE;
  const status =
    hasEngineFrameReplay
      ? ENGINE_FRAME_REPLAY_MODE
      : hasWorldModelPixelReplay
      ? WORLD_MODEL_PIXEL_REPLAY_MODE
      : hasWorldModelEvidence
      ? WORLD_MODEL_REPLAY_MODE
      :
    screenshot?.success && !dynamicSegment && headless?.success
      ? 'partial-pass'
      : replayStill
        ? 'segment-replay-receipt'
        : dynamicSegment
          ? 'blocked-dynamic-replay'
          : 'partial-pass';
  const owner = ownerForSegment(segment.id);

  return {
    id: segment.id,
    title: segment.title,
    expectedStill: segment.expectedStill,
    checks: segment.checks || [],
    still: rel(outputDir, stillPath),
    stillMode,
    eventLog: rel(outputDir, eventLogPath),
    posePhysicsJson: rel(outputDir, posePhysicsPath),
    runtimeScene: sceneRuntimeSummary(sceneSnapshot),
    worldModelEvents,
    oracle: {
      status,
      owningSurface: owner,
      findings: dynamicSegment
        ? hasEngineFrameReplay
          ? [
              'World-model replay emitted semantic events for this segment.',
              'The still was captured through the engine Puppeteer frame path from scene-native replay injection in the authored HoloLand stage.',
              `Next owner: ${owner}.`,
            ]
          : hasWorldModelPixelReplay
          ? [
              'World-model replay emitted semantic events for this segment.',
              'The still renderer consumed the replay event payload for rock position and trajectory.',
              `Next owner: ${owner}.`,
            ]
          : hasWorldModelEvidence
            ? [
                'World-model replay emitted semantic events for this segment.',
                'The still is still kinematic; event provenance is replay-backed but pixels are not yet event-driven.',
                `Next owner: ${owner}.`,
              ]
          : replayStill
            ? [
                'Segment replay still generated from the segment pose/state payload.',
                'The still is visual replay evidence, not a full engine physics proof yet.',
                `Next owner: ${owner}.`,
              ]
          : [
              'Static still exists, but segment-specific camera/pose playback is not implemented yet.',
              `Next owner: ${owner}.`,
            ]
        : [
            'Scene-loaded still and command evidence exist; visual realism remains a separate quality ratchet.',
          ],
    },
    timing: {
      runnerMs: 0,
      screenshotMs: screenshot?.durationMs ?? null,
      headlessMs: headless?.durationMs ?? null,
      engineFrameMs: engineFrame?.durationMs ?? null,
      frameBudget: {
        targetHz: 60,
        budgetMs: 16.67,
        observedMs: headless?.success ? headless.durationMs : null,
        note: dynamicSegment
          ? hasEngineFrameReplay
            ? 'Engine frame capture consumed scene-native replay HoloScript; frame timing is still command-level evidence.'
            : hasWorldModelPixelReplay
            ? 'World-model event payload drives this still; frame timing is still command-level evidence.'
            : hasWorldModelEvidence
            ? 'World-model event replay exists for this segment; frame timing is still command-level evidence.'
            : replayStill
            ? 'Replay still is generated from deterministic segment state; frame timing is command-level evidence.'
            : 'No real per-frame segment replay yet; timing is command-level evidence.'
          : 'Scene load command-level timing, not a render-frame profiler.',
      },
    },
    taskSeed: rel(outputDir, taskSeedPath),
  };
}

function buildTaskSeed(segment, receipt) {
  return {
    schema: 'holomesh-board-task-seed-v1',
    source: 'format-realism-gauntlet',
    title: `[format-stress] Implement dynamic evidence for ${segment.id}`,
    priority: receipt.oracle.status === 'blocked-dynamic-replay' ? 1 : 2,
    owningSurface: receipt.oracle.owningSurface,
    description: [
      `Segment: ${segment.title} (${segment.id})`,
      `Observed: ${receipt.oracle.findings.join(' ')}`,
      `Receipt: ${receipt.id}`,
      'Acceptance: still, event log, pose/physics JSON, oracle, and timing come from real segment playback rather than static-copy evidence.',
    ].join('\n'),
  };
}

async function runEvidenceCommands({ options, manifestPath, manifest, outputDir }) {
  const logDir = join(outputDir, 'commands');
  const compiledDir = join(outputDir, 'compiled');
  const stillsDir = join(outputDir, 'stills');
  mkdirSync(compiledDir, { recursive: true });
  mkdirSync(stillsDir, { recursive: true });

  const stagePath = resolveFromManifest(manifestPath, manifest.formats.stage);
  const behaviorPath = resolveFromManifest(manifestPath, manifest.formats.behavior);
  const pipelinePath = resolveFromManifest(manifestPath, manifest.formats.pipeline);
  const screenshotPath = join(
    stillsDir,
    manifest.segments[0]?.expectedStill || '00_scene_loaded.png'
  );

  const commandPlans = [
    ['parse-holo', ['parse', stagePath, '--json']],
    ['parse-hsplus', ['parse', behaviorPath, '--json']],
    ['parse-hs', ['parse', pipelinePath, '--json']],
    [
      'compile-holo-threejs',
      ['compile', stagePath, '--target', 'threejs', '-o', join(compiledDir, 'holo-threejs')],
    ],
    [
      'compile-hsplus-threejs',
      ['compile', behaviorPath, '--target', 'threejs', '-o', join(compiledDir, 'hsplus-threejs')],
    ],
    [
      'compile-hs-node',
      ['compile', pipelinePath, '--target', 'node', '-o', join(compiledDir, 'hs-node.mjs')],
    ],
  ];

  if (!options.skipHeadless) {
    commandPlans.push(['headless-holo', ['headless', stagePath, '--duration', '250', '--json']]);
  }

  if (options.baseStill) {
    const baseStillPath = resolveRepoPath(options.baseStill);
    const stdoutPath = join(logDir, 'screenshot-base.stdout.txt');
    const stderrPath = join(logDir, 'screenshot-base.stderr.txt');
    mkdirSync(logDir, { recursive: true });
    if (!existsSync(baseStillPath)) {
      writeFileSync(stdoutPath, '', 'utf8');
      writeFileSync(stderrPath, `Base still not found: ${baseStillPath}\n`, 'utf8');
      commandPlans.push([
        'screenshot-base',
        ['screenshot', stagePath, '-o', screenshotPath, '--base-still', baseStillPath],
      ]);
    } else {
      writeFileSync(screenshotPath, readFileSync(baseStillPath));
      writeFileSync(
        stdoutPath,
        `Using pre-captured base still: ${rel(REPO_ROOT, baseStillPath)}\n`
      );
      writeFileSync(stderrPath, '', 'utf8');
      commandPlans.push([
        'screenshot-base',
        ['screenshot', stagePath, '-o', screenshotPath, '--base-still', baseStillPath],
      ]);
    }
  } else if (!options.skipScreenshot) {
    commandPlans.push([
      'screenshot-base',
      [
        'screenshot',
        stagePath,
        '-o',
        screenshotPath,
        '--width',
        String(options.width),
        '--height',
        String(options.height),
        '--wait-for',
        String(options.waitFor),
      ],
    ]);
  }
  if (manifest.flagship === 'humanoid-rock-throw') {
    commandPlans.push([
      'world-model-humanoid-rock-throw',
      ['world-model', 'replay', '--scene', 'humanoid-rock-throw-v1', '--seed', '4242', '--json'],
    ]);
  }

  const results = [];
  for (const [id, args] of commandPlans) {
    if (options.baseStill && id === 'screenshot-base') {
      const baseStillPath = resolveRepoPath(options.baseStill);
      results.push({
        id,
        command: `pre-captured base still ${rel(REPO_ROOT, baseStillPath)}`,
        args,
        success: existsSync(baseStillPath),
        skipped: false,
        exitCode: existsSync(baseStillPath) ? 0 : 1,
        durationMs: 0,
        stdout: rel(REPO_ROOT, join(logDir, 'screenshot-base.stdout.txt')),
        stderr: rel(REPO_ROOT, join(logDir, 'screenshot-base.stderr.txt')),
      });
    } else {
      results.push(await runCommand({ id, args, logDir, dryRun: options.dryRun }));
    }
  }

  const fallbackSceneSnapshot = await loadHeadlessSceneSnapshot(stagePath);
  const headlessReceipt = readCommandStdoutJson(
    results.find((command) => command.id === 'headless-holo')
  );
  const sceneSnapshot = sceneSnapshotFromHeadlessReceipt(
    headlessReceipt,
    stagePath,
    fallbackSceneSnapshot
  );
  const worldModelReplay = readCommandStdoutJson(
    results.find((command) => command.id === 'world-model-humanoid-rock-throw')
  );

  return { results, screenshotPath, sceneSnapshot, worldModelReplay };
}

async function tryRenderEngineReplayStill({
  segment,
  index,
  total,
  outputDir,
  stillPath,
  stagePath,
  sceneSnapshot,
  worldModelReplay,
  width,
  height,
  dryRun,
}) {
  const pose = posePhysicsFor(segment, index, total, sceneSnapshot, worldModelReplay);
  const sourceDir = join(outputDir, 'scene-native-replay-sources');
  const logDir = join(outputDir, 'commands');
  mkdirSync(sourceDir, { recursive: true });
  const sourcePath = join(sourceDir, `${segment.id}.holo`);
  const stageSource = existsSync(stagePath) ? readFileSync(stagePath, 'utf8') : '';
  writeFileSync(
    sourcePath,
    injectReplayOverlayIntoStage(stageSource, buildEngineReplayOverlaySource({ segment, pose })),
    'utf8'
  );

  return runCommand({
    id: `engine-frame-${segment.id}`,
    args: [
      'screenshot',
      sourcePath,
      '-o',
      stillPath,
      '--width',
      String(width),
      '--height',
      String(height),
      '--wait-for',
      '250',
    ],
    logDir,
    dryRun,
  });
}

async function ensureSegmentStills({
  manifest,
  manifestPath,
  outputDir,
  screenshotPath,
  screenshotCommand,
  commandResults,
  sceneSnapshot,
  worldModelReplay,
  replayStills,
  engineFrameStills,
  dryRun,
  width,
  height,
}) {
  const stillsDir = join(outputDir, 'stills');
  const stagePath = resolveFromManifest(manifestPath, manifest.formats.stage);
  mkdirSync(stillsDir, { recursive: true });
  const baseExists = existsSync(screenshotPath);
  if (!baseExists) {
    writeFileSync(screenshotPath, PLACEHOLDER_PNG);
  }

  const stills = [];
  for (let index = 0; index < manifest.segments.length; index++) {
    const segment = manifest.segments[index];
    const stillPath = join(stillsDir, segment.expectedStill || `${segment.id}.png`);
    let stillMode = stillModeFor(index, screenshotCommand, baseExists, replayStills);
    if (
      stillMode === SEGMENT_REPLAY_MODE &&
      worldModelCanDriveSegmentPixels(segment.id, worldModelReplay)
    ) {
      stillMode = WORLD_MODEL_PIXEL_REPLAY_MODE;
    }
    if (index === 0) {
      if (!existsSync(stillPath)) writeFileSync(stillPath, PLACEHOLDER_PNG);
      stills.push({ segment, stillPath, stillMode });
      continue;
    }

    if (
      engineFrameStills &&
      stillMode === WORLD_MODEL_PIXEL_REPLAY_MODE &&
      screenshotCommand?.success
    ) {
      const engineFrameCommand = await tryRenderEngineReplayStill({
        segment,
        index,
        total: manifest.segments.length,
        outputDir,
        stillPath,
        stagePath,
        sceneSnapshot,
        worldModelReplay,
        width,
        height,
        dryRun,
      });
      commandResults.push(engineFrameCommand);
      if (engineFrameCommand.success && existsSync(stillPath)) {
        stillMode = ENGINE_FRAME_REPLAY_MODE;
      }
    }

    if (stillMode === ENGINE_FRAME_REPLAY_MODE) {
      // The segment-specific screenshot command already wrote this still.
    } else if (stillMode === SEGMENT_REPLAY_MODE || stillMode === WORLD_MODEL_PIXEL_REPLAY_MODE) {
      writeFileSync(
        stillPath,
        renderSegmentReplayStill({
          segment,
          index,
          total: manifest.segments.length,
          sceneSnapshot,
          worldModelReplay,
          width,
          height,
        })
      );
    } else if (existsSync(screenshotPath)) {
      writeFileSync(stillPath, readFileSync(screenshotPath));
    } else {
      writeFileSync(stillPath, PLACEHOLDER_PNG);
    }
    stills.push({ segment, stillPath, stillMode });
  }
  return stills;
}

function outputDirFor(options, manifestPath, manifest) {
  if (options.out) return resolveRepoPath(options.out);
  const artifactRoot = resolveRepoPath(manifest.artifactRoot || '.bench-logs/format-stress');
  return join(artifactRoot, options.date, manifest.flagship || 'scenario');
}

export async function runSegmentedCapture(rawOptions = {}) {
  const options = { ...parseRunnerArgs([]), ...rawOptions };
  const manifestPath = resolveRepoPath(options.manifest);
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }

  const manifest = readJson(manifestPath);
  if (!Array.isArray(manifest.segments) || manifest.segments.length === 0) {
    throw new Error(`Manifest has no segments: ${manifestPath}`);
  }

  const outputDir = outputDirFor(options, manifestPath, manifest);
  if (existsSync(outputDir) && options.dryRun) {
    rmSync(outputDir, { recursive: true, force: true });
  }
  mkdirSync(outputDir, { recursive: true });

  const startedAt = Date.now();
  const {
    results: commandResults,
    screenshotPath,
    sceneSnapshot,
    worldModelReplay,
  } = await runEvidenceCommands({
    options,
    manifestPath,
    manifest,
    outputDir,
  });

  const screenshotCommand = commandResults.find((command) => command.id === 'screenshot-base');
  const stills = await ensureSegmentStills({
    manifest,
    manifestPath,
    outputDir,
    screenshotPath,
    screenshotCommand,
    commandResults,
    sceneSnapshot,
    worldModelReplay,
    replayStills: options.replayStills,
    engineFrameStills: options.engineFrameStills,
    dryRun: options.dryRun,
    width: options.width,
    height: options.height,
  });

  const eventDir = join(outputDir, 'events');
  const poseDir = join(outputDir, 'pose-physics');
  const seedDir = join(outputDir, 'task-seeds');
  mkdirSync(eventDir, { recursive: true });
  mkdirSync(poseDir, { recursive: true });
  mkdirSync(seedDir, { recursive: true });

  const receipts = [];
  const seeds = [];

  for (let index = 0; index < stills.length; index++) {
    const { segment, stillPath, stillMode } = stills[index];
    const eventLogPath = join(eventDir, `${segment.id}.json`);
    const posePhysicsPath = join(poseDir, `${segment.id}.json`);
    const taskSeedPath = join(seedDir, `${segment.id}.json`);
    const worldModelEvents = worldModelEventsForSegment(worldModelReplay, segment.id);

    writeJson(eventLogPath, {
      schema: 'format-stress-segment-event-log-v1',
      segmentId: segment.id,
      source: 'format-stress-segmented-capture',
      runtimeScene: sceneRuntimeSummary(sceneSnapshot),
      worldModelReplay: worldModelReplaySummary(worldModelReplay),
      events: [
        { type: 'segment_requested', segment: segment.id, atMs: index * 250 },
        {
          type: 'runtime_scene_snapshot_loaded',
          segment: segment.id,
          atMs: index * 250,
          objectCount: sceneSnapshot.objectCount,
          source: sceneSnapshot.source,
        },
        {
          type:
            stillMode === ENGINE_FRAME_REPLAY_MODE
              ? 'engine_frame_replay_still_emitted'
              : stillMode === WORLD_MODEL_PIXEL_REPLAY_MODE
              ? 'world_model_pixel_replay_still_emitted'
              : stillMode === SEGMENT_REPLAY_MODE
              ? 'segment_replay_still_emitted'
              : 'still_evidence_recorded',
          segment: segment.id,
          atMs: index * 250 + 1,
          still: rel(outputDir, stillPath),
          stillMode,
        },
        { type: 'evidence_receipt_emitted', segment: segment.id, atMs: index * 250 + 2 },
        ...worldModelEvents.map((event) => ({
          type: 'world_model_event_replayed',
          segment: segment.id,
          atMs: index * 250 + 3,
          worldModelEvent: event,
        })),
      ],
      commandEvidence: commandResults.map((command) => ({
        id: command.id,
        success: command.success,
        skipped: Boolean(command.skipped),
        stdout: command.stdout,
        stderr: command.stderr,
      })),
    });

    writeJson(
      posePhysicsPath,
      posePhysicsFor(segment, index, stills.length, sceneSnapshot, worldModelReplay)
    );

    const receipt = buildSegmentReceipt({
      segment,
      index,
      outputDir,
      stillPath,
      stillMode,
      commandResults,
      eventLogPath,
      posePhysicsPath,
      taskSeedPath,
      sceneSnapshot,
      worldModelReplay,
    });
    receipt.timing.runnerMs = Date.now() - startedAt;

    const seed = buildTaskSeed(segment, receipt);
    writeJson(taskSeedPath, seed);
    receipts.push(receipt);
    seeds.push(seed);
  }

  const stillEvidence = buildStillEvidence(receipts, outputDir);
  const visualEvidence = summarizeVisualEvidence(stillEvidence);
  const replayInputs = receipts.map((receipt, index) => ({
    schema: 'format-stress-segment-replay-input-v1',
    segmentId: receipt.id,
    title: receipt.title,
    index,
    atMs: index * 250,
    still: receipt.still,
    stillMode: receipt.stillMode,
    eventLog: receipt.eventLog,
    posePhysicsJson: receipt.posePhysicsJson,
    runtimeScene: receipt.runtimeScene,
    worldModelEvents: receipt.worldModelEvents,
  }));

  const coverage = {
    segmentsRequested: manifest.segments.length,
    segmentsWithStill: receipts.filter((receipt) => existsSync(join(outputDir, receipt.still)))
      .length,
    qualityAdjustedSegmentsWithStill: visualEvidence.capturedReplaySegments,
    uniqueStillHashes: visualEvidence.uniqueStillHashes,
    staticCopySegments: visualEvidence.staticCopySegments,
    placeholderStillSegments: visualEvidence.placeholderSegments,
    dynamicReplayBlockedSegments: visualEvidence.dynamicReplayBlockedSegments,
    falseGreenRisk: visualEvidence.falseGreenRisk,
    segmentsWithRuntimeEventLog: receipts.filter((receipt) =>
      existsSync(join(outputDir, receipt.eventLog))
    ).length,
    segmentsWithPosePhysicsJson: receipts.filter((receipt) =>
      existsSync(join(outputDir, receipt.posePhysicsJson))
    ).length,
    segmentsWithTiming: receipts.filter((receipt) => receipt.timing).length,
    headlessRuntimeSceneObjects: sceneSnapshot.objectCount,
    headlessRuntimeTemplates: sceneSnapshot.templateCount,
    segmentsWithHeadlessSceneObjects: sceneSnapshot.objectCount > 0 ? receipts.length : 0,
    segmentsWithWorldModelEvents: receipts.filter((receipt) => receipt.worldModelEvents.length > 0)
      .length,
    segmentsWithWorldModelPixelReplay: receipts.filter(
      (receipt) => receipt.stillMode === WORLD_MODEL_PIXEL_REPLAY_MODE
    ).length,
    segmentsWithEngineFrameReplay: receipts.filter(
      (receipt) => receipt.stillMode === ENGINE_FRAME_REPLAY_MODE
    ).length,
  };

  const receiptPayload = {
    schema: 'format-stress-segmented-capture-v1',
    scenario: manifest.flagship,
    generatedAt: new Date().toISOString(),
    manifest: rel(REPO_ROOT, manifestPath),
    outputDir: rel(REPO_ROOT, outputDir),
    command: `node scripts/format-stress-segmented-capture.mjs ${rel(REPO_ROOT, manifestPath)}`,
    commands: commandResults,
    headlessScene: sceneSnapshot,
    worldModelReplay: worldModelReplaySummary(worldModelReplay),
    replayInputs: rel(REPO_ROOT, join(outputDir, 'segment-replay-inputs.json')),
    segments: receipts,
    visualEvidence,
    coverage,
  };

  writeJson(join(outputDir, 'segment-receipts.json'), receiptPayload);
  writeJson(join(dirname(outputDir), 'segment-receipts.json'), receiptPayload);
  writeJson(join(outputDir, 'still-evidence.json'), stillEvidence);
  writeJson(join(outputDir, 'visual-uniqueness-audit.json'), visualEvidence);
  writeJson(join(outputDir, 'segment-replay-inputs.json'), replayInputs);
  writeJson(join(outputDir, 'task-seeds.json'), seeds);
  writeJson(join(outputDir, 'scorecard.json'), {
    schema: 'format-realism-gauntlet-scorecard-v1',
    scenario: manifest.flagship,
    generatedAt: receiptPayload.generatedAt,
    qualityMetrics: manifest.qualityMetrics || [],
    coverage,
    visualEvidence,
    commandFailures: commandResults.filter((command) => !command.success),
    worldModelReplay: worldModelReplaySummary(worldModelReplay),
    highestGapSeverity:
      visualEvidence.dynamicReplayBlockedSegments > 0 ||
      visualEvidence.falseGreenRisk !== 'none-detected'
        ? 'P1'
        : coverage.segmentsWithEngineFrameReplay >= Math.max(0, manifest.segments.length - 1)
          ? 'P3'
          : 'P2',
  });

  const stillBytes = receipts.reduce((sum, receipt) => {
    const path = join(outputDir, receipt.still);
    return sum + (existsSync(path) ? statSync(path).size : 0);
  }, 0);

  return {
    ...receiptPayload,
    artifacts: {
      segmentReceipts: rel(REPO_ROOT, join(outputDir, 'segment-receipts.json')),
      rootSegmentReceipts: rel(REPO_ROOT, join(dirname(outputDir), 'segment-receipts.json')),
      scorecard: rel(REPO_ROOT, join(outputDir, 'scorecard.json')),
      stillEvidence: rel(REPO_ROOT, join(outputDir, 'still-evidence.json')),
      visualUniquenessAudit: rel(REPO_ROOT, join(outputDir, 'visual-uniqueness-audit.json')),
      segmentReplayInputs: rel(REPO_ROOT, join(outputDir, 'segment-replay-inputs.json')),
      taskSeeds: rel(REPO_ROOT, join(outputDir, 'task-seeds.json')),
      stillBytes,
    },
  };
}

async function main() {
  const options = parseRunnerArgs();
  if (options.help) {
    console.log(usage());
    return;
  }

  const receipt = await runSegmentedCapture(options);
  if (options.json) {
    console.log(JSON.stringify(receipt, null, 2));
    return;
  }

  console.log(`Segmented capture complete: ${receipt.outputDir}`);
  console.log(`  Segments: ${receipt.coverage.segmentsRequested}`);
  console.log(`  Stills: ${receipt.coverage.segmentsWithStill}`);
  console.log(`  Event logs: ${receipt.coverage.segmentsWithRuntimeEventLog}`);
  console.log(`  Pose/physics receipts: ${receipt.coverage.segmentsWithPosePhysicsJson}`);
  console.log(`  Scorecard: ${receipt.artifacts.scorecard}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
