import { describe, expect, it } from 'vitest';
import {
  AssetType,
  HoloBytecodeBuilder,
  HoloOpCode,
  HoloVM,
  UnsupportedHostOpcodeError,
  VMStatus,
} from '../index';

describe('engine HoloVM host integration', () => {
  it('fails loudly when a host opcode has no registered callback', () => {
    const vm = new HoloVM();
    const builder = new HoloBytecodeBuilder();
    builder.addFunction('main').loadAsset('models/tree.glb', AssetType.Mesh).halt();

    vm.load(builder.build());
    const result = vm.tick(16.67);

    expect(result.status).toBe(VMStatus.Error);
    expect(result.error).toContain('Unsupported host opcode LOAD_ASSET');
    expect(vm.getLastError()).toBeInstanceOf(UnsupportedHostOpcodeError);
  });

  it('runs registered callbacks for host output opcodes', () => {
    const vm = new HoloVM({
      [HoloOpCode.LOAD_ASSET]: ({ operands, resolveString }) =>
        `asset:${resolveString(operands[0] as number)}:${operands[1]}`,
    });
    const builder = new HoloBytecodeBuilder();
    builder.addFunction('main').loadAsset('models/tree.glb', AssetType.Mesh).halt();

    vm.load(builder.build());
    const result = vm.tick(16.67);

    expect(result.status).toBe(VMStatus.Halted);
    expect(result.stackTop).toBe(`asset:models/tree.glb:${AssetType.Mesh}`);
  });
});
