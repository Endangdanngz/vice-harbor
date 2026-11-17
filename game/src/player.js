// player.js — the on-foot / driving protagonist for Vice Harbor.
// Builds a small articulated humanoid out of boxes (teal jacket, dark
// pistol in the right hand), walks with a limb-swing cycle, sprints on
// stamina, wades slowly through water, and takes over cars via stepCar.
import * as THREE from '../vendor/three.module.min.js';
import { stepCar } from './vehicles.js';

const WALK_SPEED = 7;
const SPRINT_SPEED = 11.5;
const PLAYER_RADIUS = 0.45;
const WORLD_BOUND = 262;
const STAMINA_MAX = 100;
const SPRINT_DRAIN = 24;   // per second while sprinting
const STAMINA_REGEN = 15;  // per second while not sprinting
const SPRINT_UNLOCK = 20;  // stamina needed after exhaustion to sprint again
const ENTER_RANGE = 3.4;

function box(w, h, d, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  mesh.castShadow = true;
  return mesh;
}

// A limb that swings around a pivot at its top end: the pivot sits at the
// joint (hip / shoulder) and the box hangs below it.
function limb(w, h, d, color, x, y, z) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const mesh = box(w, h, d, color);
  mesh.position.y = -h / 2 + 0.04;
  pivot.add(mesh);
  return pivot;
}

function shortestArc(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function lerpAngle(from, to, t) {
  return from + shortestArc(to - from) * Math.min(1, t);
}

export function createPlayer(scene, city, input, audio) {
  const group = new THREE.Group();      // origin at the ground
  const rig = new THREE.Group();        // bobs while walking
  group.add(rig);

  const SKIN = 0xd9a066;
  const JACKET = 0x0e7c86;              // teal jacket
  const JACKET_DARK = 0x0a5a61;
  const PANTS = 0x2b2f3a;
  const SHOES = 0x17181c;

  // Legs on hip pivots (hip height 0.92).
  const legL = limb(0.21, 0.92, 0.24, PANTS, -0.15, 0.92, 0);
  const legR = limb(0.21, 0.92, 0.24, PANTS, 0.15, 0.92, 0);
  const shoeL = box(0.22, 0.09, 0.34, SHOES); shoeL.position.set(0, -0.9, 0.05); legL.add(shoeL);
  const shoeR = box(0.22, 0.09, 0.34, SHOES); shoeR.position.set(0, -0.9, 0.05); legR.add(shoeR);
  rig.add(legL, legR);

  // Torso: teal jacket with a darker shirt stripe down the front.
  const torso = box(0.62, 0.68, 0.34, JACKET);
  torso.position.y = 1.26;
  rig.add(torso);
  const shirt = box(0.3, 0.6, 0.02, JACKET_DARK);
  shirt.position.set(0, 1.26, 0.18);
  rig.add(shirt);
  const belt = box(0.63, 0.09, 0.35, 0x1c1c22);
  belt.position.y = 0.95;
  rig.add(belt);

  // Arms on shoulder pivots (shoulder height 1.56).
  const armL = limb(0.16, 0.68, 0.18, JACKET, -0.4, 1.56, 0);
  const armR = limb(0.16, 0.68, 0.18, JACKET, 0.4, 1.56, 0);
  const handL = box(0.15, 0.12, 0.16, SKIN); handL.position.set(0, -0.68, 0); armL.add(handL);
  const handR = box(0.15, 0.12, 0.16, SKIN); handR.position.set(0, -0.68, 0); armR.add(handR);
  rig.add(armL, armR);

  // Dark pistol gripped in the right hand, barrel pointing forward (+Z
  // in the character's local space, matching the facing convention).
  const pistol = new THREE.Group();
  const grip = box(0.07, 0.16, 0.09, 0x24262b); grip.position.set(0, -0.04, 0.02); pistol.add(grip);
  const slide = box(0.06, 0.08, 0.3, 0x33363d); slide.position.set(0, 0.05, 0.1); pistol.add(slide);
  const muzzleTip = new THREE.Object3D(); muzzleTip.position.set(0, 0.05, 0.27); pistol.add(muzzleTip);
  pistol.position.set(0, -0.72, 0.06);
  armR.add(pistol);

  // Head with hair cap and sunglasses band.
  const head = box(0.32, 0.34, 0.3, SKIN);
  head.position.y = 1.78;
  rig.add(head);
  const hair = box(0.34, 0.1, 0.32, 0x201812);
  hair.position.y = 1.97;
  rig.add(hair);
  const shades = box(0.33, 0.07, 0.02, 0x0c0d10);
  shades.position.set(0, 1.8, 0.16);
  rig.add(shades);

  scene.add(group);

  let walkPhase = 0;
  let exhausted = false;

  // Circle (player) vs AABB push-out against every city collider.
  function pushOutOfColliders() {
    const pos = group.position;
    for (const c of city.colliders) {
      const nx = Math.max(c.x - c.hw, Math.min(pos.x, c.x + c.hw));
      const nz = Math.max(c.z - c.hd, Math.min(pos.z, c.z + c.hd));
      let dx = pos.x - nx;
      let dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 > 1e-8) {
        if (d2 < PLAYER_RADIUS * PLAYER_RADIUS) {
          const d = Math.sqrt(d2);
          pos.x = nx + (dx / d) * PLAYER_RADIUS;
          pos.z = nz + (dz / d) * PLAYER_RADIUS;
        }
      } else {
        // Centre is inside the box: leave along the shallowest axis.
        const left = pos.x - (c.x - c.hw);
        const right = (c.x + c.hw) - pos.x;
        const back = pos.z - (c.z - c.hd);
        const front = (c.z + c.hd) - pos.z;
        const m = Math.min(left, right, back, front);
        if (m === left) pos.x = c.x - c.hw - PLAYER_RADIUS;
        else if (m === right) pos.x = c.x + c.hw + PLAYER_RADIUS;
        else if (m === back) pos.z = c.z - c.hd - PLAYER_RADIUS;
        else pos.z = c.z + c.hd + PLAYER_RADIUS;
      }
    }
    pos.x = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, pos.x));
    pos.z = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, pos.z));
  }

  const player = {
    group,
    health: 100,
    armor: 0,
    stamina: STAMINA_MAX,
    car: null,
    dead: false,
    angle: 0,
    justEntered: null,

    enterCar(car) {
      if (!car || this.car) return;
      this.car = car;
      car.occupied = true;
      group.visible = false;
      this.justEntered = car;
      this.angle = car.angle;
    },

    exitCar() {
      const car = this.car;
      if (!car) return;
      // Step out beside the car, perpendicular to its facing.
      const px = Math.cos(car.angle);
      const pz = -Math.sin(car.angle);
      group.position.set(car.group.position.x + px * 2.2, 0, car.group.position.z + pz * 2.2);
      pushOutOfColliders();
      this.angle = car.angle;
      group.rotation.y = this.angle;
      car.occupied = false;
      this.car = null;
      group.visible = true;
      if (audio) audio.engineSet(false, 0);
    },

    damage(n) {
      if (this.dead || n <= 0) return;
      let rest = n;
      if (this.armor > 0) {
        const blocked = Math.min(this.armor, n * 0.6);
        this.armor -= blocked;
        rest = n - blocked;
      }
      this.health -= rest;
      if (this.health <= 0) {
        this.health = 0;
        this.dead = true;
      }
    },

    addArmor(n) {
      this.armor = Math.max(0, Math.min(100, this.armor + n));
    },

    muzzlePos() {
      const s = Math.sin(this.angle);
      const c = Math.cos(this.angle);
      return new THREE.Vector3(
        group.position.x + s * 0.5,
        group.position.y + 1.35,
        group.position.z + c * 0.5
      );
    },

    reset(pos) {
      if (this.car) {
        this.car.occupied = false;
        this.car = null;
      }
      this.health = 100;
      this.stamina = STAMINA_MAX;
      exhausted = false;
      this.dead = false;
      group.visible = true;
      if (pos) group.position.set(pos.x || 0, pos.y || 0, pos.z || 0);
      if (audio) audio.engineSet(false, 0);
    },

    update(dt, ctx) {
      this.justEntered = null;
      if (this.dead) return;
      ctx = ctx || {};

      // ---- Driving -------------------------------------------------
      if (this.car) {
        const car = this.car;
        if (input.pressed('KeyE')) {
          this.exitCar();
          return;
        }
        let throttle = 0;
        if (input.isDown('KeyW') || input.isDown('ArrowUp')) throttle = 1;
        else if (input.isDown('KeyS') || input.isDown('ArrowDown')) throttle = -0.6;
        let steer = 0;
        if (input.isDown('KeyA') || input.isDown('ArrowLeft')) steer += 1;   // left
        if (input.isDown('KeyD') || input.isDown('ArrowRight')) steer -= 1;  // right
        const handbrake = input.isDown('Space');
        if (handbrake) throttle = 0;
        stepCar(car, throttle, steer, dt, city.colliders);
        if (handbrake) car.speed *= Math.exp(-4.5 * dt);
        this.angle = car.angle;
        group.position.copy(car.group.position);
        if (audio) audio.engineSet(true, car.maxSpeed > 0 ? Math.abs(car.speed) / car.maxSpeed : 0);
        return;
      }

      // ---- Enter a nearby car --------------------------------------
      if (input.pressed('KeyE') && ctx.nearestCar) {
        const cp = ctx.nearestCar.group.position;
        const dx = cp.x - group.position.x;
        const dz = cp.z - group.position.z;
        if (dx * dx + dz * dz <= ENTER_RANGE * ENTER_RANGE) {
          this.enterCar(ctx.nearestCar);
          return;
        }
      }

      // ---- On foot --------------------------------------------------
      const camYaw = ctx.camYaw || 0;
      const fx = Math.sin(camYaw), fz = Math.cos(camYaw);   // camera forward
      const rx = -Math.cos(camYaw), rz = Math.sin(camYaw);  // camera right
      let ix = 0, iz = 0;
      if (input.isDown('KeyW') || input.isDown('ArrowUp')) { ix += fx; iz += fz; }
      if (input.isDown('KeyS') || input.isDown('ArrowDown')) { ix -= fx; iz -= fz; }
      if (input.isDown('KeyD') || input.isDown('ArrowRight')) { ix += rx; iz += rz; }
      if (input.isDown('KeyA') || input.isDown('ArrowLeft')) { ix -= rx; iz -= rz; }
      const moving = (ix !== 0 || iz !== 0);
      if (moving) {
        const len = Math.hypot(ix, iz);
        ix /= len; iz /= len;
      }

      const inWater = city.isWater(group.position.x, group.position.z);
      const wantSprint = moving &&
        (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) &&
        !inWater && !exhausted && this.stamina > 1;
      const sprinting = wantSprint && this.stamina > 0;

      if (sprinting) {
        this.stamina = Math.max(0, this.stamina - SPRINT_DRAIN * dt);
        if (this.stamina <= 0) exhausted = true;
      } else {
        this.stamina = Math.min(STAMINA_MAX, this.stamina + STAMINA_REGEN * dt);
        if (exhausted && this.stamina > SPRINT_UNLOCK) exhausted = false;
      }

      let speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
      if (inWater) speed *= 0.45;

      if (moving) {
        group.position.x += ix * speed * dt;
        group.position.z += iz * speed * dt;
        pushOutOfColliders();
        this.angle = lerpAngle(this.angle, Math.atan2(ix, iz), dt * 12);
        walkPhase += dt * speed * 1.55;
      } else {
        // Idle: turn to face where the camera looks.
        this.angle = lerpAngle(this.angle, camYaw, dt * 6);
      }
      group.rotation.y = this.angle;

      // Walk cycle: legs and the free arm swing opposite each other; the
      // gun arm stays mostly raised. Limbs ease back to rest when idle.
      const swing = moving ? Math.sin(walkPhase) * (sprinting ? 0.85 : 0.6) : 0;
      const ease = moving ? 1 : Math.max(0, 1 - dt * 10);
      legL.rotation.x = swing * ease;
      legR.rotation.x = -swing * ease;
      armL.rotation.x = -swing * 0.8 * ease;
      armR.rotation.x = -0.35 + swing * 0.25 * ease;
      rig.position.y = moving ? Math.abs(Math.sin(walkPhase)) * 0.05 : 0;
    },
  };

  return player;
}
