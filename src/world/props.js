import * as THREE from 'three';
import { box, cyl, sphere, cone, prism, group } from '../render/geom.js';
import { mat, uniqueMat } from '../render/materials.js';
import { COMMON as C } from './palette.js';
import * as TX from '../render/textures.js';

// Builders for static scenery. Each takes the TownBuilder `T` (world, palette, roots) and
// registers colliders as needed.

export function tree(T, x, z, kind = 'green', s = 1, opts = {}) {
  const pal = T.pal;
  const rng = T.rng;
  const ry = rng.range(0, Math.PI * 2);
  const g = group({ x, z, ry });
  const canopy = group({ x, z, ry });
  const trunkH = (kind === 'cedar' ? 3.4 : kind === 'pine' ? 2.2 : 2.3) * s;
  const trunkC = kind === 'sakura' ? '#5b3f35' : C.trunk;
  g.add(cyl(0.2 * s, 0.32 * s, trunkH, trunkC, { y: trunkH / 2, seg: 6 }));
  let colors;
  if (kind === 'sakura') colors = pal.sakura;
  else if (kind === 'maple') colors = pal.maple;
  else if (kind === 'ginkgo') colors = pal.ginkgo;
  else if (kind === 'persimmon') colors = pal.snow ? pal.green : ['#8f9e4f', '#7f9447', '#a0a35a'];
  else colors = pal.green;
  let top = trunkH + 2.2 * s;
  let cy = trunkH + 1.0 * s;
  let cr = 1.9 * s;
  if (kind === 'pine') {
    const pc = pal.pine;
    g.add(cyl(0.14 * s, 0.2 * s, 1.2 * s, trunkC, { y: trunkH + 0.4 * s, rz: 0.4, x: 0.3 * s, seg: 5 }));
    const pads = [
      [0, trunkH + 0.2 * s, 0, 1.5],
      [0.9, trunkH + 0.9 * s, 0.3, 1.1],
      [-0.7, trunkH + 1.3 * s, -0.2, 1.0],
      [0.2, trunkH + 1.9 * s, 0.1, 0.8],
    ];
    for (const [px, py, pz, r] of pads) {
      canopy.add(sphere(r * s, pc, { x: px * s, y: py, z: pz * s, sy: 0.45, lo: true }));
      if (pal.snow) canopy.add(sphere(r * s * 0.85, '#f4f7fa', { x: px * s, y: py + 0.18 * s, z: pz * s, sy: 0.25, lo: true }));
    }
    top = trunkH + 2.2 * s;
  } else if (kind === 'cedar') {
    const cc = pal.snow ? '#5d7a5f' : '#4d6e48';
    for (let i = 0; i < 4; i++) {
      canopy.add(cone((1.9 - i * 0.38) * s, 1.9 * s, cc, { y: trunkH + i * 1.1 * s, seg: 7 }));
    }
    // shimenawa rope
    g.add(cyl(0.42 * s, 0.42 * s, 0.14, '#e8d9a8', { y: 1.5 * s, seg: 10 }));
    g.add(box(0.12, 0.4, 0.02, '#ffffff', { y: 1.2 * s, z: 0.42 * s }));
    top = trunkH + 4.5 * s;
    cy = trunkH + 1.8 * s;
    cr = 2.4 * s;
  } else {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(0, 1);
      const r = i === 0 ? 0 : 0.95 * s;
      const br = (i === 0 ? 1.5 : rng.range(0.9, 1.2)) * s;
      canopy.add(
        sphere(br, colors[i % colors.length], {
          x: Math.cos(a) * r,
          y: trunkH + (i === 0 ? 0.9 * s : rng.range(0.2, 0.9) * s),
          z: Math.sin(a) * r,
          lo: true,
        }),
      );
    }
    if (kind === 'persimmon' && !pal.snow) {
      for (let i = 0; i < 7; i++) {
        const a = rng.range(0, Math.PI * 2);
        canopy.add(sphere(0.13, '#f08a24', { x: Math.cos(a) * 1.35 * s, y: trunkH + rng.range(0.1, 1.2) * s, z: Math.sin(a) * 1.35 * s }));
      }
    }
    if (pal.snow && kind !== 'persimmon') {
      canopy.add(sphere(1.2 * s, '#f6f8fa', { y: trunkH + 1.5 * s, sy: 0.4, lo: true }));
    }
  }
  T.add(g);
  const cm = T.addCanopy(canopy);
  const climbable = opts.climb !== false;
  const c = T.world.addCircle({
    x,
    z,
    r: 0.3 * s,
    top,
    climb: climbable ? 'tree' : null,
    opaque: false,
    tag: opts.tag || 'tree:' + kind,
    perch: climbable ? { x, y: trunkH + 0.35 * s, z } : null,
  });
  c.treeKind = kind;
  T.trees.push({ x, z, s, kind, c, group: g, trunkH, canopy: cm, cy, cr });
  return c;
}

export function bush(T, x, z, s = 1, color) {
  const pal = T.pal;
  const col = color || (pal.snow ? '#dfe7ea' : pal.green[0]);
  const g = group({ x, z });
  g.add(sphere(0.9 * s, col, { y: 0.55 * s, sy: 0.75, lo: true }));
  g.add(sphere(0.7 * s, pal.snow ? '#eef2f4' : pal.green[1], { x: 0.6 * s, y: 0.45 * s, z: 0.2 * s, sy: 0.75, lo: true }));
  g.add(sphere(0.65 * s, pal.snow ? '#e6ecef' : pal.green[2], { x: -0.55 * s, y: 0.4 * s, z: -0.25 * s, sy: 0.8, lo: true }));
  // bushes rustle when you move through them, so they stay dynamic
  T.addDyn(g);
  const h = T.world.addHide(x, z, 1.15 * s, 'bush');
  h.mesh = g;
  return h;
}

export function hedge(T, x0, z0, x1, z1, h = 1.0) {
  const pal = T.pal;
  const w = Math.abs(x1 - x0) || 0.9;
  const d = Math.abs(z1 - z0) || 0.9;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  T.add(box(w, h, d, pal.snow ? '#dfe7ea' : pal.green[1], { x: cx, y: h / 2, z: cz }));
  T.add(box(w * 0.98, 0.18, d * 0.98, pal.snow ? '#f6f8fa' : pal.green[0], { x: cx, y: h + 0.05, z: cz }));
  T.world.addBoxC(cx, cz, w, d, h, { opaque: false, tag: 'hedge' });
}

export function fence(T, x0, z0, x1, z1, opts = {}) {
  const h = opts.h || 1.2;
  const color = opts.color || C.woodLight;
  const bamboo = opts.bamboo;
  const len = Math.hypot(x1 - x0, z1 - z0);
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  if (bamboo) {
    const n = Math.floor(len / 0.16);
    const g = group();
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const px = x0 + (x1 - x0) * t;
      const pz = z0 + (z1 - z0) * t;
      if (i % 3 === 0) g.add(cyl(0.08, 0.08, h + (i % 2) * 0.1, i % 2 ? C.bamboo : C.bambooDark, { x: px, y: h / 2, z: pz, seg: 5, shadow: false }));
    }
    g.add(box(alongX ? len : 0.3, h, alongX ? 0.14 : len, i2c(C.bamboo), { x: cx, y: h / 2, z: cz }));
    g.add(box(alongX ? len : 0.22, 0.08, alongX ? 0.22 : len, C.woodDark, { x: cx, y: h * 0.8, z: cz }));
    g.add(box(alongX ? len : 0.22, 0.08, alongX ? 0.22 : len, C.woodDark, { x: cx, y: h * 0.3, z: cz }));
    T.add(g);
  } else {
    const g = group();
    g.add(box(alongX ? len : 0.08, 0.1, alongX ? 0.08 : len, color, { x: cx, y: h * 0.85, z: cz }));
    g.add(box(alongX ? len : 0.08, 0.1, alongX ? 0.08 : len, color, { x: cx, y: h * 0.4, z: cz }));
    const n = Math.max(2, Math.round(len / 1.2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      g.add(box(0.12, h, 0.12, C.wood, { x: x0 + (x1 - x0) * t, y: h / 2, z: z0 + (z1 - z0) * t }));
    }
    T.add(g);
  }
  const thick = 0.24;
  return T.world.addBox({
    minX: alongX ? Math.min(x0, x1) : cx - thick / 2,
    maxX: alongX ? Math.max(x0, x1) : cx + thick / 2,
    minZ: alongX ? cz - thick / 2 : Math.min(z0, z1),
    maxZ: alongX ? cz + thick / 2 : Math.max(z0, z1),
    top: h,
    walk: true,
    climb: 'wall',
    opaque: h > 1.6,
    tag: opts.tag || 'fence',
  });
}
function i2c(c) {
  return c;
}

// A Japanese-style building with a gable roof. Returns the group (used as a camera occluder).
export function house(T, o) {
  const pal = T.pal;
  const { x, z, w, d } = o;
  const h = o.h ?? 2.8;
  const roofH = o.roofH ?? 1.8;
  const axis = o.axis || 'x';
  const base = o.base ?? 0.35;
  const over = o.over ?? 0.7;
  const g = group({ x, z });
  const wall = o.wall || C.wall;
  const roofC = o.roof || pal.roof;
  // stone base
  g.add(box(w + 0.2, base, d + 0.2, C.stone, { y: base / 2 }));
  // walls
  g.add(box(w, h - base, d, wall, { y: base + (h - base) / 2 }));
  // timber frame
  const post = C.woodDark;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.22, h - base, 0.22, post, { x: (sx * w) / 2, y: base + (h - base) / 2, z: (sz * d) / 2 }));
  g.add(box(w + 0.1, 0.18, 0.12, post, { y: h - 0.1, z: d / 2 + 0.01 }));
  g.add(box(w + 0.1, 0.18, 0.12, post, { y: h - 0.1, z: -d / 2 - 0.01 }));
  g.add(box(0.12, 0.18, d + 0.1, post, { x: w / 2 + 0.01, y: h - 0.1 }));
  g.add(box(0.12, 0.18, d + 0.1, post, { x: -w / 2 - 0.01, y: h - 0.1 }));
  if (o.midBeam !== false) {
    g.add(box(w + 0.1, 0.12, 0.1, post, { y: base + 1.0, z: d / 2 + 0.02 }));
    g.add(box(w + 0.1, 0.12, 0.1, post, { y: base + 1.0, z: -d / 2 - 0.02 }));
  }
  // roof
  const span = axis === 'x' ? d : w;
  const len = axis === 'x' ? w : d;
  const slope = roofH / (span / 2);
  const rH = roofH + slope * over;
  const rY = h - slope * over;
  const roof = prism(len + over * 2, rH, span + over * 2, roofC, { y: rY, ry: axis === 'x' ? 0 : Math.PI / 2 });
  g.add(roof);
  // ridge
  g.add(box(axis === 'x' ? len + over * 2 + 0.1 : 0.3, 0.22, axis === 'x' ? 0.3 : len + over * 2 + 0.1, pal.snow ? '#dfe6ea' : '#39424d', { y: h + roofH + 0.05 }));
  // eave trim
  const trimC = pal.snow ? '#cfd7dd' : '#3c4550';
  if (axis === 'x') {
    g.add(box(len + over * 2, 0.08, 0.14, trimC, { y: rY + 0.04, z: span / 2 + over }));
    g.add(box(len + over * 2, 0.08, 0.14, trimC, { y: rY + 0.04, z: -span / 2 - over }));
  } else {
    g.add(box(0.14, 0.08, len + over * 2, trimC, { x: span / 2 + over, y: rY + 0.04 }));
    g.add(box(0.14, 0.08, len + over * 2, trimC, { x: -span / 2 - over, y: rY + 0.04 }));
  }
  if (o.windows) {
    for (const wdef of o.windows) g.add(windowMesh(wdef));
  }
  if (o.extra) o.extra(g);
  T.addOccluder(g);
  const col = T.world.addBox({
    minX: x - w / 2,
    maxX: x + w / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
    top: h + roofH,
    walk: true,
    climb: o.climb === false ? null : 'wall',
    opaque: true,
    roof: { axis, c: axis === 'x' ? z : x, half: span / 2, eave: h, ridge: h + roofH },
    tag: o.tag || 'house',
  });
  return { g, col };
}

function windowMesh({ x = 0, y = 1.6, z = 0, ry = 0, w = 1.2, h = 0.9 }) {
  const g = group({ x, y, z, ry });
  g.add(box(w, h, 0.05, '#dfe9ec', {}));
  g.add(box(w + 0.1, 0.08, 0.08, C.woodDark, { y: h / 2 }));
  g.add(box(w + 0.1, 0.08, 0.08, C.woodDark, { y: -h / 2 }));
  g.add(box(0.06, h, 0.08, C.woodDark, {}));
  for (let i = 1; i < 3; i++) g.add(box(w, 0.03, 0.07, C.woodDark, { y: -h / 2 + (i * h) / 3 }));
  return g;
}

export function noren(T, x, y, z, ry, text, color, w = 2.2) {
  const tex = TX.norenTex(text, color);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.0), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.noBatch = true;
  m.castShadow = true;
  T.addDyn(m);
  const rod = box(w + 0.3, 0.06, 0.06, C.woodDark, { x, y: y + 0.52, z, ry });
  T.add(rod);
  return m;
}

export function signBoard(T, x, y, z, ry, text, opts = {}) {
  const tex = TX.signTex(text, opts.bg, opts.fg, opts.vertical);
  const w = opts.vertical ? 0.5 : opts.w || 2;
  const h = opts.vertical ? 2 : (opts.w || 2) / 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.noBatch = true;
  T.addDyn(m);
  const back = box(w + 0.1, h + 0.1, 0.06, C.woodDark, { x, y, z, ry });
  back.position.x -= Math.sin(ry) * 0.035;
  back.position.z -= Math.cos(ry) * 0.035;
  T.add(back);
  return m;
}

export function bench(T, x, z, ry = 0, color = C.woodLight, len = 3) {
  const g = group({ x, z, ry });
  g.add(box(len, 0.1, 0.6, color, { y: 0.42 }));
  for (const s of [-1, 1]) g.add(box(0.12, 0.42, 0.5, C.woodDark, { x: s * (len / 2 - 0.3), y: 0.21 }));
  T.add(g);
  const alongX = Math.abs(Math.sin(ry)) < 0.5;
  T.world.addBoxC(x, z, alongX ? len : 0.6, alongX ? 0.6 : len, 0.47, { walk: true, opaque: false, tag: 'bench' });
  return g;
}

export function torii(T, x, z, ry = 0, s = 1) {
  const g = group({ x, z, ry });
  const red = C.torii;
  const H = 4.3 * s;
  const W = 2.3 * s;
  for (const sx of [-1, 1]) {
    g.add(cyl(0.22 * s, 0.27 * s, H, red, { x: sx * W, y: H / 2, seg: 10 }));
    g.add(cyl(0.3 * s, 0.3 * s, 0.35, C.black, { x: sx * W, y: 0.17, seg: 10 }));
  }
  g.add(box(W * 2 + 0.6, 0.3 * s, 0.34 * s, red, { y: H - 0.6 * s }));
  g.add(box(W * 2 + 1.6, 0.34 * s, 0.5 * s, red, { y: H + 0.05 }));
  g.add(box(W * 2 + 2.0, 0.18 * s, 0.56 * s, C.black, { y: H + 0.3 * s }));
  g.add(box(0.3, 0.6 * s, 0.25, red, { y: H - 0.28 * s }));
  T.add(g);
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  for (const sx of [-1, 1]) {
    const px = x + sx * W * cos;
    const pz = z - sx * W * sin;
    T.world.addCircle({ x: px, z: pz, r: 0.3 * s, top: H + 0.5, climb: 'pole', tag: 'torii', perch: { x: px, y: H + 0.5 * s, z: pz } });
  }
}

export function stoneLantern(T, x, z, s = 1) {
  const g = group({ x, z });
  const st = C.stone;
  g.add(box(0.7 * s, 0.25 * s, 0.7 * s, C.stoneDark, { y: 0.12 * s }));
  g.add(cyl(0.15 * s, 0.2 * s, 0.8 * s, st, { y: 0.65 * s, seg: 6 }));
  g.add(box(0.7 * s, 0.12 * s, 0.7 * s, st, { y: 1.1 * s }));
  g.add(box(0.5 * s, 0.4 * s, 0.5 * s, st, { y: 1.35 * s }));
  g.add(box(0.3 * s, 0.22 * s, 0.52 * s, '#f6e6b0', { y: 1.35 * s }));
  g.add(cone(0.6 * s, 0.4 * s, T.pal.snow ? '#f2f5f7' : st, { y: 1.75 * s, seg: 4, ry: Math.PI / 4 }));
  g.add(sphere(0.09 * s, st, { y: 2.0 * s }));
  T.add(g);
  T.world.addCircle({ x, z, r: 0.4 * s, top: 1.9 * s, opaque: false, tag: 'lantern' });
}

export function komainu(T, x, z, ry) {
  const g = group({ x, z, ry });
  g.add(box(1.0, 1.0, 1.0, C.stoneDark, { y: 0.5 }));
  g.add(box(1.1, 0.12, 1.1, C.stone, { y: 1.02 }));
  const s = '#b8b3a8';
  g.add(sphere(0.35, s, { y: 1.35, z: -0.1, sy: 1.1, lo: true }));
  g.add(sphere(0.3, s, { y: 1.8, z: 0.1, lo: true }));
  g.add(sphere(0.18, '#a8a397', { y: 1.95, z: -0.05, sy: 1.3, lo: true }));
  g.add(box(0.12, 0.35, 0.12, s, { x: -0.18, y: 1.25, z: 0.25 }));
  g.add(box(0.12, 0.35, 0.12, s, { x: 0.18, y: 1.25, z: 0.25 }));
  T.add(g);
  T.world.addBoxC(x, z, 1.0, 1.0, 1.1, { walk: true, climb: 'wall', opaque: false, tag: 'komainu' });
}

export function jizo(T, x, z, ry = 0) {
  const g = group({ x, z, ry });
  g.add(box(0.6, 0.25, 0.6, C.stoneDark, { y: 0.12 }));
  g.add(cyl(0.2, 0.26, 0.55, '#a9a69e', { y: 0.5, seg: 8 }));
  g.add(sphere(0.19, '#b3b0a8', { y: 0.92, smooth: true }));
  // red bib
  const bib = cone(0.3, 0.35, '#d23b2f', { y: 0.62, z: 0.02, seg: 8 });
  bib.rotation.x = Math.PI;
  g.add(bib);
  T.add(g);
  T.world.addCircle({ x, z, r: 0.3, top: 0.75, opaque: false, tag: 'jizo' });
  return g;
}

export function lampPost(T, x, z) {
  const g = group({ x, z });
  g.add(cyl(0.07, 0.09, 3.4, '#4a4f55', { y: 1.7, seg: 6 }));
  g.add(box(0.35, 0.45, 0.35, '#f7f0d8', { y: 3.45 }));
  g.add(box(0.45, 0.08, 0.45, '#4a4f55', { y: 3.72 }));
  T.add(g);
  T.world.addCircle({ x, z, r: 0.14, top: 3.7, climb: 'pole', tag: 'lamppost', perch: { x, y: 3.8, z } });
}

export function powerPole(T, x, z) {
  const g = group({ x, z });
  g.add(cyl(0.13, 0.18, 7, '#9c9990', { y: 3.5, seg: 7 }));
  g.add(box(1.8, 0.12, 0.12, '#6d6a63', { y: 6.3 }));
  g.add(box(1.3, 0.1, 0.1, '#6d6a63', { y: 5.7 }));
  g.add(cyl(0.22, 0.22, 0.6, '#8f9296', { x: 0.35, y: 5.1, seg: 8 }));
  T.add(g);
  T.world.addCircle({ x, z, r: 0.2, top: 6.6, climb: 'pole', tag: 'pole', perch: { x, y: 6.45, z } });
}

export function wires(T, pts, y) {
  const mat = new THREE.LineBasicMaterial({ color: '#3b3b3b' });
  for (let k = 0; k < 3; k++) {
    const arr = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[i + 1];
      for (let s = 0; s <= 8; s++) {
        const t = s / 8;
        const sag = Math.sin(t * Math.PI) * 0.5;
        arr.push(new THREE.Vector3(x0 + (x1 - x0) * t + (k - 1) * 0.5, y - sag - k * 0.05, z0 + (z1 - z0) * t));
      }
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arr), mat);
    T.addDyn(line);
  }
}

export function rock(T, x, z, s = 1, y = 0, color) {
  const m = sphere(s, color || C.stone, { x, y: y + s * 0.35, z, sy: 0.6, lo: true, ry: T.rng.range(0, 3) });
  m.rotation.set(T.rng.range(-0.3, 0.3), T.rng.range(0, 3), T.rng.range(-0.3, 0.3));
  T.add(m);
  return m;
}

export function patch(T, minX, maxX, minZ, maxZ, color, y = 0.01) {
  const m = box(maxX - minX, 0.02, maxZ - minZ, color, { x: (minX + maxX) / 2, y, z: (minZ + maxZ) / 2 });
  m.castShadow = false;
  T.add(m);
  return m;
}

export function disc(T, x, z, r, color, y = 0.01, sx = 1, sz = 1) {
  const m = cyl(r, r, 0.02, color, { x, y, z, seg: 20 });
  m.scale.x *= sx;
  m.scale.z *= sz;
  m.castShadow = false;
  T.add(m);
  return m;
}

export function waterMesh(T, shape, color, opacity = 0.82) {
  let geo;
  if (shape.kind === 'box') {
    geo = new THREE.BoxGeometry(shape.maxX - shape.minX, 0.04, shape.maxZ - shape.minZ);
  } else {
    geo = new THREE.CylinderGeometry(1, 1, 0.04, 28);
  }
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, transparent: true, opacity }));
  if (shape.kind === 'box') m.position.set((shape.minX + shape.maxX) / 2, 0.05, (shape.minZ + shape.maxZ) / 2);
  else {
    m.position.set(shape.x, 0.05, shape.z);
    m.scale.set(shape.rx || shape.r, 1, shape.rz || shape.r);
  }
  m.receiveShadow = true;
  m.userData.noBatch = true;
  T.addDyn(m);
  // dark bed underneath
  const bedGeo = geo.clone();
  const bed = new THREE.Mesh(bedGeo, mat('#4f6f6a'));
  bed.position.copy(m.position);
  bed.position.y = 0.012;
  bed.scale.copy(m.scale);
  bed.receiveShadow = true;
  T.add(bed);
  return m;
}

export function vendingMesh(theme = 'red') {
  const g = group();
  const body = theme === 'red' ? '#d23b2f' : '#2f6fb3';
  g.add(box(0.95, 1.9, 0.8, body, { y: 0.95 }));
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.75), new THREE.MeshLambertMaterial({ map: TX.vendingTex(theme), emissive: '#222222' }));
  front.position.set(0, 0.95, 0.405);
  g.add(front);
  g.add(box(1.0, 0.08, 0.85, '#e7e7e7', { y: 1.92 }));
  return g;
}

export function stoneTiles(T, x0, x1, z0, z1, color = C.stone) {
  // Staggered stepping-stone path from (x0,z0) to (x1,z1)
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.floor(len / 1.1));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const m = cyl(0.42, 0.45, 0.06, color, { x: x0 + (x1 - x0) * t + T.rng.range(-0.15, 0.15), y: 0.03, z: z0 + (z1 - z0) * t, seg: 7 });
    m.castShadow = false;
    T.add(m);
  }
}

export function drainGrate(T, x, z) {
  const g = group({ x, z });
  g.add(box(0.9, 0.03, 0.9, '#55595e', { y: 0.02 }));
  for (let i = 0; i < 5; i++) g.add(box(0.8, 0.035, 0.07, '#2a2c2f', { y: 0.03, z: -0.32 + i * 0.16 }));
  T.add(g);
}

export function uniqueGroupMaterials(g) {
  g.traverse((o) => {
    if (o.isMesh) o.material = uniqueMat(o.material.color.getHex(), { map: o.material.map || null, side: o.material.side });
  });
}
