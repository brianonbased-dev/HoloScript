#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCHEMA_VERSION = 'hololand.holoshell.network-reality.v0.1.0';
const HOLOSCRIPT_CONTRACT_PACKAGE = '@holoscript/framework';
const HOLOSCRIPT_CONTRACT_EXPORTS = [
  'HOLOWEB_NETWORK_REALITY_SCHEMA_VERSION',
  'validateHoloWebNetworkRealitySnapshot',
];
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'network-reality.json');
const DEFAULT_AGENT_LANES = path.join('.tmp', 'holoshell', 'agent-lanes.json');
const DEFAULT_PROCESS_HEALTH = path.join('.tmp', 'holoshell', 'process-health.json');
const DEFAULT_RUN_REGISTRY = path.join('.tmp', 'holoshell', 'run-registry.json');
const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

const OWNER_DECLARATION_VALUES = new Set([
  'auto',
  'phone_hotspot',
  'metered',
  'unmetered',
  'unknown',
]);

const VPN_HINTS = [
  'vpn',
  'wireguard',
  'tailscale',
  'zerotier',
  'nordvpn',
  'openvpn',
  'tap',
  'tun',
  'proton',
  'mullvad',
];

const AGENT_PROCESS_HINTS = [
  'codex',
  'claude',
  'cursor',
  'code',
  'copilot',
  'antigravity',
  'gemini',
  'node',
  'python',
  'powershell',
  'pwsh',
  'ollama',
];

const BROWSER_HINTS = [
  'chrome',
  'msedge',
  'firefox',
  'brave',
];

function parseArgs(argv) {
  const args = {
    json: false,
    selfTest: false,
    output: DEFAULT_OUTPUT,
    agentLanes: DEFAULT_AGENT_LANES,
    processHealth: DEFAULT_PROCESS_HEALTH,
    runRegistry: DEFAULT_RUN_REGISTRY,
    ownerDeclaredKind: process.env.HOLOSHELL_OWNER_NETWORK_KIND || 'auto',
    ownerDeclaredSource: process.env.HOLOSHELL_OWNER_NETWORK_KIND ? 'env' : 'none',
    includeIdentifiers: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--agent-lanes') args.agentLanes = argv[++index];
    else if (arg === '--process-health') args.processHealth = argv[++index];
    else if (arg === '--run-registry') args.runRegistry = argv[++index];
    else if (arg === '--owner-declared-kind') {
      args.ownerDeclaredKind = argv[++index];
      args.ownerDeclaredSource = 'cli';
    } else if (arg === '--include-identifiers') {
      args.includeIdentifiers = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!OWNER_DECLARATION_VALUES.has(args.ownerDeclaredKind)) {
    throw new Error(`--owner-declared-kind must be one of: ${Array.from(OWNER_DECLARATION_VALUES).join(', ')}`);
  }

  return args;
}

function printHelp() {
  console.log(`HoloShell network reality adapter

Usage:
  node scripts/holoshell-network-reality.mjs [options]

Options:
  --json                          Print network reality JSON.
  --output <path>                 Write output path. Defaults to .tmp/holoshell/network-reality.json.
  --agent-lanes <path>            Read agent lane manifest. Defaults to .tmp/holoshell/agent-lanes.json.
  --process-health <path>         Read process health manifest. Defaults to .tmp/holoshell/process-health.json.
  --run-registry <path>           Read run registry. Defaults to .tmp/holoshell/run-registry.json.
  --owner-declared-kind <kind>    auto, phone_hotspot, metered, unmetered, or unknown.
  --include-identifiers           Include adapter/interface names. SSID, BSSID, IP, gateway, and remote endpoints stay redacted.
  --self-test                     Assert schema, HoloScript contract validation, classification, redaction, and policy invariants.
  -h, --help                      Show this help.
`);
}

async function loadHoloScriptContract() {
  try {
    const contract = await import(HOLOSCRIPT_CONTRACT_PACKAGE);
    const missingExports = HOLOSCRIPT_CONTRACT_EXPORTS.filter((name) => !(name in contract));
    if (missingExports.length) {
      return {
        available: false,
        sourcePackage: HOLOSCRIPT_CONTRACT_PACKAGE,
        errors: [`Missing exports: ${missingExports.join(', ')}`],
      };
    }

    if (typeof contract.validateHoloWebNetworkRealitySnapshot !== 'function') {
      return {
        available: false,
        sourcePackage: HOLOSCRIPT_CONTRACT_PACKAGE,
        errors: ['validateHoloWebNetworkRealitySnapshot is not callable.'],
      };
    }

    return {
      available: true,
      sourcePackage: HOLOSCRIPT_CONTRACT_PACKAGE,
      schemaVersion: contract.HOLOWEB_NETWORK_REALITY_SCHEMA_VERSION,
      validateSnapshot: contract.validateHoloWebNetworkRealitySnapshot,
    };
  } catch (error) {
    return {
      available: false,
      sourcePackage: HOLOSCRIPT_CONTRACT_PACKAGE,
      errors: [error?.message || String(error)],
    };
  }
}

function createContractReceipt(contract, manifest) {
  if (!contract.available) {
    return {
      sourcePackage: contract.sourcePackage,
      validationStatus: 'unavailable',
      checkedAt: new Date().toISOString(),
      expectedSchemaVersion: SCHEMA_VERSION,
      schemaVersion: null,
      errorCount: contract.errors.length,
      errors: contract.errors,
    };
  }

  const schemaVersionMismatch = contract.schemaVersion !== SCHEMA_VERSION
    ? [`Upstream schema version ${contract.schemaVersion} does not match adapter schema version ${SCHEMA_VERSION}.`]
    : [];
  const validationErrors = contract.validateSnapshot(manifest);
  const errors = [...schemaVersionMismatch, ...validationErrors];

  return {
    sourcePackage: contract.sourcePackage,
    validationStatus: errors.length ? 'fail' : 'pass',
    checkedAt: new Date().toISOString(),
    expectedSchemaVersion: SCHEMA_VERSION,
    schemaVersion: contract.schemaVersion,
    errorCount: errors.length,
    errors: errors.slice(0, 16),
  };
}

async function attachHoloScriptContractReceipt(manifest) {
  const contract = await loadHoloScriptContract();
  const receipt = createContractReceipt(contract, manifest);
  manifest.schemaContract = receipt;
  return receipt;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    timeout: options.timeoutMs || 15000,
    windowsHide: true,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error?.message,
  };
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath, fallback = null) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch (error) {
    return {
      schemaVersion: 'hololand.holoshell.read-error.v0.1.0',
      generatedAt: new Date().toISOString(),
      path: resolved,
      error: error.message,
    };
  }
}

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function parsePowershellJson(text, fallback = null) {
  if (!text) return fallback;
  try {
    return JSON.parse(text.trim());
  } catch {}

  const firstObject = text.indexOf('{');
  const lastObject = text.lastIndexOf('}');
  if (firstObject !== -1 && lastObject > firstObject) {
    try {
      return JSON.parse(text.slice(firstObject, lastObject + 1));
    } catch {}
  }

  const firstArray = text.indexOf('[');
  const lastArray = text.lastIndexOf(']');
  if (firstArray !== -1 && lastArray > firstArray) {
    try {
      return JSON.parse(text.slice(firstArray, lastArray + 1));
    } catch {}
  }

  return fallback;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function readWinRtConnectionCost() {
  if (process.platform !== 'win32') {
    return {
      source: 'winrt',
      available: false,
      error: 'WinRT connection cost is only available on Windows.',
    };
  }

  const script = `
[Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime] | Out-Null
$profile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
if ($null -eq $profile) {
  [PSCustomObject]@{
    available = $false
    connectivity = "NoProfile"
    networkCostType = "Unknown"
    roaming = $false
    overDataLimit = $false
    approachingDataLimit = $false
    isWlan = $false
    isWwan = $false
  } | ConvertTo-Json -Compress
} else {
  $cost = $profile.GetConnectionCost()
  [PSCustomObject]@{
    available = $true
    connectivity = $profile.GetNetworkConnectivityLevel().ToString()
    networkCostType = $cost.NetworkCostType.ToString()
    roaming = [bool]$cost.Roaming
    overDataLimit = [bool]$cost.OverDataLimit
    approachingDataLimit = [bool]$cost.ApproachingDataLimit
    isWlan = [bool]$profile.IsWlanConnectionProfile
    isWwan = [bool]$profile.IsWwanConnectionProfile
  } | ConvertTo-Json -Compress
}
`;

  const result = run('powershell.exe', ['-NoProfile', '-Command', script], { timeoutMs: 12000 });
  const parsed = parsePowershellJson(result.stdout, null);
  if (!result.ok || !parsed) {
    return {
      source: 'winrt',
      available: false,
      error: result.error || result.stderr.trim() || 'WinRT query failed.',
    };
  }

  return {
    source: 'winrt',
    available: Boolean(parsed.available),
    connectivity: parsed.connectivity || 'Unknown',
    networkCostType: parsed.networkCostType || 'Unknown',
    roaming: Boolean(parsed.roaming),
    overDataLimit: Boolean(parsed.overDataLimit),
    approachingDataLimit: Boolean(parsed.approachingDataLimit),
    isWlan: Boolean(parsed.isWlan),
    isWwan: Boolean(parsed.isWwan),
  };
}

function readWifiEvidence(includeIdentifiers) {
  if (process.platform !== 'win32') {
    return {
      source: 'netsh',
      available: false,
      connected: false,
      error: 'netsh Wi-Fi interface scan is only available on Windows.',
    };
  }

  const result = run('netsh.exe', ['wlan', 'show', 'interfaces'], { timeoutMs: 12000 });
  if (!result.ok) {
    return {
      source: 'netsh',
      available: false,
      connected: false,
      error: result.error || result.stderr.trim() || 'netsh query failed.',
    };
  }

  const lines = result.stdout.split(/\r?\n/);
  const lookup = new Map();
  for (const line of lines) {
    const match = line.match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/);
    if (match) lookup.set(match[1].trim().toLowerCase(), match[2].trim());
  }

  const state = lookup.get('state') || 'unknown';
  const signalText = lookup.get('signal') || '';
  const signal = Number(signalText.replace('%', '').trim());
  const channel = Number(lookup.get('channel') || NaN);

  return {
    source: 'netsh',
    available: true,
    connected: /connected/i.test(state),
    state: state.toLowerCase(),
    signalPercent: Number.isFinite(signal) ? signal : null,
    radioType: lookup.get('radio type') || null,
    channel: Number.isFinite(channel) ? channel : null,
    authentication: lookup.get('authentication') || null,
    receiveRateMbps: Number(lookup.get('receive rate (mbps)') || NaN) || null,
    transmitRateMbps: Number(lookup.get('transmit rate (mbps)') || NaN) || null,
    identifiers: includeIdentifiers
      ? {
          interfaceNameHash: stableHash(lookup.get('name') || ''),
          ssidRedacted: true,
          bssidRedacted: true,
        }
      : {
          ssidRedacted: true,
          bssidRedacted: true,
        },
  };
}

function readAdapterEvidence(includeIdentifiers) {
  if (process.platform !== 'win32') {
    return {
      source: 'Get-NetAdapter',
      available: false,
      adapters: [],
      vpnState: 'unknown',
      error: 'Get-NetAdapter is only available on Windows.',
    };
  }

  const script = `
Get-NetAdapter | Select-Object Name,InterfaceDescription,Status,MacAddress,LinkSpeed | ConvertTo-Json -Compress
`;
  const result = run('powershell.exe', ['-NoProfile', '-Command', script], { timeoutMs: 12000 });
  const parsed = asArray(parsePowershellJson(result.stdout, []));
  if (!result.ok) {
    return {
      source: 'Get-NetAdapter',
      available: false,
      adapters: [],
      vpnState: 'unknown',
      error: result.error || result.stderr.trim() || 'Get-NetAdapter query failed.',
    };
  }

  const adapters = parsed.map((adapter) => {
    const rawName = String(adapter.Name || '');
    const rawDescription = String(adapter.InterfaceDescription || '');
    const searchable = `${rawName} ${rawDescription}`.toLowerCase();
    const vpnLike = VPN_HINTS.some((hint) => searchable.includes(hint));
    const status = String(adapter.Status || 'Unknown');
    return {
      adapterHash: stableHash(`${rawName}|${rawDescription}`),
      status,
      linkSpeed: adapter.LinkSpeed || null,
      vpnLike,
      category: vpnLike ? 'vpn_overlay' : /wi-?fi|wireless|wlan/i.test(searchable) ? 'wifi' : 'network_adapter',
      ...(includeIdentifiers ? { displayName: rawName, description: rawDescription } : {}),
    };
  });

  const activeVpnCount = adapters.filter((adapter) => adapter.vpnLike && /up/i.test(adapter.status)).length;
  const configuredVpnCount = adapters.filter((adapter) => adapter.vpnLike).length;

  return {
    source: 'Get-NetAdapter',
    available: true,
    adapterCount: adapters.length,
    activeVpnCount,
    configuredVpnCount,
    vpnState: activeVpnCount > 0 ? 'active' : configuredVpnCount > 0 ? 'inactive' : 'not_detected',
    adapters,
  };
}

function classifyProcessName(processName) {
  const name = String(processName || '').toLowerCase();
  if (!name) return 'unknown';
  if (AGENT_PROCESS_HINTS.some((hint) => name.includes(hint))) return 'agent_or_shell';
  if (BROWSER_HINTS.some((hint) => name.includes(hint))) return 'browser';
  if (['svchost', 'system', 'lsass', 'services', 'spoolsv'].some((hint) => name.includes(hint))) return 'system_service';
  return 'legacy_app';
}

function readNetworkConsumers() {
  if (process.platform !== 'win32') {
    return {
      source: 'Get-NetTCPConnection',
      available: false,
      consumers: [],
      error: 'Get-NetTCPConnection is only available on Windows.',
    };
  }

  const script = `
$connections = Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue |
  Group-Object -Property OwningProcess |
  ForEach-Object {
    $pidValue = [int]$_.Name
    $processName = $null
    try { $processName = (Get-Process -Id $pidValue -ErrorAction Stop).ProcessName } catch {}
    [PSCustomObject]@{
      pid = $pidValue
      processName = $processName
      connectionCount = $_.Count
    }
  } |
  Sort-Object -Property connectionCount -Descending |
  Select-Object -First 32
$connections | ConvertTo-Json -Compress
`;
  const result = run('powershell.exe', ['-NoProfile', '-Command', script], { timeoutMs: 15000 });
  const parsed = asArray(parsePowershellJson(result.stdout, []));
  if (!result.ok) {
    return {
      source: 'Get-NetTCPConnection',
      available: false,
      consumers: [],
      error: result.error || result.stderr.trim() || 'Get-NetTCPConnection query failed.',
    };
  }

  const consumers = parsed
    .filter((consumer) => consumer && Number.isFinite(Number(consumer.pid)))
    .map((consumer) => ({
      pid: Number(consumer.pid),
      pidHash: stableHash(consumer.pid),
      processName: consumer.processName || 'unknown',
      processKind: classifyProcessName(consumer.processName),
      establishedConnectionCount: Number(consumer.connectionCount) || 0,
      endpointDetailsRedacted: true,
    }));

  return {
    source: 'Get-NetTCPConnection',
    available: true,
    consumerCount: consumers.length,
    establishedConnectionCount: consumers.reduce((sum, consumer) => sum + consumer.establishedConnectionCount, 0),
    consumers,
  };
}

function normalizeOwnerDeclaration(kind) {
  if (kind === 'auto') return 'none';
  return kind || 'unknown';
}

function classifyUnderlay({ ownerDeclaredKind, cost, wifi, adapters }) {
  const ownerKind = normalizeOwnerDeclaration(ownerDeclaredKind);
  const connectivity = cost?.connectivity || 'Unknown';
  const costType = cost?.networkCostType || 'Unknown';
  const signal = wifi?.signalPercent;
  const vpnState = adapters?.vpnState || 'unknown';

  const evidence = [];

  if (connectivity === 'NoProfile' || connectivity === 'None' || connectivity === 'NoInternetAccess') {
    evidence.push('os_connectivity_offline');
    return { classification: 'offline', confidence: cost?.available ? 'os_reported' : 'low', evidence };
  }

  if (connectivity && connectivity !== 'Unknown' && connectivity !== 'InternetAccess') {
    evidence.push(`os_connectivity_${connectivity}`);
    return { classification: 'degraded_link', confidence: 'os_reported', evidence };
  }

  if (Number.isFinite(signal) && signal > 0 && signal < 40) {
    evidence.push(`wifi_signal_${signal}`);
    return { classification: 'degraded_link', confidence: 'os_reported', evidence };
  }

  if (ownerKind === 'phone_hotspot' || ownerKind === 'metered') {
    evidence.push(`owner_declared_${ownerKind}`);
    return { classification: 'metered_or_hotspot', confidence: 'owner_declared', evidence };
  }

  if (costType === 'Fixed' || costType === 'Variable' || cost?.roaming || cost?.overDataLimit || cost?.approachingDataLimit) {
    evidence.push(`os_cost_${costType}`);
    return { classification: 'metered_or_hotspot', confidence: 'os_reported', evidence };
  }

  if (vpnState === 'active') {
    evidence.push('vpn_overlay_active');
    return { classification: 'vpn_overlay', confidence: 'os_reported', evidence };
  }

  if (ownerKind === 'unmetered' && costType === 'Unrestricted') {
    evidence.push('owner_and_os_unmetered');
    return { classification: 'normal_unmetered', confidence: 'owner_declared', evidence };
  }

  if (costType === 'Unrestricted' && (wifi?.connected || cost?.isWlan || cost?.isWwan === false)) {
    evidence.push('os_cost_unrestricted');
    return { classification: 'normal_unmetered', confidence: 'os_reported', evidence };
  }

  evidence.push('insufficient_underlay_evidence');
  return { classification: 'unknown_protective', confidence: 'low', evidence };
}

function policyForClassification(classification) {
  if (classification === 'offline') {
    return {
      bandwidthPosture: 'offline_queue',
      heavyWorkPolicy: 'queue_remote_sync',
      agentAction: 'queue_network_work_until_online',
      brittneyStance: 'explain_offline_and_preserve_work',
      allowedWithoutOwnerGesture: ['local_read', 'local_write_receipt', 'offline_queue'],
      requiresOwnerGesture: ['remote_sync', 'package_install', 'model_download', 'large_upload'],
    };
  }

  if (classification === 'metered_or_hotspot') {
    return {
      bandwidthPosture: 'protect_mobile_data',
      heavyWorkPolicy: 'queue_or_ask_before_heavy_transfer',
      agentAction: 'throttle_downloads_and_uploads',
      brittneyStance: 'protect_bandwidth',
      allowedWithoutOwnerGesture: ['local_read', 'local_build_if_inputs_cached', 'small_receipt_sync'],
      requiresOwnerGesture: ['package_install', 'model_download', 'large_upload', 'video_stream', 'fleet_sync'],
    };
  }

  if (classification === 'degraded_link') {
    return {
      bandwidthPosture: 'throttle_for_stability',
      heavyWorkPolicy: 'prefer_local_and_retry_remote_later',
      agentAction: 'defer_noncritical_network_work',
      brittneyStance: 'keep_working_locally_and_warn',
      allowedWithoutOwnerGesture: ['local_read', 'local_build_if_inputs_cached', 'small_receipt_sync'],
      requiresOwnerGesture: ['large_upload', 'parallel_downloads', 'dev_server_public_tunnel'],
    };
  }

  if (classification === 'vpn_overlay') {
    return {
      bandwidthPosture: 'route_aware',
      heavyWorkPolicy: 'allowed_with_route_receipt',
      agentAction: 'record_overlay_route_context',
      brittneyStance: 'explain_privacy_route',
      allowedWithoutOwnerGesture: ['normal_network_work', 'small_receipt_sync'],
      requiresOwnerGesture: ['privacy_sensitive_login', 'turn_off_vpn', 'change_route'],
    };
  }

  if (classification === 'normal_unmetered') {
    return {
      bandwidthPosture: 'normal',
      heavyWorkPolicy: 'allowed_with_receipts',
      agentAction: 'run_normal_network_work',
      brittneyStance: 'normal_operator',
      allowedWithoutOwnerGesture: ['normal_network_work', 'package_install', 'build_cache_fetch', 'small_receipt_sync'],
      requiresOwnerGesture: ['destructive_network_change', 'vpn_route_change'],
    };
  }

  return {
    bandwidthPosture: 'protective_unknown',
    heavyWorkPolicy: 'ask_before_heavy_transfer',
    agentAction: 'default_to_bandwidth_protection',
    brittneyStance: 'ask_before_spending_bandwidth',
    allowedWithoutOwnerGesture: ['local_read', 'local_receipt'],
    requiresOwnerGesture: ['package_install', 'model_download', 'large_upload', 'parallel_agent_network_work'],
  };
}

function joinPeerEvidence({ lanes, processHealth, runRegistry, consumers }) {
  const activeLaneCount = lanes?.summary?.activeLaneCount || 0;
  const laneCount = lanes?.summary?.laneCount || lanes?.lanes?.length || 0;
  const registeredRuns = Array.isArray(runRegistry?.runs) ? runRegistry.runs : [];
  const activeRuns = registeredRuns.filter((run) => !['completed', 'failed', 'blocked', 'stale'].includes(String(run.status || '').toLowerCase()));
  const agentConsumerCount = consumers.consumers.filter((consumer) => consumer.processKind === 'agent_or_shell').length;
  const legacyConsumerCount = consumers.consumers.filter((consumer) => consumer.processKind === 'legacy_app' || consumer.processKind === 'browser').length;

  return {
    activeLaneCount,
    laneCount,
    semanticIdentityRequired: true,
    processCountIsNotPeerCount: true,
    processHealthRisk: processHealth?.summary?.riskState || 'unknown',
    registeredRunCount: registeredRuns.length,
    activeRegisteredRunCount: activeRuns.length,
    networkConsumerCount: consumers.consumerCount || consumers.consumers.length,
    agentOrShellNetworkConsumerCount: agentConsumerCount,
    legacyNetworkConsumerCount: legacyConsumerCount,
    topConsumers: consumers.consumers.slice(0, 12),
  };
}

function createManifest(args, overrides = {}) {
  const cost = overrides.cost || readWinRtConnectionCost();
  const wifi = overrides.wifi || readWifiEvidence(args.includeIdentifiers);
  const adapters = overrides.adapters || readAdapterEvidence(args.includeIdentifiers);
  const consumers = overrides.consumers || readNetworkConsumers();
  const lanes = overrides.lanes || readJson(args.agentLanes, {});
  const processHealth = overrides.processHealth || readJson(args.processHealth, {});
  const runRegistry = overrides.runRegistry || readJson(args.runRegistry, { runs: [] });
  const ownerDeclaredKind = overrides.ownerDeclaredKind || args.ownerDeclaredKind;
  const underlayClassification = classifyUnderlay({
    ownerDeclaredKind,
    cost,
    wifi,
    adapters,
  });
  const policy = policyForClassification(underlayClassification.classification);
  const peerEvidence = joinPeerEvidence({ lanes, processHealth, runRegistry, consumers });
  const receiptInput = JSON.stringify({
    classification: underlayClassification.classification,
    confidence: underlayClassification.confidence,
    cost: cost.networkCostType,
    connectivity: cost.connectivity,
    ownerDeclaredKind,
    vpnState: adapters.vpnState,
    signal: wifi.signalPercent,
    consumers: consumers.consumers?.map((consumer) => [consumer.processName, consumer.establishedConnectionCount]),
    activeLaneCount: peerEvidence.activeLaneCount,
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-network-reality.hsplus',
      adapter: 'scripts/holoshell-network-reality.mjs',
      liveFeed: 'scripts/holoshell-live-feed.mjs',
      planning: 'C:/Users/josep/.ai-ecosystem/research/2026-05-15_holoweb-local-reality-node-contract.md',
    },
    node: {
      nodeId: 'local-hardware',
      role: 'holoweb-local-reality-node',
      privacyScope: 'local_only',
    },
    underlay: {
      classification: underlayClassification.classification,
      confidence: underlayClassification.confidence,
      ownerDeclaredKind: normalizeOwnerDeclaration(ownerDeclaredKind),
      ownerDeclaredSource: args.ownerDeclaredSource,
      osInterfaceKind: cost.isWwan ? 'wwan' : cost.isWlan || wifi.connected ? 'wifi' : 'unknown',
      osCost: cost.networkCostType || 'Unknown',
      connectivity: cost.connectivity || 'Unknown',
      vpnState: adapters.vpnState || 'unknown',
      evidence: underlayClassification.evidence,
      wifi: {
        available: Boolean(wifi.available),
        connected: Boolean(wifi.connected),
        signalPercent: wifi.signalPercent ?? null,
        radioType: wifi.radioType || null,
        channel: wifi.channel ?? null,
        authentication: wifi.authentication || null,
        ssidRedacted: true,
        bssidRedacted: true,
      },
      cost: {
        available: Boolean(cost.available),
        roaming: Boolean(cost.roaming),
        overDataLimit: Boolean(cost.overDataLimit),
        approachingDataLimit: Boolean(cost.approachingDataLimit),
      },
      adapters: {
        available: Boolean(adapters.available),
        adapterCount: adapters.adapterCount || 0,
        configuredVpnCount: adapters.configuredVpnCount || 0,
        activeVpnCount: adapters.activeVpnCount || 0,
        endpointDetailsRedacted: true,
      },
    },
    health: {
      state: underlayClassification.classification === 'normal_unmetered' || underlayClassification.classification === 'vpn_overlay'
        ? 'pass'
        : underlayClassification.classification === 'offline'
          ? 'critical'
          : 'warn',
      networkConsumerCount: peerEvidence.networkConsumerCount,
      establishedConnectionCount: consumers.establishedConnectionCount || 0,
      processHealthRisk: peerEvidence.processHealthRisk,
    },
    lanes: peerEvidence,
    policy,
    brittney: {
      stance: policy.brittneyStance,
      firstMessage: firstBrittneyMessage(underlayClassification.classification),
      protectBandwidth: ['metered_or_hotspot', 'unknown_protective', 'degraded_link', 'offline'].includes(underlayClassification.classification),
      canExplainToNonDeveloper: true,
    },
    redaction: {
      rawSsidIncluded: false,
      rawBssidIncluded: false,
      ipAddressIncluded: false,
      gatewayIncluded: false,
      remoteEndpointIncluded: false,
      rawCommandLineIncluded: false,
      pidIncluded: true,
      pidHashIncluded: true,
      localOnly: true,
    },
    receipt: {
      receiptType: 'network_reality_snapshot',
      snapshotHash: stableHash(receiptInput),
      actionTaken: 'read_only_scan',
      mutationPerformed: false,
    },
  };
}

function firstBrittneyMessage(classification) {
  if (classification === 'metered_or_hotspot') return 'I will protect bandwidth before downloads, uploads, or parallel agent work.';
  if (classification === 'offline') return 'I will keep local work queued and sync when the network returns.';
  if (classification === 'degraded_link') return 'I will favor local work and slow remote calls until the link improves.';
  if (classification === 'vpn_overlay') return 'I will keep route awareness visible before privacy-sensitive work.';
  if (classification === 'normal_unmetered') return 'Network conditions are normal; I will still leave receipts for heavy work.';
  return 'Network cost is unclear, so I will ask before spending bandwidth.';
}

function writeManifest(manifest, outputPath) {
  const resolved = resolveRepoPath(outputPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return resolved;
}

function assertRedaction(manifest, failures) {
  const serialized = JSON.stringify(manifest);
  const forbiddenPatterns = [
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
    /\b[0-9a-f]{2}(?::[0-9a-f]{2}){5}\b/i,
    /remoteAddress/i,
    /gateway"\s*:/i,
    /bssid"\s*:/i,
    /ssid"\s*:\s*"(?!\[redacted\])/i,
  ];
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(serialized)) failures.push(`redaction failed pattern ${pattern}`);
  }
  if (manifest.redaction.rawSsidIncluded) failures.push('raw SSID must not be included');
  if (manifest.redaction.rawBssidIncluded) failures.push('raw BSSID must not be included');
  if (manifest.redaction.remoteEndpointIncluded) failures.push('remote endpoint must not be included');
}

function buildFixture(overrides = {}) {
  return {
    cost: {
      source: 'fixture',
      available: true,
      connectivity: 'InternetAccess',
      networkCostType: 'Unrestricted',
      roaming: false,
      overDataLimit: false,
      approachingDataLimit: false,
      isWlan: true,
      isWwan: false,
    },
    wifi: {
      source: 'fixture',
      available: true,
      connected: true,
      state: 'connected',
      signalPercent: 92,
      radioType: '802.11ac',
      channel: 149,
      authentication: 'WPA2-Personal',
    },
    adapters: {
      source: 'fixture',
      available: true,
      adapterCount: 3,
      configuredVpnCount: 1,
      activeVpnCount: 0,
      vpnState: 'inactive',
      adapters: [],
    },
    consumers: {
      source: 'fixture',
      available: true,
      consumerCount: 3,
      establishedConnectionCount: 18,
      consumers: [
        {
          pid: 101,
          pidHash: stableHash(101),
          processName: 'codex',
          processKind: 'agent_or_shell',
          establishedConnectionCount: 7,
          endpointDetailsRedacted: true,
        },
        {
          pid: 202,
          pidHash: stableHash(202),
          processName: 'chrome',
          processKind: 'browser',
          establishedConnectionCount: 6,
          endpointDetailsRedacted: true,
        },
        {
          pid: 303,
          pidHash: stableHash(303),
          processName: 'legacyapp',
          processKind: 'legacy_app',
          establishedConnectionCount: 5,
          endpointDetailsRedacted: true,
        },
      ],
    },
    lanes: {
      summary: { laneCount: 7, activeLaneCount: 3 },
      lanes: [],
    },
    processHealth: {
      summary: { riskState: 'pass' },
    },
    runRegistry: {
      runs: [{ runId: 'run_fixture', status: 'running' }],
    },
    ...overrides,
  };
}

async function assertSelfTest(args) {
  const failures = [];
  const normal = createManifest(args, buildFixture({ ownerDeclaredKind: 'auto' }));
  const hotspot = createManifest(args, buildFixture({ ownerDeclaredKind: 'phone_hotspot' }));
  const metered = createManifest(args, buildFixture({
    ownerDeclaredKind: 'auto',
    cost: {
      ...buildFixture().cost,
      networkCostType: 'Variable',
    },
  }));
  const vpn = createManifest(args, buildFixture({
    ownerDeclaredKind: 'auto',
    adapters: {
      ...buildFixture().adapters,
      configuredVpnCount: 1,
      activeVpnCount: 1,
      vpnState: 'active',
    },
  }));
  const degraded = createManifest(args, buildFixture({
    ownerDeclaredKind: 'auto',
    wifi: {
      ...buildFixture().wifi,
      signalPercent: 25,
    },
  }));
  const offline = createManifest(args, buildFixture({
    ownerDeclaredKind: 'auto',
    cost: {
      ...buildFixture().cost,
      connectivity: 'NoInternetAccess',
    },
  }));

  if (normal.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (normal.underlay.classification !== 'normal_unmetered') failures.push('normal fixture should classify as normal_unmetered');
  if (hotspot.underlay.classification !== 'metered_or_hotspot') failures.push('owner hotspot should classify as metered_or_hotspot');
  if (hotspot.policy.brittneyStance !== 'protect_bandwidth') failures.push('hotspot should protect bandwidth');
  if (metered.underlay.classification !== 'metered_or_hotspot') failures.push('OS metered cost should classify as metered_or_hotspot');
  if (vpn.underlay.classification !== 'vpn_overlay') failures.push('active VPN should classify as vpn_overlay');
  if (degraded.underlay.classification !== 'degraded_link') failures.push('weak signal should classify as degraded_link');
  if (offline.underlay.classification !== 'offline') failures.push('offline fixture should classify as offline');
  if (!hotspot.lanes.processCountIsNotPeerCount) failures.push('peer count must reject process count truth');
  if (hotspot.lanes.legacyNetworkConsumerCount < 1) failures.push('expected legacy network consumers');
  if (!hotspot.redaction.localOnly) failures.push('redaction scope should be local only');
  assertRedaction(hotspot, failures);

  const fixtures = { normal, hotspot, metered, vpn, degraded, offline };
  for (const [name, manifest] of Object.entries(fixtures)) {
    const receipt = await attachHoloScriptContractReceipt(manifest);
    if (receipt.validationStatus !== 'pass') {
      failures.push(`${name} fixture failed HoloScript contract validation: ${receipt.errors.join('; ')}`);
    }
  }

  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const manifest = createManifest(args);
  const contractReceipt = await attachHoloScriptContractReceipt(manifest);
  const output = writeManifest(manifest, args.output);
  if (args.selfTest) await assertSelfTest(args);

  if (args.json) {
    console.log(JSON.stringify(manifest, null, 2));
  } else {
    console.log(`HoloShell network reality: ${output}`);
    console.log(`Underlay: ${manifest.underlay.classification} (${manifest.underlay.confidence})`);
    console.log(`HoloScript contract: ${contractReceipt.validationStatus}`);
    console.log(`Policy: ${manifest.policy.heavyWorkPolicy}`);
    console.log(`Network consumers: ${manifest.health.networkConsumerCount}`);
  }
} catch (error) {
  console.error(`holoshell-network-reality failed: ${error.message}`);
  process.exit(1);
}
