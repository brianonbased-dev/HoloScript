/**
 * HITL Backend Service
 *
 * Production-grade backend integration for Human-in-the-Loop workflows.
 * Supports REST API, WebSocket real-time updates, and multi-storage backends.
 *
 * @version 3.3.0
 * @Sprint Sprint 3: Safety & Testing
 */

import { logger } from '../logger';

// =============================================================================
// TYPES
// =============================================================================

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'auto_approved';
export type ActionCategory =
  | 'read'
  | 'write'
  | 'execute'
  | 'delete'
  | 'transfer'
  | 'financial'
  | 'admin';
export type NotificationChannel = 'email' | 'slack' | 'webhook' | 'sms' | 'push';

export interface ApprovalRequest {
  id: string;
  timestamp: number;
  agentId: string;
  action: string;
  category: ActionCategory;
  description: string;
  confidence: number;
  riskScore: number;
  context: Record<string, unknown>;
  status: ApprovalStatus;
  approver?: string;
  approvalTime?: number;
  expiresAt: number;
  metadata: Record<string, unknown>;
}

export interface ApprovalResponse {
  success: boolean;
  requestId: string;
  status: ApprovalStatus;
  approver?: string;
  reason?: string;
  timestamp: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  agentId: string;
  action: string;
  decision: 'autonomous' | 'approved' | 'rejected' | 'escalated';
  confidence: number;
  riskScore: number;
  approver?: string;
  reason?: string;
  outcome?: 'success' | 'failure' | 'partial' | 'rollback';
  rollbackAvailable: boolean;
  rollbackId?: string;
  isViolation?: boolean;
  violations?: unknown[];
}

export interface HITLBackendConfig {
  /** API endpoint for approval requests */
  apiEndpoint: string;
  /** API key for authentication */
  apiKey?: string;
  /** WebSocket endpoint for real-time updates */
  wsEndpoint?: string;
  /** Request timeout in ms */
  timeout: number;
  /** Retry configuration */
  retry: {
    maxAttempts: number;
    backoffMs: number;
    maxBackoffMs: number;
  };
  /** Storage backend for audit logs */
  storage: StorageBackendConfig;
}

export interface StorageBackendConfig {
  type: 'indexeddb' | 'rest' | 'local' | 'memory';
  endpoint?: string;
  apiKey?: string;
  database?: string;
  collection?: string;
}

export interface NotificationConfig {
  channels: NotificationChannel[];
  email?: {
    provider: 'sendgrid' | 'ses' | 'smtp';
    from: string;
    apiKey?: string;
    smtpConfig?: {
      host: string;
      port: number;
      secure: boolean;
      auth: { user: string; pass: string };
    };
  };
  slack?: {
    webhookUrl: string;
    channel?: string;
    username?: string;
  };
  webhook?: {
    url: string;
    headers?: Record<string, string>;
    method?: 'POST' | 'PUT';
  };
  sms?: {
    provider: 'twilio' | 'messagebird';
    apiKey: string;
    from: string;
  };
}

// =============================================================================
// STORAGE BACKENDS
// =============================================================================

interface StorageBackend {
  save(entry: AuditLogEntry): Promise<void>;
  get(id: string): Promise<AuditLogEntry | null>;
  query(filter: AuditLogFilter): Promise<AuditLogEntry[]>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

export interface AuditLogFilter {
  agentId?: string;
  action?: string;
  decision?: 'autonomous' | 'approved' | 'rejected' | 'escalated';
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}

class IndexedDBStorage implements StorageBackend {
  private dbName = 'holoscript_hitl';
  private storeName = 'audit_logs';
  private db: IDBDatabase | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('agentId', 'agentId', { unique: false });
          store.createIndex('action', 'action', { unique: false });
          store.createIndex('decision', 'decision', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async save(entry: AuditLogEntry): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.put(entry);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async get(id: string): Promise<AuditLogEntry | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async query(filter: AuditLogFilter): Promise<AuditLogEntry[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        let results = request.result as AuditLogEntry[];

        // Apply filters
        if (filter.agentId) {
          results = results.filter((e) => e.agentId === filter.agentId);
        }
        if (filter.action) {
          results = results.filter((e) => e.action === filter.action);
        }
        if (filter.decision) {
          results = results.filter((e) => e.decision === filter.decision);
        }
        if (filter.startTime) {
          results = results.filter((e) => e.timestamp >= filter.startTime!);
        }
        if (filter.endTime) {
          results = results.filter((e) => e.timestamp <= filter.endTime!);
        }

        // Sort by timestamp descending
        results.sort((a, b) => b.timestamp - a.timestamp);

        // Apply pagination
        if (filter.offset) {
          results = results.slice(filter.offset);
        }
        if (filter.limit) {
          results = results.slice(0, filter.limit);
        }

        resolve(results);
      };
    });
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

class RESTStorage implements StorageBackend {
  constructor(
    private endpoint: string,
    private apiKey?: string
  ) {}

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async save(entry: AuditLogEntry): Promise<void> {
    const response = await fetch(`${this.endpoint}/audit`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(entry),
    });
    if (!response.ok) {
      throw new Error(`Failed to save audit entry: ${response.statusText}`);
    }
  }

  async get(id: string): Promise<AuditLogEntry | null> {
    const response = await fetch(`${this.endpoint}/audit/${id}`, {
      headers: this.getHeaders(),
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Failed to get audit entry: ${response.statusText}`);
    }
    return response.json();
  }

  async query(filter: AuditLogFilter): Promise<AuditLogEntry[]> {
    const params = new URLSearchParams();
    if (filter.agentId) params.set('agentId', filter.agentId);
    if (filter.action) params.set('action', filter.action);
    if (filter.decision) params.set('decision', filter.decision);
    if (filter.startTime) params.set('startTime', filter.startTime.toString());
    if (filter.endTime) params.set('endTime', filter.endTime.toString());
    if (filter.limit) params.set('limit', filter.limit.toString());
    if (filter.offset) params.set('offset', filter.offset.toString());

    const response = await fetch(`${this.endpoint}/audit?${params}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to query audit entries: ${response.statusText}`);
    }
    return response.json();
  }

  async delete(id: string): Promise<void> {
    const response = await fetch(`${this.endpoint}/audit/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to delete audit entry: ${response.statusText}`);
    }
  }

  async clear(): Promise<void> {
    const response = await fetch(`${this.endpoint}/audit`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to clear audit entries: ${response.statusText}`);
    }
  }
}

class MemoryStorage implements StorageBackend {
  private entries: Map<string, AuditLogEntry> = new Map();

  async save(entry: AuditLogEntry): Promise<void> {
    this.entries.set(entry.id, entry);
  }

  async get(id: string): Promise<AuditLogEntry | null> {
    return this.entries.get(id) || null;
  }

  async query(filter: AuditLogFilter): Promise<AuditLogEntry[]> {
    let results = Array.from(this.entries.values());

    if (filter.agentId) {
      results = results.filter((e) => e.agentId === filter.agentId);
    }
    if (filter.action) {
      results = results.filter((e) => e.action === filter.action);
    }
    if (filter.decision) {
      results = results.filter((e) => e.decision === filter.decision);
    }
    if (filter.startTime) {
      results = results.filter((e) => e.timestamp >= filter.startTime!);
    }
    if (filter.endTime) {
      results = results.filter((e) => e.timestamp <= filter.endTime!);
    }

    results.sort((a, b) => b.timestamp - a.timestamp);

    if (filter.offset) {
      results = results.slice(filter.offset);
    }
    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  async delete(id: string): Promise<void> {
    this.entries.delete(id);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}

// =============================================================================
// BACKEND SERVICE
// =============================================================================

export class HITLBackendService {
  private config: HITLBackendConfig;
  private storage: StorageBackend;
  private ws: WebSocket | null = null;
  private pendingRequests: Map<
    string,
    {
      resolve: (r: ApprovalResponse) => void;
      reject: (e: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  > = new Map();
  private eventListeners: Map<string, Set<(data: unknown) => void>> = new Map();

  constructor(config: Partial<HITLBackendConfig> = {}) {
    this.config = {
      apiEndpoint: config.apiEndpoint || '',
      apiKey: config.apiKey,
      wsEndpoint: config.wsEndpoint,
      timeout: config.timeout || 30000,
      retry: config.retry || {
        maxAttempts: 3,
        backoffMs: 1000,
        maxBackoffMs: 10000,
      },
      storage: config.storage || { type: 'memory' },
    };

    // Initialize storage backend
    this.storage = this.createStorage(this.config.storage);
  }

  private createStorage(config: StorageBackendConfig): StorageBackend {
    switch (config.type) {
      case 'indexeddb':
        if (typeof indexedDB === 'undefined') {
          logger.warn('[HITLBackend] IndexedDB not available, falling back to memory');
          return new MemoryStorage();
        }
        return new IndexedDBStorage();
      case 'rest':
        if (!config.endpoint) {
          throw new Error('REST storage requires endpoint');
        }
        return new RESTStorage(config.endpoint, config.apiKey);
      case 'memory':
      default:
        return new MemoryStorage();
    }
  }

  /**
   * Connect to WebSocket for real-time approval updates
   */
  async connect(): Promise<void> {
    if (!this.config.wsEndpoint) {
      logger.warn('[HITLBackend] No WebSocket endpoint configured');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.wsEndpoint!);

        this.ws.onopen = () => {
          logger.info('[HITLBackend] WebSocket connected');
          resolve();
        };

        this.ws.onclose = () => {
          logger.info('[HITLBackend] WebSocket disconnected');
          this.emit('disconnected', {});
        };

        this.ws.onerror = (error) => {
          logger.error('[HITLBackend] WebSocket error', { error: String(error) });
          reject(new Error('WebSocket connection failed'));
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (err) {
            logger.error('[HITLBackend] Failed to parse message', { error: String(err) });
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Submit an approval request
   */
  async submitApprovalRequest(request: ApprovalRequest): Promise<ApprovalResponse> {
    // Try WebSocket first for real-time (if available in environment)
    if (typeof WebSocket !== 'undefined' && this.ws?.readyState === WebSocket.OPEN) {
      return this.submitViaWebSocket(request);
    }

    // Fallback to REST API
    return this.submitViaREST(request);
  }

  private async submitViaWebSocket(request: ApprovalRequest): Promise<ApprovalResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error('Approval request timeout'));
      }, this.config.timeout);

      this.pendingRequests.set(request.id, { resolve, reject, timeout });

      this.ws!.send(
        JSON.stringify({
          type: 'approval_request',
          payload: request,
        })
      );
    });
  }

  private async submitViaREST(request: ApprovalRequest): Promise<ApprovalResponse> {
    if (!this.config.apiEndpoint) {
      // Local-only mode - immediately return pending
      return {
        success: true,
        requestId: request.id,
        status: 'pending',
        timestamp: Date.now(),
      };
    }

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < this.config.retry.maxAttempts) {
      try {
        const response = await fetch(`${this.config.apiEndpoint}/approvals`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
          },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(this.config.timeout),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
        }

        return await response.json();
      } catch (err) {
        lastError = err as Error;
        attempt++;
        if (attempt < this.config.retry.maxAttempts) {
          const backoff = Math.min(
            this.config.retry.backoffMs * Math.pow(2, attempt),
            this.config.retry.maxBackoffMs
          );
          await this.sleep(backoff);
        }
      }
    }

    throw lastError || new Error('Failed to submit approval request');
  }

  /**
   * Get approval status
   */
  async getApprovalStatus(requestId: string): Promise<ApprovalResponse | null> {
    if (!this.config.apiEndpoint) {
      return null;
    }

    const response = await fetch(`${this.config.apiEndpoint}/approvals/${requestId}`, {
      headers: {
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Failed to get approval status: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Log audit entry
   */
  async logAuditEntry(entry: Partial<AuditLogEntry>): Promise<void> {
    const fullEntry: AuditLogEntry = {
      id: entry.id || `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: entry.timestamp || Date.now(),
      agentId: entry.agentId || 'unknown',
      action: entry.action || 'unknown',
      decision: entry.decision || 'autonomous',
      confidence: entry.confidence ?? 0,
      riskScore: entry.riskScore ?? 0,
      rollbackAvailable: entry.rollbackAvailable ?? false,
      rollbackId: entry.rollbackId,
      approver: entry.approver,
      reason: entry.reason,
      outcome: entry.outcome,
      isViolation: entry.isViolation,
      violations: entry.violations,
    };
    await this.storage.save(fullEntry);
  }

  /**
   * Query audit logs
   */
  async queryAuditLogs(filter: AuditLogFilter = {}): Promise<AuditLogEntry[]> {
    return this.storage.query(filter);
  }

  /**
   * Get audit entry by ID
   */
  async getAuditEntry(id: string): Promise<AuditLogEntry | null> {
    return this.storage.get(id);
  }

  /**
   * Clear all audit logs (mainly for testing)
   */
  async clearAuditLogs(): Promise<void> {
    return this.storage.clear();
  }

  /**
   * Execute rollback
   */
  async executeRollback(checkpointId: string, agentId: string): Promise<boolean> {
    if (!this.config.apiEndpoint) {
      logger.warn('[HITLBackend] Rollback requires API endpoint');
      return false;
    }

    const response = await fetch(`${this.config.apiEndpoint}/rollback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify({ checkpointId, agentId }),
    });

    return response.ok;
  }

  /**
   * Subscribe to events
   */
  on(event: string, callback: (data: unknown) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Unsubscribe from events
   */
  off(event: string, callback: (data: unknown) => void): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: unknown): void {
    this.eventListeners.get(event)?.forEach((cb) => cb(data));
  }

  private handleMessage(message: { type: string; payload: unknown }): void {
    switch (message.type) {
      case 'approval_response': {
        const response = message.payload as ApprovalResponse;
        const pending = this.pendingRequests.get(response.requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(response.requestId);
          pending.resolve(response);
        }
        this.emit('approval_response', response);
        break;
      }
      case 'approval_update': {
        this.emit('approval_update', message.payload);
        break;
      }
      default:
        this.emit(message.type, message.payload);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let hitlBackendInstance: HITLBackendService | null = null;

export function getHITLBackend(config?: Partial<HITLBackendConfig>): HITLBackendService {
  if (!hitlBackendInstance) {
    hitlBackendInstance = new HITLBackendService(config);
  }
  return hitlBackendInstance;
}

export function configureHITLBackend(config: Partial<HITLBackendConfig>): void {
  hitlBackendInstance = new HITLBackendService(config);
}
