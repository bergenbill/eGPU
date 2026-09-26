// Persistent progress stored in localStorage. Everything is wrapped in try/catch so the game
// still runs in private windows or when storage is blocked.
const KEY = 'momijiMayhem.save.v1';

function defaults() {
  return {
    settings: { music: 0.7, sfx: 0.85, difficulty: 'normal', hints: true, shake: true },
    story: {
      monkey: { done: [], bonus: [] },
      raccoon: { done: [], bonus: [] },
    },
    collection: {},
    hats: { unlocked: ['none'], equipped: { monkey: 'none', raccoon: 'none' } },
    best: { rush: { monkey: 0, raccoon: 0 }, daily: {} },
    stats: { caught: 0, stolen: 0, chases: 0, poops: 0, days: 0, barks: 0, bestCombo: 0 },
    seenHelp: false,
  };
}

function merge(base, over) {
  if (!over || typeof over !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (over[k] === undefined) continue;
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      base[k] = merge(base[k], over[k]);
    } else {
      base[k] = over[k];
    }
  }
  // keep extra keys (e.g. collection entries, daily dates)
  for (const k of Object.keys(over)) if (base[k] === undefined) base[k] = over[k];
  return base;
}

export function loadSave() {
  let data = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = merge(defaults(), JSON.parse(raw));
  } catch (e) {
    /* storage unavailable */
  }
  return data;
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    /* storage unavailable */
  }
}

export function resetSave() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    /* ignore */
  }
  return defaults();
}
