// missions.js — 3-mission story chain + free-roam cash pickups.
import * as THREE from 'three';
import { spawnCar } from './vehicles.js';

const MISSION_DEFS = [
  {
    id: 1, name: 'Hot Wheels',
    steps: [
      { text: 'Steal the marked car (gold ring)', target: 'markedCar', radius: 4 },
      { text: 'Deliver the car to the gold marker', target: 'deliver', radius: 6 },
    ],
    reward: 500,
  },
  {
    id: 2, name: 'The Package',
    steps: [
      { text: 'Pick up the package at the gold marker', target: 'package', radius: 4 },
      { text: 'Lose the heat — deliver the package downtown', target: 'dropoff', radius: 6 },
    ],
    reward: 800,
  },
  {
    id: 3, name: 'Beach Getaway',
    steps: [
      { text: 'Reach the beach before time runs out!', target: 'beach', radius: 10, timed: 90 },
    ],
    reward: 1200,
  },
];

function makeBeacon(color) {
  const geo = new THREE.CylinderGeometry(1.6, 1.6, 60, 16, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.28, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const beacon = new THREE.Mesh(geo, mat);
  beacon.position.y = 30;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.4, 0.14, 8, 32),
    new THREE.MeshBasicMaterial({ color })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.25;
  beacon.add(ring);
  return beacon;
}

function makePickupMesh() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.7, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x2eff7a, emissive: 0x2eff7a, emissiveIntensity: 0.9 })
  );
  g.add(box);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.76, 0.2, 0.76),
    new THREE.MeshBasicMaterial({ color: 0xd8ffd8 })
  );
  g.add(sign);
  return g;
}

export function createMissions(G) {
  const M = {
    defs: MISSION_DEFS,
    index: G.missionIndex || 0,
    step: 0,
    timer: 0,
    active: false,
    done: G.missionsDone || false,
    targetPos: null,
    beacon: null,
    markedCar: null,
    packageMesh: null,
    pickups: [],
    pickupTimer: 0,
  };
  G.missions = M;
  G.missionIndex = M.index;
  G.missionsDone = M.done;

  M.beacon = makeBeacon(0xffd23e);
  M.beacon.visible = false;
  G.scene.add(M.beacon);

  M.setObjective = (text) => {
    G.ui.setObjective(text);
  };

  M.spawnMarkedCar = () => {
    // A flashy car a couple of blocks away, on a road — never right next to
    // the player, so the "go steal it" step means a real trip.
    const p = G.playerPos();
    const roads = G.city.roadCoords;
    let x = 0, z = 0;
    for (let tries = 0; tries < 20; tries++) {
      const road = roads[Math.floor(G.rng() * roads.length)];
      const along = -150 + G.rng() * 300;
      x = road + 3; z = along;
      if (Math.hypot(x - p.x, z - p.z) > 40) break;
    }
    const car = spawnCar(G, x, z, 0, { color: 0xffd23e, marked: true, parked: true, hasDriver: false });
    M.markedCar = car;
    return car;
  };

  M.pickTargetSpot = (kind) => {
    const p = G.playerPos();
    const roads = G.city.roadCoords;
    // Pick a spot at least 60 units away from the player.
    for (let tries = 0; tries < 20; tries++) {
      const road = roads[Math.floor(G.rng() * roads.length)];
      const along = -180 + G.rng() * 360;
      const horizontal = G.rng() < 0.5;
      const x = horizontal ? along : road + 3;
      const z = horizontal ? road + 3 : along;
      if (Math.hypot(x - p.x, z - p.z) > 60) {
        if (kind === 'beach') return new THREE.Vector3(60 + (G.rng() - 0.5) * 40, 0, 198);
        return new THREE.Vector3(x, 0, z);
      }
    }
    return new THREE.Vector3(60, 0, 120);
  };

  M.startMission = (idx) => {
    M.index = idx;
    M.step = 0;
    M.active = true;
    G.missionIndex = idx;
    const def = MISSION_DEFS[idx];
    if (!def) { M.finishAll(); return; }
    G.ui.toast('MISSION ' + def.id + ': ' + def.name);
    G.audio.chime();
    M.startStep();
  };

  M.startStep = () => {
    const def = MISSION_DEFS[M.index];
    const stepDef = def.steps[M.step];
    M.setObjective(def.name + ' — ' + stepDef.text);
    if (stepDef.timed) M.timer = stepDef.timed;
    const p = G.playerPos();
    if (stepDef.target === 'markedCar') {
      if (!M.markedCar) M.spawnMarkedCar();
      M.targetPos = M.markedCar.mesh.position.clone();
    } else if (stepDef.target === 'deliver') {
      M.targetPos = M.pickTargetSpot('deliver');
    } else if (stepDef.target === 'package') {
      M.targetPos = M.pickTargetSpot('package');
      if (!M.packageMesh) {
        M.packageMesh = makePickupMesh();
        M.packageMesh.scale.setScalar(1.4);
        G.scene.add(M.packageMesh);
      }
      M.packageMesh.visible = true;
      M.packageMesh.position.set(M.targetPos.x, 1.2, M.targetPos.z);
    } else if (stepDef.target === 'dropoff') {
      M.targetPos = M.pickTargetSpot('dropoff');
      if (M.packageMesh) M.packageMesh.visible = false;
    } else if (stepDef.target === 'beach') {
      M.targetPos = M.pickTargetSpot('beach');
    }
    M.beacon.position.set(M.targetPos.x, 30, M.targetPos.z);
    M.beacon.visible = true;
  };

  M.completeStep = () => {
    const def = MISSION_DEFS[M.index];
    G.audio.chime();
    G.save();
    M.step++;
    if (M.step >= def.steps.length) {
      M.completeMission();
    } else {
      M.startStep();
    }
  };

  M.completeMission = () => {
    const def = MISSION_DEFS[M.index];
    G.player.cash += def.reward;
    G.ui.toast('MISSION COMPLETE — +$' + def.reward);
    G.audio.chime();
    M.beacon.visible = false;
    M.targetPos = null;
    M.active = false;
    if (M.markedCar) {
      M.markedCar.marked = false;
      if (M.markedCar.markerRing) M.markedCar.markerRing.visible = false;
      M.markedCar = null;
    }
    M.index++;
    G.missionIndex = M.index;
    G.save();
    if (M.index >= MISSION_DEFS.length) {
      M.finishAll();
    } else {
      setTimeout(() => { if (G.state === 'playing') M.startMission(M.index); }, 2500);
    }
  };

  M.finishAll = () => {
    M.done = true;
    G.missionsDone = true;
    M.active = false;
    M.setObjective('All missions done — free roam! Grab cash pickups, stay out of trouble.');
    G.save();
  };

  M.checkStep = () => {
    if (!M.active || !M.targetPos) return;
    const def = MISSION_DEFS[M.index];
    if (!def) return;
    const stepDef = def.steps[M.step];
    const p = G.playerPos();
    const d = Math.hypot(p.x - M.targetPos.x, p.z - M.targetPos.z);
    if (stepDef.target === 'markedCar') {
      // Step completes when the player is driving the marked car.
      if (!G.player.onFoot && G.player.vehicle === M.markedCar) {
        M.completeStep();
        return;
      }
      // Keep the beacon glued to the car.
      M.targetPos.copy(M.markedCar.mesh.position);
      M.beacon.position.set(M.targetPos.x, 30, M.targetPos.z);
      return;
    }
    if (d < stepDef.radius) {
      // A delivery only counts while driving the mission car — walking to
      // the marker on foot is not a delivery.
      if (stepDef.target === 'deliver' && G.player.vehicle !== M.markedCar) {
        return;
      }
      if (stepDef.target === 'package') {
        G.ui.toast('Package secured! Now deliver it.');
        G.wantedSystem.add(2, 'Package job — the law is on you');
      }
      M.completeStep();
    }
  };

  M.update = (dt) => {
    if (M.active) {
      const def = MISSION_DEFS[M.index];
      if (def) {
        const stepDef = def.steps[M.step];
        if (stepDef && stepDef.timed) {
          M.timer -= dt;
          G.ui.setTimer(Math.max(0, M.timer));
          if (M.timer <= 0) {
            G.ui.setTimer(null);
            G.ui.toast('Too slow! Mission failed — try again.');
            M.active = false;
            M.beacon.visible = false;
            M.targetPos = null;
            setTimeout(() => { if (G.state === 'playing') M.startMission(M.index); }, 3000);
            return;
          }
        } else {
          G.ui.setTimer(null);
        }
      }
      M.checkStep();
    }
    // Cash pickups: spawn a few, collect on touch.
    M.pickupTimer -= dt;
    if (M.pickups.length < 5 && M.pickupTimer <= 0) {
      M.pickupTimer = 6;
      const spot = M.pickTargetSpot('pickup');
      const mesh = makePickupMesh();
      mesh.position.set(spot.x, 1.0, spot.z);
      G.scene.add(mesh);
      M.pickups.push({ mesh, spin: G.rng() * 6 });
    }
    const p = G.playerPos();
    for (let i = M.pickups.length - 1; i >= 0; i--) {
      const pk = M.pickups[i];
      pk.mesh.rotation.y += dt * 2;
      pk.mesh.position.y = 1.0 + Math.sin(G.time * 2 + pk.spin) * 0.25;
      if (Math.hypot(p.x - pk.mesh.position.x, p.z - pk.mesh.position.z) < 2.2) {
        G.player.cash += 50;
        G.audio.chime();
        G.ui.toast('+$50 cash pickup');
        G.scene.remove(pk.mesh);
        M.pickups.splice(i, 1);
        G.save();
      }
    }
    if (M.beacon.visible) {
      M.beacon.rotation.y += dt * 0.6;
      M.beacon.material.opacity = 0.22 + Math.sin(G.time * 3) * 0.08;
    }
  };

  return M;
}
