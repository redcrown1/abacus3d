export function mix(a, b, t) {
  const ch = (shift) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// Readable text colour on a filled background.
export function ink(bg) {
  const lum = (0.2126 * ((bg >> 16) & 255) + 0.7152 * ((bg >> 8) & 255) + 0.0722 * (bg & 255)) / 255;
  return lum > 0.6 ? 0x111214 : 0xffffff;
}

// Expands a short palette into every colour the interface uses.
function make(p) {
  const strong = p.strong ?? 0xffffff;
  return {
    rail: p.rail, side: p.side, chat: p.chat, panel: p.panel, input: p.input, hover: p.hover, sel: p.sel, modal: p.modal,
    msgSel: mix(p.chat, p.rail, 0.4),
    text: p.text, bright: p.bright, white: strong, muted: p.muted, faint: p.faint, chan: mix(p.muted, p.faint, 0.5),
    blurple: p.accent, green: p.green, yellow: p.yellow, red: p.red, link: p.link,
    line: p.rail, divider: mix(p.chat, p.text, 0.2),
    mentionBg: mix(p.chat, p.accent, 0.3), mentionFg: mix(p.accent, strong, 0.7),
    mentionRow: mix(p.chat, p.yellow, 0.1), mentionBar: p.yellow,
    code: p.side, codeInline: p.rail, spoiler: p.rail, reactMe: mix(p.chat, p.accent, 0.15),
    synKey: mix(p.accent, strong, 0.4), synStr: mix(p.green, p.text, 0.25), synNum: mix(p.yellow, p.text, 0.15),
    synCom: p.faint, synFn: p.link,
  };
}

export const THEMES = {
  dark: {
    name: 'Discord Dark',
    colors: make({
      rail: 0x1e1f22, side: 0x2b2d31, chat: 0x313338, panel: 0x232428, input: 0x383a40, hover: 0x35373c, sel: 0x404249,
      modal: 0x111214, text: 0xdbdee1, bright: 0xf2f3f5, muted: 0x949ba4, faint: 0x6d6f78,
      accent: 0x5865f2, green: 0x23a55a, yellow: 0xf0b232, red: 0xf23f43, link: 0x00a8fc,
    }),
  },
  midnight: {
    name: 'Midnight',
    colors: make({
      rail: 0x000000, side: 0x0b0b0e, chat: 0x121216, panel: 0x060608, input: 0x1d1d23, hover: 0x1a1a20, sel: 0x282830,
      modal: 0x1a1a1f, text: 0xd6d9dd, bright: 0xf2f3f5, muted: 0x8e939c, faint: 0x5f626b,
      accent: 0x5865f2, green: 0x23a55a, yellow: 0xf0b232, red: 0xf23f43, link: 0x00a8fc,
    }),
  },
  light: {
    name: 'Light',
    colors: make({
      rail: 0xe3e5e8, side: 0xf2f3f5, chat: 0xffffff, panel: 0xebedef, input: 0xebedef, hover: 0xe6e8eb, sel: 0xd4d7dc,
      modal: 0xffffff, text: 0x313338, bright: 0x060607, strong: 0x060607, muted: 0x5c5e66, faint: 0x80848e,
      accent: 0x5865f2, green: 0x248046, yellow: 0xb47b00, red: 0xda373c, link: 0x006ce7,
    }),
  },
  dracula: {
    name: 'Dracula',
    colors: make({
      rail: 0x191a21, side: 0x21222c, chat: 0x282a36, panel: 0x191a21, input: 0x343746, hover: 0x2f3140, sel: 0x44475a,
      modal: 0x15161c, text: 0xf8f8f2, bright: 0xffffff, muted: 0xa4adcf, faint: 0x6272a4,
      accent: 0xbd93f9, green: 0x50fa7b, yellow: 0xf1fa8c, red: 0xff5555, link: 0x8be9fd,
    }),
  },
  nord: {
    name: 'Nord',
    colors: make({
      rail: 0x242933, side: 0x2e3440, chat: 0x3b4252, panel: 0x272c36, input: 0x434c5e, hover: 0x414a5c, sel: 0x4c566a,
      modal: 0x1f232b, text: 0xd8dee9, bright: 0xeceff4, muted: 0x9aa5ba, faint: 0x6f7b91,
      accent: 0x5e81ac, green: 0xa3be8c, yellow: 0xebcb8b, red: 0xbf616a, link: 0x88c0d0,
    }),
  },
  catppuccin: {
    name: 'Catppuccin Mocha',
    colors: make({
      rail: 0x11111b, side: 0x181825, chat: 0x1e1e2e, panel: 0x11111b, input: 0x313244, hover: 0x292a3c, sel: 0x45475a,
      modal: 0x0d0d15, text: 0xcdd6f4, bright: 0xe6ebff, muted: 0xa6adc8, faint: 0x6c7086,
      accent: 0xcba6f7, green: 0xa6e3a1, yellow: 0xf9e2af, red: 0xf38ba8, link: 0x89b4fa,
    }),
  },
  synthwave: {
    name: 'Synthwave',
    colors: make({
      rail: 0x16102b, side: 0x1f1640, chat: 0x261b4d, panel: 0x130d26, input: 0x34276a, hover: 0x2f235e, sel: 0x443488,
      modal: 0x0e0920, text: 0xf0e6ff, bright: 0xffffff, muted: 0xb3a2dc, faint: 0x7c6bab,
      accent: 0xff3fa4, green: 0x36f9c1, yellow: 0xfede5d, red: 0xff5370, link: 0x4dd8ff,
    }),
  },
  gruvbox: {
    name: 'Gruvbox',
    colors: make({
      rail: 0x1d2021, side: 0x282828, chat: 0x32302f, panel: 0x1d2021, input: 0x3c3836, hover: 0x3a3735, sel: 0x504945,
      modal: 0x161819, text: 0xebdbb2, bright: 0xfbf1c7, muted: 0xbdae93, faint: 0x7c6f64,
      accent: 0xd79921, green: 0xb8bb26, yellow: 0xfabd2f, red: 0xfb4934, link: 0x83a598,
    }),
  },
};

// The active palette. Mutated in place so every module sees a theme change.
export const T = { ...THEMES.dark.colors };

export function applyTheme(id) {
  Object.assign(T, (THEMES[id] ?? THEMES.dark).colors);
}

export const STATUS = {
  online: { label: 'Online', get color() { return T.green; } },
  idle: { label: 'Idle', get color() { return T.yellow; } },
  dnd: { label: 'Do Not Disturb', get color() { return T.red; } },
  offline: { label: 'Offline', get color() { return T.faint; } },
};

const PALETTE = [0x5865f2, 0x3ba55d, 0xfaa81a, 0xed4245, 0xeb459e, 0x1abc9c, 0x9b59b6, 0xe67e22, 0x3498db];

export function userColor(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const SHORTCODES = {
  smile: '😄', grin: '😁', joy: '😂', sob: '😭', heart: '❤️', thumbsup: '👍', '+1': '👍', thumbsdown: '👎',
  tada: '🎉', fire: '🔥', eyes: '👀', rocket: '🚀', thinking: '🤔', wave: '👋', pray: '🙏', clap: '👏',
  100: '💯', skull: '💀', sparkles: '✨', check: '✅', x: '❌', crab: '🦀', coffee: '☕', bug: '🐛',
};

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '👀'];
