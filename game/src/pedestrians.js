// pedestrians.js — Vice Harbor sidewalk crowd.
//
// Exports createPedestrians(scene, city, count, opts) which builds a set of
// low-poly humanoid pedestrians that stroll along the sidewalks, keep out of
// the buildings, panic and flee from danger, and can be hurt / knocked down.
//
// World contract: ground 560x560, roads along x/z at -200..200 step 40 with
// width 12, city.colliders = [{x,z,hw,hd}] building AABBs, city.isRoad(x,z).
// Pedestrian forward for angle t is (sin t, 0, cos t).

import * as THREE from '../vendor/three.module.min.js';

const ROAD_LINES = [];
for (let v = -200; v <= 200; v += 40) ROAD_LINES.push(v);

const SHIRT_COLORS = [
  0xff4757, 0xffa502, 0x2ed573, 0x1e90ff, 0xeccc68,
  0xff6b81, 0x7bed9f, 0x70a1ff, 0xf368e0, 0x48dbfb,
  0xff9f43, 0x1dd1a1, 0xfeca57, 0x54a0ff, 0x5f27cd,
];
const PANTS_COLORS = [0x2f3542, 0x57606f, 0x3b3b98, 0x222f3e, 0x8395a7, 0x4a3f35];
const SKIN_COLORS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rand(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

// Build one low-poly humanoid ~1.8 units tall. Group origin sits on the
// ground between the feet. Returns { group, legL, legR, armL, armR } so the
// walker can swing limbs while moving.
function buildHumanoid(shirtColor, pantsColor, skinColor) {
  const group = new THREE.Group();

  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: pantsColor });
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const shoe = new THREE.MeshLambertMaterial({ color: 0x1e272e });

  const legGeo = new THREE.BoxGeometry(0.16, 0.78, 0.18);
  legGeo.translate(0, -0.39, 0); // pivot at the hip
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.11, 0.78, 0);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.11, 0.78, 0);
  const shoeGeo = new THREE.BoxGeometry(0.17, 0.08, 0.28);
  const shoeL = new THREE.Mesh(shoeGeo, shoe);
  shoeL.position.set(0, -0.76, 0.04);
  legL.add(shoeL);
  const shoeR = new THREE.Mesh(shoeGeo, shoe);
  shoeR.position.set(0, -0.76, 0.04);
  legR.add(shoeR);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.24), shirt);
  torso.position.y = 1.09;

  const armGeo = new THREE.BoxGeometry(0.11, 0.66, 0.13);
  armGeo.translate(0, -0.30, 0); // pivot at the shoulder
  const armL = new THREE.Mesh(armGeo, shirt);
  armL.position.set(-0.30, 1.38, 0);
  const armR = new THREE.Mesh(armGeo, shirt);
  armR.position.set(0.30, 1.38, 0);
  const handGeo = new THREE.SphereGeometry(0.06, 6, 5);
  const handL = new THREE.Mesh(handGeo, skin);
  handL.position.set(0, -0.62, 0);
  armL.add(handL);
  const handR = new THREE.Mesh(handGeo, skin);
  handR.position.set(0, -0.62, 0);
  armR.add(handR);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skin);
  head.position.y = 1.58;
  const hair = new THREE.Mesh(
    new THREE.BoxGeometry(0.30, 0.10, 0.30),
    new THREE.MeshLambertMaterial({ color: pick([0x2d3436, 0x6c5ce7, 0xb33939, 0x84817a, 0xdfe6e9]) })
  );
  hair.position.y = 1.70;

  group.add(legL, legR, torso, armL, armR, head, hair);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group, legL, legR, armL, armR };
}

// A point on a sidewalk: hugging a road line, offset to one of its edges.
function sidewalkPoint() {
  const alongRoad = Math.random() < 0.5;
  const line = pick(ROAD_LINES);
  const side = Math.random() < 0.5 ? -1 : 1;
  const off = side * rand(7.5, 9.5); // road half-width 6 + pavement margin
  const along = rand(-252, 252);
  if (alongRoad) return { x: line + off, z: along };
  return { x: along, z: line + off };
}

function insideCollider(city, x, z, pad) {
  const cols = city.colliders || [];
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (Math.abs(x - c.x) < c.hw + pad && Math.abs(z - c.z) < c.hd + pad) return c;
  }
  return null;
}

function freeSidewalkPoint(city) {
  for (let tries = 0; tries < 12; tries++) {
    const p = sidewalkPoint();
    if (!insideCollider(city, p.x, p.z, 1.2)) return p;
  }
  return { x: 8, z: 8 };
}

export function createPedestrians(scene, city, count = 18, opts = {}) {
  const onDown = typeof opts.onDown === 'function' ? opts.onDown : null;
  const peds = [];

  for (let i = 0; i < count; i++) {
    const start = freeSidewalkPoint(city);
    const body = buildHumanoid(pick(SHIRT_COLORS), pick(PANTS_COLORS), pick(SKIN_COLORS));
    body.group.position.set(start.x, 0, start.z);
    scene.add(body.group);
    const tgt = freeSidewalkPoint(city);
    const ped = {
      group: body.group,
      legL: body.legL,
      legR: body.legR,
      armL: body.armL,
      armR: body.armR,
      health: 30,
      state: 'walk',
      angle: Math.atan2(tgt.x - start.x, tgt.z - start.z),
      speed: rand(1.4, 2.3),
      walkSpeed: 0,
      targetX: tgt.x,
      targetZ: tgt.z,
      thinkTimer: rand(0, 2),
      fleeTimer: 0,
      fleeX: 0,
      fleeZ: 0,
      walkPhase: rand(0, Math.PI * 2),
      radius: 0.45,
    };
    ped.walkSpeed = ped.speed;
    peds.push(ped);
  }

  // Push a pedestrian out of any building AABB it has drifted into
  // (circle vs AABB: clamp to the box, push along the smallest penetration).
  function pushOutOfBuildings(ped) {
    const cols = city.colliders || [];
    const p = ped.group.position;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const px = c.hw + ped.radius - Math.abs(dx);
      const pz = c.hd + ped.radius - Math.abs(dz);
      if (px > 0 && pz > 0) {
        if (px < pz) p.x = c.x + (dx >= 0 ? 1 : -1) * (c.hw + ped.radius);
        else p.z = c.z + (dz >= 0 ? 1 : -1) * (c.hd + ped.radius);
      }
    }
    p.x = Math.max(-272, Math.min(272, p.x));
    p.z = Math.max(-272, Math.min(272, p.z));
  }

  function startFlee(ped, fromX, fromZ, minTime) {
    const p = ped.group.position;
    let dx = p.x - fromX;
    let dz = p.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    // Add a little sideways scatter so a crowd does not flee in lockstep.
    const scatter = rand(-0.45, 0.45);
    const fx = dx * Math.cos(scatter) - dz * Math.sin(scatter);
    const fz = dx * Math.sin(scatter) + dz * Math.cos(scatter);
    ped.fleeX = p.x + fx * 40;
    ped.fleeZ = p.z + fz * 40;
    ped.fleeTimer = Math.max(ped.fleeTimer, minTime || rand(3, 5));
    ped.state = 'flee';
    ped.speed = 6;
  }

  function panicAt(x, z, r) {
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      const p = ped.group.position;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d <= r) startFlee(ped, x, z, rand(3, 5));
    }
  }

  function hurtPed(ped, dmg) {
    if (!ped || ped.state === 'down') return false;
    ped.health -= dmg;
    if (ped.health <= 0) {
      ped.health = 0;
      ped.state = 'down';
      // Tip the body over onto its back and sink it a touch into the ground.
      ped.group.rotation.x = -Math.PI / 2;
      ped.group.position.y = 0.22;
      ped.legL.rotation.x = 0.15;
      ped.legR.rotation.x = -0.1;
      ped.armL.rotation.x = 0.4;
      ped.armR.rotation.x = -0.3;
      if (onDown) onDown(ped);
      return true;
    }
    // Hurt but alive: shove them into a panic away from their own position.
    startFlee(ped, ped.group.position.x + rand(-1, 1), ped.group.position.z + rand(-1, 1), rand(2.5, 4));
    return false;
  }

  function steerPed(ped, tx, tz, dt) {
    const p = ped.group.position;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return 0;
    const want = Math.atan2(dx, dz);
    let diff = want - ped.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = 7 * dt;
    ped.angle += Math.max(-turn, Math.min(turn, diff));
    const step = Math.min(dist, ped.speed * dt);
    p.x += Math.sin(ped.angle) * step;
    p.z += Math.cos(ped.angle) * step;
    return dist;
  }

  function animate(ped, dt, moving) {
    const p = ped.group.position;
    ped.group.rotation.y = ped.angle;
    if (moving) {
      ped.walkPhase += dt * ped.speed * 3.4;
      const s = Math.sin(ped.walkPhase) * 0.55;
      ped.legL.rotation.x = s;
      ped.legR.rotation.x = -s;
      if (ped.state === 'flee') {
        ped.armL.rotation.x = -s * 0.9 - 0.3;
        ped.armR.rotation.x = s * 0.9 - 0.3;
      } else {
        ped.armL.rotation.x = -s * 0.6;
        ped.armR.rotation.x = s * 0.6;
      }
      p.y = Math.abs(Math.sin(ped.walkPhase)) * 0.05;
    } else {
      ped.legL.rotation.x *= 0.8;
      ped.legR.rotation.x *= 0.8;
      ped.armL.rotation.x *= 0.8;
      ped.armR.rotation.x *= 0.8;
    }
  }

  function update(dt, danger) {
    const hasDanger = !!(danger && danger.active);
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      const p = ped.group.position;

      // React to an active danger source (gunfire, a speeding car, ...).
      if (hasDanger) {
        const d = Math.hypot(p.x - danger.x, p.z - danger.z);
        const radius = danger.radius || 16;
        if (d < radius) startFlee(ped, danger.x, danger.z, rand(3, 5));
      }

      ped.thinkTimer -= dt;
      let moving = true;

      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        const dist = steerPed(ped, ped.fleeX, ped.fleeZ, dt);
        if (ped.fleeTimer <= 0 || dist < 1) {
          ped.state = 'walk';
          ped.speed = ped.walkSpeed;
          const t = freeSidewalkPoint(city);
          ped.targetX = t.x;
          ped.targetZ = t.z;
        }
      } else {
        // Strolling: head for the current sidewalk target; on arrival (or
        // when the think timer lapses) pick a fresh one nearby.
        const dist = steerPed(ped, ped.targetX, ped.targetZ, dt);
        if (dist < 1.2 || ped.thinkTimer <= 0) {
          ped.thinkTimer = rand(4, 9);
          if (Math.random() < 0.18) {
            moving = false; // pause and loiter for a beat
            ped.thinkTimer = rand(0.8, 2.2);
          } else {
            const t = freeSidewalkPoint(city);
            ped.targetX = t.x;
            ped.targetZ = t.z;
          }
        }
      }

      pushOutOfBuildings(ped);
      animate(ped, dt, moving);
    }
  }

  return { peds, update, panicAt, hurtPed };
}
