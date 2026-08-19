#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 'hololand.holoshell.live-feed.v0.1.0';
const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'live-feed.json');
const DEFAULT_JS_OUTPUT = path.join('.tmp', 'holoshell', 'live-feed.js');
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DESKTOP_BRIDGE_FRESH_MS = 120000;

function parseArgs(argv) {
  const args = {
    json: false,
    selfTest: false,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    tmpDir: DEFAULT_TMP,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--tmp-dir') args.tmpDir = argv[++index];
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`HoloShell live feed bundler

Usage:
  node scripts/holoshell-live-feed.mjs [options]

Options:
  --json              Print the bundled feed.
  --self-test         Assert feed invariants.
  --tmp-dir <path>    Read feed inputs from this directory. Defaults to .tmp/holoshell.
  --output <path>     Write JSON output. Defaults to .tmp/holoshell/live-feed.json.
  --js-output <path>  Write browser bootstrap JS. Defaults to .tmp/holoshell/live-feed.js.
  -h, --help          Show this help.
`);
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

function readReceiptFiles(dirPath) {
  const resolved = resolveRepoPath(dirPath);
  if (!existsSync(resolved)) return [];
  return readdirSync(resolved, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => readJson(path.join(resolved, entry.name)))
    .filter(Boolean)
    .sort((left, right) => String(right?.timing?.endedAt || right?.generatedAt || '').localeCompare(String(left?.timing?.endedAt || left?.generatedAt || '')));
}

function trustCounts(capabilities = []) {
  return capabilities.reduce((counts, capability) => {
    const key = capability.trustState || capability.trust_state || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function riskRank(risk) {
  if (risk === 'critical') return 3;
  if (risk === 'warn') return 2;
  if (risk === 'unknown') return 1;
  return 0;
}

function riskFromEvidenceStatus(status) {
  if (status === 'fail' || status === 'reported_fail' || status === 'warn' || status === 'skipped') return 'warn';
  if (status === 'pass') return 'pass';
  return 'unknown';
}

function networkContractStatus(networkReality) {
  return networkReality?.schemaContract?.validationStatus || 'missing';
}

function networkRealityTrustState(networkReality) {
  if (networkContractStatus(networkReality) === 'pass') return 'verified';
  if (networkReality?.underlay?.confidence === 'owner_declared' || networkReality?.underlay?.confidence === 'os_reported') return 'partial';
  return 'unknown';
}

function networkFreshnessRisk(networkFreshness) {
  const status = networkFreshness?.summary?.status;
  if (status === 'refresh_failed') return 'warn';
  if (status === 'fresh' || status === 'refreshed') return 'pass';
  if (networkFreshness?.policy?.staleNetworkReceiptMayDriveActions === true) return 'warn';
  return 'unknown';
}

function networkFreshnessTrustState(networkFreshness) {
  const status = networkFreshness?.summary?.status;
  if (status === 'fresh' || status === 'refreshed') return 'verified';
  if (status === 'refresh_failed') return 'partial';
  return 'unknown';
}

function networkChangeSentinelRisk(networkChangeEvents) {
  const status = networkChangeEvents?.summary?.status;
  if (status === 'warn' || networkChangeEvents?.summary?.lastObservationKind === 'refresh_failed') return 'warn';
  if (status === 'observed' || status === 'watching') return 'pass';
  return 'unknown';
}

function networkChangeSentinelTrustState(networkChangeEvents) {
  const status = networkChangeEvents?.summary?.status;
  if (status === 'observed' || status === 'watching') return 'verified';
  if (status === 'warn') return 'partial';
  return 'unknown';
}

function networkSentinelServiceRisk(networkSentinelService) {
  const status = networkSentinelService?.summary?.serviceStatus;
  if (['stale', 'start_failed', 'unverified_pid'].includes(status)) return 'warn';
  if (['online', 'starting'].includes(status)) return 'pass';
  return 'unknown';
}

function networkSentinelServiceTrustState(networkSentinelService) {
  const status = networkSentinelService?.summary?.serviceStatus;
  if (status === 'online') return 'verified';
  if (['starting', 'stale', 'unverified_pid'].includes(status)) return 'partial';
  return 'unknown';
}

function serviceSupervisorRisk(serviceSupervisor) {
  const summary = serviceSupervisor?.summary || {};
  const status = summary.status;
  if (status === 'attention_required' || (summary.requiredAttentionCount || 0) > 0) return 'warn';
  if (['ready', 'ready_with_optional_offline', 'ready_with_degraded_optional'].includes(status)) return 'pass';
  return 'unknown';
}

function serviceSupervisorTrustState(serviceSupervisor) {
  const summary = serviceSupervisor?.summary || {};
  if (summary.status === 'ready') return 'verified';
  if (['ready_with_optional_offline', 'ready_with_degraded_optional'].includes(summary.status)) return 'partial';
  if (summary.status === 'attention_required') return 'partial';
  return 'unknown';
}

function desktopBridgeReceiptAgeMs(desktopBridgeStatus, nowMs = Date.now()) {
  const generated = Date.parse(desktopBridgeStatus?.generatedAt || '');
  if (!Number.isFinite(generated)) return null;
  return Math.max(0, nowMs - generated);
}

function desktopBridgeFreshness(desktopBridgeStatus) {
  if (!desktopBridgeStatus?.schemaVersion) return 'missing';
  const ageMs = desktopBridgeReceiptAgeMs(desktopBridgeStatus);
  if (ageMs === null) return 'unknown';
  return ageMs <= DESKTOP_BRIDGE_FRESH_MS ? 'fresh' : 'stale';
}

function desktopBridgeStatusValue(desktopBridgeStatus) {
  if (!desktopBridgeStatus?.schemaVersion) return 'check_required';
  if (desktopBridgeFreshness(desktopBridgeStatus) === 'stale') return 'stale';
  return desktopBridgeStatus.status || 'unknown';
}

function desktopBridgeRisk(desktopBridgeStatus) {
  const status = desktopBridgeStatusValue(desktopBridgeStatus);
  if (status === 'ready') return 'pass';
  if (status === 'stale') return 'warn';
  return 'unknown';
}

function desktopBridgeTrustState(desktopBridgeStatus) {
  const status = desktopBridgeStatusValue(desktopBridgeStatus);
  if (status === 'ready') return 'verified';
  if (status === 'stale') return 'partial';
  return 'unknown';
}

function legacyRealityContractStatus(legacyAppReality) {
  return legacyAppReality?.schemaContract?.validationStatus || 'missing';
}

function legacyRealityTrustState(legacyAppReality) {
  if (legacyRealityContractStatus(legacyAppReality) === 'pass') return 'verified';
  if (legacyAppReality?.summary?.confidence === 'os_reported' || legacyAppReality?.summary?.confidence === 'fixture') return 'partial';
  return 'unknown';
}

function runReceiptDetail(receipt) {
  const base = `${receipt.command?.preview || 'local command'} as ${receipt.command?.runClass || 'run'} on ${receipt.lane?.laneId || 'unknown lane'}.`;
  const networkGate = receipt.networkGate;
  if (!networkGate) return base;

  const intent = networkGate.intent || receipt.command?.networkIntent || 'network';
  if (networkGate.bandwidthSpending && !networkGate.allowed) {
    return `${base} Network gate blocked ${intent} under ${networkGate.classification || 'unknown'}: ${networkGate.reason || 'owner network gesture required'}`;
  }

  if (networkGate.bandwidthSpending && networkGate.ownerGesture) {
    return `${base} Network gate allowed ${intent} under ${networkGate.classification || 'unknown'} with owner network gesture.`;
  }

  if (networkGate.bandwidthSpending) {
    return `${base} Network gate allowed ${intent} under ${networkGate.classification || 'unknown'} with receipt.`;
  }

  return `${base} Network intent ${intent}; protected bandwidth not spent.`;
}

function runReceiptTrustState(receipt) {
  if (receipt.status === 'completed') return 'verified';
  if (receipt.status === 'dry_run' && receipt.networkGate?.allowed !== false) return 'verified';
  if (receipt.status === 'blocked') return 'partial';
  return 'unknown';
}

function createTimeline({ inventory, surfaceMap, goldCodebaseBridge, wildHoloScript, formatInventory, founderBootPreview, founderHost, nativeWrapper, startupIntegration, userShellProjection, developmentalEnvironment, lanes, processHealth, networkReality, networkFreshness, networkChangeEvents, networkSentinelService, serviceSupervisor, desktopBridgeStatus, legacyAppReality, mcpCustodyContract, mcpUpstreamHandoff, osUiCapture, programRegistry, readinessEvidence, fleetReadiness, shellObjects, brittneyAvatar, brittneyTurn, brittneyContext, operatorBrief, operatingTurn, founderCommand, founderEvidenceDemo, receiptControl, agentDispatch, laptopReasoningBridge, laptopReasoningResult, grokBuild, grokHeartbeat, hardwareAction, hardwareApproval, accountTaskCustody, packageCustody, trustLedger, workflow, sovereignRoomMarathon, workflowApproval, workflowIntentGate, shardWorkflow, shardImportApproval, shardImport, runReceipts, pilotReceipts }) {
  const timeline = [];
  const now = new Date().toISOString();

  if (inventory?.summary) {
    timeline.push({
      id: 'capability-inventory',
      kind: 'capability_inventory',
      title: 'Capability inventory refreshed',
      detail: `${inventory.summary.capabilityCount || 0} capabilities, ${inventory.summary.legacyProgramCount || 0} legacy programs classified.`,
      trustState: (inventory.summary.unknown || 0) > 0 ? 'partial' : 'verified',
      generatedAt: inventory.generatedAt || now,
      receiptType: 'hololand.holoshell.capability-inventory.v0.1.0',
      source: 'scripts/holoshell-capability-inventory.mjs',
    });
  }

  if (surfaceMap?.summary) {
    timeline.push({
      id: 'holoscript-surface-map',
      kind: 'surface_map',
      title: 'HoloScript surfaces mapped',
      detail: `${surfaceMap.summary.mcpToolCount || 0} MCP tools, ${surfaceMap.summary.cliCommandCount || 0} CLI commands, ${surfaceMap.summary.restReachable || 0}/${surfaceMap.summary.restSurfaceCount || 0} REST surfaces reachable.`,
      trustState: 'verified',
      generatedAt: surfaceMap.generatedAt || now,
      receiptType: 'hololand.holoshell.holoscript-surface-map.v0.1.0',
      source: 'scripts/holoshell-holoscript-surface-map.mjs',
    });
  }

  if (goldCodebaseBridge?.summary) {
    timeline.push({
      id: goldCodebaseBridge.bridgeId || 'holoscript-gold-codebase-bridge',
      kind: 'holoscript_gold_codebase_bridge',
      title: `GOLD plus codebase bridge ${goldCodebaseBridge.summary.status || 'unknown'}`,
      detail: `${goldCodebaseBridge.summary.goldEntryCount || 0} GOLD entries; ${goldCodebaseBridge.summary.codebaseToolCount || 0} HoloScript codebase tools; graph ${goldCodebaseBridge.summary.graphCacheProtocol || 'unknown'}.`,
      trustState: goldCodebaseBridge.summary.status === 'ready' ? 'verified' : 'partial',
      generatedAt: goldCodebaseBridge.generatedAt || now,
      receiptType: goldCodebaseBridge.schemaVersion,
      source: goldCodebaseBridge.sourceAnchors?.adapter || 'scripts/holoshell-holoscript-gold-codebase-bridge.mjs',
    });
  }

  if (wildHoloScript?.summary) {
    timeline.push({
      id: wildHoloScript.intakeId || 'wild-holoscript-intake',
      kind: 'wild_holoscript_intake',
      title: `Wild HoloScript intake ${wildHoloScript.summary.status || 'unknown'}`,
      detail: `${wildHoloScript.summary.fileCount || 0} files from ${wildHoloScript.source?.rootName || 'uaa2-service'}; ${wildHoloScript.summary.frontierSyntaxCount || 0} frontier syntax; ${wildHoloScript.summary.adapterNeededCount || 0} adapter needed.`,
      trustState: (wildHoloScript.summary.adapterNeededCount || 0) > 0 ? 'partial' : wildHoloScript.summary.status === 'scanned' ? 'verified' : 'unknown',
      generatedAt: wildHoloScript.generatedAt || now,
      receiptType: wildHoloScript.schemaVersion,
      source: wildHoloScript.source?.script || 'scripts/holoshell-wild-holoscript-intake.mjs',
    });
  }

  if (formatInventory?.summary) {
    timeline.push({
      id: formatInventory.inventoryId || 'holoshell-format-inventory',
      kind: 'format_inventory',
      title: `Format inventory ${formatInventory.summary.status || 'unknown'}`,
      detail: `${formatInventory.summary.totalFileCount || 0} .holo/.hs/.hsplus files; ${formatInventory.summary.totalFeatureFamilies || 0} feature families across canonical HoloScript and wild uAA2.`,
      trustState: formatInventory.summary.status === 'scanned' ? 'verified' : 'partial',
      generatedAt: formatInventory.generatedAt || now,
      receiptType: formatInventory.schemaVersion,
      source: formatInventory.source?.script || 'scripts/holoshell-format-inventory.mjs',
    });
  }

  if (founderBootPreview?.summary) {
    timeline.push({
      id: founderBootPreview.bootId || 'holoshell-founder-boot-preview',
      kind: 'founder_boot_preview',
      title: `Founder boot preview ${founderBootPreview.summary.status || 'unknown'}`,
      detail: `${founderBootPreview.summary.worldObjectCount || 0} .holo world objects, ${founderBootPreview.summary.renderObjectCount || 0} .hs render objects, ${founderBootPreview.summary.userCapabilityPackCount || 0} user pack(s), ${founderBootPreview.summary.brittneyProposalCount || 0} Brittney proposal(s).`,
      trustState: founderBootPreview.summary.status === 'ready' ? 'verified' : 'partial',
      generatedAt: founderBootPreview.generatedAt || now,
      receiptType: founderBootPreview.schemaVersion,
      source: founderBootPreview.source?.script || 'scripts/holoshell-founder-boot-preview.mjs',
    });
  }

  if (founderHost?.summary) {
    timeline.push({
      id: 'holoshell-founder-host',
      kind: 'founder_host',
      title: `Founder host ${founderHost.summary.status || 'unknown'}`,
      detail: `${founderHost.summary.primarySurfaceOwnership || 'unknown'}; shell objects ${founderHost.summary.shellObjectGraphReady ? 'ready' : 'missing'}; live feed ${founderHost.summary.liveFeedReady ? 'ready' : 'missing'}; native wrapper ${founderHost.summary.nativeWrapperPresent ? 'present' : 'missing'}; next ${founderHost.summary.nextMove || 'unknown'}.`,
      trustState: founderHost.summary.nativeWrapperPresent
        ? 'verified'
        : founderHost.summary.status === 'ready_for_native_wrapper'
          ? 'partial'
          : 'unknown',
      generatedAt: founderHost.generatedAt || now,
      receiptType: founderHost.schemaVersion,
      source: founderHost.sourceAnchors?.adapter || 'scripts/holoshell-founder-host.mjs',
    });
  }

  if (nativeWrapper?.summary) {
    timeline.push({
      id: 'holoshell-native-wrapper',
      kind: 'native_wrapper',
      title: `Native wrapper ${nativeWrapper.summary.status || 'unknown'}`,
      detail: `${nativeWrapper.summary.launchMode || 'app_mode'}; launchable ${nativeWrapper.summary.launchable ? 'yes' : 'no'}; browser candidates ${nativeWrapper.summary.browserCandidateCount || 0}; startup ${nativeWrapper.summary.startupIntegrationPresent ? 'present' : 'missing'}; next ${nativeWrapper.summary.nextMove || 'unknown'}.`,
      trustState: nativeWrapper.summary.launchable ? 'partial' : 'unknown',
      generatedAt: nativeWrapper.generatedAt || now,
      receiptType: nativeWrapper.schemaVersion,
      source: nativeWrapper.sourceAnchors?.adapter || 'scripts/holoshell-native-wrapper.mjs',
    });
  }

  if (startupIntegration?.summary) {
    timeline.push({
      id: 'holoshell-startup-integration',
      kind: 'startup_integration',
      title: `Startup integration ${startupIntegration.summary.status || 'unknown'}`,
      detail: `${startupIntegration.summary.startupMode || 'startup'}; registered ${startupIntegration.summary.startupRegistered ? 'yes' : 'no'}; approval ${startupIntegration.summary.approvalRequired ? 'required' : 'not-required'}; next ${startupIntegration.summary.nextMove || 'unknown'}.`,
      trustState: startupIntegration.summary.startupRegistered
        ? 'verified'
        : startupIntegration.summary.startupIntegrationPresent
          ? 'partial'
          : 'unknown',
      generatedAt: startupIntegration.generatedAt || now,
      receiptType: startupIntegration.schemaVersion,
      source: startupIntegration.sourceAnchors?.adapter || 'scripts/holoshell-startup-integration.mjs',
    });
  }

  if (userShellProjection?.summary) {
    timeline.push({
      id: userShellProjection.projectionId || 'holoshell-user-shell-projection',
      kind: 'user_shell_projection',
      title: `User shell projection ${userShellProjection.summary.status || 'unknown'}`,
      detail: `${userShellProjection.summary.userModeCount || 0} user mode(s), ${userShellProjection.summary.capabilityPackCount || 0} pack(s), ${userShellProjection.summary.brittneyTranslationCount || 0} Brittney translation(s), ${userShellProjection.summary.founderOnlyPowerCount || 0} founder-only power(s).`,
      trustState: userShellProjection.summary.status === 'ready' ? 'verified' : 'partial',
      generatedAt: userShellProjection.generatedAt || now,
      receiptType: userShellProjection.schemaVersion,
      source: userShellProjection.source?.script || 'scripts/holoshell-user-shell-projection.mjs',
    });
  }

  if (developmentalEnvironment?.summary) {
    timeline.push({
      id: developmentalEnvironment.receiptId || 'holoshell-developmental-environment',
      kind: 'developmental_environment',
      title: `Developmental environment ${developmentalEnvironment.summary.status || 'unknown'}`,
      detail: `${developmentalEnvironment.summary.spineLayerCount || 0} spine layers; mass ${developmentalEnvironment.thesis?.massFunctionRuling || 'unknown'}; mapping ${developmentalEnvironment.thesis?.mappingFunctionRuling || 'unknown'}; next ${developmentalEnvironment.summary.nextMove || 'unknown'}.`,
      trustState: developmentalEnvironment.summary.massFunctionSettled && developmentalEnvironment.summary.mappingFunctionSettled ? 'verified' : 'partial',
      generatedAt: developmentalEnvironment.generatedAt || now,
      receiptType: developmentalEnvironment.schemaVersion,
      source: developmentalEnvironment.sourceAnchors?.adapter || 'scripts/holoshell-developmental-environment.mjs',
    });
  }

  if (lanes?.summary) {
    timeline.push({
      id: 'agent-lanes',
      kind: 'agent_presence',
      title: 'Agent lanes refreshed',
      detail: `${lanes.summary.activeLaneCount || 0}/${lanes.summary.laneCount || 0} lanes active or available.`,
      trustState: 'verified',
      generatedAt: lanes.generatedAt || now,
      receiptType: 'hololand.holoshell.agent-lanes.v0.1.0',
      source: 'scripts/holoshell-agent-lanes.mjs',
    });
  }

  if (processHealth?.summary) {
    timeline.push({
      id: 'process-health',
      kind: 'process_health',
      title: `Process health is ${processHealth.summary.riskState || 'unknown'}`,
      detail: `${processHealth.summary.processCount || 0} processes, ${processHealth.summary.shellRunCount || 0} shell/dev runs, ${processHealth.summary.staleRunCount || 0} stale, ${processHealth.summary.highMemoryCount || 0} high-memory.`,
      trustState: processHealth.summary.riskState === 'pass' ? 'verified' : 'partial',
      generatedAt: processHealth.generatedAt || now,
      receiptType: 'hololand.holoshell.process-health.v0.1.0',
      source: 'scripts/holoshell-process-health.mjs',
    });
  }

  if (networkReality?.underlay) {
    const contractStatus = networkContractStatus(networkReality);
    timeline.push({
      id: 'network-reality',
      kind: 'network_reality',
      title: `Network reality is ${networkReality.underlay.classification || 'unknown'}`,
      detail: `${networkReality.underlay.osInterfaceKind || 'unknown'} underlay, OS cost ${networkReality.underlay.osCost || 'Unknown'}, VPN ${networkReality.underlay.vpnState || 'unknown'}, ${networkReality.lanes?.networkConsumerCount || 0} network consumer(s); policy ${networkReality.policy?.heavyWorkPolicy || 'unknown'}; HoloScript contract ${contractStatus}.`,
      trustState: networkRealityTrustState(networkReality),
      generatedAt: networkReality.generatedAt || now,
      receiptType: networkReality.schemaVersion,
      source: networkReality.sourceAnchors?.adapter || 'scripts/holoshell-network-reality.mjs',
    });
  }

  if (networkFreshness?.summary) {
    const summary = networkFreshness.summary;
    timeline.push({
      id: 'network-freshness',
      kind: 'network_freshness',
      title: `Network freshness ${summary.status || 'unknown'}`,
      detail: `${summary.previousClassification || 'unknown'} -> ${summary.currentClassification || 'unknown'}; reason ${summary.refreshReason || 'unknown'}; dependents ${summary.dependentRefreshStatus || 'unknown'}.`,
      trustState: networkFreshnessTrustState(networkFreshness),
      generatedAt: networkFreshness.generatedAt || now,
      receiptType: networkFreshness.schemaVersion,
      source: networkFreshness.sourceAnchors?.adapter || 'scripts/holoshell-network-freshness-watch.mjs',
    });
  }

  if (networkChangeEvents?.summary) {
    const summary = networkChangeEvents.summary;
    timeline.push({
      id: 'network-change-sentinel',
      kind: 'network_change_sentinel',
      title: `Network sentinel ${summary.lastObservationKind || 'unknown'}`,
      detail: `${summary.eventCount || 0} stored event(s), ${summary.changeEventCount || 0} change event(s); current ${summary.currentClassification || 'unknown'}; latest ${summary.latestEventKind || 'none'}.`,
      trustState: networkChangeSentinelTrustState(networkChangeEvents),
      generatedAt: networkChangeEvents.generatedAt || now,
      receiptType: networkChangeEvents.schemaVersion,
      source: networkChangeEvents.sourceAnchors?.adapter || 'scripts/holoshell-network-change-sentinel.mjs',
    });
  }

  if (networkSentinelService?.summary) {
    const summary = networkSentinelService.summary;
    timeline.push({
      id: 'network-sentinel-service',
      kind: 'network_sentinel_service',
      title: `Network watcher service ${summary.serviceStatus || 'unknown'}`,
      detail: `PID alive ${summary.pidAlive ? 'yes' : 'no'}, verified ${summary.pidCommandVerified ? 'yes' : 'no'}; heartbeat ${summary.heartbeatAgeMs ?? 'unknown'}ms; restarts ${summary.restartCount || 0}.`,
      trustState: networkSentinelServiceTrustState(networkSentinelService),
      generatedAt: networkSentinelService.generatedAt || now,
      receiptType: networkSentinelService.schemaVersion,
      source: networkSentinelService.sourceAnchors?.adapter || 'scripts/holoshell-network-sentinel-service.mjs',
    });
  }

  if (serviceSupervisor?.summary) {
    const summary = serviceSupervisor.summary;
    timeline.push({
      id: 'service-supervisor',
      kind: 'service_supervisor',
      title: `Service supervisor ${summary.status || 'unknown'}`,
      detail: `${summary.requiredOnlineServiceCount || 0}/${summary.requiredServiceCount || 0} required online; ${summary.serviceCount || 0} service(s), ${summary.optionalOfflineServiceCount || 0} optional offline, ${summary.actionRequiredCount || 0} action(s) required.`,
      trustState: serviceSupervisorTrustState(serviceSupervisor),
      generatedAt: serviceSupervisor.generatedAt || now,
      receiptType: serviceSupervisor.schemaVersion,
      source: serviceSupervisor.sourceAnchors?.adapter || 'scripts/holoshell-service-supervisor.mjs',
    });
  }

  if (desktopBridgeStatus?.schemaVersion) {
    const status = desktopBridgeStatusValue(desktopBridgeStatus);
    const ageMs = desktopBridgeReceiptAgeMs(desktopBridgeStatus);
    timeline.push({
      id: desktopBridgeStatus.reportId || 'desktop-control-bridge',
      kind: 'desktop_control_bridge',
      title: `Laptop desktop bridge ${status}`,
      detail: `${desktopBridgeStatus.url || 'unknown URL'}; host role ${desktopBridgeStatus.hostRole || 'unknown'}; receipt ${desktopBridgeFreshness(desktopBridgeStatus)}${ageMs === null ? '' : ` (${ageMs}ms old)`}; mutation ${desktopBridgeStatus.destructiveActionsTaken ? 'taken' : 'not taken'}.`,
      trustState: desktopBridgeTrustState(desktopBridgeStatus),
      generatedAt: desktopBridgeStatus.generatedAt || now,
      receiptType: desktopBridgeStatus.schemaVersion,
      source: desktopBridgeStatus.daemonScript || 'scripts/holoshell-laptop-desktop-bridge.mjs',
    });
  }

  if (legacyAppReality?.summary) {
    const contractStatus = legacyRealityContractStatus(legacyAppReality);
    timeline.push({
      id: 'legacy-app-reality',
      kind: 'legacy_app_reality',
      title: `Legacy app reality has ${legacyAppReality.summary.agentInstanceCount || 0} agent instance(s)`,
      detail: `${legacyAppReality.summary.processCount || 0} process(es), ${legacyAppReality.summary.visibleWindowCount || 0} visible window(s), ${legacyAppReality.summary.shellInstanceCount || 0} shell instance(s), ${legacyAppReality.summary.networkConsumerCount || 0} network consumer(s), ${legacyAppReality.summary.colorLaneCount || 0} color lane(s); HoloScript contract ${contractStatus}.`,
      trustState: legacyRealityTrustState(legacyAppReality),
      generatedAt: legacyAppReality.generatedAt || now,
      receiptType: legacyAppReality.schemaVersion,
      source: legacyAppReality.sourceAnchors?.adapter || 'scripts/holoshell-legacy-app-reality.mjs',
    });
  }

  if (mcpCustodyContract?.summary) {
    const summary = mcpCustodyContract.summary;
    timeline.push({
      id: 'mcp-custody-contract',
      kind: 'mcp_custody_contract',
      title: summary.nativeMcpCustodySplit
        ? 'MCP custody split native'
        : `MCP custody split ${summary.compatibilityMode || 'unknown'}`,
      detail: `${summary.cleanupCandidateCount || 0} cleanup candidate(s), ${summary.ownerHandoffPlanCount || 0} owner handoff(s), ${summary.checkFailCount || 0} failing check(s).`,
      trustState: summary.nativeMcpCustodySplit ? 'verified' : 'partial',
      generatedAt: mcpCustodyContract.generatedAt || now,
      receiptType: mcpCustodyContract.schemaVersion,
      source: mcpCustodyContract.sourceAnchors?.adapter || 'scripts/holoshell-mcp-custody-contract.mjs',
    });
  }

  if (mcpUpstreamHandoff?.summary) {
    const summary = mcpUpstreamHandoff.summary;
    timeline.push({
      id: mcpUpstreamHandoff.handoffId || 'mcp-custody-upstream-handoff',
      kind: 'mcp_custody_upstream_handoff',
      title: `MCP custody handoff ${summary.status || 'unknown'}`,
      detail: `${summary.targetTool || 'holoshell_run_registry_snapshot'}; ${summary.taskCount || 0} task(s), ${summary.acceptanceGateCount || 0} gate(s), current mode ${summary.currentCompatibilityMode || 'unknown'}.`,
      trustState: summary.status === 'native_ready_no_handoff_needed' ? 'verified' : 'partial',
      generatedAt: mcpUpstreamHandoff.generatedAt || now,
      receiptType: mcpUpstreamHandoff.schemaVersion,
      source: mcpUpstreamHandoff.sourceAnchors?.adapter || 'scripts/holoshell-mcp-upstream-handoff.mjs',
    });
  }

  if (osUiCapture?.summary) {
    const targetLabel = osUiCapture.summary.targetApp || osUiCapture.summary.selectedAppName || 'legacy surface';
    timeline.push({
      id: 'os-ui-capture',
      kind: 'os_ui_capture',
      title: 'Legacy UI captured as HoloShell geometry',
      detail: `${targetLabel} target ${osUiCapture.summary.targetResolution || (osUiCapture.summary.targetMatched ? 'rich_capture' : 'fallback')}; ${osUiCapture.summary.windowCount || 0} windows, ${osUiCapture.summary.controlCount || 0} controls, ${osUiCapture.summary.geometryNodeCount || 0} geometric shards; action bridge ${osUiCapture.summary.actionBridgeStatus || 'unknown'}.`,
      trustState: osUiCapture.summary.status === 'captured' ? 'verified' : 'partial',
      generatedAt: osUiCapture.generatedAt || now,
      receiptType: 'hololand.holoshell.os-ui-capture.v0.1.0',
      source: 'scripts/holoshell-os-ui-capture.mjs',
    });
  }

  if (programRegistry?.summary) {
    timeline.push({
      id: 'program-registry',
      kind: 'program_registry',
      title: 'Launchable programs registered',
      detail: `${programRegistry.summary.launchableProgramCount || 0}/${programRegistry.summary.programCount || 0} programs launchable; ${programRegistry.summary.runningWindowCount || 0} running windows correlated.`,
      trustState: programRegistry.summary.status === 'captured' ? 'verified' : 'partial',
      generatedAt: programRegistry.generatedAt || now,
      receiptType: 'hololand.holoshell.program-registry.v0.1.0',
      source: 'scripts/holoshell-program-registry.mjs',
    });
  }

  if (readinessEvidence?.summary) {
    timeline.push({
      id: readinessEvidence.readinessId || 'holoshell-readiness-evidence',
      kind: 'readiness_evidence',
      title: `World build readiness ${readinessEvidence.summary.status || 'unknown'}`,
      detail: `${readinessEvidence.summary.scenario || 'HoloShell readiness'}; build ${readinessEvidence.summary.buildStatus || 'unknown'}; device ${readinessEvidence.summary.deviceLabStatus || 'unknown'}; graph ${readinessEvidence.summary.graphStatus || 'unknown'}.`,
      trustState: readinessEvidence.summary.status === 'pass' ? 'verified' : 'partial',
      generatedAt: readinessEvidence.generatedAt || now,
      receiptType: readinessEvidence.schemaVersion,
      source: readinessEvidence.source?.reportPath || 'scripts/holoshell-readiness-evidence.mjs',
    });
    for (const token of (readinessEvidence.tokens || []).slice(0, 8)) {
      timeline.push({
        id: token.id,
        kind: `readiness_${token.kind || 'token'}`,
        title: token.title || 'Readiness token',
        detail: token.detail || token.nextAction || 'Readiness evidence recorded.',
        trustState: token.trustState || (token.status === 'pass' ? 'verified' : 'partial'),
        generatedAt: readinessEvidence.generatedAt || now,
        receiptType: token.receiptType || readinessEvidence.schemaVersion,
        source: token.source || readinessEvidence.source?.evidenceDir || 'scripts/holoshell-readiness-evidence.mjs',
      });
    }
    const readyToken = readinessEvidence.worldBuildReadyToken || {};
    for (const [index, reason] of (readyToken.blockingReasons || []).slice(0, 6).entries()) {
      timeline.push({
        id: `world-build-blocker-${index + 1}`,
        kind: 'world_build_blocking_reason',
        title: `World build blocker ${index + 1}`,
        detail: `${reason} Promotion, import, and publish remain blocked until this reason is resolved and replayed.`,
        trustState: 'partial',
        generatedAt: readinessEvidence.generatedAt || now,
        receiptType: readinessEvidence.schemaVersion,
        source: readinessEvidence.source?.evidenceDir || readinessEvidence.source?.reportPath || 'scripts/holoshell-readiness-evidence.mjs',
      });
    }
  }

  if (fleetReadiness?.summary) {
    timeline.push({
      id: fleetReadiness.fleetReadinessId || 'holoshell-fleet-readiness-evidence',
      kind: 'fleet_readiness_evidence',
      title: `Fleet job readiness ${fleetReadiness.summary.status || 'unknown'}`,
      detail: `job ${fleetReadiness.summary.jobId || 'unknown'}; lane ${fleetReadiness.summary.laneId || 'missing'}; owner ${fleetReadiness.summary.ownerLaneId || 'unknown'}; budget ${fleetReadiness.summary.budgetStatus || 'unknown'}; heartbeat ${fleetReadiness.summary.heartbeatAgeMs ?? 'unknown'}ms; ${fleetReadiness.summary.blockedReasonCount || 0} blocker(s).`,
      trustState: fleetReadiness.summary.status === 'pass' || fleetReadiness.summary.status === 'ready' ? 'verified' : 'partial',
      generatedAt: fleetReadiness.generatedAt || now,
      receiptType: fleetReadiness.schemaVersion,
      source: fleetReadiness.source?.evidencePath || 'scripts/holoshell-fleet-readiness-evidence.mjs',
    });
    for (const token of (fleetReadiness.tokens || []).slice(0, 8)) {
      timeline.push({
        id: token.id,
        kind: `fleet_${token.kind || 'token'}`,
        title: token.title || 'Fleet readiness token',
        detail: token.detail || token.nextAction || 'Fleet readiness evidence recorded.',
        trustState: token.trustState || (token.status === 'pass' ? 'verified' : 'partial'),
        generatedAt: fleetReadiness.generatedAt || now,
        receiptType: token.receiptType || fleetReadiness.schemaVersion,
        source: token.source || fleetReadiness.source?.evidencePath || 'scripts/holoshell-fleet-readiness-evidence.mjs',
      });
    }
    for (const [index, blocker] of (fleetReadiness.blockers || []).slice(0, 6).entries()) {
      timeline.push({
        id: `fleet-job-blocker-${index + 1}`,
        kind: 'fleet_job_blocking_reason',
        title: `Fleet job blocker ${index + 1}`,
        detail: `${blocker.raw || blocker.detail || 'Fleet job readiness blocker.'} Launch, stop, and migration remain blocked until this reason is resolved and replayed.`,
        trustState: 'partial',
        generatedAt: fleetReadiness.generatedAt || now,
        receiptType: fleetReadiness.schemaVersion,
        source: fleetReadiness.source?.evidencePath || 'scripts/holoshell-fleet-readiness-evidence.mjs',
      });
    }
  }

  if (shellObjects?.summary) {
    timeline.push({
      id: 'shell-objects',
      kind: 'shell_object_graph',
      title: 'Shell objects materialized',
      detail: `${shellObjects.summary.shellObjectCount || 0} addressable objects; ${shellObjects.summary.programObjectCount || 0} app bubbles; ${shellObjects.summary.capturedWindowObjectCount || 0} captured windows; ${shellObjects.summary.guardedExecuteCount || 0} guarded powers.`,
      trustState: shellObjects.summary.status === 'ready' ? 'verified' : 'partial',
      generatedAt: shellObjects.generatedAt || now,
      receiptType: shellObjects.schemaVersion,
      source: 'scripts/holoshell-shell-objects.mjs',
    });
  }

  if (brittneyAvatar?.summary) {
    timeline.push({
      id: 'brittney-avatar',
      kind: 'brittney_avatar',
      title: `Brittney avatar ${brittneyAvatar.summary.avatarStatus || 'unknown'}`,
      detail: `${brittneyAvatar.runtime?.packageName || '@holoscript/aibrittney'} runtime ${brittneyAvatar.summary.runtimeStatus || 'unknown'}; ${brittneyAvatar.summary.emotion || 'attentive'} expression; ${brittneyAvatar.summary.voiceState || 'ready'} voice state.`,
      trustState: brittneyAvatar.summary.runtimeStatus === 'available' ? 'verified' : 'partial',
      generatedAt: brittneyAvatar.generatedAt || now,
      receiptType: 'hololand.holoshell.brittney-avatar.v0.1.0',
      source: 'scripts/holoshell-brittney-avatar.mjs',
    });
  }

  if (brittneyTurn?.summary) {
    timeline.push({
      id: brittneyTurn.turnId || 'brittney-turn',
      kind: 'brittney_turn',
      title: `Brittney turn ${brittneyTurn.summary.status || 'unknown'}`,
      detail: `${brittneyTurn.summary.eventCount || 0} runtime events, ${brittneyTurn.summary.actionProposalCount || 0} shell proposal(s), first target ${brittneyTurn.summary.firstProposalObject || 'none'}.`,
      trustState: brittneyTurn.summary.status === 'completed' ? 'verified' : 'partial',
      generatedAt: brittneyTurn.generatedAt || now,
      receiptType: 'hololand.holoshell.brittney-turn.v0.1.0',
      source: 'scripts/holoshell-brittney-turn.mjs',
    });
  }

  if (brittneyContext?.summary) {
    timeline.push({
      id: `brittney-context-${brittneyContext.summary.contextHash || 'latest'}`,
      kind: 'brittney_context',
      title: `Brittney context ${brittneyContext.summary.status || 'unknown'}`,
      detail: `${brittneyContext.summary.visibleShellObjectCount || 0} visible shell object(s), ${brittneyContext.summary.peerWindowCount || 0} peer window(s), ${brittneyContext.summary.shellWindowCount || 0} shell window(s), process risk ${brittneyContext.summary.processRisk || 'unknown'}.`,
      trustState: brittneyContext.summary.status === 'ready' ? 'verified' : 'partial',
      generatedAt: brittneyContext.generatedAt || now,
      receiptType: brittneyContext.schemaVersion,
      source: 'scripts/holoshell-brittney-context.mjs',
    });
  }

  if (operatorBrief?.status) {
    timeline.push({
      id: operatorBrief.receipt?.briefHash ? `operator-brief-${operatorBrief.receipt.briefHash}` : 'operator-brief',
      kind: 'operator_brief',
      title: `Operator brief ${operatorBrief.status}`,
      detail: `${operatorBrief.peers?.windowInstanceCount || 0} AI peer window(s), ${operatorBrief.peers?.shellWindowInstanceCount || 0} shell window(s), ${operatorBrief.legacy?.captureCandidateCount || 0} legacy capture candidate(s).`,
      trustState: operatorBrief.status === 'legacy_absorption_ready' ? 'verified' : 'partial',
      generatedAt: operatorBrief.generatedAt || now,
      receiptType: operatorBrief.schemaVersion,
      source: 'scripts/holoshell-operator-brief.mjs',
    });
  }

  if (operatingTurn?.summary) {
    timeline.push({
      id: operatingTurn.receipt?.operatingTurnHash ? `operating-turn-${operatingTurn.receipt.operatingTurnHash}` : 'operating-turn',
      kind: 'operating_turn',
      title: `Operating turn ${operatingTurn.summary.status || 'unknown'}`,
      detail: `${operatingTurn.summary.passedStepCount || 0}/${operatingTurn.summary.stepCount || 0} step(s) passed; Brittney context ${operatingTurn.summary.brittneyContextStatus || 'unknown'}.`,
      trustState: operatingTurn.summary.status === 'pass' ? 'verified' : 'partial',
      generatedAt: operatingTurn.generatedAt || now,
      receiptType: operatingTurn.schemaVersion,
      source: 'scripts/holoshell-operating-turn.mjs',
    });
  }

  if (founderCommand?.summary) {
    timeline.push({
      id: founderCommand.commandId || 'holoshell-founder-command',
      kind: 'founder_command',
      title: `Founder command ${founderCommand.summary.status || 'unknown'}`,
      detail: `${founderCommand.summary.pipelineStepCount || 0} pipeline step(s), ${founderCommand.summary.workflowStepCount || 0} workflow step(s), ${founderCommand.summary.approvalCount || 0} approval(s); execution ${founderCommand.summary.executionAllowed ? 'allowed after gesture' : 'blocked or staged'}.`,
      trustState: founderCommand.summary.executionAllowed ? 'partial' : founderCommand.summary.status === 'completed' ? 'verified' : 'unknown',
      generatedAt: founderCommand.generatedAt || now,
      receiptType: founderCommand.schemaVersion,
      source: founderCommand.sourceAnchors?.adapter || 'scripts/holoshell-founder-command.mjs',
    });
  }

  if (founderEvidenceDemo?.summary) {
    timeline.push({
      id: founderEvidenceDemo.demoId || 'holoshell-founder-evidence-demo',
      kind: 'founder_evidence_demo',
      title: `Founder evidence demo ${founderEvidenceDemo.summary.status || 'unknown'}`,
      detail: `${founderEvidenceDemo.summary.targetAction || 'action'} ${founderEvidenceDemo.summary.targetLabel || 'target'}; rung ${founderEvidenceDemo.summary.evidenceRung || 'unknown'}; execution ${founderEvidenceDemo.summary.executionPerformed ? 'performed' : 'pending approval'}; visible change ${founderEvidenceDemo.summary.visibleShellChange ? founderEvidenceDemo.summary.visibleWitnessKind || 'observed' : 'not yet'}.`,
      trustState: founderEvidenceDemo.summary.executionPerformed ? 'verified' : 'partial',
      generatedAt: founderEvidenceDemo.generatedAt || now,
      receiptType: founderEvidenceDemo.schemaVersion,
      source: founderEvidenceDemo.sourceAnchors?.adapter || 'scripts/holoshell-founder-evidence-demo.mjs',
    });
  }

  if (receiptControl?.summary) {
    timeline.push({
      id: receiptControl.receiptControlId || 'holoshell-receipt-control',
      kind: 'receipt_control',
      title: `Receipt control ${receiptControl.summary.status || 'unknown'}`,
      detail: `${receiptControl.summary.controlCount || 0} control(s) for ${receiptControl.summary.targetLabel || 'receipt'}; replay ${receiptControl.summary.replayRequiresFreshApproval ? 'fresh approval' : 'not guarded'}; rollback ${receiptControl.summary.rollbackExecutable ? 'executable' : receiptControl.summary.rollbackBlockReason || 'advisory'}.`,
      trustState: receiptControl.summary.status === 'ready' ? 'verified' : 'partial',
      generatedAt: receiptControl.generatedAt || now,
      receiptType: receiptControl.schemaVersion,
      source: receiptControl.sourceAnchors?.adapter || 'scripts/holoshell-receipt-control.mjs',
    });
  }

  if (hardwareAction?.summary) {
    timeline.push({
      id: hardwareAction.actionId || 'hardware-action',
      kind: 'hardware_action',
      title: `Hardware action ${hardwareAction.summary.status || 'unknown'}`,
      detail: `${hardwareAction.summary.actionKind || 'unknown action'} via ${hardwareAction.summary.permissionEnvelope || 'unknown'}; ${hardwareAction.summary.windowCount || 0} windows visible; target ${hardwareAction.summary.targetWindowTitle || 'none'}.`,
      trustState: hardwareAction.summary.status === 'completed' ? 'verified' : hardwareAction.summary.status === 'approval_required' ? 'partial' : 'unknown',
      generatedAt: hardwareAction.generatedAt || now,
      receiptType: 'hololand.holoshell.hardware-action.v0.1.0',
      source: 'scripts/holoshell-action-executor.mjs',
    });
  }

  if (agentDispatch?.summary) {
    timeline.push({
      id: agentDispatch.dispatchId || 'holoshell-agent-dispatch',
      kind: 'agent_dispatch',
      title: `Agent dispatch ${agentDispatch.summary.status || 'unknown'}`,
      detail: `${agentDispatch.summary.capabilityLabel || 'No capability'}; route ${agentDispatch.summary.route || 'none'}; confidence ${agentDispatch.summary.confidence || 0}; approval ${agentDispatch.summary.approvalRequired ? 'required downstream' : 'not required'}.`,
      trustState: agentDispatch.summary.status === 'ready_to_stage' ? 'partial' : 'unknown',
      generatedAt: agentDispatch.generatedAt || now,
      receiptType: agentDispatch.schemaVersion,
      source: agentDispatch.sourceAnchors?.adapter || 'scripts/holoshell-agent-dispatch.mjs',
    });
  }

  if (laptopReasoningBridge?.summary) {
    timeline.push({
      id: laptopReasoningBridge.bridgeId || 'holoshell-laptop-reasoning-bridge',
      kind: 'laptop_reasoning_bridge',
      title: `Laptop reasoning bridge ${laptopReasoningBridge.summary.status || 'unknown'}`,
      detail: `${laptopReasoningBridge.summary.processedCount || 0} dispatch receipt(s) processed; ${laptopReasoningBridge.summary.pushedCount || 0} result receipt(s) pushed; ${laptopReasoningBridge.summary.errorCount || 0} error(s).`,
      trustState: laptopReasoningBridge.summary.status === 'completed' ? 'verified' : laptopReasoningBridge.summary.status === 'partial' ? 'partial' : 'unknown',
      generatedAt: laptopReasoningBridge.generatedAt || now,
      receiptType: laptopReasoningBridge.schemaVersion,
      source: laptopReasoningBridge.sourceAnchors?.bridgeScript || 'scripts/holoshell-laptop-reasoning-bridge.mjs',
    });
  }

  if (laptopReasoningResult?.summary) {
    timeline.push({
      id: laptopReasoningResult.resultId || 'holoshell-laptop-reasoning-result',
      kind: 'laptop_reasoning_result',
      title: `Laptop reasoning result ${laptopReasoningResult.summary.status || 'unknown'}`,
      detail: `${laptopReasoningResult.summary.dispatchId || 'unknown dispatch'}; lane ${laptopReasoningResult.summary.lane || 'unknown'}; mode ${laptopReasoningResult.summary.reasoningExecutionMode || 'unknown'}; modelInvocationPerformed ${laptopReasoningResult.summary.modelInvocationPerformed ? 'true' : 'false'}; GPU ${laptopReasoningResult.summary.laptopGpuStatus || 'unknown'}; GOLD ${laptopReasoningResult.summary.goldRootStatus || 'unknown'}; local focus ${laptopReasoningResult.summary.localFocusCount || 0}; cloud focus ${laptopReasoningResult.summary.cloudFocusCount || 0}; Vast guard ${laptopReasoningResult.summary.vastSpendGuardAttached ? 'attached' : 'missing'}.`,
      trustState: laptopReasoningResult.summary.status === 'completed' ? 'verified' : laptopReasoningResult.summary.status === 'partial' ? 'partial' : 'unknown',
      generatedAt: laptopReasoningResult.generatedAt || now,
      receiptType: laptopReasoningResult.schemaVersion,
      source: laptopReasoningResult.sourceAnchors?.workerScript || 'scripts/holoshell-laptop-reasoning-worker.mjs',
    });
  }

  if (grokBuild?.summary) {
    const authLabel = grokBuild.summary.authRuntimeStatus === 'authenticated'
      ? `authenticated${grokBuild.summary.authProvider ? `/${grokBuild.summary.authProvider}` : ''}`
      : grokBuild.summary.authStatus || 'unknown';
    timeline.push({
      id: grokBuild.setupId || 'holoshell-grok-build-setup',
      kind: 'grok_build_setup',
      title: `Grok Build setup ${grokBuild.summary.status || 'unknown'}`,
      detail: `CLI ${grokBuild.summary.cliVersion || 'unknown'}; auth ${authLabel}; operator ${grokBuild.summary.operatorStatus || 'unknown'}; model ${grokBuild.summary.modelStatus || 'unknown'}; project ${grokBuild.summary.projectTrustStatus || 'unknown'}; Heavy ${grokBuild.summary.heavyAccessStatus || grokBuild.heavyUpgrade?.status || 'unknown'}.`,
      trustState: grokBuild.summary.operatorStatus === 'trusted_ready' ? 'verified' : grokBuild.summary.status === 'blocked' ? 'unknown' : 'partial',
      generatedAt: grokBuild.generatedAt || now,
      receiptType: grokBuild.schemaVersion,
      source: grokBuild.sourceAnchors?.adapter || 'scripts/holoshell-grok-build-workflow.mjs',
    });
  }

  if (grokHeartbeat?.summary) {
    const operatorLabel = grokHeartbeat.summary.cliOperatorStatus || grokHeartbeat.operator?.status || 'unknown';
    timeline.push({
      id: grokHeartbeat.heartbeatId || 'holoshell-grok-heartbeat',
      kind: 'grok_heartbeat',
      title: `Grok heartbeat ${grokHeartbeat.summary.status || 'unknown'}`,
      detail: `Presence ${grokHeartbeat.summary.agentPresenceStatus || 'unknown'}; operator ${operatorLabel}; auth ${grokHeartbeat.summary.authRuntimeStatus || 'unknown'}; Heavy ${grokHeartbeat.summary.heavyAccessStatus || 'unknown'}; observation ${grokHeartbeat.summary.latestObservationStatus || 'none'}${grokHeartbeat.summary.primaryFinding ? `; saw ${grokHeartbeat.summary.primaryFinding}` : ''}.`,
      trustState: operatorLabel === 'trusted_ready' ? 'verified' : grokHeartbeat.summary.agentPresenceStatus === 'active_or_available' ? 'partial' : 'unknown',
      generatedAt: grokHeartbeat.generatedAt || now,
      receiptType: grokHeartbeat.schemaVersion || 'hololand.holoshell.grok-heartbeat.v0.1.0',
      source: grokHeartbeat.sourceAnchors?.adapter || 'scripts/holoshell-grok-heartbeat.mjs',
    });
  }

  if (hardwareApproval?.summary) {
    timeline.push({
      id: hardwareApproval.approvalId || 'hardware-approval',
      kind: 'hardware_approval',
      title: `Hardware approval ${hardwareApproval.summary.status || 'unknown'}`,
      detail: `${hardwareApproval.summary.actionKind || 'unknown action'} for ${hardwareApproval.summary.target || 'local computer'}; execution ${hardwareApproval.summary.executionAllowed ? 'allowed after approval' : 'blocked'}; trust ${hardwareApproval.summary.trustLevel || 'unknown'}.`,
      trustState: hardwareApproval.summary.executionAllowed ? 'partial' : hardwareApproval.summary.status === 'not_required' ? 'verified' : 'unknown',
      generatedAt: hardwareApproval.generatedAt || now,
      receiptType: 'hololand.holoshell.hardware-approval.v0.1.0',
      source: 'scripts/holoshell-approval-bundle.mjs',
    });
  }

  if (accountTaskCustody?.summary) {
    const summary = accountTaskCustody.summary;
    timeline.push({
      id: accountTaskCustody.custodyId || 'account-task-custody',
      kind: 'account_task_custody',
      title: `Account task custody ${summary.status || 'unknown'}`,
      detail: `${summary.provider || 'unknown provider'} account boundary ${summary.accountBoundaryStatus || 'unknown'}; draft ${summary.draftHash ? 'hash-bound' : 'missing'}; execution ${summary.executionAllowed ? 'allowed after approval' : 'blocked until fresh approval'}.`,
      trustState: summary.accountMutationPerformed || summary.sourceFileMutationPerformed ? 'partial' : 'verified',
      generatedAt: accountTaskCustody.generatedAt || now,
      receiptType: accountTaskCustody.schemaVersion,
      source: accountTaskCustody.sourceAnchors?.adapter || 'scripts/holoshell-account-task-custody.mjs',
    });
  }

  if (packageCustody?.summary) {
    const summary = packageCustody.summary;
    timeline.push({
      id: packageCustody.id || 'package-custody',
      kind: 'package_custody',
      title: `Package custody ${summary.status || 'unknown'}`,
      detail: `${summary.packageName || summary.packageId || 'unknown package'} ${summary.fromVersion || 'unknown'} -> ${summary.toVersion || 'unknown'} via ${summary.manager || 'unknown manager'}; execution ${summary.executionAllowed ? 'allowed after approval' : 'blocked until native gate'}.`,
      trustState: summary.mutationPerformed ? 'partial' : packageCustody.schemaContract?.status === 'valid' ? 'verified' : 'unknown',
      generatedAt: packageCustody.generatedAt || now,
      receiptType: packageCustody.schemaVersion,
      source: packageCustody.sourceAnchors?.adapter || 'scripts/holoshell-package-custody.mjs',
    });
  }

  if (trustLedger?.summary) {
    timeline.push({
      id: trustLedger.latestAction?.fingerprint || 'holoshell-trust-ledger',
      kind: 'trusted_autonomy',
      title: `Trust ladder ${trustLedger.summary.latestTrustLevel || 'unknown'}`,
      detail: `${trustLedger.summary.latestActionKind || 'no action'} for ${trustLedger.summary.latestTarget || 'local computer'}; trusted records ${trustLedger.summary.trustedRecordCount || 0}/${trustLedger.summary.recordCount || 0}; ${trustLedger.summary.successesUntilTrusted || 0} success(es) until trusted.`,
      trustState: trustLedger.summary.trustedAutonomyEligible ? 'verified' : trustLedger.summary.status === 'ready' ? 'partial' : 'unknown',
      generatedAt: trustLedger.generatedAt || now,
      receiptType: trustLedger.schemaVersion,
      source: trustLedger.sourceAnchors?.adapter || 'scripts/holoshell-trust-ledger.mjs',
    });
  }

  if (workflow?.summary) {
    const workflowKind = workflow.summary.workflowKind || workflow.profile || 'workflow';
    const workflowDetail = workflowKind === 'grok_build'
      ? `${workflow.summary.stepCount || 0} steps, ${workflow.summary.pendingApprovalCount || 0} pending approval(s), mode ${workflow.summary.mode || 'interactive'}, model ${workflow.summary.model || 'grok-build'}, project ${workflow.summary.projectTrustStatus || 'unknown'}.`
      : `${workflow.summary.stepCount || 0} steps, ${workflow.summary.pendingApprovalCount || 0} pending approval(s), lane ${workflow.summary.taskLane || 'local'}, tag ${workflow.summary.taskTag || 'local'}, route ${workflow.summary.modelRoute || 'sovereign_local'}/${workflow.summary.model || 'sovereign-local'}.`;
    timeline.push({
      id: workflow.workflowId || 'holoshell-workflow',
      kind: 'workflow',
      title: `${workflow.title || 'HoloShell workflow'} ${workflow.summary.status || 'unknown'}`,
      detail: workflowDetail,
      trustState: workflow.summary.mutationExecuted ? 'partial' : workflow.summary.status === 'pending_user_approval' ? 'partial' : 'verified',
      generatedAt: workflow.generatedAt || workflow.createdAt || now,
      receiptType: 'hololand.holoshell.workflow.v0.1.0',
      source: workflow.sourceAnchors?.adapter || workflow.source?.script || 'scripts/holoshell-room-marathon-workflow.mjs',
    });

    if (workflowKind === 'grok_build' && workflow.grokObservation?.summary) {
      const observation = workflow.grokObservation;
      timeline.push({
        id: observation.observationId || `${workflow.workflowId || 'grok-build'}-observation`,
        kind: 'grok_observation',
        title: `Grok observed ${observation.summary.status || 'unknown'}`,
        detail: observation.summary.primaryFinding || 'Grok returned a peer observation for Brittney.',
        trustState: observation.summary.status === 'completed' ? 'verified' : 'partial',
        generatedAt: observation.generatedAt || workflow.generatedAt || now,
        receiptType: observation.schemaVersion || 'hololand.holoshell.grok-observation.v0.1.0',
        source: observation.sourceAnchors?.adapter || workflow.sourceAnchors?.adapter || 'scripts/holoshell-grok-build-workflow.mjs',
      });
    }
  }

  if (sovereignRoomMarathon?.summary) {
    const summary = sovereignRoomMarathon.summary;
    timeline.push({
      id: sovereignRoomMarathon.receiptId || 'sovereign-room-marathon',
      kind: 'sovereign_room_marathon',
      title: `Sovereign room marathon ${summary.status || 'unknown'}`,
      detail: `${summary.queueOpenCount || 0} open task(s), ${summary.matchedCandidateCount || 0} ${summary.taskTag || summary.taskLane || 'local'} candidate(s); selected ${summary.selectedTaskTitle || 'none'}; claim ${summary.claimSucceeded ? 'succeeded' : summary.claimAttempted ? 'attempted' : 'not attempted'}; next ${summary.nextAction || 'unknown'}.`,
      trustState: summary.claimSucceeded
        ? 'partial'
        : summary.status === 'ready_to_claim' || summary.status === 'empty'
          ? 'verified'
          : 'unknown',
      generatedAt: sovereignRoomMarathon.generatedAt || now,
      receiptType: sovereignRoomMarathon.schemaVersion,
      source: sovereignRoomMarathon.sourceAnchors?.adapter || 'scripts/holoshell-sovereign-room-marathon.mjs',
    });
  }

  if (workflowApproval?.summary) {
    timeline.push({
      id: workflowApproval.approvalId || 'holoshell-workflow-approval',
      kind: 'workflow_approval',
      title: `Workflow approval ${workflowApproval.summary.status || 'unknown'}`,
      detail: `${workflowApproval.summary.title || 'HoloShell workflow'}; ${workflowApproval.summary.pendingApprovalCount || 0} guarded approval(s); execution ${workflowApproval.summary.executionAllowed ? 'allowed after gesture' : 'blocked'}.`,
      trustState: workflowApproval.summary.executionAllowed ? 'partial' : 'verified',
      generatedAt: workflowApproval.generatedAt || workflowApproval.createdAt || now,
      receiptType: 'hololand.holoshell.workflow-approval.v0.1.0',
      source: workflowApproval.sourceAnchors?.adapter || workflowApproval.source?.script || 'scripts/holoshell-workflow-approval-bundle.mjs',
    });
  }

  if (workflowIntentGate?.summary) {
    timeline.push({
      id: workflowIntentGate.gateId || 'holoshell-brain-intent-gate',
      kind: 'brain_intent_gate',
      title: `Brain intent gate ${workflowIntentGate.summary.status || 'unknown'}`,
      detail: `${workflowIntentGate.summary.caseId || 'unknown case'}; execution ${workflowIntentGate.summary.executionAllowed ? 'allowed' : 'blocked'}; ${workflowIntentGate.summary.failedCheckCount || 0} failed check(s).`,
      trustState: workflowIntentGate.summary.executionAllowed ? 'verified' : 'partial',
      generatedAt: workflowIntentGate.generatedAt || now,
      receiptType: workflowIntentGate.schemaVersion,
      source: 'scripts/holoshell-brain-intent-gate.mjs',
    });
  }

  if (shardWorkflow?.summary) {
    timeline.push({
      id: shardWorkflow.workflowId || 'holoshell-asset-shard-workflow',
      kind: 'asset_shard_workflow',
      title: `Asset shard workflow ${shardWorkflow.summary.status || 'unknown'}`,
      detail: `${shardWorkflow.summary.assetCount || 0} assets, ${shardWorkflow.summary.modelCount || 0} model(s), ${shardWorkflow.summary.imageCount || 0} image(s), ${shardWorkflow.summary.audioCount || 0} audio file(s); import approval ${shardWorkflow.summary.approvalRequired ? 'required' : 'not required'}.`,
      trustState: shardWorkflow.summary.status === 'staged' ? 'verified' : 'partial',
      generatedAt: shardWorkflow.generatedAt || now,
      receiptType: shardWorkflow.schemaVersion,
      source: shardWorkflow.output?.latestPath || 'scripts/holoshell-asset-shard-workflow.mjs',
    });
  }

  if (shardImportApproval?.summary) {
    timeline.push({
      id: shardImportApproval.approvalId || 'holoshell-shard-import-approval',
      kind: 'asset_shard_import_approval',
      title: `Shard import approval ${shardImportApproval.summary.status || 'unknown'}`,
      detail: `${shardImportApproval.summary.assetCount || 0} assets for ${shardImportApproval.summary.shardId || 'asset shard'}; execution ${shardImportApproval.summary.executionAllowed ? 'allowed after approval' : 'blocked'}.`,
      trustState: shardImportApproval.summary.executionAllowed ? 'partial' : 'verified',
      generatedAt: shardImportApproval.generatedAt || now,
      receiptType: shardImportApproval.schemaVersion,
      source: shardImportApproval.output?.latestPath || 'scripts/holoshell-shard-import-approval.mjs',
    });
  }

  if (shardImport?.summary && shardImport.summary.status !== 'not_run') {
    timeline.push({
      id: shardImport.importId || 'holoshell-shard-import',
      kind: 'asset_shard_import_receipt',
      title: `Shard import ${shardImport.summary.status || 'unknown'}`,
      detail: `${shardImport.summary.assetCount || 0} assets imported into runtime-local shard ${shardImport.summary.shardId || 'unknown'}; source assets mutated ${shardImport.summary.sourceAssetsMutated ? 'yes' : 'no'}.`,
      trustState: shardImport.summary.status === 'completed' && !shardImport.summary.sourceAssetsMutated ? 'verified' : 'partial',
      generatedAt: shardImport.generatedAt || now,
      receiptType: shardImport.schemaVersion,
      source: shardImport.output?.receiptPath || 'scripts/holoshell-shard-import-approval.mjs',
    });
  }

  for (const receipt of runReceipts.slice(0, 12)) {
    timeline.push({
      id: receipt.runId,
      kind: 'run_receipt',
      title: `${receipt.name || 'Run'} ${receipt.status || 'recorded'}`,
      detail: runReceiptDetail(receipt),
      trustState: runReceiptTrustState(receipt),
      generatedAt: receipt.timing?.endedAt || receipt.timing?.plannedAt || now,
      receiptType: receipt.schemaVersion,
      source: receipt.output?.receiptPath || '.tmp/holoshell/run-receipts',
      networkGate: receipt.networkGate
        ? {
            allowed: Boolean(receipt.networkGate.allowed),
            intent: receipt.networkGate.intent || receipt.command?.networkIntent || 'unknown',
            bandwidthSpending: Boolean(receipt.networkGate.bandwidthSpending),
            classification: receipt.networkGate.classification || null,
            ownerGesture: Boolean(receipt.networkGate.ownerGesture),
          }
        : null,
    });
  }

  for (const receipt of pilotReceipts.slice(0, 12)) {
    timeline.push({
      id: receipt.receiptId,
      kind: 'pilot_receipt',
      title: receipt.title || `${receipt.pilot} pilot receipt`,
      detail: receipt.summary || receipt.outcome || 'Pilot outcome recorded.',
      trustState: receipt.trustState || 'partial',
      generatedAt: receipt.generatedAt || now,
      receiptType: receipt.schemaVersion,
      source: receipt.source || '.tmp/holoshell/pilot-receipts',
    });
  }

  return timeline
    .filter((item) => item.id)
    .sort((left, right) => String(right.generatedAt).localeCompare(String(left.generatedAt)))
    .slice(0, 32);
}

function createFeed(args) {
  const tmpDir = resolveRepoPath(args.tmpDir);
  const inventory = readJson(path.join(tmpDir, 'capability-inventory.json'), {});
  const surfaceMap = readJson(path.join(tmpDir, 'holoscript-surface-map.json'), {});
  const goldCodebaseBridge = readJson(path.join(tmpDir, 'holoscript-gold-codebase-bridge.json'), {});
  const wildHoloScript = readJson(path.join(tmpDir, 'wild-holoscript-intake.json'), {});
  const formatInventory = readJson(path.join(tmpDir, 'format-inventory.json'), {});
  const founderBootPreview = readJson(path.join(tmpDir, 'founder-boot-preview.json'), {});
  const founderHost = readJson(path.join(tmpDir, 'founder-host.json'), {});
  const nativeWrapper = readJson(path.join(tmpDir, 'native-wrapper.json'), {});
  const startupIntegration = readJson(path.join(tmpDir, 'startup-integration.json'), {});
  const userShellProjection = readJson(path.join(tmpDir, 'user-shell-projection.json'), {});
  const developmentalEnvironment = readJson(path.join(tmpDir, 'developmental-environment.json'), {});
  const lanes = readJson(path.join(tmpDir, 'agent-lanes.json'), {});
  const processHealth = readJson(path.join(tmpDir, 'process-health.json'), {});
  const networkReality = readJson(path.join(tmpDir, 'network-reality.json'), {});
  const networkFreshness = readJson(path.join(tmpDir, 'network-freshness.json'), {});
  const networkChangeEvents = readJson(path.join(tmpDir, 'network-change-events.json'), {});
  const networkSentinelService = readJson(path.join(tmpDir, 'network-sentinel-service.json'), {});
  const serviceSupervisor = readJson(path.join(tmpDir, 'service-supervisor.json'), {});
  const desktopBridgeStatus = readJson(path.join(tmpDir, 'desktop-control-bridge', 'latest-status.json'), {});
  const legacyAppReality = readJson(path.join(tmpDir, 'legacy-app-reality.json'), {});
  const mcpCustodyContract = readJson(path.join(tmpDir, 'mcp-custody-contract.json'), {});
  const mcpUpstreamHandoff = readJson(path.join(tmpDir, 'mcp-custody-upstream-handoff.json'), {});
  const osUiCapture = readJson(path.join(tmpDir, 'os-ui-capture.json'), {});
  const programRegistry = readJson(path.join(tmpDir, 'program-registry.json'), {});
  const readinessEvidence = readJson(path.join(tmpDir, 'readiness-evidence.json'), {});
  const fleetReadiness = readJson(path.join(tmpDir, 'fleet-readiness-evidence.json'), {});
  const shellObjects = readJson(path.join(tmpDir, 'shell-objects.json'), {});
  const brittneyAvatar = readJson(path.join(tmpDir, 'brittney-avatar.json'), {});
  const brittneyTurn = readJson(path.join(tmpDir, 'brittney-turn-latest.json'), {});
  const brittneyContext = readJson(path.join(tmpDir, 'brittney-context.json'), {});
  const operatorBrief = readJson(path.join(tmpDir, 'operator-brief.json'), {});
  const operatingTurn = readJson(path.join(tmpDir, 'operating-turn.json'), {});
  const founderCommand = readJson(path.join(tmpDir, 'founder-command-latest.json'), {});
  const founderEvidenceDemo = readJson(path.join(tmpDir, 'founder-evidence-demo-latest.json'), {});
  const receiptControl = readJson(path.join(tmpDir, 'receipt-control-latest.json'), {});
  const agentDispatch = readJson(path.join(tmpDir, 'agent-dispatch-latest.json'), {});
  const laptopReasoningBridge = readJson(path.join(tmpDir, 'laptop-reasoning-bridge-latest.json'), {});
  const laptopReasoningResult = readJson(path.join(tmpDir, 'laptop-reasoning-result-latest.json'), {});
  const grokBuild = readJson(path.join(tmpDir, 'grok-build-setup.json'), {});
  const grokHeartbeat = readJson(path.join(tmpDir, 'grok-heartbeat.json'), {});
  const hardwareAction = readJson(path.join(tmpDir, 'action-latest.json'), {});
  const hardwareApproval = readJson(path.join(tmpDir, 'approval-latest.json'), {});
  const accountTaskCustody = readJson(path.join(tmpDir, 'account-task-custody-latest.json'), {});
  const packageCustody = readJson(path.join(tmpDir, 'package-custody-latest.json'), {});
  const trustLedger = readJson(path.join(tmpDir, 'trust-ledger.json'), {});
  const workflow = readJson(path.join(tmpDir, 'workflow-latest.json'), {});
  const sovereignRoomMarathon = readJson(path.join(tmpDir, 'sovereign-room-marathon-latest.json'), {});
  const workflowApproval = readJson(path.join(tmpDir, 'workflow-approval-latest.json'), {});
  const workflowIntentGate = readJson(path.join(tmpDir, 'brain-intent-gate-latest.json'), {});
  const shardWorkflow = readJson(path.join(tmpDir, 'shard-workflow-latest.json'), {});
  const shardImportApproval = readJson(path.join(tmpDir, 'shard-import-approval-latest.json'), {});
  const shardImport = readJson(path.join(tmpDir, 'shard-import-latest.json'), {});
  const runRegistry = readJson(path.join(tmpDir, 'run-registry.json'), { runs: [] });
  const runReceipts = readReceiptFiles(path.join(tmpDir, 'run-receipts'));
  const actionReceipts = readReceiptFiles(path.join(tmpDir, 'action-receipts'));
  const approvalBundles = readReceiptFiles(path.join(tmpDir, 'approval-bundles'));
  const accountTaskCustodyReceipts = readReceiptFiles(path.join(tmpDir, 'account-task-custody-receipts'));
  const packageCustodyReceipts = readReceiptFiles(path.join(tmpDir, 'package-custody-receipts'));
  const workflowApprovalBundles = readReceiptFiles(path.join(tmpDir, 'workflow-approval-bundles'));
  const shardImportApprovalBundles = readReceiptFiles(path.join(tmpDir, 'shard-import-approval-bundles'));
  const pilotReceipts = readReceiptFiles(path.join(tmpDir, 'pilot-receipts'));
  const stopPlans = [
    ...(Array.isArray(processHealth?.stopPlans) ? processHealth.stopPlans : []),
    ...(processHealth?.stopPlan ? [processHealth.stopPlan] : []),
  ].filter(Boolean);
  const timeline = createTimeline({
    inventory,
    surfaceMap,
    goldCodebaseBridge,
    wildHoloScript,
    formatInventory,
    founderBootPreview,
    founderHost,
    nativeWrapper,
    startupIntegration,
    userShellProjection,
    developmentalEnvironment,
    lanes,
    processHealth,
    networkReality,
    networkFreshness,
    networkChangeEvents,
    networkSentinelService,
    serviceSupervisor,
    desktopBridgeStatus,
    legacyAppReality,
    mcpCustodyContract,
    mcpUpstreamHandoff,
    osUiCapture,
    programRegistry,
    readinessEvidence,
    fleetReadiness,
    shellObjects,
    brittneyAvatar,
    brittneyTurn,
    brittneyContext,
    operatorBrief,
    operatingTurn,
    founderCommand,
    founderEvidenceDemo,
    receiptControl,
    agentDispatch,
    laptopReasoningBridge,
    laptopReasoningResult,
    grokBuild,
    grokHeartbeat,
    hardwareAction,
    hardwareApproval,
    accountTaskCustody,
    packageCustody,
    trustLedger,
    workflow,
    sovereignRoomMarathon,
    workflowApproval,
    workflowIntentGate,
    shardWorkflow,
    shardImportApproval,
    shardImport,
    runReceipts,
    pilotReceipts,
  });
  const trust = trustCounts(inventory?.capabilities || []);
  const processRisk = processHealth?.summary?.riskState || 'unknown';
  const networkRisk = networkReality?.health?.state || 'pass';
  const freshnessRisk = networkFreshnessRisk(networkFreshness);
  const networkChangeRisk = networkChangeSentinelRisk(networkChangeEvents);
  const sentinelServiceRisk = networkSentinelServiceRisk(networkSentinelService);
  const supervisorRisk = serviceSupervisorRisk(serviceSupervisor);
  const desktopBridgeRiskState = desktopBridgeRisk(desktopBridgeStatus);
  const legacyRealityRisk = legacyRealityContractStatus(legacyAppReality) === 'fail'
    ? 'warn'
    : legacyRealityContractStatus(legacyAppReality) === 'missing'
      ? 'unknown'
      : 'pass';
  const runNetworkBlockedCount = runReceipts.filter((receipt) => receipt.networkGate && !receipt.networkGate.allowed).length;
  const runBandwidthSpendingCount = runReceipts.filter((receipt) => receipt.networkGate?.bandwidthSpending || receipt.command?.bandwidthSpending).length;
  const runOwnerNetworkGestureCount = runReceipts.filter((receipt) => receipt.networkGate?.ownerGesture).length;
  const mcpCustodyRisk = riskFromEvidenceStatus(mcpCustodyContract?.summary?.status || 'unknown');
  const mcpHandoffRisk = mcpUpstreamHandoff?.summary?.status === 'ready_for_upstream_agent'
    ? 'warn'
    : mcpUpstreamHandoff?.summary?.status === 'native_ready_no_handoff_needed'
      ? 'pass'
      : 'unknown';
  const readinessRisk = riskFromEvidenceStatus(readinessEvidence?.summary?.status || 'unknown');
  const fleetRisk = fleetReadiness?.summary?.status === 'blocked'
    ? 'warn'
    : riskFromEvidenceStatus(fleetReadiness?.summary?.status || 'unknown');
  const founderHostRisk = founderHost?.summary?.status === 'native_host_present'
    ? 'pass'
    : founderHost?.summary?.status === 'blocked_missing_source'
      ? 'fail'
      : founderHost?.summary?.status === 'ready_for_native_wrapper' || founderHost?.summary?.status === 'needs_receipt_refresh'
        ? 'warn'
        : 'unknown';
  const nativeWrapperRisk = nativeWrapper?.summary?.status === 'launchable_wrapper_present'
    ? 'pass'
    : nativeWrapper?.summary?.status === 'blocked_missing_source'
      ? 'fail'
      : nativeWrapper?.summary?.status === 'wrapper_present_browser_missing'
        ? 'warn'
        : 'unknown';
  const startupIntegrationRisk = ['registration_adapter_present', 'registered_at_user_login'].includes(startupIntegration?.summary?.status)
    ? 'pass'
    : startupIntegration?.summary?.status === 'blocked_missing_source'
      ? 'fail'
      : startupIntegration?.summary?.status === 'startup_folder_unavailable'
        ? 'warn'
        : 'unknown';
  const shardRisk = shardWorkflow?.summary?.status === 'blocked' ? 'warn' : shardWorkflow?.summary?.status === 'staged' ? 'pass' : 'unknown';
  const overallRisk = [processRisk, networkRisk, freshnessRisk, networkChangeRisk, sentinelServiceRisk, supervisorRisk, desktopBridgeRiskState, legacyRealityRisk, stopPlans.length ? 'warn' : 'pass', mcpCustodyRisk, mcpHandoffRisk, readinessRisk, fleetRisk, founderHostRisk, nativeWrapperRisk, startupIntegrationRisk, shardRisk]
    .sort((left, right) => riskRank(right) - riskRank(left))[0];

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-home.hsplus',
      hardwareControl: 'apps/holoshell/source/holoshell-hardware-control.hsplus',
      networkReality: 'apps/holoshell/source/holoshell-network-reality.hsplus',
      networkRealityAdapter: 'scripts/holoshell-network-reality.mjs',
      networkFreshness: 'apps/holoshell/source/holoshell-network-freshness-watch.hsplus',
      networkFreshnessAdapter: 'scripts/holoshell-network-freshness-watch.mjs',
      networkChangeSentinel: 'apps/holoshell/source/holoshell-network-change-sentinel.hsplus',
      networkChangeSentinelAdapter: 'scripts/holoshell-network-change-sentinel.mjs',
      networkSentinelService: 'apps/holoshell/source/holoshell-network-sentinel-service.hsplus',
      networkSentinelServiceAdapter: 'scripts/holoshell-network-sentinel-service.mjs',
      serviceSupervisor: 'apps/holoshell/source/holoshell-service-supervisor.hsplus',
      serviceSupervisorAdapter: 'scripts/holoshell-service-supervisor.mjs',
      desktopBridgeStatus: 'apps/holoshell/source/holoshell-desktop-control-bridge.hsplus',
      desktopBridgeStatusAdapter: 'scripts/holoshell-laptop-desktop-bridge.mjs',
      desktopBridgeStatusReceipt: '.tmp/holoshell/desktop-control-bridge/latest-status.json',
      legacyAppRealityAdapter: 'scripts/holoshell-legacy-app-reality.mjs',
      programRegistry: 'scripts/holoshell-program-registry.mjs',
      mcpCustodyContract: 'scripts/holoshell-mcp-custody-contract.mjs',
      mcpUpstreamHandoff: 'scripts/holoshell-mcp-upstream-handoff.mjs',
      readinessEvidence: 'scripts/holoshell-readiness-evidence.mjs',
      fleetReadinessEvidence: 'scripts/holoshell-fleet-readiness-evidence.mjs',
      shellObjects: 'scripts/holoshell-shell-objects.mjs',
      brittneyContext: 'scripts/holoshell-brittney-context.mjs',
      operatorBrief: 'scripts/holoshell-operator-brief.mjs',
      operatingTurn: 'scripts/holoshell-operating-turn.mjs',
      wildHoloScriptIntake: 'scripts/holoshell-wild-holoscript-intake.mjs',
      goldCodebaseBridge: 'scripts/holoshell-holoscript-gold-codebase-bridge.mjs',
      formatInventory: 'scripts/holoshell-format-inventory.mjs',
      founderBootPreview: 'scripts/holoshell-founder-boot-preview.mjs',
      founderHost: 'apps/holoshell/source/holoshell-founder-host.hsplus',
      founderHostAdapter: 'scripts/holoshell-founder-host.mjs',
      nativeWrapper: 'apps/holoshell/source/holoshell-native-wrapper.hsplus',
      nativeWrapperAdapter: 'scripts/holoshell-native-wrapper.mjs',
      startupIntegration: 'apps/holoshell/source/holoshell-startup-integration.hsplus',
      startupIntegrationAdapter: 'scripts/holoshell-startup-integration.mjs',
      userShellProjection: 'scripts/holoshell-user-shell-projection.mjs',
      developmentalEnvironment: 'scripts/holoshell-developmental-environment.mjs',
      founderCommand: 'scripts/holoshell-founder-command.mjs',
      founderEvidenceDemo: 'scripts/holoshell-founder-evidence-demo.mjs',
      receiptControl: 'scripts/holoshell-receipt-control.mjs',
      agentDispatch: 'scripts/holoshell-agent-dispatch.mjs',
      sovereignRoomMarathon: 'apps/holoshell/source/holoshell-sovereign-room-marathon.hsplus',
      sovereignRoomMarathonAdapter: 'scripts/holoshell-sovereign-room-marathon.mjs',
      laptopReasoningBridge: 'scripts/holoshell-laptop-reasoning-bridge.mjs',
      laptopReasoningResult: 'scripts/holoshell-laptop-reasoning-worker.mjs',
      grokBuildWorkflow: 'scripts/holoshell-grok-build-workflow.mjs',
      grokHeartbeat: 'scripts/holoshell-grok-heartbeat.mjs',
      trustedAutonomy: 'scripts/holoshell-trust-ledger.mjs',
      brainIntentGate: 'scripts/holoshell-brain-intent-gate.mjs',
      accountTaskCustody: 'scripts/holoshell-account-task-custody.mjs',
      assetShardWorkflow: 'scripts/holoshell-asset-shard-workflow.mjs',
      assetShardImportApproval: 'scripts/holoshell-shard-import-approval.mjs',
      prototype: 'apps/holoshell/prototype/local-capability-room.html',
      roadmap: 'apps/holoshell/docs/PHASE_1_ROADMAP.md',
    },
    summary: {
      overallRisk,
      capabilityCount: inventory?.summary?.capabilityCount || inventory?.capabilities?.length || 0,
      verifiedCapabilityCount: trust.verified || 0,
      partialCapabilityCount: trust.partial || 0,
      unknownCapabilityCount: trust.unknown || 0,
      legacyProgramCount: inventory?.summary?.legacyProgramCount || 0,
      holoscriptRoomCount: surfaceMap?.summary?.holoshellRoomCount || surfaceMap?.holoshellRooms?.length || 0,
      mcpToolCount: surfaceMap?.summary?.mcpToolCount || 0,
      cliCommandCount: surfaceMap?.summary?.cliCommandCount || 0,
      goldCodebaseBridgeStatus: goldCodebaseBridge?.summary?.status || 'unknown',
      goldDriveStatus: goldCodebaseBridge?.summary?.goldStatus || 'unknown',
      goldRootPresent: Boolean(goldCodebaseBridge?.summary?.goldRootPresent),
      goldEntryCount: goldCodebaseBridge?.summary?.goldEntryCount || 0,
      goldTierCount: goldCodebaseBridge?.summary?.goldTierCount || 0,
      goldHotEntryCount: goldCodebaseBridge?.summary?.goldHotEntryCount || 0,
      goldConflictPolicy: goldCodebaseBridge?.summary?.goldConflictPolicy || '',
      codebaseBridgeStatus: goldCodebaseBridge?.summary?.codebaseStatus || 'unknown',
      codebaseToolCount: goldCodebaseBridge?.summary?.codebaseToolCount || 0,
      codebaseCliCommandCount: goldCodebaseBridge?.summary?.codebaseCliCommandCount || 0,
      codebaseGraphCacheProtocol: goldCodebaseBridge?.summary?.graphCacheProtocol || 'unknown',
      codebaseForceAbsorbDefault: Boolean(goldCodebaseBridge?.summary?.forceAbsorbDefault),
      codebaseBridgeCapabilityCount: goldCodebaseBridge?.summary?.capabilityMapCount || 0,
      wildHoloScriptStatus: wildHoloScript?.summary?.status || 'unknown',
      wildHoloScriptFileCount: wildHoloScript?.summary?.fileCount || 0,
      wildHoloScriptHoloCount: wildHoloScript?.summary?.holoCount || 0,
      wildHoloScriptHsCount: wildHoloScript?.summary?.hsCount || 0,
      wildHoloScriptHsplusCount: wildHoloScript?.summary?.hsplusCount || 0,
      wildHoloScriptHoloFeatureCount: wildHoloScript?.summary?.holoFeatureCount || 0,
      wildHoloScriptHsFeatureCount: wildHoloScript?.summary?.hsFeatureCount || 0,
      wildHoloScriptHsplusFeatureCount: wildHoloScript?.summary?.hsplusFeatureCount || 0,
      wildHoloScriptHoloTopFeature: wildHoloScript?.summary?.holoTopFeature || '',
      wildHoloScriptHsTopFeature: wildHoloScript?.summary?.hsTopFeature || '',
      wildHoloScriptHsplusTopFeature: wildHoloScript?.summary?.hsplusTopFeature || '',
      wildHoloScriptFrontierSyntaxCount: wildHoloScript?.summary?.frontierSyntaxCount || 0,
      wildHoloScriptAdapterNeededCount: wildHoloScript?.summary?.adapterNeededCount || 0,
      wildHoloScriptCanonicalCandidateCount: wildHoloScript?.summary?.canonicalCandidateCount || 0,
      wildHoloScriptFlagshipCount: wildHoloScript?.summary?.flagshipCount || 0,
      wildHoloScriptTopPattern: wildHoloScript?.summary?.topPattern || '',
      wildHoloScriptNextMove: wildHoloScript?.summary?.nextMove || '',
      formatInventoryStatus: formatInventory?.summary?.status || 'unknown',
      formatInventoryTotalFileCount: formatInventory?.summary?.totalFileCount || 0,
      formatInventoryFeatureFamilyCount: formatInventory?.summary?.totalFeatureFamilies || 0,
      formatInventoryCardCount: formatInventory?.summary?.formatViewerCardCount || 0,
      founderBootStatus: founderBootPreview?.summary?.status || 'unknown',
      founderBootWorldObjectCount: founderBootPreview?.summary?.worldObjectCount || 0,
      founderBootRenderObjectCount: founderBootPreview?.summary?.renderObjectCount || 0,
      founderBootFormatCardCount: founderBootPreview?.summary?.formatViewerCardCount || 0,
      founderBootUserPackCount: founderBootPreview?.summary?.userCapabilityPackCount || 0,
      founderBootBrittneyProposalCount: founderBootPreview?.summary?.brittneyProposalCount || 0,
      founderHostStatus: founderHost?.summary?.status || 'unknown',
      founderHostPrimarySurfaceOwnership: founderHost?.summary?.primarySurfaceOwnership || 'unknown',
      founderHostSourceReady: Boolean(founderHost?.summary?.sourceReady),
      founderHostPreviewReady: Boolean(founderHost?.summary?.previewHostReady),
      founderHostNativeWrapperPresent: Boolean(founderHost?.summary?.nativeWrapperPresent),
      founderHostStartupIntegrationPresent: Boolean(founderHost?.summary?.startupIntegrationPresent),
      founderHostShellObjectGraphReady: Boolean(founderHost?.summary?.shellObjectGraphReady),
      founderHostLiveFeedReady: Boolean(founderHost?.summary?.liveFeedReady),
      founderHostServiceSupervisorReady: Boolean(founderHost?.summary?.serviceSupervisorReady),
      founderHostLocalMutationExecutionEnabled: Boolean(founderHost?.summary?.localMutationExecutionEnabled),
      founderHostNextMove: founderHost?.summary?.nextMove || '',
      nativeWrapperStatus: nativeWrapper?.summary?.status || 'unknown',
      nativeWrapperLaunchable: Boolean(nativeWrapper?.summary?.launchable),
      nativeWrapperLaunchMode: nativeWrapper?.summary?.launchMode || '',
      nativeWrapperBrowserCandidateCount: nativeWrapper?.summary?.browserCandidateCount || 0,
      nativeWrapperPrimaryBrowserFamily: nativeWrapper?.summary?.primaryBrowserFamily || 'none',
      nativeWrapperStartupIntegrationPresent: Boolean(nativeWrapper?.summary?.startupIntegrationPresent),
      nativeWrapperStartupRegistered: Boolean(nativeWrapper?.summary?.startupRegistered),
      nativeWrapperStartsWithoutManualHtml: Boolean(nativeWrapper?.summary?.startsWithoutManualHtml),
      nativeWrapperNextMove: nativeWrapper?.summary?.nextMove || '',
      startupIntegrationStatus: startupIntegration?.summary?.status || 'unknown',
      startupIntegrationPresent: Boolean(startupIntegration?.summary?.startupIntegrationPresent),
      startupIntegrationRegistered: Boolean(startupIntegration?.summary?.startupRegistered),
      startupIntegrationApprovalRequired: Boolean(startupIntegration?.summary?.approvalRequired),
      startupIntegrationMode: startupIntegration?.summary?.startupMode || '',
      startupIntegrationNextMove: startupIntegration?.summary?.nextMove || '',
      userShellProjectionStatus: userShellProjection?.summary?.status || 'unknown',
      userShellModeCount: userShellProjection?.summary?.modeCount || 0,
      userShellUserModeCount: userShellProjection?.summary?.userModeCount || 0,
      userShellCapabilityPackCount: userShellProjection?.summary?.capabilityPackCount || 0,
      userShellGuardedCapabilityPackCount: userShellProjection?.summary?.guardedCapabilityPackCount || 0,
      userShellFormatLessonCount: userShellProjection?.summary?.formatLessonCount || 0,
      userShellFounderOnlyPowerCount: userShellProjection?.summary?.founderOnlyPowerCount || 0,
      userShellBrittneyTranslationCount: userShellProjection?.summary?.brittneyTranslationCount || 0,
      userShellVisibleBubbleCount: userShellProjection?.summary?.visibleBubbleCount || 0,
      developmentalEnvironmentStatus: developmentalEnvironment?.summary?.status || 'unknown',
      developmentalEnvironmentSpineLayerCount: developmentalEnvironment?.summary?.spineLayerCount || 0,
      developmentalEnvironmentBoardTaskCount: developmentalEnvironment?.summary?.boardTaskCount || 0,
      developmentalEnvironmentOpenEngineeringTaskCount: developmentalEnvironment?.summary?.openEngineeringTaskCount || 0,
      developmentalEnvironmentResearchPresent: Boolean(developmentalEnvironment?.summary?.researchPresent),
      developmentalEnvironmentMassFunctionSettled: Boolean(developmentalEnvironment?.summary?.massFunctionSettled),
      developmentalEnvironmentMappingFunctionSettled: Boolean(developmentalEnvironment?.summary?.mappingFunctionSettled),
      developmentalEnvironmentHonestyPrinciple: developmentalEnvironment?.summary?.honestyPrinciple || '',
      developmentalEnvironmentNextMove: developmentalEnvironment?.summary?.nextMove || '',
      activeLaneCount: lanes?.summary?.activeLaneCount || 0,
      laneCount: lanes?.summary?.laneCount || lanes?.lanes?.length || 0,
      processRisk,
      processCount: processHealth?.summary?.processCount || 0,
      staleRunCount: processHealth?.summary?.staleRunCount || 0,
      highMemoryCount: processHealth?.summary?.highMemoryCount || 0,
      networkRealityStatus: networkReality?.underlay?.classification || 'unknown',
      networkRealityConfidence: networkReality?.underlay?.confidence || 'unknown',
      networkRealityOwnerDeclaredKind: networkReality?.underlay?.ownerDeclaredKind || 'none',
      networkRealityInterfaceKind: networkReality?.underlay?.osInterfaceKind || 'unknown',
      networkRealityOsCost: networkReality?.underlay?.osCost || 'Unknown',
      networkRealityConnectivity: networkReality?.underlay?.connectivity || 'Unknown',
      networkRealityVpnState: networkReality?.underlay?.vpnState || 'unknown',
      networkRealityHealthState: networkReality?.health?.state || 'unknown',
      networkRealityContractStatus: networkContractStatus(networkReality),
      networkRealityBandwidthPosture: networkReality?.policy?.bandwidthPosture || 'unknown',
      networkRealityHeavyWorkPolicy: networkReality?.policy?.heavyWorkPolicy || 'unknown',
      networkRealityBrittneyStance: networkReality?.brittney?.stance || 'unknown',
      networkRealityProtectBandwidth: Boolean(networkReality?.brittney?.protectBandwidth),
      networkRealityConsumerCount: networkReality?.lanes?.networkConsumerCount || 0,
      networkRealityAgentOrShellConsumerCount: networkReality?.lanes?.agentOrShellNetworkConsumerCount || 0,
      networkRealityLegacyConsumerCount: networkReality?.lanes?.legacyNetworkConsumerCount || 0,
      networkRealityProcessCountIsNotPeerCount: Boolean(networkReality?.lanes?.processCountIsNotPeerCount),
      networkFreshnessStatus: networkFreshness?.summary?.status || 'unknown',
      networkFreshnessRefreshReason: networkFreshness?.summary?.refreshReason || 'unknown',
      networkFreshnessPreviousClassification: networkFreshness?.summary?.previousClassification || 'unknown',
      networkFreshnessCurrentClassification: networkFreshness?.summary?.currentClassification || 'unknown',
      networkFreshnessSignatureChanged: Boolean(networkFreshness?.summary?.signatureChanged),
      networkFreshnessClassificationChanged: Boolean(networkFreshness?.summary?.classificationChanged),
      networkFreshnessStaleBeforeRefresh: Boolean(networkFreshness?.summary?.staleBeforeRefresh),
      networkFreshnessPreviousReceiptAgeMs: networkFreshness?.summary?.previousReceiptAgeMs ?? null,
      networkFreshnessMaxAgeMs: networkFreshness?.summary?.maxFreshnessMs ?? 0,
      networkFreshnessDependentRefreshStatus: networkFreshness?.summary?.dependentRefreshStatus || 'unknown',
      networkFreshnessLiveFeedRefreshed: Boolean(networkFreshness?.summary?.liveFeedRefreshed),
      networkFreshnessBrittneyContextRefreshed: Boolean(networkFreshness?.summary?.brittneyContextRefreshed),
      networkChangeSentinelStatus: networkChangeEvents?.summary?.status || 'unknown',
      networkChangeSentinelWatchMode: networkChangeEvents?.summary?.watchMode || 'unknown',
      networkChangeSentinelLastObservationKind: networkChangeEvents?.summary?.lastObservationKind || 'unknown',
      networkChangeSentinelLatestEventKind: networkChangeEvents?.summary?.latestEventKind || 'unknown',
      networkChangeSentinelEventCount: networkChangeEvents?.summary?.eventCount || 0,
      networkChangeSentinelChangeEventCount: networkChangeEvents?.summary?.changeEventCount || 0,
      networkChangeSentinelClassificationChangedCount: networkChangeEvents?.summary?.classificationChangedCount || 0,
      networkChangeSentinelSignatureChangedCount: networkChangeEvents?.summary?.signatureChangedCount || 0,
      networkChangeSentinelRefreshFailedCount: networkChangeEvents?.summary?.refreshFailedCount || 0,
      networkChangeSentinelLastObservedAt: networkChangeEvents?.summary?.lastObservedAt || '',
      networkChangeSentinelLastChangeAt: networkChangeEvents?.summary?.lastChangeAt || '',
      networkChangeSentinelCurrentClassification: networkChangeEvents?.summary?.currentClassification || 'unknown',
      networkSentinelServiceStatus: networkSentinelService?.summary?.serviceStatus || 'unknown',
      networkSentinelServicePid: networkSentinelService?.summary?.pid || 0,
      networkSentinelServicePidAlive: Boolean(networkSentinelService?.summary?.pidAlive),
      networkSentinelServicePidCommandVerified: Boolean(networkSentinelService?.summary?.pidCommandVerified),
      networkSentinelServiceRestartCount: networkSentinelService?.summary?.restartCount || 0,
      networkSentinelServiceHeartbeatAgeMs: networkSentinelService?.summary?.heartbeatAgeMs ?? null,
      networkSentinelServiceStaleHeartbeat: Boolean(networkSentinelService?.summary?.staleHeartbeat),
      networkSentinelServiceLastStartedAt: networkSentinelService?.summary?.lastStartedAt || '',
      networkSentinelServiceLastHeartbeatAt: networkSentinelService?.summary?.lastHeartbeatAt || '',
      networkSentinelServiceActionStatus: networkSentinelService?.action?.status || 'unknown',
      serviceSupervisorStatus: serviceSupervisor?.summary?.status || 'unknown',
      serviceSupervisorRequestedAction: serviceSupervisor?.summary?.requestedAction || 'unknown',
      serviceSupervisorServiceCount: serviceSupervisor?.summary?.serviceCount || 0,
      serviceSupervisorRequiredServiceCount: serviceSupervisor?.summary?.requiredServiceCount || 0,
      serviceSupervisorOnlineServiceCount: serviceSupervisor?.summary?.onlineServiceCount || 0,
      serviceSupervisorDegradedServiceCount: serviceSupervisor?.summary?.degradedServiceCount || 0,
      serviceSupervisorOfflineServiceCount: serviceSupervisor?.summary?.offlineServiceCount || 0,
      serviceSupervisorOptionalOfflineServiceCount: serviceSupervisor?.summary?.optionalOfflineServiceCount || 0,
      serviceSupervisorRequiredOnlineServiceCount: serviceSupervisor?.summary?.requiredOnlineServiceCount || 0,
      serviceSupervisorRequiredAttentionCount: serviceSupervisor?.summary?.requiredAttentionCount || 0,
      serviceSupervisorActionRequiredCount: serviceSupervisor?.summary?.actionRequiredCount || 0,
      serviceSupervisorManagedPidServiceCount: serviceSupervisor?.summary?.managedPidServiceCount || 0,
      serviceSupervisorVerifiedPidServiceCount: serviceSupervisor?.summary?.verifiedPidServiceCount || 0,
      serviceSupervisorHeartbeatOnlyServiceCount: serviceSupervisor?.summary?.heartbeatOnlyServiceCount || 0,
      serviceSupervisorLocalDaemonServiceCount: serviceSupervisor?.summary?.localDaemonServiceCount || 0,
      serviceSupervisorServiceMutationTaken: Boolean(serviceSupervisor?.summary?.serviceMutationTaken),
      serviceSupervisorDestructiveActionsTaken: Boolean(serviceSupervisor?.receipt?.destructiveActionsTaken),
      desktopBridgeStatus: desktopBridgeStatusValue(desktopBridgeStatus),
      laptopDesktopBridgeStatus: desktopBridgeStatusValue(desktopBridgeStatus),
      desktopBridgeRawStatus: desktopBridgeStatus?.status || 'unknown',
      desktopBridgeFreshness: desktopBridgeFreshness(desktopBridgeStatus),
      desktopBridgeReceiptAgeMs: desktopBridgeReceiptAgeMs(desktopBridgeStatus),
      desktopBridgeFreshnessMaxMs: DESKTOP_BRIDGE_FRESH_MS,
      desktopBridgeGeneratedAt: desktopBridgeStatus?.generatedAt || '',
      desktopBridgeUrl: desktopBridgeStatus?.url || '',
      desktopBridgeHostRole: desktopBridgeStatus?.hostRole || '',
      desktopBridgeCapabilityCount: Array.isArray(desktopBridgeStatus?.capabilities) ? desktopBridgeStatus.capabilities.length : 0,
      desktopBridgeDestructiveActionsTaken: Boolean(desktopBridgeStatus?.destructiveActionsTaken),
      desktopBridgeDesktopAutomationExecuted: Boolean(desktopBridgeStatus?.desktopAutomationExecuted),
      desktopBridgeApprovalRequiredForAutomation: Boolean(desktopBridgeStatus?.approvalRequiredForDesktopAutomation),
      legacyAppRealityStatus: legacyAppReality?.summary?.confidence || 'unknown',
      legacyAppRealityContractStatus: legacyRealityContractStatus(legacyAppReality),
      legacyAppRealityProcessCount: legacyAppReality?.summary?.processCount || 0,
      legacyAppRealityVisibleWindowCount: legacyAppReality?.summary?.visibleWindowCount || 0,
      legacyAppRealityAgentInstanceCount: legacyAppReality?.summary?.agentInstanceCount || 0,
      legacyAppRealityShellInstanceCount: legacyAppReality?.summary?.shellInstanceCount || 0,
      legacyAppRealityLegacyAppCount: legacyAppReality?.summary?.legacyAppCount || 0,
      legacyAppRealityBrowserCount: legacyAppReality?.summary?.browserCount || 0,
      legacyAppRealityNetworkConsumerCount: legacyAppReality?.summary?.networkConsumerCount || 0,
      legacyAppRealityHeavyNetworkConsumerCount: legacyAppReality?.summary?.heavyNetworkConsumerCount || 0,
      legacyAppRealityColorLaneCount: legacyAppReality?.summary?.colorLaneCount || 0,
      legacyAppRealityProcessCountIsPeerCount: Boolean(legacyAppReality?.summary?.processCountIsPeerCount),
      runNetworkBlockedCount,
      runBandwidthSpendingCount,
      runOwnerNetworkGestureCount,
      mcpCustodyContractStatus: mcpCustodyContract?.summary?.status || 'unknown',
      mcpCustodyCompatibilityMode: mcpCustodyContract?.summary?.compatibilityMode || 'unknown',
      nativeMcpCustodySplit: Boolean(mcpCustodyContract?.summary?.nativeMcpCustodySplit),
      mcpCustodyCleanupCandidateCount: mcpCustodyContract?.summary?.cleanupCandidateCount || 0,
      mcpCustodyOwnerHandoffPlanCount: mcpCustodyContract?.summary?.ownerHandoffPlanCount || 0,
      mcpCustodyCheckFailCount: mcpCustodyContract?.summary?.checkFailCount || 0,
      mcpUpstreamHandoffStatus: mcpUpstreamHandoff?.summary?.status || 'unknown',
      mcpUpstreamHandoffTargetTool: mcpUpstreamHandoff?.summary?.targetTool || '',
      mcpUpstreamHandoffTaskCount: mcpUpstreamHandoff?.summary?.taskCount || 0,
      mcpUpstreamHandoffAcceptanceGateCount: mcpUpstreamHandoff?.summary?.acceptanceGateCount || 0,
      capturedWindowCount: osUiCapture?.summary?.windowCount || 0,
      capturedControlCount: osUiCapture?.summary?.controlCount || 0,
      capturedGeometryNodeCount: osUiCapture?.summary?.geometryNodeCount || 0,
      osUiCaptureStatus: osUiCapture?.summary?.status || 'unknown',
      osUiTargetApp: osUiCapture?.summary?.targetApp || '',
      osUiTargetMatched: Boolean(osUiCapture?.summary?.targetMatched),
      osUiTargetResolved: Boolean(osUiCapture?.summary?.targetResolved || osUiCapture?.summary?.targetMatched),
      osUiTargetResolution: osUiCapture?.summary?.targetResolution || '',
      osUiSelectedAppName: osUiCapture?.summary?.selectedAppName || '',
      osUiSelectedMutationPolicy: osUiCapture?.summary?.selectedMutationPolicy || '',
      osUiActionBridgeStatus: osUiCapture?.summary?.actionBridgeStatus || 'unknown',
      programRegistryStatus: programRegistry?.summary?.status || 'unknown',
      installedProgramCount: programRegistry?.summary?.programCount || 0,
      launchableProgramCount: programRegistry?.summary?.launchableProgramCount || 0,
      startMenuProgramCount: programRegistry?.summary?.startMenuProgramCount || 0,
      appPathProgramCount: programRegistry?.summary?.appPathProgramCount || 0,
      programRegistryRunningWindowCount: programRegistry?.summary?.runningWindowCount || 0,
      readinessEvidenceStatus: readinessEvidence?.summary?.status || 'unknown',
      readinessScenario: readinessEvidence?.summary?.scenario || '',
      readinessTokenCount: readinessEvidence?.summary?.tokenCount || 0,
      readinessWarningCount: readinessEvidence?.summary?.warningCount || 0,
      readinessBuildStatus: readinessEvidence?.summary?.buildStatus || 'unknown',
      readinessValidationStatus: readinessEvidence?.summary?.validationStatus || 'unknown',
      readinessDeviceLabStatus: readinessEvidence?.summary?.deviceLabStatus || 'unknown',
      readinessWasmSimdStatus: readinessEvidence?.summary?.wasmSimdStatus || 'unknown',
      readinessWebgpuStatus: readinessEvidence?.summary?.webgpuStatus || 'unknown',
      readinessHeadsetStatus: readinessEvidence?.summary?.headsetStatus || 'unknown',
      readinessReplayStatus: readinessEvidence?.summary?.replayStatus || 'unknown',
      readinessGraphStatus: readinessEvidence?.summary?.graphStatus || 'unknown',
      readinessTaskCount: readinessEvidence?.summary?.taskCount || 0,
      readinessNextWorkflow: readinessEvidence?.summary?.nextWorkflow || '',
      worldBuildBlockingReasonCount: readinessEvidence?.worldBuildReadyToken?.blockingReasons?.length || 0,
      fleetReadinessStatus: fleetReadiness?.summary?.status || 'unknown',
      fleetReadinessId: fleetReadiness?.fleetReadinessId || '',
      fleetJobId: fleetReadiness?.summary?.jobId || '',
      fleetLaneId: fleetReadiness?.summary?.laneId || '',
      fleetOwnerLaneId: fleetReadiness?.summary?.ownerLaneId || '',
      fleetBudgetStatus: fleetReadiness?.summary?.budgetStatus || 'unknown',
      fleetHeartbeatAgeMs: fleetReadiness?.summary?.heartbeatAgeMs ?? null,
      fleetPermissionEnvelope: fleetReadiness?.summary?.permissionEnvelope || '',
      fleetBlockedReasonCount: fleetReadiness?.summary?.blockedReasonCount || 0,
      fleetGateCount: fleetReadiness?.summary?.gateCount || 0,
      fleetPassGateCount: fleetReadiness?.summary?.passGateCount || 0,
      fleetBlockedGateCount: fleetReadiness?.summary?.blockedGateCount || 0,
      fleetLaunchReceiptRequired: Boolean(fleetReadiness?.summary?.launchReceiptRequired),
      fleetStopReceiptRequired: Boolean(fleetReadiness?.summary?.stopReceiptRequired),
      fleetMutationPerformed: Boolean(fleetReadiness?.summary?.mutationPerformed),
      shellObjectGraphStatus: shellObjects?.summary?.status || 'unknown',
      shellObjectCount: shellObjects?.summary?.shellObjectCount || 0,
      firstScreenObjectCount: shellObjects?.summary?.firstScreenObjectCount || 0,
      appShellObjectCount: shellObjects?.summary?.programObjectCount || 0,
      browserShellObjectCount: shellObjects?.summary?.browserSurfaceCount || 0,
      terminalShellObjectCount: shellObjects?.summary?.terminalSurfaceCount || 0,
      documentAppShellObjectCount: shellObjects?.summary?.documentAppCount || 0,
      agentShellObjectCount: shellObjects?.summary?.agentObjectCount || 0,
      workflowShellObjectCount: shellObjects?.summary?.workflowObjectCount || 0,
      approvalShellObjectCount: shellObjects?.summary?.approvalObjectCount || 0,
      receiptShellObjectCount: shellObjects?.summary?.receiptObjectCount || 0,
      capturedShellObjectCount: shellObjects?.summary?.capturedWindowObjectCount || 0,
      runningShellObjectCount: shellObjects?.summary?.runningObjectCount || 0,
      guardedShellObjectCount: shellObjects?.summary?.guardedExecuteCount || 0,
      firstProgramShellObject: shellObjects?.summary?.firstProgramObject || '',
      brittneyAvatarStatus: brittneyAvatar?.summary?.avatarStatus || 'unknown',
      brittneyRuntimeStatus: brittneyAvatar?.summary?.runtimeStatus || 'unknown',
      brittneyEmotion: brittneyAvatar?.summary?.emotion || 'attentive',
      brittneyVoiceState: brittneyAvatar?.summary?.voiceState || 'ready',
      brittneyRuntimeRoute: brittneyAvatar?.summary?.ollamaHostKind || 'unknown',
      brittneyLastTurnStatus: brittneyTurn?.summary?.status || 'unknown',
      brittneyLastTurnRuntimeStatus: brittneyTurn?.summary?.runtimeStatus || 'unknown',
      brittneyRuntimeEventCount: brittneyTurn?.summary?.eventCount || 0,
      brittneyActionProposalCount: brittneyTurn?.summary?.actionProposalCount || 0,
      brittneyFirstProposalObject: brittneyTurn?.summary?.firstProposalObject || '',
      brittneyFinalAvatarStage: brittneyTurn?.summary?.finalAvatarStage || '',
      brittneyContextStatus: brittneyContext?.summary?.status || 'unknown',
      brittneyContextVisibleShellObjectCount: brittneyContext?.summary?.visibleShellObjectCount || 0,
      brittneyContextSelectedShellObjectId: brittneyContext?.summary?.selectedShellObjectId || '',
      brittneyContextPeerWindowCount: brittneyContext?.summary?.peerWindowCount || 0,
      brittneyContextShellWindowCount: brittneyContext?.summary?.shellWindowCount || 0,
      brittneyContextOperatingSurfaceWindowCount: brittneyContext?.summary?.operatingSurfaceWindowCount || 0,
      brittneyContextPendingApprovalCount: brittneyContext?.summary?.pendingApprovalCount || 0,
      brittneyContextProcessRisk: brittneyContext?.summary?.processRisk || 'unknown',
      brittneyContextRawCommandsIncluded: Boolean(brittneyContext?.summary?.rawCommandsIncluded),
      brittneyContextRawWindowTitlesIncluded: Boolean(brittneyContext?.summary?.rawWindowTitlesIncluded),
      brittneyContextLocalUiLabelsIncluded: Boolean(brittneyContext?.summary?.localUiLabelsIncluded),
      operatorBriefStatus: operatorBrief?.status || 'unknown',
      operatorBriefPeerWindowCount: operatorBrief?.peers?.windowInstanceCount || 0,
      operatorBriefShellWindowCount: operatorBrief?.peers?.shellWindowInstanceCount || 0,
      operatorBriefOperatingSurfaceWindowCount: operatorBrief?.peers?.operatingSurfaceWindowCount || 0,
      operatorBriefLegacyCaptureCandidateCount: operatorBrief?.legacy?.captureCandidateCount || 0,
      operatorBriefFirstMove: operatorBrief?.brittneyPromptCard?.firstMove || '',
      operatingTurnStatus: operatingTurn?.summary?.status || 'unknown',
      operatingTurnStepCount: operatingTurn?.summary?.stepCount || 0,
      operatingTurnPassedStepCount: operatingTurn?.summary?.passedStepCount || 0,
      founderCommandStatus: founderCommand?.summary?.status || 'unknown',
      founderCommandId: founderCommand?.commandId || '',
      founderCommandConfidence: founderCommand?.summary?.confidence || 0,
      founderCommandPipelineStepCount: founderCommand?.summary?.pipelineStepCount || 0,
      founderCommandWorkflowStepCount: founderCommand?.summary?.workflowStepCount || 0,
      founderCommandApprovalCount: founderCommand?.summary?.approvalCount || 0,
      founderCommandExecutionAllowed: Boolean(founderCommand?.summary?.executionAllowed),
      founderCommandMutationExecuted: Boolean(founderCommand?.summary?.mutationExecuted),
      founderCommandDispatchStatus: founderCommand?.summary?.dispatchStatus || 'unknown',
      founderCommandWorkflowStatus: founderCommand?.summary?.workflowStatus || 'unknown',
      founderCommandIntentGateStatus: founderCommand?.summary?.intentGateStatus || 'unknown',
      founderEvidenceDemoStatus: founderEvidenceDemo?.summary?.status || 'unknown',
      founderEvidenceDemoTargetAction: founderEvidenceDemo?.summary?.targetAction || '',
      founderEvidenceDemoTargetLabel: founderEvidenceDemo?.summary?.targetLabel || '',
      founderEvidenceDemoEvidenceRung: founderEvidenceDemo?.summary?.evidenceRung || '',
      founderEvidenceDemoApprovalRequired: Boolean(founderEvidenceDemo?.summary?.approvalRequired),
      founderEvidenceDemoExecutionAllowed: Boolean(founderEvidenceDemo?.summary?.executionAllowed),
      founderEvidenceDemoExecutionPerformed: Boolean(founderEvidenceDemo?.summary?.executionPerformed),
      founderEvidenceDemoVisibleShellChange: Boolean(founderEvidenceDemo?.summary?.visibleShellChange),
      founderEvidenceDemoVisibleWitnessKind: founderEvidenceDemo?.summary?.visibleWitnessKind || '',
      receiptControlStatus: receiptControl?.summary?.status || 'unknown',
      receiptControlTargetLabel: receiptControl?.summary?.targetLabel || '',
      receiptControlReplayAvailable: Boolean(receiptControl?.summary?.replayAvailable),
      receiptControlRollbackExecutable: Boolean(receiptControl?.summary?.rollbackExecutable),
      receiptControlRollbackBlockReason: receiptControl?.summary?.rollbackBlockReason || '',
      receiptControlTaskPacketReady: Boolean(receiptControl?.summary?.taskPacketReady),
      receiptControlExactTargetIdentityStatus: receiptControl?.summary?.exactTargetIdentityStatus || '',
      agentDispatchStatus: agentDispatch?.summary?.status || 'unknown',
      agentDispatchCapabilityId: agentDispatch?.summary?.capabilityId || '',
      agentDispatchCapabilityLabel: agentDispatch?.summary?.capabilityLabel || '',
      agentDispatchKind: agentDispatch?.summary?.dispatchKind || '',
      agentDispatchRoute: agentDispatch?.summary?.route || '',
      agentDispatchConfidence: agentDispatch?.summary?.confidence || 0,
      agentDispatchPermissionEnvelope: agentDispatch?.summary?.permissionEnvelope || 'unknown',
      agentDispatchApprovalRequired: Boolean(agentDispatch?.summary?.approvalRequired),
      agentDispatchSelectedAgentSlug: agentDispatch?.summary?.selectedAgentSlug || '',
      agentDispatchActionKind: agentDispatch?.summary?.actionKind || '',
      agentDispatchTargetApp: agentDispatch?.summary?.targetApp || '',
      agentDispatchTargetUrlHost: agentDispatch?.summary?.targetUrlHost || '',
      sovereignRoomMarathonStatus: sovereignRoomMarathon?.summary?.status || 'unknown',
      sovereignRoomTaskLane: sovereignRoomMarathon?.summary?.taskLane || 'local',
      sovereignRoomTaskTag: sovereignRoomMarathon?.summary?.taskTag || 'local',
      sovereignRoomQueueOpenCount: sovereignRoomMarathon?.summary?.queueOpenCount || 0,
      sovereignRoomQueueClaimableOpenCount: sovereignRoomMarathon?.summary?.queueClaimableOpenCount || 0,
      sovereignRoomMatchedCandidateCount: sovereignRoomMarathon?.summary?.matchedCandidateCount || 0,
      sovereignRoomSelectedTaskId: sovereignRoomMarathon?.summary?.selectedTaskId || '',
      sovereignRoomSelectedTaskTitle: sovereignRoomMarathon?.summary?.selectedTaskTitle || '',
      sovereignRoomClaimRequested: Boolean(sovereignRoomMarathon?.summary?.claimRequested),
      sovereignRoomClaimAttempted: Boolean(sovereignRoomMarathon?.summary?.claimAttempted),
      sovereignRoomClaimSucceeded: Boolean(sovereignRoomMarathon?.summary?.claimSucceeded),
      sovereignRoomCompletionClaimAllowed: Boolean(sovereignRoomMarathon?.summary?.completionClaimAllowed),
      sovereignRoomNextAction: sovereignRoomMarathon?.summary?.nextAction || '',
      laptopReasoningBridgeStatus: laptopReasoningBridge?.summary?.status || 'unknown',
      laptopReasoningBridgeProcessedCount: laptopReasoningBridge?.summary?.processedCount || 0,
      laptopReasoningBridgePulledCount: laptopReasoningBridge?.summary?.pulledCount || 0,
      laptopReasoningBridgePushedCount: laptopReasoningBridge?.summary?.pushedCount || 0,
      laptopReasoningBridgeErrorCount: laptopReasoningBridge?.summary?.errorCount || 0,
      laptopReasoningBridgeLatestLane: laptopReasoningBridge?.summary?.latestLane || '',
      laptopReasoningBridgeLatestGpuStatus: laptopReasoningBridge?.summary?.latestLaptopGpuStatus || '',
      laptopReasoningBridgeLatestPingbackStatus: laptopReasoningBridge?.summary?.latestBrittneyPingbackStatus || '',
      laptopReasoningResultStatus: laptopReasoningResult?.summary?.status || 'unknown',
      laptopReasoningResultId: laptopReasoningResult?.summary?.resultId || '',
      laptopReasoningResultDispatchId: laptopReasoningResult?.summary?.dispatchId || '',
      laptopReasoningResultLane: laptopReasoningResult?.summary?.lane || '',
      laptopReasoningResultMode: laptopReasoningResult?.summary?.reasoningExecutionMode || '',
      laptopReasoningResultModelInvocationPerformed: Boolean(laptopReasoningResult?.summary?.modelInvocationPerformed),
      laptopReasoningResultGpuStatus: laptopReasoningResult?.summary?.laptopGpuStatus || '',
      laptopReasoningResultGpuProcessCount: laptopReasoningResult?.summary?.laptopGpuProcessCount || 0,
      laptopReasoningResultBrittneyPingbackStatus: laptopReasoningResult?.summary?.brittneyPingbackStatus || '',
      laptopReasoningResultGoldRootStatus: laptopReasoningResult?.summary?.goldRootStatus || '',
      laptopReasoningResultGoldUsable: Boolean(laptopReasoningResult?.summary?.goldUsable),
      laptopReasoningResultVastSpendGuardAttached: Boolean(laptopReasoningResult?.summary?.vastSpendGuardAttached),
      laptopReasoningResultLocalFocusCount: laptopReasoningResult?.summary?.localFocusCount || 0,
      laptopReasoningResultCloudFocusCount: laptopReasoningResult?.summary?.cloudFocusCount || 0,
      grokBuildSetupStatus: grokBuild?.summary?.status || 'unknown',
      grokBuildCliStatus: grokBuild?.summary?.cliStatus || 'unknown',
      grokBuildCliVersion: grokBuild?.summary?.cliVersion || 'unknown',
      grokBuildAuthStatus: grokBuild?.summary?.authStatus || 'unknown',
      grokBuildAuthRuntimeStatus: grokBuild?.summary?.authRuntimeStatus || 'unknown',
      grokBuildAuthProvider: grokBuild?.summary?.authProvider || '',
      grokBuildOperatorStatus: grokBuild?.summary?.operatorStatus || 'unknown',
      grokBuildAutonomyStatus: grokBuild?.summary?.autonomyStatus || 'unknown',
      grokBuildModelStatus: grokBuild?.summary?.modelStatus || 'unknown',
      grokBuildRequestedModel: grokBuild?.summary?.requestedModel || '',
      grokBuildDefaultModel: grokBuild?.summary?.defaultModel || '',
      grokBuildProjectTrusted: Boolean(grokBuild?.summary?.projectTrusted),
      grokBuildProjectTrustStatus: grokBuild?.summary?.projectTrustStatus || 'unknown',
      grokBuildWarningCount: grokBuild?.summary?.warningCount || 0,
      grokBuildReadyForHeavyRecheck: Boolean(grokBuild?.summary?.readyForHeavyRecheck),
      grokBuildReadyForGrokBuild: Boolean(grokBuild?.summary?.readyForGrokBuild),
      grokBuildHeavyAccessStatus: grokBuild?.summary?.heavyAccessStatus || grokBuild?.heavyUpgrade?.status || 'unknown',
      grokBuildHeavyVerifiedAt: grokBuild?.heavyUpgrade?.verifiedAt || '',
      grokHeartbeatStatus: grokHeartbeat?.summary?.status || 'unknown',
      grokHeartbeatPresenceStatus: grokHeartbeat?.summary?.agentPresenceStatus || 'unknown',
      grokHeartbeatCliOperatorStatus: grokHeartbeat?.summary?.cliOperatorStatus || grokHeartbeat?.operator?.status || 'unknown',
      grokHeartbeatAuthRuntimeStatus: grokHeartbeat?.summary?.authRuntimeStatus || grokHeartbeat?.operator?.authRuntimeStatus || 'unknown',
      grokHeartbeatAuthProvider: grokHeartbeat?.summary?.authProvider || grokHeartbeat?.operator?.authProvider || '',
      grokHeartbeatAutonomyStatus: grokHeartbeat?.summary?.autonomyStatus || grokHeartbeat?.operator?.autonomyStatus || 'unknown',
      grokHeartbeatObservationStatus: grokHeartbeat?.summary?.latestObservationStatus || 'none',
      grokHeartbeatObservationRecent: Boolean(grokHeartbeat?.summary?.latestObservationRecent),
      grokHeartbeatPrimaryFinding: grokHeartbeat?.summary?.primaryFinding || '',
      grokObservationStatus: workflow?.grokObservation?.summary?.status || '',
      grokObservationPrimaryFinding: workflow?.grokObservation?.summary?.primaryFinding || '',
      grokObservationFindingCount: workflow?.grokObservation?.summary?.findingCount || 0,
      hardwareControlStatus: hardwareAction?.schemaVersion === 'hololand.holoshell.hardware-action.v0.1.0' ? 'available' : 'unknown',
      hardwareActionStatus: hardwareAction?.summary?.status || 'unknown',
      hardwareActionKind: hardwareAction?.summary?.actionKind || '',
      hardwareActionPermissionEnvelope: hardwareAction?.summary?.permissionEnvelope || 'unknown',
      hardwareActionApprovalRequired: Boolean(hardwareAction?.summary?.approvalRequired),
      hardwareActionApproved: Boolean(hardwareAction?.summary?.approved),
      hardwareActionExecutionPerformed: Boolean(hardwareAction?.summary?.executionPerformed),
      hardwareMutatingActionExecuted: Boolean(hardwareAction?.summary?.mutatingActionExecuted),
      hardwareActionReceiptCount: actionReceipts.length,
      hardwareTargetWindowTitle: hardwareAction?.summary?.targetWindowTitle || '',
      hardwareTargetProcessName: hardwareAction?.summary?.targetProcessName || '',
      hardwareTargetUrlHost: hardwareAction?.summary?.targetUrlHost || '',
      hardwareShellVisibleChange: Boolean(hardwareAction?.summary?.shellVisibleChange),
      hardwareVisibleWitnessKind: hardwareAction?.summary?.visibleWitnessKind || '',
      hardwareApprovalStatus: hardwareApproval?.summary?.status || 'unknown',
      hardwareApprovalActionKind: hardwareApproval?.summary?.actionKind || '',
      hardwareApprovalTarget: hardwareApproval?.summary?.target || '',
      hardwareApprovalExpiresAt: hardwareApproval?.summary?.expiresAt || '',
      hardwareApprovalExecutionAllowed: Boolean(hardwareApproval?.summary?.executionAllowed),
      hardwareApprovalBundleCount: approvalBundles.length,
      pendingHardwareApprovalCount: hardwareApproval?.summary?.executionAllowed ? 1 : 0,
      accountTaskCustodyStatus: accountTaskCustody?.summary?.status || 'unknown',
      accountTaskCustodyProvider: accountTaskCustody?.summary?.provider || '',
      accountTaskCustodyBoundaryStatus: accountTaskCustody?.summary?.accountBoundaryStatus || 'unknown',
      accountTaskCustodyApprovalRequired: Boolean(accountTaskCustody?.summary?.approvalRequired),
      accountTaskCustodyExecutionAllowed: Boolean(accountTaskCustody?.summary?.executionAllowed),
      accountTaskCustodyMutationPerformed: Boolean(accountTaskCustody?.summary?.accountMutationPerformed),
      accountTaskCustodySourceMutationPerformed: Boolean(accountTaskCustody?.summary?.sourceFileMutationPerformed),
      accountTaskCustodyReceiptCount: accountTaskCustodyReceipts.length,
      packageCustodyStatus: packageCustody?.summary?.status || 'unknown',
      packageCustodyPackageId: packageCustody?.summary?.packageId || '',
      packageCustodyPackageName: packageCustody?.summary?.packageName || '',
      packageCustodyManager: packageCustody?.summary?.manager || '',
      packageCustodyFromVersion: packageCustody?.summary?.fromVersion || '',
      packageCustodyToVersion: packageCustody?.summary?.toVersion || '',
      packageCustodyApprovalRequired: Boolean(packageCustody?.summary?.approvalRequired),
      packageCustodyExecutionAllowed: Boolean(packageCustody?.summary?.executionAllowed),
      packageCustodyMutationPerformed: Boolean(packageCustody?.summary?.mutationPerformed),
      packageCustodyAdminRequired: Boolean(packageCustody?.summary?.adminRequired),
      packageCustodySchemaStatus: packageCustody?.schemaContract?.status || 'unknown',
      packageCustodyReceiptCount: packageCustodyReceipts.length,
      trustLedgerStatus: trustLedger?.summary?.status || 'unknown',
      trustLedgerRecordCount: trustLedger?.summary?.recordCount || 0,
      trustedAutonomyTrustedRecordCount: trustLedger?.summary?.trustedRecordCount || 0,
      trustedAutonomyGuardedRecordCount: trustLedger?.summary?.guardedRecordCount || 0,
      trustedAutonomyReadOnlyRecordCount: trustLedger?.summary?.readOnlyRecordCount || 0,
      trustedAutonomyBreakGlassRecordCount: trustLedger?.summary?.breakGlassRecordCount || 0,
      trustedAutonomyLatestLevel: trustLedger?.summary?.latestTrustLevel || 'unknown',
      trustedAutonomyLatestActionKind: trustLedger?.summary?.latestActionKind || '',
      trustedAutonomyLatestTarget: trustLedger?.summary?.latestTarget || '',
      trustedAutonomyEligible: Boolean(trustLedger?.summary?.trustedAutonomyEligible),
      trustedAutonomySuccessesUntilTrusted: trustLedger?.summary?.successesUntilTrusted || 0,
      trustedAutonomyPromotionThreshold: trustLedger?.summary?.promotionThreshold || trustLedger?.policy?.promotionThreshold || 3,
      activeWorkflowKind: workflow?.summary?.workflowKind || workflow?.profile || '',
      activeWorkflowStatus: workflow?.summary?.status || 'unknown',
      activeWorkflowTitle: workflow?.title || '',
      activeWorkflowTargetSurface: workflow?.summary?.targetSurface || '',
      activeWorkflowAgentSlug: workflow?.summary?.agentSlug || '',
      activeWorkflowAgentLabel: workflow?.summary?.agentLabel || '',
      activeWorkflowCommand: workflow?.summary?.command || '',
      activeWorkflowMode: workflow?.summary?.mode || '',
      activeWorkflowStepCount: workflow?.summary?.stepCount || 0,
      activeWorkflowPendingApprovalCount: workflow?.summary?.pendingApprovalCount || 0,
      activeWorkflowModel: workflow?.summary?.model || '',
      activeWorkflowModelRoute: workflow?.summary?.modelRoute || '',
      activeWorkflowTaskLane: workflow?.summary?.taskLane || '',
      activeWorkflowTaskTag: workflow?.summary?.taskTag || '',
      activeWorkflowMusicTarget: workflow?.summary?.musicTarget || '',
      activeWorkflowPromptPresent: Boolean(workflow?.summary?.promptPresent),
      activeWorkflowProjectTrusted: Boolean(workflow?.summary?.projectTrusted),
      activeWorkflowProjectTrustStatus: workflow?.summary?.projectTrustStatus || '',
      activeWorkflowShellContextAttachedByDefault: Boolean(workflow?.summary?.shellContextAttachedByDefault),
      activeWorkflowMutationExecuted: Boolean(workflow?.summary?.mutationExecuted),
      activeWorkflowApprovalStatus: workflowApproval?.summary?.status || 'unknown',
      activeWorkflowApprovalId: workflowApproval?.approvalId || '',
      activeWorkflowApprovalExpiresAt: workflowApproval?.summary?.expiresAt || '',
      activeWorkflowApprovalExecutionAllowed: Boolean(workflowApproval?.summary?.executionAllowed),
      activeWorkflowApprovalBundleCount: workflowApprovalBundles.length,
      activeWorkflowApprovalPendingCount: workflowApproval?.summary?.pendingApprovalCount || 0,
      activeWorkflowIntentGateStatus: workflowIntentGate?.summary?.status || 'unknown',
      activeWorkflowIntentGateCaseId: workflowIntentGate?.summary?.caseId || '',
      activeWorkflowIntentGateExecutionAllowed: Boolean(workflowIntentGate?.summary?.executionAllowed),
      activeWorkflowIntentGateRuntimeBlocking: Boolean(workflowIntentGate?.summary?.runtimeBlocking),
      activeWorkflowIntentGateFailedCheckCount: workflowIntentGate?.summary?.failedCheckCount || 0,
      activeWorkflowIntentGateReceiptStatus: workflowIntentGate?.summary?.receiptStatus || 'unknown',
      activeShardWorkflowStatus: shardWorkflow?.summary?.status || 'unknown',
      activeShardWorkflowId: shardWorkflow?.workflowId || '',
      activeShardId: shardWorkflow?.shardPlan?.shardId || '',
      activeShardAssetCount: shardWorkflow?.summary?.assetCount || 0,
      activeShardModelCount: shardWorkflow?.summary?.modelCount || 0,
      activeShardImageCount: shardWorkflow?.summary?.imageCount || 0,
      activeShardAudioCount: shardWorkflow?.summary?.audioCount || 0,
      activeShardSourceCount: shardWorkflow?.summary?.sourceCount || 0,
      activeShardUnknownCount: shardWorkflow?.summary?.unknownCount || 0,
      activeShardBlockedAssetCount: shardWorkflow?.summary?.blockedAssetCount || 0,
      activeShardPreviewObjectCount: shardWorkflow?.summary?.previewObjectCount || 0,
      activeShardApprovalRequired: Boolean(shardWorkflow?.summary?.approvalRequired),
      activeShardMutationExecuted: Boolean(shardWorkflow?.summary?.mutationExecuted),
      activeShardPreviewSourcePath: shardWorkflow?.output?.previewSourcePath || '',
      activeShardPrivateReceiptPath: shardWorkflow?.output?.privateReceiptPath || '',
      activeShardNextWorkflow: shardWorkflow?.summary?.nextWorkflow || '',
      activeShardImportApprovalStatus: shardImportApproval?.summary?.status || 'unknown',
      activeShardImportApprovalId: shardImportApproval?.approvalId || '',
      activeShardImportApprovalExpiresAt: shardImportApproval?.summary?.expiresAt || '',
      activeShardImportExecutionAllowed: Boolean(shardImportApproval?.summary?.executionAllowed),
      activeShardImportApprovalPendingCount: shardImportApproval?.summary?.executionAllowed ? 1 : 0,
      activeShardImportApprovalBundleCount: shardImportApprovalBundles.length,
      activeShardImportCommandPreview: shardImportApproval?.execution?.commandPreview || '',
      activeShardImportStatus: shardImport?.summary?.status || 'unknown',
      activeShardImportId: shardImport?.importId || '',
      activeShardImportManifestPath: shardImport?.output?.manifestPath || '',
      activeShardImportSourcePath: shardImport?.output?.shardSourcePath || '',
      activeShardImportReceiptPath: shardImport?.output?.receiptPath || '',
      activeShardImportRuntimeMutationExecuted: Boolean(shardImport?.summary?.runtimeMutationExecuted),
      activeShardImportSourceAssetsMutated: Boolean(shardImport?.summary?.sourceAssetsMutated),
      stopPlanCount: stopPlans.length,
      activeRegisteredRunCount: processHealth?.summary?.activeRegisteredRunCount || 0,
      timelineCount: timeline.length,
      pilotReceiptCount: pilotReceipts.length,
    },
    feeds: {
      inventory,
      surfaceMap,
      goldCodebaseBridge,
      wildHoloScript,
      formatInventory,
      founderBootPreview,
      founderHost,
      nativeWrapper,
      startupIntegration,
      userShellProjection,
      developmentalEnvironment,
      lanes,
      processHealth,
      networkReality,
      networkFreshness,
      networkChangeEvents,
      networkSentinelService,
      serviceSupervisor,
      desktopBridgeStatus,
      legacyAppReality,
      mcpCustodyContract,
      mcpUpstreamHandoff,
      osUiCapture,
      programRegistry,
      readinessEvidence,
      fleetReadiness,
      shellObjects,
      brittneyAvatar,
      brittneyTurn,
      brittneyContext,
      operatorBrief,
      operatingTurn,
      founderCommand,
      founderEvidenceDemo,
      receiptControl,
      agentDispatch,
      laptopReasoningBridge,
      laptopReasoningResult,
      grokBuild,
      grokHeartbeat,
      hardwareAction,
      hardwareApproval,
      accountTaskCustody,
      packageCustody,
      trustLedger,
      workflow,
      sovereignRoomMarathon,
      workflowApproval,
      workflowIntentGate,
      shardWorkflow,
      shardImportApproval,
      shardImport,
      runRegistry,
    },
    stopPlans,
    runReceipts,
    actionReceipts,
    approvalBundles,
    accountTaskCustodyReceipts,
    packageCustodyReceipts,
    workflowApprovalBundles,
    pilotReceipts,
    timeline,
  };
}

function writeJson(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeBrowserBootstrap(filePath, feed) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(feed, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_LIVE_FEED = ${payload};\n`, 'utf8');
  return resolved;
}

function assertSelfTest(feed) {
  const failures = [];
  if (feed.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (!feed.summary.capabilityCount) failures.push('expected capability feed');
  if (!feed.summary.holoscriptRoomCount) failures.push('expected HoloScript room feed');
  if (!feed.summary.laneCount) failures.push('expected agent lane feed');
  if (!feed.summary.processCount) failures.push('expected process health feed');
  if (feed.summary.brittneyAvatarStatus === 'unknown') failures.push('expected Brittney avatar feed');
  if (feed.summary.brittneyLastTurnStatus === 'unknown') failures.push('expected Brittney turn feed');
  if (feed.summary.brittneyContextStatus === 'unknown') failures.push('expected Brittney context feed');
  if (feed.summary.hardwareActionStatus === 'unknown') failures.push('expected hardware action feed');
  if (feed.summary.programRegistryStatus === 'unknown') failures.push('expected program registry feed');
  if (feed.summary.hardwareApprovalStatus === 'unknown') failures.push('expected hardware approval feed');
  if (feed.summary.developmentalEnvironmentStatus === 'unknown') failures.push('expected developmental environment feed');
  if (feed.summary.receiptControlStatus === 'unknown') failures.push('expected receipt control feed');
  if (!feed.summary.receiptControlReplayAvailable) failures.push('expected receipt control replay availability');
  if (!Array.isArray(feed.timeline) || feed.timeline.length < 3) failures.push('expected linked timeline');
  if (!Array.isArray(feed.stopPlans)) failures.push('expected stop plan array');
  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const feed = createFeed(args);
  const output = writeJson(args.output, feed);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, feed);
  if (args.selfTest) assertSelfTest(feed);

  if (args.json) {
    console.log(JSON.stringify(feed, null, 2));
  } else {
    console.log(`HoloShell live feed: ${output}`);
    console.log(`HoloShell browser bootstrap: ${jsOutput}`);
    console.log(`Risk: ${feed.summary.overallRisk}`);
    console.log(`Capabilities: ${feed.summary.capabilityCount}`);
    console.log(`Timeline: ${feed.summary.timelineCount}`);
    console.log(`Launchable programs: ${feed.summary.launchableProgramCount}`);
    console.log(`Shell objects: ${feed.summary.shellObjectCount}`);
    console.log(`Founder boot: ${feed.summary.founderBootStatus}`);
    console.log(`Founder host: ${feed.summary.founderHostStatus}`);
    console.log(`Native wrapper: ${feed.summary.nativeWrapperStatus}`);
    console.log(`Startup integration: ${feed.summary.startupIntegrationStatus}`);
    console.log(`User shell: ${feed.summary.userShellProjectionStatus}`);
    console.log(`Developmental environment: ${feed.summary.developmentalEnvironmentStatus}`);
    console.log(`MCP custody: ${feed.summary.mcpCustodyContractStatus}`);
    console.log(`MCP upstream handoff: ${feed.summary.mcpUpstreamHandoffStatus}`);
    console.log(`Brittney context: ${feed.summary.brittneyContextStatus}`);
    console.log(`GOLD/codebase bridge: ${feed.summary.goldCodebaseBridgeStatus}`);
    console.log(`Format inventory: ${feed.summary.formatInventoryStatus}`);
    console.log(`Network reality: ${feed.summary.networkRealityStatus}`);
    console.log(`Network freshness: ${feed.summary.networkFreshnessStatus}`);
    console.log(`Network sentinel: ${feed.summary.networkChangeSentinelLastObservationKind}`);
    console.log(`Network sentinel service: ${feed.summary.networkSentinelServiceStatus}`);
    console.log(`Service supervisor: ${feed.summary.serviceSupervisorStatus}`);
    console.log(`Desktop bridge: ${feed.summary.desktopBridgeStatus} (${feed.summary.desktopBridgeFreshness})`);
    console.log(`Legacy app reality: ${feed.summary.legacyAppRealityStatus}`);
    console.log(`Founder evidence demo: ${feed.summary.founderEvidenceDemoStatus}`);
    console.log(`Hardware action: ${feed.summary.hardwareActionStatus}`);
    console.log(`Hardware approval: ${feed.summary.hardwareApprovalStatus}`);
    console.log(`Workflow: ${feed.summary.activeWorkflowStatus}`);
    console.log(`Workflow approval: ${feed.summary.activeWorkflowApprovalStatus}`);
    console.log(`Brain intent gate: ${feed.summary.activeWorkflowIntentGateStatus}`);
    console.log(`Stop plans: ${feed.summary.stopPlanCount}`);
    console.log(`Pilot receipts: ${feed.summary.pilotReceiptCount}`);
  }
} catch (error) {
  console.error(`holoshell-live-feed failed: ${error.message}`);
  process.exit(1);
}
