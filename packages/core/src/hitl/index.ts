/**
 * HITL Module Exports
 *
 * @version 3.3.0
 * @Sprint Sprint 3: Safety & Testing
 */

export {
  // Backend Service
  HITLBackendService,
  getHITLBackend,
  configureHITLBackend,
  type HITLBackendConfig,
  type StorageBackendConfig,
  type ApprovalRequest,
  type ApprovalResponse,
  type AuditLogEntry,
  type AuditLogFilter,
  type ApprovalStatus,
  type ActionCategory,
  type NotificationChannel,
} from './HITLBackendService';

export {
  // Notification Service
  HITLNotificationService,
  getNotificationService,
  configureNotifications,
  type NotificationServiceConfig,
  type NotificationPayload,
  type NotificationResult,
  type EmailConfig,
  type SlackConfig,
  type WebhookConfig,
  type SMSConfig,
  type PushConfig,
} from './NotificationService';
