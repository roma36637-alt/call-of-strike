/* Procedural Web Audio sound engine — no external assets */

type ShotKind = 'pistol' | 'ar' | 'smg' | 'shotgun' | 'sniper' | 'lmg';

class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfx: GainNode | null = null;
  noiseBuf: AudioBuffer | null = null;
  muted = false;
  ambientStarted = false;
  listenerX = 0;
  listenerY = 0;
  lastShotT: Record<string, number> = {};

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 20;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 1;
    this.sfx.connect(this.master);
    // noise buffer (2s)
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    try {
      const m = localStorage.getItem('cos_muted');
      if (m === '1') this.setMuted(true);
    } catch {
      /* ignore */
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
    try {
      localStorage.setItem('cos_muted', m ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  setListener(x: number, y: number) {
    this.listenerX = x;
    this.listenerY = y;
  }

  /** Returns gain/pan node pair for positional audio */
  private spatial(x?: number, y?: number, maxDist = 1400): { out: AudioNode; vol: number } | null {
    if (!this.ctx || !this.sfx) return null;
    let vol = 1;
    let pan = 0;
    if (x !== undefined && y !== undefined) {
      const dx = x - this.listenerX;
      const dy = y - this.listenerY;
      const d = Math.hypot(dx, dy);
      if (d > maxDist) return null;
      vol = Math.pow(1 - d / maxDist, 1.6);
      pan = Math.max(-0.8, Math.min(0.8, dx / 700));
    }
    const g = this.ctx.createGain();
    g.gain.value = vol;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.sfx);
    } else {
      g.connect(this.sfx);
    }
    return { out: g, vol };
  }

  private noise(out: AudioNode, dur: number, vol: number, filterType: BiquadFilterType, freq: number, freqEnd?: number, q = 1) {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private tone(
    out: AudioNode,
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    delay = 0,
  ) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  shot(kind: ShotKind, x?: number, y?: number) {
    if (!this.ctx) return;
    // rate-limit identical distant shots slightly to avoid overload
    const now = this.ctx.currentTime;
    const key = kind + (x === undefined ? 'p' : 'w');
    if (this.lastShotT[key] && now - this.lastShotT[key] < 0.02) return;
    this.lastShotT[key] = now;
    const s = this.spatial(x, y);
    if (!s) return;
    const o = s.out;
    switch (kind) {
      case 'pistol':
        this.noise(o, 0.12, 0.7, 'bandpass', 1800, 400, 0.8);
        this.tone(o, 'triangle', 220, 60, 0.1, 0.5);
        break;
      case 'ar':
        this.noise(o, 0.16, 0.8, 'lowpass', 3500, 500);
        this.tone(o, 'square', 160, 50, 0.09, 0.35);
        this.tone(o, 'sine', 90, 40, 0.14, 0.6);
        break;
      case 'smg':
        this.noise(o, 0.1, 0.6, 'bandpass', 2600, 700, 0.7);
        this.tone(o, 'triangle', 300, 80, 0.07, 0.4);
        break;
      case 'shotgun':
        this.noise(o, 0.42, 1.2, 'lowpass', 2200, 150);
        this.tone(o, 'sine', 120, 30, 0.35, 0.9);
        this.tone(o, 'sawtooth', 80, 25, 0.25, 0.3);
        break;
      case 'sniper':
        this.noise(o, 0.5, 1.1, 'lowpass', 6000, 200);
        this.noise(o, 0.7, 0.5, 'highpass', 1200, 300);
        this.tone(o, 'sine', 140, 35, 0.5, 0.8);
        break;
      case 'lmg':
        this.noise(o, 0.2, 0.9, 'lowpass', 2800, 300);
        this.tone(o, 'square', 120, 40, 0.12, 0.45);
        this.tone(o, 'sine', 70, 30, 0.18, 0.7);
        break;
    }
  }

  empty() {
    const s = this.spatial();
    if (!s) return;
    this.tone(s.out, 'square', 1200, 800, 0.03, 0.15);
  }

  reload(x?: number, y?: number) {
    const s = this.spatial(x, y, 500);
    if (!s || !this.ctx) return;
    this.noise(s.out, 0.05, 0.4, 'highpass', 3000);
    this.tone(s.out, 'square', 900, 500, 0.04, 0.2);
    setTimeout(() => {
      const s2 = this.spatial(x, y, 500);
      if (!s2) return;
      this.noise(s2.out, 0.06, 0.5, 'bandpass', 2000, 1500, 2);
      this.tone(s2.out, 'square', 700, 400, 0.05, 0.25);
    }, 380);
  }

  hit() {
    const s = this.spatial();
    if (!s) return;
    this.tone(s.out, 'square', 1500, 1200, 0.05, 0.22);
    this.tone(s.out, 'sine', 2400, 1800, 0.04, 0.15);
  }

  killConfirm() {
    const s = this.spatial();
    if (!s) return;
    this.tone(s.out, 'square', 900, 1400, 0.08, 0.25);
    this.tone(s.out, 'sine', 1800, 2600, 0.12, 0.2, 0.05);
  }

  hurt() {
    const s = this.spatial();
    if (!s) return;
    this.noise(s.out, 0.18, 0.5, 'lowpass', 900, 200);
    this.tone(s.out, 'sine', 200, 80, 0.2, 0.4);
  }

  death(x?: number, y?: number) {
    const s = this.spatial(x, y, 900);
    if (!s) return;
    this.tone(s.out, 'sawtooth', 180, 60, 0.35, 0.3);
    this.noise(s.out, 0.3, 0.4, 'lowpass', 700, 150);
  }

  impactWall(x: number, y: number) {
    const s = this.spatial(x, y, 600);
    if (!s) return;
    this.noise(s.out, 0.05, 0.35, 'highpass', 2500);
    this.tone(s.out, 'triangle', 500 + Math.random() * 400, 200, 0.04, 0.15);
  }

  impactFlesh(x: number, y: number) {
    const s = this.spatial(x, y, 700);
    if (!s) return;
    this.noise(s.out, 0.09, 0.5, 'lowpass', 800, 200);
    this.tone(s.out, 'sine', 150, 60, 0.08, 0.35);
  }

  explosion(x: number, y: number) {
    const s = this.spatial(x, y, 2200);
    if (!s || !this.ctx) return;
    this.noise(s.out, 1.2, 1.6, 'lowpass', 2500, 60);
    this.noise(s.out, 0.5, 0.8, 'bandpass', 500, 100, 0.5);
    this.tone(s.out, 'sine', 90, 20, 0.9, 1.2);
    this.tone(s.out, 'sawtooth', 60, 15, 0.6, 0.35);
  }

  grenadeBounce(x: number, y: number) {
    const s = this.spatial(x, y, 700);
    if (!s) return;
    this.tone(s.out, 'triangle', 900, 300, 0.06, 0.25);
    this.noise(s.out, 0.04, 0.2, 'highpass', 3000);
  }

  pinPull() {
    const s = this.spatial();
    if (!s) return;
    this.tone(s.out, 'square', 1400, 1000, 0.05, 0.15);
    this.tone(s.out, 'triangle', 700, 900, 0.06, 0.15, 0.06);
  }

  pickup(type: 'health' | 'ammo') {
    const s = this.spatial();
    if (!s) return;
    if (type === 'health') {
      this.tone(s.out, 'sine', 600, 900, 0.12, 0.3);
      this.tone(s.out, 'sine', 900, 1300, 0.15, 0.3, 0.1);
    } else {
      this.noise(s.out, 0.08, 0.5, 'bandpass', 2500, 1500, 3);
      this.tone(s.out, 'square', 500, 700, 0.08, 0.2, 0.05);
    }
  }

  swap() {
    const s = this.spatial();
    if (!s) return;
    this.noise(s.out, 0.06, 0.5, 'bandpass', 1800, 900, 2);
    this.tone(s.out, 'square', 400, 600, 0.05, 0.15, 0.04);
  }

  streak() {
    const s = this.spatial();
    if (!s) return;
    this.tone(s.out, 'square', 523, 523, 0.12, 0.2);
    this.tone(s.out, 'square', 659, 659, 0.12, 0.2, 0.12);
    this.tone(s.out, 'square', 784, 784, 0.25, 0.25, 0.24);
    this.tone(s.out, 'sine', 1046, 1046, 0.35, 0.2, 0.36);
  }

  jetFlyby() {
    const s = this.spatial();
    if (!s || !this.ctx) return;
    this.noise(s.out, 2.2, 0.9, 'bandpass', 300, 1800, 1.2);
    this.tone(s.out, 'sawtooth', 120, 260, 2.0, 0.15);
  }

  bombWhistle() {
    const s = this.spatial();
    if (!s) return;
    this.tone(s.out, 'sine', 1800, 500, 1.1, 0.18);
  }

  ui() {
    const s = this.spatial();
    if (!s) return;
    this.tone(s.out, 'square', 800, 1100, 0.05, 0.12);
  }

  uiBack() {
    const s = this.spatial();
    if (!s) return;
    this.tone(s.out, 'square', 700, 400, 0.07, 0.12);
  }

  countdown(final = false) {
    const s = this.spatial();
    if (!s) return;
    this.tone(s.out, 'sine', final ? 1100 : 700, final ? 1100 : 700, final ? 0.4 : 0.12, 0.3);
  }

  respawn() {
    const s = this.spatial();
    if (!s) return;
    this.tone(s.out, 'sine', 300, 700, 0.3, 0.2);
    this.noise(s.out, 0.3, 0.3, 'highpass', 1500, 4000);
  }

  victory(won: boolean) {
    const s = this.spatial();
    if (!s) return;
    if (won) {
      [523, 659, 784, 1046].forEach((f, i) => this.tone(s.out, 'square', f, f, 0.35, 0.2, i * 0.15));
      this.tone(s.out, 'sine', 1318, 1318, 0.8, 0.2, 0.6);
    } else {
      [440, 415, 392, 349].forEach((f, i) => this.tone(s.out, 'sawtooth', f, f * 0.98, 0.4, 0.15, i * 0.25));
    }
  }

  startAmbient() {
    if (!this.ctx || !this.noiseBuf || this.ambientStarted || !this.master) return;
    this.ambientStarted = true;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 220;
    const g = this.ctx.createGain();
    g.gain.value = 0.07;
    // slow wind LFO
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lg = this.ctx.createGain();
    lg.gain.value = 0.035;
    lfo.connect(lg);
    lg.connect(g.gain);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
    lfo.start();
    // low drone
    const d = this.ctx.createOscillator();
    d.type = 'sine';
    d.frequency.value = 48;
    const dg = this.ctx.createGain();
    dg.gain.value = 0.025;
    d.connect(dg);
    dg.connect(this.master);
    d.start();
  }
}

export const audio = new AudioEngine();
