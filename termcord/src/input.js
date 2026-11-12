import { segmenter, gWidth } from './width.js';

const CSI_KEYS = { A: 'up', B: 'down', C: 'right', D: 'left', H: 'home', F: 'end', Z: 'tab', P: 'f1', Q: 'f2' };
const TILDE = { 1: 'home', 3: 'delete', 4: 'end', 5: 'pageup', 6: 'pagedown', 7: 'home', 8: 'end', 11: 'f1', 12: 'f2' };

// Turns a chunk of raw terminal input into key, text, paste and mouse events.
export function parseInput(data) {
  const out = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ type: 'text', text });
    text = '';
  };
  const key = (name, mods = {}) => {
    flush();
    out.push({ type: 'key', name, ctrl: false, alt: false, shift: false, ...mods });
  };
  let i = 0;
  while (i < data.length) {
    const rest = data.slice(i);
    let m;
    if (rest.startsWith('\x1b[200~')) {
      const end = rest.indexOf('\x1b[201~');
      const body = end < 0 ? rest.slice(6) : rest.slice(6, end);
      flush();
      out.push({ type: 'paste', text: body.replace(/\r\n?/g, '\n') });
      i += end < 0 ? rest.length : end + 6;
    } else if ((m = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(rest))) {
      const b = +m[1];
      let button = null;
      if (b & 64) button = b & 1 ? 'wheeldown' : 'wheelup';
      else if (m[4] === 'M' && (b & 3) === 0 && !(b & 32)) button = 'left';
      if (button) {
        flush();
        out.push({ type: 'mouse', button, x: +m[2] - 1, y: +m[3] - 1 });
      }
      i += m[0].length;
    } else if ((m = /^\x1b\[(\d*)(?:;(\d+))?([A-Za-z~])/.exec(rest))) {
      const bits = m[2] ? +m[2] - 1 : 0;
      const mods = { shift: !!(bits & 1), alt: !!(bits & 2), ctrl: !!(bits & 4) };
      const name = m[3] === '~' ? TILDE[m[1]] : CSI_KEYS[m[3]];
      if (m[3] === 'Z') mods.shift = true;
      if (name) key(name, mods);
      i += m[0].length;
    } else if ((m = /^\x1bO([A-DHFPQ])/.exec(rest))) {
      key(CSI_KEYS[m[1]]);
      i += 3;
    } else if (rest[0] === '\x1b') {
      const c = rest[1];
      if (c === '\r' || c === '\n') { key('enter', { alt: true }); i += 2; }
      else if (c === '\x7f') { key('backspace', { alt: true }); i += 2; }
      else if (c !== undefined && c >= ' ' && c !== '\x1b') { key(c.toLowerCase(), { alt: true }); i += 2; }
      else { key('escape'); i += 1; }
    } else {
      const code = rest.charCodeAt(0);
      if (code === 13) key('enter');
      else if (code === 10) key('enter', { alt: true });
      else if (code === 9) key('tab');
      else if (code === 127 || code === 8) key('backspace');
      else if (code < 32) key(String.fromCharCode(code + 96), { ctrl: true });
      else {
        const ch = String.fromCodePoint(rest.codePointAt(0));
        text += ch;
        i += ch.length - 1;
      }
      i += 1;
    }
  }
  flush();
  return out;
}

export function prevBoundary(text, cursor) {
  let prev = 0;
  for (const { index } of segmenter.segment(text)) {
    if (index >= cursor) break;
    prev = index;
  }
  return prev;
}

export function nextBoundary(text, cursor) {
  for (const { index, segment } of segmenter.segment(text)) {
    if (index + segment.length > cursor) return index + segment.length;
  }
  return text.length;
}

// Character-wraps composer text and locates the cursor in the wrapped lines.
export function layoutInput(text, cursor, width) {
  const lines = [''];
  let col = 0, cy = 0, cx = 0, found = false;
  const mark = () => {
    cy = lines.length - 1;
    cx = col;
    found = true;
  };
  const newline = () => {
    lines.push('');
    col = 0;
  };
  for (const { segment, index } of segmenter.segment(text)) {
    if (segment === '\n') {
      if (index === cursor) mark();
      newline();
      continue;
    }
    const w = gWidth(segment);
    if (w === 0) continue;
    if (col + w > width) newline();
    if (index === cursor) mark();
    lines[lines.length - 1] += segment;
    col += w;
  }
  if (!found) mark();
  return { lines, cy, cx };
}
