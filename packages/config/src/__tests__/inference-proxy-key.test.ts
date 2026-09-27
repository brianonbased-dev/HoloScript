import { afterEach, describe, expect, it } from 'vitest';
import {
  HOLO_INFERENCE_PROXY_KEY_NAME_ENV,
  configureConfigSecretResolver,
  inferenceProxyAuthorizationHeader,
  resetConfigSecretResolver,
  resolveInferenceProxyKey,
} from '../auth';

const KEY_NAME = 'HOLO_INFERENCE_PROXY_KEY';
const SECRET = 'hpky_test_7f3c9a_do_not_leak';

describe('inference proxy key resolution', () => {
  const original = process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV];

  afterEach(() => {
    resetConfigSecretResolver();
    if (original === undefined) delete process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV];
    else process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV] = original;
  });

  it('does not call the resolver when no key name is configured', async () => {
    delete process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV];
    const seen: string[] = [];
    configureConfigSecretResolver({
      async resolve(name) {
        seen.push(name);
        return SECRET;
      },
    });

    expect(await resolveInferenceProxyKey()).toBe('');
    expect(await inferenceProxyAuthorizationHeader()).toEqual({});
    expect(seen).toEqual([]);
  });

  it('resolves the configured name through the HoloKey-aware config bridge', async () => {
    process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV] = KEY_NAME;
    const seen: string[] = [];
    configureConfigSecretResolver({
      async resolve(name) {
        seen.push(name);
        return name === KEY_NAME ? SECRET : undefined;
      },
    });

    expect(await resolveInferenceProxyKey()).toBe(SECRET);
    expect(await inferenceProxyAuthorizationHeader()).toEqual({
      Authorization: `Bearer ${SECRET}`,
    });
    expect(seen).toEqual([KEY_NAME, KEY_NAME]);
  });

  it('stays empty when the configured name resolves to nothing', async () => {
    process.env[HOLO_INFERENCE_PROXY_KEY_NAME_ENV] = KEY_NAME;
    configureConfigSecretResolver({
      async resolve() {
        return '   ';
      },
    });

    expect(await resolveInferenceProxyKey()).toBe('');
    expect(await inferenceProxyAuthorizationHeader()).toEqual({});
  });
});
