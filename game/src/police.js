// police.js — Vice Harbor police response.
//
// createPolice(scene, city, wanted) keeps a fleet of patrol cars and foot
// officers matched to the current wanted level. Cars pursue with the shared
// vehicle physics (stepCar), try to ram or box the target, and drop officers
// when they stop next to a target on foot. Officers chase on foot and stop
// at standoff distance to aim.

import * as THREE from '../vendor/three.module.min.js';
import { makeCar, stepCar } from './vehicles.js';

const ROAD_LINES = [];
for (let v = -200; v <= 200; v += 40) ROAD_LINES.push(v);

// Desired response per wanted level: [cars, foot officers].
const RESPONSE = {
  0: [0, 0],
  1: [1, 0],
  2: [2, 0],
  3: [3, 2],
  4: [4, 3],
  5: [5, 4],
};

function rand(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

function nearestRoadLine(v) {
  let best = ROAD_LINES[0];
  for (const line of ROAD_LINES) {
    if (Math.abs(line - v) < Math.abs(best - v)) best = line;
  }
  return best;
}

// A spawn point on a road, 60-90 units from the target, snapped onto a road
// line so the car starts on tarmac and out of the immediate view centre.
function roadSpawnNear(tx, tz) {
  const ang = rand(0, Math.PI * 2);
  const dist = rand(60, 90);
  let x = tx + Math.sin(ang) * dist;
  let z = tz + Math.cos(ang) * dist;
  x = Math.max(-252, Math.min(252, x));
  z = Math.max(-252, Math.min(252, z));
  if (Math.random() < 0.5) x = nearestRoadLine(x);
  else z = nearestRoadLine(z);
  return { x, z, angle: Math.atan2(tx - x, tz - z) };
}

// Simple dark-uniform humanoid for foot officers (~1.8 tall, origin at the
// ground). Returns the group plus limb pivots and an aim-arm reference.
function buildOfficer() {
  const group = new THREE.Group();
  const uniform = new THREE.MeshLambertMaterial({ color: 0x1b2a6b });
  const pants = new THREE.MeshLambertMaterial({ color: 0x141c3a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe0ac69 });
  const gear = new THREE.MeshLambertMaterial({ color: 0x0d0d12 });

  const legGeo = new THREE.BoxGeometry(0.16, 0.78, 0.18);
  legGeo.translate(0, -0.39, 0);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.11, 0.78, 0);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.11, 0.78, 0);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.62, 0.25), uniform);
  torso.position.y = 1.09;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.34, 0.27), gear);
  vest.position.y = 1.12;
  const badge = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.09, 0.02),
    new THREE.MeshLambertMaterial({ color: 0xf1c40f, emissive: 0x554400 })
  );
  badge.position.set(0.13, 1.22, 0.14);

  const armGeo = new THREE.BoxGeometry(0.11, 0.66, 0.13);
  armGeo.translate(0, -0.30, 0);
  const armL = new THREE.Mesh(armGeo, uniform);
  armL.position.set(-0.30, 1.38, 0);
  const armR = new THREE.Mesh(armGeo, uniform);
  armR.position.set(0.30, 1.38, 0);
  // Sidearm in the right hand so the aim pose reads clearly.
  const pistol = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.22), gear);
  pistol.position.set(0, -0.62, 0.06);
  armR.add(pistol);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skin);
  head.position.y = 1.58;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.09, 10), uniform);
  cap.position.y = 1.70;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.14), uniform);
  brim.position.set(0, 1.66, 0.18);

  group.add(legL, legR, torso, vest, badge, armL, armR, head, cap, brim);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group, legL, legR, armL, armR };
}

export function createPolice(scene, city, wanted) {
  const cars = [];       // live police car objects from makeCar()
  const officers = [];   // { group, legL, legR, armL, armR, health, state, walkPhase, fromCar }
  const carMeta = new Map(); // car -> { droppedOfficers: bool, stuckTimer }
  let flashTime = 0;
  let respawnTimer = 0;
  let targetInfo = { armed: false, firing: false };

  // Extra intel about the target (set by the game loop): whether the player
  // is visibly armed / currently firing. Officers use it for their pose.
  function setTargetInfo(info) {
    if (info) targetInfo = Object.assign({}, targetInfo, info);
  }

  function spawnCar(target) {
    const s = roadSpawnNear(target.x, target.z);
    const car = makeCar(scene, { kind: 'police', x: s.x, z: s.z, angle: s.angle });
    car.angle = s.angle;
    if (car.group) car.group.rotation.y = s.angle;
    carMeta.set(car, { droppedOfficers: false, stuckTimer: 0 });
    cars.push(car);
    return car;
  }

  function removeCar(car) {
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
    carMeta.delete(car);
    if (car.group) scene.remove(car.group);
  }

  function spawnOfficer(x, z, fromCar) {
    const body = buildOfficer();
    body.group.position.set(x + rand(-1.5, 1.5), 0, z + rand(-1.5, 1.5));
    scene.add(body.group);
    const off = {
      group: body.group,
      legL: body.legL,
      legR: body.legR,
      armL: body.armL,
      armR: body.armR,
      health: 60,
      state: 'chase',
      walkPhase: rand(0, Math.PI * 2),
      fromCar: fromCar || null,
    };
    officers.push(off);
    return off;
  }

  function hurtOfficer(off, dmg) {
    if (!off || off.state === 'down') return false;
    off.health -= dmg;
    if (off.health <= 0) {
      off.health = 0;
      off.state = 'down';
      off.group.rotation.x = -Math.PI / 2;
      off.group.position.y = 0.22;
      return true;
    }
    return false;
  }

  // Alternate the light bar between red and blue several times a second.
  function flashLights(dt) {
    flashTime += dt;
    const phase = Math.floor(flashTime * 6) % 2;
    for (const car of cars) {
      const bar = car.lightBar;
      if (!bar) continue;
      // vehicles.js exposes the light bar as { red, blue } materials:
      // flash them by toggling emissiveIntensity directly.
      if (bar.red && bar.blue) {
        bar.red.emissiveIntensity = phase === 0 ? 2.6 : 0.15;
        bar.blue.emissiveIntensity = phase === 0 ? 0.15 : 2.6;
        continue;
      }
      bar.traverse((o) => {
        if (o.isMesh && o.material && 'emissiveIntensity' in o.material) {
          if (!o.userData.baseEmissive) {
            o.userData.baseEmissive = o.material.emissive
              ? o.material.emissive.getHex()
              : 0xff0000;
          }
          const isRedSide = o.position.x <= 0;
          const lit = (phase === 0) === isRedSide;
          if (o.material.emissive) {
            o.material.emissive.setHex(isRedSide ? 0xff2020 : 0x2040ff);
          }
          o.material.emissiveIntensity = lit ? 2.6 : 0.15;
        }
      });
    }
  }

  function driveCar(car, dt, target) {
    const pos = car.group.position;
    // Aim slightly ahead of the target's motion so pursuits cut corners
    // instead of trailing directly behind.
    let aimX = target.x;
    let aimZ = target.z;
    if (target.car) {
      const lead = Math.min(10, (target.speed || 0) * 0.55);
      aimX += Math.sin(target.car.angle) * lead;
      aimZ += Math.cos(target.car.angle) * lead;
    }
    const dx = aimX - pos.x;
    const dz = aimZ - pos.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let diff = want - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 1.6));

    let throttle = 1;
    if (Math.abs(diff) > 2.2) throttle = -0.55;      // badly misaligned: back up
    else if (Math.abs(diff) > 1.1) throttle = 0.45;  // sharp turn: ease off

    const meta = carMeta.get(car);
    // Stuck detection: barely moving while throttling -> reverse briefly.
    if (Math.abs(car.speed) < 0.4 && throttle > 0) meta.stuckTimer += dt;
    else meta.stuckTimer = 0;
    if (meta.stuckTimer > 0.9) {
      throttle = -0.8;
      if (meta.stuckTimer > 1.6) meta.stuckTimer = 0;
    }

    // Target on foot and we are on top of them: stop and let officers out.
    if (!target.car && dist < 4) {
      throttle = 0;
      stepCar(car, -car.speed * 2.2, 0, dt, city.colliders);
      if (!meta.droppedOfficers && wanted.level >= 3) {
        meta.droppedOfficers = true;
        const want = RESPONSE[Math.min(5, wanted.level)][1];
        const mine = officers.filter((o) => o.fromCar === car && o.state !== 'down').length;
        const total = officers.filter((o) => o.state !== 'down').length;
        const n = Math.min(2, Math.max(0, want - total), 2 - mine);
        for (let i = 0; i < n; i++) spawnOfficer(pos.x, pos.z, car);
      }
      return;
    }

    // Ramming range: keep the pressure on instead of braking.
    if (target.car && dist < 7) throttle = 1;
    stepCar(car, throttle, steer, dt, city.colliders);
  }

  function updateOfficer(off, dt, target) {
    if (off.state === 'down') return;
    const p = off.group.position;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const dist = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    off.group.rotation.y = angle;

    if (dist > 6) {
      off.state = 'chase';
      const step = Math.min(dist - 5.2, 5.5 * dt);
      p.x += Math.sin(angle) * step;
      p.z += Math.cos(angle) * step;
      off.walkPhase += dt * 11;
      const s = Math.sin(off.walkPhase) * 0.6;
      off.legL.rotation.x = s;
      off.legR.rotation.x = -s;
      off.armL.rotation.x = -s * 0.7;
      off.armR.rotation.x = targetInfo.armed ? -1.35 : s * 0.7;
      p.y = Math.abs(Math.sin(off.walkPhase)) * 0.05;
    } else {
      // Standoff: stop, plant feet, raise the sidearm toward the target.
      off.state = 'aim';
      off.legL.rotation.x *= 0.8;
      off.legR.rotation.x *= 0.8;
      off.armL.rotation.x *= 0.85;
      off.armR.rotation.x = -1.45; // arm straight out, pistol level
      p.y = 0;
    }

    // Officers stay out of the buildings too.
    const cols = city.colliders || [];
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const ddx = p.x - c.x;
      const ddz = p.z - c.z;
      const px = c.hw + 0.45 - Math.abs(ddx);
      const pz = c.hd + 0.45 - Math.abs(ddz);
      if (px > 0 && pz > 0) {
        if (px < pz) p.x = c.x + (ddx >= 0 ? 1 : -1) * (c.hw + 0.45);
        else p.z = c.z + (ddz >= 0 ? 1 : -1) * (c.hd + 0.45);
      }
    }
  }

  function update(dt, target) {
    const level = Math.max(0, Math.min(5, wanted.level | 0));
    const [wantCars, wantOfficers] = RESPONSE[level];

    // Level 0 (or dropping): units leave — cars are removed once they are
    // not right on top of the player, officers walk off with them.
    if (level === 0) {
      for (let i = cars.length - 1; i >= 0; i--) removeCar(cars[i]);
      for (let i = officers.length - 1; i >= 0; i--) {
        scene.remove(officers[i].group);
      }
      officers.length = 0;
      return;
    }

    if (!target) return;

    respawnTimer -= dt;
    const respawnDelay = level >= 5 ? 1.2 : 3.5;

    // Trim excess / wrecked / stray units.
    for (let i = cars.length - 1; i >= 0; i--) {
      const car = cars[i];
      const p = car.group.position;
      const d = Math.hypot(p.x - target.x, p.z - target.z);
      if (cars.length > wantCars || (car.health !== undefined && car.health <= 0) || d > 190) {
        removeCar(car);
      }
    }
    // Top the fleet up to the level's strength.
    if (cars.length < wantCars && respawnTimer <= 0) {
      spawnCar(target);
      respawnTimer = respawnDelay;
    }
    // At the higher levels a couple of officers also arrive on foot patrol.
    const liveOfficers = officers.filter((o) => o.state !== 'down').length;
    if (wantOfficers > 0 && liveOfficers < Math.min(2, wantOfficers) && cars.length > 0 && respawnTimer <= 0) {
      const anchor = cars[0].group.position;
      spawnOfficer(anchor.x, anchor.z, null);
      respawnTimer = respawnDelay;
    }
    // Prune officers who have fallen far behind the action (never the downed).
    for (let i = officers.length - 1; i >= 0; i--) {
      const o = officers[i];
      if (o.state === 'down') continue;
      const p = o.group.position;
      if (Math.hypot(p.x - target.x, p.z - target.z) > 200) {
        scene.remove(o.group);
        officers.splice(i, 1);
      }
    }

    flashLights(dt);
    for (const car of cars) driveCar(car, dt, target);
    for (const off of officers) updateOfficer(off, dt, target);
  }

  return { cars, officers, update, setTargetInfo, hurtOfficer };
}
