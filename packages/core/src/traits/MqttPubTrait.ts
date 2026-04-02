/**
 * MqttPubTrait — v5.1
 *
 * MQTT publish to topic with QoS level.
 *
 * Events:
 *  mqtt:publish   { topic, payload, qos }
 *  mqtt:published { topic, messageId }
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface MqttPubConfig {
  broker_url: string;
  default_qos: 0 | 1 | 2;
}

export const mqttPubHandler: TraitHandler<MqttPubConfig> = {
  name: 'mqtt_pub',
  defaultConfig: { broker_url: '', default_qos: 1 },

  onAttach(node: HSPlusNode): void {
    node.__mqttPubState = { published: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__mqttPubState;
  },
  onUpdate(): void {},

  onEvent(node: HSPlusNode, config: MqttPubConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__mqttPubState as { published: number } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 'mqtt:publish') {
      state.published++;
      context.emit?.('mqtt:published', {
        topic: event.topic,
        messageId: `mqtt_${Date.now()}`,
        qos: (event.qos as number) ?? config.default_qos,
      });
    }
  },
};

export default mqttPubHandler;
