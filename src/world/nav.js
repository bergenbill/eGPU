// Grid-based A* navigation for the townsfolk. Built once from the static colliders.
export class NavGrid {
  constructor(world, cell = 0.5, agentR = 0.38) {
    const b = world.bounds;
    this.world = world;
    this.cell = cell;
    this.ox = b.minX;
    this.oz = b.minZ;
    this.w = Math.ceil((b.maxX - b.minX) / cell);
    this.h = Math.ceil((b.maxZ - b.minZ) / cell);
    this.blocked = new Uint8Array(this.w * this.h);
    this.agentR = agentR;
    this._build();
    const n = this.w * this.h;
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.visit = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.search = 1;
    this.heap = new Int32Array(n);
  }

  _build() {
    const w = this.world;
    const R = this.agentR;
    for (const c of w.colliders) {
      if (!c.block || !c.nav) continue;
      if (c.top < 0.3) continue;
      let minX, maxX, minZ, maxZ;
      if (c.kind === 'box') {
        minX = c.minX - R;
        maxX = c.maxX + R;
        minZ = c.minZ - R;
        maxZ = c.maxZ + R;
      } else {
        minX = c.x - c.r - R;
        maxX = c.x + c.r + R;
        minZ = c.z - c.r - R;
        maxZ = c.z + c.r + R;
      }
      const [i0, j0] = this.toCell(minX, minZ);
      const [i1, j1] = this.toCell(maxX, maxZ);
      for (let j = Math.max(0, j0); j <= Math.min(this.h - 1, j1); j++) {
        for (let i = Math.max(0, i0); i <= Math.min(this.w - 1, i1); i++) {
          if (c.kind === 'circle') {
            const [x, z] = this.toWorld(i, j);
            if (Math.hypot(x - c.x, z - c.z) > c.r + R) continue;
          }
          this.blocked[j * this.w + i] = 1;
        }
      }
    }
    for (const wt of w.waters) {
      if (wt.walkable) continue;
      for (let j = 0; j < this.h; j++) {
        for (let i = 0; i < this.w; i++) {
          const [x, z] = this.toWorld(i, j);
          if (w.waterAt(x, z) === wt) this.blocked[j * this.w + i] = 1;
        }
      }
    }
    // border
    for (let i = 0; i < this.w; i++) {
      this.blocked[i] = 1;
      this.blocked[(this.h - 1) * this.w + i] = 1;
    }
    for (let j = 0; j < this.h; j++) {
      this.blocked[j * this.w] = 1;
      this.blocked[j * this.w + this.w - 1] = 1;
    }
  }

  toCell(x, z) {
    return [Math.floor((x - this.ox) / this.cell), Math.floor((z - this.oz) / this.cell)];
  }
  toWorld(i, j) {
    return [this.ox + (i + 0.5) * this.cell, this.oz + (j + 0.5) * this.cell];
  }
  isFree(i, j) {
    return i >= 0 && j >= 0 && i < this.w && j < this.h && !this.blocked[j * this.w + i];
  }
  freeAt(x, z) {
    const [i, j] = this.toCell(x, z);
    return this.isFree(i, j);
  }

  nearestFree(x, z, maxR = 12) {
    const [ci, cj] = this.toCell(x, z);
    if (this.isFree(ci, cj)) return [ci, cj];
    const maxC = Math.ceil(maxR / this.cell);
    for (let r = 1; r <= maxC; r++) {
      let best = null;
      let bd = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
          const i = ci + di;
          const j = cj + dj;
          if (!this.isFree(i, j)) continue;
          const d = di * di + dj * dj;
          if (d < bd) {
            bd = d;
            best = [i, j];
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  // Walkable straight line between two cells?
  lineFree(x0, z0, x1, z1) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const steps = Math.ceil(len / (this.cell * 0.5));
    for (let s = 0; s <= steps; s++) {
      const t = steps ? s / steps : 0;
      if (!this.freeAt(x0 + dx * t, z0 + dz * t)) return false;
    }
    return true;
  }

  findPath(sx, sz, tx, tz, maxIter = 30000) {
    const start = this.nearestFree(sx, sz, 3);
    const goal = this.nearestFree(tx, tz, 8);
    if (!start || !goal) return null;
    const W = this.w;
    const si = start[1] * W + start[0];
    const gi = goal[1] * W + goal[0];
    if (si === gi) return [this.toWorld(goal[0], goal[1])];
    const search = ++this.search;
    const { g, f, parent, visit, closed, heap } = this;
    let hs = 0;
    const gx = goal[0];
    const gz = goal[1];
    const hfn = (i) => {
      const x = i % W;
      const z = (i / W) | 0;
      const dx = Math.abs(x - gx);
      const dz = Math.abs(z - gz);
      return dx + dz + (1.4142 - 2) * Math.min(dx, dz);
    };
    const push = (i) => {
      let k = hs++;
      heap[k] = i;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (f[heap[p]] <= f[heap[k]]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      heap[0] = heap[--hs];
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < hs && f[heap[l]] < f[heap[m]]) m = l;
        if (r < hs && f[heap[r]] < f[heap[m]]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
      return top;
    };
    visit[si] = search;
    g[si] = 0;
    f[si] = hfn(si);
    parent[si] = -1;
    push(si);
    let iter = 0;
    let found = false;
    let bestI = si;
    let bestH = Infinity;
    const dirs = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
    ];
    while (hs > 0 && iter++ < maxIter) {
      const cur = pop();
      if (closed[cur] === search) continue;
      closed[cur] = search;
      if (cur === gi) {
        found = true;
        break;
      }
      const h = f[cur] - g[cur];
      if (h < bestH) {
        bestH = h;
        bestI = cur;
      }
      const cx = cur % W;
      const cz = (cur / W) | 0;
      for (const [dx, dz, cost] of dirs) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (!this.isFree(nx, nz)) continue;
        if (dx && dz && (!this.isFree(cx + dx, cz) || !this.isFree(cx, cz + dz))) continue;
        const ni = nz * W + nx;
        if (closed[ni] === search) continue;
        const ng = g[cur] + cost;
        if (visit[ni] !== search || ng < g[ni]) {
          visit[ni] = search;
          g[ni] = ng;
          f[ni] = ng + hfn(ni);
          parent[ni] = cur;
          push(ni);
        }
      }
    }
    const end = found ? gi : bestI;
    const cells = [];
    for (let c = end; c !== -1; c = parent[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => this.toWorld(c % W, (c / W) | 0));
    return this.smooth(pts);
  }

  smooth(pts) {
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    let anchor = 0;
    while (anchor < pts.length - 1) {
      let far = anchor + 1;
      // Greedy forward scan (cheap): extend while the straight line stays walkable.
      for (let k = anchor + 2; k < pts.length; k++) {
        if (k - anchor > 60) break;
        if (this.lineFree(pts[anchor][0], pts[anchor][1], pts[k][0], pts[k][1])) far = k;
        else break;
      }
      out.push(pts[far]);
      anchor = far;
    }
    return out;
  }
}
