import * as THREE from 'three';

// Flat-shaded Lambert materials, cached by color so the static batcher can merge by material.
const cache = new Map();

export function mat(color, opts = {}) {
  const key = color + '|' + (opts.transparent ? 't' + opts.opacity : '') + (opts.emissive ? 'e' + opts.emissive : '') + (opts.side ? 's' + opts.side : '') + (opts.map ? 'm' + opts.map.uuid : '');
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
    m.userData.key = key;
    cache.set(key, m);
  }
  return m;
}

// Materials that must not be shared (e.g. fading occluders, flashing props).
export function uniqueMat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
}

export function clearMaterialCache() {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}
