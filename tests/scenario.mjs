import { open } from './harness.mjs';

const h = await open();
const { page } = h;
const results = [];
function check(name, ok, extra = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
}
// install stepping helpers
async function setup(char) {
  await page.evaluate((char) => {
    const g = window.__game;
    g._start({ mode: 'story', char, season: 'autumn' });
    g.debugHold = true;
    g.save.story.monkey = { done: [], bonus: [] };
    g.save.story.raccoon = { done: [], bonus: [] };
    g.tasks.done.clear();
    const T = (window.T = {
      step(sec, dt = 1 / 30) {
        for (let t = 0; t < sec; t += dt) {
          g.update(dt);
          g.input.endFrame();
        }
      },
      down(c) { g.input.down.add(c); g.input.pressed.add(c); },
      up(c) { g.input.down.delete(c); g.input.released.add(c); },
      tap(c) { T.down(c); T.step(1 / 30); T.up(c); T.step(1 / 30); },
      hold(c, sec) { T.down(c); T.step(sec); T.up(c); T.step(1 / 30); },
      tp(x, z, yaw = 0) { g.player.teleport(x, z, g.world.groundAt(x, z, 5, 10)); g.player.yaw = yaw; g.rig.snap(g.player.pos); },
      done(id) { return g.tasks.done.has(id); },
      face(x, z) { g.player.yaw = Math.atan2(x - g.player.pos.x, z - g.player.pos.z); },
    });
    T.step(0.5);
  }, char);
}
await setup('monkey');

// 1. daikon
let r = await page.evaluate(() => {
  const g = window.__game;
  const d = g.items.items.find((i) => i.type === 'daikon');
  T.tp(d.pos.x, d.pos.z + 0.8);
  T.face(d.pos.x, d.pos.z);
  T.step(0.1);
  const lab = g.player.focusInfo && g.player.focusInfo.label;
  T.tap('KeyE');
  T.step(1.0);
  return { lab, held: g.player.held && g.player.held.type, done: T.done('daikon') };
});
check('pull daikon', r.done, JSON.stringify(r));

// 2. leaves
r = await page.evaluate(() => {
  const g = window.__game;
  g.player.dropHeld();
  const pile = g.fixtureByKey('leafpileA');
  T.tp(pile.pos.x, pile.pos.z + 3, Math.PI);
  T.down('KeyW'); T.down('ShiftLeft');
  T.step(1.2);
  T.up('KeyW'); T.up('ShiftLeft');
  T.step(0.2);
  return { amount: pile.amount, done: T.done('leaves') };
});
check('scatter leaves', r.done, JSON.stringify(r));

// 3. bell
r = await page.evaluate(() => {
  const g = window.__game;
  const b = g.fixtureByKey('bell');
  T.tp(b.pos.x, b.pos.z + 0.7, Math.PI);
  T.step(0.2);
  const lab = g.player.focusInfo && g.player.focusInfo.label;
  T.tap('KeyE');
  T.step(1);
  return { lab, y: g.player.pos.y, done: T.done('bell') };
});
check('ring bell', r.done, JSON.stringify(r));

// 4. fish stash
r = await page.evaluate(() => {
  const g = window.__game;
  const f = g.items.items.find((i) => i.type === 'fish');
  T.tp(f.pos.x + 1.35, f.pos.z, -Math.PI / 2);
  T.step(0.1);
  const lab = g.player.focusInfo && g.player.focusInfo.label;
  T.tap('KeyE');
  const held = g.player.held && g.player.held.type;
  const fm = g.npcById('fishmonger');
  T.step(0.5);
  const fmMode = fm.mode;
  T.tp(-50.5, 33.5, 0);
  T.step(0.1);
  T.tap('KeyE');
  T.step(1.5);
  return { lab, held, fmMode, done: T.done('fishStash'), score: g.score.points };
});
check('steal fish + stash', r.done, JSON.stringify(r));

// 5. bucket head
r = await page.evaluate(() => {
  const g = window.__game;
  const b = g.items.items.find((i) => i.type === 'bucket' && i.owner === 'farmer');
  T.tp(b.pos.x + 0.9, b.pos.z, -Math.PI / 2);
  T.step(0.1);
  T.tap('KeyE');
  const held = g.player.held && g.player.held.type;
  const npc = g.npcById('farmer');
  npc.setMode('routine');
  T.tp(npc.pos.x + 5, npc.pos.z, -Math.PI / 2);
  g.player.aimPoint.set(npc.pos.x - 0.3, 0, npc.pos.z);
  g.player.throwHeld();
  T.step(1.5);
  return { held, mode: npc.mode, done: T.done('bucketHead') };
});
check('bucket on head', r.done, JSON.stringify(r));

// 6. shoji
r = await page.evaluate(() => {
  const g = window.__game;
  const s = g.fixtureByKey('shoji1');
  T.tp(s.pos.x, s.pos.z + 0.9, Math.PI);
  T.step(0.2);
  const lab = g.player.rInfo && g.player.rInfo.label;
  T.hold('KeyR', 1.5);
  return { lab, torn: s.torn, done: T.done('shoji') };
});
check('tear shoji', r.done, JSON.stringify(r));

// 7. vending
r = await page.evaluate(() => {
  const g = window.__game;
  const box = g.fixtureByKey('offering');
  T.tp(box.pos.x + 1.25, box.pos.z, -Math.PI / 2);
  T.step(0.2);
  const lab = g.player.focusInfo && g.player.focusInfo.label;
  T.tap('KeyE');
  T.step(2.0);
  const coin = g.items.items.find((i) => i.type === 'coin' && i.state !== 'gone');
  if (!coin) return { lab, coin: false };
  T.tp(coin.pos.x, coin.pos.z + 0.6, Math.PI);
  T.step(0.1);
  T.tap('KeyE');
  const held = g.player.held && g.player.held.type;
  const v = g.fixtures.find((f) => f.type === 'vending');
  T.tp(v.front.x - 0.2, v.front.z, Math.PI / 2);
  T.step(0.1);
  const lab2 = g.player.focusInfo && g.player.focusInfo.label;
  T.tap('KeyE');
  T.step(2.0);
  return { lab, held, lab2, done: T.done('vending') };
});
check('vending machine', r.done, JSON.stringify(r));

// 8. grandpa out (bark)
r = await page.evaluate(() => {
  const g = window.__game;
  const gp = g.npcById('grandpa');
  gp.stepI = 0; gp.setMode('routine');
  T.step(12);
  const st = [gp.mode, gp.stepPhase, gp.curStep.act];
  T.tp(gp.pos.x - 3, gp.pos.z + 3, 0);
  T.step(0.1);
  T.tap('KeyQ');
  T.step(1.0);
  return { st, mode: gp.mode, done: T.done('grandpaOut') };
});
check('grandpa out', r.done, JSON.stringify(r));

// 9. laundry
r = await page.evaluate(() => {
  const g = window.__game;
  const s = g.items.items.find((i) => i.type === 'shirt');
  T.tp(s.pos.x, s.pos.z + 0.7, Math.PI);
  T.step(0.1);
  const lab = g.player.focusInfo && g.player.focusInfo.label;
  T.tap('KeyE');
  const held = g.player.held && g.player.held.type;
  T.tp(45.5, -7.2, Math.PI);
  g.player.aimPoint.set(45.5, 0, -11.5);
  g.player.throwHeld();
  T.step(2);
  return { lab, held, done: T.done('soakLaundry') };
});
check('laundry wet', r.done, JSON.stringify(r));

// 10. poop step
r = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  p.nature = 100;
  const n = g.npcById('priest');
  n.setMode('routine');
  T.tp(n.pos.x + 3, n.pos.z + 3);
  const pre = [p.state, p.grounded, p.pos.y.toFixed(2), !!p.action, p.nature];
  T.tap('KeyX');
  T.step(2.0);
  const poops = g.poops.length;
  // put the poop right where the priest will walk
  const pp = g.poops[0];
  if (pp) { pp.x = n.pos.x; pp.z = n.pos.z; pp.root.position.set(n.pos.x, 0, n.pos.z); }
  n.setMode('investigate', { x: n.pos.x + 3, z: n.pos.z + 3, dur: 1 });
  T.tp(-30, 30);
  T.step(3);
  return { pre, poops, mode: n.mode, done: T.done('poopStep') };
});
check('poop step', r.done, JSON.stringify(r));

// 11. three chasers
r = await page.evaluate(() => {
  const g = window.__game;
  T.tp(0, -20);
  for (const id of ['fishmonger', 'dango', 'officer']) g.npcById(id).startChase('pest');
  T.step(0.1);
  return { n: g.chasers.size, done: T.done('threeChase') };
});
check('three chasers', r.done, JSON.stringify(r));

// 12. miss bus
r = await page.evaluate(() => {
  const g = window.__game;
  const s = g.npcById('salary');
  const bus = g.bus;
  T.tp(-45, 30);
  for (const n of g.npcs) if (n.mode === 'chase') n.setMode('routine');
  bus.state = 'away'; bus.t = 0.1;
  s.setMode('routine');
  let guard = 0;
  while (bus.state !== 'stopped' && guard++ < 600) T.step(1 / 30);
  const st = bus.state;
  s.interrupt('disgusted', { phase: 'hop' });
  T.step(14);
  return { st, busState: bus.state, sMode: s.mode, done: T.done('missBus') };
});
check('miss bus', r.done, JSON.stringify(r));

// 13. bus boarding normally
r = await page.evaluate(() => {
  const g = window.__game;
  const s = g.npcById('salary');
  const bus = g.bus;
  bus.state = 'away'; bus.t = 0.1; bus.carrying = null; bus.x = 95;
  s.active = true; s.model.root.visible = true; s.pos.set(14.3, 0, 4.9); s.setMode('routine');
  T.step(12);
  return { busState: bus.state, sMode: s.mode, active: s.active };
});
check('salaryman boards bus', r.sMode === 'bus', JSON.stringify(r));

console.log(results.join('\n'));
const tasks = await page.evaluate(() => [...window.__game.tasks.done]);
console.log('done tasks:', tasks.join(', '));
console.log('ERRORS:\n' + h.errors.filter((e) => !e.includes('ERR_FAILED')).join('\n'));
await page.evaluate(() => { window.__game.debugHold = false; });
await h.close();
