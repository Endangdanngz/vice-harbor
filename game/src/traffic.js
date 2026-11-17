// traffic.js — AI cars cruising the road grid, stopping for cars ahead, honking.
import { spawnCar } from './vehicles.js';
import { collideBuildings } from './city.js';

const LANE_OFFSET = 3;

export function rightHandLane(horizontal, dir) {
  // Right-hand traffic: driving +x keeps to +z, driving +z keeps to -x.
  if (horizontal) return dir > 0 ? LANE_OFFSET : -LANE_OFFSET;
  return dir > 0 ? -LANE_OFFSET : LANE_OFFSET;
}

export function spawnTraffic(G, count) {
  const roads = G.city.roadCoords;
  for (let i = 0; i < count; i++) {
    const horizontal = G.rng() < 0.5;
    const road = roads[Math.floor(G.rng() * roads.length)];
    const t = -180 + G.rng() * 360;
    const dir = G.rng() < 0.5 ? 1 : -1;
    const lane = rightHandLane(horizontal, dir);
    const x = horizontal ? t : road + lane;
    const z = horizontal ? road + lane : t;
    // Face along the road.
    const yaw = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const car = spawnCar(G, x, z, yaw, {
      hasDriver: true,
      ai: 'traffic',
    });
    car.traffic = {
      horizontal, road, lane, dir,
      speed: 7 + G.rng() * 5,
      targetSpeed: 7 + G.rng() * 5,
      honkTimer: 4 + G.rng() * 8,
      turnCooldown: 0,
    };
  }
}

function carAhead(G, car, dist) {
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  const px = car.mesh.position.x, pz = car.mesh.position.z;
  for (const other of G.cars) {
    if (other === car) continue;
    const dx = other.mesh.position.x - px, dz = other.mesh.position.z - pz;
    const along = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < dist && side < 2.6) return true;
  }
  return false;
}

export function updateTraffic(G, dt) {
  const roads = G.city.roadCoords;
  for (const car of G.cars) {
    if (car.ai !== 'traffic' || !car.traffic) continue;
    const T = car.traffic;
    T.turnCooldown -= dt;
    // Stop for the car ahead.
    const blocked = carAhead(G, car, 9);
    let target = blocked ? 0 : T.targetSpeed;
    // Slow near the player on foot crossing ahead.
    const p = G.player;
    if (p.onFoot) {
      const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
      const dx = p.pos.x - car.mesh.position.x, dz = p.pos.z - car.mesh.position.z;
      const along = dx * fx + dz * fz;
      if (along > 0 && along < 8 && Math.abs(dx * fz - dz * fx) < 2.4) target = 0;
    }
    car.speed += Math.sign(target - car.speed) * 10 * dt;
    car.speed = Math.max(0, Math.min(T.targetSpeed, car.speed));

    // Random turn at an intersection.
    const px = car.mesh.position.x, pz = car.mesh.position.z;
    const nearRoad = roads.find((r) => Math.abs((T.horizontal ? pz : px) - r) < 1.2);
    const atCross = roads.some((r) => Math.abs((T.horizontal ? px : pz) - r) < 1.2);
    if (T.turnCooldown <= 0 && nearRoad !== undefined && atCross && G.rng() < 0.012) {
      T.horizontal = !T.horizontal;
      T.road = nearRoad;
      T.dir = G.rng() < 0.5 ? 1 : -1;
      T.lane = rightHandLane(T.horizontal, T.dir);
      T.turnCooldown = 4;
      // Snap to the new lane.
      if (T.horizontal) {
        car.mesh.position.z = T.road + T.lane;
        car.yaw = T.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        car.mesh.position.x = T.road + T.lane;
        car.yaw = T.dir > 0 ? 0 : Math.PI;
      }
    }

    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    let nx = px + fx * car.speed * dt;
    let nz = pz + fz * car.speed * dt;
    const fixed = collideBuildings(G, nx, nz, 1.6);
    nx = fixed.x; nz = fixed.z;
    if (Math.abs(nx) > 205 || Math.abs(nz) > 205) {
      // Wrap around the far edge so traffic keeps flowing.
      if (T.horizontal) nx = -Math.sign(nx) * 200;
      else nz = -Math.sign(nz) * 200;
    }
    car.mesh.position.x = nx;
    car.mesh.position.z = nz;
    car.mesh.rotation.y = car.yaw;

    // Honk when stuck behind someone.
    T.honkTimer -= dt;
    if (blocked && T.honkTimer <= 0) {
      G.audio.honk();
      T.honkTimer = 5 + G.rng() * 6;
    }
    if (car.markerRing) car.markerRing.rotation.z += dt * 1.5;
  }
}
