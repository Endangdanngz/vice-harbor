// minimap.js — top-down 2D canvas minimap for Vice Harbor.
//
// Renders the same world the 3D city uses: road grid on 40-unit spacing
// with 12-wide roads, the beach strip and the water edge, then the live
// entities on top — traffic as dots, police as blinking blue dots, the
// objective as a pulsing yellow diamond and the player as a white arrow.
// North-up: world +x is right, world +z is down on the map. The map spans
// [-280, 280] on both axes.

const MAP_MIN = -280;
const MAP_SIZE = 560;
const ROAD_LINES = [];
for (let r = -200; r <= 200; r += 40) ROAD_LINES.push(r);
const ROAD_WIDTH = 12;
const BEACH_Z = 196;
const WATER_Z = 232;

export function createMinimap(canvas, city) {
  const ctx = canvas.getContext('2d');

  // World -> map transforms (recomputed per draw so canvas resizes are safe).
  function scaleX() { return canvas.width / MAP_SIZE; }
  function scaleY() { return canvas.height / MAP_SIZE; }
  function mx(x) { return (x - MAP_MIN) * scaleX(); }
  function mz(z) { return (z - MAP_MIN) * scaleY(); }

  function drawStatic() {
    const w = canvas.width, h = canvas.height;
    // background: city blocks
    ctx.fillStyle = '#0b0f16';
    ctx.fillRect(0, 0, w, h);

    // road grid
    ctx.fillStyle = '#39404e';
    for (const r of ROAD_LINES) {
      const half = (ROAD_WIDTH / 2) * scaleX();
      ctx.fillRect(mx(r) - half, 0, ROAD_WIDTH * scaleX(), h); // along z
      ctx.fillRect(0, mz(r) - (ROAD_WIDTH / 2) * scaleY(), w, ROAD_WIDTH * scaleY()); // along x
    }

    // beach sand strip, then open water at the south edge
    ctx.fillStyle = '#c9ae7c';
    ctx.fillRect(0, mz(BEACH_Z), w, (WATER_Z - BEACH_Z) * scaleY());
    const grad = ctx.createLinearGradient(0, mz(WATER_Z), 0, h);
    grad.addColorStop(0, '#1a6ea8');
    grad.addColorStop(1, '#0d3d63');
    ctx.fillStyle = grad;
    ctx.fillRect(0, mz(WATER_Z), w, h - mz(WATER_Z));

    // if the city module was passed in, sanity-mark the spawn road crossing
    if (city && typeof city.isRoad === 'function' && city.isRoad(0, 0)) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.arc(mx(0), mz(0), 10 * scaleX(), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMarker(marker, now) {
    const x = mx(marker.x), y = mz(marker.z);
    const r = 5 + Math.sin(now * 5) * 1.8;
    ctx.save();
    // soft pulsing halo
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(now * 5);
    ctx.strokeStyle = '#ffd83d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // diamond
    ctx.fillStyle = '#ffd83d';
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0b0f16';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawCars(cars) {
    for (const car of cars) {
      let color = '#c7ccd4', radius = 2.6;
      if (car.kind === 'taxi') { color = '#e8c95a'; }
      else if (car.kind === 'truck') { color = '#9aa3ad'; radius = 3.4; }
      else if (car.kind === 'sport') { color = '#e8e8f0'; radius = 2.8; }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx(car.x), mz(car.z), radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPolice(police, wanted, now) {
    // blink hard while the player is wanted, steady otherwise
    const alpha = wanted > 0 ? (Math.sin(now * 9) > 0 ? 1 : 0.2) : 0.9;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const cop of police) {
      const x = mx(cop.x), y = mz(cop.z);
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(59,130,246,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 5.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer(player) {
    const x = mx(player.x), y = mz(player.z);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(player.angle || 0);
    if (player.inCar) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // white arrow, pointing up (north) before rotation
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0b0f16';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  function drawWanted(wanted) {
    if (!wanted || wanted <= 0) return;
    const n = Math.min(5, Math.floor(wanted));
    ctx.save();
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd83d';
    ctx.fillText('★'.repeat(n), canvas.width - 7, 15);
    ctx.restore();
  }

  function drawChrome() {
    const w = canvas.width, h = canvas.height;
    ctx.save();
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText('N', w / 2, 13);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.restore();
  }

  // state = { player:{x,z,angle,inCar}, cars:[{x,z,kind}],
  //           police:[{x,z}], marker:{x,z}|null, wanted:level }
  function draw(state) {
    if (!state || !state.player) return;
    const now = performance.now() / 1000;
    drawStatic();
    if (state.marker) drawMarker(state.marker, now);
    if (Array.isArray(state.cars)) drawCars(state.cars);
    if (Array.isArray(state.police)) drawPolice(state.police, state.wanted || 0, now);
    drawPlayer(state.player);
    drawWanted(state.wanted || 0);
    drawChrome();
  }

  return { draw, canvas };
}
