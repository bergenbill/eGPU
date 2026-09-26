// Adaptive, generative Japanese-flavoured score. Like the Goose game's reactive piano, the music
// follows what you're doing: silence when idle, soft plucks while sneaking, playful koto while
// roaming, and taiko + shamisen when the whole town is chasing you.
import { mtof } from './audio.js';

const YO = [0, 2, 5, 7, 9]; // bright folk scale
const IN = [0, 1, 5, 7, 8]; // tense miyako-bushi scale
const ROOT = 62; // D4

function scaleNote(scale, deg, root = ROOT) {
  const oct = Math.floor(deg / 5);
  const i = ((deg % 5) + 5) % 5;
  return root + oct * 12 + scale[i];
}

// Karplus-Strong plucked string rendered into an AudioBuffer.
function pluckBuffer(ctx, freq, dur, decay, bright) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  const N = Math.max(2, Math.round(sr / freq));
  const ring = new Float32Array(N);
  for (let i = 0; i < N; i++) ring[i] = (Math.random() * 2 - 1) * (1 - bright * 0.5 + Math.random() * bright * 0.5);
  let idx = 0;
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const cur = ring[idx];
    const nxt = ring[(idx + 1) % N];
    const v = decay * (bright * cur + (1 - bright) * 0.5 * (cur + nxt));
    ring[idx] = v;
    out[i] = cur * 0.6 + prev * 0.1;
    prev = cur;
    idx = (idx + 1) % N;
  }
  // fade tail
  const f = Math.min(len, Math.floor(sr * 0.05));
  for (let i = 0; i < f; i++) out[len - 1 - i] *= i / f;
  return buf;
}

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.ready = false;
    this.state = 'idle';
    this.level = { explore: 0, sneak: 0, chase: 0, idle: 1 };
    this.target = { explore: 0, sneak: 0, chase: 0, idle: 1 };
    this.step16 = 0;
    this.nextT = 0;
    this.bpm = 92;
    this.motif = null;
    this.motifI = 0;
    this.bar = 0;
    this.activity = 0;
    this.muted = false;
    this.ambKind = null;
    this.ambNodes = [];
    this.ambT = 0;
    this.lastStepPluck = 0;
  }

  init() {
    const a = this.audio;
    if (!a.ready || this.ready) return;
    const ctx = a.ctx;
    this.ctx = ctx;
    this.koto = new Map();
    this.sham = new Map();
    for (let m = 45; m <= 90; m++) {
      const inYo = YO.includes(((m - ROOT) % 12 + 12) % 12);
      const inIn = IN.includes(((m - ROOT) % 12 + 12) % 12);
      if (!inYo && !inIn) continue;
      this.koto.set(m, pluckBuffer(ctx, mtof(m), 2.0, 0.996, 0.35));
      if (m <= 78) this.sham.set(m, pluckBuffer(ctx, mtof(m), 0.9, 0.991, 0.75));
    }
    this.layers = {};
    for (const k of ['explore', 'sneak', 'chase', 'idle']) {
      const gn = ctx.createGain();
      gn.gain.value = 0;
      gn.connect(a.musicBus);
      this.layers[k] = gn;
    }
    // a little reverb-ish echo for the koto
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = 0.33;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    this.echo.connect(lp);
    lp.connect(fb);
    fb.connect(this.echo);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    lp.connect(wet);
    wet.connect(a.musicBus);
    this.nextT = ctx.currentTime + 0.1;
    this.ready = true;
    this.newMotif();
  }

  newMotif() {
    const len = 8;
    const m = [];
    let deg = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < len; i++) {
      const rest = Math.random() < 0.28 && i % 2 === 1;
      deg += [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
      deg = Math.max(2, Math.min(11, deg));
      m.push(rest ? null : deg);
    }
    this.motif = m;
  }

  play(buf, when, gain, dest, rate = 1) {
    if (!buf) return;
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    s.connect(g);
    g.connect(dest);
    if (dest !== this.layers.chase) g.connect(this.echo);
    s.start(when);
  }

  pluck(bank, midi, when, gain, dest) {
    let m = midi;
    let buf = bank.get(m);
    let rate = 1;
    if (!buf) {
      // nearest available, repitched
      let best = null;
      let bd = 99;
      for (const k of bank.keys()) {
        if (Math.abs(k - m) < bd) {
          bd = Math.abs(k - m);
          best = k;
        }
      }
      buf = bank.get(best);
      rate = Math.pow(2, (m - best) / 12);
    }
    this.play(buf, when, gain, dest, rate);
  }

  drum(when, gain, kind = 'taiko') {
    const ctx = this.ctx;
    const dest = this.layers.chase;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    if (kind === 'taiko') {
      o.frequency.setValueAtTime(110, when);
      o.frequency.exponentialRampToValueAtTime(48, when + 0.35);
      g.gain.setValueAtTime(gain, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.5);
    } else {
      o.frequency.setValueAtTime(950, when);
      o.frequency.exponentialRampToValueAtTime(700, when + 0.05);
      g.gain.setValueAtTime(gain * 0.5, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
    }
    o.connect(g);
    g.connect(dest);
    o.start(when);
    o.stop(when + 0.6);
  }

  flute(midi, when, dur, gain) {
    const ctx = this.ctx;
    const dest = this.layers.idle;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(mtof(midi) * 0.97, when);
    o.frequency.linearRampToValueAtTime(mtof(midi), when + 0.15);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, when);
    vg.gain.linearRampToValueAtTime(mtof(midi) * 0.012, when + dur * 0.6);
    vib.connect(vg);
    vg.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.25);
    g.gain.setValueAtTime(gain, when + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    g.connect(dest);
    g.connect(this.echo);
    // breath
    const a = this.audio;
    a.noise(g, when, dur * 0.4, 'bandpass', 1800, 1500, 1, 0.08, 0.1);
    o.start(when);
    vib.start(when);
    o.stop(when + dur + 0.1);
    vib.stop(when + dur + 0.1);
  }

  // Game tells the music what's going on.
  setMood(m) {
    this.mood = m;
    const t = { explore: 0, sneak: 0, chase: 0, idle: 0 };
    if (m.chase) t.chase = Math.min(1, 0.75 + m.chase * 0.1);
    else if (m.sneak) t.sneak = 1;
    else if (m.active) t.explore = 1;
    else t.idle = 1;
    if (m.chase) t.explore = 0.35;
    this.target = t;
    this.scale = m.chase || m.sneak || m.tense ? IN : YO;
  }

  step(sneaking) {
    if (!this.ready || !sneaking) return;
    const now = this.ctx.currentTime;
    if (now - this.lastStepPluck < 0.25) return;
    this.lastStepPluck = now;
    const deg = [0, 2, 1, 3, 2, 4, 3, 1][this.sneakI = ((this.sneakI || 0) + 1) % 8];
    this.pluck(this.koto, scaleNote(IN, deg, ROOT - 12), now + 0.01, 0.25, this.layers.sneak);
  }

  stinger(kind) {
    if (!this.ready) return;
    const now = this.ctx.currentTime + 0.02;
    const bus = this.audio.musicBus;
    if (kind === 'task') {
      [0, 2, 4, 5, 7].forEach((d, i) => this.pluck(this.koto, scaleNote(YO, d + 3), now + i * 0.08, 0.5, bus));
    } else if (kind === 'caught') {
      [4, 3, 1, 0].forEach((d, i) => this.pluck(this.sham, scaleNote(IN, d, ROOT - 12), now + i * 0.18, 0.5, bus));
    } else if (kind === 'escape') {
      [0, 2, 4].forEach((d, i) => this.pluck(this.sham, scaleNote(YO, d + 3), now + i * 0.06, 0.4, bus));
    }
  }

  update(dt) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    for (const k of Object.keys(this.layers)) {
      const cur = this.level[k];
      const tgt = this.target[k];
      const rate = tgt > cur ? 1.2 : 0.35;
      this.level[k] = cur + Math.sign(tgt - cur) * Math.min(Math.abs(tgt - cur), dt * rate);
      this.layers[k].gain.setTargetAtTime(this.level[k] * (k === 'chase' ? 0.9 : 0.8), now, 0.05);
    }
    const chase = this.level.chase > 0.3;
    this.bpm += ((chase ? 138 : 92) - this.bpm) * Math.min(1, dt * 0.8);
    const s16 = 60 / this.bpm / 4;
    if (this.nextT < now - 0.5) this.nextT = now + 0.05;
    while (this.nextT < now + 0.12) {
      this.schedule(this.nextT);
      this.nextT += s16;
      this.step16 = (this.step16 + 1) % 16;
      if (this.step16 === 0) {
        this.bar++;
        if (this.bar % 4 === 0) this.newMotif();
      }
    }
  }

  schedule(t) {
    const s = this.step16;
    const sc = this.scale || YO;
    // explore: koto motif on 8ths + bass on beats
    if (this.level.explore > 0.02) {
      if (s % 2 === 0) {
        const deg = this.motif[(s / 2 + (this.bar % 2) * 0) % this.motif.length];
        if (deg !== null && Math.random() < 0.85) {
          const v = this.bar % 4 === 3 && s > 8 ? deg + 1 : deg;
          this.pluck(this.koto, scaleNote(sc, v), t, 0.32, this.layers.explore);
          if (Math.random() < 0.15) this.pluck(this.koto, scaleNote(sc, v + 2), t + 0.02, 0.18, this.layers.explore);
        }
      }
      if (s === 0 || s === 8) this.pluck(this.koto, scaleNote(sc, s === 0 ? 0 : [3, 2, 4, 1][this.bar % 4], ROOT - 12), t, 0.3, this.layers.explore);
    }
    // chase: taiko + fast shamisen
    if (this.level.chase > 0.02) {
      if (s % 4 === 0) this.drum(t, 0.9);
      if (s === 6 || s === 14) this.drum(t, 0.6);
      if (s % 2 === 1) this.drum(t, 0.25, 'block');
      const pattern = [0, 2, 4, 2, 5, 4, 2, 1];
      const deg = pattern[(s + (this.bar % 2) * 3) % 8] + (this.bar % 4 === 2 ? 1 : 0) + 3;
      this.pluck(this.sham, scaleNote(IN, deg, ROOT - 12), t, 0.3, this.layers.chase);
    }
    // idle: occasional shakuhachi phrase
    if (this.level.idle > 0.3 && s === 0 && this.bar % 3 === 0 && Math.random() < 0.5) {
      const d0 = 4 + Math.floor(Math.random() * 3);
      this.flute(scaleNote(YO, d0), t, 1.6, 0.06);
      if (Math.random() < 0.6) this.flute(scaleNote(YO, d0 - 1), t + 1.7, 2.2, 0.05);
    }
  }

  // --------------------------------------------------------------- ambience
  setAmbience(kind) {
    this.ambKind = kind;
  }

  updateAmbience(dt, evening) {
    const a = this.audio;
    if (!a.ready) return;
    this.ambT -= dt;
    if (this.ambT > 0) return;
    const ctx = a.ctx;
    const t = ctx.currentTime + 0.01;
    const bus = a.ambBus;
    const k = this.ambKind;
    if (evening > 0.5 && Math.random() < 0.15) {
      // crows heading home ("kaa kaa")
      for (let i = 0; i < 2; i++) {
        a.osc(bus, 'sawtooth', 520, 380, t + i * 0.45, 0.3, 0.02, 0.03);
      }
      this.ambT = 4 + Math.random() * 6;
      return;
    }
    if (k === 'birds') {
      const n = 2 + Math.floor(Math.random() * 4);
      const f = 2500 + Math.random() * 2000;
      for (let i = 0; i < n; i++) a.osc(bus, 'sine', f, f * (1.2 + Math.random() * 0.3), t + i * 0.09, 0.07, 0.005, 0.04);
      if (Math.random() < 0.2) {
        // uguisu "hoo-hokekyo"
        a.osc(bus, 'sine', 1300, 1350, t + 0.6, 0.5, 0.05, 0.04, 'lin');
        a.osc(bus, 'sine', 1900, 2100, t + 1.2, 0.12, 0.01, 0.04);
        a.osc(bus, 'sine', 2300, 1800, t + 1.35, 0.2, 0.01, 0.04);
      }
      this.ambT = 1.5 + Math.random() * 3;
    } else if (k === 'cicadas') {
      const n = a.noise(bus, t, 3.2, 'bandpass', 4600, 4800, 6, 0.05, 0.6);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 28;
      const lg = ctx.createGain();
      lg.gain.value = 0.03;
      lfo.connect(lg);
      lg.connect(n.g.gain);
      lfo.start(t);
      lfo.stop(t + 3.3);
      this.ambT = 2.6 + Math.random();
    } else if (k === 'crickets') {
      for (let i = 0; i < 3; i++) a.osc(bus, 'sine', 4300, 4300, t + i * 0.06, 0.04, 0.003, 0.02);
      this.ambT = 0.6 + Math.random() * 1.5;
    } else if (k === 'wind') {
      a.noise(bus, t, 4, 'lowpass', 300 + Math.random() * 200, 500, 1, 0.07, 1.5);
      this.ambT = 3 + Math.random() * 2;
    } else this.ambT = 2;
  }
}
