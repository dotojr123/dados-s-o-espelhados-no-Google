import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createSolidPNG(width, height, r, g, b, a = 255) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth 8
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace

  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Scanlines with filter byte 0
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      // Soft radial gradient / brand color (#4f46e5 to #10b981)
      const ratio = (x + y) / (width + height);
      rawData[pixelOffset] = Math.round(79 * (1 - ratio) + 16 * ratio); // R
      rawData[pixelOffset + 1] = Math.round(70 * (1 - ratio) + 185 * ratio); // G
      rawData[pixelOffset + 2] = Math.round(229 * (1 - ratio) + 129 * ratio); // B
      rawData[pixelOffset + 3] = a; // A
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = data.length;
  const chunk = Buffer.alloc(8 + length + 4);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crc = crc32(chunk.subarray(4, 8 + length));
  chunk.writeInt32BE(crc, 8 + length);
  return chunk;
}

// Standard CRC32 table
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return c ^ -1;
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createSolidPNG(192, 192, 79, 70, 229));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createSolidPNG(512, 512, 79, 70, 229));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createSolidPNG(512, 512, 16, 185, 129));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createSolidPNG(180, 180, 79, 70, 229));

console.log('PWA PNG icons generated successfully!');
