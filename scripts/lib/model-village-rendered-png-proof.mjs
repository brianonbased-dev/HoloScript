import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function decodeRgbPng(filePath) {
  const png = fs.readFileSync(filePath);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert(
    png.subarray(0, signature.length).equals(signature),
    `Expected PNG signature for ${filePath}`
  );

  let offset = signature.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    assert(dataEnd + 4 <= png.length, `Truncated PNG chunk ${type} in ${filePath}`);
    if (type === 'IHDR') {
      width = png.readUInt32BE(dataStart);
      height = png.readUInt32BE(dataStart + 4);
      bitDepth = png[dataStart + 8];
      colorType = png[dataStart + 9];
      interlace = png[dataStart + 12];
    } else if (type === 'IDAT') {
      idat.push(png.subarray(dataStart, dataEnd));
    }
    offset = dataEnd + 4;
    if (type === 'IEND') break;
  }

  assert(width > 0 && height > 0, `Missing PNG dimensions for ${filePath}`);
  assert(bitDepth === 8, `Expected 8-bit PNG for ${filePath}`);
  assert(
    colorType === 2 || colorType === 6,
    `Expected RGB or RGBA PNG for ${filePath}`
  );
  assert(interlace === 0, `Expected non-interlaced PNG for ${filePath}`);

  const bytesPerPixel = colorType === 2 ? 3 : 4;
  const stride = width * bytesPerPixel;
  const filtered = inflateSync(Buffer.concat(idat));
  assert(
    filtered.length === height * (stride + 1),
    `Unexpected decoded PNG byte count for ${filePath}`
  );

  const pixels = Buffer.alloc(height * stride);
  const paeth = (left, above, upperLeft) => {
    const prediction = left + above - upperLeft;
    const leftDistance = Math.abs(prediction - left);
    const aboveDistance = Math.abs(prediction - above);
    const upperLeftDistance = Math.abs(prediction - upperLeft);
    if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
    if (aboveDistance <= upperLeftDistance) return above;
    return upperLeft;
  };

  for (let y = 0; y < height; y += 1) {
    const filteredRow = y * (stride + 1);
    const filter = filtered[filteredRow];
    const row = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = filtered[filteredRow + 1 + x];
      const left = x >= bytesPerPixel ? pixels[row + x - bytesPerPixel] : 0;
      const above = y > 0 ? pixels[row - stride + x] : 0;
      const upperLeft =
        y > 0 && x >= bytesPerPixel
          ? pixels[row - stride + x - bytesPerPixel]
          : 0;
      let reconstructed;
      if (filter === 0) reconstructed = raw;
      else if (filter === 1) reconstructed = raw + left;
      else if (filter === 2) reconstructed = raw + above;
      else if (filter === 3) reconstructed = raw + Math.floor((left + above) / 2);
      else if (filter === 4) reconstructed = raw + paeth(left, above, upperLeft);
      else throw new Error(`Unsupported PNG filter ${filter} in ${filePath}`);
      pixels[row + x] = reconstructed & 0xff;
    }
  }

  return { width, height, bytesPerPixel, pixels };
}

export function compareRenderedPngs({
  repoRoot,
  durableRelativePath,
  capturedPath,
  maxDifferentPixels = 16,
  maxChannelDelta = 1,
}) {
  const durablePath = path.join(repoRoot, durableRelativePath);
  const durable = decodeRgbPng(durablePath);
  const captured = decodeRgbPng(capturedPath);
  assert(
    durable.width === captured.width
      && durable.height === captured.height
      && durable.bytesPerPixel === captured.bytesPerPixel,
    `Rendered PNG dimensions changed for ${durableRelativePath}`
  );

  let differentPixels = 0;
  let observedMaxChannelDelta = 0;
  for (
    let pixelOffset = 0;
    pixelOffset < durable.pixels.length;
    pixelOffset += durable.bytesPerPixel
  ) {
    let pixelDifferent = false;
    for (let channel = 0; channel < durable.bytesPerPixel; channel += 1) {
      const delta = Math.abs(
        durable.pixels[pixelOffset + channel]
          - captured.pixels[pixelOffset + channel]
      );
      if (delta > 0) pixelDifferent = true;
      if (delta > observedMaxChannelDelta) observedMaxChannelDelta = delta;
    }
    if (pixelDifferent) differentPixels += 1;
  }

  return {
    width: durable.width,
    height: durable.height,
    differentPixels,
    maxChannelDelta: observedMaxChannelDelta,
    pixelExact: differentPixels === 0,
    tolerance: {
      maxDifferentPixels,
      maxChannelDelta,
    },
    acceptedGpuRasterTolerance:
      differentPixels <= maxDifferentPixels
      && observedMaxChannelDelta <= maxChannelDelta,
  };
}
