import { describe, it, expect, vi } from 'vitest';
import {
  BaseService,
  ServiceLifecycle,
  ServiceErrorCode,
  ServiceError,
  ServiceManager,
} from '../protocol/implementations';
import type { ServiceMetadata, ServiceConfig } from '../protocol/implementations';

// ── Concrete test service ──

class TestService extends BaseService {
  public initCalled = false;
  public readyCalled = false;
  public stopCalled = false;
  public failOnInit = false;

  constructor(name: string, config?: Partial<ServiceConfig>) {
    super({ name, version: '1.0.0', description: `Test service: ${name}` }, config);
  }

  protected override async onInit(): Promise<void> {
    if (this.failOnInit) throw new Error('init failed');
    this.initCalled = true;
  }

  protected override async onReady(): Promise<void> {
    this.readyCalled = true;
  }

  protected override async onStop(): Promise<void> {
    this.stopCalled = true;
  }

  /** Expose executeWithMetrics for testing */
  async doWork(shouldFail = false): Promise<string> {
    return this.executeWithMetrics(async () => {
      if (shouldFail) throw new Error('work failed');
      return 'done';
    });
  }
}

// =============================================================================
// BaseService
// =============================================================================

describe('BaseService', () => {
  it('initializes through lifecycle states', async () => {
    const svc = new TestService('alpha');
    expect(svc.getMetadata().lifecycle).toBe(ServiceLifecycle.INITIALIZING);
    expect(svc.isReady()).toBe(false);

    await svc.initialize();

    expect(svc.initCalled).toBe(true);
    expect(svc.readyCalled).toBe(true);
    expect(svc.isReady()).toBe(true);
    expect(svc.getMetadata().lifecycle).toBe(ServiceLifecycle.READY);
    expect(svc.getMetadata().initializedAt).toBeInstanceOf(Date);
    expect(svc.getMetadata().readyAt).toBeInstanceOf(Date);
  });

  it('stops cleanly', async () => {
    const svc = new TestService('beta');
    await svc.initialize();
    await svc.stop();

    expect(svc.stopCalled).toBe(true);
    expect(svc.isReady()).toBe(false);
    expect(svc.getMetadata().lifecycle).toBe(ServiceLifecycle.STOPPED);
  });

  it('stop is idempotent', async () => {
    const svc = new TestService('gamma');
    await svc.initialize();
    await svc.stop();
    await svc.stop(); // second call should be a no-op
    expect(svc.getMetadata().lifecycle).toBe(ServiceLifecycle.STOPPED);
  });

  it('records request metrics via executeWithMetrics', async () => {
    const svc = new TestService('delta');
    await svc.initialize();
    const result = await svc.doWork();

    expect(result).toBe('done');
    expect(svc.getMetrics().requestCount).toBe(1);
    expect(svc.getMetrics().errorCount).toBe(0);
    expect(svc.getMetrics().lastRequestAt).toBeInstanceOf(Date);
  });

  it('records error metrics on failure', async () => {
    const svc = new TestService('epsilon');
    await svc.initialize();

    await expect(svc.doWork(true)).rejects.toThrow('work failed');
    expect(svc.getMetrics().errorCount).toBe(1);
    expect(svc.getMetrics().lastErrorAt).toBeInstanceOf(Date);
  });

  it('uses default config values', () => {
    const svc = new TestService('zeta');
    const meta = svc.getMetadata();
    expect(meta.name).toBe('zeta');
    expect(meta.version).toBe('1.0.0');
  });

  it('merges custom config', () => {
    const svc = new TestService('eta', { timeout: 5000, retries: 1 });
    // Config is internal but we verify the service constructs without error
    expect(svc.getMetadata().name).toBe('eta');
  });
});

// =============================================================================
// ServiceLifecycle enum
// =============================================================================

describe('ServiceLifecycle', () => {
  it('has all expected states', () => {
    expect(ServiceLifecycle.INITIALIZING).toBe('initializing');
    expect(ServiceLifecycle.READY).toBe('ready');
    expect(ServiceLifecycle.DEGRADED).toBe('degraded');
    expect(ServiceLifecycle.STOPPING).toBe('stopping');
    expect(ServiceLifecycle.STOPPED).toBe('stopped');
    expect(ServiceLifecycle.ERROR).toBe('error');
  });
});

// =============================================================================
// ServiceError
// =============================================================================

describe('ServiceError', () => {
  it('creates with code and message', () => {
    const err = new ServiceError(ServiceErrorCode.NOT_FOUND, 'Resource missing', 404);
    expect(err.code).toBe(ServiceErrorCode.NOT_FOUND);
    expect(err.message).toBe('Resource missing');
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe('ServiceError');
  });

  it('defaults to status 500', () => {
    const err = new ServiceError(ServiceErrorCode.INTERNAL_ERROR, 'boom');
    expect(err.statusCode).toBe(500);
  });

  it('carries optional details', () => {
    const err = new ServiceError(ServiceErrorCode.VALIDATION_ERROR, 'bad input', 400, { field: 'name' });
    expect(err.details).toEqual({ field: 'name' });
  });
});

// =============================================================================
// ServiceManager
// =============================================================================

describe('ServiceManager', () => {
  it('starts and stops services in correct order', async () => {
    const order: string[] = [];
    class OrderedService extends BaseService {
      constructor(name: string) {
        super({ name, version: '1.0.0', description: name });
      }
      protected override async onInit() { order.push(`init:${this.getMetadata().name}`); }
      protected override async onStop() { order.push(`stop:${this.getMetadata().name}`); }
    }

    const mgr = new ServiceManager();
    mgr.register(new OrderedService('db'));
    mgr.register(new OrderedService('cache'));
    mgr.register(new OrderedService('api'));

    await mgr.startAll();
    expect(order).toEqual(['init:db', 'init:cache', 'init:api']);

    order.length = 0;
    await mgr.stopAll();
    // Services stop in reverse order
    expect(order).toEqual(['stop:api', 'stop:cache', 'stop:db']);
  });

  it('reports aggregate health', async () => {
    const mgr = new ServiceManager();
    const svcA = new TestService('a');
    const svcB = new TestService('b');
    mgr.register(svcA);
    mgr.register(svcB);

    // Before starting
    let h = mgr.health();
    expect(h.totalServices).toBe(2);
    expect(h.readyCount).toBe(0);
    expect(h.allReady).toBe(false);

    await mgr.startAll();
    h = mgr.health();
    expect(h.readyCount).toBe(2);
    expect(h.allReady).toBe(true);
    expect(h.services).toHaveLength(2);
    expect(h.services[0].name).toBe('a');
    expect(h.services[0].ready).toBe(true);
  });

  it('tracks size', () => {
    const mgr = new ServiceManager();
    expect(mgr.size).toBe(0);
    mgr.register(new TestService('x'));
    expect(mgr.size).toBe(1);
  });

  it('prevents registration after startAll', async () => {
    const mgr = new ServiceManager();
    mgr.register(new TestService('first'));
    await mgr.startAll();
    expect(() => mgr.register(new TestService('late'))).toThrow('Cannot register');
  });

  it('handles empty manager', async () => {
    const mgr = new ServiceManager();
    await mgr.startAll();
    await mgr.stopAll();
    const h = mgr.health();
    expect(h.totalServices).toBe(0);
    expect(h.allReady).toBe(false);
  });

  it('propagates init errors', async () => {
    const mgr = new ServiceManager();
    const failing = new TestService('broken');
    failing.failOnInit = true;
    mgr.register(failing);
    await expect(mgr.startAll()).rejects.toThrow('init failed');
  });
});
