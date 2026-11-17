// pedestrians.js — sidewalk NPCs who wander, flee from gunfire and speeding cars.
import * as THREE from 'three';
import { collideBuildings, clampToCity } from './city.js';

const SHIRT_COLORS = [0xffe066, 0x8affc1, 0xff9de2, 0x9be8ff, 0xff8a5c, 0xd8d8e0, 0xb79bff];

export function makePedMesh(color) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x22222e, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a06b, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), shirt);
  body.position.y = 1.0;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.6;
  g.add(head);
  for (const x of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.22), pants);
    leg.position.set(x, 0.32, 0);
    g.add(leg);
    g.userData['leg' + (x < 0 ? 'L' : 'R')] = leg;
  }
  return g;
}

export function spawnPeds(G, count) {
  const roads = G.city.roadCoords;
  for (let i = 0; i < count; i++) {
    const horizontal = G.rng() < 0.5;
    const road = roads[Math.floor(G.rng() * roads.length)];
    const t = -180 + G.rng() * 360;
    const side = G.rng() < 0.5 ? -1 : 1;
    const x = horizontal ? t : road + side * 9.5;
    const z = horizontal ? road + side * 9.5 : t;
    const mesh = makePedMesh(SHIRT_COLORS[Math.floor(G.rng() * SHIRT_COLORS.length)]);
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    G.peds.push({
      mesh, health: 100, dead: false,
      yaw: G.rng() * Math.PI * 2,
      speed: 1.2 + G.rng() * 1.1,
      fleeing: false, fleeTimer: 0,
      walkPhase: G.rng() * 6,
      changeTimer: 2 + G.rng() * 5,
      fallTimer: 0,
    });
  }
}

export function scarePeds(G, x, z, radius) {
  for (const ped of G.peds) {
    if (ped.dead) continue;
    const dx = ped.mesh.position.x - x, dz = ped.mesh.position.z - z;
    if (dx * dx + dz * dz < radius * radius) {
      ped.fleeing = true;
      ped.fleeTimer = 3 + G.rng() * 2;
      ped.yaw = Math.atan2(dx, dz);
    }
  }
}

export function updatePeds(G, dt) {
  for (const ped of G.peds) {
    if (ped.dead) {
      // Fallen ped lies on the ground, then fades out and respawns elsewhere.
      ped.fallTimer -= dt;
      if (ped.fallTimer <= 0) {
        const roads = G.city.roadCoords;
        const road = roads[Math.floor(G.rng() * roads.length)];
        ped.mesh.position.set(-180 + G.rng() * 360, 0, road + 9.5);
        ped.mesh.rotation.x = 0;
        ped.mesh.visible = true;
        ped.dead = false;
        ped.health = 100;
        ped.fleeing = false;
      }
      continue;
    }
    if (ped.fleeing) {
      ped.fleeTimer -= dt;
      if (ped.fleeTimer <= 0) ped.fleeing = false;
    } else {
      ped.changeTimer -= dt;
      if (ped.changeTimer <= 0) {
        ped.yaw += (G.rng() - 0.5) * 1.6;
        ped.changeTimer = 2 + G.rng() * 5;
      }
    }
    const speed = ped.fleeing ? 5.2 : ped.speed;
    let nx = ped.mesh.position.x + Math.sin(ped.yaw) * speed * dt;
    let nz = ped.mesh.position.z + Math.cos(ped.yaw) * speed * dt;
    const fixed = collideBuildings(G, nx, nz, 0.5);
    nx = fixed.x; nz = fixed.z;
    const clamped = clampToCity(G, nx, nz, 3);
    // Bounce off city bounds instead of leaving the map.
    if (clamped.x !== nx || clamped.z !== nz) ped.yaw += Math.PI;
    ped.mesh.position.x = clamped.x;
    ped.mesh.position.z = clamped.z;
    ped.mesh.rotation.y = ped.yaw;
    ped.walkPhase += dt * (ped.fleeing ? 14 : 8);
    const s = Math.sin(ped.walkPhase);
    ped.mesh.userData.legL.position.z = s * 0.18;
    ped.mesh.userData.legR.position.z = -s * 0.18;
    // Fleeing peds wave their arms.
    ped.mesh.userData.legL.position.y = 0.32;
    ped.mesh.userData.legR.position.y = 0.32;
  }
}

// A ped hit by a player car or bullet. Returns true if the ped went down.
export function hurtPed(G, ped, damage, causeX, causeZ) {
  if (ped.dead) return false;
  ped.health -= damage;
  if (ped.health <= 0) {
    ped.dead = true;
    ped.fallTimer = 14;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.3;
    scarePeds(G, causeX, causeZ, 26);
    return true;
  }
  ped.fleeing = true;
  ped.fleeTimer = 4;
  ped.yaw = Math.atan2(ped.mesh.position.x - causeX, ped.mesh.position.z - causeZ);
  return false;
}
