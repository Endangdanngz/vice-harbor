// Vice Harbor — save.js
// Persistence for the player's progress and settings, stored as one JSON
// object in localStorage under a versioned key. Loading always merges the
// stored object over the defaults, so a save written by an older build
// (missing newer fields) still produces a complete, usable object, and a
// corrupt or half-written save falls back to a fresh start instead of
// crashing the game.

const KEY = 'vice-harbor-save-v2';

// The factory-fresh save: starting cash, the first mission, and the
// default settings the options menu edits.
function defaultSave() {
  return {
    cash: 250,
    missionIndex: 0,
    settings: {
      volume: 0.8,
      sensitivity: 1.0,
      quality: 'high',
      invertY: false,
    },
  };
}

// Merge a parsed stored object over the defaults. Only fields of the
// right shape are trusted; anything else keeps its default value.
function mergeSave(parsed) {
  const out = defaultSave();
  if (!parsed || typeof parsed !== 'object') return out;

  if (typeof parsed.cash === 'number' && Number.isFinite(parsed.cash)) {
    out.cash = Math.max(0, Math.floor(parsed.cash));
  }
  if (
    typeof parsed.missionIndex === 'number' &&
    Number.isFinite(parsed.missionIndex) &&
    parsed.missionIndex >= 0
  ) {
    out.missionIndex = Math.floor(parsed.missionIndex);
  }
  if (parsed.settings && typeof parsed.settings === 'object') {
    const s = parsed.settings;
    if (typeof s.volume === 'number' && Number.isFinite(s.volume)) {
      out.settings.volume = Math.max(0, Math.min(1, s.volume));
    }
    if (typeof s.sensitivity === 'number' && Number.isFinite(s.sensitivity)) {
      out.settings.sensitivity = Math.max(0.1, Math.min(3, s.sensitivity));
    }
    if (s.quality === 'low' || s.quality === 'medium' || s.quality === 'high') {
      out.settings.quality = s.quality;
    }
    if (typeof s.invertY === 'boolean') {
      out.settings.invertY = s.invertY;
    }
  }
  return out;
}

// Load the save, or return the defaults when nothing is stored, the
// stored text is not valid JSON, or storage is unavailable.
export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    return mergeSave(JSON.parse(raw));
  } catch (err) {
    return defaultSave();
  }
}

// Persist the save. The data is merged over the defaults before writing
// so the stored object is always complete, even if the caller built it
// by hand. Failures (private browsing, quota, disabled storage) are
// swallowed: the game keeps running with its in-memory state.
export function storeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(mergeSave(data)));
  } catch (err) {
    /* storage unavailable — progress simply will not persist */
  }
}
