// police.js — police cars that pursue and ram, foot cops at high wanted levels.
import * as THREE from 'three';
import { spawnCar, removeCar } from './vehicles.js';
import { collideBuildings, clampToCity } from './city.js';
import { damagePlayer } from './player.js';

const MAX_POLICE_CARS = 4;

export function updatePolice(G, dt) {
  const wanted = G.wantedSystem.level;
  const p = G.playerPos();

  // --- Spawn / despawn police cars to match the wanted level. ---
  let policeCars = G.cars.filter((c) => c.police);
  const wantCars = wanted === 0 ? 0 : Math.min(MAX_POLICE_CARS, wanted);
  if (policeCars.length < wantCars && G.time - (G.lastPoliceSpawn || 0) > 1.2) {
    G.lastPoliceSpawn = G.time;
    const angle = G.rng() * Math.PI * 2;
    const dist = 55 + G.rng() * 25;
    const x = p.x + Math.cos(angle) * dist;
    const z = p.z + Math.sin(angle) * dist;
    const clamped = clampToCity(G, x, z, 8);
    const car = spawnCar(G, clamped.x, clamped.z, Math.atan2(p.x - clamped.x, p.z - clamped.z), {
      police: true, color: 0x1a1a2e, ai: 'police',
    });
    car.police = true;
    G.audio.sirenBlip();
  }
  if (policeCars.length > wantCars) {
    // Remove the farthest one.
    policeCars.sort((a, b) => {
      const da = (a.mesh.position.x - p.x) ** 2 + (a.mesh.position.z - p.z) ** 2;
      const db = (b.mesh.position.x - p.x) ** 2 + (b.mesh.position.z - p.z) ** 2;
      return db - da;
    });
    removeCar(G, policeCars[0]);
    policeCars = G.cars.filter((c) => c.police);
  }

  // --- Pursuit driving: steer toward the player, ram when close. ---
  for (const car of policeCars) {
    // A police car the player stole must not drive itself.
    if (car === G.player.vehicle) continue;
    const dx = p.x - car.mesh.position.x;
    const dz = p.z - car.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    const targetYaw = Math.atan2(dx, dz);
    let dyaw = targetYaw - car.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    car.yaw += Math.max(-2.4 * dt, Math.min(2.4 * dt, dyaw));
    const topSpeed = G.player.onFoot ? 16 : 30;
    const want = dist > 6 ? topSpeed : topSpeed * 0.5;
    car.speed += Math.sign(want - car.speed) * 16 * dt;
    car.speed = Math.max(0, Math.min(topSpeed + 4, car.speed));
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    let nx = car.mesh.position.x + fx * car.speed * dt;
    let nz = car.mesh.position.z + fz * car.speed * dt;
    const fixed = collideBuildings(G, nx, nz, 1.6);
    if (fixed.x !== nx || fixed.z !== nz) car.speed *= 0.5;
    nx = fixed.x; nz = fixed.z;
    const clamped = clampToCity(G, nx, nz, 4);
    car.mesh.position.x = clamped.x;
    car.mesh.position.z = clamped.z;
    car.mesh.rotation.y = car.yaw;
    // Flashing light bar.
    car.lightPhase += dt * 9;
    if (car.mesh.userData.lightBar) {
      car.mesh.userData.lightBar.material.color.setHex(
        Math.sin(car.lightPhase) > 0 ? 0xff2e4d : 0x2e7bff
      );
    }
    // Ram the player's car.
    if (!G.player.onFoot && G.player.vehicle && dist < 3.4) {
      const pv = G.player.vehicle;
      pv.speed *= 0.92;
      pv.mesh.position.x += fx * 2.4 * dt * 10;
      pv.mesh.position.z += fz * 2.4 * dt * 10;
      if (G.time - (G.lastRamSound || 0) > 0.8) {
        G.audio.crash();
        G.lastRamSound = G.time;
      }
    }
    // Run the player down on foot.
    if (G.player.onFoot && dist < 2.2) {
      damagePlayer(G, 12 * dt * 3, 'run over by police');
    }
  }

  // --- Foot cops at wanted >= 3, only while the player is on foot
  // (they cannot catch a car, so don't spawn them to chase one). ---
  const wantFoot = (wanted >= 3 && G.player.onFoot) ? Math.min(3, wanted - 2) : 0;
  if (G.policeFoot.length < wantFoot && G.time - (G.lastFootSpawn || 0) > 2) {
    G.lastFootSpawn = G.time;
    const angle = G.rng() * Math.PI * 2;
    const mesh = makeCopMesh();
    const x = p.x + Math.cos(angle) * 22;
    const z = p.z + Math.sin(angle) * 22;
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    G.policeFoot.push({ mesh, yaw: 0, walkPhase: 0, attackTimer: 0 });
  }
  while (G.policeFoot.length > wantFoot) {
    const cop = G.policeFoot.pop();
    G.scene.remove(cop.mesh);
  }
  for (const cop of G.policeFoot) {
    const dx = p.x - cop.mesh.position.x;
    const dz = p.z - cop.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    cop.yaw = Math.atan2(dx, dz);
    const speed = 6.2;
    cop.mesh.position.x += Math.sin(cop.yaw) * speed * dt;
    cop.mesh.position.z += Math.cos(cop.yaw) * speed * dt;
    cop.mesh.rotation.y = cop.yaw;
    cop.walkPhase += dt * 12;
    const s = Math.sin(cop.walkPhase);
    cop.mesh.userData.legL.position.z = s * 0.2;
    cop.mesh.userData.legR.position.z = -s * 0.2;
    if (dist < 2.0 && G.player.onFoot) {
      cop.attackTimer -= dt;
      if (cop.attackTimer <= 0) {
        cop.attackTimer = 0.8;
        damagePlayer(G, 9, 'beaten by police');
        G.ui.toast('The cops are beating you down!');
      }
    }
  }

  // Siren audible whenever a police car is actually pursuing (not the one
  // the player stole).
  G.audio.setSiren(policeCars.some((c) => c !== G.player.vehicle));
}

function makeCopMesh() {
  const g = new THREE.Group();
  const navy = new THREE.MeshStandardMaterial({ color: 0x1a2a5e, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a06b, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.35), navy);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), skin);
  head.position.y = 1.66;
  g.add(head);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.12, 10), navy);
  hat.position.y = 1.84;
  g.add(hat);
  for (const x of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.22), navy);
    leg.position.set(x, 0.34, 0);
    g.add(leg);
    g.userData['leg' + (x < 0 ? 'L' : 'R')] = leg;
  }
  return g;
}
