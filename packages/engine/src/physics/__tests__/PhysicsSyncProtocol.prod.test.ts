import { describe, it, expect } from 'vitest';
import { PhysicsSyncSender, PhysicsSyncReceiver, parsePacketHeader } from '../PhysicsSyncProtocol';
import { UnifiedParticleBuffer } from '../UnifiedParticleBuffer';
import { ParticleType } from '../PhysicsTypes';

function makeBuffer(particleCount = 10): { buf: UnifiedParticleBuffer; range: any } {
  const buf = new UnifiedParticleBuffer(1000);
  const range = buf.registerParticles(ParticleType.FLUID, particleCount, 'fluid');
  const pos = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    pos[i * 3] = i;
    pos[i * 3 + 1] = i * 2;
    pos[i * 3 + 2] = i * 3;
  }
  buf.writePositions(range, pos);
  return { buf, range };
}

describe('PhysicsSyncSender — encode', () => {
  it('returns null for empty buffer', () => {
    const sender = new PhysicsSyncSender();
    const buf = new UnifiedParticleBuffer(100);
    expect(sender.encode(buf)).toBeNull();
  });

  it('encodes full packet with correct header', () => {
    const sender = new PhysicsSyncSender({ useDelta: false });
    const { buf } = makeBuffer(5);
    const packet = sender.encode(buf)!;
    expect(packet).not.toBeNull();

    const header = parsePacketHeader(packet);
    expect(header).not.toBeNull();
    expect(header!.magic).toBe(0x48505350);
    expect(header!.version).toBe(1);
    expect(header!.sequence).toBe(0);
    expect(header!.particleCount).toBe(5);
    expect(header!.flags & 0x01).toBe(0); // not delta
  });

  it('full packet has correct size: 16 header + 25 * particles', () => {
    const sender = new PhysicsSyncSender({ useDelta: false });
    const { buf } = makeBuffer(10);
    const packet = sender.encode(buf)!;
    expect(packet.byteLength).toBe(16 + 25 * 10);
  });

  it('second encode increments sequence', () => {
    const sender = new PhysicsSyncSender({ useDelta: false });
    const { buf } = makeBuffer(3);
    sender.encode(buf);
    const packet2 = sender.encode(buf)!;
    const header = parsePacketHeader(packet2)!;
    expect(header.sequence).toBe(1);
  });

  it('delta encode only sends changed particles', () => {
    const sender = new PhysicsSyncSender({ useDelta: true, deltaThreshold: 0.0001 });
    const { buf, range } = makeBuffer(10);

    // First encode (full, since no previous snapshot)
    sender.encode(buf);

    // Move only 2 particles
    buf.positions[range.offset * 3] = 999;
    buf.positions[(range.offset + 5) * 3] = 999;

    const delta = sender.encode(buf)!;
    expect(delta).not.toBeNull();
    const header = parsePacketHeader(delta)!;
    expect(header.flags & 0x01).toBe(1); // delta flag set
    expect(header.particleCount).toBe(2);
  });

  it('delta returns null when nothing changed', () => {
    const sender = new PhysicsSyncSender({ useDelta: true, deltaThreshold: 0.001 });
    const { buf } = makeBuffer(5);
    sender.encode(buf); // full snapshot
    const delta = sender.encode(buf);
    expect(delta).toBeNull();
  });
});

describe('PhysicsSyncReceiver — receivePacket', () => {
  it('applies full packet to local buffer', () => {
    const sender = new PhysicsSyncSender({ useDelta: false });
    const { buf: srcBuf } = makeBuffer(5);
    const packet = sender.encode(srcBuf)!;

    const receiver = new PhysicsSyncReceiver({ interpolation: 'none' });
    const dstBuf = new UnifiedParticleBuffer(100);
    dstBuf.registerParticles(ParticleType.FLUID, 5, 'fluid');

    receiver.receivePacket(packet, dstBuf);

    expect(dstBuf.positions[0]).toBeCloseTo(0);
    expect(dstBuf.positions[3]).toBeCloseTo(1);
    expect(dstBuf.positions[12]).toBeCloseTo(4);
  });

  it('applies delta packet to local buffer', () => {
    const sender = new PhysicsSyncSender({ useDelta: true, deltaThreshold: 0.0001 });
    const { buf: srcBuf, range } = makeBuffer(5);

    // Full encode first
    const fullPacket = sender.encode(srcBuf)!;

    const receiver = new PhysicsSyncReceiver({ interpolation: 'none' });
    const dstBuf = new UnifiedParticleBuffer(100);
    dstBuf.registerParticles(ParticleType.FLUID, 5, 'fluid');
    receiver.receivePacket(fullPacket, dstBuf);

    // Now move particle 0
    srcBuf.positions[range.offset * 3] += 10;
    const deltaPacket = sender.encode(srcBuf)!;

    receiver.receivePacket(deltaPacket, dstBuf);
    expect(dstBuf.positions[0]).toBeCloseTo(10);
  });

  it('silently drops malformed packets', () => {
    const receiver = new PhysicsSyncReceiver();
    const dstBuf = new UnifiedParticleBuffer(100);
    const badData = new ArrayBuffer(4);
    // Should not throw
    receiver.receivePacket(badData, dstBuf);
    expect(receiver.getStats().packetsReceived).toBe(0);
  });

  it('tracks stats', () => {
    const sender = new PhysicsSyncSender({ useDelta: false });
    const { buf } = makeBuffer(3);
    const receiver = new PhysicsSyncReceiver({ interpolation: 'none' });
    const dstBuf = new UnifiedParticleBuffer(100);
    dstBuf.registerParticles(ParticleType.FLUID, 3, 'fluid');

    for (let i = 0; i < 5; i++) {
      const pkt = sender.encode(buf)!;
      receiver.receivePacket(pkt, dstBuf);
    }

    const stats = receiver.getStats();
    expect(stats.packetsReceived).toBe(5);
    expect(stats.droppedPackets).toBe(0);
  });
});

describe('parsePacketHeader', () => {
  it('returns null for too-small buffer', () => {
    expect(parsePacketHeader(new ArrayBuffer(8))).toBeNull();
  });

  it('returns null for wrong magic', () => {
    const data = new ArrayBuffer(16);
    new DataView(data).setUint32(0, 0x12345678, false);
    expect(parsePacketHeader(data)).toBeNull();
  });

  it('parses valid header', () => {
    const sender = new PhysicsSyncSender({ useDelta: false });
    const { buf } = makeBuffer(7);
    const packet = sender.encode(buf)!;
    const header = parsePacketHeader(packet)!;
    expect(header.magic).toBe(0x48505350);
    expect(header.particleCount).toBe(7);
  });
});

describe('PhysicsSyncSender — stats & dispose', () => {
  it('getStats tracks packets sent', () => {
    const sender = new PhysicsSyncSender({ useDelta: false });
    const { buf } = makeBuffer(3);
    sender.encode(buf); // encode doesn't increment packetsSent (only startSending does)
    const stats = sender.getStats();
    expect(stats.packetsSent).toBe(0); // encode alone doesn't track
  });

  it('dispose clears state', () => {
    const sender = new PhysicsSyncSender();
    sender.dispose();
    // Should not throw
    const { buf } = makeBuffer(3);
    const packet = sender.encode(buf);
    expect(packet).not.toBeNull();
  });
});

describe('PhysicsSyncReceiver — dispose', () => {
  it('clears jitter buffer', () => {
    const receiver = new PhysicsSyncReceiver();
    receiver.dispose();
    expect(receiver.getStats().packetsReceived).toBe(0);
  });
});
