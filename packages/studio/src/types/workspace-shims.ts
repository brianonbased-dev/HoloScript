declare module '@holoscript/core/parameter-envelope' {
  export type EnvelopeViolationAction = 'warn' | 'error' | 'redischarge';

  export interface ParameterEnvelopeRecord {
    param: string;
    min?: number;
    max?: number;
    allowed?: ReadonlyArray<string | number | boolean | null>;
    unit?: string;
    onViolation?: EnvelopeViolationAction;
  }

  export interface EnvelopeViolation {
    param: string;
    value: unknown;
    record: ParameterEnvelopeRecord;
    verdict: EnvelopeViolationAction;
    message: string;
  }

  export interface EnvelopeCheckResult {
    passed: boolean;
    redischarge: boolean;
    violations: EnvelopeViolation[];
  }

  export type ParameterEnvelope = ParameterEnvelopeRecord[];

  export function isInEnvelope(value: unknown, record: ParameterEnvelopeRecord): boolean;
  export function checkParameterEnvelope(
    params: Record<string, unknown>,
    envelope: ParameterEnvelope
  ): EnvelopeCheckResult;
}

declare module '@holoscript/core/reconstruction' {
  // ── WHY THIS SHIM EXISTS, and why it is not the right answer ───────────────────
  // @holoscript/core's published .d.ts is HAND-MAINTAINED in packages/core/scripts/
  // generate-types.mjs rather than emitted from source, and it is incomplete: the whole
  // mobileSensorBundle module (22 runtime exports) is absent from it. This ambient block was
  // written to paper over that — but an ambient 'declare module' SHADOWS the real package
  // types entirely, so anything the package genuinely exports becomes invisible here unless it
  // is also copied in. That is how a correct import can fail to typecheck against a package
  // that plainly exports it, and it is why the entries below had to be added by hand.
  // The real fix is to stop hand-maintaining that .d.ts; until then this file must grow to
  // match, and every entry here is a duplicate that can silently drift from the truth.

  export interface SurfaceTwinProjection {
    element: string;
    node: string;
    entity?: string;
    identity: boolean;
    transform?: { precision?: number; prefix?: string; suffix?: string };
  }

  // @live_proof -> twin oracle (LiveProofTwinCheck). Consumed by
  // src/app/api/verified-view/live-proof/route.ts.
  export type LiveProofIndependence = 'self-referential' | 'fault-tested' | 'verified';
  export interface LiveProofAnchor {
    input: string;
    node: string;
    entity: string;
  }
  export interface LiveProofBinding {
    claim: string;
    label: string;
    independence: LiveProofIndependence;
    inputs: string[];
    anchors: LiveProofAnchor[];
    unanchored: string[];
  }
  export interface LiveProofTwinReceipt {
    version: 'live-proof-twin-v1';
    verdict: 'VERIFIED' | 'FALSIFIED' | 'ABSTAIN';
    claim: string;
    displayedState: 'pass' | 'falsified';
    confirmed: string[];
    divergent: Array<{ input: string; entity: string; detail: string }>;
    abstention?: {
      reason: 'independence-insufficient' | 'authority-unreachable' | 'receipt-mismatch';
      detail: string;
    };
    reason: string;
    receiptHash: string;
  }
  export interface RenderedLiveProofBadge {
    claim: string;
    label: string;
    independence: LiveProofIndependence;
    displayedState: 'pass' | 'falsified';
    anchors: LiveProofAnchor[];
  }
  export interface LiveProofLiveResult {
    badge: RenderedLiveProofBadge;
    receipt: LiveProofTwinReceipt;
  }
  export function extractLiveProofBadges(html: string): RenderedLiveProofBadge[];
  export function verifyLiveProofsLive(input: {
    html: string;
    contract: { projections: SurfaceTwinProjection[] };
    fetchAuthoritativeState: (
      entity: string
    ) => Promise<Record<string, unknown> | string | number | boolean | null | undefined>;
  }): Promise<LiveProofLiveResult[]>;

  export const HOLOMAP_SIMULATION_CONTRACT_KIND: 'holomap.reconstruction.v1';

  export interface ReconstructionFrame {
    index: number;
    timestampMs: number;
    rgb: Uint8Array;
    width: number;
    height: number;
    stride: 3 | 4;
    depth?: Float32Array;
    devicePose?: CameraPose;
  }

  export interface CameraPose {
    position: [number, number, number];
    rotation: [number, number, number, number];
    confidence: number;
  }

  export interface ReconstructionManifest {
    version: '1.0.0';
    worldId: string;
    displayName: string;
    pointCount: number;
    frameCount: number;
    bounds: { min: [number, number, number]; max: [number, number, number] };
    replayHash: string;
    simulationContract: {
      kind: 'holomap.reconstruction.v1';
      replayFingerprint: string;
      holoScriptBuild: string;
    };
    provenance: {
      anchorHash?: string;
      opentimestampsProof?: string;
      baseCalldataTx?: string;
      capturedAtIso: string;
    };
    assets: { points: string; trajectory: string; anchors: string; splats?: string };
    weightStrategy: 'distill' | 'fine-tune' | 'from-scratch';
  }

  export interface ReconstructionStep {
    frame: ReconstructionFrame;
    pose: CameraPose;
    points: { positions: Float32Array; colors: Uint8Array; confidence?: Float32Array };
    anchor: { revision: number };
  }

  export interface HoloMapRuntime {
    init(config: Record<string, unknown>): Promise<void>;
    step(frame: ReconstructionFrame): Promise<ReconstructionStep | null>;
    finalize(): Promise<ReconstructionManifest>;
    replayHash(): string;
    dispose(): Promise<void>;
  }

  export interface MobileSensorDepthPlane {
    width: number;
    height: number;
    values: Float32Array;
  }

  export interface MobileSensorBundleFrame {
    index: number;
    timestampMs: number;
    width: number;
    height: number;
    stride: 3 | 4;
    rgb: Uint8Array;
    sceneDepth?: MobileSensorDepthPlane;
    cameraTransformColumnMajor4x4?: ArrayLike<number>;
  }

  export interface ArCoreDepthMobileSensorFrameInput {
    index: number;
    timestampMs: number;
    width: number;
    height: number;
    stride: 3 | 4;
    rgb: Uint8Array;
    depthImage16Bits: {
      width: number;
      height: number;
      millimeters: Uint16Array;
    };
    rawDepthConfidenceImage?: {
      width: number;
      height: number;
      values: Uint8Array;
    };
    cameraTransformColumnMajor4x4?: ArrayLike<number>;
  }

  export function arCoreDepthFrameToMobileSensorFrame(
    frame: ArCoreDepthMobileSensorFrameInput
  ): MobileSensorBundleFrame;

  export function cameraPoseFromColumnMajorTransform(transform: ArrayLike<number>): CameraPose;

  export function createHoloMapRuntime(config?: Record<string, unknown>): HoloMapRuntime;
  export function computeHoloMapReplayFingerprint(parts: {
    modelHash: string;
    seed: number;
    weightStrategy: string;
    videoHash?: string;
    tileGrid?: number;
    weightCid?: string;
    verticalProfile?: 'generalist' | 'indoor' | 'outdoor' | 'object';
  }): string;
  export function fnv1a32Hex(input: string): string;
}

declare module '@holoscript/studio-plugin-sdk/sandbox' {
  export type SandboxPermission =
    | 'scene:read'
    | 'scene:write'
    | 'ui:panel'
    | 'ui:theme'
    | 'storage:local'
    | 'network:fetch'
    | 'fs:export'
    | (string & {});

  export interface PluginSandboxManifest {
    permissions?: SandboxPermission[];
    trustLevel?: string;
    memoryBudget?: number;
    [key: string]: unknown;
  }

  export interface SandboxCreateOptions {
    pluginId: string;
    pluginUrl: string;
    manifest: PluginSandboxManifest;
    hasUI?: boolean;
    container?: HTMLElement | null;
  }

  export type SandboxState =
    | 'creating'
    | 'loading'
    | 'initializing'
    | 'ready'
    | 'running'
    | 'suspended'
    | 'error'
    | 'terminated';

  export interface PluginHostHealthSummary {
    totalPlugins: number;
    byState: Record<SandboxState, number>;
    pluginsWithViolations: string[];
  }

  export interface SandboxedPluginHostOptions {
    onAPICall?: (
      pluginId: string,
      namespace: string,
      method: string,
      args: unknown
    ) => Promise<unknown> | unknown;
    onStorage?: (
      pluginId: string,
      scope: string,
      operation: string,
      key?: string,
      value?: unknown
    ) => Promise<unknown> | unknown;
    onFetch?: (
      pluginId: string,
      url: string,
      opts?: { method?: string; headers?: HeadersInit; body?: BodyInit | null }
    ) => Promise<{ status: number; headers: Record<string, string>; body: string }>;
    onRegister?: (pluginId: string, kind: string, descriptor: unknown) => Promise<void> | void;
    onLog?: (pluginId: string, level: string, message: string, data?: unknown) => void;
    onError?: (pluginId: string, code: string, message: string, stack?: string) => void;
    debug?: boolean;
  }

  export class SandboxedPluginHost {
    constructor(options?: SandboxedPluginHostOptions);
    loadPlugin(options: SandboxCreateOptions): Promise<void>;
    unloadPlugin(pluginId: string): Promise<void>;
    terminatePlugin(pluginId: string): void;
    isPluginLoaded(pluginId: string): boolean;
    getPluginState(pluginId: string): SandboxState | null;
    broadcastEvent(namespace: string, event: string, data: unknown): void;
    getHealthSummary(): PluginHostHealthSummary;
    getLoadedPlugins(): string[];
    shutdown(): Promise<void>;
  }
}

declare module 'pg' {
  export interface PoolConfig {
    connectionString?: string;
    ssl?: boolean | { rejectUnauthorized?: boolean };
    max?: number;
  }

  export interface QueryResult<T extends Record<string, unknown> = Record<string, unknown>> {
    rows: T[];
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query<T extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      params?: unknown[]
    ): Promise<QueryResult<T>>;
    end(): Promise<void>;
  }
}

declare module 'monaco-editor' {
  export const KeyMod: {
    CtrlCmd: number;
    Shift: number;
  };

  export const KeyCode: {
    KeyF: number;
    KeyS: number;
  };

  // eslint-disable-next-line @typescript-eslint/no-namespace -- ambient shim mirrors monaco's namespace-shaped API
  export namespace languages {
    export interface ILanguageExtensionPoint {
      id: string;
      extensions?: string[];
    }

    export function getLanguages(): ILanguageExtensionPoint[];
    export function register(language: ILanguageExtensionPoint): void;
    export function setMonarchTokensProvider(languageId: string, provider: unknown): void;
    export function setLanguageConfiguration(languageId: string, configuration: unknown): void;
  }

  // eslint-disable-next-line @typescript-eslint/no-namespace -- ambient shim mirrors monaco's namespace-shaped API
  export namespace editor {
    export interface IDisposable {
      dispose(): void;
    }

    export interface ITextModel {
      getLineLength(line: number): number;
      getLineContent(line: number): string;
      getValue(): string;
      setValue(value: string): void;
    }

    export interface IStandaloneCodeEditor {
      getValue(): string;
      getModel(): ITextModel | null;
      getPosition(): { lineNumber: number; column: number } | null;
      dispose(): void;
      addAction(action: {
        id: string;
        label: string;
        keybindings?: number[];
        contextMenuGroupId?: string;
        contextMenuOrder?: number;
        run: (editor: IStandaloneCodeEditor) => void;
      }): void;
      getAction(id: string): { run(): Promise<void> } | null;
      onDidChangeModelContent(listener: () => void): IDisposable;
    }

    export interface IStandaloneEditorConstructionOptions {
      value?: string;
      language?: string;
      theme?: string;
      fontSize?: number;
      minimap?: { enabled?: boolean };
      scrollBeyondLastLine?: boolean;
      wordWrap?: string;
      lineNumbers?: string;
      tabSize?: number;
      automaticLayout?: boolean;
      [key: string]: unknown;
    }

    export function defineTheme(name: string, data: unknown): void;
    export function setTheme(name: string): void;
    export function setModelLanguage(model: ITextModel, languageId: string): void;
    export function setModelMarkers(model: ITextModel, owner: string, markers: unknown[]): void;
    export function create(
      container: HTMLElement,
      options: IStandaloneEditorConstructionOptions
    ): IStandaloneCodeEditor;
  }
}
