import { open } from './harness.mjs';
const h = await open({ width: 1280, height: 800 });
const { page } = h;
async function shot(name, fn, arg) {
  await page.evaluate(fn, arg);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: 'docs/' + name + '.png' });
}
const setup = (args) => {
  const [char, season, x, z, yaw, zoom] = args;
  const g = window.__game;
  g._start({ mode: 'story', char, season });
  g.debugHold = true;
  window.step = (s) => { for (let t = 0; t < s; t += 1 / 30) { g.update(1 / 30); g.input.endFrame(); } };
  document.getElementById('toasts').style.display = 'none';
  g.player.teleport(x, z);
  g.player.yaw = yaw;
  g.rig.zoomTarget = g.rig.zoom = zoom;
  g.rig.snap(g.player.pos);
  window.step(1.5);
};
await shot('shopping-street', setup, ['monkey', 'autumn', 1.5, -24, Math.PI, 20]);
await shot('shrine-spring', setup, ['monkey', 'spring', 2, -45, Math.PI, 22]);
await shot('onsen-winter', (a) => {
  const [char, season] = a;
  const g = window.__game;
  g._start({ mode: 'story', char, season });
  g.debugHold = true;
  document.getElementById('toasts').style.display = 'none';
  const gp = g.npcById('grandpa');
  gp.stepI = 0; gp.setMode('routine'); gp.pos.set(42.5, 0, -43);
  window.step = (s) => { for (let t = 0; t < s; t += 1 / 30) { g.update(1 / 30); g.input.endFrame(); } };
  g.player.teleport(39, -40.5);
  g.rig.zoomTarget = g.rig.zoom = 18;
  g.rig.snap(g.player.pos);
  window.step(5);
}, ['monkey', 'winter']);
await shot('chase', (a) => {
  const g = window.__game;
  g._start({ mode: 'rush', char: 'raccoon', season: 'summer' });
  g.debugHold = true;
  document.getElementById('toasts').style.display = 'none';
  window.step = (s) => { for (let t = 0; t < s; t += 1 / 30) { g.update(1 / 30); g.input.endFrame(); } };
  const f = g.items.items.find((i) => i.type === 'fish');
  g.player.teleport(-3.5, -25);
  g.player.pickUp(f);
  g.rig.zoomTarget = g.rig.zoom = 21;
  g.rig.snap(g.player.pos);
  for (const id of ['fishmonger', 'dango']) { const n = g.npcById(id); n.pos.set(-3, 0, -28 + (id === 'dango' ? -1 : 0)); n.startChase('thief'); }
  g.input.down.add('KeyS');
  window.step(1.4);
  g.input.down.delete('KeyS');
}, null);
await h.close();
