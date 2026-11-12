import { decodePng } from './png.js';
import { T } from './theme.js';

// Images are drawn with half blocks: one cell is one pixel wide and two pixels tall.
export function fit(w, h, maxCols, maxRows) {
  let cols = Math.max(2, Math.min(maxCols, w));
  let pixelRows = Math.max(1, Math.round((cols * h) / w));
  if (pixelRows > maxRows * 2) {
    pixelRows = maxRows * 2;
    cols = Math.max(2, Math.min(maxCols, Math.round((pixelRows * w) / h)));
  }
  return { cols, rows: Math.ceil(pixelRows / 2) };
}

// Box-samples an RGBA image down to rows of [top, bottom] colour pairs, flattened onto bg.
export function toCells(img, cols, rows, bg = T.chat) {
  const { width, height, data } = img;
  const bgc = [(bg >> 16) & 255, (bg >> 8) & 255, bg & 255];
  const pixel = (tx, ty) => {
    const x0 = Math.min(width - 1, Math.floor((tx * width) / cols));
    const x1 = Math.max(x0 + 1, Math.min(width, Math.floor(((tx + 1) * width) / cols)));
    const y0 = Math.min(height - 1, Math.floor((ty * height) / (rows * 2)));
    const y1 = Math.max(y0 + 1, Math.min(height, Math.floor(((ty + 1) * height) / (rows * 2))));
    const sum = [0, 0, 0];
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const o = (y * width + x) * 4;
        const a = data[o + 3] / 255;
        for (let c = 0; c < 3; c++) sum[c] += data[o + c] * a + bgc[c] * (1 - a);
      }
    }
    const n = (x1 - x0) * (y1 - y0);
    return (Math.round(sum[0] / n) << 16) | (Math.round(sum[1] / n) << 8) | Math.round(sum[2] / n);
  };
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => [pixel(c, r * 2), pixel(c, r * 2 + 1)]));
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
      // oversample so the box filter has something to average
      const url = e.src.direct ? e.src.url : sizedUrl(e.src.url, e.cols * 2, e.rows * 4);
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = Buffer.from(await res.arrayBuffer());
    }
    return toCells(decodePng(data), e.cols, e.rows, e.bg);
  }
}
