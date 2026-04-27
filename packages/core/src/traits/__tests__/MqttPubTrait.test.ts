/**
 * MqttPubTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { mqttPubHandler } from '../MqttPubTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __mqttPubState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { broker_url: 'mqtt://localhost', default_qos: 1 as 0 | 1 | 2 };

describe('MqttPubTrait', () => {
  it('has name "mqtt_pub"', () => {
    expect(mqttPubHandler.name).toBe('mqtt_pub');
  });

  it('defaultConfig default_qos=1', () => {
    expect(mqttPubHandler.defaultConfig?.default_qos).toBe(1);
  });

  it('onAttach sets published=0', () => {
    const node = makeNode();
    mqttPubHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect((node.__mqttPubState as { published: number }).published).toBe(0);
  });

  it('mqtt:publish increments counter and emits mqtt:published', () => {
    const node = makeNode();
    mqttPubHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    mqttPubHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'mqtt:publish', topic: 'sensors/temp', payload: { t: 22 },
    } as never);
    expect((node.__mqttPubState as { published: number }).published).toBe(1);
    expect(node.emit).toHaveBeenCalledWith('mqtt:published', expect.objectContaining({ topic: 'sensors/temp' }));
  });
});
