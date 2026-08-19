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
  BLINDED_PROFILE,
  DISCLOSURE,
  FOLD_POLICY_REL,
  FOLD_SEED_REL,
  FOLD_SOURCE_REL,
  STORY_PROFILE,
  canonicalJson,
  digest,
  loadFoldContracts,
  runDeterministicMotionReplays,
  sha256,
  validateFoldManifest,
  verifyObserverIsolation,
} from './lib/model-village-four-village-fold.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const HERO_REL =
  'docs/assets/model-village/model-village-resident-motion-four-village-fold-hero-2026-07-27.png';
const REPORT_REL =
  'docs/reports/HOLOLAND_MODEL_VILLAGE_MV_S4_RESIDENT_MOTION_FOUR_VILLAGE_FOLD_2026-07-27.md';
const OUTPUT_REL = '.tmp/hololand/model-village/resident-motion-four-village-fold';
const SCHEMA = 'hololand.model-village.resident-motion-four-village-fold-receipt.v1';

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
      console.log(`Usage: node scripts/check-hololand-model-village-resident-motion-four-village-fold.mjs [options]

Options:
  --holoscript-root <path>  Built HoloScript checkout
  --browser <path>          Chrome or Edge executable
  --output-dir <path>       Runtime HTML, screenshots, and receipt directory
  --skip-browser            Run parsers, projections, and deterministic motion only
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

function browserApplication() {
  return `
(() => {
  const payload = window.__MV_S4_PAYLOAD__;
  const state = {
    ready: false,
    status: 'booting',
    error: null,
    gpu: null,
    drawCounts: null,
    focusedFoldId: 'overview',
    routeMarks: [],
    reducedMotion: false,
    protectedDigest: payload.observerIsolation.protectedDigest,
    metrics: { cpuSubmitMs: [], gpuPassMs: [], queueWaitMs: [] },
  };
  window.__MV_S4__ = state;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
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

  function hexToRgba(hex) {
    const value = Number.parseInt(hex.slice(1), 16);
    return [
      ((value >> 16) & 255) / 255,
      ((value >> 8) & 255) / 255,
      (value & 255) / 255,
      1,
    ];
  }

  function buildResidentInstances() {
    const values = [];
    const visualActors = payload.motion.visualFrame.actors;
    for (let index = 0; index < visualActors.length; index += 1) {
      const actor = visualActors[index];
      const publicActor = payload.story.actors[index];
      const x = actor.position[0] / 14;
      const y = -actor.position[2] / 10;
      const color = hexToRgba(publicActor.accentColor);
      values.push(x, y, 0.040, index, ...color);
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

    const fullscreenVertex = \`
      struct Out { @builtin(position) position: vec4f, @location(0) uv: vec2f }
      @vertex fn vs(@builtin(vertex_index) index: u32) -> Out {
        var positions = array<vec2f, 3>(
          vec2f(-1.0,-1.0), vec2f(3.0,-1.0), vec2f(-1.0,3.0)
        );
        var out: Out;
        out.position = vec4f(positions[index],0.0,1.0);
        out.uv = positions[index] * 0.5 + 0.5;
        return out;
      }\`;

    const terrainModule = device.createShaderModule({ code: fullscreenVertex + \`
      fn hash(p: vec2f) -> f32 {
        return fract(sin(dot(p,vec2f(127.1,311.7))) * 43758.5453);
      }
      fn island(p: vec2f, c: vec2f, r: vec2f) -> f32 {
        return length((p-c)/r);
      }
      fn segmentDistance(p: vec2f, a: vec2f, b: vec2f) -> f32 {
        let pa = p-a; let ba = b-a;
        let h = clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);
        return length(pa-ba*h);
      }
      @fragment fn fs(in: Out) -> @location(0) vec4f {
        let p = in.uv;
        let horizon = smoothstep(0.0,0.92,p.y);
        var color = mix(vec3f(0.010,0.024,0.049),vec3f(0.055,0.10,0.18),horizon);
        let cell = floor(p * vec2f(64.0,38.0));
        let star = step(0.986,hash(cell)) * smoothstep(0.42,1.0,p.y);
        color += star * vec3f(0.28,0.46,0.62);
        let mist = 0.5 + 0.5*sin(p.x*29.0 + sin(p.y*17.0)*2.0);
        color += vec3f(0.025,0.055,0.073) * mist * smoothstep(0.30,0.82,p.y) * 0.38;

        let center = vec2f(0.5,0.5);
        let c1 = vec2f(0.193,0.22); let c2 = vec2f(0.807,0.22);
        let c3 = vec2f(0.193,0.82); let c4 = vec2f(0.807,0.82);
        let path = min(min(segmentDistance(p,center,c1),segmentDistance(p,center,c2)),
                       min(segmentDistance(p,center,c3),segmentDistance(p,center,c4)));
        let pathGlow = 1.0-smoothstep(0.003,0.026,path);
        color += pathGlow * vec3f(0.12,0.46,0.58) * 0.58;

        let d1 = island(p,c1,vec2f(0.205,0.112));
        let d2 = island(p,c2,vec2f(0.205,0.112));
        let d3 = island(p,c3,vec2f(0.205,0.112));
        let d4 = island(p,c4,vec2f(0.205,0.112));
        let shadow = max(max(1.0-smoothstep(1.0,1.20,d1),1.0-smoothstep(1.0,1.20,d2)),
                         max(1.0-smoothstep(1.0,1.20,d3),1.0-smoothstep(1.0,1.20,d4)));
        color = mix(color,vec3f(0.006,0.012,0.020),shadow*0.68);
        let m1 = 1.0-smoothstep(0.88,1.0,d1);
        let m2 = 1.0-smoothstep(0.88,1.0,d2);
        let m3 = 1.0-smoothstep(0.88,1.0,d3);
        let m4 = 1.0-smoothstep(0.88,1.0,d4);
        let stone = vec3f(0.052,0.095,0.118) + hash(floor(p*vec2f(180.0,100.0)))*0.025;
        color = mix(color,stone + vec3f(0.105,0.055,0.18)*m1,m1);
        color = mix(color,stone + vec3f(0.07,0.16,0.05)*m2,m2);
        color = mix(color,stone + vec3f(0.02,0.17,0.17)*m3,m3);
        color = mix(color,stone + vec3f(0.18,0.075,0.025)*m4,m4);
        let rim = max(max(1.0-smoothstep(0.0,0.025,abs(d1-0.94)),
                          1.0-smoothstep(0.0,0.025,abs(d2-0.94))),
                      max(1.0-smoothstep(0.0,0.025,abs(d3-0.94)),
                          1.0-smoothstep(0.0,0.025,abs(d4-0.94))));
        color += rim * vec3f(0.11,0.37,0.43);
        let vignette = smoothstep(0.92,0.30,length((p-0.5)*vec2f(0.86,1.0)));
        color *= 0.66 + vignette*0.48;
        return vec4f(pow(color,vec3f(0.84)),1.0);
      }\`
    });

    const architectureModule = device.createShaderModule({ code: fullscreenVertex + \`
      fn box(p: vec2f, c: vec2f, s: vec2f) -> f32 {
        let q = abs(p-c)-s;
        return length(max(q,vec2f(0.0)))+min(max(q.x,q.y),0.0);
      }
      fn ring(p: vec2f, c: vec2f, radius: f32, width: f32) -> f32 {
        return abs(length(p-c)-radius)-width;
      }
      fn cluster(p: vec2f, c: vec2f) -> f32 {
        var d = box(p,c+vec2f(-0.060,-0.015),vec2f(0.024,0.034));
        d = min(d,box(p,c+vec2f(0.000,0.020),vec2f(0.030,0.047)));
        d = min(d,box(p,c+vec2f(0.064,-0.008),vec2f(0.021,0.031)));
        d = min(d,box(p,c+vec2f(-0.012,-0.050),vec2f(0.018,0.023)));
        return d;
      }
      @fragment fn fs(in: Out) -> @location(0) vec4f {
        let p = in.uv;
        let c1 = vec2f(0.193,0.22); let c2 = vec2f(0.807,0.22);
        let c3 = vec2f(0.193,0.82); let c4 = vec2f(0.807,0.82);
        let d1 = cluster(p,c1); let d2 = cluster(p,c2);
        let d3 = cluster(p,c3); let d4 = cluster(p,c4);
        let structures = min(min(d1,d2),min(d3,d4));
        if (structures > 0.012) { discard; }
        let inside = 1.0-smoothstep(0.0,0.012,structures);
        let edge = 1.0-smoothstep(0.002,0.012,abs(structures));
        var accent = vec3f(0.58,0.43,0.84);
        if (d2 == structures) { accent = vec3f(0.43,0.72,0.36); }
        if (d3 == structures) { accent = vec3f(0.32,0.67,0.70); }
        if (d4 == structures) { accent = vec3f(0.93,0.47,0.22); }
        let roof = vec3f(0.055,0.075,0.090) + accent*0.36;
        return vec4f(roof + edge*accent*0.40,inside*0.96);
      }\`
    });

    const genesisModule = device.createShaderModule({ code: fullscreenVertex + \`
      fn segmentDistance(p: vec2f, a: vec2f, b: vec2f) -> f32 {
        let pa=p-a; let ba=b-a;
        let h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);
        return length(pa-ba*h);
      }
      @fragment fn fs(in: Out) -> @location(0) vec4f {
        let p = in.uv;
        let center = vec2f(0.5,0.5);
        let radius = length((p-center)*vec2f(1.0,1.45));
        let ringA = exp(-4800.0*pow(radius-0.066,2.0));
        let ringB = exp(-3600.0*pow(radius-0.105,2.0));
        let core = exp(-210.0*radius*radius);
        let loom = 1.0-smoothstep(0.002,0.010,segmentDistance(p,center+vec2f(0.0,-0.105),center+vec2f(0.0,0.105)));
        let spoke = max(
          1.0-smoothstep(0.002,0.009,segmentDistance(p,center,center+vec2f(0.115,0.0))),
          1.0-smoothstep(0.002,0.009,segmentDistance(p,center,center+vec2f(-0.115,0.0)))
        );
        let glow = core*0.58 + ringA + ringB*0.68 + loom + spoke*0.56;
        let color = mix(vec3f(0.19,0.65,0.75),vec3f(1.0,0.56,0.19),clamp(core+loom,0.0,1.0));
        if (glow < 0.012) { discard; }
        return vec4f(color*glow,clamp(glow,0.0,0.94));
      }\`
    });

    const residentModule = device.createShaderModule({ code: \`
      struct Out {
        @builtin(position) position: vec4f,
        @location(0) local: vec2f,
        @location(1) color: vec4f,
        @location(2) @interpolate(flat) actorIndex: f32
      }
      @vertex fn vs(
        @builtin(vertex_index) vertexIndex: u32,
        @location(0) center: vec2f,
        @location(1) scale: f32,
        @location(2) actorIndex: f32,
        @location(3) color: vec4f
      ) -> Out {
        var corners = array<vec2f,6>(
          vec2f(-1.0,-1.0),vec2f(1.0,-1.0),vec2f(-1.0,1.0),
          vec2f(-1.0,1.0),vec2f(1.0,-1.0),vec2f(1.0,1.0)
        );
        let local = corners[vertexIndex];
        var out: Out;
        out.position = vec4f(center + local*vec2f(scale,scale*1.80),0.0,1.0);
        out.local = local; out.color = color; out.actorIndex = actorIndex;
        return out;
      }
      @fragment fn fs(in: Out) -> @location(0) vec4f {
        let body = length(vec2f(in.local.x, max(abs(in.local.y)-0.42,0.0)));
        if (body > 0.78) { discard; }
        let mantle = smoothstep(0.16,0.21,abs(in.local.y+0.05));
        let edge = 1.0-smoothstep(0.50,0.78,body);
        let glyph = 1.0-smoothstep(0.035,0.085,abs(in.local.x+sin(in.local.y*13.0+in.actorIndex)*0.08));
        var color = mix(vec3f(0.075,0.105,0.12),in.color.rgb*0.72,mantle);
        color += glyph*in.color.rgb*0.45 + edge*vec3f(0.16,0.19,0.20);
        return vec4f(color,0.99);
      }\`
    });

    const blend = {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    };
    const additive = {
      color: { srcFactor: 'src-alpha', dstFactor: 'one' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    };
    const terrainPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: terrainModule, entryPoint: 'vs' },
      fragment: { module: terrainModule, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    const architecturePipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: architectureModule, entryPoint: 'vs' },
      fragment: { module: architectureModule, entryPoint: 'fs', targets: [{ format, blend }] },
      primitive: { topology: 'triangle-list' },
    });
    const genesisPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: genesisModule, entryPoint: 'vs' },
      fragment: { module: genesisModule, entryPoint: 'fs', targets: [{ format, blend: additive }] },
      primitive: { topology: 'triangle-list' },
    });
    const residentPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: residentModule,
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
      fragment: { module: residentModule, entryPoint: 'fs', targets: [{ format, blend }] },
      primitive: { topology: 'triangle-list' },
    });

    const residentInstances = buildResidentInstances();
    const residentBuffer = device.createBuffer({
      size: residentInstances.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(residentBuffer,0,residentInstances);

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
          clearValue: { r: 0.006, g: 0.012, b: 0.024, a: 1 },
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
      pass.setPipeline(terrainPipeline); pass.draw(3);
      pass.setPipeline(architecturePipeline); pass.draw(3);
      pass.setPipeline(genesisPipeline); pass.draw(3);
      pass.setPipeline(residentPipeline);
      pass.setVertexBuffer(0,residentBuffer);
      pass.draw(6,payload.story.actors.length);
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
        state.metrics.cpuSubmitMs.push(cpuSubmitted-cpuStarted);
        state.metrics.queueWaitMs.push(queueFinished-cpuSubmitted);
        if (queryReadBuffer) {
          await queryReadBuffer.mapAsync(GPUMapMode.READ);
          const timestamps = new BigUint64Array(queryReadBuffer.getMappedRange().slice(0));
          state.metrics.gpuPassMs.push(Number(timestamps[1]-timestamps[0])/1e6);
          queryReadBuffer.unmap();
        }
      }
    }

    for (let index=0; index<4; index+=1) await render(false);
    for (let index=0; index<24; index+=1) await render(true);
    await render(false);
    const info = adapter.info || {};
    state.gpu = {
      navigatorGpu: true,
      adapterAcquired: true,
      deviceCreated: true,
      canvasContextCreated: true,
      renderPipelinesCreated: 4,
      commandEncoderUsed: true,
      timestampQuerySupported,
      timestampQuerySamples: state.metrics.gpuPassMs.length,
      vendor: info.vendor || '',
      architecture: info.architecture || '',
      device: info.device || '',
      description: info.description || '',
      adapterAndDeviceMs,
      features: [...adapter.features].sort(),
    };
    state.drawCounts = {
      terrainDraws: 1,
      architectureDraws: 1,
      genesisDraws: 1,
      residentDraws: payload.story.actors.length,
      residentInstances: payload.story.actors.length,
    };
    state.status = 'pass';
    state.ready = true;
    statusText('SEALED · exact motion replay · WebGPU Fold drawn');
  }

  function setFocus(foldId) {
    const allowed = ['overview','fold-01','fold-02','fold-03','fold-04'];
    if (!allowed.includes(foldId)) return window.__MV_S4_SNAPSHOT__();
    state.focusedFoldId = foldId;
    if (foldId !== 'overview' && !state.routeMarks.includes(foldId)) {
      state.routeMarks.push(foldId);
    }
    document.body.dataset.focus = foldId;
    $$('[data-fold-button]').forEach((button) =>
      button.setAttribute('aria-pressed',String(button.dataset.foldButton === foldId))
    );
    $('[data-focus-label]').textContent =
      foldId === 'overview' ? 'Overview' : foldId.toUpperCase().replace('-',' ');
    statusText(
      foldId === 'overview'
        ? 'SEALED · overview · navigation is presentation only'
        : 'ROUTE MARK · ' + foldId.toUpperCase() + ' · no causal write'
    );
    return window.__MV_S4_SNAPSHOT__();
  }

  window.__MV_S4_SNAPSHOT__ = () => ({
    ...state,
    metrics: {
      cpuSubmit: summary(state.metrics.cpuSubmitMs),
      gpuPass: summary(state.metrics.gpuPassMs),
      queueWait: summary(state.metrics.queueWaitMs),
    },
    labels: $$('[data-lane]').map((node) => node.textContent.trim()),
    familyNames: $$('[data-family-name]').map((node) => node.textContent.trim()),
    canvas: { width: $('#world').width, height: $('#world').height },
    sourceDigest: payload.sourceDigest,
    replayDigest: payload.motion.stateDigests.combined,
  });
  window.__MV_S4_SELECT_FOLD__ = setFocus;
  window.__MV_S4_SET_REDUCED_MOTION__ = (value) => {
    state.reducedMotion = Boolean(value);
    document.body.classList.toggle('reduced-motion',state.reducedMotion);
    $('#motion').setAttribute('aria-pressed',String(state.reducedMotion));
    return window.__MV_S4_SNAPSHOT__();
  };
  $$('[data-fold-button]').forEach((button) =>
    button.addEventListener('click',() => setFocus(button.dataset.foldButton))
  );
  $('#overview').addEventListener('click',() => setFocus('overview'));
  $('#motion').addEventListener('click',() =>
    window.__MV_S4_SET_REDUCED_MOTION__(!state.reducedMotion)
  );
  window.addEventListener('keydown',(event) => {
    const map = {
      Digit1:'fold-01', Digit2:'fold-02', Digit3:'fold-03', Digit4:'fold-04',
      Home:'overview'
    };
    if (map[event.code]) setFocus(map[event.code]);
    if (event.code === 'KeyM') window.__MV_S4_SET_REDUCED_MOTION__(!state.reducedMotion);
  });

  boot().catch((error) => {
    state.error = error.stack || error.message;
    state.status = 'error';
    state.ready = true;
    statusText('ERROR · ' + error.message);
    console.error(error);
  });
})();`;
}

function actorLabelStyle(actor) {
  const x = 50 + (actor.position[0] / 28) * 100;
  const y = 50 + (actor.position[2] / 20) * 100;
  return `left:${x.toFixed(3)}%;top:${y.toFixed(3)}%`;
}

export function buildFoldHtml(payload) {
  const labels = payload.motion.visualFrame.actors.map((actor, index) => {
    const publicActor = payload.story.actors[index];
    const title = publicActor.title ? ` · ${publicActor.title}` : '';
    return `<div class="actor-label actor-${index}" style="${actorLabelStyle(actor)}">
      <i style="--accent:${publicActor.accentColor}"></i>
      <span data-family-name>${publicActor.displayName}${title}</span>
    </div>`;
  }).join('');
  const cast = payload.story.actors.map((actor) => `
    <div class="cast-member">
      <i style="--accent:${actor.accentColor}"></i>
      <div><strong>${actor.displayName}${actor.title ? ` · ${actor.title}` : ''}</strong>
      <span>public story mantle</span></div>
    </div>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Stormglass Commons · The Four-Village Fold</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#eaf4f3;background:#030814;--line:rgba(135,190,204,.18);--cyan:#69d7da;--gold:#f2a65a;--violet:#b79af2;--green:#9ed47b}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{background:radial-gradient(circle at 45% 48%,rgba(73,130,151,.14),transparent 30%),linear-gradient(155deg,#071326,#02050c 76%);letter-spacing:.01em}
body:after{content:"";position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(118deg,transparent 0 17px,rgba(115,188,206,.018) 18px 19px);mix-blend-mode:screen}
.shell{height:100vh;display:grid;grid-template-rows:86px 1fr 38px}.top{display:flex;align-items:center;justify-content:space-between;padding:15px 24px 13px 28px;border-bottom:1px solid var(--line);background:rgba(2,7,15,.72);backdrop-filter:blur(18px)}
.kicker,.mono,.lane,.fold-label,.cast-member span,.eyebrow{font:600 9px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;text-transform:uppercase;letter-spacing:.15em}.kicker{color:#86aeb9}.top h1{margin:4px 0 0;font:400 35px/.96 Georgia,"Times New Roman",serif;letter-spacing:-.035em}.genesis-state{display:flex;align-items:center;gap:11px;color:#8eacb3;font-size:10px;text-align:right}.genesis-state strong{display:block;color:#f1c083;font:500 12px/1.3 ui-monospace,monospace}.seal{width:32px;height:32px;border:1px solid rgba(242,166,90,.55);border-radius:50%;position:relative;box-shadow:0 0 24px rgba(242,166,90,.18)}.seal:after,.seal:before{content:"";position:absolute;inset:7px;border:1px solid rgba(105,215,218,.55);transform:rotate(45deg)}.seal:before{inset:12px;border-color:#f2a65a}
.workspace{min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:14px;padding:14px 18px}.stage{min-height:0;position:relative;border:1px solid var(--line);border-radius:20px;overflow:hidden;background:#061120;box-shadow:0 30px 100px rgba(0,0,0,.5),inset 0 1px rgba(255,255,255,.04)}
#world{display:block;width:100%;height:100%;min-height:690px}.stage-title{position:absolute;left:22px;top:20px;z-index:3;pointer-events:none}.stage-title span{display:block;color:#8caeb6;font-size:10px;margin-bottom:5px}.stage-title strong{font:400 24px/1 Georgia,serif}
.profile-chip{position:absolute;right:18px;top:17px;z-index:3;padding:8px 11px;border:1px solid rgba(105,215,218,.30);border-radius:99px;background:rgba(5,18,30,.78);color:#95dfe0;font:600 8px/1 ui-monospace,monospace;letter-spacing:.13em;text-transform:uppercase;backdrop-filter:blur(10px)}
.fold-label{position:absolute;z-index:2;color:#a8c2c8;text-shadow:0 2px 8px #000;pointer-events:none}.fold-label b{display:block;margin-top:4px;font:400 15px/1 Georgia,serif;color:#e8f2f0;letter-spacing:.01em;text-transform:none}.f1{left:8%;top:21%;color:var(--cyan)}.f2{right:8%;top:21%;color:var(--gold);text-align:right}.f3{left:8%;bottom:17%;color:var(--violet)}.f4{right:8%;bottom:17%;color:var(--green);text-align:right}
.actor-label{position:absolute;z-index:4;display:flex;align-items:center;gap:6px;transform:translate(-50%,32px);padding:4px 7px 4px 5px;border:1px solid rgba(154,204,211,.16);border-radius:99px;background:rgba(2,9,16,.72);backdrop-filter:blur(8px);white-space:nowrap;color:#dceceb;font:600 8px/1 ui-monospace,monospace;letter-spacing:.06em}.actor-label.actor-4{transform:translate(-105%,54px)}.actor-label.actor-5{transform:translate(-105%,54px)}.actor-label i,.cast-member i{width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 10px var(--accent)}
.stage-legend{position:absolute;left:17px;right:17px;bottom:14px;z-index:3;display:flex;gap:6px;flex-wrap:wrap}.lane{padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:rgba(2,8,14,.80);backdrop-filter:blur(9px);font-size:7px}.lane.authored{color:var(--cyan);border-color:rgba(105,215,218,.28)}.lane.identity{color:var(--violet);border-color:rgba(183,154,242,.28)}.lane.gpu{color:#81b8ef;border-color:rgba(129,184,239,.28)}.lane.boundary{color:#f0c17a;border-color:rgba(240,193,122,.28)}
.rail{min-height:0;display:flex;flex-direction:column;gap:9px}.panel{border:1px solid var(--line);border-radius:14px;padding:13px;background:linear-gradient(180deg,rgba(11,26,42,.88),rgba(4,12,22,.90));box-shadow:inset 0 1px rgba(255,255,255,.035)}.panel h2{margin:0 0 6px;font:400 18px/1 Georgia,serif}.panel p{margin:0;color:#809da6;font-size:10px;line-height:1.45}.status{margin-top:9px;color:#acd2ce;font:600 8px/1.35 ui-monospace,monospace;text-transform:uppercase}.status:before{content:"";display:inline-block;width:6px;height:6px;margin-right:7px;border-radius:50%;background:#69d7da;box-shadow:0 0 12px rgba(105,215,218,.68)}
.route-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}.route-grid button,.controls button{appearance:none;border:1px solid rgba(138,191,204,.17);border-radius:8px;padding:8px;background:#071827;color:#92adb4;font:600 8px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.10em;cursor:pointer}.route-grid button:hover,.route-grid button[aria-pressed="true"],.controls button:hover,.controls button[aria-pressed="true"]{color:#f0c17a;border-color:rgba(240,193,122,.42);background:rgba(86,59,24,.24)}
.controls{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}.focus-line{margin-top:8px;color:#6f8d96;font-size:9px}.focus-line strong{color:#cfdfdd;font-weight:500}.cast{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}.cast-member{display:flex;align-items:center;gap:7px;padding:7px;border:1px solid rgba(138,191,204,.10);border-radius:7px;background:rgba(1,8,14,.30)}.cast-member strong{display:block;color:#c9dcda;font-size:9px;font-weight:500}.cast-member span{display:block;margin-top:3px;color:#56757d;font-size:6px}.boundary-list{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:5px}.boundary-list li{display:grid;grid-template-columns:7px 1fr;gap:6px;color:#78959d;font-size:8px;line-height:1.35}.boundary-list li:before{content:"";width:4px;height:4px;margin-top:3px;border-radius:50%;background:#f0c17a}.format-row{display:flex;justify-content:space-between;gap:8px;margin-top:7px;padding-top:7px;border-top:1px solid rgba(138,191,204,.10);font:600 7px/1.3 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.09em;color:#58757e}.format-row strong{color:#9ab7bc;font-weight:600}
.footer{display:flex;justify-content:space-between;align-items:center;padding:0 22px;border-top:1px solid var(--line);color:#607d85;font-size:8px}.footer strong{color:#96b0b5;font-weight:500}.reduced-motion:after{display:none}
body[data-focus="fold-01"] .f1,body[data-focus="fold-02"] .f2,body[data-focus="fold-03"] .f3,body[data-focus="fold-04"] .f4{text-shadow:0 0 18px currentColor}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:900px){html,body{overflow:auto}.shell{height:auto;min-height:100vh}.workspace{display:block}.stage{height:64vh}.rail{margin-top:10px}.top{height:auto}.genesis-state{display:none}.footer{height:auto;padding:10px;gap:10px}}
</style>
</head>
<body data-focus="overview">
<div class="shell">
  <header class="top">
    <div>
      <div class="kicker">HoloLand · Model Village · MV-S4</div>
      <h1>Stormglass Commons: The Four‑Village Fold</h1>
    </div>
    <div class="genesis-state"><div><strong>MANIFEST SEALED</strong>Genesis completed before resident staging</div><div class="seal" aria-hidden="true"></div></div>
  </header>
  <main class="workspace">
    <section class="stage" aria-label="Four-Village Fold WebGPU traversal witness">
      <canvas id="world" width="1120" height="720"></canvas>
      <div class="stage-title"><span>Genesis → resident motion → Fold traversal · authored step 539</span><strong>Four worlds, one visible boundary.</strong></div>
      <div class="profile-chip">Story profile · public embodiments</div>
      <div class="fold-label f1">FOLD 01<b>Tideglass Courtyard</b></div>
      <div class="fold-label f2">FOLD 02<b>Ember Kiln Terrace</b></div>
      <div class="fold-label f3">FOLD 03<b>Moonseed Orchard</b></div>
      <div class="fold-label f4">FOLD 04<b>Wind Archive Spires</b></div>
      ${labels}
      <div class="stage-legend" aria-label="Visible execution and identity lanes">
        <span class="lane authored" data-lane>HoloScript-authored motion</span>
        <span class="lane gpu" data-lane>WebGPU presentation</span>
        <span class="lane identity" data-lane>Story identity only</span>
        <span class="lane boundary" data-lane>Research profile remains neutral</span>
        <span class="lane boundary" data-lane>No observer causal feedback</span>
      </div>
    </section>
    <aside class="rail">
      <section class="panel">
        <div class="eyebrow">Traversal witness</div>
        <h2>The Fold is navigable</h2>
        <p>Choose any island. A route mark changes only this observer view; motion, research state, prompts, and receipts remain untouched.</p>
        <div class="status" data-status>Booting WebGPU Fold…</div>
        <div class="route-grid" aria-label="Fold navigation">
          <button data-fold-button="fold-01" aria-pressed="false">1 · Tideglass</button>
          <button data-fold-button="fold-02" aria-pressed="false">2 · Ember</button>
          <button data-fold-button="fold-03" aria-pressed="false">3 · Moonseed</button>
          <button data-fold-button="fold-04" aria-pressed="false">4 · Wind Archive</button>
        </div>
        <div class="controls"><button id="overview">Overview · Home</button><button id="motion" aria-pressed="false">Reduced motion · M</button></div>
        <div class="focus-line">Observer focus: <strong data-focus-label>Overview</strong></div>
      </section>
      <section class="panel">
        <h2>Public story cast</h2>
        <p>Named mantles embody model families in story mode only. They are not research-seat or live-adapter bindings.</p>
        <div class="cast">${cast}</div>
      </section>
      <section class="panel">
        <h2>Blinding stays structural</h2>
        <ul class="boundary-list">
          <li>The live research payload contains only Resident 01–06 and neutral civic fields.</li>
          <li>No public catalog, provider family, adapter identity, condition identity, or cross-profile join is serialized.</li>
          <li>Gesture staging is noncanonical; no propose, settle, success, or completion gesture is inferred.</li>
          <li>This is a traversal rehearsal—not a completed multi-model experiment or captured-response comparison.</li>
        </ul>
        <div class="format-row"><span>.holo <strong>world</strong></span><span>.hsplus <strong>policy</strong></span><span>.hs <strong>fixed input</strong></span></div>
      </section>
    </aside>
  </main>
  <footer class="footer">
    <span><strong>Three-run replay:</strong> 720 × 60 Hz · story + blinded profile digests exact</span>
    <span>${DISCLOSURE}</span>
  </footer>
</div>
<div class="sr-only" aria-live="polite" data-live-status>Booting WebGPU Four-Village Fold witness.</div>
<script>window.__MV_S4_PAYLOAD__=${safeInlineJson(payload)};</script>
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
  assert(snapshot.gpu.renderPipelinesCreated === 4, 'WebGPU pipeline count drifted');
  assert(snapshot.gpu.commandEncoderUsed === true, 'GPU command encoder was not used');
  assert(snapshot.drawCounts.terrainDraws === 1, 'Fold terrain was not drawn');
  assert(snapshot.drawCounts.architectureDraws === 1, 'Fold architecture was not drawn');
  assert(snapshot.drawCounts.genesisDraws === 1, 'Genesis light was not drawn');
  assert(snapshot.drawCounts.residentInstances === 6, 'Resident instance count drifted');
  assert(snapshot.metrics.cpuSubmit.samples === 24, 'CPU submit sample count drifted');
  if (snapshot.gpu.timestampQuerySupported) {
    assert(snapshot.metrics.gpuPass.samples === 24, 'GPU timestamp sample count drifted');
    assert(snapshot.metrics.gpuPass.p95Ms > 0, 'GPU timestamp p95 is not positive');
  } else {
    assert(snapshot.metrics.gpuPass.samples === 0, 'Unsupported timestamps produced samples');
  }
  assert(snapshot.labels.length === 5, 'Visible witness label count drifted');
  assert(
    snapshot.labels.includes('Research profile remains neutral'),
    'Research-neutral label is not visible'
  );
  assert(
    canonicalJson(snapshot.familyNames)
      === canonicalJson(['Brittney', 'Claude', 'OpenAI · Codex', 'Gemini', 'Grok', 'GLM']),
    'Visible public family names drifted'
  );
  assert(snapshot.protectedDigest === payload.observerIsolation.protectedDigest, 'Protected digest drifted');
  assert(snapshot.replayDigest === payload.motion.stateDigests.combined, 'Replay digest drifted');
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
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hololand-mv-s4-'));
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
    await waitForExpression(client, 'window.__MV_S4__?.ready === true', 120_000);
    const snapshot = await evaluate(client, 'window.__MV_S4_SNAPSHOT__()', 60_000);
    validateBrowserSnapshot(snapshot, payload);
    const heroOne = await captureScreenshot(
      client,
      path.join(outputDir, 'mv-s4-four-village-fold-hero-a.png'),
      1600,
      900
    );
    const heroTwo = await captureScreenshot(
      client,
      path.join(outputDir, 'mv-s4-four-village-fold-hero-b.png'),
      1600,
      900
    );
    assert(heroOne.sha256 === heroTwo.sha256, 'Repeat screenshot hash drifted');

    const protectedBefore = snapshot.protectedDigest;
    for (const foldId of ['fold-01', 'fold-02', 'fold-03', 'fold-04']) {
      const navigation = await evaluate(
        client,
        `window.__MV_S4_SELECT_FOLD__(${JSON.stringify(foldId)})`,
        30_000
      );
      assert(navigation.focusedFoldId === foldId, `Browser navigation failed for ${foldId}`);
      assert(
        navigation.protectedDigest === protectedBefore,
        `Browser navigation mutated protected digest for ${foldId}`
      );
    }
    const reducedMotion = await evaluate(
      client,
      'window.__MV_S4_SET_REDUCED_MOTION__(true)',
      30_000
    );
    assert(reducedMotion.reducedMotion === true, 'Reduced motion control failed');
    assert(reducedMotion.protectedDigest === protectedBefore, 'Reduced motion mutated protected digest');
    const externalRequests = networkRequests.filter(
      (url) => !url.startsWith(`http://127.0.0.1:${address.port}/`)
    );
    assert(externalRequests.length === 0, 'Browser made an external network request');
    assert(exceptions.length === 0, `Browser exceptions: ${canonicalJson(exceptions)}`);
    return {
      product: version.product,
      userAgent: version.userAgent,
      snapshot,
      deterministicScreenshot: {
        exactRepeatHashMatched: true,
        first: heroOne,
        second: heroTwo,
      },
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

function buildReport(receipt) {
  const story = receipt.motion[STORY_PROFILE];
  const blinded = receipt.motion[BLINDED_PROFILE];
  const gpu = receipt.browser.snapshot.gpu;
  const timings = receipt.browser.snapshot.metrics;
  return `# HoloLand Model Village MV-S4 — Resident Motion and the Four-Village Fold

Date: 2026-07-27
Status: **PASS (bounded traversal slice)**

## Outcome

MV-S4 now has a HoloScript-authored Genesis arrival grammar, four navigable
Stormglass Fold islands, six residents moving through fixed-step route tracks,
and two structurally separate presentation projections. The public story
projection names Brittney, Claude, OpenAI / Codex, Gemini, Grok, and GLM. The
live-blinded projection serializes only Resident 01–06 and neutral civic
appearance fields.

This is a traversal and staging witness. It is not a completed multi-model
experiment, a captured-response replay, a condition comparison, or research
unblinding.

## Three HoloScript format roles

| Format | Authored responsibility | Parser proof |
|---|---|---|
| \`.holo\` | Genesis and Fold topology, materials, profile boundary, accessibility, claim boundary | \`HoloCompositionParser\` PASS |
| \`.hsplus\` | Fixed-step motion, social staging, navigation, replay, projection, and no-feedback policy | \`HoloScriptPlusParser\` PASS |
| \`.hs\` | Flat waypoints, profile-local tracks, deterministic inputs | \`HoloScriptCodeParser\` PASS |

The bridge evaluates the structured policy. Native \`.hsplus\` action execution
is not claimed.

## Deterministic motion

- 720 steps at 60 Hz per run.
- Three exact runs for \`${STORY_PROFILE}\`.
- Three exact runs for \`${BLINDED_PROFILE}\`.
- Story digest: \`${story.stateDigests.combined}\`.
- Blinded digest: \`${blinded.stateDigests.combined}\`.
- Combined profile root: \`${receipt.motion.combinedProfileDigest}\`.
- Wall-clock and GPU timings are excluded from state digests.

The allowed presentation-only stages are \`arrive\`, \`walk\`, \`pause\`,
\`route_greeting\`, and \`wayfinding_point\`. Receipt-bearing success semantics
such as \`propose\`, \`settle\`, and \`completed_task\` are not inferred.

## Disclosure and research blindness

- Story and blinded actor IDs are disjoint.
- The blinded payload contains no public embodiment IDs, provider/family/model
  fields, adapter identity, condition identity, or public model names.
- The public catalog is not loaded into the blinded projection.
- No research-seat-to-public-identity or spatial join exists.
- Public identities are HoloLand-authored story embodiments, not live adapter
  bindings or model revision claims.

${DISCLOSURE}

## Observer isolation

All four Fold navigation choices were exercised. They changed only observer
focus and route marks. Seven protected state hashes remained identical:
canonical scene, canonical pose, logical clock, public state, executed schedule,
resident observation, and action receipt root.

- Mutation delta: \`${receipt.observerIsolation.mutationDelta}\`.
- External browser requests: \`${receipt.browser.externalRequests.length}\`.
- Model calls: \`0\`.
- Canonical village, prompt, action, observation, schedule, and receipt writes: \`0\`.

## Desktop WebGPU witness

- Browser: \`${receipt.browser.product}\`.
- Adapter: \`${gpu.description || gpu.device || gpu.vendor || 'adapter acquired'}\`.
- Render pipelines: \`${gpu.renderPipelinesCreated}\`.
- Draw domains: Fold terrain, architecture, Genesis light, six resident silhouettes.
- CPU-submit samples: \`${timings.cpuSubmit.samples}\`; p95 \`${timings.cpuSubmit.p95Ms?.toFixed(4)} ms\`.
- GPU timestamp support: \`${gpu.timestampQuerySupported}\`.
- GPU timestamp samples: \`${timings.gpuPass.samples}\`; p95 \`${timings.gpuPass.p95Ms?.toFixed(4) ?? 'unsupported'} ms\`.
- Exact repeat screenshot hash matched: \`${receipt.browser.deterministicScreenshot.exactRepeatHashMatched}\`.
- Hero SHA-256: \`${receipt.browser.deterministicScreenshot.first.sha256}\`.

CPU and GPU timing lanes are reported separately and are not present in the
immutable image itself.

## Look-development result

The witness uses the locked Hearthlight Biorealism direction: indigo storm
light, wet basalt terraces, translucent cyan stormglass paths, and warm copper
Genesis light. Four route accents distinguish the islands without encoding
research conditions. Public residents use compact mantle silhouettes and
visible nameplates so identity reads without overwhelming the Fold topology.

The first inspected frame exposed two defects: shared terminal waypoints hid two
residents, and screen-space vertical orientation swapped island accent colors
relative to their labels. The final witness uses authored traversal step 539,
where all six residents are spatially distinct, and remaps the shader palette so
Tideglass, Ember, Moonseed, and Wind Archive match their visible names.

Backend: real browser WebGPU in headless Chrome via D3D11.
Screenshot: \`${HERO_REL}\`.

## Claim boundary

Proved here: authored format roles, deterministic resident motion, Genesis
phase ordering, four-island navigation, story/blinded projection separation,
observer isolation, keyboard/reduced-motion contracts, offline browser
execution, real WebGPU pipelines/draws, and an exact repeat desktop screenshot.

Not proved here: a completed multi-model experiment, captured model responses,
mixed or homogeneous experimental conditions, research unblinding, live model
adapter bindings, production humanoid animation, photorealism, WebXR/headset
performance, or provider affiliation/endorsement.
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.outputDir, { recursive: true });
  const contracts = await loadFoldContracts({
    repoRoot: REPO_ROOT,
    holoScriptRoot: args.holoScriptRoot,
  });
  const motion = runDeterministicMotionReplays(contracts);
  const observerIsolation = verifyObserverIsolation();
  const manifest = validateFoldManifest(contracts, {
    repoRoot: REPO_ROOT,
    motion,
    observerIsolation,
  });
  const story = motion[STORY_PROFILE].projection;
  const blinded = motion[BLINDED_PROFILE].projection;
  const payload = {
    sourceDigest: digest(contracts.sourceHashes),
    sourceHashes: contracts.sourceHashes,
    folds: contracts.world.folds.map(({ traits, ...fold }) => fold),
    story,
    motion: {
      profile: STORY_PROFILE,
      stateDigests: motion[STORY_PROFILE].stateDigests,
      samples: motion[STORY_PROFILE].samples,
      visualFrame: motion[STORY_PROFILE].samples.find(({ step }) => step === 539),
      finalState: motion[STORY_PROFILE].finalState,
    },
    observerIsolation,
  };
  const html = buildFoldHtml(payload);
  fs.writeFileSync(path.join(args.outputDir, 'index.html'), html);
  const browserPath = args.skipBrowser
    ? null
    : resolveBrowser(args.browser);
  const browser = args.skipBrowser
    ? null
    : await runBrowserWitness({
        html,
        payload,
        browserPath,
        outputDir: args.outputDir,
      });
  const blindedSerialized = canonicalJson(blinded);
  const receipt = {
    schema: SCHEMA,
    generatedAt: new Date().toISOString(),
    status: browser || args.skipBrowser ? 'PASS' : 'FAIL',
    source: {
      world: FOLD_SOURCE_REL,
      policy: FOLD_POLICY_REL,
      seed: FOLD_SEED_REL,
      hashes: contracts.sourceHashes,
      parserStatus: {
        holo: 'PASS',
        hsplus: 'PASS',
        hs: 'PASS',
      },
    },
    manifest,
    topology: {
      foldCount: contracts.world.folds.length,
      foldIds: contracts.world.folds.map(({ objectId }) => objectId),
      genesisPhaseCount: 5,
      storyActorCount: story.actors.length,
      blindedActorCount: blinded.actors.length,
    },
    projection: {
      storyPurpose: story.purpose,
      storyDisclosure: story.disclosure,
      blindedPurpose: blinded.purpose,
      publicCatalogLoadedInBlindedProfile: blinded.publicCatalogLoaded,
      blindedPayloadSha256: sha256(blindedSerialized),
      blindedPayloadContainsPublicNames: ['Brittney', 'Claude', 'OpenAI', 'Gemini', 'Grok', 'GLM']
        .some((name) => blindedSerialized.includes(name)),
      actorIdsDisjoint: story.actors.every(
        ({ actorId }) => !blinded.actors.some((actor) => actor.actorId === actorId)
      ),
    },
    motion,
    observerIsolation,
    browser,
    claims: {
      completedMultiModelExperiment: false,
      capturedResponseReplay: false,
      researchConditionComparison: false,
      researchUnblinding: false,
      liveAdapterBinding: false,
      nativeHsplusActionExecution: false,
      productionHumanoidAnimation: false,
      photorealism: false,
      webXrOrHeadsetPerformance: false,
      providerAffiliationOrEndorsement: false,
    },
  };
  assert(receipt.projection.blindedPayloadContainsPublicNames === false, 'Blinded payload leaked a public name');
  assert(receipt.projection.actorIdsDisjoint === true, 'Projection actor IDs are not disjoint');
  fs.writeFileSync(
    path.join(args.outputDir, 'receipt.json'),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
  if (args.writeArtifacts) {
    assert(browser, '--write-artifacts requires the browser witness');
    const heroPath = path.join(REPO_ROOT, HERO_REL);
    fs.mkdirSync(path.dirname(heroPath), { recursive: true });
    fs.copyFileSync(
      path.join(REPO_ROOT, browser.deterministicScreenshot.first.path),
      heroPath
    );
    assert(
      sha256(fs.readFileSync(heroPath)) === browser.deterministicScreenshot.first.sha256,
      'Durable hero hash drifted after copy'
    );
    const reportPath = path.join(REPO_ROOT, REPORT_REL);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, buildReport(receipt));
    receipt.artifacts = {
      hero: {
        path: HERO_REL,
        sha256: sha256(fs.readFileSync(heroPath)),
      },
      report: {
        path: REPORT_REL,
        sha256: sha256(fs.readFileSync(reportPath)),
      },
    };
    fs.writeFileSync(
      path.join(args.outputDir, 'receipt.json'),
      `${JSON.stringify(receipt, null, 2)}\n`
    );
  }
  if (args.json) console.log(JSON.stringify(receipt, null, 2));
  else {
    console.log(`PASS ${SCHEMA}`);
    console.log(`  replay: ${motion.combinedProfileDigest}`);
    console.log(`  observer mutation delta: ${observerIsolation.mutationDelta}`);
    if (browser) {
      console.log(
        `  WebGPU: ${browser.snapshot.gpu.description || browser.snapshot.gpu.device || 'adapter acquired'}`
      );
      console.log(`  screenshot: ${browser.deterministicScreenshot.first.sha256}`);
    }
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
