import { clamp } from '../core/math.js';

// Very small 2.5D collision world. Everything lives on the XZ plane; colliders have a top height
// so animals can climb onto them, stand on roofs, perch in trees, etc.
export class World {
  constructor(bounds) {
    this.bounds = bounds; // {minX,maxX,minZ,maxZ}
    this.colliders = [];
    this.dynamic = [];
    this.waters = [];
    this.hides = [];
    this.zones = [];
    this.cell = 4;
    this.hash = new Map();
    this.stamp = 1;
    this._tmp = [];
  }

  _key(ix, iz) {
    return (ix + 512) * 2048 + (iz + 512);
  }

  _insert(c) {
    const b = this._aabb(c);
    const s = this.cell;
    for (let ix = Math.floor(b.minX / s); ix <= Math.floor(b.maxX / s); ix++) {
      for (let iz = Math.floor(b.minZ / s); iz <= Math.floor(b.maxZ / s); iz++) {
        const k = this._key(ix, iz);
        let list = this.hash.get(k);
        if (!list) this.hash.set(k, (list = []));
        list.push(c);
      }
    }
  }

  _aabb(c) {
    if (c.kind === 'box') return c;
    return { minX: c.x - c.r, maxX: c.x + c.r, minZ: c.z - c.r, maxZ: c.z + c.r };
  }

  addBox(o) {
    const c = {
      kind: 'box',
      minX: Math.min(o.minX, o.maxX),
      maxX: Math.max(o.minX, o.maxX),
      minZ: Math.min(o.minZ, o.maxZ),
      maxZ: Math.max(o.minZ, o.maxZ),
      top: o.top ?? 1,
      walk: o.walk ?? false,
      climb: o.climb ?? null,
      opaque: o.opaque ?? (o.top ?? 1) > 1.6,
      roof: o.roof ?? null,
      block: o.block ?? true,
      nav: o.nav ?? true,
      tag: o.tag ?? '',
      perch: o.perch ?? null,
      stamp: 0,
    };
    this.colliders.push(c);
    this._insert(c);
    return c;
  }

  // Helper: box from center + size.
  addBoxC(x, z, w, d, top, opts = {}) {
    return this.addBox({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top, ...opts });
  }

  addCircle(o) {
    const c = {
      kind: 'circle',
      x: o.x,
      z: o.z,
      r: o.r,
      top: o.top ?? 1,
      walk: o.walk ?? false,
      climb: o.climb ?? null,
      opaque: o.opaque ?? false,
      block: o.block ?? true,
      nav: o.nav ?? true,
      tag: o.tag ?? '',
      perch: o.perch ?? null,
      stamp: 0,
    };
    this.colliders.push(c);
    this._insert(c);
    return c;
  }

  addWater(o) {
    const w = { kind: o.kind || 'circle', level: 0.02, depth: 0.5, ...o };
    this.waters.push(w);
    return w;
  }

  addHide(x, z, r, tag = 'bush') {
    const h = { x, z, r, tag, rustle: 0 };
    this.hides.push(h);
    return h;
  }

  addZone(name, x, z, r, label) {
    const zn = { name, x, z, r, label };
    this.zones.push(zn);
    return zn;
  }

  query(x, z, r) {
    const out = this._tmp;
    out.length = 0;
    const st = ++this.stamp;
    const s = this.cell;
    for (let ix = Math.floor((x - r) / s); ix <= Math.floor((x + r) / s); ix++) {
      for (let iz = Math.floor((z - r) / s); iz <= Math.floor((z + r) / s); iz++) {
        const list = this.hash.get(this._key(ix, iz));
        if (!list) continue;
        for (const c of list) {
          if (c.stamp === st) continue;
          c.stamp = st;
          out.push(c);
        }
      }
    }
    for (const c of this.dynamic) out.push(c);
    return out;
  }

  contains(c, x, z, pad = 0) {
    if (c.kind === 'box') return x >= c.minX - pad && x <= c.maxX + pad && z >= c.minZ - pad && z <= c.maxZ + pad;
    const dx = x - c.x;
    const dz = z - c.z;
    return dx * dx + dz * dz <= (c.r + pad) * (c.r + pad);
  }

  topAt(c, x, z) {
    if (!c.roof) return c.top;
    const r = c.roof;
    let t;
    if (r.axis === 'x') t = Math.abs(z - r.c) / r.half;
    else t = Math.abs(x - r.c) / r.half;
    t = clamp(t, 0, 1);
    return r.ridge - (r.ridge - r.eave) * t;
  }

  // Height of the highest walkable surface under (x,z) that is reachable from height y.
  groundAt(x, z, y = 0, step = 0.45) {
    let g = 0;
    const list = this.query(x, z, 0.01);
    for (const c of list) {
      if (!c.walk) continue;
      if (!this.contains(c, x, z)) continue;
      const t = this.topAt(c, x, z);
      if (t <= y + step && t > g) g = t;
    }
    return g;
  }

  // Push a circle out of blocking colliders. Returns the last collider hit (or null).
  resolve(ent, r, step = 0.45, ignore = null, opts = null) {
    let hit = null;
    const squeeze = opts && opts.squeeze;
    const isItem = opts && opts.item;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const list = this.query(ent.x, ent.z, r + 0.1);
      for (const c of list) {
        if (!c.block || c === ignore) continue;
        if (squeeze && c.squeeze) continue;
        if (isItem && c.itemPass) continue;
        if (c.kind === 'box') {
          const px = clamp(ent.x, c.minX, c.maxX);
          const pz = clamp(ent.z, c.minZ, c.maxZ);
          const top = this.topAt(c, px, pz);
          if (ent.y + step >= top) continue;
          if ((c.bottom || 0) > ent.y + 0.8) continue;
          let dx = ent.x - px;
          let dz = ent.z - pz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-9) {
            const d = Math.sqrt(d2);
            const push = r - d;
            dx /= d;
            dz /= d;
            ent.x += dx * push;
            ent.z += dz * push;
            hit = { c, nx: dx, nz: dz };
          } else {
            // Inside the box: exit via the nearest face.
            const l = ent.x - c.minX;
            const rr = c.maxX - ent.x;
            const u = ent.z - c.minZ;
            const dd = c.maxZ - ent.z;
            const m = Math.min(l, rr, u, dd);
            if (m === l) {
              ent.x = c.minX - r;
              hit = { c, nx: -1, nz: 0 };
            } else if (m === rr) {
              ent.x = c.maxX + r;
              hit = { c, nx: 1, nz: 0 };
            } else if (m === u) {
              ent.z = c.minZ - r;
              hit = { c, nx: 0, nz: -1 };
            } else {
              ent.z = c.maxZ + r;
              hit = { c, nx: 0, nz: 1 };
            }
          }
          moved = true;
        } else {
          if (ent.y + step >= c.top) continue;
          let dx = ent.x - c.x;
          let dz = ent.z - c.z;
          const rr = r + c.r;
          const d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr) continue;
          const d = Math.sqrt(d2) || 1e-4;
          dx /= d;
          dz /= d;
          ent.x = c.x + dx * rr;
          ent.z = c.z + dz * rr;
          hit = { c, nx: dx, nz: dz };
          moved = true;
        }
      }
      if (!moved) break;
    }
    const b = this.bounds;
    if (ent.x < b.minX + r) (ent.x = b.minX + r), (hit = hit || { c: null, nx: 1, nz: 0 });
    if (ent.x > b.maxX - r) (ent.x = b.maxX - r), (hit = hit || { c: null, nx: -1, nz: 0 });
    if (ent.z < b.minZ + r) (ent.z = b.minZ + r), (hit = hit || { c: null, nx: 0, nz: 1 });
    if (ent.z > b.maxZ - r) (ent.z = b.maxZ - r), (hit = hit || { c: null, nx: 0, nz: -1 });
    return hit;
  }

  // Line of sight between two points (heights matter: walls lower than the ray don't block).
  losClear(ax, ay, az, bx, by, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / 0.4));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + dx * t;
      const z = az + dz * t;
      const h = ay + (by - ay) * t;
      const list = this.query(x, z, 0.01);
      for (const c of list) {
        if (!c.opaque) continue;
        if (!this.contains(c, x, z)) continue;
        if (this.topAt(c, x, z) > h) return false;
      }
    }
    return true;
  }

  waterAt(x, z) {
    for (const w of this.waters) {
      if (w.kind === 'box') {
        if (x >= w.minX && x <= w.maxX && z >= w.minZ && z <= w.maxZ) return w;
      } else {
        const dx = (x - w.x) / (w.rx || w.r);
        const dz = (z - w.z) / (w.rz || w.r);
        if (dx * dx + dz * dz <= 1) return w;
      }
    }
    return null;
  }

  hideAt(x, z) {
    for (const h of this.hides) {
      const dx = x - h.x;
      const dz = z - h.z;
      if (dx * dx + dz * dz <= h.r * h.r) return h;
    }
    return null;
  }

  zoneAt(x, z) {
    let best = null;
    let bd = Infinity;
    for (const zn of this.zones) {
      const d = Math.hypot(x - zn.x, z - zn.z);
      if (d < zn.r && d < bd) {
        bd = d;
        best = zn;
      }
    }
    return best;
  }

  // Nearest climbable surface in front of an entity.
  findClimbable(x, z, y, yaw, reach, kinds) {
    const list = this.query(x, z, reach + 1);
    let best = null;
    let bestD = Infinity;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    for (const c of list) {
      if (!c.climb || !kinds.includes(c.climb)) continue;
      let px, pz;
      if (c.kind === 'box') {
        px = clamp(x, c.minX, c.maxX);
        pz = clamp(z, c.minZ, c.maxZ);
      } else {
        const dx = x - c.x;
        const dz = z - c.z;
        const d = Math.hypot(dx, dz) || 1;
        px = c.x + (dx / d) * c.r;
        pz = c.z + (dz / d) * c.r;
      }
      const top = this.topAt(c, px, pz);
      if (y > top - 0.25) continue;
      const vx = px - x;
      const vz = pz - z;
      const d = Math.hypot(vx, vz);
      if (d > reach) continue;
      if (d > 0.05 && (vx * fx + vz * fz) / d < 0.35) continue;
      if (d < bestD) {
        bestD = d;
        best = { c, px, pz, top, d };
      }
    }
    return best;
  }
}
