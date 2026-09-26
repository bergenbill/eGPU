import * as THREE from 'three';
import { box, cyl, sphere, cone, prism, group, bakeStatic } from '../render/geom.js';
import { mat, uniqueMat } from '../render/materials.js';
import { COMMON as C } from './palette.js';
import * as P from './props.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

let canopyMat = null;
let canopyFade = null;
export function CANOPY_MAT() {
  if (!canopyMat) canopyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return canopyMat;
}
export function CANOPY_FADE() {
  if (!canopyFade) canopyFade = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.28, depthWrite: false });
  return canopyFade;
}

// Momiji-chō town layout. North is -Z (up the screen), the main road runs east-west along z=0.
//
//   farm (NW)      shrine (N)        onsen (NE)
//        \          torii            grandma's house (E)
//   ======= shotengai shopping street ======
//   ====================== main road (bus) =====================
//   rice paddies (SW)   bus stop + park (S)    veggie stand (SE)
//   bamboo hideout (far SW)

export const BOUNDS = { minX: -60, maxX: 60, minZ: -62, maxZ: 44 };

export class TownBuilder {
  constructor(g, pal, rng) {
    this.g = g;
    this.world = g.world;
    this.pal = pal;
    this.rng = rng;
    this.root = new THREE.Group();
    this.staticRoot = new THREE.Group();
    this.dyn = new THREE.Group();
    this.root.add(this.dyn);
    this.occluders = [];
    this.trees = [];
    this.poi = {};
    this.items = [];
    this.fixtures = [];
    this.animated = [];
  }
  add(o) {
    this.staticRoot.add(o);
    return o;
  }
  addDyn(o) {
    this.dyn.add(o);
    return o;
  }
  addOccluder(g) {
    // Occluders keep their own materials so they can fade when they hide the player.
    P.uniqueGroupMaterials(g);
    g.traverse((o) => {
      if (o.isMesh) o.userData.noBatch = true;
    });
    this.dyn.add(g);
    this.occluders.push(g);
    return g;
  }
  item(type, x, y, z, owner = null, extra = {}) {
    this.items.push({ type, x, y, z, owner, ...extra });
  }
  fixture(type, params) {
    this.fixtures.push({ type, ...params });
  }
  // Tree canopies are merged into one vertex-coloured mesh per tree so they can fade
  // out when they hide the player.
  addCanopy(grp) {
    grp.updateMatrixWorld(true);
    const geos = [];
    const inv = new THREE.Matrix4().copy(grp.matrixWorld).invert();
    const col = new THREE.Color();
    grp.traverse((o) => {
      if (!o.isMesh) return;
      let g2 = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const n of Object.keys(g2.attributes)) if (n !== 'position' && n !== 'normal') g2.deleteAttribute(n);
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      g2.applyMatrix4(m);
      col.copy(o.material.color);
      const cols = new Float32Array(g2.attributes.position.count * 3);
      for (let i = 0; i < cols.length; i += 3) {
        cols[i] = col.r;
        cols[i + 1] = col.g;
        cols[i + 2] = col.b;
      }
      g2.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geos.push(g2);
    });
    const merged = mergeGeometries(geos, false);
    for (const g2 of geos) g2.dispose();
    const mesh = new THREE.Mesh(merged, CANOPY_MAT());
    mesh.position.copy(grp.position);
    mesh.rotation.copy(grp.rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.noBatch = true;
    this.dyn.add(mesh);
    return mesh;
  }
  finish() {
    bakeStatic(this.staticRoot, this.root);
  }
}

export function buildTown(g, pal, rng) {
  const T = new TownBuilder(g, pal, rng);
  const W = T.world;
  const poi = T.poi;

  // ---------------------------------------------------------------- ground
  {
    const geo = new THREE.PlaneGeometry(220, 200, 88, 80);
    geo.rotateX(-Math.PI / 2);
    const colors = [];
    const c1 = new THREE.Color(pal.grass);
    const c2 = new THREE.Color(pal.grassDark);
    const pos = geo.attributes.position;
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const n = Math.sin(x * 0.11 + Math.cos(z * 0.07) * 2) * 0.5 + Math.sin(z * 0.13 + x * 0.05) * 0.5;
      tmp.copy(c1).lerp(c2, n * 0.5 + 0.5);
      colors.push(tmp.r, tmp.g, tmp.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.receiveShadow = true;
    m.position.set(0, 0, -9);
    T.root.add(m);
    T.ground = m;
  }

  // ---------------------------------------------------------------- main road
  P.patch(T, -90, 90, -3, 3, C.road, 0.012);
  for (let x = -88; x < 90; x += 4) P.patch(T, x, x + 2, -0.08, 0.08, C.roadLine, 0.026);
  P.patch(T, -90, 90, -2.85, -2.75, C.roadLine, 0.026);
  P.patch(T, -90, 90, 2.75, 2.85, C.roadLine, 0.026);
  // crosswalk at the shotengai
  for (let z = -2.4; z <= 2.4; z += 0.9) P.patch(T, -3, 3, z - 0.22, z + 0.22, C.roadLine, 0.03);
  P.patch(T, -90, 90, -4.6, -3, C.sidewalk, 0.03);
  P.patch(T, -90, 90, 3, 4.6, C.sidewalk, 0.03);
  P.patch(T, -90, 90, -3.08, -3.0, '#a29d92', 0.05);
  P.patch(T, -90, 90, 3.0, 3.08, '#a29d92', 0.05);
  poi.busStop = [15, 3.6];
  poi.roadWest = [-70, 1.5];
  poi.roadEast = [70, 1.5];

  // utility poles + wires along the north side
  const polesX = [-52, -36, -20, 20, 36, 52];
  for (const x of polesX) P.powerPole(T, x, -4.9);
  P.wires(T, polesX.slice(0, 3).map((x) => [x, -4.9]), 6.2);
  P.wires(T, polesX.slice(3).map((x) => [x, -4.9]), 6.2);

  // ---------------------------------------------------------------- shotengai
  P.patch(T, -3.6, 3.6, -37, -4.6, '#cfc6b0', 0.02);
  for (let z = -36; z < -5; z += 1.5) P.patch(T, -3.6, 3.6, z, z + 0.05, '#bdb39c', 0.028);
  // Fishmonger (west)
  P.house(T, {
    x: -12.5, z: -26.5, w: 7, d: 9, h: 3.0, roofH: 1.4, axis: 'z', wall: C.wallShop, tag: 'fishshop',
    windows: [{ x: 3.52, y: 2.2, z: -2.5, ry: Math.PI / 2 }],
  });
  awning(T, -7.2, -26.5, 4.4, 8.6, '#2f5d8a');
  P.noren(T, -8.9, 2.3, -26.5, Math.PI / 2, '魚', '#2f5d8a', 3.2);
  P.signBoard(T, -8.95, 3.7, -26.5, Math.PI / 2, '魚屋 さかな', { w: 3 });
  stall(T, -5.4, -26.5, 2.0, 7.0, 0.9, '#d8d8d8', true);
  poi.fishmonger = [-7.6, -26.5];
  poi.fishShout = [-2.6, -26];
  poi.fishBreak = [-8.0, -21.4];
  T.item('fish', -5.4, 0.95, -28.4, 'fishmonger');
  T.item('fish', -5.4, 0.95, -27.0, 'fishmonger');
  T.item('fish', -5.4, 0.95, -25.6, 'fishmonger');
  T.item('octopus', -5.4, 0.95, -24.0, 'fishmonger');
  // crates behind the fish shop
  T.add(box(0.9, 0.7, 0.9, C.woodLight, { x: -8.3, y: 0.35, z: -21.2 + 1.2 }));
  W.addBoxC(-8.3, -20.0, 0.9, 0.9, 0.7, { walk: true, opaque: false, tag: 'crate' });

  // Dango shop (west, south)
  P.house(T, {
    x: -12.5, z: -14.5, w: 7, d: 9, h: 3.0, roofH: 1.4, axis: 'z', wall: '#f1e2c8', tag: 'dangoshop',
  });
  awning(T, -7.2, -14.5, 4.4, 8.6, '#b8423a');
  P.noren(T, -8.9, 2.3, -14.5, Math.PI / 2, '団子', '#b8423a', 3.2);
  P.signBoard(T, -8.95, 3.7, -14.5, Math.PI / 2, '甘味 だんご', { w: 3 });
  stall(T, -5.6, -14.8, 1.6, 5.6, 0.95, '#8b5a3c', false);
  // grill
  T.add(box(0.8, 0.9, 0.6, '#3f3f3f', { x: -7.8, y: 0.45, z: -17.6 }));
  T.add(box(0.7, 0.05, 0.5, '#e25a2f', { x: -7.8, y: 0.92, z: -17.6 }));
  W.addBoxC(-7.8, -17.6, 0.8, 0.6, 0.95, { opaque: false, tag: 'grill' });
  poi.dango = [-7.6, -14.8];
  poi.dangoGrill = [-7.8, -16.8];
  poi.dangoBench = [-3.0, -9.0];
  poi.chatFish = [-3.0, -20.9];
  poi.chatDango = [-3.0, -19.5];
  T.item('dango', -5.5, 1.0, -17.0, 'dango');
  T.item('dango', -5.5, 1.0, -16.5, 'dango');
  T.item('dango', -5.5, 1.0, -16.0, 'dango');
  T.item('goldCat', -5.6, 0.95, -13.3, 'dango');
  T.item('uchiwa', -6.0, 1.0, -15.1, 'dango');
  // red bench + parasol
  P.bench(T, -5.2, -9.0, 0, '#c9412f', 2.2);
  {
    const pg = group({ x: -6.6, z: -8.2 });
    pg.add(cyl(0.04, 0.04, 2.6, C.woodDark, { y: 1.3, seg: 5 }));
    pg.add(cone(1.6, 0.6, '#c9412f', { y: 2.6, seg: 12 }));
    T.add(pg);
  }
  // Ramen shop (east)
  P.house(T, {
    x: 12.5, z: -26.5, w: 7, d: 9, h: 3.0, roofH: 1.4, axis: 'z', wall: '#efe0c4', tag: 'ramen',
  });
  awning(T, 7.9, -26.5, 1.8, 8.6, '#d6452f', true);
  P.noren(T, 8.95, 2.2, -26.5, -Math.PI / 2, 'ラーメン', '#d6452f', 3.0);
  for (let i = 0; i < 3; i++) {
    const zz = -28 + i * 1.5;
    T.add(cyl(0.22, 0.22, 0.6, '#c9412f', { x: 7.4, y: 0.3, z: zz, seg: 8 }));
    W.addCircle({ x: 7.4, z: zz, r: 0.24, top: 0.6, walk: true, tag: 'stool' });
  }
  // Koban (police box)
  P.house(T, {
    x: 11, z: -13, w: 5, d: 6, h: 2.8, roofH: 0.9, axis: 'x', wall: '#e9e6de', tag: 'koban',
    extra: (gg) => {
      gg.add(sphere(0.22, '#ff3b30', { x: -2.55, y: 2.55, z: 0, mat: { emissive: '#aa1100' } }));
      gg.add(box(0.06, 2.0, 1.2, '#6c8aa6', { x: -2.53, y: 1.35, z: 0 }));
    },
  });
  P.signBoard(T, 8.45, 3.2, -13, -Math.PI / 2, 'KOBAN 交番', { w: 2.4, bg: '#f4f4f0', fg: '#1d3a6b' });
  poi.officer = [7.2, -13];
  // bicycle parked
  bicycle(T, 8.3, -9.2);
  // lamp posts & hanging lanterns
  for (const z of [-33, -27, -21, -15, -9]) {
    P.lampPost(T, -3.95, z);
    P.lampPost(T, 3.95, z);
  }
  for (const z of [-30, -24, -18]) {
    // wire across the street
    T.add(box(7.8, 0.03, 0.03, '#333333', { y: 3.3, z }));
    T.item('lantern', -1.5, 2.85, z, null, { state: 'hanging' });
    T.item('lantern', 1.5, 2.85, z, null, { state: 'hanging' });
  }
  // planters (hiding bushes)
  for (const [x, z] of [[3.95, -24], [-3.95, -18], [3.95, -12], [-3.95, -34]]) {
    T.add(box(1.4, 0.5, 1.4, '#a7784f', { x, y: 0.25, z }));
    P.bush(T, x, z, 0.75);
  }
  // Vending machines (fixtures)
  T.fixture('vending', { x: 4.55, z: -20.7, ry: -Math.PI / 2, theme: 'red' });
  T.fixture('vending', { x: 4.55, z: -19.6, ry: -Math.PI / 2, theme: 'blue' });
  T.fixture('trash', { x: -4.7, z: -20.6 });
  T.fixture('trash', { x: 4.7, z: -7.6 });
  T.fixture('drain', { x: 2.7, z: -16.5, name: 'Shopping Street', key: 'shotengai' });
  W.addZone('shotengai', 0, -21, 15, 'Shotengai Shopping Street');

  // ---------------------------------------------------------------- shrine
  P.patch(T, -16, 16, -61, -37, C.gravel, 0.015);
  for (let z = -49.5; z < -37; z += 1.1) P.patch(T, -1.3, 1.3, z, z + 0.95, C.stone, 0.03);
  P.torii(T, 0, -37, 0, 1);
  poi.torii = [0, -35.5];
  // main hall
  W.addBox({ minX: -7, maxX: 7, minZ: -61, maxZ: -51.4, top: 0.5, walk: true, climb: 'wall', opaque: false, nav: false, tag: 'hallplat' });
  T.add(box(14, 0.5, 9.6, C.woodDark, { y: 0.25, z: -56.2 }));
  T.add(box(14.2, 0.06, 9.8, C.wood, { y: 0.51, z: -56.2 }));
  T.add(box(4, 0.25, 0.5, C.wood, { y: 0.125, z: -51.15 }));
  W.addBox({ minX: -2, maxX: 2, minZ: -51.4, maxZ: -50.9, top: 0.25, walk: true, opaque: false, nav: false, tag: 'steps' });
  {
    const hall = group({ x: 0, z: -56.6 });
    const hw = 11;
    const hd = 6.4;
    hall.add(box(hw, 3.5, hd, '#f2e8d6', { y: 0.5 + 1.75 }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) hall.add(box(0.35, 3.5, 0.35, C.torii, { x: (sx * hw) / 2, y: 2.25, z: (sz * hd) / 2 }));
    for (let i = -2; i <= 2; i++) hall.add(box(0.28, 3.5, 0.28, C.torii, { x: i * 2.2, y: 2.25, z: hd / 2 + 0.05 }));
    hall.add(box(hw + 0.2, 0.3, 0.3, C.torii, { y: 3.9, z: hd / 2 + 0.05 }));
    // lattice doors
    for (let i = -2; i < 2; i++) hall.add(box(1.9, 2.6, 0.05, '#e9dcc0', { x: i * 2.2 + 1.1, y: 1.85, z: hd / 2 + 0.02 }));
    const over = 1.6;
    const roofH = 2.6;
    const slope = roofH / (hd / 2);
    hall.add(prism(hw + 2.6, roofH + slope * over, hd + over * 2, pal.roof, { y: 4.0 - slope * over }));
    hall.add(box(hw + 2.8, 0.35, 0.4, pal.snow ? '#dfe6ea' : '#39424d', { y: 4.0 + roofH }));
    // offertory hanging banner
    hall.add(box(3.5, 0.5, 0.05, '#ffffff', { y: 3.5, z: hd / 2 + 0.25 }));
    T.addOccluder(hall);
    W.addBox({
      minX: -hw / 2, maxX: hw / 2, minZ: -56.6 - hd / 2, maxZ: -56.6 + hd / 2, top: 4.0 + roofH, walk: true, climb: 'wall', opaque: true,
      roof: { axis: 'x', c: -56.6, half: hd / 2, eave: 4.0, ridge: 4.0 + roofH }, tag: 'hall',
    });
  }
  poi.offering = [1.35, -52.3];
  poi.bell = [0, -51.3];
  T.fixture('offering', { x: 0, z: -52.95, y: 0.5 });
  T.fixture('bell', { x: 0, z: -52.0, y: 0.5 });
  // chozuya (purification fountain)
  {
    const cg = group({ x: -6.5, z: -40.5 });
    cg.add(box(1.8, 0.8, 0.9, C.stone, { y: 0.4 }));
    cg.add(box(1.6, 0.05, 0.7, '#6fb5c8', { y: 0.79 }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cg.add(box(0.14, 2.4, 0.14, C.wood, { x: sx * 1.1, y: 1.2, z: sz * 0.7 }));
    cg.add(prism(2.8, 0.7, 2.0, pal.roof, { y: 2.4 }));
    for (let i = 0; i < 3; i++) cg.add(cyl(0.05, 0.05, 0.5, '#d9c18a', { x: -0.4 + i * 0.4, y: 0.95, z: 0.1, rz: Math.PI / 2, seg: 5 }));
    T.add(cg);
    W.addBoxC(-6.5, -40.5, 1.8, 0.9, 0.8, { opaque: false, tag: 'chozuya' });
    poi.chozuya = [-6.5, -39.4];
  }
  P.stoneLantern(T, -3.3, -41.5);
  P.stoneLantern(T, 3.3, -41.5);
  P.stoneLantern(T, -3.3, -47.2);
  P.stoneLantern(T, 3.3, -47.2);
  P.komainu(T, -3.5, -38.8, 0);
  P.komainu(T, 3.5, -38.8, 0);
  // omikuji rack & ema rack
  T.fixture('omikuji', { x: -9, z: -45 });
  {
    const eg = group({ x: 9, z: -45 });
    eg.add(box(0.12, 1.6, 0.12, C.wood, { x: -1.1, y: 0.8 }));
    eg.add(box(0.12, 1.6, 0.12, C.wood, { x: 1.1, y: 0.8 }));
    eg.add(box(2.4, 0.1, 0.12, C.wood, { y: 1.55 }));
    eg.add(prism(2.8, 0.35, 0.6, pal.roof, { y: 1.62 }));
    for (let i = 0; i < 7; i++) eg.add(box(0.26, 0.18, 0.03, '#d9b98a', { x: -0.9 + i * 0.3, y: 1.3, z: 0.02 }));
    T.add(eg);
    W.addBoxC(9, -45, 2.4, 0.25, 1.6, { opaque: false, tag: 'emarack' });
    T.item('ema', 8.4, 1.05, -44.8, 'priest', { state: 'hanging' });
    T.item('ema', 9.6, 1.05, -44.8, 'priest', { state: 'hanging' });
  }
  T.fixture('leafpile', { x: -9.5, z: -53, key: 'A' });
  T.fixture('leafpile', { x: 9, z: -40.5, key: 'B' });
  poi.leafA = [-9.5, -52];
  poi.leafB = [8.2, -41.3];
  T.fixture('taiko', { x: 11, z: -53 });
  poi.taiko = [11, -51.8];
  P.tree(T, -12.5, -48, 'cedar', 1.2, { tag: 'sacredtree' });
  P.tree(T, 12.8, -46, 'ginkgo', 1.1);
  P.tree(T, -13.5, -58, 'maple', 1.0);
  P.tree(T, 13.5, -58.5, 'maple', 1.0);
  P.tree(T, -13, -39.5, 'sakura', 0.9);
  P.bench(T, -10.5, -41.5, 0, C.woodLight, 2.6);
  poi.priestBench = [-10.5, -40.6];
  poi.priest = [0, -48.5];
  poi.omikuji = [-9, -44.1];
  // hedges around the shrine (gaps at the torii, west path and east path)
  P.hedge(T, -16, -61, -15.2, -48);
  P.hedge(T, -16, -44.5, -15.2, -37.2);
  P.hedge(T, 15.2, -61, 16, -48);
  P.hedge(T, 15.2, -44.5, 16, -37.2);
  P.hedge(T, -15.2, -37.6, -4.6, -36.8);
  P.hedge(T, 4.6, -37.6, 15.2, -36.8);
  P.bush(T, -14.2, -52, 1.0);
  P.bush(T, 14.3, -51, 1.0);
  P.bush(T, 6.5, -38.9, 0.8);
  T.fixture('birds', { x: 2, z: -44, n: 7 });
  W.addZone('shrine', 0, -49, 15, 'Momiji Shrine');

  // ---------------------------------------------------------------- farm (NW)
  P.patch(T, -58, -22, -46, -7, pal.field, 0.008);
  P.patch(T, -44, -30, -31, -17, C.soil, 0.018);
  for (let z = -30; z <= -18; z += 2) P.patch(T, -43.6, -30.4, z - 0.35, z + 0.35, C.soilDark, 0.026);
  P.house(T, {
    x: -51, z: -39, w: 9, d: 7, h: 2.6, roofH: 2.0, axis: 'x', wall: '#e7dcc5', tag: 'farmhouse',
    windows: [{ x: -2, y: 1.5, z: 3.52 }, { x: 2, y: 1.5, z: 3.52 }],
  });
  // engawa
  T.add(box(9, 0.45, 1.2, C.wood, { x: -51, y: 0.22, z: -34.9 }));
  W.addBoxC(-51, -34.9, 9, 1.2, 0.45, { walk: true, opaque: false, nav: false, tag: 'engawa' });
  for (let i = 0; i < 6; i++) {
    const x = -41 + (i % 3) * 4;
    const z = i < 3 ? -28 : -24;
    T.item('daikon', x, 0, z, 'farmer', { state: 'planted' });
  }
  for (let i = 0; i < 3; i++) T.item('cabbage', -41 + i * 4, 0, -20, 'farmer');
  T.item('wateringCan', -45, 0, -31.5, 'farmer');
  poi.canHome = [-45, -30.6];
  poi.waterRow0 = [-42.5, -29.6];
  poi.waterRow1 = [-31.8, -29.6];
  poi.waterRow2 = [-31.8, -22.2];
  poi.waterRow3 = [-42.5, -22.2];
  T.fixture('scarecrow', { x: -29.5, z: -24 });
  T.item('strawHat', -29.5, 1.8, -24, 'farmer', { state: 'hanging' });
  poi.scarecrow = [-29.5, -22.6];
  P.tree(T, -49, -27, 'persimmon', 1.1);
  T.fixture('fruittree', { x: -49, z: -27 });
  // well
  T.fixture('well', { x: -49, z: -18 });
  poi.well = [-49, -16.7];
  T.item('bucket', -47.6, 0, -16.8, 'farmer');
  // farmer bench
  P.bench(T, -52, -12, 0, C.woodLight, 3);
  T.item('teaCup', -51.2, 0.47, -12, 'farmer');
  T.item('onigiri', -52.6, 0.47, -12, 'farmer');
  poi.farmerBench = [-52, -11.1];
  poi.farmer = [-46, -21];
  T.item('wheelbarrow', -27, 0, -12.5, 'farmer');
  // storage shed
  P.house(T, { x: -28, z: -40, w: 5, d: 4, h: 2.2, roofH: 1.0, axis: 'x', wall: '#b98a5e', tag: 'shed' });
  P.tree(T, -56, -22, 'green', 1.0);
  P.tree(T, -24.5, -44, 'maple', 1.0);
  P.tree(T, -40, -44, 'green', 1.1);
  P.tree(T, -57, -10, 'sakura', 0.9);
  P.bush(T, -44.5, -14.5, 1.0);
  P.bush(T, -31, -32.5, 1.0);
  P.bush(T, -54.5, -29.5, 1.0);
  P.bush(T, -24, -18, 1.1);
  // low fence along the field's west edge
  P.fence(T, -44.6, -31.5, -44.6, -21, { h: 0.9 });
  T.fixture('drain', { x: -30, z: -8.2, name: 'Farm', key: 'farm' });
  W.addZone('farm', -40, -26, 18, "Farmer Tanaka's Field");

  // hedge between farm and shotengai backs
  P.hedge(T, -22.4, -46, -21.6, -30);
  P.hedge(T, -22.4, -26, -21.6, -7.5);
  for (const [x, z] of [[-19, -44], [-18, -34], [-19, -12], [-18.5, -24]]) P.tree(T, x, z, 'green', 0.9 + T.rng.range(0, 0.2));

  // ---------------------------------------------------------------- onsen (NE)
  P.patch(T, 30, 54, -49, -35, '#bdb6a8', 0.016);
  P.house(T, {
    x: 50.5, z: -55, w: 13, d: 9, h: 3.0, roofH: 2.2, axis: 'x', wall: '#efe4cf', tag: 'bathhouse',
    windows: [{ x: -3, y: 1.8, z: 4.52 }, { x: 3.5, y: 1.8, z: 4.52 }],
  });
  P.noren(T, 45.5, 2.2, -50.44, 0, '♨ ゆ', '#2f5d8a', 1.8);
  // bamboo fences
  P.fence(T, 30, -49, 30, -35, { h: 2.2, bamboo: true, tag: 'onsenfence' });
  P.fence(T, 30, -35, 35, -35, { h: 2.2, bamboo: true, tag: 'onsenfence' });
  P.fence(T, 37.6, -35, 54, -35, { h: 2.2, bamboo: true, tag: 'onsenfence' });
  P.fence(T, 54, -49, 54, -43, { h: 2.2, bamboo: true, tag: 'onsenfence' });
  P.fence(T, 54, -41.8, 54, -35, { h: 2.2, bamboo: true, tag: 'onsenfence' });
  squeezeGap(T, 54, -42.4, 'z');
  P.fence(T, 30, -49, 44, -49, { h: 2.2, bamboo: true, tag: 'onsenfence' });
  P.fence(T, 47, -49, 54, -49, { h: 2.2, bamboo: true, tag: 'onsenfence' });
  // pool
  const pool = W.addWater({ kind: 'circle', x: 41, z: -42, rx: 6, rz: 4.3, type: 'onsen', walkable: true, name: 'hot spring' });
  P.waterMesh(T, pool, C.onsen, 0.9);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    P.rock(T, 41 + Math.cos(a) * 6.3, -42 + Math.sin(a) * 4.6, T.rng.range(0.45, 0.7), 0, i % 3 ? '#8d8a82' : '#a09c92');
  }
  // bamboo water spout
  T.add(cyl(0.09, 0.09, 1.8, C.bamboo, { x: 47, y: 1.1, z: -45.5, rz: 1.1, seg: 6 }));
  T.fixture('steam', { x: 41, z: -42, rx: 5, rz: 3.5 });
  poi.bath = [42.5, -43];
  poi.onsenBench = [32.5, -37.8];
  poi.onsenStretch = [35.5, -46.5];
  P.bench(T, 32.5, -36.5, 0, C.woodLight, 3);
  T.item('towel', 31.7, 0.47, -36.5, 'grandpa');
  T.item('coffeeMilk', 33.4, 0.47, -36.5, 'grandpa');
  T.item('sakeBottle', 38.4, 0.05, -41.2, 'grandpa', { state: 'float' });
  T.item('sakeCup', 39.1, 0.05, -40.6, 'grandpa', { state: 'float' });
  T.item('duck', 40.6, 0.05, -39.4, 'grandpa', { state: 'float' });
  T.item('bucket', 52, 0, -37.2, 'grandpa', { variant: 'yellow' });
  // stools
  for (let i = 0; i < 3; i++) T.add(cyl(0.2, 0.22, 0.3, '#e4c23a', { x: 50.5 + i * 0.7, y: 0.15, z: -38.2, seg: 8 }));
  P.tree(T, 27.4, -39, 'maple', 1.0);
  P.tree(T, 57, -38, 'green', 1.0);
  P.tree(T, 22, -52, 'pine', 1.2);
  P.tree(T, 27, -58, 'green', 1.1);
  P.tree(T, 36, -58, 'maple', 1.0);
  P.bush(T, 27.8, -45.5, 1.1);
  P.bush(T, 56, -32.5, 1.0);
  T.fixture('drain', { x: 33.2, z: -33.0, name: 'Hot Spring', key: 'onsen' });
  W.addZone('onsen', 42, -45, 13, 'Hot Spring (Onsen)');

  // forest strip between shrine and onsen
  for (const [x, z] of [[19, -58], [19.5, -48], [21, -40], [18.5, -42], [25, -46], [24.5, -34]]) P.tree(T, x, z, T.rng.pick(['green', 'maple', 'pine']), 0.9 + T.rng.range(0, 0.3));

  // ---------------------------------------------------------------- grandma's house (E)
  P.patch(T, 22.5, 58, -30, -7.6, pal.snow ? '#e6ecef' : '#9cb872', 0.009);
  P.house(T, {
    x: 43, z: -23.5, w: 18, d: 9, h: 2.9, roofH: 2.2, axis: 'x', wall: '#efe6d2', tag: 'grandmahouse',
    windows: [{ x: -6, y: 1.9, z: -4.52, ry: Math.PI }, { x: 5, y: 1.9, z: -4.52, ry: Math.PI }],
  });
  // engawa veranda along the south side
  T.add(box(18, 0.5, 1.4, C.wood, { x: 43, y: 0.25, z: -18.3 }));
  for (let i = 0; i < 10; i++) T.add(box(0.1, 0.5, 0.1, C.woodDark, { x: 34.3 + i * 1.95, y: 0.25, z: -17.62 }));
  W.addBox({ minX: 34, maxX: 52, minZ: -19, maxZ: -17.6, top: 0.5, walk: true, opaque: false, nav: false, tag: 'engawa' });
  for (let i = 0; i < 4; i++) T.fixture('shoji', { x: 36.5 + i * 4, z: -18.97, i });
  T.fixture('windchime', { x: 46.5, z: -18.4, y: 2.45 });
  poi.grandma = [41.5, -17.35];
  poi.laundry = [29.5, -22.9];
  poi.futon = [28, -11.8];
  poi.bonsai = [51.5, -13.3];
  poi.koi = [45.5, -8.2];
  poi.grandmaSweep = [47, -16.6];
  // laundry line
  for (const x of [26.2, 32.8]) {
    T.add(cyl(0.06, 0.07, 1.95, C.wood, { x, y: 0.97, z: -24, seg: 6 }));
    W.addCircle({ x, z: -24, r: 0.1, top: 1.95, climb: 'pole', tag: 'laundrypole', perch: { x, y: 2.0, z: -24 } });
  }
  T.add(box(6.6, 0.025, 0.025, '#eeeeee', { x: 29.5, y: 1.8, z: -24 }));
  T.item('shirt', 27.8, 1.38, -24, 'grandma', { state: 'hanging', variant: 0 });
  T.item('shirt', 29.6, 1.38, -24, 'grandma', { state: 'hanging', variant: 1 });
  T.item('sock', 31.4, 1.5, -24, 'grandma', { state: 'hanging' });
  // futon rack
  for (const x of [26.4, 29.6]) T.add(cyl(0.05, 0.05, 1.3, C.bamboo, { x, y: 0.65, z: -13, seg: 5 }));
  T.add(cyl(0.05, 0.05, 3.4, C.bamboo, { x: 28, y: 1.28, z: -13, rz: Math.PI / 2, seg: 5 }));
  T.item('futon', 28, 1.0, -13, 'grandma', { state: 'hanging' });
  // koi pond
  const pond = W.addWater({ kind: 'circle', x: 45.5, z: -11.5, rx: 3.6, rz: 2.6, type: 'pond', name: 'koi pond' });
  P.waterMesh(T, pond, '#5fa6b8', 0.85);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    P.rock(T, 45.5 + Math.cos(a) * 3.9, -11.5 + Math.sin(a) * 2.9, T.rng.range(0.3, 0.45));
  }
  T.fixture('koi', { x: 45.5, z: -11.5, rx: 3.0, rz: 2.0, n: 5 });
  // stone lantern in garden
  P.stoneLantern(T, 50.5, -9.5, 0.8);
  P.stoneTiles(T, 31.5, 40, -8.5, -16.8);
  T.item('tanuki', 38, 0, -13.5, 'grandma');
  // bonsai stand
  T.add(box(1.0, 0.8, 0.7, C.woodDark, { x: 51.5, y: 0.4, z: -14.5 }));
  W.addBoxC(51.5, -14.5, 1.0, 0.7, 0.8, { walk: true, opaque: false, tag: 'stand' });
  T.item('bonsai', 51.5, 0.8, -14.5, 'grandma');
  T.item('teapot', 41.3, 0.52, -18.35, 'grandma');
  T.item('senbei', 42.4, 0.52, -18.45, 'grandma');
  T.item('senbei', 42.9, 0.52, -18.2, 'grandma');
  T.item('geta', 39.6, 0.02, -17.0, 'grandma');
  T.item('geta', 40.1, 0.02, -17.1, 'grandma');
  // fences & hedges
  P.fence(T, 22.4, -30, 22.4, -17, { h: 1.3 });
  P.fence(T, 22.4, -13.5, 22.4, -7.6, { h: 1.3 });
  P.hedge(T, 22.4, -8.0, 30, -7.2);
  P.hedge(T, 33.2, -8.0, 58, -7.2);
  P.tree(T, 55.5, -26, 'maple', 1.1);
  P.tree(T, 24.8, -28.2, 'pine', 1.0);
  P.tree(T, 56.5, -16, 'sakura', 0.95);
  P.bush(T, 24.2, -20, 1.0);
  P.bush(T, 33, -10, 0.9);
  P.bush(T, 54.2, -10.5, 1.0);
  T.fixture('drain', { x: 24.2, z: -9.6, name: "Grandma's Garden", key: 'grandma' });
  W.addZone('grandma', 40, -18, 15, "Grandma Hanako's House");

  // space between shotengai east and grandma fence
  for (const [x, z] of [[18, -31], [18.5, -20], [17.5, -10]]) P.tree(T, x, z, T.rng.pick(['sakura', 'maple', 'green']), 0.9);
  P.bush(T, 19.5, -25, 1.0);

  // ---------------------------------------------------------------- bus stop & park (S)
  P.bench(T, 14.5, 5.8, 0, '#6b8fb3', 3);
  {
    const sg = group({ x: 17.2, z: 4.9 });
    sg.add(cyl(0.05, 0.05, 2.3, '#8a8f94', { y: 1.15, seg: 6 }));
    sg.add(cyl(0.35, 0.35, 0.06, '#2f6fb3', { y: 2.3, rx: Math.PI / 2, seg: 16 }));
    sg.add(box(0.5, 0.7, 0.05, '#f4f4f0', { y: 1.6 }));
    T.add(sg);
    W.addCircle({ x: 17.2, z: 4.9, r: 0.1, top: 2.3, climb: 'pole', tag: 'busstopsign', perch: { x: 17.2, y: 2.45, z: 4.9 } });
    // shelter
    const sh = group({ x: 14.5, z: 6.3 });
    for (const sx of [-1, 1]) sh.add(box(0.1, 2.4, 0.1, '#8a8f94', { x: sx * 1.8, y: 1.2 }));
    sh.add(box(4.0, 0.08, 1.4, '#9fb4c6', { y: 2.45, z: -0.4 }));
    T.add(sh);
  }
  T.fixture('vending', { x: 19.2, z: 5.9, ry: Math.PI, theme: 'blue' });
  T.fixture('trash', { x: 11.8, z: 5.7 });
  poi.salaryBench = [14.3, 4.95];
  poi.salaryStop = [15.8, 4.2];
  poi.salaryVend = [19.2, 4.9];
  poi.salaryPhone = [11.2, 4.3];
  T.item('briefcase', 15.6, 0.47, 5.85, 'salary');
  T.item('newspaper', 13.5, 0.47, 5.85, 'salary');
  T.item('umbrella', 16.25, 0.0, 6.2, 'salary');
  W.addZone('busstop', 15, 5, 6, 'Bus Stop');

  // park
  P.patch(T, 4, 33, 7.5, 36, pal.snow ? '#e8eef1' : '#a9c677', 0.009);
  P.patch(T, 4, 33, 13.8, 15.2, C.path, 0.02);
  P.patch(T, 17.2, 18.6, 7.5, 36, C.path, 0.021);
  // public restroom
  P.house(T, {
    x: 28.5, z: 11, w: 4, d: 4, h: 2.6, roofH: 0.7, axis: 'z', wall: '#dfe7ea', tag: 'toilet',
    extra: (gg) => {
      gg.add(box(0.05, 1.9, 1.0, '#5e7d99', { x: -2.02, y: 1.25, z: 0 }));
      gg.add(box(0.05, 0.35, 0.35, '#2f6fb3', { x: -2.03, y: 2.35, z: -0.8 }));
      gg.add(box(0.05, 0.35, 0.35, '#d23b2f', { x: -2.03, y: 2.35, z: 0.8 }));
    },
  });
  P.signBoard(T, 26.2, 3.4, 11, -Math.PI / 2, 'トイレ WC', { w: 1.6, bg: '#ffffff', fg: '#2f6fb3' });
  T.fixture('toilet', { x: 26.1, z: 11 });
  // slide
  {
    const sg = group({ x: 11, z: 21 });
    sg.add(box(1.4, 1.7, 1.4, '#e2533d', { y: 0.85 }));
    sg.add(box(1.6, 0.1, 1.6, '#f4c542', { y: 1.72 }));
    const slide = box(0.9, 0.08, 3.6, '#f4c542', { y: 0.95, z: 2.3 });
    slide.rotation.x = 0.48;
    sg.add(slide);
    for (let i = 0; i < 5; i++) sg.add(box(1.0, 0.06, 0.06, '#3f6fb3', { y: 0.3 + i * 0.32, z: -0.78 }));
    T.add(sg);
    W.addBoxC(11, 21, 1.4, 1.4, 1.75, { walk: true, climb: 'ladder', opaque: false, tag: 'slide', perch: null });
  }
  // sandbox
  T.add(box(3.4, 0.25, 0.2, C.woodLight, { x: 22, y: 0.12, z: 20.4 }));
  T.add(box(3.4, 0.25, 0.2, C.woodLight, { x: 22, y: 0.12, z: 23.6 }));
  T.add(box(0.2, 0.25, 3.4, C.woodLight, { x: 20.4, y: 0.12, z: 22 }));
  T.add(box(0.2, 0.25, 3.4, C.woodLight, { x: 23.6, y: 0.12, z: 22 }));
  P.patch(T, 20.5, 23.5, 20.5, 23.5, '#e8d8a8', 0.06);
  // drinking fountain
  {
    const fg = group({ x: 7.5, z: 11 });
    fg.add(cyl(0.25, 0.3, 0.9, C.stone, { y: 0.45, seg: 8 }));
    fg.add(cyl(0.4, 0.3, 0.12, C.stone, { y: 0.95, seg: 10 }));
    fg.add(cyl(0.32, 0.32, 0.03, '#6fb5c8', { y: 1.0, seg: 10 }));
    T.add(fg);
    W.addCircle({ x: 7.5, z: 11, r: 0.35, top: 1.0, tag: 'fountain' });
    W.addWater({ kind: 'circle', x: 7.5, z: 11, r: 0.45, type: 'fountain', name: 'fountain', tiny: true, walkable: true });
    poi.fountain = [7.5, 12.0];
  }
  T.item('ball', 19, 0, 17, null);
  for (const [x, z] of [[6, 27], [30.5, 25], [16, 31.5], [25, 32]]) P.tree(T, x, z, 'sakura', 1.0);
  P.bush(T, 5.5, 17, 1.0);
  P.bush(T, 31.5, 18.5, 1.0);
  P.bush(T, 11.5, 33.5, 1.0);
  P.bush(T, 23.5, 27, 0.9);
  T.fixture('trash', { x: 16.2, z: 13.2 });
  T.fixture('birds', { x: 12, z: 16.5, n: 6 });
  T.fixture('drain', { x: 9.6, z: 8.6, name: 'Park', key: 'park' });
  W.addZone('park', 18, 21, 14, 'Momiji Park');

  // jizo statues by the road (Kasa-Jizo)
  {
    const jg = group({ x: -8, z: 6.3 });
    for (const sx of [-1, 1]) jg.add(box(0.1, 1.6, 0.1, C.wood, { x: sx * 1.5, y: 0.8, z: -0.2 }));
    jg.add(prism(3.6, 0.5, 1.4, pal.roof, { y: 1.6 }));
    T.add(jg);
    for (let i = 0; i < 3; i++) {
      P.jizo(T, -9 + i, 6.2, 0);
      T.fixture('hatstand', { x: -9 + i, z: 6.2, y: 1.12, i });
    }
    poi.jizo = [-8, 5.2];
  }

  // ---------------------------------------------------------------- rice paddies (SW)
  P.patch(T, -46, -10, 7, 30, C.soil, 0.008);
  const paddies = [
    [-44, -31, 8.5, 17],
    [-29, -12, 8.5, 17],
    [-44, -31, 19, 28.5],
    [-29, -12, 19, 28.5],
  ];
  for (const [x0, x1, z0, z1] of paddies) {
    const w = W.addWater({ kind: 'box', minX: x0, maxX: x1, minZ: z0, maxZ: z1, type: 'paddy', name: 'rice paddy' });
    P.waterMesh(T, w, '#86b3ad', 0.78);
    if (!pal.snow) {
      for (let x = x0 + 0.8; x < x1 - 0.4; x += 1.1) {
        for (let z = z0 + 0.8; z < z1 - 0.4; z += 1.1) {
          const sprout = cone(0.12, 0.45, pal.id === 'autumn' ? '#d8b44a' : '#7fb84f', { x, y: 0.25, z, seg: 3 });
          sprout.castShadow = false;
          T.add(sprout);
        }
      }
    }
  }
  P.tree(T, -8, 20, 'green', 1.0);
  P.tree(T, -8, 31, 'maple', 1.0);
  P.bush(T, -13, 6.6, 0.9);
  P.bush(T, -30, 30, 1.0);
  W.addZone('paddies', -28, 18, 16, 'Rice Paddies');

  // ---------------------------------------------------------------- bamboo grove & hideout (SW)
  P.patch(T, -60, -43, 27, 44, pal.snow ? '#e3eaed' : '#98a868', 0.009);
  P.patch(T, -49, -47, 4.6, 30, C.path, 0.02);
  poi.hideout = [-50.5, 34.5];
  T.fixture('stash', { x: -50.5, z: 34.5, r: 2.4 });
  T.fixture('drain', { x: -46.2, z: 30.2, name: 'Hideout', key: 'hideout' });
  for (let i = 0; i < 70; i++) {
    const x = T.rng.range(-59.5, -42);
    const z = T.rng.range(26, 43.5);
    if (Math.hypot(x + 50.5, z - 34.5) < 4.2) continue;
    if (x > -49.8 && x < -46 && z < 34) continue;
    if (Math.hypot(x + 46.2, z - 30.2) < 1.2) continue;
    const h = T.rng.range(5, 8);
    const bg = group({ x, z });
    bg.add(cyl(0.09, 0.1, h, T.rng.chance(0.5) ? C.bamboo : C.bambooDark, { y: h / 2, seg: 5 }));
    for (let k = 1; k < 5; k++) bg.add(cyl(0.11, 0.11, 0.06, '#b8cf7f', { y: (h / 5) * k, seg: 5 }));
    bg.add(sphere(0.45, pal.snow ? '#dfe7ea' : '#9cc36a', { y: h, sy: 0.6, lo: true }));
    T.add(bg);
    W.addCircle({ x, z, r: 0.12, top: h, opaque: false, nav: true, tag: 'bamboo' });
  }
  P.tree(T, -54.5, 38.5, 'green', 1.4, { tag: 'bigtree' });
  P.bush(T, -44, 36, 1.0);
  P.bush(T, -56, 30, 1.0);
  W.addZone('hideout', -50.5, 34.5, 7, 'Your Secret Hideout');

  // ---------------------------------------------------------------- SE: honour-system veggie stand
  {
    const sg = group({ x: 40, z: 8.5 });
    sg.add(box(2.4, 0.9, 0.9, C.woodLight, { y: 0.45 }));
    for (const sx of [-1, 1]) sg.add(box(0.1, 2.2, 0.1, C.wood, { x: sx * 1.15, y: 1.1, z: 0.4 }));
    sg.add(prism(2.9, 0.5, 1.4, pal.roof, { y: 2.2 }));
    T.add(sg);
    W.addBoxC(40, 8.5, 2.4, 0.9, 0.9, { walk: true, opaque: false, tag: 'vegstand' });
    P.signBoard(T, 40, 1.65, 8.95, 0, '無人販売 100円', { w: 1.6 });
    T.item('cucumber', 39.3, 0.93, 8.4, null);
    T.item('cucumber', 39.8, 0.93, 8.5, null);
    T.item('persimmon', 40.5, 0.93, 8.4, null);
    T.fixture('coinbox', { x: 41, z: 8.5, y: 0.9 });
  }
  P.patch(T, 35, 58, 7.5, 40, pal.snow ? '#e8eef1' : '#aebf72', 0.008);
  for (const [x, z] of [[46, 14], [52, 22], [44, 30], [55, 34], [37, 36], [50, 40], [57, 10]]) P.tree(T, x, z, T.rng.pick(['green', 'maple', 'sakura', 'persimmon']), 0.9 + T.rng.range(0, 0.3));
  P.bush(T, 44, 18, 1.0);
  P.bush(T, 36, 26, 1.0);
  // little pond
  const sp = W.addWater({ kind: 'circle', x: 48, z: 27, rx: 3.2, rz: 2.4, type: 'pond', name: 'pond' });
  P.waterMesh(T, sp, '#5fa6b8', 0.85);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    P.rock(T, 48 + Math.cos(a) * 3.5, 27 + Math.sin(a) * 2.7, T.rng.range(0.3, 0.45));
  }
  W.addZone('stand', 42, 14, 9, 'Veggie Stand');

  // ---------------------------------------------------------------- pebbles for throwing
  for (const [x, z] of [[-2, -10], [2.2, -31], [-12, -44], [30, -30], [-40, -12], [10, 15], [-20, 3.8], [36, -9], [20, -12], [-46, 25]]) {
    T.item('pebble', x, 0, z, null);
  }

  // ---------------------------------------------------------------- border forest
  const border = [];
  for (let x = -62; x <= 62; x += 5.5) {
    border.push([x + T.rng.range(-1, 1), -63.5 + T.rng.range(-1, 1)]);
    if (Math.abs(x) > 8) border.push([x + T.rng.range(-1, 1), 46 + T.rng.range(-1, 1)]);
  }
  for (let z = -58; z <= 42; z += 5.5) {
    if (Math.abs(z) < 6) continue;
    border.push([-62.5 + T.rng.range(-1, 1), z]);
    border.push([62.5 + T.rng.range(-1, 1), z]);
  }
  for (const [x, z] of border) {
    const kind = T.rng.pick(['green', 'green', 'pine', 'maple', 'cedar']);
    const t = T.rng.range(1.1, 1.5);
    const g2 = group({ x, z });
    g2.add(cyl(0.3 * t, 0.4 * t, 2.5 * t, C.trunk, { y: 1.25 * t, seg: 5 }));
    if (kind === 'cedar' || kind === 'pine') {
      for (let i = 0; i < 3; i++) g2.add(cone((2 - i * 0.5) * t, 2 * t, pal.snow ? '#6a8a6c' : '#4d6e48', { y: 2.2 * t + i * 1.2 * t, seg: 6 }));
    } else {
      const cols = kind === 'maple' ? pal.maple : pal.green;
      g2.add(sphere(2.2 * t, cols[0], { y: 3.4 * t, lo: true }));
      g2.add(sphere(1.6 * t, cols[1], { x: 1.2 * t, y: 3.0 * t, lo: true }));
    }
    T.add(g2);
  }
  // a few far hills for depth
  for (const [x, z, r, c] of [[-40, -95, 30, pal.green[1]], [20, -100, 38, pal.green[0]], [70, -80, 28, pal.maple[0]], [-80, -60, 26, pal.maple[1]], [85, 10, 30, pal.green[2]], [-85, 30, 30, pal.green[1]]]) {
    const hsph = sphere(r, pal.snow ? '#e4ebef' : c, { x, y: -r * 0.55, z, lo: true });
    hsph.castShadow = false;
    T.add(hsph);
  }

  // extra trees dotted along the road's south side
  for (const [x, z] of [[-4, 9], [2, 10], [-56, 8], [-56, 18], [34, 5.5], [57, 5.5], [-36, 5.3]]) P.tree(T, x, z, T.rng.pick(['sakura', 'maple', 'green']), 0.9);

  T.finish();
  return T;
}

// Cloth awning in front of a shop.
function awning(T, x, z, w, d, color, small) {
  const g = group({ x, z });
  const a = box(w, 0.08, d, color, { y: small ? 2.6 : 2.9 });
  a.rotation.z = small ? 0.25 : 0.18;
  g.add(a);
  if (!small) {
    for (const sz of [-1, 1]) g.add(box(0.1, 2.9, 0.1, C.woodDark, { x: w / 2 - 0.3, y: 1.45, z: (sz * d) / 2 - sz * 0.2 }));
    T.world.addCircle({ x: x + w / 2 - 0.3, z: z - d / 2 + 0.2, r: 0.1, top: 2.9, climb: 'pole', tag: 'awningpost', perch: null });
    T.world.addCircle({ x: x + w / 2 - 0.3, z: z + d / 2 - 0.2, r: 0.1, top: 2.9, climb: 'pole', tag: 'awningpost', perch: null });
  }
  T.add(g);
}

function stall(T, x, z, w, d, h, topColor, ice) {
  const g = group({ x, z });
  g.add(box(w, h - 0.1, d, C.wood, { y: (h - 0.1) / 2 }));
  g.add(box(w + 0.1, 0.1, d + 0.1, topColor, { y: h - 0.05 }));
  if (ice) {
    for (let i = 0; i < 18; i++) g.add(box(0.25, 0.08, 0.25, '#e6f4f8', { x: T.rng.range(-w / 2 + 0.3, w / 2 - 0.3), y: h + 0.02, z: T.rng.range(-d / 2 + 0.3, d / 2 - 0.3) }));
  }
  T.add(g);
  T.world.addBoxC(x, z, w, d, h, { walk: true, opaque: false, tag: 'stall' });
}

function bicycle(T, x, z) {
  const g = group({ x, z, ry: 0.3 });
  for (const s of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.04, 5, 14), mat('#2d2a28'));
    wheel.position.set(0, 0.35, s * 0.55);
    wheel.rotation.y = Math.PI / 2;
    wheel.castShadow = true;
    g.add(wheel);
  }
  g.add(box(0.05, 0.05, 1.0, '#e8e8e8', { y: 0.6 }));
  g.add(box(0.05, 0.5, 0.05, '#e8e8e8', { y: 0.55, z: -0.2 }));
  g.add(box(0.2, 0.06, 0.3, '#2d2a28', { y: 0.85, z: -0.25 }));
  g.add(box(0.5, 0.05, 0.05, '#2d2a28', { y: 0.95, z: 0.45 }));
  g.add(box(0.35, 0.25, 0.3, '#c0c4c8', { y: 0.95, z: 0.62 }));
  T.add(g);
  T.world.addBoxC(x, z, 0.5, 1.2, 0.9, { opaque: false, tag: 'bike' });
}

// A gap under a fence that only the raccoon can squeeze through.
function squeezeGap(T, x, z, axis) {
  const g = group({ x, z });
  g.add(box(axis === 'z' ? 0.26 : 1.2, 1.7, axis === 'z' ? 1.2 : 0.26, C.bambooDark, { y: 1.35 }));
  g.add(box(axis === 'z' ? 0.3 : 1.0, 0.5, axis === 'z' ? 1.0 : 0.3, '#2b241e', { y: 0.25 }));
  T.add(g);
  const c = T.world.addBoxC(x, z, axis === 'z' ? 0.26 : 1.2, axis === 'z' ? 1.2 : 0.26, 2.2, { walk: true, climb: 'wall', opaque: true, tag: 'squeeze' });
  c.squeeze = true;
  return c;
}
