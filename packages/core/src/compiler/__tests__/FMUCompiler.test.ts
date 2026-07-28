import { describe, expect, it } from 'vitest';
import { FMUCompiler, absorbFMU, compileToFMU } from '../FMUCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import {
  createFMUCouplingReceipt,
  defaultFMUConfig,
  fmuHandler,
  getFMUState,
  type FMUConfig,
} from '../../traits/FMUTrait';

function composition(): HoloComposition {
  return {
    type: 'Composition',
    name: 'PumpLoop',
    templates: [],
    objects: [
      {
        type: 'Object',
        name: 'pump',
        properties: [],
        traits: [
          {
            type: 'ObjectTrait',
            name: 'fmu',
            config: {
              inputs: [{ name: 'rpm', type: 'Real', description: 'Commanded RPM' }],
              outputs: [{ name: 'flow', type: 'Real' }],
              parameters: [{ name: 'diameter', start: 0.2 }],
            },
          },
          { type: 'ObjectTrait', name: 'physics', config: { mass: 8 } },
        ],
      },
      {
        type: 'Object',
        name: 'pipe',
        properties: [],
        traits: [{ type: 'ObjectTrait', name: 'hydraulic_pipe', config: {} }],
      },
    ],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
  };
}

describe('FMUCompiler', () => {
  it('emits an FMI 3.0 source bundle with CAEL coupling provenance', () => {
    const result = new FMUCompiler({
      mode: 'both',
      modelIdentifier: 'PumpLoopFMU',
    }).compileToBundle(composition());

    expect(result.kind).toBe('holoscript-fmi3-source-bundle');
    expect(result.files['modelDescription.xml']).toContain('fmiVersion="3.0"');
    expect(result.files['modelDescription.xml']).toContain('<CoSimulation');
    expect(result.files['modelDescription.xml']).toContain('<ModelExchange');
    expect(result.files['modelDescription.xml']).toContain('pump.input.rpm');
    expect(result.files['resources/cael-coupling-contract.json']).toContain(
      'cael-fmu-coupling-contract'
    );
    expect(result.manifest.ports.some((port) => port.name === 'pipe.output.flow')).toBe(true);
  });

  it('serializes through compile and helper APIs', () => {
    const compiler = new FMUCompiler({ mode: 'co-simulation' });
    const raw = compiler.compile(composition());
    const parsed = JSON.parse(raw);
    const helper = compileToFMU(composition(), { mode: 'model-exchange' });

    expect(parsed.target).toBe('fmu');
    expect(helper.manifest.mode).toBe('model-exchange');
    expect(helper.files['binaries/README.md']).toContain('FMI 3.0');
  });

  it('absorbs modelDescription.xml into an @fmu wrapper composition', () => {
    const result = absorbFMU({
      source: 'pump.fmu',
      modelDescriptionXml: `<?xml version="1.0"?>
<fmiModelDescription fmiVersion="3.0" modelName="Pump">
  <CoSimulation modelIdentifier="pump_cs"/>
  <ModelVariables>
    <Real name="rpm" valueReference="1" causality="input" variability="continuous"/>
    <Real name="flow" valueReference="2" causality="output" variability="continuous"/>
    <Real name="diameter" valueReference="3" causality="parameter" variability="fixed" start="0.2"/>
  </ModelVariables>
</fmiModelDescription>`,
    });

    expect(result.kind).toBe('holoscript-fmu-import');
    expect(result.traitConfig.modelIdentifier).toBe('pump_cs');
    expect(result.traitConfig.inputs.map((port) => port.name)).toEqual(['rpm']);
    expect(result.traitConfig.outputs.map((port) => port.name)).toEqual(['flow']);
    expect(result.composition.objects[0].traits[0].name).toBe('fmu');
  });

  it('tracks FMU trait coupling receipts deterministically', () => {
    const config: FMUConfig = {
      ...defaultFMUConfig,
      source: 'pump.fmu',
      modelIdentifier: 'pump_cs',
      inputs: [{ name: 'rpm' }],
      outputs: [{ name: 'flow' }],
    };
    const node = { type: 'Object', name: 'pump' } as any;
    const events: Array<{ event: string; payload: unknown }> = [];
    const context = {
      emit: (event: string, payload: unknown) => events.push({ event, payload }),
    } as any;

    fmuHandler.onAttach?.(node, config, context);
    fmuHandler.onEvent?.(node, config, context, {
      type: 'fmu:set_input',
      name: 'rpm',
      value: 1200,
    } as any);
    fmuHandler.onEvent?.(node, config, context, {
      type: 'fmu:set_output',
      name: 'flow',
      value: 0.42,
    } as any);
    fmuHandler.onUpdate?.(node, config, context, 0.02);

    const state = getFMUState(node);
    const first = createFMUCouplingReceipt(config, state, 0.02);
    const second = createFMUCouplingReceipt(config, state, 0.02);
    expect(state.currentStep).toBe(1);
    expect(first.receiptHash).toBe(second.receiptHash);
    expect(first.inputsHash).toHaveLength(64);
    expect(events.map((event) => event.event)).toEqual(['fmu:attached', 'fmu:coupling_step']);
  });
});
