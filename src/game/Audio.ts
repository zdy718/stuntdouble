// All audio is synthesised with the Web Audio API at runtime: five music loops
// (one per level), stingers and every sound effect. No sample files means no
// licensing questions and nothing to download.

import { Settings } from './Save';

type Song = (a: AudioEngine, step: number, t: number, stepDur: number) => void;

const A2 = 110;
const hz = (semi: number, base = A2): number => base * Math.pow(2, semi / 12);
const on = (pattern: string, step: number): boolean => pattern[step % pattern.length] === 'x';

// Am - F - C - G, as semitone offsets from A
const PROG = [0, -4, 3, -2];
const CHORDS: number[][] = [
  [0, 3, 7],
  [-4, 0, 3],
  [3, 7, 10],
  [-2, 2, 5],
];

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
  private settings: Settings;
  private song: Song | null = null;
  private songStep = 0;
  private nextTime = 0;
  private stepDur = 0.15;
  private timer: ReturnType<typeof setInterval> | null = null;
  private musicNodes = new Set<AudioScheduledSourceNode>();
  private jumpVariant = 0;

  constructor(settings: Settings) {
    this.settings = settings;
  }

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    // Preload: one second of white noise shared by every percussive sound.
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.apply(this.settings);
  }

  apply(s: Settings): void {
    this.settings = s;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, now, 0.02);
    this.musicBus.gain.setTargetAtTime(s.music * 0.55, now, 0.02);
    this.sfxBus.gain.setTargetAtTime(s.sfx, now, 0.02);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  dispose(): void {
    this.stopMusic();
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
  }

  // ------------------------------------------------------------------ music

  /** Starts the loop for a level from beat 0, so the pattern and music line up. */
  playMusic(levelIndex: number, bpm: number): void {
    this.stopMusic();
    if (!this.ctx) return;
    this.song = SONGS[levelIndex % SONGS.length];
    this.stepDur = 60 / bpm / 4;
    this.songStep = 0;
    this.nextTime = this.ctx.currentTime + 0.03;
    this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicBus.gain.setValueAtTime(this.settings.music * 0.55, this.ctx.currentTime);
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stopMusic(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.song = null;
    for (const n of this.musicNodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    this.musicNodes.clear();
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.song) return;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.song(this, this.songStep, this.nextTime, this.stepDur);
      this.songStep++;
      this.nextTime += this.stepDur;
    }
  }

  private track(n: AudioScheduledSourceNode, music: boolean): void {
    if (!music) return;
    this.musicNodes.add(n);
    n.onended = () => this.musicNodes.delete(n);
  }

  // ------------------------------------------------------------ instruments

  private env(t: number, peak: number, attack: number, decay: number, bus: AudioNode): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(bus);
    return g;
  }

  osc(
    t: number,
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    peak: number,
    music = true,
    attack = 0.005,
    filter?: { type: BiquadFilterType; f: number; q?: number },
  ): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this.env(t, peak, attack, dur, music ? this.musicBus : this.sfxBus);
    if (filter) {
      const bq = ctx.createBiquadFilter();
      bq.type = filter.type;
      bq.frequency.value = filter.f;
      bq.Q.value = filter.q ?? 0.8;
      o.connect(bq).connect(g);
    } else o.connect(g);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    this.track(o, music);
  }

  noiseHit(
    t: number,
    dur: number,
    peak: number,
    type: BiquadFilterType,
    f: number,
    music = true,
    q = 0.8,
    sweepTo?: number,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bq = ctx.createBiquadFilter();
    bq.type = type;
    bq.frequency.setValueAtTime(f, t);
    if (sweepTo) bq.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    bq.Q.value = q;
    const g = this.env(t, peak, 0.002, dur, music ? this.musicBus : this.sfxBus);
    src.connect(bq).connect(g);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
    this.track(src, music);
  }

  kick(t: number, v = 0.9): void {
    this.osc(t, 'sine', 160, 42, 0.28, v);
  }
  snare(t: number, v = 0.45): void {
    this.noiseHit(t, 0.14, v, 'bandpass', 1900, true, 0.7);
    this.osc(t, 'triangle', 200, 150, 0.08, v * 0.5);
  }
  hat(t: number, v = 0.16, open = false): void {
    this.noiseHit(t, open ? 0.16 : 0.035, v, 'highpass', 7500);
  }
  tom(t: number, f: number, v = 0.6): void {
    this.osc(t, 'sine', f, f * 0.55, 0.3, v);
  }
  bass(t: number, semi: number, dur: number, v = 0.32): void {
    this.osc(t, 'sawtooth', hz(semi - 12), hz(semi - 12), dur, v, true, 0.005, { type: 'lowpass', f: 520, q: 4 });
  }
  stab(t: number, semis: number[], dur: number, v = 0.11, bright = 2200): void {
    for (const s of semis) {
      this.osc(t, 'sawtooth', hz(s + 12), hz(s + 12), dur, v, true, 0.01, { type: 'lowpass', f: bright, q: 1 });
      this.osc(t, 'square', hz(s + 12) * 1.004, hz(s + 12) * 1.004, dur, v * 0.4, true, 0.01, { type: 'lowpass', f: bright * 0.7 });
    }
  }
  pad(t: number, semis: number[], dur: number, v = 0.05): void {
    for (const s of semis) {
      for (const det of [0.997, 1.003]) {
        this.osc(t, 'sawtooth', hz(s + 12) * det, hz(s + 12) * det, dur, v, true, dur * 0.4, { type: 'lowpass', f: 1100 });
      }
    }
  }

  // --------------------------------------------------------- sound effects

  private get ok(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  jump(): void {
    if (!this.ok) return;
    const t = this.ctx!.currentTime;
    const p = [1, 1.06, 0.95, 1.12][this.jumpVariant++ % 4];
    this.noiseHit(t, 0.16, 0.25, 'bandpass', 600 * p, false, 1.5, 2600 * p);
    this.osc(t, 'sine', 300 * p, 620 * p, 0.12, 0.14, false);
  }
  land(impact: number): void {
    if (!this.ok) return;
    const t = this.ctx!.currentTime;
    const v = Math.min(0.6, 0.15 + impact / 2600);
    this.osc(t, 'sine', 120, 50, 0.12, v, false);
    this.noiseHit(t, 0.06, v * 0.5, 'lowpass', 900, false);
  }
  duck(): void {
    if (!this.ok) return;
    this.noiseHit(this.ctx!.currentTime, 0.18, 0.16, 'bandpass', 2400, false, 2, 900);
  }
  closeCall(): void {
    if (!this.ok) return;
    const t = this.ctx!.currentTime;
    this.noiseHit(t, 0.12, 0.3, 'highpass', 2500, false, 1, 9000);
    this.osc(t + 0.03, 'sine', 2093, 2093, 0.2, 0.12, false);
    this.osc(t + 0.03, 'sine', 3136, 3136, 0.15, 0.05, false);
  }
  combo(mult: number): void {
    if (!this.ok) return;
    const t = this.ctx!.currentTime;
    const base = 12 + mult * 2;
    this.osc(t, 'triangle', hz(base, 440), hz(base, 440), 0.1, 0.18, false);
    this.osc(t + 0.09, 'triangle', hz(base + 5, 440), hz(base + 5, 440), 0.18, 0.18, false);
  }
  grab(perfect: boolean): void {
    if (!this.ok) return;
    const t = this.ctx!.currentTime;
    this.noiseHit(t, 0.05, 0.4, 'highpass', 3000, false);
    this.osc(t + 0.04, 'sawtooth', 190, 130, 0.14, 0.12, false, 0.01, { type: 'lowpass', f: 700, q: 6 });
    if (perfect) this.osc(t + 0.02, 'sine', 2637, 2637, 0.3, 0.16, false);
  }
  tile(): void {
    if (!this.ok) return;
    const t = this.ctx!.currentTime;
    this.noiseHit(t, 0.09, 0.14, 'bandpass', 700, false, 3);
  }
  crumble(): void {
    if (!this.ok) return;
    this.noiseHit(this.ctx!.currentTime, 0.35, 0.2, 'lowpass', 500, false);
  }
  cut(): void {
    if (!this.ok) return;
    const t = this.ctx!.currentTime;
    this.noiseHit(t, 0.12, 0.8, 'lowpass', 2500, false);
    this.osc(t, 'sine', 90, 30, 0.5, 0.8, false);
    // "stamp": a hard wooden clack 0.28 s in, timed with the CUT! slam
    this.noiseHit(t + 0.28, 0.05, 0.7, 'bandpass', 1400, false, 3);
    this.osc(t + 0.28, 'square', 220, 90, 0.08, 0.2, false);
    // sad trombone-ish stinger
    [0, -1, -2].forEach((s, i) =>
      this.osc(t + 0.05 + i * 0.12, 'sawtooth', hz(s + 7, 220), hz(s + 6.6, 220), 0.12, 0.08, false, 0.01, { type: 'lowpass', f: 1200 }),
    );
  }
  clack(): void {
    if (!this.ok) return;
    const t = this.ctx!.currentTime;
    this.noiseHit(t, 0.04, 0.8, 'bandpass', 1800, false, 4);
    this.osc(t, 'triangle', 900, 400, 0.05, 0.3, false);
  }
  star(i: number): void {
    if (!this.ok) return;
    const t = this.ctx!.currentTime;
    const f = hz(i * 4, 880);
    this.osc(t, 'sine', f, f, 0.8, 0.2, false);
    this.osc(t, 'sine', f * 2.76, f * 2.76, 0.4, 0.05, false);
  }
  fanfare(): void {
    if (!this.ok) return;
    const t = this.ctx!.currentTime;
    [0, 4, 7, 12].forEach((s, i) => {
      const f = hz(s, 261.6);
      this.osc(t + i * 0.1, 'sawtooth', f, f, i === 3 ? 0.6 : 0.12, 0.09, false, 0.01, { type: 'lowpass', f: 2400 });
      this.osc(t + i * 0.1, 'square', f / 2, f / 2, i === 3 ? 0.6 : 0.12, 0.05, false, 0.01, { type: 'lowpass', f: 1500 });
    });
  }
  menu(): void {
    if (!this.ok) return;
    this.osc(this.ctx!.currentTime, 'triangle', 660, 660, 0.06, 0.1, false);
  }
}

// ------------------------------------------------------------------ songs
// Each song is a function of the 16th-note step. 16 steps per bar, the chord
// changes every bar, and the loop repeats every 4 bars (with variations).

const funk: Song = (a, s, t, d) => {
  const bar = Math.floor(s / 16) % 4;
  const st = s % 16;
  const root = PROG[bar];
  if (on('x.....x...x.....', st)) a.kick(t);
  if (on('....x.......x...', st)) a.snare(t);
  if (on('x.xxx.xxx.xxx.x.', st)) a.hat(t, st % 4 === 2 ? 0.2 : 0.1);
  const bl: (number | null)[] = [0, null, null, 12, null, null, 0, null, 7, null, 0, 10, null, null, 12, null];
  const n = bl[st];
  if (n !== null) a.bass(t, root + n, d * 1.6);
  if (on('..x...x.....x...', st)) a.stab(t, CHORDS[bar].map((c) => c + 12), d * 0.9, 0.035, 3000);
};

const brass: Song = (a, s, t, d) => {
  const bar = Math.floor(s / 16) % 4;
  const st = s % 16;
  const lift = Math.floor(s / 64) % 2 ? 2 : 0; // rises every other loop
  const root = PROG[bar] + lift;
  if (on('x.......x.x.....', st)) a.kick(t);
  if (on('....x.......x..x', st)) a.snare(t);
  if (st % 2 === 0) a.hat(t, 0.12);
  if (st % 2 === 0) a.bass(t, root + (st % 8 === 6 ? 7 : 0), d * 1.8);
  if (on('x..x..x...x.....', st)) a.stab(t, CHORDS[bar].map((c) => c + lift + 12), d * 1.4, 0.06, 2600);
};

const train: Song = (a, s, t, d) => {
  const bar = Math.floor(s / 16) % 4;
  const st = s % 16;
  const root = PROG[bar];
  if (st % 4 === 0) a.kick(t, 0.8);
  if (on('..x...x...x...x.', st)) a.snare(t, 0.22);
  a.hat(t, st % 4 === 0 ? 0.2 : st % 2 ? 0.07 : 0.13);
  if (st % 2 === 0) a.bass(t, root + (st >= 8 && st < 12 ? 12 : 0), d * 1.5, 0.3);
  if (bar === 3 && st === 12) a.osc(t, 'square', 659, 622, 0.4, 0.04); // distant whistle
};

const tense: Song = (a, s, t, d) => {
  const bar = Math.floor(s / 16) % 4;
  const st = s % 16;
  const root = [0, 1, -2, -1][bar]; // creeping half-steps
  if (st === 0) {
    a.kick(t, 1);
    a.osc(t, 'sine', 55, 35, 0.9, 0.5);
    if (bar === 0) a.noiseHit(t, 0.8, 0.12, 'highpass', 4000);
  }
  if (on('..........x.....', st)) a.kick(t, 0.7);
  if (st === 8) a.snare(t, 0.4);
  a.bass(t, root + (st % 2 ? 12 : 0), d * 0.8, 0.18);
  if (st === 0) a.pad(t, [root, root + 3, root + 7], d * 16, 0.035);
  if (st % 4 === 2) a.hat(t, 0.06);
};

const epic: Song = (a, s, t, d) => {
  const bar = Math.floor(s / 16) % 4;
  const st = s % 16;
  const root = PROG[bar];
  if (st % 4 === 0) a.kick(t, 0.95);
  if (on('x..x..x.x..x.x.x', st)) a.tom(t, st % 3 ? 140 : 95, 0.45);
  if (on('....x.......x...', st)) a.snare(t, 0.5);
  if (bar === 3 && st >= 12) a.snare(t, 0.3);
  if (st % 2 === 0) a.bass(t, root, d * 1.8, 0.3);
  if (on('x.....x...x.....', st)) a.stab(t, CHORDS[bar].map((c) => c + 12), d * 2.5, 0.06, 2000);
  if (st === 0) a.pad(t, CHORDS[bar], d * 16, 0.03);
};

const SONGS: Song[] = [funk, brass, train, tense, epic];
