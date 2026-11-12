#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { userInfo } from 'node:os';
import { Store } from './store.js';
import { Settings, settingsPath } from './settings.js';
import { Screen } from './screen.js';
import { App } from './app.js';
import { render } from './view.js';
import { parseInput } from './input.js';
import { DemoBackend } from './backends/demo.js';
import { DiscordBackend } from './backends/discord.js';

const USAGE = `termcord: Discord in your terminal

Usage:
  termcord                 connect with the bot token in DISCORD_TOKEN, or run the demo if unset
  termcord --demo          explore the interface with offline sample data
  termcord --token <tok>   connect with the given bot token

Options:
  --snapshot <WxH>         print a single frame as text and exit (add --ansi for colours)
  -h, --help               show this help

Press F1 inside the app for keyboard shortcuts.`;

const { values: opts } = parseArgs({
  options: {
    demo: { type: 'boolean' }, token: { type: 'string' }, snapshot: { type: 'string' },
    ansi: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  },
});
if (opts.help) {
  console.log(USAGE);
  process.exit(0);
}

const token = opts.demo ? null : opts.token ?? process.env.DISCORD_TOKEN ?? process.env.DISCORD_BOT_TOKEN;
const truecolor = /truecolor|24bit/i.test(process.env.COLORTERM ?? '');
const store = new Store();
if (!opts.snapshot) store.settings = new Settings(settingsPath());
const backend = token
  ? new DiscordBackend(store, token)
  : new DemoBackend(store, { simulate: !opts.snapshot, name: userInfo().username || 'you' });
const app = new App(store, backend);

try {
  await backend.connect();
} catch (err) {
  console.error(`termcord: could not connect to Discord: ${err.message}`);
  process.exit(1);
}
if (!token && !opts.demo && !opts.snapshot) store.setStatus('Demo mode: set DISCORD_TOKEN to connect', 15000);

if (opts.snapshot) {
  const [w, h] = opts.snapshot.split('x').map(Number);
  const screen = new Screen(w || 120, h || 36, { truecolor: true });
  render(app, screen);
  await new Promise((resolve) => setTimeout(resolve, token ? 3000 : 50)); // let visible images load
  render(app, screen); // second pass picks up state settled by the first
  console.log(opts.ansi ? screen.ansiRows().join('\n') : screen.toPlain());
  process.exit(0);
}

const { stdin, stdout } = process;
if (!stdin.isTTY || !stdout.isTTY) {
  console.error('termcord needs an interactive terminal. Try --snapshot 120x36 for a text preview.');
  process.exit(1);
}

const screen = new Screen(stdout.columns, stdout.rows, { truecolor });
let shown = [];
let pending = false;

function draw() {
  pending = false;
  render(app, screen);
  let out = '\x1b[?2026h\x1b[?25l';
  screen.ansiRows().forEach((row, y) => {
    if (row !== shown[y]) out += `\x1b[${y + 1};1H${row}`;
    shown[y] = row;
  });
  if (app.cursor) out += `\x1b[${app.cursor.y + 1};${app.cursor.x + 1}H\x1b[?25h`;
  stdout.write(`${out}\x1b[?2026l`);
}

function schedule() {
  if (pending) return;
  pending = true;
  setImmediate(draw);
}

function restore() {
  stdout.write('\x1b[?1000l\x1b[?1006l\x1b[?2004l\x1b[?25h\x1b[?1049l');
}

function quit(code = 0, message) {
  backend.close?.();
  if (stdin.isRaw) stdin.setRawMode(false);
  restore();
  if (message) console.error(message);
  process.exit(code);
}

app.onQuit = () => quit();
app.onRedraw = () => {
  shown = [];
  stdout.write('\x1b[2J');
};
store.on('change', schedule);
stdout.on('resize', () => {
  screen.resize(stdout.columns, stdout.rows);
  app.rowCache.clear();
  shown = [];
  schedule();
});
process.on('SIGTERM', () => quit());
process.on('uncaughtException', (err) => quit(1, err.stack));
process.on('unhandledRejection', (err) => quit(1, err?.stack ?? String(err)));

stdout.write('\x1b[?1049h\x1b[?1000h\x1b[?1006h\x1b[?2004h');
stdin.setRawMode(true);
stdin.setEncoding('utf8');
stdin.on('data', (data) => {
  for (const ev of parseInput(data)) app.handle(ev);
  schedule();
});
// typing indicators expire on their own, so repaint while any are showing
setInterval(() => {
  if ([...store.typing.values()].some((t) => t.size)) schedule();
}, 1000);
schedule();
