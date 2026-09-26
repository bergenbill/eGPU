// Small math helpers shared across the game.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smooth = (t) => t * t * (3 - 2 * t);
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
export const dampAngle = (a, b, lambda, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
export const yawTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz);
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Angle between a facing yaw and the direction to a target, in radians (0..PI).
export function angleOff(yaw, fx, fz, tx, tz) {
  return Math.abs(wrapAngle(yawTo(fx, fz, tx, tz) - yaw));
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function fmtClock(hour) {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${m < 10 ? '0' : ''}${m} ${h < 12 ? 'AM' : 'PM'}`;
}
