import { open } from './harness.mjs';
const h = await open({ width: 1000, height: 600 });
const { page } = h;
for (const char of ['monkey', 'raccoon']) {
  await page.evaluate((char) => {
    const g = window.__game;
    g._start({ mode: 'story', char, season: 'summer' });
    g.debugHold = true;
    window.step = (s) => { for (let t = 0; t < s; t += 1 / 30) { g.update(1 / 30); g.input.endFrame(); } };
    const p = g.player;
    p.teleport(20, 0.5);
    p.yaw = 0.9;
    window.step(0.1);
    g.ui.showHUD(false);
    const cam = g.camera;
    cam.position.set(21.2, 1.0, 2.2);
    cam.lookAt(20, 0.35, 0.5);
  }, char);
  await h.shot('model-' + char + '-a');
  await page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    // holding pose
    const it = g.items.items.find((i) => i.type === 'fish');
    p.pickUp(it);
    p.a.upright = 1;
    p.syncModel(0.3);
    p.syncModel(0.3);
    const cam = g.camera;
    cam.position.set(21.2, 1.0, 2.2);
    cam.lookAt(20, 0.45, 0.5);
  });
  await h.shot('model-' + char + '-b');
  await page.evaluate(() => {
    const g = window.__game;
    const cam = g.camera;
    g.rig.snap(g.player.pos);
  });
}
await h.close();
