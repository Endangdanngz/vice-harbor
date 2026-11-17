// vehicles.js — car meshes + arcade driving physics + enter/exit.
import * as THREE from 'three';
import { collideBuildings, clampToCity } from './city.js';

const CAR_COLORS = [0xff5c5c, 0x35f0ff, 0xffd23e, 0x7dff9b, 0xff9de2, 0xffffff, 0xff7a3c, 0x9b7bff];

export function makeCarMesh(color, isPolice) {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x101018, roughness: 0.2, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  car.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), darkMat);
  cabin.position.set(0, 1.1, -0.2);
  car.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0a });
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 0.36, z);
    car.add(w);
  }
  // Headlights + taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6cf });
  for (const x of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), headMat);
    h.position.set(x, 0.62, 2.22);
    car.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2e4d });
  for (const x of [-0.65, 0.65]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), tailMat);
    t.position.set(x, 0.62, -2.22);
    car.add(t);
  }
  if (isPolice) {
    const barMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4), barMat);
    bar.position.set(0, 1.45, -0.2);
    car.add(bar);
    car.userData.lightBar = bar;
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.02, 0.2, 4.42),
      new THREE.MeshBasicMaterial({ color: 0x111111 })
    );
    stripe.position.y = 0.72;
    car.add(stripe);
  }
  car.userData.isPolice = !!isPolice;
  return car;
}

export function spawnCar(G, x, z, yaw, opts = {}) {
  const color = opts.color !== undefined ? opts.color : CAR_COLORS[Math.floor(G.rng() * CAR_COLORS.length)];
  const mesh = makeCarMesh(color, !!opts.police);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = yaw;
  G.scene.add(mesh);
  const car = {
    mesh, yaw, speed: 0,
    color, police: !!opts.police,
    parked: !!opts.parked,
    hasDriver: opts.hasDriver !== false,
    marked: !!opts.marked,
    ai: opts.ai || null,      // 'traffic' | 'police' | null (player-driven)
    targetSpeed: 0,
    stuckTimer: 0,
    lightPhase: Math.random() * Math.PI * 2,
  };
  if (car.marked) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.12, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23e })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.2;
    mesh.add(ring);
    car.markerRing = ring;
  }
  G.cars.push(car);
  return car;
}

export function removeCar(G, car) {
  G.scene.remove(car.mesh);
  const i = G.cars.indexOf(car);
  if (i >= 0) G.cars.splice(i, 1);
}

// Arcade driving for the player car. Returns nothing; mutates car.
export function updatePlayerCar(G, car, dt) {
  const input = G.input;
  const maxSpeed = 34, maxReverse = 10;
  const accel = 22, brake = 34, drag = 6.5;
  let throttle = 0;
  if (G.demoAuto) throttle = 1;
  else if (input.down('KeyW') || input.down('ArrowUp')) throttle = 1;
  else if (input.down('KeyS') || input.down('ArrowDown')) throttle = -1;
  const handbrake = input.down('Space');

  if (throttle > 0) car.speed += accel * dt;
  else if (throttle < 0) {
    if (car.speed > 0.5) car.speed -= brake * dt;
    else car.speed -= accel * 0.5 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * drag * dt;
    if (Math.abs(car.speed) < 0.3) car.speed = 0;
  }
  if (handbrake) car.speed -= Math.sign(car.speed) * 26 * dt;
  car.speed = Math.max(-maxReverse, Math.min(maxSpeed, car.speed));

  let steer = 0;
  if (input.down('KeyA') || input.down('ArrowLeft')) steer = 1;
  if (input.down('KeyD') || input.down('ArrowRight')) steer = -1;
  if (G.demoAuto) steer = G.demoSteer || 0;
  const steerFactor = Math.min(1, Math.abs(car.speed) / 8);
  car.yaw += steer * 1.9 * steerFactor * dt * Math.sign(car.speed || 1);

  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  let nx = car.mesh.position.x + fx * car.speed * dt;
  let nz = car.mesh.position.z + fz * car.speed * dt;
  const fixed = collideBuildings(G, nx, nz, 1.6);
  if (fixed.x !== nx || fixed.z !== nz) {
    car.speed *= 0.55;
    if (Math.abs(car.speed) > 6) G.audio.crash();
  }
  nx = fixed.x; nz = fixed.z;
  const clamped = clampToCity(G, nx, nz, 4);
  nx = clamped.x; nz = clamped.z;
  car.mesh.position.x = nx;
  car.mesh.position.z = nz;
  car.mesh.rotation.y = car.yaw;
  // Slight body roll + lean for feel.
  car.mesh.rotation.z = -steer * 0.05 * steerFactor;
  car.mesh.rotation.x = throttle > 0 ? -0.02 : 0;
  if (car.markerRing) car.markerRing.rotation.z += dt * 1.5;

  // Don't ghost through other cars. A rear-end shoves the car ahead forward
  // (so slow traffic doesn't stall the player); a side swipe pushes both
  // cars apart laterally. The speed penalty fires at most once per impact.
  // (fx/fz are the car's forward vector, declared above.)
  for (const other of G.cars) {
    if (other === car) continue;
    const dx = car.mesh.position.x - other.mesh.position.x;
    const dz = car.mesh.position.z - other.mesh.position.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 3.4 * 3.4 && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const nx = dx / d, nz = dz / d;
      // >0 when the other car is ahead of the player (rear-end).
      const ahead = -(nx * fx + nz * fz);
      if (ahead > 0.7) {
        const shove = 3.4 - d;
        other.mesh.position.x += fx * shove;
        other.mesh.position.z += fz * shove;
        const fixed = collideBuildings(G, other.mesh.position.x, other.mesh.position.z, 1.6);
        other.mesh.position.x = fixed.x;
        other.mesh.position.z = fixed.z;
        if (Math.abs(car.speed) > 12 && G.time - (G.lastCarBump || -9) > 0.5) {
          car.speed *= 0.92;
          G.audio.crash();
          G.lastCarBump = G.time;
        }
      } else {
        const push = (3.4 - d) / 2;
        car.mesh.position.x += nx * push;
        car.mesh.position.z += nz * push;
        other.mesh.position.x -= nx * push;
        other.mesh.position.z -= nz * push;
      }
    }
  }
}

// Find the nearest enterable car to a point (parked, traffic, or police).
export function nearestCar(G, x, z, maxDist) {
  let best = null, bestD = maxDist;
  for (const car of G.cars) {
    const dx = car.mesh.position.x - x, dz = car.mesh.position.z - z;
    const d = Math.hypot(dx, dz);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}
