/**
 * PushNotificationTrait — v5.1
 *
 * Mobile / web push notification delivery.
 *
 * Events:
 *  push:send      { token, title, body, data }
 *  push:sent      { token, notificationId }
 *  push:error     { token, error }
 */

import type { TraitHandler } from './TraitTypes';

export interface PushNotificationConfig {
  platform: 'fcm' | 'apns' | 'web';
  max_batch: number;
}

export const pushNotificationHandler: TraitHandler<PushNotificationConfig> = {
  name: 'push_notification',
  defaultConfig: { platform: 'fcm', max_batch: 500 },

  onAttach(node: any): void {
    node.__pushState = { sent: 0 };
  },
  onDetach(node: any): void { delete node.__pushState; },
  onUpdate(): void {},

  onEvent(node: any, config: PushNotificationConfig, context: any, event: any): void {
    const state = node.__pushState as { sent: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    if (t === 'push:send') {
      state.sent++;
      context.emit?.('push:sent', {
        token: event.token,
        notificationId: `push_${Date.now()}`,
        platform: config.platform,
        title: event.title,
      });
    }
  },
};

export default pushNotificationHandler;
