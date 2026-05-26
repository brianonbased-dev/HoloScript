/**
 * MqttPubTrait — v5.1
 *
 * MQTT publish to topic with QoS level.
 *
 * WIRING SPEC (2026-05-25 deep-ratchet):
 * Current implementation echoes mqtt:published with a fake messageId.
 * Real wiring requires:
 *   1. MQTT client library (`mqtt` npm package or `aedes` for embedded broker)
 *   2. Persistent broker connection managed in onAttach / onDetach lifecycle
 *   3. Configurable broker_url, client_id, username, password, tls options
 *   4. QoS 1/2 handshake for delivery assurance
 *   5. Emit mqtt:published with real broker-assigned messageId on PUBACK
 *   6. Emit mqtt:error on connection/publish failure
 * RISK: Broker credential exposure + connection lifecycle management must be
 * design-reviewed before production wiring.
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
