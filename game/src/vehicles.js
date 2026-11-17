// vehicles.js — car factory and arcade physics for Vice Harbor.
//
// Every car is built purely from primitives (stacked boxes + cylinders),
// so the game ships with zero external model assets. World convention:
// a car with angle θ faces the vector (sin θ, 0, cos θ); the THREE.Group
// gets rotation.y = θ and the mesh is modelled nose-toward +Z, so the
// group rotation and the physics heading always agree.

import * as THREE from '../vendor/three.module.min.js';

// Paint palette for civilian traffic — bright Vice-Harbor colours mixed
// with a few muted everyday shades.
export const CAR_COLORS = [
  0xd23b2e, // scarlet
  0x2e6fd2, // cobalt blue
  0xf2b134, // taxi yellow
  0x37b24d, // emerald
  0xe8e8ec, // pearl white
  0x22242a, // graphite
  0x9b59d0, // violet
  0xff7a1a, // tangerine
  0x17a2b8, // teal
  0xf06595, // hot pink
  0x868e96, // silver grey
  0x5f3dc4, // deep purple
];

// Sports cars draw from a louder sub-palette.
const SPORT_COLORS = [0xffd43b, 0xff3d5e, 0x22d3ee, 0xa3e635, 0xff7a1a];

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// A wheel is a pivot group (so the front pair can yaw for steering) with
// the tyre + hub meshes inside; the meshes spin around their axle.
function makeWheel(parent, x, z) {
  const pivot = new THREE.Group();
  pivot.position.set(x, 0.36, z);
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.95 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xb9bec9, roughness: 0.35, metalness: 0.7 });
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 14), tyreMat);
  tyre.rotation.z = Math.PI / 2; // cylinder axis Y -> X (the axle)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.3, 10), hubMat);
  hub.rotation.z = Math.PI / 2;
  pivot.add(tyre);
  pivot.add(hub);
  parent.add(pivot);
  return { pivot, spinMeshes: [tyre, hub] };
}

// makeCar(scene, { x, z, angle = 0, color, kind = 'civil' })
// kind: 'civil' | 'sport' | 'police'. Returns the car state object the
// rest of the game drives around; the mesh group lives at car.group.
export function makeCar(scene, opts = {}) {
  const kind = opts.kind || 'civil';
  const isSport = kind === 'sport';
  const isPolice = kind === 'police';
  const color = opts.color !== undefined
    ? opts.color
    : isSport
      ? SPORT_COLORS[Math.floor(Math.random() * SPORT_COLORS.length)]
      : isPolice
        ? 0xf2f3f5
        : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];

  const group = new THREE.Group();
  const angle = opts.angle || 0;
  group.position.set(opts.x || 0, 0, opts.z || 0);
  group.rotation.y = angle;

  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x191b20, roughness: 0.6, metalness: 0.3 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0e2233, roughness: 0.08, metalness: 0.9 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd7dbe2, roughness: 0.25, metalness: 0.85 });

  const bodyH = isSport ? 0.48 : 0.62;
  const bodyY = isSport ? 0.5 : 0.58;

  // Two stacked boxes — a wide lower body and a narrower cabin — read as
  // a rounded car silhouette from the game's camera distance.
  const lower = box(1.9, bodyH, 4.3, bodyMat, 0, bodyY, 0);
  group.add(lower);
  const cabinMat = isPolice ? darkMat : glassMat;
  const cabin = box(1.68, 0.5, isSport ? 1.7 : 2.0, cabinMat, 0, bodyY + bodyH / 2 + 0.24, isSport ? -0.35 : -0.22);
  group.add(cabin);
  // Glass band for civilian / sport cabins (police cabin is already dark).
  if (!isPolice) {
    group.add(box(1.74, 0.3, 1.5, glassMat, 0, bodyY + bodyH / 2 + 0.26, isSport ? -0.35 : -0.22));
  }
  // Bumpers and a chrome grille strip.
  group.add(box(1.94, 0.22, 0.18, darkMat, 0, 0.38, 2.16));
  group.add(box(1.94, 0.22, 0.18, darkMat, 0, 0.38, -2.16));
  group.add(box(1.2, 0.16, 0.06, chromeMat, 0, bodyY - 0.02, 2.17));

  if (isPolice) {
    // Black bonnet + boot panels over the white body = instant cop look.
    group.add(box(1.86, 0.07, 1.05, darkMat, 0, bodyY + bodyH / 2 + 0.02, 1.55));
    group.add(box(1.86, 0.07, 0.95, darkMat, 0, bodyY + bodyH / 2 + 0.02, -1.6));
    group.add(box(0.5, 0.56, 2.0, darkMat, -0.86, bodyY + 0.02, -0.2)); // door bands
    group.add(box(0.5, 0.56, 2.0, darkMat, 0.86, bodyY + 0.02, -0.2));
  }
  if (isSport) {
    // Rear wing on two struts.
    group.add(box(0.08, 0.28, 0.08, darkMat, -0.7, 0.95, -1.95));
    group.add(box(0.08, 0.28, 0.08, darkMat, 0.7, 0.95, -1.95));
    group.add(box(1.85, 0.06, 0.42, darkMat, 0, 1.12, -1.98));
    group.add(box(1.7, 0.1, 0.5, darkMat, 0, 0.34, 2.05)); // front splitter
  }

  // Headlights: emissive only (real light sources for a whole traffic
  // fleet would kill the frame rate). Taillights glow red.
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x444433, emissive: 0xffe9a8, emissiveIntensity: 2.2,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x330d0d, emissive: 0xff2a22, emissiveIntensity: 1.6,
  });
  group.add(box(0.42, 0.14, 0.06, headMat, -0.62, bodyY + 0.04, 2.16));
  group.add(box(0.42, 0.14, 0.06, headMat, 0.62, bodyY + 0.04, 2.16));
  group.add(box(0.46, 0.12, 0.06, tailMat, -0.6, bodyY + 0.06, -2.16));
  group.add(box(0.46, 0.12, 0.06, tailMat, 0.6, bodyY + 0.06, -2.16));

  // Police light bar: red/blue emissive blocks whose materials police.js
  // flashes by toggling emissiveIntensity.
  let lightBar = null;
  if (isPolice) {
    group.add(box(1.24, 0.09, 0.36, darkMat, 0, bodyY + bodyH / 2 + 0.54, -0.22));
    const redMat = new THREE.MeshStandardMaterial({
      color: 0x330000, emissive: 0xff2020, emissiveIntensity: 0.4,
    });
    const blueMat = new THREE.MeshStandardMaterial({
      color: 0x000033, emissive: 0x2255ff, emissiveIntensity: 3.2,
    });
    group.add(box(0.56, 0.14, 0.3, redMat, -0.31, bodyY + bodyH / 2 + 0.62, -0.22));
    group.add(box(0.56, 0.14, 0.3, blueMat, 0.31, bodyY + bodyH / 2 + 0.62, -0.22));
    lightBar = { red: redMat, blue: blueMat };
  }

  // Wheels: front pair steers (pivot yaw), all four spin with speed.
  const fl = makeWheel(group, -0.98, 1.42);
  const fr = makeWheel(group, 0.98, 1.42);
  const rl = makeWheel(group, -0.98, -1.42);
  const rr = makeWheel(group, 0.98, -1.42);
  const spinMeshes = [...fl.spinMeshes, ...fr.spinMeshes, ...rl.spinMeshes, ...rr.spinMeshes];

  const car = {
    group,
    angle,
    speed: 0,
    kind,
    color,
    health: 100,
    occupied: false,
    radius: 2.2,
    honkTimer: 0,
    honked: false,
    parked: false,
    dead: false,
    inWater: false,
    maxSpeed: isSport ? 40 : 34,
    steerVisual: 0,
    bodyMat,
    wheels: { fl: fl.pivot, fr: fr.pivot, rl: rl.pivot, rr: rr.pivot },
    lightBar,
    smoke: null,
    _spinMeshes: spinMeshes,
    _wheelSpin: 0,
  };
  scene.add(group);
  return car;
}

const WORLD_LIMIT = 262;   // playable ground is 560x560; keep cars on it
const WATER_EDGE_Z = 234;   // shoreline on the +Z side of the map
const ACCEL = 14;           // units / s^2 at full throttle
const MAX_REVERSE = 10;

// stepCar(car, throttle, steer, dt, colliders)
// throttle, steer in [-1, 1]. Arcade model: strong acceleration, speed-
// sensitive steering (positive lock at a crawl, fading as speed builds),
// drag, and circle-vs-AABB building collision resolved along the axis of
// least penetration.
export function stepCar(car, throttle, steer, dt, colliders) {
  if (!dt || dt <= 0) return;
  throttle = Math.max(-1, Math.min(1, throttle || 0));
  steer = Math.max(-1, Math.min(1, steer || 0));
  const maxSpeed = car.dead ? 0 : (car.maxSpeed || 34);

  // --- longitudinal ---------------------------------------------------
  if (!car.dead && throttle !== 0) {
    // Pushing against the current direction of travel = braking, which
    // bites about twice as hard as the engine pulls.
    const braking = (throttle > 0 && car.speed < -0.5) || (throttle < 0 && car.speed > 0.5);
    car.speed += throttle * ACCEL * (braking ? 2.1 : 1) * dt;
  }
  const dragK = car.inWater ? 2.6 : 0.55; // water nearly stalls a car
  car.speed -= car.speed * dragK * dt;
  if (throttle === 0) car.speed -= car.speed * 0.9 * dt; // engine braking
  if (throttle === 0 && Math.abs(car.speed) < 0.05) car.speed = 0;
  car.speed = Math.max(-MAX_REVERSE, Math.min(maxSpeed, car.speed));
  if (car.dead) car.speed = Math.max(0, car.speed - 24 * dt);

  // --- steering ---------------------------------------------------------
  const speedAbs = Math.abs(car.speed);
  const grip = Math.min(speedAbs / 7, 1); // wheels can't turn a parked car
  const fade = Math.max(1 - (speedAbs / (maxSpeed + 0.001)) * 0.55, 0.3);
  if (speedAbs > 0.01) {
    car.angle += steer * 2.0 * grip * fade * dt * Math.sign(car.speed);
  }
  car.steerVisual = steer * 0.45 * grip;

  // --- integrate --------------------------------------------------------
  const fx = Math.sin(car.angle);
  const fz = Math.cos(car.angle);
  let nx = car.group.position.x + fx * car.speed * dt;
  let nz = car.group.position.z + fz * car.speed * dt;

  // Shoreline: a dry car stops at the water's edge instead of driving in.
  if (!car.inWater && nz > WATER_EDGE_Z) {
    nz = WATER_EDGE_Z;
    if (car.speed > 0) car.speed *= 0.4;
  }

  // --- building collision (circle vs AABB, smallest-axis push-out) -----
  if (colliders) {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const dx = nx - c.x;
      const dz = nz - c.z;
      const penX = c.hw + car.radius - Math.abs(dx);
      if (penX <= 0) continue;
      const penZ = c.hd + car.radius - Math.abs(dz);
      if (penZ <= 0) continue;
      if (penX < penZ) {
        nx = c.x + (dx >= 0 ? 1 : -1) * (c.hw + car.radius);
      } else {
        nz = c.z + (dz >= 0 ? 1 : -1) * (c.hd + car.radius);
      }
      const impact = Math.abs(car.speed);
      if (impact > 7) damageCar(car, (impact - 7) * 1.1); // hard hits hurt
      car.speed *= 0.4; // any solid hit cuts 60% of the speed
    }
  }

  // --- world bounds -----------------------------------------------------
  nx = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, nx));
  nz = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, nz));

  car.group.position.x = nx;
  car.group.position.z = nz;
  car.group.rotation.y = car.angle;

  // --- cosmetics: rolling wheels, steering yaw, honk cooldown ----------
  car._wheelSpin += (car.speed * dt) / 0.36;
  for (let i = 0; i < car._spinMeshes.length; i++) {
    car._spinMeshes[i].rotation.x = car._wheelSpin;
  }
  car.wheels.fl.rotation.y = car.steerVisual;
  car.wheels.fr.rotation.y = car.steerVisual;
  if (car.honkTimer > 0) car.honkTimer = Math.max(0, car.honkTimer - dt);
}

// damageCar(car, n) — shave health, darken the paintwork as it falls,
// and at zero the car dies: engine off, body scorched, smoke sprite on.
export function damageCar(car, n) {
  if (!car || !n || n <= 0 || car.dead) return;
  car.health = Math.max(0, car.health - n);
  const t = car.health / 100;
  if (car.bodyMat) {
    car.bodyMat.color.setHex(car.color);
    car.bodyMat.color.multiplyScalar(0.35 + 0.65 * t);
    car.bodyMat.roughness = 0.35 + (1 - t) * 0.5;
  }
  if (car.health <= 0) {
    car.dead = true;
    car.speed = 0;
    if (car.bodyMat) {
      car.bodyMat.color.setHex(0x2a2c31);
      car.bodyMat.roughness = 0.9;
    }
    if (!car.smoke) {
      const mat = new THREE.SpriteMaterial({
        color: 0x8a8f98, transparent: true, opacity: 0.55, depthWrite: false,
      });
      const smoke = new THREE.Sprite(mat);
      smoke.position.set(0, 1.6, 1.1); // above the bonnet
      smoke.scale.set(1.7, 1.7, 1);
      car.group.add(smoke);
      car.smoke = smoke;
    }
  }
}
