import { decodePng } from './png.js';
import { T } from './theme.js';

// A terminal cell is twice as tall as it is wide, so an image of cols x rows cells covers cols x (rows * 2) squares.
export function fit(w, h, maxCols, maxRows) {
  let cols = Math.max(2, Math.min(maxCols, w));
  let pixelRows = Math.max(1, Math.round((cols * h) / w));
  if (pixelRows > maxRows * 2) {
    pixelRows = maxRows * 2;
    cols = Math.max(2, Math.min(maxCols, Math.round((pixelRows * w) / h)));
  }
  return { cols, rows: Math.ceil(pixelRows / 2) };
}

// Quadrant glyphs indexed by a bit mask: 1 top-left, 2 top-right, 4 bottom-left, 8 bottom-right.
const QUADS = [' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛', '▗', '▚', '▐', '▜', '▄', '▙', '▟', '█'];
const rgb = (c) => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);
const mean = (list) => [0, 1, 2].map((i) => list.reduce((sum, c) => sum + c[i], 0) / list.length);

// Scales an RGBA image to rows of [glyph, fg, bg] cells, flattened onto bg.
// Each cell samples 2x2 points and picks the two-colour quadrant glyph that fits them best.
export function toCells(img, cols, rows, bg = T.chat) {
  const { width, height, data } = img;
  const bgc = [(bg >> 16) & 255, (bg >> 8) & 255, bg & 255];
  const gw = cols * 2, gh = rows * 2;
  const sample = (tx, ty) => {
    const x0 = Math.min(width - 1, Math.floor((tx * width) / gw));
    const x1 = Math.max(x0 + 1, Math.min(width, Math.floor(((tx + 1) * width) / gw)));
    const y0 = Math.min(height - 1, Math.floor((ty * height) / gh));
    const y1 = Math.max(y0 + 1, Math.min(height, Math.floor(((ty + 1) * height) / gh)));
    const sum = [0, 0, 0];
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const o = (y * width + x) * 4;
        const a = data[o + 3] / 255;
        for (let c = 0; c < 3; c++) sum[c] += data[o + c] * a + bgc[c] * (1 - a);
      }
    }
    const n = (x1 - x0) * (y1 - y0);
    return [sum[0] / n, sum[1] / n, sum[2] / n];
  };
  const cell = (cx, cy) => {
    const p = [sample(cx * 2, cy * 2), sample(cx * 2 + 1, cy * 2), sample(cx * 2, cy * 2 + 1), sample(cx * 2 + 1, cy * 2 + 1)];
    let channel = 0, range = -1, lo = 0;
    for (let c = 0; c < 3; c++) {
      const values = p.map((q) => q[c]);
      const min = Math.min(...values), max = Math.max(...values);
      if (max - min > range) [channel, range, lo] = [c, max - min, min];
    }
    // flat cells keep the smoother top/bottom split
    if (range < 32) return ['▀', rgb(mean([p[0], p[1]])), rgb(mean([p[2], p[3]]))];
    const mid = lo + range / 2;
    let mask = 0;
    p.forEach((q, i) => {
      if (q[channel] > mid) mask |= 1 << i;
    });
    return [QUADS[mask], rgb(mean(p.filter((_, i) => mask & (1 << i)))), rgb(mean(p.filter((_, i) => !(mask & (1 << i)))))];
  };
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => cell(c, r)));
}

// Asks Discord's media proxy for a PNG no larger than the given size.
export function sizedUrl(url, width, height) {
  const u = new URL(url);
  u.searchParams.set('format', 'png');
  u.searchParams.set('width', width);
  u.searchParams.set('height', height);
  return u.href;
}

export function messageImages(m) {
  return [...m.attachments.map((a) => a.image), ...m.embeds.map((e) => e.image)].filter(Boolean);
}

// Lazily downloads and scales pictures. A source is { id, w, h, name } with url or data;
// direct sources (avatars, icons) are fetched as given instead of through the resizing proxy.
export class ImageCache {
  constructor(onLoad) {
    this.onLoad = onLoad;
    this.entries = new Map();
    this.queue = [];
    this.active = 0;
  }

  get(src, maxCols, maxRows, bg = T.chat) {
    const { cols, rows } = fit(src.w, src.h, maxCols, maxRows);
    const key = `${src.id}|${cols}x${rows}|${bg}`;
    let e = this.entries.get(key);
    if (!e) this.entries.set(key, (e = { src, cols, rows, bg, state: 'idle', cells: null }));
    return e;
  }

  load(e) {
    if (e.state !== 'idle') return;
    e.state = 'loading';
    this.queue.push(e);
    this.pump();
  }

  pump() {
    while (this.active < 4 && this.queue.length) {
      const e = this.queue.shift();
      this.active++;
      this.fetch(e)
        .then((cells) => Object.assign(e, { cells, state: 'ready' }), () => (e.state = 'error'))
        .finally(() => {
          this.active--;
          this.onLoad(e);
          this.pump();
        });
    }
  }

  async fetch(e) {
    let data = e.src.data;
    if (!data) {
      // oversample so each sampled point averages several source pixels
      const url = e.src.direct ? e.src.url : sizedUrl(e.src.url, e.cols * 4, e.rows * 4);
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = Buffer.from(await res.arrayBuffer());
    }
    return toCells(decodePng(data), e.cols, e.rows, e.bg);
  }
}
