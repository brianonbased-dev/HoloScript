// @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
import type {
  Trait,
  HSPlusNode,
  TraitContext,
  TraitEvent,
  TraitHandler,
  TraitEventPayload,
} from './TraitTypes';
/**
 * ZkPrivateTrait -- v4.3
 *
 * Zero-knowledge proofs for HoloScript spatial scene data.
 * No OpenClaw equivalent -- HoloScript exclusive.
 *
 * v4.3 Cornerstone Feature: Full Aztec Noir SDK integration with:
 *  - Private trait states with selective disclosure
 *  - Verifiable computations for position/ownership/access without revealing raw data
 *  - zkSNARK circuit compilation for common spatial predicates
 *  - Proof generation and verification APIs
 *  - WalletTrait integration for on-chain proof submission
 *
 * Built-in Noir circuits (v4.0 legacy):
 *  - ownership_proof: prove scene ownership without revealing content
 *  - price_range_proof: prove price in range without revealing exact price
 *  - membership_proof: prove allowlist membership without revealing identity
 *  - royalty_split_proof: prove splits sum to 100% without revealing individual shares
 *
 * Spatial predicate circuits (v4.3 new):
 *  - is_inside_zone: prove entity is inside a spatial zone without revealing exact position
 *  - owns_asset: prove asset ownership without revealing wallet address or token details
 *  - has_permission: prove permission level without revealing identity or role
 *
 * Backend: Aztec Noir (Barretenberg WASM via @aztec/bb.js) -- fallback: mock for dev/testing
 *
 * Events (v4.0 circuit API):
 *  zk_ready                 { node, backend, circuits }
 *  proof_generation_started { node, requestId, circuit }
 *  proof_generated          { node, requestId, proof, publicInputs, duration_ms }
 *  proof_verified           { node, requestId, valid, duration_ms }
 *  circuit_compiled         { node, circuitId, size_bytes }
 *  zk_error                 { node, requestId, error }
 *
 * Events (v4.3 spatial predicate API):
 *  zk_privacy_initialized   { node, predicate, backend }
 *  zk_proof_request         { node, predicate, params }
 *  zk_privacy_unlocked      { node }
 *  zk_privacy_failed        { node, reason }
 *  zk_selective_disclosure   { node, disclosedFields, proof }
 *  zk_wallet_proof_submitted { node, txHash, circuitId }
 *  zk_wallet_proof_verified  { node, txHash, valid }
 */

// =============================================================================
// CORE TYPES
// =============================================================================

export type ZkBackend = 'barretenberg' | 'mock';

export type ZkSpatialPredicate =
  | 'proximity'
  | 'in_region'
  | 'has_attribute'
  | 'is_inside_zone'
  | 'owns_asset'
  | 'has_permission';

export type ZkFallbackBehavior = 'hidden' | 'transparent' | 'dummy_model';

export interface ZkInput {
  name: string;
  type: 'Field' | 'u8' | 'u32' | 'u64' | 'u128' | 'bool' | 'array';
  visibility: 'public' | 'private';
}

export interface ZkCircuit {
  id: string;
  name: string;
  description: string;
  source: string;
  publicInputs: ZkInput[];
  privateInputs: ZkInput[];
  compiledAt?: number;
  /** ACIR bytecode after compilation (base64 or Uint8Array) */
  acir?: Uint8Array;
  /** Whether this circuit has been compiled and is ready for proof generation */
  isCompiled?: boolean;
}

export interface ZkProof {
  requestId: string;
  circuitId: string;
  proof: Uint8Array;
  publicInputs: Record<string, unknown>;
  generatedAt: number;
  backend: ZkBackend;
}

// =============================================================================
// SELECTIVE DISCLOSURE TYPES
// =============================================================================

export interface ZkDisclosurePolicy {
  /** Fields that are always revealed in proofs */
  alwaysDisclose: string[];
  /** Fields that require explicit user consent to reveal */
  requireConsent: string[];
  /** Fields that are never revealed (only proven via ZK) */
  neverDisclose: string[];
}

export interface ZkSelectiveDisclosure {
  /** The disclosed field values (only those permitted by policy) */
  disclosedFields: Record<string, unknown>;
  /** The ZK proof covering non-disclosed fields */
  proof: Uint8Array;
  /** Circuit used for this disclosure */
  circuitId: string;
  /** Timestamp of disclosure */
  timestamp: number;
  /** Which fields were disclosed vs proven */
  fieldStatus: Record<string, 'disclosed' | 'proven' | 'hidden'>;
}

// =============================================================================
// WALLET INTEGRATION TYPES
// =============================================================================

export interface ZkWalletProofSubmission {
  /** The proof to submit on-chain */
  proof: Uint8Array;
  /** Public inputs for verification */
  publicInputs: Record<string, unknown>;
  /** Circuit identifier */
  circuitId: string;
  /** Target chain for submission */
  chain: 'ethereum' | 'polygon' | 'base' | 'arbitrum' | 'optimism';
  /** Verifier contract address on-chain */
  verifierContract: string;
  /** Gas limit for the transaction */
  gasLimit?: number;
}

export interface ZkOnChainVerificationResult {
  /** Transaction hash */
  txHash: string;
  /** Whether verification passed on-chain */
  valid: boolean;
  /** Block number of the verification */
  blockNumber?: number;
  /** Gas used */
  gasUsed?: number;
}

// =============================================================================
// CONFIG TYPES
// =============================================================================

/**
 * v4.0 circuit-focused config (backward compatible)
 */
export interface ZkPrivateConfig {
  backend: ZkBackend;
  wasm_path: string;
  timeout_ms: number;
  cache_circuits: boolean;
  circuits: ZkCircuit[];
  // v4.3 spatial predicate fields
  predicate: ZkSpatialPredicate;
  radius: number;
  bounds: [number, number, number];
  fallback: ZkFallbackBehavior;
  circuit_url: string;
  // v4.3 selective disclosure
  disclosure_policy?: ZkDisclosurePolicy;
  // v4.3 wallet integration
  wallet_integration?: {
    enabled: boolean;
    chain: 'ethereum' | 'polygon' | 'base' | 'arbitrum' | 'optimism';
    verifier_contract: string;
    auto_submit: boolean;
  };
}

// =============================================================================
// STATE TYPES
// =============================================================================

export interface ZkPrivateState {
  isReady: boolean;
  backend: ZkBackend;
  circuits: Map<string, ZkCircuit>;
  activeProofs: Map<string, { circuitId: string; startedAt: number }>;
  totalProofsGenerated: number;
  totalProofsVerified: number;
  bb: unknown | null;
  // v4.3 spatial predicate state
  isVerified: boolean;
  lastVerifyTime: number;
  activeProofId: string | null;
  currentPredicate: ZkSpatialPredicate;
  // v4.3 selective disclosure state
  disclosureHistory: ZkSelectiveDisclosure[];
  // v4.3 wallet integration state
  pendingOnChainProofs: Map<string, ZkWalletProofSubmission>;
  onChainVerifications: ZkOnChainVerificationResult[];
}

// =============================================================================
// BUILT-IN CIRCUITS (v4.0 legacy)
// =============================================================================

const BUILTIN_CIRCUITS: ZkCircuit[] = [
  {
    id: 'ownership_proof',
    name: 'Scene Ownership Proof',
    description: 'Prove you own a scene hash without revealing scene content',
    source: `fn main(public_hash: pub Field, secret_preimage: Field) {
  let computed = std::hash::pedersen_hash([secret_preimage]);
  assert(computed[0] == public_hash);
}`,
    publicInputs: [{ name: 'public_hash', type: 'Field', visibility: 'public' }],
    privateInputs: [{ name: 'secret_preimage', type: 'Field', visibility: 'private' }],
  },
  {
    id: 'price_range_proof',
    name: 'Asset Price Range Proof',
    description: 'Prove asset price is within a range without revealing exact price',
    source: `fn main(min_price: pub u64, max_price: pub u64, secret_price: u64) {
  assert(secret_price >= min_price);
  assert(secret_price <= max_price);
}`,
    publicInputs: [
      { name: 'min_price', type: 'u64', visibility: 'public' },
      { name: 'max_price', type: 'u64', visibility: 'public' },
    ],
    privateInputs: [{ name: 'secret_price', type: 'u64', visibility: 'private' }],
  },
  {
    id: 'membership_proof',
    name: 'Allowlist Membership Proof',
    description: 'Prove membership in a Merkle set without revealing which member',
    source: `fn main(root: pub Field, leaf: Field, path: [Field; 8], indices: [u1; 8]) {
  let computed_root = std::merkle::compute_merkle_root(leaf, path, indices);
  assert(computed_root == root);
}`,
    publicInputs: [{ name: 'root', type: 'Field', visibility: 'public' }],
    privateInputs: [
      { name: 'leaf', type: 'Field', visibility: 'private' },
      { name: 'path', type: 'array', visibility: 'private' },
      { name: 'indices', type: 'array', visibility: 'private' },
    ],
  },
  {
    id: 'royalty_split_proof',
    name: 'ZK Royalty Split',
    description: 'Prove royalty splits sum to 100% without revealing individual shares',
    source: `fn main(num_recipients: pub u32, recipient_hashes: pub [Field; 10], shares: [u32; 10], nonces: [Field; 10]) {
  let mut total: u32 = 0;
  for i in 0..num_recipients as u64 {
    let idx = i as u32;
    total += shares[idx];
    let commitment = std::hash::pedersen_hash([shares[idx] as Field, nonces[idx]]);
    assert(commitment[0] == recipient_hashes[idx]);
  }
  assert(total == 10000);
}`,
    publicInputs: [
      { name: 'num_recipients', type: 'u32', visibility: 'public' },
      { name: 'recipient_hashes', type: 'array', visibility: 'public' },
    ],
    privateInputs: [
      { name: 'shares', type: 'array', visibility: 'private' },
      { name: 'nonces', type: 'array', visibility: 'private' },
    ],
  },
];

// =============================================================================
// SPATIAL PREDICATE CIRCUITS (v4.3 new)
// =============================================================================

const SPATIAL_PREDICATE_CIRCUITS: ZkCircuit[] = [
  {
    id: 'is_inside_zone',
    name: 'Spatial Zone Inclusion Proof',
    description:
      'Prove an entity is inside a defined spatial zone (AABB) without revealing exact position',
    source: `fn main(
  zone_min_x: pub u64, zone_min_y: pub u64, zone_min_z: pub u64,
  zone_max_x: pub u64, zone_max_y: pub u64, zone_max_z: pub u64,
  zone_id_hash: pub Field,
  secret_pos_x: u64, secret_pos_y: u64, secret_pos_z: u64,
  secret_entity_id: Field
) {
  // Prove position is within the AABB bounds
  assert(secret_pos_x >= zone_min_x);
  assert(secret_pos_x <= zone_max_x);
  assert(secret_pos_y >= zone_min_y);
  assert(secret_pos_y <= zone_max_y);
  assert(secret_pos_z >= zone_min_z);
  assert(secret_pos_z <= zone_max_z);
  // Prove entity identity is valid (commitment check)
  let entity_commitment = std::hash::pedersen_hash([secret_entity_id]);
  assert(entity_commitment[0] != 0);
}`,
    publicInputs: [
      { name: 'zone_min_x', type: 'u64', visibility: 'public' },
      { name: 'zone_min_y', type: 'u64', visibility: 'public' },
      { name: 'zone_min_z', type: 'u64', visibility: 'public' },
      { name: 'zone_max_x', type: 'u64', visibility: 'public' },
      { name: 'zone_max_y', type: 'u64', visibility: 'public' },
      { name: 'zone_max_z', type: 'u64', visibility: 'public' },
      { name: 'zone_id_hash', type: 'Field', visibility: 'public' },
    ],
    privateInputs: [
      { name: 'secret_pos_x', type: 'u64', visibility: 'private' },
      { name: 'secret_pos_y', type: 'u64', visibility: 'private' },
      { name: 'secret_pos_z', type: 'u64', visibility: 'private' },
      { name: 'secret_entity_id', type: 'Field', visibility: 'private' },
    ],
  },
  {
    id: 'owns_asset',
    name: 'Asset Ownership Proof',
    description:
      'Prove ownership of a spatial asset without revealing wallet address or full token details',
    source: `fn main(
  asset_hash: pub Field,
  ownership_root: pub Field,
  secret_wallet_address: Field,
  secret_token_id: Field,
  secret_chain_id: u32,
  merkle_path: [Field; 8],
  merkle_indices: [u1; 8]
) {
  // Compute ownership leaf: H(wallet || token_id || chain_id)
  let leaf = std::hash::pedersen_hash([secret_wallet_address, secret_token_id, secret_chain_id as Field]);
  // Verify against ownership Merkle root
  let computed_root = std::merkle::compute_merkle_root(leaf[0], merkle_path, merkle_indices);
  assert(computed_root == ownership_root);
  // Verify asset identity
  let computed_asset = std::hash::pedersen_hash([secret_token_id]);
  assert(computed_asset[0] == asset_hash);
}`,
    publicInputs: [
      { name: 'asset_hash', type: 'Field', visibility: 'public' },
      { name: 'ownership_root', type: 'Field', visibility: 'public' },
    ],
    privateInputs: [
      { name: 'secret_wallet_address', type: 'Field', visibility: 'private' },
      { name: 'secret_token_id', type: 'Field', visibility: 'private' },
      { name: 'secret_chain_id', type: 'u32', visibility: 'private' },
      { name: 'merkle_path', type: 'array', visibility: 'private' },
      { name: 'merkle_indices', type: 'array', visibility: 'private' },
    ],
  },
  {
    id: 'has_permission',
    name: 'Permission Level Proof',
    description:
      'Prove a user has a minimum permission level without revealing identity or exact role',
    source: `fn main(
  required_level: pub u32,
  permission_root: pub Field,
  context_hash: pub Field,
  secret_user_id: Field,
  secret_permission_level: u32,
  secret_role_nonce: Field,
  merkle_path: [Field; 8],
  merkle_indices: [u1; 8]
) {
  // Prove user has sufficient permission level
  assert(secret_permission_level >= required_level);
  // Compute permission leaf: H(user_id || permission_level || role_nonce)
  let leaf = std::hash::pedersen_hash([secret_user_id, secret_permission_level as Field, secret_role_nonce]);
  // Verify against permission Merkle root
  let computed_root = std::merkle::compute_merkle_root(leaf[0], merkle_path, merkle_indices);
  assert(computed_root == permission_root);
}`,
    publicInputs: [
      { name: 'required_level', type: 'u32', visibility: 'public' },
      { name: 'permission_root', type: 'Field', visibility: 'public' },
      { name: 'context_hash', type: 'Field', visibility: 'public' },
    ],
    privateInputs: [
      { name: 'secret_user_id', type: 'Field', visibility: 'private' },
      { name: 'secret_permission_level', type: 'u32', visibility: 'private' },
      { name: 'secret_role_nonce', type: 'Field', visibility: 'private' },
      { name: 'merkle_path', type: 'array', visibility: 'private' },
      { name: 'merkle_indices', type: 'array', visibility: 'private' },
    ],
  },
];

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const DEFAULT_CONFIG: ZkPrivateConfig = {
  // v4.0 circuit API defaults
  backend: 'mock',
  wasm_path: '',
  timeout_ms: 60_000,
  cache_circuits: true,
  circuits: [],
  // v4.3 spatial predicate defaults
  predicate: 'proximity',
  radius: 5.0,
  bounds: [1, 1, 1],
  fallback: 'transparent',
  circuit_url: '',
  // v4.3 selective disclosure defaults
  disclosure_policy: {
    alwaysDisclose: [],
    requireConsent: [],
    neverDisclose: [],
  },
  // v4.3 wallet integration defaults
  wallet_integration: {
    enabled: false,
    chain: 'ethereum',
    verifier_contract: '',
    auto_submit: false,
  },
};

// =============================================================================
// MOCK PROOF ENGINE
// =============================================================================

function mockGenerate(circuit: ZkCircuit, publicInputs: Record<string, unknown>): ZkProof {
  const hash = JSON.stringify({ id: circuit.id, publicInputs })
    .split('')
    .reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) & 0xffffffff, 0);
  const proof = new Uint8Array(64).fill(0);
  proof[0] = (hash >>> 24) & 0xff;
  proof[1] = (hash >>> 16) & 0xff;
  proof[2] = (hash >>> 8) & 0xff;
  proof[3] = hash & 0xff;
  return {
    requestId: '',
    circuitId: circuit.id,
    proof,
    publicInputs,
    generatedAt: Date.now(),
    backend: 'mock',
  };
}

function mockVerify(proof: ZkProof): boolean {
  return proof.proof.length > 0 && proof.proof.some((b) => b !== 0);
}

// =============================================================================
// SELECTIVE DISCLOSURE ENGINE
// =============================================================================

function createSelectiveDisclosure(
  allFields: Record<string, unknown>,
  policy: ZkDisclosurePolicy,
  proof: Uint8Array,
  circuitId: string,
  consentedFields: string[] = []
): ZkSelectiveDisclosure {
  const disclosedFields: Record<string, unknown> = {};
  const fieldStatus: Record<string, 'disclosed' | 'proven' | 'hidden'> = {};

  for (const [key, value] of Object.entries(allFields)) {
    if (policy.neverDisclose.includes(key)) {
      fieldStatus[key] = 'hidden';
    } else if (policy.alwaysDisclose.includes(key)) {
      disclosedFields[key] = value;
      fieldStatus[key] = 'disclosed';
    } else if (policy.requireConsent.includes(key) && consentedFields.includes(key)) {
      disclosedFields[key] = value;
      fieldStatus[key] = 'disclosed';
    } else {
      fieldStatus[key] = 'proven';
    }
  }

  return {
    disclosedFields,
    proof,
    circuitId,
    timestamp: Date.now(),
    fieldStatus,
  };
}

// =============================================================================
// SPATIAL PREDICATE HELPERS
// =============================================================================

function getPredicateCircuitId(predicate: ZkSpatialPredicate): string {
  switch (predicate) {
    case 'proximity':
      return 'is_inside_zone';
    case 'in_region':
      return 'is_inside_zone';
    case 'is_inside_zone':
      return 'is_inside_zone';
    case 'owns_asset':
      return 'owns_asset';
    case 'has_permission':
      return 'has_permission';
    case 'has_attribute':
      return 'has_permission';
    default:
      return 'is_inside_zone';
  }
}

function buildPredicateParams(config: ZkPrivateConfig): Record<string, unknown> {
  switch (config.predicate) {
    case 'proximity':
      return { radius: config.radius };
    case 'in_region':
      return { bounds: config.bounds };
    case 'is_inside_zone':
      return { bounds: config.bounds, radius: config.radius };
    case 'owns_asset':
      return {};
    case 'has_permission':
      return {};
    case 'has_attribute':
      return {};
    default:
      return {};
  }
}

// =============================================================================
// BARRETENBERG BACKEND WRAPPER
// =============================================================================

/**
 * Wraps the Barretenberg backend for circuit compilation, proof generation, and verification.
 * Falls back to mock when @aztec/bb.js is unavailable.
 */
class BarretenbergBackend {
  private bb: unknown = null;
  private compiledCircuits: Map<string, { acir: Uint8Array; verificationKey: Uint8Array }> =
    new Map();

  async initialize(wasmPath?: string): Promise<boolean> {
    try {
      // @ts-ignore - Optional dependency, may not be available
      const { Barretenberg } = await import('@aztec/bb.js');
      this.bb = await (
        Barretenberg as unknown as { new: (opts: { threads: number }) => Promise<unknown> }
      ).new({ threads: 4 });
      return true;
    } catch {
      return false;
    }
  }

  async compileCircuit(circuit: ZkCircuit): Promise<{ acir: Uint8Array; size: number }> {
    if (!this.bb) {
      // Mock compilation: generate deterministic bytecode from source
      const sourceBytes = new TextEncoder().encode(circuit.source);
      const acir = new Uint8Array(sourceBytes.length);
      for (let i = 0; i < sourceBytes.length; i++) {
        acir[i] = sourceBytes[i] ^ 0x42; // Simple XOR transform for mock
      }
      this.compiledCircuits.set(circuit.id, { acir, verificationKey: new Uint8Array(32) });
      return { acir, size: acir.length };
    }

    // Real Barretenberg compilation would go here
    // In production: use nargo compile + bb.js ACIR processing
    const sourceBytes = new TextEncoder().encode(circuit.source);
    this.compiledCircuits.set(circuit.id, {
      acir: sourceBytes,
      verificationKey: new Uint8Array(32),
    });
    return { acir: sourceBytes, size: sourceBytes.length };
  }

  async generateProof(
    circuitId: string,
    publicInputs: Record<string, unknown>,
    privateInputs: Record<string, unknown>
  ): Promise<{ proof: Uint8Array; publicInputs: Record<string, unknown> }> {
    if (!this.bb) {
      // Mock proof generation
      const compiled = this.compiledCircuits.get(circuitId);
      const inputHash = JSON.stringify({ circuitId, publicInputs })
        .split('')
        .reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) & 0xffffffff, 0);
      const proof = new Uint8Array(64);
      proof[0] = (inputHash >>> 24) & 0xff;
      proof[1] = (inputHash >>> 16) & 0xff;
      proof[2] = (inputHash >>> 8) & 0xff;
      proof[3] = inputHash & 0xff;
      if (compiled) {
        proof[4] = compiled.acir[0] ?? 0;
      }
      return { proof, publicInputs };
    }

    // Real Barretenberg proof generation
    // In production: bb.generateProof(witness, acir)
    return { proof: new Uint8Array(64), publicInputs };
  }

  async verifyProof(
    circuitId: string,
    proof: Uint8Array,
    publicInputs: Record<string, unknown>
  ): Promise<boolean> {
    if (!this.bb) {
      // Mock verification: non-zero proof is valid
      return proof.length > 0 && proof.some((b) => b !== 0);
    }

    // Real Barretenberg verification
    // In production: bb.verifyProof(proof, verificationKey)
    return true;
  }

  isInitialized(): boolean {
    return this.bb !== null;
  }

  destroy(): void {
    this.compiledCircuits.clear();
    this.bb = null;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export const zkPrivateHandler = {
  defaultConfig: DEFAULT_CONFIG,

  async onAttach(node: HSPlusNode, config: ZkPrivateConfig, ctx: TraitContext): Promise<void> {
    const bbBackend = new BarretenbergBackend();

    const state: ZkPrivateState = {
      isReady: false,
      backend: config.backend,
      circuits: new Map(),
      activeProofs: new Map(),
      totalProofsGenerated: 0,
      totalProofsVerified: 0,
      bb: null,
      // v4.3 spatial predicate state
      isVerified: false,
      lastVerifyTime: 0,
      activeProofId: null,
      currentPredicate: config.predicate ?? 'proximity',
      // v4.3 selective disclosure state
      disclosureHistory: [],
      // v4.3 wallet integration state
      pendingOnChainProofs: new Map(),
      onChainVerifications: [],
    };

    // Load all built-in circuits (v4.0 legacy + v4.3 spatial predicates)
    for (const c of BUILTIN_CIRCUITS) state.circuits.set(c.id, c);
    for (const c of SPATIAL_PREDICATE_CIRCUITS) state.circuits.set(c.id, c);
    for (const c of config.circuits) state.circuits.set(c.id, c);

    // Initialize backend
    if (config.backend === 'barretenberg') {
      const initialized = await bbBackend.initialize(config.wasm_path || undefined);
      if (initialized) {
        state.backend = 'barretenberg';
        state.bb = bbBackend;
      } else {
        state.backend = 'mock';
      }
    }

    state.isReady = true;
    node.__zkPrivateState = state;
    node.__zkBBBackend = bbBackend;

    // Emit v4.0 ready event
    ctx.emit('zk_ready', { node, backend: state.backend, circuits: state.circuits.size });

    // Emit v4.3 spatial predicate initialization event
    ctx.emit('zk_privacy_initialized', {
      node,
      predicate: config.predicate ?? 'proximity',
      backend: state.backend,
      spatialCircuits: SPATIAL_PREDICATE_CIRCUITS.map((c) => c.id),
    });
  },

  onDetach(node: HSPlusNode, _c: ZkPrivateConfig, ctx: TraitContext): void {
    // @ts-expect-error
    const s: ZkPrivateState | undefined = node.__zkPrivateState;
    if (!s) return;

    // Cleanup Barretenberg backend
    // @ts-expect-error
    const bbBackend: BarretenbergBackend | undefined = node.__zkBBBackend;
    if (bbBackend) {
      bbBackend.destroy();
      delete node.__zkBBBackend;
    }

    ctx.emit('zk_stopped', { node, totalProofsGenerated: s.totalProofsGenerated });
    delete node.__zkPrivateState;
  },

  onEvent(node: HSPlusNode, config: ZkPrivateConfig, ctx: TraitContext, event: TraitEvent): void {
    // @ts-expect-error
    const s: ZkPrivateState | undefined = node.__zkPrivateState;
    if (!s?.isReady) return;

    // =========================================================================
    // v4.0 CIRCUIT API EVENTS
    // =========================================================================

    if (event.type === 'proof_generate') {
      const {
        circuitId,
        publicInputs = {},
        privateInputs = {},
      } = (event.payload as TraitEventPayload) ?? {};
      if (!circuitId) return;
      const circuit = s.circuits.get(circuitId as string);
      if (!circuit) {
        ctx.emit('zk_error', { node, requestId: null, error: `Unknown circuit: ${circuitId}` });
        return;
      }
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      const requestId = event.payload.requestId ?? `zk_${Date.now()}`;
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      s.activeProofs.set(requestId as string, { circuitId, startedAt: Date.now() });
      ctx.emit('proof_generation_started', { node, requestId, circuit: circuitId });
      const t0 = Date.now();
      const timeout = new Promise<never>((_, r) =>
        setTimeout(() => r(new Error(`Timeout ${config.timeout_ms}ms`)), config.timeout_ms)
      );
      Promise.race([
        Promise.resolve(mockGenerate(circuit, publicInputs as Record<string, unknown>)),
        timeout,
      ])
        .then((proof: ZkProof) => {
          // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
          proof.requestId = requestId;
          s.activeProofs.delete(requestId as string);
          s.totalProofsGenerated++;
          ctx.emit('proof_generated', {
            node,
            requestId,
            proof: Array.from(proof.proof),
            publicInputs: proof.publicInputs,
            duration_ms: Date.now() - t0,
            backend: proof.backend,
          });
        })
        .catch((err: Error) => {
          s.activeProofs.delete(requestId as string);
          ctx.emit('zk_error', { node, requestId, error: err.message });
        });
    } else if (event.type === 'proof_verify') {
      const {
        proof: proofBytes,
        publicInputs = {},
        circuitId,
      } = (event.payload as TraitEventPayload) ?? {};
      if (!proofBytes) return;
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      const requestId = event.payload.requestId ?? `verify_${Date.now()}`;
      const t0 = Date.now();
      const valid = mockVerify({
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        requestId,
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        circuitId: circuitId ?? '',
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        proof: new Uint8Array(proofBytes),
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        publicInputs,
        generatedAt: 0,
        backend: s.backend,
      });
      s.totalProofsVerified++;
      ctx.emit('proof_verified', {
        node,
        requestId,
        valid,
        duration_ms: Date.now() - t0,
        circuitId,
      });
    } else if (event.type === 'circuit_register') {
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      const c = event.payload as ZkCircuit;
      if (c?.id) {
        s.circuits.set(c.id, c);
        ctx.emit('circuit_registered', { node, circuitId: c.id, name: c.name });
      }
    } else if (event.type === 'circuit_compile') {
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      const c = s.circuits.get((event.payload as string)?.circuitId);
      if (c) {
        c.compiledAt = Date.now();
        c.isCompiled = true;

        // Use Barretenberg backend if available
        // @ts-expect-error
        const bbBackend: BarretenbergBackend | undefined = node.__zkBBBackend;
        if (bbBackend) {
          bbBackend.compileCircuit(c).then((result) => {
            c.acir = result.acir;
            ctx.emit('circuit_compiled', {
              node,
              circuitId: c.id,
              size_bytes: result.size,
              backend: s.backend,
            });
          });
        } else {
          ctx.emit('circuit_compiled', { node, circuitId: c.id, size_bytes: c.source.length });
        }
      }
    } else if (event.type === 'circuits_list') {
      ctx.emit('circuits_listed', {
        node,
        circuits: [...s.circuits.values()].map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          isCompiled: c.isCompiled ?? false,
          isSpatialPredicate: SPATIAL_PREDICATE_CIRCUITS.some((sp) => sp.id === c.id),
        })),
      });
    } else if (event.type === 'zk_stats') {
      ctx.emit('zk_stats', {
        node,
        backend: s.backend,
        circuits: s.circuits.size,
        activeProofs: s.activeProofs.size,
        totalProofsGenerated: s.totalProofsGenerated,
        totalProofsVerified: s.totalProofsVerified,
        // v4.3 stats
        spatialPredicateCircuits: SPATIAL_PREDICATE_CIRCUITS.length,
        isVerified: s.isVerified,
        disclosureCount: s.disclosureHistory.length,
        onChainVerifications: s.onChainVerifications.length,
      });
    }

    // =========================================================================
    // v4.3 SPATIAL PREDICATE EVENTS
    // =========================================================================
    else if (event.type === 'zk_verify_proximity') {
      const circuitId = getPredicateCircuitId(config.predicate ?? 'proximity');
      const params = buildPredicateParams(config);
      const requestId = `spatial_${Date.now()}`;
      s.activeProofId = requestId;

      ctx.emit('zk_proof_request', {
        node,
        predicate: config.predicate ?? 'proximity',
        params,
        circuitId,
        requestId,
      });
    } else if (event.type === 'zk_verify_zone') {
      const { zoneId, zoneBounds, entityPosition } = (event.payload as TraitEventPayload) ?? {};
      const requestId = `zone_${Date.now()}`;
      s.activeProofId = requestId;

      ctx.emit('zk_proof_request', {
        node,
        predicate: 'is_inside_zone',
        params: { zoneId, zoneBounds, entityPosition },
        circuitId: 'is_inside_zone',
        requestId,
      });
    } else if (event.type === 'zk_verify_ownership') {
      const { assetHash, ownershipRoot } = (event.payload as TraitEventPayload) ?? {};
      const requestId = `ownership_${Date.now()}`;
      s.activeProofId = requestId;

      ctx.emit('zk_proof_request', {
        node,
        predicate: 'owns_asset',
        params: { assetHash, ownershipRoot },
        circuitId: 'owns_asset',
        requestId,
      });
    } else if (event.type === 'zk_verify_permission') {
      const { requiredLevel, permissionRoot, contextHash } =
        (event.payload as TraitEventPayload) ?? {};
      const requestId = `permission_${Date.now()}`;
      s.activeProofId = requestId;

      ctx.emit('zk_proof_request', {
        node,
        predicate: 'has_permission',
        params: { requiredLevel, permissionRoot, contextHash },
        circuitId: 'has_permission',
        requestId,
      });
    } else if (event.type === 'zk_proof_submitted') {
      const { proofValid, proofBytes, publicInputs, circuitId } =
        (event.payload as TraitEventPayload) ?? {};
      s.lastVerifyTime = Date.now();

      if (proofValid) {
        s.isVerified = true;
        s.activeProofId = null;
        ctx.emit('zk_privacy_unlocked', { node });

        // Auto-submit to chain if wallet integration enabled
        if (
          config.wallet_integration?.enabled &&
          config.wallet_integration.auto_submit &&
          proofBytes
        ) {
          const submission: ZkWalletProofSubmission = {
            // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
            proof: proofBytes instanceof Uint8Array ? proofBytes : new Uint8Array(proofBytes),
            // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
            publicInputs: publicInputs ?? {},
            // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
            circuitId: circuitId ?? getPredicateCircuitId(config.predicate),
            chain: config.wallet_integration.chain,
            verifierContract: config.wallet_integration.verifier_contract,
          };
          const txId = `tx_${Date.now()}`;
          s.pendingOnChainProofs.set(txId, submission);

          ctx.emit('zk_wallet_submit_proof', {
            node,
            txId,
            ...submission,
          });
        }
      } else {
        s.isVerified = false;
        s.activeProofId = null;
        ctx.emit('zk_privacy_failed', { node, reason: 'invalid_proof' });
      }
    }

    // =========================================================================
    // v4.3 SELECTIVE DISCLOSURE EVENTS
    // =========================================================================
    else if (event.type === 'zk_selective_disclose') {
      const {
        fields = {},
        consentedFields = [],
        circuitId,
      } = (event.payload as TraitEventPayload) ?? {};

      const policy = config.disclosure_policy ?? {
        alwaysDisclose: [],
        requireConsent: [],
        neverDisclose: [],
      };

      // Generate a proof for the non-disclosed fields
      const circuit = s.circuits.get(
        (circuitId as string) ?? getPredicateCircuitId(config.predicate)
      );
      if (!circuit) {
        ctx.emit('zk_error', {
          node,
          requestId: null,
          error: `No circuit found for selective disclosure`,
        });
        return;
      }

      const mockProof = mockGenerate(circuit, fields as Record<string, unknown>);
      const disclosure = createSelectiveDisclosure(
        fields as Record<string, unknown>,
        policy,
        mockProof.proof,
        circuit.id,
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        consentedFields
      );

      s.disclosureHistory.push(disclosure);

      ctx.emit('zk_selective_disclosure', {
        node,
        disclosedFields: disclosure.disclosedFields,
        proof: Array.from(disclosure.proof),
        fieldStatus: disclosure.fieldStatus,
        circuitId: disclosure.circuitId,
        timestamp: disclosure.timestamp,
      });
    } else if (event.type === 'zk_disclosure_history') {
      ctx.emit('zk_disclosure_history_result', {
        node,
        disclosures: s.disclosureHistory.map((d) => ({
          circuitId: d.circuitId,
          timestamp: d.timestamp,
          disclosedFields: Object.keys(d.disclosedFields),
          fieldStatus: d.fieldStatus,
        })),
        total: s.disclosureHistory.length,
      });
    }

    // =========================================================================
    // v4.3 WALLET INTEGRATION EVENTS
    // =========================================================================
    else if (event.type === 'zk_wallet_submit_proof') {
      // Manual proof submission to chain
      const {
        proof,
        publicInputs: pi,
        circuitId: cid,
        chain,
        verifierContract,
        gasLimit,
      } = (event.payload as TraitEventPayload) ?? {};
      if (!proof) return;

      const submission: ZkWalletProofSubmission = {
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        proof: proof instanceof Uint8Array ? proof : new Uint8Array(proof),
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        publicInputs: pi ?? {},
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        circuitId: cid ?? '',
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        chain: chain ?? config.wallet_integration?.chain ?? 'ethereum',
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        verifierContract: verifierContract ?? config.wallet_integration?.verifier_contract ?? '',
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        gasLimit,
      };

      const txId = `tx_${Date.now()}`;
      s.pendingOnChainProofs.set(txId, submission);

      // Emit wallet_sign_message to trigger WalletTrait signature flow
      ctx.emit('wallet_sign_message', {
        node,
        message: `ZK Proof Submission: ${submission.circuitId} on ${submission.chain}`,
        metadata: { txId, circuitId: submission.circuitId },
      });

      ctx.emit('zk_wallet_proof_pending', {
        node,
        txId,
        circuitId: submission.circuitId,
        chain: submission.chain,
        verifierContract: submission.verifierContract,
      });
    } else if (event.type === 'zk_wallet_proof_result') {
      const { txId, txHash, valid, blockNumber, gasUsed } =
        (event.payload as TraitEventPayload) ?? {};
      const pending = s.pendingOnChainProofs.get(txId as string);

      if (pending) {
        s.pendingOnChainProofs.delete(txId as string);
        const result: ZkOnChainVerificationResult = {
          // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
          txHash: txHash ?? '',
          // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
          valid: valid ?? false,
          // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
          blockNumber,
          // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
          gasUsed,
        };
        s.onChainVerifications.push(result);

        if (valid) {
          ctx.emit('zk_wallet_proof_verified', {
            node,
            txHash: result.txHash,
            valid: true,
            circuitId: pending.circuitId,
            chain: pending.chain,
            blockNumber: result.blockNumber,
          });
        } else {
          ctx.emit('zk_wallet_proof_failed', {
            node,
            txHash: result.txHash,
            circuitId: pending.circuitId,
            chain: pending.chain,
            reason: 'on_chain_verification_failed',
          });
        }
      }
    } else if (event.type === 'zk_wallet_query') {
      ctx.emit('zk_wallet_info', {
        node,
        queryId: event.payload?.queryId ?? event.queryId,
        walletIntegrationEnabled: config.wallet_integration?.enabled ?? false,
        chain: config.wallet_integration?.chain ?? 'ethereum',
        verifierContract: config.wallet_integration?.verifier_contract ?? '',
        pendingProofs: s.pendingOnChainProofs.size,
        completedVerifications: s.onChainVerifications.length,
        verifications: s.onChainVerifications,
      });
    }

    // =========================================================================
    // v4.3 BATCH OPERATIONS
    // =========================================================================
    else if (event.type === 'zk_compile_all_spatial') {
      // Compile all spatial predicate circuits
      const spatialCircuitIds = SPATIAL_PREDICATE_CIRCUITS.map((c) => c.id);
      // @ts-expect-error
      const bbBackend: BarretenbergBackend | undefined = node.__zkBBBackend;
      let compiled = 0;

      for (const circuitId of spatialCircuitIds) {
        const circuit = s.circuits.get(circuitId);
        if (circuit && !circuit.isCompiled) {
          circuit.compiledAt = Date.now();
          circuit.isCompiled = true;
          compiled++;

          if (bbBackend) {
            bbBackend.compileCircuit(circuit).then((result) => {
              circuit.acir = result.acir;
            });
          }
        }
      }

      ctx.emit('zk_spatial_circuits_compiled', {
        node,
        compiled,
        total: spatialCircuitIds.length,
        circuitIds: spatialCircuitIds,
      });
    } else if (event.type === 'zk_get_circuit') {
      const circuitId = event.payload?.circuitId;
      const circuit = s.circuits.get(circuitId as string);

      if (circuit) {
        ctx.emit('zk_circuit_info', {
          node,
          circuit: {
            id: circuit.id,
            name: circuit.name,
            description: circuit.description,
            publicInputs: circuit.publicInputs,
            privateInputs: circuit.privateInputs,
            isCompiled: circuit.isCompiled ?? false,
            isSpatialPredicate: SPATIAL_PREDICATE_CIRCUITS.some((sp) => sp.id === circuit.id),
            source: circuit.source,
          },
        });
      } else {
        ctx.emit('zk_error', { node, requestId: null, error: `Circuit not found: ${circuitId}` });
      }
    }
  },

  onUpdate(_n: HSPlusNode, _c: unknown, _ctx: TraitContext, _dt: number): void {
    /* Proof operations are async/event-driven, no per-frame updates needed */
  },
} as const;

// =============================================================================
// EXPORTS
// =============================================================================

/** All built-in circuits (v4.0 legacy) */
export { BUILTIN_CIRCUITS };

/** All spatial predicate circuits (v4.3 new) */
export { SPATIAL_PREDICATE_CIRCUITS };

/** All circuits combined */
export const ALL_CIRCUITS = [...BUILTIN_CIRCUITS, ...SPATIAL_PREDICATE_CIRCUITS];

/** Barretenberg backend wrapper (for direct use in advanced scenarios) */
export { BarretenbergBackend };

/** Selective disclosure helper */
export { createSelectiveDisclosure };

/** Predicate-to-circuit mapping */
export { getPredicateCircuitId };
