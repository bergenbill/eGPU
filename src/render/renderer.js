import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp } from '../core/math.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  return renderer;
}

// Sun, sky light and fog. Time of day tints everything.
export class Lighting {
  constructor(scene) {
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight('#ffffff', '#99aa77', 1.6);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = 30;
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 120 });
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    scene.add(this.sun);
    scene.add(this.sun.target);
    scene.fog = new THREE.Fog('#e0e8e0', 60, 130);
    this.pal = null;
    this._c = new THREE.Color();
  }

  setPalette(pal) {
    this.pal = pal;
    this.scene.background = new THREE.Color(pal.sky);
    this.scene.fog.color.set(pal.fog);
    this.hemi.color.set(pal.hemiSky);
    this.hemi.groundColor.set(pal.hemiGround);
    this.sun.color.set(pal.sun);
  }

  // hour: 6..20
  update(focus, hour) {
    const pal = this.pal;
    const t = clamp((hour - 6) / 14, 0, 1); // 0 morning .. 1 evening
    const ang = lerp(-1.0, 1.0, t);
    const elev = 0.35 + Math.sin(t * Math.PI) * 0.75;
    const dir = new THREE.Vector3(Math.sin(ang) * 0.9, Math.max(0.25, elev), 0.55).normalize();
    this.sun.position.set(focus.x + dir.x * 50, dir.y * 50, focus.z + dir.z * 50);
    this.sun.target.position.set(focus.x, 0, focus.z);
    // snap the shadow camera to texels to stop shimmering
    const texel = 60 / 2048;
    this.sun.target.position.x = Math.round(this.sun.target.position.x / texel) * texel;
    this.sun.target.position.z = Math.round(this.sun.target.position.z / texel) * texel;
    this.sun.position.x = this.sun.target.position.x + dir.x * 50;
    this.sun.position.z = this.sun.target.position.z + dir.z * 50;
    // evening warmth
    const eve = clamp((hour - 16) / 3.5, 0, 1);
    const morn = clamp((8 - hour) / 2, 0, 1);
    const warm = Math.max(eve, morn * 0.6);
    this._c.set(pal.sun).lerp(new THREE.Color('#ffb070'), warm * 0.8);
    this.sun.color.copy(this._c);
    this.sun.intensity = 2.3 - eve * 0.9;
    this.hemi.intensity = 1.55 - eve * 0.5;
    this._c.set(pal.sky).lerp(new THREE.Color('#f0a878'), eve * 0.55);
    this.scene.background.copy(this._c);
    this._c.set(pal.fog).lerp(new THREE.Color('#f2b890'), eve * 0.5);
    this.scene.fog.color.copy(this._c);
  }
}

// Follow camera from a high 3/4 angle like the Goose game, with zoom, rotation and occluder fading.
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.target = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.yawTarget = 0;
    this.zoom = 22;
    this.zoomTarget = 22;
    this.pitch = 0.7;
    this.shake = 0;
    this.lookAhead = new THREE.Vector3();
    this.occluders = [];
    this.faded = new Set();
    this.ray = new THREE.Raycaster();
    this.orbit = false;
    this.orbitT = 0;
  }

  snap(p) {
    this.target.copy(p);
    this._apply(1);
  }

  rotate(delta) {
    this.yawTarget += delta;
  }

  update(dt, focus, vel, input) {
    if (input) {
      if (input.wheel) this.zoomTarget = clamp(this.zoomTarget + input.wheel * 0.04, 12, 42);
      if (input.wasPressed('BracketLeft', 'Comma')) this.yawTarget += Math.PI / 4;
      if (input.wasPressed('BracketRight', 'Period')) this.yawTarget -= Math.PI / 4;
    }
    if (this.orbit) {
      this.orbitT += dt;
      this.yawTarget = this.orbitT * 0.05;
    }
    this.yaw = dampAngle(this.yaw, this.yawTarget, 6, dt);
    this.zoom = damp(this.zoom, this.zoomTarget, 6, dt);
    if (vel) {
      this.lookAhead.x = damp(this.lookAhead.x, vel.x * 0.35, 2, dt);
      this.lookAhead.z = damp(this.lookAhead.z, vel.z * 0.35, 2, dt);
    }
    const goal = focus.clone().add(this.lookAhead);
    goal.y = focus.y * 0.6;
    this.target.x = damp(this.target.x, goal.x, 5, dt);
    this.target.y = damp(this.target.y, goal.y, 4, dt);
    this.target.z = damp(this.target.z, goal.z, 5, dt);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this._apply(dt);
  }

  _apply() {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const d = this.zoom;
    const cam = this.camera;
    cam.position.set(
      this.target.x + Math.sin(this.yaw) * cp * d,
      this.target.y + sp * d,
      this.target.z + Math.cos(this.yaw) * cp * d,
    );
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.35;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
    }
    cam.lookAt(this.target.x, this.target.y + 0.4, this.target.z);
  }

  // Fade buildings that sit between the camera and the player.
  updateOccluders(playerPos) {
    const cam = this.camera.position;
    const dir = playerPos.clone().add(new THREE.Vector3(0, 0.5, 0)).sub(cam);
    const dist = dir.length();
    dir.normalize();
    this.ray.set(cam, dir);
    this.ray.far = dist - 0.5;
    const hits = this.ray.intersectObjects(this.occluders, true);
    const now = new Set();
    for (const h of hits) {
      let o = h.object;
      while (o.parent && !this.occluders.includes(o)) o = o.parent;
      now.add(o);
    }
    for (const o of this.occluders) {
      const want = now.has(o) ? 0.28 : 1;
      let cur = o.userData.fade ?? 1;
      if (Math.abs(cur - want) < 0.01) continue;
      cur += (want - cur) * 0.2;
      if (Math.abs(cur - want) < 0.02) cur = want;
      o.userData.fade = cur;
      o.traverse((m) => {
        if (!m.isMesh) return;
        m.material.transparent = cur < 0.999;
        m.material.opacity = cur;
        m.material.depthWrite = cur > 0.5;
        m.castShadow = true;
      });
    }
  }

  forward() {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }
  right() {
    return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
  }
}
