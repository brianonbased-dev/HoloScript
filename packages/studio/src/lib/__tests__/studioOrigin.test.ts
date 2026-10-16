import { describe, expect, it } from 'vitest';
import { isOwnOriginRequest, studioOwnOrigin } from '../studioOrigin';

const env = { NEXTAUTH_URL: 'https://holoscript.studio/' } as unknown as NodeJS.ProcessEnv;
const req = (h: Record<string, string>) =>
  new Request('http://10.0.0.5:3000/api/x', { method: 'POST', headers: h });

describe('studio own-origin check (configured URL only)', () => {
  it('takes the origin from NEXTAUTH_URL, else NEXT_PUBLIC_STUDIO_URL, else null', () => {
    expect(studioOwnOrigin(env)).toBe('https://holoscript.studio');
    expect(
      studioOwnOrigin({ NEXT_PUBLIC_STUDIO_URL: 'https://s.test/x' } as unknown as NodeJS.ProcessEnv)
    ).toBe('https://s.test');
    expect(studioOwnOrigin({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("Railway's proxy: internal Host + X-Forwarded-Host, real Origin = configured URL -> allowed", () => {
    expect(
      isOwnOriginRequest(
        req({
          origin: 'https://holoscript.studio',
          host: '10.0.0.5:3000',
          'x-forwarded-host': 'holoscript.studio',
          'x-forwarded-proto': 'https',
        }),
        env
      )
    ).toBe(true);
  });

  it('a forged Host / X-Forwarded-Host matching an attacker Origin is refused', () => {
    expect(
      isOwnOriginRequest(
        req({ origin: 'https://evil.test', host: 'evil.test', 'x-forwarded-host': 'evil.test' }),
        env
      )
    ).toBe(false);
  });

  it('missing Origin, "null" Origin, or no configured URL: refused', () => {
    expect(isOwnOriginRequest(req({ host: 'holoscript.studio' }), env)).toBe(false);
    expect(isOwnOriginRequest(req({ origin: 'null' }), env)).toBe(false);
    expect(
      isOwnOriginRequest(req({ origin: 'https://holoscript.studio' }), {} as NodeJS.ProcessEnv)
    ).toBe(false);
  });
});
