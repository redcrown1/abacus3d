import { strWidth, graphemes } from './width.js';

const SPECIAL = /[\\`|*_~<@[]|https?:\/\//g;

// Parses Discord inline markdown into flat styled spans.
// ctx resolves ids: user(id) -> name, role(id) -> {name,color}, channel(id) -> name.
export function parseInline(src, ctx = {}, style = {}, out = []) {
  let i = 0;
  let buf = '';
  const flush = () => {
    if (buf) out.push({ ...style, text: buf });
    buf = '';
  };
  const emit = (text, extra) => {
    flush();
    out.push({ ...style, ...extra, text });
  };
  const nest = (inner, extra) => {
    flush();
    parseInline(inner, ctx, { ...style, ...extra }, out);
  };
  while (i < src.length) {
    SPECIAL.lastIndex = i;
    const hit = SPECIAL.exec(src);
    if (!hit) {
      buf += src.slice(i);
      break;
    }
    buf += src.slice(i, hit.index);
    i = hit.index;
    const rest = src.slice(i);
    let r;
    if ((r = /^\\([^\w\s])/.exec(rest))) buf += r[1];
    else if ((r = /^(`+)([\s\S]*?[^`])\1(?!`)/.exec(rest))) emit(r[2], { code: true });
    else if ((r = /^\|\|([\s\S]+?)\|\|/.exec(rest))) nest(r[1], { spoiler: true });
    else if ((r = /^\*\*([\s\S]+?)\*\*(?!\*)/.exec(rest))) nest(r[1], { b: true });
    else if ((r = /^__([\s\S]+?)__(?!_)/.exec(rest))) nest(r[1], { u: true });
    else if ((r = /^~~([\s\S]+?)~~/.exec(rest))) nest(r[1], { s: true });
    else if ((r = /^\*(?!\s)([^*]+?)\*(?!\*)/.exec(rest))) nest(r[1], { i: true });
    else if (!/\w/.test(src[i - 1] ?? '') && (r = /^_(?!\s)([^_]+?)_(?!\w)/.exec(rest))) nest(r[1], { i: true });
    else if ((r = /^<@!?(\w+)>/.exec(rest))) emit('@' + (ctx.user?.(r[1]) ?? 'unknown-user'), { mention: true });
    else if ((r = /^<@&(\w+)>/.exec(rest))) {
      const role = ctx.role?.(r[1]);
      emit('@' + (role?.name ?? 'unknown-role'), { mention: true, color: role?.color || undefined });
    } else if ((r = /^<#(\w+)>/.exec(rest))) emit('#' + (ctx.channel?.(r[1]) ?? 'unknown'), { mention: true });
    else if ((r = /^<a?:(\w+):\d+>/.exec(rest))) emit(`:${r[1]}:`);
    else if ((r = /^<t:(\d+)(?::[a-zA-Z])?>/.exec(rest))) emit(new Date(+r[1] * 1000).toLocaleString('en-US'), { code: true });
    else if ((r = /^@(everyone|here)\b/.exec(rest))) emit(r[0], { mention: true });
    else if ((r = /^\[([^\]]+)\]\(<?(https?:\/\/[^\s)>]+)>?\)/.exec(rest))) emit(r[1], { link: r[2] });
    else if ((r = /^<(https?:\/\/[^\s>]+)>/.exec(rest))) emit(r[1], { link: r[1] });
    else if ((r = /^https?:\/\/[^\s<>]+/.exec(rest))) {
      const url = r[0].replace(/[.,;:!?)\]'"]+$/, '');
      r = [url];
      emit(url, { link: url });
    }
    if (r) i += r[0].length;
    else buf += src[i++];
  }
  flush();
  return out;
}

// Splits message content into paragraph, quote and code blocks.
export function parseBlocks(content, ctx = {}) {
  const blocks = [];
  const fence = /```(?:([\w+#-]*)\n)?([\s\S]*?)```/g;
  let last = 0;
  const prose = (chunk) => {
    for (const line of chunk.replace(/^\n+|\n+$/g, '').split('\n')) {
      let m;
      if ((m = /^>\s?(.*)$/.exec(line))) blocks.push({ type: 'quote', spans: parseInline(m[1], ctx) });
      else if ((m = /^#{1,3}\s+(.+)$/.exec(line))) blocks.push({ type: 'p', spans: parseInline(m[1], ctx, { b: true }) });
      else if ((m = /^-#\s+(.+)$/.exec(line))) blocks.push({ type: 'p', spans: parseInline(m[1], ctx, { muted: true }) });
      else if ((m = /^(\s*)[-*]\s+(.+)$/.exec(line))) blocks.push({ type: 'p', spans: parseInline(`${m[1]}• ${m[2]}`, ctx) });
      else blocks.push({ type: 'p', spans: parseInline(line, ctx) });
    }
  };
  let m;
  while ((m = fence.exec(content))) {
    if (m.index > last) prose(content.slice(last, m.index));
    blocks.push({ type: 'code', lines: m[2].replace(/\n$/, '').split('\n') });
    last = fence.lastIndex;
  }
  if (last < content.length && content.slice(last).trim()) prose(content.slice(last));
  return blocks;
}

// Word-wraps spans to a cell width; each line is a list of {text, st} pieces.
export function wrapSpans(spans, width) {
  const lines = [[]];
  let cur = 0;
  const push = (text, st) => {
    const line = lines[lines.length - 1];
    const last = line[line.length - 1];
    if (last && last.st === st) last.text += text;
    else line.push({ text, st });
  };
  const newline = () => {
    lines.push([]);
    cur = 0;
  };
  for (const st of spans) {
    for (const tok of st.text.split(/(\s+)/)) {
      if (!tok) continue;
      const w = strWidth(tok);
      if (cur + w <= width) {
        push(tok, st);
        cur += w;
      } else if (/^\s+$/.test(tok)) {
        newline();
      } else if (w <= width) {
        newline();
        push(tok, st);
        cur = w;
      } else {
        for (const { g, w: gw } of graphemes(tok)) {
          if (cur + gw > width) newline();
          push(g, st);
          cur += gw;
        }
      }
    }
  }
  return lines;
}
