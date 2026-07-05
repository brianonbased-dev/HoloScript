import { describe, expect, it } from 'vitest';
import {
  assertHoloLlamaBundleConsumable,
  buildHoloLlamaFleetLifecycleReport,
  buildHoloMeshReadOnlyBridge,
  buildLlamaServeComposition,
  compileHoloLlamaBundle,
  compileHoloLlamaFiles,
  doctorHoloLlamaProfiles,
  extractSovereignDeviceRegistry,
  listHoloLlamaBrains,
  listHoloLlamaProfiles,
  preflightHoloLlamaVision,
  selectHoloLlamaBrain,
  summarizeHoloLlamaBundle,
} from '../index.js';
import { selectHoloLlamaBrain as selectHoloLlamaBrainFromSubpath } from '../brain.js';

const patchedJetsonExecutable = '/opt/holoscript/llama.cpp/build/bin/llama-server';
const patchedLaptopExecutable =
  'C:\\Users\\josep\\Documents\\GitHub\\llama.cpp\\build\\bin\\llama-server.exe';

describe('@holoscript/holollama', () => {
  it('exposes all fleet serving profiles', () => {
    expect(listHoloLlamaProfiles().map((profile) => profile.id)).toEqual([
      'jetson-orin',
      'laptop-windows',
      'vast-linux-gpu',
    ]);
  });

  it('exposes canonical Brain definitions for package consumers', () => {
    const brains = listHoloLlamaBrains();
    expect(brains.map((brain) => brain.id)).toEqual(
      expect.arrayContaining(['audio', 'gamedev', 'narrative'])
    );
    expect(brains.find((brain) => brain.id === 'audio')).toMatchObject({
      displayName: 'Audio Brain',
      packageName: '@holoscript/audio',
      brainPath: 'graduated-skills/audio/audio.hsplus',
    });
  });

  it('selects a Brain from task text while retaining skill compatibility fields', () => {
    const selection = selectHoloLlamaBrain({
      task: 'Compose eerie game ambience for a playable cave level.',
      selectedDevice: 'jetson-orin-super',
    });

    expect(selection.schema).toBe('holollama-brain-router.selection.v1');
    expect(selection.lexicon).toMatchObject({
      userFacingUnit: 'Brain',
      compatibilityUnit: 'skill',
    });
    expect(selection.selectedBrain.id).toBe('audio');
    expect(selection.selectedBrain.source.compatibilityId).toBe('audio');
    expect(selection.selectedCompatibilitySkill.id).toBe('audio');
    expect(selection.selectedConsumerProfile.id).toBe('jetson-edge');
    expect(selection.score.matches).toEqual(expect.arrayContaining(['ambience', 'eerie']));
  });

  it('accepts explicit legacy skill selectors as Brain compatibility aliases', () => {
    const selection = selectHoloLlamaBrain({
      task: 'Write the next character dialogue beat.',
      skill: 'narrative',
      profileId: 'laptop-owned-metal',
    });

    expect(selection.routing.selectionPolicy).toBe('explicit-skill-alias');
    expect(selection.requestedBrain).toBe('narrative');
    expect(selection.selectedBrain.displayName).toBe('Narrative Brain');
    expect(selection.selectedConsumerProfile.id).toBe('laptop-owned-metal');
    expect(selection.compatibility.skillAliasesAccepted).toBe(true);
  });

  it('exposes the Brain selector from a dependency-light package subpath', () => {
    const selection = selectHoloLlamaBrainFromSubpath({
      task: 'Audit whether a claimed speedup is actually causal.',
      selectedDevice: 'holojetson',
    });

    expect(selection.selectedBrain.id).toBe('confounder');
    expect(selection.selectedConsumerProfile.id).toBe('jetson-edge');
  });

  it('builds a native @llama_serve composition for Jetson', () => {
    const code = buildLlamaServeComposition('jetson-orin');
    expect(code).toContain('@llama_serve');
    expect(code).toContain('vision: false');
    expect(code).toContain('grammar: "holoscript"');
  });

  it('compiles a HoloLlama plan into required serving artifacts', () => {
    const bundle = compileHoloLlamaBundle({ profile: 'jetson-orin' });
    const check = assertHoloLlamaBundleConsumable(bundle);
    const summary = summarizeHoloLlamaBundle(bundle);

    expect(check.ok).toBe(true);
    expect(bundle.target).toBe('llama-server');
    expect(bundle.launch.command).toContain('--grammar-file grammars/holoscript-subset.gbnf');
    expect(bundle.registryEntry.handle).toBe('jetson-brittney-edge');
    expect(summary.files).toContain('launch-llama-server.ps1');
    expect(summary.files).toContain('sovereign-devices/jetson-brittney-edge.json');
  });

  it('doctors every fleet profile as a consumable serving plan', () => {
    const report = doctorHoloLlamaProfiles({ generatedAt: '2026-07-05T00:00:00.000Z' });

    expect(report.schema).toBe('holollama.doctor.v1');
    expect(report.ok).toBe(true);
    expect(report.profiles.map((profile) => profile.profile)).toEqual([
      'jetson-orin',
      'laptop-windows',
      'vast-linux-gpu',
    ]);
    expect(report.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          profile: 'vast-linux-gpu',
          consumer: 'vast',
          registryHandle: 'vast-holollama',
          blockers: [],
        }),
      ])
    );
  });

  it('doctors a single profile when scoped for a consumer lane', () => {
    const report = doctorHoloLlamaProfiles({ profile: 'laptop-windows' });

    expect(report.ok).toBe(true);
    expect(report.profiles).toHaveLength(1);
    expect(report.profiles[0]).toMatchObject({
      profile: 'laptop-windows',
      consumer: 'laptop',
      registryHandle: 'laptop-fara-7b-llama',
    });
  });

  it('points owned fleet profiles at HOLO-patched llama.cpp build binaries', () => {
    const jetson = compileHoloLlamaBundle({ profile: 'jetson-orin' });
    const laptop = compileHoloLlamaBundle({ profile: 'laptop-windows' });

    expect(jetson.launch.executable).toBe(patchedJetsonExecutable);
    expect(jetson.launch.command.startsWith(`${patchedJetsonExecutable} -m`)).toBe(true);
    expect(laptop.launch.executable).toBe(patchedLaptopExecutable);
    expect(laptop.launch.command.startsWith(`${patchedLaptopExecutable} -m`)).toBe(true);
    expect(laptop.launch.command).not.toContain('.docker\\bin\\inference');
  });

  it('extracts the sovereign-device registry document fleet routers consume', () => {
    const registry = extractSovereignDeviceRegistry(
      compileHoloLlamaBundle({ profile: 'vast-linux-gpu' })
    );
    expect(registry.handle).toBe('vast-holollama');
    expect(registry.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'local-llm',
          backend: 'llama.cpp',
          serverKind: 'llama-server',
        }),
      ])
    );
  });

  it('returns a path-keyed file map for package consumers', () => {
    const files = compileHoloLlamaFiles({ profile: 'laptop-windows' });
    expect(files['launch-llama-server.ps1']).toContain(patchedLaptopExecutable);
    expect(files['health-probe.ps1']).toContain('http://127.0.0.1:18080/health');
    expect(files['sovereign-devices/laptop-fara-7b-llama.json']).toContain(
      '"backend": "llama.cpp"'
    );
  });

  it('builds a read-only HoloMesh bridge receipt for fleet consumers', () => {
    const bridge = buildHoloMeshReadOnlyBridge({
      profile: 'jetson-orin',
      teamId: 'team_test',
      generatedAt: '2026-07-05T00:00:00.000Z',
    });

    expect(bridge.schema).toBe('holollama.holomesh-readonly-bridge.v1');
    expect(bridge.ok).toBe(true);
    expect(bridge.registryHandle).toBe('jetson-brittney-edge');
    expect(bridge.access.allowedMethods).toEqual(['GET']);
    expect(bridge.access.forbiddenMethods).toEqual(['POST', 'PATCH', 'PUT', 'DELETE']);
    expect(bridge.access.writeScopes).toEqual([]);
    expect(bridge.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'team-board',
          method: 'GET',
          path: '/api/holomesh/team/team_test/board',
        }),
      ])
    );
  });

  it('preflights llama.cpp vision flags for the laptop lane', () => {
    const preflight = preflightHoloLlamaVision('laptop-windows', {
      generatedAt: '2026-07-05T00:00:00.000Z',
    });

    expect(preflight.schema).toBe('holollama.llama-cpp-vision-preflight.v1');
    expect(preflight.ok).toBe(true);
    expect(preflight.visionRequested).toBe(true);
    expect(preflight.launchCommand).toContain('--mmproj');
    expect(preflight.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'launch-mmproj-flag', required: true, ok: true }),
        expect.objectContaining({ id: 'launch-image-token-flags', required: true, ok: true }),
        expect.objectContaining({ id: 'registry-vision-capability', required: true, ok: true }),
      ])
    );
  });

  it('promotes doctor, vision preflight, and mesh bridge into lifecycle checks', () => {
    const lifecycle = buildHoloLlamaFleetLifecycleReport({
      teamId: 'team_test',
      generatedAt: '2026-07-05T00:00:00.000Z',
    });

    expect(lifecycle.schema).toBe('holollama.fleet-lifecycle.v1');
    expect(lifecycle.ok).toBe(true);
    expect(lifecycle.profiles.map((profile) => profile.profile)).toEqual([
      'jetson-orin',
      'laptop-windows',
      'vast-linux-gpu',
    ]);
    const laptop = lifecycle.profiles.find((profile) => profile.profile === 'laptop-windows');
    expect(laptop?.stages.map((stage) => stage.id)).toEqual([
      'plan',
      'vision-preflight',
      'mesh-readonly-bridge',
      'serve-health-probe',
    ]);
    expect(laptop?.visionPreflight.visionRequested).toBe(true);
    expect(
      laptop?.meshReadOnlyBridge.endpoints.some((endpoint) => endpoint.id === 'team-board')
    ).toBe(true);
  });
});
