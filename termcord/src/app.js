import { SHORTCODES, QUICK_REACTIONS } from './theme.js';
import { prevBoundary, nextBoundary } from './input.js';
import { ImageCache, messageImages } from './images.js';

const SENDABLE = new Set(['text', 'announcement', 'voice', 'dm']);
const FOCUS_ORDER = ['guilds', 'channels', 'messages', 'input', 'members'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const HELP = [
  ['Tab / Shift+Tab', 'Cycle focus between servers, channels, messages and composer'],
  ['Ctrl+K', 'Quick switcher: jump to any channel or DM'],
  ['Alt+↑ / Alt+↓', 'Previous / next channel'],
  ['Ctrl+Alt+↑ / ↓', 'Previous / next server'],
  ['Ctrl+U', 'Toggle the member list'],
  ['Enter', 'Send message (Alt+Enter for a new line)'],
  ['↑ in empty composer', 'Select messages; then r reply, e edit, d delete, + react'],
  ['PgUp / PgDn', 'Scroll history (older messages load automatically)'],
  ['v on a selected message', 'View its images full size (←/→ for the next one)'],
  ['Enter on a voice channel', 'Join it; Alt+M mute, Alt+D deafen, Alt+X disconnect'],
  ['@  #  :', 'Autocomplete members, channels and emoji while typing'],
  ['Esc', 'Cancel reply / edit, close popups, jump to present'],
  ['Mouse', 'Click servers, channels, messages, members; wheel scrolls'],
  ['Ctrl+L', 'Redraw the screen'],
  ['Ctrl+C / Ctrl+Q', 'Quit'],
];

function acronym(name) {
  const words = name.trim().split(/\s+/);
  const a = words.length > 1 ? words.map((w) => [...w][0]).join('') : name.slice(0, 2);
  return [...a].slice(0, 3).join('').toUpperCase();
}

// UI state and input handling. Rendering lives in view.js.
export class App {
  constructor(store, backend) {
    this.store = store;
    this.backend = backend;
    this.guildId = null;
    this.channelId = null;
    this.auto = true; // until the user navigates, follow the first server that appears
    this.focus = 'input';
    this.input = { text: '', cursor: 0 };
    this.drafts = new Map();
    this.lastChannel = new Map();
    this.collapsed = new Set();
    this.replyTo = null;
    this.editing = null;
    this.selMsg = null;
    this.ensureSel = false;
    this.scroll = 0; // rows scrolled up from the newest message
    this.newMarker = null;
    this.showMembers = true;
    this.chanCursor = 0;
    this.sideScroll = 0;
    this.sideFollow = true;
    this.railScroll = 0;
    this.memCursor = 0;
    this.memScroll = 0;
    this.memFollow = false;
    this.modal = null;
    this.ac = null;
    this.hits = [];
    this.cursor = null;
    this.layout = null;
    this.viewH = 10;
    this.lastTyping = 0;
    this.rowCache = new Map();
    this.images = new ImageCache((entry) => {
      // avatars are looked up while drawing, so only inline pictures need a new layout
      if (!entry.src.avatar) store.layoutRev++;
      store.changed();
    });
    this.onQuit = () => {};
    this.onRedraw = () => {};
  }

  // Keeps the selection valid as servers and channels arrive or disappear.
  sync() {
    const s = this.store;
    const hasDms = () => s.guildChannels('@me').length > 0;
    if (!this.guildId || (this.guildId !== '@me' && !s.guilds.has(this.guildId)) ||
        (this.auto && this.guildId === '@me' && !hasDms() && s.guilds.size)) {
      this.guildId = s.guilds.keys().next().value ?? '@me';
      this.channelId = null;
    }
    if (!this.channelId || !s.channels.has(this.channelId)) {
      this.channelId = null;
      const ch = this.defaultChannel(this.guildId);
      if (ch) this.openChannel(ch.id);
    }
  }

  channel() {
    return this.store.channels.get(this.channelId);
  }

  history() {
    return this.store.history(this.channelId);
  }

  canSend(ch = this.channel()) {
    return !!ch && SENDABLE.has(ch.type);
  }

  run(promise) {
    Promise.resolve(promise).catch((err) => this.store.setStatus(`⚠ ${err.message}`, 6000));
  }

  mdCtx(guildId) {
    const s = this.store;
    return {
      user: (id) => s.displayName(guildId, id),
      role: (id) => s.guilds.get(guildId)?.roles.get(id),
      channel: (id) => s.channels.get(id)?.name,
    };
  }

  // ----- derived lists -----

  railItems() {
    const items = [{ id: '@me', label: 'DM', name: 'Direct Messages' }];
    for (const g of this.store.guilds.values()) items.push({ id: g.id, label: acronym(g.name), name: g.name, icon: g.icon });
    return items;
  }

  sidebarItems() {
    const s = this.store;
    const chans = s.guildChannels(this.guildId);
    const items = [];
    if (this.guildId === '@me') {
      items.push({ kind: 'label', text: 'DIRECT MESSAGES' });
      const lastTs = (c) => s.hist.get(c.id)?.list.at(-1)?.ts ?? 0;
      for (const ch of chans.sort((a, b) => lastTs(b) - lastTs(a))) items.push({ kind: 'channel', ch });
      return items;
    }
    const guild = s.guilds.get(this.guildId);
    const kids = (parentId) => chans
      .filter((c) => c.type !== 'category' && (c.parentId ?? null) === parentId)
      .sort((a, b) => (a.type === 'voice') - (b.type === 'voice') || a.position - b.position);
    const add = (ch) => {
      items.push({ kind: 'channel', ch });
      if (ch.type !== 'voice' || !guild) return;
      for (const [userId, channelId] of guild.voice) {
        if (channelId === ch.id) items.push({ kind: 'voiceUser', userId, name: s.displayName(guild.id, userId) ?? 'Unknown' });
      }
    };
    kids(null).forEach(add);
    for (const cat of chans.filter((c) => c.type === 'category').sort((a, b) => a.position - b.position)) {
      const collapsed = this.collapsed.has(cat.id);
      if (items.length) items.push({ kind: 'gap' });
      items.push({ kind: 'category', ch: cat, collapsed });
      kids(cat.id).filter((c) => !collapsed || c.id === this.channelId).forEach(add);
    }
    return items;
  }

  memberItems() {
    const s = this.store;
    if (this.memMemo?.rev === s.rev && this.memMemo.guildId === this.guildId) return this.memMemo.items;
    const g = s.guilds.get(this.guildId);
    const items = [];
    if (g) {
      const hoisted = [...g.roles.values()].filter((r) => r.hoist).sort((a, b) => b.position - a.position);
      const presenceKnown = [...g.members.values()].some((m) => m.status);
      const groups = new Map([...hoisted.map((r) => [r.id, r.name]), ['online', presenceKnown ? 'Online' : 'Members'], ['offline', 'Offline']]
        .map(([key, title]) => [key, { title, list: [] }]));
      for (const m of g.members.values()) {
        const role = m.status === 'offline' ? null : hoisted.find((r) => m.roles.includes(r.id));
        groups.get(m.status === 'offline' ? 'offline' : role ? role.id : 'online').list.push(m);
      }
      for (const { title, list } of groups.values()) {
        if (!list.length) continue;
        if (items.length) items.push({ kind: 'gap' });
        items.push({ kind: 'group', text: `${title.toUpperCase()} — ${list.length}` });
        list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        for (const m of list) items.push({ kind: 'member', m });
      }
    }
    this.memMemo = { rev: s.rev, guildId: this.guildId, items };
    return items;
  }

  defaultChannel(guildId) {
    const s = this.store;
    const last = s.channels.get(this.lastChannel.get(guildId));
    if (last) return last;
    const prev = this.guildId;
    this.guildId = guildId;
    const chans = this.sidebarItems().filter((i) => i.kind === 'channel').map((i) => i.ch);
    this.guildId = prev;
    const system = s.channels.get(s.guilds.get(guildId)?.systemChannelId);
    return system ?? chans.find((c) => c.type === 'text') ?? chans.find((c) => SENDABLE.has(c.type)) ?? chans[0];
  }

  // ----- navigation -----

  selectGuild(id) {
    this.auto = false;
    if (id === this.guildId) return;
    const ch = this.defaultChannel(id);
    this.guildId = id;
    this.memScroll = 0;
    this.memCursor = 0;
    if (ch) this.openChannel(ch.id);
    else this.channelId = null;
  }

  openChannel(id) {
    const s = this.store;
    const ch = s.channels.get(id);
    if (!ch) return;
    if (this.channelId && !this.editing) this.drafts.set(this.channelId, this.input.text);
    this.channelId = id;
    this.guildId = ch.guildId;
    this.lastChannel.set(ch.guildId, id);
    const draft = this.drafts.get(id) ?? '';
    this.input = { text: draft, cursor: draft.length };
    Object.assign(this, { replyTo: null, editing: null, selMsg: null, scroll: 0, ac: null, sideFollow: true });
    this.rowCache.clear();
    this.newMarker = s.unread.get(id)?.firstId ?? null;
    s.unread.delete(id);
    s.viewing = id;
    this.chanCursor = Math.max(0, this.sidebarItems().findIndex((i) => i.kind === 'channel' && i.ch.id === id));
    const h = s.history(id);
    if (!h.loaded && !h.loading && ch.type !== 'forum') this.run(this.backend.loadMessages(id));
  }

  loadOlder() {
    const h = this.history();
    if (!h.loaded || h.loading || !h.hasMore || !h.list.length) return;
    this.run(this.backend.loadMessages(this.channelId, h.list[0].id));
  }

  stepGuild(d) {
    const items = this.railItems();
    const i = items.findIndex((it) => it.id === this.guildId);
    this.selectGuild(items[clamp(i + d, 0, items.length - 1)].id);
  }

  stepChannel(d) {
    const chans = this.sidebarItems().filter((i) => i.kind === 'channel');
    const i = chans.findIndex((it) => it.ch.id === this.channelId);
    const next = chans[clamp(i + d, 0, chans.length - 1)];
    if (next) this.openChannel(next.ch.id);
  }

  setFocus(f) {
    if (f === 'members' && !this.layout?.memW) f = 'guilds';
    if (f === 'messages') {
      const list = this.history().list;
      if (!list.length) f = 'input';
      else if (!this.selMsg) this.select(list.at(-1).id);
    }
    if (f !== 'messages') this.selMsg = null;
    if (f === 'channels') {
      this.chanCursor = Math.max(0, this.sidebarItems().findIndex((i) => i.kind === 'channel' && i.ch.id === this.channelId));
      this.sideFollow = true;
    }
    if (f === 'members') {
      const items = this.memberItems();
      if (items[this.memCursor]?.kind !== 'member') this.memCursor = items.findIndex((i) => i.kind === 'member');
      this.memFollow = true;
    }
    this.focus = f;
  }

  select(id) {
    this.selMsg = id;
    this.ensureSel = true;
  }

  activate(item) {
    if (!item) return;
    if (item.kind === 'category') {
      if (!this.collapsed.delete(item.ch.id)) this.collapsed.add(item.ch.id);
    } else if (item.kind === 'channel') {
      this.auto = false;
      if (item.ch.type === 'voice') this.run(this.backend.joinVoice(item.ch.id));
      this.openChannel(item.ch.id);
      this.setFocus('input');
    }
  }

  toggleVoice(flag) {
    const v = this.store.voice;
    if (!v) return this.store.setStatus('You are not in a voice channel', 3000);
    this.run(this.backend.setVoiceFlags({ [flag]: !v[flag] }));
  }

  leaveVoice() {
    if (this.store.voice) this.run(this.backend.leaveVoice());
  }

  // ----- input dispatch -----

  handle(ev) {
    if (ev.type === 'mouse') return this.mouse(ev);
    if (ev.type === 'key' && ev.ctrl && (ev.name === 'c' || ev.name === 'q')) return this.onQuit();
    if (this.modal) return this.modalInput(ev);
    if (ev.type === 'key' && this.globalKey(ev)) return;
    this[`${this.focus}Key`](ev);
  }

  globalKey({ name, ctrl, alt, shift }) {
    if (ctrl && name === 'k') this.modal = { type: 'switcher', query: '', index: 0 };
    else if (ctrl && name === 'u') {
      this.showMembers = !this.showMembers;
      if (this.focus === 'members') this.setFocus('input');
    } else if (name === 'f1') this.modal = { type: 'help' };
    else if (ctrl && name === 'l') this.onRedraw();
    else if (alt && ctrl && (name === 'up' || name === 'down')) this.stepGuild(name === 'up' ? -1 : 1);
    else if (alt && (name === 'up' || name === 'down')) this.stepChannel(name === 'up' ? -1 : 1);
    else if (alt && name === 'm') this.toggleVoice('muted');
    else if (alt && name === 'd') this.toggleVoice('deafened');
    else if (alt && name === 'x') this.leaveVoice();
    else if (name === 'tab' && !(this.focus === 'input' && this.ac)) {
      const order = FOCUS_ORDER.filter((f) => f !== 'members' || this.layout?.memW);
      const i = order.indexOf(this.focus);
      this.setFocus(order[(i + (shift ? -1 : 1) + order.length) % order.length]);
    } else return false;
    return true;
  }

  guildsKey(ev) {
    if (ev.type !== 'key') return;
    if (ev.name === 'up' || ev.name === 'down') this.stepGuild(ev.name === 'up' ? -1 : 1);
    else if (ev.name === 'enter' || ev.name === 'right') this.setFocus('channels');
    else if (ev.name === 'escape') this.setFocus('input');
  }

  channelsKey(ev) {
    const items = this.sidebarItems();
    const k = ev.type === 'key' ? ev.name : ev.text;
    const selectable = (i) => items[i]?.kind === 'channel' || items[i]?.kind === 'category';
    if (k === 'up' || k === 'down' || k === 'k' || k === 'j') {
      const d = k === 'up' || k === 'k' ? -1 : 1;
      let i = this.chanCursor + d;
      while (i >= 0 && i < items.length && !selectable(i)) i += d;
      if (selectable(i)) this.chanCursor = i;
      this.sideFollow = true;
    } else if (k === 'enter' || k === 'right' || k === ' ') this.activate(items[this.chanCursor]);
    else if (k === 'left') this.setFocus('guilds');
    else if (k === 'escape') this.setFocus('input');
  }

  membersKey(ev) {
    const items = this.memberItems();
    const k = ev.type === 'key' ? ev.name : ev.text;
    if (k === 'up' || k === 'down' || k === 'k' || k === 'j') {
      const d = k === 'up' || k === 'k' ? -1 : 1;
      let i = this.memCursor + d;
      while (i >= 0 && i < items.length && items[i].kind !== 'member') i += d;
      if (items[i]) this.memCursor = i;
      this.memFollow = true;
    } else if (k === 'enter') {
      const it = items[this.memCursor];
      if (it?.kind === 'member') this.modal = { type: 'profile', userId: it.m.id };
    } else if (k === 'escape') this.setFocus('input');
  }

  messagesKey(ev) {
    if (ev.type === 'paste' || (ev.type === 'key' && (ev.ctrl || ev.alt))) return;
    const list = this.history().list;
    const idx = list.findIndex((m) => m.id === this.selMsg);
    const msg = list[idx];
    const move = (to) => {
      if (to < 0) return this.loadOlder();
      this.select(list[clamp(to, 0, list.length - 1)].id);
    };
    const own = msg?.author.id === this.store.me?.id;
    switch (ev.type === 'key' ? ev.name : ev.text) {
      case 'up': case 'k': move(idx - 1); break;
      case 'down': case 'j':
        if (idx === list.length - 1) this.setFocus('input');
        else move(idx + 1);
        break;
      case 'pageup': move(Math.max(0, idx - 8)); break;
      case 'pagedown': move(idx + 8); break;
      case 'home': case 'g': move(0); break;
      case 'end': case 'G': move(list.length - 1); break;
      case 'r': case 'enter':
        if (!msg || !this.canSend()) break;
        this.replyTo = msg.id;
        this.editing = null;
        this.setFocus('input');
        break;
      case 'e':
        if (!msg) break;
        if (!own) { this.store.setStatus('You can only edit your own messages', 3000); break; }
        this.editing = msg.id;
        this.replyTo = null;
        this.input = { text: msg.content, cursor: msg.content.length };
        this.setFocus('input');
        break;
      case 'd': case 'delete':
        if (!msg) break;
        if (!own) { this.store.setStatus('You can only delete your own messages', 3000); break; }
        this.modal = { type: 'confirm', msgId: msg.id };
        break;
      case 'v': case 'o': {
        const items = msg ? messageImages(msg) : [];
        if (items.length) this.modal = { type: 'image', items, index: 0 };
        else this.store.setStatus('This message has no images', 3000);
        break;
      }
      case '+': case 'a':
        if (msg) this.modal = { type: 'react', msgId: msg.id, query: '' };
        break;
      case 'escape': case 'i': case 'q': this.setFocus('input'); break;
    }
  }

  inputKey(ev) {
    if (ev.type === 'text' || ev.type === 'paste') return this.insert(ev.text);
    const inp = this.input;
    const ac = this.ac;
    const { name } = ev;
    if (ev.ctrl && name === 'a') inp.cursor = 0;
    else if (ev.ctrl && name === 'e') inp.cursor = inp.text.length;
    else if ((ev.ctrl && name === 'w') || (ev.alt && name === 'backspace')) {
      const start = inp.text.slice(0, inp.cursor).replace(/\S*\s*$/, '').length;
      this.edit(start, inp.cursor, '');
    } else if (ev.ctrl) return;
    else if (name === 'enter') {
      if (ev.alt) this.insert('\n');
      else if (ac) this.acceptAc();
      else this.submit();
    } else if (name === 'tab') this.acceptAc();
    else if (name === 'backspace') this.edit(prevBoundary(inp.text, inp.cursor), inp.cursor, '');
    else if (name === 'delete') this.edit(inp.cursor, nextBoundary(inp.text, inp.cursor), '');
    else if (name === 'left') inp.cursor = prevBoundary(inp.text, inp.cursor);
    else if (name === 'right') inp.cursor = nextBoundary(inp.text, inp.cursor);
    else if (name === 'home') inp.cursor = inp.text.lastIndexOf('\n', inp.cursor - 1) + 1;
    else if (name === 'end') {
      const e = inp.text.indexOf('\n', inp.cursor);
      inp.cursor = e < 0 ? inp.text.length : e;
    } else if (name === 'up' || name === 'down') {
      const d = name === 'up' ? -1 : 1;
      if (ac) ac.index = (ac.index + d + ac.items.length) % ac.items.length;
      else if (!inp.text && d < 0) this.setFocus('messages');
      else this.moveLine(d);
    } else if (name === 'pageup') this.scroll += Math.max(1, this.viewH - 3);
    else if (name === 'pagedown') this.scroll = Math.max(0, this.scroll - Math.max(1, this.viewH - 3));
    else if (name === 'escape') {
      if (ac) this.ac = null;
      else if (this.editing || this.replyTo) {
        if (this.editing) this.input = { text: '', cursor: 0 };
        this.editing = this.replyTo = null;
      } else this.scroll = 0;
    }
  }

  // ----- composer -----

  edit(from, to, text) {
    const inp = this.input;
    inp.text = inp.text.slice(0, from) + text + inp.text.slice(to);
    inp.cursor = from + text.length;
    this.updateAc();
  }

  insert(text) {
    if (!this.canSend()) return;
    this.edit(this.input.cursor, this.input.cursor, text.replace(/\r/g, ''));
    if (Date.now() - this.lastTyping > 8000 && !this.editing) {
      this.lastTyping = Date.now();
      Promise.resolve(this.backend.typing(this.channelId)).catch(() => {});
    }
  }

  moveLine(d) {
    const { text, cursor } = this.input;
    const start = text.lastIndexOf('\n', cursor - 1) + 1;
    const col = cursor - start;
    if (d < 0) {
      if (start === 0) return void (this.input.cursor = 0);
      const prevStart = text.lastIndexOf('\n', start - 2) + 1;
      this.input.cursor = Math.min(prevStart + col, start - 1);
    } else {
      const end = text.indexOf('\n', cursor);
      if (end < 0) return void (this.input.cursor = text.length);
      const nextEnd = text.indexOf('\n', end + 1);
      this.input.cursor = Math.min(end + 1 + col, nextEnd < 0 ? text.length : nextEnd);
    }
  }

  updateAc() {
    const before = this.input.text.slice(0, this.input.cursor);
    const m = /(?:^|\s)([@#:])([\w.+-]*)$/.exec(before);
    this.ac = null;
    if (!m || (m[1] === ':' && m[2].length < 2)) return;
    const q = m[2].toLowerCase();
    const rank = (name) => {
      const i = name.toLowerCase().indexOf(q);
      return i < 0 ? Infinity : i;
    };
    let items = [];
    if (m[1] === '@') {
      const members = [...(this.store.guilds.get(this.guildId)?.members.values() ?? [])];
      items = members
        .map((mb) => ({ r: Math.min(rank(mb.name), rank(mb.username)), mb }))
        .filter((x) => x.r < Infinity)
        .sort((a, b) => a.r - b.r || a.mb.name.localeCompare(b.mb.name))
        .map(({ mb }) => ({ label: `@${mb.name}`, hint: mb.username, insert: `@${mb.username} ` }));
    } else if (m[1] === '#') {
      items = this.store.guildChannels(this.guildId)
        .filter((c) => SENDABLE.has(c.type) && c.type !== 'dm' && rank(c.name) < Infinity)
        .sort((a, b) => rank(a.name) - rank(b.name))
        .map((c) => ({ label: `#${c.name}`, hint: '', insert: `#${c.name} ` }));
    } else {
      items = Object.keys(SHORTCODES).filter((k) => k.startsWith(q))
        .map((k) => ({ label: `${SHORTCODES[k]}  :${k}:`, hint: '', insert: `${SHORTCODES[k]} ` }));
    }
    if (items.length) this.ac = { start: before.length - m[2].length - 1, items: items.slice(0, 6), index: 0 };
  }

  acceptAc() {
    if (!this.ac) return;
    const { start, items, index } = this.ac;
    this.edit(start, this.input.cursor, items[index].insert);
    this.ac = null;
  }

  // Converts what the user typed (:shortcodes:, @names, #channels) into Discord markup.
  encode(text) {
    const guild = this.store.guilds.get(this.guildId);
    const same = (a, b) => a.toLowerCase() === b.toLowerCase();
    return text
      .replace(/(?<![<\w]):([\w+]+):(?!\d)/g, (m, k) => SHORTCODES[k] ?? m)
      .replace(/(^|\s)@([\w.]+)/g, (m, pre, name) => {
        const mb = [...(guild?.members.values() ?? [])].find((x) => same(x.username, name) || same(x.name, name));
        return mb ? `${pre}<@${mb.id}>` : m;
      })
      .replace(/(^|\s)#([\w-]+)/g, (m, pre, name) => {
        const ch = this.store.guildChannels(this.guildId).find((c) => c.type !== 'category' && same(c.name, name));
        return ch ? `${pre}<#${ch.id}>` : m;
      });
  }

  submit() {
    const text = this.input.text.trim();
    if (!text || !this.canSend()) return;
    const content = this.encode(text);
    if (content.length > 2000) return this.store.setStatus(`⚠ Message is too long (${content.length}/2000)`, 4000);
    if (this.editing) this.run(this.backend.edit(this.channelId, this.editing, content));
    else this.run(this.backend.send(this.channelId, content, this.replyTo));
    this.input = { text: '', cursor: 0 };
    this.drafts.delete(this.channelId);
    Object.assign(this, { editing: null, replyTo: null, scroll: 0, ac: null, newMarker: null });
  }

  // ----- modals -----

  switcherResults(query) {
    const s = this.store;
    const q = query.trim().toLowerCase().replace(/^[#@]/, '');
    const out = [];
    for (const ch of s.channels.values()) {
      if (!SENDABLE.has(ch.type)) continue;
      const name = ch.name.toLowerCase();
      let score;
      if (!q) score = s.unread.has(ch.id) ? 0 : ch.guildId === this.guildId ? 1 : 2;
      else {
        score = name.indexOf(q);
        if (score < 0) {
          let i = 0;
          for (const c of name) if (c === q[i]) i++;
          if (i < q.length) continue;
          score = 100;
        }
      }
      out.push({ ch, score, guildName: ch.guildId === '@me' ? 'Direct Message' : s.guilds.get(ch.guildId)?.name ?? '' });
    }
    return out.sort((a, b) => a.score - b.score || a.ch.name.localeCompare(b.ch.name)).slice(0, 10);
  }

  jumpTo(channelId) {
    this.modal = null;
    this.auto = false;
    this.openChannel(channelId);
    this.setFocus('input');
  }

  modalInput(ev) {
    const m = this.modal;
    const name = ev.type === 'key' ? ev.name : null;
    if (name === 'escape') return void (this.modal = null);
    if (ev.type === 'key' && (ev.ctrl || ev.alt)) return;
    if (m.type === 'image' && (name === 'left' || name === 'right')) {
      m.index = (m.index + (name === 'right' ? 1 : -1) + m.items.length) % m.items.length;
    } else if (m.type === 'help' || m.type === 'profile' || m.type === 'image') {
      this.modal = null;
    } else if (m.type === 'confirm') {
      if (name === 'enter' || ev.text === 'y') {
        this.run(this.backend.remove(this.channelId, m.msgId));
        this.modal = null;
        this.setFocus('input');
      } else if (ev.text === 'n') this.modal = null;
    } else if (m.type === 'switcher') {
      const results = this.switcherResults(m.query);
      if (ev.type === 'text' || ev.type === 'paste') { m.query += ev.text.replace(/\n/g, ' '); m.index = 0; }
      else if (name === 'backspace') { m.query = m.query.slice(0, prevBoundary(m.query, m.query.length)); m.index = 0; }
      else if (name === 'up') m.index = Math.max(0, m.index - 1);
      else if (name === 'down' || name === 'tab') m.index = Math.min(results.length - 1, m.index + 1);
      else if (name === 'enter' && results[m.index]) this.jumpTo(results[m.index].ch.id);
    } else if (m.type === 'react') {
      const pick = (emoji) => {
        this.run(this.backend.react(this.channelId, m.msgId, emoji));
        this.modal = null;
      };
      if (ev.type === 'text' && !m.query && /^[1-8]$/.test(ev.text)) pick(QUICK_REACTIONS[+ev.text - 1]);
      else if (ev.type === 'text' || ev.type === 'paste') m.query += ev.text.trim();
      else if (name === 'backspace') m.query = m.query.slice(0, prevBoundary(m.query, m.query.length));
      else if (name === 'enter' && m.query) pick(SHORTCODES[m.query.replace(/:/g, '')] ?? m.query);
    }
  }

  mouse(ev) {
    const hit = this.hits.findLast((h) => ev.x >= h.x && ev.x < h.x + h.w && ev.y >= h.y && ev.y < h.y + h.h);
    if (ev.button !== 'left') {
      const d = ev.button === 'wheelup' ? 1 : -1;
      const L = this.layout;
      if (this.modal || !L || ev.x < L.railW) return;
      if (ev.x < L.chatX) { this.sideScroll -= d * 2; this.sideFollow = false; }
      else if (L.memW && ev.x >= L.memX) { this.memScroll -= d * 2; this.memFollow = false; }
      else this.scroll = Math.max(0, this.scroll + d * 3);
      return;
    }
    if (this.modal) {
      if (hit?.type === 'switch') this.jumpTo(hit.id);
      else if (hit?.type !== 'modal') this.modal = null;
      return;
    }
    if (!hit) return;
    if (hit.type === 'guild') this.selectGuild(hit.id);
    else if (hit.type === 'side') { this.chanCursor = hit.index; this.activate(this.sidebarItems()[hit.index]); }
    else if (hit.type === 'msg') { this.focus = 'messages'; this.selMsg = hit.id; }
    else if (hit.type === 'input') this.setFocus('input');
    else if (hit.type === 'jump') this.scroll = 0;
    else if (hit.type === 'member') this.modal = { type: 'profile', userId: hit.id };
    else if (hit.type === 'voiceMute') this.toggleVoice('muted');
    else if (hit.type === 'voiceDeaf') this.toggleVoice('deafened');
    else if (hit.type === 'voiceLeave') this.leaveVoice();
  }
}
