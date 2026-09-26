import { open } from './harness.mjs';

const h = await open();
const { page } = h;
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
async function setup(char) {
  await page.evaluate((char) => {
    const g = window.__game;
    g._start({ mode: 'story', char, season: 'spring' });
    g.debugHold = true;
    g.tasks.done.clear();
    const T = (window.T = {
      step(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) { g.update(dt); g.input.endFrame(); } },
      down(c) { g.input.down.add(c); g.input.pressed.add(c); },
      up(c) { g.input.down.delete(c); g.input.released.add(c); },
      tap(c) { T.down(c); T.step(1 / 30); T.up(c); T.step(1 / 30); },
      hold(c, sec) { T.down(c); T.step(sec); T.up(c); T.step(1 / 30); },
      tp(x, z, yaw = 0) { g.player.teleport(x, z, g.world.groundAt(x, z, 5, 10)); g.player.yaw = yaw; g.rig.snap(g.player.pos); },
      done(id) { return g.tasks.done.has(id); },
      face(x, z) { g.player.yaw = Math.atan2(x - g.player.pos.x, z - g.player.pos.z); },
      ev: [],
    });
    g.events.onAny((e) => T.ev.push(e.type));
    T.step(0.5);
  }, char);
}

// ---------------- MONKEY
await setup('monkey');
let r = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  // climb the persimmon tree
  T.tp(-49, -26.2, Math.PI);
  T.face(-49, -27);
  T.tap('Space');
  const s1 = p.state;
  T.step(2.0);
  const s2 = p.state;
  const persimmons = g.items.items.filter((i) => i.type === 'persimmon').length;
  return { s1, s2, y: p.pos.y.toFixed(2), persimmons, shake: T.ev.includes('treeShake') };
});
check('monkey climbs tree + perches + fruit falls', r.s2 === 'perch' && r.shake, JSON.stringify(r));

r = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  // jump down, pick a persimmon, climb back and throw at farmer from above
  T.tap('Space');
  T.step(1.5);
  const s1 = p.state;
  const it = g.items.items.find((i) => i.type === 'persimmon' && i.state === 'rest');
  T.tp(it.pos.x + 0.6, it.pos.z, -Math.PI / 2);
  T.tap('KeyE');
  const held = p.held && p.held.type;
  T.tp(-49, -26.2, Math.PI);
  T.face(-49, -27);
  T.tap('Space');
  T.step(2.0);
  const s2 = p.state;
  const f = g.npcById('farmer');
  f.setMode('routine');
  f.pos.set(-44, 0, -24);
  g.player.aimPoint.set(-44, 0, -24);
  const arc = p.throwArc();
  p.throwHeld();
  T.step(1.2);
  return { s1, held, s2, arc: !!arc, sniper: T.ev.includes('hitNpc'), fmode: f.mode };
});
check('throw from treetop hits farmer', r.sniper, JSON.stringify(r));

r = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  // climb a building wall onto roof (fish shop at x -16..-9, z -31..-22)
  T.tp(-16.6, -14, Math.PI / 2);
  for (const n of g.npcs) n.setMode('routine');
  T.tap('Space');
  const s1 = p.state;
  T.step(2.5);
  const out = { s1, s2: p.state, y: p.pos.y.toFixed(2), unreachable: p.unreachable };
  // walk along roof
  T.down('KeyW');
  T.step(1);
  T.up('KeyW');
  out.y2 = p.pos.y.toFixed(2);
  out.z2 = p.pos.z.toFixed(2);
  return out;
});
check('monkey climbs wall onto roof', parseFloat(r.y) > 2.5, JSON.stringify(r));

r = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  // bathe in onsen
  T.tp(40, -41);
  T.step(4);
  return { st: p.state, done: T.done('snowMonkey') };
});
check('monkey bathes in onsen', r.done, JSON.stringify(r));

r = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  // monkey cannot enter drain
  const d = g.drains[0];
  T.tp(d.pos.x, d.pos.z);
  T.step(0.1);
  const lab = p.focusInfo && p.focusInfo.label;
  T.tap('KeyE');
  return { lab, st: p.state };
});
check('monkey refused by drain', r.st !== 'drain', JSON.stringify(r));

r = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  // torii perch
  T.tp(2.3, -36.2, Math.PI);
  T.face(2.3, -37);
  T.tap('Space');
  T.step(2.5);
  return { st: p.state, y: p.pos.y.toFixed(2), done: T.done('torii') };
});
check('monkey sits on torii', r.st === 'perch', JSON.stringify(r));

r = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  T.tap('Space');
  T.step(1.5);
  // eat food: dango
  const d = g.items.items.find((i) => i.type === 'dango');
  for (const n of g.npcs) n.setMode('routine');
  T.tp(d.pos.x + 1.3, d.pos.z, -Math.PI / 2);
  T.tap('KeyE');
  const held = p.held && p.held.type;
  const nat0 = p.nature;
  T.hold('KeyR', 1.3);
  return { held, ate: T.ev.includes('eat'), nature: [nat0.toFixed(0), p.nature.toFixed(0)] };
});
check('eat dango', r.ate, JSON.stringify(r));

r = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  // officer catches player
  const o = g.npcById('officer');
  T.tp(o.pos.x + 3, o.pos.z);
  g.heat = 2.5;
  o.startChase('pest');
  T.step(4);
  const caught = T.ev.includes('caught');
  T.step(2);
  return { caught, st: p.state, pos: [p.pos.x.toFixed(1), p.pos.z.toFixed(1)], heat: g.heat };
});
check('officer catches → hideout', r.caught, JSON.stringify(r));

r = await page.evaluate(() => {
  const g = window.__game;
  // NPC retrieves displaced item
  const cup = g.items.items.find((i) => i.type === 'teaCup');
  const f = g.npcById('farmer');
  for (const n of g.npcs) n.setMode('routine');
  cup.pos.set(-48, 0, -14);
  cup.state = 'rest';
  cup.mesh.position.copy(cup.pos);
  cup.lastDisplaced = 0;
  f.pos.set(-47, 0, -16);
  f.yaw = 0;
  T.tp(-30, 30);
  T.step(0.8);
  const m1 = f.mode;
  T.step(15);
  return { m1, m2: f.mode, home: cup.atHome(), st: cup.state };
});
check('farmer retrieves tea cup', r.home, JSON.stringify(r));

// ---------------- RACCOON
await setup('raccoon');
r = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  const d = g.drains.find((x) => x.spec.key === 'hideout');
  T.tp(d.pos.x, d.pos.z);
  T.step(0.1);
  const lab = p.focusInfo && p.focusInfo.label;
  T.tap('KeyE');
  const st = p.state;
  const open = g.ui.drainOpen;
  T.tap('Digit1');
  T.step(0.5);
  return { lab, st, open, st2: p.state, pos: [p.pos.x.toFixed(1), p.pos.z.toFixed(1)], done: T.done('drains') };
});
check('raccoon drain travel', r.done, JSON.stringify(r));

r = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  const bin = g.fixtures.find((f) => f.type === 'trash');
  T.tp(bin.pos.x + 0.9, bin.pos.z, -Math.PI / 2);
  T.step(0.1);
  const lab = p.focusInfo && p.focusInfo.label;
  T.tap('KeyE');
  T.step(1.5);
  return { lab, tipped: !bin.upright, rummaged: T.ev.includes('rummage') };
});
check('raccoon rummages bin', r.rummaged, JSON.stringify(r));

r = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  // wash a thing in the paddy
  const it = g.items.items.find((i) => i.type === 'pebble');
  T.tp(it.pos.x + 0.5, it.pos.z, -Math.PI / 2);
  T.tap('KeyE');
  const held = p.held && p.held.type;
  T.tp(-36, 12);
  T.step(0.3);
  const inWater = !!p.inWater;
  T.hold('KeyR', 1.5);
  return { held, inWater, done: T.done('wash') };
});
check('raccoon washes item', r.done, JSON.stringify(r));

r = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  p.dropHeld();
  // squeeze through the onsen fence gap (x=54, z=-42.4) from outside (east)
  T.tp(55.2, -42.4, -Math.PI / 2);
  T.down('KeyA');
  T.step(1.2);
  T.up('KeyA');
  return { x: p.pos.x.toFixed(2) };
});
check('raccoon squeezes through fence gap', parseFloat(r.x) < 53.5, JSON.stringify(r));

r = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  // raccoon can't climb walls
  T.tp(-16.6, -14, Math.PI / 2);
  T.tap('Space');
  T.step(1.5);
  return { st: p.state, y: p.pos.y.toFixed(2) };
});
check('raccoon cannot climb walls', parseFloat(r.y) < 1.5, JSON.stringify(r));

r = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  // drag golden cat
  const cat = g.items.items.find((i) => i.type === 'goldCat');
  for (const n of g.npcs) n.setMode('routine');
  T.tp(cat.pos.x + 1.1, cat.pos.z, -Math.PI / 2);
  T.step(0.1);
  const lab = p.focusInfo && p.focusInfo.label;
  T.tap('KeyE');
  const held = p.held && p.held.type;
  const x0 = cat.pos.x;
  T.down('KeyD');
  T.step(1.5);
  T.up('KeyD');
  return { lab, held, moved: (cat.pos.x - x0).toFixed(2), chasers: g.chasers.size };
});
check('drag golden cat', parseFloat(r.moved) > 1, JSON.stringify(r));

r = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  p.dropHeld();
  for (const n of g.npcs) n.setMode('routine');
  // hiss scares grandma
  const gm = g.npcById('grandma');
  T.tp(gm.pos.x + 2, gm.pos.z + 2);
  T.face(gm.pos.x, gm.pos.z);
  gm.yaw = Math.atan2(p.pos.x - gm.pos.x, p.pos.z - gm.pos.z);
  T.tap('KeyQ');
  T.step(0.3);
  return { mode: gm.mode };
});
check('raccoon hiss scares', r.mode === 'fear', JSON.stringify(r));

console.log(results.join('\n'));
console.log('ERRORS:\n' + h.errors.filter((e) => !e.includes('ERR_FAILED')).join('\n'));
await h.close();
