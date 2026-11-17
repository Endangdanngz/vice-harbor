// save.js — localStorage persistence for cash + mission progress.
const KEY = 'vice-harbor-save-v1';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch (err) { return null; }
}

export function writeSave(G) {
  try {
    const data = {
      cash: Math.round(G.player.cash),
      missionIndex: G.missionIndex,
      missionsDone: G.missionsDone,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch (err) { /* storage unavailable — play session only */ }
}
