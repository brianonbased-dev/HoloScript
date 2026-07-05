/**
 * HoloScript -> llama.cpp server compiler.
 *
 * M1 is intentionally a dry authoring target: it emits the exact launch command,
 * health probe, service definitions, and sovereign-devices registry entry needed
 * to run llama-server as a local OpenAI-compatible node. It never starts a
 * process during compilation.
 */

import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloTemplate,
  HoloValue,
} from '../parser/HoloCompositionTypes';

export interface LlamaServerCompilerOptions {
  name?: string;
  model?: string;
  modelPath?: string;
  mmprojPath?: string;
  host?: string;
  port?: number;
  contextLength?: number;
  gpuLayers?: number;
  fit?: 'on' | 'off';
  imageMinTokens?: number;
  imageMaxTokens?: number;
  parallel?: number;
  metrics?: boolean;
  grammarPath?: string;
  grammar?: string;
  loraPath?: string;
  loraScale?: number;
  executable?: string;
  cudaPath?: string;
  llamaBinDir?: string;
  workingDirectory?: string;
  platform?: 'windows' | 'linux';
  serviceUser?: string;
  node?: string;
  registerAs?: string;
  dryRun?: boolean;
}

export interface LlamaServerBundleFile {
  path: string;
  content: string;
  executable?: boolean;
}

export interface LlamaServerBundle {
  name: string;
  target: 'llama-server';
  dryRun: true;
  launch: {
    executable: string;
    args: string[];
    command: string;
    powershell: string;
  };
  healthProbe: {
    url: string;
    openaiModelsUrl: string;
    powershell: string;
  };
  service: {
    systemdUnit: string;
    windowsS4UTask: string;
  };
  registryEntry: {
    handle: string;
    node: string;
    capability: 'local-llm';
    backend: 'llama.cpp';
    serverKind: 'llama-server';
    model: string;
    endpoint: string;
    healthUrl: string;
    launchCommand: string;
    capabilities: {
      vision: boolean;
      grammarConstrained: boolean;
      loraHotSwap: boolean;
    };
  };
  files: LlamaServerBundleFile[];
  config: Required<
    Pick<
      LlamaServerCompilerOptions,
      | 'name'
      | 'model'
      | 'modelPath'
      | 'host'
      | 'port'
      | 'contextLength'
      | 'gpuLayers'
      | 'fit'
      | 'imageMinTokens'
      | 'imageMaxTokens'
      | 'parallel'
      | 'metrics'
      | 'executable'
      | 'platform'
      | 'serviceUser'
      | 'node'
      | 'registerAs'
      | 'dryRun'
    >
  > & {
    mmprojPath?: string;
    grammarPath?: string;
    grammar?: string;
    loraPath?: string;
    loraScale?: number;
    cudaPath?: string;
    llamaBinDir?: string;
    workingDirectory?: string;
  };
  warnings: string[];
}

type RawConfig = Record<string, HoloValue> & Record<string, unknown>;

interface ResolvedLlamaConfig {
  name: string;
  model: string;
  modelPath: string;
  mmprojPath?: string;
  host: string;
  port: number;
  contextLength: number;
  gpuLayers: number;
  fit: 'on' | 'off';
  imageMinTokens: number;
  imageMaxTokens: number;
  parallel: number;
  metrics: boolean;
  grammarPath?: string;
  grammar?: string;
  loraPath?: string;
  loraScale?: number;
  executable: string;
  cudaPath?: string;
  llamaBinDir?: string;
  workingDirectory?: string;
  platform: 'windows' | 'linux';
  serviceUser: string;
  node: string;
  registerAs: string;
  dryRun: true;
}

const DEFAULTS = {
  model: 'fara-7b',
  modelPath: '.scratch\\llama-cpp-models\\fara-7b-q4-k-m.gguf',
  mmprojPath: '.scratch\\llama-cpp-models\\fara-7b-mmproj.gguf',
  host: '127.0.0.1',
  port: 18080,
  contextLength: 4096,
  gpuLayers: 12,
  fit: 'on' as const,
  imageMinTokens: 1024,
  imageMaxTokens: 1536,
  parallel: 1,
  metrics: true,
  executable: 'llama-server.exe',
  platform: 'windows' as const,
  serviceUser: 'holoscript',
  node: 'laptop-rtx3060',
};

export class LlamaServerCompiler extends CompilerBase {
  protected readonly compilerName = 'LlamaServerCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.EDGE;
  }

  constructor(private readonly opts: LlamaServerCompilerOptions = {}) {
    super();
  }

  compile(composition: HoloComposition, agentToken: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);

    const { traitConfig, foundTrait } = this.findLlamaServeConfig(composition);
    const cfg = this.resolveConfig(composition, traitConfig);
    const args = this.buildArgs(cfg);
    const command = [cfg.executable, ...args].join(' ');
    const powershell = this.genPowerShellLaunch(cfg, command);
    const healthProbe = this.genHealthProbe(cfg);
    const systemdUnit = this.genSystemdUnit(cfg, args);
    const windowsS4UTask = this.genWindowsS4UTask(cfg);
    const registryEntry = this.buildRegistryEntry(cfg, command);
    const files = this.buildFiles(
      cfg,
      powershell,
      healthProbe,
      systemdUnit,
      windowsS4UTask,
      registryEntry
    );
    const warnings = foundTrait
      ? []
      : ['No @llama_serve trait found; used compiler options/defaults.'];

    const bundle: LlamaServerBundle = {
      name: cfg.name,
      target: 'llama-server',
      dryRun: true,
      launch: {
        executable: cfg.executable,
        args,
        command,
        powershell,
      },
      healthProbe: {
        url: this.healthUrl(cfg),
        openaiModelsUrl: `${this.baseUrl(cfg)}/v1/models`,
        powershell: healthProbe,
      },
      service: {
        systemdUnit,
        windowsS4UTask,
      },
      registryEntry,
      files,
      config: cfg,
      warnings,
    };

    return JSON.stringify(bundle, null, 2);
  }

  override compileToFiles(composition: HoloComposition, agentToken = ''): Record<string, string> {
    const bundle = JSON.parse(this.compile(composition, agentToken)) as LlamaServerBundle;
    return Object.fromEntries(bundle.files.map((file) => [file.path, file.content]));
  }

  protected override defaultOutputFileName(): string {
    return 'llama-server-bundle.json';
  }

  private findLlamaServeConfig(composition: HoloComposition): {
    traitConfig: RawConfig;
    foundTrait: boolean;
  } {
    const traits: HoloObjectTrait[] = [];
    if (composition.traits) traits.push(...composition.traits);
    for (const obj of composition.objects ?? []) this.collectObjectTraits(obj, traits);
    for (const template of composition.templates ?? [])
      this.collectTemplateTraits(template, traits);

    const trait = traits.find((candidate) => this.normalizeTrait(candidate.name) === 'llamaserve');
    return {
      traitConfig: (trait?.config ?? trait?.params ?? {}) as RawConfig,
      foundTrait: Boolean(trait),
    };
  }

  private collectObjectTraits(object: HoloObjectDecl, out: HoloObjectTrait[]): void {
    if (object.traits) out.push(...object.traits);
    for (const child of object.children ?? []) this.collectObjectTraits(child, out);
  }

  private collectTemplateTraits(template: HoloTemplate, out: HoloObjectTrait[]): void {
    for (const prop of template.properties ?? []) {
      const maybeTraits = (prop as { traits?: HoloObjectTrait[] }).traits;
      if (maybeTraits) out.push(...maybeTraits);
    }
  }

  private normalizeTrait(name: string): string {
    return name.replace(/^@/, '').replace(/[-_]/g, '').toLowerCase();
  }

  private resolveConfig(composition: HoloComposition, raw: RawConfig): ResolvedLlamaConfig {
    const name =
      this.opts.name ?? this.stringValue(raw, 'name') ?? composition.name ?? 'holollama-server';
    const model = this.opts.model ?? this.stringValue(raw, 'model') ?? DEFAULTS.model;
    const registerAs =
      this.opts.registerAs ??
      this.stringValue(raw, 'registerAs', 'register_as', 'handle') ??
      `${this.slug(name)}-${model.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
    const node = this.opts.node ?? this.stringValue(raw, 'node') ?? DEFAULTS.node;

    return {
      name,
      model,
      modelPath:
        this.opts.modelPath ??
        this.stringValue(raw, 'modelPath', 'model_path', 'gguf') ??
        DEFAULTS.modelPath,
      mmprojPath:
        this.opts.mmprojPath ??
        this.stringValue(raw, 'mmprojPath', 'mmproj_path', 'mmproj') ??
        DEFAULTS.mmprojPath,
      host: this.opts.host ?? this.stringValue(raw, 'host') ?? DEFAULTS.host,
      port: this.opts.port ?? this.numberValue(raw, DEFAULTS.port, 'port'),
      contextLength:
        this.opts.contextLength ??
        this.numberValue(
          raw,
          DEFAULTS.contextLength,
          'contextLength',
          'context_length',
          'ctx',
          'c'
        ),
      gpuLayers:
        this.opts.gpuLayers ??
        this.numberValue(raw, DEFAULTS.gpuLayers, 'gpuLayers', 'gpu_layers', 'ngl'),
      fit: this.opts.fit ?? this.fitValue(raw, 'fit') ?? DEFAULTS.fit,
      imageMinTokens:
        this.opts.imageMinTokens ??
        this.numberValue(raw, DEFAULTS.imageMinTokens, 'imageMinTokens', 'image_min_tokens'),
      imageMaxTokens:
        this.opts.imageMaxTokens ??
        this.numberValue(raw, DEFAULTS.imageMaxTokens, 'imageMaxTokens', 'image_max_tokens'),
      parallel: this.opts.parallel ?? this.numberValue(raw, DEFAULTS.parallel, 'parallel'),
      metrics: this.opts.metrics ?? this.booleanValue(raw, DEFAULTS.metrics, 'metrics'),
      grammarPath: this.opts.grammarPath ?? this.stringValue(raw, 'grammarPath', 'grammar_path'),
      grammar: this.opts.grammar ?? this.stringValue(raw, 'grammar'),
      loraPath: this.opts.loraPath ?? this.stringValue(raw, 'loraPath', 'lora_path', 'lora'),
      loraScale:
        this.opts.loraScale ??
        this.optionalNumberValue(raw, 'loraScale', 'lora_scale', 'lora_scaled'),
      executable:
        this.opts.executable ?? this.stringValue(raw, 'executable') ?? DEFAULTS.executable,
      cudaPath: this.opts.cudaPath ?? this.stringValue(raw, 'cudaPath', 'cuda_path'),
      llamaBinDir: this.opts.llamaBinDir ?? this.stringValue(raw, 'llamaBinDir', 'llama_bin_dir'),
      workingDirectory:
        this.opts.workingDirectory ??
        this.stringValue(raw, 'workingDirectory', 'working_directory'),
      platform: this.opts.platform ?? this.platformValue(raw, 'platform') ?? DEFAULTS.platform,
      serviceUser:
        this.opts.serviceUser ??
        this.stringValue(raw, 'serviceUser', 'service_user') ??
        DEFAULTS.serviceUser,
      node,
      registerAs,
      dryRun: true,
    };
  }

  private buildArgs(cfg: ResolvedLlamaConfig): string[] {
    const args = ['-m', this.shellArg(cfg.modelPath)];

    if (cfg.mmprojPath) args.push('--mmproj', this.shellArg(cfg.mmprojPath));

    args.push(
      '--host',
      cfg.host,
      '--port',
      String(cfg.port),
      '-c',
      String(cfg.contextLength),
      '-ngl',
      String(cfg.gpuLayers),
      '--fit',
      cfg.fit,
      '--image-min-tokens',
      String(cfg.imageMinTokens),
      '--image-max-tokens',
      String(cfg.imageMaxTokens),
      '--parallel',
      String(cfg.parallel)
    );

    if (cfg.metrics) args.push('--metrics');
    if (cfg.grammarPath) args.push('--grammar-file', this.shellArg(cfg.grammarPath));
    if (cfg.grammar) args.push('--grammar', this.shellArg(cfg.grammar));
    if (cfg.loraPath) args.push('--lora', this.shellArg(cfg.loraPath));
    if (cfg.loraPath && cfg.loraScale !== undefined)
      args.push('--lora-scaled', String(cfg.loraScale));

    return args;
  }

  private buildFiles(
    cfg: ResolvedLlamaConfig,
    powershell: string,
    healthProbe: string,
    systemdUnit: string,
    windowsS4UTask: string,
    registryEntry: LlamaServerBundle['registryEntry']
  ): LlamaServerBundleFile[] {
    const manifest = {
      name: cfg.name,
      target: 'llama-server',
      dryRun: true,
      generatedBy: 'LlamaServerCompiler',
      command: [cfg.executable, ...this.buildArgs(cfg)].join(' '),
      registryHandle: registryEntry.handle,
    };

    return [
      { path: 'launch-llama-server.ps1', content: powershell, executable: true },
      { path: 'health-probe.ps1', content: healthProbe, executable: true },
      { path: `${this.slug(cfg.registerAs)}.service`, content: systemdUnit },
      { path: 'install-s4u-task.ps1', content: windowsS4UTask, executable: true },
      {
        path: `sovereign-devices/${cfg.registerAs}.json`,
        content: JSON.stringify(registryEntry, null, 2),
      },
      { path: 'llama-server-manifest.json', content: JSON.stringify(manifest, null, 2) },
    ];
  }

  private buildRegistryEntry(
    cfg: ResolvedLlamaConfig,
    command: string
  ): LlamaServerBundle['registryEntry'] {
    return {
      handle: cfg.registerAs,
      node: cfg.node,
      capability: 'local-llm',
      backend: 'llama.cpp',
      serverKind: 'llama-server',
      model: cfg.model,
      endpoint: `${this.baseUrl(cfg)}/v1`,
      healthUrl: this.healthUrl(cfg),
      launchCommand: command,
      capabilities: {
        vision: Boolean(cfg.mmprojPath),
        grammarConstrained: Boolean(cfg.grammarPath || cfg.grammar),
        loraHotSwap: Boolean(cfg.loraPath),
      },
    };
  }

  private genPowerShellLaunch(cfg: ResolvedLlamaConfig, command: string): string {
    const pathEntries = [cfg.cudaPath, cfg.llamaBinDir].filter(Boolean) as string[];
    const pathPrelude =
      pathEntries.length > 0
        ? `$env:PATH = '${this.psSingle(pathEntries.join(';') + ';')}' + $env:PATH\n`
        : '';
    const cwd = cfg.workingDirectory
      ? `Set-Location -LiteralPath '${this.psSingle(cfg.workingDirectory)}'\n`
      : '';
    return [
      '# Generated by HoloScript LlamaServerCompiler. Dry artifact; run explicitly.',
      "$ErrorActionPreference = 'Stop'",
      `${pathPrelude}${cwd}${command}`,
      '',
    ].join('\n');
  }

  private genHealthProbe(cfg: ResolvedLlamaConfig): string {
    return [
      '# Generated by HoloScript LlamaServerCompiler.',
      "$ErrorActionPreference = 'Stop'",
      `$health = Invoke-RestMethod -Method Get -Uri '${this.healthUrl(cfg)}'`,
      `$models = Invoke-RestMethod -Method Get -Uri '${this.baseUrl(cfg)}/v1/models'`,
      '[pscustomobject]@{ health = $health; models = $models } | ConvertTo-Json -Depth 8',
      '',
    ].join('\n');
  }

  private genSystemdUnit(cfg: ResolvedLlamaConfig, args: string[]): string {
    const serviceName = this.slug(cfg.registerAs);
    const workingDirectory = cfg.workingDirectory ?? '/opt/holoscript/llama-server';
    const linuxPathEntries = [cfg.cudaPath, cfg.llamaBinDir]
      .filter(Boolean)
      .map((entry) => String(entry).replace(/\\/g, '/'));
    const pathLine =
      linuxPathEntries.length > 0
        ? `Environment=PATH=${linuxPathEntries.join(':')}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\n`
        : '';
    return `[Unit]
Description=HoloLlama llama.cpp server - ${cfg.name}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${cfg.serviceUser}
WorkingDirectory=${workingDirectory}
${pathLine}ExecStart=${cfg.executable} ${args.join(' ')}
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${serviceName}

[Install]
WantedBy=multi-user.target
`;
  }

  private genWindowsS4UTask(cfg: ResolvedLlamaConfig): string {
    const taskName = `HoloLlama-${this.slug(cfg.registerAs)}`;
    const scriptPath = cfg.workingDirectory
      ? `${cfg.workingDirectory}\\launch-llama-server.ps1`
      : '.\\launch-llama-server.ps1';
    return [
      '# Generated by HoloScript LlamaServerCompiler.',
      "$ErrorActionPreference = 'Stop'",
      `$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"'`,
      '$trigger = New-ScheduledTaskTrigger -AtStartup',
      `$principal = New-ScheduledTaskPrincipal -UserId '${this.psSingle(cfg.serviceUser)}' -LogonType S4U -RunLevel Highest`,
      `Register-ScheduledTask -TaskName '${this.psSingle(taskName)}' -Action $action -Trigger $trigger -Principal $principal -Force`,
      '',
    ].join('\n');
  }

  private baseUrl(cfg: ResolvedLlamaConfig): string {
    return `http://${cfg.host}:${cfg.port}`;
  }

  private healthUrl(cfg: ResolvedLlamaConfig): string {
    return `${this.baseUrl(cfg)}/health`;
  }

  private slug(value: string): string {
    return (
      value
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'llama-server'
    );
  }

  private shellArg(value: string): string {
    if (!/[\s"`']/.test(value)) return value;
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  private psSingle(value: string): string {
    return value.replace(/'/g, "''");
  }

  private stringValue(raw: RawConfig, ...keys: string[]): string | undefined {
    for (const key of keys) {
      const value = raw[key];
      if (typeof value === 'string' && value.length > 0) return value;
    }
    return undefined;
  }

  private numberValue(raw: RawConfig, fallback: number, ...keys: string[]): number {
    return this.optionalNumberValue(raw, ...keys) ?? fallback;
  }

  private optionalNumberValue(raw: RawConfig, ...keys: string[]): number | undefined {
    for (const key of keys) {
      const value = raw[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
        return Number(value);
      }
    }
    return undefined;
  }

  private booleanValue(raw: RawConfig, fallback: boolean, ...keys: string[]): boolean {
    for (const key of keys) {
      const value = raw[key];
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
      }
    }
    return fallback;
  }

  private fitValue(raw: RawConfig, ...keys: string[]): 'on' | 'off' | undefined {
    const value = this.stringValue(raw, ...keys);
    return value === 'on' || value === 'off' ? value : undefined;
  }

  private platformValue(raw: RawConfig, ...keys: string[]): 'windows' | 'linux' | undefined {
    const value = this.stringValue(raw, ...keys);
    return value === 'windows' || value === 'linux' ? value : undefined;
  }
}
