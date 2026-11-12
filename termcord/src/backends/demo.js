import { encodePng } from '../png.js';
import { listMics } from '../voice.js';
import { userColor } from '../theme.js';

// Offline backend with invented servers and simulated activity, used when no token is configured.
const MIN = 60000;

const USERS = [
  ['u1', 'ada', 'Ada Lovelace', 'online', ['admin']],
  ['u2', 'linus', 'linus', 'online', ['mod']],
  ['u3', 'grace', 'Grace Hopper', 'idle', ['mod']],
  ['u4', 'ferris', 'ferris', 'online', []],
  ['u5', 'kernelbot', 'KernelBot', 'online', ['bots'], true],
  ['u6', 'dijkstra', 'dijkstra', 'dnd', []],
  ['u7', 'margaret', 'Margaret H.', 'offline', []],
  ['u8', 'ken', 'ken', 'offline', []],
  ['u9', 'barbara', 'Barbara L.', 'online', []],
];

const CHATTER = [
  'has anyone tried the new release yet?',
  'that fixed it for me, thanks!',
  'I still think tabs are the right call 🙃',
  'pushing a patch in a few minutes',
  'lol',
  'works on my machine ™',
  'can someone review my PR when they get a chance?',
  'TIL you can pipe `git log` into `fzf` and it is *glorious*',
  'brb, coffee ☕',
  'the build is green again 🎉',
  'reading the docs now, will report back',
  'who broke main?',
];

// Head-and-shoulders silhouette on the user's colour.
const avatars = new Map();
function demoAvatar(id, size = 32) {
  if (avatars.has(id)) return avatars.get(id);
  const c = userColor(id);
  const base = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const light = base.map((v) => Math.round(v + (255 - v) * 0.8));
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const head = Math.hypot(x - size / 2, y - size * 0.38) < size * 0.2;
      const body = ((x - size / 2) / (size * 0.36)) ** 2 + ((y - size) / (size * 0.36)) ** 2 < 1;
      const shade = 1 - 0.35 * (y / size);
      px.set([...(head || body ? light : base.map((v) => v * shade)), 255], (y * size + x) * 4);
    }
  }
  const src = { id: `demo:avatar:${id}`, data: encodePng(size, size, px), w: size, h: size, name: id, direct: true, avatar: true };
  avatars.set(id, src);
  return src;
}

// Server icons are tiny pixel art, scaled up so they survive being scaled back down.
function pixelIcon(id, rows, palette, scale = 8) {
  const n = rows.length * scale;
  const px = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const c = palette[rows[Math.floor(y / scale)][Math.floor(x / scale)]];
      px.set([(c >> 16) & 255, (c >> 8) & 255, c & 255, 255], (y * n + x) * 4);
    }
  }
  return { id: `demo:icon:${id}`, data: encodePng(n, n, px), w: n, h: n, name: id, direct: true, avatar: true };
}

const ICONS = {
  g1: [['......', '.#....', '..#...', '.#....', '...##.', '......'], { '.': 0x0d3b2a, '#': 0x57f287 }],
  g2: [['o.oo.o', '.oooo.', 'oo..oo', 'oo..oo', '.oooo.', 'o.oo.o'], { '.': 0x3a1f0b, o: 0xe67e22 }],
  g3: [['rrggbb', 'rrggbb', 'yyppcc', 'yyppcc', 'bbrrgg', 'bbrrgg'],
    { r: 0xed4245, g: 0x57f287, b: 0x5865f2, y: 0xfee75c, p: 0xeb459e, c: 0x1abc9c }],
};

// A small dusk landscape, so the demo has a picture to show.
function demoPicture(w = 240, h = 136) {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = y / h;
      let c = [30 + 215 * t ** 1.6, 24 + 120 * t, 84 + 40 * (1 - t)];
      const sun = Math.hypot(x - w * 0.68, y - h * 0.5);
      if (sun < 18) c = [255, 238, 176];
      else if (sun < 40) c = c.map((v, i) => v + ([255, 220, 150][i] - v) * (1 - (sun - 18) / 22) * 0.6);
      if (y > h * 0.62 + 13 * Math.sin(x / 23) + 7 * Math.sin(x / 7.3)) c = [62, 46, 90];
      if (y > h * 0.8 + 9 * Math.sin(x / 15 + 2) + 4 * Math.sin(x / 5.1)) c = [26, 22, 44];
      px.set([...c, 255], (y * w + x) * 4);
    }
  }
  const data = encodePng(w, h, px);
  return { name: 'dusk.png', size: data.length, image: { id: 'demo:dusk', data, w, h, name: 'dusk.png' } };
}

export class DemoBackend {
  constructor(store, { simulate = true, name = 'you', mics = null } = {}) {
    this.mics = mics; // fixed device list for tests, otherwise the real devices are listed
    this.store = store;
    this.simulate = simulate;
    this.name = name;
    this.seq = 50000;
    this.older = new Set();
  }

  id() {
    return String(++this.seq).padStart(8, '0');
  }

  user(id) {
    if (id === 'me') return { id: 'me', name: this.store.me.name, bot: false, avatar: demoAvatar('me') };
    const u = USERS.find((x) => x[0] === id);
    return { id, name: u[2], bot: !!u[5], avatar: demoAvatar(id) };
  }

  msg(channelId, authorId, minutesAgo, content, extra = {}) {
    return {
      id: this.id(), channelId, author: this.user(authorId), content, ts: Date.now() - minutesAgo * MIN,
      edited: false, type: 'default', reply: null, attachments: [], embeds: [], reactions: [],
      mentionsMe: /<@me>|@everyone|@here/.test(content), rev: 0, ...extra,
    };
  }

  async connect() {
    const s = this.store;
    s.me = { id: 'me', name: this.name, username: this.name, avatar: demoAvatar('me') };
    s.users.set('me', this.name);
    for (const [id, , name] of USERS) s.users.set(id, name);
    const memberOf = (ids) => new Map([
      ['me', { id: 'me', name: this.name, username: this.name, bot: false, status: 'online', roles: [], avatar: demoAvatar('me') }],
      ...USERS.filter((u) => ids.includes(u[0])).map(([id, username, name, status, roles, bot]) =>
        [id, { id, username, name, status, roles, bot: !!bot, avatar: demoAvatar(id) }]),
    ]);
    const roles = new Map([
      ['admin', { id: 'admin', name: 'Admin', color: 0xed4245, hoist: true, position: 4 }],
      ['mod', { id: 'mod', name: 'Moderator', color: 0x3ba55d, hoist: true, position: 3 }],
      ['bots', { id: 'bots', name: 'Bots', color: 0x5865f2, hoist: true, position: 2 }],
    ]);
    const guild = (id, name, members, voice = []) => s.guilds.set(id, {
      id, name, roles, members: memberOf(members), voice: new Map(voice), icon: pixelIcon(id, ...ICONS[id]),
    });
    const chan = (guildId, id, name, type, parentId, position, topic) => s.channels.set(id, { id, guildId, name, type, parentId, position, topic });

    guild('g1', 'Terminal Dwellers', USERS.map((u) => u[0]), [['u4', 'c9'], ['u9', 'c9']]);
    s.guilds.get('g1').systemChannelId = 'c3';
    chan('g1', 'k1', 'Information', 'category', null, 0);
    chan('g1', 'c1', 'welcome', 'text', 'k1', 0, 'Start here');
    chan('g1', 'c2', 'announcements', 'announcement', 'k1', 1, 'Releases and news');
    chan('g1', 'k2', 'Text Channels', 'category', null, 1);
    chan('g1', 'c3', 'general', 'text', 'k2', 0, 'Anything goes, as long as it fits in 80 columns');
    chan('g1', 'c4', 'dotfiles', 'text', 'k2', 1, 'Show us your config');
    chan('g1', 'c5', 'help', 'text', 'k2', 2, 'Ask questions, get answers');
    chan('g1', 'c6', 'showcase', 'forum', 'k2', 3);
    chan('g1', 'k3', 'Voice Channels', 'category', null, 2);
    chan('g1', 'c9', 'Lounge', 'voice', 'k3', 0);
    chan('g1', 'c10', 'Pair Programming', 'voice', 'k3', 1);

    guild('g2', 'Rustaceans', ['u1', 'u4', 'u5', 'u6']);
    chan('g2', 'c20', 'general', 'text', null, 0, 'Fearless concurrency');
    chan('g2', 'c21', 'borrow-checker-therapy', 'text', null, 1, 'It is not you, it is the lifetimes');

    guild('g3', 'Pixel Lounge', ['u3', 'u9', 'u7']);
    chan('g3', 'c30', 'art', 'text', null, 0);
    chan('g3', 'c31', 'music', 'text', null, 1);

    s.channels.set('d1', { id: 'd1', guildId: '@me', name: 'Grace Hopper', type: 'dm', userId: 'u3', status: 'idle', position: 0 });
    s.channels.set('d2', { id: 'd2', guildId: '@me', name: 'linus', type: 'dm', userId: 'u2', status: 'online', position: 1 });

    const put = (channelId, list) => s.setHistory(channelId, list, this.channelHasOlder(channelId));
    const m = this.msg.bind(this);
    put('c1', [
      m('c1', 'u1', 60 * 50, '# Welcome to Terminal Dwellers\nA community for people who live in the shell.\n- Be kind\n- No screenshots of light themes\n- Read the pinned messages'),
      m('c1', 'u7', 60 * 30, '', { type: 'join' }),
    ]);
    put('c2', [
      m('c2', 'u1', 60 * 26, '**termcord 0.1** is out. It renders the whole Discord layout in a terminal: servers, channels, chat and the member list.', {
        embeds: [{ title: 'termcord v0.1.0', url: 'https://example.com/releases/0.1.0', color: 0x5865f2, description: 'Zero dependencies. Mouse support. Markdown rendering.', fields: [{ name: 'Requires', value: 'Node 22+' }], footer: 'Released today' }],
        reactions: [{ key: '🎉', label: '🎉', count: 7, me: false }, { key: '🚀', label: '🚀', count: 3, me: true }],
      }),
    ]);
    const first = m('c3', 'u2', 95, 'Morning all. Who is up for a round of code golf?');
    const snippet = m('c3', 'u4', 88, 'Here is my entry:\n```rust\nfn main() {\n    println!("{}", (1..=100).sum::<u32>());\n}\n```');
    put('c3', [
      first,
      m('c3', 'u3', 93, 'Only if we can use COBOL.', { reply: { id: first.id, authorId: 'u2', author: 'linus', content: first.content }, reactions: [{ key: '😂', label: '😂', count: 4, me: false }] }),
      snippet,
      m('c3', 'u4', 87, 'It is *technically* a one-liner if you squint. ||the answer is 5050||'),
      m('c3', 'u1', 40, 'Nice. Remember that `sum` needs the turbofish there, see https://doc.rust-lang.org/std/iter/trait.Iterator.html', { edited: true }),
      m('c3', 'u6', 22, '> premature optimization is the root of all evil\nSomebody had to say it.'),
      m('c3', 'u5', 12, 'Build finished for **main**.', { embeds: [{ author: 'CI', title: 'Pipeline #4821 passed', color: 0x3ba55d, description: '42 tests, 0 failures, 3.1s' }] }),
      m('c3', 'u9', 6, 'Hey <@me>, could you take a look at the layout bug in <#c5> when you have a minute?', { attachments: [{ name: 'repro-steps.txt', size: 2113, url: 'https://example.com/repro-steps.txt' }] }),
    ]);
    put('c4', [
      m('c4', 'u2', 300, 'New prompt, who dis\n```sh\nexport PS1="\\u@\\h \\W $ "\n```'),
      m('c4', 'u9', 280, 'Minimal. I approve. ~~Mine takes 400ms to render~~'),
      m('c4', 'u3', 45, 'Wallpaper of the week:', { attachments: [demoPicture()] }),
    ]);
    put('c5', [m('c5', 'u6', 15, 'The sidebar overlaps the chat pane below 80 columns. __Steps:__ resize, then switch channel.')]);
    put('c9', []);
    put('c10', []);
    put('c20', [m('c20', 'u4', 120, 'Reminder: the crab emoji is mandatory 🦀'), m('c20', 'u6', 100, 'Compiling… see you in ten minutes.')]);
    put('c21', [m('c21', 'u1', 500, 'Today I fought the borrow checker and the borrow checker won.')]);
    put('c30', [m('c30', 'u9', 700, 'ANSI art night this Friday!')]);
    put('c31', [m('c31', 'u3', 800, 'Now playing: lo-fi beats to refactor to')]);
    put('d1', [m('d1', 'u3', 180, 'Did you ever find that moth?'), m('d1', 'me', 175, 'Still debugging.')]);
    put('d2', [m('d2', 'u2', 1500, 'Patch looks good. Merging.')]);

    s.unread.set('c5', { count: 1, mentions: 0, firstId: s.history('c5').list[0].id });
    s.unread.set('c20', { count: 2, mentions: 0, firstId: s.history('c20').list[0].id });
    s.unread.set('d1', { count: 1, mentions: 1, firstId: s.history('d1').list[0].id });
    s.changed();
    if (this.simulate) this.schedule();
  }

  channelHasOlder(channelId) {
    return channelId === 'c3' && !this.older.has(channelId);
  }

  async loadMessages(channelId, before) {
    const s = this.store;
    if (!before || this.older.has(channelId)) return s.setHistory(channelId, [], false);
    // one page of older history, to exercise infinite scroll
    this.older.add(channelId);
    const people = ['u1', 'u2', 'u3', 'u4', 'u6', 'u9'];
    const list = Array.from({ length: 30 }, (_, i) => ({
      ...this.msg(channelId, people[(i * 7) % people.length], 60 * 24 + (30 - i) * 9, CHATTER[(i * 5) % CHATTER.length]),
      id: String(1000 + i).padStart(8, '0'),
    }));
    s.setHistory(channelId, list, false);
  }

  async send(channelId, content, replyToId) {
    const s = this.store;
    const target = replyToId && s.findMessage(channelId, replyToId);
    const reply = target ? { id: target.id, authorId: target.author.id, author: target.author.name, content: target.content } : null;
    const msg = this.msg(channelId, 'me', 0, content, { reply });
    s.addMessage(msg);
    if (!this.simulate) return;
    const others = this.peers(channelId);
    if (!others.length) return;
    const who = others[Math.floor(Math.random() * others.length)];
    this.later(1500, () => s.react(channelId, msg.id, '👍', '👍', who, true));
    this.later(2500, () => s.setTyping(channelId, who, 4000));
    this.later(5500, () => s.addMessage(this.msg(channelId, who, 0, CHATTER[Math.floor(Math.random() * CHATTER.length)])));
  }

  async edit(channelId, id, content) {
    this.store.patchMessage(channelId, id, { content, edited: true });
  }

  async remove(channelId, id) {
    this.store.deleteMessage(channelId, id);
  }

  async react(channelId, id, emoji) {
    const mine = this.store.findMessage(channelId, id)?.reactions.find((r) => r.key === emoji)?.me;
    this.store.react(channelId, id, emoji, emoji, 'me', !mine);
  }

  async typing() {}

  async listMics() {
    return this.mics ?? listMics();
  }

  async joinVoice(channelId) {
    const s = this.store;
    const ch = s.channels.get(channelId);
    if (!ch || ch.type !== 'voice' || s.voice?.channelId === channelId) return;
    await this.leaveVoice();
    s.voice = { guildId: ch.guildId, channelId, state: 'connected', muted: s.settings.values.joinMuted, deafened: false, audio: true };
    s.guilds.get(ch.guildId).voice.set('me', channelId);
    s.setStatus('Demo mode: voice is simulated, there is no audio', 6000);
    if (!this.simulate) return;
    // pretend the others take turns talking
    this.talk = setInterval(() => {
      const here = [...s.guilds.get(ch.guildId).voice].filter(([id, c]) => c === channelId && id !== 'me').map(([id]) => id);
      s.speaking.clear();
      if (here.length && Math.random() < 0.7) s.speaking.add(here[Math.floor(Math.random() * here.length)]);
      s.changed();
    }, 1500);
    this.talk.unref();
  }

  async leaveVoice() {
    const s = this.store;
    if (!s.voice) return;
    clearInterval(this.talk);
    s.guilds.get(s.voice.guildId).voice.delete('me');
    s.voice = null;
    s.speaking.clear();
    s.changed();
  }

  async setVoiceFlags(flags) {
    if (!this.store.voice) return;
    Object.assign(this.store.voice, flags);
    this.store.changed();
  }

  peers(channelId) {
    const s = this.store;
    const ch = s.channels.get(channelId);
    if (ch.type === 'dm') return [ch.userId];
    return [...s.guilds.get(ch.guildId).members.values()].filter((m) => m.id !== 'me' && m.status !== 'offline' && !m.bot).map((m) => m.id);
  }

  later(ms, fn) {
    setTimeout(fn, ms).unref();
  }

  schedule() {
    this.later(7000 + Math.random() * 9000, () => {
      const s = this.store;
      const chans = [...s.channels.values()].filter((c) => c.type === 'text');
      const ch = chans[Math.floor(Math.random() * chans.length)];
      const others = this.peers(ch.id);
      const who = others[Math.floor(Math.random() * others.length)];
      s.setTyping(ch.id, who, 4000);
      this.later(3000, () => s.addMessage(this.msg(ch.id, who, 0, CHATTER[Math.floor(Math.random() * CHATTER.length)])));
      this.schedule();
    });
  }
}
