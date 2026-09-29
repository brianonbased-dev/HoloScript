/**
 * Values the WebGPU compiler writes into the module it emits: a model's path, a
 * compute shader's entry point and workgroups, and positions and scales. Each must
 * reach the module as the value that was written, or as a number, and never as
 * source text pasted in (task_1790602604837_whpw, item 6). These use ordinary
 * values an author may write, not crafted ones.
 */
import { describe, it, expect, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { WebGPUCompiler } from '../WebGPUCompiler';
import { parseHolo } from '../../parser/HoloCompositionParser';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

/** Compile .holo source that must read without an error. */
function compile(source: string): string {
  const result = parseHolo(source);
  expect(result.errors).toEqual([]);
  return new WebGPUCompiler().compile(result.ast as HoloComposition, 'test-token');
}

/** The text after `prefix` up to the next `suffix`. */
function between(text: string, prefix: string, suffix: string): string {
  const at = text.indexOf(prefix);
  expect(at, `the output has no ${prefix}`).toBeGreaterThanOrEqual(0);
  const start = at + prefix.length;
  const end = text.indexOf(suffix, start);
  expect(end, `nothing ends ${prefix}`).toBeGreaterThanOrEqual(0);
  return text.slice(start, end);
}

/** The output line that holds `marker`. */
function lineWith(code: string, marker: string): string {
  const line = code.split('\n').find((l) => l.includes(marker));
  expect(line, `no output line holds ${marker}`).toBeDefined();
  return line!;
}

/** What a piece of the output evaluates to, as the browser would read it. */
const evaluate = (expression: string): unknown => runInNewContext(`(${expression})`);

/** Syntax errors in the emitted module. */
function syntaxErrors(code: string): string[] {
  const out = ts.transpileModule(code, {
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return (out.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
}

const NUMBER = /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i;

/** The items of an array written in the output, each checked to be a number literal. */
function numberItems(text: string): number[] {
  const items = text.split(',').map((item) => item.trim());
  for (const item of items) expect(item, `"${item}" in [${text}]`).toMatch(NUMBER);
  return items.map(Number);
}

describe('WebGPUCompiler writes values, not source text', () => {
  it('loads a model from the exact path it was given', () => {
    const code = compile(String.raw`composition "Room" {
  object "Chair" { model: "C:\\assets\\chair.glb" }
  object "Record" { model: "records/12\" single.glb" }
}`);
    expect(evaluate(between(code, 'const ChairAsset = await assetLoader.load(', ');'))).toBe(
      String.raw`C:\assets\chair.glb`
    );
    expect(evaluate(between(code, 'const RecordAsset = await assetLoader.load(', ');'))).toBe(
      'records/12" single.glb'
    );
    expect(syntaxErrors(code)).toEqual([]);
  });

  it('names the compute entry point with the exact text given', () => {
    const code = compile(String.raw`composition "Sim" {
  object "Field" {
    geometry: "cube"
    @compute { shader: "shaders\\particles.wgsl" }
  }
}`);
    const pipeline = lineWith(code, 'const FieldCustomCompute = ');
    expect(evaluate(between(pipeline, 'entryPoint: ', ' } });'))).toBe(
      String.raw`shaders\particles.wgsl`
    );
    expect(syntaxErrors(code)).toEqual([]);
  });

  it('dispatches three whole-number workgroup counts', () => {
    const code = compile(`composition "Sim" {
  object "Grid" {
    geometry: "cube"
    @compute { shader: "main", workgroups: [8, 8] }
  }
  object "Rows" {
    geometry: "cube"
    @compute { shader: "main", workgroups: [16, rows, 1] }
  }
  object "Line" {
    geometry: "cube"
    @compute { shader: "main", workgroups: 128 }
  }
}`);
    // A missing y or z is 1, as dispatchWorkgroups takes it.
    expect(numberItems(between(code, 'const GridWorkgroups = [', '];'))).toEqual([8, 8, 1]);
    // A name is not a count: it gets the default, and the output says so.
    expect(numberItems(between(code, 'const RowsWorkgroups = [', '];'))).toEqual([16, 1, 1]);
    expect(code).toContain(
      '// WARNING: the workgroups of "Rows" are not whole numbers; each part that is not one uses the default (64, 1, 1).'
    );
    expect(numberItems(between(code, 'const LineWorkgroups = [', '];'))).toEqual([128, 1, 1]);
  });

  it('writes a position or scale that is not three numbers as numbers, and says so', () => {
    const code = compile(`composition "Room" {
  object "Lamp" {
    geometry: "sphere"
    position: [0, height, 0]
    scale: [2, 2]
  }
}`);
    expect(
      numberItems(between(code, 'const LampModel = createBuffer(device, new Float32Array([', '])'))
    ).toEqual([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const push = lineWith(code, 'holoGraphObjects.push({ id: "Lamp"');
    expect(numberItems(between(push, 'basePosition: [', ']'))).toEqual([0, 0, 0]);
    expect(numberItems(between(push, 'baseScale: [', ']'))).toEqual([2, 2, 1]);
    expect(code).toContain(
      '// WARNING: the position of "Lamp" is not three numbers; each part that is not a number is 0.'
    );
    expect(code).toContain(
      '// WARNING: the scale of "Lamp" is not three numbers; each part that is not a number is 1.'
    );
  });

  it('writes the position of unrendered geometry and of a group as numbers', () => {
    const code = compile(`composition "Room" {
  object "Wall" {
    geometry: "cube"
    purpose: "collider"
    position: [width, 0, 0]
  }
  spatial_group "Shelf" {
    position: [0, top, 0]
    object "Book" { geometry: "cube" position: [1, 2, 3] }
  }
}`);
    const wall = lineWith(code, 'holoGraphObjects.push({ id: "Wall"');
    expect(numberItems(between(wall, 'basePosition: [', ']'))).toEqual([0, 0, 0]);
    expect(
      numberItems(
        between(code, 'const ShelfGroupXform = createBuffer(device, new Float32Array([', '])')
      )
    ).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(code).toContain('// WARNING: the position of "Wall" is not three numbers');
    expect(code).toContain('// WARNING: the position of "Shelf" is not three numbers');
  });

  it('writes positions, scales and counts that are numbers exactly as before', () => {
    const code = compile(`composition "Room" {
  object "Crate" {
    geometry: "cube"
    position: [1.5, -2, 0.25]
    scale: 3
    @compute { shader: "main", workgroups: [64, 1, 1] }
  }
}`);
    expect(code).toContain(
      'const CrateModel = createBuffer(device, new Float32Array([3,0,0,0, 0,3,0,0, 0,0,3,0, 1.5,-2,0.25,1]), GPUBufferUsage.UNIFORM);'
    );
    expect(code).toContain('entryPoint: "main" } });');
    expect(code).toContain('const CrateWorkgroups = [64,1,1];');
    expect(code).not.toContain('WARNING');
  });
});
