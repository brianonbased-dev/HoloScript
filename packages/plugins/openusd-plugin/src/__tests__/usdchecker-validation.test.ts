import { describe, expect, it } from 'vitest';
import {
  buildIndustrialDigitalTwinFixture,
  runOpenUsdConformanceRoundTrip,
  type UsdCheckerRunner,
} from '../index';

describe('OpenUSD pxr/usdchecker validation receipts', () => {
  it('emits a deterministic syntax-only receipt when usdchecker is not requested', () => {
    const report = runOpenUsdConformanceRoundTrip(buildIndustrialDigitalTwinFixture());

    expect(report.passed).toBe(true);
    expect(report.validationMode).toBe('syntax-roundtrip');
    expect(report.receipts).toEqual([
      expect.objectContaining({
        validator: 'syntax-roundtrip',
        status: 'passed',
        mode: 'syntax-roundtrip',
      }),
    ]);
    expect(report.checks.map((check) => check.id)).not.toContain('pxr-usdchecker');
  });

  it('runs pxr usdchecker when requested and records a real validation receipt', () => {
    let invokedCommand = '';
    let invokedArgs: string[] = [];
    const runner: UsdCheckerRunner = (command, args) => {
      invokedCommand = command;
      invokedArgs = args;
      return {
        status: 0,
        stdout: 'Checked stage.usda successfully',
      };
    };

    const report = runOpenUsdConformanceRoundTrip(buildIndustrialDigitalTwinFixture(), {
      usdchecker: {
        enabled: true,
        command: 'usdchecker',
        args: ['--arkit'],
        runner,
      },
    });

    expect(report.passed).toBe(true);
    expect(report.validationMode).toBe('pxr-usdchecker');
    expect(invokedCommand).toBe('usdchecker');
    expect(invokedArgs[0]).toBe('--arkit');
    expect(invokedArgs[invokedArgs.length - 1]).toMatch(/[\\/]stage\.usda$/);
    expect(report.checks.map((check) => [check.id, check.passed])).toContainEqual([
      'pxr-usdchecker',
      true,
    ]);
    expect(report.receipts).toContainEqual(
      expect.objectContaining({
        validator: 'pxr.usdchecker',
        status: 'passed',
        mode: 'pxr-usdchecker',
        command: 'usdchecker',
        stdout: 'Checked stage.usda successfully',
      })
    );
  });

  it('distinguishes syntax round-trip success from usdchecker rejection', () => {
    const runner: UsdCheckerRunner = () => ({
      status: 1,
      stderr: 'UsdValidationError: invalid relationship target',
    });

    const report = runOpenUsdConformanceRoundTrip(buildIndustrialDigitalTwinFixture(), {
      usdchecker: {
        enabled: true,
        runner,
      },
    });

    expect(report.checks.find((check) => check.id === 'primitive-roundtrip')?.passed).toBe(true);
    expect(report.passed).toBe(false);
    expect(report.validationMode).toBe('syntax-roundtrip');
    expect(report.checks.map((check) => [check.id, check.passed])).toContainEqual([
      'pxr-usdchecker',
      false,
    ]);
    expect(report.receipts).toContainEqual(
      expect.objectContaining({
        validator: 'pxr.usdchecker',
        status: 'failed',
        mode: 'pxr-usdchecker',
        stderr: 'UsdValidationError: invalid relationship target',
      })
    );
  });

  it('falls back deterministically when the usdchecker binary is unavailable', () => {
    const runner: UsdCheckerRunner = () => ({
      status: null,
      error: { code: 'ENOENT', message: 'usdchecker not found' },
    });

    const report = runOpenUsdConformanceRoundTrip(buildIndustrialDigitalTwinFixture(), {
      usdchecker: {
        enabled: true,
        command: 'usdchecker',
        runner,
      },
    });

    expect(report.passed).toBe(true);
    expect(report.validationMode).toBe('syntax-roundtrip');
    expect(report.checks.map((check) => [check.id, check.passed])).toContainEqual([
      'pxr-usdchecker',
      true,
    ]);
    expect(report.receipts).toContainEqual(
      expect.objectContaining({
        validator: 'pxr.usdchecker',
        status: 'unavailable',
        mode: 'syntax-roundtrip',
        command: 'usdchecker',
      })
    );
  });
});
