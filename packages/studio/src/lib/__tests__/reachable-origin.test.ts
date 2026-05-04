import { describe, expect, it } from 'vitest';
import type { NetworkInterfaceInfo } from 'node:os';
import { resolveReachableStudioOrigin } from '../reachable-origin';

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
      }),
    ).toBe('http://192.168.0.23:3112');
  });

  it('keeps already reachable request origins unchanged', () => {
    expect(
      resolveReachableStudioOrigin(request('http://192.168.0.23:3112/api/reconstruction/session'), {
        env: {},
        interfaces,
      }),
    ).toBe('http://192.168.0.23:3112');
  });

  it('allows an explicit mobile origin override', () => {
    expect(
      resolveReachableStudioOrigin(request('http://localhost:3112/api/reconstruction/session'), {
        env: { STUDIO_MOBILE_ORIGIN: 'http://studio-phone.test:4111' },
        interfaces,
      }),
    ).toBe('http://studio-phone.test:4111');
  });

  it('uses forwarded host headers when running behind a proxy', () => {
    const req = request('http://localhost:3112/api/reconstruction/session');
    req.headers.set('x-forwarded-host', 'studio.example.test');
    req.headers.set('x-forwarded-proto', 'https');

    expect(resolveReachableStudioOrigin(req, { env: {}, interfaces })).toBe(
      'https://studio.example.test',
    );
  });
});
