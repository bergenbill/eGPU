import { open } from './harness.mjs';
const h = await open();
const { page } = h;
const r = await page.evaluate(() => {
  const g = window.__game;
  g._start({ mode: 'story', char: 'monkey', season: 'autumn' });
  g.debugHold = true;
  const step = (s) => { for (let t = 0; t < s; t += 1 / 30) { g.update(1 / 30); g.input.endFrame(); } };
  step(0.5);
  const cup = g.items.items.find((i) => i.type === 'teaCup');
  const f = g.npcById('farmer');
  cup.pos.set(-48, 0, -14); cup.state = 'rest'; cup.mesh.position.copy(cup.pos); cup.lastDisplaced = 0;
  f.pos.set(-47, 0, -16); f.yaw = 0; f.setMode('routine');
  g.player.teleport(-30, 30);
  const log = [];
  for (let i = 0; i < 30; i++) {
    step(0.5);
    log.push(`${f.mode} ${f.pos.x.toFixed(1)},${f.pos.z.toFixed(1)} held=${f.held && f.held.type} path=${f.path ? f.path.length : 0} cup=${cup.state} ${cup.pos.x.toFixed(1)},${cup.pos.y.toFixed(2)},${cup.pos.z.toFixed(1)}`);
  }
  return log;
});
console.log(r.join('\n'));
await h.close();
