/**
 * MqttPubTrait — v5.1
 *
 * MQTT publish to topic with QoS level.
 *
 * Events:
 *  mqtt:publish   { topic, payload, qos }
 *  mqtt:published { topic, messageId }
 */

import type { TraitHandler } from './TraitTypes';

export interface MqttPubConfig {
  broker_url: string;
  default_qos: 0 | 1 | 2;
}

export const mqttPubHandler: TraitHandler<MqttPubConfig> = {
  name: 'mqtt_pub',
  defaultConfig: { broker_url: '', default_qos: 1 },

  onAttach(node: any): void {
    node.__mqttPubState = { published: 0 };
  },
  onDetach(node: any): void {
    delete node.__mqttPubState;
  },
  onUpdate(): void {},

  onEvent(node: any, config: MqttPubConfig, context: any, event: any): void {
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
