import { readFile } from 'node:fs/promises';
import {
  assertHoloLlamaBundleConsumable,
  buildHoloLlamaFleetLifecycleReport,
  buildHoloMeshReadOnlyBridge,
  buildLlamaServeComposition,
  compileHoloLlamaBundle,
  doctorHoloLlamaProfiles,
  listHoloLlamaBrains,
  listHoloLlamaProfiles,
  preflightHoloLlamaVision,
  probeHoloLlamaLiveLifecycle,
  selectHoloLlamaBrain,
  summarizeHoloLlamaBundle,
  verifyHoloLlamaServerContract,
  writeHoloLlamaBundleFiles,
  type HoloLlamaProfile,
  type HoloLlamaServeSpec,
} from './index.js';

type FlagMap = Map<string, string | true>;

export async function runCli(args = process.argv.slice(2)): Promise<void> {
  const command = args[0] && !args[0].startsWith('-') ? args[0] : 'plan';
  const rest =
    command === 'plan' ? (args[0]?.startsWith('-') ? args : args.slice(1)) : args.slice(1);
  const flags = parseFlags(rest);

  if (command === 'help' || flags.has('help')) {
    printHelp();
    return;
  }

  if (command === 'doctor') {
    const report = doctorHoloLlamaProfiles({ profile: readOptionalProfile(flags) });
    if (flags.has('json')) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatDoctorReport(report));
    }
    if (!report.ok) process.exitCode = 1;
    return;
  }

  if (command === 'mesh') {
    const receipt = buildHoloMeshReadOnlyBridge({
      profile: readOptionalProfile(flags),
      teamId: readString(flags, 'team-id'),
      orchestratorUrl: readString(flags, 'orchestrator-url'),
      apiKeyEnv: readString(flags, 'api-key-env'),
    });
    if (flags.has('json')) {
      process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
      return;
    }
    process.stdout.write(formatMeshBridge(receipt));
    return;
  }

  if (command === 'preflight') {
    const receipt = preflightHoloLlamaVision(readProfile(flags), {
      checkFilesystem: flags.has('check-filesystem'),
    });
    if (flags.has('json')) {
      process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
      return;
    }
    process.stdout.write(formatVisionPreflight(receipt));
    if (!receipt.ok) process.exitCode = 1;
    return;
  }

  if (command === 'contract') {
    const receipt = verifyHoloLlamaServerContract(readProfile(flags));
    if (flags.has('json')) {
      process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
      return;
    }
    process.stdout.write(formatServerContract(receipt));
    if (!receipt.ok) process.exitCode = 1;
    return;
  }

  if (command === 'lifecycle') {
    const live = flags.has('live');
    const profile = live ? readProfile(flags) : readOptionalProfile(flags);
    const liveReceipt = live
      ? await probeHoloLlamaLiveLifecycle({
          profile,
          endpoint: readString(flags, 'endpoint') ?? process.env.HOLOLLAMA_ENDPOINT,
          sshHost: readString(flags, 'host') ?? process.env.JETSON_HOST,
          sshKey: readString(flags, 'key') ?? process.env.JETSON_KEY,
          systemdUnit: readString(flags, 'unit'),
          modelsPath: readString(flags, 'models-path'),
          timeoutMs: readNumber(flags, 'timeout-ms'),
          prompt: readString(flags, 'prompt'),
          maxTokens: readNumber(flags, 'max-tokens'),
          skipSystemd: flags.has('no-systemd'),
          requireSystemd: flags.has('require-systemd'),
        })
      : undefined;
    const receipt = buildHoloLlamaFleetLifecycleReport({
      profile,
      teamId: readString(flags, 'team-id'),
      orchestratorUrl: readString(flags, 'orchestrator-url'),
      apiKeyEnv: readString(flags, 'api-key-env'),
      checkFilesystem: flags.has('check-filesystem'),
      requireRuntimeReadiness: flags.has('require-runtime-readiness'),
      requireLiveLifecycle: flags.has('require-live-lifecycle') || live,
      liveLifecycleReceipts: liveReceipt ? { [liveReceipt.profile]: liveReceipt } : undefined,
    });
    if (flags.has('json')) {
      process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
      return;
    }
    process.stdout.write(formatLifecycleReport(receipt));
    if (!receipt.ok) process.exitCode = 1;
    return;
  }

  if (command === 'profiles') {
    const profiles = listHoloLlamaProfiles().map(({ id, label, consumer, description, spec }) => ({
      id,
      label,
      consumer,
      description,
      model: spec.model,
      platform: spec.platform,
      registerAs: spec.registerAs,
    }));
    process.stdout.write(`${JSON.stringify(profiles, null, 2)}\n`);
    return;
  }

  if (command === 'brains') {
    const brains = listHoloLlamaBrains().map((brain) => ({
      id: brain.id,
      displayName: brain.displayName,
      packageName: brain.packageName,
      version: brain.version,
      brainPath: brain.brainPath,
      compatibilityUnit: 'skill',
      consumerProfileIds: brain.consumerProfileIds,
    }));
    process.stdout.write(`${JSON.stringify(brains, null, 2)}\n`);
    return;
  }

  if (command === 'brain') {
    const task = readString(flags, 'task');
    if (!task) throw new Error('holollama brain requires --task <text>');
    const selection = selectHoloLlamaBrain({
      task,
      brain: readString(flags, 'brain'),
      skill: readString(flags, 'skill'),
      profileId: readString(flags, 'profile-id'),
      selectedDevice: readString(flags, 'device'),
    });
    if (flags.has('json')) {
      process.stdout.write(`${JSON.stringify(selection, null, 2)}\n`);
      return;
    }
    process.stdout.write(
      [
        `HoloLlama Brain: ${selection.selectedBrain.displayName}`,
        `  id:      ${selection.selectedBrain.id}`,
        `  package: ${selection.selectedBrain.packageName}@${selection.selectedBrain.version}`,
        `  profile: ${selection.selectedConsumerProfile.id}`,
        `  reason:  ${selection.score.reason}`,
        '',
      ].join('\n')
    );
    return;
  }

  if (command !== 'plan') {
    throw new Error(`Unknown holollama command: ${command}`);
  }

  const profile = readProfile(flags);
  const overrides = readOverrides(flags);
  const codePath = readString(flags, 'code');
  const code = codePath
    ? await readFile(codePath, 'utf8')
    : buildLlamaServeComposition(profile, overrides);
  const bundle = compileHoloLlamaBundle({ code });
  assertHoloLlamaBundleConsumable(bundle);

  const outDir = readString(flags, 'out');
  if (outDir) {
    const written = await writeHoloLlamaBundleFiles(bundle, outDir);
    process.stderr.write(`[holollama] wrote ${written.length} file(s) to ${outDir}\n`);
  }

  if (flags.has('json')) {
    process.stdout.write(`${JSON.stringify(bundle, null, 2)}\n`);
    return;
  }

  const summary = summarizeHoloLlamaBundle(bundle);
  process.stdout.write(
    [
      `HoloLlama plan: ${summary.name}`,
      `  command: ${summary.command}`,
      `  health:  ${summary.healthUrl}`,
      `  handle:  ${summary.registryHandle}`,
      `  files:   ${summary.files.length}`,
      '',
    ].join('\n')
  );
}

function parseFlags(args: string[]): FlagMap {
  const flags: FlagMap = new Map();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const name = arg.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith('--')) {
      flags.set(name, true);
    } else {
      flags.set(name, next);
      i += 1;
    }
  }
  return flags;
}

function readProfile(flags: FlagMap): HoloLlamaProfile {
  const value = readString(flags, 'profile') ?? 'jetson-orin';
  return assertProfile(value);
}

function readOptionalProfile(flags: FlagMap): HoloLlamaProfile | undefined {
  const value = readString(flags, 'profile');
  return value ? assertProfile(value) : undefined;
}

function assertProfile(value: string): HoloLlamaProfile {
  if (value === 'jetson-orin' || value === 'laptop-windows' || value === 'vast-linux-gpu') {
    return value;
  }
  throw new Error(`Unknown --profile ${value}`);
}

function readOverrides(flags: FlagMap): Partial<HoloLlamaServeSpec> {
  return {
    model: readString(flags, 'model'),
    modelPath: readString(flags, 'model-path'),
    mmprojPath: readString(flags, 'mmproj-path'),
    host: readString(flags, 'host'),
    port: readNumber(flags, 'port'),
    contextLength: readNumber(flags, 'ctx') ?? readNumber(flags, 'context-length'),
    gpuLayers: readNumber(flags, 'ngl') ?? readNumber(flags, 'gpu-layers'),
    parallel: readNumber(flags, 'parallel'),
    registerAs: readString(flags, 'register-as'),
    node: readString(flags, 'node'),
    platform: readPlatform(flags),
    executable: readString(flags, 'executable'),
    serviceUser: readString(flags, 'service-user'),
    grammar: readString(flags, 'grammar'),
    vision: readBoolean(flags, 'vision'),
    metrics: flags.has('no-metrics') ? false : undefined,
  };
}

function readString(flags: FlagMap, name: string): string | undefined {
  const value = flags.get(name);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(flags: FlagMap, name: string): number | undefined {
  const raw = readString(flags, name);
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number`);
  return value;
}

function readBoolean(flags: FlagMap, name: string): boolean | undefined {
  const raw = flags.get(name);
  if (raw === undefined) return undefined;
  if (raw === true) return true;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`--${name} must be true or false`);
}

function readPlatform(flags: FlagMap): 'windows' | 'linux' | undefined {
  const raw = readString(flags, 'platform');
  if (!raw) return undefined;
  if (raw === 'windows' || raw === 'linux') return raw;
  throw new Error('--platform must be windows or linux');
}

function formatDoctorReport(report: ReturnType<typeof doctorHoloLlamaProfiles>): string {
  const lines = [`HoloLlama doctor: ${report.ok ? 'PASS' : 'FAIL'}`];
  for (const profile of report.profiles) {
    lines.push(
      `  ${profile.profile}: ${profile.ok ? 'ok' : 'blocked'} (${profile.consumer})`,
      `    handle: ${profile.registryHandle}`,
      `    health: ${profile.healthUrl || 'n/a'}`,
      `    files:  ${profile.files.length}`
    );
    for (const warning of profile.warnings) lines.push(`    warning: ${warning}`);
    for (const blocker of profile.blockers) lines.push(`    blocker: ${blocker}`);
  }
  lines.push('');
  return lines.join('\n');
}

function formatMeshBridge(report: ReturnType<typeof buildHoloMeshReadOnlyBridge>): string {
  const lines = [
    `HoloLlama mesh bridge: ${report.ok ? 'PASS' : 'FAIL'} (${report.mode})`,
    `  profile: ${report.profile}`,
    `  handle:  ${report.registryHandle}`,
    `  team:    ${report.mesh.teamId}`,
    `  base:    ${report.mesh.orchestratorUrl}`,
    `  reads:   ${report.endpoints.length}`,
  ];
  for (const warning of report.warnings) lines.push(`  warning: ${warning}`);
  for (const blocker of report.blockers) lines.push(`  blocker: ${blocker}`);
  lines.push('');
  return lines.join('\n');
}

function formatVisionPreflight(report: ReturnType<typeof preflightHoloLlamaVision>): string {
  const lines = [
    `HoloLlama vision preflight: ${report.ok ? 'PASS' : 'FAIL'}`,
    `  profile: ${report.profile}`,
    `  handle:  ${report.registryHandle}`,
    `  vision:  ${report.visionRequested ? 'on' : 'off'}`,
  ];
  for (const item of report.checks) {
    if (item.required || !item.ok) lines.push(`  ${item.ok ? 'ok' : 'block'}: ${item.id}`);
  }
  for (const warning of report.warnings) lines.push(`  warning: ${warning}`);
  for (const blocker of report.blockers) lines.push(`  blocker: ${blocker}`);
  lines.push('');
  return lines.join('\n');
}

function formatServerContract(report: ReturnType<typeof verifyHoloLlamaServerContract>): string {
  const lines = [
    `HoloLlama server contract: ${report.ok ? 'PASS' : 'FAIL'}`,
    `  profile: ${report.profile}`,
    `  handle:  ${report.registryHandle}`,
    `  vision:  ${report.visionRequested ? 'on' : 'off'}`,
  ];
  for (const item of report.checks) {
    if (item.required || !item.ok) lines.push(`  ${item.ok ? 'ok' : 'block'}: ${item.id}`);
  }
  for (const warning of report.warnings) lines.push(`  warning: ${warning}`);
  for (const blocker of report.blockers) lines.push(`  blocker: ${blocker}`);
  lines.push('');
  return lines.join('\n');
}

function formatLifecycleReport(
  report: ReturnType<typeof buildHoloLlamaFleetLifecycleReport>
): string {
  const lines = [`HoloLlama lifecycle: ${report.ok ? 'PASS' : 'FAIL'}`];
  for (const profile of report.profiles) {
    lines.push(`  ${profile.profile}: ${profile.ok ? 'ok' : 'blocked'} (${profile.consumer})`);
    for (const stage of profile.stages) {
      lines.push(`    ${stage.ok ? 'ok' : 'block'} ${stage.id}: ${stage.summary}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function printHelp(): void {
  process.stdout.write(`HoloLlama native serving utilities

Usage:
  holollama doctor [--profile <id>] [--json]
  holollama mesh [--profile <id>] [--team-id <team>] [--json]
  holollama preflight [--profile <id>] [--check-filesystem] [--json]
  holollama contract [--profile <id>] [--json]
  holollama lifecycle [--profile <id>] [--live] [--team-id <team>] [--check-filesystem] [--require-runtime-readiness] [--json]
  holollama profiles
  holollama brains
  holollama brain --task <text> [--brain <id>|--skill <id>] [--json]
  holollama plan [options]

Options:
  --task <text>
  --brain <id|auto>
  --skill <compatibility-id>
  --profile-id <jetson-edge|laptop-owned-metal|vast-sovereign-overflow>
  --device <device-handle>
  --profile <jetson-orin|laptop-windows|vast-linux-gpu>
  --team-id <holomesh-team-id>
  --orchestrator-url <url>
  --api-key-env <env-var>
  --live
  --endpoint <url>
  --host <ssh-host>
  --key <ssh-key>
  --unit <systemd-unit>
  --models-path <path>
  --timeout-ms <number>
  --prompt <text>
  --max-tokens <number>
  --no-systemd
  --require-systemd
  --require-live-lifecycle
  --check-filesystem
  --require-runtime-readiness
  --code <file.holo>
  --out <dir>
  --json
  --model <name>
  --model-path <path>
  --mmproj-path <path>
  --host <host>
  --port <number>
  --ctx <tokens>
  --ngl <layers>
  --parallel <number>
  --register-as <handle>
  --node <node-id>
  --platform <windows|linux>
  --executable <path>
  --service-user <user>
  --grammar <preset-or-inline-grammar>
  --vision <true|false>
  --no-metrics
`);
}
