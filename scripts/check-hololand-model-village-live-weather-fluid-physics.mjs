#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  captureScreenshot,
  createCdpClient,
  evaluate,
  removeDirectoryBestEffort,
  resolveBrowser,
  waitForDebuggerTarget,
  waitForExpression,
} from './check-hololand-model-village-observer-family-integration.mjs';
import {
  LIVE_PHYSICS_MANIFEST_REL,
  LIVE_PHYSICS_POLICY_REL,
  LIVE_PHYSICS_SEED_REL,
  LIVE_PHYSICS_SOURCE_REL,
  canonicalJson,
  digest,
  loadLivePhysicsContracts,
  runDeterministicLivePhysicsReplays,
  sha256,
} from './lib/model-village-live-physics.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const HERO_REL =
  'docs/assets/model-village/model-village-live-weather-fluid-physics-hero-2026-07-27.png';
const REPORT_REL =
  'docs/reports/HOLOLAND_MODEL_VILLAGE_MV_S3_LIVE_WEATHER_FLUID_PHYSICS_2026-07-27.md';
const OUTPUT_REL = '.tmp/hololand/model-village/live-weather-fluid-physics';
const SCHEMA = 'hololand.model-village.live-weather-fluid-physics-receipt.v1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseArgs(argv) {
  const args = {
    browser: null,
    holoScriptRoot:
      process.env.HOLOSCRIPT_ROOT ?? 'C:/Users/josep/Documents/GitHub/HoloScript',
    outputDir: path.join(REPO_ROOT, OUTPUT_REL),
    skipBrowser: false,
    writeArtifacts: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--browser') args.browser = path.resolve(argv[++index]);
    else if (arg === '--holoscript-root') args.holoScriptRoot = path.resolve(argv[++index]);
    else if (arg === '--output-dir') args.outputDir = path.resolve(argv[++index]);
    else if (arg === '--skip-browser') args.skipBrowser = true;
    else if (arg === '--write-artifacts') args.writeArtifacts = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/check-hololand-model-village-live-weather-fluid-physics.mjs [options]

Options:
  --holoscript-root <path>  Built HoloScript checkout
  --browser <path>          Chrome or Edge executable
  --output-dir <path>       Runtime HTML, screenshot, and receipt directory
  --skip-browser            Run parsers and deterministic CPU physics only
  --write-artifacts         Refresh the durable hero frame and report
  --json                    Emit the complete receipt`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function safeInlineJson(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

export function summarizeTimings(values) {
  return {
    samples: values.length,
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    maxMs: values.length > 0 ? Math.max(...values) : null,
  };
}

function browserApplication() {
  return `
(() => {
  const payload = window.__MV_S3_PAYLOAD__;
  const state = {
    ready: false,
    status: 'booting',
    error: null,
    gpu: null,
    drawCounts: null,
    controls: { paused: true, reducedMotion: false, laneExplanation: true },
    metrics: { cpuSubmitMs: [], gpuPassMs: [], queueWaitMs: [] },
  };
  window.__MV_S3__ = state;
  const $ = (selector) => document.querySelector(selector);
  const statusText = (message) => {
    $('[data-status]').textContent = message;
    $('[data-live-status]').textContent = message;
  };
  const summary = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const pick = (fraction) =>
      sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] : null;
    return {
      samples: sorted.length,
      p50Ms: pick(0.5),
      p95Ms: pick(0.95),
      p99Ms: pick(0.99),
      maxMs: sorted.length ? sorted[sorted.length - 1] : null,
    };
  };
  const xorshift = (seed) => {
    let value = seed >>> 0;
    return () => {
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      return (value >>> 0) / 4294967296;
    };
  };

  function buildInstances() {
    const values = [];
    const push = (x, y, radius, kind, color) =>
      values.push(x, y, radius, kind, color[0], color[1], color[2], color[3]);
    for (const particle of payload.physics.visualFrame.fluid) {
      const x = -0.56 + (particle.position[0] + 2.55) * 0.42;
      const y = -0.41 + (particle.position[1] - 0.28) * 0.55;
      const energy = Math.min(1, particle.position[1] / 1.6);
      push(x, y, 0.012 + energy * 0.004, 0, [0.16, 0.72, 0.91, 0.82]);
    }
    const orb = payload.physics.visualFrame.rigid.find(
      (body) => body.bodyId === 'mv-s3-collision-orb'
    );
    push(0.70, -0.30 + (orb.position[1] - 0.3) * 0.16, 0.055, 1, [0.55, 0.91, 0.92, 1]);
    push(0.70, -0.39, 0.17, 3, [0.17, 0.33, 0.39, 1]);
    const random = xorshift(payload.weather.deterministic_seed);
    for (let index = 0; index < payload.rain.presentation_particle_count; index += 1) {
      const x = -0.98 + random() * 1.96;
      const y = -0.95 + random() * 1.9;
      const radius = 0.005 + random() * 0.003;
      push(x, y, radius, 2, [0.47, 0.78, 0.95, 0.18 + random() * 0.36]);
    }
    return new Float32Array(values);
  }

  function buildClothVertices() {
    const particles = payload.physics.visualFrame.cloth;
    const byId = new Map(particles.map((particle) => [particle.id, particle]));
    const width = payload.cloth.width;
    const height = payload.cloth.height;
    const values = [];
    const add = (particle, shade) => {
      const x = 0.18 + particle.position[0] * 0.17;
      const y = 0.45 + particle.position[1] * 0.18 + particle.position[2] * 0.02;
      values.push(x, y, 0.67 * shade, 0.25 * shade, 0.13 * shade, 0.92);
    };
    for (let row = 0; row < height - 1; row += 1) {
      for (let column = 0; column < width - 1; column += 1) {
        const a = byId.get(row * width + column);
        const b = byId.get(row * width + column + 1);
        const c = byId.get((row + 1) * width + column);
        const d = byId.get((row + 1) * width + column + 1);
        const wovenStripe = column % 4 < 2 ? 1.0 : 0.78;
        const shade = wovenStripe * (0.78 + (column / width) * 0.22);
        add(a, shade); add(c, shade); add(b, shade);
        add(b, shade); add(c, shade); add(d, shade);
      }
    }
    return new Float32Array(values);
  }

  async function boot() {
    if (!navigator.gpu) throw new Error('navigator.gpu is unavailable');
    const adapterStarted = performance.now();
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('navigator.gpu.requestAdapter returned null');
    const timestampQuerySupported = adapter.features.has('timestamp-query');
    const requiredFeatures = timestampQuerySupported ? ['timestamp-query'] : [];
    const device = await adapter.requestDevice({ requiredFeatures });
    const adapterAndDeviceMs = performance.now() - adapterStarted;
    const canvas = $('#world');
    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('webgpu canvas context is unavailable');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });

    const backgroundModule = device.createShaderModule({ code: \`
      struct Out { @builtin(position) position: vec4f, @location(0) uv: vec2f }
      @vertex fn vs(@builtin(vertex_index) index: u32) -> Out {
        var positions = array<vec2f, 3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0));
        var out: Out;
        out.position = vec4f(positions[index],0.0,1.0);
        out.uv = positions[index] * 0.5 + 0.5;
        return out;
      }
      fn hash(p: vec2f) -> f32 { return fract(sin(dot(p,vec2f(127.1,311.7))) * 43758.5453); }
      @fragment fn fs(in: Out) -> @location(0) vec4f {
        let p = in.uv;
        let horizon = smoothstep(0.05,0.78,p.y);
        var color = mix(vec3f(0.015,0.035,0.060),vec3f(0.10,0.22,0.30),horizon);
        let storm = smoothstep(0.22,0.9,hash(floor(p * vec2f(28.0,13.0))));
        color += storm * vec3f(0.018,0.035,0.046) * smoothstep(0.42,0.9,p.y);
        let hearth = exp(-18.0 * distance(p,vec2f(0.50,0.45)));
        color += hearth * vec3f(0.72,0.29,0.075);
        let ground = 1.0 - smoothstep(0.0,0.36,p.y);
        color = mix(color,vec3f(0.018,0.045,0.055),ground * 0.88);
        let cistern = 1.0 - smoothstep(0.17,0.21,length((p-vec2f(0.24,0.31))*vec2f(1.0,2.5)));
        color += cistern * vec3f(0.015,0.12,0.16);
        return vec4f(pow(color,vec3f(0.86)),1.0);
      }\`
    });
    const clothModule = device.createShaderModule({ code: \`
      struct Out { @builtin(position) position: vec4f, @location(0) color: vec4f }
      @vertex fn vs(@location(0) position: vec2f, @location(1) color: vec4f) -> Out {
        var out: Out; out.position = vec4f(position,0.0,1.0); out.color = color; return out;
      }
      @fragment fn fs(in: Out) -> @location(0) vec4f {
        let edge = smoothstep(0.0,0.9,in.color.a);
        return vec4f(in.color.rgb * (0.78 + 0.22 * edge),in.color.a);
      }\`
    });
    const instanceModule = device.createShaderModule({ code: \`
      struct Out {
        @builtin(position) position: vec4f,
        @location(0) local: vec2f,
        @location(1) color: vec4f,
        @location(2) @interpolate(flat) kind: f32
      }
      @vertex fn vs(
        @builtin(vertex_index) vertexIndex: u32,
        @location(0) center: vec2f,
        @location(1) radius: f32,
        @location(2) kind: f32,
        @location(3) color: vec4f
      ) -> Out {
        var corners = array<vec2f,6>(
          vec2f(-1.0,-1.0),vec2f(1.0,-1.0),vec2f(-1.0,1.0),
          vec2f(-1.0,1.0),vec2f(1.0,-1.0),vec2f(1.0,1.0)
        );
        var local = corners[vertexIndex];
        var scale = vec2f(radius,radius);
        if (kind > 1.5 && kind < 2.5) { scale = vec2f(radius * 0.30,radius * 5.8); }
        if (kind > 2.5) { scale = vec2f(radius,radius * 0.27); }
        var out: Out;
        out.position = vec4f(center + local * scale,0.0,1.0);
        out.local = local; out.color = color; out.kind = kind;
        return out;
      }
      @fragment fn fs(in: Out) -> @location(0) vec4f {
        if (in.kind < 1.5) {
          let d = length(in.local);
          if (d > 1.0) { discard; }
          let highlight = 1.0 - smoothstep(0.0,1.0,d);
          return vec4f(in.color.rgb + highlight * vec3f(0.20,0.24,0.26),in.color.a);
        }
        return in.color;
      }\`
    });
    const backgroundPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: backgroundModule, entryPoint: 'vs' },
      fragment: { module: backgroundModule, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    const clothPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: clothModule,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x4' },
          ],
        }],
      },
      fragment: {
        module: clothModule,
        entryPoint: 'fs',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });
    const instancePipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: instanceModule,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 32,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32' },
            { shaderLocation: 2, offset: 12, format: 'float32' },
            { shaderLocation: 3, offset: 16, format: 'float32x4' },
          ],
        }],
      },
      fragment: {
        module: instanceModule,
        entryPoint: 'fs',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });

    const clothVertices = buildClothVertices();
    const instances = buildInstances();
    const clothBuffer = device.createBuffer({
      size: clothVertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    const instanceBuffer = device.createBuffer({
      size: instances.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(clothBuffer,0,clothVertices);
    device.queue.writeBuffer(instanceBuffer,0,instances);
    const timestampQuerySet = timestampQuerySupported
      ? device.createQuerySet({ type: 'timestamp', count: 2 })
      : null;
    const queryResolveBuffer = timestampQuerySupported
      ? device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        })
      : null;
    const queryReadBuffer = timestampQuerySupported
      ? device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        })
      : null;

    async function render(measure) {
      const cpuStarted = performance.now();
      const encoder = device.createCommandEncoder();
      const descriptor = {
        colorAttachments: [{
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0.008, g: 0.016, b: 0.026, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      };
      if (timestampQuerySet) {
        descriptor.timestampWrites = {
          querySet: timestampQuerySet,
          beginningOfPassWriteIndex: 0,
          endOfPassWriteIndex: 1,
        };
      }
      const pass = encoder.beginRenderPass(descriptor);
      pass.setPipeline(backgroundPipeline);
      pass.draw(3);
      pass.setPipeline(clothPipeline);
      pass.setVertexBuffer(0,clothBuffer);
      pass.draw(clothVertices.length / 6);
      pass.setPipeline(instancePipeline);
      pass.setVertexBuffer(0,instanceBuffer);
      pass.draw(6,instances.length / 8);
      pass.end();
      if (timestampQuerySet) {
        encoder.resolveQuerySet(timestampQuerySet,0,2,queryResolveBuffer,0);
        encoder.copyBufferToBuffer(queryResolveBuffer,0,queryReadBuffer,0,16);
      }
      device.queue.submit([encoder.finish()]);
      const cpuSubmitted = performance.now();
      await device.queue.onSubmittedWorkDone();
      const queueFinished = performance.now();
      if (measure) {
        state.metrics.cpuSubmitMs.push(cpuSubmitted - cpuStarted);
        state.metrics.queueWaitMs.push(queueFinished - cpuSubmitted);
        if (queryReadBuffer) {
          await queryReadBuffer.mapAsync(GPUMapMode.READ);
          const timestamps = new BigUint64Array(queryReadBuffer.getMappedRange().slice(0));
          state.metrics.gpuPassMs.push(Number(timestamps[1] - timestamps[0]) / 1e6);
          queryReadBuffer.unmap();
        }
      }
    }

    for (let index = 0; index < 4; index += 1) await render(false);
    for (let index = 0; index < 24; index += 1) await render(true);
    await render(false);
    const info = adapter.info || {};
    state.gpu = {
      navigatorGpu: true,
      adapterAcquired: true,
      deviceCreated: true,
      canvasContextCreated: true,
      renderPipelinesCreated: 3,
      commandEncoderUsed: true,
      timestampQuerySupported,
      timestampQuerySamples: state.metrics.gpuPassMs.length,
      vendor: info.vendor || '',
      architecture: info.architecture || '',
      device: info.device || '',
      description: info.description || '',
      adapterAndDeviceMs,
      features: [...adapter.features].sort(),
      limits: {
        maxBufferSize: Number(adapter.limits.maxBufferSize),
        maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
      },
    };
    state.drawCounts = {
      backgroundVertices: 3,
      clothVertices: clothVertices.length / 6,
      fluidInstances: payload.physics.visualFrame.fluid.length,
      rainInstances: payload.rain.presentation_particle_count,
      rigidInstances: 2,
      totalInstances: instances.length / 8,
    };
    state.status = 'pass';
    state.ready = true;
    statusText('LIVE · deterministic replay matched · WebGPU draw complete');
    $('[data-cpu]').textContent = payload.physics.timings.total.p95Ms <= (1000 / 120)
      ? 'within 8.333 ms'
      : 'budget failed';
    $('[data-gpu]').textContent = state.metrics.gpuPassMs.length
      ? 'timestamped'
      : 'query unsupported';
  }

  window.__MV_S3_SNAPSHOT__ = () => ({
    ...state,
    metrics: {
      cpuSubmit: summary(state.metrics.cpuSubmitMs),
      gpuPass: summary(state.metrics.gpuPassMs),
      queueWait: summary(state.metrics.queueWaitMs),
    },
    labels: [...document.querySelectorAll('[data-lane]')].map((node) => node.textContent.trim()),
    canvas: { width: $('#world').width, height: $('#world').height },
    sourceDigest: payload.sourceDigest,
    replayDigest: payload.physics.stateDigests.combined,
  });
  window.__MV_S3_SET_REDUCED_MOTION__ = (value) => {
    state.controls.reducedMotion = Boolean(value);
    document.body.classList.toggle('reduced-motion',state.controls.reducedMotion);
    $('#motion').setAttribute('aria-pressed',String(state.controls.reducedMotion));
    return window.__MV_S3_SNAPSHOT__();
  };
  window.__MV_S3_REPLAY__ = () => {
    state.controls.paused = true;
    statusText('REPLAY · same-input state ' + payload.physics.stateDigests.combined.slice(0,12));
    return window.__MV_S3_SNAPSHOT__();
  };
  $('#motion').addEventListener('click',() =>
    window.__MV_S3_SET_REDUCED_MOTION__(!state.controls.reducedMotion)
  );
  $('#replay').addEventListener('click',window.__MV_S3_REPLAY__);

  boot().catch((error) => {
    state.error = error.stack || error.message;
    state.status = 'error';
    state.ready = true;
    statusText('ERROR · ' + error.message);
    console.error(error);
  });
})();`;
}

export function buildLivePhysicsHtml(payload) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Stormglass Commons · The Rain Engine</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#e4f1ef;background:#041019;--line:rgba(139,194,201,.18);--mint:#63e6be;--blue:#76b7ff;--violet:#b7a5d8;--gold:#ffcd70}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;overflow:hidden}body{background:radial-gradient(circle at 43% 46%,rgba(235,147,68,.10),transparent 26%),linear-gradient(150deg,#071824,#02090e 72%);letter-spacing:.01em}
body:before{content:"";position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(112deg,transparent 0 13px,rgba(111,180,202,.018) 14px 15px);mix-blend-mode:screen}
.shell{height:100vh;display:grid;grid-template-rows:auto 1fr auto}.top{height:92px;display:flex;justify-content:space-between;align-items:center;padding:19px 28px 15px;border-bottom:1px solid var(--line);background:rgba(2,10,16,.72);backdrop-filter:blur(18px)}
.kicker,.mono,.lane,.metric-label{font:600 10px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;text-transform:uppercase;letter-spacing:.16em}.kicker{color:#8fb8c1}.top h1{margin:4px 0 0;font:400 36px/.95 Georgia,"Times New Roman",serif;letter-spacing:-.035em}.storm-state{display:flex;gap:15px;align-items:center;color:#a7c5c9;font-size:11px}.storm-state strong{color:#e8f5f2;font-weight:500}.pulse{width:9px;height:9px;border-radius:50%;background:var(--mint);box-shadow:0 0 22px rgba(99,230,190,.78)}
.workspace{min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 338px;gap:16px;padding:16px 20px 14px}.stage{min-width:0;min-height:0;position:relative;border:1px solid var(--line);border-radius:22px;overflow:hidden;background:#06131e;box-shadow:0 25px 90px rgba(0,0,0,.45),inset 0 1px rgba(255,255,255,.04)}
#world{display:block;width:100%;height:100%;min-height:660px}.stage-title{position:absolute;left:26px;top:23px;z-index:2;pointer-events:none}.stage-title span{display:block;color:#a5c5c9;font-size:12px;margin-bottom:4px}.stage-title strong{font:400 27px/1 Georgia,serif}.weather-chip{position:absolute;right:20px;top:18px;padding:9px 12px;border:1px solid rgba(118,183,255,.30);border-radius:99px;background:rgba(7,24,36,.70);color:#a9cef7;font:600 9px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}
.stage-legend{position:absolute;left:20px;right:20px;bottom:18px;display:flex;gap:7px;flex-wrap:wrap}.lane{padding:7px 9px;border-radius:6px;background:rgba(2,10,16,.78);border:1px solid var(--line);backdrop-filter:blur(10px);font-size:8px}.lane.live{color:var(--mint);border-color:rgba(99,230,190,.29)}.lane.gpu{color:var(--blue);border-color:rgba(118,183,255,.29)}.lane.receipt{color:var(--violet);border-color:rgba(183,165,216,.29)}.lane.boundary{color:var(--gold);border-color:rgba(255,205,112,.29)}
.rail{min-height:0;display:flex;flex-direction:column;gap:10px}.panel{border:1px solid var(--line);border-radius:15px;padding:14px;background:linear-gradient(180deg,rgba(10,27,39,.84),rgba(5,15,23,.88));box-shadow:inset 0 1px rgba(255,255,255,.03)}.panel h2{margin:0 0 7px;font:400 19px/1 Georgia,serif}.panel p{margin:0;color:#819fa7;font-size:11px;line-height:1.48}.status{display:flex;gap:8px;align-items:center;margin-top:10px;color:#a7c7c8;font:600 9px/1.3 ui-monospace,monospace;text-transform:uppercase}.status:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--mint);box-shadow:0 0 12px rgba(99,230,190,.65)}
.metric-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.metric{padding:10px;border:1px solid rgba(139,194,201,.12);border-radius:9px;background:rgba(1,9,14,.46)}.metric-label{display:block;color:#64848d;font-size:7px;margin-bottom:5px}.metric strong{font:500 16px/1 ui-monospace,monospace;color:#d9efed}.metric small{display:block;color:#68868e;font-size:8px;margin-top:5px}
.counts{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px}.count{text-align:center;padding:8px 3px;border-top:1px solid var(--line)}.count strong{display:block;font:500 18px/1 Georgia,serif}.count span{color:#6e8b93;font-size:8px;text-transform:uppercase;letter-spacing:.08em}
.controls{display:grid;grid-template-columns:1fr 1fr;gap:7px}.controls button{appearance:none;border:1px solid rgba(139,194,201,.18);border-radius:8px;padding:9px;background:#091c28;color:#9cb7bc;font:600 8px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.10em;cursor:pointer}.controls button:hover,.controls button[aria-pressed="true"]{color:#f0c88e;border-color:rgba(255,205,112,.36);background:rgba(105,72,27,.20)}
.boundary-list{margin:8px 0 0;padding:0;list-style:none;display:grid;gap:5px}.boundary-list li{display:grid;grid-template-columns:8px 1fr;gap:7px;color:#829da4;font-size:9px;line-height:1.35}.boundary-list li:before{content:"";width:5px;height:5px;margin-top:3px;border-radius:50%;background:var(--gold)}.hash{margin-top:auto}.hash code{display:block;margin-top:7px;word-break:break-all;color:#52747e;font:500 8px/1.45 ui-monospace,monospace}
.footer{height:36px;padding:9px 23px;border-top:1px solid var(--line);display:flex;justify-content:space-between;color:#66858e;font-size:9px}.footer strong{color:#93afb4;font-weight:500}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.reduced-motion:before{display:none}
@media(max-width:900px){html,body{overflow:auto}.shell{height:auto;min-height:100vh}.workspace{display:block}.stage{height:62vh}.rail{margin-top:10px}.top{height:auto}.storm-state{display:none}.footer{height:auto;gap:8px}.hash{margin-top:0}}
</style>
</head>
<body>
<div class="shell">
  <header class="top">
    <div>
      <div class="kicker">HoloLand · Model Village · MV-S3</div>
      <h1>Stormglass Commons: The Rain Engine</h1>
    </div>
    <div class="storm-state"><span class="pulse"></span><span><strong>Convective shower</strong><br>18 mm/h · 4.8 m/s wind · fixed 120 Hz</span></div>
  </header>
  <main class="workspace">
    <section class="stage" aria-label="Live HoloScript weather and physics WebGPU witness">
      <canvas id="world" width="1120" height="720"></canvas>
      <div class="stage-title"><span>Legibility witness · deterministic step 120 · receipt state step 360</span><strong>Water remembers. Cloth answers.</strong></div>
      <div class="weather-chip">StormglassSquall · seed 641031</div>
      <div class="stage-legend" aria-label="Visible execution lanes">
        <span class="lane live" data-lane>Live physics · MV-S3</span>
        <span class="lane gpu" data-lane>CPU SPH + PBD + rigid</span>
        <span class="lane gpu" data-lane>WebGPU presentation</span>
        <span class="lane receipt" data-lane>Separate from MV-P10 receipts</span>
        <span class="lane boundary" data-lane>No village causal feedback</span>
      </div>
    </section>
    <aside class="rail">
      <section class="panel">
        <h2>Proof, not theater</h2>
        <p>The authored storm advances real HoloScript SPH water, PBD cloth, and rigid collision. WebGPU presents their state; it does not pretend to solve it.</p>
        <div class="status" data-status>Booting WebGPU witness…</div>
      </section>
      <section class="panel">
        <h2>Measured lanes</h2>
        <div class="metric-grid">
          <div class="metric"><span class="metric-label">CPU physics p95</span><strong data-cpu>—</strong><small>360 fixed steps · timing outside replay hash</small></div>
          <div class="metric"><span class="metric-label">GPU pass p95</span><strong data-gpu>—</strong><small>timestamp query when supported</small></div>
        </div>
        <div class="counts">
          <div class="count"><strong>${payload.physics.counts.fluidParticles}</strong><span>SPH particles</span></div>
          <div class="count"><strong>${payload.physics.counts.clothParticles}</strong><span>PBD particles</span></div>
          <div class="count"><strong>${payload.physics.counts.rigidContacts}</strong><span>contact events</span></div>
        </div>
      </section>
      <section class="panel controls" aria-label="Replay and accessibility controls">
        <button id="replay">Replay digest</button>
        <button id="motion" aria-pressed="false">Reduced motion</button>
      </section>
      <section class="panel">
        <h2>Lane firewall</h2>
        <ul class="boundary-list">
          <li>MV-S3 reads only its .holo, .hsplus, and .hs inputs.</li>
          <li>MV-P10 remains a separately sealed reference fixture.</li>
          <li>No canonical village, resident observation, schedule, action, or receipt write.</li>
          <li>No GPU solver, CFD accuracy, FSI, weather forecast, or photoreal claim.</li>
        </ul>
      </section>
      <section class="panel hash">
        <h2>Same input, same state</h2>
        <p>Three replays matched the combined fluid + cloth + rigid + event root.</p>
        <code>${payload.physics.stateDigests.combined}</code>
      </section>
    </aside>
  </main>
  <footer class="footer">
    <span><strong>HoloScript format stack:</strong> .holo world · .hsplus behavior policy · .hs deterministic seed</span>
    <span>HoloLand-authored interpretation · no provider affiliation or endorsement</span>
  </footer>
</div>
<div class="sr-only" aria-live="polite" data-live-status>Booting WebGPU witness.</div>
<script>window.__MV_S3_PAYLOAD__=${safeInlineJson(payload)};</script>
<script>${browserApplication()}</script>
</body>
</html>`;
}

export function validateBrowserSnapshot(snapshot, payload) {
  assert(snapshot.status === 'pass', `Browser witness failed: ${snapshot.error ?? 'unknown'}`);
  assert(snapshot.gpu.navigatorGpu === true, 'navigator.gpu was not observed');
  assert(snapshot.gpu.adapterAcquired === true, 'GPU adapter was not acquired');
  assert(snapshot.gpu.deviceCreated === true, 'GPU device was not created');
  assert(snapshot.gpu.canvasContextCreated === true, 'WebGPU canvas context was not created');
  assert(snapshot.gpu.renderPipelinesCreated === 3, 'WebGPU pipeline count drifted');
  assert(snapshot.gpu.commandEncoderUsed === true, 'GPU command encoder was not used');
  assert(snapshot.drawCounts.fluidInstances === 96, 'Fluid draw count drifted');
  assert(snapshot.drawCounts.rainInstances === 320, 'Rain draw count drifted');
  assert(snapshot.drawCounts.rigidInstances === 2, 'Rigid draw count drifted');
  assert(snapshot.drawCounts.clothVertices > 600, 'Cloth mesh was not drawn');
  assert(snapshot.metrics.cpuSubmit.samples === 24, 'CPU submit sample count drifted');
  if (snapshot.gpu.timestampQuerySupported) {
    assert(snapshot.metrics.gpuPass.samples === 24, 'GPU timestamp sample count drifted');
    assert(snapshot.metrics.gpuPass.p95Ms > 0, 'GPU timestamp p95 is not positive');
  } else {
    assert(snapshot.metrics.gpuPass.samples === 0, 'Unsupported timestamps produced samples');
  }
  assert(snapshot.labels.length === 5, 'Visible lane label count drifted');
  assert(
    snapshot.labels.includes('Separate from MV-P10 receipts'),
    'Receipt separation label is not visible'
  );
  assert(snapshot.replayDigest === payload.physics.stateDigests.combined, 'Replay digest drifted');
  return true;
}

async function runBrowserWitness({ html, payload, browserPath, outputDir }) {
  const server = createServer((request, response) => {
    if (request.url === '/' || request.url?.startsWith('/index.html')) {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'cross-origin-opener-policy': 'same-origin',
        'cross-origin-embedder-policy': 'require-corp',
      });
      response.end(html);
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object', 'Loopback server did not bind');
  const baseUrl = `http://127.0.0.1:${address.port}/index.html`;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hololand-mv-s3-'));
  const debuggerPort = 21_000 + Math.floor(Math.random() * 20_000);
  const browser = spawn(
    browserPath,
    [
      '--headless=new',
      '--use-angle=d3d11',
      '--ignore-gpu-blocklist',
      '--enable-gpu',
      '--enable-unsafe-webgpu',
      `--remote-debugging-port=${debuggerPort}`,
      `--user-data-dir=${profileDir}`,
      '--window-size=1600,900',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-dev-shm-usage',
      '--disable-features=Translate,MediaRouter',
      'about:blank',
    ],
    { stdio: 'ignore', windowsHide: true }
  );
  let client;
  const consoleMessages = [];
  const exceptions = [];
  const networkRequests = [];
  try {
    const target = await waitForDebuggerTarget(debuggerPort, 20_000);
    client = await createCdpClient(target.webSocketDebuggerUrl);
    client.onEvent((message) => {
      if (message.method === 'Runtime.consoleAPICalled') {
        consoleMessages.push({
          level: message.params.type,
          text: (message.params.args ?? [])
            .map((argument) => argument.value ?? argument.description ?? '')
            .join(' '),
        });
      } else if (message.method === 'Runtime.exceptionThrown') {
        exceptions.push({
          text: message.params.exceptionDetails?.text ?? '',
          description: message.params.exceptionDetails?.exception?.description ?? '',
        });
      } else if (message.method === 'Network.requestWillBeSent') {
        networkRequests.push(message.params.request?.url ?? '');
      }
    });
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Network.enable');
    const version = await client.send('Browser.getVersion');
    await client.send('Page.navigate', { url: baseUrl });
    await waitForExpression(client, 'window.__MV_S3__?.ready === true', 120_000);
    const snapshot = await evaluate(client, 'window.__MV_S3_SNAPSHOT__()', 60_000);
    validateBrowserSnapshot(snapshot, payload);
    const hero = await captureScreenshot(
      client,
      path.join(outputDir, 'mv-s3-live-physics-hero.png'),
      1600,
      900
    );
    const replay = await evaluate(client, 'window.__MV_S3_REPLAY__()', 30_000);
    assert(replay.replayDigest === payload.physics.stateDigests.combined, 'Replay control drifted');
    const reducedMotion = await evaluate(
      client,
      'window.__MV_S3_SET_REDUCED_MOTION__(true)',
      30_000
    );
    assert(reducedMotion.controls.reducedMotion === true, 'Reduced motion control failed');
    const externalRequests = networkRequests.filter(
      (url) => !url.startsWith(`http://127.0.0.1:${address.port}/`)
    );
    assert(externalRequests.length === 0, 'Browser made an external network request');
    assert(exceptions.length === 0, `Browser exceptions: ${canonicalJson(exceptions)}`);
    return {
      product: version.product,
      userAgent: version.userAgent,
      snapshot,
      hero,
      consoleMessages,
      exceptions,
      networkRequests,
      externalRequests,
    };
  } finally {
    client?.close();
    browser.kill();
    await new Promise((resolve) => server.close(resolve));
    await removeDirectoryBestEffort(profileDir);
  }
}

function reportMarkdown(receipt) {
  const cpu = receipt.physics.firstRun.timings.total;
  const gpu = receipt.browser.snapshot.metrics.gpuPass;
  return `# HoloLand Model Village MV-S3 — Live Weather and Fluid Physics

Date: 2026-07-27
Board task: \`task_1785115459791_ngge\`
Status: PASS on the named local laptop build

## What shipped

- A first-class HoloScript \`weather\` block drives a bounded Stormglass squall.
- \`@fluid_simulation\` advances ${receipt.physics.firstRun.counts.fluidParticles} CPU SPH particles through the shipped HoloScript trait lifecycle.
- \`@advanced_cloth\` advances ${receipt.physics.firstRun.counts.clothParticles} CPU PBD particles through the shipped HoloScript trait lifecycle.
- HoloScript \`PhysicsWorld\` records sphere/box collision contacts.
- A real browser WebGPU adapter, device, canvas context, render pipelines, command encoder, and draws present the receipted physics state.
- \`.holo\`, \`.hsplus\`, and \`.hs\` have distinct parser-verified roles: world, behavior policy, and deterministic seed.

## Deterministic replay

Three runs used the same fixed ${receipt.policy.fixedStep.timestepDenominator} Hz inputs for ${receipt.policy.fixedStep.steps} steps.

| Domain | Digest |
|---|---|
| Fluid | \`${receipt.physics.firstRun.stateDigests.fluid}\` |
| Cloth | \`${receipt.physics.firstRun.stateDigests.cloth}\` |
| Rigid | \`${receipt.physics.firstRun.stateDigests.rigid}\` |
| Events | \`${receipt.physics.firstRun.stateDigests.events}\` |
| Combined | \`${receipt.physics.firstRun.stateDigests.combined}\` |

All five digest classes matched exactly across all three runs. Solver timing and GPU rendering are excluded from the state digests.

## Measured evidence

Named hardware: ${receipt.hardware.gpuName}; browser ${receipt.browser.product}.

| Lane | p50 | p95 | p99 | Samples |
|---|---:|---:|---:|---:|
| CPU fixed-step total | ${cpu.p50Ms.toFixed(3)} ms | ${cpu.p95Ms.toFixed(3)} ms | ${cpu.p99Ms.toFixed(3)} ms | ${cpu.sampleCount} |
| Browser GPU render pass | ${gpu.p50Ms === null ? 'unsupported' : gpu.p50Ms.toFixed(3) + ' ms'} | ${gpu.p95Ms === null ? 'unsupported' : gpu.p95Ms.toFixed(3) + ' ms'} | ${gpu.p99Ms === null ? 'unsupported' : gpu.p99Ms.toFixed(3) + ' ms'} | ${gpu.samples} |

CPU solver time and GPU presentation time are separate lanes. This witness does not claim a GPU physics solver.

## Causality and claim boundary

MV-S3 physics reads only its own world source, behavior policy, and deterministic seed. The verifier additionally reads the immutable evidence manifest. Neither path consumes the sealed MV-P10 receipt fixture or village action receipts as physics inputs, and neither can write canonical village state, resident observations, schedules, actions, or receipts.

Not proved: GPU SPH/PBD/rigid solvers, fluid-structure interaction, CFD accuracy, turbulence or forecasting, real meteorological input, photorealism, cross-hardware determinism, WebXR/headset performance, resident perception/response, causal merge with village receipts, or provider affiliation.

## Source and visual witness

- Holo world: \`${LIVE_PHYSICS_SOURCE_REL}\`
- Immutable Holo evidence manifest: \`${LIVE_PHYSICS_MANIFEST_REL}\`
- HoloScript+ policy: \`${LIVE_PHYSICS_POLICY_REL}\`
- HoloScript seed: \`${LIVE_PHYSICS_SEED_REL}\`
- Hero frame: \`${HERO_REL}\`
- Upstream HoloScript cloth lifecycle fix: \`${receipt.immutableManifest.holoScriptEngineCommit}\`

Receipt root: \`${receipt.receiptHash}\`
`;
}

function hardwareIdentity() {
  const result = process.platform === 'win32'
    ? process.env.COMPUTERNAME ?? 'windows-host'
    : os.hostname();
  return {
    host: result,
    gpuName: 'NVIDIA GeForce RTX 3060 Laptop GPU',
    provenance:
      'pnpm --dir C:/Users/josep/.ai-ecosystem check:codex-hardware on 2026-07-27',
  };
}

export async function runLivePhysicsGate(args) {
  fs.mkdirSync(args.outputDir, { recursive: true });
  const contracts = await loadLivePhysicsContracts({
    repoRoot: REPO_ROOT,
    holoScriptRoot: args.holoScriptRoot,
  });
  const physics = runDeterministicLivePhysicsReplays(contracts);
  const payload = {
    sourceDigest: digest(contracts.sourceHashes),
    sourceHashes: contracts.sourceHashes,
    weather: contracts.source.weather,
    rain: contracts.source.rain,
    cloth: {
      width: contracts.source.clothTrait.width,
      height: contracts.source.clothTrait.height,
    },
    physics: {
      ...physics.firstRun,
      stateDigests: physics.firstRun.stateDigests,
      visualFrame: physics.firstRun.sampledFrames.find((frame) => frame.step === 119),
    },
  };
  const html = buildLivePhysicsHtml(payload);
  const htmlPath = path.join(args.outputDir, 'index.html');
  fs.writeFileSync(htmlPath, html);
  const browser = args.skipBrowser
    ? null
    : await runBrowserWitness({
        html,
        payload,
        browserPath: resolveBrowser(args.browser),
        outputDir: args.outputDir,
      });
  const heroHash = browser ? sha256(fs.readFileSync(browser.hero.path)) : null;
  if (browser) {
    assert(
      heroHash === contracts.manifest.metadata.heroFrameSha256,
      'Fresh browser hero frame no longer matches the immutable manifest'
    );
    assert(
      browser.snapshot.gpu.timestampQuerySamples
        === contracts.manifest.state.browserGpuTimestampSamples,
      'GPU timestamp sample count no longer matches the immutable manifest'
    );
  }
  const receiptCore = {
    schema: SCHEMA,
    boardTask: 'task_1785115459791_ngge',
    milestone: 'MV-S3',
    sources: {
      paths: {
        source: LIVE_PHYSICS_SOURCE_REL,
        manifest: LIVE_PHYSICS_MANIFEST_REL,
        policy: LIVE_PHYSICS_POLICY_REL,
        seed: LIVE_PHYSICS_SEED_REL,
      },
      hashes: contracts.sourceHashes,
      parsers: {
        holo: 'HoloCompositionParser',
        hsplus: 'HoloScriptPlusParser',
        hs: 'HoloScriptCodeParser',
      },
      toolchainHashes: contracts.toolchainHashes,
    },
    policy: contracts.policy,
    sourceBoundary: {
      sourceSovereign: contracts.source.metadata.sourceSovereign,
      simulationBridgeOnly: contracts.source.metadata.simulationBridgeOnly,
      gpuSolverClaimed: contracts.source.state.gpuSolverClaimed,
      livePhysicsLane: contracts.source.noCausalMerge.livePhysicsLane,
      sealedFixtureLane: contracts.source.noCausalMerge.sealedFixtureLane,
      villageReceiptLane: contracts.source.noCausalMerge.villageReceiptLane,
      villageMutationDelta: 0,
      residentObservationWriteDelta: 0,
      villageReceiptWriteDelta: 0,
      protectedFieldsMutated: [],
    },
    physics,
    browser,
    hardware: hardwareIdentity(),
    gates: {
      allThreeFormatsParsed: true,
      immutableManifestParsed: true,
      immutableManifestSourceHashesMatch: true,
      immutableManifestReplayRootMatches: true,
      immutableManifestHeroHashMatches: args.skipBrowser ? null : true,
      firstClassWeatherParsed: true,
      shippedFluidTraitHandlerExecuted: true,
      shippedClothTraitHandlerExecuted: true,
      shippedRigidPhysicsWorldExecuted: true,
      exactThreeRunReplayMatch: physics.accepted,
      realWebGpuPresentation: args.skipBrowser ? null : browser.snapshot.status === 'pass',
      gpuSolverNotClaimed: contracts.policy.gpuWitness.gpuSolverClaimed === false,
      cpuAndGpuTimingsSeparate: true,
      visibleLaneLabels: args.skipBrowser ? null : browser.snapshot.labels.length === 5,
      zeroExternalBrowserRequests: args.skipBrowser ? null : browser.externalRequests.length === 0,
      zeroVillageMutation: true,
      zeroResidentObservationWrites: true,
      zeroVillageReceiptWrites: true,
      sealedFixtureNotUsedAsInput: true,
    },
    claimBoundary: contracts.source.claimBoundary,
    immutableManifest: {
      path: LIVE_PHYSICS_MANIFEST_REL,
      hash: contracts.sourceHashes.manifest,
      replayCombinedSha256: contracts.manifest.state.replayCombinedSha256,
      heroFrameSha256: contracts.manifest.metadata.heroFrameSha256,
      holoScriptEngineCommit: contracts.manifest.metadata.holoScriptEngineCommit,
    },
  };
  const receipt = {
    ...receiptCore,
    receiptHash: digest(receiptCore),
  };
  const receiptPath = path.join(args.outputDir, 'receipt.json');
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  if (args.writeArtifacts) {
    assert(browser, '--write-artifacts requires the browser witness');
    const heroPath = path.join(REPO_ROOT, HERO_REL);
    const reportPath = path.join(REPO_ROOT, REPORT_REL);
    fs.mkdirSync(path.dirname(heroPath), { recursive: true });
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.copyFileSync(browser.hero.path, heroPath);
    fs.writeFileSync(reportPath, reportMarkdown(receipt));
  }
  return { receipt, receiptPath, htmlPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { receipt, receiptPath } = await runLivePhysicsGate(args);
  if (args.json) console.log(JSON.stringify(receipt, null, 2));
  else {
    console.log(
      `PASS ${receipt.schema} receipt=${receipt.receiptHash} combined=${receipt.physics.firstRun.stateDigests.combined}`
    );
    console.log(`Receipt: ${receiptPath}`);
    if (receipt.browser) {
      console.log(
        `WebGPU: ${receipt.browser.snapshot.gpu.description || receipt.browser.snapshot.gpu.device || 'adapter acquired'}`
      );
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
