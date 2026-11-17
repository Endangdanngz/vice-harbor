// minimap.js — 2D top-down canvas: streets, beach, player arrow, police, objective.
export function createMinimap(G) {
  const canvas = document.getElementById('minimap');
  const ctx = canvas.getContext('2d');
  const SIZE = 180;
  // Map the city + beach + a sliver of water: x in [-220, 220],
  // z in [-220, 230] (the old single 440 span pushed the beach and the
  // water off the bottom edge, so neither was visible).
  const toMap = (x, z) => ({
    x: ((x + 220) / 440) * SIZE,
    y: ((z + 220) / 450) * SIZE,
  });

  function draw() {
    ctx.clearRect(0, 0, SIZE, SIZE);
    // Ocean + sand strip at the bottom (south = +z).
    const water = toMap(0, 214);
    ctx.fillStyle = '#0a4a6b';
    ctx.fillRect(0, water.y, SIZE, SIZE - water.y);
    ctx.fillStyle = '#b89a68';
    const sand = toMap(0, 186);
    ctx.fillRect(0, sand.y, SIZE, water.y - sand.y);
    // City base.
    ctx.fillStyle = '#232333';
    ctx.fillRect(0, 0, SIZE, sand.y);
    // Roads.
    ctx.strokeStyle = '#4a4a5e';
    ctx.lineWidth = 4;
    for (const c of G.city.roadCoords) {
      const a = toMap(c, -210), b = toMap(c, 210);
      ctx.beginPath(); ctx.moveTo(a.x, 0); ctx.lineTo(b.x, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, a.y); ctx.lineTo(SIZE, b.y); ctx.stroke();
    }
    // Objective marker (gold diamond).
    const M = G.missions;
    if (M && M.targetPos && M.beacon.visible) {
      const m = toMap(M.targetPos.x, M.targetPos.z);
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.moveTo(m.x, m.y - 7); ctx.lineTo(m.x + 6, m.y);
      ctx.lineTo(m.x, m.y + 7); ctx.lineTo(m.x - 6, m.y);
      ctx.closePath(); ctx.fill();
    }
    // Police blips (red/blue flashing dots).
    const flash = Math.floor(G.time * 2) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2e4d' : '#2e7bff';
    for (const car of G.cars) {
      if (!car.police) continue;
      const m = toMap(car.mesh.position.x, car.mesh.position.z);
      ctx.beginPath(); ctx.arc(m.x, m.y, 3.4, 0, Math.PI * 2); ctx.fill();
    }
    for (const cop of G.policeFoot) {
      const m = toMap(cop.mesh.position.x, cop.mesh.position.z);
      ctx.beginPath(); ctx.arc(m.x, m.y, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    // Cash pickups (green dots).
    ctx.fillStyle = '#2eff7a';
    for (const pk of M.pickups) {
      const m = toMap(pk.mesh.position.x, pk.mesh.position.z);
      ctx.beginPath(); ctx.arc(m.x, m.y, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow (white, rotated to heading).
    const p = G.playerPos();
    const m = toMap(p.x, p.z);
    const heading = G.player.onFoot ? G.player.yaw : (G.player.vehicle ? G.player.vehicle.yaw : 0);
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  return { draw };
}
