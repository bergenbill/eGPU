import { open } from './harness.mjs';
const h = await open({ width: 1280, height: 720 });
const { page } = h;
await page.evaluate(() => {
  const g = window.__game;
  g._start({ mode: 'story', char: 'monkey', season: 'summer' });
  g.debugHold = true;
  window.step = (s) => { for (let t = 0; t < s; t += 1 / 30) { g.update(1 / 30); g.input.endFrame(); } };
  // line up the cast on the road
  const p = g.player;
  p.teleport(-2, 0);
  p.yaw = 0.4;
  for (const n of g.npcs) n.debugFreeze = true;
  g.npcs.forEach((n, i) => { n.pos.set(-1 + i * 1.1, 0, -1.5); n.yaw = 0.3; n.setMode('watch'); });
  window.step(0.1);
  g.npcs.forEach((n, i) => { n.pos.set(-1 + i * 1.1, 0, -1.5); n.yaw = 0.3; n.syncModel(0.016); });
  const cam = g.camera;
  cam.position.set(2, 2.2, 6);
  cam.lookAt(2, 0.8, -1);
});
await h.shot('models-1');
await page.evaluate(() => {
  const g = window.__game;
  g.player.dispose();
  const { Player } = window;
});
await h.close();
