// Vice Harbor — main wiring: boot, state machine, camera, HUD, demo modes.
import * as THREE from '../vendor/three.module.min.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { loadSave, storeSave } from './save.js';
import { createCity } from './city.js';
import { makeCar, stepCar, damageCar, CAR_COLORS } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createWanted } from './wanted.js';
import { createPolice } from './police.js';
import { createPlayer } from './player.js';
import { createCombat } from './combat.js';
import { createMinimap } from './minimap.js';
import { createMissions } from './missions.js';

const $ = (id) => document.getElementById(id);
const els = {
  app: $('app'), hud: $('hud'), cash: $('cash'), stars: $('stars'),
  objTitle: $('objective-title'), objText: $('objective-text'),
  health: $('health-fill'), armor: $('armor-fill'), stamina: $('stamina-fill'),
  minimap: $('minimap'), prompt: $('prompt'), toast: $('toast'),
  weather: $('weather-chip'), start: $('start-screen'), pause: $('pause-screen'),
  settingsPanel: $('settings-panel'), death: $('death-screen'), deathFee: $('death-fee'),
  setVolume: $('set-volume'), setSensitivity: $('set-sensitivity'),
  setQuality: $('set-quality'), setInvert: $('set-invert'),
};

// ---------- demo mode ----------
const demoN = (() => {
  const m = /[?&]demo=(\d)/.exec(location.search || '');
  const n = m ? parseInt(m[1], 10) : 0;
  return n >= 1 && n <= 4 ? n : 0;
})();
const demoMode = demoN > 0;

// ---------- save + settings ----------
const save = loadSave();
const settings = {
  volume: typeof save.settings.volume === 'number' ? save.settings.volume : 0.8,
  sensitivity: typeof save.settings.sensitivity === 'number' ? save.settings.sensitivity : 100,
  quality: save.settings.quality || 'high',
  invertY: !!save.settings.invertY,
};
if (demoMode) { settings.volume = 0.8; settings.sensitivity = 100; settings.quality = 'high'; settings.invertY = false; }
let cash = demoMode ? 500 : (save.cash || 0);
let missionIndex = save.missionIndex || 0;

function persist() {
  storeSave({ cash, missionIndex, settings });
}

// ---------- renderer / scene / camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(settings.quality === 'low' ? 1 : Math.min(window.devicePixelRatio, 2));
els.app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x1a2438, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d9, 1.6);
sun.position.set(80, 140, 40);
scene.add(sun);
const neonGlow = new THREE.PointLight(0xff2e88, 0.6, 260);
neonGlow.position.set(0, 30, 0);
scene.add(neonGlow);

// ---------- systems ----------
const input = createInput(renderer.domElement);
const audio = createAudio();
audio.setVolume(settings.volume);
const city = createCity(scene);
const wanted = createWanted();
const player = createPlayer(scene, city, input, audio);

let lastPlayerAttackAt = -10000;
const traffic = createTraffic(scene, city, 14, {
  onHonk: (car) => {
    const p = player.group.position;
    const dx = car.group.position.x - p.x, dz = car.group.position.z - p.z;
    if (dx * dx + dz * dz < 30 * 30) audio.honk();
  },
});
const peds = createPedestrians(scene, city, 26, {
  onDown: () => {
    const now = performance.now();
    const inFastCar = !!player.car && Math.abs(player.car.speed || 0) > 3;
    if (now - lastPlayerAttackAt < 700 || inFastCar) wanted.report('hitPed');
  },
});
const police = createPolice(scene, city, wanted);
const combat = createCombat(scene, audio);
const minimap = createMinimap(els.minimap, city);

function notify(title, sub) {
  els.toast.innerHTML = '';
  const t = document.createElement('span'); t.className = 't-title'; t.textContent = title || '';
  const s = document.createElement('span'); s.className = 't-sub'; s.textContent = sub || '';
  els.toast.appendChild(t); els.toast.appendChild(s);
  els.toast.classList.remove('show');
  void els.toast.offsetWidth; // restart the CSS animation
  els.toast.classList.add('show');
}
function addCash(n) { cash += n; if (n > 0) audio.cash(); }

const missions = createMissions({ scene, player, wanted, city, addCash, notify, audio });
if (!demoMode && missionIndex > 0) missions.startFrom(Math.min(missionIndex, missions.totalCount - 1));

// ---------- cash pickups ----------
const PICKUP_SPOTS = [
  [24, 60], [-52, 24], [88, -36], [-96, -64], [40, 150], [-30, 168], [130, 90],
  [-140, 40], [60, -120], [-70, -140], [12, -60], [150, -20], [-120, 120], [96, 150],
];
const pickupMat = new THREE.MeshStandardMaterial({ color: 0x14532d, emissive: 0x22ff77, emissiveIntensity: 1.6 });
const pickupGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.25, 18);
const pickups = [];
for (let i = 0; i < 8; i++) {
  const mesh = new THREE.Mesh(pickupGeo, pickupMat);
  mesh.rotation.x = Math.PI / 2;
  const spot = PICKUP_SPOTS[i % PICKUP_SPOTS.length];
  mesh.position.set(spot[0], 1.1, spot[1]);
  scene.add(mesh);
  pickups.push({ mesh, spotIdx: i % PICKUP_SPOTS.length, phase: Math.random() * Math.PI * 2 });
}
function movePickup(pk) {
  let idx = pk.spotIdx;
  do { idx = (idx + 1 + Math.floor(Math.random() * 5)) % PICKUP_SPOTS.length; }
  while (pickups.some((o) => o !== pk && o.spotIdx === idx));
  pk.spotIdx = idx;
  pk.mesh.position.set(PICKUP_SPOTS[idx][0], 1.1, PICKUP_SPOTS[idx][1]);
}

// ---------- state ----------
let state = demoMode ? 'playing' : 'menu';
let yaw = 0, pitch = 0.28;
let firingHeld = false;
let lastShotAt = 0, lastGunfireReportAt = 0, lastHitCopReportAt = 0;
let lastSiren = -1, saveTimer = 0, lastCompleted = missions.completedCount;
let objectiveOverride = null;
const camPos = new THREE.Vector3(0, 4, 12);
const clock = new THREE.Clock();
let frameCount = 0;

// ---------- shooting ----------
const _dir = new THREE.Vector3();
function buildTargets() {
  const targets = [];
  for (const ped of peds.peds) {
    if (!ped || ped.health <= 0) continue;
    const p = ped.group.position;
    targets.push({
      x: p.x, y: p.y, z: p.z, radius: 0.55, height: 1.8,
      onHit: (dmg) => { lastPlayerAttackAt = performance.now(); peds.hurtPed(ped, dmg); },
    });
  }
  for (const off of police.officers) {
    if (!off || off.health <= 0) continue;
    const p = off.group.position;
    targets.push({
      x: p.x, y: p.y, z: p.z, radius: 0.55, height: 1.8,
      onHit: (dmg) => {
        lastPlayerAttackAt = performance.now();
        const wasAlive = off.health > 0;
        police.hurtOfficer(off, dmg);
        if (wasAlive && off.health <= 0) wanted.report('copDown');
        else wanted.report('assault');
      },
    });
  }
  const addCar = (car, isCop) => {
    if (!car || !car.group) return;
    const p = car.group.position;
    targets.push({
      x: p.x, y: p.y, z: p.z, radius: 1.7, height: 1.5,
      onHit: (dmg) => {
        damageCar(car, dmg);
        if (isCop) {
          const now = performance.now();
          if (now - lastHitCopReportAt > 2000) { lastHitCopReportAt = now; wanted.report('hitCop'); }
        } else {
          wanted.report('propertyDamage');
        }
      },
    });
  };
  for (const car of traffic.cars) addCar(car, false);
  for (const car of police.cars) addCar(car, true);
  if (player.car) addCar(player.car, false);
  return targets;
}

function tryShoot(now) {
  if (now - lastShotAt < 140) return;
  lastShotAt = now;
  lastPlayerAttackAt = now;
  camera.getWorldDirection(_dir);
  combat.shoot(player.muzzlePos(), _dir.clone(), buildTargets());
  if (now - lastGunfireReportAt > 1500) { lastGunfireReportAt = now; wanted.report('gunfire'); }
  const p = player.group.position;
  peds.panicAt(p.x, p.z, 18);
}

// ---------- camera ----------
function updateCamera(dt) {
  const m = input.consumeMouse();
  const sens = (settings.sensitivity / 100) * 0.0026;
  if (input.locked) {
    yaw -= m.dx * sens;
    pitch += (settings.invertY ? m.dy : -m.dy) * sens;
  } else if (state === 'playing') {
    yaw -= dt * 0.07; // slow auto-orbit drift when the pointer is free (demo / menus)
  }
  pitch = Math.max(-0.15, Math.min(0.9, pitch));
  const p = player.group.position;
  const inCar = !!player.car;
  const dist = inCar ? 10.5 : 7.5;
  const height = inCar ? 4.0 : 3.2;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const tx = p.x - fx * dist, tz = p.z - fz * dist, ty = p.y + height + pitch * 6;
  if (inCar) {
    const k = 1 - Math.exp(-6 * dt);
    camPos.x += (tx - camPos.x) * k;
    camPos.y += (ty - camPos.y) * k;
    camPos.z += (tz - camPos.z) * k;
  } else {
    camPos.set(tx, ty, tz);
  }
  camera.position.copy(camPos);
  const lookDist = inCar ? 6 : 2.5;
  camera.lookAt(p.x + fx * lookDist, p.y + 1.6 - pitch * 2, p.z + fz * lookDist);
}

// ---------- HUD ----------
function fmtTime(t) {
  const h = Math.floor(t) % 24, min = Math.floor((t - Math.floor(t)) * 60);
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
}
function refreshHUD() {
  els.cash.textContent = '$' + Math.max(0, Math.floor(cash)).toLocaleString('en-US');
  const lvl = wanted.level;
  els.stars.textContent = '★★★★★'.slice(0, lvl) + '☆☆☆☆☆'.slice(0, 5 - lvl);
  els.stars.className = 'stars-' + lvl;
  els.health.style.width = Math.max(0, Math.min(100, player.health)) + '%';
  els.armor.style.width = Math.max(0, Math.min(100, player.armor)) + '%';
  els.stamina.style.width = Math.max(0, Math.min(100, player.stamina)) + '%';
  if (objectiveOverride) {
    els.objTitle.textContent = objectiveOverride.title;
    els.objText.textContent = objectiveOverride.text;
  } else if (missions.current) {
    els.objTitle.textContent = missions.current.title;
    els.objText.textContent = missions.objectiveText();
  }
  const env = city.env;
  els.weather.textContent = fmtTime(env.timeOfDay) + ' · ' + env.weather + ' · ' + (env.isNight ? '☾ Night' : '☀ Day');
  const near = traffic.nearestCar(player.group.position.x, player.group.position.z, 3.4);
  if (player.car) els.prompt.textContent = 'E — Exit vehicle';
  else if (near) els.prompt.textContent = 'E — Enter vehicle';
  else els.prompt.textContent = '';
}

// ---------- settings + screens ----------
function applySettings() {
  audio.setVolume(settings.volume);
  renderer.setPixelRatio(settings.quality === 'low' ? 1 : Math.min(window.devicePixelRatio, 2));
  els.setVolume.value = Math.round(settings.volume * 100);
  els.setSensitivity.value = settings.sensitivity;
  els.setQuality.value = settings.quality;
  els.setInvert.checked = settings.invertY;
  persist();
}
els.setVolume.addEventListener('input', () => { settings.volume = els.setVolume.value / 100; applySettings(); });
els.setSensitivity.addEventListener('input', () => { settings.sensitivity = parseInt(els.setSensitivity.value, 10); applySettings(); });
els.setQuality.addEventListener('change', () => { settings.quality = els.setQuality.value; applySettings(); });
els.setInvert.addEventListener('change', () => { settings.invertY = els.setInvert.checked; applySettings(); });

function show(el, on) { el.classList.toggle('hidden', !on); }
function setState(next) {
  state = next;
  show(els.hud, next === 'playing' || next === 'paused' || demoMode);
  show(els.start, next === 'menu');
  show(els.pause, next === 'paused');
  show(els.death, next === 'dead');
  if (next !== 'paused') show(els.settingsPanel, false);
}
function startGame() {
  audio.unlock(); audio.uiClick();
  applySettings();
  setState('playing');
  if (!demoMode) input.lock();
}
function pauseGame() {
  if (state !== 'playing') return;
  setState('paused');
  if (input.locked) input.unlock();
  audio.sirenSet(0);
}
function resumeGame() {
  audio.uiClick();
  setState('playing');
  if (!demoMode) input.lock();
}
function restartRun() {
  audio.uiClick();
  wanted.reset();
  const sp = city.spawnPoint();
  player.reset(new THREE.Vector3(sp.x || 0, 0, sp.z || 0));
  missions.startFrom(0);
  missionIndex = 0; persist();
  setState('playing');
  if (!demoMode) input.lock();
}
function die() {
  setState('dead');
  const fee = Math.min(cash, 150);
  els.deathFee.textContent = 'Hospital bill: $' + fee + ' — the harbor keeps the change.';
  if (input.locked) input.unlock();
  audio.sirenSet(0);
}
function respawn() {
  audio.uiClick();
  cash -= Math.min(cash, 150);
  wanted.reset();
  player.reset(new THREE.Vector3(40, 0, -120)); // hospital roadside
  persist();
  setState('playing');
  if (!demoMode) input.lock();
}
$('btn-start').addEventListener('click', startGame);
$('btn-resume').addEventListener('click', resumeGame);
$('btn-restart').addEventListener('click', restartRun);
$('btn-respawn').addEventListener('click', respawn);
$('btn-settings').addEventListener('click', () => { audio.uiClick(); show(els.settingsPanel, true); });
$('btn-settings-close').addEventListener('click', () => { audio.uiClick(); show(els.settingsPanel, false); });
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && state === 'playing' && !demoMode) pauseGame();
});
renderer.domElement.addEventListener('mousedown', (e) => { if (e.button === 0) firingHeld = true; });
window.addEventListener('mouseup', (e) => { if (e.button === 0) firingHeld = false; });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- demo modes ----------
const demoDrive = { car: null, waypoints: [], idx: 0 };
let demoWantedTarget = 0;
function setupDemo() {
  const sp = city.spawnPoint();
  if (demoN === 1) {
    const car = makeCar(scene, { color: CAR_COLORS[0], x: 0, z: 40, angle: 0, kind: 'sport' });
    demoDrive.car = car;
    demoDrive.waypoints = [[0, 40], [120, 40], [120, -80], [-80, -80], [-80, 40]];
    demoDrive.idx = 1;
    if (car && car.group) player.group.position.set(car.group.position.x, 0, car.group.position.z);
    for (let i = 0; i < 5; i++) wanted.report('hitCop');
    demoWantedTarget = 3;
    objectiveOverride = { title: 'ESCAPE THE POLICE', text: 'Lose the heat — break line of sight and stay off the main roads.' };
  } else if (demoN === 2) {
    player.reset(new THREE.Vector3(8, 0, 12));
    missions.startFrom(0);
    yaw = 2.4;
  } else if (demoN === 3) {
    const car = makeCar(scene, { color: CAR_COLORS[2], x: -40, z: 80, angle: 0, kind: 'civil' });
    demoDrive.car = car;
    demoDrive.waypoints = [[-40, 80], [60, 120], [60, 160], [-60, 160], [-60, 110]];
    demoDrive.idx = 1;
    if (car && car.group) player.group.position.set(car.group.position.x, 0, car.group.position.z);
  } else if (demoN === 4) {
    const car = makeCar(scene, { color: 0xd4af37, x: -30, z: -30, angle: 0.6, kind: 'sport' });
    demoDrive.car = car;
    demoDrive.waypoints = [[-30, -30], [80, -60], [140, 40], [60, 120], [-40, 60]];
    demoDrive.idx = 1;
    if (car && car.group) player.group.position.set(car.group.position.x + 3, 0, car.group.position.z + 2);
    wanted.report('hitCop'); wanted.report('hitCop');
    demoWantedTarget = 2;
    objectiveOverride = { title: 'DELIVER THE CAR', text: 'Get the gold coupe to the pink marker across the harbor.' };
  } else {
    player.reset(new THREE.Vector3(sp.x || 0, 0, sp.z || 0));
  }
}
function driveDemo(dt) {
  const car = demoDrive.car;
  if (!car || !car.group) return;
  const p = car.group.position;
  if (!demoDrive.waypoints.length) return;
  const wp = demoDrive.waypoints[demoDrive.idx % demoDrive.waypoints.length];
  if (!wp) return;
  const dx = wp[0] - p.x, dz = wp[1] - p.z;
  if (dx * dx + dz * dz < 120) { demoDrive.idx = (demoDrive.idx + 1) % demoDrive.waypoints.length; return; }
  const heading = typeof car.angle === 'number' ? car.angle : car.group.rotation.y;
  let diff = Math.atan2(dx, dz) - heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-0.9, Math.min(0.9, diff * 1.2));
  stepCar(car, 0.85, steer, dt, city.colliders);
  player.group.position.set(p.x, 0, p.z);
}

// ---------- per-frame gameplay ----------
function nearestPoliceDist(px, pz) {
  let best = Infinity;
  const scan = (list) => {
    for (const o of list || []) {
      if (!o || !o.group || (typeof o.health === 'number' && o.health <= 0)) continue;
      const dx = o.group.position.x - px, dz = o.group.position.z - pz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < best) best = d;
    }
  };
  scan(police.cars); scan(police.officers);
  return best;
}

function stepGame(dt, now) {
  const p = player.group.position;
  if (!demoMode && input.pressed('KeyP')) { pauseGame(); return; }

  if (demoMode && demoDrive.car) driveDemo(dt);
  else player.update(dt, { camYaw: yaw, nearestCar: traffic.nearestCar(p.x, p.z, 3.4) });

  if (player.justEntered) {
    player.justEntered = false;
    wanted.report('theft');
  }

  input.consumeClick(); // drained; firing state comes from our own mouse listeners
  if (firingHeld && input.locked && !player.car && !player.dead) tryShoot(now);

  audio.engineSet(!!player.car, player.car ? Math.min(1, Math.abs(player.car.speed || 0) / 25) : 0);

  traffic.update(dt, p);
  const speed = player.car ? Math.abs(player.car.speed || 0) : 0;
  const danger = { x: p.x, z: p.z, active: (now - lastPlayerAttackAt < 250) || (speed > 18) };
  peds.update(dt, danger);
  police.update(dt, { x: p.x, z: p.z, car: player.car, speed });

  const concealed = nearestPoliceDist(p.x, p.z) > 40 && !city.isRoad(p.x, p.z);
  wanted.update(dt, concealed);
  if (demoWantedTarget && wanted.level < demoWantedTarget) wanted.report('hitCop');

  // player car vs pedestrians
  if (player.car && speed > 4) {
    for (const ped of peds.peds) {
      if (!ped || ped.health <= 0) continue;
      const dx = ped.group.position.x - p.x, dz = ped.group.position.z - p.z;
      if (dx * dx + dz * dz < 1.6 * 1.6 && now - (ped.__vhHitAt || 0) > 1200) {
        ped.__vhHitAt = now;
        lastPlayerAttackAt = now;
        peds.hurtPed(ped, 40);
        wanted.report('hitPed');
        audio.hit();
      }
    }
    // player car vs police cars
    for (const cop of police.cars) {
      if (!cop || !cop.group) continue;
      const dx = cop.group.position.x - p.x, dz = cop.group.position.z - p.z;
      if (dx * dx + dz * dz < 2.6 * 2.6 && now - lastHitCopReportAt > 2000) {
        lastHitCopReportAt = now;
        wanted.report('hitCop');
        audio.hit();
      }
    }
  }

  // pickups
  for (const pk of pickups) {
    pk.mesh.rotation.z += dt * 1.8;
    pk.mesh.position.y = 1.1 + Math.sin(now / 420 + pk.phase) * 0.22;
    const dx = pk.mesh.position.x - p.x, dz = pk.mesh.position.z - p.z;
    if (dx * dx + dz * dz < 1.8 * 1.8) {
      cash += 25;
      audio.pickup();
      movePickup(pk);
    }
  }

  missions.update(dt);
  if (missions.completedCount !== lastCompleted) {
    lastCompleted = missions.completedCount;
    missionIndex = missions.completedCount;
    persist();
  }

  const copDist = nearestPoliceDist(p.x, p.z);
  audio.sirenSet(wanted.level > 0 && copDist < 60 ? Math.min(1, wanted.level / 3) : 0);

  saveTimer += dt;
  if (saveTimer > 15) { saveTimer = 0; persist(); }

  if (player.dead) { die(); return; }

  updateCamera(dt);
  refreshHUD();
  minimap.draw({
    player: { x: p.x, z: p.z, angle: typeof player.angle === 'number' ? player.angle : yaw, inCar: !!player.car },
    cars: traffic.cars.filter((c) => c && c.group).map((c) => ({ x: c.group.position.x, z: c.group.position.z, kind: 'car' })),
    police: [
      ...police.cars.filter((c) => c && c.group).map((c) => ({ x: c.group.position.x, z: c.group.position.z, kind: 'cop' })),
      ...police.officers.filter((o) => o && o.group && o.health > 0).map((o) => ({ x: o.group.position.x, z: o.group.position.z, kind: 'cop' })),
    ],
    marker: missions.marker,
    wanted: wanted.level,
  });
}

// ---------- boot + loop ----------
applySettings();
if (demoMode) { setupDemo(); setState('playing'); }
else {
  const sp = city.spawnPoint();
  player.reset(new THREE.Vector3(sp.x || 0, 0, sp.z || 0));
  setState('menu');
}
camPos.set(player.group.position.x + 8, 4, player.group.position.z + 10);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  frameCount++;
  if (state === 'playing') stepGame(dt, now);
  else if (state === 'menu') { yaw -= dt * 0.05; updateCamera(dt); }
  city.update(dt, player.group.position);
  renderer.render(scene, camera);
  input.endFrame();
  if (demoMode && frameCount >= 30 && !window.__demoReady) window.__demoReady = true;
}
animate();
