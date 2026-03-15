/**
 * Notification / Alerting Traits
 * @version 1.0.0
 */
export const NOTIFICATION_ALERTING_TRAITS = [
  'webhook_out',        // Outbound webhook delivery
  'pagerduty',          // PagerDuty incident alerting
  'slack_alert',        // Slack channel alerting
] as const;

export type NotificationAlertingTraitName = (typeof NOTIFICATION_ALERTING_TRAITS)[number];
