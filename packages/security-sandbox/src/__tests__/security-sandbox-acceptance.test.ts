/**
 * @holoscript/security-sandbox acceptance tests
 * Covers: HoloScriptSandbox constructor/options, executeHoloScript,
 *         audit logs, security stats, executeSafely convenience function
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  HoloScriptSandbox,
  executeSafely,
  type SandboxOptions,
  type SandboxResult,
  type SecurityAuditLog,
} from '../index';

const VALID_SCENE = `
  cube {
    @color(red)
    @position(0, 1, 0)
    @grabbable
  }
`;

const INVALID_SCENE = `
  cube {{{
    @invalid-trait***
  }
`;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Constructor & options
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('HoloScriptSandbox â€” constructor', () => {
  it('creates with default options', () => {
    const sandbox = new HoloScriptSandbox();
    expect(sandbox).toBeDefined();
  });

  it('creates with custom timeout', () => {
    const sandbox = new HoloScriptSandbox({ timeout: 1000 });
    expect(sandbox).toBeDefined();
  });

  it('creates with enableLogging: false', () => {
    const sandbox = new HoloScriptSandbox({ enableLogging: false });
    expect(sandbox).toBeDefined();
  });

  it('creates with allowedModules', () => {
    const sandbox = new HoloScriptSandbox({ allowedModules: [] });
    expect(sandbox).toBeDefined();
  });

  it('creates with memoryLimit', () => {
    const sandbox = new HoloScriptSandbox({ memoryLimit: 64 });
    expect(sandbox).toBeDefined();
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// executeHoloScript â€” result shape
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('HoloScriptSandbox â€” executeHoloScript result shape', () => {
  let sandbox: HoloScriptSandbox;

  beforeEach(() => {
    sandbox = new HoloScriptSandbox({ timeout: 2000, enableLogging: true });
  });

  it('returns SandboxResult with success field', async () => {
    const result = await sandbox.executeHoloScript(VALID_SCENE);
    expect(result).toHaveProperty('success');
    expect(typeof result.success).toBe('boolean');
  });

  it('returns metadata object', async () => {
    const result = await sandbox.executeHoloScript(VALID_SCENE);
    expect(result).toHaveProperty('metadata');
    expect(typeof result.metadata.executionTime).toBe('number');
    expect(typeof result.metadata.validated).toBe('boolean');
    expect(typeof result.metadata.source).toBe('string');
  });

  it('executionTime is non-negative', async () => {
    const result = await sandbox.executeHoloScript(VALID_SCENE);
    expect(result.metadata.executionTime).toBeGreaterThanOrEqual(0);
  });

  it('source defaults to "user"', async () => {
    const result = await sandbox.executeHoloScript(VALID_SCENE);
    expect(result.metadata.source).toBe('user');
  });

  it('source can be "ai-generated"', async () => {
    const result = await sandbox.executeHoloScript(VALID_SCENE, { source: 'ai-generated' });
    expect(result.metadata.source).toBe('ai-generated');
  });

  it('source can be "trusted"', async () => {
    const result = await sandbox.executeHoloScript(VALID_SCENE, { source: 'trusted' });
    expect(result.metadata.source).toBe('trusted');
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// executeHoloScript â€” valid code
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('HoloScriptSandbox â€” valid code', () => {
  let sandbox: HoloScriptSandbox;

  beforeEach(() => {
    sandbox = new HoloScriptSandbox({ timeout: 2000, enableLogging: true });
  });

  it('validated=true for valid HoloScript scene', async () => {
    // HoloScript syntax passes validation but is not runnable JS in the VM
    const result = await sandbox.executeHoloScript(VALID_SCENE, { source: 'user' });
    expect(result.metadata.validated).toBe(true);
  });

  it('validated=true on valid code', async () => {
    const result = await sandbox.executeHoloScript(VALID_SCENE);
    expect(result.metadata.validated).toBe(true);
  });

  it('succeeds on simple JS expression', async () => {
    const result = await sandbox.executeHoloScript<number>('2 + 2', { source: 'trusted' });
    expect(result.success).toBe(true);
    expect(result.data).toBe(4);
  });

  it('validated=true implies HoloScript parsing succeeded', async () => {
    // validated=true means parsing passed; vm2 may still fail on HS syntax as JS
    const result = await sandbox.executeHoloScript(VALID_SCENE);
    expect(result.metadata.validated).toBe(true);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// executeHoloScript â€” invalid code
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('HoloScriptSandbox â€” invalid code', () => {
  let sandbox: HoloScriptSandbox;

  beforeEach(() => {
    sandbox = new HoloScriptSandbox({ timeout: 2000, enableLogging: true });
  });

  it('rejects invalid HoloScript syntax', async () => {
    const result = await sandbox.executeHoloScript(INVALID_SCENE, { source: 'ai-generated' });
    expect(result.success).toBe(false);
  });

  it('error object present on failure', async () => {
    const result = await sandbox.executeHoloScript(INVALID_SCENE);
    if (!result.success) {
      expect(result.error).toBeDefined();
      expect(typeof result.error!.message).toBe('string');
      expect(result.error!.type).toBeDefined();
    }
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Audit logs
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('HoloScriptSandbox â€” audit logs', () => {
  it('getAuditLogs returns empty array initially', () => {
    const sandbox = new HoloScriptSandbox({ enableLogging: true });
    expect(sandbox.getAuditLogs()).toEqual([]);
  });

  it('getAuditLogs returns array type', () => {
    const sandbox = new HoloScriptSandbox();
    expect(Array.isArray(sandbox.getAuditLogs())).toBe(true);
  });

  it('logs accumulate after execution', async () => {
    const sandbox = new HoloScriptSandbox({ enableLogging: true });
    await sandbox.executeHoloScript(VALID_SCENE);
    expect(sandbox.getAuditLogs().length).toBeGreaterThan(0);
  });

  it('log entries have expected shape', async () => {
    const sandbox = new HoloScriptSandbox({ enableLogging: true });
    await sandbox.executeHoloScript(VALID_SCENE, { source: 'user' });
    const logs = sandbox.getAuditLogs();
    if (logs.length > 0) {
      const entry = logs[0];
      expect(typeof entry.timestamp).toBe('number');
      expect(typeof entry.source).toBe('string');
      expect(typeof entry.action).toBe('string');
      expect(typeof entry.success).toBe('boolean');
      expect(typeof entry.codeHash).toBe('string');
    }
  });

  it('clearAuditLogs empties the log', async () => {
    const sandbox = new HoloScriptSandbox({ enableLogging: true });
    await sandbox.executeHoloScript(VALID_SCENE);
    sandbox.clearAuditLogs();
    expect(sandbox.getAuditLogs()).toEqual([]);
  });

  it('no logs created when enableLogging=false', async () => {
    const sandbox = new HoloScriptSandbox({ enableLogging: false });
    await sandbox.executeHoloScript(VALID_SCENE);
    expect(sandbox.getAuditLogs()).toEqual([]);
  });

  it('filter by success=true returns only successes', async () => {
    const sandbox = new HoloScriptSandbox({ enableLogging: true });
    await sandbox.executeHoloScript(VALID_SCENE, { source: 'user' });
    const filtered = sandbox.getAuditLogs({ success: true });
    for (const entry of filtered) {
      expect(entry.success).toBe(true);
    }
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Security stats
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('HoloScriptSandbox â€” getSecurityStats', () => {
  it('returns stats object with expected fields', () => {
    const sandbox = new HoloScriptSandbox();
    const stats = sandbox.getSecurityStats();
    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('validated');
    expect(stats).toHaveProperty('rejected');
    expect(stats).toHaveProperty('executed');
    expect(stats).toHaveProperty('bySource');
  });

  it('initial stats are zero', () => {
    const sandbox = new HoloScriptSandbox({ enableLogging: true });
    const stats = sandbox.getSecurityStats();
    expect(stats.total).toBe(0);
    expect(stats.rejected).toBe(0);
    expect(stats.executed).toBe(0);
  });

  it('bySource is an object', () => {
    const sandbox = new HoloScriptSandbox();
    const stats = sandbox.getSecurityStats();
    expect(typeof stats.bySource).toBe('object');
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// executeSafely convenience function
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('executeSafely', () => {
  it('is a function', () => {
    expect(typeof executeSafely).toBe('function');
  });

  it('returns SandboxResult for valid code', async () => {
    const result = await executeSafely(VALID_SCENE);
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('metadata');
  });

  it('succeeds on plain JS expression', async () => {
    // Use plain JS since vm2 executes code as JavaScript
    const result = await executeSafely('1 + 1');
    expect(result.success).toBe(true);
  });

  it('source defaults to "user"', async () => {
    const result = await executeSafely(VALID_SCENE);
    expect(result.metadata.source).toBe('user');
  });

  it('can specify source option', async () => {
    const result = await executeSafely(VALID_SCENE, { source: 'ai-generated' });
    expect(result.metadata.source).toBe('ai-generated');
  });
});
