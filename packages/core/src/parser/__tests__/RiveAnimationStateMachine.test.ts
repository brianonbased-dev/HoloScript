import { describe, expect, it } from 'vitest';
import { parseHolo } from '../HoloCompositionParser';
import { HoloScriptPlusParser } from '../HoloScriptPlusParser';
import { animationConfigFromStateMachine } from '../../traits/AnimationStateMachineAuthoring';

describe('Rive animation state-machine authoring', () => {
  it('parses .holo typed inputs and transition clauses into animation config', () => {
    const result = parseHolo(`
      composition "Avatar" {
        @state_machine Locomotion {
          initial: "Idle"
          input grounded: bool = true
          input speed: number = 0
          input hovering: bool = false
          input jump: trigger
          listen pointer.enter -> hovering = true
          listen pointer.exit -> hovering = false
          listen control.jump -> fire jump
          listen agent.speed -> speed = event.value

          state "Idle" {}
          state "Walk" {}
          state "Jump" {}
          state "LocomotionBlend" {
            clips: ["idle", "walk", "run"]
            parameter: speed
            thresholds: [0, 1, 3]
            blendType: "1d"
            blendMode: "additive"
            mask: ["hips", "spine"]
          }

          Idle -> Walk when speed > 0.15 over 0.2 easing spring
          Walk -> Idle when speed <= 0.15 over 0.12 easing bounce
          Any -> Jump on jump exitTime 0.05 priority 10 pauseWhenExiting
        }
      }
    `);

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.ast?.stateMachines).toHaveLength(1);

    const stateMachine = result.ast!.stateMachines[0];
    expect(stateMachine.name).toBe('Locomotion');
    expect(stateMachine.inputs).toEqual([
      expect.objectContaining({ name: 'grounded', inputType: 'bool', default: true }),
      expect.objectContaining({ name: 'speed', inputType: 'float', rawType: 'number', default: 0 }),
      expect.objectContaining({ name: 'hovering', inputType: 'bool', default: false }),
      expect.objectContaining({ name: 'jump', inputType: 'trigger' }),
    ]);
    expect(stateMachine.listeners).toEqual([
      expect.objectContaining({
        event: 'pointer.enter',
        parameter: 'hovering',
        action: 'set',
        value: true,
      }),
      expect.objectContaining({
        event: 'pointer.exit',
        parameter: 'hovering',
        action: 'set',
        value: false,
      }),
      expect.objectContaining({
        event: 'control.jump',
        parameter: 'jump',
        action: 'fire',
      }),
      expect.objectContaining({
        event: 'agent.speed',
        parameter: 'speed',
        action: 'set',
        source: 'event.value',
      }),
    ]);

    expect(stateMachine.transitions).toEqual([
      expect.objectContaining({
        from: 'Idle',
        target: 'Walk',
        duration: 0.2,
        easing: 'spring',
        conditions: [expect.objectContaining({ parameter: 'speed', operator: '>', value: 0.15 })],
      }),
      expect.objectContaining({
        from: 'Walk',
        target: 'Idle',
        duration: 0.12,
        easing: 'bounce',
        conditions: [expect.objectContaining({ parameter: 'speed', operator: '<=', value: 0.15 })],
      }),
      expect.objectContaining({
        from: 'any',
        target: 'Jump',
        event: 'jump',
        exitTime: 0.05,
        hasExitTime: true,
        priority: 10,
        pauseWhenExiting: true,
        conditions: [expect.objectContaining({ parameter: 'jump', operator: '==', value: true })],
      }),
    ]);

    const config = animationConfigFromStateMachine(stateMachine);
    expect(config.defaultState).toBe('Idle');
    expect(config.parameters).toEqual([
      { name: 'grounded', type: 'bool', value: true, default: true },
      { name: 'speed', type: 'float', value: 0, default: 0 },
      { name: 'hovering', type: 'bool', value: false, default: false },
      { name: 'jump', type: 'trigger', value: false, default: false },
    ]);
    expect(config.inputBindings).toEqual([
      { event: 'pointer.enter', parameter: 'hovering', action: 'set', value: true },
      { event: 'pointer.exit', parameter: 'hovering', action: 'set', value: false },
      { event: 'control.jump', parameter: 'jump', action: 'fire' },
      { event: 'agent.speed', parameter: 'speed', action: 'set', source: 'event.value' },
    ]);
    expect(config.transitions?.[2]).toEqual(
      expect.objectContaining({
        from: 'any',
        to: 'Jump',
        exitTime: 0.05,
        hasExitTime: true,
        pauseWhenExiting: true,
        priority: 10,
      })
    );
    expect(config.states).toContainEqual(
      expect.objectContaining({
        name: 'LocomotionBlend',
        clips: ['idle', 'walk', 'run'],
        parameter: 'speed',
        thresholds: [0, 1, 3],
        blendType: '1d',
        blendMode: 'additive',
        mask: ['hips', 'spine'],
      })
    );
  });

  it('preserves .hsplus typed inputs and transition clauses on state-machine AST', () => {
    const parser = new HoloScriptPlusParser({ enableVRTraits: true });
    const result = parser.parse(`
      state_machine Locomotion {
        initial: Idle
        input grounded: bool = true
        input speed: number = 0
        input hovering: bool = false
        input jump: trigger
        listen pointer.enter -> hovering = true
        listen pointer.exit -> hovering = false
        listen control.jump -> fire jump
        listen agent.speed -> speed = event.value

        state Idle {}
        state Walk {}
        state Jump {}
        state LocomotionBlend {
          clips: ["idle", "walk", "run"]
          parameter: speed
          thresholds: [0, 1, 3]
          blend: "1d"
          blendMode: "additive"
          mask: ["hips", "spine"]
        }

        Idle -> Walk when speed > 0.15 over 0.2 easing spring
        Any -> Jump on jump exitTime 0.05 priority 10 pauseWhenExiting
      }
    `);

    expect(result.success).toBe(true);

    const stateMachine = result.ast.root as unknown as {
      type: string;
      name: string;
      inputs: Array<Record<string, unknown>>;
      listeners: Array<Record<string, unknown>>;
      transitions: Array<Record<string, unknown>>;
      states: Array<Record<string, unknown>>;
    };
    expect(stateMachine.type).toBe('state-machine');
    expect(stateMachine.name).toBe('Locomotion');
    expect(stateMachine.inputs).toEqual([
      expect.objectContaining({ name: 'grounded', inputType: 'bool', default: true }),
      expect.objectContaining({ name: 'speed', inputType: 'float', rawType: 'number', default: 0 }),
      expect.objectContaining({ name: 'hovering', inputType: 'bool', default: false }),
      expect.objectContaining({ name: 'jump', inputType: 'trigger' }),
    ]);
    expect(stateMachine.listeners).toEqual([
      expect.objectContaining({
        event: 'pointer.enter',
        parameter: 'hovering',
        action: 'set',
        value: true,
      }),
      expect.objectContaining({
        event: 'pointer.exit',
        parameter: 'hovering',
        action: 'set',
        value: false,
      }),
      expect.objectContaining({
        event: 'control.jump',
        parameter: 'jump',
        action: 'fire',
      }),
      expect.objectContaining({
        event: 'agent.speed',
        parameter: 'speed',
        action: 'set',
        source: 'event.value',
      }),
    ]);
    expect(stateMachine.transitions).toEqual([
      expect.objectContaining({
        from: 'Idle',
        to: 'Walk',
        duration: 0.2,
        easing: 'spring',
      }),
      expect.objectContaining({
        from: 'any',
        to: 'Jump',
        event: 'jump',
        exitTime: 0.05,
        hasExitTime: true,
        priority: 10,
        pauseWhenExiting: true,
      }),
    ]);
    expect(stateMachine.states).toContainEqual(
      expect.objectContaining({
        name: 'LocomotionBlend',
        clips: ['idle', 'walk', 'run'],
        parameter: expect.objectContaining({ __ref: 'speed' }),
        thresholds: [0, 1, 3],
        blend: '1d',
        blendMode: 'additive',
        mask: ['hips', 'spine'],
      })
    );
  });
});
