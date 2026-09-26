import * as THREE from 'three';
import { box, cyl, sphere, cone, group } from '../render/geom.js';
import { lerp } from '../core/math.js';

// Faceless townsfolk in the spirit of the Goose game: readable silhouettes, expressive poses.

export const LOOKS = {
  farmer: { skin: '#d9a67e', shirt: '#6f8fb3', pants: '#4a5a6a', shoes: '#3a3a3a', hair: '#3a3a3a', hat: 'kasa', towelBand: true, scale: 1.02 },
  priest: { skin: '#efc9a6', shirt: '#f6f3ea', pants: '#8fb3d9', shoes: '#f6f3ea', hair: '#222222', hat: 'eboshi', robe: '#8fb3d9', scale: 1.0 },
  fishmonger: { skin: '#e8b48a', shirt: '#f2f2f0', pants: '#3a4a5a', shoes: '#f2c230', boots: true, hair: '#1f1f1f', hat: 'hachimaki', apron: '#2f5d8a', scale: 1.05, wide: 1.12 },
  dango: { skin: '#f0c8a8', shirt: '#8a5aa0', pants: '#4a3a4a', shoes: '#6b4a36', hair: '#2a2a2a', hat: 'kerchief', apron: '#f6f3ea', bun: true, scale: 0.95, robe: '#5a4a6a' },
  grandpa: { skin: '#e9bf9c', shirt: '#6f8fb3', pants: '#6f8fb3', shoes: '#8b5a3c', hair: '#e8e8e8', bald: true, hat: 'towel', mustache: true, robe: '#6f8fb3', scale: 0.96 },
  grandma: { skin: '#efc8a8', shirt: '#7a9a7a', pants: '#5a6a5a', shoes: '#8b5a3c', hair: '#c8c8c8', bun: true, apron: '#f6f3ea', smock: true, robe: '#7a9a7a', hunch: 0.22, scale: 0.9 },
  salary: { skin: '#f0c8a8', shirt: '#2e3440', pants: '#2e3440', shoes: '#1a1a1a', hair: '#1c1c1c', glasses: true, tie: '#c0392b', collar: true, scale: 1.0 },
  officer: { skin: '#e8bf9a', shirt: '#9fb8d8', jacket: '#2c4a7a', pants: '#2c4a7a', shoes: '#1a1a1a', hair: '#1c1c1c', hat: 'police', belt: true, scale: 1.04 },
};

export function buildHuman(lookId) {
  const L = LOOKS[lookId];
  const root = group();
  const inner = group();
  root.add(inner);
  const hipY = 0.88;
  const hips = group({ y: hipY });
  inner.add(hips);
  const wide = L.wide || 1;

  // legs
  const mkLeg = (sx) => {
    const p = group({ x: sx * 0.11 * wide, y: 0 });
    p.add(cyl(0.085 * wide, 0.07, 0.8, L.pants, { y: -0.4, seg: 7 }));
    if (L.boots) p.add(cyl(0.095, 0.09, 0.42, L.shoes, { y: -0.63, seg: 7 }));
    p.add(box(0.14, 0.1, 0.26, L.shoes, { y: -0.83, z: 0.05 }));
    hips.add(p);
    return p;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  // robe / hakama skirt
  if (L.robe) {
    const sk = cyl(0.26 * wide, 0.36 * wide, 0.78, L.robe, { y: -0.36, seg: 10 });
    hips.add(sk);
  }

  const torso = group({ y: 0.02 });
  hips.add(torso);
  const shirtC = L.jacket || L.shirt;
  torso.add(cyl(0.22 * wide, 0.25 * wide, 0.66, shirtC, { y: 0.33, seg: 10 }));
  torso.add(sphere(0.23 * wide, shirtC, { y: 0.64, sy: 0.45, lo: false }));
  if (L.apron) torso.add(box(0.36 * wide, 0.62, 0.05, L.apron, { y: 0.26, z: 0.23 * wide }));
  if (L.smock) torso.add(cyl(0.235, 0.27, 0.6, L.apron, { y: 0.32, seg: 10 }));
  if (L.collar) {
    torso.add(box(0.14, 0.32, 0.03, '#f4f4f0', { y: 0.5, z: 0.215 }));
    torso.add(box(0.06, 0.3, 0.035, L.tie, { y: 0.47, z: 0.22 }));
  }
  if (L.belt) {
    torso.add(cyl(0.255, 0.255, 0.07, '#1a1a1a', { y: 0.05, seg: 10 }));
    torso.add(box(0.12, 0.1, 0.06, '#1a1a1a', { x: 0.2, y: 0.02, z: 0.1 }));
  }

  const mkArm = (sx) => {
    const p = group({ x: sx * 0.29 * wide, y: 0.6 });
    p.add(cyl(0.065, 0.055, 0.55, shirtC, { y: -0.27, seg: 6 }));
    p.add(sphere(0.07, L.skin, { y: -0.58 }));
    const hand = group({ y: -0.62 });
    p.add(hand);
    torso.add(p);
    return { p, hand };
  };
  const aL = mkArm(-1);
  const aR = mkArm(1);

  const head = group({ y: 0.76 });
  torso.add(head);
  head.add(cyl(0.07, 0.08, 0.12, L.skin, { y: 0.02, seg: 6 }));
  head.add(sphere(0.17, L.skin, { y: 0.17, smooth: true }));
  if (!L.bald) {
    head.add(sphere(0.175, L.hair, { y: 0.21, z: -0.02, sy: 0.8, smooth: true }));
  } else {
    head.add(sphere(0.12, L.hair, { y: 0.14, z: -0.06, sx: 1.5, sy: 0.6, lo: true }));
  }
  if (L.bun) head.add(sphere(0.08, L.hair, { y: 0.34, z: -0.08 }));
  if (L.mustache) head.add(box(0.14, 0.035, 0.04, '#e8e8e8', { y: 0.11, z: 0.16 }));
  if (L.glasses) {
    for (const s of [-1, 1]) head.add(box(0.07, 0.05, 0.02, '#1c1c1c', { x: s * 0.06, y: 0.19, z: 0.165 }));
    head.add(box(0.2, 0.015, 0.015, '#1c1c1c', { y: 0.2, z: 0.17 }));
  }
  const hat = group({ y: 0.3 });
  head.add(hat);
  switch (L.hat) {
    case 'kasa':
      hat.add(cone(0.42, 0.22, '#d9bb6a', { y: 0.02, seg: 12 }));
      break;
    case 'eboshi':
      hat.add(cyl(0.1, 0.14, 0.32, '#1c1c1c', { y: 0.08, rx: -0.3, z: -0.05, seg: 8 }));
      break;
    case 'hachimaki':
      hat.add(cyl(0.18, 0.18, 0.06, '#f4f4f0', { y: -0.1, seg: 12 }));
      hat.add(sphere(0.05, '#d6452f', { y: -0.1, z: 0.17 }));
      break;
    case 'kerchief':
      hat.add(cone(0.2, 0.18, '#d6452f', { y: -0.02, rx: -0.4, z: -0.05, seg: 3 }));
      break;
    case 'towel':
      hat.add(box(0.26, 0.05, 0.2, '#f7f7f2', { y: -0.08 }));
      break;
    case 'police':
      hat.add(cyl(0.18, 0.17, 0.13, '#1d3a6b', { y: -0.04, seg: 12 }));
      hat.add(box(0.26, 0.02, 0.14, '#111111', { y: -0.1, z: 0.15 }));
      hat.add(sphere(0.03, '#f0c23a', { y: -0.02, z: 0.18 }));
      break;
    default:
      break;
  }
  if (L.towelBand) hat.add(cyl(0.18, 0.18, 0.05, '#f4f4f0', { y: -0.13, seg: 10 }));

  // props (shown/hidden per activity)
  const props = {};
  const broom = group({ rx: 0.2 });
  broom.add(cyl(0.02, 0.02, 1.4, '#c8a36a', { y: -0.1, seg: 4 }));
  broom.add(cone(0.16, 0.4, '#b88a4a', { y: -0.85, rx: Math.PI, seg: 6, sz: 0.5 }));
  broom.visible = false;
  aR.hand.add(broom);
  props.broom = broom;
  const net = group();
  net.add(cyl(0.015, 0.015, 1.3, '#c8a36a', { y: 0.45, seg: 4 }));
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.015, 4, 12), new THREE.MeshLambertMaterial({ color: '#e0e0e0' }));
  hoop.position.y = 1.2;
  net.add(hoop);
  const bag = cone(0.19, 0.35, '#f4f4f0', { y: 1.02, rx: Math.PI, seg: 8 });
  bag.material = new THREE.MeshLambertMaterial({ color: '#f4f4f0', transparent: true, opacity: 0.7 });
  net.add(bag);
  net.visible = false;
  aR.hand.add(net);
  props.net = net;
  const phone = box(0.05, 0.1, 0.02, '#1c1c1c');
  phone.visible = false;
  aR.hand.add(phone);
  props.phone = phone;
  const tea = cyl(0.045, 0.04, 0.08, '#6f8f73', { seg: 8 });
  tea.visible = false;
  aR.hand.add(tea);
  props.tea = tea;
  const beater = group({ rx: -0.3 });
  beater.add(cyl(0.015, 0.015, 0.5, '#c8a36a', { y: 0.25, seg: 4 }));
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.015, 4, 10), new THREE.MeshLambertMaterial({ color: '#c8a36a' }));
  loop.position.y = 0.6;
  beater.add(loop);
  beater.visible = false;
  aR.hand.add(beater);
  props.beater = beater;
  const bucketHead = group({ y: 0.12 });
  bucketHead.add(cyl(0.21, 0.26, 0.4, '#b98a5e', { y: 0.06, seg: 10 }));
  bucketHead.visible = false;
  head.add(bucketHead);
  props.bucketHead = bucketHead;

  const s = L.scale || 1;
  root.scale.setScalar(s);
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return {
    look: L, root, inner, hips, torso, head, legL, legR, armL: aL.p, armR: aR.p, handR: aR.hand, handL: aL.hand, hat, props,
    height: 1.75 * s, hipY,
  };
}

// Blend a set of pose weights into the skeleton.
export function animateHuman(m, p, time) {
  const L = m.look;
  const sp = p.speed;
  const run = p.run;
  const ph = p.phase;
  const sw = Math.sin(ph);
  const amp = Math.min(1, sp) * (0.55 + run * 0.35);
  let legL = sw * amp;
  let legR = -sw * amp;
  let armL = -sw * amp * 0.9;
  let armR = sw * amp * 0.9;
  let armLz = 0.08;
  let armRz = -0.08;
  let torsoX = (L.hunch || 0) + run * 0.25 + Math.sin(time * 2) * 0.01;
  let torsoZ = 0;
  let headX = -(L.hunch || 0) * 0.8;
  let headY = p.look || 0;
  let hipY = m.hipY + Math.abs(Math.cos(ph)) * 0.04 * Math.min(1, sp);
  let innerY = 0;
  let legLz = 0;

  const t = time;
  switch (p.act) {
    case 'sweep':
      torsoX += 0.35;
      armR = -0.9 + Math.sin(t * 5) * 0.4;
      armL = -0.7 + Math.sin(t * 5) * 0.4;
      armRz = -0.3 + Math.sin(t * 5) * 0.3;
      armLz = 0.3 + Math.sin(t * 5) * 0.3;
      torsoZ = Math.sin(t * 5) * 0.08;
      break;
    case 'water':
      armR = -1.1;
      armRz = -0.1;
      torsoX += 0.15;
      break;
    case 'carry':
      armR = -1.0;
      armL = -1.0;
      armRz = -0.25;
      armLz = 0.25;
      break;
    case 'holdR':
      armR = -0.8;
      break;
    case 'sit':
      hipY = 0.47;
      legL = -1.45;
      legR = -1.45;
      armL = -0.4;
      armR = -0.4;
      break;
    case 'read':
      hipY = 0.47;
      legL = -1.45;
      legR = -1.45;
      armL = -1.2;
      armR = -1.2;
      armLz = 0.35;
      armRz = -0.35;
      headX = 0.35;
      break;
    case 'drink':
      hipY = p.seated ? 0.47 : hipY;
      if (p.seated) {
        legL = -1.45;
        legR = -1.45;
      }
      armR = -2.2 + Math.sin(t * 1.5) * 0.2;
      armRz = -0.4;
      headX = -0.25;
      break;
    case 'bathe':
      innerY = -1.12;
      armL = -0.3 + Math.sin(t * 0.8) * 0.1;
      armR = -0.3;
      armLz = 0.9;
      armRz = -0.9;
      headX = -0.15;
      break;
    case 'phone':
      armR = -2.4;
      armRz = -0.9;
      torsoX += 0.25 + Math.max(0, Math.sin(t * 2.2)) * 0.35;
      break;
    case 'shout':
      armL = -2.4;
      armR = -2.4;
      armLz = 0.5;
      armRz = -0.5;
      headX = -0.3;
      break;
    case 'wave':
      armR = -2.8 + Math.sin(t * 12) * 0.35;
      armRz = -0.4;
      break;
    case 'fist':
      armR = -2.9 + Math.sin(t * 16) * 0.35;
      armRz = -0.2;
      armL = -0.2;
      torsoX -= 0.05;
      break;
    case 'point':
      armR = -1.55;
      armRz = -0.1;
      break;
    case 'stumble':
      armL = -1.5 + Math.sin(t * 7) * 0.5;
      armR = -1.5 + Math.cos(t * 6) * 0.5;
      armLz = 0.6;
      armRz = -0.6;
      torsoZ = Math.sin(t * 3) * 0.2;
      torsoX += Math.sin(t * 2.3) * 0.15;
      break;
    case 'hop':
      legL = -1.3;
      hipY += Math.abs(Math.sin(t * 9)) * 0.18;
      armL = -1.4;
      armR = -1.4;
      armLz = 0.9;
      armRz = -0.9;
      torsoZ = Math.sin(t * 9) * 0.1;
      break;
    case 'pickup':
      torsoX += 1.0;
      armL = -0.4;
      armR = -0.4;
      hipY -= 0.08;
      legL = -0.3;
      legR = -0.3;
      headX = -0.4;
      break;
    case 'wash':
      torsoX += 0.8;
      armL = -0.7 + Math.sin(t * 10) * 0.2;
      armR = -0.7 - Math.sin(t * 10) * 0.2;
      break;
    case 'stretch':
      armL = -3.0;
      armR = -3.0;
      armLz = 0.2;
      armRz = -0.2;
      torsoZ = Math.sin(t * 1.6) * 0.35;
      break;
    case 'beat':
      armR = -2.5 + Math.max(0, Math.sin(t * 7)) * 2.2;
      armRz = -0.2;
      torsoX += 0.1;
      break;
    case 'fan':
      armR = -1.4 + Math.sin(t * 14) * 0.25;
      armRz = -0.4 + Math.sin(t * 14) * 0.2;
      torsoX += 0.15;
      break;
    case 'pray':
      armL = -1.2;
      armR = -1.2;
      armLz = -0.45;
      armRz = 0.45;
      torsoX += 0.3 + Math.max(0, Math.sin(t * 1.2)) * 0.25;
      break;
    case 'bow':
      torsoX += 0.6;
      break;
    case 'pant':
      torsoX += 0.7;
      armL = -0.5;
      armR = -0.5;
      hipY -= 0.05;
      headX = -0.5;
      break;
    case 'scared':
      armL = -2.2;
      armR = -2.2;
      armLz = 0.7;
      armRz = -0.7;
      torsoX -= 0.25;
      break;
    case 'startle':
      armL = -2.0;
      armR = -2.0;
      armLz = 0.9;
      armRz = -0.9;
      torsoX -= 0.2;
      hipY += 0.12;
      break;
    case 'sleep':
      hipY = 0.47;
      legL = -1.45;
      legR = -1.45;
      armL = -0.3;
      armR = -0.3;
      headX = 0.6;
      torsoX -= 0.1;
      torsoZ = 0.15;
      break;
    case 'lookaround':
      headY += Math.sin(t * 2.2) * 1.0;
      break;
    case 'tidy':
      torsoX += 0.9;
      armL = -0.5 + Math.sin(t * 6) * 0.3;
      armR = -0.5 - Math.sin(t * 6) * 0.3;
      break;
    case 'chat':
      armR = -0.6 + Math.sin(t * 3) * 0.3;
      armRz = -0.3;
      headY += Math.sin(t * 1.3) * 0.2;
      break;
    case 'grill':
      armR = -1.3 + Math.sin(t * 12) * 0.25;
      armRz = -0.3;
      armL = -0.9;
      torsoX += 0.2;
      break;
    case 'repair':
      torsoX += 0.3;
      armL = -1.5 + Math.sin(t * 9) * 0.3;
      armR = -1.5 - Math.sin(t * 9) * 0.3;
      break;
    case 'net':
      armR = -1.2 + Math.sin(t * 3) * 0.1;
      armRz = -0.2;
      break;
    case 'swing':
      armR = -2.8 + Math.max(0, Math.sin(t * 10)) * 2.2;
      break;
    default:
      break;
  }
  if (p.holding && !['carry', 'read', 'water', 'phone', 'drink', 'sweep', 'fan', 'beat', 'net', 'swing'].includes(p.act)) {
    armR = Math.min(armR, -0.5);
  }
  m.legL.rotation.x = legL;
  m.legR.rotation.x = legR;
  m.legL.rotation.z = legLz;
  m.armL.rotation.x = armL;
  m.armR.rotation.x = armR;
  m.armL.rotation.z = armLz;
  m.armR.rotation.z = armRz;
  m.torso.rotation.x = torsoX;
  m.torso.rotation.z = torsoZ;
  m.head.rotation.x = headX;
  m.head.rotation.y = headY;
  m.hips.position.y = hipY;
  m.inner.position.y = lerp(m.inner.position.y, innerY, 0.15);
  // startle hop / squash
  m.inner.scale.y = 1 + (p.squash || 0) * 0.15;
}
