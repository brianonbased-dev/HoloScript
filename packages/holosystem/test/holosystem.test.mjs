import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_PUBLIC_PACKAGE_CONTRACTS,
  HOLOSYSTEM_CONFIG_SCHEMA,
  createHoloSystemConfig,
  inspectHoloSystemConfig,
} from '../src/index.mjs';

test('creates a portable config with pinned public npm and PyPI contracts', () => {
  const config = createHoloSystemConfig({
    consumerId: 'northwind-founder',
    workspace: 'northwind',
  });
  const report = inspectHoloSystemConfig(config);

  assert.equal(config.schema, HOLOSYSTEM_CONFIG_SCHEMA);
  assert.equal(report.ready, true);
  assert.equal(report.portable, true);
  assert.deepEqual(
    new Set(report.summary.packages.map((item) => item.registry)),
    new Set(['npm', 'pypi'])
  );
  assert.ok(report.summary.packages.every((item) => /^\d+\.\d+\.\d+/u.test(item.version)));
  assert.ok(report.checks.every((check) => check.ok));
});

test('returns independent config data instead of mutable package defaults', () => {
  const first = createHoloSystemConfig();
  first.contracts[0].version = '9.9.9';
  const second = createHoloSystemConfig();

  assert.equal(second.contracts[0].version, DEFAULT_PUBLIC_PACKAGE_CONTRACTS[0].version);
  assert.notEqual(first.contracts[0].version, second.contracts[0].version);
});

test('rejects local package specs and missing cross-runtime custody', () => {
  const config = createHoloSystemConfig();
  config.contracts[0].version = 'workspace:*';
  config.contracts = config.contracts.filter((contract) => contract.registry !== 'pypi');

  const report = inspectHoloSystemConfig(config);

  assert.equal(report.ready, false);
  assert.equal(report.portable, false);
  assert.ok(report.errors.some((error) => error.code === 'version-not-pinned'));
  assert.ok(report.errors.some((error) => error.message.includes('pypi contract')));
});

test('rejects absolute receipt paths and embedded credential fields without echoing values', () => {
  const config = createHoloSystemConfig();
  config.operations.receipts.directory = '/operator/private/receipts';
  config.bindings.authority.secret = 'do-not-return-this-value';

  const report = inspectHoloSystemConfig(config);

  assert.equal(report.ready, false);
  assert.equal(report.portable, false);
  assert.ok(report.errors.some((error) => error.code === 'receipt-path-not-portable'));
  assert.ok(report.errors.some((error) => error.code === 'embedded-sensitive-field'));
  assert.doesNotMatch(JSON.stringify(report), /do-not-return-this-value/u);
});

test('fails the boring bounded-operation gaps independently', () => {
  const config = createHoloSystemConfig();
  config.operations.autonomy.stopConditions = ['authority-required'];
  config.operations.receipts.maxAgeSeconds = 0;

  const report = inspectHoloSystemConfig(config);

  assert.equal(report.ready, false);
  assert.equal(report.errors.filter((error) => error.code === 'stop-condition-missing').length, 2);
  assert.ok(report.errors.some((error) => error.code === 'receipt-freshness-invalid'));
});

test('rejects unknown nested fields instead of carrying hidden local state', () => {
  const config = createHoloSystemConfig();
  config.bindings.memory.value = 'opaque-local-value';

  const report = inspectHoloSystemConfig(config);

  assert.equal(report.ready, false);
  assert.equal(report.portable, false);
  assert.ok(
    report.errors.some(
      (error) => error.code === 'unknown-field' && error.path === 'bindings.memory.value'
    )
  );
  assert.doesNotMatch(JSON.stringify(report), /opaque-local-value/u);
});

test('create fails closed when caller options cannot pass inspection', () => {
  assert.throws(
    () => createHoloSystemConfig({ receiptDirectory: '../shared-receipts' }),
    (error) => {
      assert.equal(error instanceof TypeError, true);
      assert.ok(error.report.errors.some((item) => item.code === 'receipt-path-not-portable'));
      return true;
    }
  );
});
