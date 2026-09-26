import * as THREE from 'three';
import { createRenderer, Lighting, CameraRig } from '../render/renderer.js';
import { Particles, Weather } from '../render/particles.js';
import { Input } from '../core/input.js';
import { EventBus } from '../core/events.js';
import { RNG, dateSeed, dateKey } from '../core/rng.js';
import { loadSave, writeSave, resetSave } from '../core/save.js';
import { clamp, dist2d, rand } from '../core/math.js';
import { World } from '../world/physics.js';
import { NavGrid } from '../world/nav.js';
import { SEASONS } from '../world/palette.js';
import { buildTown, BOUNDS, CANOPY_MAT, CANOPY_FADE } from '../world/town.js';
import { ItemManager } from '../world/items.js';
import { ITEM_DEFS } from '../world/itemDefs.js';
import { createFixture, resetFixtureCounters, Poop, Bus } from '../world/fixtures.js';
import { Player } from '../actors/player.js';
import { NPC } from '../actors/npc.js';
import { NPC_DEFS } from '../actors/npcDefs.js';
import { AudioEngine } from '../audio/audio.js';
import { Music } from '../audio/music.js';
import { UI } from '../ui/ui.js';
import { Score } from './score.js';
import { TaskManager, MAIN_CARD } from './tasks.js';
import { CHARACTERS, HATS } from './characters.js';

const DIFFICULTY = {
  chill: { vision: 0.8, stamina: 0.7, aware: 0.75, speed: 0.92 },
  normal: { vision: 1, stamina: 1, aware: 1, speed: 1 },
  sharp: { vision: 1.18, stamina: 1.3, aware: 1.3, speed: 1.05 },
};
const RUSH_TIME = 300;
const SPAWN = [-48.2, 30.8];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = createRenderer(canvas);
    this.camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.5, 400);
    this.rig = new CameraRig(this.camera);
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.music = new Music(this.audio);
    this.save = loadSave();
    this.events = new EventBus();
    this.ui = new UI(this);
    this.time = 0;
    this.paused = false;
    this.controlsEnabled = false;
    this.player = null;
    this.npcs = [];
    this.fixtures = [];
    this.poops = [];
    this.drains = [];
    this.chasers = new Set();
    this.timers = [];
    this.heat = 0;
    this.clock = 8;
    this.mode = 'title';
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.mouseV = new THREE.Vector3();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.audio.setVolumes(this.save.settings.music, this.save.settings.sfx);
    const unlockAudio = () => {
      this.audio.init();
      this.music.init();
      this.audio.setVolumes(this.save.settings.music, this.save.settings.sfx);
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  persist() {
    writeSave(this.save);
  }

  resetProgress() {
    this.save = resetSave();
    this.persist();
  }

  get diff() {
    return this.diffCfg || DIFFICULTY.normal;
  }

  // ------------------------------------------------------------------ world lifecycle
  buildWorld(seasonId, seed) {
    this.disposeWorld();
    resetFixtureCounters();
    this.rng = new RNG(seed);
    this.season = SEASONS[seasonId] || SEASONS.autumn;
    this.pal = this.season;
    this.scene = new THREE.Scene();
    this.lighting = new Lighting(this.scene);
    this.lighting.setPalette(this.pal);
    this.world = new World(BOUNDS);
    this.fixtureRoot = new THREE.Group();
    this.scene.add(this.fixtureRoot);
    this.poi = {};
    this.drains = [];
    this.fixtures = [];
    this.poops = [];
    this.npcs = [];
    this.chasers.clear();
    const town = buildTown(this, this.pal, this.rng);
    this.town = town;
    this.poi = town.poi;
    this.scene.add(town.root);
    this.rig.occluders = town.occluders;
    this.particles = new Particles(this.scene);
    this.weather = new Weather(this.scene, this.pal);
    this.items = new ItemManager(this);
    for (const spec of town.items) this.items.spawn(spec);
    for (const spec of town.fixtures) {
      const f = createFixture(this, spec);
      if (f) this.fixtures.push(f);
    }
    this.bus = new Bus(this);
    this.fixtures.push(this.bus);
    this.nav = new NavGrid(this.world);
    this.washPoints = [[-49, -16.8], this.poi.chozuya, [45.5, -8.3], this.poi.fountain, [36, -38.5]];
    for (const def of NPC_DEFS) this.npcs.push(new NPC(this, def));
    this.music.setAmbience(this.pal.ambience);
    this.buildAimFx();
  }

  disposeWorld() {
    this.timers = [];
    if (!this.scene) return;
    if (this.player) this.player.dispose();
    this.player = null;
    this.scene.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.userData && o.geometry.userData.shared) return;
    });
    // merged static meshes own unique geometry; free them
    if (this.town) {
      this.town.root.traverse((o) => {
        if (o.isMesh && o.matrixAutoUpdate === false && o.geometry) o.geometry.dispose();
      });
    }
    this.scene = null;
    this.tasks && this.tasks.dispose();
    this.tasks = null;
    this.events.clear();
    this.ui.clearWorld();
  }

  buildAimFx() {
    const pts = new Float32Array(62 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.aimLine = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: '#fff7e0', dashSize: 0.3, gapSize: 0.2, transparent: true, opacity: 0.9 }));
    this.aimLine.frustumCulled = false;
    this.aimLine.visible = false;
    this.scene.add(this.aimLine);
    this.aimRing = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 20), new THREE.MeshBasicMaterial({ color: '#c9412f', transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    this.aimRing.rotation.x = -Math.PI / 2;
    this.aimRing.visible = false;
    this.scene.add(this.aimRing);
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 4), new THREE.MeshBasicMaterial({ color: '#fff7e0' }));
    this.marker.rotation.x = Math.PI;
    this.marker.visible = false;
    this.scene.add(this.marker);
  }

  // ------------------------------------------------------------------ title
  titleWorld() {
    this.mode = 'title';
    this.controlsEnabled = false;
    this.buildWorld('autumn', 12345);
    this.clock = 9.5;
    this.rig.orbit = true;
    this.rig.orbitT = 0;
    this.rig.zoomTarget = this.rig.zoom = 58;
    this.rig.snap(new THREE.Vector3(2, 0, -18));
    this.ui.showHUD(false);
    this.ui.titleScreen();
  }

  quitToTitle() {
    this.paused = false;
    this.controlsEnabled = false;
    this.ui.fade(true);
    setTimeout(() => {
      this.titleWorld();
      this.ui.fade(false);
    }, 450);
  }

  // ------------------------------------------------------------------ start a day
  startGame(opts) {
    this.lastOpts = opts;
    this.ui.fade(true);
    this.audio.init();
    this.music.init();
    setTimeout(() => {
      this._start(opts);
      this.ui.fade(false);
    }, 380);
  }

  restart() {
    if (this.lastOpts) this.startGame(this.lastOpts);
  }

  _start({ mode, char, season }) {
    const s = this.save;
    this.mode = mode;
    this.diffCfg = DIFFICULTY[s.settings.difficulty] || DIFFICULTY.normal;
    let seed = (Math.random() * 1e9) | 0;
    let seasonId = season || 'autumn';
    if (mode === 'daily') {
      seed = dateSeed();
      const r = new RNG(seed);
      seasonId = r.pick(Object.keys(SEASONS));
    } else if (mode === 'rush') {
      seasonId = new RNG(seed).pick(Object.keys(SEASONS));
    }
    this.buildWorld(seasonId, seed);
    this.rig.orbit = false;
    const hat = s.hats.equipped[char] || 'none';
    this.player = new Player(this, char, hat, SPAWN);
    this.score = new Score(this);
    this.heat = 0;
    this.lastMischief = null;
    this.stashedOnce = new Set();
    this.timeLeft = RUSH_TIME;
    this.elapsed = 0;
    this.clock = 8;
    this.dayCount = 0;
    this.ended = false;
    this.huntT = 5;
    this.sessionStats = { stolen: 0, chases: 0, escapes: 0, caught: 0, stashed: 0, tasks: 0 };
    this.tasks = new TaskManager(this, mode, char, s);
    this.hookEvents();
    this.rig.zoomTarget = this.rig.zoom = 25;
    this.rig.yaw = this.rig.yawTarget = 0;
    this.rig.snap(this.player.pos);
    this.ui.showHUD(true);
    this.ui.show(null);
    this.ui.buildCard();
    this.controlsEnabled = true;
    this.paused = false;
    s.stats.days++;
    this.persist();
    const c = CHARACTERS[char];
    const intro = mode === 'story' ? `${c.name} wakes up in the bamboo grove. Time to make trouble in Momiji-chō!` : mode === 'rush' ? 'Mayhem Rush! 5 minutes — clear cards for extra time.' : `Daily Mischief · ${dateKey()} · ${this.season.name}`;
    this.ui.toast(intro, 'gold', 4500);
    if (!s.seenHelp) {
      s.seenHelp = true;
      this.persist();
      this.after(1.2, () => this.ui.toast('Tip: press / any time to see the controls. Click a task on your card for a hint.', 'info', 6000));
    }
  }

  hookEvents() {
    const s = this.save;
    this.events.on('taskDone', () => {
      this.sessionStats.tasks++;
    });
    this.events.on('poop', () => {
      s.stats.poops++;
    });
    // Taking the Golden Lucky Cat sets the whole town off
    this.events.on('pickup', (e) => {
      if (e.item.type !== 'goldCat') return;
      const p = this.player;
      this.heat = Math.max(this.heat, 2.2);
      this.lastMischief = { x: p.pos.x, z: p.pos.z, t: this.time };
      this.ui.bigText('THE LUCKY CAT!', 'Everybody heard that...');
      this.rig.shake = 0.6;
      for (const n of this.npcs) {
        if (!n.active) continue;
        const d = dist2d(n.pos.x, n.pos.z, p.pos.x, p.pos.z);
        if (d < 32) {
          n.awareness = Math.max(n.awareness, 0.9);
          n.sleeping = false;
          if (n.mode === 'routine' || n.mode === 'watch') n.interrupt('investigate', { x: p.pos.x, z: p.pos.z, run: true, dur: 2 });
        }
      }
      const dg = this.npcById('dango');
      if (dg) dg.say('My lucky cat!! Somebody stop that thief!', 3);
    });
  }

  // ------------------------------------------------------------------ systems used by actors & fixtures
  after(sec, fn) {
    this.timers.push({ t: sec, fn });
  }

  fixtureByKey(key) {
    return this.fixtures.find((f) => f.key === key) || null;
  }

  npcById(id) {
    return this.npcs.find((n) => n.id === id) || null;
  }

  inHideout(x, z) {
    return dist2d(x, z, -50.5, 34.5) < 4.5;
  }

  mouseGround() {
    const m = this.input.mouse;
    if (!m.inside) return null;
    this.raycaster.setFromCamera({ x: m.nx, y: m.ny }, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.mouseV);
    if (!hit) return null;
    return hit;
  }

  noise(x, z, r, kind, src) {
    for (const n of this.npcs) {
      if (!n.active) continue;
      const d = dist2d(x, z, n.pos.x, n.pos.z);
      const rr = r * (n.def.vigilant ? 1.2 : 1);
      if (d < rr) n.hear(x, z, kind, src, d / rr);
    }
  }

  bark(p) {
    const s = this.save;
    s.stats.barks++;
    const r = p.c.barkRadius;
    for (const n of this.npcs) {
      if (!n.active) continue;
      const d = dist2d(p.pos.x, p.pos.z, n.pos.x, n.pos.z);
      if (d < r) n.onBark(p, d, r);
      else if (d < r * 1.8) n.hear(p.pos.x, p.pos.z, 'bark', p, d / (r * 1.8));
    }
    for (const f of this.fixtures) {
      if (f.onBark) f.onBark(p, dist2d(p.pos.x, p.pos.z, f.pos.x, f.pos.z));
    }
    this.events.emit('bark', {});
  }

  mischief(kind, pos, opts = {}) {
    const pts = opts.points || 0;
    const key = kind + ':' + (opts.item ? opts.item.id : opts.npc ? opts.npc.id : Math.round(pos.x) + ',' + Math.round(pos.z));
    if (pts && this.score) this.score.add(pts, opts.label, pos, key);
    let witnessed = !!opts.witnessed;
    if (!opts.silent) {
      for (const n of this.npcs) if (n.witness(kind, pos, opts)) witnessed = true;
    }
    if (witnessed && !opts.silent) {
      this.heat = Math.min(3, this.heat + (opts.loud ? 0.42 : 0.3));
      this.lastMischief = { x: pos.x, z: pos.z, t: this.time };
    }
    if (kind === 'steal') {
      this.save.stats.stolen++;
      if (this.sessionStats) this.sessionStats.stolen++;
    }
    this.events.emit('mischief', { kind, witnessed, item: opts.item, npc: opts.npc });
  }

  spawnPoop(x, y, z, hidden) {
    const p = new Poop(this, { x, y, z, hidden });
    this.fixtures.push(p);
    this.poops.push(p);
    this.audio.sfx('plop', { x, y, z }, 0.8);
    this.events.emit('poop', { hidden });
    if (hidden) this.ui.toast('Nature called. (Discreetly, behind a bush.)', 'info');
    else this.ui.toast("Nature called! Now... will anyone step in it?", 'info');
    this.mischief('poop', { x, y, z }, { points: 20, label: 'Phew!', silent: true });
  }

  removePoop(p) {
    let i = this.poops.indexOf(p);
    if (i >= 0) this.poops.splice(i, 1);
    i = this.fixtures.indexOf(p);
    if (i >= 0) this.fixtures.splice(i, 1);
    p.dispose();
  }

  onStash(item) {
    const s = this.save;
    this.events.emit('stash', { item });
    if (!this.stashedOnce || this.stashedOnce.has(item.id)) return;
    this.stashedOnce.add(item.id);
    this.sessionStats.stashed++;
    const pts = Math.round(item.def.value * (item.washed ? 2 : 1)) + 50;
    this.score.add(pts, item.washed ? 'Stashed! (sparkly ×2)' : 'Stashed!', item.pos, 'stash:' + item.id);
    this.audio.sfx('rare', item.pos, 0.6);
    this.particles.sparkle(item.pos.x, item.pos.y + 0.3, item.pos.z, 10);
    const isNew = !s.collection[item.type];
    s.collection[item.type] = (s.collection[item.type] || 0) + 1;
    if (isNew) this.ui.toast(`New treasure for your collection: ${item.name}!`, 'gold');
    if (item.def.cosmetic) this.unlockHat(item.def.cosmetic);
    this.checkUnlocks();
    this.persist();
  }

  unlockHat(id) {
    const s = this.save;
    if (s.hats.unlocked.includes(id)) return;
    s.hats.unlocked.push(id);
    this.persist();
    this.ui.toast(`New hat unlocked: ${HATS[id].name}! (equip it on the character screen)`, 'gold', 5000);
    this.audio.sfx('unlock', null, 1);
    if (this.sessionUnlocks) this.sessionUnlocks.push('Hat: ' + HATS[id].name);
  }

  checkUnlocks() {
    const s = this.save;
    if (this.tasks && this.tasks.completedCount >= 6) this.unlockHat('hachimaki');
    if (s.story.monkey.done.includes('goldCat') || s.story.raccoon.done.includes('goldCat')) this.unlockHat('kitsune');
    if (s.stats.caught >= 3) this.unlockHat('policeCap');
    if (Object.keys(s.collection).length >= 20) this.unlockHat('sakura');
  }

  enterDrain(d) {
    const p = this.player;
    p.state = 'drain';
    p.vel.set(0, 0, 0);
    this.audio.sfx('splash', d.pos, 0.5);
    this.particles.splash(d.pos.x, 0.05, d.pos.z, 6);
    this.ui.openDrainMenu(d, this.drains, (to) => this.exitDrain(d, to));
    this.drainFrom = d;
  }

  exitDrain(from, to) {
    const p = this.player;
    this.ui.closeDrainMenu();
    p.teleport(to.pos.x + 0.9, to.pos.z + 0.3);
    p.vel.y = 4.5;
    p.grounded = false;
    this.audio.sfx('splash', to.pos, 0.6);
    this.particles.splash(to.pos.x, 0.05, to.pos.z, 8);
    if (to !== from) {
      this.events.emit('drainTravel', { from, to });
      this.ui.toast(`Popped out at: ${to.name}`, 'info', 1800);
    }
    this.rig.snap(p.pos);
  }

  playerCaught(npc) {
    const p = this.player;
    if (!p || p.state === 'caught') return;
    const s = this.save;
    p.state = 'caught';
    p.action = null;
    if (p.held) {
      const it = p.held;
      p.dropHeld(true);
      if (it.owner) this.after(0.5, () => it.resetHome());
    }
    this.audio.sfx('caught', null, 1);
    this.music.stinger('caught');
    this.score.breakCombo();
    s.stats.caught++;
    this.sessionStats.caught++;
    this.events.emit('caught', { npc });
    this.ui.bigText('CAUGHT!', 'Officer Kobayashi carries you back to the woods...');
    this.after(1.0, () => this.ui.fade(true));
    this.after(1.6, () => {
      p.teleport(SPAWN[0], SPAWN[1]);
      this.heat = 0;
      for (const n of this.npcs) if (n.mode === 'chase') n.setMode('routine');
      this.chasers.clear();
      this.rig.snap(p.pos);
      this.ui.fade(false);
      this.checkUnlocks();
      this.persist();
    });
  }

  onChaseStart(npc) {
    this.chasers.add(npc);
    this.save.stats.chases++;
    this.sessionStats.chases++;
    this.heat = Math.min(3, this.heat + 0.15);
    this.events.emit('chasers', { n: this.chasers.size });
  }

  onChaseEnd(npc) {
    if (this.chasers.delete(npc)) this.events.emit('chasers', { n: this.chasers.size });
  }

  onEscape(npc, how, chaseT = 0) {
    if (!this.player || this.player.state === 'caught') return;
    if (chaseT < 1.5) return;
    this.sessionStats.escapes++;
    this.score.add(80, how === 'up' ? 'Out of reach!' : how === 'hid' ? 'Vanished!' : how === 'home' ? 'Home free!' : 'Getaway!', this.player.pos, 'escape:' + npc.id);
    this.audio.sfx('escape', null, 1);
    this.music.stinger('escape');
    this.events.emit('escape', { npc, how });
  }

  onFinaleUnlocked() {
    this.ui.toast('★ A final task has appeared on your card... the Golden Lucky Cat!', 'gold', 6000);
    const cat = this.items.items.find((i) => i.type === 'goldCat');
    if (cat) this.particles.sparkle(cat.pos.x, cat.pos.y + 0.5, cat.pos.z, 30);
    this.ui.buildCard();
  }

  onMainCardComplete() {
    const p = this.player;
    this.ui.bigText('Mischief Card complete!', 'The whole town will be talking about this for years.');
    this.particles.confetti(p.pos.x, 2, p.pos.z, 80, ['#c9412f', '#f0c23a', '#ffffff', '#5d8a4e']);
    this.audio.sfx('unlock', null, 1);
    this.after(2.5, () => this.ui.toast('A bonus card has been unlocked. Keep causing trouble!', 'gold', 5000));
    this.checkUnlocks();
  }

  onRushCardCleared() {
    this.timeLeft += 45;
    this.ui.bigText('Card cleared! +45s', 'Here comes a new card...');
    this.score.addFlat(250, 'Card bonus');
    this.particles.confetti(this.player.pos.x, 2, this.player.pos.z, 50, ['#c9412f', '#f0c23a', '#ffffff']);
  }

  setPaused(on) {
    if (this.mode === 'title' || this.ended) return;
    this.paused = on;
    if (on) this.ui.show('pause');
    else this.ui.show(null);
  }

  endRush() {
    if (this.ended) return;
    this.ended = true;
    this.controlsEnabled = false;
    const s = this.save;
    const p = this.player;
    const score = this.score.points;
    this.ui.bigText("Time's up!", 'The sun sets on Momiji-chō...');
    this.sessionUnlocks = [];
    let best = false;
    if (this.mode === 'rush') {
      if (score > s.best.rush[p.id]) {
        s.best.rush[p.id] = score;
        best = true;
      }
    } else {
      const k = dateKey();
      if (!s.best.daily[k] || score > s.best.daily[k]) {
        s.best.daily[k] = score;
        best = true;
      }
    }
    if (score >= 8000) this.unlockHat('crown');
    if (this.score.bestCombo > s.stats.bestCombo) s.stats.bestCombo = this.score.bestCombo;
    this.checkUnlocks();
    this.persist();
    const rank = score >= 15000 ? 'Yōkai of Momiji-chō' : score >= 10000 ? 'Town Legend' : score >= 6000 ? 'Public Menace' : score >= 3000 ? 'Little Rascal' : score >= 1200 ? 'Mild Nuisance' : 'Harmless Critter';
    const st = this.sessionStats;
    const unl = this.sessionUnlocks;
    this.after(2.4, () => {
      this.ui.results({
        title: this.mode === 'rush' ? 'Mayhem Rush — results' : `Daily Mischief ${dateKey()}`,
        score,
        rank,
        best,
        rows: [
          ['Tasks stamped', st.tasks],
          ['Cards cleared', Math.max(0, (this.tasks.cardNumber || 1) - 1)],
          ['Things stolen', st.stolen],
          ['Stashed at home', st.stashed],
          ['Chases', st.chases],
          ['Getaways', st.escapes],
          ['Times caught', st.caught],
          ['Best combo', '×' + this.score.bestCombo],
        ],
        unlocks: unl,
      });
    });
  }

  // ------------------------------------------------------------------ loop
  update(dt) {
    const inp = this.input;
    // global keys
    if (this.mode !== 'title') {
      if (this.ui.fortuneOpen) {
        if (this.ui.fortuneT > 0.6 && (inp.pressed.size || inp.bPressed.size)) {
          this.ui.closeFortune();
          inp.pressed.clear();
          inp.bPressed.clear();
        }
      }
      if (this.ui.drainOpen) {
        for (let i = 1; i <= 9; i++) {
          if (inp.wasPressed('Digit' + i) && this.ui.drainOptions[i - 1]) this.ui.drainPick(this.ui.drainOptions[i - 1]);
        }
        if (inp.wasPressed('Escape')) this.exitDrain(this.drainFrom, this.drainFrom);
      } else if (inp.wasPressed('Escape', 'KeyP')) {
        if (this.ui.current === 'pause') this.setPaused(false);
        else if (!this.ui.current) this.setPaused(true);
      }
      if (!this.paused && !this.ended) {
        if (inp.wasPressed('Tab')) this.ui.toggleCard();
        if (inp.wasPressed('KeyH')) this.ui.showHint();
        if (inp.wasPressed('KeyM')) this.ui.toggleMap();
        if (inp.wasPressed('Slash', 'F1')) this.ui.toggleControls();
      }
    }

    if (this.paused) return;
    this.time += dt;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) {
        this.timers.splice(i, 1);
        t.fn();
      }
    }
    if (!this.scene) return;

    // clock
    if (this.mode === 'story') {
      this.elapsed += dt;
      this.clock += dt / 100;
      if (this.clock >= 18.5) {
        this.clock = 7.5;
        this.dayCount++;
        this.ui.toast('A new day dawns over Momiji-chō.', 'info');
      }
    } else if (this.mode === 'rush' || this.mode === 'daily') {
      if (!this.ended) {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          this.endRush();
        }
      }
      const total = RUSH_TIME;
      this.clock = 8 + clamp(1 - this.timeLeft / total, 0, 1) * 10;
      if (this.timeLeft < 30 && !this.warned30) {
        this.warned30 = true;
        this.ui.toast('30 seconds left!', 'warn');
      }
    } else {
      this.clock = 9.5 + Math.sin(this.time * 0.02) * 0.5;
    }

    const p = this.player;
    if (p) p.update(dt);
    // gentle nudge when nothing has been stamped for a while
    if (p && this.tasks && this.save.settings.hints && this.controlsEnabled) {
      const since = this.time - Math.max(this.tasks.lastCompleteT, this.lastNudge || 0);
      if (since > 150) {
        this.lastNudge = this.time;
        const id = this.tasks.activeTasks()[0];
        if (id) this.ui.toast('Stuck? Press H (or click a task) for a hint.', 'info', 5000);
      }
    }
    for (const n of this.npcs) n.update(dt);
    this.items.update(dt);
    // hanging things (lanterns, laundry) get knocked down by thrown items
    this.checkHangingHits();
    for (let i = this.fixtures.length - 1; i >= 0; i--) this.fixtures[i].update(dt);
    if (this.score) this.score.update(dt);

    if (p) {
      // town alert cools down when nobody has eyes on you
      let seen = false;
      for (const n of this.npcs) if (n.active && n.sinceSawPlayer < 1) seen = true;
      let cool = seen ? 0 : 0.045;
      if (this.inHideout(p.pos.x, p.pos.z)) cool += 0.2;
      if (p.state === 'drain') cool += 0.08;
      if (p.hidden) cool += 0.03;
      this.heat = Math.max(0, this.heat - cool * dt);
      // officer hunts when the town is in uproar
      if (this.heat >= 2.8) {
        this.huntT -= dt;
        const o = this.npcById('officer');
        if (this.huntT <= 0 && o && (o.mode === 'routine' || o.mode === 'search')) {
          this.huntT = 7;
          o.interrupt('investigate', { x: p.pos.x + rand(-4, 4), z: p.pos.z + rand(-4, 4), run: true, dur: 2 });
        }
      }
      // Kiki bathing with Grandpa
      if (p.state === 'bathe' && p.batheT > 1.8) {
        const gp = this.npcById('grandpa');
        if (gp && gp.mode === 'routine' && gp.curStep.bath && gp.stepPhase === 'do' && dist2d(gp.pos.x, gp.pos.z, p.pos.x, p.pos.z) < 8) {
          gp.sleeping = false;
          gp.say('bath', 3);
          gp.setIcon('💢', 2);
          gp.interrupt('watch');
        }
      }
      // music mood
      const sp = Math.hypot(p.vel.x, p.vel.z);
      this.music.setMood({
        chase: this.chasers.size,
        sneak: p.sneaking && sp > 0.3,
        active: sp > 0.6 || (this.score && this.score.comboT > 0) || p.state === 'climb',
        tense: this.heat >= 2,
      });
      this.audio.setListener(p.pos.x, p.pos.z, this.rig.yaw);
      this.updateAimFx();
      this.rig.update(dt, p.pos, p.vel, inp);
      this.rig.updateOccluders(p.pos);
      this.fadeTrees(p.pos);
      if (!this.save.settings.shake) this.rig.shake = 0;
    } else {
      this.music.setMood({ chase: 0, sneak: false, active: false });
      this.rig.update(dt, new THREE.Vector3(2, 0, -18), null, null);
      this.audio.setListener(0, -18, this.rig.yaw);
    }

    // bush rustle wobble
    for (const h of this.world.hides) {
      if (h.rustle > 0) {
        h.rustle = Math.max(0, h.rustle - dt * 2);
        h.mesh.rotation.z = Math.sin(this.time * 30) * 0.06 * h.rustle;
        h.mesh.scale.setScalar(1 + h.rustle * 0.04);
      }
    }

    const focus = p ? p.pos : new THREE.Vector3(0, 0, -18);
    this.lighting.update(focus, this.clock);
    this.particles.update(dt, this.time);
    this.weather.update(dt, this.time, focus.x, focus.z);
    this.music.update(dt);
    this.music.updateAmbience(dt, clamp((this.clock - 16.5) / 2, 0, 1));
    if (p) this.ui.update(dt);
  }

  // Tree canopies between the camera and the player turn see-through.
  fadeTrees(pp) {
    const cam = this.camera.position;
    const tx = pp.x;
    const ty = pp.y + 0.5;
    const tz = pp.z;
    const dx = tx - cam.x;
    const dy = ty - cam.y;
    const dz = tz - cam.z;
    const len2 = dx * dx + dy * dy + dz * dz;
    for (const t of this.town.trees) {
      if (!t.canopy) continue;
      let fade = false;
      if (Math.abs(t.x - tx) < 16 && Math.abs(t.z - tz) < 16) {
        // closest point on the camera→player segment to the canopy centre
        const cx = t.x - cam.x;
        const cy = t.cy - cam.y;
        const cz = t.z - cam.z;
        const k = clamp((cx * dx + cy * dy + cz * dz) / len2, 0, 1);
        const qx = cam.x + dx * k - t.x;
        const qy = cam.y + dy * k - t.cy;
        const qz = cam.z + dz * k - t.z;
        fade = qx * qx + qy * qy * 1.6 + qz * qz < t.cr * t.cr * 1.1;
      }
      const want = fade ? CANOPY_FADE() : CANOPY_MAT();
      if (t.canopy.material !== want) t.canopy.material = want;
    }
  }

  checkHangingHits() {
    const its = this.items.items;
    for (const a of its) {
      if (a.state !== 'air' || !a.thrower) continue;
      for (const b of its) {
        if (b.state !== 'hanging' || b === a) continue;
        const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - (b.pos.y + b.h * 0.3), a.pos.z - b.pos.z);
        if (d < a.r + b.r + 0.15) {
          b.loosen();
          b.state = 'air';
          b.sleeping = false;
          b.vel.set(a.vel.x * 0.3, 1, a.vel.z * 0.3);
          this.audio.sfx('impact:' + b.def.snd, b.pos, 0.8);
          if (b.type === 'lantern') {
            this.events.emit('lanternDown', { item: b });
            this.mischief('lantern', b.pos, { points: 90, label: 'Lantern down!' });
          }
        }
      }
    }
  }

  updateAimFx() {
    const p = this.player;
    const line = this.aimLine;
    if (p.aiming && p.held) {
      const arc = p.throwArc();
      if (arc) {
        const pos = line.geometry.attributes.position;
        const n = Math.min(arc.pts.length, 62);
        for (let i = 0; i < 62; i++) {
          const q = arc.pts[Math.min(i, n - 1)];
          pos.setXYZ(i, q.x, q.y, q.z);
        }
        pos.needsUpdate = true;
        line.geometry.setDrawRange(0, n);
        line.computeLineDistances();
        line.visible = true;
        this.aimRing.visible = true;
        this.aimRing.position.set(arc.end.x, Math.max(0.05, arc.end.y + 0.03), arc.end.z);
        this.aimRing.material.color.set(arc.npc ? '#ff3b1f' : arc.clamped ? '#e8b53a' : '#c9412f');
        const sc = arc.npc ? 1.5 + Math.sin(this.time * 12) * 0.15 : 1;
        this.aimRing.scale.set(sc, sc, sc);
      }
    } else {
      line.visible = false;
      this.aimRing.visible = false;
    }
    // grab marker
    const fi = p.focusInfo;
    const m = this.marker;
    if (fi && fi.target && !p.aiming && (fi.kind === 'item' || fi.kind === 'fixture' || fi.kind === 'use')) {
      const t = fi.target;
      let y = 1.5;
      if (t.pos) y = (t.pos.y || 0) + (t.h ? t.h + 0.45 : 1.6);
      m.position.set(t.pos.x, y + Math.sin(this.time * 5) * 0.08, t.pos.z);
      m.rotation.y = this.time * 2;
      m.visible = true;
    } else m.visible = false;
  }

  render() {
    if (this.scene) this.renderer.render(this.scene, this.camera);
  }
}
