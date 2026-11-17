// city.js — neon coastal district: road grid, lit buildings, beach, palms, lamps.
import * as THREE from 'three';

// Deterministic RNG (mulberry32) so demo scenes are reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROAD_COORDS = [-180, -120, -60, 0, 60, 120, 180];
const ROAD_W = 12;
const CITY_MIN = -210, CITY_MAX = 210;
const BEACH_Z = 186;   // sand starts here
const WATER_Z = 214;   // water starts here

function makeFacadeTextures(rng) {
  // Returns { map, emissiveMap } — dark facade + glowing windows.
  const w = 128, h = 256;
  const mapC = document.createElement('canvas'); mapC.width = w; mapC.height = h;
  const emC = document.createElement('canvas'); emC.width = w; emC.height = h;
  const m = mapC.getContext('2d'), e = emC.getContext('2d');
  const base = ['#232031', '#2b2333', '#1f2a33', '#33232b'][Math.floor(rng() * 4)];
  m.fillStyle = base; m.fillRect(0, 0, w, h);
  e.fillStyle = '#000'; e.fillRect(0, 0, w, h);
  const cols = 6, rows = 12;
  const cw = w / cols, ch = h / rows;
  const warm = ['#ffd27a', '#ffe9a8', '#9be8ff', '#ff9de2', '#fff6cf'];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = rng() < 0.62;
      const x = c * cw + 3, y = r * ch + 4;
      if (lit) {
        const col = warm[Math.floor(rng() * warm.length)];
        m.fillStyle = col; m.fillRect(x, y, cw - 6, ch - 8);
        e.fillStyle = col; e.fillRect(x, y, cw - 6, ch - 8);
      } else {
        m.fillStyle = '#0d0d16'; m.fillRect(x, y, cw - 6, ch - 8);
      }
    }
  }
  const map = new THREE.CanvasTexture(mapC);
  const emissiveMap = new THREE.CanvasTexture(emC);
  map.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap };
}

function makeRoadTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1b1b26'; g.fillRect(0, 0, 64, 256);
  g.fillStyle = '#262633';
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 64, Math.random() * 256, 2, 2);
  g.fillStyle = '#d8c25a';
  g.fillRect(30, 20, 4, 60); g.fillRect(30, 150, 4, 60);
  g.fillStyle = '#cfd6e4';
  g.fillRect(3, 0, 2, 256); g.fillRect(59, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(G) {
  const { scene, rng } = G;
  const city = {
    roadCoords: ROAD_COORDS.slice(),
    buildingBoxes: [],   // { minX, maxX, minZ, maxZ } for collision
    bounds: { min: CITY_MIN, max: CITY_MAX },
    beachZ: BEACH_Z, waterZ: WATER_Z,
    hospital: new THREE.Vector3(-150, 0, -150),
  };
  G.city = city;

  scene.background = new THREE.Color(0x191233);
  scene.fog = new THREE.Fog(0x191233, 70, 460);

  scene.add(new THREE.HemisphereLight(0x8a7bff, 0x191426, 0.6));
  const dusk = new THREE.DirectionalLight(0xffb36b, 0.85);
  dusk.position.set(90, 140, 60);
  scene.add(dusk);
  const rim = new THREE.DirectionalLight(0x35f0ff, 0.25);
  rim.position.set(-80, 60, -90);
  scene.add(rim);

  // Ground base.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 1100),
    new THREE.MeshLambertMaterial({ color: 0x14121f })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  scene.add(ground);

  // Roads with lane markings (shared texture, repeated per strip).
  const roadTex = makeRoadTexture();
  const roadLen = CITY_MAX - CITY_MIN;
  for (const c of ROAD_COORDS) {
    for (const horizontal of [false, true]) {
      const tex = roadTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, roadLen / 16);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, roadLen), mat);
      strip.rotation.x = -Math.PI / 2;
      if (horizontal) strip.rotation.z = Math.PI / 2;
      strip.position.set(horizontal ? 0 : c, 0, horizontal ? c : 0);
      scene.add(strip);
    }
  }

  // Beach sand + water.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(560, WATER_Z - BEACH_Z),
    new THREE.MeshLambertMaterial({ color: 0xb89a68 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, (BEACH_Z + WATER_Z) / 2);
  scene.add(sand);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 260),
    new THREE.MeshLambertMaterial({ color: 0x0a4a6b, transparent: true, opacity: 0.92 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.05, WATER_Z + 130);
  scene.add(water);
  G.waterMesh = water;

  // Sidewalks + buildings per block.
  const facadeSets = [makeFacadeTextures(rng), makeFacadeTextures(rng), makeFacadeTextures(rng)];
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x3d3d4e });
  const neonColors = [0xff2ea6, 0x35f0ff, 0xffd23e, 0x7dff9b, 0xff7a5c];
  const blockCenters = [];
  for (let i = 0; i < ROAD_COORDS.length - 1; i++) {
    blockCenters.push((ROAD_COORDS[i] + ROAD_COORDS[i + 1]) / 2);
  }
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      if (bz > 150) continue; // beach blocks stay open
      const walk = new THREE.Mesh(new THREE.BoxGeometry(46, 0.3, 46), sidewalkMat);
      walk.position.set(bx, 0.1, bz);
      scene.add(walk);
      const nB = 1 + Math.floor(rng() * 2); // 1-2 buildings per block
      for (let b = 0; b < nB; b++) {
        const w = 12 + rng() * 10, d = 12 + rng() * 10;
        const h = 9 + rng() * rng() * 26;
        const ox = (b === 0 ? -9 : 9) + (rng() - 0.5) * 4;
        const oz = (rng() - 0.5) * 14;
        const x = bx + ox, z = bz + oz;
        const set = facadeSets[Math.floor(rng() * facadeSets.length)];
        const mat = new THREE.MeshStandardMaterial({
          map: set.map, emissiveMap: set.emissiveMap,
          emissive: 0xffffff, emissiveIntensity: 0.75, roughness: 0.9,
        });
        const bld = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        bld.position.set(x, h / 2 + 0.25, z);
        scene.add(bld);
        city.buildingBoxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        // Rooftop neon sign on tall towers.
        if (h > 22 && rng() < 0.6) {
          const sign = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.5, 1.2, 0.4),
            new THREE.MeshBasicMaterial({ color: neonColors[Math.floor(rng() * neonColors.length)] })
          );
          sign.position.set(x, h + 1, z + d / 2 + 0.3);
          scene.add(sign);
        }
      }
    }
  }

  // Hospital (respawn point): pale building with a red cross sign.
  const hosp = new THREE.Mesh(
    new THREE.BoxGeometry(26, 14, 20),
    new THREE.MeshStandardMaterial({ color: 0xd8d8e0, roughness: 0.8 })
  );
  hosp.position.set(city.hospital.x, 7.25, city.hospital.z);
  scene.add(hosp);
  city.buildingBoxes.push({
    minX: city.hospital.x - 13, maxX: city.hospital.x + 13,
    minZ: city.hospital.z - 10, maxZ: city.hospital.z + 10,
  });
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xff3b5c });
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(1.4, 5, 0.5), crossMat);
  crossV.position.set(city.hospital.x, 16.5, city.hospital.z + 10.2);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(5, 1.4, 0.5), crossMat);
  crossH.position.set(city.hospital.x, 16.5, city.hospital.z + 10.2);
  scene.add(crossV); scene.add(crossH);

  // Palm trees: beach row + scattered on sidewalks.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2fae5f });
  const palmSpots = [];
  for (let x = -200; x <= 200; x += 26) palmSpots.push([x + (rng() - 0.5) * 8, BEACH_Z + 6 + rng() * 14]);
  for (let i = 0; i < 26; i++) {
    const bx = blockCenters[Math.floor(rng() * blockCenters.length)];
    const bz = blockCenters[Math.floor(rng() * blockCenters.length)];
    // Block corners sit on the sidewalk, clear of the buildings' footprint.
    const sx = rng() < 0.5 ? -1 : 1, sz = rng() < 0.5 ? -1 : 1;
    palmSpots.push([bx + sx * 21, bz + sz * 21]);
  }
  for (const [x, z] of palmSpots) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 6.5, 6), trunkMat);
    trunk.position.y = 3.25; trunk.rotation.z = (rng() - 0.5) * 0.16;
    palm.add(trunk);
    for (let l = 0; l < 6; l++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 4), leafMat);
      const a = (l / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.3, 6.6, Math.sin(a) * 1.3);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      palm.add(leaf);
    }
    palm.position.set(x, 0, z);
    scene.add(palm);
  }

  // Streetlights along every road, alternating sides.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2c38 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const c of ROAD_COORDS) {
    for (let t = -180; t <= 180; t += 45) {
      for (const [x, z] of [[c + 7.5, t], [t, c + 7.5]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.4, 6), poleMat);
        pole.position.set(x, 2.7, z);
        scene.add(pole);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lampMat);
        lamp.position.set(x, 5.5, z);
        scene.add(lamp);
      }
    }
  }

  // Distant skyline silhouettes for depth.
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x0e0a24 });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const r = 320 + rng() * 60;
    const h = 30 + rng() * 70;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(18 + rng() * 14, h, 18 + rng() * 14), skyMat);
    tower.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    scene.add(tower);
  }
}

// Circle (x,z,r) vs building AABBs: push the circle out. Returns corrected position.
export function collideBuildings(G, x, z, r) {
  for (const b of G.city.buildingBoxes) {
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        // Center inside the box: push out along the smallest penetration axis.
        const pl = x - b.minX, pr = b.maxX - x, pt = z - b.minZ, pb = b.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = b.minX - r;
        else if (m === pr) x = b.maxX + r;
        else if (m === pt) z = b.minZ - r;
        else z = b.maxZ + r;
      }
    }
  }
  return { x, z };
}

export function clampToCity(G, x, z, margin) {
  const { min, max } = G.city.bounds;
  return {
    x: Math.max(min + margin, Math.min(max - margin, x)),
    z: Math.max(min + margin, Math.min(400 - margin, z)),
  };
}
