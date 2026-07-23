import { deflateRawSync, inflateRawSync } from 'node:zlib';

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const UTF8_FLAG = 0x0800;
const DEFLATE_METHOD = 8;
const DOS_TIME = 0;
const DOS_DATE_1980_01_01 = 0x0021;

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  CRC_TABLE[index] = value >>> 0;
}

export function crc32(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function normalizedEntries(entries) {
  const seen = new Set();
  return entries
    .map((entry) => {
      const name = String(entry.name || '')
        .replaceAll('\\', '/')
        .replace(/^\/+/, '');
      if (!name || name.endsWith('/')) throw new Error(`invalid ZIP file name: ${entry.name}`);
      if (name.split('/').includes('..')) throw new Error(`unsafe ZIP file name: ${name}`);
      if (seen.has(name)) throw new Error(`duplicate ZIP file name: ${name}`);
      seen.add(name);
      return { name, data: Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data) };
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
}

export function createDeterministicZip(entries) {
  const files = normalizedEntries(entries);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const compressed = deflateRawSync(file.data, { level: 9 });
    const checksum = crc32(file.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_FILE_HEADER, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(DEFLATE_METHOD, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE_1980_01_01, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_DIRECTORY_HEADER, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(DEFLATE_METHOD, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE_1980_01_01, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

export function readDeterministicZip(input) {
  const zip = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const files = new Map();
  let offset = 0;

  while (offset + 4 <= zip.length && zip.readUInt32LE(offset) === LOCAL_FILE_HEADER) {
    if (offset + 30 > zip.length) throw new Error('truncated ZIP local header');
    const flags = zip.readUInt16LE(offset + 6);
    const method = zip.readUInt16LE(offset + 8);
    const expectedCrc = zip.readUInt32LE(offset + 14);
    const compressedLength = zip.readUInt32LE(offset + 18);
    const uncompressedLength = zip.readUInt32LE(offset + 22);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    if ((flags & UTF8_FLAG) === 0) throw new Error('ZIP entry is not UTF-8');
    if (method !== DEFLATE_METHOD) throw new Error(`unsupported ZIP method: ${method}`);

    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedLength;
    if (dataEnd > zip.length) throw new Error('truncated ZIP entry');
    const name = zip.subarray(nameStart, nameStart + nameLength).toString('utf8');
    if (!name || name.split('/').includes('..') || files.has(name)) {
      throw new Error(`unsafe or duplicate ZIP entry: ${name}`);
    }
    const data = inflateRawSync(zip.subarray(dataStart, dataEnd));
    if (data.length !== uncompressedLength) throw new Error(`ZIP size mismatch: ${name}`);
    if (crc32(data) !== expectedCrc) throw new Error(`ZIP CRC mismatch: ${name}`);
    files.set(name, data);
    offset = dataEnd;
  }

  if (files.size === 0) throw new Error('ZIP contains no local file entries');
  if (offset + 4 > zip.length || zip.readUInt32LE(offset) !== CENTRAL_DIRECTORY_HEADER) {
    throw new Error('ZIP central directory is missing');
  }
  return files;
}
