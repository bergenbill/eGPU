import * as THREE from 'three';
import { box, cyl, sphere, cone, group } from '../render/geom.js';
import { lerp } from '../core/math.js';

// Procedural low-poly animals with a pose-blending animator.

function leg(len, r, color, pawColor) {
  const pivot = group();
  pivot.add(cyl(r, r * 0.85, len, color, { y: -len / 2, seg: 6 }));
  const paw = sphere(r * 1.25, pawColor, { y: -len, sy: 0.7, sz: 1.3, lo: true });
  pivot.add(paw);
  return pivot;
}

export function buildMonkey() {
  const fur = '#a88f74';
  const furLight = '#cdb89c';
  const furDark = '#8c7560';
  const face = '#e4876f';
  const root = group();
  const inner = group();
  root.add(inner);
  const hips = group({ y: 0.36 });
  inner.add(hips);
  const torso = sphere(0.24, fur, { y: 0.08, z: 0.04, sx: 0.9, sy: 0.85, sz: 1.3, smooth: true });
  hips.add(torso);
  hips.add(sphere(0.17, furLight, { y: 0.02, z: 0.2, sx: 0.85, sy: 0.8, sz: 0.8, smooth: true }));
  const tail = cyl(0.035, 0.05, 0.2, furDark, { y: 0.15, z: -0.3, rx: -0.8, seg: 5 });
  hips.add(tail);
  const head = group({ y: 0.27, z: 0.3 });
  hips.add(head);
  head.add(sphere(0.19, fur, { sy: 0.95, smooth: true }));
  head.add(sphere(0.13, furLight, { y: 0.1, z: -0.02, sx: 1.3, sy: 0.6, lo: true }));
  head.add(sphere(0.145, face, { y: -0.02, z: 0.1, sx: 0.85, sy: 0.9, sz: 0.55, smooth: true }));
  for (const s of [-1, 1]) {
    head.add(sphere(0.03, '#2a1d18', { x: s * 0.055, y: 0.025, z: 0.19, smooth: true }));
    head.add(sphere(0.009, '#ffffff', { x: s * 0.052 + 0.01, y: 0.038, z: 0.215 }));
    head.add(sphere(0.055, '#e4a28f', { x: s * 0.175, y: 0.02, z: 0.0, sz: 0.5, lo: true }));
    head.add(box(0.07, 0.018, 0.02, '#7a5a48', { x: s * 0.055, y: 0.065, z: 0.18, rz: s * -0.15 }));
  }
  head.add(sphere(0.022, '#c56a58', { y: -0.025, z: 0.205 }));
  const mouth = box(0.07, 0.02, 0.02, '#4a2a22', { y: -0.075, z: 0.185 });
  head.add(mouth);
  const hat = group({ y: 0.16 });
  head.add(hat);

  const legs = {
    fl: leg(0.3, 0.05, fur, furDark),
    fr: leg(0.3, 0.05, fur, furDark),
    bl: leg(0.34, 0.058, fur, furDark),
    br: leg(0.34, 0.058, fur, furDark),
  };
  legs.fl.position.set(-0.12, 0.05, 0.22);
  legs.fr.position.set(0.12, 0.05, 0.22);
  legs.bl.position.set(-0.13, 0.02, -0.14);
  legs.br.position.set(0.13, 0.02, -0.14);
  for (const k of ['fl', 'fr', 'bl', 'br']) hips.add(legs[k]);

  const hand = group();
  inner.add(hand);
  return {
    kind: 'monkey', root, inner, hips, head, mouth, tail, legs, hand, hat, torso,
    hipH: 0.36, mouthPos: new THREE.Vector3(0, 0.42, 0.5), chestPos: new THREE.Vector3(0, 0.66, 0.32),
    maxUpright: 1,
  };
}

export function buildRaccoon() {
  const fur = '#8e8a85';
  const furLight = '#bdb8b0';
  const dark = '#3a3634';
  const root = group();
  const inner = group();
  root.add(inner);
  const hips = group({ y: 0.3 });
  inner.add(hips);
  const torso = sphere(0.25, fur, { y: 0.08, z: 0.0, sx: 1.0, sy: 0.85, sz: 1.45, smooth: true });
  hips.add(torso);
  hips.add(sphere(0.18, furLight, { y: -0.02, z: 0.12, sx: 0.9, sy: 0.7, sz: 1.0, smooth: true }));
  // ringed bushy tail
  const tail = group({ y: 0.12, z: -0.33, rx: -2.2 });
  const ringC = ['#a9a49c', '#3f3a37'];
  for (let i = 0; i < 6; i++) {
    const r = 0.085 - i * 0.006;
    tail.add(cyl(r, r, 0.08, ringC[i % 2], { y: 0.04 + i * 0.075, seg: 7 }));
  }
  tail.add(sphere(0.05, '#3f3a37', { y: 0.5 }));
  hips.add(tail);
  const head = group({ y: 0.22, z: 0.34 });
  hips.add(head);
  head.add(sphere(0.17, fur, { sx: 1.1, sy: 0.9, smooth: true }));
  head.add(sphere(0.12, furLight, { y: -0.04, z: 0.07, sx: 1.1, sy: 0.7, lo: true }));
  head.add(cone(0.075, 0.16, furLight, { y: -0.04, z: 0.2, rx: Math.PI / 2, seg: 7 }));
  head.add(sphere(0.03, '#1c1a19', { y: -0.04, z: 0.285, smooth: true }));
  // bandit mask
  head.add(sphere(0.15, dark, { y: 0.03, z: 0.07, sx: 1.25, sy: 0.38, sz: 0.75, smooth: true }));
  for (const s of [-1, 1]) {
    head.add(sphere(0.026, '#0f0d0c', { x: s * 0.07, y: 0.04, z: 0.17, smooth: true }));
    head.add(sphere(0.009, '#ffffff', { x: s * 0.066 + 0.008, y: 0.052, z: 0.192 }));
    head.add(sphere(0.045, '#f2efe8', { x: s * 0.07, y: 0.1, z: 0.12, sy: 0.4, lo: true }));
    const ear = cone(0.06, 0.1, fur, { x: s * 0.12, y: 0.15, z: -0.02, seg: 5 });
    head.add(ear);
    head.add(cone(0.035, 0.06, furLight, { x: s * 0.12, y: 0.15, z: 0.0, seg: 5 }));
  }
  const mouth = box(0.06, 0.015, 0.02, '#2a2220', { y: -0.1, z: 0.22 });
  head.add(mouth);
  const hat = group({ y: 0.15 });
  head.add(hat);

  const legs = {
    fl: leg(0.26, 0.048, dark, dark),
    fr: leg(0.26, 0.048, dark, dark),
    bl: leg(0.28, 0.055, fur, dark),
    br: leg(0.28, 0.055, fur, dark),
  };
  legs.fl.position.set(-0.12, 0.02, 0.24);
  legs.fr.position.set(0.12, 0.02, 0.24);
  legs.bl.position.set(-0.13, 0.02, -0.2);
  legs.br.position.set(0.13, 0.02, -0.2);
  for (const k of ['fl', 'fr', 'bl', 'br']) hips.add(legs[k]);
  const hand = group();
  inner.add(hand);
  return {
    kind: 'raccoon', root, inner, hips, head, mouth, tail, legs, hand, hat, torso,
    hipH: 0.3, mouthPos: new THREE.Vector3(0, 0.34, 0.55), chestPos: new THREE.Vector3(0, 0.55, 0.3),
    maxUpright: 0.8,
  };
}

export function buildHat(id) {
  const g = group();
  switch (id) {
    case 'strawHat':
      g.add(cyl(0.3, 0.3, 0.02, '#e3c77a', { seg: 14 }));
      g.add(cone(0.17, 0.16, '#e8cf85', { y: 0.08, seg: 12 }));
      g.add(cyl(0.15, 0.16, 0.035, '#b5402e', { y: 0.03, seg: 12 }));
      break;
    case 'towel':
      g.add(box(0.26, 0.06, 0.2, '#f7f7f2', { y: 0.01 }));
      g.add(box(0.26, 0.062, 0.035, '#5b8ec2', { y: 0.01, z: 0.05 }));
      break;
    case 'hachimaki':
      g.add(cyl(0.175, 0.175, 0.05, '#ffffff', { y: -0.1, seg: 12 }));
      g.add(sphere(0.04, '#d6452f', { y: -0.1, z: 0.17 }));
      g.add(box(0.03, 0.14, 0.02, '#ffffff', { y: -0.13, z: -0.18, rx: 0.4 }));
      break;
    case 'kitsune': {
      const m = group({ x: 0.12, y: -0.08, z: 0.1, ry: 0.8 });
      m.add(sphere(0.12, '#f7f4ee', { sz: 0.45, sy: 1.1 }));
      m.add(cone(0.05, 0.1, '#f7f4ee', { x: -0.07, y: 0.14, seg: 4 }));
      m.add(cone(0.05, 0.1, '#f7f4ee', { x: 0.07, y: 0.14, seg: 4 }));
      m.add(box(0.06, 0.015, 0.01, '#d6452f', { x: -0.04, y: 0.02, z: 0.06, rz: 0.3 }));
      m.add(box(0.06, 0.015, 0.01, '#d6452f', { x: 0.04, y: 0.02, z: 0.06, rz: -0.3 }));
      g.add(m);
      break;
    }
    case 'policeCap':
      g.add(cyl(0.15, 0.16, 0.1, '#1d3a6b', { y: 0.03, seg: 12 }));
      g.add(box(0.2, 0.02, 0.12, '#111111', { y: -0.01, z: 0.12 }));
      g.add(sphere(0.025, '#f0c23a', { y: 0.06, z: 0.15 }));
      break;
    case 'crown':
      g.add(cyl(0.13, 0.13, 0.1, '#f0c23a', { y: 0.03, seg: 8, mat: { emissive: '#553300' } }));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.add(cone(0.03, 0.08, '#f0c23a', { x: Math.cos(a) * 0.11, y: 0.12, z: Math.sin(a) * 0.11, seg: 4, mat: { emissive: '#553300' } }));
      }
      g.add(sphere(0.025, '#d6452f', { y: 0.05, z: 0.13 }));
      break;
    case 'sakura':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.add(sphere(0.04, '#f7bccb', { x: 0.1 + Math.cos(a) * 0.04, y: 0.0, z: Math.sin(a) * 0.04, sy: 0.4 }));
      }
      g.add(sphere(0.02, '#f2c238', { x: 0.1, y: 0.01 }));
      break;
    default:
      break;
  }
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

export function buildAnimal(kind, hatId) {
  const m = kind === 'monkey' ? buildMonkey() : buildRaccoon();
  m.mouthSY = m.mouth.scale.y;
  // animals are drawn a little larger than life so they read well from the camera
  m.root.scale.setScalar(kind === 'monkey' ? 1.25 : 1.22);
  if (hatId && hatId !== 'none') m.hat.add(buildHat(hatId));
  return m;
}

// Pose blending. `a` holds 0..1 weights and a gait phase.
export function animateAnimal(m, a, dt, time) {
  const up = a.upright * m.maxUpright;
  const climb = a.climb;
  const sit = a.sit;
  const sq = a.squat;
  const bob = Math.abs(Math.sin(a.phase)) * 0.05 * a.speed;
  let pitch = -1.0 * up - 1.45 * climb - 0.55 * sit - 0.25 * sq + a.sneak * 0.12;
  pitch += a.bark * -0.25;
  m.hips.rotation.x = pitch;
  m.hips.rotation.z = Math.sin(a.phase) * 0.04 * a.speed + (a.tear ? Math.sin(time * 40) * 0.05 : 0);
  let hy = m.hipH - a.sneak * 0.08 - sq * 0.1 - sit * 0.08 + bob + up * 0.02;
  if (a.land > 0) hy -= a.land * 0.08;
  m.hips.position.y = hy;
  m.hips.position.z = climb * -0.1;
  // squash & stretch
  const sy = 1 + a.bark * 0.08 - a.land * 0.18 + a.jumpS * 0.1;
  const sxz = 1 - a.bark * 0.03 + a.land * 0.12 - a.jumpS * 0.05;
  m.inner.scale.set(sxz, sy, sxz);

  const sw = Math.sin(a.phase);
  const cw = Math.cos(a.phase);
  const amp = 0.75 * Math.min(1, a.speed);
  const L = m.legs;
  // quadruped gait (diagonal pairs)
  let fl = sw * amp;
  let fr = -sw * amp;
  let bl = -sw * amp;
  let br = sw * amp;
  // upright: hind legs walk, front legs hold
  const hindUp = -pitch;
  bl = lerp(bl, sw * amp * 0.9, up) + hindUp * (1 - climb);
  br = lerp(br, -sw * amp * 0.9, up) + hindUp * (1 - climb);
  const hold = a.holding ? 1 : 0;
  fl = lerp(fl, -0.5 - 0.2 * hold, up);
  fr = lerp(fr, -0.5 - 0.2 * hold, up);
  // climbing: alternate reaching
  if (climb > 0) {
    const c = Math.sin(time * 9 * (a.climbMove ? 1 : 0.2));
    fl = lerp(fl, -2.2 + c * 0.5, climb);
    fr = lerp(fr, -2.2 - c * 0.5, climb);
    bl = lerp(bl, -0.3 - c * 0.5 + 1.45, climb);
    br = lerp(br, -0.3 + c * 0.5 + 1.45, climb);
  }
  if (sit > 0) {
    bl = lerp(bl, -0.9, sit);
    br = lerp(br, -0.9, sit);
    fl = lerp(fl, 0.3, sit);
    fr = lerp(fr, 0.3, sit);
  }
  if (sq > 0) {
    bl = lerp(bl, 0.9, sq);
    br = lerp(br, 0.9, sq);
  }
  if (a.tear > 0) {
    fl += Math.sin(time * 38) * 0.5 * a.tear;
    fr -= Math.sin(time * 38) * 0.5 * a.tear;
  }
  if (a.throwT > 0) {
    fr = lerp(fr, -2.6 + (1 - a.throwT) * 3, a.throwT);
  }
  if (a.drag) {
    fl = lerp(fl, 0.6, 0.6);
    fr = lerp(fr, 0.6, 0.6);
  }
  L.fl.rotation.x = fl;
  L.fr.rotation.x = fr;
  L.bl.rotation.x = bl;
  L.br.rotation.x = br;
  L.fl.rotation.z = a.tear * 0.3;
  L.fr.rotation.z = -a.tear * 0.3;
  // head keeps looking forward
  m.head.rotation.x = -pitch * 0.75 - a.bark * 0.5 + (a.sneak ? 0.1 : 0) + (sq ? -0.2 : 0);
  m.head.rotation.y = a.headYaw || 0;
  m.head.rotation.z = a.tear ? Math.sin(time * 30) * 0.15 : Math.sin(time * 1.3) * 0.03;
  m.mouth.scale.y = m.mouthSY * (1 + a.bark * 4 + (a.eat ? Math.abs(Math.sin(time * 18)) * 3 : 0));
  // tail
  if (m.kind === 'raccoon') {
    m.tail.rotation.x = -2.2 + up * 0.8 + sq * -0.6 + Math.sin(time * 2) * 0.05;
    m.tail.rotation.z = Math.sin(a.phase * 0.5) * 0.25 * a.speed + Math.sin(time * 1.7) * 0.08;
  } else {
    m.tail.rotation.x = -0.8 + Math.sin(time * 3) * 0.1 - sq * 0.6;
  }
  // bathing: sink into water
  m.inner.position.y = -a.bathe * 0.32 - a.wade * 0.12;
  // hand anchor between mouth & chest
  const t = up;
  m.hand.position.lerpVectors(m.mouthPos, m.chestPos, t);
  if (climb > 0) m.hand.position.set(0, 0.55, -0.05);
  m.hand.position.y += m.hips.position.y - m.hipH;
}
