/**
 * HoloWeb Network Reality schema pack.
 *
 * Canonical TypeScript contract for the first HoloWeb primitive:
 * a redacted, local-only HoloShell network reality snapshot that agents,
 * REST/RPC/MCP handlers, and CLI adapters can consume without reading logs.
 */

export const HOLOWEB_NETWORK_REALITY_SCHEMA_VERSION =
  'hololand.holoshell.network-reality.v0.1.0' as const;

export type HoloWebNetworkRealitySchemaVersion =
  typeof HOLOWEB_NETWORK_REALITY_SCHEMA_VERSION;

export type HoloWebJsonValue =
  | string
  | number
  | boolean
  | null
  | HoloWebJsonValue[]
  | { [key: string]: HoloWebJsonValue };

export const HOLOWEB_NODE_ROLES = [
  'holoweb-local-reality-node',
  'holoweb-community-node',
  'holoweb-relay-node',
  'holoweb-cache-node',
  'holoweb-governance-node',
] as const;

export type HoloWebNodeRole = (typeof HOLOWEB_NODE_ROLES)[number];

export const HOLOWEB_PRIVACY_SCOPES = [
  'local_only',
  'community_redacted',
  'public_receipt',
] as const;

export type HoloWebPrivacyScope = (typeof HOLOWEB_PRIVACY_SCOPES)[number];

export const HOLOWEB_RESOURCE_KINDS = [
  'bandwidth',
  'relay',
  'cache',
  'compute',
  'storage',
  'location-proof',
] as const;

export type HoloWebResourceKind = (typeof HOLOWEB_RESOURCE_KINDS)[number];

export const HOLOWEB_LOCATION_PROOF_SCOPES = [
  'local_only',
  'owner_shared',
  'community_shared',
  'public_receipt',
] as const;

export type HoloWebLocationProofScope = (typeof HOLOWEB_LOCATION_PROOF_SCOPES)[number];

export const HOLOWEB_LOCATION_PROOF_METHODS = [
  'none',
  'owner_declared',
  'device_gps',
  'wifi_positioning',
  'ip_region',
  'community_attested',
] as const;

export type HoloWebLocationProofMethod = (typeof HOLOWEB_LOCATION_PROOF_METHODS)[number];

export const HOLOWEB_LOCATION_PRECISIONS = [
  'none',
  'city',
  'neighborhood',
  'geohash_4',
  'geohash_5',
  'site',
  'exact_local_only',
] as const;

export type HoloWebLocationPrecision = (typeof HOLOWEB_LOCATION_PRECISIONS)[number];

export const HOLOWEB_UNDERLAY_CLASSIFICATIONS = [
  'offline',
  'normal_unmetered',
  'metered_or_hotspot',
  'vpn_overlay',
  'degraded_link',
  'unknown_protective',
] as const;

export type HoloWebUnderlayClassification =
  (typeof HOLOWEB_UNDERLAY_CLASSIFICATIONS)[number];

export const HOLOWEB_CONFIDENCE_LEVELS = [
  'owner_declared',
  'os_reported',
  'agent_inferred',
  'community_attested',
  'low',
] as const;

export type HoloWebConfidenceLevel = (typeof HOLOWEB_CONFIDENCE_LEVELS)[number];

export const HOLOWEB_OWNER_DECLARED_KINDS = [
  'none',
  'phone_hotspot',
  'metered',
  'unmetered',
  'unknown',
] as const;

export type HoloWebOwnerDeclaredKind = (typeof HOLOWEB_OWNER_DECLARED_KINDS)[number];

export const HOLOWEB_OWNER_DECLARED_SOURCES = [
  'none',
  'cli',
  'env',
  'ui',
  'brittney',
  'receipt',
] as const;

export type HoloWebOwnerDeclaredSource =
  (typeof HOLOWEB_OWNER_DECLARED_SOURCES)[number];

export const HOLOWEB_INTERFACE_KINDS = [
  'wifi',
  'wwan',
  'ethernet',
  'vpn',
  'unknown',
] as const;

export type HoloWebInterfaceKind = (typeof HOLOWEB_INTERFACE_KINDS)[number];

export const HOLOWEB_VPN_STATES = [
  'active',
  'inactive',
  'not_detected',
  'unknown',
] as const;

export type HoloWebVpnState = (typeof HOLOWEB_VPN_STATES)[number];

export const HOLOWEB_HEALTH_STATES = ['pass', 'warn', 'critical', 'unknown'] as const;

export type HoloWebHealthState = (typeof HOLOWEB_HEALTH_STATES)[number];

export const HOLOWEB_PROCESS_KINDS = [
  'agent_or_shell',
  'browser',
  'legacy_app',
  'system_service',
  'unknown',
] as const;

export type HoloWebProcessKind = (typeof HOLOWEB_PROCESS_KINDS)[number];

export const HOLOWEB_BANDWIDTH_POSTURES = [
  'offline_queue',
  'protect_mobile_data',
  'throttle_for_stability',
  'route_aware',
  'normal',
  'protective_unknown',
] as const;

export type HoloWebBandwidthPosture = (typeof HOLOWEB_BANDWIDTH_POSTURES)[number];

export const HOLOWEB_HEAVY_WORK_POLICIES = [
  'queue_remote_sync',
  'queue_or_ask_before_heavy_transfer',
  'prefer_local_and_retry_remote_later',
  'allowed_with_route_receipt',
  'allowed_with_receipts',
  'ask_before_heavy_transfer',
] as const;

export type HoloWebHeavyWorkPolicy = (typeof HOLOWEB_HEAVY_WORK_POLICIES)[number];

export const HOLOWEB_AGENT_ACTIONS = [
  'queue_network_work_until_online',
  'throttle_downloads_and_uploads',
  'defer_noncritical_network_work',
  'record_overlay_route_context',
  'run_normal_network_work',
  'default_to_bandwidth_protection',
] as const;

export type HoloWebAgentAction = (typeof HOLOWEB_AGENT_ACTIONS)[number];

export const HOLOWEB_BRITTNEY_STANCES = [
  'explain_offline_and_preserve_work',
  'protect_bandwidth',
  'keep_working_locally_and_warn',
  'explain_privacy_route',
  'normal_operator',
  'ask_before_spending_bandwidth',
] as const;

export type HoloWebBrittneyStance = (typeof HOLOWEB_BRITTNEY_STANCES)[number];

export const HOLOWEB_RECEIPT_TYPES = [
  'network_reality_snapshot',
  'HoloWebConnectionStateReceipt',
  'location_proof',
  'resource_receipt',
  'policy_decision',
] as const;

export type HoloWebReceiptType = (typeof HOLOWEB_RECEIPT_TYPES)[number];

export const HOLOWEB_RECEIPT_ACTIONS = [
  'read_only_scan',
  'owner_declared',
  'policy_decision',
  'resource_announcement',
  'location_attestation',
] as const;

export type HoloWebReceiptAction = (typeof HOLOWEB_RECEIPT_ACTIONS)[number];

export interface HoloWebSourceAnchors {
  source?: string;
  adapter?: string;
  liveFeed?: string;
  planning?: string;
  [key: string]: string | undefined;
}

export interface HoloWebLocationProof {
  proofId: string;
  scope: HoloWebLocationProofScope;
  method: HoloWebLocationProofMethod;
  precision: HoloWebLocationPrecision;
  createdAt: string;
  expiresAt?: string;
  locationHash?: string;
  geohashPrefix?: string;
  cityRegion?: string;
  ownerConsentReceiptId?: string;
  revocable: true;
  metadata?: Record<string, HoloWebJsonValue>;
}

export interface HoloWebNode {
  nodeId: string;
  role: HoloWebNodeRole;
  privacyScope: HoloWebPrivacyScope;
  communityId?: string;
  ownerHash?: string;
  capabilities?: HoloWebResourceKind[];
  locationProof?: HoloWebLocationProof;
  metadata?: Record<string, HoloWebJsonValue>;
}

export interface HoloWebWifiEvidence {
  available: boolean;
  connected: boolean;
  signalPercent: number | null;
  radioType: string | null;
  channel: number | null;
  authentication: string | null;
  receiveRateMbps?: number | null;
  transmitRateMbps?: number | null;
  ssidRedacted: true;
  bssidRedacted: true;
  identifiers?: {
    interfaceNameHash?: string;
    ssidRedacted: true;
    bssidRedacted: true;
  };
}

export interface HoloWebCostEvidence {
  available: boolean;
  roaming: boolean;
  overDataLimit: boolean;
  approachingDataLimit: boolean;
}

export interface HoloWebAdapterEvidence {
  available: boolean;
  adapterCount: number;
  configuredVpnCount: number;
  activeVpnCount: number;
  endpointDetailsRedacted: true;
}

export interface HoloWebUnderlay {
  classification: HoloWebUnderlayClassification;
  confidence: HoloWebConfidenceLevel;
  ownerDeclaredKind: HoloWebOwnerDeclaredKind;
  ownerDeclaredSource?: HoloWebOwnerDeclaredSource;
  osInterfaceKind: HoloWebInterfaceKind;
  osCost: string;
  connectivity: string;
  vpnState: HoloWebVpnState;
  evidence: string[];
  wifi: HoloWebWifiEvidence;
  cost: HoloWebCostEvidence;
  adapters: HoloWebAdapterEvidence;
  directWwanDetected?: boolean;
  locationProof?: HoloWebLocationProof;
}

export interface HoloWebHealth {
  state: HoloWebHealthState;
  networkConsumerCount: number;
  establishedConnectionCount: number;
  processHealthRisk: string;
}

export interface HoloWebNetworkConsumer {
  pid: number;
  pidHash: string;
  processName: string;
  processKind: HoloWebProcessKind;
  establishedConnectionCount: number;
  endpointDetailsRedacted: true;
}

/**
 * Summary of agent lane truth joined with local network consumers.
 *
 * `processCountIsNotPeerCount` must stay true because shell processes,
 * browser processes, and legacy apps can consume bandwidth without being
 * trusted agent peers.
 */
export interface HoloWebAgentLane {
  activeLaneCount: number;
  laneCount: number;
  staleLaneCount?: number;
  semanticIdentityRequired: true;
  processCountIsNotPeerCount: true;
  processHealthRisk: string;
  registeredRunCount: number;
  activeRegisteredRunCount: number;
  networkConsumerCount: number;
  agentOrShellNetworkConsumerCount: number;
  legacyNetworkConsumerCount: number;
  topConsumers: HoloWebNetworkConsumer[];
  evidenceRequired?: string[];
}

export interface HoloWebPolicy {
  bandwidthPosture: HoloWebBandwidthPosture;
  heavyWorkPolicy: HoloWebHeavyWorkPolicy;
  agentAction: HoloWebAgentAction;
  brittneyStance: HoloWebBrittneyStance;
  allowedWithoutOwnerGesture: string[];
  requiresOwnerGesture: string[];
  reason?: string;
  communityPolicyId?: string;
  governanceScope?: 'owner_local' | 'community_vote' | 'public_commons';
  metadata?: Record<string, HoloWebJsonValue>;
}

export interface HoloWebBrittneyPolicy {
  stance: HoloWebBrittneyStance;
  firstMessage: string;
  protectBandwidth: boolean;
  canExplainToNonDeveloper: boolean;
}

export interface HoloWebRedactionPolicy {
  rawSsidIncluded: false;
  rawBssidIncluded: false;
  ipAddressIncluded: false;
  gatewayIncluded: false;
  remoteEndpointIncluded: false;
  rawCommandLineIncluded: false;
  pidIncluded: boolean;
  pidHashIncluded: boolean;
  localOnly: true;
}

export interface HoloWebReceipt {
  receiptType: HoloWebReceiptType;
  snapshotHash: string;
  actionTaken: HoloWebReceiptAction;
  mutationPerformed: boolean;
  scope?: HoloWebPrivacyScope;
  payloadInspection?: false;
  hashAlgorithm?: 'sha256';
  emittedAt?: string;
  parentReceiptIds?: string[];
  metadata?: Record<string, HoloWebJsonValue>;
}

export interface HoloWebNetworkRealitySnapshot {
  schemaVersion: HoloWebNetworkRealitySchemaVersion;
  generatedAt: string;
  sourceAnchors?: HoloWebSourceAnchors;
  node: HoloWebNode;
  underlay: HoloWebUnderlay;
  health: HoloWebHealth;
  lanes: HoloWebAgentLane;
  policy: HoloWebPolicy;
  brittney: HoloWebBrittneyPolicy;
  redaction: HoloWebRedactionPolicy;
  receipt: HoloWebReceipt;
  locationProof?: HoloWebLocationProof;
  metadata?: Record<string, HoloWebJsonValue>;
}

function isIsoTimestamp(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isNonNegativeNumber(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isOneOf<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value);
}

function validateStringArray(field: string, value: string[] | undefined, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array.`);
    return;
  }
  for (const item of value) {
    if (typeof item !== 'string') {
      errors.push(`${field} must contain only strings.`);
    }
  }
}

function validateOptionalStringArray(
  field: string,
  value: string[] | undefined,
  errors: string[]
): void {
  if (value === undefined) return;
  validateStringArray(field, value, errors);
}

export function isSupportedHoloWebNodeRole(role: string): role is HoloWebNodeRole {
  return isOneOf(HOLOWEB_NODE_ROLES, role);
}

export function isSupportedHoloWebUnderlayClassification(
  classification: string
): classification is HoloWebUnderlayClassification {
  return isOneOf(HOLOWEB_UNDERLAY_CLASSIFICATIONS, classification);
}

export function isSupportedHoloWebPrivacyScope(scope: string): scope is HoloWebPrivacyScope {
  return isOneOf(HOLOWEB_PRIVACY_SCOPES, scope);
}

export function isSupportedHoloWebLocationPrecision(
  precision: string
): precision is HoloWebLocationPrecision {
  return isOneOf(HOLOWEB_LOCATION_PRECISIONS, precision);
}

export function isSupportedHoloWebReceiptType(
  receiptType: string
): receiptType is HoloWebReceiptType {
  return isOneOf(HOLOWEB_RECEIPT_TYPES, receiptType);
}

export function validateHoloWebLocationProof(
  proof: HoloWebLocationProof | undefined,
  prefix = 'HoloWebLocationProof'
): string[] {
  const errors: string[] = [];
  if (!proof) {
    errors.push(`${prefix} is required.`);
    return errors;
  }
  if (!proof.proofId) errors.push(`${prefix}.proofId is required.`);
  if (!isOneOf(HOLOWEB_LOCATION_PROOF_SCOPES, String(proof.scope))) {
    errors.push(`${prefix}.scope is unsupported: ${String(proof.scope)}.`);
  }
  if (!isOneOf(HOLOWEB_LOCATION_PROOF_METHODS, String(proof.method))) {
    errors.push(`${prefix}.method is unsupported: ${String(proof.method)}.`);
  }
  if (!isSupportedHoloWebLocationPrecision(String(proof.precision))) {
    errors.push(`${prefix}.precision is unsupported: ${String(proof.precision)}.`);
  }
  if (!isIsoTimestamp(proof.createdAt)) {
    errors.push(`${prefix}.createdAt is required and must be a valid ISO-8601 timestamp.`);
  }
  if (proof.expiresAt !== undefined && !isIsoTimestamp(proof.expiresAt)) {
    errors.push(`${prefix}.expiresAt must be a valid ISO-8601 timestamp when provided.`);
  }
  if (proof.revocable !== true) {
    errors.push(`${prefix}.revocable must be true.`);
  }
  if (
    proof.precision === 'exact_local_only' &&
    proof.scope !== 'local_only'
  ) {
    errors.push(`${prefix}.precision exact_local_only cannot leave local_only scope.`);
  }
  if (
    (proof.scope === 'community_shared' || proof.scope === 'public_receipt') &&
    !proof.ownerConsentReceiptId
  ) {
    errors.push(`${prefix}.ownerConsentReceiptId is required for shared location proofs.`);
  }
  return errors;
}

function validateNode(node: HoloWebNode | undefined, errors: string[]): void {
  if (!node) {
    errors.push('HoloWebNetworkRealitySnapshot.node is required.');
    return;
  }
  if (!node.nodeId) errors.push('HoloWebNode.nodeId is required.');
  if (!isSupportedHoloWebNodeRole(String(node.role))) {
    errors.push(`HoloWebNode.role is unsupported: ${String(node.role)}.`);
  }
  if (!isSupportedHoloWebPrivacyScope(String(node.privacyScope))) {
    errors.push(`HoloWebNode.privacyScope is unsupported: ${String(node.privacyScope)}.`);
  }
  if (node.capabilities) {
    for (const capability of node.capabilities) {
      if (!isOneOf(HOLOWEB_RESOURCE_KINDS, String(capability))) {
        errors.push(`HoloWebNode.capabilities contains unsupported kind: ${String(capability)}.`);
      }
    }
  }
  if (node.locationProof) {
    errors.push(...validateHoloWebLocationProof(node.locationProof, 'HoloWebNode.locationProof'));
  }
}

function validateWifiEvidence(wifi: HoloWebWifiEvidence | undefined, errors: string[]): void {
  if (!wifi) {
    errors.push('HoloWebUnderlay.wifi is required.');
    return;
  }
  if (typeof wifi.available !== 'boolean') errors.push('HoloWebWifiEvidence.available must be a boolean.');
  if (typeof wifi.connected !== 'boolean') errors.push('HoloWebWifiEvidence.connected must be a boolean.');
  if (wifi.signalPercent !== null && !isNonNegativeNumber(wifi.signalPercent)) {
    errors.push('HoloWebWifiEvidence.signalPercent must be a non-negative number or null.');
  }
  if (wifi.channel !== null && !isNonNegativeNumber(wifi.channel)) {
    errors.push('HoloWebWifiEvidence.channel must be a non-negative number or null.');
  }
  if (wifi.receiveRateMbps !== undefined && wifi.receiveRateMbps !== null && !isNonNegativeNumber(wifi.receiveRateMbps)) {
    errors.push('HoloWebWifiEvidence.receiveRateMbps must be a non-negative number or null.');
  }
  if (wifi.transmitRateMbps !== undefined && wifi.transmitRateMbps !== null && !isNonNegativeNumber(wifi.transmitRateMbps)) {
    errors.push('HoloWebWifiEvidence.transmitRateMbps must be a non-negative number or null.');
  }
  if (wifi.ssidRedacted !== true) errors.push('HoloWebWifiEvidence.ssidRedacted must be true.');
  if (wifi.bssidRedacted !== true) errors.push('HoloWebWifiEvidence.bssidRedacted must be true.');
  if (wifi.identifiers) {
    if (wifi.identifiers.ssidRedacted !== true) {
      errors.push('HoloWebWifiEvidence.identifiers.ssidRedacted must be true.');
    }
    if (wifi.identifiers.bssidRedacted !== true) {
      errors.push('HoloWebWifiEvidence.identifiers.bssidRedacted must be true.');
    }
  }
}

function validateCostEvidence(cost: HoloWebCostEvidence | undefined, errors: string[]): void {
  if (!cost) {
    errors.push('HoloWebUnderlay.cost is required.');
    return;
  }
  if (typeof cost.available !== 'boolean') errors.push('HoloWebCostEvidence.available must be a boolean.');
  if (typeof cost.roaming !== 'boolean') errors.push('HoloWebCostEvidence.roaming must be a boolean.');
  if (typeof cost.overDataLimit !== 'boolean') errors.push('HoloWebCostEvidence.overDataLimit must be a boolean.');
  if (typeof cost.approachingDataLimit !== 'boolean') {
    errors.push('HoloWebCostEvidence.approachingDataLimit must be a boolean.');
  }
}

function validateAdapterEvidence(
  adapters: HoloWebAdapterEvidence | undefined,
  errors: string[]
): void {
  if (!adapters) {
    errors.push('HoloWebUnderlay.adapters is required.');
    return;
  }
  if (typeof adapters.available !== 'boolean') {
    errors.push('HoloWebAdapterEvidence.available must be a boolean.');
  }
  if (!isNonNegativeNumber(adapters.adapterCount)) {
    errors.push('HoloWebAdapterEvidence.adapterCount must be a non-negative number.');
  }
  if (!isNonNegativeNumber(adapters.configuredVpnCount)) {
    errors.push('HoloWebAdapterEvidence.configuredVpnCount must be a non-negative number.');
  }
  if (!isNonNegativeNumber(adapters.activeVpnCount)) {
    errors.push('HoloWebAdapterEvidence.activeVpnCount must be a non-negative number.');
  }
  if (adapters.endpointDetailsRedacted !== true) {
    errors.push('HoloWebAdapterEvidence.endpointDetailsRedacted must be true.');
  }
}

function validateUnderlay(underlay: HoloWebUnderlay | undefined, errors: string[]): void {
  if (!underlay) {
    errors.push('HoloWebNetworkRealitySnapshot.underlay is required.');
    return;
  }
  if (!isSupportedHoloWebUnderlayClassification(String(underlay.classification))) {
    errors.push(`HoloWebUnderlay.classification is unsupported: ${String(underlay.classification)}.`);
  }
  if (!isOneOf(HOLOWEB_CONFIDENCE_LEVELS, String(underlay.confidence))) {
    errors.push(`HoloWebUnderlay.confidence is unsupported: ${String(underlay.confidence)}.`);
  }
  if (!isOneOf(HOLOWEB_OWNER_DECLARED_KINDS, String(underlay.ownerDeclaredKind))) {
    errors.push(`HoloWebUnderlay.ownerDeclaredKind is unsupported: ${String(underlay.ownerDeclaredKind)}.`);
  }
  if (
    underlay.ownerDeclaredSource !== undefined &&
    !isOneOf(HOLOWEB_OWNER_DECLARED_SOURCES, String(underlay.ownerDeclaredSource))
  ) {
    errors.push(`HoloWebUnderlay.ownerDeclaredSource is unsupported: ${String(underlay.ownerDeclaredSource)}.`);
  }
  if (!isOneOf(HOLOWEB_INTERFACE_KINDS, String(underlay.osInterfaceKind))) {
    errors.push(`HoloWebUnderlay.osInterfaceKind is unsupported: ${String(underlay.osInterfaceKind)}.`);
  }
  if (!underlay.osCost) errors.push('HoloWebUnderlay.osCost is required.');
  if (!underlay.connectivity) errors.push('HoloWebUnderlay.connectivity is required.');
  if (!isOneOf(HOLOWEB_VPN_STATES, String(underlay.vpnState))) {
    errors.push(`HoloWebUnderlay.vpnState is unsupported: ${String(underlay.vpnState)}.`);
  }
  validateStringArray('HoloWebUnderlay.evidence', underlay.evidence, errors);
  validateWifiEvidence(underlay.wifi, errors);
  validateCostEvidence(underlay.cost, errors);
  validateAdapterEvidence(underlay.adapters, errors);
  if (underlay.locationProof) {
    errors.push(...validateHoloWebLocationProof(underlay.locationProof, 'HoloWebUnderlay.locationProof'));
  }
}

function validateHealth(health: HoloWebHealth | undefined, errors: string[]): void {
  if (!health) {
    errors.push('HoloWebNetworkRealitySnapshot.health is required.');
    return;
  }
  if (!isOneOf(HOLOWEB_HEALTH_STATES, String(health.state))) {
    errors.push(`HoloWebHealth.state is unsupported: ${String(health.state)}.`);
  }
  if (!isNonNegativeNumber(health.networkConsumerCount)) {
    errors.push('HoloWebHealth.networkConsumerCount must be a non-negative number.');
  }
  if (!isNonNegativeNumber(health.establishedConnectionCount)) {
    errors.push('HoloWebHealth.establishedConnectionCount must be a non-negative number.');
  }
  if (!health.processHealthRisk) errors.push('HoloWebHealth.processHealthRisk is required.');
}

function validateNetworkConsumer(
  consumer: HoloWebNetworkConsumer,
  index: number,
  errors: string[]
): void {
  if (!isNonNegativeNumber(consumer.pid)) {
    errors.push(`HoloWebNetworkConsumer[${index}].pid must be a non-negative number.`);
  }
  if (!consumer.pidHash) errors.push(`HoloWebNetworkConsumer[${index}].pidHash is required.`);
  if (!consumer.processName) errors.push(`HoloWebNetworkConsumer[${index}].processName is required.`);
  if (!isOneOf(HOLOWEB_PROCESS_KINDS, String(consumer.processKind))) {
    errors.push(`HoloWebNetworkConsumer[${index}].processKind is unsupported: ${String(consumer.processKind)}.`);
  }
  if (!isNonNegativeNumber(consumer.establishedConnectionCount)) {
    errors.push(`HoloWebNetworkConsumer[${index}].establishedConnectionCount must be a non-negative number.`);
  }
  if (consumer.endpointDetailsRedacted !== true) {
    errors.push(`HoloWebNetworkConsumer[${index}].endpointDetailsRedacted must be true.`);
  }
}

function validateAgentLane(lanes: HoloWebAgentLane | undefined, errors: string[]): void {
  if (!lanes) {
    errors.push('HoloWebNetworkRealitySnapshot.lanes is required.');
    return;
  }
  if (!isNonNegativeNumber(lanes.activeLaneCount)) {
    errors.push('HoloWebAgentLane.activeLaneCount must be a non-negative number.');
  }
  if (!isNonNegativeNumber(lanes.laneCount)) {
    errors.push('HoloWebAgentLane.laneCount must be a non-negative number.');
  }
  if (lanes.staleLaneCount !== undefined && !isNonNegativeNumber(lanes.staleLaneCount)) {
    errors.push('HoloWebAgentLane.staleLaneCount must be a non-negative number.');
  }
  if (lanes.semanticIdentityRequired !== true) {
    errors.push('HoloWebAgentLane.semanticIdentityRequired must be true.');
  }
  if (lanes.processCountIsNotPeerCount !== true) {
    errors.push('HoloWebAgentLane.processCountIsNotPeerCount must be true.');
  }
  if (!lanes.processHealthRisk) errors.push('HoloWebAgentLane.processHealthRisk is required.');
  if (!isNonNegativeNumber(lanes.registeredRunCount)) {
    errors.push('HoloWebAgentLane.registeredRunCount must be a non-negative number.');
  }
  if (!isNonNegativeNumber(lanes.activeRegisteredRunCount)) {
    errors.push('HoloWebAgentLane.activeRegisteredRunCount must be a non-negative number.');
  }
  if (!isNonNegativeNumber(lanes.networkConsumerCount)) {
    errors.push('HoloWebAgentLane.networkConsumerCount must be a non-negative number.');
  }
  if (!isNonNegativeNumber(lanes.agentOrShellNetworkConsumerCount)) {
    errors.push('HoloWebAgentLane.agentOrShellNetworkConsumerCount must be a non-negative number.');
  }
  if (!isNonNegativeNumber(lanes.legacyNetworkConsumerCount)) {
    errors.push('HoloWebAgentLane.legacyNetworkConsumerCount must be a non-negative number.');
  }
  if (!Array.isArray(lanes.topConsumers)) {
    errors.push('HoloWebAgentLane.topConsumers must be an array.');
  } else {
    lanes.topConsumers.forEach((consumer, index) => validateNetworkConsumer(consumer, index, errors));
  }
  validateOptionalStringArray('HoloWebAgentLane.evidenceRequired', lanes.evidenceRequired, errors);
}

function validatePolicy(policy: HoloWebPolicy | undefined, errors: string[]): void {
  if (!policy) {
    errors.push('HoloWebNetworkRealitySnapshot.policy is required.');
    return;
  }
  if (!isOneOf(HOLOWEB_BANDWIDTH_POSTURES, String(policy.bandwidthPosture))) {
    errors.push(`HoloWebPolicy.bandwidthPosture is unsupported: ${String(policy.bandwidthPosture)}.`);
  }
  if (!isOneOf(HOLOWEB_HEAVY_WORK_POLICIES, String(policy.heavyWorkPolicy))) {
    errors.push(`HoloWebPolicy.heavyWorkPolicy is unsupported: ${String(policy.heavyWorkPolicy)}.`);
  }
  if (!isOneOf(HOLOWEB_AGENT_ACTIONS, String(policy.agentAction))) {
    errors.push(`HoloWebPolicy.agentAction is unsupported: ${String(policy.agentAction)}.`);
  }
  if (!isOneOf(HOLOWEB_BRITTNEY_STANCES, String(policy.brittneyStance))) {
    errors.push(`HoloWebPolicy.brittneyStance is unsupported: ${String(policy.brittneyStance)}.`);
  }
  validateStringArray('HoloWebPolicy.allowedWithoutOwnerGesture', policy.allowedWithoutOwnerGesture, errors);
  validateStringArray('HoloWebPolicy.requiresOwnerGesture', policy.requiresOwnerGesture, errors);
}

function validateBrittney(brittney: HoloWebBrittneyPolicy | undefined, errors: string[]): void {
  if (!brittney) {
    errors.push('HoloWebNetworkRealitySnapshot.brittney is required.');
    return;
  }
  if (!isOneOf(HOLOWEB_BRITTNEY_STANCES, String(brittney.stance))) {
    errors.push(`HoloWebBrittneyPolicy.stance is unsupported: ${String(brittney.stance)}.`);
  }
  if (!brittney.firstMessage) errors.push('HoloWebBrittneyPolicy.firstMessage is required.');
  if (typeof brittney.protectBandwidth !== 'boolean') {
    errors.push('HoloWebBrittneyPolicy.protectBandwidth must be a boolean.');
  }
  if (typeof brittney.canExplainToNonDeveloper !== 'boolean') {
    errors.push('HoloWebBrittneyPolicy.canExplainToNonDeveloper must be a boolean.');
  }
}

function validateRedaction(redaction: HoloWebRedactionPolicy | undefined, errors: string[]): void {
  if (!redaction) {
    errors.push('HoloWebNetworkRealitySnapshot.redaction is required.');
    return;
  }
  if (redaction.rawSsidIncluded !== false) errors.push('HoloWebRedactionPolicy.rawSsidIncluded must be false.');
  if (redaction.rawBssidIncluded !== false) errors.push('HoloWebRedactionPolicy.rawBssidIncluded must be false.');
  if (redaction.ipAddressIncluded !== false) errors.push('HoloWebRedactionPolicy.ipAddressIncluded must be false.');
  if (redaction.gatewayIncluded !== false) errors.push('HoloWebRedactionPolicy.gatewayIncluded must be false.');
  if (redaction.remoteEndpointIncluded !== false) {
    errors.push('HoloWebRedactionPolicy.remoteEndpointIncluded must be false.');
  }
  if (redaction.rawCommandLineIncluded !== false) {
    errors.push('HoloWebRedactionPolicy.rawCommandLineIncluded must be false.');
  }
  if (typeof redaction.pidIncluded !== 'boolean') {
    errors.push('HoloWebRedactionPolicy.pidIncluded must be a boolean.');
  }
  if (typeof redaction.pidHashIncluded !== 'boolean') {
    errors.push('HoloWebRedactionPolicy.pidHashIncluded must be a boolean.');
  }
  if (redaction.localOnly !== true) errors.push('HoloWebRedactionPolicy.localOnly must be true.');
}

function validateReceipt(receipt: HoloWebReceipt | undefined, errors: string[]): void {
  if (!receipt) {
    errors.push('HoloWebNetworkRealitySnapshot.receipt is required.');
    return;
  }
  if (!isSupportedHoloWebReceiptType(String(receipt.receiptType))) {
    errors.push(`HoloWebReceipt.receiptType is unsupported: ${String(receipt.receiptType)}.`);
  }
  if (!receipt.snapshotHash) errors.push('HoloWebReceipt.snapshotHash is required.');
  if (!isOneOf(HOLOWEB_RECEIPT_ACTIONS, String(receipt.actionTaken))) {
    errors.push(`HoloWebReceipt.actionTaken is unsupported: ${String(receipt.actionTaken)}.`);
  }
  if (typeof receipt.mutationPerformed !== 'boolean') {
    errors.push('HoloWebReceipt.mutationPerformed must be a boolean.');
  }
  if (receipt.receiptType === 'network_reality_snapshot' && receipt.mutationPerformed !== false) {
    errors.push('HoloWebReceipt network_reality_snapshot must not perform mutation.');
  }
  if (receipt.payloadInspection !== undefined && receipt.payloadInspection !== false) {
    errors.push('HoloWebReceipt.payloadInspection must be false when provided.');
  }
  if (receipt.hashAlgorithm !== undefined && receipt.hashAlgorithm !== 'sha256') {
    errors.push(`HoloWebReceipt.hashAlgorithm is unsupported: ${String(receipt.hashAlgorithm)}.`);
  }
  if (receipt.emittedAt !== undefined && !isIsoTimestamp(receipt.emittedAt)) {
    errors.push('HoloWebReceipt.emittedAt must be a valid ISO-8601 timestamp when provided.');
  }
  validateOptionalStringArray('HoloWebReceipt.parentReceiptIds', receipt.parentReceiptIds, errors);
}

export function validateHoloWebNetworkRealitySnapshot(
  snapshot: HoloWebNetworkRealitySnapshot
): string[] {
  const errors: string[] = [];

  if (snapshot.schemaVersion !== HOLOWEB_NETWORK_REALITY_SCHEMA_VERSION) {
    errors.push(
      `HoloWebNetworkRealitySnapshot.schemaVersion must be ${HOLOWEB_NETWORK_REALITY_SCHEMA_VERSION}.`
    );
  }
  if (!isIsoTimestamp(snapshot.generatedAt)) {
    errors.push('HoloWebNetworkRealitySnapshot.generatedAt is required and must be a valid ISO-8601 timestamp.');
  }

  validateNode(snapshot.node, errors);
  validateUnderlay(snapshot.underlay, errors);
  validateHealth(snapshot.health, errors);
  validateAgentLane(snapshot.lanes, errors);
  validatePolicy(snapshot.policy, errors);
  validateBrittney(snapshot.brittney, errors);
  validateRedaction(snapshot.redaction, errors);
  validateReceipt(snapshot.receipt, errors);
  if (snapshot.locationProof) {
    errors.push(...validateHoloWebLocationProof(snapshot.locationProof, 'HoloWebNetworkRealitySnapshot.locationProof'));
  }

  return errors;
}

function cloneLocationProof(proof: HoloWebLocationProof): HoloWebLocationProof {
  return {
    ...proof,
    ...(proof.metadata ? { metadata: { ...proof.metadata } } : {}),
  };
}

function cloneNode(node: HoloWebNode): HoloWebNode {
  return {
    ...node,
    ...(node.capabilities ? { capabilities: [...node.capabilities] } : {}),
    ...(node.locationProof ? { locationProof: cloneLocationProof(node.locationProof) } : {}),
    ...(node.metadata ? { metadata: { ...node.metadata } } : {}),
  };
}

function cloneUnderlay(underlay: HoloWebUnderlay): HoloWebUnderlay {
  return {
    ...underlay,
    evidence: [...underlay.evidence],
    wifi: {
      ...underlay.wifi,
      ...(underlay.wifi.identifiers
        ? { identifiers: { ...underlay.wifi.identifiers } }
        : {}),
    },
    cost: { ...underlay.cost },
    adapters: { ...underlay.adapters },
    ...(underlay.locationProof
      ? { locationProof: cloneLocationProof(underlay.locationProof) }
      : {}),
  };
}

function cloneAgentLane(lanes: HoloWebAgentLane): HoloWebAgentLane {
  return {
    ...lanes,
    topConsumers: lanes.topConsumers.map((consumer) => ({ ...consumer })),
    ...(lanes.evidenceRequired ? { evidenceRequired: [...lanes.evidenceRequired] } : {}),
  };
}

function clonePolicy(policy: HoloWebPolicy): HoloWebPolicy {
  return {
    ...policy,
    allowedWithoutOwnerGesture: [...policy.allowedWithoutOwnerGesture],
    requiresOwnerGesture: [...policy.requiresOwnerGesture],
    ...(policy.metadata ? { metadata: { ...policy.metadata } } : {}),
  };
}

function cloneReceipt(receipt: HoloWebReceipt): HoloWebReceipt {
  return {
    ...receipt,
    ...(receipt.parentReceiptIds ? { parentReceiptIds: [...receipt.parentReceiptIds] } : {}),
    ...(receipt.metadata ? { metadata: { ...receipt.metadata } } : {}),
  };
}

export function cloneHoloWebNetworkRealitySnapshot(
  snapshot: HoloWebNetworkRealitySnapshot
): HoloWebNetworkRealitySnapshot {
  return {
    ...snapshot,
    ...(snapshot.sourceAnchors ? { sourceAnchors: { ...snapshot.sourceAnchors } } : {}),
    node: cloneNode(snapshot.node),
    underlay: cloneUnderlay(snapshot.underlay),
    health: { ...snapshot.health },
    lanes: cloneAgentLane(snapshot.lanes),
    policy: clonePolicy(snapshot.policy),
    brittney: { ...snapshot.brittney },
    redaction: { ...snapshot.redaction },
    receipt: cloneReceipt(snapshot.receipt),
    ...(snapshot.locationProof
      ? { locationProof: cloneLocationProof(snapshot.locationProof) }
      : {}),
    ...(snapshot.metadata ? { metadata: { ...snapshot.metadata } } : {}),
  };
}
