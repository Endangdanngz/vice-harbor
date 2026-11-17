// wanted.js — 0–5 star wanted level, crime reporting, decay when out of sight.
export function createWanted(G) {
  const W = {
    level: 0,
    calmTimer: 0,
    decayTimer: 0,
    lastCrimeAt: -999,
  };

  W.add = (stars, reason) => {
    if (G.state !== 'playing') return;
    const before = W.level;
    W.level = Math.max(0, Math.min(5, W.level + stars));
    W.lastCrimeAt = G.time;
    W.calmTimer = 0;
    if (W.level > before) {
      G.ui.setStars(W.level);
      if (reason) G.ui.toast(reason + ' — wanted level ' + W.level);
    }
  };

  W.clear = () => {
    W.level = 0;
    W.calmTimer = 0;
    G.ui.setStars(0);
  };

  W.update = (dt) => {
    if (W.level === 0) return;
    // Are police close enough to keep the heat on?
    let policeNear = false;
    const p = G.playerPos();
    for (const car of G.cars) {
      if (!car.police) continue;
      // A police car the player stole is not "the law closing in".
      if (car === G.player.vehicle) continue;
      const dx = car.mesh.position.x - p.x, dz = car.mesh.position.z - p.z;
      if (dx * dx + dz * dz < 70 * 70) { policeNear = true; break; }
    }
    if (!policeNear) {
      for (const cop of G.policeFoot) {
        const dx = cop.mesh.position.x - p.x, dz = cop.mesh.position.z - p.z;
        if (dx * dx + dz * dz < 50 * 50) { policeNear = true; break; }
      }
    }
    if (policeNear) {
      W.calmTimer = 0;
      W.decayTimer = 0;
    } else {
      W.calmTimer += dt;
      // After 6 calm seconds out of sight, stars start dropping.
      if (W.calmTimer > 6) {
        W.decayTimer += dt;
        if (W.decayTimer > 7) {
          W.decayTimer = 0;
          W.level = Math.max(0, W.level - 1);
          G.ui.setStars(W.level);
          if (W.level === 0) G.ui.toast('You lost the cops. Heat is off.');
        }
      }
    }
  };

  G.wantedSystem = W;
  return W;
}
