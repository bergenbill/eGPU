import * as THREE from 'three';
import { box, cyl, sphere, cone, group } from '../render/geom.js';
import { mat } from '../render/materials.js';
import * as TX from '../render/textures.js';

// Every grabbable thing in town. Builders return a group whose origin sits at the bottom centre.
// w: light (throw far) | medium (carry, short throw) | heavy (drag only)
// snd: impact sound family. value: mischief points when stolen / stashed.

const planeMat = (tex) => new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });

export const ITEM_DEFS = {
  daikon: {
    name: 'Daikon Radish', r: 0.16, h: 0.35, w: 'light', food: true, snd: 'veg', value: 40,
    build: () => {
      const g = group();
      const root = group({ rz: Math.PI / 2, y: 0.16 });
      root.add(cone(0.14, 0.75, '#f4f1e8', { y: -0.1, rx: Math.PI, seg: 8 }));
      root.add(sphere(0.14, '#f4f1e8', { y: 0.27, sy: 0.6 }));
      for (let i = 0; i < 4; i++) root.add(box(0.07, 0.42, 0.14, '#5f9e45', { y: 0.5, rz: (i - 1.5) * 0.3, ry: i }));
      g.add(root);
      return g;
    },
    // planted: stands upright with only the leaves visible
    buildPlanted: () => {
      const g = group();
      g.add(sphere(0.15, '#f4f1e8', { y: 0.05, sy: 0.6 }));
      for (let i = 0; i < 5; i++) g.add(box(0.08, 0.5, 0.16, '#5f9e45', { y: 0.35, rz: (i - 2) * 0.3, ry: i * 1.2 }));
      return g;
    },
  },
  cabbage: {
    name: 'Cabbage', r: 0.28, h: 0.5, w: 'medium', food: true, snd: 'veg', value: 30, roll: true,
    build: () => {
      const g = group();
      g.add(sphere(0.27, '#a9cf7a', { y: 0.27, smooth: true }));
      g.add(sphere(0.3, '#8fbf62', { y: 0.22, sy: 0.7, lo: true }));
      return g;
    },
  },
  persimmon: {
    name: 'Persimmon', r: 0.13, h: 0.24, w: 'light', food: true, snd: 'veg', value: 25, roll: true,
    build: () => {
      const g = group();
      g.add(sphere(0.13, '#f08a24', { y: 0.12, sy: 0.85, smooth: true }));
      g.add(box(0.14, 0.03, 0.14, '#4f7a2e', { y: 0.23, ry: 0.7 }));
      return g;
    },
  },
  goldPersimmon: {
    name: 'Golden Persimmon', r: 0.14, h: 0.26, w: 'light', snd: 'metal', value: 500, rare: true, roll: true, sparkle: true,
    build: () => {
      const g = group();
      g.add(sphere(0.14, '#f7d046', { y: 0.13, sy: 0.85, smooth: true, mat: { emissive: '#664400' } }));
      g.add(box(0.14, 0.03, 0.14, '#4f7a2e', { y: 0.24, ry: 0.7 }));
      return g;
    },
  },
  strawHat: {
    name: "Farmer's Straw Hat", r: 0.34, h: 0.25, w: 'light', snd: 'soft', value: 80, hat: true, tear: true, cosmetic: 'strawHat',
    build: () => {
      const g = group();
      g.add(cyl(0.42, 0.42, 0.03, '#e3c77a', { y: 0.02, seg: 14 }));
      g.add(cone(0.24, 0.22, '#e8cf85', { y: 0.13, seg: 12 }));
      g.add(cyl(0.2, 0.22, 0.04, '#b5402e', { y: 0.07, seg: 12 }));
      return g;
    },
  },
  wateringCan: {
    name: 'Watering Can', r: 0.24, h: 0.4, w: 'medium', snd: 'metal', value: 60,
    build: () => {
      const g = group();
      g.add(cyl(0.18, 0.2, 0.34, '#6aa0b8', { y: 0.17, seg: 10 }));
      g.add(cyl(0.025, 0.04, 0.45, '#6aa0b8', { y: 0.3, z: 0.28, rx: -0.9, seg: 6 }));
      g.add(cyl(0.06, 0.03, 0.06, '#5b8ea5', { y: 0.46, z: 0.46, rx: -0.9, seg: 8 }));
      g.add(box(0.04, 0.25, 0.04, '#5b8ea5', { y: 0.45, z: -0.08 }));
      g.add(box(0.04, 0.04, 0.26, '#5b8ea5', { y: 0.56, z: 0.03 }));
      return g;
    },
  },
  bucket: {
    name: 'Wooden Bucket', r: 0.24, h: 0.36, w: 'medium', snd: 'wood', value: 50, bucket: true, hat: true,
    build: (v) => {
      const g = group();
      const c = v === 'yellow' ? '#f2c230' : '#b98a5e';
      g.add(cyl(0.24, 0.19, 0.36, c, { y: 0.18, seg: 10 }));
      g.add(cyl(0.2, 0.2, 0.02, v === 'yellow' ? '#d9a91f' : '#6b4a36', { y: 0.35, seg: 10 }));
      if (v !== 'yellow') {
        g.add(cyl(0.245, 0.245, 0.04, '#4a4a4a', { y: 0.28, seg: 10 }));
        g.add(cyl(0.21, 0.21, 0.04, '#4a4a4a', { y: 0.06, seg: 10 }));
      }
      g.add(box(0.5, 0.03, 0.03, '#4a4a4a', { y: 0.45 }));
      return g;
    },
    name2: { yellow: 'Bath Bucket' },
  },
  teaCup: {
    name: 'Tea Cup', r: 0.1, h: 0.12, w: 'light', snd: 'glass', value: 30, fragile: true,
    build: () => {
      const g = group();
      g.add(cyl(0.08, 0.065, 0.12, '#6f8f73', { y: 0.06, seg: 10 }));
      g.add(cyl(0.07, 0.07, 0.01, '#a4b86a', { y: 0.115, seg: 10 }));
      return g;
    },
  },
  onigiri: {
    name: 'Rice Ball', r: 0.13, h: 0.2, w: 'light', food: true, snd: 'soft', value: 30,
    build: () => {
      const g = group();
      g.add(cone(0.15, 0.24, '#fbfaf5', { y: 0.12, seg: 3, rx: 0 }));
      g.add(box(0.14, 0.09, 0.1, '#1f2a22', { y: 0.05, z: 0.04 }));
      return g;
    },
  },
  fish: {
    name: 'Fresh Fish', r: 0.2, h: 0.14, w: 'light', food: true, snd: 'squish', value: 70,
    build: () => {
      const g = group();
      g.add(sphere(0.12, '#9fb4c2', { y: 0.07, sz: 2.4, sy: 0.6, smooth: true }));
      g.add(sphere(0.1, '#e6eef2', { y: 0.05, sz: 2.2, sy: 0.4, smooth: true }));
      const tail = cone(0.1, 0.16, '#8aa0ae', { y: 0.07, z: -0.33, rx: Math.PI / 2, seg: 4, sx: 0.4 });
      g.add(tail);
      g.add(sphere(0.022, '#1c1c1c', { y: 0.09, z: 0.22, x: 0.05 }));
      g.add(sphere(0.022, '#1c1c1c', { y: 0.09, z: 0.22, x: -0.05 }));
      return g;
    },
  },
  octopus: {
    name: 'Octopus', r: 0.2, h: 0.3, w: 'light', food: true, snd: 'squish', value: 90, wobble: true,
    build: () => {
      const g = group();
      g.add(sphere(0.17, '#d9536a', { y: 0.22, sy: 1.1, smooth: true }));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.add(cyl(0.035, 0.05, 0.22, '#c94860', { x: Math.cos(a) * 0.13, y: 0.06, z: Math.sin(a) * 0.13, rz: Math.cos(a) * 0.9, rx: -Math.sin(a) * 0.9, seg: 5 }));
      }
      g.add(sphere(0.03, '#1c1c1c', { y: 0.25, z: 0.15, x: 0.06 }));
      g.add(sphere(0.03, '#1c1c1c', { y: 0.25, z: 0.15, x: -0.06 }));
      return g;
    },
  },
  dango: {
    name: 'Dango Skewer', r: 0.1, h: 0.1, w: 'light', food: true, snd: 'soft', value: 40,
    build: () => {
      const g = group({ rx: Math.PI / 2 });
      g.add(cyl(0.012, 0.012, 0.42, '#d8b98a', { y: 0.02, seg: 4 }));
      const cols = ['#f4a7b9', '#fbf7ee', '#9ccc7a'];
      for (let i = 0; i < 3; i++) g.add(sphere(0.06, cols[i], { y: -0.06 + i * 0.1, smooth: true }));
      const wrap = group({ y: 0.06 });
      wrap.add(g);
      return wrap;
    },
  },
  uchiwa: {
    name: 'Paper Fan', r: 0.16, h: 0.05, w: 'light', snd: 'paper', value: 35, tear: true,
    build: () => {
      const g = group({ y: 0.02 });
      g.add(cyl(0.16, 0.16, 0.015, '#f2f0ea', { seg: 12, rx: 0 }));
      g.add(cyl(0.1, 0.1, 0.017, '#d9453a', { seg: 12 }));
      g.add(box(0.03, 0.02, 0.2, '#c8a36a', { z: -0.22 }));
      return g;
    },
  },
  goldCat: {
    name: 'Golden Lucky Cat', r: 0.3, h: 0.7, w: 'heavy', snd: 'metal', value: 1000, special: true, sparkle: true,
    build: () => {
      const g = group();
      const gold = { emissive: '#553300' };
      g.add(sphere(0.28, '#f3c740', { y: 0.28, sy: 0.95, smooth: true, mat: gold }));
      g.add(sphere(0.22, '#f3c740', { y: 0.62, smooth: true, mat: gold }));
      for (const s of [-1, 1]) g.add(cone(0.07, 0.12, '#f3c740', { x: s * 0.12, y: 0.82, seg: 4, mat: gold }));
      g.add(cyl(0.06, 0.06, 0.28, '#f3c740', { x: 0.2, y: 0.72, rz: -0.3, seg: 6, mat: gold }));
      g.add(sphere(0.07, '#f3c740', { x: 0.24, y: 0.88, mat: gold }));
      g.add(cyl(0.2, 0.2, 0.05, '#c9322d', { y: 0.46, seg: 12 }));
      g.add(sphere(0.05, '#f7e27a', { y: 0.44, z: 0.2 }));
      g.add(box(0.03, 0.012, 0.01, '#3a2a1c', { x: 0.07, y: 0.66, z: 0.2 }));
      g.add(box(0.03, 0.012, 0.01, '#3a2a1c', { x: -0.07, y: 0.66, z: 0.2 }));
      return g;
    },
  },
  coin: {
    name: '¥100 Coin', r: 0.08, h: 0.03, w: 'light', snd: 'coin', value: 30, coin: true, sparkle: true,
    build: () => {
      const g = group();
      g.add(cyl(0.08, 0.08, 0.025, '#d8d8d0', { y: 0.015, seg: 12, mat: { emissive: '#333333' } }));
      return g;
    },
  },
  can: {
    name: 'Juice Can', r: 0.07, h: 0.18, w: 'light', snd: 'can', value: 30, roll: true,
    build: (v) => {
      const g = group();
      const cols = ['#e2533d', '#4f9ad6', '#f4c542', '#6fbf73'];
      const c = cols[(v | 0) % cols.length];
      g.add(cyl(0.065, 0.065, 0.18, c, { y: 0.09, seg: 10 }));
      g.add(cyl(0.06, 0.06, 0.02, '#d0d0d0', { y: 0.18, seg: 10 }));
      g.add(cyl(0.066, 0.066, 0.04, '#ffffff', { y: 0.1, seg: 10 }));
      return g;
    },
  },
  omikuji: {
    name: 'Fortune Slip', r: 0.1, h: 0.03, w: 'light', snd: 'paper', value: 20, tear: true,
    build: () => {
      const g = group();
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), planeMat(TX.paperTex('吉')));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.01;
      m.castShadow = true;
      g.add(m);
      return g;
    },
  },
  ema: {
    name: 'Wish Plaque', r: 0.14, h: 0.2, w: 'light', snd: 'wood', value: 35,
    build: () => {
      const g = group();
      g.add(box(0.26, 0.18, 0.03, '#d9b98a', { y: 0.09 }));
      g.add(box(0.26, 0.04, 0.035, '#c0392b', { y: 0.12 }));
      return g;
    },
  },
  sakeBottle: {
    name: 'Sake Bottle', r: 0.09, h: 0.28, w: 'light', snd: 'glass', value: 45, fragile: true, floats: true,
    build: () => {
      const g = group();
      g.add(sphere(0.09, '#f2eee4', { y: 0.1, sy: 1.1, smooth: true }));
      g.add(cyl(0.03, 0.045, 0.12, '#f2eee4', { y: 0.22, seg: 8 }));
      g.add(cyl(0.092, 0.092, 0.03, '#2f5d8a', { y: 0.12, seg: 10 }));
      return g;
    },
  },
  sakeCup: {
    name: 'Sake Cup', r: 0.07, h: 0.06, w: 'light', snd: 'glass', value: 25, fragile: true, floats: true,
    build: () => {
      const g = group();
      g.add(cyl(0.07, 0.04, 0.06, '#f2eee4', { y: 0.03, seg: 10 }));
      g.add(cyl(0.06, 0.06, 0.005, '#2f5d8a', { y: 0.058, seg: 10 }));
      return g;
    },
  },
  duck: {
    name: 'Rubber Duck', r: 0.12, h: 0.2, w: 'light', snd: 'squeak', value: 60, floats: true,
    build: () => {
      const g = group();
      g.add(sphere(0.12, '#f7d23a', { y: 0.09, sz: 1.3, sy: 0.8, smooth: true }));
      g.add(sphere(0.075, '#f7d23a', { y: 0.2, z: 0.07, smooth: true }));
      g.add(cone(0.035, 0.07, '#f08a24', { y: 0.19, z: 0.16, rx: Math.PI / 2, seg: 5 }));
      g.add(sphere(0.012, '#1c1c1c', { x: 0.04, y: 0.23, z: 0.12 }));
      g.add(sphere(0.012, '#1c1c1c', { x: -0.04, y: 0.23, z: 0.12 }));
      return g;
    },
  },
  towel: {
    name: 'Onsen Towel', r: 0.18, h: 0.08, w: 'light', snd: 'soft', value: 50, tear: true, hat: true, cosmetic: 'towel',
    build: () => {
      const g = group();
      g.add(box(0.36, 0.07, 0.24, '#f7f7f2', { y: 0.035 }));
      g.add(box(0.36, 0.072, 0.04, '#5b8ec2', { y: 0.036, z: 0.07 }));
      return g;
    },
  },
  coffeeMilk: {
    name: 'Coffee Milk', r: 0.07, h: 0.2, w: 'light', snd: 'glass', value: 40, fragile: true, food: true,
    build: () => {
      const g = group();
      g.add(cyl(0.06, 0.065, 0.2, '#c8a27a', { y: 0.1, seg: 10 }));
      g.add(cyl(0.05, 0.05, 0.02, '#f4efe4', { y: 0.2, seg: 10 }));
      return g;
    },
  },
  shirt: {
    name: 'Laundry Shirt', r: 0.24, h: 0.08, w: 'light', snd: 'soft', value: 45, tear: true, laundry: true,
    build: (v) => {
      const c = ['#e8b4b8', '#9cc3e6', '#f0e3a2'][(v | 0) % 3];
      const g = group();
      g.add(box(0.36, 0.4, 0.04, c, { y: 0.2 }));
      g.add(box(0.2, 0.12, 0.04, c, { x: 0.22, y: 0.34, rz: -0.5 }));
      g.add(box(0.2, 0.12, 0.04, c, { x: -0.22, y: 0.34, rz: 0.5 }));
      return g;
    },
  },
  sock: {
    name: 'Sock', r: 0.1, h: 0.06, w: 'light', snd: 'soft', value: 25, tear: true, laundry: true, hat: true,
    build: () => {
      const g = group();
      g.add(box(0.09, 0.22, 0.05, '#f2f2f2', { y: 0.14 }));
      g.add(box(0.09, 0.08, 0.14, '#f2f2f2', { y: 0.04, z: 0.05 }));
      g.add(box(0.095, 0.04, 0.055, '#d9453a', { y: 0.23 }));
      return g;
    },
  },
  futon: {
    name: 'Futon', r: 0.5, h: 0.14, w: 'heavy', snd: 'soft', value: 120, tear: true, laundry: true,
    build: () => {
      const g = group();
      g.add(box(1.0, 0.12, 1.5, '#e98fa3', { y: 0.06 }));
      g.add(box(1.02, 0.125, 0.3, '#f7f0e0', { y: 0.06, z: 0.3 }));
      g.add(box(1.02, 0.125, 0.3, '#f7f0e0', { y: 0.06, z: -0.4 }));
      return g;
    },
    buildHanging: () => {
      const g = group();
      g.add(box(1.5, 0.9, 0.08, '#e98fa3', { y: -0.2, z: 0.1 }));
      g.add(box(1.5, 0.9, 0.08, '#e98fa3', { y: -0.2, z: -0.1 }));
      g.add(box(1.52, 0.2, 0.25, '#e98fa3', { y: 0.25 }));
      g.add(box(0.3, 0.92, 0.2, '#f7f0e0', { x: 0.3, y: -0.2 }));
      return g;
    },
  },
  teapot: {
    name: 'Teapot', r: 0.16, h: 0.24, w: 'medium', snd: 'glass', value: 60, fragile: true,
    build: () => {
      const g = group();
      g.add(sphere(0.14, '#6f5a4a', { y: 0.12, sy: 0.85, smooth: true }));
      g.add(cyl(0.02, 0.035, 0.16, '#6f5a4a', { y: 0.14, z: 0.16, rx: -1.0, seg: 6 }));
      g.add(cyl(0.03, 0.03, 0.16, '#3a2a1c', { y: 0.14, x: -0.18, rz: Math.PI / 2, seg: 6 }));
      g.add(sphere(0.03, '#3a2a1c', { y: 0.25 }));
      return g;
    },
  },
  senbei: {
    name: 'Rice Cracker', r: 0.1, h: 0.03, w: 'light', snd: 'crunch', value: 25, food: true,
    build: () => {
      const g = group();
      g.add(cyl(0.1, 0.1, 0.025, '#c98b45', { y: 0.013, seg: 10 }));
      g.add(box(0.12, 0.028, 0.06, '#1f2a22', { y: 0.014 }));
      return g;
    },
  },
  geta: {
    name: 'Geta Sandal', r: 0.13, h: 0.1, w: 'light', snd: 'wood', value: 30,
    build: () => {
      const g = group();
      g.add(box(0.14, 0.03, 0.3, '#c89a66', { y: 0.08 }));
      g.add(box(0.13, 0.06, 0.04, '#8b5a3c', { y: 0.03, z: 0.08 }));
      g.add(box(0.13, 0.06, 0.04, '#8b5a3c', { y: 0.03, z: -0.08 }));
      g.add(box(0.1, 0.03, 0.02, '#c0392b', { y: 0.11, z: 0.06 }));
      return g;
    },
  },
  tanuki: {
    name: 'Tanuki Statue', r: 0.35, h: 0.9, w: 'heavy', snd: 'stone', value: 150,
    build: () => {
      const g = group();
      const c = '#a07a55';
      g.add(sphere(0.34, c, { y: 0.34, smooth: true }));
      g.add(sphere(0.27, '#e8d6b4', { y: 0.3, z: 0.14, sy: 0.9, smooth: true }));
      g.add(sphere(0.22, c, { y: 0.78, smooth: true }));
      g.add(sphere(0.09, '#e8d6b4', { y: 0.74, z: 0.18 }));
      g.add(sphere(0.035, '#222', { y: 0.76, z: 0.27 }));
      g.add(cyl(0.3, 0.3, 0.02, '#e3c77a', { y: 0.96, seg: 12 }));
      g.add(cone(0.16, 0.14, '#e3c77a', { y: 1.03, seg: 10 }));
      g.add(cyl(0.07, 0.08, 0.22, '#e8e2d6', { x: -0.3, y: 0.3, seg: 7 }));
      return g;
    },
  },
  bonsai: {
    name: 'Bonsai Tree', r: 0.2, h: 0.5, w: 'medium', snd: 'glass', value: 90, fragile: true,
    build: () => {
      const g = group();
      g.add(box(0.36, 0.12, 0.24, '#3f5f7a', { y: 0.06 }));
      g.add(cyl(0.03, 0.05, 0.28, '#6b4a36', { y: 0.24, rz: 0.4, seg: 5 }));
      g.add(sphere(0.14, '#4f7a4e', { x: 0.08, y: 0.38, sy: 0.5, lo: true }));
      g.add(sphere(0.11, '#5d8a55', { x: -0.08, y: 0.3, sy: 0.5, lo: true }));
      return g;
    },
  },
  briefcase: {
    name: 'Briefcase', r: 0.22, h: 0.32, w: 'medium', snd: 'leather', value: 90,
    build: () => {
      const g = group();
      g.add(box(0.42, 0.3, 0.1, '#2e2a28', { y: 0.15 }));
      g.add(box(0.14, 0.05, 0.03, '#2e2a28', { y: 0.33 }));
      g.add(box(0.05, 0.03, 0.105, '#c8a64a', { y: 0.25 }));
      return g;
    },
  },
  newspaper: {
    name: 'Newspaper', r: 0.16, h: 0.03, w: 'light', snd: 'paper', value: 35, tear: true,
    build: () => {
      const g = group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.26), [mat('#e4e2da'), mat('#e4e2da'), planeMat(TX.newspaperTex()), mat('#e4e2da'), mat('#e4e2da'), mat('#e4e2da')]);
      m.position.y = 0.015;
      m.castShadow = true;
      g.add(m);
      return g;
    },
  },
  umbrella: {
    name: 'Umbrella', r: 0.14, h: 0.12, w: 'light', snd: 'plastic', value: 50, tear: true,
    build: () => {
      const g = group({ rz: Math.PI / 2, y: 0.08 });
      g.add(cyl(0.015, 0.015, 0.9, '#6b4a36', { seg: 4 }));
      g.add(cone(0.08, 0.6, '#2f5d8a', { y: 0.05, seg: 8, rx: Math.PI }));
      g.add(cyl(0.02, 0.02, 0.12, '#3a2a1c', { y: -0.48, seg: 4 }));
      const w = group();
      w.add(g);
      return w;
    },
  },
  lantern: {
    name: 'Paper Lantern', r: 0.2, h: 0.5, w: 'light', snd: 'paper', value: 45, tear: true,
    build: () => {
      const g = group();
      g.add(sphere(0.2, '#d6452f', { y: 0.25, sy: 1.3, smooth: true, mat: { emissive: '#3a0a00' } }));
      g.add(cyl(0.12, 0.12, 0.06, '#1c1c1c', { y: 0.52, seg: 10 }));
      g.add(cyl(0.12, 0.12, 0.06, '#1c1c1c', { y: 0.0, seg: 10 }));
      g.add(box(0.2, 0.18, 0.01, '#1c1c1c', { y: 0.26, z: 0.2 }));
      return g;
    },
  },
  pebble: {
    name: 'Pebble', r: 0.08, h: 0.08, w: 'light', snd: 'stone', value: 0, pebble: true,
    build: () => {
      const g = group();
      g.add(sphere(0.08, '#9c9a93', { y: 0.05, sy: 0.7, lo: true }));
      return g;
    },
  },
  ball: {
    name: 'Rubber Ball', r: 0.18, h: 0.36, w: 'light', snd: 'ball', value: 30, bounce: 0.75, roll: true,
    build: () => {
      const g = group();
      g.add(sphere(0.18, '#e2533d', { y: 0.18, smooth: true }));
      g.add(cyl(0.182, 0.182, 0.06, '#ffffff', { y: 0.18, seg: 14 }));
      return g;
    },
  },
  wheelbarrow: {
    name: 'Wheelbarrow', r: 0.55, h: 0.6, w: 'heavy', snd: 'metal', value: 100,
    build: () => {
      const g = group();
      g.add(box(0.7, 0.3, 0.9, '#4f8a5a', { y: 0.5 }));
      g.add(box(0.6, 0.05, 0.8, '#3a6a44', { y: 0.36 }));
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.06, 5, 10), mat('#2d2a28'));
      wheel.rotation.y = Math.PI / 2;
      wheel.position.set(0, 0.2, 0.55);
      wheel.castShadow = true;
      g.add(wheel);
      for (const s of [-1, 1]) {
        g.add(box(0.05, 0.05, 0.9, '#8b5a3c', { x: s * 0.3, y: 0.42, z: -0.6 }));
        g.add(box(0.05, 0.35, 0.05, '#8b5a3c', { x: s * 0.28, y: 0.18, z: -0.3 }));
      }
      return g;
    },
  },
  cucumber: {
    name: 'Cucumber', r: 0.12, h: 0.08, w: 'light', snd: 'veg', value: 30, food: true,
    build: () => {
      const g = group();
      g.add(cyl(0.04, 0.045, 0.34, '#4f8a3a', { y: 0.045, rx: Math.PI / 2, seg: 6 }));
      return g;
    },
  },
  paper: {
    name: 'Crumpled Paper', r: 0.08, h: 0.12, w: 'light', snd: 'paper', value: 10, tear: true, trash: true,
    build: () => {
      const g = group();
      g.add(sphere(0.08, '#f1efe8', { y: 0.07, lo: true }));
      return g;
    },
  },
  fishBone: {
    name: 'Fish Bones', r: 0.14, h: 0.05, w: 'light', snd: 'wood', value: 20, trash: true,
    build: () => {
      const g = group({ y: 0.02 });
      g.add(box(0.03, 0.02, 0.32, '#f1efe8', {}));
      for (let i = 0; i < 5; i++) g.add(box(0.14 - Math.abs(i - 2) * 0.02, 0.015, 0.015, '#f1efe8', { z: -0.1 + i * 0.05 }));
      g.add(cone(0.05, 0.08, '#f1efe8', { z: 0.19, rx: Math.PI / 2, seg: 4 }));
      return g;
    },
  },
  bottle: {
    name: 'Glass Bottle', r: 0.07, h: 0.26, w: 'light', snd: 'glass', value: 20, fragile: true, trash: true, roll: true,
    build: () => {
      const g = group();
      g.add(cyl(0.06, 0.06, 0.18, '#5f9f73', { y: 0.09, seg: 8 }));
      g.add(cyl(0.022, 0.05, 0.1, '#5f9f73', { y: 0.22, seg: 8 }));
      return g;
    },
  },
  marble: {
    name: 'Shiny Marble', r: 0.06, h: 0.12, w: 'light', snd: 'glass', value: 150, rare: true, sparkle: true, roll: true,
    build: () => {
      const g = group();
      g.add(sphere(0.06, '#7fd0f0', { y: 0.06, smooth: true, mat: { emissive: '#113344' } }));
      return g;
    },
  },
  robot: {
    name: 'Tin Toy Robot', r: 0.12, h: 0.34, w: 'light', snd: 'can', value: 250, rare: true,
    build: () => {
      const g = group();
      g.add(box(0.18, 0.18, 0.12, '#c0c6cc', { y: 0.16 }));
      g.add(box(0.13, 0.1, 0.1, '#c0c6cc', { y: 0.31 }));
      g.add(box(0.1, 0.03, 0.01, '#e2533d', { y: 0.31, z: 0.055 }));
      for (const s of [-1, 1]) {
        g.add(box(0.05, 0.08, 0.05, '#8a9096', { x: s * 0.05, y: 0.04 }));
        g.add(box(0.04, 0.13, 0.04, '#8a9096', { x: s * 0.12, y: 0.17 }));
      }
      g.add(cyl(0.008, 0.008, 0.07, '#8a9096', { y: 0.39, seg: 4 }));
      g.add(sphere(0.02, '#e2533d', { y: 0.43 }));
      return g;
    },
  },
};

export const TRASH_LOOT = {
  common: ['paper', 'can', 'fishBone', 'bottle', 'paper'],
  uncommon: ['geta', 'coin', 'sock', 'onigiri'],
  rare: ['marble', 'robot'],
  legendary: ['goldPersimmon'],
};

export function itemName(type, variant) {
  const d = ITEM_DEFS[type];
  if (!d) return type;
  if (d.name2 && variant && d.name2[variant]) return d.name2[variant];
  return d.name;
}
