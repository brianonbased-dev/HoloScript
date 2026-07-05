import { describe, expect, it } from 'vitest';
import { LlamaServerCompiler, type LlamaServerBundle } from '../LlamaServerCompiler';
import { createTestCompilerToken } from '../CompilerBase';
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
    expect(registry.backend).toBe('llama.cpp');
    expect(registry.endpoint).toBe('http://127.0.0.1:18080/v1');
    expect(registry.capabilities.vision).toBe(true);
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
    expect(bundle.launch.command).toContain(
      '--lora adapters\\holotune-fara.gguf --lora-scaled 0.75'
    );
    expect(bundle.registryEntry.capabilities.grammarConstrained).toBe(true);
    expect(bundle.registryEntry.capabilities.loraHotSwap).toBe(true);
  });
});
