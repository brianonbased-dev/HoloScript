import { describe, it, expect, vi } from 'vitest';
import { HoloScriptRuntime } from '../HoloScriptRuntime';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';
import { logger } from '../logger';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Engine Integration - Composition API', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  it('Provisioning Networking system correctly', async () => {
    const runtime = new HoloScriptRuntime();
    const source = `composition "NetworkedScene" {
      system Networking { type: "p2p", room: "lobby" }
    }`;
    const parseResult = parser.parse(source);
    expect(parseResult.success).toBe(true);

    const result = await runtime.execute(parseResult.ast.root);
    expect(result.success).toBe(true);

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('[Zero-Config] Provisioning system: Networking'),
      expect.objectContaining({ type: 'p2p', room: 'lobby' })
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('[Networking] Initializing multiplayer fabric...'),
      expect.any(Object)
    );
  });

  it('Provisioning Physics system correctly', async () => {
    const runtime = new HoloScriptRuntime();
    const source = `composition "PhysicsWorld" {
      system Physics { gravity: [0, -9.8, 0], solver: "standard" }
    }`;
    const parseResult = parser.parse(source);
    expect(parseResult.success).toBe(true);

    const result = await runtime.execute(parseResult.ast.root);
    expect(result.success).toBe(true);

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('[Zero-Config] Provisioning system: Physics'),
      expect.objectContaining({ solver: 'standard' })
    );
  });

  it('Applying core_config correctly', async () => {
    const runtime = new HoloScriptRuntime();
    const source = `composition "ConfiguredScene" {
      core_config { 
        max_players: 16,
        allow_external_assets: true
      }
    }`;
    const parseResult = parser.parse(source);
    expect(parseResult.success).toBe(true);

    const result = await runtime.execute(parseResult.ast.root);
    expect(result.success).toBe(true);

    // Check if context environment was updated
    // Note: this assumes we can access the internal context for testing if needed,
    // or we check the logs.
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('[Zero-Config] Applying core configuration'),
      expect.objectContaining({ max_players: 16, allow_external_assets: true })
    );
  });

  it('Executes specialized blocks in correct order', async () => {
    const runtime = new HoloScriptRuntime();
    const source = `composition "FullScene" {
      system Networking { type: "dedicated" }
      core_config { theme: "dark" }
      object "WorldOrb" { size: 10 }
    }`;
    const parseResult = parser.parse(source);
    expect(parseResult.success).toBe(true);

    const result = await runtime.execute(parseResult.ast.root);
    expect(result.success).toBe(true);

    // Verify ordering by checking log sequence
    const infoCalls = (logger.info as any).mock.calls;
    const provisioningIdx = infoCalls.findIndex((call) =>
      call[0].includes('Provisioning system: Networking')
    );
    const configIdx = infoCalls.findIndex((call) =>
      call[0].includes('Applying core configuration')
    );
    const orbIdx = infoCalls.findIndex((call) => call[0].includes('Orb created'));

    expect(provisioningIdx).toBeLessThan(configIdx);
    expect(configIdx).toBeLessThan(orbIdx);
  });
});
