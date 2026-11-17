// combat.js — pistol hitscan, muzzle flash, damage + wanted consequences.
import * as THREE from 'three';
import { hurtPed, scarePeds } from './pedestrians.js';

export function createCombat(G) {
  const C = {
    cooldown: 0,
    flash: null,
    flashTimer: 0,
    gun: null,
  };

  // Simple viewmodel pistol attached to the camera.
  const gun = new THREE.Group();
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x22222e, roughness: 0.4, metalness: 0.6 });
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.34), gunMat);
  barrel.position.set(0, 0, -0.1);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), gunMat);
  grip.position.set(0, -0.09, 0.04);
  grip.rotation.x = 0.25;
  gun.add(barrel); gun.add(grip);
  gun.position.set(0.32, -0.28, -0.75);
  gun.scale.setScalar(0.55);
  G.camera.add(gun);
  C.gun = gun;

  // Muzzle flash: a small additive sprite at the barrel tip.
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffe9a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), flashMat);
  flash.position.set(0.32, -0.24, -1.0);
  G.camera.add(flash);
  C.flash = flash;
  C.flashLight = new THREE.PointLight(0xffc46b, 0, 9);
  C.flashLight.position.set(0.32, -0.24, -1.0);
  G.camera.add(C.flashLight);

  const raycaster = new THREE.Raycaster();
  raycaster.far = 80;

  C.tryShoot = () => {
    if (G.state !== 'playing' || C.cooldown > 0) return;
    if (!G.player.onFoot) return; // no drive-by shooting in v1
    C.cooldown = 0.28;
    G.audio.gunshot();
    C.flash.material.opacity = 0.95;
    C.flashLight.intensity = 6;
    C.flashTimer = 0.06;
    // Tiny camera kick.
    G.camPitch += 0.012;

    raycaster.setFromCamera({ x: 0, y: 0 }, G.camera);
    const px = G.player.pos.x, pz = G.player.pos.z;
    scarePeds(G, px, pz, 30);

    // Hit test against peds first.
    let hitSomething = false;
    for (const ped of G.peds) {
      if (ped.dead) continue;
      const toPed = new THREE.Vector3(
        ped.mesh.position.x - G.camera.position.x,
        1.2 - G.camera.position.y,
        ped.mesh.position.z - G.camera.position.z
      );
      const dist = toPed.length();
      if (dist > 80) continue;
      const dir = raycaster.ray.direction;
      const dot = toPed.normalize().dot(dir);
      const perp = Math.sqrt(Math.max(0, 1 - dot * dot)) * dist;
      if (dot > 0 && perp < 1.1) {
        const down = hurtPed(G, ped, 100, px, pz);
        G.wantedSystem.add(1, down ? 'Pedestrian down' : 'Pedestrian shot');
        hitSomething = true;
        break;
      }
    }
    if (hitSomething) return;
    // Then police cars.
    for (const car of G.cars) {
      if (!car.police) continue;
      const toCar = new THREE.Vector3(
        car.mesh.position.x - G.camera.position.x,
        0.8 - G.camera.position.y,
        car.mesh.position.z - G.camera.position.z
      );
      const dist = toCar.length();
      if (dist > 80) continue;
      const dir = raycaster.ray.direction;
      const dot = toCar.normalize().dot(dir);
      const perp = Math.sqrt(Math.max(0, 1 - dot * dot)) * dist;
      if (dot > 0 && perp < 2.0) {
        G.wantedSystem.add(1, 'Shot at police');
        G.ui.toast('You shot at the police!');
        return;
      }
    }
    // Firing a weapon in public still draws attention.
    if (G.wantedSystem.level === 0) G.wantedSystem.add(1, 'Shots fired');
  };

  C.update = (dt) => {
    if (C.cooldown > 0) C.cooldown -= dt;
    if (C.flashTimer > 0) {
      C.flashTimer -= dt;
      if (C.flashTimer <= 0) {
        C.flash.material.opacity = 0;
        C.flashLight.intensity = 0;
      }
    }
    C.gun.visible = G.player.onFoot && G.state === 'playing';
    C.flash.visible = C.gun.visible;
  };

  G.combat = C;
  return C;
}
