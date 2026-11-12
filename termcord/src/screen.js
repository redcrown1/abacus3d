import { graphemes } from './width.js';

export const A = { BOLD: 1, DIM: 2, ITALIC: 4, UNDER: 8, STRIKE: 16 };
const SGR = [[A.BOLD, 1], [A.DIM, 2], [A.ITALIC, 3], [A.UNDER, 4], [A.STRIKE, 9]];

function to256(c) {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  if (Math.max(r, g, b) - Math.min(r, g, b) < 12) {
    const v = (r + g + b) / 3;
    if (v < 8) return 16;
    if (v > 248) return 231;
    return Math.round(((v - 8) / 247) * 24) + 232;
  }
  const q = (v) => Math.round((v / 255) * 5);
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

// A grid of styled cells. Colors are 0xRRGGBB integers, -1 means terminal default.
export class Screen {
  constructor(w, h, { truecolor = true } = {}) {
    this.truecolor = truecolor;
    this.resize(w, h);
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.ch = new Array(n).fill(' ');
    this.fg = new Int32Array(n).fill(-1);
    this.bg = new Int32Array(n).fill(-1);
    this.at = new Uint8Array(n);
  }

  clear(bg = -1) {
    this.ch.fill(' ');
    this.fg.fill(-1);
    this.bg.fill(bg);
    this.at.fill(0);
  }

  fill(x, y, w, h, bg) {
    const x0 = Math.max(0, x), x1 = Math.min(this.w, x + w);
    const y0 = Math.max(0, y), y1 = Math.min(this.h, y + h);
    for (let r = y0; r < y1; r++) {
      for (let c = x0; c < x1; c++) {
        const i = r * this.w + c;
        this.ch[i] = ' ';
        this.bg[i] = bg;
        this.at[i] = 0;
      }
    }
  }

  // Draws text clipped to maxW cells; an undefined bg keeps what is already there.
  text(x, y, str, { fg = -1, bg, attr = 0 } = {}, maxW = Infinity) {
    if (y < 0 || y >= this.h) return 0;
    const limit = Math.min(this.w, x + maxW);
    let cx = x;
    for (const { g, w } of graphemes(str)) {
      if (cx + w > limit) break;
      if (cx >= 0) {
        const i = y * this.w + cx;
        if (this.ch[i] === '' && cx > 0) this.ch[i - 1] = ' ';
        this.ch[i] = g;
        this.fg[i] = fg;
        this.at[i] = attr;
        if (bg !== undefined) this.bg[i] = bg;
        if (w === 2) {
          this.ch[i + 1] = '';
          this.bg[i + 1] = this.bg[i];
        } else if (cx + 1 < this.w && this.ch[i + 1] === '') {
          this.ch[i + 1] = ' ';
        }
      }
      cx += w;
    }
    return cx - x;
  }

  color(c, base) {
    if (c < 0) return String(base + 9);
    if (this.truecolor) return `${base + 8};2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}`;
    return `${base + 8};5;${to256(c)}`;
  }

  ansiRow(y) {
    let out = '';
    let fg = -2, bg = -2, at = -1;
    for (let x = 0; x < this.w; x++) {
      const i = y * this.w + x;
      if (this.ch[i] === '') continue;
      if (this.fg[i] !== fg || this.bg[i] !== bg || this.at[i] !== at) {
        fg = this.fg[i]; bg = this.bg[i]; at = this.at[i];
        const codes = ['0'];
        for (const [bit, code] of SGR) if (at & bit) codes.push(code);
        codes.push(this.color(fg, 30), this.color(bg, 40));
        out += `\x1b[${codes.join(';')}m`;
      }
      out += this.ch[i];
    }
    return out + '\x1b[0m';
  }

  ansiRows() {
    return Array.from({ length: this.h }, (_, y) => this.ansiRow(y));
  }

  toPlain() {
    const rows = [];
    for (let y = 0; y < this.h; y++) {
      rows.push(this.ch.slice(y * this.w, (y + 1) * this.w).join('').trimEnd());
    }
    return rows.join('\n');
  }
}
