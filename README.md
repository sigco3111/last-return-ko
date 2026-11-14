# No Return

A first-person horror game where a handheld LiDAR scanner is the only way to see.

![Pump Hall B, as the scanner sees it](docs/screenshots/pump-hall.jpg)

Kessel-9 is a pumping annex 212 metres below grade, sealed in 1987. There is no lighting. You are sent down to recover three survey spools left by the crew before you, and the only thing you ever see is the cloud of points your scanner has painted onto the dark.

Something else is down there. It is never drawn. The only trace of it is the returns a scan leaves on its body, frozen where it stood at that instant. Stop scanning and there is nothing to see, however close it is.

## Play

Open `index.html` in a current desktop or mobile browser. It is one self-contained file: no install, no server, no downloads apart from three web fonts.

To host it, turn on GitHub Pages for this repository (Settings → Pages → deploy from the `main` branch, root folder) and the game is served from the repository's Pages address.

Use headphones. Sound is how you find out where it is.

## Screenshots

| | |
|---|---|
| ![Main corridor](docs/screenshots/corridor.jpg) Main corridor A. Wall lettering is retro-reflective and only appears when scanned. | ![Calibration store](docs/screenshots/calibration-store.jpg) Calibration store C4. The inventory says nine dummies. |
| ![Shaft 9](docs/screenshots/shaft.jpg) Shaft 9. Pulses aimed past forty metres do not come back. | ![The Hollow in the beam](docs/screenshots/hollow.jpg) The Hollow, caught in the beam. These points are where it was, not where it is. |
| ![Plan view map](docs/screenshots/map.jpg) The map is your own scan seen from above. Unscanned rooms are not on it. | ![Title screen](docs/screenshots/title.jpg) The title screen scans the lift lobby by itself. |

On a phone the game is played sideways, with the controls on screen. Held upright, it waits and asks you to turn the phone.

![The game on a phone held sideways, with touch controls](docs/screenshots/phone.jpg)

## Controls

| Action | Keyboard and mouse | Touch |
|---|---|---|
| Move | `W` `A` `S` `D` | Left thumb |
| Look | Mouse, or arrow keys | Right thumb |
| Scan (paint) | Hold left mouse or `Space` | Hold SCAN and drag |
| Full sweep (loud) | Right mouse or `F` | SWEEP |
| Beam width | Mouse wheel, or `1` `2` `3` | BEAM |
| Sprint (loud) | `Shift` | RUN |
| Crouch (quiet) | Hold `C` | CROUCH |
| Use | `E` | USE |
| Map | `Tab` or `M` | MAP |
| Point colours | `V` | Pause menu |
| Pause | `Esc` | PAUSE |

If the browser will not capture the mouse, hold the mouse button and drag to look.

## How the scanner works

- **Paint** fires a cone of pulses for as long as you hold it. Each pulse that hits something leaves one point. Narrow the beam for detail, widen it to cover ground.
- **Full sweep** rakes the whole view from top to bottom in about two and a half seconds. It is loud, and it costs a lot of emitter heat.
- **Heat** builds while you scan. An overheated emitter shuts off until it cools.
- **Colour** shows distance from where you are standing now: pale close up, deep blue far away. Doors are green when they will open and red when they will not. Amber marks things you can use.
- Points stay where they were measured. A door that has since opened, or a thing that has since walked away, leaves its old points behind until they fade.

<details>
<summary><strong>What hunts you (spoilers)</strong></summary>

**The Hollow** appears once the generator is running.

- It is blind. It hears sprinting, full sweeps, doors and splashing, and at close range it hears you walk. Crouching and standing still is nearly silent.
- The beam slows it to a crawl. The beam also tells it exactly where you are.
- After about four seconds in the beam it stops being slow, and it is faster than you can sprint.
- It will not enter the calibration store.

**The Stills** are the calibration dummies in store C4.

- They only move while nothing is scanning them.
- A scan shows where each one stood at that moment. Their old outlines linger for a while, so a room can look more crowded, or less, than it is.

**The lift** takes forty seconds to arrive once the spools are uploaded, and the Hollow can hear it from anywhere in the station.

Three threat levels are offered on the title screen. "Survey only" removes everything that hunts you.

</details>

## Under the hood

The game is plain JavaScript and WebGL 2 with no libraries and no asset files.

| File | What it does |
|---|---|
| `src/js/00-config.js` | Tuning values, difficulty presets and all story text |
| `src/js/01-math.js` | Small math helpers and 4×4 matrices |
| `src/js/02-world.js` | Tile grid, props, signs, doors, collision, navigation, occluder mesh |
| `src/js/03-layout.js` | The station itself: every room, prop, sign and pickup |
| `src/js/04-figures.js` | The capsule bodies used for everything that stands upright |
| `src/js/05-raycast.js` | What one laser pulse hits, and how far away |
| `src/js/06-renderer.js` | Point cloud, depth-only world, scanner model, post-processing |
| `src/js/07-audio.js` | Every sound, synthesised with the Web Audio API |
| `src/js/08-entities.js` | Doors, the Hollow, the Stills and the apparitions |
| `src/js/09-player.js` | Keyboard, mouse and touch input, movement, the scanner |
| `src/js/10-interface.js` | HUD, map, messages and overlay screens |
| `src/js/11-game.js` | Objectives, checkpoints, death, ending and the main loop |

A few details worth knowing if you change things:

- The station is a 76 × 64 grid of one-metre tiles carved into rooms, plus boxes, cylinders and spheres for everything standing in them. The same data drives the ray caster, collision, path finding and the black geometry that hides points behind walls.
- Walls, floors and props are drawn into the depth buffer only, never in colour. Creatures are not drawn at all.
- Points live in a ring buffer on the graphics card (250,000 to 1,200,000 depending on the quality setting). The oldest points are overwritten first.
- Points left on a creature carry a lifetime and fade; points on the station are permanent.

## Building and testing

The game needs nothing to run. The tooling needs [Node.js](https://nodejs.org) 18 or newer.

```bash
npm run build
```

rebuilds `index.html` from `src/`.

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
npm test
```

plays the whole objective chain in a headless browser and checks each step: leaving the lift, the generator, the Hollow's path finding, the beam holding it, both ways to die, checkpoints, powered and keycard doors, the Stills, the lift call, the ending, and the turn-your-phone-sideways screen.

```bash
npm run screenshots
```

regenerates the pictures in `docs/screenshots/`. It renders in software and takes around ten minutes. Name one or more pictures to retake only those, for example `node tools/take-screenshots.js hollow phone`.

## Status

The rules are covered by the scripted test above. The test teleports between objectives, so it shows that the game can be finished, not that the chases are fair or the pacing is right. Balance values in `src/js/00-config.js` were chosen by reasoning and have had little real play. Expect to tune them.
