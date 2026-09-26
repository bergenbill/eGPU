import * as THREE from 'three';
import { box, cyl, sphere, cone, group, prism } from '../render/geom.js';
import { mat, uniqueMat } from '../render/materials.js';
import { COMMON as C } from './palette.js';
import * as TX from '../render/textures.js';
import { vendingMesh, drainGrate } from './props.js';
import { TRASH_LOOT } from './itemDefs.js';
import { dist2d, rand, pick, clamp, yawTo } from '../core/math.js';

export const FORTUNES = [
  ['大吉', 'Great Blessing', 'A fish will fall into your hands today.'],
  ['大吉', 'Great Blessing', 'Everything you steal will be very shiny.'],
  ['吉', 'Blessing', 'The bus is always late. Use this.'],
  ['吉', 'Blessing', 'Grandma sees all. Grandma forgives nothing.'],
  ['中吉', 'Middle Blessing', 'A bucket is a hat if you believe.'],
  ['小吉', 'Small Blessing', 'Beware of brooms.'],
  ['小吉', 'Small Blessing', 'Your lucky number is ¥100.'],
  ['末吉', 'Future Blessing', 'The golden cat waits for a worthy thief.'],
  ['凶', 'Curse', 'Someone is watching you. (It is the officer.)'],
  ['凶', 'Curse', 'You will step in something. Or someone else will.'],
  ['大凶', 'Great Curse', 'Tie this paper to the rack... or tear it up. Your call.'],
  ['吉', 'Blessing', 'Hot springs cure all worries.'],
  ['中吉', 'Middle Blessing', 'Trash is just treasure nobody loved enough.'],
];

class Fixture {
  constructor(g, spec) {
    this.g = g;
    this.spec = spec;
    this.type = spec.type;
    this.key = spec.key !== undefined ? spec.type + spec.key : spec.type;
    this.pos = new THREE.Vector3(spec.x, spec.y || 0, spec.z);
    this.root = new THREE.Group();
    this.root.position.copy(this.pos);
    g.fixtureRoot.add(this.root);
  }
  near(p, r, yTol = 0.8) {
    return dist2d(p.pos.x, p.pos.z, this.pos.x, this.pos.z) < r && Math.abs(p.pos.y - this.pos.y) < yTol;
  }
  update() {}
  dispose() {
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}

// ---------------------------------------------------------------------------- leaf pile
class LeafPile extends Fixture {
  constructor(g, spec) {
    super(g, spec);
    this.amount = 1;
    this.pile = group();
    const cols = g.pal.leafPile;
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 1.1;
      const h = (1 - r / 1.1) * 0.55;
      const m = box(0.2, 0.03, 0.14, cols[i % cols.length], { x: Math.cos(a) * r, y: Math.random() * h + 0.02, z: Math.sin(a) * r, ry: Math.random() * 3, rx: rand(-0.4, 0.4) });
      m.castShadow = false;
      this.pile.add(m);
    }
    this.pile.add(sphere(0.8, cols[0], { y: -0.25, sy: 0.55, lo: true }));
    this.root.add(this.pile);
    this.tidyAct = 'sweep';
    this.tidyTime = 6;
    this.tidyLine = 'Mou... my leaves.';
  }
  setAmount(a) {
    this.amount = clamp(a, 0, 1);
    const s = 0.15 + this.amount * 0.85;
    this.pile.scale.set(s, Math.max(0.05, this.amount), s);
    this.pile.visible = this.amount > 0.03;
  }
  regrow(d) {
    this.setAmount(this.amount + d);
  }
  scatter(by) {
    if (this.amount < 0.45) return;
    const g = this.g;
    const n = Math.round(60 * this.amount);
    g.particles.leaves(this.pos.x, 0.2, this.pos.z, n, g.pal.leafPile);
    g.audio.sfx('leaves', this.pos, 1);
    this.setAmount(0);
    g.noise(this.pos.x, this.pos.z, 6, 'clatter', this);
    g.mischief('leaves', this.pos, { points: 120, label: 'Leaf storm!', owner: 'priest' });
    g.events.emit('leafScatter', { f: this, by });
  }
  update(dt) {
    const p = this.g.player;
    if (!p || this.amount < 0.45) return;
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (p.pos.y < 0.5 && sp > 2.2 && dist2d(p.pos.x, p.pos.z, this.pos.x, this.pos.z) < 1.2) this.scatter('run');
  }
  hitTest(it) {
    return this.amount > 0.45 && it.pos.y < 0.8 && dist2d(it.pos.x, it.pos.z, this.pos.x, this.pos.z) < 1.2;
  }
  onItemHit() {
    this.scatter('throw');
  }
  onBark(p, d) {
    if (d < 2.6) this.scatter('bark');
  }
  needsTidy(npc) {
    return npc.id === 'priest' && this.amount < 0.9;
  }
  tidy() {
    this.setAmount(1);
  }
}

// ---------------------------------------------------------------------------- shrine bell
class BellRope extends Fixture {
  constructor(g, spec) {
    super(g, spec);
    this.swing = 0;
    this.cd = 0;
    this.pivot = group({ y: 3.45 });
    this.root.add(this.pivot);
    this.pivot.add(sphere(0.32, '#d9b23a', { y: -0.2, sy: 0.85, mat: { emissive: '#3a2a00' } }));
    this.pivot.add(box(0.5, 0.06, 0.06, '#8a6a30', { y: 0.12 }));
    const ropeLen = 2.3;
    this.pivot.add(cyl(0.06, 0.07, ropeLen, '#e6dfcf', { y: -0.4 - ropeLen / 2, seg: 6 }));
    for (let i = 0; i < 5; i++) this.pivot.add(cyl(0.075, 0.075, 0.08, i % 2 ? '#d6452f' : '#f4f0e6', { y: -0.6 - i * 0.4, seg: 6 }));
    this.pivot.add(cone(0.12, 0.3, '#d6452f', { y: -0.4 - ropeLen - 0.1, seg: 6 }));
  }
  interactInfo(p) {
    if (p.held || !this.near(p, 1.25, 0.7)) return null;
    return { label: 'Ring the shrine bell' };
  }
  interact(p) {
    p.yaw = yawTo(p.pos.x, p.pos.z, this.pos.x, this.pos.z);
    p.startAction('tug', 0.45, { target: this, label: 'Tugging...', lockMove: true, onDone: () => this.ring(p) });
  }
  ring(by, quiet) {
    if (this.cd > 0) return;
    const g = this.g;
    this.cd = 1.2;
    this.swing = 1;
    g.audio.sfx('shrineBell', this.pos, quiet ? 0.35 : 1);
    if (by === g.player || by?.thrower === 'player') {
      g.noise(this.pos.x, this.pos.z, 24, 'bell', this);
      g.mischief('bell', this.pos, { points: 150, label: 'Ding-a-ling!', owner: 'priest', loud: true });
      g.events.emit('bellRing', { byPlayer: true });
      g.rig.shake = Math.max(g.rig.shake, 0.25);
    }
  }
  hitTest(it) {
    return Math.abs(it.pos.y - (this.pos.y + 3.2)) < 0.7 && dist2d(it.pos.x, it.pos.z, this.pos.x, this.pos.z) < 0.7;
  }
  onItemHit(it) {
    this.ring(it);
  }
  update(dt) {
    this.cd -= dt;
    this.swing = Math.max(0, this.swing - dt * 0.6);
    this.pivot.rotation.x = Math.sin(this.g.time * 7) * this.swing * 0.35;
    this.pivot.rotation.z = Math.cos(this.g.time * 5) * this.swing * 0.12;
  }
}

// ---------------------------------------------------------------------------- offering box
class OfferingBox extends Fixture {
  constructor(g, spec) {
    super(g, spec);
    this.coins = 5;
    const b = group();
    b.add(box(1.4, 0.55, 0.7, C.woodDark, { y: 0.28 }));
    for (let i = 0; i < 7; i++) b.add(box(0.08, 0.06, 0.62, C.wood, { x: -0.6 + i * 0.2, y: 0.58 }));
    b.add(box(1.5, 0.06, 0.78, C.wood, { y: 0.54 }));
    b.add(box(0.5, 0.12, 0.02, '#f0c23a', { y: 0.3, z: 0.36 }));
    this.root.add(b);
    g.world.addBoxC(spec.x, spec.z, 1.4, 0.7, this.pos.y + 0.62, { walk: true, opaque: false, tag: 'offering' });
  }
  interactInfo(p) {
    if (p.held || this.coins <= 0 || !this.near(p, 1.55, 0.8)) return null;
    return { label: 'Fish for coins' };
  }
  interact(p) {
    const g = this.g;
    p.yaw = yawTo(p.pos.x, p.pos.z, this.pos.x, this.pos.z);
    p.startAction('rummage', p.c.rummageTime + 0.2, {
      target: this, label: 'Rummaging...', lockMove: true, anim: 'tear',
      onDone: () => {
        if (this.coins <= 0) return;
        this.coins--;
        const it = g.items.spawn({ type: 'coin', x: this.pos.x + rand(-0.3, 0.3), y: this.pos.y + 0.7, z: this.pos.z + 0.45, owner: 'priest' });
        it.home.set(this.pos.x, this.pos.y + 0.62, this.pos.z);
        it.homeState = 'rest';
        it.state = 'air';
        it.sleeping = false;
        it.vel.set(rand(-0.5, 0.5), 3, 1.5);
        it.stolen = true;
        g.audio.sfx('coin', this.pos, 1);
        g.noise(this.pos.x, this.pos.z, 3.5, 'clatter', this);
        g.mischief('offering', this.pos, { points: 100, label: 'Sacrilege!', owner: 'priest' });
        g.events.emit('coinTaken', {});
      },
    });
  }
  refill() {
    this.coins = 5;
  }
}

// ---------------------------------------------------------------------------- vending machine
let vendIdx = 0;
class Vending extends Fixture {
  constructor(g, spec) {
    super(g, { ...spec, key: vendIdx++ });
    const m = vendingMesh(spec.theme);
    m.rotation.y = spec.ry || 0;
    this.root.add(m);
    const ry = spec.ry || 0;
    this.fx = Math.sin(ry);
    this.fz = Math.cos(ry);
    const alongX = Math.abs(this.fz) > 0.5;
    g.world.addBoxC(spec.x, spec.z, alongX ? 0.95 : 0.8, alongX ? 0.8 : 0.95, 1.95, { walk: true, climb: 'wall', opaque: true, tag: 'vending' });
    this.front = new THREE.Vector3(spec.x + this.fx * 0.75, 0, spec.z + this.fz * 0.75);
    this.pending = 0;
  }
  useInfo(p, item) {
    if (item.type !== 'coin') return null;
    if (dist2d(p.pos.x, p.pos.z, this.front.x, this.front.z) > 1.2 || p.pos.y > 0.6) return null;
    return { label: 'Put the coin in the vending machine' };
  }
  use(p, item) {
    p.held = null;
    item.remove();
    this.vend(p);
  }
  vend(by) {
    const g = this.g;
    g.audio.sfx('coin', this.pos, 0.8);
    this.pending = 0.9;
    this.by = by;
  }
  hitTest(it) {
    return it.type === 'coin' && dist2d(it.pos.x, it.pos.z, this.pos.x, this.pos.z) < 0.8 && it.pos.y < 2;
  }
  onItemHit(it) {
    it.remove();
    this.vend(this.g.player);
    this.g.ui.toast('Trick shot! The coin went right in!', 'good');
  }
  update(dt) {
    const g = this.g;
    if (this.pending > 0) {
      this.pending -= dt;
      if (this.pending <= 0) {
        g.audio.sfx('vend', this.pos, 1);
        const it = g.items.spawn({ type: 'can', variant: Math.floor(Math.random() * 4), x: this.front.x, y: 0.35, z: this.front.z });
        it.state = 'air';
        it.sleeping = false;
        it.vel.set(this.fx * 1.5, 1.5, this.fz * 1.5);
        g.events.emit('vending', { f: this });
        g.mischief('vend', this.pos, { points: 80, label: 'Kachunk! Juice!', silent: true });
      }
    }
    // coins dropped at the front slot also work
    for (const it of g.items.items) {
      if (it.type !== 'coin' || (it.state !== 'rest' && it.state !== 'air')) continue;
      if (dist2d(it.pos.x, it.pos.z, this.front.x, this.front.z) < 0.55 && it.pos.y < 1) {
        it.remove();
        this.vend(g.player);
      }
    }
  }
}

// ---------------------------------------------------------------------------- trash bin
let binIdx = 0;
class TrashBin extends Fixture {
  constructor(g, spec) {
    super(g, { ...spec, key: binIdx++ });
    this.upright = true;
    this.loot = 2;
    this.body = group();
    this.body.add(cyl(0.32, 0.28, 0.85, '#4f7a5a', { y: 0.42, seg: 10 }));
    this.body.add(cyl(0.34, 0.34, 0.08, '#3f6a4a', { y: 0.86, seg: 10 }));
    this.body.add(box(0.2, 0.05, 0.3, '#f4f4f0', { y: 0.5, z: 0.3 }));
    this.root.add(this.body);
    this.spill = group();
    for (let i = 0; i < 6; i++) this.spill.add(sphere(0.09, i % 2 ? '#f1efe8' : '#c8c2b0', { x: rand(-0.3, 0.6), y: 0.05, z: rand(0.3, 0.9), lo: true }));
    this.spill.visible = false;
    this.root.add(this.spill);
    this.col = g.world.addCircle({ x: spec.x, z: spec.z, r: 0.34, top: 0.9, walk: true, tag: 'bin' });
    this.tidyAct = 'tidy';
    this.tidyTime = 3.5;
    this.tidyLine = 'Who did this...?';
  }
  interactInfo(p) {
    if (p.held || !this.near(p, 1.2, 0.8)) return null;
    if (p.c.rummage && this.loot > 0) return { label: 'Rummage through the trash' };
    if (this.upright) return { label: 'Knock over the trash bin' };
    return null;
  }
  interact(p) {
    const g = this.g;
    p.yaw = yawTo(p.pos.x, p.pos.z, this.pos.x, this.pos.z);
    if (p.c.rummage && this.loot > 0) {
      p.startAction('rummage', p.c.rummageTime + 0.3, {
        target: this, label: 'Rummaging...', lockMove: true, anim: 'tear',
        onDone: () => {
          if (this.upright) this.tip(p, true);
          this.giveLoot(p);
        },
      });
    } else {
      this.tip(p);
    }
  }
  giveLoot(p) {
    const g = this.g;
    if (this.loot <= 0) return;
    this.loot--;
    const r = Math.random();
    const tier = r < 0.03 ? 'legendary' : r < 0.15 ? 'rare' : r < 0.45 ? 'uncommon' : 'common';
    const type = pick(TRASH_LOOT[tier]);
    const it = g.items.spawn({ type, variant: Math.floor(Math.random() * 4), x: this.pos.x + rand(-0.3, 0.3), y: 0.6, z: this.pos.z + rand(-0.3, 0.3) });
    it.state = 'air';
    it.sleeping = false;
    it.vel.set(rand(-1, 1), 4, rand(-1, 1));
    if (tier === 'rare' || tier === 'legendary') {
      g.ui.toast(`Rare find: ${it.name}!`, 'good');
      g.particles.sparkle(it.pos.x, 0.8, it.pos.z, 16);
      g.audio.sfx('rare', it.pos, 1);
    }
    g.events.emit('rummage', { item: it, tier });
  }
  tip(by, quiet) {
    const g = this.g;
    if (!this.upright) return;
    this.upright = false;
    const ang = by && by.pos ? yawTo(by.pos.x, by.pos.z, this.pos.x, this.pos.z) : 0;
    this.body.rotation.set(Math.PI / 2 - 0.1, 0, 0);
    this.body.position.y = 0.3;
    this.root.rotation.y = ang;
    this.spill.visible = true;
    g.audio.sfx('binCrash', this.pos, 1);
    g.particles.burst(this.pos.x, 0.4, this.pos.z, 10, ['#f1efe8', '#c8c2b0', '#8a8a80'], 2.5, 0.09);
    g.noise(this.pos.x, this.pos.z, quiet ? 5 : 9, 'bin', this);
    g.mischief('bin', this.pos, { points: 70, label: 'Trash party!', loud: !quiet });
    g.events.emit('binTipped', { f: this });
    if (!g.player.c.rummage) {
      const it = g.items.spawn({ type: pick(TRASH_LOOT.common), variant: 1, x: this.pos.x, y: 0.5, z: this.pos.z });
      it.state = 'air';
      it.sleeping = false;
      it.vel.set(Math.sin(ang) * 2, 2, Math.cos(ang) * 2);
    }
  }
  hitTest(it) {
    return this.upright && it.pos.y < 1 && dist2d(it.pos.x, it.pos.z, this.pos.x, this.pos.z) < 0.55;
  }
  onItemHit(it) {
    this.tip(it);
  }
  update() {
    const p = this.g.player;
    if (this.upright && p && p.pos.y < 0.5 && Math.hypot(p.vel.x, p.vel.z) > 5.5 && dist2d(p.pos.x, p.pos.z, this.pos.x, this.pos.z) < 0.75) this.tip(p);
  }
  needsTidy() {
    return !this.upright;
  }
  tidy() {
    this.upright = true;
    this.body.rotation.set(0, 0, 0);
    this.body.position.y = 0;
    this.root.rotation.y = 0;
    this.spill.visible = false;
    if (this.loot < 1) this.loot = 1;
  }
}

// ---------------------------------------------------------------------------- drain (raccoon highway)
class Drain extends Fixture {
  constructor(g, spec) {
    super(g, spec);
    const m = group();
    m.add(box(0.95, 0.03, 0.95, '#55595e', { y: 0.02 }));
    for (let i = 0; i < 5; i++) m.add(box(0.85, 0.036, 0.07, '#2a2c2f', { y: 0.03, z: -0.32 + i * 0.16 }));
    this.root.add(m);
    this.name = spec.name;
    g.drains.push(this);
  }
  interactInfo(p) {
    if (!this.near(p, 1.0, 0.5)) return null;
    if (!p.c.squeeze) return p.held ? null : { label: 'Drain (too small for Kiki)' };
    return { label: 'Slip into the drain' };
  }
  interact(p) {
    const g = this.g;
    if (!p.c.squeeze) {
      g.ui.toast("Kiki's too big for the drain. Doro could squeeze in!", 'info');
      return;
    }
    if (p.held && p.held.heavy) {
      g.ui.toast("That won't fit down the drain.", 'info');
      return;
    }
    g.enterDrain(this);
  }
}

// ---------------------------------------------------------------------------- taiko drum
class Taiko extends Fixture {
  constructor(g, spec) {
    super(g, spec);
    const m = group();
    for (const s of [-1, 1]) m.add(box(0.12, 1.2, 0.12, C.woodDark, { x: s * 0.6, y: 0.6 }));
    m.add(box(1.4, 0.1, 0.5, C.woodDark, { y: 0.25 }));
    this.drum = group({ y: 1.05 });
    this.drum.add(cyl(0.55, 0.55, 0.7, '#8b3a2a', { rx: Math.PI / 2, seg: 14 }));
    this.drum.add(cyl(0.5, 0.5, 0.72, '#efe3c8', { rx: Math.PI / 2, seg: 14 }));
    this.drum.add(cyl(0.58, 0.58, 0.5, '#8b3a2a', { rx: Math.PI / 2, seg: 14 }));
    m.add(this.drum);
    this.root.add(m);
    g.world.addCircle({ x: spec.x, z: spec.z, r: 0.65, top: 1.6, walk: true, opaque: false, tag: 'taiko' });
    this.cd = 0;
    this.wob = 0;
  }
  interactInfo(p) {
    if (p.held || !this.near(p, 1.4, 1)) return null;
    return { label: 'Bang the taiko drum' };
  }
  interact(p) {
    p.yaw = yawTo(p.pos.x, p.pos.z, this.pos.x, this.pos.z);
    p.startAction('tug', 0.25, { target: this, label: '', lockMove: true, anim: 'tear', onDone: () => this.boom(p) });
  }
  boom() {
    const g = this.g;
    if (this.cd > 0) return;
    this.cd = 0.5;
    this.wob = 1;
    g.audio.sfx('taiko', this.pos, 1);
    g.rig.shake = Math.max(g.rig.shake, 0.45);
    g.noise(this.pos.x, this.pos.z, 20, 'taiko', this);
    g.mischief('taiko', this.pos, { points: 100, label: 'DON!', owner: 'priest', loud: true });
    g.events.emit('taiko', {});
  }
  hitTest(it) {
    return dist2d(it.pos.x, it.pos.z, this.pos.x, this.pos.z) < 0.75 && it.pos.y > 0.4 && it.pos.y < 1.8;
  }
  onItemHit() {
    this.boom();
  }
  update(dt) {
    this.cd -= dt;
    this.wob = Math.max(0, this.wob - dt * 3);
    this.drum.scale.setScalar(1 + Math.sin(this.g.time * 40) * 0.04 * this.wob);
  }
}

// ---------------------------------------------------------------------------- wind chime
class WindChime extends Fixture {
  constructor(g, spec) {
    super(g, spec);
    this.pivot = group({ y: spec.y });
    this.pivot.add(sphere(0.12, '#bfe0ef', { y: -0.05, sy: 0.8, mat: { transparent: true, opacity: 0.8 } }));
    this.pivot.add(box(0.1, 0.3, 0.01, '#f4f0e6', { y: -0.35 }));
    this.root.position.y = 0;
    this.root.add(this.pivot);
    this.t = rand(3, 8);
    this.swing = 0;
  }
  update(dt) {
    this.t -= dt;
    this.swing = Math.max(0, this.swing - dt);
    if (this.t <= 0) {
      this.t = rand(5, 12);
      this.swing = 0.5;
      this.g.audio.sfx('furin', this.pos, 0.35);
    }
    this.pivot.rotation.z = Math.sin(this.g.time * 4) * this.swing * 0.3;
  }
  hitTest(it) {
    return Math.abs(it.pos.y - this.spec.y) < 0.5 && dist2d(it.pos.x, it.pos.z, this.pos.x, this.pos.z) < 0.5;
  }
  onItemHit() {
    this.swing = 1.5;
    this.g.audio.sfx('furin', this.pos, 1);
    this.g.events.emit('windchime', {});
  }
}

// ---------------------------------------------------------------------------- scarecrow
class Scarecrow extends Fixture {
  constructor(g, spec) {
    super(g, spec);
    this.torn = false;
    this.whole = group();
    this.whole.add(cyl(0.05, 0.06, 2.0, C.woodDark, { y: 1.0, seg: 5 }));
    this.whole.add(cyl(0.04, 0.04, 1.6, C.woodDark, { y: 1.35, rz: Math.PI / 2, seg: 5 }));
    this.whole.add(cyl(0.28, 0.33, 0.7, '#5b7fae', { y: 1.15, seg: 8 }));
    this.whole.add(sphere(0.2, '#e3d4a8', { y: 1.72 }));
    this.whole.add(box(0.05, 0.05, 0.02, '#333', { x: 0.07, y: 1.75, z: 0.19 }));
    this.whole.add(box(0.05, 0.05, 0.02, '#333', { x: -0.07, y: 1.75, z: 0.19 }));
    this.whole.add(box(0.12, 0.02, 0.02, '#8a3a2a', { y: 1.65, z: 0.19 }));
    for (const s of [-1, 1]) this.whole.add(cone(0.08, 0.2, '#e3c77a', { x: s * 0.85, y: 1.35, rz: s * Math.PI / 2, seg: 5 }));
    this.whole.add(cone(0.25, 0.4, '#e3c77a', { y: 0.72, seg: 7, rx: Math.PI }));
    this.root.add(this.whole);
    this.wreck = group();
    this.wreck.add(cyl(0.05, 0.06, 2.0, C.woodDark, { y: 1.0, seg: 5 }));
    this.wreck.add(sphere(0.4, '#e3c77a', { y: 0.05, sy: 0.3, lo: true }));
    this.wreck.add(box(0.5, 0.05, 0.4, '#5b7fae', { x: 0.4, y: 0.03, ry: 0.5 }));
    this.wreck.visible = false;
    this.root.add(this.wreck);
    g.world.addCircle({ x: spec.x, z: spec.z, r: 0.22, top: 2.0, climb: 'pole', tag: 'scarecrow', perch: { x: spec.x, y: 2.05, z: spec.z } });
    this.tidyAct = 'repair';
    this.tidyTime = 6;
    this.tidyLine = 'My poor kakashi!';
  }
  tearInfo(p) {
    if (this.torn || !this.near(p, 1.3, 0.8)) return null;
    return { label: 'Tear the scarecrow apart', time: 1.4 };
  }
  tearComplete(p) {
    const g = this.g;
    if (this.torn) return;
    this.torn = true;
    this.whole.visible = false;
    this.wreck.visible = true;
    g.audio.sfx('tear', this.pos, 1);
    g.particles.confetti(this.pos.x, 1.2, this.pos.z, 40, ['#e3c77a', '#d9bb6a', '#c9a95a', '#5b7fae']);
    g.mischief('scarecrow', this.pos, { points: 180, label: 'Straw storm!', owner: 'farmer' });
    g.events.emit('scarecrowTorn', {});
    for (const it of g.items.items) {
      if (it.type === 'strawHat' && it.state === 'hanging' && dist2d(it.pos.x, it.pos.z, this.pos.x, this.pos.z) < 0.5) {
        it.loosen();
        it.state = 'air';
        it.sleeping = false;
      }
    }
  }
  needsTidy(npc) {
    return this.torn && npc.id === 'farmer';
  }
  tidy() {
    this.repair();
  }
  repair() {
    this.torn = false;
    this.whole.visible = true;
    this.wreck.visible = false;
  }
}

// ---------------------------------------------------------------------------- persimmon tree
class FruitTree extends Fixture {
  constructor(g, spec) {
    super(g, spec);
    this.fruit = 3;
    this.regrowT = 0;
  }
  onPerch(p, c) {
    if (dist2d(c.x ?? 0, c.z ?? 0, this.pos.x, this.pos.z) > 0.6) return;
    const g = this.g;
    if (this.fruit <= 0) return;
    for (let i = 0; i < this.fruit; i++) {
      const a = rand(0, Math.PI * 2);
      const it = g.items.spawn({ type: 'persimmon', x: this.pos.x + Math.cos(a) * 1.2, y: 3, z: this.pos.z + Math.sin(a) * 1.2 });
      it.state = 'air';
      it.sleeping = false;
      it.vel.set(Math.cos(a) * 1.5, 1, Math.sin(a) * 1.5);
    }
    this.fruit = 0;
    g.audio.sfx('rustle', this.pos, 1);
    g.particles.leaves(this.pos.x, 3, this.pos.z, 12, g.pal.green);
    g.events.emit('treeShake', {});
    g.ui.toast('Persimmons tumble out of the tree!', 'good');
  }
  update(dt) {
    if (this.fruit < 3) {
      this.regrowT += dt;
      if (this.regrowT > 60) {
        this.regrowT = 0;
        this.fruit++;
      }
    }
  }
}

// ---------------------------------------------------------------------------- well
class Well extends Fixture {
  constructor(g, spec) {
    super(g, spec);
    const m = group();
    m.add(cyl(0.8, 0.85, 0.85, C.stone, { y: 0.42, seg: 12 }));
    const inner = cyl(0.62, 0.62, 0.02, '#1c2226', { y: 0.86, seg: 12 });
    m.add(inner);
    for (const s of [-1, 1]) m.add(box(0.12, 2.1, 0.12, C.wood, { x: s * 0.75, y: 1.05 }));
    m.add(box(1.7, 0.1, 0.1, C.wood, { y: 2.0 }));
    m.add(prism(2.0, 0.5, 1.2, g.pal.roof, { y: 2.1 }));
    m.add(cyl(0.08, 0.08, 0.3, '#6b4a36', { y: 1.9, rz: Math.PI / 2, seg: 6 }));
    this.root.add(m);
    const c = g.world.addCircle({ x: spec.x, z: spec.z, r: 0.82, top: 0.88, walk: false, tag: 'well' });
    c.itemPass = true;
  }
  update() {
    const g = this.g;
    for (const it of g.items.items) {
      if (it.state !== 'air') continue;
      if (it.pos.y > 1.3 || it.pos.y < 0.3) continue;
      if (dist2d(it.pos.x, it.pos.z, this.pos.x, this.pos.z) > 0.62) continue;
      g.audio.sfx('plop', this.pos, 1);
      g.particles.splash(this.pos.x, 0.9, this.pos.z, 8);
      g.events.emit('wellDrop', { item: it });
      g.mischief('well', this.pos, { points: 80, label: 'Plop!', owner: it.owner, item: it });
      it.remove();
    }
    // things resting on the rim fall in
    for (const it of g.items.items) {
      if (it.state === 'rest' && it.pos.y > 0.7 && it.pos.y < 1 && dist2d(it.pos.x, it.pos.z, this.pos.x, this.pos.z) < 0.62) {
        it.state = 'air';
        it.sleeping = false;
      }
    }
  }
}

// ---------------------------------------------------------------------------- hideout stash
class Stash extends Fixture {
  constructor(g, spec) {
    super(g, spec);
    this.r = spec.r;
    const m = group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(spec.r, 0.32, 5, 20), mat('#d2b06a'));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.14;
    ring.castShadow = true;
    ring.receiveShadow = true;
    m.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(spec.r + 0.15, 0.18, 4, 20), mat('#b8944f'));
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 0.3;
    m.add(ring2);
    m.add(cyl(spec.r, spec.r, 0.06, '#c9a86a', { y: 0.03, seg: 20 }));
    // soft bed of leaves & straw
    const bedCols = ['#e0c07a', '#d9a441', '#c96a3a', '#b8944f', '#e8d39a'];
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * (spec.r - 0.3);
      m.add(box(0.28, 0.03, 0.12, bedCols[i % bedCols.length], { x: Math.cos(a) * r, y: 0.07 + Math.random() * 0.03, z: Math.sin(a) * r, ry: Math.random() * 3 }));
    }
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      m.add(cyl(0.025, 0.025, 1.0, '#8a6a44', { x: Math.cos(a) * (spec.r + 0.1), y: 0.28, z: Math.sin(a) * (spec.r + 0.1), rz: Math.cos(a + 1) * 1.25, rx: Math.sin(a) * 1.25, seg: 4 }));
    }
    // hollow log to sleep in
    const log = group({ x: -spec.r - 0.9, z: 0.6, ry: 0.5 });
    log.add(cyl(0.55, 0.55, 2.0, '#7a5a3c', { y: 0.55, rz: Math.PI / 2, seg: 10 }));
    log.add(cyl(0.4, 0.4, 2.02, '#3a2a1c', { y: 0.55, rz: Math.PI / 2, seg: 10 }));
    log.add(sphere(0.25, '#6f9a4a', { x: 0.3, y: 1.05, sy: 0.4, lo: true }));
    m.add(log);
    const sign = group({ x: spec.r + 0.8, z: -0.5, ry: -0.4 });
    sign.add(box(0.08, 1.1, 0.08, C.woodDark, { y: 0.55 }));
    sign.add(box(0.8, 0.45, 0.06, C.woodLight, { y: 1.05 }));
    m.add(sign);
    this.root.add(m);
    const txt = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshLambertMaterial({ map: TX.signTex('ひみつ基地', '#e8d3a8', '#5a3a28') }));
    txt.position.set(spec.r + 0.8 + Math.sin(-0.4) * 0.04, 1.05, -0.5 + Math.cos(-0.4) * 0.04);
    txt.rotation.y = -0.4;
    this.root.add(txt);
    this.glow = 0;
  }
  update(dt) {
    const g = this.g;
    for (const it of g.items.items) {
      const inside = dist2d(it.pos.x, it.pos.z, this.pos.x, this.pos.z) < this.r + 0.3;
      if (!it.stashed && inside && it.state === 'rest') {
        it.stashed = true;
        g.onStash(it);
      } else if (it.stashed && (!inside || it.state === 'gone' || it.state === 'held')) {
        it.stashed = false;
      }
    }
    if (Math.random() < dt * 0.6) g.particles.sparkle(this.pos.x + rand(-1.5, 1.5), 0.3, this.pos.z + rand(-1.5, 1.5), 1, '#fff6c0');
  }
}

// ---------------------------------------------------------------------------- public restroom
class Toilet extends Fixture {
  constructor(g, spec) {
    super(g, spec);
    this.busy = 0;
  }
  interactInfo(p) {
    if (!this.near(p, 1.3, 0.6) || p.held) return null;
    return { label: p.nature >= 40 ? 'Use the restroom (how civilized!)' : 'Restroom' };
  }
  interact(p) {
    const g = this.g;
    if (p.nature < 40) {
      g.ui.toast("You don't need to go yet. Maybe eat something first?", 'info');
      return;
    }
    p.state = 'drain';
    p.model.root.visible = false;
    this.busy = 2.6;
    g.audio.sfx('door', this.pos, 0.8);
  }
  update(dt) {
    if (this.busy <= 0) return;
    const g = this.g;
    this.busy -= dt;
    if (this.busy < 1.2 && !this.flushed) {
      this.flushed = true;
      g.audio.sfx('flush', this.pos, 1);
    }
    if (this.busy <= 0) {
      this.flushed = false;
      const p = g.player;
      p.state = 'move';
      p.teleport(this.pos.x - 0.6, this.pos.z);
      p.nature = 0;
      p.urgentT = 0;
      g.audio.sfx('door', this.pos, 0.8);
      g.particles.sparkle(p.pos.x, 0.6, p.pos.z, 14);
      g.ui.toast('How civilized! Even the townsfolk would be impressed.', 'good');
      g.events.emit('civilized', {});
      g.mischief('civilized', this.pos, { points: 200, label: 'So civilized!', silent: true });
    }
  }
}

// ---------------------------------------------------------------------------- onsen steam
class Steam extends Fixture {
  update(dt) {
    const g = this.g;
    const s = this.spec;
    const rate = g.pal.snow ? 7 : 3.5;
    if (Math.random() < dt * rate) {
      const a = rand(0, Math.PI * 2);
      const r = Math.sqrt(Math.random());
      g.particles.steam(s.x + Math.cos(a) * s.rx * r, 0.1, s.z + Math.sin(a) * s.rz * r, g.pal.snow ? 0.45 : 0.32);
    }
  }
}

// ---------------------------------------------------------------------------- koi
class Koi extends Fixture {
  constructor(g, spec) {
    super(g, spec);
    this.fish = [];
    const cols = [['#f08a24', '#ffffff'], ['#ffffff', '#d6452f'], ['#f2c238', '#f08a24'], ['#ffffff', '#1c1c1c'], ['#d6452f', '#ffffff']];
    for (let i = 0; i < spec.n; i++) {
      const f = group();
      f.add(sphere(0.12, cols[i][0], { sz: 2.4, sy: 0.5, smooth: true }));
      f.add(sphere(0.07, cols[i][1], { z: 0.05, y: 0.04, sz: 1.5, sy: 0.4 }));
      f.add(cone(0.08, 0.15, cols[i][0], { z: -0.32, rx: Math.PI / 2, seg: 4, sx: 0.3 }));
      f.position.y = 0.02;
      this.root.add(f);
      this.fish.push({ m: f, a: rand(0, 6), sp: rand(0.2, 0.4), rr: rand(0.4, 0.95) });
    }
    this.root.position.y = 0;
    this.feedT = 0;
    this.feedPt = null;
  }
  feed(x, z) {
    this.feedT = 6;
    this.feedPt = [x - this.pos.x, z - this.pos.z];
  }
  update(dt) {
    const s = this.spec;
    this.feedT -= dt;
    for (const f of this.fish) {
      f.a += f.sp * dt * (this.feedT > 0 ? 2 : 1);
      let x = Math.cos(f.a) * s.rx * f.rr;
      let z = Math.sin(f.a) * s.rz * f.rr;
      if (this.feedT > 0 && this.feedPt) {
        const fx = clamp(this.feedPt[0], -s.rx * 0.8, s.rx * 0.8);
        const fz = clamp(this.feedPt[1], -s.rz * 0.8, s.rz * 0.8);
        x = x * 0.3 + fx * 0.7;
        z = z * 0.3 + fz * 0.7;
      }
      const px = f.m.position.x;
      const pz = f.m.position.z;
      f.m.position.x += (x - px) * Math.min(1, dt * 2);
      f.m.position.z += (z - pz) * Math.min(1, dt * 2);
      const dx = f.m.position.x - px;
      const dz = f.m.position.z - pz;
      if (Math.abs(dx) + Math.abs(dz) > 1e-4) f.m.rotation.y = Math.atan2(dx, dz);
      f.m.children[2].rotation.y = Math.sin(this.g.time * 8 + f.a) * 0.5;
    }
  }
}

// ---------------------------------------------------------------------------- pigeons
let birdIdx = 0;
class Birds extends Fixture {
  constructor(g, spec) {
    super(g, { ...spec, key: birdIdx++ });
    this.birds = [];
    this.root.position.set(0, 0, 0);
    for (let i = 0; i < spec.n; i++) {
      const b = group();
      b.add(sphere(0.12, '#9a9ea8', { sz: 1.4, sy: 0.9, smooth: true }));
      b.add(sphere(0.07, '#6f7580', { y: 0.1, z: 0.12 }));
      b.add(cone(0.02, 0.06, '#e2a23a', { y: 0.09, z: 0.2, rx: Math.PI / 2, seg: 4 }));
      const wl = box(0.2, 0.02, 0.1, '#8a8e98', { x: -0.1, y: 0.03 });
      const wr = box(0.2, 0.02, 0.1, '#8a8e98', { x: 0.1, y: 0.03 });
      b.add(wl, wr);
      this.root.add(b);
      const hx = spec.x + rand(-2, 2);
      const hz = spec.z + rand(-2, 2);
      b.position.set(hx, 0.1, hz);
      this.birds.push({ m: b, wl, wr, hx, hz, state: 'peck', t: rand(0, 3), vx: 0, vy: 0, vz: 0 });
    }
    this.scaredT = 0;
  }
  scare(src) {
    const g = this.g;
    if (this.scaredT > 0) return;
    this.scaredT = 14;
    for (const b of this.birds) {
      const a = yawTo(src.x, src.z, b.m.position.x, b.m.position.z) + rand(-0.6, 0.6);
      b.state = 'fly';
      b.vx = Math.sin(a) * rand(4, 6);
      b.vz = Math.cos(a) * rand(4, 6);
      b.vy = rand(3, 5);
    }
    g.audio.sfx('flap', { x: this.spec.x, y: 0, z: this.spec.z }, 1);
    g.events.emit('birdsScatter', {});
    g.mischief('birds', { x: this.spec.x, y: 0, z: this.spec.z }, { points: 30, label: 'Flap flap!', silent: true });
  }
  onBark(p, d) {
    if (d < 12) this.scare(p.pos);
  }
  update(dt) {
    const g = this.g;
    const p = g.player;
    this.scaredT -= dt;
    if (p && this.scaredT <= 0 && dist2d(p.pos.x, p.pos.z, this.spec.x, this.spec.z) < 4 && Math.hypot(p.vel.x, p.vel.z) > 3) this.scare(p.pos);
    for (const b of this.birds) {
      if (b.state === 'fly') {
        b.m.position.x += b.vx * dt;
        b.m.position.y += b.vy * dt;
        b.m.position.z += b.vz * dt;
        b.m.rotation.y = Math.atan2(b.vx, b.vz);
        const f = Math.sin(g.time * 30) * 0.8;
        b.wl.rotation.z = f;
        b.wr.rotation.z = -f;
        if (this.scaredT < 6) {
          b.state = 'return';
        }
      } else if (b.state === 'return') {
        const dx = b.hx - b.m.position.x;
        const dz = b.hz - b.m.position.z;
        const d = Math.hypot(dx, dz);
        const f = Math.sin(g.time * 30) * 0.8;
        b.wl.rotation.z = f;
        b.wr.rotation.z = -f;
        if (d < 0.3) {
          b.m.position.set(b.hx, 0.1, b.hz);
          b.state = 'peck';
          b.wl.rotation.z = 0;
          b.wr.rotation.z = 0;
        } else {
          const sp = Math.min(d, 6 * dt);
          b.m.position.x += (dx / d) * sp;
          b.m.position.z += (dz / d) * sp;
          b.m.position.y = Math.max(0.1, Math.min(b.m.position.y, d * 0.5));
          b.m.rotation.y = Math.atan2(dx, dz);
        }
      } else {
        b.t -= dt;
        if (b.t <= 0) {
          b.t = rand(0.5, 2.5);
          if (Math.random() < 0.4) {
            b.hx = this.spec.x + rand(-2.2, 2.2);
            b.hz = this.spec.z + rand(-2.2, 2.2);
          }
        }
        const dx = b.hx - b.m.position.x;
        const dz = b.hz - b.m.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.05) {
          b.m.position.x += (dx / d) * Math.min(d, dt * 0.6);
          b.m.position.z += (dz / d) * Math.min(d, dt * 0.6);
          b.m.rotation.y = Math.atan2(dx, dz);
        }
        b.m.rotation.x = Math.max(0, Math.sin(g.time * 6 + b.hx)) * 0.5;
      }
    }
  }
}

// ---------------------------------------------------------------------------- jizo hat stands
let hsIdx = 0;
class HatStand extends Fixture {
  constructor(g, spec) {
    super(g, { ...spec, key: hsIdx++ });
    this.hatItem = null;
  }
  useInfo(p, item) {
    if (!item.def.hat || this.hatItem || !this.near(p, 1.25, 0.6)) return null;
    return { label: `Put the ${item.name.toLowerCase()} on the Jizo statue` };
  }
  use(p, item) {
    const g = this.g;
    p.held = null;
    item.detach();
    item.heldBy = null;
    item.state = 'hanging';
    item.pos.set(this.pos.x, this.spec.y - 0.02, this.pos.z);
    item.mesh.position.copy(item.pos);
    item.yaw = 0;
    item.mesh.rotation.set(0, 0, 0);
    item.body.rotation.set(0, 0, 0);
    this.hatItem = item;
    g.particles.hearts(this.pos.x, 1.4, this.pos.z, 4);
    g.audio.sfx('chime', this.pos, 0.8);
    g.ui.toast('The Jizo looks warmer already. (Just like the old Kasa-Jizo tale!)', 'good');
    g.events.emit('jizoHat', { item });
    g.mischief('jizoHat', this.pos, { points: 150, label: 'Kasa Jizo!', silent: true });
  }
  update() {
    if (this.hatItem && (this.hatItem.state !== 'hanging' || this.hatItem.gone)) this.hatItem = null;
  }
}

// ---------------------------------------------------------------------------- omikuji fortunes
class Omikuji extends Fixture {
  constructor(g, spec) {
    super(g, spec);
    const m = group();
    for (const s of [-1, 1]) m.add(box(0.12, 1.5, 0.12, C.wood, { x: s * 1.05, y: 0.75 }));
    for (let r = 0; r < 3; r++) m.add(box(2.2, 0.03, 0.03, '#d9c18a', { y: 0.6 + r * 0.35 }));
    this.knots = group();
    for (let r = 0; r < 3; r++) for (let i = 0; i < 12; i++) this.knots.add(box(0.07, 0.12, 0.05, '#fbf7ec', { x: -0.95 + i * 0.17 + rand(-0.03, 0.03), y: 0.6 + r * 0.35, z: rand(-0.02, 0.02) }));
    m.add(this.knots);
    // fortune box
    m.add(box(0.35, 0.5, 0.35, '#c9412f', { x: 1.5, y: 0.25 }));
    m.add(box(0.36, 0.08, 0.36, '#f0c23a', { x: 1.5, y: 0.52 }));
    this.root.add(m);
    g.world.addBoxC(spec.x, spec.z, 2.3, 0.25, 1.5, { opaque: false, tag: 'omikuji' });
    g.world.addBoxC(spec.x + 1.5, spec.z, 0.35, 0.35, 0.55, { walk: true, opaque: false, tag: 'omikujibox' });
    this.draws = 6;
    this.torn = false;
    this.tidyAct = 'repair';
    this.tidyTime = 4;
    this.tidyLine = 'The fortunes! How unlucky...';
  }
  interactInfo(p) {
    if (p.held || this.draws <= 0) return null;
    if (dist2d(p.pos.x, p.pos.z, this.pos.x + 1.5, this.pos.z) > 1.2) return null;
    return { label: 'Draw a fortune (omikuji)' };
  }
  interact(p) {
    const g = this.g;
    p.startAction('tug', 0.7, {
      target: this, label: 'Shaking the box...', lockMove: true, anim: 'tear',
      onDone: () => {
        this.draws--;
        const f = pick(FORTUNES);
        const it = g.items.spawn({ type: 'omikuji', x: p.pos.x, y: p.pos.y + 0.5, z: p.pos.z, owner: null });
        p.pickUp(it);
        g.audio.sfx('chime', this.pos, 0.8);
        g.ui.fortune(f);
        g.events.emit('fortune', { f });
      },
    });
  }
  tearInfo(p) {
    if (this.torn || !this.near(p, 1.5, 0.8)) return null;
    return { label: 'Tear down the fortunes', time: 1.1 };
  }
  tearComplete() {
    const g = this.g;
    if (this.torn) return;
    this.torn = true;
    this.knots.visible = false;
    g.audio.sfx('tear', this.pos, 1);
    g.particles.confetti(this.pos.x, 1, this.pos.z, 40, ['#fbf7ec', '#ffffff', '#f0e8d8']);
    g.mischief('omikuji', this.pos, { points: 130, label: 'Bad luck!', owner: 'priest' });
    g.events.emit('omikujiTorn', {});
  }
  needsTidy(npc) {
    return this.torn && npc.id === 'priest';
  }
  tidy() {
    this.repair();
  }
  repair() {
    this.torn = false;
    this.knots.visible = true;
  }
}

// ---------------------------------------------------------------------------- shoji screen panels
class Shoji extends Fixture {
  constructor(g, spec) {
    super(g, { ...spec, key: spec.i });
    this.torn = false;
    this.mat = new THREE.MeshLambertMaterial({ map: TX.shojiTex(false) });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.2), this.mat);
    m.position.set(0, 1.62, 0);
    this.root.add(m);
    this.root.add(box(3.7, 0.08, 0.06, C.woodDark, { y: 2.72 }));
    this.root.add(box(3.7, 0.08, 0.06, C.woodDark, { y: 0.52 }));
    this.pos.y = 0.5;
    this.tidyAct = 'repair';
    this.tidyTime = 5;
    this.tidyLine = 'Ara ara... my shoji!';
  }
  tearInfo(p) {
    if (this.torn) return null;
    if (Math.abs(p.pos.x - this.pos.x) > 1.6 || p.pos.z < this.pos.z || p.pos.z - this.pos.z > 1.3) return null;
    return { label: 'Poke a hole in the paper screen', time: 0.5 };
  }
  tearComplete() {
    const g = this.g;
    if (this.torn) return;
    this.torn = true;
    this.mat.map = TX.shojiTex(true);
    this.mat.needsUpdate = true;
    g.audio.sfx('rip', this.pos, 1);
    g.particles.confetti(this.pos.x, 1.4, this.pos.z + 0.2, 20, ['#f6f1e3', '#ffffff']);
    g.mischief('shoji', this.pos, { points: 150, label: 'Poke!', owner: 'grandma' });
    g.events.emit('shojiTear', { i: this.spec.i });
  }
  hitTest(it) {
    return !this.torn && Math.abs(it.pos.x - this.pos.x) < 1.7 && Math.abs(it.pos.z - this.pos.z) < 0.4 && it.pos.y > 0.5 && it.pos.y < 2.7;
  }
  onItemHit() {
    this.tearComplete();
  }
  needsTidy(npc) {
    return this.torn && npc.id === 'grandma';
  }
  get tidyPoint() {
    return { x: this.pos.x, z: this.pos.z + 1.6 };
  }
  tidy() {
    this.torn = false;
    this.mat.map = TX.shojiTex(false);
    this.mat.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------- honour-system coin box
class CoinBox extends Fixture {
  constructor(g, spec) {
    super(g, spec);
    this.root.add(box(0.25, 0.3, 0.2, '#6b8fb3', { y: 0.15 }));
    this.coins = 3;
  }
  interactInfo(p) {
    if (p.held || this.coins <= 0 || !this.near(p, 1.2, 1.2)) return null;
    return { label: 'Shake the honesty box' };
  }
  interact(p) {
    const g = this.g;
    p.startAction('rummage', p.c.rummageTime, {
      target: this, label: 'Shaking...', lockMove: true, anim: 'tear',
      onDone: () => {
        this.coins--;
        const it = g.items.spawn({ type: 'coin', x: this.pos.x, y: this.pos.y + 0.4, z: this.pos.z + 0.3 });
        it.state = 'air';
        it.sleeping = false;
        it.vel.set(rand(-0.5, 0.5), 2.5, 1.5);
        g.audio.sfx('coin', this.pos, 1);
        g.mischief('coinbox', this.pos, { points: 40, label: 'Dishonest!', silent: true });
      },
    });
  }
}

// ---------------------------------------------------------------------------- poop (nature's call)
export class Poop extends Fixture {
  constructor(g, spec) {
    super(g, { ...spec, type: 'poop' });
    const m = group();
    m.add(cyl(0.13, 0.15, 0.07, '#7a5236', { y: 0.035, seg: 10 }));
    m.add(cyl(0.09, 0.12, 0.07, '#7f5639', { y: 0.1, seg: 10 }));
    m.add(cone(0.08, 0.1, '#86603f', { y: 0.18, seg: 10 }));
    this.mesh = m;
    this.root.add(m);
    this.x = spec.x;
    this.z = spec.z;
    this.squished = false;
    this.life = 150;
    this.hidden = spec.hidden;
    this.tidyAct = 'sweep';
    this.tidyTime = 3;
    this.tidyLine = 'Ugh. Wild animals...';
    if (spec.hidden) this.mesh.scale.setScalar(0.8);
  }
  squish(npc) {
    this.squished = true;
    this.mesh.scale.set(1.6, 0.25, 1.6);
    this.life = Math.min(this.life, 12);
  }
  update(dt) {
    const g = this.g;
    this.life -= dt;
    if (!this.squished && Math.random() < dt * 1.2) g.particles.stink(this.x, this.pos.y + 0.25, this.z);
    if (this.life <= 0) g.removePoop(this);
  }
}

// ---------------------------------------------------------------------------- the bus
export class Bus extends Fixture {
  constructor(g) {
    super(g, { type: 'bus', x: 90, z: 1.5 });
    const m = group();
    m.add(box(8.5, 2.6, 2.4, '#e9e6de', { y: 1.6 }));
    m.add(box(8.52, 0.5, 2.42, '#2f8a5a', { y: 0.85 }));
    m.add(box(8.52, 0.12, 2.42, '#f2c230', { y: 1.2 }));
    m.add(box(8.3, 0.8, 2.44, '#9fc3d8', { y: 2.2 }));
    m.add(box(0.1, 1.0, 2.2, '#9fc3d8', { x: -4.26, y: 2.1 }));
    m.add(box(8.6, 0.12, 2.5, '#d8d4ca', { y: 2.95 }));
    for (const sx of [-2.8, 2.8]) for (const sz of [-1.15, 1.15]) {
      const w = cyl(0.45, 0.45, 0.3, '#2d2a28', { x: sx, y: 0.45, z: sz, rx: Math.PI / 2, seg: 10 });
      m.add(w);
    }
    this.door = box(0.9, 1.9, 0.06, '#5a6a78', { x: -3.0, y: 1.3, z: 1.23 });
    m.add(this.door);
    m.add(box(0.8, 0.35, 0.05, '#1c1c1c', { x: -4.27, y: 2.6, rz: 0, ry: Math.PI / 2 }));
    this.root.add(m);
    this.mesh = m;
    this.x = 90;
    this.z = 1.5;
    this.state = 'away';
    this.t = 40;
    this.speed = 0;
    this.col = { kind: 'box', minX: 0, maxX: 0, minZ: 0, maxZ: 0, top: 3, walk: true, climb: 'wall', opaque: true, block: true, tag: 'bus', stamp: 0 };
    this.stopX = 15.5;
    this.honkT = 0;
    this.carrying = null;
    this.trips = 0;
    this.blockT = 0;
    this.noBoard = false;
  }
  setCol() {
    this.col.minX = this.x - 4.3;
    this.col.maxX = this.x + 4.3;
    this.col.minZ = this.z - 1.2;
    this.col.maxZ = this.z + 1.2;
  }
  blocked() {
    const g = this.g;
    const fx = this.x - 4.3;
    const check = (x, z, y) => x < fx + 0.5 && x > fx - 3.0 && Math.abs(z - this.z) < 1.4 && y < 1.5;
    if (g.player && check(g.player.pos.x, g.player.pos.z, g.player.pos.y)) return 'player';
    for (const n of g.npcs) if (n.active && check(n.pos.x, n.pos.z, 0)) return n;
    return null;
  }
  update(dt) {
    const g = this.g;
    this.honkT -= dt;
    this.t -= dt;
    let target = 0;
    switch (this.state) {
      case 'away':
        this.x = 95;
        this.root.visible = false;
        if (this.t <= 0) {
          this.state = 'arriving';
          this.root.visible = true;
          g.audio.sfx('busEngine', { x: 60, y: 0, z: 1.5 }, 0.6);
          if (g.player && dist2d(g.player.pos.x, g.player.pos.z, this.stopX, 4) < 30) g.ui.toast('🚌 The bus is coming!', 'info', 2500);
          if (!g.world.dynamic.includes(this.col)) g.world.dynamic.push(this.col);
        }
        break;
      case 'arriving': {
        const d = this.x - this.stopX;
        target = Math.min(9, Math.max(1.2, d * 0.8));
        if (d < 0.1) {
          this.state = 'stopped';
          this.t = 7;
          this.speed = 0;
          this.x = this.stopX;
          g.audio.sfx('busDoor', this.pos, 1);
          g.events.emit('busArrive', {});
          this.dropOff();
        }
        break;
      }
      case 'stopped':
        target = 0;
        this.door.position.x = -3.0 + Math.min(1, 7 - this.t) * 0.9;
        this.board(dt);
        if (this.t <= 0) {
          this.state = 'leaving';
          this.door.position.x = -3.0;
          g.audio.sfx('busDoor', this.pos, 0.8);
          this.depart();
        }
        break;
      case 'leaving':
        target = 9;
        if (this.x < -95) {
          this.state = 'away';
          this.t = 70 + Math.random() * 30;
          const i = g.world.dynamic.indexOf(this.col);
          if (i >= 0) g.world.dynamic.splice(i, 1);
          this.trips++;
        }
        break;
      default:
        break;
    }
    if (this.state === 'arriving' || this.state === 'leaving') {
      const b = this.blocked();
      if (b) {
        this.blockT += dt;
        // townsfolk get out of the way after a honk or two; the player can hold it up longer
        if (b !== 'player' && this.blockT > 2.5) {
          target = 1.5;
          const away = b.pos.z > this.z ? 1 : -1;
          b.pos.z = this.z + away * 1.9;
        } else target = 0;
        if (this.honkT <= 0) {
          this.honkT = 1.6;
          g.audio.sfx('busHorn', { x: this.x, y: 0, z: this.z }, 1);
          if (b === 'player') {
            g.events.emit('busBlocked', {});
            g.mischief('busBlock', { x: this.x - 5, y: 0, z: this.z }, { points: 60, label: 'Traffic jam!', silent: true });
          } else if (b.say) b.say(pick(['Sorry, sorry!', 'Oops!', 'Excuse me!']), 1.5);
        }
      } else this.blockT = 0;
    }
    this.speed += (target - this.speed) * Math.min(1, dt * 1.5);
    this.x -= this.speed * dt;
    this.pos.set(this.x, 0, this.z);
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = 0;
    this.setCol();
    // shove the player out of the way
    const p = g.player;
    if (p && this.root.visible && p.pos.y < 2.8 && p.pos.x > this.col.minX - p.radius && p.pos.x < this.col.maxX + p.radius && Math.abs(p.pos.z - this.z) < 1.2 + p.radius && this.speed > 1 && p.state !== 'stunned') {
      p.stun(0.6, -this.speed * 0.8, p.pos.z > this.z ? 4 : -4);
    }
    // the player can ride on the roof! carry them along
    if (p && this.root.visible && p.pos.y > 2.8 && p.pos.x > this.col.minX && p.pos.x < this.col.maxX && Math.abs(p.pos.z - this.z) < 1.2) {
      p.pos.x -= this.speed * dt;
      if (this.state === 'leaving' && this.x < -40) g.events.emit('busRide', {});
    }
  }
  board() {
    const g = this.g;
    const s = g.npcById('salary');
    if (!s || !s.active || this.carrying || this.noBoard) return;
    // he only hops on if he's free while the doors are opening (first few seconds)
    if (this.t < 3.8) return;
    if (s.mode === 'routine' && dist2d(s.pos.x, s.pos.z, this.stopX - 3, 3.4) < 8) {
      s.setMode('boardBus', { bus: this, x: this.stopX - 3, z: 2.9 });
    }
  }
  takeAboard(s) {
    const g = this.g;
    if (this.state !== 'stopped' || this.carrying) return false;
    if (s.held) s.putBack(s.held.type);
    if (s.held) s.dropHeld(false);
    s.active = false;
    s.model.root.visible = false;
    s.setMode('bus');
    this.carrying = s;
    g.events.emit('salaryBoard', {});
    return true;
  }
  depart() {
    const g = this.g;
    const s = g.npcById('salary');
    if (this.noBoard) {
      this.noBoard = false;
      return;
    }
    if (s && !this.carrying && s.active && s.mode !== 'bus') {
      s.say('missed', 3);
      s.interrupt('giveup', { x: this.x, z: this.z });
      g.events.emit('missedBus', {});
      g.mischief('missBus', s.pos, { points: 300, label: 'Missed the bus!', silent: true });
      g.ui.toast('Mr. Suzuki missed his bus!', 'good');
    }
  }
  dropOff() {
    const g = this.g;
    const s = this.carrying;
    if (s) {
      this.carrying = null;
      s.active = true;
      s.model.root.visible = true;
      s.pos.set(this.stopX - 3, 0, 3.2);
      s.setMode('routine');
      s.stepI = 0;
      s.say(pick(['Forgot my briefcase again...', 'Wrong bus. Again.', 'Meeting cancelled!']), 2.5);
      this.noBoard = true;
    }
  }
}

const TYPES = {
  leafpile: LeafPile,
  bell: BellRope,
  offering: OfferingBox,
  vending: Vending,
  trash: TrashBin,
  drain: Drain,
  taiko: Taiko,
  windchime: WindChime,
  scarecrow: Scarecrow,
  fruittree: FruitTree,
  well: Well,
  stash: Stash,
  toilet: Toilet,
  steam: Steam,
  koi: Koi,
  birds: Birds,
  hatstand: HatStand,
  omikuji: Omikuji,
  shoji: Shoji,
  coinbox: CoinBox,
};

export function createFixture(g, spec) {
  const Cls = TYPES[spec.type];
  if (!Cls) {
    console.warn('unknown fixture', spec.type);
    return null;
  }
  return new Cls(g, spec);
}

export function resetFixtureCounters() {
  vendIdx = 0;
  binIdx = 0;
  birdIdx = 0;
  hsIdx = 0;
}
