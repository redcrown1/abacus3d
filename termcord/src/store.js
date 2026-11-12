import { EventEmitter } from 'node:events';

// Orders decimal id strings (Discord snowflakes) chronologically.
export const cmpId = (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

// Client-side cache shared by the UI and whichever backend feeds it.
export class Store extends EventEmitter {
  constructor() {
    super();
    this.me = null;
    this.guilds = new Map(); // id -> {id, name, roles: Map, members: Map, voice: Map<userId, channelId>}
    this.channels = new Map(); // id -> {id, guildId, name, type, parentId, position, topic}
    this.users = new Map(); // id -> display name, for mentions outside a guild
    this.hist = new Map();
    this.typing = new Map(); // channelId -> Map<userId, expiresAt>
    this.unread = new Map(); // channelId -> {count, mentions, firstId}
    this.status = '';
    this.viewing = null; // channel currently shown and scrolled to the bottom
    this.namesRev = 0;
  }

  changed() {
    this.rev = (this.rev ?? 0) + 1;
    this.emit('change');
  }

  setStatus(text, ttl) {
    this.status = text;
    clearTimeout(this.statusTimer);
    if (ttl) {
      this.statusTimer = setTimeout(() => {
        if (this.status === text) this.setStatus('');
      }, ttl);
      this.statusTimer.unref();
    }
    this.changed();
  }

  guild(id) {
    let g = this.guilds.get(id);
    if (!g) {
      g = { id, name: '…', roles: new Map(), members: new Map(), voice: new Map() };
      this.guilds.set(id, g);
    }
    return g;
  }

  removeGuild(id) {
    this.guilds.delete(id);
    for (const ch of [...this.channels.values()]) if (ch.guildId === id) this.channels.delete(ch.id);
  }

  guildChannels(guildId) {
    return [...this.channels.values()].filter((c) => c.guildId === guildId);
  }

  history(channelId) {
    let h = this.hist.get(channelId);
    if (!h) {
      h = { list: [], loaded: false, loading: false, hasMore: true, error: null };
      this.hist.set(channelId, h);
    }
    return h;
  }

  setHistory(channelId, msgs, hasMore) {
    const h = this.history(channelId);
    const seen = new Set(h.list.map((m) => m.id));
    h.list = [...h.list, ...msgs.filter((m) => !seen.has(m.id))].sort((a, b) => cmpId(a.id, b.id));
    Object.assign(h, { loaded: true, loading: false, hasMore, error: null });
    this.changed();
  }

  addMessage(msg) {
    const h = this.history(msg.channelId);
    if (h.list.some((m) => m.id === msg.id)) return;
    h.list.push(msg);
    if (h.list.length > 1 && cmpId(h.list.at(-2).id, msg.id) > 0) h.list.sort((a, b) => cmpId(a.id, b.id));
    this.typing.get(msg.channelId)?.delete(msg.author.id);
    if (msg.author.id !== this.me?.id && this.viewing !== msg.channelId) {
      const u = this.unread.get(msg.channelId) ?? { count: 0, mentions: 0, firstId: msg.id };
      u.count++;
      if (msg.mentionsMe || this.channels.get(msg.channelId)?.type === 'dm') u.mentions++;
      this.unread.set(msg.channelId, u);
    }
    this.changed();
  }

  findMessage(channelId, id) {
    return this.hist.get(channelId)?.list.find((m) => m.id === id);
  }

  patchMessage(channelId, id, patch) {
    const m = this.findMessage(channelId, id);
    if (!m) return;
    Object.assign(m, patch);
    m.rev = (m.rev ?? 0) + 1;
    this.changed();
  }

  deleteMessage(channelId, id) {
    const h = this.hist.get(channelId);
    if (!h) return;
    h.list = h.list.filter((m) => m.id !== id);
    this.changed();
  }

  react(channelId, id, key, label, userId, add) {
    const m = this.findMessage(channelId, id);
    if (!m) return;
    const mine = userId === this.me?.id;
    let r = m.reactions.find((x) => x.key === key);
    if (add) {
      if (!r) m.reactions.push((r = { key, label, count: 0, me: false }));
      r.count++;
      if (mine) r.me = true;
    } else if (r) {
      r.count--;
      if (mine) r.me = false;
      if (r.count <= 0) m.reactions = m.reactions.filter((x) => x !== r);
    }
    m.rev = (m.rev ?? 0) + 1;
    this.changed();
  }

  setTyping(channelId, userId, ms = 9000) {
    if (userId === this.me?.id) return;
    if (!this.typing.has(channelId)) this.typing.set(channelId, new Map());
    this.typing.get(channelId).set(userId, Date.now() + ms);
    this.changed();
  }

  typingUsers(channelId) {
    const t = this.typing.get(channelId);
    if (!t) return [];
    const now = Date.now();
    for (const [id, until] of t) if (until < now) t.delete(id);
    return [...t.keys()];
  }

  displayName(guildId, userId) {
    return this.guilds.get(guildId)?.members.get(userId)?.name ?? this.users.get(userId);
  }

  // Colour of the member's highest coloured role, if any.
  memberColor(guild, member) {
    let best = null;
    for (const id of member?.roles ?? []) {
      const role = guild.roles.get(id);
      if (role?.color && (!best || role.position > best.position)) best = role;
    }
    return best?.color;
  }

  badge(guildId) {
    let unread = false, mentions = 0;
    for (const [id, u] of this.unread) {
      if ((this.channels.get(id)?.guildId ?? '@me') !== guildId) continue;
      unread = true;
      mentions += u.mentions;
    }
    return { unread, mentions };
  }
}
