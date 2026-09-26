import * as THREE from 'three';
import { CHARACTERS } from '../game/characters.js';
import { buildAnimal, animateAnimal } from './animalModels.js';
import { clamp, damp, dampAngle, wrapAngle, yawTo, angleOff } from '../core/math.js';

const GRAV = 22;
const tmpV = new THREE.Vector3();

// X-ray silhouette: when a wall, fence or tree hides the animal, a soft outline shows through.
// The animal writes 1 into the stencil buffer where it is visible; the silhouette only draws where
// it is behind something (GreaterDepth) and not over the visible animal itself (stencil != 1).
let SIL_MAT = null;
function addXray(root) {
  if (!SIL_MAT) {
    SIL_MAT = new THREE.MeshBasicMaterial({
      color: '#fff3d6',
      transparent: true,
      opacity: 0.6,
      depthFunc: THREE.GreaterDepth,
      depthWrite: false,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
      stencilZPass: THREE.KeepStencilOp,
    });
  }
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  for (const o of meshes) {
    o.material = o.material.clone();
    o.material.stencilWrite = true;
    o.material.stencilRef = 1;
    o.material.stencilFunc = THREE.AlwaysStencilFunc;
    o.material.stencilZPass = THREE.ReplaceStencilOp;
    const sil = new THREE.Mesh(o.geometry, SIL_MAT);
    sil.castShadow = false;
    sil.receiveShadow = false;
    sil.renderOrder = 999;
    sil.raycast = () => {};
    o.add(sil);
  }
}

export class Player {
  constructor(g, charId, hat, spawn) {
    this.g = g;
    this.id = charId;
    this.c = CHARACTERS[charId];
    this.model = buildAnimal(charId, hat);
    this.model.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    addXray(this.model.root);
    g.scene.add(this.model.root);
    this.pos = new THREE.Vector3(spawn[0], 0, spawn[1]);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;
    this.state = 'move';
    this.held = null;
    this.grounded = true;
    this.aiming = false;
    this.aimPoint = new THREE.Vector3();
    this.aimValid = false;
    this.nature = 18;
    this.urgentT = 0;
    this.hidden = false;
    this.bush = null;
    this.sneaking = false;
    this.running = false;
    this.inWater = null;
    this.action = null;
    this.barkCD = 0;
    this.stepT = 0;
    this.stunT = 0;
    this.climbC = null;
    this.perch = null;
    this.focus = null;
    this.focusInfo = null;
    this.lastSafe = this.pos.clone();
    this.batheT = 0;
    this.stillT = 0;
    this.airT = 0;
    this.visibility = 1;
    this.a = {
      phase: 0, speed: 0, upright: 0, climb: 0, sit: 0, squat: 0, sneak: 0, bark: 0, tear: 0, eat: 0,
      land: 0, jumpS: 0, throwT: 0, holding: false, drag: false, bathe: 0, wade: 0, climbMove: false, headYaw: 0,
    };
    this.radius = this.c.radius;
    this.height = this.id === 'monkey' ? 0.75 : 0.6;
    this.sinceSeen = 99;
    this.syncModel();
  }

  get unreachable() {
    if (this.state === 'drain') return true;
    if (this.state === 'perch') return true;
    if (this.state === 'climb' && this.pos.y > 0.9) return true;
    return this.pos.y > 1.25;
  }
  get busy() {
    return !!this.action || this.state === 'stunned' || this.state === 'caught' || this.state === 'drain';
  }

  dispose() {
    this.g.scene.remove(this.model.root);
  }

  // ------------------------------------------------------------------ input helpers
  moveInput() {
    const inp = this.g.input;
    if (!this.g.controlsEnabled) return { x: 0, z: 0, mag: 0 };
    let ix = 0;
    let iz = 0;
    if (inp.isDown('KeyA', 'ArrowLeft')) ix -= 1;
    if (inp.isDown('KeyD', 'ArrowRight')) ix += 1;
    if (inp.isDown('KeyW', 'ArrowUp')) iz += 1;
    if (inp.isDown('KeyS', 'ArrowDown')) iz -= 1;
    const f = this.g.rig.forward();
    const r = this.g.rig.right();
    let x = r.x * ix + f.x * iz;
    let z = r.z * ix + f.z * iz;
    const m = Math.hypot(x, z);
    if (m > 0) {
      x /= m;
      z /= m;
    }
    return { x, z, mag: m > 0 ? 1 : 0 };
  }

  // ------------------------------------------------------------------ main update
  update(dt) {
    const g = this.g;
    const inp = g.input;
    const ctl = g.controlsEnabled;
    this.barkCD -= dt;
    this.a.bark = Math.max(0, this.a.bark - dt * 3);
    this.a.land = Math.max(0, this.a.land - dt * 5);
    this.a.jumpS = Math.max(0, this.a.jumpS - dt * 4);
    this.a.throwT = Math.max(0, this.a.throwT - dt * 4);
    this.sinceSeen += dt;

    // nature's call
    if (this.state !== 'drain') {
      this.nature = Math.min(100, this.nature + dt * (100 / 165));
      if (this.nature >= 100) {
        this.urgentT += dt;
        if (this.urgentT > 35 && !this.action && this.state === 'move' && this.grounded) {
          g.ui.toast("Couldn't hold it any longer!", 'warn');
          this.startSquat();
        }
      }
    }

    const mv = this.moveInput();

    switch (this.state) {
      case 'move':
        this.updateMove(dt, mv);
        break;
      case 'climb':
        this.updateClimb(dt, mv);
        break;
      case 'perch':
        this.updatePerch(dt, mv);
        break;
      case 'stunned':
        this.stunT -= dt;
        this.vel.x *= Math.exp(-4 * dt);
        this.vel.z *= Math.exp(-4 * dt);
        this.integrate(dt, false);
        if (this.stunT <= 0) this.state = 'move';
        break;
      case 'bathe':
        this.updateBathe(dt, mv);
        break;
      case 'drain':
      case 'caught':
        this.vel.set(0, 0, 0);
        break;
      default:
        break;
    }

    // actions (timed)
    if (this.action) this.updateAction(dt, mv);

    // drag heavy item
    if (this.held && this.held.heavy) this.updateDrag(dt);

    if (ctl && this.state !== 'drain' && this.state !== 'caught') {
      this.handleActions(dt, mv);
    } else {
      this.aiming = false;
    }

    // hiding
    this.bush = this.state === 'move' && this.pos.y < 0.6 ? g.world.hideAt(this.pos.x, this.pos.z) : null;
    const hsp = Math.hypot(this.vel.x, this.vel.z);
    if (this.bush && hsp > 0.5) this.bush.rustle = Math.max(this.bush.rustle, Math.min(1, hsp / 4));
    this.hidden = (this.bush && hsp < this.c.walk * 1.1 && !(this.held && this.held.heavy)) || this.state === 'drain';
    // how visible we are to townsfolk
    let vis = this.c.visibility;
    if (this.sneaking) vis *= 0.5;
    if (this.running && hsp > this.c.walk) vis *= 1.25;
    if (this.state === 'perch') vis *= 0.6;
    if (this.held && !this.held.def.pebble) vis *= this.held.heavy ? 1.3 : 1.1;
    this.visibility = this.hidden ? 0 : vis;

    this.syncModel(dt);
  }

  updateMove(dt, mv) {
    const g = this.g;
    const inp = g.input;
    const c = this.c;
    const ctl = g.controlsEnabled;
    this.sneaking = ctl && inp.isDown('KeyC', 'ControlLeft', 'ControlRight') && !this.action;
    this.running = ctl && inp.isDown('ShiftLeft', 'ShiftRight') && !this.sneaking;
    let speed = this.sneaking ? c.sneak : this.running ? c.run : c.walk;
    if (this.held) speed *= this.held.heavy ? c.heavyMult : this.held.weight === 'medium' ? c.medMult : 1;
    this.inWater = this.pos.y < 0.2 ? g.world.waterAt(this.pos.x, this.pos.z) : null;
    if (this.inWater && !this.inWater.tiny) speed *= this.inWater.type === 'onsen' ? 0.7 : 0.6;
    if (this.action && this.action.lockMove) speed = 0;
    if (this.aiming) speed *= 0.55;

    const tx = mv.x * speed;
    const tz = mv.z * speed;
    const acc = this.grounded ? 14 : 4;
    this.vel.x = damp(this.vel.x, tx, acc, dt);
    this.vel.z = damp(this.vel.z, tz, acc, dt);
    const hsp = Math.hypot(this.vel.x, this.vel.z);
    if (this.aiming) {
      this.yaw = dampAngle(this.yaw, yawTo(this.pos.x, this.pos.z, this.aimPoint.x, this.aimPoint.z), 16, dt);
    } else if (mv.mag > 0 && !(this.action && this.action.lockMove)) {
      const target = Math.atan2(mv.x, mv.z);
      this.yaw = dampAngle(this.yaw, this.held && this.held.heavy ? target : target, 13, dt);
    }

    // jump / climb
    if (ctl && inp.wasPressed('Space') && !this.action) {
      const cl = this.canClimbAhead();
      if (cl) this.startClimb(cl);
      else if (this.grounded) this.jump();
    }
    // holding space while pushing into something climbable also climbs
    if (ctl && inp.isDown('Space') && !this.grounded && !this.action && mv.mag > 0 && this.vel.y < 1) {
      const cl = this.canClimbAhead();
      if (cl) this.startClimb(cl);
    }

    this.integrate(dt, true);

    // footsteps + noise
    if (this.grounded && hsp > 0.3) {
      this.stepT += hsp * dt;
      const stride = this.id === 'monkey' ? 0.55 : 0.45;
      if (this.stepT > stride) {
        this.stepT = 0;
        const vol = this.sneaking ? 0.15 : this.running ? 0.7 : 0.4;
        g.audio.sfx(this.inWater ? 'wade' : this.bush ? 'rustle' : 'step', this.pos, vol);
        if (!this.sneaking) {
          const r = (this.running ? 4.5 : 2.2) * c.noise * (this.bush ? 1.3 : 1);
          g.noise(this.pos.x, this.pos.z, r, 'steps', this);
        }
        if (this.inWater && !this.inWater.tiny) g.particles.splash(this.pos.x, 0.05, this.pos.z, 3);
        else if (this.running) g.particles.dust(this.pos.x, this.pos.y, this.pos.z, 1);
        if (this.running) g.music.step(this.sneaking);
        else g.music.step(this.sneaking);
      }
    }
    // kick loose items
    if (this.grounded && hsp > 0.5) g.items.push(this.pos.x, this.pos.z, this.radius, this.vel.x, this.vel.z, this.running ? 0.9 : 0.5);

    // monkey bathing in the onsen
    if (c.bathe && this.inWater && this.inWater.type === 'onsen' && hsp < 0.2 && !this.held && !this.action) {
      this.stillT += dt;
      if (this.stillT > 0.8) this.startBathe();
    } else this.stillT = 0;

    this.a.wade = damp(this.a.wade, this.inWater && !this.inWater.tiny ? 1 : 0, 8, dt);
  }

  integrate(dt, control) {
    const g = this.g;
    const prevGround = this.grounded;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.vel.y -= GRAV * dt;
    this.pos.y += this.vel.y * dt;
    const step = this.grounded ? 0.5 : 0.25;
    const hit = g.world.resolve(this.pos, this.radius, step, null, { squeeze: this.c.squeeze });
    this.wallHit = hit;
    // townsfolk are solid
    for (const n of g.npcs) {
      if (!n.active || n.ghost) continue;
      const dx = this.pos.x - n.pos.x;
      const dz = this.pos.z - n.pos.z;
      const d = Math.hypot(dx, dz);
      const rr = this.radius + n.radius;
      if (d < rr && d > 1e-4 && this.pos.y < n.pos.y + n.height * 0.8) {
        this.pos.x = n.pos.x + (dx / d) * rr;
        this.pos.z = n.pos.z + (dz / d) * rr;
      }
    }
    const gy = g.world.groundAt(this.pos.x, this.pos.z, this.pos.y, 0.5);
    if (this.pos.y <= gy + 0.001) {
      if (!prevGround && this.vel.y < -7) {
        this.a.land = Math.min(1, -this.vel.y / 14);
        g.particles.dust(this.pos.x, gy, this.pos.z, 5);
        g.audio.sfx('land', this.pos, 0.5);
      }
      this.pos.y = gy;
      this.vel.y = 0;
      this.grounded = true;
      this.airT = 0;
    } else if (prevGround && this.pos.y - gy < 0.5 && this.vel.y <= 0) {
      // step down stairs / ledges smoothly
      this.pos.y = gy;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
      this.airT += dt;
    }
    if (this.grounded && this.pos.y < 0.05 && !g.world.waterAt(this.pos.x, this.pos.z)) this.lastSafe.copy(this.pos);
  }

  jump() {
    this.vel.y = this.c.jump * (this.held && this.held.heavy ? 0 : this.held && this.held.weight === 'medium' ? 0.8 : 1);
    if (this.vel.y <= 0) return;
    this.grounded = false;
    this.a.jumpS = 1;
    this.g.audio.sfx('jump', this.pos, 0.4);
  }

  canClimbAhead() {
    if (this.held && !this.held.light) return null;
    const cl = this.g.world.findClimbable(this.pos.x, this.pos.z, this.pos.y, this.yaw, this.radius + 0.6, this.c.climbKinds);
    if (!cl) return null;
    // low things are simply jumped onto
    if (cl.top - this.pos.y < 0.5) return null;
    return cl;
  }

  startClimb(cl) {
    this.state = 'climb';
    this.climbC = cl.c;
    this.vel.set(0, 0, 0);
    this.grounded = false;
    // face the surface
    this.yaw = yawTo(this.pos.x, this.pos.z, cl.px, cl.pz);
    const d = Math.hypot(this.pos.x - cl.px, this.pos.z - cl.pz) || 1;
    const nx = (this.pos.x - cl.px) / d;
    const nz = (this.pos.z - cl.pz) / d;
    this.climbN = { x: nx, z: nz };
    this.pos.x = cl.px + nx * (this.radius + 0.02);
    this.pos.z = cl.pz + nz * (this.radius + 0.02);
    this.g.audio.sfx('climb', this.pos, 0.5);
    this.g.events.emit('climbStart', { c: cl.c });
  }

  updateClimb(dt, mv) {
    const g = this.g;
    const inp = g.input;
    const c = this.climbC;
    const ctl = g.controlsEnabled;
    // push direction relative to the wall
    const into = -(mv.x * this.climbN.x + mv.z * this.climbN.z);
    let dir = 1;
    if (ctl && (into < -0.5 || inp.isDown('KeyS', 'ArrowDown') && into <= 0.2)) dir = -1;
    const speed = this.c.climbSpeed * (this.held ? 0.85 : 1);
    this.pos.y += dir * speed * dt;
    this.a.climbMove = true;
    // sidestep along walls
    if (c.kind === 'box' && mv.mag > 0) {
      const tx = -this.climbN.z;
      const tz = this.climbN.x;
      const side = mv.x * tx + mv.z * tz;
      if (Math.abs(side) > 0.5) {
        this.pos.x += tx * side * speed * 0.6 * dt;
        this.pos.z += tz * side * speed * 0.6 * dt;
        const px = clamp(this.pos.x, c.minX, c.maxX);
        const pz = clamp(this.pos.z, c.minZ, c.maxZ);
        const d = Math.hypot(this.pos.x - px, this.pos.z - pz);
        if (d > this.radius + 0.3) {
          // slid off the edge
          this.state = 'move';
          this.vel.set(0, 0, 0);
          return;
        }
      }
    }
    this.climbStepT = (this.climbStepT || 0) + dt;
    if (this.climbStepT > 0.28) {
      this.climbStepT = 0;
      g.audio.sfx('climb', this.pos, 0.25);
      g.noise(this.pos.x, this.pos.z, 2 * this.c.noise, 'climb', this);
    }
    const top = c.perch ? c.perch.y : g.world.topAt(c, this.pos.x - this.climbN.x * 0.3, this.pos.z - this.climbN.z * 0.3);
    if (this.pos.y >= top - 0.05) {
      if (c.perch) {
        this.enterPerch(c);
      } else if (c.walk) {
        // hop onto the top surface
        this.pos.x -= this.climbN.x * (this.radius + 0.35);
        this.pos.z -= this.climbN.z * (this.radius + 0.35);
        this.pos.y = g.world.groundAt(this.pos.x, this.pos.z, top + 0.1, 0.6);
        this.state = 'move';
        this.grounded = true;
        this.vel.set(0, 0, 0);
        g.events.emit('climbTop', { c });
      } else {
        this.pos.y = top - 0.05;
      }
      return;
    }
    if (this.pos.y <= 0.0) {
      this.pos.y = g.world.groundAt(this.pos.x, this.pos.z, 0.2);
      this.state = 'move';
      this.grounded = true;
      return;
    }
    if (ctl && inp.wasPressed('Space') && this.pos.y > 0.3) {
      // leap off backwards
      this.state = 'move';
      this.vel.set(this.climbN.x * 3.5, 4, this.climbN.z * 3.5);
      this.yaw = Math.atan2(this.climbN.x, this.climbN.z);
      this.grounded = false;
    }
  }

  enterPerch(c) {
    this.state = 'perch';
    this.perch = c;
    this.pos.set(c.perch.x, c.perch.y, c.perch.z);
    this.vel.set(0, 0, 0);
    this.g.audio.sfx('rustle', this.pos, 0.8);
    this.g.events.emit('perch', { c, player: this });
    for (const f of this.g.fixtures) if (f.onPerch) f.onPerch(this, c);
  }

  updatePerch(dt, mv) {
    const g = this.g;
    const inp = g.input;
    if (!this.aiming && mv.mag > 0) this.yaw = dampAngle(this.yaw, Math.atan2(mv.x, mv.z), 6, dt);
    if (this.aiming) this.yaw = dampAngle(this.yaw, yawTo(this.pos.x, this.pos.z, this.aimPoint.x, this.aimPoint.z), 12, dt);
    this.perchT = (this.perchT || 0) + dt;
    if (g.controlsEnabled && this.perchT > 0.35 && (inp.wasPressed('Space') || (mv.mag > 0 && inp.isDown('ShiftLeft', 'ShiftRight')))) {
      const dir = mv.mag > 0 ? Math.atan2(mv.x, mv.z) : this.yaw;
      this.state = 'move';
      this.perchT = 0;
      this.pos.x += Math.sin(dir) * 0.9;
      this.pos.z += Math.cos(dir) * 0.9;
      this.vel.set(Math.sin(dir) * 3, 3, Math.cos(dir) * 3);
      this.grounded = false;
      this.perch = null;
      g.audio.sfx('jump', this.pos, 0.4);
    } else if (g.controlsEnabled && this.perchT > 0.35 && inp.wasPressed('KeyS', 'ArrowDown') && !inp.isDown('KeyW')) {
      // climb back down
      const c = this.perch;
      const a = this.yaw + Math.PI;
      this.state = 'climb';
      this.climbC = c;
      const r = c.kind === 'circle' ? c.r : 0.2;
      this.climbN = { x: Math.sin(a), z: Math.cos(a) };
      this.pos.x = (c.kind === 'circle' ? c.x : this.pos.x) + this.climbN.x * (r + this.radius);
      this.pos.z = (c.kind === 'circle' ? c.z : this.pos.z) + this.climbN.z * (r + this.radius);
      this.pos.y -= 0.4;
      this.yaw = a + Math.PI;
      this.perch = null;
      this.perchT = 0;
    }
  }

  startBathe() {
    this.state = 'bathe';
    this.batheT = 0;
    this.vel.set(0, 0, 0);
    this.g.audio.sfx('splash', this.pos, 0.4);
    this.g.ui.toast('Ahhh... a proper snow-monkey soak.', 'info');
  }

  updateBathe(dt, mv) {
    const g = this.g;
    this.batheT += dt;
    this.a.bathe = Math.min(1, this.a.bathe + dt * 2);
    g.heat = Math.max(0, g.heat - dt * 0.25);
    if (Math.random() < dt * 3) g.particles.steam(this.pos.x + (Math.random() - 0.5), 0.2, this.pos.z + (Math.random() - 0.5), 0.3);
    if (this.batheT > 2.5 && !this.bathEvent) {
      this.bathEvent = true;
      g.events.emit('bathe', { player: this });
    }
    if (mv.mag > 0 || (g.controlsEnabled && g.input.wasPressed('Space'))) {
      this.state = 'move';
      this.bathEvent = false;
      g.audio.sfx('splash', this.pos, 0.3);
    }
  }

  // ------------------------------------------------------------------ actions
  handleActions(dt, mv) {
    const g = this.g;
    const inp = g.input;
    const canAct = !this.action && (this.state === 'move' || this.state === 'perch' || this.state === 'climb' || this.state === 'bathe');

    // Focus target for prompts
    this.computeFocus();

    // Aim / throw
    const mg = g.mouseGround();
    if (mg) {
      this.aimPoint.copy(mg);
      this.aimValid = true;
    }
    const throwable = this.held && this.held.canThrow && (this.state === 'move' || this.state === 'perch');
    if (throwable && canAct && inp.mousePressed(2)) this.aiming = true;
    if (this.aiming && (!throwable || !inp.mouseDown(2))) {
      if (throwable && inp.mouseReleased(2)) this.throwHeld();
      this.aiming = false;
    }
    if (throwable && canAct && !this.aiming && inp.wasPressed('KeyF')) {
      if (!g.input.mouse.inside) {
        this.aimPoint.set(this.pos.x + Math.sin(this.yaw) * 6, 0, this.pos.z + Math.cos(this.yaw) * 6);
      }
      this.throwHeld();
    }

    // Grab / drop / interact
    if (canAct && (inp.wasPressed('KeyE') || inp.mousePressed(0))) {
      if (this.state === 'bathe') this.state = 'move';
      this.grabOrUse();
    }

    // Bark
    if (inp.wasPressed('KeyQ') && this.barkCD <= 0 && this.state !== 'drain') {
      this.bark();
    }

    // Tear / eat / wash (hold R)
    if (canAct && inp.wasPressed('KeyR')) this.startTearish();

    // Nature
    if (canAct && inp.wasPressed('KeyX')) {
      if (this.nature >= 60 && this.state === 'move' && this.grounded) this.startSquat();
      else if (this.nature < 60) g.ui.toast("You don't need to go right now.", 'info');
    }
  }

  computeFocus() {
    const g = this.g;
    const c = this.c;
    let best = null;
    let bestScore = Infinity;
    let info = null;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    if (!this.held || this.held.heavy === false) {
      for (const it of g.items.items) {
        if (it.state === 'held' || it.state === 'gone' || it.state === 'sunk') continue;
        const dx = it.pos.x - this.pos.x;
        const dz = it.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > this.radius + 1.0 + it.r) continue;
        const dy = it.pos.y - this.pos.y;
        const reachUp = it.state === 'hanging' ? c.reach + 0.35 : c.reach;
        if (dy > reachUp || dy < -0.9) continue;
        const dot = d > 0.05 ? (dx * fx + dz * fz) / d : 1;
        if (dot < 0.2 && d > this.radius + it.r + 0.1) continue;
        const score = d - dot * 0.5;
        if (score < bestScore) {
          bestScore = score;
          best = it;
        }
      }
    }
    if (best) {
      const it = best;
      let label = 'Grab ' + it.name;
      if (it.state === 'planted') label = 'Pull up ' + it.name;
      else if (it.heavy) label = 'Drag ' + it.name;
      info = { kind: 'item', target: it, label };
    }
    // fixtures (prefer the one we're facing)
    for (const f of g.fixtures) {
      if (!f.interactInfo) continue;
      const fi = f.interactInfo(this);
      if (!fi) continue;
      const dx = f.pos.x - this.pos.x;
      const dz = f.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const dot = d > 0.05 ? (dx * fx + dz * fz) / d : 1;
      const score = d - dot * 0.5 - 0.2 - (fi.bias || 0);
      if (score < bestScore) {
        bestScore = score;
        info = { kind: 'fixture', target: f, label: fi.label };
      }
    }
    if (this.held) {
      // using a held item on a fixture (coin in vending machine, hat on jizo)
      for (const f of g.fixtures) {
        if (!f.useInfo) continue;
        const fi = f.useInfo(this, this.held);
        if (fi) {
          info = { kind: 'use', target: f, label: fi.label };
          break;
        }
      }
      if (!info || info.kind === 'item') info = { kind: 'drop', label: this.held.heavy ? 'Let go' : 'Drop' };
    }
    this.focusInfo = info;
    this.focus = info ? info.target : null;

    // secondary prompt (tear / eat / wash)
    let rInfo = null;
    if (this.held) {
      if (this.c.wash && this.inWater && !this.held.heavy) rInfo = { label: 'Wash ' + this.held.name };
      else if (this.held.def.food) rInfo = { label: 'Eat ' + this.held.name };
      else if (this.held.def.tear) rInfo = { label: 'Tear up ' + this.held.name };
    } else {
      const ft = this.findTearTarget();
      if (ft) rInfo = { label: ft.label };
    }
    this.rInfo = rInfo;
  }

  findTearTarget() {
    const g = this.g;
    let best = null;
    let bd = Infinity;
    for (const f of g.fixtures) {
      if (!f.tearInfo) continue;
      const ti = f.tearInfo(this);
      if (!ti) continue;
      const d = Math.hypot(f.pos.x - this.pos.x, f.pos.z - this.pos.z);
      if (d < bd) {
        bd = d;
        best = { kind: 'fixture', target: f, label: ti.label, time: ti.time };
      }
    }
    if (this.focus && this.focus.def && this.focus.def.tear && this.focusInfo.kind === 'item' && this.focus.state !== 'planted') {
      const it = this.focus;
      const d = Math.hypot(it.pos.x - this.pos.x, it.pos.z - this.pos.z);
      if (d < bd) best = { kind: 'item', target: it, label: 'Tear up ' + it.name };
    }
    return best;
  }

  grabOrUse() {
    const g = this.g;
    const info = this.focusInfo;
    if (this.held) {
      if (info && info.kind === 'use') {
        info.target.use(this, this.held);
        return;
      }
      this.dropHeld();
      return;
    }
    if (!info) return;
    if (info.kind === 'fixture') {
      info.target.interact(this);
      return;
    }
    if (info.kind === 'item') {
      const it = info.target;
      if (it.state === 'planted') {
        this.startAction('tug', 0.55, {
          target: it,
          label: 'Pulling...',
          lockMove: true,
          onDone: () => {
            if (it.state !== 'planted') return;
            it.loosen();
            it.state = 'rest';
            g.audio.sfx('pop', it.pos, 1);
            g.particles.burst(it.pos.x, 0.1, it.pos.z, 8, ['#8b6a4b', '#735840'], 3, 0.08);
            g.events.emit('pulled', { item: it });
            this.pickUp(it);
          },
        });
        return;
      }
      this.pickUp(it);
    }
  }

  pickUp(it) {
    const g = this.g;
    const wasHome = it.atHome() && (it.state === 'rest' || it.state === 'hanging' || it.state === 'planted' || it.state === 'float');
    const hadState = it.state;
    if (it.stashed) {
      it.stashed = false;
      g.events.emit('unstash', { item: it });
    }
    it.loosen();
    if (it.heavy) {
      it.state = 'held';
      it.heldBy = this;
      it.sleeping = true;
      this.held = it;
      g.audio.sfx('grab', it.pos, 0.8);
    } else {
      it.heldBy = this;
      it.attachTo(this.model.hand, { x: 0, y: -it.h * 0.3, z: 0 });
      this.held = it;
      g.audio.sfx('grab', it.pos, 0.7);
    }
    it.touchedByPlayer = true;
    g.events.emit('pickup', { item: it, fromHome: wasHome, fromState: hadState });
    if (it.owner && wasHome) {
      it.stolen = true;
      g.mischief('steal', it.pos, { item: it, points: it.def.value, label: 'Snatched!', owner: it.owner });
    } else if (it.owner && !it.stolen) {
      it.stolen = true;
    }
    if (hadState === 'hanging' && it.type === 'lantern') g.events.emit('lanternDown', { item: it });
  }

  dropHeld(silent) {
    const g = this.g;
    const it = this.held;
    if (!it) return;
    this.held = null;
    if (it.heavy) {
      it.state = 'rest';
      it.heldBy = null;
      it.sleeping = false;
      it.vel.set(0, 0, 0);
    } else {
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      const wp = new THREE.Vector3();
      it.mesh.getWorldPosition(wp);
      g.items.drop(it, this.pos.x + fx * (this.radius + it.r + 0.05), Math.max(wp.y, this.pos.y + 0.1), this.pos.z + fz * (this.radius + it.r + 0.05), this.yaw);
      // don't drop into walls
      const e = { x: it.pos.x, y: it.pos.y, z: it.pos.z };
      g.world.resolve(e, it.r, 0.2);
      it.pos.x = e.x;
      it.pos.z = e.z;
      it.mesh.position.copy(it.pos);
    }
    it.heldBy = null;
    if (!silent) g.audio.sfx('drop', it.pos, 0.5);
    g.events.emit('drop', { item: it, player: this });
  }

  throwHeld() {
    const g = this.g;
    const it = this.held;
    if (!it || !it.canThrow) return;
    const c = this.c;
    const range = c.throwRange * (it.weight === 'medium' ? 0.55 : 1);
    const hand = new THREE.Vector3();
    this.model.hand.getWorldPosition(hand);
    let dx = this.aimPoint.x - this.pos.x;
    let dz = this.aimPoint.z - this.pos.z;
    let d = Math.hypot(dx, dz);
    if (d < 0.5) {
      dx = Math.sin(this.yaw);
      dz = Math.cos(this.yaw);
      d = 2;
    } else {
      dx /= d;
      dz /= d;
    }
    this.yaw = Math.atan2(dx, dz);
    d = Math.min(d, range);
    const vel = this.computeThrowVel(hand, dx, dz, d, this.aimPoint.y, range);
    this.held = null;
    g.items.throwItem(it, vel, 'player');
    it.pos.copy(hand);
    it.mesh.position.copy(hand);
    this.a.throwT = 1;
    g.audio.sfx('throw', this.pos, 0.8);
    g.noise(this.pos.x, this.pos.z, 2.5 * c.noise, 'throw', this);
    g.events.emit('throw', { item: it, player: this, fromHigh: this.pos.y > 1.5 || this.state === 'perch' });
    this.aiming = false;
  }

  computeThrowVel(from, dx, dz, d, ty, range) {
    const th = this.c.throwAngle;
    const dy = (ty || 0) - from.y;
    const cos = Math.cos(th);
    const tan = Math.tan(th);
    let v2 = (GRAV * d * d) / (2 * cos * cos * Math.max(0.05, d * tan - dy));
    const vmax = Math.sqrt(GRAV * range) * 1.05;
    let v = Math.min(Math.sqrt(Math.max(v2, 1)), vmax);
    return new THREE.Vector3(dx * v * cos + this.vel.x * 0.2, v * Math.sin(th), dz * v * cos + this.vel.z * 0.2);
  }

  // Predicted arc for the aiming guide.
  throwArc() {
    const it = this.held;
    if (!it) return null;
    const range = this.c.throwRange * (it.weight === 'medium' ? 0.55 : 1);
    const hand = new THREE.Vector3();
    this.model.hand.getWorldPosition(hand);
    let dx = this.aimPoint.x - this.pos.x;
    let dz = this.aimPoint.z - this.pos.z;
    let d = Math.hypot(dx, dz);
    if (d < 0.5) return null;
    dx /= d;
    dz /= d;
    d = Math.min(d, range);
    const v = this.computeThrowVel(hand, dx, dz, d, this.aimPoint.y, range);
    const pts = [];
    const p = hand.clone();
    const vel = v.clone();
    for (let i = 0; i < 60; i++) {
      pts.push(p.clone());
      vel.y -= GRAV * 0.025;
      p.addScaledVector(vel, 0.025);
      if (p.y < 0) {
        pts.push(p.clone().setY(0.02));
        break;
      }
    }
    return { pts, end: pts[pts.length - 1], clamped: Math.hypot(this.aimPoint.x - this.pos.x, this.aimPoint.z - this.pos.z) > range };
  }

  bark() {
    const g = this.g;
    this.barkCD = 0.55;
    this.a.bark = 1;
    g.audio.bark(this.c.barkKind, this.held ? this.held.type : null, this.pos);
    g.bark(this);
  }

  startTearish() {
    const g = this.g;
    const c = this.c;
    const it = this.held;
    if (it) {
      if (c.wash && this.inWater && !it.heavy) {
        this.startAction('wash', 1.1, {
          target: it, label: 'Washing...', hold: 'KeyR', lockMove: true, anim: 'tear',
          onDone: () => {
            it.washed = true;
            g.particles.sparkle(this.pos.x, this.pos.y + 0.6, this.pos.z, 12);
            g.particles.splash(this.pos.x, 0.05, this.pos.z, 10);
            g.audio.sfx('wash', this.pos, 1);
            g.events.emit('wash', { item: it, player: this });
            g.mischief('wash', this.pos, { points: 60, label: 'Squeaky clean!', silent: true });
          },
        });
        return;
      }
      if (it.def.food) {
        this.startAction('eat', 1.0, {
          target: it, label: 'Munching...', hold: 'KeyR', lockMove: false, anim: 'eat',
          onDone: () => {
            if (this.held !== it) return;
            this.held = null;
            g.audio.sfx('munch', this.pos, 1);
            g.particles.burst(this.pos.x, this.pos.y + 0.5, this.pos.z, 6, ['#f4f1e8', '#d8b98a'], 1.5, 0.05);
            this.nature = Math.min(100, this.nature + 24);
            g.events.emit('eat', { item: it, player: this });
            g.mischief('eat', this.pos, { item: it, points: 40, label: 'Munch!', owner: it.owner });
            it.remove();
          },
        });
        return;
      }
      if (it.def.tear) {
        this.startAction('tear', c.tearTime * (it.heavy ? 1.6 : 1), {
          target: it, label: 'Tearing...', hold: 'KeyR', lockMove: true, anim: 'tear',
          onDone: () => {
            if (this.held !== it) return;
            this.held = null;
            this.tearItem(it);
          },
        });
        return;
      }
      g.ui.toast(`You can't tear the ${it.name.toLowerCase()}.`, 'info');
      return;
    }
    const t = this.findTearTarget();
    if (!t) return;
    if (t.kind === 'fixture') {
      const f = t.target;
      this.yaw = yawTo(this.pos.x, this.pos.z, f.pos.x, f.pos.z);
      this.startAction('tear', (t.time || 1) * c.tearTime, {
        target: f, label: 'Tearing...', hold: 'KeyR', lockMove: true, anim: 'tear',
        onDone: () => f.tearComplete(this),
      });
    } else {
      const it = t.target;
      this.startAction('tear', c.tearTime * (it.heavy ? 1.6 : 1), {
        target: it, label: 'Tearing...', hold: 'KeyR', lockMove: true, anim: 'tear',
        onDone: () => {
          if (it.state === 'held' || it.gone) return;
          if (it.state === 'hanging') it.loosen();
          this.tearItem(it);
        },
      });
    }
  }

  tearItem(it) {
    const g = this.g;
    const p = it.pos.clone();
    if (it.state === 'held') it.mesh.getWorldPosition(p);
    g.audio.sfx('tear', p, 1);
    const cols = it.type === 'futon' ? ['#e98fa3', '#f7f0e0', '#ffffff'] : it.type === 'lantern' ? ['#d6452f', '#f6e6b0', '#1c1c1c'] : it.type === 'strawHat' ? ['#e3c77a', '#c9a95a'] : ['#f7f5ee', '#e8e2d2', '#d8d2c0'];
    g.particles.confetti(p.x, p.y + 0.3, p.z, it.heavy ? 40 : 18, cols);
    g.events.emit('tearItem', { item: it, player: this });
    g.mischief('tear', p, { item: it, points: Math.round(it.def.value * 0.8) + 40, label: 'Shredded!', owner: it.owner });
    it.remove();
  }

  startSquat() {
    const g = this.g;
    // tucking away into a bush is more polite
    this.startAction('squat', 1.6, {
      target: null, label: 'Nature calls...', lockMove: true, anim: 'squat',
      onDone: () => {
        const bx = this.pos.x - Math.sin(this.yaw) * 0.35;
        const bz = this.pos.z - Math.cos(this.yaw) * 0.35;
        g.spawnPoop(bx, this.pos.y, bz, !!this.bush);
        this.nature = 0;
        this.urgentT = 0;
      },
    });
    g.audio.sfx('strain', this.pos, 0.6);
  }

  startAction(kind, dur, o) {
    this.action = { kind, dur, t: 0, ...o };
    if (o.lockMove) {
      this.vel.x = 0;
      this.vel.z = 0;
    }
  }

  updateAction(dt, mv) {
    const g = this.g;
    const a = this.action;
    a.t += dt;
    if (a.hold && !g.input.isDown(a.hold)) {
      this.action = null;
      return;
    }
    if (a.kind === 'tear' && Math.random() < dt * 8) g.audio.sfx('tearTick', this.pos, 0.4);
    if (a.kind === 'squat' && Math.random() < dt * 4) g.particles.stink(this.pos.x, this.pos.y + 0.6, this.pos.z);
    if (a.t >= a.dur) {
      this.action = null;
      a.onDone && a.onDone();
    }
  }

  updateDrag(dt) {
    const g = this.g;
    const it = this.held;
    const bx = this.pos.x - Math.sin(this.yaw) * (this.radius + it.r + 0.1);
    const bz = this.pos.z - Math.cos(this.yaw) * (this.radius + it.r + 0.1);
    // the item trails behind like on a rope
    const dx = bx - it.pos.x;
    const dz = bz - it.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01) {
      it.pos.x += dx * Math.min(1, dt * 10);
      it.pos.z += dz * Math.min(1, dt * 10);
    }
    const e = { x: it.pos.x, y: it.pos.y, z: it.pos.z };
    g.world.resolve(e, it.r * 0.8, 0.3);
    it.pos.x = e.x;
    it.pos.z = e.z;
    it.pos.y = g.world.groundAt(it.pos.x, it.pos.z, Math.max(it.pos.y, this.pos.y) + 0.3, 0.6);
    const ty = Math.atan2(this.pos.x - it.pos.x, this.pos.z - it.pos.z);
    it.yaw = dampAngle(it.yaw, ty, 5, dt);
    it.mesh.position.copy(it.pos);
    it.mesh.rotation.y = it.yaw;
    if (Math.hypot(bx - it.pos.x, bz - it.pos.z) > 2.2) {
      g.ui.toast('It got stuck!', 'info');
      this.dropHeld();
      return;
    }
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.4) {
      this.dragT = (this.dragT || 0) + dt;
      if (this.dragT > 0.35) {
        this.dragT = 0;
        g.audio.sfx('drag', it.pos, 0.5);
        g.noise(it.pos.x, it.pos.z, 3.5, 'drag', this);
      }
    }
    // water
    if (g.world.waterAt(it.pos.x, it.pos.z) && !g.world.waterAt(this.pos.x, this.pos.z)?.tiny) {
      const w = g.world.waterAt(it.pos.x, it.pos.z);
      if (w && !w.tiny) {
        this.held = null;
        it.heldBy = null;
        it.state = 'air';
        it.sleeping = false;
        g.items.enterWater(it, w);
      }
    }
  }

  stun(t, vx, vz) {
    if (this.state === 'drain' || this.state === 'caught') return;
    if (this.action) this.action = null;
    if (this.state === 'climb' || this.state === 'perch') {
      this.state = 'move';
      this.perch = null;
    }
    this.state = 'stunned';
    this.stunT = t;
    this.vel.set(vx, 3, vz);
    this.grounded = false;
    this.aiming = false;
  }

  teleport(x, z, y = 0) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.state = 'move';
    this.action = null;
    this.perch = null;
    this.grounded = true;
    this.syncModel();
  }

  // ------------------------------------------------------------------ visuals
  syncModel(dt = 0.016) {
    const m = this.model;
    const a = this.a;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    m.root.visible = this.state !== 'drain';
    const hsp = Math.hypot(this.vel.x, this.vel.z);
    a.speed = damp(a.speed, Math.min(1.4, hsp / this.c.walk), 10, dt);
    a.phase += hsp * dt * (this.id === 'monkey' ? 5.2 : 6.5);
    const wantUp = this.held && !this.held.heavy ? 1 : 0;
    a.upright = damp(a.upright, this.state === 'climb' || this.state === 'perch' ? 0 : wantUp, 10, dt);
    a.climb = damp(a.climb, this.state === 'climb' ? 1 : 0, 12, dt);
    a.sit = damp(a.sit, this.state === 'perch' || this.state === 'bathe' ? 1 : 0, 8, dt);
    a.sneak = damp(a.sneak, this.sneaking ? 1 : 0, 10, dt);
    const act = this.action ? this.action.anim : null;
    a.tear = damp(a.tear, act === 'tear' || this.action?.kind === 'tug' || this.action?.kind === 'rummage' ? 1 : 0, 14, dt);
    a.eat = act === 'eat' ? 1 : 0;
    a.squat = damp(a.squat, act === 'squat' ? 1 : 0, 10, dt);
    a.holding = !!this.held && !this.held.heavy;
    a.drag = !!(this.held && this.held.heavy);
    a.bathe = this.state === 'bathe' ? a.bathe : Math.max(0, a.bathe - dt * 3);
    a.climbMove = this.state === 'climb';
    animateAnimal(m, a, dt, this.g.time);
    if (this.state === 'stunned') m.inner.rotation.z = Math.sin(this.g.time * 20) * 0.2;
    else m.inner.rotation.z = 0;
  }
}
