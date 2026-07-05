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
import { generateHoloScriptGbnf, isHoloScriptGrammarPreset } from './holoscript-gbnf';
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
  /**
   * One or more LoRA adapters to load, as plain paths or `{ path, scale }`.
   * Merged with the single `loraPath`/`loraScale` (back-compat) and with any
   * `lora`/`lora_path` authored on the @llama_serve trait (string or array).
   */
  loras?: Array<string | { path: string; scale?: number }>;
  /**
   * Emit `--lora-init-without-apply` so adapters are loaded cold and applied
   * later via `POST /lora-adapters` — the hot-swap path for serving HoloTune
   * adapters live without restarting the server.
   */
  loraInitWithoutApply?: boolean;
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

/** A single resolved LoRA adapter: a file path with an optional per-adapter scale. */
export interface LlamaServerLoraAdapter {
  path: string;
  scale?: number;
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
    grammarPreset?: string;
    loras: LlamaServerLoraAdapter[];
    loraInitWithoutApply: boolean;
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
  grammarPreset?: string;
  loras: LlamaServerLoraAdapter[];
  loraInitWithoutApply: boolean;
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
  platform: 'windows' as const,
  serviceUser: 'holoscript',
  node: 'laptop-rtx3060',
};

// The HOLO-patched llama.cpp build (LLM_ARCH_HOLO + LLAMA_VOCAB_PRE_TYPE_HOLO). Windows points at the
// verified reproducible build output (`cmake -B build-holo ... --config Release`); MSVC multi-config
// nests binaries under bin/Release. This is a real, on-disk binary (superset: loads arch=holo AND every
// stock arch), NOT the aspirational `build/bin` path that never existed. Linux is the Jetson's HOLO
// build (-DGGML_CUDA=ON) produced by HOLO #6; verify the clone path there before relying on it.
const DEFAULT_HOLO_PATCHED_EXECUTABLES = {
  windows: 'C:\\Users\\josep\\Documents\\GitHub\\llama.cpp\\build-holo\\bin\\Release\\llama-server.exe',
  linux: '/opt/holoscript/llama.cpp/build-holo/bin/llama-server',
} as const;

export class LlamaServerCompiler extends CompilerBase {
  protected readonly compilerName = 'LlamaServerCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.LLAMA_SERVER;
  }

  constructor(private readonly opts: LlamaServerCompilerOptions = {}) {
    super();
  }

  compile(composition: HoloComposition, agentToken: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);

    const { traitConfig, foundTrait } = this.findLlamaServeConfig(composition);
    const cfg = this.resolveConfig(composition, traitConfig);
    // `grammar: "holoscript"` resolves to a generated GBNF written into the bundle;
    // this mutates cfg.grammarPath so buildArgv emits --grammar-file for it.
    const grammarFile = this.resolveGrammarPreset(cfg);
    const args = this.buildArgv(cfg);
    const command = this.cmdLine(cfg.executable, args);
    const powershell = this.genPowerShellLaunch(cfg, args);
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
    if (grammarFile) files.unshift(grammarFile);
    const warnings = foundTrait
      ? []
      : ['No @llama_serve trait found; used compiler options/defaults.'];
    if (cfg.grammarPath && cfg.grammar) {
      warnings.push(
        'Both a grammar file and an inline grammar were supplied; using --grammar-file and ignoring the inline grammar.'
      );
    }

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
    const platform = this.opts.platform ?? this.platformValue(raw, 'platform') ?? DEFAULTS.platform;

    return {
      name,
      model,
      modelPath:
        this.opts.modelPath ??
        this.stringValue(raw, 'modelPath', 'model_path', 'gguf') ??
        DEFAULTS.modelPath,
      mmprojPath: this.resolveMmproj(raw),
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
      ...this.resolveGrammar(raw),
      loras: this.resolveLoras(raw),
      loraInitWithoutApply:
        this.opts.loraInitWithoutApply ??
        this.booleanValue(raw, false, 'loraInitWithoutApply', 'lora_init_without_apply'),
      executable: this.resolveExecutable(raw, platform),
      cudaPath: this.opts.cudaPath ?? this.stringValue(raw, 'cudaPath', 'cuda_path'),
      llamaBinDir: this.opts.llamaBinDir ?? this.stringValue(raw, 'llamaBinDir', 'llama_bin_dir'),
      workingDirectory:
        this.opts.workingDirectory ??
        this.stringValue(raw, 'workingDirectory', 'working_directory'),
      platform,
      serviceUser:
        this.opts.serviceUser ??
        this.stringValue(raw, 'serviceUser', 'service_user') ??
        DEFAULTS.serviceUser,
      node,
      registerAs,
      dryRun: true,
    };
  }

  private resolveExecutable(raw: RawConfig, platform: 'windows' | 'linux'): string {
    const executable =
      this.opts.executable ??
      this.stringValue(raw, 'executable') ??
      DEFAULT_HOLO_PATCHED_EXECUTABLES[platform];
    this.assertHoloPatchedExecutable(executable);
    return executable;
  }

  private assertHoloPatchedExecutable(executable: string): void {
    const trimmed = executable.trim();
    const normalized = trimmed.replace(/\\/g, '/');
    if (/^llama-server(?:\.exe)?$/i.test(trimmed)) {
      throw new Error(
        'LlamaServerCompiler requires a HOLO-patched llama.cpp build binary; use build-holo/bin/.../llama-server(.exe), not a bare PATH lookup.'
      );
    }
    if (/\/?\.docker\/bin\/inference\/llama-server(?:\.exe)?$/i.test(normalized)) {
      throw new Error(
        'LlamaServerCompiler rejects the prebuilt .docker/bin/inference llama-server binary because HOLO patching it is a silent no-op; use the rebuilt build-holo/bin/.../llama-server(.exe).'
      );
    }
    if (/\/llama\.cpp\/build\/bin\/(?:release\/)?llama-server(?:\.exe)?$/i.test(normalized)) {
      throw new Error(
        'LlamaServerCompiler rejects the legacy llama.cpp build/bin llama-server path; use the HOLO-patched build-holo/bin/.../llama-server(.exe).'
      );
    }
    if (/\/ollama\/.*\/llama-server(?:\.exe)?$/i.test(normalized)) {
      throw new Error(
        'LlamaServerCompiler rejects Ollama-owned llama-server binaries for HoloLlama serving; use the HOLO-patched llama.cpp build-holo binary.'
      );
    }
  }

  /**
   * Build the RAW argv token stream (flag names + unquoted values). Quoting is applied
   * per target — cmd-style for the reference command / systemd, PowerShell for the .ps1 —
   * so a value with a space, quote, or backtick is never mis-escaped (see cmdArg/psArg).
   */
  private buildArgv(cfg: ResolvedLlamaConfig): string[] {
    const argv = ['-m', cfg.modelPath];

    if (cfg.mmprojPath) argv.push('--mmproj', cfg.mmprojPath);

    argv.push(
      '--host',
      cfg.host,
      '--port',
      String(cfg.port),
      '-c',
      String(cfg.contextLength),
      '-ngl',
      String(cfg.gpuLayers),
      '--fit',
      cfg.fit
    );
    // Image-token gates are mtmd (vision) flags — only meaningful with a projector, so a
    // text-only node (no mmproj) omits them. Order preserved for the Fara vision command.
    if (cfg.mmprojPath) {
      argv.push(
        '--image-min-tokens',
        String(cfg.imageMinTokens),
        '--image-max-tokens',
        String(cfg.imageMaxTokens)
      );
    }
    argv.push('--parallel', String(cfg.parallel));

    if (cfg.metrics) argv.push('--metrics');
    // `--grammar-file` and inline `--grammar` write the SAME llama.cpp field — never emit
    // both. An explicit grammar file (incl. the resolved "holoscript" preset) wins; the
    // dual-spec conflict is surfaced as a warning in compile().
    if (cfg.grammarPath) argv.push('--grammar-file', cfg.grammarPath);
    else if (cfg.grammar) argv.push('--grammar', cfg.grammar);

    // One flag per adapter. llama.cpp's --lora-scaled takes FNAME:SCALE together
    // (build 7885 --help), so a scaled adapter is a single --lora-scaled arg, not
    // a bare --lora plus a dangling scale. Unscaled adapters use plain --lora.
    for (const lora of cfg.loras) {
      if (lora.scale !== undefined) {
        argv.push('--lora-scaled', `${lora.path}:${lora.scale}`);
      } else {
        argv.push('--lora', lora.path);
      }
    }
    // Load adapters cold for POST /lora-adapters hot-swap (serve HoloTune adapters live).
    if (cfg.loraInitWithoutApply && cfg.loras.length > 0) argv.push('--lora-init-without-apply');

    return argv;
  }

  /**
   * Resolve the `grammar:` field into either a preset (a built-in HoloScript GBNF
   * that gets generated into the bundle) or an inline grammar / grammar file. A
   * preset name (`holoscript`) is NOT passed to `--grammar` verbatim — it names a
   * grammar we generate.
   */
  private resolveGrammar(raw: RawConfig): {
    grammarPath?: string;
    grammar?: string;
    grammarPreset?: string;
  } {
    const grammarPath =
      this.opts.grammarPath ?? this.stringValue(raw, 'grammarPath', 'grammar_path');
    const grammarRaw = this.opts.grammar ?? this.stringValue(raw, 'grammar');
    if (grammarRaw && isHoloScriptGrammarPreset(grammarRaw)) {
      return { grammarPath, grammarPreset: grammarRaw };
    }
    return { grammarPath, grammar: grammarRaw };
  }

  /**
   * Resolve the multimodal projector. Vision is the Fara-first default, but a text-only
   * node (e.g. a Jetson serving qwen3:4b-instruct) must be able to author OUT of it —
   * `mmproj: "none"` (or `off`/`false`/`no`) or `vision: false` suppresses `--mmproj`,
   * so a non-vision model is not handed a projector it cannot load.
   */
  private resolveMmproj(raw: RawConfig): string | undefined {
    if (this.opts.mmprojPath !== undefined) return this.opts.mmprojPath || undefined;
    const authored = this.stringValue(raw, 'mmprojPath', 'mmproj_path', 'mmproj');
    if (authored) return /^(none|off|false|no)$/i.test(authored) ? undefined : authored;
    if (!this.booleanValue(raw, true, 'vision')) return undefined; // vision: false → text-only
    return DEFAULTS.mmprojPath;
  }

  /**
   * Generate the GBNF for a `grammar:` preset and return it as a bundle file. Sets
   * `cfg.grammarPath` to the emitted file unless the author supplied an explicit
   * grammar path (which then wins). Returns null when no preset was requested.
   */
  private resolveGrammarPreset(cfg: ResolvedLlamaConfig): LlamaServerBundleFile | null {
    if (!cfg.grammarPreset) return null;
    // An author-supplied grammar path wins — don't also emit (and point away from) the
    // preset file. Only generate the preset GBNF when nothing else claimed grammarPath.
    if (cfg.grammarPath) return null;
    const path = 'grammars/holoscript-subset.gbnf';
    cfg.grammarPath = path;
    return { path, content: generateHoloScriptGbnf() };
  }

  /**
   * Collect every LoRA adapter from compiler options and authored config. Accepts
   * `loraPath`+`loraScale` (single, back-compat) and `lora`/`lora_path` as a string
   * OR an array of strings / `{ path, scale }` objects. Deduped by path (last wins),
   * order-preserving, so a native `lora: [...]` list serves multiple adapters at once.
   */
  private resolveLoras(raw: RawConfig): LlamaServerLoraAdapter[] {
    const collected: LlamaServerLoraAdapter[] = [];
    const add = (path: unknown, scale?: unknown): void => {
      if (typeof path !== 'string' || path.length === 0) return;
      const s = typeof scale === 'number' && Number.isFinite(scale) ? scale : undefined;
      collected.push(s !== undefined ? { path, scale: s } : { path });
    };

    // Accept a string, an array (of strings / {path,scale}), OR a bare {path,scale}
    // object — the same shapes the array elements accept, so the single-object form is
    // not a silent trap. `defaultScale` seeds any entry that carries no scale of its own,
    // so a top-level `lora_scale` applies to every array entry that lacks one.
    const addValue = (value: unknown, defaultScale?: number): void => {
      if (typeof value === 'string') {
        add(value, defaultScale);
      } else if (Array.isArray(value)) {
        for (const item of value) addValue(item, defaultScale);
      } else if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        add(obj.path, typeof obj.scale === 'number' ? obj.scale : defaultScale);
      }
    };

    for (const entry of this.opts.loras ?? []) {
      if (typeof entry === 'string') add(entry);
      else add(entry.path, entry.scale);
    }
    if (this.opts.loraPath) add(this.opts.loraPath, this.opts.loraScale);

    const rawScale = this.optionalNumberValue(raw, 'loraScale', 'lora_scale');
    addValue(raw.lora ?? raw.lora_path ?? raw.loraPath, rawScale);

    // Dedupe by path, preserving first-seen order; MERGE so an explicit scale is never
    // lost to a later unscaled entry for the same path (scale is sticky).
    const order: string[] = [];
    const byPath = new Map<string, LlamaServerLoraAdapter>();
    for (const lora of collected) {
      const prev = byPath.get(lora.path);
      if (!prev) {
        order.push(lora.path);
        byPath.set(lora.path, lora);
      } else if (lora.scale !== undefined || prev.scale !== undefined) {
        byPath.set(lora.path, { path: lora.path, scale: lora.scale ?? prev.scale });
      }
    }
    return order.map((path) => byPath.get(path)!);
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
      command: this.cmdLine(cfg.executable, this.buildArgv(cfg)),
      registryHandle: registryEntry.handle,
    };

    return [
      { path: 'launch-llama-server.ps1', content: powershell, executable: true },
      { path: 'health-probe.ps1', content: healthProbe, executable: true },
      { path: `${this.slug(cfg.registerAs)}.service`, content: systemdUnit },
      { path: 'install-s4u-task.ps1', content: windowsS4UTask, executable: true },
      {
        // Canonical sovereign-devices registry format the fleet router consumes:
        // { capabilities: [{ id: "local-llm", endpoint: <base>, ... }] }. The endpoint is
        // the BASE url (no /v1) because discovery appends its own paths (/health, /props,
        // /slots for llama.cpp; /v1/... for the OpenAI client).
        path: `sovereign-devices/${cfg.registerAs}.json`,
        content: JSON.stringify(this.buildRegistryDoc(cfg), null, 2),
      },
      { path: 'llama-server-manifest.json', content: JSON.stringify(manifest, null, 2) },
    ];
  }

  /** The canonical sovereign-devices registry document `resolveNodeEndpoint` reads. */
  private buildRegistryDoc(cfg: ResolvedLlamaConfig): {
    handle: string;
    node: string;
    capabilities: Array<Record<string, unknown>>;
  } {
    return {
      handle: cfg.registerAs,
      node: cfg.node,
      capabilities: [
        {
          id: 'local-llm',
          status: 'proven',
          endpoint: this.baseUrl(cfg),
          backend: 'llama.cpp',
          serverKind: 'llama-server',
          model: cfg.model,
          healthUrl: this.healthUrl(cfg),
          grammarConstrained: Boolean(cfg.grammarPath || cfg.grammar),
          vision: Boolean(cfg.mmprojPath),
          loraHotSwap: cfg.loras.length > 0,
        },
      ],
    };
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
        loraHotSwap: cfg.loras.length > 0,
      },
    };
  }

  private genPowerShellLaunch(cfg: ResolvedLlamaConfig, argv: string[]): string {
    const pathEntries = [cfg.cudaPath, cfg.llamaBinDir].filter(Boolean) as string[];
    const pathPrelude =
      pathEntries.length > 0
        ? `$env:PATH = '${this.psSingle(pathEntries.join(';') + ';')}' + $env:PATH\n`
        : '';
    const cwd = cfg.workingDirectory
      ? `Set-Location -LiteralPath '${this.psSingle(cfg.workingDirectory)}'\n`
      : '';
    // PowerShell call operator with PS-literal (single-quoted) tokens — correct for an
    // exe path with spaces and for an inline GBNF grammar (which contains double-quotes).
    return [
      '# Generated by HoloScript LlamaServerCompiler. Dry artifact; run explicitly.',
      "$ErrorActionPreference = 'Stop'",
      `${pathPrelude}${cwd}${this.psCommandLine(cfg.executable, argv)}`,
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

  private genSystemdUnit(cfg: ResolvedLlamaConfig, argv: string[]): string {
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
${pathLine}ExecStart=${this.cmdLine(cfg.executable, argv)}
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

  /**
   * cmd.exe / CreateProcess quoting: double-quote a value with whitespace or quotes and
   * backslash-escape inner quotes. Used for the reference command string, the sovereign-
   * devices launchCommand, the manifest, and the systemd ExecStart (systemd honors "" +
   * C-style \" escapes). NOT valid for a PowerShell script — see psArg.
   */
  private cmdArg(value: string): string {
    if (!/[\s"]/.test(value)) return value;
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  /**
   * PowerShell literal quoting for the `&` call operator: single-quote any token with
   * whitespace or a PS-special char (' " ` $ ; parens/braces), doubling inner single
   * quotes. Inside PS single-quotes every other char (incl. " and the backtick) is
   * literal, so an inline GBNF grammar or a path with a space/backtick survives intact.
   */
  private psArg(value: string): string {
    if (!/[\s"'`$;(){}]/.test(value)) return value;
    return `'${value.replace(/'/g, "''")}'`;
  }

  /** cmd/reference command line: `<exe> <arg>...` with cmd-style quoting on every token. */
  private cmdLine(executable: string, argv: string[]): string {
    return [this.cmdArg(executable), ...argv.map((a) => this.cmdArg(a))].join(' ');
  }

  /** PowerShell launch line: `& <exe> <arg>...` (call operator so a spaced exe path runs). */
  private psCommandLine(executable: string, argv: string[]): string {
    return ['&', this.psArg(executable), ...argv.map((a) => this.psArg(a))].join(' ');
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
