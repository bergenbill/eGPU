import * as THREE from 'three';

// Instanced pools for every little flying bit: dust, leaves, paper, water, sparkles, steam.
const MAX = 1600;

class Pool {
  constructor(scene, geo, material) {
    this.mesh = new THREE.InstancedMesh(geo, material, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color('#ffffff'));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    this.n = 0;
    this.p = new Float32Array(MAX * 3);
    this.v = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.max = new Float32Array(MAX);
    this.size = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.spin = new Float32Array(MAX);
    this.flat = new Uint8Array(MAX);
    this.mode = new Uint8Array(MAX); // 0 normal, 1 grow (steam), 2 flutter
    this.rot = new Float32Array(MAX);
    this.col = new THREE.Color();
    this.dummy = new THREE.Object3D();
  }

  dispose(scene) {
    scene.remove(this.mesh);
  }

  add(x, y, z, vx, vy, vz, life, size, color, opts = {}) {
    if (this.n >= MAX) return;
    const i = this.n++;
    this.p[i * 3] = x;
    this.p[i * 3 + 1] = y;
    this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx;
    this.v[i * 3 + 1] = vy;
    this.v[i * 3 + 2] = vz;
    this.life[i] = life;
    this.max[i] = life;
    this.size[i] = size;
    this.grav[i] = opts.grav ?? 12;
    this.drag[i] = opts.drag ?? 1.5;
    this.spin[i] = opts.spin ?? (Math.random() - 0.5) * 10;
    this.flat[i] = opts.flat ? 1 : 0;
    this.mode[i] = opts.mode || 0;
    this.rot[i] = Math.random() * 6;
    this.col.set(color);
    this.mesh.setColorAt(i, this.col);
    this.mesh.instanceColor.needsUpdate = true;
  }

  _swap(i, j) {
    for (let k = 0; k < 3; k++) {
      this.p[i * 3 + k] = this.p[j * 3 + k];
      this.v[i * 3 + k] = this.v[j * 3 + k];
    }
    this.life[i] = this.life[j];
    this.max[i] = this.max[j];
    this.size[i] = this.size[j];
    this.grav[i] = this.grav[j];
    this.drag[i] = this.drag[j];
    this.spin[i] = this.spin[j];
    this.flat[i] = this.flat[j];
    this.mode[i] = this.mode[j];
    this.rot[i] = this.rot[j];
    this.mesh.getColorAt(j, this.col);
    this.mesh.setColorAt(i, this.col);
  }

  update(dt, time) {
    const d = this.dummy;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.n--;
        if (i !== this.n) this._swap(i, this.n);
        i--;
        continue;
      }
      const k = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      this.v[k] *= dr;
      this.v[k + 2] *= dr;
      this.v[k + 1] = this.v[k + 1] * (this.mode[i] === 2 ? dr : 1) - this.grav[i] * dt;
      if (this.mode[i] === 2) {
        this.v[k] += Math.sin(time * 3 + i) * dt * 1.5;
        this.v[k + 2] += Math.cos(time * 2.3 + i) * dt * 1.5;
      }
      this.p[k] += this.v[k] * dt;
      this.p[k + 1] += this.v[k + 1] * dt;
      this.p[k + 2] += this.v[k + 2] * dt;
      if (this.p[k + 1] < 0.02 && this.grav[i] > 0) {
        this.p[k + 1] = 0.02;
        this.v[k + 1] *= -0.2;
        this.v[k] *= 0.6;
        this.v[k + 2] *= 0.6;
        this.spin[i] *= 0.5;
      }
      this.rot[i] += this.spin[i] * dt;
      const t = this.life[i] / this.max[i];
      let s = this.size[i];
      if (this.mode[i] === 1) s *= 0.4 + (1 - t) * 1.6;
      if (t < 0.25) s *= t / 0.25;
      d.position.set(this.p[k], this.p[k + 1], this.p[k + 2]);
      d.rotation.set(this.rot[i], this.rot[i] * 0.7, this.rot[i] * 0.3);
      if (this.flat[i]) d.scale.set(s, s * 0.12, s * 0.7);
      else d.scale.set(s, s, s);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

}

export class Particles {
  constructor(scene) {
    this.box = new Pool(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
    this.puff = new Pool(scene, new THREE.IcosahedronGeometry(0.6, 0), new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }));
    this.puff.mesh.renderOrder = 5;
  }
  add(...args) {
    this.box.add(...args);
  }
  addPuff(...args) {
    this.puff.add(...args);
  }
  update(dt, time) {
    this.box.update(dt, time);
    this.puff.update(dt, time);
  }
  dispose(scene) {
    this.box.dispose(scene);
    this.puff.dispose(scene);
  }

  burst(x, y, z, n, colors, speed = 4, size = 0.08, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.add(x, y, z, Math.cos(a) * s, speed * (0.5 + Math.random()), Math.sin(a) * s, 0.8 + Math.random() * 0.6, size * (0.6 + Math.random() * 0.8), colors[i % colors.length], opts);
    }
  }

  dust(x, y, z, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.addPuff(x, y + 0.05, z, Math.cos(a) * 1.2, 0.6 + Math.random() * 0.6, Math.sin(a) * 1.2, 0.5 + Math.random() * 0.3, 0.14 + Math.random() * 0.08, '#efe8d6', { grav: -0.5, drag: 4, mode: 1 });
    }
  }

  splash(x, y, z, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 2;
      this.add(x, y + 0.05, z, Math.cos(a) * s, 3 + Math.random() * 3, Math.sin(a) * s, 0.7, 0.07 + Math.random() * 0.05, i % 3 ? '#bfe6ef' : '#ffffff', { grav: 14 });
    }
  }

  leaves(x, y, z, n, colors) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 3;
      this.add(x, y + 0.2, z, Math.cos(a) * s, 3 + Math.random() * 4, Math.sin(a) * s, 2 + Math.random() * 1.5, 0.14 + Math.random() * 0.06, colors[i % colors.length], { grav: 3, drag: 2, flat: true, mode: 2 });
    }
  }

  confetti(x, y, z, n, colors) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 2.5;
      this.add(x, y, z, Math.cos(a) * s, 2 + Math.random() * 3, Math.sin(a) * s, 1.8 + Math.random(), 0.1 + Math.random() * 0.06, colors[i % colors.length], { grav: 3, drag: 2, flat: true, mode: 2 });
    }
  }

  sparkle(x, y, z, n = 8, color = '#fff3a0') {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.add(x + Math.cos(a) * 0.3, y + Math.random() * 0.4, z + Math.sin(a) * 0.3, Math.cos(a) * 0.5, 1 + Math.random(), Math.sin(a) * 0.5, 0.8 + Math.random() * 0.4, 0.07, color, { grav: -0.5, drag: 2 });
    }
  }

  steam(x, y, z, size = 0.35) {
    this.addPuff(x, y, z, (Math.random() - 0.5) * 0.3, 0.45 + Math.random() * 0.35, (Math.random() - 0.5) * 0.3, 2.4, size, '#ffffff', { grav: -0.1, drag: 0.5, mode: 1, spin: 0.4 });
  }

  stink(x, y, z) {
    this.addPuff(x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2, 0, 0.45, 0, 1.4, 0.07, '#b9c78e', { grav: -0.2, drag: 1, mode: 2, spin: 2 });
  }

  hearts(x, y, z, n = 3) {
    for (let i = 0; i < n; i++) this.add(x, y, z, (Math.random() - 0.5), 1.2, (Math.random() - 0.5), 1.2, 0.1, '#ff7aa2', { grav: -0.5, drag: 1 });
  }
}

// Ambient falling petals / leaves / snow around the camera.
export class Weather {
  constructor(scene, pal) {
    this.pal = pal;
    const kind = pal.particles.kind;
    this.kind = kind;
    this.count = kind === 'none' ? 0 : kind === 'snow' ? 420 : 160;
    if (!this.count) return;
    const geo = kind === 'snow' ? new THREE.IcosahedronGeometry(0.06, 0) : new THREE.BoxGeometry(0.16, 0.02, 0.11);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), this.count);
    this.mesh.frustumCulled = false;
    const c = new THREE.Color();
    this.pts = [];
    for (let i = 0; i < this.count; i++) {
      c.set(pal.particles.colors[i % pal.particles.colors.length]);
      this.mesh.setColorAt(i, c);
      this.pts.push({ x: (Math.random() - 0.5) * 60, y: Math.random() * 18, z: (Math.random() - 0.5) * 50, ph: Math.random() * 10, sp: 0.6 + Math.random() * 0.8 });
    }
    this.dummy = new THREE.Object3D();
    scene.add(this.mesh);
    this.scene = scene;
  }
  dispose() {
    if (this.mesh) this.scene.remove(this.mesh);
  }
  update(dt, time, cx, cz) {
    if (!this.count) return;
    const d = this.dummy;
    const snow = this.kind === 'snow';
    for (let i = 0; i < this.count; i++) {
      const p = this.pts[i];
      p.y -= dt * (snow ? 1.1 : 0.9) * p.sp;
      p.x += Math.sin(time * 0.7 + p.ph) * dt * 0.8 + dt * 0.4;
      p.z += Math.cos(time * 0.5 + p.ph) * dt * 0.5;
      if (p.y < 0) {
        p.y = 16 + Math.random() * 3;
        p.x = cx + (Math.random() - 0.5) * 60;
        p.z = cz + (Math.random() - 0.5) * 50;
      }
      let rx = p.x;
      let rz = p.z;
      // wrap around camera focus
      if (rx - cx > 30) p.x -= 60;
      if (rx - cx < -30) p.x += 60;
      if (rz - cz > 25) p.z -= 50;
      if (rz - cz < -25) p.z += 50;
      rx = p.x;
      rz = p.z;
      d.position.set(rx, p.y, rz);
      d.rotation.set(time * p.sp + p.ph, p.ph, time * 0.7 * p.sp);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
