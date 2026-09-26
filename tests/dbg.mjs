import { open } from './harness.mjs';
const h = await open();
const { page } = h;
const r = await page.evaluate(() => {
  const g = window.__game;
  g._start({ mode: 'story', char: 'monkey', season: 'autumn' });
  g.debugHold = true;
  const step = (s) => { for (let t = 0; t < s; t += 1 / 30) { g.update(1 / 30); g.input.endFrame(); } };
  const tap = (c) => { g.input.down.add(c); g.input.pressed.add(c); step(1 / 30); g.input.down.delete(c); step(1 / 30); };
  step(0.5);
  const p = g.player;
  const it = g.items.items.find((i) => i.type === 'pebble');
  p.teleport(it.pos.x + 0.5, it.pos.z); p.yaw = -Math.PI / 2; tap('KeyE');
  p.teleport(-49, -26.2); p.yaw = Math.PI;
  tap('Space'); step(2);
  const f = g.npcById('farmer');
  f.setMode('routine');
  f.pos.set(-44, 0, -24); f.prevPos.copy(f.pos); f.vel.set(0, 0, 0);
  p.aimPoint.set(-44, 0, -24);
  const out = [p.state, p.held && p.held.type];
  const arc = p.throwArc();
  out.push(arc.end.toArray().map((v) => v.toFixed(2)), arc.npc && arc.npc.id);
  p.throwHeld();
  const traj = [];
  for (let i = 0; i < 40; i++) {
    step(1 / 30);
    const peb = g.items.items.find((x) => x.type === 'pebble' && x.thrower);
    if (peb) traj.push(`${peb.pos.x.toFixed(2)},${peb.pos.y.toFixed(2)},${peb.pos.z.toFixed(2)} f=${f.pos.x.toFixed(2)},${f.pos.z.toFixed(2)}`);
  }
  out.push(traj);
  return out;
});
console.log(JSON.stringify(r, null, 1));
await h.close();
