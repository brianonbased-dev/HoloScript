import { execFileSync } from 'node:child_process';

const NVIDIA_SMI_QUERY = [
  '--query-gpu=index,name,uuid,driver_version,pci.bus_id,memory.total',
  '--format=csv,noheader,nounits',
];

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
      uuid,
      driver_version: driverVersion,
      pci_bus_id: pciBusId,
      memory_total_mib: Number.parseInt(memoryTotalMib, 10),
    }))
    .filter(
      (device) =>
        Number.isInteger(device.index) &&
        device.name.length > 0 &&
        device.uuid.length > 0 &&
        Number.isInteger(device.memory_total_mib)
    );
}

export function detectHostGpuInventory({
  execFile = execFileSync,
  platform = process.platform,
} = {}) {
  try {
    const output = execFile('nvidia-smi', NVIDIA_SMI_QUERY, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
      windowsHide: true,
    });
    const devices = parseNvidiaSmiCsv(output);
    if (devices.length > 0) {
      return {
        schema_version: 'holoscript.host-gpu-inventory.v1',
        source: 'nvidia-smi',
        platform,
        scope: 'host-inventory',
        webgpu_adapter_selection_proven: false,
        devices,
      };
    }
  } catch {
    // Missing or unsupported vendor tooling is a normal cross-platform case.
  }

  return {
    schema_version: 'holoscript.host-gpu-inventory.v1',
    source: 'unavailable',
    platform,
    scope: 'host-inventory',
    webgpu_adapter_selection_proven: false,
    devices: [],
    reason: 'nvidia-smi unavailable, failed, or returned no parseable devices',
  };
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
