import { loadVoice, VoiceSession } from '../voice.js';

// Live Discord backend: REST v10 plus the Gateway, authenticated as a bot application.
const API = 'https://discord.com/api/v10';
const TYPES = { 0: 'text', 1: 'dm', 2: 'voice', 3: 'dm', 4: 'category', 5: 'announcement', 13: 'voice', 15: 'forum', 16: 'forum' };
const MSG_TYPES = { 6: 'pin', 7: 'join', 8: 'boost', 9: 'boost', 10: 'boost', 11: 'boost' };

// GUILDS, GUILD_VOICE_STATES, GUILD_MESSAGES, GUILD_MESSAGE_REACTIONS, GUILD_MESSAGE_TYPING, DIRECT_MESSAGES
const BASE_INTENTS = 1 | 128 | 512 | 1024 | 2048 | 4096;
const MESSAGE_CONTENT = 32768;
const MEMBERS_AND_PRESENCES = 2 | 256;
// Privileged intents are opt-in per application, so fall back one step each time Discord rejects them.
const INTENT_LADDER = [BASE_INTENTS | MESSAGE_CONTENT | MEMBERS_AND_PRESENCES, BASE_INTENTS | MESSAGE_CONTENT, BASE_INTENTS];
const FATAL_CLOSE = { 4004: 'Authentication failed: invalid token', 4010: 'Invalid shard', 4011: 'Sharding required', 4012: 'Invalid API version', 4013: 'Invalid intents' };

const userName = (u) => u.global_name ?? u.username;

export function normChannel(raw, guildId = raw.guild_id) {
  const type = TYPES[raw.type];
  if (!type) return null;
  if (type === 'dm') {
    const names = (raw.recipients ?? []).map(userName);
    return { id: raw.id, guildId: '@me', type, name: raw.name ?? (names.join(', ') || 'Direct Message'), userId: raw.recipients?.[0]?.id, position: 0 };
  }
  return { id: raw.id, guildId, type, name: raw.name, parentId: raw.parent_id ?? null, position: raw.position ?? 0, topic: raw.topic ?? '' };
}

export function normMember(raw, user = raw.user, prev) {
  return {
    id: user.id, name: raw.nick ?? userName(user), username: user.username, bot: !!user.bot,
    roles: raw.roles ?? prev?.roles ?? [], status: prev?.status,
  };
}

const normImage = (raw, name) =>
  (raw?.proxy_url && raw.width && raw.height ? { id: raw.proxy_url, url: raw.proxy_url, w: raw.width, h: raw.height, name } : null);

const normReaction = (r) => ({
  key: r.emoji.id ? `${r.emoji.name}:${r.emoji.id}` : r.emoji.name,
  label: r.emoji.id ? `:${r.emoji.name}:` : r.emoji.name,
  count: r.count, me: !!r.me,
});

// Maps the fields present on a (possibly partial) message payload.
export function messageFields(raw, meId) {
  const out = {};
  if (raw.content !== undefined) out.content = raw.content;
  if (raw.edited_timestamp !== undefined) out.edited = !!raw.edited_timestamp;
  if (raw.attachments || raw.sticker_items) {
    out.attachments = [
      ...(raw.attachments ?? []).map((a) => ({
        name: a.filename, size: a.size, url: a.url,
        image: /^image\//.test(a.content_type ?? '') ? normImage(a, a.filename) : null,
      })),
      ...(raw.sticker_items ?? []).map((st) => ({ name: `Sticker: ${st.name}`, size: 0 })),
    ];
  }
  if (raw.embeds) {
    out.embeds = raw.embeds.map((e) => ({
      title: e.title, description: e.description, url: e.url, color: e.color,
      author: e.author?.name, footer: e.footer?.text, fields: (e.fields ?? []).map((f) => ({ name: f.name, value: f.value })),
      image: normImage(e.image ?? e.thumbnail, e.title ?? 'image'),
    }));
  }
  if (raw.reactions) out.reactions = raw.reactions.map(normReaction);
  if (raw.mentions) out.mentionsMe = !!raw.mention_everyone || raw.mentions.some((u) => u.id === meId);
  return out;
}

export function normMessage(raw, meId) {
  const ref = raw.referenced_message;
  return {
    id: raw.id, channelId: raw.channel_id,
    author: { id: raw.author.id, name: raw.member?.nick ?? userName(raw.author), bot: !!raw.author.bot },
    ts: Date.parse(raw.timestamp), type: MSG_TYPES[raw.type] ?? 'default',
    content: '', edited: false, attachments: [], embeds: [], reactions: [], mentionsMe: false, rev: 0,
    reply: ref ? { id: ref.id, authorId: ref.author.id, author: userName(ref.author), content: ref.content }
      : raw.type === 19 ? { deleted: true } : null,
    ...messageFields(raw, meId),
  };
}

export class DiscordBackend {
  constructor(store, token, { api = API } = {}) {
    this.store = store;
    this.token = token.replace(/^Bot\s+/i, '');
    this.api = api;
    this.level = 0;
    this.seq = null;
    this.session = null;
    this.retries = 0;
    this.voiceHooks = new Map(); // guildId -> callbacks of the voice library
    this.session = null;
  }

  async rest(method, path, body, attempt = 0) {
    const res = await fetch(this.api + path, {
      method,
      headers: {
        Authorization: `Bot ${this.token}`,
        'User-Agent': 'DiscordBot (https://github.com/termcord, 0.1.0)',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && attempt < 3) {
      const info = await res.json().catch(() => ({}));
      await new Promise((r) => setTimeout(r, (info.retry_after ?? 1) * 1000 + 50));
      return this.rest(method, path, body, attempt + 1);
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const hint = res.status === 401 ? 'Invalid bot token' : res.status === 403 ? 'Missing permissions' : null;
      throw Object.assign(new Error(hint ?? data?.message ?? `HTTP ${res.status}`), { status: res.status });
    }
    return data;
  }

  // ----- gateway -----

  async connect() {
    this.gatewayUrl = (await this.rest('GET', '/gateway/bot')).url;
    this.store.setStatus('Connecting…');
    this.open(false);
  }

  open(resume) {
    clearInterval(this.heartbeat);
    const base = (resume && this.resumeUrl) || this.gatewayUrl;
    const ws = (this.ws = new WebSocket(`${base}/?v=10&encoding=json`));
    this.resuming = resume && !!this.session;
    ws.onmessage = (e) => ws === this.ws && this.onPacket(JSON.parse(e.data));
    ws.onclose = (e) => ws === this.ws && this.onClose(e.code);
    ws.onerror = () => {};
  }

  sendOp(op, d) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ op, d }));
  }

  identify() {
    this.sendOp(2, {
      token: this.token, intents: INTENT_LADDER[this.level],
      properties: { os: process.platform, browser: 'termcord', device: 'termcord' },
    });
  }

  onPacket(p) {
    if (p.s != null) this.seq = p.s;
    if (p.op === 10) {
      this.acked = true;
      const beat = () => {
        if (!this.acked) return this.ws.close(4000); // zombied connection, reconnect and resume
        this.acked = false;
        this.sendOp(1, this.seq);
      };
      clearInterval(this.heartbeat);
      this.heartbeat = setInterval(beat, p.d.heartbeat_interval);
      if (this.resuming) this.sendOp(6, { token: this.token, session_id: this.session, seq: this.seq });
      else this.identify();
    } else if (p.op === 11) this.acked = true;
    else if (p.op === 1) this.sendOp(1, this.seq);
    else if (p.op === 7) this.ws.close(4000);
    else if (p.op === 9) {
      if (!p.d) this.session = null;
      setTimeout(() => (p.d ? this.sendOp(6, { token: this.token, session_id: this.session, seq: this.seq }) : this.identify()), 1500);
    } else if (p.op === 0) {
      try {
        this.dispatch(p.t, p.d);
      } catch (err) {
        this.store.setStatus(`⚠ ${p.t}: ${err.message}`, 6000);
      }
    }
  }

  onClose(code) {
    clearInterval(this.heartbeat);
    if (FATAL_CLOSE[code]) return this.store.setStatus(`⚠ ${FATAL_CLOSE[code]}`);
    if (code === 4014) {
      if (this.level >= INTENT_LADDER.length - 1) return this.store.setStatus('⚠ Discord rejected the requested intents');
      this.level++;
      this.session = null;
      return this.open(false);
    }
    const resume = !!this.session && code !== 4007 && code !== 4009;
    if (!resume) this.session = null;
    this.store.setStatus('Reconnecting…');
    setTimeout(() => this.open(resume), Math.min(30000, 1000 * 2 ** this.retries++));
  }

  dispatch(t, d) {
    const s = this.store;
    const guild = d.guild_id ? s.guild(d.guild_id) : null;
    const member = (raw, user = raw.user) => {
      if (!guild || !user) return;
      const prev = guild.members.get(user.id);
      const next = normMember(raw, user, prev);
      if (prev?.name !== next.name) s.layoutRev++;
      guild.members.set(user.id, next);
      s.users.set(user.id, userName(user));
    };
    const presences = (list, all) => {
      const g = guild ?? s.guild(d.id);
      const seen = new Map((list ?? []).map((p) => [p.user.id, p.status]));
      for (const m of all) m.status = seen.get(m.id) ?? 'offline';
      for (const [id, status] of seen) if (g.members.has(id)) g.members.get(id).status = status;
    };
    switch (t) {
      case 'READY':
        s.me = { id: d.user.id, name: userName(d.user), username: d.user.username };
        s.users.set(d.user.id, s.me.name);
        this.session = d.session_id;
        this.resumeUrl = d.resume_gateway_url;
        this.retries = 0;
        if (this.level === 0) s.setStatus('');
        else s.setStatus(this.level === 1 ? 'Limited: Server Members / Presence intents are off' : 'Limited: Message Content intent is off, text is hidden', 15000);
        break;
      case 'RESUMED':
        this.retries = 0;
        s.setStatus('');
        break;
      case 'GUILD_CREATE': {
        const g = s.guild(d.id);
        g.name = d.name;
        g.systemChannelId = d.system_channel_id;
        g.roles = new Map(d.roles.map((r) => [r.id, { id: r.id, name: r.name, color: r.color, hoist: r.hoist, position: r.position }]));
        for (const c of d.channels ?? []) {
          const ch = normChannel(c, d.id);
          if (ch) s.channels.set(ch.id, ch);
        }
        for (const m of d.members ?? []) {
          g.members.set(m.user.id, normMember(m, m.user, g.members.get(m.user.id)));
          s.users.set(m.user.id, userName(m.user));
        }
        g.voice = new Map((d.voice_states ?? []).filter((v) => v.channel_id).map((v) => [v.user_id, v.channel_id]));
        if (this.level === 0) {
          presences(d.presences, g.members.values());
          this.sendOp(8, { guild_id: d.id, query: '', limit: 0, presences: true });
        }
        s.layoutRev++;
        break;
      }
      case 'GUILD_UPDATE': s.guild(d.id).name = d.name; break;
      case 'GUILD_DELETE': s.removeGuild(d.id); break;
      case 'GUILD_MEMBERS_CHUNK': {
        const added = d.members.map((m) => {
          member(m);
          return guild.members.get(m.user.id);
        });
        presences(d.presences, added);
        break;
      }
      case 'GUILD_MEMBER_ADD': case 'GUILD_MEMBER_UPDATE': member(d); break;
      case 'GUILD_MEMBER_REMOVE': guild.members.delete(d.user.id); break;
      case 'GUILD_ROLE_CREATE': case 'GUILD_ROLE_UPDATE': {
        const r = d.role;
        guild.roles.set(r.id, { id: r.id, name: r.name, color: r.color, hoist: r.hoist, position: r.position });
        break;
      }
      case 'GUILD_ROLE_DELETE': guild.roles.delete(d.role_id); break;
      case 'PRESENCE_UPDATE': {
        const m = guild?.members.get(d.user.id);
        if (m) m.status = d.status;
        break;
      }
      case 'VOICE_STATE_UPDATE':
        if (!guild) break;
        if (d.channel_id) guild.voice.set(d.user_id, d.channel_id);
        else guild.voice.delete(d.user_id);
        if (d.user_id === s.me?.id) {
          this.voiceHooks.get(d.guild_id)?.onVoiceStateUpdate(d);
          const v = s.voice;
          if (v?.guildId === d.guild_id && d.channel_id) v.channelId = d.channel_id;
          // a null channel right after joining is the echo of our own earlier leave
          else if (v?.guildId === d.guild_id && Date.now() - v.since > 3000) this.leaveVoice();
        }
        break;
      case 'VOICE_SERVER_UPDATE': this.voiceHooks.get(d.guild_id)?.onVoiceServerUpdate(d); return;
      case 'CHANNEL_CREATE': case 'CHANNEL_UPDATE': {
        const ch = normChannel(d);
        if (ch) s.channels.set(ch.id, ch);
        break;
      }
      case 'CHANNEL_DELETE': s.channels.delete(d.id); break;
      case 'MESSAGE_CREATE': {
        if (d.member) member(d.member, d.author);
        for (const u of d.mentions ?? []) if (!s.users.has(u.id)) s.users.set(u.id, userName(u));
        if (!s.channels.has(d.channel_id)) {
          if (d.guild_id) break; // thread or other channel type we do not show
          s.channels.set(d.channel_id, { id: d.channel_id, guildId: '@me', type: 'dm', name: userName(d.author), userId: d.author.id, position: 0 });
        }
        return s.addMessage(normMessage(d, s.me?.id));
      }
      case 'MESSAGE_UPDATE': return s.patchMessage(d.channel_id, d.id, messageFields(d, s.me?.id));
      case 'MESSAGE_DELETE': return s.deleteMessage(d.channel_id, d.id);
      case 'MESSAGE_DELETE_BULK': d.ids.forEach((id) => s.deleteMessage(d.channel_id, id)); return;
      case 'MESSAGE_REACTION_ADD': case 'MESSAGE_REACTION_REMOVE': {
        const r = normReaction({ emoji: d.emoji });
        return s.react(d.channel_id, d.message_id, r.key, r.label, d.user_id, t.endsWith('ADD'));
      }
      case 'MESSAGE_REACTION_REMOVE_ALL': return s.patchMessage(d.channel_id, d.message_id, { reactions: [] });
      case 'TYPING_START':
        if (d.member) member(d.member, d.member.user);
        return s.setTyping(d.channel_id, d.user_id);
      default: return;
    }
    s.changed();
  }

  // ----- actions -----

  async loadMessages(channelId, before) {
    const s = this.store;
    const h = s.history(channelId);
    h.loading = true;
    s.changed();
    try {
      const raw = await this.rest('GET', `/channels/${channelId}/messages?limit=50${before ? `&before=${before}` : ''}`);
      for (const m of raw) {
        if (!s.users.has(m.author.id)) s.users.set(m.author.id, userName(m.author));
        for (const u of m.mentions ?? []) if (!s.users.has(u.id)) s.users.set(u.id, userName(u));
      }
      s.setHistory(channelId, raw.map((m) => normMessage(m, s.me?.id)), raw.length === 50);
    } catch (err) {
      Object.assign(h, { loading: false, loaded: true, hasMore: false });
      if (!h.list.length) h.error = err.status === 403 ? 'You do not have permission to view this channel.' : err.message;
      s.changed();
    }
  }

  send(channelId, content, replyToId) {
    const body = { content, allowed_mentions: { parse: ['users', 'roles', 'everyone'], replied_user: true } };
    if (replyToId) body.message_reference = { message_id: replyToId, fail_if_not_exists: false };
    return this.rest('POST', `/channels/${channelId}/messages`, body);
  }

  edit(channelId, id, content) {
    return this.rest('PATCH', `/channels/${channelId}/messages/${id}`, { content });
  }

  remove(channelId, id) {
    return this.rest('DELETE', `/channels/${channelId}/messages/${id}`);
  }

  react(channelId, id, emoji) {
    const mine = this.store.findMessage(channelId, id)?.reactions.find((r) => r.key === emoji || r.label === emoji);
    const key = encodeURIComponent(mine?.key ?? emoji);
    return this.rest(mine?.me ? 'DELETE' : 'PUT', `/channels/${channelId}/messages/${id}/reactions/${key}/@me`);
  }

  typing(channelId) {
    return this.rest('POST', `/channels/${channelId}/typing`);
  }

  // ----- voice -----

  voiceState(guildId, channelId, v) {
    this.sendOp(4, { guild_id: guildId, channel_id: channelId, self_mute: !!v?.muted, self_deaf: !!v?.deafened });
  }

  async joinVoice(channelId) {
    const s = this.store;
    const ch = s.channels.get(channelId);
    if (!ch || ch.type !== 'voice') return;
    const prev = s.voice;
    if (prev?.guildId === ch.guildId) {
      if (prev.channelId === channelId) return;
      prev.channelId = channelId;
      s.speaking.clear();
      if (this.session) this.session.move(channelId);
      else this.voiceState(ch.guildId, channelId, prev);
      return s.changed();
    }
    await this.leaveVoice();
    const v = (s.voice = { guildId: ch.guildId, channelId, state: 'connecting', muted: true, deafened: false, audio: false, since: Date.now() });
    s.changed();
    this.voiceLib ??= await loadVoice();
    if (s.voice !== v) return;
    if (!this.voiceLib) {
      this.voiceState(ch.guildId, channelId, v);
      v.state = 'presence';
      return s.setStatus('Joined without audio: run "npm install" in the termcord folder', 12000);
    }
    v.audio = true;
    this.session = new VoiceSession(this.voiceLib, {
      guildId: ch.guildId,
      channelId,
      adapterCreator: (hooks) => {
        this.voiceHooks.set(ch.guildId, hooks);
        return {
          sendPayload: (payload) => {
            if (this.ws?.readyState !== WebSocket.OPEN) return false;
            this.ws.send(JSON.stringify(payload));
            return true;
          },
          destroy: () => this.voiceHooks.delete(ch.guildId),
        };
      },
      onState: (status) => {
        if (s.voice !== v) return;
        v.state = status === 'ready' ? 'connected' : 'connecting';
        s.changed();
      },
      onSpeaking: (userId, on) => {
        if (on) s.speaking.add(userId);
        else s.speaking.delete(userId);
        s.changed();
      },
      onMicFailed: () => {
        v.muted = true;
        s.changed();
      },
      onError: (message) => s.setStatus(`⚠ Voice: ${message}`, 10000),
    });
  }

  async leaveVoice() {
    const s = this.store;
    const v = s.voice;
    if (!v) return;
    s.voice = null;
    s.speaking.clear();
    if (this.session) this.session.destroy();
    else this.voiceState(v.guildId, null);
    this.session = null;
    s.changed();
  }

  async setVoiceFlags(flags) {
    const s = this.store;
    const v = s.voice;
    if (!v) return;
    if (flags.muted === false && !v.audio) return s.setStatus('Audio is not installed: run "npm install" in the termcord folder', 8000);
    Object.assign(v, flags);
    if (this.session) this.session.setFlags(v.muted, v.deafened);
    else this.voiceState(v.guildId, v.channelId, v);
    s.changed();
  }

  close() {
    this.leaveVoice();
    clearInterval(this.heartbeat);
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000);
  }
}
