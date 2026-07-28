#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGpuIdentityNotes,
  detectHostGpuInventory,
  mergeHostGpuDevices,
  normalizeBrowserGpuInfo,
  parseLinuxLspci,
  parseMacSystemProfilerJson,
  parseNvidiaSmiCsv,
  parseWindowsCimJson,
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
      vendor: 'NVIDIA',
      vendor_id: '10de',
      device_id: null,
      uuid: 'GPU-aaaa',
      driver_version: '591.74',
      pci_bus_id: '00000000:01:00.0',
      memory_total_mib: 8188,
      adapter_ram_mib: null,
      pnp_device_id: null,
      sources: ['nvidia-smi'],
    },
    {
      index: 1,
      name: 'NVIDIA GeForce RTX 3090',
      vendor: 'NVIDIA',
      vendor_id: '10de',
      device_id: null,
      uuid: 'GPU-bbbb',
      driver_version: '591.74',
      pci_bus_id: '00000000:02:00.0',
      memory_total_mib: 24576,
      adapter_ram_mib: null,
      pnp_device_id: null,
      sources: ['nvidia-smi'],
    },
  ]);
});

test('parseWindowsCimJson keeps physical AMD and Intel adapters and excludes virtual displays', () => {
  const devices = parseWindowsCimJson(
    JSON.stringify([
      {
        Name: 'AMD Radeon RX 7900 XTX',
        DriverVersion: '32.0.21001.9024',
        PNPDeviceID: 'PCI\\VEN_1002&DEV_744C&SUBSYS_0E3A1002&REV_C8\\6&1',
        AdapterRAM: 4294967295,
        AdapterCompatibility: 'Advanced Micro Devices, Inc.',
      },
      {
        Name: 'Intel(R) Arc(TM) A770 Graphics',
        DriverVersion: '32.0.101.6881',
        PNPDeviceID: 'PCI\\VEN_8086&DEV_56A0&SUBSYS_10208086&REV_08\\3&2',
        AdapterRAM: 4294967295,
        AdapterCompatibility: 'Intel Corporation',
      },
      {
        Name: 'Virtual Display',
        DriverVersion: '1.0.0',
        PNPDeviceID: 'ROOT\\DISPLAY\\0000',
        AdapterRAM: null,
        AdapterCompatibility: 'Virtual',
      },
    ])
  );

  assert.equal(devices.length, 2);
  assert.deepEqual(
    devices.map(({ name, vendor_id, device_id, sources }) => ({
      name,
      vendor_id,
      device_id,
      sources,
    })),
    [
      {
        name: 'AMD Radeon RX 7900 XTX',
        vendor_id: '1002',
        device_id: '744c',
        sources: ['windows-cim'],
      },
      {
        name: 'Intel(R) Arc(TM) A770 Graphics',
        vendor_id: '8086',
        device_id: '56a0',
        sources: ['windows-cim'],
      },
    ]
  );
});

test('parseLinuxLspci recognizes AMD and Intel display controller classes', () => {
  const devices = parseLinuxLspci(
    [
      '0000:03:00.0 VGA compatible controller [0300]: Advanced Micro Devices, Inc. [AMD/ATI] Navi 31 [Radeon RX 7900 XTX] [1002:744c] (rev c8)',
      '0000:00:02.0 Display controller [0380]: Intel Corporation Arc Graphics [8086:56a0] (rev 08)',
      '0000:04:00.0 Audio device [0403]: Advanced Micro Devices, Inc. Device [1002:ab30]',
    ].join('\n')
  );

  assert.equal(devices.length, 2);
  assert.deepEqual(
    devices.map(({ vendor, vendor_id, device_id, pci_bus_id }) => ({
      vendor,
      vendor_id,
      device_id,
      pci_bus_id,
    })),
    [
      {
        vendor: 'AMD',
        vendor_id: '1002',
        device_id: '744c',
        pci_bus_id: '0000:03:00.0',
      },
      {
        vendor: 'Intel',
        vendor_id: '8086',
        device_id: '56a0',
        pci_bus_id: '0000:00:02.0',
      },
    ]
  );
});

test('parseMacSystemProfilerJson normalizes Intel and AMD display records', () => {
  const devices = parseMacSystemProfilerJson(
    JSON.stringify({
      SPDisplaysDataType: [
        {
          spdisplays_chipset_model: 'Intel UHD Graphics 630',
          spdisplays_vendor: 'Intel (0x8086)',
          'spdisplays_device-id': '0x3e9b',
          spdisplays_vram_shared: '1536 MB',
        },
        {
          spdisplays_chipset_model: 'AMD Radeon Pro 5500M',
          spdisplays_vendor: 'AMD (0x1002)',
          'spdisplays_device-id': '0x7340',
          spdisplays_vram: '8 GB',
        },
      ],
    })
  );

  assert.deepEqual(
    devices.map(({ vendor, vendor_id, device_id, memory_total_mib, adapter_ram_mib }) => ({
      vendor,
      vendor_id,
      device_id,
      memory_total_mib,
      adapter_ram_mib,
    })),
    [
      {
        vendor: 'Intel',
        vendor_id: '8086',
        device_id: '3e9b',
        memory_total_mib: null,
        adapter_ram_mib: 1536,
      },
      {
        vendor: 'AMD',
        vendor_id: '1002',
        device_id: '7340',
        memory_total_mib: 8192,
        adapter_ram_mib: null,
      },
    ]
  );
});

test('mergeHostGpuDevices enriches one device from multiple providers without duplication', () => {
  const devices = mergeHostGpuDevices([
    {
      name: 'nvidia-smi',
      devices: parseNvidiaSmiCsv(
        '0, NVIDIA GeForce RTX 3060 Laptop GPU, GPU-aaaa, 610.62, 00000000:01:00.0, 6144'
      ),
    },
    {
      name: 'windows-cim',
      devices: parseWindowsCimJson(
        JSON.stringify({
          Name: 'NVIDIA GeForce RTX 3060 Laptop GPU',
          DriverVersion: '32.0.16.1062',
          PNPDeviceID: 'PCI\\VEN_10DE&DEV_2520&SUBSYS_0A5D1028&REV_A1\\4&1',
          AdapterRAM: 4293918720,
          AdapterCompatibility: 'NVIDIA',
        })
      ),
    },
  ]);

  assert.equal(devices.length, 1);
  assert.equal(devices[0].uuid, 'GPU-aaaa');
  assert.equal(devices[0].device_id, '2520');
  assert.equal(devices[0].memory_total_mib, 6144);
  assert.equal(devices[0].adapter_ram_mib, 4095);
  assert.deepEqual(devices[0].sources, ['nvidia-smi', 'windows-cim']);
});

test('detectHostGpuInventory records the query scope without claiming adapter selection', () => {
  let invocation;
  const inventory = detectHostGpuInventory({
    platform: 'test-platform',
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
  assert.equal(inventory.schema_version, 'holoscript.host-gpu-inventory.v2');
  assert.equal(inventory.source, 'nvidia-smi');
  assert.equal(inventory.platform, 'test-platform');
  assert.equal(inventory.scope, 'host-inventory');
  assert.equal(inventory.webgpu_adapter_selection_proven, false);
  assert.deepEqual(inventory.providers, [
    {
      name: 'nvidia-smi',
      status: 'available',
      device_count: 1,
    },
  ]);
  assert.equal(inventory.devices[0].uuid, 'GPU-aaaa');
});

test('detectHostGpuInventory isolates nvidia-smi failure and falls through to AMD CIM', () => {
  const inventory = detectHostGpuInventory({
    platform: 'win32',
    execFile(command) {
      if (command === 'nvidia-smi') throw new Error('not installed');
      return JSON.stringify({
        Name: 'AMD Radeon RX 7900 XTX',
        DriverVersion: '32.0.21001.9024',
        PNPDeviceID: 'PCI\\VEN_1002&DEV_744C&SUBSYS_0E3A1002&REV_C8\\6&1',
        AdapterRAM: 4294967295,
        AdapterCompatibility: 'Advanced Micro Devices, Inc.',
      });
    },
  });

  assert.equal(inventory.source, 'windows-cim');
  assert.deepEqual(
    inventory.providers.map(({ name, status, device_count }) => ({
      name,
      status,
      device_count,
    })),
    [
      { name: 'nvidia-smi', status: 'unavailable', device_count: 0 },
      { name: 'windows-cim', status: 'available', device_count: 1 },
    ]
  );
  assert.equal(inventory.devices[0].vendor_id, '1002');
  assert.equal(inventory.devices[0].vendor, 'Advanced Micro Devices, Inc.');
  assert.equal(inventory.webgpu_adapter_selection_proven, false);
});

test('detectHostGpuInventory degrades honestly when vendor tooling fails', () => {
  const inventory = detectHostGpuInventory({
    platform: 'test-platform',
    execFile() {
      throw new Error('not installed');
    },
  });

  assert.equal(inventory.source, 'unavailable');
  assert.equal(inventory.webgpu_adapter_selection_proven, false);
  assert.deepEqual(inventory.devices, []);
  assert.match(inventory.reason, /No host GPU provider/u);
  assert.equal(inventory.providers[0].status, 'unavailable');
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
