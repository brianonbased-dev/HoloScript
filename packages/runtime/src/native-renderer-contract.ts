export const NATIVE_RENDERER_CONTRACT_VERSION = 'holoscript.native-renderer-contract.v1' as const;

export type NativeRendererContractVersion = typeof NATIVE_RENDERER_CONTRACT_VERSION;

export type NativeRendererSourceFormat = 'holo' | 'hsplus' | 'hs';

export type NativeRendererSemanticsSource = 'holo-ir' | 'holo-runtime';

export type NativeRendererGoldenCapability =
  | 'scene_graph'
  | 'camera'
  | 'materials'
  | 'input'
  | 'timeline'
  | 'asset_loading'
  | 'interaction'
  | 'xr_device_semantics'
  | 'state';

export interface NativeRendererSourceReceipt {
  readonly format: NativeRendererSourceFormat;
  readonly path: string;
  readonly irKind: 'scene-ir';
  readonly ownedBy: 'holoscript-source';
}

export interface NativeRendererSceneGraphExpectation {
  readonly rootType: string;
  readonly nodeCount: number;
  readonly requiredNodeTypes: readonly string[];
  readonly requiredTraits: readonly string[];
  readonly childOrder: readonly string[];
}

export interface NativeRendererCameraExpectation {
  readonly kind: 'perspective' | 'orthographic' | 'xr-view';
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fovDegrees?: number;
  readonly referenceSpace?: 'local' | 'local-floor' | 'bounded-floor' | 'viewer';
}

export interface NativeRendererMaterialExpectation {
  readonly id: string;
  readonly type: 'unlit' | 'pbr' | 'video' | 'splat';
  readonly color?: string;
  readonly roughness?: number;
  readonly metalness?: number;
  readonly textureAssetId?: string;
}

export interface NativeRendererInputExpectation {
  readonly id: string;
  readonly kind: 'pointer' | 'keyboard' | 'controller' | 'gesture';
  readonly events: readonly string[];
  readonly semanticAction: string;
}

export interface NativeRendererTimelineExpectation {
  readonly id: string;
  readonly targetNodeId: string;
  readonly property: string;
  readonly keyframes: readonly number[];
  readonly interpolation: 'step' | 'linear' | 'cubic';
}

export interface NativeRendererAssetExpectation {
  readonly id: string;
  readonly kind: 'mesh' | 'texture' | 'audio' | 'video' | 'splat' | 'font';
  readonly uri: string;
  readonly loadPolicy: 'preload' | 'lazy' | 'stream';
}

export interface NativeRendererInteractionExpectation {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly event: string;
  readonly stateTransition: string;
}

export interface NativeRendererXRDeviceExpectation {
  readonly referenceSpaces: readonly NativeRendererCameraExpectation['referenceSpace'][];
  readonly requiredFeatures: readonly string[];
  readonly controllerInputs: readonly string[];
  readonly haptics: boolean;
  readonly passthrough: boolean;
}

export interface NativeRendererStateExpectation {
  readonly stores: readonly string[];
  readonly transitions: readonly string[];
  readonly persistence: 'none' | 'session' | 'durable';
}

export interface NativeRendererGoldenFixture {
  readonly id: string;
  readonly contractVersion: NativeRendererContractVersion;
  readonly title: string;
  readonly source: NativeRendererSourceReceipt;
  readonly requiredCapabilities: readonly NativeRendererGoldenCapability[];
  readonly sceneGraph?: NativeRendererSceneGraphExpectation;
  readonly camera?: NativeRendererCameraExpectation;
  readonly materials?: readonly NativeRendererMaterialExpectation[];
  readonly inputs?: readonly NativeRendererInputExpectation[];
  readonly timeline?: readonly NativeRendererTimelineExpectation[];
  readonly assets?: readonly NativeRendererAssetExpectation[];
  readonly interactions?: readonly NativeRendererInteractionExpectation[];
  readonly xrDevice?: NativeRendererXRDeviceExpectation;
  readonly state?: NativeRendererStateExpectation;
}

export interface NativeRendererBackendContract {
  readonly contractVersion: NativeRendererContractVersion;
  readonly backendId: string;
  readonly adapterKind: 'native-runtime-backend';
  readonly runtimeEntryPoint: string;
  readonly semanticsSource: NativeRendererSemanticsSource | string;
  readonly consumes: {
    readonly sourceFormats: readonly NativeRendererSourceFormat[];
    readonly ir: 'scene-ir' | string;
    readonly runtime: '@holoscript/runtime' | string;
  };
  readonly implementsCapabilities: readonly NativeRendererGoldenCapability[];
  readonly goldenFixtureIds: readonly string[];
}

export interface NativeRendererValidationResult {
  readonly ok: boolean;
  readonly fixtureCount: number;
  readonly coveredCapabilities: readonly NativeRendererGoldenCapability[];
  readonly missingCapabilities: readonly NativeRendererGoldenCapability[];
  readonly errors: readonly string[];
}

export interface NativeRendererBackendValidationResult extends NativeRendererValidationResult {
  readonly backendId: string;
  readonly missingFixtureIds: readonly string[];
}

export const REQUIRED_NATIVE_RENDERER_CAPABILITIES = [
  'scene_graph',
  'camera',
  'materials',
  'input',
  'timeline',
  'asset_loading',
  'interaction',
  'xr_device_semantics',
  'state',
] as const satisfies readonly NativeRendererGoldenCapability[];

const VALID_SEMANTICS_SOURCES = ['holo-ir', 'holo-runtime'] as const;

const SOURCE_FORMAT_EXTENSIONS: Record<NativeRendererSourceFormat, string> = {
  holo: '.holo',
  hsplus: '.hsplus',
  hs: '.hs',
};

export const NATIVE_RENDERER_GOLDEN_FIXTURES = [
  {
    id: 'native-renderer.scene-camera-materials.v1',
    contractVersion: NATIVE_RENDERER_CONTRACT_VERSION,
    title: 'Scene graph, camera, and material semantics',
    source: {
      format: 'holo',
      path: 'fixtures/native-renderer/scene-camera-materials.holo',
      irKind: 'scene-ir',
      ownedBy: 'holoscript-source',
    },
    requiredCapabilities: ['scene_graph', 'camera', 'materials'],
    sceneGraph: {
      rootType: 'scene',
      nodeCount: 5,
      requiredNodeTypes: ['scene', 'group', 'cube', 'sphere', 'light'],
      requiredTraits: ['@position', '@material', '@light'],
      childOrder: ['rig', 'key_light', 'hero_cube', 'orbit_sphere'],
    },
    camera: {
      kind: 'perspective',
      position: [0, 1.6, 5],
      target: [0, 1, 0],
      fovDegrees: 60,
      referenceSpace: 'local',
    },
    materials: [
      {
        id: 'hero_pbr',
        type: 'pbr',
        color: '#5cc8ff',
        roughness: 0.42,
        metalness: 0.15,
      },
      {
        id: 'accent_unlit',
        type: 'unlit',
        color: '#ffde59',
      },
    ],
  },
  {
    id: 'native-renderer.input-timeline-state.v1',
    contractVersion: NATIVE_RENDERER_CONTRACT_VERSION,
    title: 'Input, timeline, interaction, and state semantics',
    source: {
      format: 'hsplus',
      path: 'fixtures/native-renderer/input-timeline-state.hsplus',
      irKind: 'scene-ir',
      ownedBy: 'holoscript-source',
    },
    requiredCapabilities: ['input', 'timeline', 'interaction', 'state'],
    inputs: [
      {
        id: 'primary_select',
        kind: 'controller',
        events: ['selectstart', 'selectend'],
        semanticAction: 'activate',
      },
      {
        id: 'pointer_hover',
        kind: 'pointer',
        events: ['pointerenter', 'pointerleave'],
        semanticAction: 'preview',
      },
    ],
    timeline: [
      {
        id: 'door_open',
        targetNodeId: 'portal_door',
        property: 'rotation.y',
        keyframes: [0, 0.35, 1],
        interpolation: 'cubic',
      },
    ],
    interactions: [
      {
        id: 'activate_portal',
        sourceNodeId: 'portal_button',
        event: 'activate',
        stateTransition: 'portal.closed -> portal.open',
      },
    ],
    state: {
      stores: ['portal', 'player'],
      transitions: ['portal.closed -> portal.open', 'player.idle -> player.entering'],
      persistence: 'session',
    },
  },
  {
    id: 'native-renderer.assets-xr-device.v1',
    contractVersion: NATIVE_RENDERER_CONTRACT_VERSION,
    title: 'Asset loading and XR device semantics',
    source: {
      format: 'holo',
      path: 'fixtures/native-renderer/assets-xr-device.holo',
      irKind: 'scene-ir',
      ownedBy: 'holoscript-source',
    },
    requiredCapabilities: ['asset_loading', 'xr_device_semantics'],
    assets: [
      {
        id: 'terrain_mesh',
        kind: 'mesh',
        uri: 'holo://assets/terrain.glb',
        loadPolicy: 'preload',
      },
      {
        id: 'sky_splat',
        kind: 'splat',
        uri: 'holo://assets/sky.spz',
        loadPolicy: 'stream',
      },
    ],
    xrDevice: {
      referenceSpaces: ['local-floor', 'bounded-floor'],
      requiredFeatures: ['hit-test', 'anchors', 'layers'],
      controllerInputs: ['left.select', 'right.select', 'left.squeeze', 'right.squeeze'],
      haptics: true,
      passthrough: true,
    },
  },
] as const satisfies readonly NativeRendererGoldenFixture[];

export function validateNativeRendererGoldenFixtures(
  fixtures: readonly NativeRendererGoldenFixture[] = NATIVE_RENDERER_GOLDEN_FIXTURES
): NativeRendererValidationResult {
  const errors: string[] = [];
  const covered = new Set<NativeRendererGoldenCapability>();
  const ids = new Set<string>();

  for (const fixture of fixtures) {
    if (!fixture.id.trim()) {
      errors.push('fixture id must be non-empty');
    }
    if (ids.has(fixture.id)) {
      errors.push(`fixture id must be unique: ${fixture.id}`);
    }
    ids.add(fixture.id);

    if (fixture.contractVersion !== NATIVE_RENDERER_CONTRACT_VERSION) {
      errors.push(`${fixture.id} uses unsupported contract version: ${fixture.contractVersion}`);
    }

    validateSourceReceipt(fixture, errors);

    for (const capability of fixture.requiredCapabilities) {
      covered.add(capability);
      if (!hasFixtureSection(fixture, capability)) {
        errors.push(
          `${fixture.id} declares ${capability} but does not include its fixture section`
        );
      }
    }
  }

  const coveredCapabilities = REQUIRED_NATIVE_RENDERER_CAPABILITIES.filter((capability) =>
    covered.has(capability)
  );
  const missingCapabilities = REQUIRED_NATIVE_RENDERER_CAPABILITIES.filter(
    (capability) => !covered.has(capability)
  );

  for (const capability of missingCapabilities) {
    errors.push(`golden suite is missing capability: ${capability}`);
  }

  return {
    ok: errors.length === 0,
    fixtureCount: fixtures.length,
    coveredCapabilities,
    missingCapabilities,
    errors,
  };
}

export function validateNativeRendererBackendContract(
  contract: NativeRendererBackendContract,
  fixtures: readonly NativeRendererGoldenFixture[] = NATIVE_RENDERER_GOLDEN_FIXTURES
): NativeRendererBackendValidationResult {
  const fixtureResult = validateNativeRendererGoldenFixtures(fixtures);
  const errors = [...fixtureResult.errors];
  const backendCapabilities = new Set(contract.implementsCapabilities);
  const fixtureIds = new Set(fixtures.map((fixture) => fixture.id));

  if (contract.contractVersion !== NATIVE_RENDERER_CONTRACT_VERSION) {
    errors.push(
      `${contract.backendId} uses unsupported contract version: ${contract.contractVersion}`
    );
  }
  if (!contract.backendId.trim()) {
    errors.push('backendId must be non-empty');
  }
  if (contract.adapterKind !== 'native-runtime-backend') {
    errors.push(`${contract.backendId} is not a native runtime backend`);
  }
  if (!contract.runtimeEntryPoint.trim()) {
    errors.push(`${contract.backendId} must declare a runtime entry point`);
  }
  if (
    !VALID_SEMANTICS_SOURCES.includes(contract.semanticsSource as NativeRendererSemanticsSource)
  ) {
    errors.push(
      `${contract.backendId} must consume Holo IR/runtime semantics, not target-local semantics`
    );
  }
  if (contract.consumes.ir !== 'scene-ir') {
    errors.push(`${contract.backendId} must consume scene-ir`);
  }
  if (contract.consumes.runtime !== '@holoscript/runtime') {
    errors.push(`${contract.backendId} must consume @holoscript/runtime`);
  }
  if (contract.consumes.sourceFormats.length === 0) {
    errors.push(`${contract.backendId} must declare source formats`);
  }

  const coveredCapabilities = REQUIRED_NATIVE_RENDERER_CAPABILITIES.filter((capability) =>
    backendCapabilities.has(capability)
  );
  const missingCapabilities = REQUIRED_NATIVE_RENDERER_CAPABILITIES.filter(
    (capability) => !backendCapabilities.has(capability)
  );
  for (const capability of missingCapabilities) {
    errors.push(`${contract.backendId} is missing renderer capability: ${capability}`);
  }

  const missingFixtureIds = [...fixtureIds].filter((id) => !contract.goldenFixtureIds.includes(id));
  for (const id of missingFixtureIds) {
    errors.push(`${contract.backendId} has not accepted golden fixture: ${id}`);
  }

  return {
    ok: errors.length === 0,
    backendId: contract.backendId,
    fixtureCount: fixtureResult.fixtureCount,
    coveredCapabilities,
    missingCapabilities,
    missingFixtureIds,
    errors,
  };
}

function validateSourceReceipt(fixture: NativeRendererGoldenFixture, errors: string[]): void {
  const expectedExtension = SOURCE_FORMAT_EXTENSIONS[fixture.source.format];
  if (fixture.source.ownedBy !== 'holoscript-source') {
    errors.push(`${fixture.id} must be owned by HoloScript source`);
  }
  if (fixture.source.irKind !== 'scene-ir') {
    errors.push(`${fixture.id} must compile through scene-ir`);
  }
  if (!fixture.source.path.endsWith(expectedExtension)) {
    errors.push(`${fixture.id} source path must end with ${expectedExtension}`);
  }
}

function hasFixtureSection(
  fixture: NativeRendererGoldenFixture,
  capability: NativeRendererGoldenCapability
): boolean {
  switch (capability) {
    case 'scene_graph':
      return fixture.sceneGraph !== undefined;
    case 'camera':
      return fixture.camera !== undefined;
    case 'materials':
      return fixture.materials !== undefined && fixture.materials.length > 0;
    case 'input':
      return fixture.inputs !== undefined && fixture.inputs.length > 0;
    case 'timeline':
      return fixture.timeline !== undefined && fixture.timeline.length > 0;
    case 'asset_loading':
      return fixture.assets !== undefined && fixture.assets.length > 0;
    case 'interaction':
      return fixture.interactions !== undefined && fixture.interactions.length > 0;
    case 'xr_device_semantics':
      return fixture.xrDevice !== undefined;
    case 'state':
      return fixture.state !== undefined;
  }
}
