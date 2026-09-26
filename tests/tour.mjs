import { open } from './harness.mjs';
const season = process.argv[2] || 'autumn';
const char = process.argv[3] || 'monkey';
const only = process.argv[4];
const h = await open({ width: 1280, height: 800 });
const { page } = h;
await page.evaluate(([season, char]) => {
  const g = window.__game;
  g._start({ mode: 'story', char, season });
  g.debugHold = true;
  window.step = (s) => { for (let t = 0; t < s; t += 1 / 30) { g.update(1 / 30); g.input.endFrame(); } };
  window.step(1);
}, [season, char]);
const spots = [
  ['hideout', -48.2, 30.8, 0],
  ['farm', -40, -18, 0],
  ['shrine', 0, -44, 0],
  ['shotengai', 0, -22, 0],
  ['onsen', 38, -36.5, 0],
  ['grandma', 38, -12, 0],
  ['busstop', 14, 2, 0],
  ['park', 16, 18, 0],
  ['paddies', -25, 6, 0],
];
for (const [name, x, z, yaw] of spots) {
  if (only && only !== name) continue;
  await page.evaluate(([x, z, yaw]) => {
    const g = window.__game;
    g.player.teleport(x, z);
    g.player.yaw = yaw;
    g.rig.yawTarget = yaw; g.rig.yaw = yaw;
    g.rig.snap(g.player.pos);
    window.step(1.2);
  }, [x, z, yaw]);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await h.shot(`tour-${season}-${name}`);
}
console.log(h.errors.filter((e) => !e.includes('ERR_FAILED')).join('\n'));
await h.close();
