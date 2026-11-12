import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

export const DEFAULTS = {
  mic: '', // device id, empty for the system default
  micVolume: 100,
  outVolume: 100,
  joinMuted: true,
  images: true,
  avatars: true,
  members: true,
  theme: 'dark',
  animations: true,
  toasts: true,
  bell: false,
};

export function settingsPath(env = process.env, platform = process.platform) {
  if (env.TERMCORD_CONFIG) return env.TERMCORD_CONFIG;
  const base = platform === 'win32' && env.APPDATA ? env.APPDATA : env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'termcord', 'settings.json');
}

function clean(key, value) {
  const def = DEFAULTS[key];
  if (typeof def === 'number') return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(200, Math.round(value))) : def;
  return typeof value === typeof def ? value : def;
}

// User preferences, kept in memory when no path is given.
export class Settings {
  constructor(path = null) {
    this.path = path;
    this.values = { ...DEFAULTS };
    if (!path) return;
    try {
      const saved = JSON.parse(readFileSync(path, 'utf8'));
      for (const key of Object.keys(DEFAULTS)) if (key in saved) this.values[key] = clean(key, saved[key]);
    } catch {
      // missing or unreadable file: keep the defaults
    }
  }

  // Returns false when the value could not be written to disk.
  set(key, value) {
    this.values[key] = clean(key, value);
    if (!this.path) return true;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, `${JSON.stringify(this.values, null, 2)}\n`);
      return true;
    } catch {
      return false;
    }
  }
}
