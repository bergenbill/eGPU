import { Game } from './game/game.js';

// Boot: build the title-screen town, then run the loop.
const canvas = document.getElementById('game');
const game = new Game(canvas);
window.__game = game;

function boot() {
  try {
    game.titleWorld();
  } catch (e) {
    console.error(e);
    document.getElementById('loading').innerHTML = `<div class="titlewrap"><div class="subtitle">Something went wrong loading the town:<br>${e.message}</div></div>`;
    return;
  }
  document.getElementById('loading').classList.remove('show');
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    try {
      if (!game.debugHold) game.update(dt);
      game.render();
    } catch (e) {
      console.error(e);
    }
    game.input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// give the loading screen a frame to paint
requestAnimationFrame(() => setTimeout(boot, 30));
