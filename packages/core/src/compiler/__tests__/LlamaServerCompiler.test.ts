import { describe, expect, it } from 'vitest';
import { LlamaServerCompiler, type LlamaServerBundle } from '../LlamaServerCompiler';
import { createTestCompilerToken } from '../CompilerBase';
import { parseHolo } from '../../parser/HoloCompositionParser';
import type {
  HoloComposition,
  HoloObjectTrait,
  HoloValue,
} from '../../parser/HoloCompositionTypes';

const token = createTestCompilerToken();

function llamaTrait(config: Record<string, HoloValue>): HoloObjectTrait {
  return {
    type: 'ObjectTrait',
    name: 'llama_serve',
    config,
    args: [],
  };
}

function composition(traitConfig: Record<string, HoloValue>): HoloComposition {
  return {
    type: 'Composition',
    name: 'fara-vision-node',
    traits: [llamaTrait(traitConfig)],
    templates: [],
    objects: [],
    spatialGroups: [],
    lights: [],
    transitions: [],
    timelines: [],
    audio: [],
    zones: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    imports: [],
    conditionals: [],
    iterators: [],
  } as unknown as HoloComposition;
}

const faraConfig: Record<string, HoloValue> = {
  model: 'fara-7b',
  model_path: '.scratch\\llama-cpp-models\\fara-7b-q4-k-m.gguf',
  mmproj_path: '.scratch\\llama-cpp-models\\fara-7b-mmproj.gguf',
  host: '127.0.0.1',
  port: 18080,
  ctx: 4096,
  ngl: 12,
  fit: 'on',
  image_min_tokens: 1024,
  image_max_tokens: 1536,
  parallel: 1,
  metrics: true,
  executable: 'llama-server.exe',
  cuda_path: 'C:\\Users\\josep\\AppData\\Local\\Programs\\Ollama\\lib\\ollama\\cuda_v12',
  llama_bin_dir: 'C:\\Users\\josep\\Documents\\GitHub\\llama.cpp\\bin-release',
  node: 'laptop-rtx3060',
  register_as: 'laptop-fara-7b-llama',
};

const expectedFaraCommand =
  'llama-server.exe -m .scratch\\llama-cpp-models\\fara-7b-q4-k-m.gguf ' +
  '--mmproj .scratch\\llama-cpp-models\\fara-7b-mmproj.gguf --host 127.0.0.1 ' +
  '--port 18080 -c 4096 -ngl 12 --fit on --image-min-tokens 1024 ' +
  '--image-max-tokens 1536 --parallel 1 --metrics';

describe('LlamaServerCompiler', () => {
  it('emits the M1 Fara llama.cpp launch command byte-for-byte', () => {
    const compiler = new LlamaServerCompiler();
    const bundle = JSON.parse(
      compiler.compile(composition(faraConfig), token)
    ) as LlamaServerBundle;

    expect(bundle.target).toBe('llama-server');
    expect(bundle.dryRun).toBe(true);
    expect(bundle.launch.command).toBe(expectedFaraCommand);
    expect(bundle.launch.powershell).toContain(
      "$env:PATH = 'C:\\Users\\josep\\AppData\\Local\\Programs\\Ollama\\lib\\ollama\\cuda_v12;C:\\Users\\josep\\Documents\\GitHub\\llama.cpp\\bin-release;' + $env:PATH"
    );
    expect(bundle.launch.powershell).toContain(expectedFaraCommand);
  });

  it('emits health, service, and sovereign-devices registry artifacts', () => {
    const compiler = new LlamaServerCompiler();
    const files = compiler.compileToFiles(composition(faraConfig), token);

    expect(files['launch-llama-server.ps1']).toContain(expectedFaraCommand);
    expect(files['health-probe.ps1']).toContain('http://127.0.0.1:18080/health');
    expect(files['laptop-fara-7b-llama.service']).toContain('ExecStart=llama-server.exe');
    expect(files['install-s4u-task.ps1']).toContain('Register-ScheduledTask');

    const registry = JSON.parse(files['sovereign-devices/laptop-fara-7b-llama.json']);
    // Canonical sovereign-devices format: capabilities[] the fleet router resolves.
    const cap = registry.capabilities.find((c: { id: string }) => c.id === 'local-llm');
    expect(cap.backend).toBe('llama.cpp');
    expect(cap.endpoint).toBe('http://127.0.0.1:18080'); // base url (no /v1) — discovery appends paths
    expect(cap.vision).toBe(true);
  });

  it('marks grammar and LoRA capabilities when authored', () => {
    const compiler = new LlamaServerCompiler();
    const bundle = JSON.parse(
      compiler.compile(
        composition({
          ...faraConfig,
          grammar_path: 'grammars\\holoscript.gbnf',
          lora_path: 'adapters\\holotune-fara.gguf',
          lora_scale: 0.75,
        }),
        token
      )
    ) as LlamaServerBundle;

    expect(bundle.launch.command).toContain('--grammar-file grammars\\holoscript.gbnf');
    // llama.cpp --lora-scaled takes FNAME:SCALE together (build 7885), not a bare
    // --lora plus a dangling scale.
    expect(bundle.launch.command).toContain('--lora-scaled adapters\\holotune-fara.gguf:0.75');
    expect(bundle.launch.command).not.toContain('--lora adapters\\holotune-fara.gguf --lora-scaled');
    expect(bundle.registryEntry.capabilities.grammarConstrained).toBe(true);
    expect(bundle.registryEntry.capabilities.loraHotSwap).toBe(true);
  });

  it('loads multiple LoRA adapters from a native array and marks hot-swap', () => {
    const compiler = new LlamaServerCompiler();
    const bundle = JSON.parse(
      compiler.compile(
        composition({
          ...faraConfig,
          lora: ['adapters\\a.gguf', 'adapters\\b.gguf'],
          lora_init_without_apply: true,
        }),
        token
      )
    ) as LlamaServerBundle;

    expect(bundle.launch.command).toContain('--lora adapters\\a.gguf');
    expect(bundle.launch.command).toContain('--lora adapters\\b.gguf');
    expect(bundle.launch.command).toContain('--lora-init-without-apply');
    expect(bundle.config.loras).toHaveLength(2);
    expect(bundle.registryEntry.capabilities.loraHotSwap).toBe(true);
  });

  it('generates a HoloScript GBNF grammar file for the "holoscript" preset', () => {
    const compiler = new LlamaServerCompiler();
    const files = compiler.compileToFiles(
      composition({ ...faraConfig, grammar: 'holoscript' }),
      token
    );

    const gbnf = files['grammars/holoscript-subset.gbnf'];
    expect(gbnf).toBeDefined();
    expect(gbnf).toContain('root ::=');
    expect(gbnf).toContain('trait ::= "@" ident');

    const bundle = JSON.parse(
      compiler.compile(composition({ ...faraConfig, grammar: 'holoscript' }), token)
    ) as LlamaServerBundle;
    // The preset resolves to the generated grammar file, not a literal --grammar holoscript.
    expect(bundle.launch.command).toContain('--grammar-file grammars/holoscript-subset.gbnf');
    expect(bundle.launch.command).not.toContain('--grammar holoscript');
    expect(bundle.registryEntry.capabilities.grammarConstrained).toBe(true);
  });

  it('parses and compiles a real .holo @llama_serve block (native authoring path)', () => {
    // End-to-end: author native HoloScript, parse via the production parser
    // (HoloCompositionParser — the trait lands in composition.traits), compile.
    const result = parseHolo(`
      composition "FaraNode" {
        @llama_serve {
          model: "fara-7b"
          model_path: ".scratch/fara.gguf"
          grammar: "holoscript"
          lora: ["adapters/a.gguf", "adapters/b.gguf"]
          register_as: "laptop-fara"
          node: "laptop-rtx3060"
        }
      }
    `);
    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();

    const compiler = new LlamaServerCompiler();
    const bundle = JSON.parse(compiler.compile(result.ast!, token)) as LlamaServerBundle;

    expect(bundle.warnings).not.toContain('No @llama_serve trait found; used compiler options/defaults.');
    expect(bundle.registryEntry.handle).toBe('laptop-fara');
    expect(bundle.registryEntry.model).toBe('fara-7b');
    expect(bundle.launch.command).toContain('-m .scratch/fara.gguf');
    expect(bundle.launch.command).toContain('--grammar-file grammars/holoscript-subset.gbnf');
    expect(bundle.launch.command).toContain('--lora adapters/a.gguf');
    expect(bundle.launch.command).toContain('--lora adapters/b.gguf');

    const files = compiler.compileToFiles(result.ast!, token);
    expect(files['grammars/holoscript-subset.gbnf']).toContain('root ::=');
    expect(files['sovereign-devices/laptop-fara.json']).toContain('"backend": "llama.cpp"');
  });

  // ── Review fixes (adversarial review 2026-07-05) ──────────────────────────────

  it('emits an inline grammar with PowerShell-correct single-quoting (not backslash)', () => {
    const compiler = new LlamaServerCompiler();
    const bundle = JSON.parse(
      compiler.compile(composition({ ...faraConfig, grammar: 'root ::= "x"' }), token)
    ) as LlamaServerBundle;
    // Reference command line: cmd-style double-quote with escaped inner quotes.
    expect(bundle.launch.command).toContain('--grammar "root ::= \\"x\\""');
    // The PowerShell launcher single-quotes the grammar (PS does not honor backslash escapes).
    expect(bundle.launch.powershell).toContain(`--grammar 'root ::= "x"'`);
    expect(bundle.launch.powershell).not.toContain('\\"x\\"');
  });

  it('quotes an executable path containing a space in both the command and the .ps1', () => {
    const compiler = new LlamaServerCompiler({ executable: 'C:/llama cpp/llama-server.exe' });
    const bundle = JSON.parse(compiler.compile(composition(faraConfig), token)) as LlamaServerBundle;
    expect(bundle.launch.command.startsWith('"C:/llama cpp/llama-server.exe" -m')).toBe(true);
    expect(bundle.launch.powershell).toContain(`& 'C:/llama cpp/llama-server.exe' -m`);
  });

  it('accepts a single {path, scale} LoRA object (not only arrays)', () => {
    const compiler = new LlamaServerCompiler();
    const bundle = JSON.parse(
      compiler.compile(
        composition({ ...faraConfig, lora: { path: 'adapters/x.gguf', scale: 0.5 } }),
        token
      )
    ) as LlamaServerBundle;
    expect(bundle.config.loras).toHaveLength(1);
    expect(bundle.launch.command).toContain('--lora-scaled adapters/x.gguf:0.5');
    expect(bundle.registryEntry.capabilities.loraHotSwap).toBe(true);
  });

  it('warns and uses --grammar-file when both a grammar file and inline grammar are set', () => {
    const compiler = new LlamaServerCompiler();
    const bundle = JSON.parse(
      compiler.compile(
        composition({ ...faraConfig, grammar: 'root ::= x', grammar_path: 'g.gbnf' }),
        token
      )
    ) as LlamaServerBundle;
    expect(bundle.launch.command).toContain('--grammar-file g.gbnf');
    expect(bundle.launch.command).not.toContain('--grammar root');
    expect(bundle.warnings.some((w) => w.includes('inline grammar'))).toBe(true);
  });

  it('keeps an explicit scale when a later unscaled entry repeats the same LoRA path', () => {
    const compiler = new LlamaServerCompiler({ loras: [{ path: 'a.gguf', scale: 0.5 }] });
    const bundle = JSON.parse(
      compiler.compile(composition({ ...faraConfig, lora: ['a.gguf'] }), token)
    ) as LlamaServerBundle;
    expect(bundle.config.loras).toHaveLength(1);
    expect(bundle.launch.command).toContain('--lora-scaled a.gguf:0.5');
    expect(bundle.launch.command).not.toContain('--lora a.gguf ');
  });

  it('suppresses --mmproj for a text-only node (mmproj: "none" or vision: false)', () => {
    const compiler = new LlamaServerCompiler();

    const noneBundle = JSON.parse(
      compiler.compile(composition({ ...faraConfig, mmproj_path: 'none' }), token)
    ) as LlamaServerBundle;
    expect(noneBundle.launch.command).not.toContain('--mmproj');
    expect(noneBundle.registryEntry.capabilities.vision).toBe(false);

    const visionFalse = JSON.parse(
      compiler.compile(composition({ model: 'qwen3-4b', model_path: 'm.gguf', vision: false }), token)
    ) as LlamaServerBundle;
    expect(visionFalse.launch.command).not.toContain('--mmproj');
    expect(visionFalse.registryEntry.capabilities.vision).toBe(false);
  });

  it('applies a top-level lora_scale to every array adapter that lacks its own', () => {
    const compiler = new LlamaServerCompiler();
    const bundle = JSON.parse(
      compiler.compile(
        composition({ ...faraConfig, lora: ['a.gguf', 'b.gguf'], lora_scale: 0.7 }),
        token
      )
    ) as LlamaServerBundle;
    expect(bundle.launch.command).toContain('--lora-scaled a.gguf:0.7');
    expect(bundle.launch.command).toContain('--lora-scaled b.gguf:0.7');
  });
});
