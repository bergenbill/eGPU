import { open } from './harness.mjs';
const h = await open({ width: 1280, height: 800 });
const { page } = h;
const log = (...a) => console.log(...a);
await h.wait(800);
// title buttons
await page.click('button[data-act="help"]');
await h.wait(300);
await h.shot('ui-help');
await page.click('#screen-help button[data-act="close"]');
await page.click('button[data-act="collection"]');
await h.wait(300);
await h.shot('ui-collection');
await page.click('#screen-collection button[data-act="close"]');
await page.click('button[data-act="settings"]');
await h.wait(300);
await h.shot('ui-settings');
await page.click('#screen-settings button[data-act="close"]');
await page.click('button[data-act="rush"]');
await h.wait(300);
await h.shot('ui-select');
// pick raccoon
await page.click('.charcard:nth-child(2)');
await page.click('button[data-act="go"]');
await page.waitForFunction(() => window.__game.player && window.__game.mode === 'rush', null, { timeout: 30000 });
await h.wait(500);
const audioOK = await page.evaluate(() => !!(window.__game.audio.ctx && window.__game.music.ready));
log('audio ready', audioOK);
// play some actions via real keys (slow frames but okay)
await page.evaluate(() => {
  const g = window.__game;
  g.debugHold = true;
  window.step = (s) => { for (let t = 0; t < s; t += 1 / 30) { g.update(1 / 30); g.input.endFrame(); } };
  const T = (window.T = {
    down(c) { g.input.down.add(c); g.input.pressed.add(c); },
    up(c) { g.input.down.delete(c); g.input.released.add(c); },
    tap(c) { T.down(c); window.step(1 / 30); T.up(c); window.step(1 / 30); },
  });
  // bark, grab, throw, sounds
  T.tap('KeyQ');
  window.step(1);
  const peb = g.items.items.find((i) => i.type === 'pebble');
  g.player.teleport(peb.pos.x + 0.5, peb.pos.z);
  g.player.yaw = -Math.PI / 2;
  T.tap('KeyE');
  g.player.aimPoint.set(g.player.pos.x + 5, 0, g.player.pos.z);
  g.player.throwHeld();
  window.step(2);
  // music moods
  const n = g.npcById('fishmonger');
  g.player.teleport(n.pos.x + 3, n.pos.z);
  n.startChase('pest');
  window.step(3);
  g.player.nature = 100;
  T.tap('KeyX');
  window.step(2);
});
await page.keyboard.press('Escape');
await page.evaluate(() => { window.__game.debugHold = false; });
await h.wait(600);
await h.shot('ui-pause');
log('pause screen:', await page.evaluate(() => window.__game.ui.current));
await page.click('#screen-pause button[data-act="resume"]');
await h.wait(300);
// fast-forward rush to the end
await page.evaluate(() => {
  const g = window.__game;
  g.debugHold = true;
  g.score.points = 9100;
  g.timeLeft = 1;
  window.step(5);
  g.debugHold = false;
});
await h.wait(1500);
await h.shot('ui-results');
const res = await page.evaluate(() => ({ cur: window.__game.ui.current, best: window.__game.save.best.rush, hats: window.__game.save.hats.unlocked }));
log(JSON.stringify(res));
await page.click('#screen-results button[data-act="quit"]');
await h.wait(1500);
log('after quit:', await page.evaluate(() => [window.__game.mode, window.__game.ui.current]));
await page.click('button[data-act="story"]');
await page.click('button[data-act="go"]');
await page.waitForFunction(() => window.__game.player && window.__game.mode === 'story', null, { timeout: 30000 });
await h.wait(1000);
await page.keyboard.press('Tab');
await page.keyboard.press('KeyH');
await h.wait(800);
await h.shot('ui-story-hint');
console.log('ERRORS:\n' + h.errors.filter((e) => !e.includes('ERR_FAILED')).join('\n'));
await h.close();
