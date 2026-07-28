/**
 * Native render contract gate.
 *
 * This is intentionally adapter-agnostic. A backend may translate a proven
 * HoloRuntime receipt into WebGPU, Canvas2D, R3F, Looking Glass, Quest, or
 * another target, but it must not invent scene semantics that were absent from
 * the native source -> semantic IR -> HoloRuntime chain.
 */

export const NATIVE_RENDER_CONTRACT_VERSION = 'holoscript.native-render-contract.v1' as const;

export const NATIVE_RENDER_SEMANTICS = [
  'camera',
  'sceneGraph',
  'light',
  'geometry',
  'material',
  'transform',
  'interaction',
  'event',
  'timing',
  'animation',
  'input',
  'asset',
  'xr',
  'lifecycle',
] as const;

export const R3F_BASELINE_RENDER_SEMANTICS = [
  'camera',
  'light',
  'geometry',
  'material',
  'transform',
  'event',
  'animation',
  'lifecycle',
] as const satisfies readonly NativeRenderSemantic[];

export const NATIVE_RENDER_CAPABILITIES = R3F_BASELINE_RENDER_SEMANTICS;

export const NATIVE_RENDER_CHAIN_STAGES = [
  'source',
  'semantic-ir',
  'holo-runtime',
  'backend-adapter',
] as const;

export type NativeRenderSemantic = (typeof NATIVE_RENDER_SEMANTICS)[number];
export type NativeRenderCapability = (typeof NATIVE_RENDER_CAPABILITIES)[number];
export type NativeRenderChainStage = (typeof NATIVE_RENDER_CHAIN_STAGES)[number];
export type NativeRenderSourceLanguage = 'holo' | 'hsplus' | 'hs';

export interface NativeRenderSourceRef {
  path: string;
  language: NativeRenderSourceLanguage;
  sha256?: string;
}

export interface NativeRenderChainStep {
  stage: NativeRenderChainStage;
  path: string;
  producedBy: string;
  sha256?: string;
  /**
   * Set only when a backend adapter uses a foreign renderer. Foreign renderers
   * are allowed at the backend-adapter stage, never in source/IR/runtime.
   */
  foreignRenderer?: 'r3f' | 'three' | 'react' | 'html' | 'webgpu' | 'canvas2d' | string;
}

export interface NativeRenderSemanticClaim {
  key: NativeRenderSemantic;
  ownerStage: NativeRenderChainStage;
  declaredIn: NativeRenderSourceRef;
  loweredTo?: {
    path: string;
    node: string;
  };
  enforcedBy?: {
    path: string;
    runtime: 'HoloRuntime' | 'HoloVM' | 'HoloEngine' | string;
  };
  evidence: string[];
}

export interface NativeRenderAdapterEvidence {
  path: string;
  construct: string;
}

export interface NativeRenderCapabilityClaim {
  key: NativeRenderCapability;
  ownerStage: NativeRenderChainStage;
  declaredIn: NativeRenderSourceRef;
  loweredTo?: {
    path: string;
    node: string;
  };
  enforcedBy?: {
    path: string;
    runtime: 'HoloRuntime' | 'HoloVM' | 'HoloEngine' | string;
  };
  /**
   * Optional references to the foreign adapter behavior this native capability
   * replaces. These references are evidence only; they never own semantics.
   */
  adapterEvidence?: NativeRenderAdapterEvidence[];
  evidence: string[];
}

export interface NativeRenderAdapterBaseline {
  renderer: 'r3f' | 'three' | 'react' | 'html' | string;
  paths: string[];
}

export interface NativeRenderGoldenFixture {
  id: string;
  contractVersion: typeof NATIVE_RENDER_CONTRACT_VERSION;
  title: string;
  source: NativeRenderSourceRef;
  chain: NativeRenderChainStep[];
  semantics: NativeRenderSemanticClaim[];
  capabilities?: NativeRenderCapabilityClaim[];
  adapterBaseline?: NativeRenderAdapterBaseline;
}

export type NativeRenderFailureCode =
  | 'CONTRACT_VERSION_MISMATCH'
  | 'SOURCE_NOT_NATIVE'
  | 'CHAIN_STAGE_MISSING'
  | 'CHAIN_STAGE_OUT_OF_ORDER'
  | 'FOREIGN_RENDERER_BEFORE_ADAPTER'
  | 'MISSING_SEMANTIC'
  | 'ADAPTER_OWNED_SEMANTIC'
  | 'SEMANTIC_NOT_DECLARED_IN_NATIVE_SOURCE'
  | 'MISSING_SEMANTIC_LOWERING'
  | 'MISSING_RUNTIME_ENFORCEMENT'
  | 'MISSING_SEMANTIC_EVIDENCE'
  | 'MISSING_CAPABILITY'
  | 'ADAPTER_OWNED_CAPABILITY'
  | 'CAPABILITY_NOT_DECLARED_IN_NATIVE_SOURCE'
  | 'MISSING_CAPABILITY_LOWERING'
  | 'MISSING_CAPABILITY_RUNTIME_ENFORCEMENT'
  | 'MISSING_CAPABILITY_EVIDENCE';

export interface NativeRenderContractFailure {
  code: NativeRenderFailureCode;
  message: string;
  semantic?: NativeRenderSemantic;
  path?: string;
}

export interface NativeRenderContractReceipt {
  fixtureId: string;
  ok: boolean;
  requiredSemantics: readonly NativeRenderSemantic[];
  coveredSemantics: NativeRenderSemantic[];
  requiredCapabilities: readonly NativeRenderCapability[];
  coveredCapabilities: NativeRenderCapability[];
  failures: NativeRenderContractFailure[];
}

const NATIVE_SOURCE_EXTENSION = /\.(holo|hsplus|hs)$/i;
const CHAIN_STAGE_ORDER = new Map<NativeRenderChainStage, number>(
  NATIVE_RENDER_CHAIN_STAGES.map((stage, index) => [stage, index])
);

function isNativeSource(ref: NativeRenderSourceRef): boolean {
  return ref.language === 'holo' || ref.language === 'hsplus' || ref.language === 'hs'
    ? NATIVE_SOURCE_EXTENSION.test(ref.path)
    : false;
}

function validateChain(
  fixture: NativeRenderGoldenFixture,
  failures: NativeRenderContractFailure[]
): void {
  const stages = new Set(fixture.chain.map((step) => step.stage));
  for (const required of NATIVE_RENDER_CHAIN_STAGES) {
    if (!stages.has(required)) {
      failures.push({
        code: 'CHAIN_STAGE_MISSING',
        message: `Native render chain is missing ${required}.`,
      });
    }
  }

  let lastOrder = -1;
  for (const step of fixture.chain) {
    const order = CHAIN_STAGE_ORDER.get(step.stage);
    if (order === undefined) continue;
    if (order < lastOrder) {
      failures.push({
        code: 'CHAIN_STAGE_OUT_OF_ORDER',
        message: `Native render chain stage ${step.stage} appears after a later stage.`,
        path: step.path,
      });
    }
    lastOrder = order;

    if (step.stage !== 'backend-adapter' && step.foreignRenderer) {
      failures.push({
        code: 'FOREIGN_RENDERER_BEFORE_ADAPTER',
        message: `Foreign renderer ${step.foreignRenderer} appears before the backend adapter stage.`,
        path: step.path,
      });
    }
  }
}

function validateSemantic(
  claim: NativeRenderSemanticClaim,
  failures: NativeRenderContractFailure[]
): void {
  if (claim.ownerStage === 'backend-adapter') {
    failures.push({
      code: 'ADAPTER_OWNED_SEMANTIC',
      message: `${claim.key} is owned by a backend adapter instead of native source/IR/runtime.`,
      semantic: claim.key,
      path: claim.declaredIn.path,
    });
  }

  if (!isNativeSource(claim.declaredIn)) {
    failures.push({
      code: 'SEMANTIC_NOT_DECLARED_IN_NATIVE_SOURCE',
      message: `${claim.key} is not declared in a .holo, .hsplus, or .hs source file.`,
      semantic: claim.key,
      path: claim.declaredIn.path,
    });
  }

  if (!claim.loweredTo) {
    failures.push({
      code: 'MISSING_SEMANTIC_LOWERING',
      message: `${claim.key} has no semantic IR lowering receipt.`,
      semantic: claim.key,
    });
  }

  if (!claim.enforcedBy) {
    failures.push({
      code: 'MISSING_RUNTIME_ENFORCEMENT',
      message: `${claim.key} has no HoloRuntime enforcement receipt.`,
      semantic: claim.key,
    });
  }

  if (claim.evidence.length === 0) {
    failures.push({
      code: 'MISSING_SEMANTIC_EVIDENCE',
      message: `${claim.key} has no golden evidence.`,
      semantic: claim.key,
    });
  }
}

function validateCapability(
  claim: NativeRenderCapabilityClaim,
  failures: NativeRenderContractFailure[]
): void {
  if (claim.ownerStage === 'backend-adapter') {
    failures.push({
      code: 'ADAPTER_OWNED_CAPABILITY',
      message: `${claim.key} is owned by a backend adapter instead of native source/IR/runtime.`,
      path: claim.declaredIn.path,
    });
  }

  if (!isNativeSource(claim.declaredIn)) {
    failures.push({
      code: 'CAPABILITY_NOT_DECLARED_IN_NATIVE_SOURCE',
      message: `${claim.key} is not declared in a .holo, .hsplus, or .hs source file.`,
      path: claim.declaredIn.path,
    });
  }

  if (!claim.loweredTo) {
    failures.push({
      code: 'MISSING_CAPABILITY_LOWERING',
      message: `${claim.key} has no semantic IR lowering receipt.`,
    });
  }

  if (!claim.enforcedBy) {
    failures.push({
      code: 'MISSING_CAPABILITY_RUNTIME_ENFORCEMENT',
      message: `${claim.key} has no runtime enforcement receipt.`,
    });
  }

  if (claim.evidence.length === 0) {
    failures.push({
      code: 'MISSING_CAPABILITY_EVIDENCE',
      message: `${claim.key} has no golden evidence.`,
    });
  }
}

export function evaluateNativeRenderFixture(
  fixture: NativeRenderGoldenFixture
): NativeRenderContractReceipt {
  const failures: NativeRenderContractFailure[] = [];

  if (fixture.contractVersion !== NATIVE_RENDER_CONTRACT_VERSION) {
    failures.push({
      code: 'CONTRACT_VERSION_MISMATCH',
      message: `Expected ${NATIVE_RENDER_CONTRACT_VERSION}, received ${fixture.contractVersion}.`,
    });
  }

  if (!isNativeSource(fixture.source)) {
    failures.push({
      code: 'SOURCE_NOT_NATIVE',
      message: 'The root fixture source must be .holo, .hsplus, or .hs.',
      path: fixture.source.path,
    });
  }

  validateChain(fixture, failures);

  const claimsBySemantic = new Map<NativeRenderSemantic, NativeRenderSemanticClaim[]>();
  for (const claim of fixture.semantics) {
    const existing = claimsBySemantic.get(claim.key) ?? [];
    existing.push(claim);
    claimsBySemantic.set(claim.key, existing);
    validateSemantic(claim, failures);
  }

  const coveredSemantics: NativeRenderSemantic[] = [];
  for (const required of NATIVE_RENDER_SEMANTICS) {
    if (!claimsBySemantic.has(required)) {
      failures.push({
        code: 'MISSING_SEMANTIC',
        message: `Fixture does not cover required semantic ${required}.`,
        semantic: required,
      });
    } else {
      coveredSemantics.push(required);
    }
  }

  const coveredCapabilities: NativeRenderCapability[] = [];
  const claimsByCapability = new Map<NativeRenderCapability, NativeRenderCapabilityClaim[]>();
  for (const claim of fixture.capabilities ?? []) {
    const existing = claimsByCapability.get(claim.key) ?? [];
    existing.push(claim);
    claimsByCapability.set(claim.key, existing);
    validateCapability(claim, failures);
  }

  const validatesCapabilities = (fixture.capabilities?.length ?? 0) > 0;
  if (validatesCapabilities) {
    for (const required of NATIVE_RENDER_CAPABILITIES) {
      if (!claimsByCapability.has(required)) {
        failures.push({
          code: 'MISSING_CAPABILITY',
          message: `Fixture does not cover required native renderer capability ${required}.`,
        });
      } else {
        coveredCapabilities.push(required);
      }
    }
  }

  return {
    fixtureId: fixture.id,
    ok: failures.length === 0,
    requiredSemantics: NATIVE_RENDER_SEMANTICS,
    coveredSemantics,
    requiredCapabilities: validatesCapabilities ? NATIVE_RENDER_CAPABILITIES : [],
    coveredCapabilities,
    failures,
  };
}

export function assertNativeRenderFixture(
  fixture: NativeRenderGoldenFixture
): NativeRenderContractReceipt {
  const receipt = evaluateNativeRenderFixture(fixture);
  if (!receipt.ok) {
    const details = receipt.failures
      .map((failure) => `${failure.code}: ${failure.message}`)
      .join('\n');
    throw new Error(`Native render fixture ${fixture.id} failed:\n${details}`);
  }
  return receipt;
}
