import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mat } from './materials.js';

// Shared low-poly geometries (scaled per mesh) to keep memory down.
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.IcosahedronGeometry(1, 1),
  sphereLo: new THREE.IcosahedronGeometry(1, 0),
  sphereSmooth: new THREE.SphereGeometry(1, 12, 8),
};
const cylCache = new Map();
function cylGeo(rt, rb, seg) {
  const k = `${rt.toFixed(3)}_${rb.toFixed(3)}_${seg}`;
  let g = cylCache.get(k);
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, 1, seg);
    cylCache.set(k, g);
  }
  return g;
}
const coneCache = new Map();
function coneGeo(seg) {
  let g = coneCache.get(seg);
  if (!g) {
    g = new THREE.ConeGeometry(1, 1, seg);
    coneCache.set(seg, g);
  }
  return g;
}

function place(m, o) {
  if (!o) return m;
  if (o.x !== undefined) m.position.x = o.x;
  if (o.y !== undefined) m.position.y = o.y;
  if (o.z !== undefined) m.position.z = o.z;
  if (o.rx) m.rotation.x = o.rx;
  if (o.ry) m.rotation.y = o.ry;
  if (o.rz) m.rotation.z = o.rz;
  if (o.shadow === false) m.castShadow = false;
  return m;
}

function mk(geo, color, o) {
  const material = color && color.isMaterial ? color : mat(color, o && o.mat);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function box(w, h, d, color, o) {
  const m = mk(G.box, color, o);
  m.scale.set(w, h, d);
  return place(m, o);
}

export function cyl(rt, rb, h, color, o = {}) {
  const seg = o.seg || 8;
  // Normalise radii into the scale so geometries are shared.
  const r = Math.max(rt, rb) || 1;
  const m = mk(cylGeo(rt / r, rb / r, seg), color, o);
  m.scale.set(r, h, r);
  return place(m, o);
}

export function sphere(r, color, o = {}) {
  const m = mk(o.lo ? G.sphereLo : o.smooth ? G.sphereSmooth : G.sphere, color, o);
  m.scale.set(r * (o.sx || 1), r * (o.sy || 1), r * (o.sz || 1));
  return place(m, o);
}

export function cone(r, h, color, o = {}) {
  const m = mk(coneGeo(o.seg || 8), color, o);
  m.scale.set(r * (o.sx || 1), h, r * (o.sz || 1));
  return place(m, o);
}

export function group(o) {
  return place(new THREE.Group(), o);
}

// Triangular prism used for gable roofs. Ridge runs along X. Width (x), depth (z), height (y).
const prismCache = new Map();
export function prismGeo() {
  let g = prismCache.get('p');
  if (g) return g;
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0, 1);
  shape.lineTo(-0.5, 0);
  g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.rotateY(Math.PI / 2);
  prismCache.set('p', g);
  return g;
}

export function prism(w, h, d, color, o) {
  const m = mk(prismGeo(), color, o);
  m.scale.set(w, h, d);
  return place(m, o);
}

// Bake every mesh inside `root` into one merged mesh per material. Huge draw-call saver
// for the static town. Meshes flagged userData.noBatch are left alone.
export function bakeStatic(root, target) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const keep = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.noBatch || o.material.transparent || Array.isArray(o.material)) {
      keep.push(o);
      return;
    }
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.applyMatrix4(o.matrixWorld);
    const key = o.material.uuid + (o.castShadow ? 's' : 'n');
    if (!buckets.has(key)) buckets.set(key, { material: o.material, cast: o.castShadow, geos: [] });
    buckets.get(key).geos.push(g);
  });
  const out = [];
  for (const b of buckets.values()) {
    // Split huge buckets to keep frustum culling useful.
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, b.material);
    m.castShadow = b.cast;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    out.push(m);
    target.add(m);
  }
  for (const o of keep) {
    const wm = o.matrixWorld.clone();
    o.parent.remove(o);
    o.matrixAutoUpdate = false;
    o.matrix.copy(wm);
    o.matrixWorld.copy(wm);
    target.add(o);
  }
  return out;
}
