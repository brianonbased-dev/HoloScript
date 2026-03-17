/**
 * Alert Trait
 *
 * Trigger alerts based on sensor thresholds or conditions.
 * Supports visual, audio, and haptic notifications.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type Severity = 'info' | 'warning' | 'error' | 'critical';
type VisualEffect = 'pulse' | 'flash' | 'glow' | 'shake' | 'outline' | 'none';

interface AlertState {
  isTriggered: boolean;
  lastTriggerTime: number;
  triggerCount: number;
  activeAlerts: Map<string, AlertInstance>;
  isOnCooldown: boolean;
}

interface AlertInstance {
  id: string;
  severity: Severity;
  message: string;
  timestamp: number;
  acknowledged: boolean;
}

interface AlertConfig {
  condition: string; // Expression to evaluate
  severity: Severity;
  visual_effect: VisualEffect;
  sound: string;
  haptic: boolean;
  notification: boolean;
  cooldown: number; // ms
  auto_dismiss: number; // 0 = no auto-dismiss
  max_active: number;
  message_template: string;
}

// =============================================================================
// HANDLER
// =============================================================================

export const alertHandler: TraitHandler<AlertConfig> = {
  name: 'alert',

  defaultConfig: {
    condition: '',
    severity: 'warning',
    visual_effect: 'pulse',
    sound: '',
    haptic: true,
    notification: true,
    cooldown: 5000,
    auto_dismiss: 0,
    max_active: 5,
    message_template: 'Alert triggered',
  },

  onAttach(node, _config, _context) {
    const state: AlertState = {
      isTriggered: false,
      lastTriggerTime: 0,
      triggerCount: 0,
      activeAlerts: new Map(),
      isOnCooldown: false,
    };
    node.__alertState = state;
  },

  onDetach(node, config, context) {
    const state = node.__alertState as AlertState;
    if (state?.activeAlerts.size > 0) {
      context.emit?.('alert_dismiss_all', { node });
    }
    delete node.__alertState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__alertState as AlertState;
    if (!state) return;

    // Check cooldown
    if (state.isOnCooldown) {
      const now = Date.now();
      if (now - state.lastTriggerTime >= config.cooldown) {
        state.isOnCooldown = false;
      }
    }

    // Auto-dismiss expired alerts
    if (config.auto_dismiss > 0) {
      const now = Date.now();
      for (const [id, alert] of state.activeAlerts) {
        if (now - alert.timestamp >= config.auto_dismiss) {
          state.activeAlerts.delete(id);
          context.emit?.('alert_dismissed', { node, alertId: id });
        }
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__alertState as AlertState;
    if (!state) return;

    if (event.type === 'alert_trigger') {
      // Check cooldown
      if (state.isOnCooldown) {
        return;
      }

      // Check max active alerts
      if (state.activeAlerts.size >= config.max_active) {
        context.emit?.('alert_rejected', {
          node,
          reason: 'max_active_reached',
        });
        return;
      }

      const alertId = (event.id as string) || `alert_${Date.now()}`;
      const message = (event.message as string) || config.message_template;
      const severity = (event.severity as Severity) || config.severity;

      const alert: AlertInstance = {
        id: alertId,
        severity,
        message,
        timestamp: Date.now(),
        acknowledged: false,
      };

      state.activeAlerts.set(alertId, alert);
      state.isTriggered = true;
      state.lastTriggerTime = Date.now();
      state.triggerCount++;
      state.isOnCooldown = true;

      // Visual effect
      if (config.visual_effect !== 'none') {
        context.emit?.('alert_visual_effect', {
          node,
          effect: config.visual_effect,
          severity,
        });
      }

      // Sound
      if (config.sound) {
        context.emit?.('alert_play_sound', {
          node,
          sound: config.sound,
          severity,
        });
      }

      // Haptic
      if (config.haptic) {
        const intensity =
          severity === 'critical'
            ? 1.0
            : severity === 'error'
              ? 0.8
              : severity === 'warning'
                ? 0.5
                : 0.3;
        context.emit?.('alert_haptic', {
          node,
          intensity,
          duration: 200,
        });
      }

      // Notification
      if (config.notification) {
        context.emit?.('alert_notification', {
          node,
          alertId,
          message,
          severity,
        });
      }

      context.emit?.('on_alert_triggered', {
        node,
        alertId,
        severity,
        message,
        triggerCount: state.triggerCount,
      });
    } else if (event.type === 'alert_acknowledge') {
      const alertId = event.alertId as string;
      const alert = state.activeAlerts.get(alertId);

      if (alert) {
        alert.acknowledged = true;
        context.emit?.('on_alert_acknowledged', { node, alertId });
      }
    } else if (event.type === 'alert_dismiss') {
      const alertId = event.alertId as string;

      if (state.activeAlerts.has(alertId)) {
        state.activeAlerts.delete(alertId);

        if (state.activeAlerts.size === 0) {
          state.isTriggered = false;
        }

        context.emit?.('alert_dismissed', { node, alertId });
        context.emit?.('on_alert_cleared', { node, alertId });
      }
    } else if (event.type === 'alert_dismiss_all') {
      const count = state.activeAlerts.size;
      state.activeAlerts.clear();
      state.isTriggered = false;

      context.emit?.('on_alerts_cleared', { node, count });
    } else if (event.type === 'alert_check_condition') {
      // External system checked condition and reports result
      const conditionMet = event.result as boolean;

      if (conditionMet && !state.isOnCooldown) {
        context.emit?.('alert_trigger', {
          node,
          message: config.message_template,
          severity: config.severity,
        });
      }
    } else if (event.type === 'alert_query') {
      context.emit?.('alert_info', {
        queryId: event.queryId,
        node,
        isTriggered: state.isTriggered,
        activeCount: state.activeAlerts.size,
        triggerCount: state.triggerCount,
        isOnCooldown: state.isOnCooldown,
        activeAlerts: Array.from(state.activeAlerts.values()),
      });
    }
  },
};

export default alertHandler;
