import { inflateSync, deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const MAX_PIXELS = 16e6;

// Decodes a non-interlaced PNG into { width, height, data } with RGBA bytes.
export function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG image');
  let ihdr, palette, trns;
  const idat = [];
  for (let pos = 8; pos + 8 <= buf.length;) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!ihdr || ihdr.length < 13 || !idat.length) throw new Error('corrupt PNG');
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4), depth = ihdr[8], ctype = ihdr[9];
  const ch = CHANNELS[ctype];
  if (!ch || ihdr[12] !== 0 || (ctype === 3 && !palette)) throw new Error('unsupported PNG variant');
  if (!width || !height || width * height > MAX_PIXELS) throw new Error('image too large');

  const bpp = Math.max(1, (ch * depth) >> 3);
  const stride = Math.ceil((width * ch * depth) / 8);
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error('corrupt PNG');
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0;
      const b = y ? px[o - stride + x] : 0;
      const c = x >= bpp && y ? px[o - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[o + x] = v & 255;
    }
  }

  // i-th sample of row y, reduced to its top 8 bits for 16-bit images
  const sample = (y, i) => {
    if (depth === 8) return px[y * stride + i];
    if (depth === 16) return px[y * stride + i * 2];
    const bit = i * depth;
    return (px[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
  };
  const scale = depth < 8 ? 255 / ((1 << depth) - 1) : 1;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (ctype === 3) {
        const i = sample(y, x);
        data[o] = palette[i * 3];
        data[o + 1] = palette[i * 3 + 1];
        data[o + 2] = palette[i * 3 + 2];
        data[o + 3] = trns && i < trns.length ? trns[i] : 255;
      } else if (ch <= 2) {
        data[o] = data[o + 1] = data[o + 2] = sample(y, x * ch) * scale;
        data[o + 3] = ch === 2 ? sample(y, x * 2 + 1) : 255;
      } else {
        data[o] = sample(y, x * ch);
        data[o + 1] = sample(y, x * ch + 1);
        data[o + 2] = sample(y, x * ch + 2);
        data[o + 3] = ch === 4 ? sample(y, x * 4 + 3) : 255;
      }
    }
  }
  return { width, height, data };
}

const CRC = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  let crc = 0xffffffff;
  for (const byte of body) crc = CRC[(crc ^ byte) & 255] ^ (crc >>> 8);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4);
  return out;
}

// Encodes RGBA bytes as a PNG. Used for the demo picture and in tests.
export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
