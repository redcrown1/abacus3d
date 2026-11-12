import { spawn, execFile } from 'node:child_process';

// Audio needs the optional npm packages (voice protocol, Opus, end-to-end encryption) and FFmpeg.
export const FRAME = 3840; // 20 ms of 48 kHz stereo 16-bit PCM

const PLAY_ARGS = ['-nodisp', '-loglevel', 'quiet', '-fflags', 'nobuffer', '-flags', 'low_delay',
  '-probesize', '32', '-analyzeduration', '0', '-f', 's16le', '-ar', '48000', '-ch_layout', 'stereo', '-i', 'pipe:0'];
const ENCODE_ARGS = ['-ac', '2', '-ar', '48000', '-c:a', 'libopus', '-b:a', '64k', '-application', 'voip',
  '-frame_duration', '20', '-f', 'ogg', 'pipe:1'];
const DEFAULT_AUDIO = { mic: '', micVolume: 100, outVolume: 100 };

export async function loadVoice() {
  try {
    const [voice, prism] = await Promise.all([import('@discordjs/voice'), import('prism-media')]);
    return { voice, prism: prism.default ?? prism };
  } catch {
    return null;
  }
}

export function mixFrames(frames, gain = 1) {
  if (frames.length === 1 && gain === 1) return frames[0];
  const out = Buffer.alloc(FRAME);
  for (let i = 0; i < FRAME; i += 2) {
    let sum = 0;
    for (const f of frames) sum += f.readInt16LE(i);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sum * gain))), i);
  }
  return out;
}

// FFmpeg input arguments for the microphone, or null when a device name is required.
export function micInput(platform = process.platform, device = process.env.TERMCORD_MIC) {
  if (platform === 'darwin') return ['-f', 'avfoundation', '-i', `:${device || 'default'}`];
  if (platform === 'win32') return device ? ['-f', 'dshow', '-i', `audio=${device}`] : null;
  return ['-f', 'pulse', '-i', device || 'default'];
}

// Full FFmpeg arguments that capture the microphone as Ogg Opus on stdout.
export function micArgs(input, volume = 100) {
  return ['-loglevel', 'quiet', ...input, ...(volume === 100 ? [] : ['-af', `volume=${volume / 100}`]), ...ENCODE_ARGS];
}

// ----- input device discovery -----

const monitorsLast = (list) => list.sort((a, b) => a.id.endsWith('.monitor') - b.id.endsWith('.monitor'));

// `pactl -f json list sources`
export function parsePulseJson(text) {
  try {
    return monitorsLast(JSON.parse(text).filter((s) => s?.name).map((s) => ({ id: s.name, label: s.description || s.name })));
  } catch {
    return [];
  }
}

// `ffmpeg -sources pulse`
export function parseSources(text) {
  const list = [];
  for (const line of text.split('\n')) {
    const m = /^\s*\*?\s*(\S+)\s+\[(.+)\]\s*$/.exec(line);
    if (m) list.push({ id: m[1], label: m[2] });
  }
  return monitorsLast(list);
}

// `ffmpeg -f avfoundation -list_devices true -i ""`
export function parseAvfoundation(text) {
  const list = [];
  let audio = false;
  for (const line of text.split('\n')) {
    if (/AVFoundation (audio|video) devices/.test(line)) audio = line.includes('audio devices');
    const m = audio && /\]\s+\[\d+\]\s+(.+?)\s*$/.exec(line);
    if (m) list.push({ id: m[1], label: m[1] });
  }
  return list;
}

// `ffmpeg -list_devices true -f dshow -i dummy`, in both the current and the older sectioned format
export function parseDshow(text) {
  const list = [];
  let audioSection = false;
  for (const line of text.split('\n')) {
    if (/DirectShow (audio|video) devices/.test(line)) audioSection = line.includes('audio devices');
    if (/Alternative name/.test(line)) continue;
    const m = /"(.+)"\s*(\((audio|video|none)\))?\s*$/.exec(line);
    if (m && (m[3] === 'audio' || (!m[2] && audioSection))) list.push({ id: m[1], label: m[1] });
  }
  return list;
}

// Resolves with whatever the command printed; listing commands exit non-zero by design.
function capture(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000, windowsHide: true }, (_err, stdout, stderr) => resolve(`${stdout ?? ''}\n${stderr ?? ''}`));
  });
}

export async function listMics(platform = process.platform) {
  if (platform === 'darwin') return parseAvfoundation(await capture('ffmpeg', ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', '']));
  if (platform === 'win32') return parseDshow(await capture('ffmpeg', ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']));
  const viaPactl = parsePulseJson((await capture('pactl', ['-f', 'json', 'list', 'sources'])).trim());
  return viaPactl.length ? viaPactl : parseSources(await capture('ffmpeg', ['-hide_banner', '-sources', 'pulse']));
}

// One live voice connection: plays everyone else through ffplay and sends the microphone through ffmpeg.
export class VoiceSession {
  constructor(lib, { guildId, channelId, adapterCreator, onState, onSpeaking, onError, onMicFailed, muted = true, getAudio = () => DEFAULT_AUDIO }) {
    const { voice } = lib;
    Object.assign(this, { lib, channelId, onError, onMicFailed, getAudio, muted, deafened: false });
    this.queues = new Map(); // userId -> decoded frames waiting to be played
    this.t0 = performance.now();
    this.sent = 0;
    this.conn = voice.joinVoiceChannel({ guildId, channelId, selfMute: muted, selfDeaf: false, adapterCreator });
    this.conn.on('stateChange', (_, state) => onState(state.status));
    this.conn.on('error', (err) => onError(err.message));
    const { speaking } = this.conn.receiver;
    speaking.on('start', (userId) => {
      this.listen(userId);
      onSpeaking(userId, true);
    });
    speaking.on('end', (userId) => onSpeaking(userId, false));
    this.timer = setInterval(() => this.tick(), 20);
    voice.entersState(this.conn, voice.VoiceConnectionStatus.Ready, 20000).catch(() => {
      if (!this.closed) onError('could not connect; check the bot has the Connect permission');
    });
    if (!muted) this.startMic();
  }

  listen(userId) {
    if (this.queues.has(userId)) return;
    const { voice, prism } = this.lib;
    const queue = [];
    this.queues.set(userId, queue);
    const stream = this.conn.receiver.subscribe(userId, { end: { behavior: voice.EndBehaviorType.Manual } });
    const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
    const drop = () => {
      if (this.queues.get(userId) === queue) this.queues.delete(userId);
      stream.destroy();
    };
    decoder.on('data', (pcm) => {
      if (pcm.length !== FRAME) return;
      queue.push(pcm);
      if (queue.length > 10) queue.shift(); // bound latency to 200 ms
    });
    decoder.on('error', drop);
    stream.on('error', drop);
    stream.on('close', drop);
    stream.pipe(decoder);
  }

  // Emits one mixed frame per 20 ms of wall-clock time, so timer jitter does not build up delay.
  tick() {
    const due = Math.floor((performance.now() - this.t0) / 20);
    if (due - this.sent > 5) this.sent = due - 1;
    for (; this.sent < due; this.sent++) {
      const frames = [];
      for (const queue of this.queues.values()) if (queue.length) frames.push(queue.shift());
      if (frames.length && !this.deafened) this.play(mixFrames(frames, this.getAudio().outVolume / 100));
    }
  }

  play(pcm) {
    if (this.outFailed) return;
    if (!this.out) {
      const out = (this.out = spawn('ffplay', PLAY_ARGS, { stdio: ['pipe', 'ignore', 'ignore'] }));
      const started = Date.now();
      const fail = (message) => {
        if (this.out === out) this.out = null;
        if (this.closed || this.outFailed || Date.now() - started > 3000) return;
        this.outFailed = true;
        this.onError(message);
      };
      out.on('error', () => fail('cannot play audio: install FFmpeg (ffplay)'));
      out.on('exit', () => fail('audio playback failed to start'));
      out.stdin.on('error', () => {});
    }
    if (this.out.stdin.writable && this.out.stdin.writableLength < FRAME * 25) this.out.stdin.write(pcm);
  }

  signal() {
    this.conn.rejoin({ channelId: this.channelId, selfMute: this.muted, selfDeaf: this.deafened });
  }

  move(channelId) {
    this.channelId = channelId;
    this.signal();
  }

  setFlags(muted, deafened) {
    const micChanged = muted !== this.muted;
    Object.assign(this, { muted, deafened });
    this.signal();
    if (micChanged && muted) this.stopMic();
    else if (micChanged) this.startMic();
  }

  // A changed microphone or input volume takes effect by restarting the capture.
  audioChanged(key) {
    if (key !== 'mic' && key !== 'micVolume') return;
    clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      if (this.closed || this.muted) return;
      this.stopMic();
      this.startMic();
    }, 400);
  }

  micFailed(message) {
    this.muted = true;
    this.stopMic();
    this.signal();
    this.onMicFailed();
    this.onError(message);
  }

  async startMic() {
    const { voice } = this.lib;
    const attempt = (this.micAttempt = {});
    const { mic: chosen, micVolume } = this.getAudio();
    let device = chosen || process.env.TERMCORD_MIC || '';
    // Windows has no "default" capture device name, so fall back to the first one found
    if (!device && process.platform === 'win32') device = (await listMics())[0]?.id ?? '';
    if (this.closed || this.muted || this.micAttempt !== attempt) return;
    const input = micInput(process.platform, device);
    if (!input) return this.micFailed('no microphone found; choose one in Settings (F2)');
    const mic = (this.mic = spawn('ffmpeg', micArgs(input, micVolume), { stdio: ['ignore', 'pipe', 'ignore'] }));
    const fail = (message) => {
      if (!this.closed && this.mic === mic) this.micFailed(message);
    };
    mic.on('error', () => fail('cannot capture the microphone: install FFmpeg'));
    mic.on('exit', () => fail('microphone capture stopped; choose another device in Settings (F2)'));
    if (!this.player) {
      this.player = voice.createAudioPlayer({ behaviors: { noSubscriber: voice.NoSubscriberBehavior.Play } });
      this.player.on('error', (err) => this.onError(err.message));
      this.conn.subscribe(this.player);
    }
    this.player.play(voice.createAudioResource(mic.stdout, { inputType: voice.StreamType.OggOpus }));
  }

  stopMic() {
    const mic = this.mic;
    this.mic = null;
    this.micAttempt = null;
    this.player?.stop(true);
    mic?.kill();
  }

  destroy() {
    this.closed = true;
    clearInterval(this.timer);
    clearTimeout(this.restartTimer);
    this.stopMic();
    this.out?.kill();
    try {
      this.conn.destroy();
    } catch {
      // already destroyed by the library
    }
  }
}
