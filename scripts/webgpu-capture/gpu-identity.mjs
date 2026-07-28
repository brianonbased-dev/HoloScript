import { execFileSync } from 'node:child_process';

const NVIDIA_SMI_QUERY = [
  '--query-gpu=index,name,uuid,driver_version,pci.bus_id,memory.total',
  '--format=csv,noheader,nounits',
];

const WINDOWS_CIM_QUERY = [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  "$ErrorActionPreference='Stop'; Get-CimInstance Win32_VideoController | " +
    'Select-Object Name,DriverVersion,PNPDeviceID,AdapterRAM,AdapterCompatibility,VideoProcessor | ' +
    'ConvertTo-Json -Compress',
];

const PLATFORM_PROVIDER = {
  win32: {
    name: 'windows-cim',
    command: 'powershell.exe',
    args: WINDOWS_CIM_QUERY,
    parse: parseWindowsCimJson,
  },
  linux: {
    name: 'linux-lspci',
    command: 'lspci',
    args: ['-Dnn'],
    parse: parseLinuxLspci,
  },
  darwin: {
    name: 'macos-system-profiler',
    command: 'system_profiler',
    args: ['SPDisplaysDataType', '-json'],
    parse: parseMacSystemProfilerJson,
  },
};

export function parseNvidiaSmiCsv(output) {
  return String(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(',').map((value) => value.trim()))
    .filter((fields) => fields.length >= 6)
    .map(([index, name, uuid, driverVersion, pciBusId, memoryTotalMib]) => ({
      index: Number.parseInt(index, 10),
      name,
      vendor: 'NVIDIA',
      vendor_id: '10de',
      device_id: null,
      uuid,
      driver_version: driverVersion,
      pci_bus_id: pciBusId,
      memory_total_mib: Number.parseInt(memoryTotalMib, 10),
      adapter_ram_mib: null,
      pnp_device_id: null,
      sources: ['nvidia-smi'],
    }))
    .filter(
      (device) =>
        Number.isInteger(device.index) &&
        device.name.length > 0 &&
        device.uuid.length > 0 &&
        Number.isInteger(device.memory_total_mib)
    );
}

export function parseWindowsCimJson(output) {
  const parsed = JSON.parse(String(output).trim());
  const rows = Array.isArray(parsed) ? parsed : [parsed];

  return rows
    .filter((row) => row && typeof row === 'object')
    .filter((row) => /^PCI\\/iu.test(normalizeString(row.PNPDeviceID) ?? ''))
    .map((row, index) => {
      const pnpDeviceId = normalizeString(row.PNPDeviceID);
      const vendorId = matchHexId(pnpDeviceId, /VEN_([0-9A-F]{4})/iu);
      const deviceId = matchHexId(pnpDeviceId, /DEV_([0-9A-F]{4})/iu);
      return {
        index,
        name: normalizeString(row.Name) ?? normalizeString(row.VideoProcessor),
        vendor: normalizeString(row.AdapterCompatibility) ?? vendorNameFromId(vendorId),
        vendor_id: vendorId,
        device_id: deviceId,
        uuid: null,
        driver_version: normalizeString(row.DriverVersion),
        pci_bus_id: null,
        memory_total_mib: null,
        adapter_ram_mib: bytesToMib(row.AdapterRAM),
        pnp_device_id: pnpDeviceId,
        sources: ['windows-cim'],
      };
    })
    .filter((device) => device.name);
}

export function parseLinuxLspci(output) {
  const displayController =
    /^(\S+)\s+(?:VGA compatible controller|3D controller|Display controller)\s+\[[0-9A-F]{4}\]:\s+(.+?)\s+\[([0-9A-F]{4}):([0-9A-F]{4})\](?:\s+\(rev [^)]+\))?$/iu;

  return String(output)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const match = line.match(displayController);
      if (!match) return null;
      const [, pciBusId, name, vendorId, deviceId] = match;
      return {
        index,
        name,
        vendor: vendorNameFromId(vendorId),
        vendor_id: vendorId.toLowerCase(),
        device_id: deviceId.toLowerCase(),
        uuid: null,
        driver_version: null,
        pci_bus_id: pciBusId,
        memory_total_mib: null,
        adapter_ram_mib: null,
        pnp_device_id: null,
        sources: ['linux-lspci'],
      };
    })
    .filter(Boolean);
}

export function parseMacSystemProfilerJson(output) {
  const parsed = JSON.parse(String(output).trim());
  const rows = Array.isArray(parsed?.SPDisplaysDataType) ? parsed.SPDisplaysDataType : [];

  return rows
    .map((row, index) => {
      const vendorText =
        normalizeString(row.spdisplays_vendor) ?? normalizeString(row.sppci_vendor);
      const vendorId = matchHexId(vendorText, /0x([0-9A-F]{4})/iu);
      const deviceId = matchHexId(
        normalizeString(row['spdisplays_device-id']),
        /0x([0-9A-F]{4})/iu
      );
      return {
        index,
        name: normalizeString(row.spdisplays_chipset_model) ?? normalizeString(row._name),
        vendor: vendorNameFromId(vendorId) ?? vendorText,
        vendor_id: vendorId,
        device_id: deviceId,
        uuid: null,
        driver_version: null,
        pci_bus_id: null,
        memory_total_mib: parseMemoryMib(row.spdisplays_vram),
        adapter_ram_mib: parseMemoryMib(row.spdisplays_vram_shared),
        pnp_device_id: null,
        sources: ['macos-system-profiler'],
      };
    })
    .filter((device) => device.name);
}

export function mergeHostGpuDevices(providerResults) {
  const merged = [];

  for (const provider of providerResults) {
    const usedTargets = new Set();
    for (const rawDevice of provider.devices) {
      const incoming = normalizeHostGpuDevice(rawDevice, provider.name);
      if (!incoming) continue;

      let targetIndex = merged.findIndex(
        (candidate, index) =>
          !usedTargets.has(index) && hasMatchingStrongIdentity(candidate, incoming)
      );
      if (targetIndex < 0) {
        targetIndex = merged.findIndex(
          (candidate, index) =>
            !usedTargets.has(index) &&
            normalizeDeviceName(candidate.name) === normalizeDeviceName(incoming.name)
        );
      }

      if (targetIndex < 0) {
        merged.push(incoming);
        usedTargets.add(merged.length - 1);
      } else {
        merged[targetIndex] = mergeHostGpuDevice(merged[targetIndex], incoming);
        usedTargets.add(targetIndex);
      }
    }
  }

  return merged
    .sort((left, right) => {
      const byName = left.name.localeCompare(right.name);
      if (byName !== 0) return byName;
      return hostDeviceIdentity(left).localeCompare(hostDeviceIdentity(right));
    })
    .map((device, index) => ({ ...device, index }));
}

export function detectHostGpuInventory({
  execFile = execFileSync,
  platform = process.platform,
} = {}) {
  const providerSpecs = [
    {
      name: 'nvidia-smi',
      command: 'nvidia-smi',
      args: NVIDIA_SMI_QUERY,
      parse: parseNvidiaSmiCsv,
    },
    ...(PLATFORM_PROVIDER[platform] ? [PLATFORM_PROVIDER[platform]] : []),
  ];
  const providerResults = providerSpecs.map((provider) => runHostGpuProvider(execFile, provider));
  const devices = mergeHostGpuDevices(providerResults);
  const availableProviders = providerResults.filter((provider) => provider.devices.length > 0);
  const source =
    availableProviders.length === 0
      ? 'unavailable'
      : availableProviders.length === 1
        ? availableProviders[0].name
        : 'multi-provider';

  return {
    schema_version: 'holoscript.host-gpu-inventory.v2',
    source,
    platform,
    scope: 'host-inventory',
    webgpu_adapter_selection_proven: false,
    providers: providerResults.map(({ name, status, device_count, reason }) => ({
      name,
      status,
      device_count,
      ...(reason ? { reason } : {}),
    })),
    devices,
    ...(devices.length === 0
      ? { reason: 'No host GPU provider returned a parseable physical device.' }
      : {}),
  };
}

function runHostGpuProvider(execFile, provider) {
  try {
    const output = execFile(provider.command, provider.args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
      windowsHide: true,
    });
    const devices = provider.parse(output);
    return {
      name: provider.name,
      status: devices.length > 0 ? 'available' : 'empty',
      device_count: devices.length,
      devices,
      ...(devices.length === 0
        ? { reason: 'Provider returned no parseable physical devices.' }
        : {}),
    };
  } catch {
    return {
      name: provider.name,
      status: 'unavailable',
      device_count: 0,
      devices: [],
      reason: 'Provider command was unavailable, failed, or returned invalid output.',
    };
  }
}

function matchHexId(value, pattern) {
  const match = normalizeString(value)?.match(pattern);
  return match ? match[1].toLowerCase() : null;
}

function vendorNameFromId(vendorId) {
  const names = {
    1002: 'AMD',
    '106b': 'Apple',
    '10de': 'NVIDIA',
    8086: 'Intel',
  };
  return names[normalizeString(vendorId)?.toLowerCase()] ?? null;
}

function bytesToMib(value) {
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes > 0 ? Math.round(bytes / 1024 / 1024) : null;
}

function parseMemoryMib(value) {
  const text = normalizeString(value);
  if (!text) return null;
  const match = text.match(/([\d.]+)\s*(GB|MB)/iu);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * (match[2].toUpperCase() === 'GB' ? 1024 : 1));
}

function normalizeHostGpuDevice(device, providerName) {
  const name = normalizeString(device?.name);
  if (!name) return null;
  const sources = [...(Array.isArray(device.sources) ? device.sources : []), providerName]
    .map((source) => normalizeString(source))
    .filter(Boolean);

  return {
    index: normalizeNonnegativeInteger(device.index) ?? 0,
    name,
    vendor: normalizeString(device.vendor),
    vendor_id: normalizeHexId(device.vendor_id),
    device_id: normalizeHexId(device.device_id),
    uuid: normalizeString(device.uuid),
    driver_version: normalizeString(device.driver_version),
    pci_bus_id: normalizeString(device.pci_bus_id),
    memory_total_mib: normalizeNonnegativeInteger(device.memory_total_mib),
    adapter_ram_mib: normalizeNonnegativeInteger(device.adapter_ram_mib),
    pnp_device_id: normalizeString(device.pnp_device_id),
    sources: [...new Set(sources)].sort(),
  };
}

function mergeHostGpuDevice(existing, incoming) {
  const merged = { ...existing };
  for (const field of [
    'vendor',
    'vendor_id',
    'device_id',
    'uuid',
    'driver_version',
    'pci_bus_id',
    'memory_total_mib',
    'adapter_ram_mib',
    'pnp_device_id',
  ]) {
    merged[field] ??= incoming[field];
  }
  merged.sources = [...new Set([...existing.sources, ...incoming.sources])].sort();
  return merged;
}

function hasMatchingStrongIdentity(left, right) {
  if (left.uuid && right.uuid && left.uuid === right.uuid) return true;
  if (
    left.pnp_device_id &&
    right.pnp_device_id &&
    left.pnp_device_id.toLowerCase() === right.pnp_device_id.toLowerCase()
  ) {
    return true;
  }
  const leftPci = normalizePciIdentity(left.pci_bus_id);
  const rightPci = normalizePciIdentity(right.pci_bus_id);
  return Boolean(leftPci && rightPci && leftPci === rightPci);
}

function normalizePciIdentity(value) {
  return (
    normalizeString(value)
      ?.toLowerCase()
      .match(/([0-9a-f]{2}:[0-9a-f]{2}\.[0-7])$/u)?.[1] ?? null
  );
}

function normalizeDeviceName(value) {
  return String(value).trim().toLowerCase().replace(/\s+/gu, ' ');
}

function hostDeviceIdentity(device) {
  return (
    device.uuid ??
    normalizePciIdentity(device.pci_bus_id) ??
    device.pnp_device_id ??
    `${device.vendor_id ?? ''}:${device.device_id ?? ''}:${normalizeDeviceName(device.name)}`
  );
}

function normalizeHexId(value) {
  const normalized = normalizeString(value)?.replace(/^0x/iu, '').toLowerCase();
  return normalized && /^[0-9a-f]{4,8}$/u.test(normalized) ? normalized : null;
}

function normalizeNonnegativeInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

export function normalizeBrowserGpuInfo(gpu) {
  if (!gpu || typeof gpu !== 'object') return null;

  const devices = Array.isArray(gpu.devices)
    ? gpu.devices.map((device) => ({
        vendor_id: normalizeInteger(device?.vendorId),
        device_id: normalizeInteger(device?.deviceId),
        sub_sys_id: normalizeInteger(device?.subSysId),
        revision: normalizeInteger(device?.revision),
        vendor: normalizeString(device?.vendorString),
        device: normalizeString(device?.deviceString),
        driver_vendor: normalizeString(device?.driverVendor),
        driver_version: normalizeString(device?.driverVersion),
      }))
    : [];

  const aux = gpu.auxAttributes && typeof gpu.auxAttributes === 'object' ? gpu.auxAttributes : {};
  const auxAttributes = compactObject({
    gl_renderer: normalizeString(aux.glRenderer),
    gl_vendor: normalizeString(aux.glVendor),
    display_type: normalizeString(aux.displayType),
    direct_rendering_version: normalizeString(aux.directRenderingVersion),
    passthrough_cmd_decoder: normalizeScalar(aux.passthroughCmdDecoder),
    sandboxed: normalizeScalar(aux.sandboxed),
    in_process_gpu: normalizeScalar(aux.inProcessGpu),
  });

  const featureStatus =
    gpu.featureStatus && typeof gpu.featureStatus === 'object'
      ? Object.fromEntries(
          Object.entries(gpu.featureStatus)
            .filter(([, value]) => typeof value === 'string')
            .sort(([left], [right]) => left.localeCompare(right))
        )
      : {};

  return {
    schema_version: 'holoscript.chromium-gpu-info.v1',
    source: 'chromium-cdp-system-info',
    scope: 'chromium-gpu-process',
    webgpu_adapter_selection_proven: false,
    devices,
    aux_attributes: auxAttributes,
    feature_status: featureStatus,
    driver_bug_workarounds: Array.isArray(gpu.driverBugWorkarounds)
      ? gpu.driverBugWorkarounds.filter((value) => typeof value === 'string').sort()
      : [],
  };
}

export function buildGpuIdentityNotes(adapterInfo, browserGpuInfo, hostGpuInventory) {
  const notes = [];
  if (!hasUsableAdapterInfo(adapterInfo)) {
    notes.push(
      'WebGPU adapter_info was empty. browser_gpu_info binds the Chromium GPU process and ' +
        'host_gpu_inventory independently binds visible host hardware; neither field alone ' +
        'proves which physical device WebGPU selected.'
    );
  }
  if (browserGpuInfo === null) {
    notes.push('Chromium CDP GPU identity was unavailable for this capture.');
  }
  if (!Array.isArray(hostGpuInventory?.devices) || hostGpuInventory.devices.length === 0) {
    notes.push('Host GPU inventory was unavailable for this capture.');
  }
  return notes;
}

function hasUsableAdapterInfo(adapterInfo) {
  if (!adapterInfo || typeof adapterInfo !== 'object') return false;
  return ['vendor', 'architecture', 'device', 'description'].some(
    (key) => typeof adapterInfo[key] === 'string' && adapterInfo[key].trim().length > 0
  );
}

function normalizeInteger(value) {
  return Number.isInteger(value) ? value : null;
}

function normalizeString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeScalar(value) {
  return typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number'
    ? value
    : null;
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null));
}
