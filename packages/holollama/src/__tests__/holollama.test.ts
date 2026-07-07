import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertHoloLlamaBundleConsumable,
  assessHoloLlamaFootprint,
  assessHoloLlamaRuntimeReadiness,
  buildHoloLlamaFleetLifecycleReport,
  buildHoloMeshReadOnlyBridge,
  buildLlamaServeComposition,
  compileHoloLlamaBundle,
  compileHoloLlamaFiles,
  doctorHoloLlamaProfiles,
  extractSovereignDeviceRegistry,
  installHoloLlamaPublicHarness,
  listHoloLlamaBrains,
  listHoloLlamaProfiles,
  parseHoloLlamaSystemdShow,
  preflightHoloLlamaVision,
  probeHoloLlamaLiveLifecycle,
  readHoloLlamaProfileSource,
  selectHoloLlamaBrain,
  summarizeHoloLlamaBundle,
  verifyHoloLlamaHarnessSafety,
  verifyHoloLlamaServerContract,
} from '../index.js';
import { selectHoloLlamaBrain as selectHoloLlamaBrainFromSubpath } from '../brain.js';

const patchedJetsonExecutable = '/opt/holoscript/llama.cpp/build-holo/bin/llama-server';
const patchedLaptopExecutable =
  'C:\\Users\\josep\\Documents\\GitHub\\llama.cpp\\build-holo\\bin\\Release\\llama-server.exe';

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
    expect(code).toBe(readHoloLlamaProfileSource('jetson-orin'));
    expect(code).toContain('@llama_serve');
    expect(code).toContain('vision: false');
    expect(code).toContain('grammar: "holoscript"');
    expect(code).toContain('model_path: "/opt/holoscript/models/qwen3-4b-instruct.gguf"');
    expect(code).toContain('lora: ["/opt/holoscript/models/brittney-edge-v0-4.lora.gguf"]');
    expect(code).toContain(patchedJetsonExecutable);
    expect(code).not.toContain('/llama.cpp/build/bin/llama-server');
  });

  it('compiles a HoloLlama plan into required serving artifacts', () => {
    const bundle = compileHoloLlamaBundle({ profile: 'jetson-orin' });
    const check = assertHoloLlamaBundleConsumable(bundle);
    const summary = summarizeHoloLlamaBundle(bundle);

    expect(check.ok).toBe(true);
    expect(bundle.target).toBe('llama-server');
    expect(bundle.launch.command).toContain('--grammar-file grammars/holoscript-subset.gbnf');
    expect(bundle.launch.command).toContain('-m /opt/holoscript/models/qwen3-4b-instruct.gguf');
    expect(bundle.launch.command).toContain(
      '--lora /opt/holoscript/models/brittney-edge-v0-4.lora.gguf'
    );
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
    expect(jetson.launch.command).toContain(
      '--lora /opt/holoscript/models/brittney-edge-v0-4.lora.gguf'
    );
    expect(laptop.launch.executable).toBe(patchedLaptopExecutable);
    expect(laptop.launch.command.startsWith(`${patchedLaptopExecutable} -m`)).toBe(true);
    expect(laptop.launch.command).not.toContain('.docker\\bin\\inference');
    expect(laptop.launch.command).not.toContain('llama.cpp\\build\\bin');
    expect(laptop.launch.command).not.toContain('AppData\\Local\\Programs\\Ollama');
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

  it('gates the HoloLlama server contract for text and vision fleet benches', () => {
    const jetson = verifyHoloLlamaServerContract('jetson-orin', {
      generatedAt: '2026-07-05T00:00:00.000Z',
    });
    const laptop = verifyHoloLlamaServerContract('laptop-windows', {
      generatedAt: '2026-07-05T00:00:00.000Z',
    });

    expect(jetson.ok).toBe(true);
    expect(jetson.visionRequested).toBe(false);
    expect(jetson.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'text-omits-mmproj-flag', ok: true }),
        expect.objectContaining({ id: 'text-omits-image-token-flags', ok: true }),
        expect.objectContaining({ id: 'registry-capabilities-array', ok: true }),
        expect.objectContaining({ id: 'registry-base-endpoint', ok: true }),
      ])
    );

    expect(laptop.ok).toBe(true);
    expect(laptop.visionRequested).toBe(true);
    expect(laptop.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'vision-mmproj-flag', ok: true }),
        expect.objectContaining({ id: 'vision-image-token-flags', ok: true }),
        expect.objectContaining({ id: 'registry-capabilities-array', ok: true }),
        expect.objectContaining({ id: 'registry-base-endpoint', ok: true }),
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
      'server-contract',
      'vision-preflight',
      'runtime-readiness',
      'mesh-readonly-bridge',
      'serve-health-probe',
    ]);
    expect(laptop?.visionPreflight.visionRequested).toBe(true);
    expect(laptop?.runtimeReadiness.runtimeRequired).toBe(false);
    expect(
      laptop?.meshReadOnlyBridge.endpoints.some((endpoint) => endpoint.id === 'team-board')
    ).toBe(true);
  });

  it('attaches live HoloLlama lifecycle proof to fleet lifecycle checks when supplied', async () => {
    const systemd = parseHoloLlamaSystemdShow(
      [
        'LoadState=loaded',
        'ActiveState=active',
        'SubState=running',
        'FragmentPath=/etc/systemd/system/jetson-orin-llamacpp.service',
        'ExecMainPID=1863',
      ].join('\n'),
      'jetson-orin-llamacpp.service'
    );
    const fetchImpl = async (url: string) => {
      const body = url.endsWith('/health')
        ? { status: 'ok' }
        : url.endsWith('/v1/models')
          ? {
              data: [
                {
                  id: 'qwen3-4b-instruct.gguf',
                  owned_by: 'llamacpp',
                  meta: { n_vocab: 151936, n_ctx: 4096, n_params: 4022468096 },
                },
              ],
            }
          : {
              choices: [{ message: { content: 'ready' } }],
            };
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify(body),
      };
    };
    const liveLifecycle = await probeHoloLlamaLiveLifecycle({
      profile: 'jetson-orin',
      generatedAt: '2026-07-05T00:00:00.000Z',
      endpoint: 'http://192.168.0.119:18080',
      systemdProbe: systemd,
      fetchImpl,
    });
    const lifecycle = buildHoloLlamaFleetLifecycleReport({
      profile: 'jetson-orin',
      teamId: 'team_test',
      generatedAt: '2026-07-05T00:00:00.000Z',
      requireLiveLifecycle: true,
      liveLifecycleReceipts: { 'jetson-orin': liveLifecycle },
    });

    expect(liveLifecycle.schema).toBe('holollama.lifecycle-doctor.v1');
    expect(liveLifecycle.ok).toBe(true);
    expect(liveLifecycle.runtimeState).toBe('ready');
    expect(liveLifecycle.checks.systemd.ok).toBe(true);
    expect(liveLifecycle.checks.footprint.skipped).toBe(true);
    expect(liveLifecycle.checks.model?.id).toBe('qwen3-4b-instruct.gguf');
    expect(liveLifecycle.checks.completion.completionOk).toBe(true);
    expect(liveLifecycle.receiptHash).toMatch(/^sha256:/);
    expect(lifecycle.ok).toBe(true);
    expect(lifecycle.profiles[0].stages.map((stage) => stage.id)).toContain('live-lifecycle');
    expect(lifecycle.profiles[0].liveLifecycle?.target.endpoint).toBe('http://192.168.0.119:18080');
  });

  it('detects Jetson unified-memory footprint drift from live llama-server evidence', () => {
    const footprint = assessHoloLlamaFootprint('jetson-orin', {
      source: 'ssh-procfs-journal',
      unit: 'jetson-orin-llamacpp.service',
      pid: 55883,
      command:
        '/usr/local/lib/ollama/llama-server -m /mnt/nvme/holo/models/qwen3-4b-instruct.gguf --host 192.168.0.119 --port 18080 -c 4096 -ngl 99 --fit on --parallel 1 --metrics --lora /mnt/nvme/holo/models/brittney-edge-v0-4.lora.gguf',
      noUsableGpuWarning: true,
      promptCacheLimitMiB: 8192,
      processRssMiB: 4083,
      processHighWaterMiB: 5113,
      processSwapMiB: 0,
      ramUsedMiB: 4086,
      ramTotalMiB: 7620,
      swapUsedMiB: 382,
      swapTotalMiB: 20194,
      modelFilesMiB: 2492,
    });

    expect(footprint.ok).toBe(false);
    expect(footprint.observed.executable).toBe('/usr/local/lib/ollama/llama-server');
    expect(footprint.observed.gpuLayers).toBe(99);
    expect(footprint.observed.noUsableGpuWarning).toBe(true);
    expect(footprint.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining('executable drift'),
        expect.stringContaining('Ollama-installed llama-server'),
        expect.stringContaining('model path drift'),
        expect.stringContaining('unexpected LoRA adapter'),
        expect.stringContaining('missing LoRA adapter'),
        expect.stringContaining('gpu layer drift'),
        expect.stringContaining('no usable GPU'),
        expect.stringContaining('prompt cache limit 8192 MiB is unsafe'),
      ])
    );
    expect(footprint.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('process RSS uses'),
        expect.stringContaining('swap is already in use'),
      ])
    );
  });

  it('accepts the conservative Jetson HoloLlama footprint profile', () => {
    const footprint = assessHoloLlamaFootprint('jetson-orin', {
      source: 'ssh-procfs-journal',
      unit: 'jetson-orin-llamacpp.service',
      pid: 42,
      command: `${patchedJetsonExecutable} -m /opt/holoscript/models/qwen3-4b-instruct.gguf --host 0.0.0.0 --port 18080 -c 4096 -ngl 32 --fit on --parallel 1 --cache-ram 0 --metrics --lora /opt/holoscript/models/brittney-edge-v0-4.lora.gguf`,
      noUsableGpuWarning: false,
      processRssMiB: 3000,
      processHighWaterMiB: 3400,
      processSwapMiB: 0,
      ramUsedMiB: 3500,
      ramTotalMiB: 7620,
      swapUsedMiB: 0,
      swapTotalMiB: 20194,
      modelFilesMiB: 2600,
    });

    expect(footprint.ok).toBe(true);
    expect(footprint.observed.cacheRamMiB).toBe(0);
    expect(footprint.blockers).toEqual([]);
  });

  it('blocks lifecycle promotion when live proof is required but missing', () => {
    const lifecycle = buildHoloLlamaFleetLifecycleReport({
      profile: 'jetson-orin',
      teamId: 'team_test',
      generatedAt: '2026-07-05T00:00:00.000Z',
      requireLiveLifecycle: true,
    });

    expect(lifecycle.ok).toBe(false);
    expect(lifecycle.profiles[0].stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'live-lifecycle',
          ok: false,
          summary: 'live HoloLlama lifecycle receipt missing.',
        }),
      ])
    );
  });

  it('requires launched-node runtime evidence before vision benchmark routing', () => {
    const receipt = assessHoloLlamaRuntimeReadiness('laptop-windows', {
      generatedAt: '2026-07-05T00:00:00.000Z',
      requireRuntimeReadiness: true,
      observation: {
        portOwner: {
          ok: true,
          detail: '127.0.0.1:18080 owned by expected build-holo llama-server pid 1234',
          pid: 1234,
          executable: patchedLaptopExecutable,
        },
        staleServerCleanup: {
          ok: true,
          detail: 'no stale text-only llama-server process remained after cleanup',
          stalePids: [],
          cleanedPids: [991],
        },
        openaiModels: {
          data: [
            {
              id: 'fara-7b',
              modalities: ['text', 'vision'],
              capabilities: { multimodal: true },
            },
          ],
        },
        props: {
          modalities: { vision: true },
        },
      },
    });

    expect(receipt.schema).toBe('holollama.llama-cpp-runtime-readiness.v1');
    expect(receipt.ok).toBe(true);
    expect(receipt.runtimeRequired).toBe(true);
    expect(receipt.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'port-ownership', required: true, ok: true }),
        expect.objectContaining({ id: 'stale-llama-server-cleanup', required: true, ok: true }),
        expect.objectContaining({
          id: 'openai-models-multimodal-capability',
          required: true,
          ok: true,
        }),
        expect.objectContaining({ id: 'props-modalities-vision', required: true, ok: true }),
      ])
    );
  });

  it('blocks missing launched-node evidence when runtime readiness is required', () => {
    const receipt = assessHoloLlamaRuntimeReadiness('laptop-windows', {
      generatedAt: '2026-07-05T00:00:00.000Z',
      requireRuntimeReadiness: true,
    });

    expect(receipt.ok).toBe(false);
    expect(receipt.blockers).toEqual([
      'runtime-observation: missing launched-node observation before benchmark/routing',
    ]);
  });

  it('blocks stale text-only runtime evidence for vision benchmark routing', () => {
    const lifecycle = buildHoloLlamaFleetLifecycleReport({
      profile: 'laptop-windows',
      teamId: 'team_test',
      generatedAt: '2026-07-05T00:00:00.000Z',
      requireRuntimeReadiness: true,
      runtimeObservations: {
        'laptop-windows': {
          portOwner: {
            ok: false,
            detail: '127.0.0.1:18080 is still owned by stale text-only llama-server pid 991',
            pid: 991,
          },
          staleServerCleanup: {
            ok: false,
            detail: 'stale llama-server pid 991 was detected but not cleaned',
            stalePids: [991],
            cleanedPids: [],
          },
          openaiModels: {
            data: [{ id: 'fara-7b', modalities: ['text'] }],
          },
          props: {
            modalities: { vision: false },
          },
        },
      },
    });

    expect(lifecycle.ok).toBe(false);
    const laptop = lifecycle.profiles[0];
    expect(laptop.stages.find((stage) => stage.id === 'runtime-readiness')?.ok).toBe(false);
    expect(laptop.runtimeReadiness.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining('port-ownership'),
        expect.stringContaining('stale-llama-server-cleanup'),
        expect.stringContaining('openai-models-multimodal-capability'),
        expect.stringContaining('props-modalities-vision'),
      ])
    );
  });

  it('installs the public .ai-ecosystem harness and writes safety plus lifecycle receipts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'holollama-harness-install-'));
    try {
      const targetDir = join(root, '.ai-ecosystem');
      const receipt = await installHoloLlamaPublicHarness({
        targetDir,
        profile: 'jetson-orin',
        teamId: 'team_test',
        generatedAt: '2026-07-05T00:00:00.000Z',
      });

      expect(receipt.schema).toBe('holollama.public-harness-install.v1');
      expect(receipt.ok).toBe(true);
      expect(receipt.files).toEqual(['.env.example', 'AGENTS.md', 'holollama.harness.json']);
      expect(receipt.safety.ok).toBe(true);
      expect(receipt.doctor.schema).toBe('holollama.doctor.v1');
      expect(receipt.lifecycle.schema).toBe('holollama.fleet-lifecycle.v1');
      expect(existsSync(join(targetDir, 'AGENTS.md'))).toBe(true);
      expect(existsSync(join(targetDir, 'receipts', 'holollama', 'doctor.json'))).toBe(true);
      expect(existsSync(join(targetDir, 'receipts', 'holollama', 'lifecycle.json'))).toBe(true);
      const installReceipt = JSON.parse(
        readFileSync(join(targetDir, 'receipts', 'holollama', 'install.json'), 'utf8')
      );
      expect(installReceipt.receiptHash).toMatch(/^sha256:/);
      expect(JSON.stringify(installReceipt)).not.toContain('C:\\Users\\josep');
      expect(JSON.stringify(installReceipt)).not.toContain('D:/GOLD');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('protects existing harness files unless force is explicit', async () => {
    const root = mkdtempSync(join(tmpdir(), 'holollama-harness-conflict-'));
    try {
      const targetDir = join(root, '.ai-ecosystem');
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(join(targetDir, 'AGENTS.md'), 'custom local harness\n');

      const receipt = await installHoloLlamaPublicHarness({
        targetDir,
        profile: 'jetson-orin',
        teamId: 'team_test',
        generatedAt: '2026-07-05T00:00:00.000Z',
      });

      expect(receipt.ok).toBe(false);
      expect(receipt.blockers).toEqual(
        expect.arrayContaining([expect.stringContaining('conflicting file')])
      );
      expect(readFileSync(join(targetDir, 'AGENTS.md'), 'utf8')).toBe('custom local harness\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('flags founder-private anchors and filled secrets in public harness files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'holollama-harness-safety-'));
    try {
      writeFileSync(join(root, 'AGENTS.md'), 'Do not copy C:\\Users\\josep\\.ai-ecosystem\n');
      writeFileSync(
        join(root, '.env.example'),
        'HOLOSCRIPT_API_KEY=holoscript_sk_liveabcdef123456789\n'
      );

      const safety = await verifyHoloLlamaHarnessSafety(root, {
        generatedAt: '2026-07-05T00:00:00.000Z',
      });

      expect(safety.ok).toBe(false);
      expect(safety.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'private-anchor', id: 'founder-windows-user-path' }),
          expect.objectContaining({ kind: 'filled-secret', id: 'secret-looking-token' }),
          expect.objectContaining({ kind: 'filled-secret', id: 'filled-env-holoscript_api_key' }),
        ])
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
