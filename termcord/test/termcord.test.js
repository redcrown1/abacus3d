import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strWidth, truncate } from '../src/width.js';
import { parseInput, layoutInput } from '../src/input.js';
import { parseInline, parseBlocks, wrapSpans } from '../src/markdown.js';
import { Screen } from '../src/screen.js';
import { Store } from '../src/store.js';
import { App } from '../src/app.js';
import { render } from '../src/view.js';
import { DemoBackend } from '../src/backends/demo.js';
import { normMessage, normChannel, messageFields, avatarOf, normMember } from '../src/backends/discord.js';
import { readFileSync } from 'node:fs';
import { decodePng, encodePng } from '../src/png.js';
import { fit, toCells, sizedUrl } from '../src/images.js';
import { mixFrames, micInput, micArgs, parsePulseJson, parseSources, parseAvfoundation, parseDshow, FRAME } from '../src/voice.js';
import { Settings, settingsPath } from '../src/settings.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const key = (name, mods = {}) => ({ type: 'key', name, ctrl: false, alt: false, shift: false, ...mods });
const type = (text) => ({ type: 'text', text });

async function demo(w = 120, h = 36) {
  const store = new Store();
  const mics = [{ id: 'alsa_input.usb-mic', label: 'USB Microphone' }, { id: 'alsa_input.pci', label: 'Built-in Audio' }];
  const backend = new DemoBackend(store, { simulate: false, name: 'tester', mics });
  const app = new App(store, backend);
  await backend.connect();
  const screen = new Screen(w, h);
  const frame = () => {
    render(app, screen);
    render(app, screen);
    return screen.toPlain();
  };
  frame();
  const press = async (...evs) => {
    for (const ev of evs) app.handle(ev);
    await new Promise((r) => setImmediate(r));
    frame(); // starts loading images that scrolled into view
    await new Promise((r) => setTimeout(r, 20));
    return frame();
  };
  return { store, app, frame, press };
}

test('width: wide characters and truncation', () => {
  assert.equal(strWidth('abc'), 3);
  assert.equal(strWidth('日本'), 4);
  assert.equal(strWidth('👍'), 2);
  assert.equal(strWidth('e\u0301'), 1);
  assert.equal(truncate('hello world', 6), 'hello…');
});

test('input: keys, modifiers, mouse and paste', () => {
  assert.deepEqual(parseInput('hi\r'), [type('hi'), key('enter')]);
  assert.deepEqual(parseInput('\x1b[A\x1b[1;3B'), [key('up'), key('down', { alt: true })]);
  assert.deepEqual(parseInput('\x0b'), [key('k', { ctrl: true })]);
  assert.deepEqual(parseInput('\x1b'), [key('escape')]);
  assert.deepEqual(parseInput('\x1b[<0;10;5M'), [{ type: 'mouse', button: 'left', x: 9, y: 4 }]);
  assert.deepEqual(parseInput('\x1b[<65;1;1M'), [{ type: 'mouse', button: 'wheeldown', x: 0, y: 0 }]);
  assert.deepEqual(parseInput('\x1b[200~a\r\nb\x1b[201~'), [{ type: 'paste', text: 'a\nb' }]);
});

test('input: composer wrapping tracks the cursor', () => {
  assert.deepEqual(layoutInput('abcdef', 5, 4), { lines: ['abcd', 'ef'], cy: 1, cx: 1 });
  assert.deepEqual(layoutInput('a\nb', 3, 10), { lines: ['a', 'b'], cy: 1, cx: 1 });
});

test('markdown: inline styles, mentions and links', () => {
  const ctx = { user: (id) => (id === '1' ? 'ada' : undefined), channel: () => 'general' };
  const spans = parseInline('**bold** *it* `code` <@1> <#9> ||hide|| https://a.io/x. snake_case_name', ctx);
  const find = (t) => spans.find((s) => s.text === t);
  assert.equal(find('bold').b, true);
  assert.equal(find('it').i, true);
  assert.equal(find('code').code, true);
  assert.equal(find('@ada').mention, true);
  assert.equal(find('#general').mention, true);
  assert.equal(find('hide').spoiler, true);
  assert.equal(find('https://a.io/x').link, 'https://a.io/x');
  assert.ok(spans.at(-1).text.endsWith('snake_case_name'));
});

test('markdown: blocks and wrapping', () => {
  const blocks = parseBlocks('intro\n```js\nlet a = 1;\n```\n> quoted');
  assert.deepEqual(blocks.map((b) => b.type), ['p', 'code', 'quote']);
  assert.deepEqual(blocks[1].lines, ['let a = 1;']);
  const lines = wrapSpans([{ text: 'one two three four' }], 9).map((l) => l.map((p) => p.text).join('').trimEnd());
  assert.deepEqual(lines, ['one two', 'three', 'four']);
});

test('discord: payload normalisation', () => {
  const raw = {
    id: '10', channel_id: '5', type: 19, timestamp: '2026-01-01T00:00:00Z', content: 'hi <@7>', edited_timestamp: null,
    author: { id: '2', username: 'bob', global_name: 'Bob' }, member: { nick: 'Bobby' }, mentions: [{ id: '7' }],
    attachments: [{ filename: 'a.png', size: 10, url: 'u' }], embeds: [],
    reactions: [{ emoji: { id: '99', name: 'pog' }, count: 2, me: true }],
    referenced_message: { id: '9', content: 'yo', author: { id: '7', username: 'me' } },
  };
  const m = normMessage(raw, '7');
  assert.equal(m.author.name, 'Bobby');
  assert.equal(m.mentionsMe, true);
  assert.deepEqual(m.reactions, [{ key: 'pog:99', label: ':pog:', count: 2, me: true }]);
  assert.equal(m.reply.content, 'yo');
  assert.deepEqual(messageFields({ id: '10', content: 'edited', edited_timestamp: 'x' }, '7'), { content: 'edited', edited: true });
  assert.equal(normChannel({ id: '1', type: 0, name: 'general', guild_id: 'g' }).type, 'text');
  assert.equal(normChannel({ id: '1', type: 11, name: 'thread' }), null);
});

test('ui: renders all four panes', async () => {
  const { frame } = await demo();
  const out = frame();
  for (const text of ['DM', 'Terminal Dwellers', 'TEXT CHANNELS', '# general', 'Message #general', 'ADMIN — 1', 'Ada Lovelace', 'Pipeline #4821 passed', '@tester']) {
    assert.ok(out.includes(text), `missing ${text}\n${out}`);
  }
  assert.ok(out.split('\n').every((l) => strWidth(l) <= 120));
});

test('ui: sending, replying, editing and deleting', async () => {
  const { store, app, press } = await demo();
  let out = await press(type('hello :wave: @ferris'), key('enter'), key('enter'));
  const sent = store.history('c3').list.at(-1);
  assert.equal(sent.content, 'hello 👋 <@u4>');
  assert.ok(out.includes('hello 👋 @ferris'));

  await press(key('up'), type('k'), type('r'));
  assert.equal(app.focus, 'input');
  out = await press(type('on it'), key('enter'));
  assert.ok(store.history('c3').list.at(-1).reply.content.includes('layout bug'));

  await press(key('up'), type('e'), type('!'), key('enter'));
  const edited = store.history('c3').list.at(-1);
  assert.equal(edited.content, 'on it!');
  assert.equal(edited.edited, true);

  const before = store.history('c3').list.length;
  await press(key('up'), type('d'), key('enter'));
  assert.equal(store.history('c3').list.length, before - 1);
});

test('ui: navigation, quick switcher and reactions', async () => {
  const { store, app, press } = await demo();
  let out = await press(key('down', { alt: true }));
  assert.equal(app.channelId, 'c4');
  assert.ok(out.includes('Message #dotfiles'));

  out = await press(key('k', { ctrl: true }), type('borrow'));
  assert.ok(out.includes('borrow-checker-therapy') && out.includes('Rustaceans'));
  await press(key('enter'));
  assert.equal(app.guildId, 'g2');
  assert.equal(app.channelId, 'c21');

  await press(key('up'), type('+'), type('1'));
  assert.deepEqual(store.history('c21').list.at(-1).reactions, [{ key: '👍', label: '👍', count: 1, me: true }]);

  out = await press(key('escape'), key('up', { ctrl: true, alt: true }));
  assert.equal(app.guildId, 'g1');
  out = await press(key('up', { ctrl: true, alt: true }));
  assert.equal(app.guildId, '@me');
  assert.ok(out.includes('DIRECT MESSAGES') && out.includes('Grace Hopper'));
});

test('ui: unread tracking, older history and mouse', async () => {
  const { store, app, press, frame } = await demo();
  frame();
  store.addMessage({ ...store.history('c4').list[0], id: '99999999', channelId: 'c4', mentionsMe: true });
  assert.deepEqual(store.badge('g1').mentions, 1);
  assert.equal(store.history('c3').list.length, 8);
  await press(key('pageup'), key('pageup'), key('pageup'));
  assert.equal(store.history('c3').list.length, 38);
  assert.ok(app.scroll > 0);

  const hit = app.hits.find((h) => h.type === 'guild' && h.id === 'g3');
  const out = await press({ type: 'mouse', button: 'left', x: hit.x + 2, y: hit.y + 1 });
  assert.equal(app.guildId, 'g3');
  assert.ok(out.includes('Pixel Lounge'));
});

test('png: round trip and a real-world file', () => {
  const rgba = Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 10, 20, 30, 255]);
  const img = decodePng(encodePng(2, 2, rgba));
  assert.deepEqual([img.width, img.height], [2, 2]);
  assert.deepEqual([...img.data], [...rgba]);
  assert.throws(() => decodePng(Buffer.from('GIF89a..........')), /not a PNG/);

  // written by a browser, so it exercises the row filters our encoder never emits
  const shot = decodePng(readFileSync(new URL('../docs/screenshot.png', import.meta.url)));
  assert.deepEqual([shot.width, shot.height], [1152, 760]);
  const o = (750 * 1152 + 1140) * 4;
  assert.deepEqual([...shot.data.subarray(o, o + 4)], [0x2b, 0x2d, 0x31, 255]);
});

test('images: fitting, scaling and proxy urls', () => {
  assert.deepEqual(fit(1920, 1080, 56, 14), { cols: 50, rows: 14 });
  assert.deepEqual(fit(400, 100, 56, 14), { cols: 56, rows: 7 });
  assert.deepEqual(fit(16, 16, 56, 14), { cols: 16, rows: 8 });
  const px = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < 16; i++) px.set(i % 4 < 2 ? [255, 0, 0, 255] : [0, 0, 255, 0], i * 4);
  assert.deepEqual(toCells({ width: 4, height: 4, data: px }, 2, 1, 0x102030), [[[0xff0000, 0xff0000], [0x102030, 0x102030]]]);
  assert.equal(sizedUrl('https://media.discordapp.net/attachments/1/2/a.jpg?ex=1&hm=2', 80, 40),
    'https://media.discordapp.net/attachments/1/2/a.jpg?ex=1&hm=2&format=png&width=80&height=40');
  const fields = messageFields({ attachments: [
    { filename: 'a.jpg', size: 1, url: 'u', proxy_url: 'https://p/a.jpg', width: 10, height: 5, content_type: 'image/jpeg' },
    { filename: 'b.mp4', size: 1, url: 'u', proxy_url: 'https://p/b.mp4', width: 10, height: 5, content_type: 'video/mp4' },
  ] });
  assert.deepEqual(fields.attachments.map((a) => a.image?.w), [10, undefined]);
});

test('ui: inline images and the image viewer', async () => {
  const { app, press } = await demo();
  let out = await press(key('down', { alt: true }));
  assert.equal(app.channelId, 'c4');
  const picture = out.split('\n').filter((l) => l.includes('▀'.repeat(40)));
  assert.equal(picture.length, 14);
  out = await press(key('up'), type('v'));
  assert.equal(app.modal.type, 'image');
  assert.ok(out.includes('dusk.png'));
  assert.ok(out.split('\n').filter((l) => l.includes('▀'.repeat(50))).length > 20);
  await press(key('escape'), type('k'), type('v'));
  assert.equal(app.modal, null);
  assert.equal(app.store.status, 'This message has no images');
});

test('ui: joining, muting and leaving a voice channel', async () => {
  const { store, app, press } = await demo();
  const idx = app.sidebarItems().findIndex((i) => i.ch?.id === 'c9');
  app.chanCursor = idx;
  app.focus = 'channels';
  let out = await press(key('enter'));
  assert.equal(store.voice.channelId, 'c9');
  assert.ok(out.includes('Voice Connected') && out.includes('MUTED') && out.includes('EAR'));
  assert.ok(app.sidebarItems().some((i) => i.kind === 'voiceUser' && i.userId === 'me'));

  out = await press(key('m', { alt: true }), key('d', { alt: true }));
  assert.deepEqual([store.voice.muted, store.voice.deafened], [false, true]);
  assert.ok(out.includes(' MIC ') && out.includes('DEAF'));

  const hit = app.hits.find((h) => h.type === 'voiceLeave');
  out = await press({ type: 'mouse', button: 'left', x: hit.x + 1, y: hit.y });
  assert.equal(store.voice, null);
  assert.ok(!out.includes('Voice Connected'));
});

test('voice: mixing and microphone inputs', () => {
  const a = Buffer.alloc(FRAME), b = Buffer.alloc(FRAME);
  a.writeInt16LE(1000, 0);
  b.writeInt16LE(250, 0);
  a.writeInt16LE(30000, 2);
  b.writeInt16LE(30000, 2);
  const mixed = mixFrames([a, b]);
  assert.deepEqual([mixed.readInt16LE(0), mixed.readInt16LE(2)], [1250, 32767]);
  assert.equal(mixFrames([a]), a);
  assert.deepEqual(micInput('linux', undefined), ['-f', 'pulse', '-i', 'default']);
  assert.deepEqual(micInput('darwin', 'USB Mic'), ['-f', 'avfoundation', '-i', ':USB Mic']);
  assert.equal(micInput('win32', undefined), null);
});

test('discord: avatar and icon urls', () => {
  const cdn = 'https://cdn.discordapp.com';
  assert.equal(avatarOf({ id: '80351110224678912', username: 'n', avatar: 'abc' }).url, `${cdn}/avatars/80351110224678912/abc.png?size=64`);
  assert.equal(avatarOf({ id: '5', username: 'n', avatar: 'abc' }, { avatar: 'def' }, '9').url, `${cdn}/guilds/9/users/5/avatars/def.png?size=64`);
  assert.equal(avatarOf({ id: '80351110224678912', username: 'n', avatar: null, discriminator: '0' }).url, `${cdn}/embed/avatars/5.png?size=64`);
  assert.equal(avatarOf({ id: '5', username: 'n', avatar: null, discriminator: '1337' }).url, `${cdn}/embed/avatars/2.png?size=64`);
  assert.equal(normMember({ nick: 'N', roles: [] }, { id: '5', username: 'n', avatar: 'abc' }, undefined, '9').avatar.direct, true);
});

test('ui: avatars and server icons replace the initials once loaded', async () => {
  const { store, app, frame, press } = await demo();
  const before = frame();
  await press();
  const after = frame();
  // the acronym box for the first server gives way to its pixel icon
  assert.ok(app.images.entries.get('demo:icon:g1|6x3|' + 0x1e1f22).cells.length === 3);
  assert.ok(!after.includes(' TD '));
  const row = after.split('\n').find((l) => l.includes('Barbara L. Today'));
  assert.ok(row.includes('▀▀▀▀'), row);
  assert.equal(app.images.entries.get('demo:avatar:u9|4x2|' + 0x313338).state, 'ready');
  assert.ok(before.split('\n').every((l) => strWidth(l) <= 120) && after.split('\n').every((l) => strWidth(l) <= 120));

  const hit = app.hits.find((h) => h.type === 'member' && h.id === 'u1');
  const out = await press({ type: 'mouse', button: 'left', x: hit.x + 3, y: hit.y });
  assert.equal(app.modal.type, 'profile');
  assert.ok(out.includes('Ada Lovelace') && out.includes('Admin'));
  assert.equal(app.images.entries.get('demo:avatar:u1|10x5|' + 0x111214).state, 'ready');
  assert.equal(store.me.avatar.id, 'demo:avatar:me');
});

test('settings: saved, reloaded and sanitised', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'termcord-')), 'nested', 'settings.json');
  const a = new Settings(path);
  assert.equal(a.values.joinMuted, true);
  assert.equal(a.set('mic', 'USB Mic'), true);
  a.set('micVolume', 150);
  a.set('outVolume', 999);
  a.set('images', false);
  const b = new Settings(path);
  assert.deepEqual([b.values.mic, b.values.micVolume, b.values.outVolume, b.values.images, b.values.avatars], ['USB Mic', 150, 200, false, true]);

  writeFileSync(path, JSON.stringify({ mic: 5, micVolume: 'loud', members: 'yes', unknown: 1 }));
  const c = new Settings(path);
  assert.deepEqual([c.values.mic, c.values.micVolume, c.values.members, 'unknown' in c.values], ['', 100, true, false]);
  writeFileSync(path, 'not json');
  assert.equal(new Settings(path).values.micVolume, 100);

  assert.equal(settingsPath({ XDG_CONFIG_HOME: '/x' }, 'linux'), join('/x', 'termcord', 'settings.json'));
  assert.equal(settingsPath({ APPDATA: 'C:\\Roaming' }, 'win32'), join('C:\\Roaming', 'termcord', 'settings.json'));
  assert.equal(settingsPath({ TERMCORD_CONFIG: '/tmp/s.json' }, 'linux'), '/tmp/s.json');
});

test('voice: microphone discovery on each platform', () => {
  const pulse = JSON.stringify([
    { name: 'alsa_output.pci.analog-stereo.monitor', description: 'Monitor of Built-in Audio' },
    { name: 'alsa_input.usb-Blue_Yeti', description: 'Blue Yeti' },
  ]);
  assert.deepEqual(parsePulseJson(pulse).map((m) => m.label), ['Blue Yeti', 'Monitor of Built-in Audio']);
  assert.deepEqual(parsePulseJson('Connection failure: Connection refused'), []);

  const sources = 'Auto-detected sources for pulse:\n  alsa_output.pci.monitor [Monitor of Built-in Audio Analog Stereo]\n* alsa_input.pci.analog-stereo [Built-in Audio Analog Stereo]\n';
  assert.deepEqual(parseSources(sources)[0], { id: 'alsa_input.pci.analog-stereo', label: 'Built-in Audio Analog Stereo' });

  const mac = [
    '[AVFoundation indev @ 0x7f8] AVFoundation video devices:',
    '[AVFoundation indev @ 0x7f8] [0] FaceTime HD Camera',
    '[AVFoundation indev @ 0x7f8] AVFoundation audio devices:',
    '[AVFoundation indev @ 0x7f8] [0] MacBook Pro Microphone',
    '[AVFoundation indev @ 0x7f8] [1] External Microphone',
    ': Input/output error',
  ].join('\n');
  assert.deepEqual(parseAvfoundation(mac).map((m) => m.id), ['MacBook Pro Microphone', 'External Microphone']);

  const win = [
    '[dshow @ 000001] "Integrated Webcam" (video)',
    '[dshow @ 000001]   Alternative name "@device_pnp_\\\\?\\usb#vid"',
    '[dshow @ 000001] "Microphone (Realtek(R) Audio)" (audio)',
    '[dshow @ 000001]   Alternative name "@device_cm_{33D9A762}\\wave_{1}"',
  ].join('\r\n');
  assert.deepEqual(parseDshow(win), [{ id: 'Microphone (Realtek(R) Audio)', label: 'Microphone (Realtek(R) Audio)' }]);
  const winOld = '[dshow @ 01] DirectShow video devices\n[dshow @ 01]  "Webcam"\n[dshow @ 01] DirectShow audio devices\n[dshow @ 01]  "Headset Mic"\n[dshow @ 01]     Alternative name "@device_cm"\n';
  assert.deepEqual(parseDshow(winOld).map((m) => m.id), ['Headset Mic']);

  const args = micArgs(micInput('linux', 'alsa_input.usb-mic'), 150);
  assert.deepEqual(args.slice(2, 8), ['-f', 'pulse', '-i', 'alsa_input.usb-mic', '-af', 'volume=1.5']);
  assert.ok(!micArgs(micInput('linux', ''), 100).includes('-af'));

  const frame = Buffer.alloc(FRAME);
  frame.writeInt16LE(1000, 0);
  assert.equal(mixFrames([frame], 0.5).readInt16LE(0), 500);
  assert.equal(mixFrames([frame], 0).readInt16LE(0), 0);
});

test('ui: settings screen changes and applies preferences', async () => {
  const { store, app, press } = await demo();
  assert.deepEqual(parseInput('\x1bOQ\x1b[12~').map((e) => e.name), ['f2', 'f2']);
  const v = store.settings.values;

  let out = await press(key('f2'));
  assert.equal(app.modal.type, 'settings');
  for (const text of ['Settings', 'Microphone', '‹ System default ›', 'Speaker volume', '100%', 'Join voice channels muted', ' On ']) {
    assert.ok(out.includes(text), `missing ${text}\n${out}`);
  }

  out = await press(key('right'));
  assert.equal(v.mic, 'alsa_input.usb-mic');
  assert.ok(out.includes('‹ USB Microphone ›'));
  await press(key('left'), key('left'));
  assert.equal(v.mic, 'alsa_input.pci');

  out = await press(key('down'), key('right'), key('right'), key('down'), key('left'));
  assert.deepEqual([v.micVolume, v.outVolume], [120, 90]);
  assert.ok(out.includes('120%') && out.includes('90%'));
  const slider = app.hits.find((h) => h.type === 'slider' && h.index === 2);
  await press({ type: 'mouse', button: 'left', x: slider.x + 5, y: slider.y });
  assert.equal(v.outVolume, 50);

  await press(key('down'), key('enter'), key('down'), key('enter'), key('down'), type(' '));
  assert.deepEqual([v.joinMuted, v.images, v.avatars], [false, false, false]);
  out = await press(key('escape'), key('down', { alt: true }));
  assert.equal(app.modal, null);
  assert.ok(out.includes('▣ dusk.png'), out);
  assert.equal(out.split('\n').filter((l) => l.includes('▀'.repeat(40))).length, 0);
  assert.match(out, /▌\s+TD/);

  assert.ok(out.includes('ADMIN — 1'));
  out = await press(key('u', { ctrl: true }));
  assert.equal(v.members, false);
  assert.ok(!out.includes('ADMIN — 1'));

  app.chanCursor = app.sidebarItems().findIndex((i) => i.ch?.id === 'c9');
  app.focus = 'channels';
  out = await press(key('enter'));
  assert.equal(store.voice.muted, false);
  assert.ok(out.includes(' MIC '));

  const gear = app.hits.find((h) => h.type === 'settings');
  await press({ type: 'mouse', button: 'left', x: gear.x + 1, y: gear.y });
  assert.equal(app.modal.type, 'settings');
});
