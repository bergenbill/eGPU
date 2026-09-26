// Mischief points, combos and the town alert ("heat").
export class Score {
  constructor(g) {
    this.g = g;
    this.points = 0;
    this.combo = 0;
    this.comboT = 0;
    this.mult = 1;
    this.bestCombo = 0;
    this.recent = new Map();
    this.counts = {};
  }

  add(base, label, pos, key) {
    const g = this.g;
    if (base <= 0) return 0;
    // repeating the exact same gag right away is worth less (keeps things varied)
    let factor = 1;
    if (key) {
      const last = this.recent.get(key);
      if (last !== undefined && g.time - last < 25) factor = 0.3;
      this.recent.set(key, g.time);
    }
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = 5;
    this.mult = Math.min(4, 1 + (this.combo - 1) * 0.25);
    const pts = Math.max(5, Math.round(base * this.mult * factor / 5) * 5);
    this.points += pts;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    if (pos) g.ui.floatText(pos, `+${pts}`, label, this.combo);
    if (this.combo > 1) {
      g.audio.sfx('combo', null, this.combo);
      g.events.emit('combo', { n: this.combo });
    }
    return pts;
  }

  addFlat(pts, label) {
    this.points += pts;
    this.g.ui.bigText(`+${pts}`, label);
  }

  breakCombo() {
    this.combo = 0;
    this.comboT = 0;
    this.mult = 1;
  }

  update(dt) {
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) {
        if (this.combo >= 4) {
          const bonus = this.combo * 25;
          this.points += bonus;
          this.g.ui.bigText(`+${bonus}`, `${this.combo}× combo bonus!`);
        }
        this.combo = 0;
        this.mult = 1;
      }
    }
  }
}
