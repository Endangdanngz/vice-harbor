// wanted.js — Vice Harbor wanted-level / heat model.
//
// Pure logic, no rendering. Crimes add heat; heat maps to a 0..5 star level;
// heat decays over time (faster while the player stays concealed) and the
// level is always recomputed from the current heat, so stars drop naturally
// as the trail goes cold.

const HEAT_VALUES = {
  theft: 25,          // stealing a car / property
  assault: 20,        // attacking a pedestrian
  gunfire: 15,        // discharging a weapon in public
  hitPed: 45,         // running a pedestrian over
  hitCop: 60,         // hitting a police unit / officer
  copDown: 100,       // taking an officer down
  propertyDamage: 8,  // smashing street props / vehicles
};

const MAX_HEAT = 500;

// Star thresholds on heat: level 1 needs at least 10, then 60/140/240/360.
const THRESHOLDS = [10, 60, 140, 240, 360];

function levelForHeat(heat) {
  let level = 0;
  for (let i = 0; i < THRESHOLDS.length; i++) {
    if (heat >= THRESHOLDS[i]) level = i + 1;
  }
  return level;
}

export function createWanted() {
  const wanted = {
    level: 0,
    heat: 0,

    // Register a crime. Unknown kinds are ignored so callers can be loose.
    report(kind) {
      const add = HEAT_VALUES[kind];
      if (!add) return wanted.level;
      wanted.heat = Math.min(MAX_HEAT, wanted.heat + add);
      wanted.level = levelForHeat(wanted.heat);
      return wanted.level;
    },

    // Advance the model. concealed = true while the player is out of police
    // sight (alley, interior, broken line of sight): heat bleeds off much
    // faster. When heat reaches exactly 0 the level falls back to 0.
    update(dt, concealed) {
      if (wanted.heat > 0) {
        const rate = concealed ? 9 : 2.5;
        wanted.heat = Math.max(0, wanted.heat - rate * dt);
        wanted.level = levelForHeat(wanted.heat);
      } else if (wanted.level !== 0) {
        wanted.level = 0;
      }
      return wanted.level;
    },

    // Full clear — used on respawn / mission restart.
    reset() {
      wanted.heat = 0;
      wanted.level = 0;
    },
  };

  return wanted;
}
