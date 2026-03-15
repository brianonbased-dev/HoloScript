/**
 * Communication Traits
 *
 * Outbound messaging primitives for compositions — email, SMS, push
 * notifications, chat integrations (Slack/Discord), MQTT publish, and
 * Server-Sent Events.
 *
 * @version 1.0.0
 */
export const COMMUNICATION_TRAITS = [
  // ─── Messaging ────────────────────────────────────────────────────
  'email',               // SMTP email send with templates + attachments
  'sms',                 // SMS delivery via provider abstraction
  'push_notification',   // Mobile / web push notifications

  // ─── Chat Integrations ────────────────────────────────────────────
  'slack',               // Slack webhook / incoming message
  'discord',             // Discord webhook / bot message

  // ─── Pub/Sub & Streaming ──────────────────────────────────────────
  'mqtt_pub',            // MQTT publish to topic with QoS
  'sse',                 // Server-Sent Events endpoint
] as const;

export type CommunicationTraitName = (typeof COMMUNICATION_TRAITS)[number];
