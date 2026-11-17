// traffic.js — the civilian traffic system for Vice Harbor.
//
// Spawns a fleet of AI cars that cruise the road grid (roads every 40
// units from -200..200), turning at intersections, braking for whoever
// is in front of them and honking when stuck. A handful of parked cars
// sit at road edges purely so the player can steal them. Cars that
// wander too far from the player are recycled to a road near the player
// so the streets around the action always feel alive.

import { makeCar, stepCar, CAR_COLORS } from './vehicles.js';

const GRID_MIN = -200;
const GRID_MAX = 200;
const GRID_STEP = 40;
const CRUISE_SPEED = 13;
const BLOCK_DIST = 8.5;    // how close ahead counts as "blocked"
const DESPAWN_DIST = 240;  // recycle AI cars farther than this

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// A random point on a random road, with a grid travel direction and the
// matching facing angle. Roads run along X (constant z) or along Z
// (constant x); the lane offset puts the car on one side of the street.
function randomRoadSpawn() {
  const lines = [];
  for (let v = GRID_MIN; v <= GRID_MAX; v += GRID_STEP) lines.push(v);
  const line = pick(lines);
  const along = GRID_MIN + Math.random() * (GRID_MAX - GRID_MIN);
  const dir = Math.random() < 0.5 ? 1 : -1;
  const lane = 3;
  if (Math.random() < 0.5) {
    // Road along X at z = line, travelling in x.
    return {
      x: along,
      z: line + (dir > 0 ? -lane : lane),
      angle: dir > 0 ? Math.PI / 2 : -Math.PI / 2,
      dx: dir,
      dz: 0,
    };
  }
  // Road along Z at x = line, travelling in z.
  return {
    x: line + (dir > 0 ? lane : -lane),
    z: along,
    angle: dir > 0 ? 0 : Math.PI,
    dx: 0,
    dz: dir,
  };
}

// Point the car's AI at the next intersection in its travel direction.
function initAI(car, dx, dz) {
  const pos = car.group.position;
  let tx;
  let tz;
  if (dx !== 0) {
    tx = dx > 0
      ? (Math.floor(pos.x / GRID_STEP) + 1) * GRID_STEP
      : (Math.ceil(pos.x / GRID_STEP) - 1) * GRID_STEP;
    tz = Math.round(pos.z / GRID_STEP) * GRID_STEP;
  } else {
    tz = dz > 0
      ? (Math.floor(pos.z / GRID_STEP) + 1) * GRID_STEP
      : (Math.ceil(pos.z / GRID_STEP) - 1) * GRID_STEP;
    tx = Math.round(pos.x / GRID_STEP) * GRID_STEP;
  }
  car.ai = { dx, dz, tx, tz, blockedTime: 0 };
}

// At an intersection: mostly go straight, sometimes turn. Sets the next
// intersection target one block ahead in the (possibly new) direction,
// bouncing back inside the grid at its edges.
function chooseNextTarget(car) {
  const ai = car.ai;
  const pos = car.group.position;
  const ix = Math.round(pos.x / GRID_STEP) * GRID_STEP;
  const iz = Math.round(pos.z / GRID_STEP) * GRID_STEP;
  let ndx = ai.dx;
  let ndz = ai.dz;
  const r = Math.random();
  if (r < 0.28) {
    // Turn one way: rotate the heading 90 degrees.
    ndx = ai.dz;
    ndz = -ai.dx;
  } else if (r < 0.52) {
    // Turn the other way.
    ndx = -ai.dz;
    ndz = ai.dx;
  }
  if (ix + ndx * GRID_STEP < GRID_MIN || ix + ndx * GRID_STEP > GRID_MAX) ndx = -ndx;
  if (iz + ndz * GRID_STEP < GRID_MIN || iz + ndz * GRID_STEP > GRID_MAX) ndz = -ndz;
  ai.dx = ndx;
  ai.dz = ndz;
  ai.tx = ix + ndx * GRID_STEP;
  ai.tz = iz + ndz * GRID_STEP;
}

// Is something (another car, or the player) sitting in the lane ahead?
function blockedAhead(car, cars, playerPos) {
  const fx = Math.sin(car.angle);
  const fz = Math.cos(car.angle);
  const cx = car.group.position.x;
  const cz = car.group.position.z;
  const test = (ox, oz) => {
    const rx = ox - cx;
    const rz = oz - cz;
    const dist = Math.hypot(rx, rz);
    if (dist > BLOCK_DIST || dist < 0.01) return false;
    return (rx * fx + rz * fz) / dist > 0.72; // mostly straight ahead
  };
  if (playerPos && test(playerPos.x, playerPos.z)) return true;
  for (let i = 0; i < cars.length; i++) {
    const other = cars[i];
    if (other === car) continue;
    if (test(other.group.position.x, other.group.position.z)) return true;
  }
  return false;
}

// createTraffic(scene, city, count = 14, opts = {})
// opts.onHonk(car) fires when a blocked driver leans on the horn.
export function createTraffic(scene, city, count = 14, opts = {}) {
  const onHonk = typeof opts.onHonk === 'function' ? opts.onHonk : null;
  const cars = [];

  // --- moving traffic ---------------------------------------------------
  for (let i = 0; i < count; i++) {
    let spawn = randomRoadSpawn();
    // Keep spawns from stacking on top of each other.
    for (let tries = 0; tries < 8; tries++) {
      const clash = cars.some((c) => Math.hypot(
        c.group.position.x - spawn.x, c.group.position.z - spawn.z) < 9);
      if (!clash) break;
      spawn = randomRoadSpawn();
    }
    const kind = Math.random() < 0.22 ? 'sport' : 'civil';
    const car = makeCar(scene, {
      x: spawn.x,
      z: spawn.z,
      angle: spawn.angle,
      kind,
      color: pick(CAR_COLORS),
    });
    initAI(car, spawn.dx, spawn.dz);
    cars.push(car);
  }

  // --- parked cars: roadside, engine off, waiting to be stolen ---------
  for (let i = 0; i < 6; i++) {
    const spawn = randomRoadSpawn();
    // Nudge sideways to the kerb: perpendicular offset from the lane.
    const px = spawn.x + (spawn.dz !== 0 ? (Math.random() < 0.5 ? 2.6 : -2.6) : 0);
    const pz = spawn.z + (spawn.dx !== 0 ? (Math.random() < 0.5 ? 2.6 : -2.6) : 0);
    const car = makeCar(scene, {
      x: px,
      z: pz,
      angle: spawn.angle,
      kind: Math.random() < 0.18 ? 'sport' : 'civil',
      color: pick(CAR_COLORS),
    });
    car.parked = true;
    car.speed = 0;
    cars.push(car);
  }

  // Teleport a far-away AI car to a fresh road position 120–200 units
  // from the player, so traffic density follows the action.
  function respawnFar(car, playerPos) {
    for (let tries = 0; tries < 14; tries++) {
      const spawn = randomRoadSpawn();
      const d = Math.hypot(spawn.x - playerPos.x, spawn.z - playerPos.z);
      if (d < 120 || d > 200) continue;
      const clash = cars.some((c) => c !== car && Math.hypot(
        c.group.position.x - spawn.x, c.group.position.z - spawn.z) < 9);
      if (clash) continue;
      car.group.position.set(spawn.x, 0, spawn.z);
      car.angle = spawn.angle;
      car.group.rotation.y = spawn.angle;
      car.speed = 0;
      initAI(car, spawn.dx, spawn.dz);
      return;
    }
  }

  // update(dt, playerPos) — advance every AI driver one frame.
  // Parked cars and the car the player is sitting in are left alone.
  function update(dt, playerPos) {
    const colliders = city && city.colliders ? city.colliders : [];
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      if (car.parked || car.occupied || !car.ai) continue;
      const pos = car.group.position;

      // Recycle wrecks-free cruisers that fell too far behind the player.
      if (playerPos && !car.dead) {
        const dPlayer = Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z);
        if (dPlayer > DESPAWN_DIST) {
          respawnFar(car, playerPos);
          continue;
        }
      }

      const ai = car.ai;
      if (Math.hypot(ai.tx - pos.x, ai.tz - pos.z) < 7) chooseNextTarget(car);

      // Steer toward the target intersection.
      const desired = Math.atan2(ai.tx - pos.x, ai.tz - pos.z);
      const diff = wrapAngle(desired - car.angle);
      const steer = clamp(diff * 1.8, -1, 1);

      let throttle = 0.6;
      if (Math.abs(diff) > 1.1) throttle = 0.25; // slow for sharp turns
      if (car.speed > CRUISE_SPEED) throttle = 0; // coast at cruise speed
      if (car.speed > CRUISE_SPEED + 6) throttle = -0.4; // and brake back

      if (blockedAhead(car, cars, playerPos)) {
        throttle = car.speed > 1 ? -0.7 : 0; // brake, then wait
        ai.blockedTime += dt;
        if (ai.blockedTime > 1.6 && car.honkTimer <= 0) {
          car.honkTimer = 2.5;
          car.honked = true; // main.js may consume this flag directly
          if (onHonk) onHonk(car);
          ai.blockedTime = 0;
        }
      } else {
        ai.blockedTime = 0;
      }

      stepCar(car, throttle, steer, dt, colliders);
    }
  }

  // nearestCar(x, z, maxDist) — closest car (parked ones included, so
  // the player can find something to steal), or null when none is close.
  function nearestCar(x, z, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      const d = Math.hypot(c.group.position.x - x, c.group.position.z - z);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }

  return { cars, update, nearestCar };
}
