// missions.js — Vice Harbor story mission engine.
//
// Five hand-written jobs chained into a small campaign: steal a convertible,
// run a hot package down the beach, beat the clock on a night delivery, lift
// three cash crates under rising heat, and finish with the big one — a
// connected owner's magenta supercar that has to cross the whole map.
//
// The engine is step based. Each mission is a list of steps (goto / steal /
// deliver / pickup / escape) built fresh every time the mission starts, so a
// failed or restarted job always respawns its cars and props cleanly. A tall
// glowing beacon and a floating ring mark the current target in the world;
// the same coordinates are exposed as `marker` for the minimap.

import * as THREE from '../vendor/three.module.min.js';
import { makeCar } from './vehicles.js';

const FREE_ROAM = {
  title: 'Free Roam',
  objective: 'All missions complete — the harbor is yours.',
};

// Beacon / prop palette.
const BEACON_COLOR = 0xffd94d;
const PACKAGE_COLOR = 0xffc21c;
const CRATE_COLOR = 0x2eff7a;

export function createMissions(ctx) {
  const scene = ctx.scene;
  const player = ctx.player;
  const wanted = ctx.wanted;

  // Mission table. `build` functions are declared (and hoisted) below; each
  // one spawns that job's cars and returns its step list.
  const MISSIONS = [
    { title: 'First Wheels', reward: 300, timeLimit: 0, build: buildFirstWheels },
    { title: 'Beach Run', reward: 450, timeLimit: 0, build: buildBeachRun },
    { title: 'Night Courier', reward: 600, timeLimit: 150, build: buildNightCourier },
    { title: 'Harbor Heat', reward: 800, timeLimit: 0, build: buildHarborHeat },
    { title: 'The Vice Harbor Job', reward: 1500, timeLimit: 0, build: buildViceHarborJob },
  ];

  // ---- runtime state -----------------------------------------------------
  let state = 'idle'; // 'idle' | 'running' | 'celebrating' | 'freeroam'
  let missionIndex = 0;
  let mission = null; // { title, reward, timeLimit, steps }
  let stepIndex = 0;
  let step = null;
  let baseObjective = '';
  let timeLeft = 0;
  let stepTime = 0;
  let celebrateLeft = 0;
  let pendingNext = -1;
  let elapsed = 0;

  let missionCars = [];
  let prop = null; // glowing package / crate group for the current pickup step

  const api = {
    current: { title: FREE_ROAM.title, objective: FREE_ROAM.objective },
    marker: null,
    active: false,
    completedCount: 0,
    totalCount: MISSIONS.length,
    update,
    objectiveText,
    startFrom,
  };

  // ---- small helpers -----------------------------------------------------

  function playerPos() {
    return player.group.position;
  }

  function distTo(x, z) {
    const p = playerPos();
    const dx = p.x - x;
    const dz = p.z - z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function setMarker(x, z) {
    api.marker = { x, z };
    beacon.visible = true;
    beacon.position.set(x, 0, z);
  }

  function clearMarker() {
    api.marker = null;
    beacon.visible = false;
  }

  function formatObjective() {
    if (mission && mission.timeLimit > 0 && state === 'running') {
      const secs = Math.max(0, Math.ceil(timeLeft));
      return `${baseObjective} — ${secs}s left`;
    }
    return baseObjective;
  }

  function refreshObjective() {
    api.current = {
      title: mission ? mission.title : api.current.title,
      objective: formatObjective(),
    };
  }

  function objectiveText() {
    if (state === 'running' && mission) return formatObjective();
    return api.current.objective;
  }

  function notify(title, sub) {
    if (ctx.notify) ctx.notify(title, sub);
  }

  function addHeat(kind, times) {
    for (let i = 0; i < times; i++) wanted.report(kind);
  }

  // ---- world beacon ------------------------------------------------------
  // A translucent light pillar + a floating ring + a soft ground disc, all
  // parented to one group that we move to whatever the current marker is.

  const beacon = new THREE.Group();
  {
    const pillarMat = new THREE.MeshBasicMaterial({
      color: BEACON_COLOR,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 38, 20, 1, true),
      pillarMat
    );
    pillar.position.y = 19;
    beacon.add(pillar);
    beacon.userData.pillarMat = pillarMat;

    const ringMat = new THREE.MeshBasicMaterial({
      color: BEACON_COLOR,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.14, 10, 44), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.1;
    beacon.add(ring);
    beacon.userData.ring = ring;

    const discMat = new THREE.MeshBasicMaterial({
      color: BEACON_COLOR,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.4, 32), discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.12;
    beacon.add(disc);
  }
  beacon.visible = false;
  scene.add(beacon);

  // ---- pickup props (package / cash crate) --------------------------------

  function spawnProp(kind, x, z) {
    removeProp();
    const isCrate = kind === 'crate';
    const color = isCrate ? CRATE_COLOR : PACKAGE_COLOR;
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.8, 1.15),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.55,
        roughness: 0.45,
        metalness: 0.1,
      })
    );
    body.position.y = 0.75;
    group.add(body);

    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.18, 1.3),
      new THREE.MeshStandardMaterial({
        color: 0x22242a,
        emissive: color,
        emissiveIntensity: 0.25,
        roughness: 0.6,
        metalness: 0.2,
      })
    );
    lid.position.y = 1.22;
    group.add(lid);

    const glow = new THREE.PointLight(color, 7, 13, 1.6);
    glow.position.y = 1.6;
    group.add(glow);

    group.position.set(x, 0, z);
    group.userData.body = body;
    scene.add(group);
    prop = group;
  }

  function removeProp() {
    if (prop) {
      scene.remove(prop);
      prop = null;
    }
  }

  // ---- mission cars --------------------------------------------------------

  function spawnMissionCar(x, z, angle, color, kind) {
    const car = makeCar(scene, { x, z, angle, color, kind });
    car.missionCar = true;
    car.spawnInfo = { x, z, angle, color, kind };
    missionCars.push(car);
    return car;
  }

  function removeMissionCars() {
    for (const car of missionCars) {
      // If the player is sitting in a mission car that is about to vanish,
      // put them back on the street where the car was instead of leaving
      // the player controller pointing at a removed group.
      if (player.car === car) {
        player.group.position.copy(car.group.position);
        player.car = null;
      }
      scene.remove(car.group);
    }
    missionCars = [];
  }

  // If the car a step depends on gets destroyed, quietly replace it at its
  // original spawn point and rewire every step that referenced the wreck.
  function ensureCarAlive(ownerStep) {
    const car = ownerStep.car;
    if (!car || !car.dead) return;
    const info = car.spawnInfo;
    scene.remove(car.group);
    missionCars = missionCars.filter((c) => c !== car);
    const fresh = spawnMissionCar(info.x, info.z, info.angle, info.color, info.kind);
    for (const s of mission.steps) {
      if (s.car === car) s.car = fresh;
    }
    if (step && step.car === fresh && step.type === 'steal') {
      setMarker(info.x, info.z);
    }
    notify('Vehicle Wrecked', 'The car was wrecked — a replacement waits.');
  }

  function cleanupMission() {
    removeProp();
    removeMissionCars();
    mission = null;
    step = null;
    clearMarker();
  }

  // ======================================================================
  // The five jobs. Each build() runs at mission start (and on restart), so
  // every car it spawns is fresh and every step closes over live objects.
  // ======================================================================

  // 1 — First Wheels: a soft introduction. Meet the contact, lift the gold
  // convertible he marked, and park it in the downtown garage.
  function buildFirstWheels() {
    const convertible = spawnMissionCar(124, 188, -Math.PI / 2, 0xffc21c, 'sport');
    return [
      {
        type: 'goto', x: 120, z: 196, r: 6,
        text: 'Meet your contact on the boardwalk at the beach.',
      },
      {
        type: 'steal', car: convertible,
        text: 'Steal the gold convertible your contact marked.',
      },
      {
        type: 'deliver', car: convertible, x: -40, z: -36, r: 9,
        text: 'Deliver the convertible to the downtown garage.',
      },
    ];
  }

  // 2 — Beach Run: the package is hot. The moment it leaves the hut the
  // harbor knows, so the run home is: shake the law, then walk it in.
  function buildBeachRun() {
    return [
      {
        type: 'pickup', x: -160, z: 208, r: 5, prop: 'package',
        text: 'Pick up the package from the beach hut.',
        onDone: () => {
          // Six reports' worth of heat: one gunfire call that starts the
          // sirens, then a pile of assault reports as witnesses phone in.
          wanted.report('gunfire');
          addHeat('assault', 5);
          if (ctx.audio && ctx.audio.pickup) ctx.audio.pickup();
          notify('Package Lifted', 'Somebody talked — the harbor is crawling with cops.');
        },
      },
      {
        type: 'escape',
        text: 'Lose the cops — break away and let the heat die down.',
      },
      {
        type: 'goto', x: 200, z: 160, r: 6, foot: true,
        text: 'Deliver the package on foot to the marina drop point.',
      },
    ];
  }

  // 3 — Night Courier: a timed favor for the club. The sedan is waiting at
  // the east depot; the door it needs to reach is across town, and the
  // clock started the moment you agreed.
  function buildNightCourier() {
    const sedan = spawnMissionCar(200, -112, Math.PI, 0x9fb4c7, 'civil');
    return [
      {
        type: 'goto', x: 200, z: -120, r: 7,
        text: 'Get to the depot on the east side of the harbor.',
      },
      {
        type: 'steal', car: sedan,
        text: 'Take the waiting sedan — keys are in it.',
      },
      {
        type: 'deliver', car: sedan, x: -120, z: 40, r: 9,
        text: 'Deliver the sedan to the club door before time runs out.',
      },
    ];
  }

  // 4 — Harbor Heat: three cash crates, three neighborhoods, and every
  // crate you touch makes the radio chatter louder. Cash out, cool off,
  // then disappear into the safehouse.
  function buildHarborHeat() {
    const crateSpots = [
      { x: 160, z: 120, label: 'the marina warehouse crate' },
      { x: -80, z: 200, label: 'the beach boardwalk crate' },
      { x: -200, z: -40, label: 'the west docks crate' },
    ];
    const steps = crateSpots.map((spot, i) => ({
      type: 'pickup', x: spot.x, z: spot.z, r: 5, prop: 'crate',
      text: `Collect cash crate ${i + 1} of 3 — ${spot.label}.`,
      onDone: () => {
        addHeat('propertyDamage', 3);
        if (ctx.audio && ctx.audio.pickup) ctx.audio.pickup();
        notify(
          `Crate ${i + 1} Secured`,
          i < 2 ? 'Heat is rising — keep moving.' : 'That is the last crate. Now vanish.'
        );
      },
    }));
    steps.push({
      type: 'escape',
      text: 'Lose the cops before you go anywhere near the safehouse.',
    });
    steps.push({
      type: 'goto', x: -200, z: -160, r: 8,
      text: 'Reach the safehouse in the northwest and lie low.',
    });
    return steps;
  }

  // 5 — The Vice Harbor Job: the finale. A magenta supercar owned by a man
  // with friends in every precinct, and a buyer waiting at the far corner
  // of the map. Steal it and the whole harbor lights up.
  function buildViceHarborJob() {
    const supercar = spawnMissionCar(-40, -200, 0, 0xff2fd6, 'sport');
    return [
      {
        type: 'steal', car: supercar,
        text: 'Steal the magenta supercar — its owner is connected, so expect trouble.',
        onDone: () => {
          wanted.report('copDown');
          wanted.report('theft');
          notify('Wrong Car, Wrong Owner', 'Every cop in Vice Harbor just got your description.');
        },
      },
      {
        type: 'deliver', car: supercar, x: 220, z: -220, r: 10,
        text: 'Deliver the supercar to the buyer at the far northeast drop.',
      },
    ];
  }

  // ======================================================================
  // Step engine
  // ======================================================================

  function enterStep() {
    step = mission.steps[stepIndex];
    stepTime = 0;
    baseObjective = step.text;
    removeProp();

    switch (step.type) {
      case 'goto':
      case 'deliver':
        setMarker(step.x, step.z);
        break;
      case 'pickup':
        setMarker(step.x, step.z);
        spawnProp(step.prop || 'package', step.x, step.z);
        break;
      case 'steal': {
        const p = step.car.group.position;
        setMarker(p.x, p.z);
        break;
      }
      case 'escape':
        clearMarker();
        break;
      default:
        clearMarker();
        break;
    }
    refreshObjective();
  }

  function advanceStep() {
    const finished = step;
    if (finished.type === 'pickup') {
      removeProp();
      if (ctx.audio && ctx.audio.pickup) ctx.audio.pickup();
    }
    if (finished.onDone) finished.onDone();

    stepIndex += 1;
    if (stepIndex >= mission.steps.length) {
      completeMission();
    } else {
      enterStep();
    }
  }

  function completeMission() {
    const doneIndex = missionIndex;
    const reward = mission.reward;
    const title = mission.title;

    ctx.addCash(reward);
    if (ctx.audio && ctx.audio.cash) ctx.audio.cash();
    if (ctx.audio && ctx.audio.missionDone) ctx.audio.missionDone();

    cleanupMission();
    api.completedCount = doneIndex + 1;

    if (doneIndex >= MISSIONS.length - 1) {
      // Campaign finished — straight into free roam with the final word.
      missionIndex = MISSIONS.length;
      state = 'freeroam';
      api.active = false;
      baseObjective = FREE_ROAM.objective;
      api.current = { title: FREE_ROAM.title, objective: FREE_ROAM.objective };
      notify(
        'The Vice Harbor Job — Complete',
        `+$${reward}. Every job done — the harbor is yours.`
      );
      return;
    }

    // Brief celebration beat, then the next job starts itself.
    state = 'celebrating';
    api.active = false;
    celebrateLeft = 3;
    pendingNext = doneIndex + 1;
    baseObjective = `${title} done. Next job starts in 3 seconds.`;
    api.current = { title: 'Mission Complete', objective: baseObjective };
    notify('Mission Complete', `${title} — +$${reward}.`);
  }

  function failMission() {
    const restartIndex = missionIndex;
    const title = mission.title;
    notify('Mission Failed', `${title} — out of time. The job resets.`);
    cleanupMission();
    startMission(restartIndex);
  }

  function startMission(index) {
    cleanupMission();
    missionIndex = index;
    const def = MISSIONS[index];
    mission = {
      title: def.title,
      reward: def.reward,
      timeLimit: def.timeLimit,
      steps: def.build(),
    };
    timeLeft = def.timeLimit;
    stepIndex = 0;
    state = 'running';
    api.active = true;
    api.completedCount = index;
    enterStep();
    notify(def.title, baseObjective);
  }

  function setFreeRoam() {
    cleanupMission();
    missionIndex = MISSIONS.length;
    state = 'freeroam';
    api.active = false;
    api.completedCount = MISSIONS.length;
    baseObjective = FREE_ROAM.objective;
    api.current = { title: FREE_ROAM.title, objective: FREE_ROAM.objective };
  }

  // Boot / resume entry point: begin at the given 0-based mission index
  // (the save system stores where the player left off). Past the end means
  // the campaign is done and the harbor is open.
  function startFrom(index) {
    const i = Math.max(0, Math.floor(index) || 0);
    if (i >= MISSIONS.length) {
      setFreeRoam();
    } else {
      startMission(i);
    }
  }

  // ======================================================================
  // Per-frame update: beacon pulse, prop bob, timers, step checks.
  // ======================================================================

  function update(dt) {
    elapsed += dt;

    // Beacon animation — pillar breathing, ring slowly spinning and the
    // whole pillar bobbing a breath above the street.
    if (beacon.visible && api.marker) {
      beacon.position.set(api.marker.x, Math.sin(elapsed * 2) * 0.15, api.marker.z);
      beacon.userData.pillarMat.opacity = 0.24 + 0.12 * (0.5 + 0.5 * Math.sin(elapsed * 4));
      const ring = beacon.userData.ring;
      ring.rotation.z += dt * 0.9;
      const s = 1 + 0.13 * Math.sin(elapsed * 4);
      ring.scale.set(s, s, 1);
    }

    // Pickup prop: slow spin and a gentle hover bob.
    if (prop) {
      prop.rotation.y += dt * 1.4;
      prop.position.y = 0.15 + 0.12 * (0.5 + 0.5 * Math.sin(elapsed * 3));
    }

    // Between missions: count down the celebration, then roll into the
    // next job on its own.
    if (state === 'celebrating') {
      celebrateLeft -= dt;
      if (celebrateLeft <= 0 && pendingNext >= 0) {
        const next = pendingNext;
        pendingNext = -1;
        startMission(next);
      }
      return;
    }

    if (state !== 'running' || !mission || !step) return;

    stepTime += dt;

    // Timed jobs (Night Courier): the clock is always running, and an
    // expired clock fails the job and restarts it fresh.
    if (mission.timeLimit > 0) {
      timeLeft -= dt;
      refreshObjective();
      if (timeLeft <= 0) {
        failMission();
        return;
      }
    }

    // A wrecked mission car is replaced at its spawn point, whatever step
    // we are on — the job must always stay finishable.
    if (step.car) ensureCarAlive(step);

    switch (step.type) {
      case 'goto': {
        if (step.foot && player.car) break; // this one has to be on foot
        if (distTo(step.x, step.z) <= step.r) advanceStep();
        break;
      }
      case 'steal': {
        // Keep the beacon glued to the target car until it is taken.
        const p = step.car.group.position;
        setMarker(p.x, p.z);
        if (player.car === step.car) advanceStep();
        break;
      }
      case 'deliver': {
        if (player.car === step.car && distTo(step.x, step.z) <= step.r) {
          advanceStep();
        }
        break;
      }
      case 'pickup': {
        if (distTo(step.x, step.z) <= step.r) advanceStep();
        break;
      }
      case 'escape': {
        // A beat of grace so a heat spike that has not landed yet cannot
        // make the step complete (or look broken) in the same frame.
        if (stepTime > 0.75 && wanted.level === 0) advanceStep();
        break;
      }
      default:
        break;
    }
  }

  return api;
}
