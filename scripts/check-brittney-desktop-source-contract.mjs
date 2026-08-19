#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

const files = {
  source: 'apps/holoshell/source/holoshell-brittney-desktop-cockpit.hsplus',
  browserTerminalSource: 'apps/holoshell/source/holoshell-browser-terminal-coupling.hsplus',
  operatorTerminalSource: 'apps/holoshell/source/holoshell-operator-terminal.hsplus',
  terminalEventStreamSource: 'apps/holoshell/source/holoshell-terminal-event-stream.hsplus',
  visualOperatingLayerSource: 'apps/holoshell/source/holoshell-visual-operating-layer.hsplus',
  nativeWrapperSource: 'apps/holoshell/source/holoshell-native-wrapper.hsplus',
  serviceSupervisorSource: 'apps/holoshell/source/holoshell-service-supervisor.hsplus',
  sovereignRoomSource: 'apps/holoshell/source/holoshell-sovereign-room-marathon.hsplus',
  chatSource: 'apps/holoshell/source/holoshell-brittney-operator-chat.hsplus',
  launch: 'scripts/brittney-studio-launch.ps1',
  gateway: 'scripts/start-brittney.ts',
  terminal: 'scripts/holoshell-operator-terminal.mjs',
  serve: 'packages/holoshell/serve.mjs',
  compiler: 'packages/holoshell/compile.mjs',
  packageJson: 'package.json',
};

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function requireIncludes(label, text, snippets, failures) {
  for (const snippet of snippets) {
    if (!text.includes(snippet)) {
      failures.push(`${label} missing ${snippet}`);
    }
  }
}

const source = read(files.source);
const browserTerminalSource = read(files.browserTerminalSource);
const operatorTerminalSource = read(files.operatorTerminalSource);
const terminalEventStreamSource = read(files.terminalEventStreamSource);
const visualOperatingLayerSource = read(files.visualOperatingLayerSource);
const nativeWrapperSource = read(files.nativeWrapperSource);
const serviceSupervisorSource = read(files.serviceSupervisorSource);
const sovereignRoomSource = read(files.sovereignRoomSource);
const chatSource = read(files.chatSource);
const launch = read(files.launch);
const gateway = read(files.gateway);
const terminal = read(files.terminal);
const serve = read(files.serve);
const compiler = read(files.compiler);
const packageJson = read(files.packageJson);
const failures = [];

requireIncludes('desktop cockpit source', source, [
  'desktopLaunchAdapter: "scripts/brittney-studio-launch.ps1"',
  'legacyGatewayAdapter: "scripts/start-brittney.ts"',
  'laptopReceiptFreshnessAdapter: "scripts/holoshell-laptop-receipt-freshness.mjs"',
  'operatorTerminalReceipt: ".tmp/holoshell/operator-terminal.json"',
  'laptopReceiptFreshnessWatchLog: ".tmp/holoshell/laptop-receipt-freshness-watch.log"',
  'sovereignRoomMarathonReceipt: ".tmp/holoshell/sovereign-room-marathon-latest.json"',
  'browserSessionStateSchema: "hololand.holoshell.browser-session-state.v0.1.0"',
  'browserSessionStateStorageKey: "holoshell:brittney:browser-session:v1"',
  'browserChatWorkspaceIds: ["brittney", "sovereign", "holoclaw", "terminal", "improvement"]',
  'primaryHostRole: "jetson_extension_host"',
  'canonicalJetsonSurface: "http://holojetson.local:8747"',
  'browserFirstTestSurface: "GET /"',
  'browserFirstReceiptScript: "scripts/holoshell-brittney-operator-chat-browser-receipt.mjs"',
  'nativeHoloShellWrapper: "apps/holoshell/native/windows/Start-HoloShellFounderHost.ps1"',
  'nativeHoloShellWindowRole: "native_holoshell_app_window"',
  'nativeCapabilityEnvelopeSource: "HoloScript:experiments/holoshell-human-os-frontier/native-holoshell-capability-envelope.hsplus"',
  'nativeCapabilityEnvelopeSchema: "holoscript.holoshell.native-capability-envelope.v0.1.0"',
  'nativeTerminalEventStreamSource: "HoloScript:experiments/holoshell-human-os-frontier/native-terminal-event-stream.hsplus"',
  'nativeTerminalEventStreamSchema: "holoscript.holoshell.native-terminal-event-stream.v0.1.0"',
  'nativeVisualOperatingLayerSource: "HoloScript:experiments/holoshell-human-os-frontier/native-visual-operating-layer.hsplus"',
  'nativeVisualOperatingLayerSchema: "holoscript.holoshell.native-visual-operating-layer.v0.1.0"',
  'visualOperatingLayerSource: "apps/holoshell/source/holoshell-visual-operating-layer.hsplus"',
  'visualOperatingLayerEndpoint: "GET /api/visual-operating-layer"',
  'terminalEventReadCapabilityLane: "terminal_event_read"',
  'serviceSupervisorEndpoint: "GET /api/services/supervisor"',
  'serviceSupervisorTerminalCommandId: "check_system"',
  'JetsonExtensionRoute',
  'NativeHoloShellWindow',
  'VisualOperatingLayer',
  'BrowserBootstrapNativeWindowProof',
  'NativeWindowRunsHoloServicesThroughTerminal',
  'nativeCapabilityEnvelopeRequired: true',
  'upstreamTerminalEventStreamRequired: true',
  'sourceOwnedStateSchema: "hololand.holoshell.source-owned-cockpit-state.v0.1.0"',
  'sourceOwnedStateEndpoint: "GET /api/cockpit/capsule#sourceOwnedState"',
  'ChatWorkspace',
  'ParallelChatWorkspacesStayIsolated',
  'BrowserRefreshPreservesOperatorSession',
  'SourceOwnedStateBeforeProjection',
  'cockpitCapsuleReceiptSchema: "hololand.holoshell.brittney-cockpit-capsule.v0.1.0"',
  'desktopSurfaceRouteReceiptSchema: "hololand.holoshell.brittney-desktop-surface-route.v0.1.0"',
  'sovereignRoomMarathonSource: "apps/holoshell/source/holoshell-sovereign-room-marathon.hsplus"',
  'sovereignRoomMarathonStatusEndpoint: "GET /api/sovereign-room/marathon"',
  'SovereignRoomMarathonVisibleAsLocalReceipt',
  'holoclawRuntimeBridgeSource: "apps/holoshell/source/holoshell-holoclaw-runtime-bridge.hsplus"',
  'holoclawRuntimeBridgeStatusEndpoint: "GET /api/holoclaw/runtime-bridge"',
  'HoloClawRuntimeVisibleBehindConsent',
  'adapterMayOpenVisibleTerminalByDefault: false',
  'adapterMayRunLaptopReceiptFreshnessWatch: true',
  'visibleOperatorTerminalRequiresFlag: "-OperatorTerminal"',
  'hiddenReceiptRefreshDefault: true',
  'hiddenReceiptRefreshIntervalMs: 60000',
  'receiptFreshnessWatchLogWriteMode: "append_preserve_existing_evidence"',
  'legacyUiRole: "adapter_projection_only"',
  'sourceRequiredBeforeProjection: true',
  'sourceFormatGapNamedBeforeAdapterWork: true',
  'legacyUiMayNotOwnBehavior: true',
  'routeProofCommand: "pnpm run check:brittney-desktop-source-contract"',
  'receiptRequired: true',
], failures);

requireIncludes('browser-terminal source', browserTerminalSource, [
  'terminalEventStreamSource: "apps/holoshell/source/holoshell-terminal-event-stream.hsplus"',
  'upstreamTerminalEventStreamSource: "HoloScript:experiments/holoshell-human-os-frontier/native-terminal-event-stream.hsplus"',
  'terminalEventsEndpoint: "GET /api/operator-terminal/events"',
  'guardedExecuteEndpoint: "POST /api/operator-terminal/execute"',
  'approvedAdapterExecuteEndpoint: "POST /api/operator-terminal/run-approved"',
  'readOnlyAdapterExecuteEndpoint: "POST /api/operator-terminal/run-readonly"',
  'terminalRunnerAdapter: "scripts/holoshell-terminal-runner.mjs"',
  'terminalLifecycleEventsRequired: true',
  'requiredLifecycleEvents: ["run.started", "stdout.chunk", "stderr.chunk", "run.exited", "receipt.written"]',
  'endpointMayStageGuardedExecutionReceipt: true',
  'endpointMayExecuteApprovedAdapter: true',
  'endpointMayExecuteReadOnlyAdapter: true',
  'approvedAdapterRequiresFreshGuardedReceipt: true',
  'oneApprovedAdapterExecutionPerGuardedExecutionId: true',
  'selectedTaskIdRequiredForClaimLocalRoomTask: true',
  'approvedClaimTaskMustMatchGuardedReceipt: true',
  'readOnlyAdapterRequiresFreshOperatorTerminalReceipt: true',
  'GuardedTerminalExecutionStagesReceipts',
  'ApprovedTerminalAdapterExecutionConsumesReceipts',
  'ReadOnlyTerminalAdapterExecutionRunsReceipts',
  'confirmClaim_for_local_room_claim',
  '"GET /api/operator-terminal/events"',
], failures);

requireIncludes('operator-terminal source', operatorTerminalSource, [
  'jetsonLocalModelUrl: "http://holojetson.local:18080"',
  'jetsonHoloLlamaHealthUrl: "http://holojetson.local:18080/health"',
  'jetsonHoloLlamaModelsUrl: "http://holojetson.local:18080/v1/models"',
  'jetsonHoloLlamaProxyIdentity: "holo-inference-proxy/v0"',
  'expectedJetsonModelId: "/mnt/nvme/holo/models/qwen3-4b-instruct.gguf"',
  'legacyOllamaRole: "compatibility_only_not_readiness"',
  'readOnlyAdapterExecuteEndpoint: "POST /api/operator-terminal/run-readonly"',
  'readOnlyAdapterExecutionReceipt: ".tmp/holoshell/operator-terminal-readonly-execution-latest.json"',
  'ReadOnlyAdapterExecutionUsesFreshTerminalReceipt',
  'readOnlyAdapterExecutionRequiresServerAllowlist: true',
  'endpointMayExecuteReadOnlyAdapter: true',
  'object "ClaimLocalTask" using "TerminalCommand"',
  'flow: "sovereign_room_task_claim"',
  'adapter: "scripts/holoshell-sovereign-room-marathon.mjs"',
  'requiresSelectedTaskId: true',
  'taskSelectionField: "selectedTaskId"',
  'confirmClaim_for_local_room_claim',
], failures);

requireIncludes('terminal event stream source', terminalEventStreamSource, [
  'upstreamTerminalEventStreamSource: "HoloScript:experiments/holoshell-human-os-frontier/native-terminal-event-stream.hsplus"',
  'upstreamTerminalEventStreamSchema: "holoscript.holoshell.native-terminal-event-stream.v0.1.0"',
  'requiredCapabilityLane: "terminal_event_read"',
  'nativeEventKind: "artifact.detected"',
  'runnerScript: "scripts/holoshell-terminal-runner.mjs"',
  'ReadOnlyAdapterLifecycleRunner',
  'endpointExecutesReadOnlyAdapter: true',
  'UpstreamTerminalEventContractRequired',
  'eventKindsRequired: ["run.started", "stdout.chunk", "stderr.chunk", "artifact.detected", "approval.required", "run.exited", "receipt.written"]',
  'browserMayOwnExecution: false',
], failures);

requireIncludes('visual operating layer source', visualOperatingLayerSource, [
  'upstreamVisualOperatingLayerSource: "HoloScript:experiments/holoshell-human-os-frontier/native-visual-operating-layer.hsplus"',
  'upstreamVisualOperatingLayerSchema: "holoscript.holoshell.native-visual-operating-layer.v0.1.0"',
  'sourceEndpoint: "GET /api/visual-operating-layer"',
  'requiredPanels: ["service_dock", "terminal_run_timeline", "agent_utility_capsules", "hololand_node_city", "consent_command_palette"]',
  'requiredAgentFields: ["api", "capabilityLane", "permissionEnvelope", "receipt", "nextSafeAction"]',
  'VisualOperatingLayerReceipt',
  'ServiceDockCard',
  'TerminalTimelineEvent',
  'PanelsCarryAgentUtility',
  'CommandPaletteConsentBoundary',
  'browserMayOwnExecution: false',
], failures);

requireIncludes('native wrapper source', nativeWrapperSource, [
  'upstreamCapabilityEnvelopeSource: "HoloScript:experiments/holoshell-human-os-frontier/native-holoshell-capability-envelope.hsplus"',
  'upstreamCapabilityEnvelopeSchema: "holoscript.holoshell.native-capability-envelope.v0.1.0"',
  'upstreamTerminalEventStreamSource: "HoloScript:experiments/holoshell-human-os-frontier/native-terminal-event-stream.hsplus"',
  'upstreamTerminalEventStreamSchema: "holoscript.holoshell.native-terminal-event-stream.v0.1.0"',
  'upstreamVisualOperatingLayerSource: "HoloScript:experiments/holoshell-human-os-frontier/native-visual-operating-layer.hsplus"',
  'visualOperatingLayerEndpoint: "GET /api/visual-operating-layer"',
  'nativeCapabilityLanes: ["receipt_read", "terminal_event_read", "jetson_appliance_observe", "service_status", "guarded_service_ensure", "guarded_open_url", "break_glass_os_mutation"]',
  'NativeCapabilityEnvelopeSourceOfTruth',
  'terminalEventsBeforeTerminalUi: true',
  'visualOperatingLayerBeforeNativeUiClaim: true',
  'jetsonEvidenceMustStaySeparatedFromLaptopEvidence: true',
], failures);

requireIncludes('service supervisor source', serviceSupervisorSource, [
  'upstreamCapabilityEnvelopeSource: "HoloScript:experiments/holoshell-human-os-frontier/native-holoshell-capability-envelope.hsplus"',
  'upstreamTerminalEventStreamSource: "HoloScript:experiments/holoshell-human-os-frontier/native-terminal-event-stream.hsplus"',
  'requiredCapabilityForStatus: "service_status"',
  'requiredCapabilityForEnsure: "guarded_service_ensure"',
  'requiredCapabilityForEvents: "terminal_event_read"',
  'ServiceEnsureUsesNativeCapabilityEnvelope',
  'upstreamTerminalEventStreamRequired: true',
  'nativeHostOwnsServiceLifecycle: true',
], failures);

requireIncludes('sovereign room source', sovereignRoomSource, [
  'confirmClaimCliFlag: "--confirm-claim"',
  'claimTaskIdCliFlag: "--claim-task-id"',
  'requiresConfirmClaimCliFlag: true',
  'requiresExplicitClaimTaskId: true',
  'requiresClaimableOpenLocalTask: true',
  'claimConfirmationObserved',
  'claimTaskIdRequested',
  'claimBlockedReason',
], failures);

requireIncludes('operator chat source', chatSource, [
  'runtimeSurface: "Brittney Studio desktop app"',
  'chatEndpoint: "POST /api/brittney/chat"',
  'desktopBridgeEndpoint: "GET /api/desktop-control/bridge"',
  'receiptRequired: true',
], failures);

requireIncludes('desktop launcher', launch, [
  "'Brittney Studio.lnk'",
  "$JetsonSurface = 'http://holojetson.local:8747'",
  "$HoloLlamaHealth = 'http://holojetson.local:18080/health'",
  "$HoloLlamaModels = 'http://holojetson.local:18080/v1/models'",
  "$HoloLlamaProxyIdentity = 'holo-inference-proxy/v0'",
  "$ExpectedHoloLlamaModel = '/mnt/nvme/holo/models/qwen3-4b-instruct.gguf'",
  '$healthProxyValues.Count -eq 1',
  '$modelsProxyValues.Count -eq 1',
  '$handler.AllowAutoRedirect = $false',
  '[System.Net.Http.HttpCompletionOption]::ResponseHeadersRead',
  '[System.Threading.Tasks.Task]::WhenAny',
  'HoloLlama probe exceeded its wall-clock deadline',
  '$HoloLlamaMaxBodyBytes = 1048576',
  "Where-Object { $_.Name -ceq 'status' }",
  "Where-Object { $_.Name -ceq 'object' }",
  "Where-Object { $_.Name -ceq 'data' }",
  "Where-Object { $_.Name -ceq 'id' }",
  '$modelsData = $null',
  '$modelsData = $modelsDataProperties[0].Value',
  '$modelsDataIsArray = $modelsShapeOk -and $modelsData -is [System.Array]',
  '$modelIds = @()',
  '$modelEntriesHaveExactId = $false',
  '$healthResponse.ResponseUri -ceq $HoloLlamaHealth',
  '$modelsResponse.ResponseUri -ceq $HoloLlamaModels',
  'sealed proxy + NVMe0 brain OK',
  "Start-Process $JetsonSurface",
  '[switch]$OperatorTerminal',
  '$RefreshOperatorReceipt = (-not $Headless) -and (-not $NoTerminal)',
  '$ShowOperatorTerminal = $RefreshOperatorReceipt -and $OperatorTerminal',
  'Keep the paired read-only laptop receipts fresh',
  "node scripts\\holoshell-laptop-receipt-freshness.mjs --watch --interval-ms 60000 --timeout-ms 60000 --json",
  '*>> .tmp\\holoshell\\laptop-receipt-freshness-watch.log',
  'laptop-receipt-freshness-watch.log',
  "node scripts\\holoshell-operator-terminal.mjs",
  '-WindowStyle Hidden',
  'persistent operator terminal is still available with -OperatorTerminal',
  "[Brittney Studio] receipt: .tmp/holoshell/operator-terminal.json",
  'projection',
], failures);

for (const disallowed of [
  'packages/holoshell/serve.mjs',
  'holoshell:operate-room:serve',
  'pnpm run brittney',
]) {
  if (launch.includes(disallowed)) {
    failures.push(`desktop launcher should not own service runtime: found ${disallowed}`);
  }
}

requireIncludes('legacy Brittney gateway', gateway, [
  'HOLOSHELL_DESKTOP_SOURCE_CONTRACT',
  'apps/holoshell/source/holoshell-brittney-desktop-cockpit.hsplus',
  'BRITTNEY_PORT = 11435',
  'Primary inference: HoloLLama local compatibility route',
  'Compatibility routes are now available',
  'primaryInference',
], failures);

requireIncludes('operator terminal adapter', terminal, [
  "id: 'ask_brittney'",
  "adapter: 'scripts/holoshell-brittney-turn.mjs'",
  "receipt: '.tmp/holoshell/brittney-turn-latest.json'",
  "desktopBridgeStatus: 'ready'",
], failures);

requireIncludes('HoloShell server adapter', serve, [
  "const BRITTNEY_COCKPIT_SOURCE = 'apps/holoshell/source/holoshell-brittney-desktop-cockpit.hsplus'",
  "const BRITTNEY_COCKPIT_CAPSULE_SCHEMA = 'hololand.holoshell.brittney-cockpit-capsule.v0.1.0'",
  "const VISUAL_OPERATING_LAYER_SOURCE = 'apps/holoshell/source/holoshell-visual-operating-layer.hsplus'",
  "const NATIVE_VISUAL_OPERATING_LAYER_SOURCE = `HoloScript:${NATIVE_VISUAL_OPERATING_LAYER_RELATIVE}`",
  "const JETSON_EXTENSION_ROUTE_SCHEMA = 'hololand.holoshell.jetson-extension-route.v0.1.0'",
  "const CANONICAL_JETSON_SURFACE = 'http://holojetson.local:8747'",
  "const BROWSER_FIRST_RECEIPT_SCRIPT = 'scripts/holoshell-brittney-operator-chat-browser-receipt.mjs'",
  "const NATIVE_HOLOSHELL_WRAPPER = 'apps/holoshell/native/windows/Start-HoloShellFounderHost.ps1'",
  "const NATIVE_CAPABILITY_ENVELOPE_SOURCE = `HoloScript:${NATIVE_CAPABILITY_ENVELOPE_RELATIVE}`",
  "const NATIVE_CAPABILITY_ENVELOPE_SCHEMA = 'holoscript.holoshell.native-capability-envelope.v0.1.0'",
  'UPSTREAM_TERMINAL_EVENT_STREAM_LABEL',
  'UPSTREAM_TERMINAL_EVENT_STREAM_SCHEMA',
  'native_terminal_event_stream',
  'native_visual_operating_layer',
  'upstreamTerminalEventStreamSnapshot',
  'nativeVisualOperatingLayerSnapshot',
  'buildVisualOperatingLayer',
  "'/api/visual-operating-layer'",
  "const SERVICE_SUPERVISOR_SOURCE = 'apps/holoshell/source/holoshell-service-supervisor.hsplus'",
  "const SERVICE_SUPERVISOR_SCRIPT = 'scripts/holoshell-service-supervisor.mjs'",
  'browserFirstValidationRequiredBeforeNativeClaim',
  'nativeWindowOwnsDailyOperation',
  'nativeCapabilityEnvelopeSnapshot',
  'native_capability_envelope',
  'holoServicesRunThroughTerminalSupervisor',
  'visualOperatingLayerAgentReadable',
  'commandPaletteRequiresConsentBoundaries',
  "'/api/services/supervisor'",
  "'/workflow/services/supervisor'",
  'jetson_extension_surface',
  'browser_first_test_surface',
  'native_holoshell_wrapper_contract',
  'holoservices_supervisor',
  'buildSourceOwnedCockpitState',
  'sourceOwnedState',
  'read_only_source_contract',
  "'/api/cockpit/capsule'",
  "'/api/brittney/chat'",
  "'/api/operator-terminal/session'",
  "'/api/operator-terminal/execute'",
  "'/api/operator-terminal/run-approved'",
  "'/api/operator-terminal/run-readonly'",
  'OPERATOR_TERMINAL_GUARDED_EXECUTE_SCHEMA',
  'OPERATOR_TERMINAL_APPROVED_EXECUTION_SCHEMA',
  'OPERATOR_TERMINAL_READONLY_EXECUTION_SCHEMA',
  'OPERATOR_TERMINAL_GUARDED_EXECUTE_MAX_AGE_MS',
  'buildOperatorTerminalGuardedExecuteReceipt',
  'buildOperatorTerminalApprovedAdapterExecutionReceipt',
  'buildOperatorTerminalReadOnlyAdapterExecutionReceipt',
  'runTerminalProcessLifecycle',
  'TERMINAL_EVENT_STREAM_SOURCE',
  'guarded_execution_receipt_already_consumed',
  'readonly_operator_terminal_adapter_execution_requires_confirmation',
  'claim_local_room_task',
  "'--confirm-claim'",
  "'--claim-task-id'",
  'operator_terminal_claim_local_room_task_requires_selected_task_id',
  'approved_operator_terminal_claim_task_id_does_not_match_guarded_receipt',
  "'/api/sovereign-room/marathon'",
  "'/workflow/sovereign-room-marathon'",
  'stageSovereignRoomMarathonForChat',
  'sovereignRoomMarathonStatusSnapshot()',
  "'/api/holoclaw/runtime-bridge'",
  "'/workflow/holoclaw-runtime-bridge'",
  'stageHoloClawRuntimeBridgeForChat',
  'holoclawRuntimeBridgeStatusSnapshot()',
], failures);

requireIncludes('HoloShell compiler bridge', compiler, [
  "HOLOSHELL_BROWSER_STATE_SCHEMA = 'hololand.holoshell.browser-session-state.v0.1.0'",
  "HOLOSHELL_BROWSER_STATE_KEY = 'holoshell:brittney:browser-session:v1'",
  'HOLOSHELL_CHAT_WORKSPACES',
  'transcriptByChat',
  '_setActiveChat',
  '_sendSovereignRoomChat',
  '_sendHoloClawChat',
  '_inspectSovereignRoomMarathon',
  'parallel-chat-stack',
  '_restoreBrowserSession',
  '_rememberTranscript',
  '_persistCockpitCapsule',
  'native-proof-strip',
  'visual-operating-layer-panel',
  '_renderVisualOperatingLayer',
  'visual-command-grid',
  'Source Envelope',
  'Terminal Events',
  'native_capability_envelope',
  'Browser Self-Test',
  'Holo Services',
  'Start-HoloShellFounderHost.ps1',
  'sourceOwnedState',
  'cockpit-source',
  ], failures);

requireIncludes('package scripts', packageJson, [
  '"check:brittney-desktop-source-contract": "node scripts/check-brittney-desktop-source-contract.mjs"',
  '"test:holoshell-brittney-cockpit": "node scripts/__tests__/holoshell-brittney-cockpit.test.mjs"',
  '"test:holoshell-brittney-operator-chat-browser-receipt": "node scripts/__tests__/holoshell-brittney-operator-chat-browser-receipt.test.mjs"',
], failures);

if (failures.length > 0) {
  console.error('[brittney-desktop-source-contract] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[brittney-desktop-source-contract] ok');
console.log(`source: ${files.source}`);
console.log('route: desktop shortcut -> Jetson HoloShell surface -> laptop receipt freshness watch -> operator terminal receipt -> Sovereign Room status -> HoloClaw status -> HoloShell server receipts');
