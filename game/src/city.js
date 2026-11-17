// city.js — procedural neon harbor city for Vice Harbor.
//
// Builds the static world (asphalt road grid, city blocks with emissive
// window buildings, sidewalks, palms, lamps, neon signs, beach and water),
// produces AABB colliders for every building, and runs the living
// environment: a 240-second day/night cycle plus a weather state machine
// (clear -> cloudy -> rain -> fog). No external assets; the only texture
// is a window facade generated on a canvas in code.

import * as THREE from '../vendor/three.module.min.js';

// ---------------------------------------------------------------------------
// World contract constants (shared with minimap / traffic / missions).
// ---------------------------------------------------------------------------
export const WORLD_SIZE = 560;          // ground is 560 x 560, centered on 0,0
export const ROAD_LINES = [];           // road center lines on both axes
for (let r = -200; r <= 200; r += 40) ROAD_LINES.push(r);
export const ROAD_SPACING = 40;
export const ROAD_WIDTH = 12;
export const BEACH_Z = 196;             // sand strip starts here
export const WATER_Z = 232;             // open water beyond here
export const BOUND = 264;               // playable limit

// Deterministic RNG so the city layout is identical on every load.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261117);

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

// ---------------------------------------------------------------------------
// World queries (also returned from createCity).
// ---------------------------------------------------------------------------
export function isRoad(x, z) {
  if (Math.abs(x) > WORLD_SIZE / 2 || Math.abs(z) > WORLD_SIZE / 2) return false;
  const half = ROAD_WIDTH / 2;
  for (const r of ROAD_LINES) {
    if (Math.abs(x - r) <= half || Math.abs(z - r) <= half) return true;
  }
  return false;
}

export function isWater(x, z) {
  return z > WATER_Z;
}

export function spawnPoint() {
  // Nearest road intersection to the origin, nudged down the road a little
  // so the player starts on asphalt facing the downtown blocks.
  let rx = ROAD_LINES[0], rz = ROAD_LINES[0];
  for (const r of ROAD_LINES) {
    if (Math.abs(r) < Math.abs(rx)) rx = r;
    if (Math.abs(r) < Math.abs(rz)) rz = r;
  }
  return { x: rx, z: rz + 8 };
}

// ---------------------------------------------------------------------------
// Emissive window facade texture, painted on a canvas in code.
// ---------------------------------------------------------------------------
function makeFacadeTexture(baseColor, trimColor, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, c.width, c.height);
  // subtle vertical shading so towers do not look flat
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = trimColor;
  g.fillRect(0, 0, c.width, 5);
  g.fillRect(0, c.height - 5, c.width, 5);
  const litColors = ['#ffd98a', '#fff3c4', '#bfe3ff', '#ffb26b', '#e8f6ff'];
  const cols = 8, rows = 18;
  const cw = c.width / cols, ch = c.height / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = i * cw + 3, y = j * ch + 3, w = cw - 6, h = ch - 6;
      if (rng() < litRatio) {
        g.fillStyle = litColors[Math.floor(rng() * litColors.length)];
      } else {
        g.fillStyle = rng() < 0.5 ? '#0d1017' : '#141a26';
      }
      g.fillRect(x, y, w, h);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------------------
// createCity
// ---------------------------------------------------------------------------
export function createCity(scene) {
  const group = new THREE.Group();
  group.name = 'ViceHarborCity';
  scene.add(group);

  const colliders = [];   // {x, z, hw, hd} for buildings only
  const buildings = [];   // {x, z, hw, hd, h} kept for neon sign placement

  // --- shared materials -----------------------------------------------------
  const facadeMats = [
    new THREE.MeshStandardMaterial({
      map: makeFacadeTexture('#3d4453', '#232833', 0.42),
      emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.85, metalness: 0.05,
    }),
    new THREE.MeshStandardMaterial({
      map: makeFacadeTexture('#54453a', '#2e2620', 0.36),
      emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.9, metalness: 0.02,
    }),
    new THREE.MeshStandardMaterial({
      map: makeFacadeTexture('#2f3d4a', '#1c242e', 0.5),
      emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.8, metalness: 0.08,
    }),
  ];
  for (const m of facadeMats) m.emissiveMap = m.map;
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x494d55, roughness: 1 });
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x232329, roughness: 0.95 });
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x8f939c, roughness: 1 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xe8e6da });

  // --- ground base ----------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  group.add(ground);

  // --- road strips ----------------------------------------------------------
  const roadGeoV = new THREE.PlaneGeometry(ROAD_WIDTH, WORLD_SIZE);
  const roadGeoH = new THREE.PlaneGeometry(WORLD_SIZE, ROAD_WIDTH);
  for (const r of ROAD_LINES) {
    const v = new THREE.Mesh(roadGeoV, roadMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(r, 0.02, 0);
    group.add(v);
    const h = new THREE.Mesh(roadGeoH, roadMat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.02, r);
    group.add(h);
  }

  // --- lane dashes (one InstancedMesh for the whole grid) -------------------
  const dashGeo = new THREE.BoxGeometry(0.28, 0.02, 3.2);
  const dashPositions = [];
  for (const r of ROAD_LINES) {
    for (let d = -270; d <= 270; d += 10) {
      dashPositions.push({ x: r, z: d, rot: 0 });          // road running along z
      dashPositions.push({ x: d, z: r, rot: Math.PI / 2 }); // road running along x
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashPositions.length);
  {
    const dummy = new THREE.Object3D();
    dashPositions.forEach((p, i) => {
      dummy.position.set(p.x, 0.045, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.updateMatrix();
      dashes.setMatrixAt(i, dummy.matrix);
    });
    dummy.rotation.set(0, 0, 0);
  }
  dashes.instanceMatrix.needsUpdate = true;
  group.add(dashes);

  // --- sidewalks + buildings, one city block at a time ----------------------
  const slabGeo = new THREE.BoxGeometry(28, 0.3, 28);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  function addBuilding(bx, bz, w, d, h) {
    const mat = facadeMats[Math.floor(rng() * facadeMats.length)];
    const mesh = new THREE.Mesh(unitBox, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(bx, h / 2 + 0.3, bz);
    group.add(mesh);
    colliders.push({ x: bx, z: bz, hw: w / 2, hd: d / 2 });
    buildings.push({ x: bx, z: bz, hw: w / 2, hd: d / 2, h });
  }

  function towerHeight(downtown, scale) {
    return Math.min(55, (10 + rng() * 20 + downtown * 25) * scale);
  }

  for (let cx = -180; cx <= 180; cx += ROAD_SPACING) {
    for (let cz = -180; cz <= 180; cz += ROAD_SPACING) {
      const slab = new THREE.Mesh(slabGeo, sidewalkMat);
      slab.position.set(cx, 0.15, cz);
      group.add(slab);

      const downtown = clamp(1 - Math.hypot(cx, cz) / 300, 0, 1);
      const layout = rng();
      if (layout < 0.38) {
        // single tower
        const w = 17 + rng() * 7, d = 17 + rng() * 7;
        addBuilding(cx, cz, w, d, towerHeight(downtown, 1));
      } else if (layout < 0.72) {
        // pair of slabs side by side
        addBuilding(cx - 7, cz, 11, 19 + rng() * 4, towerHeight(downtown, 0.8));
        addBuilding(cx + 7, cz, 11, 19 + rng() * 4, towerHeight(downtown, 0.8));
      } else {
        // four corner blocks
        for (const ox of [-6.5, 6.5]) {
          for (const oz of [-6.5, 6.5]) {
            addBuilding(cx + ox, cz + oz, 10.5, 10.5, towerHeight(downtown, 0.62));
          }
        }
      }
    }
  }

  // --- palm trees (beach row + promenade row) -------------------------------
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 4.6, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7d5f42, roughness: 1 });
  const frondGeo = new THREE.PlaneGeometry(3.9, 1.15);
  frondGeo.translate(1.7, 0, 0); // pivot at the crown, blade reaching outward
  const frondMat = new THREE.MeshStandardMaterial({
    color: 0x2e8b57, roughness: 0.9, side: THREE.DoubleSide,
  });

  function addPalm(x, z) {
    const palm = new THREE.Group();
    const tilt = (rng() - 0.5) * 0.16;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.3;
    trunk.rotation.z = tilt;
    palm.add(trunk);
    const crown = new THREE.Group();
    crown.position.set(Math.sin(-tilt) * 4.4, 4.55, 0);
    for (let i = 0; i < 3; i++) {
      const frond = new THREE.Mesh(frondGeo, frondMat);
      frond.rotation.y = (i / 3) * Math.PI * 2 + rng() * 0.4;
      frond.rotation.z = -0.5 - rng() * 0.25; // droop
      crown.add(frond);
    }
    palm.add(crown);
    palm.position.set(x, 0.05, z);
    palm.rotation.y = rng() * Math.PI * 2;
    const s = 0.85 + rng() * 0.5;
    palm.scale.set(s, s, s);
    group.add(palm);
  }

  for (let x = -252; x <= 252; x += 24) {
    addPalm(x + (rng() - 0.5) * 6, 207 + rng() * 5);   // beach row
    addPalm(x + 12 + (rng() - 0.5) * 6, 186 + rng() * 3); // promenade row
  }

  // --- street lamps at every other intersection -----------------------------
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 5.2, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.7, metalness: 0.4 });
  const bulbGeo = new THREE.SphereGeometry(0.3, 10, 8);
  const lampBulbMat = new THREE.MeshBasicMaterial({ color: 0x777777 });
  const lampDayColor = new THREE.Color(0x6b6f75);
  const lampNightColor = new THREE.Color(0xffd9a0);
  for (let i = 0; i < ROAD_LINES.length; i += 2) {
    for (let j = 0; j < ROAD_LINES.length; j += 2) {
      const lx = ROAD_LINES[i] + 7.5, lz = ROAD_LINES[j] + 7.5;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(lx, 2.6, lz);
      group.add(pole);
      const bulb = new THREE.Mesh(bulbGeo, lampBulbMat);
      bulb.position.set(lx, 5.35, lz);
      group.add(bulb);
    }
  }

  // --- neon signs on tall downtown buildings --------------------------------
  const neonPalette = [0xff2d95, 0x22d3ee, 0xff9f1c, 0x7c5cff, 0x2dffb3];
  const neonSigns = []; // {mat, base:THREE.Color, phase}
  {
    let placed = 0;
    for (const b of buildings) {
      if (placed >= 14) break;
      if (b.h < 26 || Math.hypot(b.x, b.z) > 175) continue;
      if (rng() < 0.45) continue;
      const color = new THREE.Color(neonPalette[placed % neonPalette.length]);
      const mat = new THREE.MeshBasicMaterial({ color: color.clone() });
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.9, Math.min(11, b.hw * 1.6)), mat);
      sign.position.set(b.x + b.hw + 0.25, b.h * 0.58, b.z);
      group.add(sign);
      neonSigns.push({ mat, base: color, phase: rng() * Math.PI * 2 });
      placed++;
    }
  }

  // --- beach + water ----------------------------------------------------------
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE, WATER_Z - BEACH_Z),
    new THREE.MeshStandardMaterial({ color: 0xd6bd8a, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.03, (BEACH_Z + WATER_Z) / 2);
  group.add(sand);

  const waterMat = new THREE.MeshPhongMaterial({
    color: 0x0b5f8a, specular: 0x99ddff, shininess: 90,
    transparent: true, opacity: 0.88,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 800), waterMat);
  water.rotation.x = -Math.PI / 2;
  const WATER_BASE_Z = WATER_Z + 400;
  water.position.set(0, 0.05, WATER_BASE_Z);
  group.add(water);

  // --- lights -----------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a3f4a, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe3b3, 1.6);
  sun.position.set(120, 180, 130);
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0x404860, 0.35);
  scene.add(ambient);

  // --- environment: day/night cycle + weather ---------------------------------
  const env = { timeOfDay: 0.70, weather: 'clear', isNight: false };
  scene.background = new THREE.Color(0x84b4e4);
  scene.fog = new THREE.FogExp2(0x84b4e4, 0.0016);
  let fogDensity = 0.0016;

  // Keyframed sky palettes across the day (t = fraction of the 24h cycle).
  const SKY_STOPS = [
    { t: 0.00, sky: new THREE.Color(0x05081a), sun: new THREE.Color(0x8fb4ff), sunI: 0.12, hemiI: 0.22 },
    { t: 0.20, sky: new THREE.Color(0x0a1030), sun: new THREE.Color(0x8fb4ff), sunI: 0.12, hemiI: 0.22 },
    { t: 0.28, sky: new THREE.Color(0xd98a5e), sun: new THREE.Color(0xffb37a), sunI: 0.9, hemiI: 0.45 },
    { t: 0.38, sky: new THREE.Color(0x9fc9ec), sun: new THREE.Color(0xffe9c4), sunI: 1.7, hemiI: 0.75 },
    { t: 0.55, sky: new THREE.Color(0x7ec3ee), sun: new THREE.Color(0xfff2d8), sunI: 1.9, hemiI: 0.85 },
    { t: 0.70, sky: new THREE.Color(0x84b4e4), sun: new THREE.Color(0xffe6bd), sunI: 1.6, hemiI: 0.75 },
    { t: 0.78, sky: new THREE.Color(0xef8f57), sun: new THREE.Color(0xff9a5c), sunI: 0.85, hemiI: 0.45 },
    { t: 0.86, sky: new THREE.Color(0x2c2a55), sun: new THREE.Color(0x8fb4ff), sunI: 0.15, hemiI: 0.25 },
    { t: 0.93, sky: new THREE.Color(0x05081a), sun: new THREE.Color(0x8fb4ff), sunI: 0.12, hemiI: 0.22 },
    { t: 1.00, sky: new THREE.Color(0x05081a), sun: new THREE.Color(0x8fb4ff), sunI: 0.12, hemiI: 0.22 },
  ];
  const _pal = {
    sky: new THREE.Color(), sun: new THREE.Color(), sunI: 0, hemiI: 0,
  };
  function samplePalette(t) {
    let a = SKY_STOPS[0], b = SKY_STOPS[SKY_STOPS.length - 1];
    for (let i = 0; i < SKY_STOPS.length - 1; i++) {
      if (t >= SKY_STOPS[i].t && t <= SKY_STOPS[i + 1].t) {
        a = SKY_STOPS[i]; b = SKY_STOPS[i + 1]; break;
      }
    }
    const span = Math.max(0.0001, b.t - a.t);
    const f = clamp((t - a.t) / span, 0, 1);
    _pal.sky.copy(a.sky).lerp(b.sky, f);
    _pal.sun.copy(a.sun).lerp(b.sun, f);
    _pal.sunI = lerp(a.sunI, b.sunI, f);
    _pal.hemiI = lerp(a.hemiI, b.hemiI, f);
    return _pal;
  }

  const WEATHERS = ['clear', 'cloudy', 'rain', 'fog'];
  const WEATHER_SUN_DIM = { clear: 1.0, cloudy: 0.55, rain: 0.75, fog: 0.85 };
  const WEATHER_FOG = { clear: 0.0016, cloudy: 0.003, rain: 0.0045, fog: 0.011 };
  let weatherIdx = 0;
  let weatherTimer = 46;

  // Rain: a Points cloud in a 140 x 60 x 140 box that follows a focus point.
  const RAIN_N = 900;
  const rainPos = new Float32Array(RAIN_N * 3);
  const rainSpeed = new Float32Array(RAIN_N);
  for (let i = 0; i < RAIN_N; i++) {
    rainPos[i * 3] = (rng() - 0.5) * 140;
    rainPos[i * 3 + 1] = rng() * 60;
    rainPos[i * 3 + 2] = (rng() - 0.5) * 140;
    rainSpeed[i] = 26 + rng() * 14;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    color: 0xa8c4e0, size: 0.55, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  rain.visible = false;
  rain.frustumCulled = false;
  group.add(rain);

  // --- per-frame update ---------------------------------------------------------
  let elapsed = 0;
  function update(dt, focus) {
    if (!(dt > 0)) dt = 0;
    elapsed += dt;

    // Day/night: full cycle in 240 seconds, starting late afternoon.
    env.timeOfDay = (env.timeOfDay + dt / 240) % 1;
    const ang = (env.timeOfDay - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    if (elev >= 0) {
      sun.position.set(Math.cos(ang) * 260, elev * 220 + 20, 130);
    } else {
      // moon takes over from the opposite side of the sky
      sun.position.set(-Math.cos(ang) * 200, -elev * 180 + 30, -120);
    }
    const pal = samplePalette(env.timeOfDay);
    const dim = WEATHER_SUN_DIM[env.weather];
    sun.intensity = pal.sunI * dim;
    sun.color.copy(pal.sun);
    hemi.intensity = pal.hemiI * (env.weather === 'cloudy' ? 0.8 : 1);
    scene.background.copy(pal.sky);
    scene.fog.color.copy(pal.sky);

    const dayFactor = THREE.MathUtils.smoothstep(elev, -0.08, 0.3);
    const nightFactor = 1 - dayFactor;
    env.isNight = elev < 0.02;
    for (const m of facadeMats) m.emissiveIntensity = 0.12 + nightFactor * 1.5;
    lampBulbMat.color.copy(lampDayColor).lerp(lampNightColor, nightFactor);
    for (const s of neonSigns) {
      const pulse = 0.85 + 0.2 * Math.sin(elapsed * 3 + s.phase);
      s.mat.color.copy(s.base).multiplyScalar(Math.max(0.3, pulse));
    }

    // Weather state machine: advance every ~40-60 s.
    weatherTimer -= dt;
    if (weatherTimer <= 0) {
      weatherIdx = (weatherIdx + 1) % WEATHERS.length;
      env.weather = WEATHERS[weatherIdx];
      weatherTimer = 40 + rng() * 20;
    }
    const fogTarget = WEATHER_FOG[env.weather];
    fogDensity += (fogTarget - fogDensity) * Math.min(1, dt * 0.8);
    scene.fog.density = fogDensity;

    // Rain fall + recycle.
    rain.visible = env.weather === 'rain';
    if (rain.visible) {
      if (focus) rain.position.set(focus.x || 0, 0, focus.z || 0);
      const arr = rainGeo.attributes.position.array;
      for (let i = 0; i < RAIN_N; i++) {
        arr[i * 3 + 1] -= rainSpeed[i] * dt;
        arr[i * 3] += dt * 2.2; // slight wind slant
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = 60;
          arr[i * 3] = (rng() - 0.5) * 140;
          arr[i * 3 + 2] = (rng() - 0.5) * 140;
        }
        if (arr[i * 3] > 70) arr[i * 3] -= 140;
      }
      rainGeo.attributes.position.needsUpdate = true;
    }

    // Water shimmer: gentle opacity breathing + slow drift.
    waterMat.opacity = 0.84 + Math.sin(elapsed * 1.4) * 0.05;
    water.position.z = WATER_BASE_Z + Math.sin(elapsed * 0.4) * 1.2;
    water.position.y = 0.05 + Math.sin(elapsed * 0.9) * 0.02;
  }

  return { group, colliders, isRoad, isWater, spawnPoint, update, env };
}
