import { open } from './harness.mjs';
const h = await open({ width: 1280, height: 800 });
const { page } = h;
await page.evaluate(() => {
  const g = window.__game;
  g._start({ mode: 'story', char: 'monkey', season: 'autumn' });
  g.debugHold = true;
  window.step = (s) => { for (let t = 0; t < s; t += 1 / 30) { g.update(1 / 30); g.input.endFrame(); } };
  window.step(1);
  // stash some loot
  const ids = ['fish', 'strawHat', 'duck', 'teapot', 'dango'];
  let k = 0;
  for (const t of ids) {
    const it = g.items.items.find((i) => i.type === t);
    it.loosen();
    it.state = 'air'; it.sleeping = false;
    it.pos.set(-50.5 + Math.cos(k) * 1.2, 0.5, 34.5 + Math.sin(k) * 1.2);
    k += 1.3;
  }
  g.player.teleport(-49.5, 32.5);
  window.step(2);
  g.input.down.add('KeyQ'); g.input.pressed.add('KeyQ'); window.step(0.1); g.input.down.delete('KeyQ');
  window.step(0.2);
});
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
await h.shot('nest');
console.log(h.errors.filter((e) => !e.includes('ERR_FAILED')).join('\n'));
await h.close();
