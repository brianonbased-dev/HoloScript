import { describe, expect, it } from 'vitest';
import {
  assertHoloLlamaBundleConsumable,
  buildLlamaServeComposition,
  compileHoloLlamaBundle,
  compileHoloLlamaFiles,
  doctorHoloLlamaProfiles,
  extractSovereignDeviceRegistry,
  listHoloLlamaBrains,
  listHoloLlamaProfiles,
  selectHoloLlamaBrain,
  summarizeHoloLlamaBundle,
} from '../index.js';
import { selectHoloLlamaBrain as selectHoloLlamaBrainFromSubpath } from '../brain.js';

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

  it('extracts the sovereign-device registry document fleet routers consume', () => {
    const registry = extractSovereignDeviceRegistry(compileHoloLlamaBundle({ profile: 'vast-linux-gpu' }));
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
    expect(files['launch-llama-server.ps1']).toContain('llama-server.exe');
    expect(files['health-probe.ps1']).toContain('http://127.0.0.1:18080/health');
    expect(files['sovereign-devices/laptop-fara-7b-llama.json']).toContain('"backend": "llama.cpp"');
  });
});
