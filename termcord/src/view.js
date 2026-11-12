import { T, STATUS, userColor, QUICK_REACTIONS } from './theme.js';
import { A } from './screen.js';
import { strWidth, truncate, center } from './width.js';
import { parseBlocks, parseInline, wrapSpans } from './markdown.js';
import { layoutInput } from './input.js';
import { HELP } from './app.js';

const RAIL_W = 8;
const ICON = { text: '#', announcement: '»', voice: '♪', forum: '≡', dm: '@', category: '⌄' };
const HINTS = {
  guilds: '↑↓ switch server · → channels',
  channels: '↑↓ move · Enter open · ← servers',
  messages: 'r reply · e edit · d delete · + react · v image · Esc back',
  input: 'Ctrl+K jump · F1 help',
  members: '↑↓ move · Enter profile · Esc back',
};
const SYSTEM = { join: 'joined the server.', pin: 'pinned a message to this channel.', boost: 'just boosted the server!' };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const initial = (name) => ([...name.replace(/^[^\p{L}\p{N}]+/u, '')][0] ?? '?').toUpperCase();
const dayKey = (ts) => new Date(ts).toDateString();

function fmtTime(ts) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const midnight = new Date().setHours(0, 0, 0, 0);
  if (ts >= midnight) return `Today at ${time}`;
  if (ts >= midnight - 86400000) return `Yesterday at ${time}`;
  return `${d.toLocaleDateString('en-US')} ${time}`;
}

function fmtSize(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function spanStyle(st) {
  let attr = 0;
  if (st.b) attr |= A.BOLD;
  if (st.i) attr |= A.ITALIC;
  if (st.u || st.link) attr |= A.UNDER;
  if (st.s) attr |= A.STRIKE;
  return {
    fg: st.color ?? (st.link ? T.link : st.mention ? T.mentionFg : st.muted ? T.faint : T.text),
    bg: st.mention ? T.mentionBg : st.code ? T.codeInline : undefined,
    attr,
    spoiler: !!st.spoiler,
  };
}

export function render(app, s) {
  const { w: W, h: H } = s;
  app.hits = [];
  app.cursor = null;
  app.sync();
  s.clear(T.chat);
  if (W < 64 || H < 14) {
    app.layout = null;
    s.text(1, 0, `Window too small (${W}x${H}), need at least 64x14`, { fg: T.text });
    return;
  }
  const sideW = W >= 96 ? 28 : 22;
  const memW = app.showMembers && app.guildId !== '@me' && W >= 104 ? 26 : 0;
  const chatX = RAIL_W + sideW;
  const chatW = W - chatX - memW;
  app.layout = { railW: RAIL_W, chatX, chatW, memX: W - memW, memW };
  drawRail(app, s, H);
  drawSidebar(app, s, RAIL_W, sideW, H);
  drawHeader(app, s, chatX, W - chatX);
  drawChat(app, s, chatX, 2, chatW, H - 2);
  if (memW) drawMembers(app, s, W - memW, 2, memW, H - 2);
  if (app.modal) drawModal(app, s);
}

function drawRail(app, s, H) {
  s.fill(0, 0, RAIL_W, H, T.rail);
  const items = app.railItems();
  const sel = items.findIndex((i) => i.id === app.guildId);
  const yOf = (i) => (i === 0 ? 0 : 4 + (i - 1) * 3);
  let sc = clamp(app.railScroll, 0, Math.max(0, yOf(items.length) - H));
  if (sel >= 0) sc = clamp(sc, yOf(sel) + 3 - H, yOf(sel));
  app.railScroll = sc = Math.max(0, sc);
  if (items.length > 1) s.text(3, 3 - sc, '──', { fg: T.divider });
  items.forEach((it, i) => {
    const y = yOf(i) - sc;
    if (y + 2 < 0 || y >= H) return;
    const active = i === sel;
    const col = active ? T.blurple : T.chat;
    const focused = active && app.focus === 'guilds';
    s.text(2, y, '▄▄▄▄', { fg: col });
    s.text(2, y + 1, center(it.label, 4), {
      fg: active ? T.white : it.id === '@me' ? T.text : userColor(it.id), bg: col, attr: A.BOLD | (focused ? A.UNDER : 0),
    });
    s.text(2, y + 2, '▀▀▀▀', { fg: col });
    const badge = app.store.badge(it.id);
    if (active) {
      s.text(0, y, '▖', { fg: T.white });
      s.text(0, y + 1, '▌', { fg: T.white });
      s.text(0, y + 2, '▘', { fg: T.white });
    } else if (badge.unread) s.text(0, y + 1, '•', { fg: T.white });
    if (badge.mentions) s.text(5, y + 2, String(Math.min(badge.mentions, 99)), { fg: T.white, bg: T.red, attr: A.BOLD });
    app.hits.push({ x: 0, y, w: RAIL_W, h: 3, type: 'guild', id: it.id });
  });
}

function drawSidebar(app, s, x, w, H) {
  const st = app.store;
  s.fill(x, 0, w, H, T.side);
  const guild = st.guilds.get(app.guildId);
  s.text(x + 2, 0, truncate(app.guildId === '@me' ? 'Direct Messages' : guild?.name ?? '', w - 6), { fg: T.bright, attr: A.BOLD });
  if (guild) s.text(x + w - 3, 0, '⌄', { fg: T.muted });
  s.text(x, 1, '─'.repeat(w), { fg: T.line });

  const voice = st.voice;
  const top = 2;
  const viewH = H - 2 - top - (voice ? 2 : 0);
  const items = app.sidebarItems();
  let sc = app.sideScroll;
  if (app.sideFollow) {
    if (app.chanCursor < sc + 1) sc = app.chanCursor - 1;
    if (app.chanCursor >= sc + viewH) sc = app.chanCursor - viewH + 1;
  }
  app.sideScroll = sc = clamp(sc, 0, Math.max(0, items.length - viewH));
  for (let i = 0; i < viewH; i++) {
    const idx = sc + i;
    const it = items[idx];
    if (!it) break;
    const y = top + i;
    const cursor = app.focus === 'channels' && idx === app.chanCursor;
    if (it.kind === 'label') s.text(x + 2, y, it.text, { fg: T.chan, attr: A.BOLD });
    else if (it.kind === 'voiceUser') {
      const talking = st.speaking.has(it.userId);
      s.text(x + 6, y, '●', { fg: talking ? T.green : T.divider });
      s.text(x + 8, y, truncate(it.name, w - 10), { fg: talking ? T.white : T.muted });
    } else if (it.kind === 'category') {
      if (cursor) s.fill(x + 1, y, w - 2, 1, T.hover);
      s.text(x + 1, y, `${it.collapsed ? '›' : '⌄'} ${truncate(it.ch.name.toUpperCase(), w - 5)}`, { fg: cursor ? T.bright : T.chan, attr: A.BOLD });
      app.hits.push({ x, y, w, h: 1, type: 'side', index: idx });
    } else if (it.kind === 'channel') {
      const ch = it.ch;
      const active = ch.id === app.channelId;
      const u = active ? null : st.unread.get(ch.id);
      if (active || cursor) s.fill(x + 1, y, w - 2, 1, cursor && !active ? T.hover : T.sel);
      if (u) s.text(x, y, '•', { fg: T.white });
      const badge = u?.mentions ? ` ${Math.min(u.mentions, 99)} ` : '';
      const status = ch.type === 'dm' ? ch.status : null;
      if (ch.type === 'dm' && status) s.text(x + 2, y, status === 'offline' ? '○' : '●', { fg: STATUS[status].color });
      else s.text(x + 2, y, ICON[ch.type] ?? '#', { fg: voice?.channelId === ch.id ? T.green : active || u ? T.text : T.chan });
      s.text(x + 4, y, truncate(ch.name, w - 6 - badge.length), { fg: active || u ? T.white : cursor ? T.bright : T.chan, attr: u ? A.BOLD : 0 });
      if (badge) s.text(x + w - 1 - badge.length, y, badge, { fg: T.white, bg: T.red, attr: A.BOLD });
      app.hits.push({ x, y, w, h: 1, type: 'side', index: idx });
    }
  }

  if (voice) {
    const y = H - 4;
    const [label, col] = voice.state === 'connected' ? ['Voice Connected', T.green]
      : voice.state === 'presence' ? ['Joined · no audio', T.yellow] : ['Connecting…', T.yellow];
    s.fill(x, y, w, 2, T.panel);
    s.text(x + 1, y, '●', { fg: col });
    s.text(x + 3, y, truncate(label, w - 8), { fg: col, attr: A.BOLD });
    s.text(x + w - 4, y, ' ✕ ', { fg: T.text, bg: T.sel });
    app.hits.push({ x: x + w - 4, y, w: 3, h: 1, type: 'voiceLeave' });
    let bx = x + w - 1;
    for (const [on, off, isOff, type] of [[' EAR ', ' DEAF ', voice.deafened, 'voiceDeaf'], [' MIC ', ' MUTED ', voice.muted, 'voiceMute']]) {
      const text = isOff ? off : on;
      bx -= text.length;
      s.text(bx, y + 1, text, isOff ? { fg: T.white, bg: T.red, attr: A.BOLD } : { fg: T.green, bg: T.sel });
      app.hits.push({ x: bx, y: y + 1, w: text.length, h: 1, type });
      bx -= 1;
    }
    s.text(x + 1, y + 1, truncate(`♪ ${st.channels.get(voice.channelId)?.name ?? ''}`, bx - x - 1), { fg: T.muted });
  }

  // user panel
  const me = st.me;
  s.fill(x, H - 2, w, 2, T.panel);
  if (!me) return;
  const col = userColor(me.id);
  s.text(x + 1, H - 2, ` ${initial(me.name)} `, { fg: T.modal, bg: col, attr: A.BOLD });
  s.text(x + 1, H - 1, '▀▀▀', { fg: col });
  s.text(x + 5, H - 2, truncate(me.name, w - 7), { fg: T.bright, attr: A.BOLD });
  s.text(x + 5, H - 1, '●', { fg: T.green });
  s.text(x + 7, H - 1, 'Online', { fg: T.muted });
  s.text(x + w - 8, H - 1, 'F1 help', { fg: T.faint });
}

function drawHeader(app, s, x, w) {
  const ch = app.channel();
  s.text(x, 1, '─'.repeat(w), { fg: T.line });
  const hint = HINTS[app.focus];
  const hw = w > strWidth(hint) + 30 ? strWidth(hint) : 0;
  if (hw) s.text(x + w - hw - 2, 0, hint, { fg: T.faint });
  if (!ch) return;
  let cx = x + 2;
  cx += s.text(cx, 0, `${ICON[ch.type] ?? '#'} `, { fg: T.chan });
  cx += s.text(cx, 0, truncate(ch.name, 28), { fg: T.bright, attr: A.BOLD });
  const avail = x + w - hw - 4 - cx - 3;
  if (ch.topic && avail > 8) {
    cx += s.text(cx, 0, ' │ ', { fg: T.divider });
    s.text(cx, 0, truncate(ch.topic.replace(/\s+/g, ' '), avail), { fg: T.muted });
  }
}

// ----- messages -----

function divider(w, label, color, labelColor) {
  const lw = strWidth(label) + 2;
  const left = Math.max(1, (w - 2 - lw) >> 1);
  const right = Math.max(1, w - 2 - lw - left);
  return {
    parts: [
      { x: 1, text: '─'.repeat(left), fg: color },
      { x: 1 + left, text: ` ${label} `, fg: labelColor, attr: A.BOLD },
      { x: 1 + left + lw, text: '─'.repeat(right), fg: color },
    ],
  };
}

function layoutMessage(app, ch, m, grouped, cw) {
  const st = app.store;
  const guild = st.guilds.get(ch.guildId);
  const ctx = app.mdCtx(ch.guildId);
  const X = 5;
  const rows = [];
  const row = (parts) => {
    const r = { msgId: m.id, mention: m.mentionsMe, parts };
    rows.push(r);
    return r;
  };
  const styled = (line, x, bg) => line.map(({ text, st: sp }) => {
    const style = spanStyle(sp);
    const part = { x, text, ...style, bg: style.bg ?? bg };
    x += strWidth(text);
    return part;
  });
  const member = guild?.members.get(m.author.id);
  const name = member?.name ?? m.author.name;
  const avatar = userColor(m.author.id);

  if (m.type !== 'default') {
    rows.push({ parts: [] });
    const nx = X + strWidth(name) + 1;
    const label = SYSTEM[m.type] ?? m.content;
    row([
      { x: 2, text: '→', fg: T.green }, { x: X, text: name, fg: T.bright, attr: A.BOLD },
      { x: nx, text: label, fg: T.muted }, { x: nx + strWidth(label) + 1, text: fmtTime(m.ts), fg: T.faint },
    ]);
    return rows;
  }

  if (!grouped) rows.push({ parts: [] });
  if (m.reply) {
    const who = m.reply.deleted ? '' : `@${st.displayName(ch.guildId, m.reply.authorId) ?? m.reply.author}`;
    const raw = m.reply.deleted ? 'Original message was deleted' : m.reply.content || 'Click to see attachment';
    const snippet = parseInline(raw.replace(/\s+/g, ' '), ctx).map((sp) => sp.text).join('');
    const sx = X + 1 + (who ? strWidth(who) + 1 : 0);
    row([
      { x: 2, text: '╭──', fg: T.divider }, { x: X + 1, text: who, fg: T.muted, attr: A.BOLD },
      { x: sx, text: truncate(snippet, cw - (sx - X) - 1), fg: T.muted, attr: m.reply.deleted ? A.ITALIC : 0 },
    ]);
  }
  if (!grouped) {
    const parts = [
      { x: 1, text: ` ${initial(name)} `, fg: T.modal, bg: avatar, attr: A.BOLD },
      { x: X, text: name, fg: (guild && member && st.memberColor(guild, member)) || T.bright, attr: A.BOLD },
    ];
    let x = X + strWidth(name) + 1;
    if (m.author.bot) {
      parts.push({ x, text: ' APP ', fg: T.white, bg: T.blurple, attr: A.BOLD });
      x += 6;
    }
    parts.push({ x, text: fmtTime(m.ts), fg: T.faint });
    row(parts);
  }
  const bodyStart = rows.length;

  const blocks = parseBlocks(m.content, ctx);
  if (m.edited) {
    const last = blocks.at(-1);
    if (last?.spans) last.spans.push({ text: ' (edited)', muted: true });
    else blocks.push({ type: 'p', spans: [{ text: '(edited)', muted: true }] });
  }
  for (const b of blocks) {
    if (b.type === 'code') {
      for (const src of b.lines) {
        for (const line of wrapSpans([{ text: src.replace(/\t/g, '  ') }], cw - 2)) {
          const text = line.map((p) => p.text).join('');
          row([{ x: X, text: ` ${text}${' '.repeat(Math.max(0, cw - 1 - strWidth(text)))}`, fg: T.text, bg: T.code }]);
        }
      }
    } else {
      const pre = b.type === 'quote' ? 2 : 0;
      for (const line of wrapSpans(b.spans, cw - pre)) {
        row([...(pre ? [{ x: X, text: '▎', fg: T.divider }] : []), ...styled(line, X + pre)]);
      }
    }
  }
  const picture = (src) => {
    const e = app.images.get(src, Math.min(cw, 56), 14);
    for (let i = 0; i < e.rows; i++) {
      if (e.cells) {
        row([{ x: X, px: e.cells[i] }]);
        continue;
      }
      const label = i !== e.rows >> 1 ? '' : e.state === 'error' ? `▣ ${src.name} (no preview)` : `Loading ${src.name}…`;
      row([{ x: X, text: center(truncate(label, e.cols - 2), e.cols), fg: T.muted, bg: T.code }]).need = e;
    }
  };
  for (const a of m.attachments) {
    if (a.image) {
      picture(a.image);
      continue;
    }
    const nameText = truncate(a.name, cw - 14);
    row([
      { x: X, text: '▣', fg: T.muted }, { x: X + 2, text: nameText, fg: T.link, attr: A.UNDER },
      { x: X + 3 + strWidth(nameText), text: fmtSize(a.size), fg: T.faint },
    ]);
  }
  for (const e of m.embeds) {
    const ew = Math.min(cw, 72);
    const put = (spans) => {
      for (const line of wrapSpans(spans, ew - 4)) {
        row([
          { x: X, text: '▎', fg: e.color || T.divider, bg: T.code }, { x: X + 1, text: ' '.repeat(ew - 1), bg: T.code },
          ...styled(line, X + 2, T.code),
        ]);
      }
    };
    if (e.author) put([{ text: e.author, b: true }]);
    if (e.title) put([{ text: e.title, b: true, ...(e.url ? { link: e.url } : {}) }]);
    for (const line of (e.description ?? '').split('\n')) if (line.trim()) put(parseInline(line, ctx));
    for (const f of e.fields ?? []) put([{ text: `${f.name}: `, b: true }, ...parseInline(String(f.value).replace(/\n/g, ' '), ctx)]);
    if (e.footer) put([{ text: e.footer, muted: true }]);
    if (e.image) picture(e.image);
  }
  if (m.reactions.length) {
    let parts = [];
    let x = X;
    for (const r of m.reactions) {
      const label = ` ${r.label} ${r.count} `;
      const w = strWidth(label);
      if (x + w > X + cw && parts.length) {
        row(parts);
        parts = [];
        x = X;
      }
      parts.push({ x, text: label, fg: r.me ? T.mentionFg : T.muted, bg: r.me ? T.reactMe : T.code });
      x += w + 1;
    }
    row(parts);
  }
  if (rows.length === bodyStart) row([{ x: X, text: '(no text content)', fg: T.faint, attr: A.ITALIC }]);
  if (!grouped) rows[bodyStart].parts.unshift({ x: 1, text: '▀▀▀', fg: avatar });
  return rows;
}

function buildRows(app, ch, w) {
  const st = app.store;
  const h = st.history(ch.id);
  const cw = Math.max(10, w - 7);
  const rows = [];
  if (h.loaded && !h.hasMore) {
    const dm = ch.type === 'dm';
    rows.push({ parts: [] }, { parts: [{ x: 2, text: `  ${ICON[ch.type] ?? '#'}  `, fg: T.white, bg: T.sel, attr: A.BOLD }] },
      { parts: [{ x: 2, text: dm ? ch.name : `Welcome to #${ch.name}!`, fg: T.bright, attr: A.BOLD }] },
      { parts: [{ x: 2, text: truncate(dm ? `This is the beginning of your direct message history with ${ch.name}.` : `This is the start of the #${ch.name} channel.`, w - 4), fg: T.muted }] });
  }
  let prev = null;
  for (const m of h.list) {
    const dayChange = !prev || dayKey(prev.ts) !== dayKey(m.ts);
    if (dayChange) {
      rows.push({ parts: [] }, divider(w, new Date(m.ts).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), T.divider, T.muted));
    }
    const isNew = m.id === app.newMarker;
    if (isNew) rows.push(divider(w, 'NEW', T.red, T.red));
    const grouped = !!prev && !dayChange && !isNew && prev.author.id === m.author.id && m.ts - prev.ts < 7 * 60000 &&
      !m.reply && m.type === 'default' && prev.type === 'default';
    const key = `${m.rev ?? 0}|${w}|${grouped}|${st.layoutRev}`;
    let c = app.rowCache.get(m.id);
    if (!c || c.key !== key) app.rowCache.set(m.id, (c = { key, rows: layoutMessage(app, ch, m, grouped, cw) }));
    for (const r of c.rows) rows.push(r);
    prev = m;
  }
  rows.push({ parts: [] });
  return rows;
}

function drawPixels(s, x, y, cells, maxW) {
  for (let i = 0; i < cells.length && i < maxW; i++) s.text(x + i, y, '▀', { fg: cells[i][0], bg: cells[i][1] });
}

function typingText(app, ch) {
  const names = app.store.typingUsers(ch.id).map((id) => app.store.displayName(ch.guildId, id) ?? 'Someone');
  if (!names.length) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names.at(-1)} are typing…`;
  return 'Several people are typing…';
}

function drawChat(app, s, x, y, w, h) {
  const st = app.store;
  const ch = app.channel();
  const bottom = y + h;
  if (st.status) s.text(x + w - strWidth(st.status) - 2, bottom - 1, st.status, { fg: T.yellow }, w - 2);
  if (!ch) {
    s.text(x + 2, y + 1, st.guilds.size || st.me ? 'No channel selected.' : 'Connecting…', { fg: T.muted });
    return;
  }
  const typing = typingText(app, ch);
  if (typing) {
    s.text(x + 2, bottom - 1, '•••', { fg: T.text, attr: A.BOLD });
    s.text(x + 6, bottom - 1, truncate(typing, w - 8 - strWidth(st.status)), { fg: T.muted });
  }

  // composer
  const bx = x + 1, bw = w - 2, tx = bx + 4, tw = bw - 6;
  const can = app.canSend(ch);
  const { lines, cy, cx } = layoutInput(app.input.text, app.input.cursor, tw);
  const ih = Math.min(6, lines.length);
  const lineTop = clamp(cy - ih + 1, 0, lines.length - ih);
  const boxY = bottom - 1 - ih;
  s.fill(bx, boxY, bw, ih, T.input);
  s.text(bx + 1, boxY, '+', { fg: T.muted, attr: A.BOLD });
  if (!app.input.text) {
    const name = ch.type === 'dm' ? `@${ch.name}` : `#${ch.name}`;
    s.text(tx, boxY, truncate(can ? `Message ${name}` : 'You cannot send messages in this channel', tw), { fg: T.faint });
  } else {
    for (let i = 0; i < ih; i++) s.text(tx, boxY + i, lines[lineTop + i], { fg: T.text });
  }
  app.hits.push({ x: bx, y: boxY, w: bw, h: ih, type: 'input' });
  if (app.focus === 'input' && !app.modal) app.cursor = { x: tx + cx, y: boxY + cy - lineTop };

  let msgBottom = boxY;
  const target = st.findMessage(ch.id, app.editing ?? app.replyTo);
  if (target) {
    msgBottom--;
    s.fill(bx, msgBottom, bw, 1, T.side);
    let px = bx + 1;
    px += s.text(px, msgBottom, app.editing ? 'Editing message' : 'Replying to ', { fg: T.muted });
    if (!app.editing) s.text(px, msgBottom, truncate(st.displayName(ch.guildId, target.author.id) ?? target.author.name, bw - 30), { fg: T.bright, attr: A.BOLD });
    s.text(bx + bw - 14, msgBottom, 'Esc to cancel', { fg: T.faint });
  }

  // message list, anchored to the bottom
  const hist = st.history(ch.id);
  const viewH = msgBottom - y;
  app.viewH = viewH;
  const rows = buildRows(app, ch, w);
  const tail = app.tail;
  const lastId = hist.list.at(-1)?.id;
  // keep the viewport still when messages arrive while the user is reading older ones
  if (tail && tail.ch === ch.id && tail.lastId !== lastId && app.scroll > 0) app.scroll += Math.max(0, rows.length - tail.count);
  app.tail = { ch: ch.id, lastId, count: rows.length };
  const maxScroll = Math.max(0, rows.length - viewH);
  if (app.ensureSel && app.selMsg) {
    const first = rows.findIndex((r) => r.msgId === app.selMsg);
    const last = rows.findLastIndex((r) => r.msgId === app.selMsg);
    if (first >= 0) {
      const top = rows.length - app.scroll - viewH;
      if (first - 1 < top) app.scroll = rows.length - viewH - (first - 1);
      else if (last + 1 >= top + viewH) app.scroll = rows.length - 2 - last;
    }
  }
  app.ensureSel = false;
  app.scroll = clamp(app.scroll, 0, maxScroll);
  st.viewing = app.scroll === 0 ? ch.id : null;
  if (app.scroll === 0) st.unread.delete(ch.id);
  const start = rows.length - app.scroll - viewH;

  if (ch.type === 'forum') s.text(x + 2, y + 1, 'Forum channels are not supported yet.', { fg: T.muted });
  else if (hist.error) s.text(x + 2, y + 1, truncate(`⚠ ${hist.error}`, w - 4), { fg: T.red });
  else if (!hist.loaded) s.text(x + 2, y + 1, 'Loading messages…', { fg: T.muted });
  for (let i = 0; i < viewH; i++) {
    const r = rows[start + i];
    if (!r) continue;
    const sy = y + i;
    const selected = !!r.msgId && r.msgId === app.selMsg;
    if (selected || r.mention) s.fill(x, sy, w, 1, selected ? T.msgSel : T.mentionRow);
    if (r.mention) s.text(x, sy, '▎', { fg: T.mentionBar });
    else if (selected) s.text(x, sy, '▎', { fg: T.blurple });
    if (r.need) app.images.load(r.need);
    for (const p of r.parts) {
      if (p.px) {
        drawPixels(s, x + p.x, sy, p.px, w - p.x - 1);
        continue;
      }
      const hidden = p.spoiler && !selected;
      s.text(x + p.x, sy, p.text, { fg: hidden ? T.spoiler : p.fg, bg: hidden ? T.spoiler : p.bg, attr: p.attr }, w - p.x - 1);
    }
    if (r.msgId) app.hits.push({ x, y: sy, w, h: 1, type: 'msg', id: r.msgId });
  }
  if (start <= 0 && hist.loaded && hist.hasMore && !hist.loading) app.loadOlder();
  if (hist.loading && hist.loaded) s.text(x + 2, y, 'Loading older messages…', { fg: T.muted, bg: T.chat });

  if (app.scroll > 0) {
    const label = ' You are viewing older messages · Jump to present (Esc) ';
    s.fill(x + 1, msgBottom - 1, w - 2, 1, T.sel);
    s.text(x + 1, msgBottom - 1, center(label, w - 2), { fg: T.text });
    app.hits.push({ x: x + 1, y: msgBottom - 1, w: w - 2, h: 1, type: 'jump' });
  }

  if (app.ac && app.focus === 'input') {
    const { items, index } = app.ac;
    const aw = Math.min(bw, 44);
    const ay = msgBottom - items.length;
    items.forEach((it, i) => {
      s.fill(bx, ay + i, aw, 1, i === index ? T.sel : T.side);
      s.text(bx + 1, ay + i, truncate(it.label, aw - 2), { fg: i === index ? T.white : T.text });
      if (it.hint) s.text(bx + aw - strWidth(it.hint) - 1, ay + i, it.hint, { fg: T.faint }, aw);
    });
  }
}

function drawMembers(app, s, x, y, w, h) {
  const st = app.store;
  const guild = st.guilds.get(app.guildId);
  s.fill(x, y, w, h, T.side);
  const items = app.memberItems();
  let sc = app.memScroll;
  if (app.memFollow && app.focus === 'members') {
    if (app.memCursor < sc + 1) sc = app.memCursor - 1;
    if (app.memCursor >= sc + h - 1) sc = app.memCursor - h + 2;
  }
  app.memScroll = sc = clamp(sc, 0, Math.max(0, items.length - h + 1));
  for (let i = 0; i < h - 1; i++) {
    const idx = sc + i;
    const it = items[idx];
    if (!it) break;
    const yy = y + 1 + i;
    if (it.kind === 'group') s.text(x + 2, yy, truncate(it.text, w - 3), { fg: T.chan, attr: A.BOLD });
    if (it.kind !== 'member') continue;
    const m = it.m;
    const off = m.status === 'offline';
    if (app.focus === 'members' && idx === app.memCursor) s.fill(x + 1, yy, w - 2, 1, T.hover);
    s.text(x + 2, yy, off ? '○' : '●', { fg: STATUS[m.status]?.color ?? T.chan });
    const tag = m.bot ? ' APP ' : '';
    const nw = s.text(x + 4, yy, truncate(m.name, w - 6 - tag.length), { fg: off ? T.faint : st.memberColor(guild, m) ?? T.text });
    if (tag) s.text(x + 5 + nw, yy, tag, { fg: T.white, bg: T.blurple, attr: A.BOLD });
    app.hits.push({ x, y: yy, w, h: 1, type: 'member', id: m.id });
  }
}

// ----- modals -----

function openBox(app, s, w, h, title) {
  for (let i = 0; i < s.fg.length; i++) {
    for (const buf of [s.fg, s.bg]) {
      const c = buf[i];
      if (c >= 0) buf[i] = ((((c >> 16) & 255) * 0.45) << 16) | ((((c >> 8) & 255) * 0.45) << 8) | ((c & 255) * 0.45);
    }
  }
  w = Math.min(w, s.w - 4);
  h = Math.min(h, s.h - 2);
  const x = (s.w - w) >> 1;
  const y = Math.max(1, (s.h - h) >> 1);
  s.fill(x, y, w, h, T.modal);
  app.hits.push({ x, y, w, h, type: 'modal' });
  if (title) s.text(x + 2, y + 1, truncate(title, w - 4), { fg: T.bright, attr: A.BOLD });
  return { x, y, w, h };
}

function drawModal(app, s) {
  const st = app.store;
  const m = app.modal;
  if (m.type === 'help') {
    const b = openBox(app, s, 84, HELP.length + 5, 'Keyboard shortcuts');
    HELP.forEach(([key, desc], i) => {
      s.text(b.x + 2, b.y + 3 + i, key, { fg: T.mentionFg, attr: A.BOLD }, 22);
      s.text(b.x + 25, b.y + 3 + i, truncate(desc, b.w - 27), { fg: T.text });
    });
  } else if (m.type === 'switcher') {
    const results = app.switcherResults(m.query);
    m.index = clamp(m.index, 0, Math.max(0, results.length - 1));
    const b = openBox(app, s, 64, results.length + 6, 'Search for servers, channels or DMs');
    s.fill(b.x + 2, b.y + 3, b.w - 4, 1, T.rail);
    const qw = s.text(b.x + 3, b.y + 3, m.query || 'Where would you like to go?', { fg: m.query ? T.text : T.faint }, b.w - 6);
    app.cursor = { x: b.x + 3 + (m.query ? qw : 0), y: b.y + 3 };
    results.forEach((r, i) => {
      const yy = b.y + 5 + i;
      if (i === m.index) s.fill(b.x + 1, yy, b.w - 2, 1, T.sel);
      s.text(b.x + 3, yy, ICON[r.ch.type] ?? '#', { fg: T.chan });
      s.text(b.x + 5, yy, truncate(r.ch.name, b.w - 30), { fg: i === m.index ? T.white : T.text, attr: st.unread.has(r.ch.id) ? A.BOLD : 0 });
      const gn = truncate(r.guildName, 20);
      s.text(b.x + b.w - 3 - strWidth(gn), yy, gn, { fg: T.faint });
      app.hits.push({ x: b.x, y: yy, w: b.w, h: 1, type: 'switch', id: r.ch.id });
    });
    if (!results.length) s.text(b.x + 3, b.y + 5, 'No results', { fg: T.muted });
  } else if (m.type === 'confirm') {
    const msg = st.findMessage(app.channelId, m.msgId);
    const b = openBox(app, s, 60, 8, 'Delete message');
    s.text(b.x + 2, b.y + 3, 'Are you sure you want to delete this message?', { fg: T.text }, b.w - 4);
    s.text(b.x + 2, b.y + 4, truncate((msg?.content ?? '').replace(/\s+/g, ' '), b.w - 4), { fg: T.muted });
    s.text(b.x + 2, b.y + 6, ' Enter  Delete ', { fg: T.white, bg: T.red, attr: A.BOLD });
    s.text(b.x + 19, b.y + 6, ' Esc  Cancel ', { fg: T.text, bg: T.sel });
  } else if (m.type === 'react') {
    const b = openBox(app, s, 60, 8, 'Add reaction');
    let cx = b.x + 2;
    QUICK_REACTIONS.forEach((e, i) => {
      cx += s.text(cx, b.y + 3, `${i + 1}`, { fg: T.faint }) + 1;
      cx += s.text(cx, b.y + 3, e, { fg: T.text }) + 2;
    });
    s.fill(b.x + 2, b.y + 5, b.w - 4, 1, T.rail);
    const qw = s.text(b.x + 3, b.y + 5, m.query || 'or type an emoji / :shortcode: and press Enter', { fg: m.query ? T.text : T.faint }, b.w - 6);
    app.cursor = { x: b.x + 3 + (m.query ? qw : 0), y: b.y + 5 };
  } else if (m.type === 'image') {
    const src = m.items[m.index];
    const e = app.images.get(src, s.w - 8, s.h - 6);
    app.images.load(e);
    const count = m.items.length > 1 ? `  ${m.index + 1}/${m.items.length}  ←/→` : '';
    const b = openBox(app, s, Math.max(e.cols + 4, 30), e.rows + 4, `${src.name}${count}`);
    const ix = b.x + ((b.w - e.cols) >> 1);
    if (e.cells) e.cells.forEach((cells, i) => drawPixels(s, ix, b.y + 3 + i, cells, b.w - 2));
    else s.text(b.x + 2, b.y + 3, e.state === 'error' ? 'This image could not be loaded.' : 'Loading…', { fg: T.muted });
  } else if (m.type === 'profile') {
    const guild = st.guilds.get(app.guildId);
    const mb = guild?.members.get(m.userId);
    if (!mb) return void (app.modal = null);
    const roles = mb.roles.map((id) => guild.roles.get(id)).filter(Boolean).sort((a, b) => b.position - a.position);
    const b = openBox(app, s, 44, 11 + (roles.length ? 2 : 0));
    const col = userColor(mb.id);
    s.fill(b.x, b.y, b.w, 2, col);
    s.text(b.x + 2, b.y + 1, '▄▄▄▄▄', { fg: T.modal });
    s.text(b.x + 2, b.y + 2, `  ${initial(mb.name)}  `, { fg: T.modal, bg: col, attr: A.BOLD });
    s.text(b.x + 2, b.y + 3, '▀▀▀▀▀', { fg: col });
    const nw = s.text(b.x + 2, b.y + 5, truncate(mb.name, b.w - 12), { fg: T.bright, attr: A.BOLD });
    if (mb.bot) s.text(b.x + 3 + nw, b.y + 5, ' APP ', { fg: T.white, bg: T.blurple, attr: A.BOLD });
    s.text(b.x + 2, b.y + 6, truncate(mb.username, b.w - 4), { fg: T.muted });
    const status = STATUS[mb.status];
    if (status) {
      s.text(b.x + 2, b.y + 8, mb.status === 'offline' ? '○' : '●', { fg: status.color });
      s.text(b.x + 4, b.y + 8, status.label, { fg: T.text });
    }
    if (roles.length) {
      s.text(b.x + 2, b.y + 10, 'ROLES', { fg: T.chan, attr: A.BOLD });
      let cx = b.x + 2;
      for (const r of roles) {
        if (cx + strWidth(r.name) + 4 > b.x + b.w - 2) break;
        cx += s.text(cx, b.y + 11, ` ● ${r.name} `, { fg: r.color || T.text, bg: T.side }) + 1;
      }
    }
  }
}
