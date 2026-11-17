# Vice Harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Endangdanngz/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Endangdanngz/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Vice Harbor is a neon open-world crime game that runs entirely in the browser — a Three.js city of vice, water and getaway cars, with no build step and nothing to install.

## About

Vice Harbor drops you into a procedural neon harbor city built at runtime: glowing downtown blocks, a working waterfront, bridges and beach roads, all generated from code with zero downloaded assets. You roam it on foot or behind the wheel, weaving through live traffic and crowds of pedestrians while the police wanted system tracks your heat — commit crimes and the stars climb, patrol cars give chase, and escaping means breaking line of sight until things cool down. A five-mission story campaign threads through the city, from a first pickup on the pier to a final harbor getaway, paying out cash you keep between sessions. The world stays alive around you: a full day/night cycle moves the sun and relights the neon, and rolling weather fronts bring clear skies, overcast and rain. Every sound — engine, sirens, gunfire, rain, the mission sting — is synthesized live with WebAudio; there is not a single audio file in the game.

## How to play

Open `game/index.html` through the make.fun player, or serve the `game/` folder with any static file server (for example `npx serve game`) and open it in a desktop browser. The game runs fully offline once loaded.

- **WASD / arrow keys** — move on foot, drive when in a car
- **Mouse** — look (click the game to lock the pointer)
- **Shift** — sprint on foot; sprinting drains stamina, which refills as you rest
- **E** — enter or exit the nearest car
- **Mouse click** — shoot
- **Space** — handbrake while driving
- **P or Esc** — pause

Menus: the **Start** menu launches the story or free roam, the **Pause** menu resumes, restarts or opens settings, and **Settings** covers master volume, mouse sensitivity, render quality and invert-Y. Your progress and cash auto-save in the browser, so a closed tab never costs you a finished mission.

## Features

- **5 story missions** — a connected campaign across the harbor, with briefings, objectives, checkpoints and cash payouts
- **Police wanted system** — a five-star heat level with patrol spawns, pursuit driving and line-of-sight escapes
- **Day/night cycle** — a full rotating sun, dusk and dawn lighting, and neon that takes over after dark
- **Dynamic weather** — clear, overcast and rain fronts that roll in and change how the city looks and sounds
- **On foot and driving** — sprint with a stamina bar, hijack and drive traffic cars, handbrake turns included
- **Armor and health** — body armor absorbs damage before your health does; pickups restore both
- **Living city** — procedural harbor city with traffic AI, wandering pedestrians, a working minimap and mission beacons
- **Synthesized audio** — engines, sirens, shots, weather and UI sounds generated with WebAudio, no audio files
- **Persistent progress** — mission progress and cash auto-save in the browser

## Tech

Plain ES modules plus a vendored copy of Three.js — no framework, no bundler, no build step. All sound is synthesized with WebAudio, all art is procedural geometry and shader-lit materials, and there are zero external assets: the whole game runs fully offline from static files. The entry program (`main.ts`, run with plain `node main.ts`) validates the game and screenshots, packages them, and builds the make.fun dossier with the vendored library in `vendor/`.

## License

MIT

SPDX-License-Identifier: MIT
