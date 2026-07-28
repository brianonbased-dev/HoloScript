#!/usr/bin/env node
/**
 * Headless Dawn WebGPU smoke probe for snn-webgpu edit hooks.
 *
 * No browser, Playwright, or nvidia-smi: this only asks Dawn for an adapter and
 * records the result in .holo-ci-last-workload.localPreflight.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const WATCHED_PREFIX = 'packages/snn-webgpu';
const DEFAULT_TIMEOUT_MS = 2800;

const forced = process.argv.includes('--force');
const argPath = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || '';
const filePath = forced
  ? argPath || WATCHED_PREFIX
  : firstString(
      process.env.CLAUDE_TOOL_INPUT_FILE_PATH,
      process.env.FILE_PATH,
      process.env.HOOK_FILE_PATH,
      argPath,
      readHookPayloadFilePath()
    );

if (!filePath || !filePath.replace(/\\/g, '/').includes(WATCHED_PREFIX)) {
  process.exit(0);
}

const WORKLOAD_ROOT =
  process.env.AI_ECOSYSTEM_ROOT || process.env.HOLOMESH_ROOT || join(homedir(), '.ai-ecosystem');
const WORKLOAD =
  process.env.HOLOCI_WORKLOAD_PATH ||
  process.env.HOLO_CI_WORKLOAD_PATH ||
  join(WORKLOAD_ROOT, '.holo-ci-last-workload');
const timeoutMs = Number(process.env.SNN_WEBGPU_HEADLESS_PROBE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

const started = performance.now();
const result = await runProbe();
result.duration_ms = Math.round(performance.now() - started);
result.ts = new Date().toISOString();

writeLocalPreflight(result);

const adapterLabel = result.adapter_info
  ? [result.adapter_info.vendor, result.adapter_info.device || result.adapter_info.architecture]
      .filter(Boolean)
      .join(' ')
  : 'no-adapter';
console.log(`[webgpu-headless] ${result.status} ${adapterLabel} ${result.duration_ms}ms`);
process.exit(0);

async function runProbe() {
  try {
    const { create } = await import('webgpu');
    if (typeof create !== 'function') {
      throw new Error('webgpu package did not expose create()');
    }

    const gpuInstance = create([]);
    if (!gpuInstance || typeof gpuInstance.requestAdapter !== 'function') {
      throw new Error('Dawn WebGPU instance did not expose requestAdapter()');
    }

    const adapter = await withTimeout(
      gpuInstance.requestAdapter({ powerPreference: 'high-performance' }),
      timeoutMs,
      'requestAdapter'
    );

    if (!adapter) {
      return {
        probe: 'snn-webgpu-headless',
        status: 'FAIL',
        adapter_info: null,
        error: 'requestAdapter returned null',
      };
    }

    return {
      probe: 'snn-webgpu-headless',
      status: 'PASS',
      adapter_info: await normalizeAdapterInfo(adapter),
    };
  } catch (error) {
    return {
      probe: 'snn-webgpu-headless',
      status: 'FAIL',
      adapter_info: null,
      error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    };
  }
}

async function normalizeAdapterInfo(adapter) {
  const info =
    adapter.info && typeof adapter.info === 'object'
      ? Object.fromEntries(Object.entries(adapter.info).filter(([, value]) => isJsonScalar(value)))
      : {};

  if (typeof adapter.requestAdapterInfo === 'function') {
    try {
      const requested = await adapter.requestAdapterInfo();
      if (requested && typeof requested === 'object') {
        Object.assign(
          info,
          Object.fromEntries(Object.entries(requested).filter(([, value]) => isJsonScalar(value)))
        );
      }
    } catch {
      // Adapter info is diagnostic only.
    }
  }

  return {
    vendor: stringifyInfo(info.vendor, 'unknown'),
    architecture: stringifyInfo(info.architecture, 'unknown'),
    device: stringifyInfo(info.device, ''),
    description: stringifyInfo(info.description, ''),
    features: adapter.features ? Array.from(adapter.features, String).sort() : [],
    limits: pickLimits(adapter.limits),
  };
}

function stringifyInfo(value, fallback) {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function pickLimits(limits) {
  if (!limits || typeof limits !== 'object') return {};
  const keys = [
    'maxTextureDimension2D',
    'maxComputeInvocationsPerWorkgroup',
    'maxComputeWorkgroupSizeX',
    'maxStorageBufferBindingSize',
  ];
  return Object.fromEntries(
    keys
      .map((key) => [key, limits[key]])
      .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
  );
}

function isJsonScalar(value) {
  return ['string', 'number', 'boolean'].includes(typeof value) || value === null;
}

function firstString(...values) {
  return values.find((value) => typeof value === 'string' && value.length > 0) || '';
}

function readHookPayloadFilePath() {
  try {
    const raw = readFileSync(0, 'utf8').trim();
    if (!raw) return '';
    const payload = JSON.parse(raw);
    const toolInput =
      payload && typeof payload.tool_input === 'object' && payload.tool_input !== null
        ? payload.tool_input
        : {};

    return firstString(toolInput.file_path, toolInput.path, payload.file_path, payload.path);
  } catch {
    return '';
  }
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function writeLocalPreflight(preflight) {
  try {
    let workload = {};
    if (existsSync(WORKLOAD)) {
      try {
        workload = JSON.parse(readFileSync(WORKLOAD, 'utf8'));
      } catch {
        workload = {};
      }
    }
    workload.localPreflight = preflight;
    writeFileSync(WORKLOAD, JSON.stringify(workload, null, 2));
  } catch {
    // The hook must stay non-blocking if the breadcrumb is locked or absent.
  }
}
