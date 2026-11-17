// combat.js — hitscan gunfire for Vice Harbor: ray-vs-vertical-segment
// target tests, pooled tracers, impact puffs and a reusable muzzle
// flash light. Rate limiting lives with the caller; this module only
// resolves and presents each shot.
import * as THREE from '../vendor/three.module.min.js';

const MAX_RANGE = 90;
const CLOSE_DAMAGE = 34;   // t < 25
const FAR_DAMAGE = 22;     // t >= 25
const CLOSE_RANGE = 25;
const TRACER_LIFE = 0.06;  // seconds (60 ms)
const PUFF_LIFE = 0.28;
const TRACER_COUNT = 8;
const PUFF_COUNT = 10;

export function createCombat(scene, audio) {
  // One reusable muzzle flash light, repositioned on every shot.
  const flash = new THREE.PointLight(0xffa040, 0, 20, 1.8);
  flash.visible = false;
  scene.add(flash);

  // Tracer pool: additive lines, each with its own position buffer.
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i++) {
    const positions = new Float32Array(6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xfff3b0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, positions, life: 0 });
  }
  let tracerCursor = 0;

  // Impact puff pool: small warm spheres that swell and fade.
  const puffs = [];
  const puffGeo = new THREE.SphereGeometry(0.14, 10, 8);
  for (let i = 0; i < PUFF_COUNT; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd9a0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(puffGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    puffs.push({ mesh, life: 0 });
  }
  let puffCursor = 0;

  const _center = new THREE.Vector3();
  const _rel = new THREE.Vector3();
  const _closest = new THREE.Vector3();
  const _end = new THREE.Vector3();

  function spawnTracer(from, to) {
    const tr = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % tracers.length;
    tr.positions[0] = from.x; tr.positions[1] = from.y; tr.positions[2] = from.z;
    tr.positions[3] = to.x; tr.positions[4] = to.y; tr.positions[5] = to.z;
    tr.line.geometry.attributes.position.needsUpdate = true;
    tr.life = TRACER_LIFE;
    tr.line.material.opacity = 0.95;
    tr.line.visible = true;
  }

  function spawnPuff(at) {
    const puff = puffs[puffCursor];
    puffCursor = (puffCursor + 1) % puffs.length;
    puff.mesh.position.copy(at);
    puff.mesh.scale.setScalar(1);
    puff.mesh.material.opacity = 0.9;
    puff.mesh.visible = true;
    puff.life = PUFF_LIFE;
  }

  // origin/dir are THREE.Vector3 (dir normalized). targets carry a base
  // height y and a vertical extent height; a shot connects when the ray
  // passes within radius + slack of the segment's midpoint projection.
  function shoot(origin, dir, targets) {
    if (audio) audio.shot();

    flash.position.copy(origin);
    flash.intensity = 3;
    flash.visible = true;

    let best = null;
    let bestT = Infinity;
    for (const target of targets || []) {
      _center.set(target.x, target.y + target.height / 2, target.z);
      _rel.copy(_center).sub(origin);
      const t = _rel.dot(dir);
      if (t <= 0 || t > MAX_RANGE || t >= bestT) continue;
      _closest.copy(origin).addScaledVector(dir, t);
      const perp = _closest.distanceTo(_center);
      if (perp < target.radius + 0.15) {
        best = target;
        bestT = t;
      }
    }

    const range = best ? bestT : MAX_RANGE;
    _end.copy(origin).addScaledVector(dir, range);
    spawnTracer(origin, _end);

    if (best) {
      const dmg = bestT < CLOSE_RANGE ? CLOSE_DAMAGE : FAR_DAMAGE;
      best.onHit(dmg);
      if (audio) audio.hit();
      spawnPuff(_end);
      return { target: best, point: _end.clone(), t: bestT, damage: dmg };
    }
    return null;
  }

  function update(dt) {
    // Muzzle flash: spike on shoot, decay fast.
    if (flash.visible) {
      flash.intensity = Math.max(0, flash.intensity - dt * 55);
      if (flash.intensity <= 0) flash.visible = false;
    }
    for (const tr of tracers) {
      if (!tr.line.visible) continue;
      tr.life -= dt;
      if (tr.life <= 0) {
        tr.line.visible = false;
        tr.line.material.opacity = 0;
      } else {
        tr.line.material.opacity = 0.95 * (tr.life / TRACER_LIFE);
      }
    }
    for (const puff of puffs) {
      if (!puff.mesh.visible) continue;
      puff.life -= dt;
      if (puff.life <= 0) {
        puff.mesh.visible = false;
        puff.mesh.material.opacity = 0;
      } else {
        const k = puff.life / PUFF_LIFE;
        puff.mesh.scale.setScalar(1 + (1 - k) * 2.6);
        puff.mesh.material.opacity = 0.9 * k;
      }
    }
  }

  return { shoot, update };
}
