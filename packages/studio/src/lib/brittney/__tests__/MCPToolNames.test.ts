/**
 * Every HoloScript tool Brittney calls must exist on the server she calls it on.
 *
 * Measured 2026-09-28: five of her HoloScript-library tools (suggest, list and
 * explain traits; generate a scene; compile) called names the mcp-server never
 * registered. The server looks names up exactly and answers "Unknown tool", so
 * they failed on every call, for months, while MCPTools.test.ts asserted the
 * wrong compile name against a faked network and stayed green. This test reads
 * the servers' own tool definitions instead of trusting a mock.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  directMCPMethod,
  getAbsorbMCPUrl,
  getDirectMCPConfigs,
  getHoloScriptMCPUrl,
} from '../MCPToolExecutor';
import { MCP_TOOLS } from '../MCPTools';

const REPO_ROOT = join(import.meta.dirname || __dirname, '..', '..', '..', '..', '..', '..');

/** Tool names a server defines: `name: '<tool>',` followed by its `description:`. */
function registeredToolNames(srcDir: string): Set<string> {
  const names = new Set<string>();
  const files = readdirSync(srcDir, { recursive: true }) as string[];
  for (const rel of files) {
    const path = String(rel);
    if (!path.endsWith('.ts') || path.endsWith('.test.ts') || path.includes('__tests__')) continue;
    const text = readFileSync(join(srcDir, path), 'utf-8');
    for (const m of text.matchAll(/name:\s*['"]([a-z0-9_]+)['"],\s*description\s*:/g))
      names.add(m[1]);
  }
  return names;
}

/** Every name a config can send: a function is asked about both formats it chooses between. */
function methodsOf(config: Parameters<typeof directMCPMethod>[0]): string[] {
  const samples = [
    { code: 'composition "Probe" { object "Box" {} }' },
    { code: 'object "Box" {}' },
    {},
  ];
  return [...new Set(samples.map((args) => directMCPMethod(config, args)))];
}

describe('Brittney calls only tools her servers register', () => {
  const holoscriptTools = registeredToolNames(join(REPO_ROOT, 'packages', 'mcp-server', 'src'));
  const absorbTools = registeredToolNames(
    join(REPO_ROOT, 'packages', 'absorb-service', 'src', 'mcp')
  );

  it('reads real registries, so an empty set cannot pass the checks below', () => {
    expect(holoscriptTools.size).toBeGreaterThan(50);
    expect(holoscriptTools.has('parse_holo')).toBe(true);
    expect(absorbTools.size).toBeGreaterThan(3);
  });

  it('every HoloScript and absorb tool name Brittney sends is registered on that server', () => {
    const missing: string[] = [];
    for (const [tool, config] of Object.entries(getDirectMCPConfigs())) {
      const registry =
        config.baseUrl === getHoloScriptMCPUrl()
          ? holoscriptTools
          : config.baseUrl === getAbsorbMCPUrl()
            ? absorbTools
            : null;
      if (!registry) continue;
      for (const method of methodsOf(config)) {
        if (!registry.has(method)) missing.push(`${tool} -> ${method}`);
      }
    }
    expect(
      missing,
      `Brittney calls tool names her servers do not register: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('the compile targets Brittney is told about are ones compile_holoscript accepts', () => {
    const compilerTools = readFileSync(
      join(REPO_ROOT, 'packages', 'mcp-server', 'src', 'compiler-tools.ts'),
      'utf-8'
    );
    const start = compilerTools.indexOf("name: 'compile_holoscript'");
    expect(start).toBeGreaterThan(-1);
    const enumBlock = /enum:\s*\[([\s\S]*?)\]/.exec(compilerTools.slice(start))?.[1] ?? '';
    const accepted = new Set([...enumBlock.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]));
    expect(accepted.has('r3f')).toBe(true);

    const holoCompile = MCP_TOOLS.find((t) => t.function.name === 'holo_compile');
    const properties = (
      holoCompile?.function.parameters as { properties?: Record<string, { description?: string }> }
    )?.properties;
    const described = properties?.target?.description ?? '';
    const examples = [...described.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(examples.length).toBeGreaterThan(3);
    expect(examples.filter((t) => !accepted.has(t))).toEqual([]);
  });
});
