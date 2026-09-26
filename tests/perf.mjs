import { open } from './harness.mjs';
const h = await open();
const { page } = h;
await page.evaluate(() => window.__game.startGame({ mode: 'story', char: 'raccoon', season: 'winter' }));
await h.wait(2500);
const info = await page.evaluate(async () => {
  const g = window.__game;
  const r = g.renderer.info;
  const t0 = performance.now();
  let n = 0;
  await new Promise((res) => { function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); });
  // time pure update cost
  const u0 = performance.now();
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  const upd = (performance.now() - u0) / 60;
  const b0 = performance.now();
  g.buildWorld('autumn', 5);
  const build = performance.now() - b0;
  return { calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, fps: n / 2, updateMs: upd.toFixed(2), buildMs: build.toFixed(0) };
});
console.log(JSON.stringify(info));
await h.shot('04-winter');
console.log(h.errors.join('\n'));
await h.close();
