#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGpuIdentityNotes,
  detectHostGpuInventory,
  normalizeBrowserGpuInfo,
  parseNvidiaSmiCsv,
} from '../webgpu-capture/gpu-identity.mjs';

test('parseNvidiaSmiCsv normalizes multiple devices and ignores malformed rows', () => {
  const devices = parseNvidiaSmiCsv(
    [
      '0, NVIDIA RTX 2000 Ada Generation Laptop GPU, GPU-aaaa, 591.74, 00000000:01:00.0, 8188',
      'malformed',
      '1, NVIDIA GeForce RTX 3090, GPU-bbbb, 591.74, 00000000:02:00.0, 24576',
    ].join('\r\n')
  );

  assert.deepEqual(devices, [
    {
      index: 0,
      name: 'NVIDIA RTX 2000 Ada Generation Laptop GPU',
      uuid: 'GPU-aaaa',
      driver_version: '591.74',
      pci_bus_id: '00000000:01:00.0',
      memory_total_mib: 8188,
    },
    {
      index: 1,
      name: 'NVIDIA GeForce RTX 3090',
      uuid: 'GPU-bbbb',
      driver_version: '591.74',
      pci_bus_id: '00000000:02:00.0',
      memory_total_mib: 24576,
    },
  ]);
});

test('detectHostGpuInventory records the query scope without claiming adapter selection', () => {
  let invocation;
  const inventory = detectHostGpuInventory({
    platform: 'win32',
    execFile(command, args, options) {
      invocation = { command, args, options };
      return '0, NVIDIA RTX 2000 Ada Generation Laptop GPU, GPU-aaaa, 591.74, 00000000:01:00.0, 8188\n';
    },
  });

  assert.equal(invocation.command, 'nvidia-smi');
  assert.deepEqual(invocation.args, [
    '--query-gpu=index,name,uuid,driver_version,pci.bus_id,memory.total',
    '--format=csv,noheader,nounits',
  ]);
  assert.equal(invocation.options.encoding, 'utf8');
  assert.equal(inventory.schema_version, 'holoscript.host-gpu-inventory.v1');
  assert.equal(inventory.source, 'nvidia-smi');
  assert.equal(inventory.platform, 'win32');
  assert.equal(inventory.scope, 'host-inventory');
  assert.equal(inventory.webgpu_adapter_selection_proven, false);
  assert.equal(inventory.devices[0].uuid, 'GPU-aaaa');
});

test('detectHostGpuInventory degrades honestly when vendor tooling fails', () => {
  const inventory = detectHostGpuInventory({
    execFile() {
      throw new Error('not installed');
    },
  });

  assert.equal(inventory.source, 'unavailable');
  assert.equal(inventory.webgpu_adapter_selection_proven, false);
  assert.deepEqual(inventory.devices, []);
  assert.match(inventory.reason, /unavailable/u);
});

test('normalizeBrowserGpuInfo keeps stable CDP identity fields and sorts maps', () => {
  const identity = normalizeBrowserGpuInfo({
    devices: [
      {
        vendorId: 0x10de,
        deviceId: 0x28b8,
        subSysId: 0x18f71028,
        revision: 161,
        vendorString: 'NVIDIA',
        deviceString: 'NVIDIA RTX 2000 Ada Generation Laptop GPU',
        driverVendor: 'NVIDIA',
        driverVersion: '31.0.15.9174',
      },
    ],
    auxAttributes: {
      glRenderer: 'ANGLE (NVIDIA)',
      glVendor: 'Google Inc. (NVIDIA)',
      sandboxed: true,
      ignoredPrivateField: 'not copied',
    },
    featureStatus: {
      webgl: 'enabled',
      gpu_compositing: 'enabled',
      ignoredNumericField: 1,
    },
    driverBugWorkarounds: ['workaround-z', 'workaround-a'],
  });

  assert.deepEqual(identity, {
    schema_version: 'holoscript.chromium-gpu-info.v1',
    source: 'chromium-cdp-system-info',
    scope: 'chromium-gpu-process',
    webgpu_adapter_selection_proven: false,
    devices: [
      {
        vendor_id: 0x10de,
        device_id: 0x28b8,
        sub_sys_id: 0x18f71028,
        revision: 161,
        vendor: 'NVIDIA',
        device: 'NVIDIA RTX 2000 Ada Generation Laptop GPU',
        driver_vendor: 'NVIDIA',
        driver_version: '31.0.15.9174',
      },
    ],
    aux_attributes: {
      gl_renderer: 'ANGLE (NVIDIA)',
      gl_vendor: 'Google Inc. (NVIDIA)',
      sandboxed: true,
    },
    feature_status: {
      gpu_compositing: 'enabled',
      webgl: 'enabled',
    },
    driver_bug_workarounds: ['workaround-a', 'workaround-z'],
  });
});

test('normalizeBrowserGpuInfo returns null when CDP does not return a GPU object', () => {
  assert.equal(normalizeBrowserGpuInfo(null), null);
});

test('identity notes state the evidence boundary when adapter_info is empty', () => {
  const notes = buildGpuIdentityNotes(
    {},
    { devices: [{ device: 'NVIDIA RTX 2000 Ada Generation Laptop GPU' }] },
    { devices: [{ uuid: 'GPU-aaaa' }] }
  );

  assert.equal(notes.length, 1);
  assert.match(notes[0], /neither field alone proves/u);
});

test('identity notes remain quiet when every identity layer is populated', () => {
  const notes = buildGpuIdentityNotes(
    { vendor: 'nvidia' },
    { devices: [{ device: 'NVIDIA RTX 2000 Ada Generation Laptop GPU' }] },
    { devices: [{ uuid: 'GPU-aaaa' }] }
  );

  assert.deepEqual(notes, []);
});
