// Terminal cell width of text, measured per grapheme cluster.
export const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const WIDE = [
  [0x1100, 0x115f], [0x2e80, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff],
  [0xfe30, 0xfe4f], [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f1e6, 0x1f1ff],
  [0x1f300, 0x1f64f], [0x1f680, 0x1f6ff], [0x1f900, 0x1faff], [0x20000, 0x3fffd],
];
// BMP symbols that default to emoji (double-width) presentation.
const EMOJI_BMP = new Set([
  0x231a, 0x231b, 0x23e9, 0x23ea, 0x23eb, 0x23ec, 0x23f0, 0x23f3, 0x25fd, 0x25fe,
  0x2614, 0x2615, 0x267f, 0x2693, 0x26a1, 0x26aa, 0x26ab, 0x26bd, 0x26be, 0x26c4,
  0x26c5, 0x26ce, 0x26d4, 0x26ea, 0x26f2, 0x26f3, 0x26f5, 0x26fa, 0x26fd, 0x2705,
  0x270a, 0x270b, 0x2728, 0x274c, 0x274e, 0x2753, 0x2754, 0x2755, 0x2757, 0x2795,
  0x2796, 0x2797, 0x27b0, 0x27bf, 0x2b1b, 0x2b1c, 0x2b50, 0x2b55,
]);

export function cpWidth(cp) {
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0;
  if (cp < 0x1100) return 1;
  if (cp >= 0x2648 && cp <= 0x2653) return 2;
  if (EMOJI_BMP.has(cp)) return 2;
  for (const [a, b] of WIDE) if (cp >= a && cp <= b) return 2;
  return 1;
}

export function gWidth(g) {
  const w = cpWidth(g.codePointAt(0));
  return w === 1 && g.includes('\ufe0f') ? 2 : w;
}

// Printable grapheme clusters with their cell widths; control characters are dropped.
export function graphemes(str) {
  const out = [];
  for (const { segment } of segmenter.segment(str)) {
    const w = gWidth(segment);
    if (w > 0) out.push({ g: segment, w });
  }
  return out;
}

export function strWidth(str) {
  let w = 0;
  for (const { segment } of segmenter.segment(str)) w += gWidth(segment);
  return w;
}

export function truncate(str, max, ellipsis = '…') {
  if (max <= 0) return '';
  if (strWidth(str) <= max) return str;
  let out = '';
  let w = 0;
  for (const { g, w: gw } of graphemes(str)) {
    if (w + gw > max - 1) break;
    out += g;
    w += gw;
  }
  return out + ellipsis;
}

export function center(str, width) {
  const t = truncate(str, width, '');
  const pad = width - strWidth(t);
  const left = pad >> 1;
  return ' '.repeat(left) + t + ' '.repeat(pad - left);
}
