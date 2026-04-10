import { describe, it, expect } from 'vitest';
import { HoloScriptPlusParser } from './HoloScriptPlusParser';

describe('Composition API Parsing', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  it('Parses top-level composition correctly', () => {
    const source = `composition "MyWorld" {
      object "Floor" { geometry: "box" }
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    expect(result.ast.root.type).toBe('composition');
    expect(result.ast.root.id).toBe('MyWorld');
  });

  it('Parses system blocks inside composition', () => {
    const source = `composition "NetworkedScene" {
      system Networking { type: "zero-config", syncRate: 30 }
      object "Player" { position: [0, 0, 0] }
    }`;
    const result = parser.parse(source);
    if (!result.success) {
      require('fs').writeFileSync(
        'C:\\Users\\josep\\test_errors.json',
        JSON.stringify(result.errors, null, 2)
      );
    }
    expect(result.success).toBe(true);

    const composition = result.ast.root;
    const networkingSystem = composition.body.systems.find((c: any) => c.id === 'Networking');
    expect(networkingSystem).toBeDefined();
    expect(networkingSystem.id).toBe('Networking');
    expect(networkingSystem.properties.type).toBe('zero-config');
    expect(networkingSystem.properties.syncRate).toBe(30);
  });

  it('Parses core_config inside composition', () => {
    const source = `composition "ConfiguredWorld" {
      core_config { path: "./world.json" }
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);

    const composition = result.ast.root;
    const config = composition.body.configs.find((c: any) => c.type === 'core_config');
    expect(config).toBeDefined();
    expect(config.properties.path).toBe('./world.json');
  });
});
