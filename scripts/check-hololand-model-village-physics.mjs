#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  compareObserverBoundaryFields,
  runModelVillageCheck,
} from './check-hololand-model-village-experiment.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const SCHEMA = 'hololand.model-village.physics-witness.v0.3.0';
const DEFAULT_OUTPUT = path.join('.tmp', 'hololand', 'model-village', 'physics-witness.json');

const SOURCES = {
  world: 'source/layers/vr/frontier/model-village/model-village.holo',
  projection: 'source/layers/vr/frontier/model-village/model-village-observer-projection.holo',
  calibration: 'source/layers/vr/frontier/model-village/model-village-render-calibration.holo',
  policy: 'source/domains/agents/model-village-observer-witness.hsplus',
  physicsManifest: 'source/proofs/model-village-receipt-loom-physics.hs',
};

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    root: REPO_ROOT,
    holoScriptRoot: process.env.HOLOSCRIPT_ROOT || '',
    output: DEFAULT_OUTPUT,
    canonicalBoundary: true,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };
    if (arg === '--root') args.root = path.resolve(next());
    else if (arg === '--holoscript-root') args.holoScriptRoot = path.resolve(next());
    else if (arg === '--output') args.output = next();
    else if (arg === '--skip-canonical-boundary') args.canonicalBoundary = false;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`HoloLand Model Village physics witness

Usage:
  node scripts/check-hololand-model-village-physics.mjs [options]

Options:
  --root <path>                  HoloLand repository root
  --holoscript-root <path>      Sibling HoloScript repository
  --output <path>                Receipt output path
  --skip-canonical-boundary      Skip before/after canonical headless checks
  --json                         Print receipt JSON
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return args;
}

function normalizePath(value) {
  return String(value).replace(/\\/g, '/');
}

function resolveOutput(root, value) {
  return path.isAbsolute(value) ? value : path.resolve(root, value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256(readFileSync(filePath));
}

function canonicalize(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number in canonical value: ${value}`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function digest(value) {
  return sha256(Buffer.from(canonicalJson(value), 'utf8'));
}

function stateProperties(state) {
  return Object.fromEntries((state?.properties || []).map((entry) => [entry.key, entry.value]));
}

function templateProperties(template) {
  return Object.fromEntries((template?.props || []).map((entry) => [entry.key, entry.value]));
}

function flattenScene(node) {
  if (!node) return [];
  return [node, ...(node.children || []).flatMap(flattenScene)];
}

function command(commandName, args, cwd) {
  return spawnSync(commandName, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
  });
}

function gitProvenance(root, scopedPaths) {
  const commit = command('git', ['rev-parse', 'HEAD'], root);
  const status = command('git', ['status', '--porcelain', '--', ...scopedPaths], root);
  return {
    commit: commit.status === 0 ? String(commit.stdout).trim() : null,
    scopedDirty: Boolean(String(status.stdout || '').trim()),
    scopedStatus: String(status.stdout || '')
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map(normalizePath),
  };
}

function resolveHoloScriptRoot(root, explicitRoot) {
  const candidates = [
    explicitRoot,
    process.env.HOLOSCRIPT_ROOT,
    path.resolve(root, '..', 'HoloScript'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (
      existsSync(path.join(candidate, 'packages', 'core', 'dist', 'index.js'))
      && existsSync(path.join(candidate, 'packages', 'runtime', 'dist', 'index.js'))
      && existsSync(path.join(candidate, 'packages', 'engine', 'dist', 'physics', 'index.js'))
      && existsSync(path.join(candidate, 'node_modules', 'three', 'build', 'three.module.js'))
    ) {
      return path.resolve(candidate);
    }
  }
  throw new Error(
    `Built HoloScript core/runtime/engine and Three were not found. Tried: ${candidates.join(', ')}`,
  );
}

async function loadToolchain(holoScriptRoot) {
  const paths = {
    core: path.join(holoScriptRoot, 'packages', 'core', 'dist', 'index.js'),
    runtime: path.join(holoScriptRoot, 'packages', 'runtime', 'dist', 'index.js'),
    enginePhysics: path.join(holoScriptRoot, 'packages', 'engine', 'dist', 'physics', 'index.js'),
    three: path.join(holoScriptRoot, 'node_modules', 'three', 'build', 'three.module.js'),
    runtimeSource: path.join(holoScriptRoot, 'packages', 'runtime', 'src', 'physics', 'PhysicsWorld.ts'),
    engineSource: path.join(holoScriptRoot, 'packages', 'engine', 'src', 'physics', 'PhysicsWorldImpl.ts'),
    bodySource: path.join(holoScriptRoot, 'packages', 'engine', 'src', 'physics', 'PhysicsBody.ts'),
  };
  const [core, runtime, three] = await Promise.all([
    import(pathToFileURL(paths.core).href),
    import(pathToFileURL(paths.runtime).href),
    import(pathToFileURL(paths.three).href),
  ]);
  if (typeof runtime.PhysicsWorld !== 'function') {
    throw new Error('Built @holoscript/runtime does not export PhysicsWorld');
  }
  if (
    typeof runtime.PhysicsWorld.prototype.getBodyState !== 'function'
    || typeof runtime.PhysicsWorld.prototype.getAllBodyStates !== 'function'
  ) {
    throw new Error(
      'Built @holoscript/runtime is stale: getBodyState/getAllBodyStates are required. Rebuild HoloScript engine and runtime.',
    );
  }
  return {
    core,
    runtime,
    three,
    paths,
    hashes: Object.fromEntries(
      Object.entries(paths).map(([key, filePath]) => [key, sha256File(filePath)]),
    ),
  };
}

function parseContracts(root, toolchain) {
  const text = Object.fromEntries(
    Object.entries(SOURCES).map(([key, relativePath]) => [
      key,
      readFileSync(path.resolve(root, relativePath), 'utf8'),
    ]),
  );

  const observerResult = new toolchain.core.HoloCompositionParser().parse(text.projection);
  const calibrationResult = new toolchain.core.HoloCompositionParser().parse(text.calibration);
  const policyResult = new toolchain.core.HoloScriptPlusParser().parse(text.policy);
  const physicsResult = new toolchain.core.HoloScriptCodeParser().parse(text.physicsManifest);
  const parseErrors = {
    projection: observerResult.errors || [],
    calibration: calibrationResult.errors || [],
    policy: policyResult.errors || [],
    physicsManifest: physicsResult.errors || [],
  };
  const allParsed = observerResult.success
    && calibrationResult.success
    && policyResult.success
    && physicsResult.success;
  if (!allParsed) {
    throw new Error(`HoloScript source parsing failed: ${canonicalJson(parseErrors)}`);
  }

  const projectionIr = new toolchain.core.SceneIRCompiler({ defaultLighting: false })
    .compileComposition(observerResult.ast);
  const calibrationIr = new toolchain.core.SceneIRCompiler({ defaultLighting: false })
    .compileComposition(calibrationResult.ast);
  const policyComposition = policyResult.ast.children.find((node) => node.type === 'composition');
  const policyNodes = policyComposition?.children || [];
  const admissionTemplate = policyNodes.find(
    (node) => node.type === 'template' && node.name === 'FailDarkReceiptAdmission',
  );
  const authorityTemplate = policyNodes.find(
    (node) => node.type === 'template' && node.name === 'ObserverProjectionAuthority',
  );
  const physicsEvidenceTemplate = policyNodes.find(
    (node) => node.type === 'template' && node.name === 'PhysicsReplayEvidence',
  );
  const policyConfig = policyNodes.find((node) => node.type === 'config');
  const manifestNodes = physicsResult.ast;
  const manifest = manifestNodes.find(
    (node) => node.properties?.type === 'model_village_physics_replay_manifest',
  );
  const replayGate = manifestNodes.find(
    (node) => node.properties?.type === 'physics_replay_acceptance_gate',
  );

  if (
    !admissionTemplate
    || !authorityTemplate
    || !physicsEvidenceTemplate
    || !policyConfig
    || !manifest
    || !replayGate
  ) {
    throw new Error('Observer policy or physics manifest is missing a required structured contract');
  }

  return {
    text,
    hashes: Object.fromEntries(
      Object.entries(text).map(([key, value]) => [key, sha256(Buffer.from(value, 'utf8'))]),
    ),
    projectionAst: observerResult.ast,
    calibrationAst: calibrationResult.ast,
    projectionIr,
    calibrationIr,
    projectionState: stateProperties(observerResult.ast.state),
    admission: admissionTemplate.properties,
    authority: authorityTemplate.properties,
    physicsEvidence: physicsEvidenceTemplate.properties,
    policyConfig: policyConfig.properties,
    policyNodes,
    manifest: manifest.properties,
    replayGate: replayGate.properties,
    bodyNodes: manifestNodes.filter((node) => node.properties?.type === 'rigid_body_fixture'),
    fixtureNodes: manifestNodes.filter((node) => node.properties?.type === 'observer_receipt_fixture'),
    parseSummary: {
      projection: { parser: 'HoloCompositionParser', success: true },
      calibration: { parser: 'HoloCompositionParser', success: true },
      policy: { parser: 'HoloScriptPlusParser', success: true },
      physicsManifest: { parser: 'HoloScriptCodeParser', success: true },
    },
  };
}

function receiptEnvelope(fixture, sourceHashes) {
  const hashFields = [
    'worldSourceHash',
    'projectionSourceHash',
    'policySourceHash',
    'physicsManifestSourceHash',
  ];
  const envelope = {
    fixtureId: fixture.fixtureId,
    receiptId: fixture.receiptId,
    receiptPresent: fixture.receiptPresent,
    signatureVerified: fixture.signatureVerified,
    sourceActionHashMatches: fixture.sourceActionHashMatches,
    decision: fixture.decision,
    worldSourceHash: Object.hasOwn(fixture, 'worldSourceHash')
      ? fixture.worldSourceHash
      : sourceHashes.world,
    projectionSourceHash: Object.hasOwn(fixture, 'projectionSourceHash')
      ? fixture.projectionSourceHash
      : sourceHashes.projection,
    policySourceHash: Object.hasOwn(fixture, 'policySourceHash')
      ? fixture.policySourceHash
      : sourceHashes.policy,
    physicsManifestSourceHash: Object.hasOwn(fixture, 'physicsManifestSourceHash')
      ? fixture.physicsManifestSourceHash
      : sourceHashes.physicsManifest,
  };
  if (fixture.tamperField) {
    if (!hashFields.includes(fixture.tamperField)) {
      throw new Error(`Unsupported receipt tamper field: ${fixture.tamperField}`);
    }
    envelope[fixture.tamperField] = '0'.repeat(64);
  }
  if (!fixture.receiptPresent) {
    for (const key of hashFields) {
      envelope[key] = '';
    }
  }
  return envelope;
}

export function evaluateReceiptFixtures(fixtures, admission, sourceHashes) {
  const seenReceiptIds = new Set();
  const requiredBooleans = admission.requiredBooleanFields || [];
  const requiredHashes = admission.requiredHashFields || [];
  const expectedHashes = {
    worldSourceHash: sourceHashes.world,
    projectionSourceHash: sourceHashes.projection,
    policySourceHash: sourceHashes.policy,
    physicsManifestSourceHash: sourceHashes.physicsManifest,
  };
  const routes = Object.fromEntries(
    (admission.decisionToRoute || []).map((entry) => {
      const [decision, route] = String(entry).split(':');
      return [decision, route];
    }),
  );

  return fixtures.map((fixture) => {
    const receipt = receiptEnvelope(fixture, sourceHashes);
    let allowed = true;
    let reason = 'verified_receipt';

    if (!receipt.receiptPresent) {
      allowed = false;
      reason = 'missing_receipt';
    }
    if (allowed) {
      const failedBoolean = requiredBooleans.find(
        (field) => receipt[field] !== admission.requiredBooleanValue,
      );
      if (failedBoolean) {
        allowed = false;
        reason = `required_boolean_failed:${failedBoolean}`;
      }
    }
    if (allowed) {
      const failedHash = requiredHashes.find((field) => receipt[field] !== expectedHashes[field]);
      if (failedHash) {
        allowed = false;
        reason = `source_hash_mismatch:${failedHash}`;
      }
    }
    if (allowed && !(admission.supportedDecisions || []).includes(receipt[admission.decisionField])) {
      allowed = false;
      reason = 'unsupported_decision';
    }
    if (allowed && seenReceiptIds.has(receipt.receiptId)) {
      allowed = false;
      reason = 'duplicate_receipt';
    }

    if (allowed) seenReceiptIds.add(receipt.receiptId);
    return {
      fixtureId: fixture.fixtureId,
      receiptId: fixture.receiptId,
      allowed,
      route: allowed ? routes[receipt[admission.decisionField]] : admission.denyRoute,
      reason,
      expectedRelease: fixture.expectedRelease,
      expectedRoute: fixture.expectedRoute,
      expectationMatched:
        allowed === fixture.expectedRelease
        && (allowed ? routes[receipt[admission.decisionField]] : admission.denyRoute)
          === fixture.expectedRoute,
      sourceHashBindingVerified: allowed,
      receipt,
    };
  });
}

function scenePhysicsBindings(projectionIr) {
  return flattenScene(projectionIr)
    .filter((node) => node.type === 'mesh' && node.props?.properties?.physicsBody)
    .map((node) => ({
      id: node.id,
      position: node.props.position || [0, 0, 0],
      scale: node.props.scale || [1, 1, 1],
      route: node.props.properties.route || null,
      physicsBody: node.props.properties.physicsBody,
    }));
}

function inspectProjectionCapabilitySurface(projectionAst) {
  const findings = [];
  const prohibitedNodeTypes = new Set([
    'Action',
    'EventHandler',
    'EmitStatement',
    'Assignment',
    'CallStatement',
    'FunctionCall',
    'Import',
    'Mutation',
    'ProviderCall',
    'SchedulerCall',
    'ToolCall',
  ]);
  const prohibitedPropertyKeys = new Set([
    'action',
    'canonicalwrite',
    'mutation',
    'mutationtarget',
    'provider',
    'providercall',
    'receiptwriter',
    'residentobservationoutput',
    'scheduler',
    'tool',
    'toolcall',
    'writetarget',
  ]);
  const prohibitedCollections = [
    'imports',
    'timelines',
    'transitions',
    'conditionals',
    'iterators',
    'npcs',
    'quests',
    'abilities',
    'dialogues',
    'stateMachines',
    'spawnGroups',
    'triggers',
    'reactionTriggers',
    'policyPacks',
    'domainBlocks',
  ];

  for (const collection of prohibitedCollections) {
    if (Array.isArray(projectionAst?.[collection]) && projectionAst[collection].length > 0) {
      findings.push({
        path: `projectionAst.${collection}`,
        kind: 'capability_collection',
        value: collection,
      });
    }
  }
  if (projectionAst?.logic) {
    findings.push({
      path: 'projectionAst.logic',
      kind: 'executable_logic_surface',
      value: 'logic',
    });
  }

  function visit(value, currentPath) {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${currentPath}[${index}]`));
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (prohibitedNodeTypes.has(value.type)) {
      findings.push({
        path: currentPath,
        kind: 'executable_ast_node',
        value: value.type,
      });
    }
    if (
      typeof value.key === 'string'
      && prohibitedPropertyKeys.has(value.key.replace(/[^a-z0-9]/gi, '').toLowerCase())
    ) {
      findings.push({
        path: `${currentPath}.key`,
        kind: 'forbidden_dependency_or_write_property',
        value: value.key,
      });
    }
    for (const [key, child] of Object.entries(value)) {
      if (
        (key === 'actions' || key === 'methods' || key === 'directives' || key === 'traits')
        && Array.isArray(child)
        && child.length > 0
      ) {
        findings.push({
          path: `${currentPath}.${key}`,
          kind: 'behavior_attachment',
          value: key,
        });
      }
      visit(child, `${currentPath}.${key}`);
    }
  }
  visit(projectionAst, 'projectionAst');

  const uniqueFindings = [...new Map(
    findings.map((finding) => [canonicalJson(finding), finding]),
  ).values()];
  return {
    passed: uniqueFindings.length === 0,
    method: 'parsed_ast_fail_closed_capability_and_dependency_exclusion',
    runtimeCapabilityEnforcementClaimed: false,
    findings: uniqueFindings,
  };
}

function validateSourceBoundary(contracts) {
  const projectionState = contracts.projectionState;
  const authority = contracts.authority;
  const bindings = scenePhysicsBindings(contracts.projectionIr);
  const bindingByVisualObjectId = new Map(bindings.map((binding) => [binding.id, binding]));
  const agreementFields = [
    'bodyId',
    'receiptId',
    'bodyType',
    'colliderShape',
    'radius',
    'mass',
    'restitution',
    'linearDamping',
    'angularDamping',
    'registrationMethod',
  ];
  const bodyAgreement = contracts.bodyNodes.every((node) => {
    const body = node.properties;
    const binding = bindingByVisualObjectId.get(body.visualObjectId);
    return Boolean(
      binding
      && binding.id === body.visualObjectId
      && canonicalJson(binding.position) === canonicalJson(node.position)
      && canonicalJson(binding.scale) === canonicalJson(body.scale)
      && binding.route === body.route
      && agreementFields.every(
        (field) => canonicalJson(binding.physicsBody[field]) === canonicalJson(body[field]),
      ),
    );
  });
  const policyEvidence = contracts.physicsEvidence;
  const manifestPolicyAgreement = (
    contracts.manifest.engine === policyEvidence.engine
    && contracts.manifest.registrationMethod === policyEvidence.registrationMethod
    && contracts.manifest.fixedTimestepNumerator === policyEvidence.fixedTimestepNumerator
    && contracts.manifest.fixedTimestepDenominator === policyEvidence.fixedTimestepDenominator
    && contracts.manifest.fixedSteps === policyEvidence.steps
    && contracts.manifest.replayRuns === policyEvidence.runs
    && contracts.manifest.solverIterations === policyEvidence.solverIterations
    && canonicalJson(contracts.manifest.gravity) === canonicalJson(policyEvidence.gravity)
    && canonicalJson(contracts.manifest.requiredDigests)
      === canonicalJson(policyEvidence.requiredDigests)
    && contracts.manifest.dynamicColliderShape === policyEvidence.dynamicColliderShape
    && contracts.manifest.staticColliderShape === policyEvidence.staticCatchColliderShape
  );
  const manifestFixtureProperties = contracts.fixtureNodes.map((node) => {
    const { type: _type, ...fixture } = node.properties;
    return fixture;
  });
  const fixtureAgreement = canonicalJson(projectionState.fixtureReceipts)
    === canonicalJson(manifestFixtureProperties);
  const orderedBodyIds = contracts.bodyNodes.map((node) => node.properties.bodyId);
  const bodyOrderAgreement = canonicalJson(orderedBodyIds)
    === canonicalJson(contracts.manifest.bodyOrder);
  const executableSphereRadiiAgree = contracts.bodyNodes
    .filter((node) => node.properties.colliderShape === 'sphere')
    .every((node) => (
      node.properties.radius === 0.5 * Math.max(...node.properties.scale)
    ));
  const forbiddenWrites = [
    'canonical_world',
    'resident_observation',
    'clock',
    'schedule',
    'prompt',
    'action',
    'receipt',
  ];
  const requiredObserverBoundaryReads = [
    'canonical_scene_hash',
    'canonical_pose_hash',
    'logical_clock_hash',
    'public_state_hash',
    'executed_schedule_hash',
    'resident_observation_hash',
    'action_receipt_root',
  ];
  const projectionCapabilityInspection = inspectProjectionCapabilitySurface(
    contracts.projectionAst,
  );

  return {
    projectionAuthorityReadOnly:
      projectionState.authority === 'read_only'
      && authority.type === 'read_only_observer_projection_authority',
    noProjectionWriteSurface:
      Array.isArray(authority.mayWrite)
      && authority.mayWrite.length === 0
      && forbiddenWrites.every((field) => authority.forbiddenWrites.includes(field)),
    parsedProjectionHasNoExecutableCapabilityOrDependencySurface:
      projectionCapabilityInspection.passed,
    observerBoundaryReadContractsAgree:
      canonicalJson(projectionState.consumes) === canonicalJson(authority.mayRead)
      && requiredObserverBoundaryReads.every(
        (field) => projectionState.consumes.includes(field),
      ),
    absentFromResidentObservation:
      projectionState.residentVisible === false
      && projectionState.residentObservationIncluded === false
      && authority.residentVisible === false,
    adapterIdentityNotPresented:
      projectionState.adapterIdentityPresentationAllowed === false
      && authority.adapterIdentityPresentationAllowed === false,
    sourceSemanticsNotRewritten: contracts.projectionAst.metadata.sourceSemanticsRewritten === false,
    projectionMetadataSourcePathsAgree:
      contracts.projectionAst.metadata.canonicalWorldSource === SOURCES.world
      && contracts.projectionAst.metadata.policySource === SOURCES.policy
      && contracts.projectionAst.metadata.physicsManifestSource
        === SOURCES.physicsManifest,
    oneRegistrationApi:
      contracts.manifest.registrationMethod === 'PhysicsWorld.addBodyWithConfig'
      && contracts.bodyNodes.every(
        (node) => node.properties.registrationMethod === 'PhysicsWorld.addBodyWithConfig',
      ),
    sphereTokenContract:
      contracts.bodyNodes
        .filter((node) => node.properties.bodyType === 'dynamic')
        .every((node) => node.properties.colliderShape === 'sphere'),
    axisAlignedBoxCatchContract:
      contracts.bodyNodes
        .filter((node) => node.properties.bodyType === 'static')
        .every((node) => node.properties.colliderShape === 'box'),
    projectionAndManifestBodiesAgree: bodyAgreement,
    projectionAndManifestFixturesAgree: fixtureAgreement,
    parserBodyOrderMatchesManifest: bodyOrderAgreement,
    declaredSphereRadiusMatchesRuntimeScaleDerivation: executableSphereRadiiAgree,
    manifestAndPolicyExecutionContractAgree: manifestPolicyAgreement,
    projectionDeclaresSameExecutionContract:
      projectionState.fixedTimestepSeconds
        === contracts.manifest.fixedTimestepNumerator
          / contracts.manifest.fixedTimestepDenominator
      && projectionState.fixedSteps === contracts.manifest.fixedSteps
      && projectionState.replayRuns === contracts.manifest.replayRuns
      && projectionState.bodyRegistrationMethod === contracts.manifest.registrationMethod
      && projectionState.dynamicColliderShape === contracts.manifest.dynamicColliderShape
      && projectionState.staticCatchColliderShape === contracts.manifest.staticColliderShape,
    bridgeContractDoesNotClaimNativeHsplusExecution:
      contracts.policyConfig.runtimeBindingStatus
        === 'bounded_v4_projection_observed_browser_consumer_toggle_required'
      && contracts.policyConfig.nativeHsplusActionExecutionClaimed === false,
    unsupportedClaimsRemainFalse:
      projectionState.boxTokenColliderSupported === false
      && projectionState.stackingClaimed === false
      && projectionState.collisionFrictionAppliedClaimed === false
      && projectionState.ccdClaimed === false
      && projectionState.crossHardwareDeterminismClaimed === false,
    projectionCapabilityInspection,
  };
}

function bodyDefinition(node) {
  return {
    name: node.name,
    position: node.position,
    ...node.properties,
  };
}

function orderedBodyDefinitions(bodyNodes, bodyOrder) {
  const byId = new Map(bodyNodes.map((node) => [node.properties.bodyId, bodyDefinition(node)]));
  if (byId.size !== bodyNodes.length || bodyOrder.length !== bodyNodes.length) {
    throw new Error('Physics bodyOrder must name every unique body exactly once');
  }
  const ordered = bodyOrder.map((bodyId) => {
    const body = byId.get(bodyId);
    if (!body) throw new Error(`Physics bodyOrder references unknown body: ${bodyId}`);
    byId.delete(bodyId);
    return body;
  });
  if (byId.size > 0) {
    throw new Error(`Physics bodyOrder omits bodies: ${[...byId.keys()].join(', ')}`);
  }
  return ordered;
}

function normalizedVector(value) {
  if (!value) return undefined;
  return [value.x, value.y, value.z].map((number) => canonicalize(number));
}

function canonicalContactProjection(contacts) {
  return contacts.map((contact) => ({
    step: contact.step,
    ordinal: contact.ordinal,
    eventType: contact.eventType,
    bodyA: contact.bodyA,
    bodyB: contact.bodyB,
    point: contact.point ?? null,
    normal: contact.normal ?? null,
    impulse: contact.impulse ?? null,
  }));
}

function expectedRouteContactPairs(bodyDefinitions, releasedReceiptIds) {
  const staticBodies = bodyDefinitions.filter((body) => body.bodyType === 'static');
  return bodyDefinitions
    .filter((body) => (
      body.bodyType === 'dynamic'
      && releasedReceiptIds.has(body.receiptId)
    ))
    .map((token) => {
      const routeFloors = staticBodies.filter((floor) => floor.route === token.route);
      if (routeFloors.length !== 1) {
        throw new Error(
          `Expected exactly one static catch floor for route ${token.route}; found ${routeFloors.length}`,
        );
      }
      const floor = routeFloors[0];
      return {
        route: token.route,
        floorBodyId: floor.bodyId,
        tokenBodyId: token.bodyId,
        bodyPair: [floor.bodyId, token.bodyId].sort(),
      };
    })
    .sort((a, b) => (
      a.route.localeCompare(b.route)
      || a.floorBodyId.localeCompare(b.floorBodyId)
      || a.tokenBodyId.localeCompare(b.tokenBodyId)
    ));
}

export function evaluateRouteContactPairs(contactProjection, expectedPairs) {
  const expected = expectedPairs
    .map((entry) => ({
      route: entry.route,
      floorBodyId: entry.floorBodyId,
      tokenBodyId: entry.tokenBodyId,
      bodyPair: [...entry.bodyPair].sort(),
    }))
    .sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
  const expectedByPair = new Map(
    expected.map((entry) => [canonicalJson(entry.bodyPair), entry]),
  );
  const observed = contactProjection
    .filter((contact) => contact.eventType === 'collision-start')
    .map((contact) => {
      const bodyPair = [contact.bodyA, contact.bodyB].sort();
      const matched = expectedByPair.get(canonicalJson(bodyPair));
      return {
        route: matched?.route ?? null,
        floorBodyId: matched?.floorBodyId ?? null,
        tokenBodyId: matched?.tokenBodyId ?? null,
        bodyPair,
      };
    })
    .sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
  return {
    expected,
    observed,
    match: canonicalJson(observed) === canonicalJson(expected),
  };
}

function normalizedBodyState(state) {
  return {
    bodyId: state.id,
    position: state.position,
    rotation: state.rotation,
    linearVelocity: state.linearVelocity,
    angularVelocity: state.angularVelocity,
    sleeping: state.isSleeping,
    active: state.isActive,
  };
}

function effectiveColliderDimensions(body) {
  if (body.colliderShape === 'sphere') {
    return {
      derivation: 'PhysicsWorld.addBodyWithConfig:max_mesh_scale_times_0.5',
      radius: 0.5 * Math.max(...body.scale),
    };
  }
  if (body.colliderShape === 'box') {
    return {
      derivation: 'PhysicsWorld.addBodyWithConfig:mesh_scale_as_full_extents',
      fullExtents: body.scale,
      halfExtents: body.scale.map((value) => value * 0.5),
    };
  }
  throw new Error(`Unsupported Model Village collider shape: ${body.colliderShape}`);
}

function firstSleepSteps(sleepTrace, dynamicBodyIds) {
  return Object.fromEntries(
    dynamicBodyIds.map((bodyId) => {
      const first = sleepTrace.find(
        (entry) => entry.bodies.find((body) => body.bodyId === bodyId)?.sleeping,
      );
      return [bodyId, first?.step ?? null];
    }),
  );
}

function runOnePhysicsReplay(
  { PhysicsWorld, Object3D },
  bodyDefinitions,
  releasedReceiptIds,
  executionContract,
) {
  const world = new PhysicsWorld({
    gravity: executionContract.gravity,
    iterations: executionContract.solverIterations,
    stepSize: executionContract.fixedTimestepSeconds,
  });
  const registeredIds = new Set();
  const registrationCounts = {};
  const bodyMeshes = new Map();
  const contacts = [];
  const sleepTrace = [];
  const frames = [];
  let currentStep = -1;
  let callbackOrdinal = 0;

  const register = (body) => {
    if (registeredIds.has(body.bodyId)) {
      throw new Error(`Duplicate body ID rejected before addBodyWithConfig: ${body.bodyId}`);
    }
    registeredIds.add(body.bodyId);
    registrationCounts[body.bodyId] = (registrationCounts[body.bodyId] || 0) + 1;

    const mesh = new Object3D();
    mesh.position.set(body.position[0], body.position[1], body.position[2]);
    mesh.scale.set(body.scale[0], body.scale[1], body.scale[2]);
    const config = {
      type: body.bodyType,
      shape: body.colliderShape,
      mass: body.mass,
      restitution: body.restitution,
      linearDamping: body.linearDamping,
      angularDamping: body.angularDamping,
    };
    const effectiveCollider = effectiveColliderDimensions(body);
    if (
      body.colliderShape === 'sphere'
      && body.radius !== effectiveCollider.radius
    ) {
      throw new Error(
        `Declared sphere radius ${body.radius} does not match runtime-derived radius ${effectiveCollider.radius} for ${body.bodyId}`,
      );
    }
    world.addBodyWithConfig(body.bodyId, mesh, config);
    bodyMeshes.set(body.bodyId, mesh);
  };

  for (const body of bodyDefinitions) {
    if (body.bodyType === 'static' || releasedReceiptIds.has(body.receiptId)) register(body);
  }

  const unsubscribe = world.onAnyCollision((event) => {
    const bodyPair = [event.bodyA, event.bodyB].sort();
    contacts.push({
      step: currentStep,
      ordinal: callbackOrdinal,
      eventType: event.type,
      bodyA: bodyPair[0],
      bodyB: bodyPair[1],
      point: normalizedVector(event.contactPoint),
      normal: normalizedVector(event.contactNormal),
      impulse: event.impulse === undefined ? undefined : canonicalize(event.impulse),
    });
    callbackOrdinal += 1;
  });

  const dynamicBodyIds = bodyDefinitions
    .filter((body) => body.bodyType === 'dynamic' && releasedReceiptIds.has(body.receiptId))
    .map((body) => body.bodyId)
    .sort();
  for (let step = 0; step < executionContract.fixedSteps; step += 1) {
    currentStep = step;
    callbackOrdinal = 0;
    world.step(executionContract.fixedTimestepSeconds);
    const states = world.getAllBodyStates()
      .map(normalizedBodyState)
      .sort((a, b) => a.bodyId.localeCompare(b.bodyId));
    sleepTrace.push({
      step,
      bodies: states
        .filter((state) => dynamicBodyIds.includes(state.bodyId))
        .map((state) => ({
          bodyId: state.bodyId,
          sleeping: state.sleeping,
          active: state.active,
        })),
    });
    frames.push({
      step,
      bodies: states
        .filter((state) => dynamicBodyIds.includes(state.bodyId))
        .map((state) => ({
          bodyId: state.bodyId,
          position: state.position,
          rotation: state.rotation,
          sleeping: state.sleeping,
        })),
    });
  }
  unsubscribe();

  const finalStates = world.getAllBodyStates()
    .map(normalizedBodyState)
    .sort((a, b) => a.bodyId.localeCompare(b.bodyId));
  const orderedContactProjection = canonicalContactProjection(contacts);
  const routeContactPairs = evaluateRouteContactPairs(
    orderedContactProjection,
    expectedRouteContactPairs(bodyDefinitions, releasedReceiptIds),
  );
  const initialBodyManifest = bodyDefinitions
    .filter((body) => body.bodyType === 'static' || releasedReceiptIds.has(body.receiptId))
    .map((body) => ({
      bodyId: body.bodyId,
      bodyType: body.bodyType,
      colliderShape: body.colliderShape,
      position: body.position,
      scale: body.scale,
      mass: body.mass,
      restitution: body.restitution,
      linearDamping: body.linearDamping,
      angularDamping: body.angularDamping,
      effectiveCollider: effectiveColliderDimensions(body),
    }))
    .sort((a, b) => a.bodyId.localeCompare(b.bodyId));
  const digests = {
    bodyManifest: digest(initialBodyManifest),
    orderedContact: digest(orderedContactProjection),
    perStepSleep: digest(sleepTrace),
    finalTransform: digest(finalStates),
    frameTrace: digest(frames),
  };
  const physicsStateHash = digest(digests);
  const allReleasedBodiesSleep = finalStates
    .filter((state) => dynamicBodyIds.includes(state.bodyId))
    .every((state) => (
      state.sleeping
      && state.linearVelocity.every((value) => value === 0)
      && state.angularVelocity.every((value) => value === 0)
    ));

  return {
    registrationCounts,
    registeredBodyIds: [...registeredIds],
    staticBodyCount: finalStates.filter((state) => !dynamicBodyIds.includes(state.bodyId)).length,
    dynamicBodyCount: dynamicBodyIds.length,
    duplicateRegistrationCount: Object.values(registrationCounts).filter((count) => count !== 1).length,
    contactCount: orderedContactProjection.length,
    contacts,
    orderedContactProjection,
    expectedRouteContactPairs: routeContactPairs.expected,
    observedRouteContactPairs: routeContactPairs.observed,
    routeContactPairsMatch: routeContactPairs.match,
    sleepTrace,
    firstSleepSteps: firstSleepSteps(sleepTrace, dynamicBodyIds),
    finalStates,
    frames,
    digests,
    physicsStateHash,
    allReleasedBodiesSleep,
    executionContract,
  };
}

function canonicalBoundaryProjection(result) {
  if (!result) return null;
  const receipt = result.receipt;
  const capturedFixtureBoundaryFields =
    receipt.observerBoundaryFixture?.canonicalFields || {};
  const boundedRuntimeObserver =
    receipt.engineeringTracer?.runtime?.observerProjection;
  if (!boundedRuntimeObserver) {
    throw new Error(
      'Bounded Phase 0B observer projection witness is unavailable',
    );
  }
  const execution = receipt.engineeringTracer?.runtime?.executionReceipt;
  const [admittedEntry, blockedEntry] = execution?.actionLedger || [];
  if (!admittedEntry || !blockedEntry || execution.actionLedger.length !== 2) {
    throw new Error('Verified Phase 0B action ledger is unavailable');
  }
  const trustedActionBindingCore = {
    schema: 'hololand.model-village.trusted-action-binding.v1',
    phase0BReceiptHash: receipt.engineeringTracer.receipt.receiptHash,
    sourceRunCommitment:
      receipt.engineeringTracer.runtime.sourceRunCommitment,
    terminalCommitment:
      receipt.engineeringTracer.runtime.terminalCommitment,
    actionReceiptRoot: execution.terminal.actionRoot,
    admittedActionEntryHash: admittedEntry.entryHash,
    admittedPreviousEntryHash: admittedEntry.previousHash,
    blockedActionEntryHash: blockedEntry.entryHash,
    blockedPreviousEntryHash: blockedEntry.previousHash,
  };
  const trustedActionBinding = {
    ...trustedActionBindingCore,
    bindingHash: digest(trustedActionBindingCore),
  };
  if (
    boundedRuntimeObserver.livingCommons.actionReceiptRoot
      !== trustedActionBinding.actionReceiptRoot
    || boundedRuntimeObserver.livingCommons.admittedAction.entryHash
      !== trustedActionBinding.admittedActionEntryHash
    || boundedRuntimeObserver.livingCommons.admittedAction.previousEntryHash
      !== trustedActionBinding.admittedPreviousEntryHash
    || boundedRuntimeObserver.livingCommons.blockedAction.entryHash
      !== trustedActionBinding.blockedActionEntryHash
    || boundedRuntimeObserver.livingCommons.blockedAction.previousEntryHash
      !== trustedActionBinding.blockedPreviousEntryHash
    || boundedRuntimeObserver.on.sourceRunCommitment
      !== trustedActionBinding.sourceRunCommitment
    || boundedRuntimeObserver.on.terminalCommitment
      !== trustedActionBinding.terminalCommitment
  ) {
    throw new Error(
      'Observer Living Commons projection differs from the verified action ledger',
    );
  }
  return {
    sourceHashes: receipt.semanticIr ? {
      world: receipt.semanticIr.world.sourceHash,
      policy: receipt.semanticIr.policy.sourceHash,
      kernel: receipt.semanticIr.kernel.sourceHash,
      spec: receipt.semanticIr.spec.sourceHash,
    } : null,
    canonicalVisibleWorld: {
      canonicalDigest: receipt.headlessReplay.canonicalDigests[0],
      canonicalReplayMatch: receipt.headlessReplay.canonicalMatch,
      objectCount: receipt.headlessReplay.objectCount,
      objectIds: [...receipt.headlessReplay.objectIds].sort(),
    },
    capturedFixtureBoundaryFields,
    boundedRuntimeObserver: {
      ...boundedRuntimeObserver,
      verifiedPersistence: {
        finalStateHash: receipt.engineeringTracer.persistence.finalStateHash,
        receiptRoot: receipt.engineeringTracer.persistence.receiptRoot,
      },
      verifiedReceiptHash: receipt.engineeringTracer.receipt.receiptHash,
      trustedActionBinding,
    },
    experimentDesign: receipt.experimentDesign,
  };
}

function assertionsPass(assertions) {
  return Object.values(assertions).every(Boolean);
}

function executionContractFromManifest(manifest) {
  const integerFields = [
    ['fixedTimestepNumerator', manifest.fixedTimestepNumerator],
    ['fixedTimestepDenominator', manifest.fixedTimestepDenominator],
    ['fixedSteps', manifest.fixedSteps],
    ['replayRuns', manifest.replayRuns],
    ['solverIterations', manifest.solverIterations],
  ];
  for (const [field, value] of integerFields) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Physics manifest ${field} must be a positive integer`);
    }
  }
  if (
    !Array.isArray(manifest.gravity)
    || manifest.gravity.length !== 3
    || manifest.gravity.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('Physics manifest gravity must contain three finite numbers');
  }
  return {
    gravity: manifest.gravity,
    solverIterations: manifest.solverIterations,
    fixedTimestepNumerator: manifest.fixedTimestepNumerator,
    fixedTimestepDenominator: manifest.fixedTimestepDenominator,
    fixedTimestepSeconds:
      manifest.fixedTimestepNumerator / manifest.fixedTimestepDenominator,
    fixedSteps: manifest.fixedSteps,
    replayRuns: manifest.replayRuns,
  };
}

export async function runPhysicsCheck(options = {}) {
  const root = path.resolve(options.root || REPO_ROOT);
  const output = resolveOutput(root, options.output || DEFAULT_OUTPUT);
  const holoScriptRoot = resolveHoloScriptRoot(root, options.holoScriptRoot);
  const canonicalBoundaryEnabled = options.canonicalBoundary !== false;
  const toolchain = await loadToolchain(holoScriptRoot);
  const contracts = parseContracts(root, toolchain);
  const sourceBoundary = validateSourceBoundary(contracts);
  const executionContract = executionContractFromManifest(contracts.manifest);

  const fixtureProperties = contracts.fixtureNodes.map((node) => node.properties);
  const receiptDecisions = evaluateReceiptFixtures(
    fixtureProperties,
    contracts.admission,
    contracts.hashes,
  );
  const releasedReceiptIds = new Set(
    receiptDecisions.filter((decision) => decision.allowed).map((decision) => decision.receiptId),
  );
  const bodyDefinitions = orderedBodyDefinitions(
    contracts.bodyNodes,
    contracts.manifest.bodyOrder,
  );

  const canonicalBefore = canonicalBoundaryEnabled
    ? await runModelVillageCheck({
        root,
        output: path.join('.tmp', 'hololand', 'model-village', 'physics-canonical-before.json'),
      })
    : null;
  const replays = Array.from({ length: executionContract.replayRuns }, () => runOnePhysicsReplay(
    {
      PhysicsWorld: toolchain.runtime.PhysicsWorld,
      Object3D: toolchain.three.Object3D,
    },
    bodyDefinitions,
    releasedReceiptIds,
    executionContract,
  ));
  const canonicalAfter = canonicalBoundaryEnabled
    ? await runModelVillageCheck({
        root,
        output: path.join('.tmp', 'hololand', 'model-village', 'physics-canonical-after.json'),
      })
    : null;

  const replayRoots = replays.map((run) => run.physicsStateHash);
  const replayRunsMatch = new Set(replayRoots).size === 1;
  const beforeProjection = canonicalBoundaryProjection(canonicalBefore);
  const afterProjection = canonicalBoundaryProjection(canonicalAfter);
  const capturedFixtureBoundaryComparison = canonicalBoundaryEnabled
    ? compareObserverBoundaryFields(
        beforeProjection.capturedFixtureBoundaryFields,
        afterProjection.capturedFixtureBoundaryFields,
      )
    : null;
  const observerBoundaryComparison = canonicalBoundaryEnabled
    ? compareObserverBoundaryFields(
        afterProjection.boundedRuntimeObserver.off.canonicalFields,
        afterProjection.boundedRuntimeObserver.on.canonicalFields,
      )
    : null;
  const boundedRuntimeAcrossPhysicsComparison = canonicalBoundaryEnabled
    ? compareObserverBoundaryFields(
        beforeProjection.boundedRuntimeObserver.on.canonicalFields,
        afterProjection.boundedRuntimeObserver.on.canonicalFields,
      )
    : null;
  const canonicalObservedBoundaryMatch = canonicalBoundaryEnabled
    ? capturedFixtureBoundaryComparison.passed
      && observerBoundaryComparison.passed
      && boundedRuntimeAcrossPhysicsComparison.passed
      && beforeProjection.canonicalVisibleWorld.objectCount === 12
      && afterProjection.canonicalVisibleWorld.objectCount === 12
      && canonicalJson(beforeProjection.canonicalVisibleWorld)
        === canonicalJson(afterProjection.canonicalVisibleWorld)
      && canonicalJson(beforeProjection.sourceHashes)
        === canonicalJson(afterProjection.sourceHashes)
      && canonicalJson(beforeProjection.experimentDesign)
        === canonicalJson(afterProjection.experimentDesign)
      && beforeProjection.boundedRuntimeObserver.projectionToggleExecuted
        === true
      && afterProjection.boundedRuntimeObserver.projectionToggleExecuted
        === true
    : null;
  const expectedReleasedTokenCount = contracts.replayGate.expectedReleasedTokenCount;
  const expectedFailDarkReleaseCount = contracts.replayGate.missingAndTamperedReleaseCount;
  const expectedStaticBodyCount = bodyDefinitions.filter(
    (body) => body.bodyType === 'static',
  ).length;
  const invalidFixtureDecisions = receiptDecisions.filter(
    (decision) => !decision.expectedRelease,
  );
  const actualFixtureOrder = receiptDecisions.map((decision) => decision.fixtureId);
  const expectedFailDarkFixtureIds = contracts.manifest.requiredFailDarkFixtureIds;
  const actualFailDarkFixtureIds = invalidFixtureDecisions.map(
    (decision) => decision.fixtureId,
  );
  const manifestControlsExecution = (
    replays.length === contracts.manifest.replayRuns
    && replays.every(
      (run) => canonicalJson(run.executionContract) === canonicalJson(executionContract),
    )
  );
  const replayGateControlsAcceptance = (
    contracts.replayGate.sameSourceAndFixtureRequired === true
    && contracts.replayGate.orderedContactDigestMustMatch === true
    && contracts.replayGate.perStepSleepDigestMustMatch === true
    && contracts.replayGate.finalTransformDigestMustMatch === true
    && contracts.replayGate.allReleasedBodiesMustSleep === true
    && contracts.replayGate.allFinalNumbersMustBeFinite === true
    && contracts.replayGate.canonicalExperimentMutationAllowed === false
    && contracts.replayGate.residentObservationMutationAllowed === false
  );

  const assertions = {
    fourHoloScriptSourcesParse: Object.values(contracts.parseSummary).every((item) => item.success),
    sourceBoundaryPasses: assertionsPass(sourceBoundary),
    allFixtureExpectationsMatch: receiptDecisions.every((decision) => decision.expectationMatched),
    manifestFixtureOrderIsComplete:
      canonicalJson(actualFixtureOrder) === canonicalJson(contracts.manifest.fixtureOrder),
    validReceiptsReleaseExpectedTokens:
      receiptDecisions.filter((decision) => decision.allowed).length
        === expectedReleasedTokenCount,
    missingTamperedAndDuplicateFailDark: receiptDecisions
      .filter((decision) => expectedFailDarkFixtureIds.includes(decision.fixtureId))
      .every((decision) => !decision.allowed && decision.route === 'dark')
      && canonicalJson(actualFailDarkFixtureIds) === canonicalJson(expectedFailDarkFixtureIds)
      && invalidFixtureDecisions.filter((decision) => decision.allowed).length
        === expectedFailDarkReleaseCount,
    exactBodyRegistration: replays.every(
      (run) => run.staticBodyCount === expectedStaticBodyCount
        && run.dynamicBodyCount === expectedReleasedTokenCount
        && run.registeredBodyIds.length
          === expectedStaticBodyCount + expectedReleasedTokenCount
        && run.duplicateRegistrationCount === 0
        && Object.values(run.registrationCounts).every((count) => count === 1),
    ),
    manifestControlsExecution,
    replayGateControlsAcceptance,
    configuredReplayRootsMatch: replayRunsMatch,
    orderedContactDigestsMatch:
      new Set(replays.map((run) => run.digests.orderedContact)).size === 1,
    sleepTraceDigestsMatch:
      new Set(replays.map((run) => run.digests.perStepSleep)).size === 1,
    finalTransformDigestsMatch:
      new Set(replays.map((run) => run.digests.finalTransform)).size === 1,
    releasedBodiesSleep: replays.every((run) => run.allReleasedBodiesSleep),
    exactRouteMatchedContactPairs: replays.every((run) => (
      run.contactCount === 2
      && run.expectedRouteContactPairs.length === 2
      && run.observedRouteContactPairs.length === 2
      && run.routeContactPairsMatch
    )),
    contactsObserved: replays.every((run) => run.contactCount === 2),
    fixtureBoundaryStableAcrossPhysicsWitness:
      canonicalBoundaryEnabled ? canonicalObservedBoundaryMatch === true : true,
    canonicalObserverBoundaryFieldsAvailable:
      canonicalBoundaryEnabled
        ? capturedFixtureBoundaryComparison.missingBefore.length === 0
          && capturedFixtureBoundaryComparison.missingAfter.length === 0
          && capturedFixtureBoundaryComparison.invalidBefore.length === 0
          && capturedFixtureBoundaryComparison.invalidAfter.length === 0
          && observerBoundaryComparison.missingBefore.length === 0
          && observerBoundaryComparison.missingAfter.length === 0
          && observerBoundaryComparison.invalidBefore.length === 0
          && observerBoundaryComparison.invalidAfter.length === 0
          && boundedRuntimeAcrossPhysicsComparison.missingBefore.length === 0
          && boundedRuntimeAcrossPhysicsComparison.missingAfter.length === 0
          && boundedRuntimeAcrossPhysicsComparison.invalidBefore.length === 0
          && boundedRuntimeAcrossPhysicsComparison.invalidAfter.length === 0
        : true,
  };

  const sourcePaths = Object.values(SOURCES);
  const holoScriptScopedPaths = [
    'packages/runtime/src/physics/PhysicsWorld.ts',
    'packages/runtime/src/physics/PhysicsWorld.test.ts',
    'packages/engine/src/physics/PhysicsWorldImpl.ts',
    'packages/engine/src/physics/PhysicsBody.ts',
    'packages/engine/src/physics/__tests__/PhysicsWorldImpl.bugs.test.ts',
  ];
  const receiptCore = {
    schema: SCHEMA,
    sourceHashes: contracts.hashes,
    policy: {
      parser: contracts.parseSummary.policy.parser,
      admission: contracts.admission,
      decisions: receiptDecisions.map(({ receipt, ...decision }) => ({
        ...decision,
        receiptSourceHashes: Object.fromEntries(
          Object.entries(receipt)
            .filter(([key]) => key.endsWith('SourceHash'))
            .map(([key, value]) => [key, value]),
        ),
      })),
    },
    sourceBoundary,
    physics: {
      engine: contracts.manifest.engine,
      registrationMethod: contracts.manifest.registrationMethod,
      executionContract,
      fixedTimestepSeconds: executionContract.fixedTimestepSeconds,
      fixedSteps: executionContract.fixedSteps,
      replayRuns: executionContract.replayRuns,
      replayRoots,
      replayRunsMatch,
      firstRun: {
        registeredBodyIds: replays[0].registeredBodyIds,
        registrationCounts: replays[0].registrationCounts,
        staticBodyCount: replays[0].staticBodyCount,
        dynamicBodyCount: replays[0].dynamicBodyCount,
        duplicateRegistrationCount: replays[0].duplicateRegistrationCount,
        contactCount: replays[0].contactCount,
        orderedContactProjection: replays[0].orderedContactProjection,
        expectedRouteContactPairs: replays[0].expectedRouteContactPairs,
        observedRouteContactPairs: replays[0].observedRouteContactPairs,
        routeContactPairsMatch: replays[0].routeContactPairsMatch,
        firstSleepSteps: replays[0].firstSleepSteps,
        finalStates: replays[0].finalStates,
        digests: replays[0].digests,
        physicsStateHash: replays[0].physicsStateHash,
        frames: replays[0].frames,
      },
    },
    canonicalBoundary: {
      enabled: canonicalBoundaryEnabled,
      observedBoundaryMatch: canonicalObservedBoundaryMatch,
      comparisonContext:
        'canonical_world_before_after_physics_plus_bounded_runtime_observer_off_on',
      projectionToggleExecuted:
        canonicalBoundaryEnabled
          ? afterProjection.boundedRuntimeObserver.projectionToggleExecuted
          : false,
      fullMvP0ProjectionToggleClaimed: false,
      observerBoundaryComparison,
      capturedFixtureBoundaryComparison,
      boundedRuntimeAcrossPhysicsComparison,
      before: beforeProjection,
      after: afterProjection,
      observedFields: [
        'canonical source hashes',
        '12-object scene IDs',
        'canonical 12-object fixture scene and pose hashes',
        'bounded V4 observer-off/on canonical scene hash',
        'bounded V4 observer-off/on canonical pose hash',
        'bounded V4 observer-off/on logical-clock hash',
        'bounded V4 observer-off/on public-state hash',
        'bounded V4 observer-off/on executed-schedule hash',
        'bounded V4 observer-off/on resident-observation hash',
        'bounded V4 observer-off/on action-receipt root',
        'experiment-design projection',
      ],
      fixtureBridgeFieldsAvailable: [
        'executed schedule hash',
        'resident observation hash',
        'action receipt root',
      ],
      nativeHeadlessFieldsStillUnavailable: [
        'full 12-object native lifecycle executed-schedule hash',
        'full 12-object native lifecycle resident-observation hash',
        'full 12-object native lifecycle action-receipt root',
      ],
    },
    assertions,
    toolchain: {
      nodeVersion: process.version,
      holoScriptRoot: normalizePath(path.relative(root, holoScriptRoot)),
      artifactHashes: toolchain.hashes,
      holoScriptGit: gitProvenance(holoScriptRoot, holoScriptScopedPaths),
      holoLandGit: gitProvenance(root, [
        ...sourcePaths,
        'scripts/check-hololand-model-village-physics.mjs',
        'scripts/__tests__/hololand-model-village-physics.test.mjs',
      ]),
    },
    claimBoundary: {
      observed: [
        'HoloScript-authored observer, calibration, policy, and physics sources parse',
        'admitted and blocked fixtures marked signature-verified and exact-source-bound each release one body',
        'missing, tampered, and duplicate fixtures fail dark',
        'two sphere-collider tokens fall under HoloScript CPU physics, contact axis-aligned box catch floors, and sleep',
        'ordered-contact, per-step sleeping, and final-transform digests match across three local 600-step fixed-timestep runs',
        'the physics-witness side-effect sandwich leaves the seven-field source-declared captured-fixture boundary unchanged',
        'single-sealed-execution observer projection equivalence for the bounded four-object Phase 0B runtime before and after the physics witness',
        'the parsed observer projection has no executable logic, behavior attachment, import, provider, tool, scheduler, receipt-writer, or resident-observation output surface',
      ],
      notObserved: [
        'browser observer projection off/on consumer toggle',
        'full canonical 12-object observer projection lifecycle',
        'box token colliders',
        'stacking',
        'collision friction response',
        'continuous collision detection',
        'cross-hardware determinism',
        'GPU or WebGPU physics',
        'native .hsplus action execution',
        'native .hs pipeline execution',
        'native headless schedule, resident-observation, or action-receipt-ledger hashes',
        'native runtime capability enforcement for observer read-only authority',
      ],
      allowedPhrase:
        'Deterministic CPU sphere-collider receipt tracer on the named local HoloScript build.',
    },
  };
  const status = assertionsPass(assertions) ? 'pass' : 'fail';
  const receipt = {
    ...receiptCore,
    generatedAt: new Date().toISOString(),
    status,
    receipt: {
      receiptHash: digest(receiptCore),
      output: normalizePath(path.relative(root, output)),
      rawSourceIncluded: false,
      providerCallsMade: 0,
    },
  };

  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (status !== 'pass') {
    const failures = Object.entries(assertions)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    throw new Error(`Model Village physics witness failed: ${failures.join(', ')}. Receipt: ${output}`);
  }
  return { receipt, output, contracts, replays };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs();
    const { receipt, output } = await runPhysicsCheck(args);
    if (args.json) console.log(JSON.stringify(receipt, null, 2));
    else {
      console.log('[hololand-model-village-physics] ok');
      console.log(`receipt: ${output}`);
      console.log(`physics root: ${receipt.physics.firstRun.physicsStateHash}`);
      console.log(`replay match: ${receipt.physics.replayRunsMatch}`);
      console.log(`first sleep steps: ${JSON.stringify(receipt.physics.firstRun.firstSleepSteps)}`);
      console.log(`claim: ${receipt.claimBoundary.allowedPhrase}`);
    }
  } catch (error) {
    console.error('[hololand-model-village-physics] failed');
    console.error(error?.stack || error?.message || error);
    process.exit(1);
  }
}
