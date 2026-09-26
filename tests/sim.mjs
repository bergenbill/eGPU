import { open } from './harness.mjs';
const h = await open({ width: 800, height: 500 });
const { page } = h;
const out = await page.evaluate(() => {
  const g = window.__game;
  g._start({ mode: 'story', char: 'raccoon', season: 'autumn' });
  g.debugHold = true;
  const step = (s) => { for (let t = 0; t < s; t += 1 / 30) { g.update(1 / 30); g.input.endFrame(); } };
  g.player.teleport(-58, 42);
  const hist = {};
  for (const n of g.npcs) hist[n.id] = { steps: new Set(), stuck: 0, maxStuck: 0, last: n.pos.clone(), modes: {}, nan: false };
  const t0 = performance.now();
  for (let i = 0; i < 180; i++) {
    step(5);
    for (const n of g.npcs) {
      const hh = hist[n.id];
      hh.steps.add(n.stepI);
      hh.modes[n.mode] = (hh.modes[n.mode] || 0) + 1;
      if (!isFinite(n.pos.x) || !isFinite(n.pos.z)) hh.nan = true;
      const moved = n.pos.distanceTo(hh.last);
      const wantsMove = n.mode === 'routine' && n.stepPhase === 'go';
      if (wantsMove && moved < 0.3) { hh.stuck++; hh.maxStuck = Math.max(hh.maxStuck, hh.stuck); hh.stuckAt = [n.pos.x.toFixed(1), n.pos.z.toFixed(1), n.curStep.at]; } else hh.stuck = 0;
      hh.last.copy(n.pos);
    }
  }
  const ms = performance.now() - t0;
  const res = {};
  for (const n of g.npcs) {
    const hh = hist[n.id];
    res[n.id] = { steps: [...hh.steps].sort().join(','), of: n.def.routine.length, maxStuck: hh.maxStuck, stuckAt: hh.stuckAt, modes: hh.modes, nan: hh.nan };
  }
  return { ms, res, bus: g.bus.trips, items: g.items.items.filter((i) => !i.atHome() && i.owner).map((i) => i.type + '@' + i.pos.x.toFixed(0) + ',' + i.pos.z.toFixed(0)) };
});
console.log(JSON.stringify(out, null, 1));
console.log(h.errors.filter((e) => !e.includes('ERR_FAILED')).join('\n'));
await h.close();
