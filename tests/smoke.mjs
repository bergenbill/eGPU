import { open } from './harness.mjs';

const h = await open();
const { page } = h;
await h.wait(1500);
await h.shot('01-title');
await page.evaluate(() => window.__game.startGame({ mode: 'story', char: 'monkey', season: 'autumn' }));
await h.wait(2500);
await h.shot('02-start');
// walk north a bit
await page.keyboard.down('KeyW');
await h.wait(1500);
await page.keyboard.up('KeyW');
await h.shot('03-walk');
const info = await page.evaluate(() => {
  const g = window.__game;
  return { pos: g.player.pos.toArray(), fps: 0, npcs: g.npcs.map((n) => [n.id, n.mode, n.pos.x.toFixed(1), n.pos.z.toFixed(1)]), items: g.items.items.length, fixtures: g.fixtures.length };
});
console.log(JSON.stringify(info, null, 1));
console.log('ERRORS:\n' + h.errors.join('\n'));
await h.close();
