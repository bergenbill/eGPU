// Procedural sound effects via WebAudio. No audio files needed.
import { clamp } from '../core/math.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.sfxVol = 0.85;
    this.musicVol = 0.7;
    this.recent = new Map();
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVol;
    this.musicBus.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = this.sfxVol * 0.6;
    this.ambBus.connect(this.master);
    // shared white noise
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.ready = true;
  }

  setVolumes(music, sfx) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(music, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(sfx, t, 0.1);
    this.ambBus.gain.setTargetAtTime(sfx * 0.6, t, 0.1);
  }

  setListener(x, z, yaw) {
    this.listener.x = x;
    this.listener.z = z;
    this.listener.yaw = yaw;
  }

  // gain + pan node chain for a positioned sound
  out(pos, vol = 1, maxD = 45) {
    const ctx = this.ctx;
    let g = vol;
    let pan = 0;
    if (pos) {
      const dx = pos.x - this.listener.x;
      const dz = pos.z - this.listener.z;
      const d = Math.hypot(dx, dz);
      g *= Math.pow(clamp(1 - d / maxD, 0, 1), 1.6);
      const c = Math.cos(this.listener.yaw);
      const s = Math.sin(this.listener.yaw);
      pan = clamp((dx * c - dz * s) / 18, -0.8, 0.8);
    }
    if (g < 0.005) return null;
    const gain = ctx.createGain();
    gain.gain.value = g;
    let node = gain;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      gain.connect(p);
      p.connect(this.sfxBus);
    } else gain.connect(this.sfxBus);
    return node;
  }

  // ---------------------------------------------------------------- primitives
  osc(dest, type, f0, f1, t0, dur, a = 0.005, peak = 0.3, curve = 'exp') {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      else o.frequency.linearRampToValueAtTime(f1, t0 + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    return { o, g };
  }

  noise(dest, t0, dur, ftype, f0, f1, q = 1, peak = 0.3, a = 0.005) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = ftype;
    f.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
    return { src, f, g };
  }

  partials(dest, t0, freqs, dur, peak = 0.15, type = 'sine') {
    for (const f of freqs) this.osc(dest, type, f, f, t0, dur * (0.6 + Math.random() * 0.4), 0.002, peak / freqs.length * 2);
  }

  // ---------------------------------------------------------------- effects
  sfx(name, pos, vol = 1) {
    if (!this.ready) return;
    // throttle identical sounds
    const now = this.ctx.currentTime;
    const last = this.recent.get(name) || 0;
    if (now - last < 0.035) return;
    this.recent.set(name, now);
    const d = this.out(pos, vol);
    if (!d) return;
    const t = now + 0.005;
    const r = Math.random();
    switch (name) {
      case 'step':
        this.noise(d, t, 0.06, 'lowpass', 900, 400, 1, 0.12);
        break;
      case 'rustle':
        this.noise(d, t, 0.28, 'bandpass', 3200, 2200, 1.2, 0.18, 0.03);
        break;
      case 'wade':
        this.noise(d, t, 0.18, 'lowpass', 1400, 500, 1, 0.16, 0.02);
        this.osc(d, 'sine', 500 + r * 300, 900, t + 0.05, 0.08, 0.005, 0.05);
        break;
      case 'jump':
        this.osc(d, 'sine', 280, 520, t, 0.12, 0.005, 0.1);
        break;
      case 'land':
        this.noise(d, t, 0.14, 'lowpass', 500, 200, 1, 0.25);
        break;
      case 'climb':
        this.noise(d, t, 0.07, 'bandpass', 1800 + r * 800, 1200, 2, 0.12);
        break;
      case 'grab':
        this.osc(d, 'sine', 420, 880, t, 0.09, 0.004, 0.22);
        break;
      case 'drop':
        this.osc(d, 'sine', 170, 70, t, 0.14, 0.004, 0.25);
        this.noise(d, t, 0.08, 'lowpass', 600, 300, 1, 0.1);
        break;
      case 'throw':
        this.noise(d, t, 0.28, 'bandpass', 500, 2400, 2, 0.28, 0.08);
        break;
      case 'pop':
        this.osc(d, 'sine', 180, 700, t, 0.12, 0.003, 0.35);
        this.noise(d, t, 0.15, 'lowpass', 900, 300, 1, 0.2);
        break;
      case 'impact:veg':
      case 'impact:squish':
        this.osc(d, 'sine', 220, 80, t, 0.16, 0.003, 0.3);
        this.noise(d, t, 0.12, 'lowpass', 900, 250, 1, 0.18);
        break;
      case 'impact:metal':
      case 'impact:can':
        this.partials(d, t, name === 'impact:can' ? [880, 2330, 3710] : [520, 1370, 2270, 3150], name === 'impact:can' ? 0.3 : 0.7, 0.35);
        this.noise(d, t, 0.05, 'highpass', 3000, 3000, 1, 0.15);
        break;
      case 'impact:wood':
        this.osc(d, 'sine', 300, 260, t, 0.12, 0.002, 0.35);
        this.osc(d, 'sine', 610, 560, t, 0.08, 0.002, 0.2);
        this.noise(d, t, 0.03, 'highpass', 2000, 2000, 1, 0.15);
        break;
      case 'impact:glass':
        this.partials(d, t, [2100, 3300, 4700], 0.25, 0.2);
        break;
      case 'impact:soft':
      case 'impact:leather':
        this.noise(d, t, 0.1, 'lowpass', 500, 200, 1, 0.25);
        break;
      case 'impact:paper':
        this.noise(d, t, 0.12, 'bandpass', 3000, 2000, 1, 0.15);
        break;
      case 'impact:stone':
        this.osc(d, 'sine', 900, 700, t, 0.05, 0.001, 0.25);
        this.noise(d, t, 0.06, 'bandpass', 2500, 1500, 2, 0.2);
        break;
      case 'impact:coin':
      case 'coin':
        this.osc(d, 'sine', 2000, 2000, t, 0.35, 0.002, 0.15);
        this.osc(d, 'sine', 2650, 2650, t + 0.04, 0.3, 0.002, 0.12);
        break;
      case 'impact:squeak':
        this.osc(d, 'square', 1200, 1800, t, 0.12, 0.005, 0.08, 'lin');
        this.osc(d, 'square', 1800, 1100, t + 0.12, 0.1, 0.005, 0.06, 'lin');
        break;
      case 'impact:plastic':
        this.osc(d, 'triangle', 700, 500, t, 0.08, 0.002, 0.2);
        break;
      case 'impact:crunch':
        for (let i = 0; i < 3; i++) this.noise(d, t + i * 0.03, 0.04, 'bandpass', 2500, 2000, 1, 0.2);
        break;
      case 'impact:ball':
      case 'ball':
        this.osc(d, 'sine', 160, 110, t, 0.18, 0.003, 0.35);
        this.osc(d, 'sine', 320, 260, t, 0.08, 0.003, 0.1);
        break;
      case 'shatter':
        this.noise(d, t, 0.35, 'highpass', 3000, 5000, 1, 0.45);
        for (let i = 0; i < 7; i++) this.osc(d, 'sine', 2500 + Math.random() * 3500, 2500 + Math.random() * 3000, t + Math.random() * 0.25, 0.15, 0.001, 0.07);
        break;
      case 'splash':
        this.noise(d, t, 0.55, 'lowpass', 3500, 250, 1, 0.45, 0.01);
        for (let i = 0; i < 4; i++) this.osc(d, 'sine', 400 + Math.random() * 500, 900 + Math.random() * 600, t + 0.1 + i * 0.07, 0.07, 0.003, 0.06);
        break;
      case 'plop':
        this.osc(d, 'sine', 500, 140, t, 0.18, 0.004, 0.35);
        this.osc(d, 'sine', 500, 140, t + 0.35, 0.14, 0.004, 0.12);
        break;
      case 'tear':
      case 'rip': {
        const n = this.noise(d, t, 0.45, 'highpass', 1500, 2500, 0.8, 0.35, 0.01);
        const lfo = this.ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = 38;
        const lg = this.ctx.createGain();
        lg.gain.value = 0.15;
        lfo.connect(lg);
        lg.connect(n.g.gain);
        lfo.start(t);
        lfo.stop(t + 0.5);
        break;
      }
      case 'tearTick':
        this.noise(d, t, 0.05, 'highpass', 2000, 2000, 1, 0.12);
        break;
      case 'munch':
        for (let i = 0; i < 3; i++) this.noise(d, t + i * 0.12, 0.07, 'bandpass', 1800 + Math.random() * 800, 1200, 1.5, 0.25);
        break;
      case 'strain': {
        const o = this.osc(d, 'triangle', 170, 150, t, 0.9, 0.08, 0.1, 'lin');
        const v = this.ctx.createOscillator();
        v.frequency.value = 7;
        const vg = this.ctx.createGain();
        vg.gain.value = 8;
        v.connect(vg);
        vg.connect(o.o.frequency);
        v.start(t);
        v.stop(t + 1);
        break;
      }
      case 'squelch':
        this.noise(d, t, 0.25, 'lowpass', 700, 200, 3, 0.4);
        this.osc(d, 'sine', 260, 90, t, 0.22, 0.003, 0.25);
        break;
      case 'shove':
        this.noise(d, t, 0.12, 'lowpass', 700, 250, 1, 0.35);
        this.osc(d, 'triangle', 300, 200, t, 0.1, 0.004, 0.15);
        break;
      case 'bonk':
        this.osc(d, 'sine', 820, 700, t, 0.08, 0.001, 0.35);
        this.osc(d, 'sine', 410, 380, t, 0.12, 0.001, 0.25);
        break;
      case 'bucketHead': {
        const o1 = this.osc(d, 'sine', 210, 200, t, 1.1, 0.002, 0.3);
        this.osc(d, 'sine', 318, 310, t, 0.9, 0.002, 0.18);
        this.osc(d, 'sine', 523, 520, t, 0.5, 0.002, 0.1);
        void o1;
        break;
      }
      case 'leaves':
        this.noise(d, t, 0.9, 'bandpass', 4200, 2500, 0.8, 0.3, 0.02);
        this.noise(d, t + 0.1, 0.6, 'bandpass', 2500, 1800, 1, 0.15, 0.05);
        break;
      case 'shrineBell':
        for (let i = 0; i < 16; i++) {
          const tt = t + Math.random() * 1.0;
          const f = 2200 + Math.random() * 2200;
          this.osc(d, 'sine', f, f, tt, 0.25, 0.001, 0.08);
          this.osc(d, 'sine', f * 1.51, f * 1.51, tt, 0.18, 0.001, 0.04);
        }
        this.osc(d, 'sine', 330, 328, t, 2.0, 0.005, 0.12);
        break;
      case 'vend':
        this.osc(d, 'sine', 110, 60, t, 0.25, 0.003, 0.4);
        this.noise(d, t, 0.2, 'lowpass', 800, 300, 1, 0.25);
        this.partials(d, t + 0.18, [880, 2330], 0.3, 0.12);
        break;
      case 'binCrash':
        this.noise(d, t, 0.5, 'bandpass', 1500, 600, 0.7, 0.45);
        this.partials(d, t, [340, 910, 1570, 2330], 0.5, 0.25);
        this.noise(d, t + 0.15, 0.3, 'bandpass', 3000, 2000, 1, 0.15);
        break;
      case 'taiko':
        this.osc(d, 'sine', 95, 50, t, 1.0, 0.003, 0.9);
        this.osc(d, 'sine', 190, 90, t, 0.25, 0.002, 0.3);
        this.noise(d, t, 0.12, 'lowpass', 1200, 300, 1, 0.4);
        break;
      case 'furin':
        this.osc(d, 'sine', 2350, 2350, t, 1.6, 0.002, 0.08);
        this.osc(d, 'sine', 3530, 3530, t, 1.2, 0.002, 0.04);
        this.osc(d, 'sine', 5870, 5870, t, 0.7, 0.002, 0.02);
        break;
      case 'chime': {
        const notes = [74, 76, 79, 81, 86];
        notes.forEach((m, i) => this.osc(d, 'triangle', mtof(m), mtof(m), t + i * 0.07, 0.8, 0.003, 0.12));
        break;
      }
      case 'stamp':
        this.osc(d, 'sine', 140, 70, t, 0.2, 0.002, 0.5);
        this.noise(d, t, 0.08, 'lowpass', 1500, 400, 1, 0.3);
        break;
      case 'rare':
        [79, 83, 86, 91, 95].forEach((m, i) => this.osc(d, 'sine', mtof(m), mtof(m), t + i * 0.06, 0.6, 0.002, 0.1));
        break;
      case 'whistle': {
        const o = this.osc(d, 'square', 2900, 2900, t, 0.7, 0.01, 0.07, 'lin');
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 22;
        const lg = this.ctx.createGain();
        lg.gain.value = 180;
        lfo.connect(lg);
        lg.connect(o.o.frequency);
        lfo.start(t);
        lfo.stop(t + 0.75);
        break;
      }
      case 'busHorn':
        this.osc(d, 'square', 349, 349, t, 0.3, 0.01, 0.1, 'lin');
        this.osc(d, 'square', 440, 440, t, 0.3, 0.01, 0.08, 'lin');
        this.osc(d, 'square', 349, 349, t + 0.35, 0.3, 0.01, 0.1, 'lin');
        this.osc(d, 'square', 440, 440, t + 0.35, 0.3, 0.01, 0.08, 'lin');
        break;
      case 'busEngine':
        this.osc(d, 'sawtooth', 55, 70, t, 2.0, 0.4, 0.06, 'lin');
        break;
      case 'busDoor':
        this.noise(d, t, 0.5, 'highpass', 2000, 3000, 1, 0.2, 0.05);
        break;
      case 'door':
        this.noise(d, t, 0.3, 'bandpass', 700, 900, 2, 0.2, 0.03);
        break;
      case 'flush':
        this.noise(d, t, 1.4, 'lowpass', 2500, 300, 1, 0.35, 0.1);
        this.noise(d, t + 0.3, 1.0, 'bandpass', 900, 500, 2, 0.2, 0.2);
        break;
      case 'flap':
        for (let i = 0; i < 10; i++) this.noise(d, t + i * 0.045, 0.05, 'bandpass', 1200, 900, 1, 0.2);
        break;
      case 'wash':
        this.noise(d, t, 0.6, 'bandpass', 1200, 2500, 1, 0.25, 0.1);
        break;
      case 'sweep':
        this.noise(d, t, 0.3, 'bandpass', 3500, 2800, 0.8, 0.12, 0.08);
        break;
      case 'thwack':
        this.noise(d, t, 0.12, 'lowpass', 1200, 300, 1, 0.4);
        break;
      case 'drag':
        this.noise(d, t, 0.35, 'bandpass', 500, 700, 3, 0.2, 0.05);
        break;
      case 'combo': {
        const f = mtof(72 + Math.min(12, vol * 2));
        this.osc(this.sfxBus, 'triangle', f, f * 1.5, t, 0.12, 0.003, 0.12);
        break;
      }
      case 'caught':
        [67, 66, 65, 60].forEach((m, i) => this.osc(this.sfxBus, 'sawtooth', mtof(m - 12), mtof(m - 12.5), t + i * 0.22, i === 3 ? 0.6 : 0.2, 0.01, 0.08, 'lin'));
        break;
      case 'escape':
        this.osc(this.sfxBus, 'triangle', 700, 1400, t, 0.25, 0.005, 0.12);
        break;
      case 'ui':
        this.osc(this.sfxBus, 'sine', 900, 1200, t, 0.06, 0.002, 0.1);
        break;
      case 'unlock':
        [72, 76, 79, 84, 88].forEach((m, i) => this.osc(this.sfxBus, 'triangle', mtof(m), mtof(m), t + i * 0.09, 0.5, 0.003, 0.12));
        break;
      default:
        this.osc(d, 'sine', 600, 400, t, 0.1, 0.003, 0.1);
    }
  }

  // Monkey screech / raccoon hiss. Held items change the sound (like the goose's honk).
  bark(kind, held, pos) {
    if (!this.ready) return;
    const d = this.out(pos, 1);
    if (!d) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    let dest = d;
    const muffled = held && ['fish', 'octopus', 'towel', 'shirt', 'sock', 'futon', 'dango', 'onigiri', 'daikon', 'strawHat', 'cabbage', 'persimmon', 'senbei', 'cucumber', 'newspaper'].includes(held);
    const metal = held && ['can', 'bucket', 'wateringCan', 'coin', 'goldCat', 'robot', 'teapot'].includes(held);
    if (muffled) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 700;
      f.connect(d);
      dest = f;
    } else if (metal) {
      // comb filter: tinny echo
      const dl = ctx.createDelay();
      dl.delayTime.value = 0.006;
      const fb = ctx.createGain();
      fb.gain.value = 0.75;
      dl.connect(fb);
      fb.connect(dl);
      dl.connect(d);
      const dry = ctx.createGain();
      dry.gain.value = 1;
      dry.connect(d);
      dry.connect(dl);
      dest = dry;
    }
    if (held === 'duck') {
      this.osc(dest, 'square', 900, 1500, t, 0.14, 0.005, 0.12, 'lin');
      this.osc(dest, 'square', 1500, 800, t + 0.14, 0.14, 0.005, 0.1, 'lin');
      return;
    }
    if (kind === 'screech') {
      const v = 0.9 + Math.random() * 0.2;
      for (let i = 0; i < 2; i++) {
        const tt = t + i * 0.16;
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(900 * v, tt);
        o.frequency.linearRampToValueAtTime(1700 * v, tt + 0.05);
        o.frequency.linearRampToValueAtTime(1150 * v, tt + 0.13);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2100;
        bp.Q.value = 1.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.5, tt + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.14);
        o.connect(bp);
        bp.connect(g);
        g.connect(dest);
        o.start(tt);
        o.stop(tt + 0.16);
        this.noise(dest, tt, 0.1, 'bandpass', 3000, 2500, 1, 0.08);
      }
    } else {
      this.noise(dest, t, 0.5, 'bandpass', 5200, 4200, 1.2, 0.35, 0.03);
      for (let i = 0; i < 4; i++) this.osc(dest, 'square', 1700 + Math.random() * 400, 1500, t + 0.45 + i * 0.05, 0.035, 0.002, 0.05);
    }
  }

  // Simlish-style gibberish voices for townsfolk.
  voice(pitch, mood, pos) {
    if (!this.ready) return;
    const d = this.out(pos, mood === 'shout' ? 1 : 0.7, 40);
    if (!d) return;
    const ctx = this.ctx;
    const base = 170 * pitch * (mood === 'shout' ? 1.35 : mood === 'grumble' ? 0.8 : 1);
    const n = mood === 'shout' ? 3 : 2 + Math.floor(Math.random() * 3);
    let t = ctx.currentTime + 0.01;
    const vowels = [[730, 1090], [270, 2290], [300, 870], [530, 1840], [570, 840]];
    for (let i = 0; i < n; i++) {
      const dur = mood === 'shout' ? 0.12 : 0.09 + Math.random() * 0.05;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      let f = base * (1 + (Math.random() - 0.5) * 0.3);
      if (mood === 'happy') f *= 1 + i * 0.08;
      if (mood === 'grumble') f *= 1 - i * 0.07;
      if (mood === 'shout' && i === n - 1) f *= 1.25;
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * (mood === 'shout' ? 1.1 : 0.95), t + dur);
      const v = vowels[Math.floor(Math.random() * vowels.length)];
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(mood === 'shout' ? 0.35 : 0.2, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      for (const ff of v) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = ff;
        bp.Q.value = 5;
        o.connect(bp);
        bp.connect(g);
      }
      g.connect(d);
      o.start(t);
      o.stop(t + dur + 0.02);
      t += dur + 0.02;
    }
  }
}

export function mtof(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}
