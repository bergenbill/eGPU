import * as THREE from 'three';
import { buildHuman, animateHuman } from './humanModels.js';
import { clamp, damp, dampAngle, wrapAngle, yawTo, angleOff, dist2d, rand, pick } from '../core/math.js';

const PRIORITY = {
  routine: 0, watch: 1, investigate: 2, tidy: 2, retrieve: 3, return: 3, shoo: 3, search: 4,
  giveup: 5, tired: 5, disgusted: 5, fear: 6, chase: 6, startled: 7, bucket: 8, bus: 9, boardBus: 1,
};

export class NPC {
  constructor(g, def) {
    this.g = g;
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.model = buildHuman(def.look);
    g.scene.add(this.model.root);
    const home = g.poi[def.home];
    this.pos = new THREE.Vector3(home[0], 0, home[1]);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.radius = 0.36;
    this.height = this.model.height;
    this.active = true;
    this.ghost = false;
    this.mode = 'routine';
    this.modeT = 0;
    this.data = {};
    this.stepI = Math.floor(g.rng.range(0, def.routine.length));
    this.stepPhase = 'go';
    this.stepT = 0;
    this.stepDur = 0;
    this.path = null;
    this.pathI = 0;
    this.pathGoal = null;
    this.repathT = 0;
    this.stuckT = 0;
    this.lastPos = this.pos.clone();
    this.awareness = 0;
    this.noticeCD = 0;
    this.lookYaw = 0;
    this.lookT = rand(3, 7);
    this.lookAnimT = 0;
    this.wariness = 0;
    this.held = null;
    this.icon = null;
    this.iconT = 0;
    this.bubble = null;
    this.bubbleT = 0;
    this.percT = Math.random() * 0.1;
    this.retrieveT = Math.random();
    this.tidyT = Math.random();
    this.fearT = 0;
    this.sleeping = false;
    this.pose = { act: null, speed: 0, run: 0, phase: 0, look: 0, holding: false, squash: 0, seated: false };
    this.seatBlend = 0;
    this.carryAnchor = new THREE.Group();
    this.carryAnchor.position.set(0, 1.15, 0.42);
    this.model.root.add(this.carryAnchor);
    this.sinceSawPlayer = 99;
    this.chaseCount = 0;
    this.setProps(null);
    this.syncModel(0.016);
  }

  get species() {
    return this.g.player ? (this.g.player.id === 'monkey' ? 'monkey' : 'raccoon') : 'critter';
  }
  get diff() {
    return this.g.diff;
  }

  pt(at) {
    if (typeof at === 'string') {
      const p = this.g.poi[at];
      if (!p) console.warn('missing poi', at);
      return p || [0, 0];
    }
    return at;
  }

  // ------------------------------------------------------------------ speech & icons
  say(key, dur = 2.6, vars = {}) {
    let text = key;
    const lines = this.def.lines[key];
    if (lines) text = pick(lines);
    text = text.replace('{animal}', vars.animal || this.species).replace('{item}', vars.item || 'thing');
    this.bubble = text;
    this.bubbleT = dur;
    const mood = key === 'thief' || key === 'hit' || key === 'missed' || key === 'caught' ? 'shout' : key === 'giveup' ? 'grumble' : key === 'happy' ? 'happy' : 'talk';
    this.g.audio.voice(this.def.voice, mood, this.pos);
  }
  setIcon(txt, dur = 1.5) {
    this.icon = txt;
    this.iconT = dur;
  }

  setProps(name) {
    for (const [k, p] of Object.entries(this.model.props)) {
      if (k === 'bucketHead') continue;
      p.visible = k === name;
    }
  }

  // ------------------------------------------------------------------ mode control
  setMode(mode, data = {}) {
    if (this.mode === 'chase' && mode !== 'chase') this.g.onChaseEnd(this);
    this.mode = mode;
    this.modeT = 0;
    this.data = data;
    this.path = null;
    this.sleeping = false;
    if (mode !== 'routine') this.leaveSeat();
    if (mode === 'routine') this.stepPhase = 'go';
  }

  canInterrupt(mode) {
    return (PRIORITY[mode] ?? 0) >= (PRIORITY[this.mode] ?? 0);
  }

  interrupt(mode, data) {
    if (!this.active) return false;
    if (!this.canInterrupt(mode)) return false;
    if (this.mode === 'routine' && this.curStep && this.curStep.bath && this.stepPhase === 'do') {
      this.leaveBath(mode);
    }
    this.setMode(mode, data);
    return true;
  }

  leaveBath() {
    // Grandpa hops out of the hot spring
    this.g.events.emit('grandpaOut', { npc: this });
    this.stepI = (this.stepI + 1) % this.def.routine.length;
    this.stepPhase = 'go';
  }

  leaveSeat() {
    this.seatBlend = 0;
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    if (!this.active) return;
    const g = this.g;
    this.modeT += dt;
    this.iconT -= dt;
    if (this.iconT <= 0) this.icon = null;
    this.bubbleT -= dt;
    if (this.bubbleT <= 0) this.bubble = null;
    this.noticeCD -= dt;
    this.fearT -= dt;
    this.sinceSawPlayer += dt;
    this.wariness = Math.max(0, this.wariness - dt / 70);

    this.percT -= dt;
    if (this.percT <= 0) {
      const step = 0.1;
      this.percT = step;
      this.perceive(step);
    }

    let act = null;
    let speed = 0;
    switch (this.mode) {
      case 'routine':
        [act, speed] = this.updateRoutine(dt);
        break;
      case 'watch': {
        const p = g.player;
        this.faceTo(p.pos.x, p.pos.z, dt, 8);
        act = 'lookaround';
        if (this.modeT > 1.6) this.setMode('routine');
        break;
      }
      case 'shoo': {
        const p = g.player;
        act = 'wave';
        const d = dist2d(this.pos.x, this.pos.z, p.pos.x, p.pos.z);
        if (d > 1.4 && this.modeT < 1.6 && !p.unreachable) {
          this.goTo(p.pos.x, p.pos.z, this.def.walk * 1.4, dt, 1.2);
          speed = this.def.walk * 1.4;
        } else this.faceTo(p.pos.x, p.pos.z, dt, 8);
        if (d < 1.1 && !p.unreachable && !p.busy) {
          const nx = (p.pos.x - this.pos.x) / (d || 1);
          const nz = (p.pos.z - this.pos.z) / (d || 1);
          p.stun(0.4, nx * 5, nz * 5);
          g.audio.sfx('shove', p.pos, 0.6);
          this.setMode('routine');
        }
        if (this.modeT > 2.5) this.setMode('routine');
        break;
      }
      case 'investigate':
        [act, speed] = this.updateInvestigate(dt);
        break;
      case 'chase':
        [act, speed] = this.updateChase(dt);
        break;
      case 'search':
        act = 'lookaround';
        this.lookYaw = Math.sin(this.modeT * 2.2) * 1.3;
        if (this.modeT > 3) {
          this.lookYaw = 0;
          this.setMode('routine');
        }
        break;
      case 'giveup':
        act = 'fist';
        if (this.data.x !== undefined) this.faceTo(this.data.x, this.data.z, dt, 6);
        if (this.modeT > 2.2) this.setMode('routine');
        break;
      case 'tired':
        act = 'pant';
        if (this.modeT > 2.2) this.setMode('routine');
        break;
      case 'startled':
        act = 'startle';
        this.pose.squash = Math.max(0, 1 - this.modeT * 3);
        if (this.modeT > (this.data.dur || 0.9)) this.afterStartle();
        break;
      case 'bucket':
        [act, speed] = this.updateBucket(dt);
        break;
      case 'disgusted':
        [act, speed] = this.updateDisgusted(dt);
        break;
      case 'fear': {
        const p = g.player;
        act = 'scared';
        const away = yawTo(p.pos.x, p.pos.z, this.pos.x, this.pos.z);
        if (this.modeT < 1.8) {
          this.moveDir(away, this.def.walk * 1.2, dt, true);
          speed = this.def.walk;
        }
        if (this.modeT > 2.2) this.setMode('routine');
        break;
      }
      case 'retrieve':
        [act, speed] = this.updateRetrieve(dt);
        break;
      case 'return':
        [act, speed] = this.updateReturn(dt);
        break;
      case 'tidy':
        [act, speed] = this.updateTidy(dt);
        break;
      case 'bus':
        return;
      case 'boardBus': {
        const d = this.data;
        speed = this.def.walk * 1.7;
        act = this.held ? 'holdR' : null;
        if (d.bus.state !== 'stopped') {
          this.setMode('routine');
          break;
        }
        if (this.goTo(d.x, d.z, speed, dt, 0.7)) d.bus.takeAboard(this);
        break;
      }
      default:
        this.setMode('routine');
    }

    // head look-arounds while idle-ish
    if (this.mode === 'routine' && this.stepPhase === 'do' && this.curStep && this.curStep.look && !this.sleeping) {
      this.lookT -= dt;
      if (this.lookT <= 0) {
        this.lookAnimT = 2.4;
        this.lookT = rand(4, 9) / (1 + this.wariness * 0.5) / (this.def.vigilant ? 1.5 : 1);
      }
    }
    if (this.lookAnimT > 0) {
      this.lookAnimT -= dt;
      const k = 1 - this.lookAnimT / 2.4;
      this.lookYaw = Math.sin(k * Math.PI * 2) * 1.5;
      if (this.lookAnimT <= 0) this.lookYaw = 0;
    } else if (this.mode !== 'search' && this.mode !== 'investigate') {
      this.lookYaw = damp(this.lookYaw, 0, 4, dt);
    }

    // poop underfoot
    if (speed > 0.3) {
      for (const poop of g.poops) {
        if (poop.squished) continue;
        if (dist2d(poop.x, poop.z, this.pos.x, this.pos.z) < 0.45) this.stepInPoop(poop);
      }
    }

    // keep separated from each other
    for (const o of g.npcs) {
      if (o === this || !o.active || o.ghost) continue;
      const dx = this.pos.x - o.pos.x;
      const dz = this.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.7 && d > 1e-3) {
        const push = (0.7 - d) * 0.5;
        this.pos.x += (dx / d) * push;
        this.pos.z += (dz / d) * push;
      }
    }

    this.pose.act = act;
    this.pose.targetSpeed = speed;
    this.syncModel(dt);
  }

  // ------------------------------------------------------------------ routine
  get curStep() {
    return this.def.routine[this.stepI];
  }

  updateRoutine(dt) {
    const g = this.g;
    const st = this.curStep;
    const at = this.pt(st.at);
    // officer answers reports when the town is on alert
    if (this.def.officer && g.heat >= 2 && g.lastMischief && g.time - g.lastMischief.t < 25 && this.data.reportT !== g.lastMischief.t) {
      this.data.reportT = g.lastMischief.t;
      this.interrupt('investigate', { x: g.lastMischief.x, z: g.lastMischief.z, run: true, report: true, dur: 4 });
      g.audio.sfx('whistle', this.pos, 0.6);
      this.say('Reports of a rascal...', 2.2);
      return ['lookaround', 0];
    }
    if (this.stepPhase === 'go') {
      if (st.prop) this.setProps(st.prop);
      else this.setProps(this.def.officer ? 'net' : null);
      const arrived = this.goTo(at[0], at[1], this.def.walk, dt, 0.4);
      if (arrived) {
        this.stepPhase = 'do';
        this.stepT = 0;
        this.stepDur = rand(st.dur[0], st.dur[1]);
        this.sleeping = false;
        if (st.grab) this.tryGrab(st.grab);
        if (st.nap && Math.random() < st.nap && !this.def.officer) this.sleeping = true;
        this.hook(st, 'start');
      }
      return [this.held ? (this.held.light ? 'holdR' : 'carry') : null, this.def.walk];
    }
    // do
    this.stepT += dt;
    if (st.seat) {
      this.seatBlend = Math.min(1, this.seatBlend + dt * 3);
      this.pos.x = damp(this.pos.x, st.seat[0], 10, dt);
      this.pos.z = damp(this.pos.z, st.seat[1], 10, dt);
    }
    if (st.face !== undefined) {
      const fy = Array.isArray(st.face) ? yawTo(this.pos.x, this.pos.z, st.face[0], st.face[1]) : st.face;
      this.yaw = dampAngle(this.yaw, fy, 6, dt);
    }
    this.hook(st, 'tick', dt);
    if (this.stepT >= this.stepDur) {
      if (st.put) this.putBack(st.put);
      this.hook(st, 'end');
      if (st.seat) {
        const a = this.pt(st.at);
        this.pos.x = a[0];
        this.pos.z = a[1];
      }
      this.sleeping = false;
      this.stepI = (this.stepI + 1) % this.def.routine.length;
      this.stepPhase = 'go';
    }
    let act = st.act;
    if (this.sleeping) act = st.bath ? 'bathe' : 'sleep';
    if (act === 'drink' && st.seated) this.pose.seated = true;
    else this.pose.seated = false;
    return [act, 0];
  }

  hook(st, phase, dt) {
    const g = this.g;
    const h = st.hook;
    if (!h) return;
    const fx = (key) => g.fixtureByKey(key);
    switch (h) {
      case 'sweepA':
      case 'sweepB':
        if (phase === 'tick') {
          const pile = fx('leafpile' + h.slice(-1));
          if (pile) pile.regrow(dt / 8);
          if (Math.random() < dt * 2) g.audio.sfx('sweep', this.pos, 0.25);
        }
        break;
      case 'scarecrow':
        if (phase === 'end') {
          const s = fx('scarecrow');
          if (s && s.torn) s.repair();
        }
        break;
      case 'offering':
        if (phase === 'end') {
          const o = fx('offering');
          if (o) o.refill();
        }
        break;
      case 'ringBell':
        if (phase === 'end') {
          const b = fx('bell');
          if (b) b.ring(this, true);
        }
        break;
      case 'omikuji':
        if (phase === 'end') {
          const o = fx('omikuji');
          if (o) o.repair();
        }
        break;
      case 'irasshai':
        if (phase === 'start') this.say('happy', 2.6);
        break;
      case 'phone':
        if (phase === 'start') this.say('happy', 3);
        break;
      case 'futonBeat':
        if (phase === 'tick' && Math.random() < dt * 3) g.audio.sfx('thwack', this.pos, 0.5);
        break;
      case 'buyCoffee':
        if (phase === 'end') g.audio.sfx('vend', this.pos, 0.5);
        break;
      case 'feedKoi':
        if (phase === 'start') {
          const k = fx('koi');
          if (k) k.feed(this.pos.x, this.pos.z);
        }
        break;
      default:
        break;
    }
  }

  tryGrab(type) {
    const g = this.g;
    if (this.held) return;
    const it = g.items.items.find((i) => i.type === type && i.owner === this.id && i.free && i.atHome(1.2) && dist2d(i.pos.x, i.pos.z, this.pos.x, this.pos.z) < 3.5);
    if (it) {
      this.hold(it);
    } else {
      const any = g.items.items.find((i) => i.type === type && i.owner === this.id);
      if (any) {
        this.say('missing', 2.4, { item: any.name.toLowerCase() });
        this.setIcon('?', 2);
        this.wariness = Math.min(3, this.wariness + 0.3);
      }
    }
  }

  putBack(type) {
    if (this.held && this.held.type === type) {
      const it = this.held;
      this.releaseHeld();
      it.resetHome();
    }
  }

  // ------------------------------------------------------------------ perception
  eye() {
    return this.pos.y + this.height * 0.93;
  }

  visionRange() {
    let r = this.def.vision * this.diff.vision * (1 + this.wariness * 0.12);
    if (this.sleeping) r *= 0.12;
    if (this.mode === 'routine' && this.curStep?.bath) r *= 0.75;
    if (this.mode === 'disgusted') r *= 0.5;
    if (this.mode === 'bucket') r = 0;
    return r;
  }

  canSeePlayer(full = false) {
    const g = this.g;
    const p = g.player;
    if (!p || p.state === 'drain' || p.state === 'caught') return false;
    const d = dist2d(this.pos.x, this.pos.z, p.pos.x, p.pos.z);
    if (this.mode === 'bucket') return false;
    if (p.hidden && d > 1.3) return false;
    const range = this.visionRange() * (full ? 1.35 : 1) * Math.max(0.35, p.visibility);
    if (d > range) return false;
    if (d > 1.5 && !full) {
      const viewYaw = this.yaw + this.lookYaw;
      if (angleOff(viewYaw, this.pos.x, this.pos.z, p.pos.x, p.pos.z) > this.def.fov * (this.mode === 'investigate' || this.mode === 'search' ? 1.4 : 1)) return false;
    }
    return g.world.losClear(this.pos.x, this.eye(), this.pos.z, p.pos.x, p.pos.y + 0.35, p.pos.z);
  }

  canSeePoint(x, y, z, range = 12, fovMul = 1) {
    if (this.mode === 'bucket' || this.sleeping) return false;
    const d = dist2d(this.pos.x, this.pos.z, x, z);
    if (d > range * this.diff.vision) return false;
    if (d > 1.5 && angleOff(this.yaw + this.lookYaw, this.pos.x, this.pos.z, x, z) > this.def.fov * fovMul) return false;
    return this.g.world.losClear(this.pos.x, this.eye(), this.pos.z, x, y + 0.3, z);
  }

  perceive(dt) {
    const g = this.g;
    const p = g.player;
    if (!p) return;
    if (this.mode === 'chase' || this.mode === 'bucket' || this.mode === 'bus' || this.mode === 'startled') return;
    const sees = this.canSeePlayer(false);
    if (sees) {
      this.sinceSawPlayer = 0;
      const d = dist2d(this.pos.x, this.pos.z, p.pos.x, p.pos.z);
      const range = this.visionRange();
      let rate = (0.7 + 2.4 * (1 - d / range)) * this.diff.aware;
      if (p.held && p.held.owner === this.id) rate *= 2.2;
      if (p.held && p.held.def.special) rate *= 2.5;
      if (this.mode === 'investigate' || this.mode === 'search') rate *= 1.6;
      if (g.heat >= 2) rate *= 1.4;
      this.awareness = Math.min(1.2, this.awareness + dt * rate);
      if (this.awareness >= 1 && this.noticeCD <= 0) this.notice();
      else if (this.awareness > 0.25 && this.mode === 'routine' && !this.icon) this.setIcon('?', 0.4);
    } else {
      this.awareness = Math.max(0, this.awareness - dt * 0.35);
    }

    // own things lying around?
    this.retrieveT -= dt;
    if (this.retrieveT <= 0 && PRIORITY[this.mode] < PRIORITY.retrieve && !this.sleeping) {
      this.retrieveT = 0.6;
      const it = this.findDisplacedItem();
      if (it) {
        this.say('missing', 2.2, { item: it.name.toLowerCase() });
        this.interrupt('retrieve', { item: it });
      }
    }
    this.tidyT -= dt;
    if (this.tidyT <= 0 && PRIORITY[this.mode] < PRIORITY.tidy && !this.sleeping) {
      this.tidyT = 0.8;
      for (const f of g.fixtures) {
        if (!f.needsTidy || !f.needsTidy(this)) continue;
        if (f.tidyClaim && f.tidyClaim !== this && f.tidyClaim.mode === 'tidy') continue;
        if (!this.canSeePoint(f.pos.x, f.pos.y || 0, f.pos.z, 13, 1.3)) continue;
        f.tidyClaim = this;
        this.interrupt('tidy', { f });
        break;
      }
    }
  }

  findDisplacedItem() {
    const g = this.g;
    for (const it of g.items.items) {
      if (it.owner !== this.id) continue;
      if (it.state !== 'rest' && !(it.state === 'float' && g.world.waterAt(it.pos.x, it.pos.z)?.walkable)) continue;
      if (it.stashed || it.atHome()) continue;
      if (g.time - it.lastDisplaced < 0.8) continue;
      if (g.inHideout(it.pos.x, it.pos.z)) continue;
      if (it.pos.y > 2.2) continue; // up on a roof: out of reach
      if (dist2d(it.pos.x, it.pos.z, this.pos.x, this.pos.z) > 16) continue;
      if (!this.canSeePoint(it.pos.x, it.pos.y, it.pos.z, 14, 1.2)) continue;
      return it;
    }
    return null;
  }

  notice() {
    const g = this.g;
    const p = g.player;
    this.awareness = 0;
    this.noticeCD = 3.5;
    const d = dist2d(this.pos.x, this.pos.z, p.pos.x, p.pos.z);
    const ownItem = p.held && (p.held.owner === this.id || p.held.def.special);
    g.events.emit('spotted', { npc: this });
    if (ownItem) {
      this.startChase('thief');
    } else if (p.held && p.held.owner && g.heat >= 1) {
      this.startChase('thief');
    } else if (g.heat >= 2 || (this.def.officer && g.heat >= 1) || (this.wariness >= 2 && d < 7)) {
      this.startChase('pest');
    } else if (d < 3.2 && !p.unreachable) {
      this.say('shoo', 2);
      this.setIcon('!', 1.2);
      this.interrupt('shoo');
    } else {
      if (this.mode === 'routine' && Math.random() < 0.5) this.say('spot', 2.2);
      this.setIcon('?', 1.4);
      this.interrupt('watch');
    }
  }

  startChase(reason) {
    const g = this.g;
    const p = g.player;
    if (this.fearT > 0) {
      this.interrupt('fear');
      return;
    }
    if (!this.interrupt('chase', { reason, t: 0, lastSeen: p.pos.clone(), lastSeenT: g.time, stamina: this.def.stamina * this.diff.stamina * (1 + this.wariness * 0.2), belowT: 0 })) return;
    this.leaveSeat();
    this.sleeping = false;
    this.setIcon('!', 2);
    this.say(reason === 'thief' ? 'thief' : 'shoo', 2.4);
    if (this.def.officer) g.audio.sfx('whistle', this.pos, 1);
    this.wariness = Math.min(3, this.wariness + 0.5);
    this.chaseCount++;
    g.onChaseStart(this);
    // shout alerts the neighbours
    for (const o of g.npcs) {
      if (o === this || !o.active) continue;
      const d = dist2d(o.pos.x, o.pos.z, this.pos.x, this.pos.z);
      if (d < (this.def.loud ? 18 : 12)) {
        o.awareness = Math.max(o.awareness, 0.55);
        if (o.mode === 'routine' && !o.sleeping) o.lookYaw = wrapAngle(yawTo(o.pos.x, o.pos.z, p.pos.x, p.pos.z) - o.yaw) * 0.8;
        if (o.def.officer && g.heat >= 1) o.interrupt('investigate', { x: p.pos.x, z: p.pos.z, run: true, dur: 3 });
      }
    }
  }

  // ------------------------------------------------------------------ reactions
  hear(x, z, kind, src, frac) {
    const g = this.g;
    if (!this.active || this.mode === 'bus') return;
    if (this.mode === 'chase' || this.mode === 'bucket' || this.mode === 'startled') return;
    const loud = kind === 'crash' || kind === 'bell' || kind === 'taiko' || kind === 'bin' || kind === 'splash' || kind === 'bark' || kind === 'clatter';
    if (this.sleeping) {
      if (loud && frac < 0.8) {
        this.sleeping = false;
        this.interrupt('startled', { dur: 1.0, x, z });
        this.say('Wha-?!', 1.5);
      }
      return;
    }
    if (kind === 'steps' || kind === 'climb' || kind === 'drag' || kind === 'throw') {
      // subtle: turn head toward the sound
      this.awareness = Math.min(0.95, this.awareness + 0.22 * (1 - frac));
      if (this.mode === 'routine' && this.lookAnimT <= 0) this.lookYaw = clamp(wrapAngle(yawTo(this.pos.x, this.pos.z, x, z) - this.yaw), -1.6, 1.6);
      if (this.awareness > 0.6 && PRIORITY[this.mode] < PRIORITY.investigate) {
        this.setIcon('?', 1.5);
        this.interrupt('investigate', { x, z, dur: 2.5 });
      }
      return;
    }
    if (loud) {
      if (PRIORITY[this.mode] <= PRIORITY.investigate) {
        this.setIcon('?', 1.8);
        if (Math.random() < 0.4) this.say('Hm?!', 1.2);
        this.interrupt('investigate', { x, z, run: kind === 'crash' || kind === 'bell' || kind === 'taiko', dur: 3 });
      }
    }
  }

  onBark(p, d, radius) {
    const g = this.g;
    if (!this.active || this.mode === 'bus') return;
    const facing = angleOff(this.yaw + this.lookYaw, this.pos.x, this.pos.z, p.pos.x, p.pos.z) < this.def.fov;
    const seen = this.canSeePlayer(true);
    // Raccoon hiss makes people back away
    if (p.c.barkKind === 'hiss' && seen && d < radius) {
      if (this.mode !== 'bucket') {
        this.dropHeld(true);
        this.fearT = 4;
        this.say('Eek! It might bite!', 1.8);
        this.setIcon('!', 1.2);
        if (this.curStep?.bath && this.mode === 'routine' && this.stepPhase === 'do') this.leaveBath();
        this.setMode('fear');
        g.mischief('scare', this.pos, { npc: this, points: 60, label: 'Hissss!', witnessed: true });
      }
      return;
    }
    if (this.mode === 'chase' || this.mode === 'bucket') return;
    if (d < radius) {
      const dropped = this.dropHeld(true);
      this.sleeping = false;
      this.interrupt('startled', { dur: 0.9, x: p.pos.x, z: p.pos.z, fromBark: true });
      this.setIcon('!', 1.2);
      g.mischief('scare', this.pos, { npc: this, points: dropped ? 90 : 50, label: dropped ? 'Butterfingers!' : 'Startled!', witnessed: seen || facing });
      if (dropped) g.events.emit('npcDrop', { npc: this, item: dropped });
    }
  }

  afterStartle() {
    const g = this.g;
    const p = g.player;
    const d = this.data;
    if (this.canSeePlayer(true)) {
      this.faceTo(p.pos.x, p.pos.z, 1, 100);
      if (g.heat >= 1.5 || this.wariness >= 1.5 || d.hit) this.startChase('pest');
      else if (dist2d(p.pos.x, p.pos.z, this.pos.x, this.pos.z) < 3.5) {
        this.say('shoo', 2);
        this.setMode('shoo');
      } else this.setMode('watch');
    } else if (d.x !== undefined) {
      this.setMode('investigate', { x: d.x, z: d.z, dur: 2.5 });
    } else this.setMode('routine');
  }

  onHitByItem(item, speed, onHead) {
    const g = this.g;
    if (!this.active) return;
    const fromHigh = g.player && (g.player.state === 'perch' || g.player.pos.y > 1.5);
    g.events.emit('hitNpc', { npc: this, item, onHead, fromHigh });
    if (item.def.bucket && onHead && this.mode !== 'bucket') {
      // bucket on the head!
      this.dropHeld(true);
      item.state = 'held';
      item.heldBy = this;
      item.mesh.visible = false;
      this.model.props.bucketHead.visible = true;
      const col = item.variant === 'yellow' ? '#f2c230' : '#b98a5e';
      this.model.props.bucketHead.children[0].material = this.model.props.bucketHead.children[0].material.clone();
      this.model.props.bucketHead.children[0].material.color.set(col);
      this.leaveSeat();
      if (this.curStep?.bath && this.mode === 'routine' && this.stepPhase === 'do') this.leaveBath();
      this.setMode('bucket', { item, dir: rand(0, 6) });
      this.say('Huh?! Who turned out the lights?!', 2.5);
      g.audio.sfx('bucketHead', this.pos, 1);
      g.mischief('bucketHead', this.pos, { npc: this, points: 300, label: 'Bucket Head!', witnessed: false });
      g.events.emit('bucketHead', { npc: this, item, fromHigh });
      return;
    }
    g.audio.sfx('bonk', this.pos, 1);
    this.say('hit', 1.6);
    const dropped = this.dropHeld(true);
    this.wariness = Math.min(3, this.wariness + 0.7);
    if (this.mode === 'chase') return;
    this.interrupt('startled', { dur: 0.8, x: g.player.pos.x, z: g.player.pos.z, hit: true });
    g.mischief('hit', this.pos, { npc: this, points: fromHigh ? 150 : 90, label: fromHigh ? 'Sniper!' : 'Bonk!', witnessed: false });
    if (dropped) g.events.emit('npcDrop', { npc: this, item: dropped });
  }

  witness(kind, pos, opts) {
    const g = this.g;
    if (!this.active || this.mode === 'bus' || this.mode === 'bucket') return false;
    const mine = opts.owner === this.id || opts.npc === this;
    const range = opts.loud ? 16 : 12;
    const sees = this.canSeePoint(pos.x, pos.y || 0, pos.z, range, 1.2) || (mine && this.canSeePlayer(false));
    if (!sees) return false;
    this.wariness = Math.min(3, this.wariness + (mine ? 0.8 : 0.35));
    if (this.mode === 'chase') return true;
    if (mine || g.heat >= 1.2 || kind === 'break' || kind === 'hit' || this.def.officer) {
      if (this.canSeePlayer(true)) this.startChase(mine ? 'thief' : 'pest');
      else this.interrupt('investigate', { x: pos.x, z: pos.z, run: true, dur: 3 });
    } else {
      this.setIcon('!', 1.4);
      if (Math.random() < 0.6) this.say(pick(['Hey!', 'Kora!', 'Ah! Naughty!']), 1.6);
      if (this.canSeePlayer(true) && dist2d(this.pos.x, this.pos.z, g.player.pos.x, g.player.pos.z) < 4) this.interrupt('shoo');
      else this.interrupt('watch');
    }
    return true;
  }

  stepInPoop(poop) {
    const g = this.g;
    if (this.mode === 'disgusted' || this.mode === 'bus') return;
    poop.squish(this);
    this.dropHeld(true);
    const wasBath = this.mode === 'routine' && this.curStep?.bath && this.stepPhase === 'do';
    this.leaveSeat();
    if (wasBath) this.leaveBath();
    this.setMode('disgusted', { phase: 'hop' });
    this.say(pick(['Ewww!!', 'Iyaaa! Gross!', 'Not again!!', 'My shoe!!']), 2.2);
    this.setIcon('💢', 2);
    g.audio.sfx('squelch', this.pos, 1);
    g.mischief('poopStep', this.pos, { npc: this, points: 250, label: 'Ewww!', witnessed: false });
    g.events.emit('stepPoop', { npc: this, poop });
  }

  // ------------------------------------------------------------------ behaviours
  updateInvestigate(dt) {
    const d = this.data;
    const sp = d.run ? this.def.run * 0.7 : this.def.walk * 1.2;
    if (!d.arrived) {
      const ok = this.goTo(d.x, d.z, sp, dt, 1.6);
      if (ok || this.modeT > 12) {
        d.arrived = true;
        d.t = 0;
      }
      return [null, sp];
    }
    d.t += dt;
    this.lookYaw = Math.sin(d.t * 2.4) * 1.4;
    if (d.t > (d.dur || 2.5)) {
      this.lookYaw = 0;
      if (Math.random() < 0.4) this.say('Hmm... nothing.', 1.6);
      this.setMode('routine');
    }
    return ['lookaround', 0];
  }

  updateChase(dt) {
    const g = this.g;
    const p = g.player;
    const c = this.data;
    c.t += dt;
    const sees = this.canSeePlayer(true);
    if (sees) {
      c.lastSeen.copy(p.pos);
      c.lastSeenT = g.time;
      this.sinceSawPlayer = 0;
    }
    if (c.t > c.stamina) {
      this.say('giveup', 2.2);
      this.setIcon('💦', 2);
      this.setMode('tired');
      g.onEscape(this, 'tired', c.t);
      return ['pant', 0];
    }
    if (p.state === 'caught') {
      this.setMode('routine');
      return [null, 0];
    }
    if (p.unreachable && sees) {
      // wait underneath and shake a fist
      const arrived = this.goTo(p.pos.x, p.pos.z, this.def.run * 0.8, dt, 1.5);
      if (arrived) {
        c.belowT += dt;
        this.faceTo(p.pos.x, p.pos.z, dt, 8);
        if (c.belowT > 2.4) {
          this.say('giveup', 2.2);
          this.setMode('giveup', { x: p.pos.x, z: p.pos.z });
          g.onEscape(this, 'up', c.t);
        }
        return ['fist', 0];
      }
      return [null, this.def.run * 0.8];
    }
    if (g.time - c.lastSeenT > 1.4 || (p.state === 'drain')) {
      const arrived = this.goTo(c.lastSeen.x, c.lastSeen.z, this.def.run * 0.85, dt, 0.8);
      if (arrived || g.time - c.lastSeenT > 6) {
        this.setIcon('?', 2);
        this.setMode('search');
        g.onEscape(this, 'hid', c.t);
        return ['lookaround', 0];
      }
      return [null, this.def.run * 0.85];
    }
    // run them down
    const sp = this.def.run * this.diff.speed * (c.t < 0.8 ? 1.12 : 1);
    this.goTo(p.pos.x, p.pos.z, sp, dt, 0.1, true);
    const d = dist2d(this.pos.x, this.pos.z, p.pos.x, p.pos.z);
    if (d < this.radius + p.radius + 0.35 && !p.unreachable && p.state !== 'stunned' && Math.abs(p.pos.y - this.pos.y) < 1.0) {
      this.catchPlayer();
    }
    return [this.held ? 'carry' : null, sp];
  }

  catchPlayer() {
    const g = this.g;
    const p = g.player;
    if (this.def.officer) {
      this.say('caught', 2.8);
      g.playerCaught(this);
      this.setMode('giveup', { x: p.pos.x, z: p.pos.z });
      return;
    }
    const d = dist2d(this.pos.x, this.pos.z, p.pos.x, p.pos.z) || 1;
    const nx = (p.pos.x - this.pos.x) / d;
    const nz = (p.pos.z - this.pos.z) / d;
    let took = null;
    if (p.held) {
      took = p.held;
      p.dropHeld(true);
      if (!took.gone) {
        this.hold(took);
      }
    }
    p.stun(0.75, nx * 6.5, nz * 6.5);
    g.audio.sfx('shove', p.pos, 1);
    g.rig.shake = Math.max(g.rig.shake, 0.5);
    g.events.emit('caughtBy', { npc: this, item: took });
    g.score.breakCombo();
    if (took) {
      this.say(pick(['Got it back!', "Mine! Hmph.", 'Nice try!']), 2);
      this.setMode('return', { item: took });
    } else {
      this.say('shoo', 2);
      this.setMode('giveup', { x: p.pos.x, z: p.pos.z });
    }
    g.onChaseEnd(this);
  }

  updateBucket(dt) {
    const d = this.data;
    d.dir += (Math.random() - 0.5) * dt * 6;
    this.moveDir(d.dir, this.def.walk * 0.7, dt, true);
    if (this.modeT > 5.5) {
      const it = d.item;
      this.model.props.bucketHead.visible = false;
      if (it) {
        it.mesh.visible = true;
        it.heldBy = null;
        this.g.items.drop(it, this.pos.x + Math.sin(this.yaw) * 0.6, 1.2, this.pos.z + Math.cos(this.yaw) * 0.6, this.yaw);
      }
      this.say(pick(['Who did that?!', 'Grrr!', 'That rascal!']), 2);
      this.wariness = Math.min(3, this.wariness + 1);
      this.setMode('search');
    }
    return ['stumble', this.def.walk * 0.7];
  }

  updateDisgusted(dt) {
    const g = this.g;
    const d = this.data;
    if (d.phase === 'hop') {
      if (this.modeT > 1.5) {
        d.phase = 'go';
        let best = null;
        let bd = Infinity;
        for (const w of g.washPoints) {
          const dd = dist2d(w[0], w[1], this.pos.x, this.pos.z);
          if (dd < bd) {
            bd = dd;
            best = w;
          }
        }
        d.wash = best;
      }
      return ['hop', 0];
    }
    if (d.phase === 'go') {
      const ok = !d.wash || this.goTo(d.wash[0], d.wash[1], this.def.walk * 1.3, dt, 0.8);
      if (ok || this.modeT > 20) {
        d.phase = 'wash';
        d.t = 0;
      }
      return ['hop', this.def.walk * 1.3];
    }
    d.t += dt;
    if (Math.random() < dt * 4) g.particles.splash(this.pos.x + Math.sin(this.yaw) * 0.5, 0.3, this.pos.z + Math.cos(this.yaw) * 0.5, 2);
    if (d.t > 3) {
      this.say('Much better...', 1.6);
      this.setMode('routine');
    }
    return ['wash', 0];
  }

  updateRetrieve(dt) {
    const g = this.g;
    const d = this.data;
    const it = d.item;
    if (!it || it.gone || it.stashed || it.state === 'held' || it.pos.y > 2.2) {
      if (it && it.state === 'held' && it.heldBy === g.player) {
        if (this.canSeePlayer(true)) this.startChase('thief');
        else this.setMode('search');
      } else this.setMode('routine');
      return [null, 0];
    }
    if (!d.picking) {
      const ok = this.goTo(it.pos.x, it.pos.z, this.def.walk * 1.35, dt, 0.9);
      if (ok) {
        d.picking = true;
        d.t = 0;
      } else if (this.modeT > 25) this.setMode('routine');
      return [null, this.def.walk * 1.35];
    }
    d.t += dt;
    this.faceTo(it.pos.x, it.pos.z, dt, 8);
    if (d.t > 0.6) {
      if (it.state === 'float') it.state = 'rest';
      this.hold(it);
      this.setMode('return', { item: it });
    }
    return ['pickup', 0];
  }

  updateReturn(dt) {
    const g = this.g;
    const it = this.data.item;
    if (!it || this.held !== it) {
      this.setMode('routine');
      return [null, 0];
    }
    const h = it.home;
    const ok = this.goTo(h.x, h.z, this.def.walk * 1.2, dt, 1.0);
    if (ok || this.modeT > 40) {
      this.releaseHeld();
      if (it.def.coin && it.owner === 'priest') {
        const box = g.fixtureByKey('offering');
        if (box) box.coins = Math.min(8, box.coins + 1);
        it.remove();
        this.setMode('routine');
        return ['pickup', 0];
      }
      it.resetHome();
      if (it.owner === this.id && Math.random() < 0.5) this.say(pick(['There we go.', 'Back where you belong.', 'Honestly...']), 1.6);
      g.events.emit('itemReturned', { item: it, npc: this });
      this.setMode('routine');
      return ['pickup', 0];
    }
    return [it.light ? 'holdR' : 'carry', this.def.walk * 1.2];
  }

  updateTidy(dt) {
    const f = this.data.f;
    if (!f || !f.needsTidy || !f.needsTidy(this)) {
      if (f && f.tidyClaim === this) f.tidyClaim = null;
      this.setMode('routine');
      return [null, 0];
    }
    const tp = f.tidyPoint || f.pos;
    if (!this.data.working) {
      const ok = this.goTo(tp.x, tp.z, this.def.walk * 1.2, dt, 1.0);
      if (ok) {
        this.data.working = true;
        this.data.t = 0;
        if (f.tidyLine) this.say(f.tidyLine, 2);
      } else if (this.modeT > 25) this.setMode('routine');
      return [null, this.def.walk * 1.2];
    }
    this.data.t += dt;
    this.faceTo(f.pos.x, f.pos.z, dt, 6);
    if (f.tidyAct === 'sweep') this.setProps('broom');
    if (this.data.t > (f.tidyTime || 3)) {
      f.tidy(this);
      f.tidyClaim = null;
      this.setMode('routine');
    }
    return [f.tidyAct || 'tidy', 0];
  }

  // ------------------------------------------------------------------ holding
  hold(it) {
    if (this.held) this.dropHeld(true);
    if (it.heldBy && it.heldBy !== this && it.heldBy.held === it) {
      it.heldBy.held = null;
    }
    it.loosen();
    it.heldBy = this;
    if (it.light) it.attachTo(this.model.handR, { x: 0, y: -0.05, z: 0.05 });
    else it.attachTo(this.carryAnchor, { x: 0, y: -0.2, z: 0 });
    this.held = it;
  }

  releaseHeld() {
    const it = this.held;
    if (!it) return null;
    this.held = null;
    it.detach();
    it.heldBy = null;
    return it;
  }

  dropHeld(fling) {
    const it = this.releaseHeld();
    if (!it) return null;
    it.vel.set(Math.sin(this.yaw) * (fling ? 1.5 : 0.3), fling ? 3 : 0, Math.cos(this.yaw) * (fling ? 1.5 : 0.3));
    it.state = 'air';
    it.sleeping = false;
    return it;
  }

  // ------------------------------------------------------------------ movement
  faceTo(x, z, dt, rate = 8) {
    this.yaw = dampAngle(this.yaw, yawTo(this.pos.x, this.pos.z, x, z), rate, dt);
  }

  moveDir(yaw, speed, dt, collide) {
    this.yaw = dampAngle(this.yaw, yaw, 6, dt);
    this.pos.x += Math.sin(this.yaw) * speed * dt;
    this.pos.z += Math.cos(this.yaw) * speed * dt;
    if (collide) this.collide();
  }

  collide() {
    const g = this.g;
    g.world.resolve(this.pos, this.radius, 0.55);
    this.pos.y = g.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.1, 0.55);
  }

  // Walk/run toward a point with pathfinding. Returns true when there.
  goTo(x, z, speed, dt, arrive = 0.4, chasing = false) {
    const g = this.g;
    const dx = x - this.pos.x;
    const dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < arrive) {
      this.path = null;
      return true;
    }
    this.repathT -= dt;
    const goalMoved = !this.pathGoal || Math.hypot(this.pathGoal[0] - x, this.pathGoal[1] - z) > (chasing ? 0.8 : 1.0);
    if (!this.path || goalMoved || this.repathT <= 0) {
      if (g.nav.lineFree(this.pos.x, this.pos.z, x, z)) this.path = [[x, z]];
      else this.path = g.nav.findPath(this.pos.x, this.pos.z, x, z) || [[x, z]];
      this.pathI = 0;
      if (this.path.length > 1) {
        // skip the first node if we're basically on it
        const f = this.path[0];
        if (Math.hypot(f[0] - this.pos.x, f[1] - this.pos.z) < 0.6) this.pathI = 1;
      }
      this.pathGoal = [x, z];
      this.repathT = chasing ? 0.45 : 3;
    }
    let tgt = this.path[Math.min(this.pathI, this.path.length - 1)];
    let td = Math.hypot(tgt[0] - this.pos.x, tgt[1] - this.pos.z);
    while (td < 0.45 && this.pathI < this.path.length - 1) {
      this.pathI++;
      tgt = this.path[this.pathI];
      td = Math.hypot(tgt[0] - this.pos.x, tgt[1] - this.pos.z);
    }
    const last = this.pathI >= this.path.length - 1;
    if (last && td < 0.45 && d < arrive + 1.4) {
      // can't get closer (target inside an obstacle)
      this.path = null;
      return true;
    }
    const want = Math.atan2(tgt[0] - this.pos.x, tgt[1] - this.pos.z);
    this.yaw = dampAngle(this.yaw, want, chasing ? 12 : 8, dt);
    const turnSlow = 1 - Math.min(0.7, Math.abs(wrapAngle(want - this.yaw)) / Math.PI);
    const v = speed * turnSlow;
    this.pos.x += Math.sin(this.yaw) * v * dt;
    this.pos.z += Math.cos(this.yaw) * v * dt;
    this.collide();
    // stuck?
    this.stuckT += dt;
    if (this.stuckT > 1.0) {
      const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
      if (moved < 0.15 * speed) {
        this.repathT = 0;
        this.stuckCount = (this.stuckCount || 0) + 1;
        if (this.stuckCount > 4) {
          this.stuckCount = 0;
          this.path = null;
          return true;
        }
      } else this.stuckCount = 0;
      this.stuckT = 0;
      this.lastPos.copy(this.pos);
    }
    // kick things along the way
    g.items.push(this.pos.x, this.pos.z, this.radius, Math.sin(this.yaw) * v, Math.cos(this.yaw) * v, 0.4);
    return false;
  }

  // ------------------------------------------------------------------ visuals
  syncModel(dt) {
    const m = this.model;
    const p = this.pose;
    const target = p.targetSpeed || 0;
    p.speed = damp(p.speed, target / 2, 10, dt);
    p.run = damp(p.run, target > 3 ? 1 : 0, 8, dt);
    p.phase += target * dt * 3.2;
    p.look = this.lookYaw;
    p.holding = !!this.held;
    p.squash = Math.max(0, (p.squash || 0) - dt * 3);
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    animateHuman(m, p, this.g.time + this.id.length);
    if (this.sleeping && Math.random() < dt * 0.8) this.setIcon('Zzz', 1.6);
  }

  dispose() {
    this.g.scene.remove(this.model.root);
  }
}
