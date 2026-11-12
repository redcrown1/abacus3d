import { spawn } from 'node:child_process';

// Audio needs the optional npm packages (voice protocol, Opus, end-to-end encryption) and FFmpeg.
export const FRAME = 3840; // 20 ms of 48 kHz stereo 16-bit PCM

const PLAY_ARGS = ['-nodisp', '-loglevel', 'quiet', '-fflags', 'nobuffer', '-flags', 'low_delay',
  '-probesize', '32', '-analyzeduration', '0', '-f', 's16le', '-ar', '48000', '-ch_layout', 'stereo', '-i', 'pipe:0'];
const ENCODE_ARGS = ['-ac', '2', '-ar', '48000', '-c:a', 'libopus', '-b:a', '64k', '-application', 'voip',
  '-frame_duration', '20', '-f', 'ogg', 'pipe:1'];

export async function loadVoice() {
  try {
    const [voice, prism] = await Promise.all([import('@discordjs/voice'), import('prism-media')]);
    return { voice, prism: prism.default ?? prism };
  } catch {
    return null;
  }
}

export function mixFrames(frames) {
  if (frames.length === 1) return frames[0];
  const out = Buffer.alloc(FRAME);
  for (let i = 0; i < FRAME; i += 2) {
    let sum = 0;
    for (const f of frames) sum += f.readInt16LE(i);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, sum)), i);
  }
  return out;
}

// FFmpeg input arguments for the microphone, or null when a device name is required.
export function micInput(platform = process.platform, device = process.env.TERMCORD_MIC) {
  if (platform === 'darwin') return ['-f', 'avfoundation', '-i', `:${device || 'default'}`];
  if (platform === 'win32') return device ? ['-f', 'dshow', '-i', `audio=${device}`] : null;
  return ['-f', 'pulse', '-i', device || 'default'];
}

// One live voice connection: plays everyone else through ffplay and sends the microphone through ffmpeg.
export class VoiceSession {
  constructor(lib, { guildId, channelId, adapterCreator, onState, onSpeaking, onError, onMicFailed }) {
    const { voice } = lib;
    Object.assign(this, { lib, channelId, onError, onMicFailed, muted: true, deafened: false });
    this.queues = new Map(); // userId -> decoded frames waiting to be played
    this.t0 = performance.now();
    this.sent = 0;
    this.conn = voice.joinVoiceChannel({ guildId, channelId, selfMute: true, selfDeaf: false, adapterCreator });
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
      if (frames.length && !this.deafened) this.play(mixFrames(frames));
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

  startMic() {
    const { voice } = this.lib;
    const input = micInput();
    const fail = (message) => {
      if (this.closed || this.mic !== mic) return;
      this.muted = true;
      this.stopMic();
      this.signal();
      this.onMicFailed();
      this.onError(message);
    };
    if (!input) {
      this.muted = true;
      this.signal();
      this.onMicFailed();
      return this.onError('set TERMCORD_MIC to your microphone name (ffmpeg -list_devices true -f dshow -i dummy)');
    }
    const mic = (this.mic = spawn('ffmpeg', ['-loglevel', 'quiet', ...input, ...ENCODE_ARGS], { stdio: ['ignore', 'pipe', 'ignore'] }));
    mic.on('error', () => fail('cannot capture the microphone: install FFmpeg'));
    mic.on('exit', () => fail('microphone capture stopped; set TERMCORD_MIC to your input device'));
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
    this.player?.stop(true);
    mic?.kill();
  }

  destroy() {
    this.closed = true;
    clearInterval(this.timer);
    this.stopMic();
    this.out?.kill();
    try {
      this.conn.destroy();
    } catch {
      // already destroyed by the library
    }
  }
}
