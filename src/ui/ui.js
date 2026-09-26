import * as THREE from 'three';
import { CHARACTERS, HATS } from '../game/characters.js';
import { TASKS, MAIN_CARD, FINALE, FINALE_UNLOCK } from '../game/tasks.js';
import { ITEM_DEFS } from '../world/itemDefs.js';
import { SEASONS } from '../world/palette.js';
import { fmtClock, fmtTime, clamp } from '../core/math.js';
import { dateKey } from '../core/rng.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const KEYNAMES = { E: 'E', R: 'R', X: 'X', Q: 'Q', F: 'F', Space: 'Space', RMB: '🖱 R', LMB: '🖱 L' };

export class UI {
  constructor(g) {
    this.g = g;
    this.floaters = [];
    this.npcEls = new Map();
    this.toastEls = [];
    this.screenStack = [];
    this.lastPrompt = '';
    this.v = new THREE.Vector3();
    this.selChar = 'monkey';
    this.selSeason = 'autumn';
    this.mapBig = false;
    this.bindButtons();
    this.buildHelp();
  }

  // ------------------------------------------------------------------ screens
  show(name) {
    for (const el of document.querySelectorAll('.screen')) el.classList.remove('show');
    if (name) $('screen-' + name).classList.add('show');
    this.current = name;
  }
  overlay(name) {
    // open a screen on top of the current one, remembering where to go back
    this.screenStack.push(this.current);
    this.show(name);
  }
  back() {
    const prev = this.screenStack.pop();
    this.show(prev || null);
  }

  bindButtons() {
    const g = this.g;
    document.body.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      g.audio.init();
      g.audio.sfx('ui', null, 1);
      const act = b.dataset.act;
      switch (act) {
        case 'story':
        case 'rush':
        case 'daily':
          this.pendingMode = act;
          this.buildSelect(act);
          this.show('select');
          break;
        case 'help':
          this.overlay('help');
          break;
        case 'collection':
          this.buildCollection();
          this.overlay('collection');
          break;
        case 'settings':
          this.buildSettings();
          this.overlay('settings');
          break;
        case 'close':
          this.back();
          break;
        case 'back':
          this.show('title');
          break;
        case 'go':
          g.startGame({ mode: this.pendingMode, char: this.selChar, season: this.selSeason });
          break;
        case 'resume':
          g.setPaused(false);
          break;
        case 'restart':
          g.setPaused(false);
          g.restart();
          break;
        case 'quit':
          g.quitToTitle();
          break;
        case 'again':
          g.restart();
          break;
        default:
          break;
      }
    });
    $('card').addEventListener('click', (e) => {
      const t = e.target.closest('.task');
      if (t) t.classList.toggle('showhint');
    });
    $('mapwrap').addEventListener('click', () => this.toggleMap());
    $('fortune').addEventListener('click', () => this.closeFortune());
  }

  titleScreen() {
    const s = this.g.save;
    const lines = [];
    const sm = s.story.monkey.done.length;
    const sr = s.story.raccoon.done.length;
    lines.push(`🐒 Kiki: ${sm}/${MAIN_CARD.length + 1} stamps · best rush ${s.best.rush.monkey.toLocaleString()}`);
    lines.push(`🦝 Doro: ${sr}/${MAIN_CARD.length + 1} stamps · best rush ${s.best.rush.raccoon.toLocaleString()}`);
    const today = s.best.daily[dateKey()];
    $('dailyLabel').textContent = today ? `Today's best: ${today.toLocaleString()} — can you beat it?` : `New challenge every day · ${dateKey()}`;
    const found = Object.keys(s.collection).length;
    lines.push(`🎒 Collection: ${found}/${Object.keys(ITEM_DEFS).length} treasures found`);
    $('titleBest').innerHTML = lines.join('<br>');
    this.show('title');
  }

  buildSelect(mode) {
    const g = this.g;
    const s = g.save;
    $('selectTitle').textContent = mode === 'story' ? 'Mischief Card — choose your troublemaker' : mode === 'rush' ? 'Mayhem Rush — choose your troublemaker' : `Daily Mischief (${dateKey()})`;
    const wrap = $('charCards');
    wrap.innerHTML = '';
    for (const id of ['monkey', 'raccoon']) {
      const c = CHARACTERS[id];
      const el = document.createElement('div');
      el.className = 'charcard' + (this.selChar === id ? ' sel' : '');
      const stat = (k, label) => `<div class="stat"><span>${label}</span><span class="bar">${[1, 2, 3, 4, 5].map((i) => `<span class="pip ${i <= c.stats[k] ? 'on' : ''}"></span>`).join('')}</span></div>`;
      const prog = mode === 'story' ? `<div class="sp" style="margin-top:6px">Card progress: ${s.story[id].done.length}/${MAIN_CARD.length + 1} · Bonus: ${s.story[id].bonus.length}</div>` : `<div class="sp" style="margin-top:6px">Best Mayhem Rush: ${s.best.rush[id].toLocaleString()}</div>`;
      el.innerHTML = `<div class="head"><span class="emoji">${id === 'monkey' ? '🐒' : '🦝'}</span><span class="nm">${c.name}</span><span class="sp">${c.species} · ${c.jp}</span></div>
        <div class="tag">${c.tagline}</div>
        ${stat('speed', 'Speed')}${stat('climb', 'Climbing')}${stat('throw', 'Throwing')}${stat('stealth', 'Stealth')}${stat('tear', 'Tearing')}${stat('strength', 'Strength')}
        <ul class="perks">${c.perks.map((p) => `<li class="good">${p}</li>`).join('')}${c.flaws.map((p) => `<li class="bad">${p}</li>`).join('')}</ul>${prog}`;
      el.addEventListener('click', () => {
        this.selChar = id;
        g.audio.init();
        g.audio.sfx('ui', null, 1);
        this.buildSelect(mode);
      });
      wrap.appendChild(el);
    }
    const opts = $('selectOptions');
    const hats = s.hats.unlocked;
    const eq = s.hats.equipped[this.selChar] || 'none';
    let html = `<div class="opt"><b>Hat:</b> ${hats.map((h) => `<button data-hat="${h}" class="${h === eq ? 'sel' : ''}">${HATS[h] ? HATS[h].name : h}</button>`).join('')}</div>`;
    if (mode === 'story') {
      html += `<div class="opt"><b>Season:</b> ${Object.values(SEASONS).map((se) => `<button data-season="${se.id}" class="${se.id === this.selSeason ? 'sel' : ''}">${se.jp} ${se.name}</button>`).join('')}</div>`;
    } else if (mode === 'rush') {
      html += `<div class="opt">A random season, random tasks, 5 minutes. Clear a card for +45 seconds!</div>`;
    } else {
      html += `<div class="opt">Everyone gets the same season &amp; tasks today. One day, one high score.</div>`;
    }
    opts.innerHTML = html;
    for (const b of opts.querySelectorAll('button[data-hat]')) {
      b.addEventListener('click', () => {
        s.hats.equipped[this.selChar] = b.dataset.hat;
        g.persist();
        this.buildSelect(mode);
      });
    }
    for (const b of opts.querySelectorAll('button[data-season]')) {
      b.addEventListener('click', () => {
        this.selSeason = b.dataset.season;
        this.buildSelect(mode);
      });
    }
  }

  buildHelp() {
    const k = (s) => s.split(' ').map((x) => `<span class="key">${x}</span>`).join(' ');
    const rows = [
      ['Move', k('W A S D') + ' / arrows'],
      ['Run', k('Shift')],
      ['Sneak (quiet)', k('C') + ' or ' + k('Ctrl')],
      ['Jump / Climb', k('Space') + ' (into a tree, wall, pole)'],
      ['Grab / Drop / Use', k('E') + ' or left-click'],
      ['Aim & throw', 'hold right-click, release (or ' + k('F') + ')'],
      ['Bark!', k('Q')],
      ['Tear · Eat · Wash', 'hold ' + k('R')],
      ["Nature's call", k('X') + ' when the 🍃 meter is full'],
      ['Camera', 'scroll = zoom, ' + k('[') + ' ' + k(']') + ' = rotate'],
      ['Card · Hint · Map', k('Tab') + ' ' + k('H') + ' ' + k('M')],
      ['Pause', k('Esc') + ' or ' + k('P')],
    ];
    const ctl = rows.map(([a, b]) => `<div class="k">${a}</div><div>${b}</div>`).join('');
    $('helpBody').innerHTML = `<div class="helpgrid"><div><h3>Controls</h3><div class="ctl">${ctl}</div>
      <p style="font-size:12.5px;color:#6b5a4a">On a Mac trackpad, two-finger click (or Ctrl-click) is right-click.</p></div>
      <div class="tips"><h3>Being a menace</h3><ul>
      <li><b>Your Mischief Card</b> (top-left) lists things to do. Click a task — or press <span class="key">H</span> — for a hint. Finish tasks to earn red stamps.</li>
      <li><b>Townsfolk</b> have routines. A <b style="color:#d99a1c">?</b> means they're getting suspicious; <b style="color:#c9412f">!</b> means they've seen you.</li>
      <li>Grab something that belongs to someone and they'll <b>chase you</b>. Outrun them, climb out of reach, hide in a <b>bush</b>, or (Doro) dive down a <b>drain</b>.</li>
      <li><b>Throwing</b> things makes noise where they land — perfect for luring people away.</li>
      <li>The more people <b>see</b> you misbehave, the higher the <b>Town Alert</b> 🐾 — and the police officer starts hunting you. Lie low (or soak in the hot spring) to calm things down.</li>
      <li>Chain mischief quickly for <b>combos</b>. Stash stolen things in your <b>hideout</b> (far south-west) — nobody can take them back from there, and new treasures go in your <b>Collection</b>.</li>
      <li>Nature calls every so often (🍃). A well-placed "present" on someone's daily path is a classic. There's also a restroom in the park, if you're feeling civilized.</li>
      <li><b>Kiki</b> and <b>Doro</b> play very differently — many tasks have more than one solution, so try both!</li>
      </ul></div></div>`;
    $('controlsOverlay').innerHTML = `<h3 style="margin:0 0 8px;font-family:var(--brush)">Controls</h3><div class="ctl">${ctl}</div>`;
  }

  buildCollection() {
    const s = this.g.save;
    const hatHtml = Object.entries(HATS)
      .map(([id, h]) => `<div class="colitem ${s.hats.unlocked.includes(id) ? '' : 'no'}">${s.hats.unlocked.includes(id) ? '🎩' : '🔒'} ${h.name}<br><span style="font-weight:500;font-size:11.5px">${h.unlock}</span></div>`)
      .join('');
    const items = Object.entries(ITEM_DEFS)
      .map(([id, d]) => {
        const n = s.collection[id] || 0;
        return `<div class="colitem ${n ? '' : 'no'} ${d.rare ? 'rare' : ''}">${n ? d.name : d.rare ? '??? (rare)' : '???'}${n ? `<span class="n">×${n}</span>` : ''}</div>`;
      })
      .join('');
    const st = s.stats;
    $('collectionBody').innerHTML = `<h3>Hats</h3><div class="hatrow">${hatHtml}</div>
      <h3>Treasures stashed in your hideout (${Object.keys(s.collection).length}/${Object.keys(ITEM_DEFS).length})</h3><div class="colgrid">${items}</div>
      <h3>Lifetime stats</h3><div style="font-size:14px">Days of mischief: <b>${st.days}</b> · Things stolen: <b>${st.stolen}</b> · Chases: <b>${st.chases}</b> · Times caught: <b>${st.caught}</b> · Barks: <b>${st.barks}</b> · Best combo: <b>×${st.bestCombo}</b> · Nature calls answered: <b>${st.poops}</b></div>`;
  }

  buildSettings() {
    const g = this.g;
    const s = g.save.settings;
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-set="${key}" data-val="${v}" class="${String(s[key]) === String(v) ? 'sel' : ''}">${l}</button>`).join('')}</div>`;
    $('settingsBody').innerHTML = `
      <div class="setrow"><span>Music</span><input type="range" min="0" max="1" step="0.05" value="${s.music}" id="setMusic"></div>
      <div class="setrow"><span>Sound effects</span><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" id="setSfx"></div>
      <div class="setrow"><span>Townsfolk</span>${seg('difficulty', [['chill', 'Chill'], ['normal', 'Normal'], ['sharp', 'Sharp-eyed']])}</div>
      <div class="setrow"><span>Hint nudges</span>${seg('hints', [[true, 'On'], [false, 'Off']])}</div>
      <div class="setrow"><span>Screen shake</span>${seg('shake', [[true, 'On'], [false, 'Off']])}</div>
      <div class="setrow"><span>Progress</span><div><button id="resetSave">Reset all progress</button></div></div>
      <div style="font-size:12px;color:#6b5a4a">"Chill" townsfolk see less and tire sooner. "Sharp-eyed" ones are harder to fool (difficulty applies from the next day you start).</div>`;
    $('setMusic').addEventListener('input', (e) => {
      s.music = +e.target.value;
      g.audio.setVolumes(s.music, s.sfx);
      g.persist();
    });
    $('setSfx').addEventListener('input', (e) => {
      s.sfx = +e.target.value;
      g.audio.setVolumes(s.music, s.sfx);
      g.persist();
    });
    for (const b of $('settingsBody').querySelectorAll('button[data-set]')) {
      b.addEventListener('click', () => {
        let v = b.dataset.val;
        if (v === 'true') v = true;
        else if (v === 'false') v = false;
        s[b.dataset.set] = v;
        g.persist();
        this.buildSettings();
      });
    }
    const rb = $('resetSave');
    rb.addEventListener('click', () => {
      if (rb.dataset.armed) {
        g.resetProgress();
        this.buildSettings();
        this.toastTitle('All progress erased. A fresh start!');
        return;
      }
      rb.dataset.armed = '1';
      rb.textContent = 'Click again to erase everything';
      rb.classList.add('primary');
      setTimeout(() => {
        if (!rb.isConnected) return;
        delete rb.dataset.armed;
        rb.textContent = 'Reset all progress';
        rb.classList.remove('primary');
      }, 4000);
    });
  }

  toastTitle(msg) {
    const el = $('settingsBody');
    const note = document.createElement('div');
    note.style.cssText = 'font-weight:900;color:var(--green);margin-top:8px';
    note.textContent = msg;
    el.appendChild(note);
  }

  // ------------------------------------------------------------------ HUD
  showHUD(on) {
    $('hud').classList.toggle('hidden', !on);
  }

  buildCard() {
    const g = this.g;
    const tm = g.tasks;
    if (!tm) return;
    const el = $('card');
    if (this.cardView === undefined || this.cardView >= tm.cards.length) this.cardView = 0;
    let html = '';
    if (tm.cards.length > 1) {
      html += '<div class="tabs">';
      tm.cards.forEach((c, i) => {
        const tot = c.tasks.filter((t) => tm.isVisible(t)).length;
        const dn = c.tasks.filter((t) => tm.done.has(t)).length;
        html += `<span class="tab ${i === this.cardView ? 'on' : ''}" data-tab="${i}" id="tab-${c.id}">${c.title.replace(' Card', '')} ${dn}/${tot}</span>`;
      });
      html += '<span class="tabhint">Tab ⇄</span></div>';
    }
    const c = tm.cards[this.cardView];
    html += `<div class="ch"><span class="t">${c.title}</span><span class="jp">${c.jp}</span></div>`;
    for (const id of c.tasks) {
      const t = TASKS[id];
      const done = tm.done.has(id);
      if (!tm.isVisible(id)) {
        const need = FINALE_UNLOCK - tm.mainDoneCount();
        html += `<div class="task locked"><span class="box"></span><span class="txt">??? (${need} more stamp${need === 1 ? '' : 's'} to reveal)</span></div>`;
        continue;
      }
      const pr = tm.progress(id);
      const cnt = pr && !done ? `<span class="cnt" id="cnt-${id}">${pr.n}/${pr.of}</span>` : '';
      const tag = t.char ? `<span class="chtag">${t.char === 'monkey' ? 'Kiki' : 'Doro'}</span>` : '';
      html += `<div class="task ${done ? 'done' : ''}" id="task-${id}">${done ? '<span class="hanko">済</span>' : '<span class="box"></span>'}<div class="txt">${esc(t.title)}${tag}${cnt}${id === FINALE ? ' ★' : ''}<div class="h">💡 ${esc(t.hint)}</div></div></div>`;
    }
    if (g.mode === 'story') {
      html += `<div class="foot">${c.id === 'main' ? 'Stamp 9 tasks to reveal the final one. ' : 'Optional extras — just for bragging rights. '}Click a task for a hint.</div>`;
    } else {
      html += `<div class="foot">Clear the card for +45s · click a task for a hint</div>`;
    }
    el.innerHTML = html;
    for (const tb of el.querySelectorAll('.tab')) {
      tb.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cardView = +tb.dataset.tab;
        this.buildCard();
      });
    }
  }

  toggleCard() {
    const card = $('card');
    const n = this.g.tasks ? this.g.tasks.cards.length : 1;
    if (card.classList.contains('collapsed')) {
      card.classList.remove('collapsed');
      this.cardView = 0;
    } else if (this.cardView < n - 1) {
      this.cardView++;
    } else {
      card.classList.add('collapsed');
    }
    this.buildCard();
  }

  showHint() {
    const g = this.g;
    const act = g.tasks.activeTasks();
    const shown = document.querySelectorAll('.task.showhint');
    if (shown.length) {
      for (const s of shown) s.classList.remove('showhint');
      return;
    }
    // first unfinished task on the card being viewed
    const view = g.tasks.cards[this.cardView || 0];
    const id = (view && view.tasks.find((t) => act.includes(t))) || act[0];
    if (!id) return;
    const el = $('task-' + id);
    if (el) el.classList.add('showhint');
    $('card').classList.remove('collapsed');
  }

  stamp(id) {
    const t = TASKS[id];
    const tm = this.g.tasks;
    const ci = tm.cards.findIndex((c) => c.tasks.includes(id));
    if (ci >= 0) this.cardView = ci;
    $('card').classList.remove('collapsed');
    this.buildCard();
    const el = $('task-' + id);
    if (el) {
      el.classList.add('flash');
      const h = el.querySelector('.hanko');
      if (h) h.classList.add('anim');
    }
    this.bigText('済', t.title, true);
  }

  taskProgress(id, n, of) {
    const el = $('cnt-' + id);
    if (el) el.textContent = `${n}/${of}`;
    if (n < of) this.toast(`${TASKS[id].title}: ${n}/${of}`, 'info', 2600, 'prog-' + id);
  }

  toast(msg, type = 'info', dur = 3200, key = null) {
    const box = $('toasts');
    let el = key ? box.querySelector(`[data-key="${key}"]`) : null;
    if (el) {
      clearTimeout(el._t1);
      clearTimeout(el._t2);
      el.classList.remove('out');
    } else {
      el = document.createElement('div');
      if (key) el.dataset.key = key;
      box.appendChild(el);
    }
    el.className = 'toast ' + type;
    el.textContent = msg;
    while (box.children.length > 4) box.removeChild(box.firstChild);
    el._t1 = setTimeout(() => el.classList.add('out'), dur);
    el._t2 = setTimeout(() => el.remove(), dur + 450);
  }

  bigText(text, sub, stamp) {
    const el = document.createElement('div');
    el.className = 'big-pop';
    el.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    if (stamp) el.style.fontSize = '64px';
    const box = $('bigtext');
    box.innerHTML = '';
    box.appendChild(el);
    setTimeout(() => el.remove(), 2300);
  }

  floatText(pos, text, label, combo) {
    const el = document.createElement('div');
    el.className = 'floater' + (combo > 1 ? ' combo' : '');
    el.innerHTML = `${esc(text)}${combo > 1 ? ` <span style="font-size:15px">×${Math.min(4, 1 + (combo - 1) * 0.25)}</span>` : ''}<small>${esc(label || '')}</small>`;
    $('world').appendChild(el);
    this.floaters.push({ el, pos: { x: pos.x, y: (pos.y || 0) + 1.2, z: pos.z }, t: 0 });
  }

  barkText(pos, jp, en) {
    const el = document.createElement('div');
    el.className = 'floater barkfx';
    el.innerHTML = `${esc(jp)}<small>${esc(en)}</small>`;
    $('world').appendChild(el);
    this.floaters.push({ el, pos: { x: pos.x + 0.3, y: pos.y + 0.6, z: pos.z }, t: 0.6 });
  }

  fortune(f) {
    $('fortuneKanji').textContent = f[0];
    $('fortuneEn').textContent = f[1];
    $('fortuneText').textContent = f[2];
    $('fortune').classList.remove('hidden');
    this.fortuneT = 0;
  }
  closeFortune() {
    $('fortune').classList.add('hidden');
  }
  get fortuneOpen() {
    return !$('fortune').classList.contains('hidden');
  }

  openDrainMenu(from, drains, onPick) {
    const list = $('drainList');
    list.innerHTML = '';
    this.drainPick = onPick;
    this.drainOptions = drains.filter((d) => d !== from);
    this.drainOptions.forEach((d, i) => {
      const b = document.createElement('button');
      b.innerHTML = `<span class="key">${i + 1}</span> ${esc(d.name)}`;
      b.addEventListener('click', () => onPick(d));
      list.appendChild(b);
    });
    $('drainMenu').classList.remove('hidden');
  }
  closeDrainMenu() {
    $('drainMenu').classList.add('hidden');
    this.drainPick = null;
  }
  get drainOpen() {
    return !$('drainMenu').classList.contains('hidden');
  }

  toggleMap() {
    this.mapBig = !this.mapBig;
    $('mapwrap').classList.toggle('big', this.mapBig);
  }

  toggleControls() {
    $('controlsOverlay').classList.toggle('hidden');
  }

  fade(on) {
    $('fade').classList.toggle('on', on);
  }

  // ------------------------------------------------------------------ per-frame
  project(x, y, z) {
    const v = this.v.set(x, y, z).project(this.g.camera);
    const w = window.innerWidth;
    const h = window.innerHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, vis: v.z < 1 && v.x > -1.2 && v.x < 1.2 && v.y > -1.2 && v.y < 1.2 };
  }

  update(dt) {
    const g = this.g;
    const p = g.player;
    if (!p) return;
    // floaters
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      const s = this.project(f.pos.x, f.pos.y + f.t * 1.2, f.pos.z);
      f.el.style.left = s.x + 'px';
      f.el.style.top = s.y + 'px';
      f.el.style.opacity = String(clamp(1.6 - f.t, 0, 1));
      if (f.t > 1.6) {
        f.el.remove();
        this.floaters.splice(i, 1);
      }
    }
    // townsfolk bubbles and icons
    for (const n of g.npcs) {
      let rec = this.npcEls.get(n);
      if (!rec) {
        const b = document.createElement('div');
        b.className = 'bubble';
        const ic = document.createElement('div');
        ic.className = 'npcicon';
        $('world').appendChild(b);
        $('world').appendChild(ic);
        rec = { b, ic, text: '', icon: '' };
        this.npcEls.set(n, rec);
      }
      const top = n.pos.y + n.height + (n.mode === 'routine' && n.curStep?.bath && n.stepPhase === 'do' ? -1.0 : 0.15);
      const s = this.project(n.pos.x, top, n.pos.z);
      const dist = Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z);
      const showB = n.active && n.bubble && s.vis && dist < 30;
      if (showB) {
        if (rec.text !== n.bubble) {
          rec.b.textContent = n.bubble;
          rec.text = n.bubble;
        }
        rec.b.style.display = 'block';
        rec.b.style.left = s.x + 'px';
        rec.b.style.top = s.y - 34 + 'px';
      } else rec.b.style.display = 'none';
      let icon = n.icon;
      if (!icon && n.awareness > 0.2 && n.mode !== 'chase') icon = '?';
      if (n.mode === 'chase') icon = '!';
      const showI = n.active && icon && s.vis && dist < 32;
      if (showI) {
        if (rec.icon !== icon) {
          rec.ic.textContent = icon;
          rec.ic.className = 'npcicon' + (icon === '?' ? ' q' : icon === 'Zzz' ? ' z' : '');
          rec.icon = icon;
        }
        rec.ic.style.display = 'block';
        rec.ic.style.left = s.x + 'px';
        rec.ic.style.top = s.y + 'px';
        const sc = icon === '?' && n.mode !== 'chase' ? 0.6 + Math.min(1, n.awareness) * 0.6 : 1;
        rec.ic.style.transform = `translate(-50%,-100%) scale(${sc})`;
      } else rec.ic.style.display = 'none';
    }

    // score / combo
    const sc = g.score;
    $('scoreVal').textContent = sc.points.toLocaleString();
    const cb = $('combo');
    if (sc.combo > 1) {
      cb.innerHTML = `COMBO ×${sc.mult.toFixed(2).replace(/\.?0+$/, '')} (${sc.combo})<div class="bar" style="width:${(sc.comboT / 5) * 100}%"></div>`;
    } else cb.innerHTML = '';
    $('clock').textContent = `${g.season.jp} ${fmtClock(g.clock)}`;
    $('timer').textContent = g.mode !== 'story' ? fmtTime(g.timeLeft) : '';
    // heat
    const paws = document.querySelectorAll('#heat .paw');
    paws.forEach((el, i) => el.style.setProperty('--fill', clamp((g.heat - i) * 100, 0, 100) + '%'));
    $('heatLabel').textContent = g.heat >= 2.8 ? 'MAYHEM! Police on patrol' : g.heat >= 2 ? 'On alert' : g.heat >= 1 ? 'Wary' : 'Calm';
    const ch = g.chasers.size;
    $('chasers').textContent = ch ? `🏃 ${ch} chasing you!` : '';
    // nature
    $('natureFill').style.width = p.nature + '%';
    $('naturebox').classList.toggle('urgent', p.nature >= 100);
    // held
    const held = $('held');
    if (p.held) {
      held.classList.remove('hidden');
      held.textContent = `Holding: ${p.held.name}${p.held.washed ? ' ✨' : ''}`;
    } else held.classList.add('hidden');
    // prompts
    this.updatePrompts();
    // action ring
    const ring = $('ring');
    if (p.action && p.action.dur > 0.2) {
      const s = this.project(p.pos.x, p.pos.y + 1.4, p.pos.z);
      ring.style.display = 'block';
      ring.style.left = s.x + 'px';
      ring.style.top = s.y + 'px';
      $('ringFg').style.strokeDashoffset = String(100.5 * (1 - p.action.t / p.action.dur));
    } else ring.style.display = 'none';
    // zone name
    const z = g.world.zoneAt(p.pos.x, p.pos.z);
    const zn = z ? z.label : 'Momiji-chō';
    if (zn !== this.lastZone) {
      this.lastZone = zn;
      $('zoneName').textContent = zn;
    }
    this.drawMap();
    if (this.fortuneOpen) this.fortuneT = (this.fortuneT || 0) + dt;
  }

  updatePrompts() {
    const g = this.g;
    const p = g.player;
    const out = [];
    const key = (k) => `<span class="key">${k}</span>`;
    if (p.state === 'climb') out.push([key('S'), 'Climb down'], [key('Space'), 'Leap off']);
    else if (p.state === 'perch') out.push([key('Space'), 'Jump down'], [key('S'), 'Climb down']);
    else if (p.state === 'bathe') out.push([key('WASD'), 'Get out']);
    if (p.focusInfo && p.state !== 'drain') {
      const fi = p.focusInfo;
      out.push([key('E'), fi.label]);
    }
    if (p.rInfo) out.push([key('R'), 'Hold: ' + p.rInfo.label]);
    if (p.held && p.held.canThrow && !p.aiming) out.push([key('🖱R'), 'Aim & throw']);
    if (p.aiming) out.push([key('🖱R'), 'Release to throw']);
    if (p.state === 'move' && p.grounded && !p.held) {
      const cl = p.canClimbAhead && p.canClimbAhead();
      if (cl) out.push([key('Space'), 'Climb']);
    }
    let warn = false;
    if (p.nature >= 100) {
      out.push([key('X'), "Nature's calling! Find a good spot"]);
      warn = true;
    } else if (p.nature >= 60 && p.nature < 100 && g.player.state === 'move') {
      out.push([key('X'), 'Answer nature\'s call']);
    }
    const html = out.map(([k, l], i) => `<div class="prompt ${warn && i === out.length - 1 ? 'warn' : ''}">${k}${esc(l)}</div>`).join('');
    if (html !== this.lastPrompt) {
      $('prompts').innerHTML = html;
      this.lastPrompt = html;
    }
  }

  // ------------------------------------------------------------------ minimap
  buildMapBase() {
    const g = this.g;
    const W = 240;
    const H = 212;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    const b = g.world.bounds;
    const sx = W / (b.maxX - b.minX);
    const sz = H / (b.maxZ - b.minZ);
    this.mapT = { sx, sz, b, W, H };
    const X = (x) => (x - b.minX) * sx;
    const Z = (z) => (z - b.minZ) * sz;
    ctx.fillStyle = g.pal.snow ? '#e4eaee' : g.pal.grass;
    ctx.fillRect(0, 0, W, H);
    // road + street
    ctx.fillStyle = '#8a8b8d';
    ctx.fillRect(0, Z(-3), W, Z(3) - Z(-3));
    ctx.fillStyle = '#cfc6b0';
    ctx.fillRect(X(-3.6), Z(-37), X(3.6) - X(-3.6), Z(-4.6) - Z(-37));
    ctx.fillStyle = '#dcd4c2';
    ctx.fillRect(X(-16), Z(-61), X(16) - X(-16), Z(-37) - Z(-61));
    // water
    ctx.fillStyle = '#7fbfd0';
    for (const w of g.world.waters) {
      if (w.tiny) continue;
      if (w.kind === 'box') ctx.fillRect(X(w.minX), Z(w.minZ), (w.maxX - w.minX) * sx, (w.maxZ - w.minZ) * sz);
      else {
        ctx.beginPath();
        ctx.ellipse(X(w.x), Z(w.z), (w.rx || w.r) * sx, (w.rz || w.r) * sz, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // buildings
    for (const col of g.world.colliders) {
      if (col.kind !== 'box' || !col.roof) continue;
      ctx.fillStyle = '#6a6358';
      ctx.fillRect(X(col.minX), Z(col.minZ), (col.maxX - col.minX) * sx, (col.maxZ - col.minZ) * sz);
    }
    // trees
    ctx.fillStyle = 'rgba(60,90,50,0.35)';
    for (const t of g.town.trees) {
      ctx.beginPath();
      ctx.arc(X(t.x), Z(t.z), 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // hideout
    ctx.fillStyle = '#e8b53a';
    ctx.beginPath();
    ctx.arc(X(-50.5), Z(34.5), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a2c22';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    const labels = [['Shrine', 0, -45], ['Farm', -40, -24], ['Onsen', 42, -41], ['Grandma', 42, -13], ['Shops', 0, -20], ['Park', 18, 22], ['Paddies', -28, 18], ['Home', -50.5, 41], ['Bus', 15, 8]];
    for (const [t, x, z] of labels) ctx.fillText(t, X(x), Z(z));
    // drains
    ctx.fillStyle = '#44484c';
    for (const d of g.drains) ctx.fillRect(X(d.pos.x) - 2, Z(d.pos.z) - 2, 4, 4);
    this.mapBase = c;
  }

  drawMap() {
    const g = this.g;
    if (!this.mapBase) this.buildMapBase();
    this.mapFrame = (this.mapFrame || 0) + 1;
    if (this.mapFrame % 3) return;
    const cv = $('minimap');
    const ctx = cv.getContext('2d');
    const { sx, sz, b } = this.mapT;
    const X = (x) => (x - b.minX) * sx;
    const Z = (z) => (z - b.minZ) * sz;
    ctx.drawImage(this.mapBase, 0, 0);
    // golden cat
    if (g.tasks && g.tasks.isVisible && g.tasks.isVisible(FINALE) && g.mode === 'story') {
      const cat = g.items.items.find((i) => i.type === 'goldCat' && !i.gone);
      if (cat) {
        ctx.fillStyle = '#f0c23a';
        ctx.strokeStyle = '#8a5a00';
        ctx.beginPath();
        ctx.arc(X(cat.pos.x), Z(cat.pos.z), 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    for (const n of g.npcs) {
      if (!n.active) continue;
      ctx.fillStyle = n.mode === 'chase' ? '#e0301e' : n.def.officer ? '#2f5d8a' : '#f8f2e2';
      ctx.strokeStyle = '#3a2c22';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(X(n.pos.x), Z(n.pos.z), n.mode === 'chase' ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    const p = g.player;
    ctx.save();
    ctx.translate(X(p.pos.x), Z(p.pos.z));
    ctx.rotate(-p.yaw + Math.PI);
    ctx.fillStyle = '#c9412f';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------------ results
  results(r) {
    const rows = r.rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('');
    $('resultsBody').innerHTML = `<div class="results"><h2>${esc(r.title)}</h2><div class="score">${r.score.toLocaleString()}</div>
      <div class="rank">${esc(r.rank)}</div>${r.best ? '<div class="unl">🎉 New best score!</div>' : ''}<table>${rows}</table>
      ${r.unlocks.map((u) => `<div class="unl">🔓 ${esc(u)}</div>`).join('')}</div>`;
    this.show('results');
  }

  clearWorld() {
    $('world').innerHTML = '';
    this.npcEls.clear();
    this.floaters = [];
    this.mapBase = null;
    $('toasts').innerHTML = '';
    $('bigtext').innerHTML = '';
    this.lastPrompt = '';
  }
}
