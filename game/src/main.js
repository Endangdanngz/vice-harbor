// main.js — boot, game loop, camera, HUD wiring, menus, demo scenes.
import * as THREE from 'three';
import { buildCity, mulberry32 } from './city.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { loadSave, writeSave } from './save.js';
import { createPlayer, updatePlayerOnFoot, tryEnterExitCar } from './player.js';
import { spawnCar, updatePlayerCar, removeCar } from './vehicles.js';
import { spawnTraffic, updateTraffic } from './traffic.js';
import { spawnPeds, updatePeds, scarePeds, hurtPed } from './pedestrians.js';
import { createWanted } from './wanted.js';
import { updatePolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createMinimap } from './minimap.js';

const params = new URLSearchParams(window.location.search);
const DEMO = parseInt(params.get('demo') || '0', 10) || 0;
const SEED = DEMO ? 1000 + DEMO : (Date.now() % 2147483647);

const G = {
  time: 0,
  state: 'menu',
  demo: DEMO,
  demoAuto: DEMO > 0,
  demoLane: 3,
  demoSteer: 0,
  rng: mulberry32(SEED),
  cars: [],
  peds: [],
  policeFoot: [],
  events: [],
  camYaw: 0,
  camPitch: 0.3,
  lastEnterExit: -9,
  lastRamSound: -9,
  lastPoliceSpawn: -9,
  lastFootSpawn: -9,
  missionIndex: 0,
  missionsDone: false,
};

// ---------- Renderer / scene ----------
const container = document.getElementById('game-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 4, -8);
scene.add(camera);
G.renderer = renderer;
G.scene = scene;
G.camera = camera;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Helpers on G ----------
G.playerPos = () => {
  const p = G.player;
  if (!p.onFoot && p.vehicle) return { x: p.vehicle.mesh.position.x, z: p.vehicle.mesh.position.z };
  return { x: p.pos.x, z: p.pos.z };
};
G.save = () => writeSave(G);

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
const ui = {
  toastTimer: null,
  setStars(n) {
    let html = '';
    for (let i = 0; i < 5; i++) html += '<span class="' + (i < n ? '' : 'off') + '">★</span>';
    $('stars').innerHTML = html;
  },
  setObjective(text) { $('objective-text').textContent = text; },
  toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 2600);
  },
  setTimer(seconds) {
    const el = $('timer');
    if (seconds === null || seconds === undefined) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const s = Math.ceil(seconds);
    el.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  },
  showHud(show) { $('hud').classList.toggle('hidden', !show); },
};
G.ui = ui;

// ---------- Systems ----------
G.input = createInput();
G.audio = createAudio();
buildCity(G);
createPlayer(G);
createWanted(G);
createCombat(G);
createMissions(G);
const minimap = createMinimap(G);

// Restore save.
const saved = loadSave();
if (saved) {
  G.player.cash = saved.cash || 0;
  G.missionIndex = saved.missionIndex || 0;
  G.missionsDone = !!saved.missionsDone;
  G.missions.index = G.missionIndex;
  G.missions.done = G.missionsDone;
  $('save-note').textContent = 'Welcome back — $' + G.player.cash + ' saved, mission ' +
    (G.missionsDone ? 'chain complete' : (G.missionIndex + 1) + ' of 3') + '.';
}

// ---------- World population ----------
function populateWorld() {
  // Parked cars scattered on road edges.
  const roads = G.city.roadCoords;
  for (let i = 0; i < 14; i++) {
    const horizontal = G.rng() < 0.5;
    const road = roads[Math.floor(G.rng() * roads.length)];
    const t = -180 + G.rng() * 360;
    const x = horizontal ? t : road + (G.rng() < 0.5 ? -3 : 3);
    const z = horizontal ? road + (G.rng() < 0.5 ? -3 : 3) : t;
    const yaw = horizontal ? (G.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (G.rng() < 0.5 ? 0 : Math.PI);
    spawnCar(G, x, z, yaw, { parked: true, hasDriver: false });
  }
  spawnTraffic(G, 12);
  spawnPeds(G, 22);
}
populateWorld();

// Player start: on foot near the harbor center.
G.player.pos.set(6, 0, -30);
G.player.yaw = 0;
G.camYaw = 0;

// ---------- Demo scene setup ----------
function setupDemo(n) {
  const M = G.missions;
  const p = G.player;
  G.state = 'playing';
  ui.showHud(true);
  $('start-screen').classList.add('hidden');
  if (n === 1) {
    // Cover: chase shot, player car speeding, two police cars pursuing, 3 stars.
    const car = spawnCar(G, 3, -80, 0, { color: 0xff5c5c });
    p.vehicle = car; p.onFoot = false; p.mesh.visible = false;
    car.speed = 20;
    G.demoLane = 3;
    G.wantedSystem.add(3, '');
    ui.setStars(3);
    M.setObjective('ESCAPE THE POLICE — Lose the heat and reach the beach!');
    M.targetPos = new THREE.Vector3(40, 0, 198);
    M.beacon.position.set(40, 30, 198);
    M.beacon.visible = true;
    M.timer = 72; ui.setTimer(72);
    const cop1 = spawnCar(G, 0, -102, 0, { police: true, color: 0x1a1a2e, ai: 'police' });
    const cop2 = spawnCar(G, 9, -112, 0, { police: true, color: 0x1a1a2e, ai: 'police' });
    cop1.speed = 24; cop2.speed = 24;
    G.audio.setSiren(true);
  } else if (n === 2) {
    // On foot downtown: peds + traffic, mission marker ahead.
    M.startMission(0);
    const mc = M.markedCar;
    const mx = mc.mesh.position.x, mz = mc.mesh.position.z;
    p.pos.set(mx - 14, 0, mz + 18);
    p.yaw = Math.atan2(mx - p.pos.x, mz - p.pos.z);
    G.camYaw = p.yaw;
    G.camPitch = 0.22;
    // A few peds right in front of the camera.
    for (let i = 0; i < 4; i++) {
      const ped = G.peds[i];
      ped.mesh.position.set(p.pos.x - 6 + i * 4, 0, p.pos.z + 10 + (i % 2) * 3);
      ped.yaw = Math.PI;
    }
  } else if (n === 3) {
    // Driving view at an intersection near the beach.
    const car = spawnCar(G, 63, 120, 0, { color: 0x35f0ff });
    p.vehicle = car; p.onFoot = false; p.mesh.visible = false;
    car.speed = 14;
    G.demoLane = 63;
    M.setObjective('Free roam — cruise the harbor, grab cash, stay out of trouble.');
    // Traffic crossing the intersection ahead.
    const t1 = spawnCar(G, 30, 183, Math.PI / 2, { ai: 'traffic' });
    t1.traffic = { horizontal: true, road: 180, lane: 3, dir: 1, speed: 8, targetSpeed: 8, honkTimer: 9, turnCooldown: 0 };
    const t2 = spawnCar(G, 90, 177, -Math.PI / 2, { ai: 'traffic' });
    t2.traffic = { horizontal: true, road: 180, lane: -3, dir: -1, speed: 8, targetSpeed: 8, honkTimer: 9, turnCooldown: 0 };
  } else if (n === 4) {
    // Mission moment: timed getaway in the marked car, police closing in.
    M.startMission(2);
    M.timer = 72;
    const car = spawnCar(G, -57, -60, 0, { color: 0xffd23e, marked: true });
    p.vehicle = car; p.onFoot = false; p.mesh.visible = false;
    car.speed = 19;
    G.demoLane = -57;
    G.wantedSystem.add(3, '');
    ui.setStars(3);
    const cop1 = spawnCar(G, -60, -84, 0, { police: true, color: 0x1a1a2e, ai: 'police' });
    const cop2 = spawnCar(G, -51, -94, 0, { police: true, color: 0x1a1a2e, ai: 'police' });
    cop1.speed = 23; cop2.speed = 23;
  }
}

// ---------- Menus / state ----------
function startGame() {
  G.audio.init();
  G.audio.resume();
  G.audio.startAmbientPad();
  G.state = 'playing';
  $('start-screen').classList.add('hidden');
  $('gameover-screen').classList.add('hidden');
  ui.showHud(true);
  G.input.requestLock();
  if (!G.missionsDone && !G.missions.active && G.missionIndex < 3) {
    G.missions.startMission(G.missionIndex);
  } else if (G.missionsDone) {
    G.missions.setObjective('All missions done — free roam! Grab cash pickups, stay out of trouble.');
  }
}
function pauseGame() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  $('pause-screen').classList.remove('hidden');
  G.input.exitLock();
  G.audio.setEngine(0, false);
  G.audio.setSiren(false);
}
function resumeGame() {
  if (G.state !== 'paused') return;
  G.state = 'playing';
  $('pause-screen').classList.add('hidden');
  G.input.requestLock();
}
function gameOver(cause) {
  G.state = 'gameover';
  G.input.exitLock();
  G.audio.setEngine(0, false);
  G.audio.setSiren(false);
  $('gameover-text').textContent = cause === 'busted'
    ? 'The VHPD caught you. Hospital bill: $100.'
    : 'You got wasted. Hospital bill: $100.';
  $('gameover-screen').classList.remove('hidden');
}
function respawn() {
  const p = G.player;
  p.cash = Math.max(0, p.cash - 100);
  p.health = 100;
  p.invulnTimer = 3;
  if (p.vehicle) { p.vehicle.speed = 0; p.vehicle = null; }
  p.onFoot = true;
  p.mesh.visible = true;
  p.pos.set(G.city.hospital.x + 20, 0, G.city.hospital.z);
  p.yaw = 0;
  G.camYaw = 0;
  G.wantedSystem.clear();
  // Clear police.
  for (const car of G.cars.filter((c) => c.police)) removeCar(G, car);
  for (const cop of G.policeFoot) G.scene.remove(cop.mesh);
  G.policeFoot.length = 0;
  G.state = 'playing';
  $('gameover-screen').classList.add('hidden');
  G.input.requestLock();
  G.save();
}

$('start-btn').addEventListener('click', startGame);
$('resume-btn').addEventListener('click', resumeGame);
$('respawn-btn').addEventListener('click', respawn);

// ---------- Input bindings ----------
G.input.onKey = (code) => {
  if (code === 'KeyE' && G.state === 'playing' && G.time - G.lastEnterExit > 0.4) {
    G.lastEnterExit = G.time;
    tryEnterExitCar(G);
  }
  if (code === 'KeyP' && (G.state === 'playing' || G.state === 'paused')) {
    if (G.state === 'playing') pauseGame(); else resumeGame();
  }
  if (code === 'KeyF' && G.state === 'playing') G.combat.tryShoot();
};
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && G.state === 'playing' && !G.demo) pauseGame();
});
renderer.domElement.addEventListener('click', () => {
  if (G.state === 'playing') {
    if (!G.input.locked && !G.demo) G.input.requestLock();
    else G.combat.tryShoot();
  }
});

// ---------- Event queue ----------
function processEvents() {
  for (const ev of G.events) {
    if (ev.type === 'driverFled') scarePeds(G, ev.x, ev.z, 22);
    if (ev.type === 'playerDown') gameOver(ev.cause === 'busted' ? 'busted' : 'wasted');
  }
  G.events.length = 0;
}

// ---------- Demo auto-steering ----------
function updateDemoSteer() {
  if (!G.demoAuto) return;
  const p = G.player;
  if (!p.onFoot && p.vehicle) {
    const car = p.vehicle;
    const laneX = G.demoLane;
    const desiredYaw = THREE.MathUtils.clamp((laneX - car.mesh.position.x) * 0.06, -0.45, 0.45);
    let dyaw = desiredYaw - car.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    G.demoSteer = THREE.MathUtils.clamp(dyaw * 2.2, -1, 1);
    G.camYaw = car.yaw;
    G.camPitch = 0.26;
  } else if (p.onFoot) {
    G.camYaw = p.yaw;
  }
}

// ---------- Camera ----------
function updateCamera(dt) {
  const p = G.player;
  const mouse = G.input.consumeMouse();
  if (G.input.locked && G.state === 'playing') {
    G.camYaw -= mouse.dx * 0.0032;
    G.camPitch = THREE.MathUtils.clamp(G.camPitch + mouse.dy * 0.0032, -0.12, 0.62);
  }
  if (!p.onFoot && p.vehicle) {
    // Chase cam relaxes toward the car's heading.
    let dyaw = p.vehicle.yaw - G.camYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    G.camYaw += dyaw * Math.min(1, dt * 2.2);
  }
  const focus = new THREE.Vector3();
  if (!p.onFoot && p.vehicle) focus.copy(p.vehicle.mesh.position);
  else focus.copy(p.pos);
  // Demo chase scenes (1 & 4): high rear view down the road corridor — the
  // road is always clear of buildings, so the player's car and the police
  // cars behind it stay in frame.
  if ((G.demo === 1 || G.demo === 4) && !p.onFoot && p.vehicle) {
    const car = p.vehicle;
    let nearest = null, nd = Infinity;
    for (const c of G.cars) {
      if (!c.police) continue;
      const d = (c.mesh.position.x - car.mesh.position.x) ** 2 +
        (c.mesh.position.z - car.mesh.position.z) ** 2;
      if (d < nd) { nd = d; nearest = c; }
    }
    const look = car.mesh.position.clone();
    if (nearest) look.lerp(nearest.mesh.position, 0.5);
    look.y = 1.5;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
    // Sit behind the rearmost police car so the whole chase is in frame —
    // but only count police actually on the road behind (a randomly spawned
    // car off to the side must not shove the camera absurdly far back).
    let rear = 0;
    for (const c of G.cars) {
      if (!c.police) continue;
      const dx = c.mesh.position.x - car.mesh.position.x;
      const dz = c.mesh.position.z - car.mesh.position.z;
      const behind = -(dx * fx + dz * fz);
      const lateral = Math.abs(dx * rx + dz * rz);
      if (behind > 0 && lateral < 9 && behind > rear) rear = behind;
    }
    const backDist = Math.min(32, Math.max(16, rear + 10));
    camera.position.set(
      car.mesh.position.x - fx * backDist + rx * 1.5,
      11,
      car.mesh.position.z - fz * backDist + rz * 1.5
    );
    camera.lookAt(look);
    return;
  }
  const dist = p.onFoot ? 6.5 : 9.5;
  const height = p.onFoot ? 2.6 : 4.0;
  const cx = focus.x - Math.sin(G.camYaw) * dist * Math.cos(G.camPitch);
  const cz = focus.z - Math.cos(G.camYaw) * dist * Math.cos(G.camPitch);
  const cy = focus.y + height + Math.sin(G.camPitch) * dist * 0.4;
  camera.position.set(cx, cy, cz);
  const look = focus.clone();
  look.y += p.onFoot ? 1.6 : 1.4;
  if (!p.onFoot && p.vehicle) {
    look.x += Math.sin(p.vehicle.yaw) * 6;
    look.z += Math.cos(p.vehicle.yaw) * 6;
  }
  camera.lookAt(look);
}

// ---------- HUD ----------
function updateHud() {
  const p = G.player;
  $('cash').textContent = '$' + Math.round(p.cash).toLocaleString('en-US');
  $('health-bar').style.width = Math.max(0, p.health) + '%';
  $('health-text').textContent = Math.round(p.health);
  const speed = p.onFoot ? 0 : Math.abs(p.vehicle ? p.vehicle.speed : 0);
  $('speed').textContent = p.onFoot ? 'ON FOOT' : Math.round(speed * 2.24) + ' mph';
  $('weapon').textContent = p.onFoot ? 'PISTOL — click / F to shoot' : 'DRIVING — W/S drive, Space brake';
  $('crosshair').style.display = (p.onFoot && G.state === 'playing') ? 'block' : 'none';
  minimap.draw();
}

// ---------- Main loop ----------
const clock = new THREE.Clock();
let saveTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;

  if (G.state === 'playing') {
    updateDemoSteer();
    if (G.player.onFoot) updatePlayerOnFoot(G, dt);
    else if (G.player.vehicle) updatePlayerCar(G, G.player.vehicle, dt);
    updateTraffic(G, dt);
    updatePeds(G, dt);
    updatePolice(G, dt);
    G.wantedSystem.update(dt);
    G.missions.update(dt);
    G.combat.update(dt);
    G.audio.update(dt);

    // Player car hitting peds.
    const p = G.player;
    if (!p.onFoot && p.vehicle) {
      const car = p.vehicle;
      for (const ped of G.peds) {
        if (ped.dead) continue;
        const dx = ped.mesh.position.x - car.mesh.position.x;
        const dz = ped.mesh.position.z - car.mesh.position.z;
        if (dx * dx + dz * dz < 2.1 * 2.1 && Math.abs(car.speed) > 3) {
          const down = hurtPed(G, ped, 100, car.mesh.position.x, car.mesh.position.z);
          if (down) G.wantedSystem.add(1, 'Pedestrian run over');
          car.speed *= 0.85;
          G.audio.crash();
        }
      }
    }

    // Mouse click shooting (held).
    if (G.input.mouseDown && G.input.locked) G.combat.tryShoot();

    // Engine sound follows speed.
    const speedNorm = p.onFoot ? 0 : Math.abs(p.vehicle.speed) / 34;
    G.audio.setEngine(speedNorm, !p.onFoot);

    processEvents();
    saveTimer += dt;
    if (saveTimer > 10) { saveTimer = 0; G.save(); }
    updateHud();
  } else if (G.state === 'menu') {
    // Slow cinematic orbit behind the start screen.
    const t = G.time * 0.05;
    camera.position.set(Math.sin(t) * 90, 34, Math.cos(t) * 90 - 40);
    camera.lookAt(0, 6, 0);
    updateTraffic(G, dt);
    updatePeds(G, dt);
    renderer.render(scene, camera);
    return;
  }

  updateCamera(dt);
  renderer.render(scene, camera);
}

// ---------- Go ----------
if (DEMO) setupDemo(DEMO);
else ui.setStars(0);
window.__vh = { G };
animate();
