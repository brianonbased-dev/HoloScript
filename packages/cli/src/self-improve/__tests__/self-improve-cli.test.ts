/**
 * Tests for the `holoscript self-improve` CLI integration.
 *
 * Covers:
 * - parseArgs recognition of `self-improve` command and its flags
 * - CliSelfImproveIO construction and method signatures
 * - runSelfImprove integration with mock SelfImproveCommand
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
// Import from .ts explicitly to avoid stale .js artifact in src/
import { parseArgs } from '../../args.ts';

// =============================================================================
// parseArgs tests
// =============================================================================

describe('parseArgs — self-improve command', () => {
  it('parses self-improve command', () => {
    const opts = parseArgs(['self-improve']);
    expect(opts.command).toBe('self-improve');
  });

  it('parses self-improve with --cycles flag', () => {
    const opts = parseArgs(['self-improve', '--cycles', '10']);
    expect(opts.command).toBe('self-improve');
    expect(opts.cycles).toBe(10);
  });

  it('defaults cycles to 5 when --cycles has no value', () => {
    const opts = parseArgs(['self-improve', '--cycles']);
    expect(opts.command).toBe('self-improve');
    // NaN from parseInt falls back to || 5
    expect(opts.cycles).toBe(5);
  });

  it('parses self-improve with --harvest flag', () => {
    const opts = parseArgs(['self-improve', '--harvest']);
    expect(opts.command).toBe('self-improve');
    expect(opts.harvest).toBe(true);
  });

  it('parses self-improve with --commit flag', () => {
    const opts = parseArgs(['self-improve', '--commit']);
    expect(opts.command).toBe('self-improve');
    expect(opts.autoCommit).toBe(true);
  });

  it('parses self-improve with --daemon flag', () => {
    const opts = parseArgs(['self-improve', '--daemon']);
    expect(opts.command).toBe('self-improve');
    expect(opts.daemonMode).toBe(true);
  });

  it('parses self-improve with --max-failures flag', () => {
    const opts = parseArgs(['self-improve', '--max-failures', '5']);
    expect(opts.command).toBe('self-improve');
    expect(opts.maxFailures).toBe(5);
  });

  it('parses self-improve with --verbose flag', () => {
    const opts = parseArgs(['self-improve', '--verbose']);
    expect(opts.command).toBe('self-improve');
    expect(opts.verbose).toBe(true);
  });

  it('parses self-improve with all flags combined', () => {
    const opts = parseArgs([
      'self-improve',
      '--cycles',
      '20',
      '--harvest',
      '--commit',
      '--daemon',
      '--max-failures',
      '7',
      '--verbose',
    ]);
    expect(opts.command).toBe('self-improve');
    expect(opts.cycles).toBe(20);
    expect(opts.harvest).toBe(true);
    expect(opts.autoCommit).toBe(true);
    expect(opts.daemonMode).toBe(true);
    expect(opts.maxFailures).toBe(7);
    expect(opts.verbose).toBe(true);
  });

  it('parses self-improve with directory input', () => {
    const opts = parseArgs(['self-improve', '/some/project/path']);
    expect(opts.command).toBe('self-improve');
    expect(opts.input).toBe('/some/project/path');
  });

  it('does not set self-improve flags by default', () => {
    const opts = parseArgs(['self-improve']);
    expect(opts.cycles).toBeUndefined();
    expect(opts.harvest).toBeUndefined();
    expect(opts.autoCommit).toBeUndefined();
    expect(opts.daemonMode).toBeUndefined();
    expect(opts.maxFailures).toBeUndefined();
  });
});

// =============================================================================
// CliSelfImproveIO tests
// =============================================================================

describe('CliSelfImproveIO', () => {
  // We dynamically import to avoid static resolution issues
  let CliSelfImproveIO: any;

  beforeEach(async () => {
    const mod = await import('../CliSelfImproveIO');
    CliSelfImproveIO = mod.CliSelfImproveIO;
  });

  it('constructs with options', () => {
    const io = new CliSelfImproveIO({
      rootDir: '/tmp/test-project',
      verbose: false,
    });
    expect(io).toBeDefined();
    expect(io.log).toBeInstanceOf(Function);
    expect(io.absorb).toBeInstanceOf(Function);
    expect(io.queryUntested).toBeInstanceOf(Function);
    expect(io.generateTest).toBeInstanceOf(Function);
    expect(io.writeFile).toBeInstanceOf(Function);
    expect(io.runVitest).toBeInstanceOf(Function);
    expect(io.runFullVitest).toBeInstanceOf(Function);
    expect(io.runTypeCheck).toBeInstanceOf(Function);
    expect(io.runLint).toBeInstanceOf(Function);
    expect(io.getCircuitBreakerHealth).toBeInstanceOf(Function);
    expect(io.gitAdd).toBeInstanceOf(Function);
    expect(io.gitCommit).toBeInstanceOf(Function);
  });

  it('implements all SelfImproveIO methods', () => {
    const io = new CliSelfImproveIO({
      rootDir: '/tmp/test-project',
      verbose: false,
    });

    // Check that all required methods of SelfImproveIO are present
    const requiredMethods = [
      'absorb',
      'queryUntested',
      'generateTest',
      'writeFile',
      'runVitest',
      'runFullVitest',
      'runTypeCheck',
      'runLint',
      'getCircuitBreakerHealth',
      'gitAdd',
      'gitCommit',
      'log',
    ];

    for (const method of requiredMethods) {
      expect(typeof (io as any)[method]).toBe('function');
    }
  });

  it('log method handles all log levels', () => {
    const io = new CliSelfImproveIO({
      rootDir: '/tmp/test-project',
      verbose: true,
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    io.log('info', 'test info message');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[INFO]'));

    io.log('warn', 'test warn message');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[WARN]'));

    io.log('error', 'test error message');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'));

    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('getCircuitBreakerHealth returns 100', async () => {
    const io = new CliSelfImproveIO({
      rootDir: '/tmp/test-project',
      verbose: false,
    });

    const health = await io.getCircuitBreakerHealth();
    expect(health).toBe(100);
  });

  it('generateTest produces valid test scaffold', async () => {
    const io = new CliSelfImproveIO({
      rootDir: '/tmp/test-project',
      verbose: false,
    });

    const result = await io.generateTest({
      symbolName: 'MyClass',
      filePath: 'src/MyClass.ts',
      language: 'typescript',
      relevanceScore: 0.9,
      description: 'Test target',
    });

    expect(result.testFilePath).toContain('__tests__');
    expect(result.testFilePath).toContain('MyClass.test.ts');
    expect(result.content).toContain("describe('MyClass'");
    expect(result.content).toContain("import { describe, it, expect } from 'vitest'");
    expect(result.target.symbolName).toBe('MyClass');
  });

  it('generateTest handles nested file paths', async () => {
    const io = new CliSelfImproveIO({
      rootDir: '/tmp/test-project',
      verbose: false,
    });

    const result = await io.generateTest({
      symbolName: 'DeepModule',
      filePath: 'packages/core/src/deep/DeepModule.ts',
      language: 'typescript',
      relevanceScore: 0.7,
      description: 'Deeply nested module',
    });

    expect(result.testFilePath).toContain('packages/core/src/deep/__tests__/DeepModule.test.ts');
  });

  it('absorb throws for non-existent directory', async () => {
    const io = new CliSelfImproveIO({
      rootDir: '/tmp/test-project',
      verbose: false,
    });

    await expect(io.absorb('/nonexistent/path/12345')).rejects.toThrow('Not a directory');
  });
});

// =============================================================================
// runSelfImprove integration tests (with mocked core)
// =============================================================================

describe('runSelfImprove', () => {
  it('exports runSelfImprove function from index', async () => {
    const mod = await import('../index');
    expect(mod.runSelfImprove).toBeInstanceOf(Function);
  });

  it('exports CliSelfImproveIO class from index', async () => {
    const mod = await import('../index');
    expect(mod.CliSelfImproveIO).toBeDefined();
  });
});
