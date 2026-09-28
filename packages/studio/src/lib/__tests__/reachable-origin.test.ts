import { describe, expect, it } from 'vitest';
import type { NetworkInterfaceInfo } from 'node:os';
import { resolvePublicStudioOrigin, resolveReachableStudioOrigin } from '../reachable-origin';

function request(url: string): { headers: Headers; url: string } {
  return { headers: new Headers(), url };
}

const interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = {
  'vEthernet (WSL (Hyper-V firewall))': [
    {
      address: '172.21.208.1',
      netmask: '255.255.240.0',
      family: 'IPv4',
      mac: '00:00:00:00:00:00',
      internal: false,
      cidr: '172.21.208.1/20',
    },
  ],
  'OpenVPN Data Channel Offload for NordVPN': [
    {
      address: '10.100.0.2',
      netmask: '255.255.252.0',
      family: 'IPv4',
      mac: '00:00:00:00:00:00',
      internal: false,
      cidr: '10.100.0.2/22',
    },
  ],
  'Wi-Fi': [
    {
      address: '192.168.0.23',
      netmask: '255.255.255.0',
      family: 'IPv4',
      mac: '00:00:00:00:00:00',
      internal: false,
      cidr: '192.168.0.23/24',
    },
  ],
};

describe('resolveReachableStudioOrigin', () => {
  it('rewrites localhost requests to the WiFi LAN address', () => {
    expect(
      resolveReachableStudioOrigin(request('http://localhost:3112/api/reconstruction/session'), {
        env: {},
        interfaces,
      })
    ).toBe('http://192.168.0.23:3112');
  });

  it('keeps already reachable request origins unchanged', () => {
    expect(
      resolveReachableStudioOrigin(request('http://192.168.0.23:3112/api/reconstruction/session'), {
        env: {},
        interfaces,
      })
    ).toBe('http://192.168.0.23:3112');
  });

  it('allows an explicit mobile origin override', () => {
    expect(
      resolveReachableStudioOrigin(request('http://localhost:3112/api/reconstruction/session'), {
        env: { STUDIO_MOBILE_ORIGIN: 'http://studio-phone.test:4111' },
        interfaces,
      })
    ).toBe('http://studio-phone.test:4111');
  });

  it('uses forwarded host headers when running behind a proxy', () => {
    const req = request('http://localhost:3112/api/reconstruction/session');
    req.headers.set('x-forwarded-host', 'studio.example.test');
    req.headers.set('x-forwarded-proto', 'https');

    expect(resolveReachableStudioOrigin(req, { env: {}, interfaces })).toBe(
      'https://studio.example.test'
    );
  });
});

describe('resolvePublicStudioOrigin (where a browser is sent back to)', () => {
  const at = (url: string) => request(url);

  it('prefers the explicit public Studio URL', () => {
    expect(
      resolvePublicStudioOrigin(at('https://0.0.0.0:8080/api/absorb/credits'), {
        env: { NEXT_PUBLIC_STUDIO_URL: 'https://holoscript.studio/', NEXTAUTH_URL: 'https://auth.example.test' },
      })
    ).toBe('https://holoscript.studio');
  });

  it('then the sign-in URL, where the session cookie lives (production sets only this)', () => {
    expect(
      resolvePublicStudioOrigin(at('https://0.0.0.0:8080/api/absorb/credits'), {
        env: { NEXTAUTH_URL: 'https://holoscript.studio' },
      })
    ).toBe('https://holoscript.studio');
  });

  it('then the forwarded public host, never the container bind address', () => {
    const req = at('https://0.0.0.0:8080/api/absorb/credits');
    req.headers.set('x-forwarded-host', 'studio.example.test');
    req.headers.set('x-forwarded-proto', 'https');
    expect(resolvePublicStudioOrigin(req, { env: {} })).toBe('https://studio.example.test');
  });

  it('keeps localhost as localhost: a LAN address would arrive without the session cookie', () => {
    // resolveReachableStudioOrigin would answer http://192.168.0.23:3112 here.
    expect(
      resolveReachableStudioOrigin(at('http://localhost:3112/settings'), { env: {}, interfaces })
    ).toBe('http://192.168.0.23:3112');
    expect(resolvePublicStudioOrigin(at('http://localhost:3112/settings'), { env: {} })).toBe(
      'http://localhost:3112'
    );
  });
});
