import * as THREE from 'three';
import { ITEM_DEFS, itemName } from './itemDefs.js';
import { clamp } from '../core/math.js';

const GRAV = 22;
let NEXT_ID = 1;

export class Item {
  constructor(mgr, spawn) {
    const def = ITEM_DEFS[spawn.type];
    if (!def) throw new Error('Unknown item ' + spawn.type);
    this.mgr = mgr;
    this.g = mgr.g;
    this.id = NEXT_ID++;
    this.type = spawn.type;
    this.variant = spawn.variant;
    this.def = def;
    this.name = itemName(spawn.type, spawn.variant);
    this.owner = spawn.owner || null;
    this.r = def.r;
    this.h = def.h;
    this.weight = def.w;
    this.pos = new THREE.Vector3(spawn.x, spawn.y || 0, spawn.z);
    this.home = this.pos.clone();
    this.homeState = spawn.state || 'rest';
    this.vel = new THREE.Vector3();
    this.yaw = spawn.yaw ?? mgr.g.rng.range(0, Math.PI * 2);
    this.homeYaw = this.yaw;
    this.state = this.homeState;
    this.heldBy = null;
    this.sleeping = true;
    this.spin = new THREE.Vector3();
    this.washed = false;
    this.stolen = false;
    this.stashed = false;
    this.thrower = null;
    this.hitSet = new Set();
    this.lostT = 0;
    this.floatT = Math.random() * 10;
    this.wet = 0;
    this.touchedByPlayer = false;
    this.lastDisplaced = 0;

    this.mesh = new THREE.Group();
    this.body = def.build(spawn.variant);
    this.mesh.add(this.body);
    if (this.state === 'planted' && def.buildPlanted) {
      this.plantedMesh = def.buildPlanted();
      this.mesh.add(this.plantedMesh);
      this.body.visible = false;
    }
    if (this.state === 'hanging' && def.buildHanging) {
      this.hangMesh = def.buildHanging();
      this.mesh.add(this.hangMesh);
      this.body.visible = false;
    }
    this.mesh.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    mgr.root.add(this.mesh);
  }

  get light() {
    return this.weight === 'light';
  }
  get heavy() {
    return this.weight === 'heavy';
  }
  get canThrow() {
    return this.weight !== 'heavy';
  }
  get free() {
    return this.state === 'rest' || this.state === 'air' || this.state === 'float';
  }
  get gone() {
    return this.state === 'gone' || this.state === 'sunk';
  }

  atHome(tol = 1.0) {
    return Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) < tol && Math.abs(this.pos.y - this.home.y) < 0.6;
  }

  // Swap from planted/hanging visuals to the normal loose-item look.
  loosen() {
    if (this.plantedMesh) {
      this.mesh.remove(this.plantedMesh);
      this.plantedMesh = null;
    }
    if (this.hangMesh) {
      this.mesh.remove(this.hangMesh);
      this.hangMesh = null;
    }
    this.body.visible = true;
  }

  wake() {
    this.sleeping = false;
  }

  attachTo(anchor, offset) {
    this.loosen();
    this.state = 'held';
    this.sleeping = true;
    this.vel.set(0, 0, 0);
    anchor.add(this.mesh);
    // cancel out any scaling on the holder so items keep their real size
    const ws = new THREE.Vector3();
    anchor.getWorldScale(ws);
    this.mesh.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z);
    this.mesh.position.set(offset?.x || 0, offset?.y || 0, offset?.z || 0);
    this.mesh.rotation.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
  }

  // Put back into the world at its current world transform.
  detach() {
    const wp = new THREE.Vector3();
    this.mesh.getWorldPosition(wp);
    this.mgr.root.add(this.mesh);
    this.mesh.scale.set(1, 1, 1);
    this.mesh.position.copy(wp);
    this.mesh.rotation.set(0, this.yaw, 0);
    this.pos.copy(wp);
    this.heldBy = null;
    this.state = 'air';
    this.sleeping = false;
  }

  syncHeld() {
    this.mesh.getWorldPosition(this.pos);
  }

  resetHome() {
    this.loosen();
    this.pos.copy(this.home);
    this.vel.set(0, 0, 0);
    this.state = this.homeState === 'planted' || this.homeState === 'hanging' || this.homeState === 'float' ? this.homeState : 'rest';
    if (this.state === 'planted' && this.def.buildPlanted) {
      this.plantedMesh = this.def.buildPlanted();
      this.mesh.add(this.plantedMesh);
      this.body.visible = false;
    }
    if (this.state === 'hanging' && this.def.buildHanging) {
      this.hangMesh = this.def.buildHanging();
      this.mesh.add(this.hangMesh);
      this.body.visible = false;
    }
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
    this.body.rotation.set(0, 0, 0);
    this.yaw = this.homeYaw;
    this.mesh.rotation.set(0, this.yaw, 0);
    this.sleeping = true;
    this.stashed = false;
    this.wet = 0;
  }

  remove() {
    this.state = 'gone';
    this.heldBy = null;
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }
}

export class ItemManager {
  constructor(g) {
    this.g = g;
    this.items = [];
    this.root = new THREE.Group();
    g.scene.add(this.root);
  }

  spawn(spec) {
    const it = new Item(this, spec);
    this.items.push(it);
    return it;
  }

  dispose() {
    this.g.scene.remove(this.root);
    this.items = [];
  }

  byType(type) {
    return this.items.filter((i) => i.type === type && i.state !== 'gone');
  }

  // Nearest item the player could grab.
  nearest(x, y, z, reach, filter) {
    let best = null;
    let bd = Infinity;
    for (const it of this.items) {
      if (it.state === 'held' || it.state === 'gone' || it.state === 'sunk') continue;
      if (filter && !filter(it)) continue;
      const d = Math.hypot(it.pos.x - x, it.pos.z - z);
      if (d > reach + it.r) continue;
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  throwItem(it, vel, thrower) {
    it.detach();
    it.vel.copy(vel);
    it.state = 'air';
    it.thrower = thrower;
    it.thrownT = this.g.time;
    it.hitSet.clear();
    it.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 12);
    it.sleeping = false;
  }

  drop(it, x, y, z, yaw) {
    it.detach();
    it.pos.set(x, y, z);
    it.vel.set(0, 0, 0);
    it.yaw = yaw ?? it.yaw;
    it.mesh.position.copy(it.pos);
    it.mesh.rotation.set(0, it.yaw, 0);
    it.state = 'air';
    it.sleeping = false;
    it.thrower = null;
  }

  update(dt) {
    const g = this.g;
    const world = g.world;
    for (const it of this.items) {
      if (it.state === 'held') {
        it.syncHeld();
        continue;
      }
      if (it.state === 'gone') continue;
      if (it.state === 'sunk') {
        it.lostT += dt;
        it.mesh.position.y = it.pos.y - it.lostT * 0.3;
        if (it.lostT > 1.6) {
          it.mesh.visible = false;
          it.state = 'gone';
          g.events.emit('itemLost', { item: it });
        }
        continue;
      }
      if (it.state === 'planted' || it.state === 'hanging') {
        if (it.state === 'hanging' && it.hangSwing) {
          it.hangSwing = Math.max(0, it.hangSwing - dt * 2);
          it.mesh.rotation.z = Math.sin(g.time * 9) * it.hangSwing * 0.3;
        }
        continue;
      }
      if (it.state === 'float') {
        this.updateFloat(it, dt);
        continue;
      }
      if (it.sleeping) continue;
      this.step(it, dt, world);
    }
  }

  updateFloat(it, dt) {
    const g = this.g;
    it.floatT += dt;
    const w = g.world.waterAt(it.pos.x, it.pos.z);
    if (!w) {
      it.state = 'air';
      it.sleeping = false;
      return;
    }
    // gentle drift + bob
    it.vel.x += Math.sin(it.floatT * 0.3 + it.id) * dt * 0.08;
    it.vel.z += Math.cos(it.floatT * 0.23 + it.id * 2) * dt * 0.08;
    it.vel.x *= Math.exp(-dt * 1.5);
    it.vel.z *= Math.exp(-dt * 1.5);
    const nx = it.pos.x + it.vel.x * dt;
    const nz = it.pos.z + it.vel.z * dt;
    if (g.world.waterAt(nx, nz) === w) {
      it.pos.x = nx;
      it.pos.z = nz;
    } else {
      it.vel.x *= -1;
      it.vel.z *= -1;
    }
    it.pos.y = 0.03 + Math.sin(it.floatT * 2) * 0.02;
    it.mesh.position.copy(it.pos);
    it.mesh.rotation.set(Math.sin(it.floatT * 1.3) * 0.12, it.yaw + it.floatT * 0.1, Math.cos(it.floatT * 1.1) * 0.12);
  }

  step(it, dt, world) {
    const g = this.g;
    it.vel.y -= GRAV * dt;
    const px = it.pos.x;
    const pz = it.pos.z;
    it.pos.x += it.vel.x * dt;
    it.pos.y += it.vel.y * dt;
    it.pos.z += it.vel.z * dt;
    const airborne = it.pos.y > 0.05 || it.vel.y > 0;

    // hit fixtures / townsfolk while flying
    if (it.state === 'air' && it.thrower) {
      const sp = it.vel.length();
      if (sp > 2.5) {
        for (const f of g.fixtures) {
          if (f.hitTest && !it.hitSet.has(f) && f.hitTest(it)) {
            it.hitSet.add(f);
            f.onItemHit(it, sp);
          }
        }
        for (const npc of g.npcs) {
          if (it.hitSet.has(npc) || !npc.active) continue;
          const d = Math.hypot(npc.pos.x - it.pos.x, npc.pos.z - it.pos.z);
          const top = npc.pos.y + npc.height;
          if (d < npc.radius + it.r + 0.1 && it.pos.y < top + 0.1 && it.pos.y + it.h > npc.pos.y + 0.1) {
            it.hitSet.add(npc);
            // buckets flip onto heads when they come down on someone (cartoon physics!)
            const onHead = it.def.bucket ? it.vel.y < -0.5 || it.pos.y > npc.pos.y + npc.height * 0.55 : it.pos.y > npc.pos.y + npc.height - 0.55;
            npc.onHitByItem(it, sp, onHead);
            // bounce off
            it.vel.x *= -0.3;
            it.vel.z *= -0.3;
            it.vel.y = Math.max(it.vel.y, 1.5);
            if (it.state !== 'air') return;
          }
        }
      }
    }

    // walls
    const e = { x: it.pos.x, y: it.pos.y, z: it.pos.z };
    const hit = world.resolve(e, it.r, 0.15, null, { item: true });
    if (hit) {
      it.pos.x = e.x;
      it.pos.z = e.z;
      const vn = it.vel.x * hit.nx + it.vel.z * hit.nz;
      if (vn < 0) {
        it.vel.x -= 1.5 * vn * hit.nx;
        it.vel.z -= 1.5 * vn * hit.nz;
        if (-vn > 3) this.impact(it, -vn, true);
      }
    }

    // ground / surfaces
    const gy = world.groundAt(it.pos.x, it.pos.z, it.pos.y + 0.05, Math.max(0.3, -it.vel.y * dt + 0.1));
    if (it.pos.y <= gy) {
      it.pos.y = gy;
      const vy = -it.vel.y;
      if (vy > 3) {
        this.impact(it, vy, false);
        if (it.state === 'gone') return;
        it.vel.y = vy * (it.def.bounce ?? (it.def.roll ? 0.35 : 0.22));
        if (it.def.bounce && vy > 3) g.audio.sfx('ball', it.pos, Math.min(1, vy / 10));
      } else {
        it.vel.y = 0;
      }
      const fr = it.def.roll ? 1.2 : 7;
      it.vel.x *= Math.exp(-fr * dt);
      it.vel.z *= Math.exp(-fr * dt);
      it.spin.multiplyScalar(Math.exp(-8 * dt));
      if (it.state === 'air' && Math.abs(it.vel.y) < 0.01 && Math.hypot(it.vel.x, it.vel.z) < 0.4) {
        it.state = 'rest';
        it.thrower = null;
        this.onRest(it);
      }
      if (it.state === 'rest' && Math.hypot(it.vel.x, it.vel.z) < 0.05 && it.vel.y === 0) {
        it.vel.set(0, 0, 0);
        it.sleeping = true;
        it.body.rotation.x = 0;
        it.body.rotation.z = 0;
      }
    } else if (it.state === 'rest') {
      it.state = 'air';
    }

    // water
    if (it.pos.y < 0.25) {
      const w = world.waterAt(it.pos.x, it.pos.z);
      if (w && !w.tiny) {
        this.enterWater(it, w);
        if (it.state !== 'air' && it.state !== 'rest') return;
      }
    }

    // tumble in the air
    if (airborne && it.thrower) {
      it.body.rotation.x += it.spin.x * dt;
      it.body.rotation.z += it.spin.z * dt;
      it.yaw += it.spin.y * dt;
    } else if (it.def.roll) {
      const sp = Math.hypot(it.vel.x, it.vel.z);
      it.body.rotation.x += (sp / Math.max(0.05, it.r)) * dt;
      if (sp > 0.1) it.yaw = Math.atan2(it.vel.x, it.vel.z);
    } else {
      it.body.rotation.x *= Math.exp(-10 * dt);
      it.body.rotation.z *= Math.exp(-10 * dt);
    }
    it.mesh.position.copy(it.pos);
    it.mesh.rotation.y = it.yaw;
    if (Math.abs(it.pos.x - px) + Math.abs(it.pos.z - pz) > 0.001) it.lastDisplaced = g.time;
    it.pos.y = clamp(it.pos.y, -1, 40);
  }

  impact(it, speed, wall) {
    const g = this.g;
    g.audio.sfx('impact:' + it.def.snd, it.pos, Math.min(1, speed / 12));
    g.noise(it.pos.x, it.pos.z, Math.min(9, 2 + speed * 0.6), 'clatter', it);
    if (it.def.fragile && speed > 7.5 && it.thrower) {
      this.shatter(it);
      return;
    }
    if (speed > 5) g.particles.dust(it.pos.x, it.pos.y, it.pos.z, 4);
    g.events.emit('itemImpact', { item: it, speed, wall });
  }

  shatter(it) {
    const g = this.g;
    g.audio.sfx('shatter', it.pos, 1);
    g.particles.burst(it.pos.x, it.pos.y + 0.1, it.pos.z, 14, ['#f2eee4', '#c8d7de', '#6f8f73'], 4, 0.06);
    g.noise(it.pos.x, it.pos.z, 11, 'crash', it);
    g.mischief('break', it.pos, { item: it, points: 120, label: 'Smashed!', owner: it.owner, loud: true });
    g.events.emit('shatter', { item: it });
    it.remove();
  }

  enterWater(it, w) {
    const g = this.g;
    g.audio.sfx('splash', it.pos, it.heavy ? 1 : 0.7);
    g.particles.splash(it.pos.x, 0.05, it.pos.z, it.heavy ? 22 : 12);
    g.noise(it.pos.x, it.pos.z, 7, 'splash', it);
    it.wet = 1;
    const wasThrown = !!it.thrower;
    g.events.emit('itemWater', { item: it, water: w, thrown: wasThrown });
    if (it.owner || it.def.laundry) {
      g.mischief('splash', it.pos, { item: it, points: it.def.laundry ? 90 : 60, label: 'Splash!', owner: it.owner });
    }
    it.thrower = null;
    if (it.def.floats || w.type === 'onsen' || it.def.laundry || it.def.bucket || it.type === 'ball') {
      it.state = 'float';
      it.vel.multiplyScalar(0.3);
      it.vel.y = 0;
    } else {
      it.state = 'sunk';
      it.lostT = 0;
      it.pos.y = 0.02;
    }
  }

  onRest(it) {
    this.g.events.emit('itemRest', { item: it });
  }

  // Player or NPC bumps into resting items.
  push(x, z, r, vx, vz, strength = 0.6) {
    for (const it of this.items) {
      if (it.state !== 'rest' && it.state !== 'air') continue;
      if (it.heavy) continue;
      if (it.pos.y > 0.6) continue;
      const dx = it.pos.x - x;
      const dz = it.pos.z - z;
      const d = Math.hypot(dx, dz);
      const rr = r + it.r;
      if (d >= rr || d < 1e-4) continue;
      const nx = dx / d;
      const nz = dz / d;
      const sp = Math.hypot(vx, vz);
      const kick = (sp * strength + 0.8) * (it.weight === 'medium' ? 0.55 : 1);
      it.pos.x = x + nx * rr;
      it.pos.z = z + nz * rr;
      it.vel.x = nx * kick;
      it.vel.z = nz * kick;
      if (sp > 5 && it.light) it.vel.y = 1.5;
      it.state = 'air';
      it.sleeping = false;
      it.mesh.position.copy(it.pos);
    }
  }
}
