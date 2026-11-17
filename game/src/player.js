// player.js — on-foot character: mesh, movement, camera-relative controls, enter/exit.
import * as THREE from 'three';
import { collideBuildings, clampToCity } from './city.js';
import { nearestCar } from './vehicles.js';

export function makePlayerMesh() {
  const p = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0xff2ea6, roughness: 0.7 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x1c2a4a, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.36), jacket);
  body.position.y = 1.05;
  p.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.68;
  p.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 12),
    new THREE.MeshStandardMaterial({ color: 0x35f0ff, roughness: 0.5 }));
  cap.position.y = 1.86;
  p.add(cap);
  for (const x of [-0.16, 0.16]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.24), pants);
    leg.position.set(x, 0.36, 0);
    p.add(leg);
    p.userData['leg' + (x < 0 ? 'L' : 'R')] = leg;
  }
  for (const x of [-0.4, 0.4]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.18), jacket);
    arm.position.set(x, 1.05, 0);
    p.add(arm);
    p.userData['arm' + (x < 0 ? 'L' : 'R')] = arm;
  }
  return p;
}

export function createPlayer(G) {
  const mesh = makePlayerMesh();
  G.scene.add(mesh);
  const player = {
    mesh,
    pos: mesh.position,
    yaw: 0,
    health: 100,
    cash: 0,
    onFoot: true,
    vehicle: null,
    walkPhase: 0,
    regenTimer: 0,
    invulnTimer: 0,
  };
  G.player = player;
  return player;
}

export function updatePlayerOnFoot(G, dt) {
  const p = G.player;
  const input = G.input;
  const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
  const speed = sprint ? 9.5 : 5.2;
  let mx = 0, mz = 0;
  if (input.down('KeyW') || input.down('ArrowUp')) mz += 1;
  if (input.down('KeyS') || input.down('ArrowDown')) mz -= 1;
  if (input.down('KeyA') || input.down('ArrowLeft')) mx -= 1;
  if (input.down('KeyD') || input.down('ArrowRight')) mx += 1;
  if (G.demoAuto && G.demo !== 2) { mz = 1; mx = 0; }

  const moving = mx !== 0 || mz !== 0;
  if (moving) {
    const len = Math.hypot(mx, mz);
    mx /= len; mz /= len;
    // Camera-relative movement.
    const cy = G.camYaw;
    const fx = Math.sin(cy), fz = Math.cos(cy);
    const rx = Math.cos(cy), rz = -Math.sin(cy);
    const wx = fx * mz + rx * mx;
    const wz = fz * mz + rz * mx;
    let nx = p.pos.x + wx * speed * dt;
    let nz = p.pos.z + wz * speed * dt;
    const fixed = collideBuildings(G, nx, nz, 0.6);
    nx = fixed.x; nz = fixed.z;
    const clamped = clampToCity(G, nx, nz, 3);
    p.pos.x = clamped.x; p.pos.z = clamped.z;
    p.yaw = Math.atan2(wx, wz);
    p.mesh.rotation.y = p.yaw;
    // Walk cycle.
    p.walkPhase += dt * (sprint ? 13 : 9);
    const s = Math.sin(p.walkPhase);
    p.mesh.userData.legL.position.z = s * 0.22;
    p.mesh.userData.legR.position.z = -s * 0.22;
    p.mesh.userData.armL.position.z = -s * 0.18;
    p.mesh.userData.armR.position.z = s * 0.18;
    p.mesh.position.y = Math.abs(Math.sin(p.walkPhase)) * 0.05;
  } else {
    p.mesh.userData.legL.position.z = 0;
    p.mesh.userData.legR.position.z = 0;
    p.mesh.userData.armL.position.z = 0;
    p.mesh.userData.armR.position.z = 0;
    p.mesh.position.y = 0;
  }

  // Slow health regen when calm.
  p.regenTimer += dt;
  if (G.wantedSystem.level === 0 && p.health < 100 && p.regenTimer > 1) {
    p.health = Math.min(100, p.health + 2);
    p.regenTimer = 0;
  }
  if (p.invulnTimer > 0) p.invulnTimer -= dt;
}

export function tryEnterExitCar(G) {
  const p = G.player;
  if (p.onFoot) {
    const car = nearestCar(G, p.pos.x, p.pos.z, 4.2);
    if (!car) return;
    // Any car can be stolen, police cars included (their pursuit AI is
    // switched off on entry and police.js skips the player's own car).
    p.vehicle = car;
    p.onFoot = false;
    car.ai = null;
    car.parked = false;
    if (car.hasDriver) {
      car.hasDriver = false;
      // The driver flees on foot.
      G.events.push({ type: 'driverFled', x: car.mesh.position.x, z: car.mesh.position.z });
      G.audio.sirenBlip();
    }
    // Stealing any car you don't own draws heat (once per car).
    if (!car.stolen) {
      car.stolen = true;
      if (G.wantedSystem.level < 2) G.wantedSystem.add(1, 'car theft');
      G.ui.toast('Car stolen! +1 wanted star');
    }
    p.mesh.visible = false;
    G.ui.toast(car.marked ? 'Marked car secured — deliver it!' : 'You are driving');
  } else {
    const car = p.vehicle;
    if (!car) return;
    // Step out on the car's left side; never spawn inside a building.
    const fx = Math.sin(car.yaw + Math.PI / 2), fz = Math.cos(car.yaw + Math.PI / 2);
    let ex = car.mesh.position.x + fx * 2.4;
    let ez = car.mesh.position.z + fz * 2.4;
    const fixed = collideBuildings(G, ex, ez, 0.6);
    ex = fixed.x; ez = fixed.z;
    const clamped = clampToCity(G, ex, ez, 3);
    p.pos.x = clamped.x;
    p.pos.z = clamped.z;
    p.pos.y = 0;
    p.mesh.visible = true;
    p.onFoot = true;
    p.vehicle = null;
    car.speed = 0;
    car.parked = true;
  }
}

export function damagePlayer(G, amount, cause) {
  const p = G.player;
  if (p.invulnTimer > 0 || G.state !== 'playing') return;
  p.health -= amount;
  p.invulnTimer = 0.4;
  if (p.health <= 0) {
    p.health = 0;
    G.events.push({ type: 'playerDown', cause });
  }
}
