// Discord's dark theme palette.
export const T = {
  rail: 0x1e1f22, side: 0x2b2d31, chat: 0x313338, panel: 0x232428, input: 0x383a40,
  hover: 0x35373c, sel: 0x404249, msgSel: 0x2a2c31, modal: 0x111214,
  text: 0xdbdee1, bright: 0xf2f3f5, white: 0xffffff, muted: 0x949ba4, faint: 0x6d6f78, chan: 0x80848e,
  blurple: 0x5865f2, green: 0x23a55a, yellow: 0xf0b232, red: 0xf23f43, link: 0x00a8fc,
  line: 0x1f2023, divider: 0x4e5058,
  mentionBg: 0x3c4270, mentionFg: 0xc9cdfb, mentionRow: 0x444037, mentionBar: 0xf0b232,
  code: 0x2b2d31, codeInline: 0x1e1f22, spoiler: 0x1e1f22, reactMe: 0x373a53,
};

export const STATUS = {
  online: { color: T.green, label: 'Online' },
  idle: { color: T.yellow, label: 'Idle' },
  dnd: { color: T.red, label: 'Do Not Disturb' },
  offline: { color: T.faint, label: 'Offline' },
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
