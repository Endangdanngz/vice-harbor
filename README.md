# Vice Harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Endangdanngz/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Endangdanngz/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

VICE HARBOR — an open-world crime game that runs entirely in the browser. Explore a neon harbor district on foot or behind the wheel: steal cars, weave through live traffic and crowds of pedestrians, run a three-mission story chain, and watch your wanted level climb as VHPD cruisers and foot patrols close in. A full HUD with cash, health, wanted stars and a live minimap keeps you oriented, cash pickups and mission payouts feed your wallet, and your progress saves automatically between visits. Built with Three.js (vendored, no build step, no network), synthesized engine/siren/city audio, and a deterministic demo mode (`?demo=1`–`4`) for screenshots.

## How to play

1. Click **START ENGINE** on the title screen, then work the mission chain or just free-roam the harbor.
2. **W A S D** — walk / drive · **Mouse** — look around (pointer lock).
3. **E** — steal or enter a car, and exit it again. Any parked or stopped car can be taken; pulling a driver out works too.
4. **Click** or **F** — fire your pistol while on foot.
5. **Shift** — sprint on foot · **Space** — brake / handbrake in a car.
6. **P** — pause / resume.
7. Crimes raise your wanted stars: at three stars and up the police ram and pursue in force. Lose them by breaking line of sight, or pay the hospital bill when you get busted or wasted — cash, mission progress and your save carry on.

## Run it

```sh
# Serve game/ locally and open the printed URL (http://localhost:8080):
node serve.ts
```

No install and no build: `game/index.html` loads its ES modules and the vendored Three.js straight from disk over the local server.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
