/**
 * BinaryWriter + BinarySerializer — production test suite
 *
 * BinaryWriter (exported): writeUint8/16/32, writeInt32, writeFloat32/64,
 *   writeVector3, writeQuaternion, writeTransform, writeString, writeBoolean,
 *   writeBytes, getOffset, setOffset, patchUint32, align, auto-grow.
 * BinarySerializer (exported): encode → ArrayBuffer, decode roundtrip,
 *   wrong magic throws, unsupported version throws.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BinaryWriter, BinarySerializer } from '../BinarySerializer';
import { createEmptySceneGraph } from '../SceneGraph';

// ─── BinaryWriter ─────────────────────────────────────────────────────────────

describe('BinaryWriter: production', () => {
  let writer: BinaryWriter;

  beforeEach(() => {
    writer = new BinaryWriter(64); // small initial size to test growth
  });

  it('getBuffer returns ArrayBuffer', () => {
    expect(writer.getBuffer()).toBeInstanceOf(ArrayBuffer);
  });

  it('getUint8View returns Uint8Array', () => {
    expect(writer.getUint8View()).toBeInstanceOf(Uint8Array);
  });

  it('getOffset starts at 0', () => {
    expect(writer.getOffset()).toBe(0);
  });

  it('writeUint8 advances offset by 1', () => {
    writer.writeUint8(42);
    expect(writer.getOffset()).toBe(1);
  });

  it('writeUint8 stores correct value', () => {
    writer.writeUint8(42);
    const view = new DataView(writer.getBuffer());
    expect(view.getUint8(0)).toBe(42);
  });

  it('writeUint16 advances offset by 2', () => {
    writer.writeUint16(1000);
    expect(writer.getOffset()).toBe(2);
  });

  it('writeUint16 stores correct value', () => {
    writer.writeUint16(1000);
    const view = new DataView(writer.getBuffer());
    expect(view.getUint16(0, true)).toBe(1000);
  });

  it('writeUint32 stores correct value', () => {
    writer.writeUint32(0xdeadbeef >>> 0);
    const view = new DataView(writer.getBuffer());
    expect(view.getUint32(0, true)).toBe(0xdeadbeef >>> 0);
  });

  it('writeInt32 stores negative value correctly', () => {
    writer.writeInt32(-42);
    const view = new DataView(writer.getBuffer());
    expect(view.getInt32(0, true)).toBe(-42);
  });

  it('writeFloat32 stores float value approximately', () => {
    writer.writeFloat32(3.14);
    const view = new DataView(writer.getBuffer());
    expect(view.getFloat32(0, true)).toBeCloseTo(3.14, 4);
  });

  it('writeFloat64 stores double value precisely', () => {
    writer.writeFloat64(Math.PI);
    const view = new DataView(writer.getBuffer());
    expect(view.getFloat64(0, true)).toBeCloseTo(Math.PI, 10);
  });

  it('writeBoolean stores 1 for true', () => {
    writer.writeBoolean(true);
    const view = new DataView(writer.getBuffer());
    expect(view.getUint8(0)).toBe(1);
  });

  it('writeBoolean stores 0 for false', () => {
    writer.writeBoolean(false);
    const view = new DataView(writer.getBuffer());
    expect(view.getUint8(0)).toBe(0);
  });

  it('writeString stores length-prefixed UTF-8 string', () => {
    writer.writeString('hi');
    const view = new DataView(writer.getBuffer());
    expect(view.getUint32(0, true)).toBe(2); // length prefix
    expect(view.getUint8(4)).toBe('h'.charCodeAt(0));
    expect(view.getUint8(5)).toBe('i'.charCodeAt(0));
  });

  it('writeVector3 stores x/y/z as three float32s', () => {
    writer.writeVector3([1, 2, 3]);
    const view = new DataView(writer.getBuffer());
    expect(view.getFloat32(0, true)).toBeCloseTo(1);
    expect(view.getFloat32(4, true)).toBeCloseTo(2);
    expect(view.getFloat32(8, true)).toBeCloseTo(3);
  });

  it('writeQuaternion stores x/y/z/w as four float32s', () => {
    writer.writeQuaternion({ x: 0, y: 0, z: 0, w: 1 });
    const view = new DataView(writer.getBuffer());
    expect(view.getFloat32(12, true)).toBeCloseTo(1); // w at byte offset 12
  });

  it('writeTransform stores 10 floats (3+4+3)', () => {
    writer.writeTransform({
      position: [1, 2, 3],
      rotation: [0, 0, 0, 1 ],
      scale: [1, 1, 1 ],
    });
    expect(writer.getOffset()).toBe(40); // 10 × float32 = 40 bytes
  });

  it('patchUint32 overwrites a value at given offset', () => {
    writer.writeUint32(0); // offset 0
    writer.writeUint32(0xabcd); // offset 4
    writer.patchUint32(0, 0x1234);
    const view = new DataView(writer.getBuffer());
    expect(view.getUint32(0, true)).toBe(0x1234);
  });

  it('setOffset/getOffset round-trip', () => {
    writer.writeUint32(0);
    writer.setOffset(0);
    expect(writer.getOffset()).toBe(0);
  });

  it('align pads to boundary', () => {
    writer.writeUint8(1); // offset = 1
    writer.align(4); // should pad to 4
    expect(writer.getOffset()).toBe(4);
  });

  it('auto-grows buffer when capacity exceeded', () => {
    for (let i = 0; i < 20; i++) writer.writeFloat32(i);
    expect(writer.getBuffer().byteLength).toBeGreaterThanOrEqual(80);
  });

  it('sequential writes accumulate correctly', () => {
    writer.writeUint8(1);
    writer.writeUint8(2);
    writer.writeUint8(3);
    const view = new DataView(writer.getBuffer());
    expect(view.getUint8(0)).toBe(1);
    expect(view.getUint8(1)).toBe(2);
    expect(view.getUint8(2)).toBe(3);
  });
});

// ─── BinarySerializer ─────────────────────────────────────────────────────────

describe('BinarySerializer: production', () => {
  let serializer: BinarySerializer;

  beforeEach(() => {
    serializer = new BinarySerializer();
  });

  function makeSimpleScene(name = 'TestScene') {
    const sg = createEmptySceneGraph(name);
    return sg;
  }

  it('encode returns an ArrayBuffer', () => {
    const buf = serializer.encode(makeSimpleScene());
    expect(buf).toBeInstanceOf(ArrayBuffer);
  });

  it('encoded buffer has non-zero length', () => {
    const buf = serializer.encode(makeSimpleScene());
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it('encoded buffer starts with HLO3 magic', () => {
    const buf = serializer.encode(makeSimpleScene());
    const view = new DataView(buf);
    expect(view.getUint32(0, true)).toBe(0x484c4f33); // 'HLO3'
  });

  it('encode → decode roundtrip returns valid scene graph', () => {
    const sg = makeSimpleScene('MyScene');
    const buf = serializer.encode(sg);
    const dec = serializer.decode(buf);
    expect(dec).toBeDefined();
  });

  it('roundtrip preserves scene root node', () => {
    const sg = makeSimpleScene('MyScene');
    const buf = serializer.encode(sg);
    const dec = serializer.decode(buf);
    expect(dec.root).toBeDefined();
  });

  it('decode throws on wrong magic number', () => {
    // Corrupt the magic
    const buf = new ArrayBuffer(32);
    const view = new DataView(buf);
    view.setUint32(0, 0xdeadbeef, true); // wrong magic
    expect(() => serializer.decode(buf)).toThrow('magic');
  });

  it('decode throws on unsupported version', () => {
    const buf = new ArrayBuffer(32);
    const view = new DataView(buf);
    view.setUint32(0, 0x484c4f33, true); // MAGIC 'HLO3'
    view.setUint32(4, 99, true); // version 99
    expect(() => serializer.decode(buf)).toThrow('version');
  });

  it('encode with floatPrecision option does not throw', () => {
    const s2 = new BinarySerializer({ floatPrecision: 32 });
    expect(() => s2.encode(makeSimpleScene())).not.toThrow();
  });

  it('encode with bigEndian option produces valid buffer', () => {
    const s2 = new BinarySerializer({ littleEndian: false });
    const buf = s2.encode(makeSimpleScene());
    expect(buf.byteLength).toBeGreaterThan(0);
  });
});
