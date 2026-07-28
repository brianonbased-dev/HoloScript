import { readFileSync } from 'node:fs';
import { UAALOpCode, UAALVirtualMachine, type UAALBytecode } from '@holoscript/uaal';
import { describe, expect, it } from 'vitest';

interface EnginePackageManifest {
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

const ENGINE_MANIFEST = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
) as EnginePackageManifest;

describe('@holoscript/engine UAAL peer contract', () => {
  it('packs UAAL as a same-major range and keeps the bridge optional', () => {
    expect(ENGINE_MANIFEST.peerDependencies?.['@holoscript/uaal']).toBe('workspace:^');
    expect(ENGINE_MANIFEST.peerDependenciesMeta?.['@holoscript/uaal']?.optional).toBe(true);
  });

  it('executes and replays bytecode through the installed UAAL peer', async () => {
    const bytecode: UAALBytecode = {
      version: 2,
      instructions: [
        { opCode: UAALOpCode.PUSH, operands: ['engine-uaal-peer-ok'] },
        { opCode: UAALOpCode.HALT },
      ],
    };
    const vm = new UAALVirtualMachine({ recordLog: true });
    const result = await vm.execute(bytecode);
    const replay = await UAALVirtualMachine.replayLog(bytecode, vm.exportLog());

    expect(result.taskStatus).toBe('HALTED');
    expect(result.stackTop).toBe('engine-uaal-peer-ok');
    expect(replay.valid).toBe(true);
  });
});
