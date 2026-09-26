// The Mischief Card (いたずら帳). Like the Goose game's to-do list, but with a bonus card,
// animal-specific tasks, clear hints, and a big randomised pool for Mayhem Rush.

export const TASKS = {
  // ------------------------------------------------------------------ main card
  daikon: {
    title: "Uproot one of the farmer's daikon",
    hint: "Farmer Tanaka's field is north-west, past the shops. Walk up to a leafy daikon and press E (or click) to yank it out of the ground.",
    points: 150, on: ['pulled'], test: (e) => e.item.type === 'daikon',
  },
  leaves: {
    title: "Scatter the priest's leaf pile",
    hint: 'The shrine is at the north end of the shopping street, through the red torii gate. The priest sweeps leaves into piles — run through one, bark next to it, or throw something at it.',
    points: 150, on: ['leafScatter'], test: () => true,
  },
  bell: {
    title: 'Ring the shrine bell',
    hint: 'A thick rope hangs in front of the shrine hall. Press E beside it to tug it — or hit the bell with something you throw.',
    points: 150, on: ['bellRing'], test: (e) => e.byPlayer,
  },
  fishStash: {
    title: 'Steal a fish and stash it in your hideout',
    hint: "The fishmonger's stall is on the west side of the shopping street. Distract him, grab a fish, and carry it home to your nest in the bamboo grove (far south-west). Doro can take the drains!",
    points: 300, on: ['stash'], test: (e) => e.item.type === 'fish' || e.item.type === 'octopus',
  },
  bucketHead: {
    title: "Put a bucket on someone's head",
    hint: "There's a bucket by the farmer's well and a yellow one at the hot spring. Throw it at someone (right-click to aim) — or drop it on them from a tree or roof.",
    points: 300, on: ['bucketHead'], test: () => true,
  },
  shoji: {
    title: "Poke a hole in Grandma's paper screen",
    hint: "Grandma's house is east of the shops. Stand on her wooden veranda facing the white paper screens and hold R.",
    points: 150, on: ['shojiTear'], test: () => true,
  },
  vending: {
    title: 'Get a drink from a vending machine',
    hint: 'Vending machines need a ¥100 coin. The shrine offering box has coins (so does the honesty box at the veggie stand, south-east). Carry one to a machine and press E.',
    points: 200, on: ['vending'], test: () => true,
  },
  missBus: {
    title: 'Make the salaryman miss his bus',
    hint: 'Mr. Suzuki waits at the bus stop just south of the main road. When the bus pulls in, keep him busy — steal his briefcase and make him chase you, or give him something to step in.',
    points: 300, on: ['missedBus'], test: () => true,
  },
  grandpaOut: {
    title: 'Make Grandpa get out of the hot spring',
    hint: 'The hot spring is in the north-east behind a bamboo fence. Startle Grandpa, bonk him, or — if you are Kiki — just climb in and bathe next to him.',
    points: 200, on: ['grandpaOut'], test: () => true,
  },
  poopStep: {
    title: "Make someone step in your 'little present'",
    hint: "When nature calls (watch the leaf meter), press X on a path someone walks along every day. Eating snacks makes nature call sooner.",
    points: 300, on: ['stepPoop'], test: () => true,
  },
  soakLaundry: {
    title: "Get Grandma's laundry wet",
    hint: "Grandma hangs her washing on a line west of her house. Pull something off the line and dunk it in her koi pond — or any water.",
    points: 200, on: ['itemWater'], test: (e) => !!e.item.def.laundry,
  },
  threeChase: {
    title: 'Get three people chasing you at once',
    hint: 'Steal something in the busy shopping street, then run past the neighbours. A shouting shopkeeper gets everyone involved.',
    points: 400, on: ['chasers'], test: (e) => e.n >= 3,
  },
  goldCat: {
    title: 'Steal the Golden Lucky Cat and stash it at home',
    hint: 'The golden maneki-neko sits on the dango shop counter. It is heavy, so drag it (E) all the way to your hideout. The whole town will come after you!',
    points: 1500, on: ['stash'], test: (e) => e.item.type === 'goldCat', finale: true,
  },

  // ------------------------------------------------------------------ bonus / rush
  jizoHat: {
    title: 'Give a Jizo statue a hat, like in the old folktale',
    hint: 'Three stone Jizo statues stand by the road, south-west of the crossing. Bring them something to wear on their heads — a hat, a towel, even a bucket — and press E.',
    points: 200, on: ['jizoHat'], test: () => true,
  },
  civilized: {
    title: 'Use the public restroom like a civilized animal',
    hint: 'When nature calls, find the little restroom building in the park (south of the road) and press E at the door.',
    points: 250, on: ['civilized'], test: () => true,
  },
  whackOfficer: {
    title: 'Bonk the police officer with something',
    hint: 'Officer Kobayashi guards the police box (交番) on the shopping street. Throw anything at him... then run.',
    points: 300, on: ['hitNpc'], test: (e) => e.npc.id === 'officer',
  },
  allDaikon: {
    title: 'Uproot all six daikon',
    hint: 'Pull up every daikon in the farmer\'s field. He replants them when he gets them back, so be quick!',
    points: 400, on: ['pulled'], count: 6, uniqueKey: (e) => e.item.type === 'daikon' && e.item.id,
  },
  allShoji: {
    title: 'Poke holes in all four shoji panels',
    hint: "Grandma's veranda has four paper screens. Poke through every one of them (she'll patch them up if she sees).",
    points: 400, on: ['shojiTear'], count: 4, uniqueKey: (e) => 'p' + e.i,
  },
  combo8: {
    title: 'Pull off a ×8 mischief combo',
    hint: 'Chain mischief quickly — each act within a few seconds of the last grows your combo. Steal, smash, bark, repeat!',
    points: 400, on: ['combo'], test: (e) => e.n >= 8,
  },
  taiko: {
    title: "Bang the shrine's taiko drum",
    hint: 'A big taiko drum stands on the east side of the shrine. Hit it (E) or throw something at it. DON!',
    points: 120, on: ['taiko'], test: () => true,
  },
  fortune: {
    title: 'Draw a fortune at the shrine',
    hint: 'Next to the fortune rack on the west side of the shrine is a red box. Press E to shake out an omikuji fortune.',
    points: 100, on: ['fortune'], test: () => true,
  },
  stash10: {
    title: 'Stash 10 different things in your hideout',
    hint: 'Anything you leave in your nest counts. Townsfolk will never take things back from your hideout.',
    points: 500, on: ['stash'], count: 10, uniqueKey: (e) => e.item.id,
  },
  sniper: {
    title: 'Hit someone with something thrown from a tree or rooftop',
    hint: 'Climb up high (Space at a tree or wall), aim with right mouse, and let fly.',
    points: 300, on: ['hitNpc'], test: (e) => e.fromHigh,
  },
  beforeNoon: {
    title: 'Finish the main card before noon',
    hint: 'Complete the whole main Mischief Card before the clock hits 12:00 PM. Plan a route!',
    points: 800, on: ['mainDone'], test: (e) => e.hour < 12,
  },
  // monkey only
  snowMonkey: {
    title: 'Soak in the hot spring like a snow monkey', char: 'monkey',
    hint: 'Walk into the hot spring and stand still for a moment. Ahhh. (It also calms the town down.)',
    points: 200, on: ['bathe'], test: () => true,
  },
  torii: {
    title: 'Sit on top of the torii gate', char: 'monkey',
    hint: 'Climb one of the big red torii pillars at the shrine entrance (Space).',
    points: 150, on: ['perch'], test: (e) => e.c.tag === 'torii',
  },
  busRide: {
    title: 'Ride on the roof of the bus', char: 'monkey',
    hint: 'Climb onto the bus while it waits at the stop and hold on as it drives away.',
    points: 400, on: ['busRide'], test: () => true,
  },
  pelt3: {
    title: 'Pelt 3 people from up high', char: 'monkey',
    hint: 'From a treetop or roof, hit three townsfolk with thrown things.',
    points: 400, on: ['hitNpc'], count: 3, test: (e) => e.fromHigh,
  },
  // raccoon only
  wash: {
    title: 'Wash something in water (you are a raccoon, after all)', char: 'raccoon',
    hint: 'Stand in any water — a pond, the paddies, the hot spring — while holding something and hold R.',
    points: 150, on: ['wash'], test: () => true,
  },
  drains: {
    title: 'Travel through the drains', char: 'raccoon',
    hint: 'Grates in the ground connect all over town. Stand on one and press E.',
    points: 150, on: ['drainTravel'], test: () => true,
  },
  rummage3: {
    title: 'Rummage through 3 trash bins', char: 'raccoon',
    hint: 'Trash bins hide all sorts of treasure. Press E beside a bin to dig in.',
    points: 300, on: ['rummage'], count: 3,
  },
  // rush extras
  scare5: {
    title: 'Startle 5 people with your bark',
    hint: 'Sneak up close and press Q. People who are holding things will drop them!',
    points: 300, on: ['mischief'], count: 5, test: (e) => e.kind === 'scare',
  },
  break3: {
    title: 'Smash 3 fragile things',
    hint: 'Tea cups, bottles, teapots and bonsai break when thrown hard.',
    points: 300, on: ['shatter'], count: 3,
  },
  steal5: {
    title: 'Snatch 5 things from their owners',
    hint: 'Anything that belongs to somebody counts. Grab it while they aren\'t looking.',
    points: 300, on: ['mischief'], count: 5, test: (e) => e.kind === 'steal',
  },
  bins2: {
    title: 'Knock over 2 trash bins',
    hint: 'There are bins on the shopping street, at the bus stop and in the park.',
    points: 150, on: ['binTipped'], count: 2,
  },
  well: {
    title: 'Drop something down the well',
    hint: "The farmer's well is by his field. Throw or drop something into it. Plop.",
    points: 150, on: ['wellDrop'], test: () => true,
  },
  wet3: {
    title: 'Throw 3 things into water',
    hint: 'Ponds, paddies, the hot spring... splash!',
    points: 200, on: ['itemWater'], count: 3, test: (e) => e.thrown,
  },
  dropIt: {
    title: 'Make someone drop what they are holding',
    hint: 'Bark right next to someone carrying something — or bonk them with a throw.',
    points: 150, on: ['npcDrop'], test: () => true,
  },
  escape3: {
    title: 'Escape from 3 chases',
    hint: 'Outrun them, climb out of reach, hide in a bush or slip down a drain.',
    points: 300, on: ['escape'], count: 3,
  },
  tanukiPond: {
    title: 'Drag the tanuki statue into the koi pond',
    hint: "Grandma's garden has a big tanuki statue. Drag it (E) into her pond.",
    points: 350, on: ['itemWater'], test: (e) => e.item.type === 'tanuki',
  },
  duck: {
    title: "Steal Grandpa's rubber duck",
    hint: 'It floats in the hot spring. Grab it from the water.',
    points: 150, on: ['pickup'], test: (e) => e.item.type === 'duck',
  },
  lantern: {
    title: 'Bring down a paper lantern',
    hint: 'Lanterns hang over the shopping street. Throw something at one, or climb a lamp post and grab it.',
    points: 150, on: ['lanternDown'], test: () => true,
  },
  scarecrow: {
    title: 'Tear the scarecrow apart',
    hint: "The farmer's scarecrow stands at the east edge of his field. Hold R next to it.",
    points: 200, on: ['scarecrowTorn'], test: () => true,
  },
  eat3: {
    title: 'Eat 3 snacks',
    hint: 'Pick up any food (dango, fish, persimmons, crackers...) and hold R to munch.',
    points: 150, on: ['eat'], count: 3,
  },
  pigeons: {
    title: 'Scatter the pigeons',
    hint: 'Pigeons peck around the shrine and the park. Run at them or bark.',
    points: 80, on: ['birdsScatter'], test: () => true,
  },
  hitAny: {
    title: 'Bonk someone with a thrown object',
    hint: 'Pick something up, hold right mouse to aim at someone, release to throw.',
    points: 150, on: ['hitNpc'], test: () => true,
  },
  persimmon: {
    title: 'Shake persimmons out of the tree',
    hint: 'The persimmon tree with orange fruit is by the farmhouse. Climb to the top.',
    points: 120, on: ['treeShake'], test: () => true,
  },
  stash3: {
    title: 'Stash 3 stolen things at home',
    hint: 'Anything that belonged to someone, carried back to your nest.',
    points: 350, on: ['stash'], count: 3, test: (e) => !!e.item.owner, uniqueKey: (e) => e.item.id,
  },
  blockBus: {
    title: 'Hold up the bus',
    hint: 'Stand in the road in front of the bus. Honk honk!',
    points: 150, on: ['busBlocked'], test: () => true,
  },
};

export const MAIN_CARD = ['daikon', 'leaves', 'bell', 'fishStash', 'bucketHead', 'shoji', 'vending', 'missBus', 'grandpaOut', 'poopStep', 'soakLaundry', 'threeChase'];
export const FINALE = 'goldCat';
export const FINALE_UNLOCK = 9;
export const BONUS_CARD = {
  monkey: ['snowMonkey', 'torii', 'busRide', 'pelt3', 'jizoHat', 'civilized', 'whackOfficer', 'allDaikon', 'allShoji', 'combo8', 'stash10', 'beforeNoon'],
  raccoon: ['wash', 'drains', 'rummage3', 'jizoHat', 'civilized', 'whackOfficer', 'allDaikon', 'allShoji', 'combo8', 'stash10', 'sniper', 'beforeNoon'],
};
export const RUSH_POOL = [
  'daikon', 'leaves', 'bell', 'bucketHead', 'shoji', 'vending', 'grandpaOut', 'soakLaundry', 'threeChase', 'poopStep',
  'jizoHat', 'whackOfficer', 'taiko', 'fortune', 'sniper', 'snowMonkey', 'torii', 'wash', 'drains', 'rummage3',
  'scare5', 'break3', 'steal5', 'bins2', 'well', 'wet3', 'dropIt', 'escape3', 'tanukiPond', 'duck', 'lantern',
  'scarecrow', 'eat3', 'pigeons', 'hitAny', 'persimmon', 'stash3', 'blockBus', 'missBus', 'combo8', 'civilized',
];

export class TaskManager {
  constructor(g, mode, charId, save) {
    this.g = g;
    this.mode = mode;
    this.char = charId;
    this.save = save;
    this.state = {};
    this.done = new Set();
    this.cards = [];
    this.cardIndex = 0;
    this.completedCount = 0;
    this.lastCompleteT = 0;
    if (mode === 'story') {
      const prog = save.story[charId];
      for (const id of prog.done) this.done.add(id);
      for (const id of prog.bonus) this.done.add(id);
      this.cards.push({ id: 'main', title: 'Mischief Card', jp: 'いたずら帳', tasks: MAIN_CARD.concat([FINALE]) });
      this.cards.push({ id: 'bonus', title: 'Bonus Card', jp: 'おまけ', tasks: BONUS_CARD[charId] });
    } else {
      this.drawRushCard();
    }
    this.unsub = (ev) => this.handle(ev);
    g.events.onAny(this.unsub);
  }

  isVisible(id) {
    if (this.mode === 'story' && id === FINALE) return this.mainDoneCount() >= FINALE_UNLOCK || this.done.has(FINALE);
    return true;
  }

  mainDoneCount() {
    return MAIN_CARD.filter((t) => this.done.has(t)).length;
  }

  activeTasks() {
    const out = [];
    for (const c of this.cards) {
      if (c.locked) continue;
      for (const t of c.tasks) if (!this.done.has(t) && this.isVisible(t)) out.push(t);
    }
    return out;
  }

  drawRushCard() {
    const g = this.g;
    const pool = RUSH_POOL.filter((id) => {
      const t = TASKS[id];
      if (t.char && t.char !== this.char) return false;
      if (this.done.has(id)) return false;
      return true;
    });
    const pick = g.rng.shuffle(pool).slice(0, 5);
    const n = (this.cardNumber || 0) + 1;
    this.cards = [{ id: 'rush' + n, title: `Mayhem Card #${n}`, jp: 'いたずら', tasks: pick, number: n }];
    for (const id of pick) this.state[id] = { n: 0, keys: new Set() };
    this.cardNumber = n;
  }

  handle(ev) {
    for (const c of this.cards) {
      if (c.locked) continue;
      for (const id of c.tasks) {
        if (this.done.has(id) || !this.isVisible(id)) continue;
        const t = TASKS[id];
        if (!t.on.includes(ev.type)) continue;
        if (t.char && t.char !== this.char) continue;
        if (t.test && !t.test(ev, this.g)) continue;
        if (t.count) {
          const st = this.state[id] || (this.state[id] = { n: 0, keys: new Set() });
          if (t.uniqueKey) {
            const k = t.uniqueKey(ev);
            if (!k || st.keys.has(k)) continue;
            st.keys.add(k);
          }
          st.n++;
          this.g.ui.taskProgress(id, st.n, t.count);
          if (st.n < t.count) continue;
        }
        this.complete(id);
      }
    }
  }

  progress(id) {
    const t = TASKS[id];
    if (!t.count) return null;
    const st = this.state[id];
    return { n: st ? st.n : 0, of: t.count };
  }

  complete(id) {
    const g = this.g;
    if (this.done.has(id)) return;
    this.done.add(id);
    this.completedCount++;
    this.lastCompleteT = g.time;
    const t = TASKS[id];
    g.score.addFlat(t.points, 'Task complete!');
    g.audio.sfx('stamp', null, 1);
    g.audio.sfx('chime', null, 1);
    g.music.stinger('task');
    g.ui.stamp(id);
    g.events.emit('taskDone', { id });
    if (this.mode === 'story') {
      const prog = this.save.story[this.char];
      if (MAIN_CARD.includes(id) || id === FINALE) {
        if (!prog.done.includes(id)) prog.done.push(id);
      } else if (!prog.bonus.includes(id)) prog.bonus.push(id);
      if (MAIN_CARD.includes(id) && this.mainDoneCount() === FINALE_UNLOCK && !this.done.has(FINALE)) {
        g.onFinaleUnlocked();
      }
      if (id === FINALE) {
        g.onMainCardComplete();
        this.handle({ type: 'mainDone', hour: g.clock });
      }
      g.persist();
    } else {
      if (this.cards[0].tasks.every((x) => this.done.has(x))) {
        g.onRushCardCleared();
        this.drawRushCard();
        g.ui.buildCard();
      }
    }
    g.checkUnlocks();
  }

  dispose() {
    const i = this.g.events.any.indexOf(this.unsub);
    if (i >= 0) this.g.events.any.splice(i, 1);
  }
}
