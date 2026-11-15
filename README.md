# Last Return

A first-person horror game where a handheld LiDAR scanner is the only way to see.

![Pump Hall B, as the scanner sees it](docs/screenshots/pump-hall.jpg)

Kessel-9 is a pumping annex 212 metres below grade, sealed in 1987. There is no lighting. You are sent down to recover three survey spools left by the crew before you, and the only thing you ever see is the cloud of points your scanner has painted onto the dark.

Something else is down there. It is never drawn. The only trace of it is the returns a scan leaves on its body, frozen where it stood at that instant. Stop scanning and there is nothing to see, however close it is.

## Play

The repository holds the source. The playable page, `index.html`, is built from it and is one self-contained file: no server needed, and no downloads apart from three web fonts.

With [Node.js](https://nodejs.org) 18 or newer:

```bash
npm run build
```

then open `index.html` in a current desktop or mobile browser.

With Docker, which builds the page and serves it:

```bash
docker build -t last-return .
```

```bash
docker run --rm -p 8080:80 last-return
```

then open http://localhost:8080.

Use headphones. Sound is how you find out where it is.

## Stations

The title screen offers two places to go down into.

**Kessel-9** is the annex as it was built by hand. It is the same every time, and it is the best first descent.

**Uncharted annex** is built fresh for every descent, so knowing the last one does not help you. The lift lobby, the pump hall, the generator, the archive, the calibration store and the shaft are always there, but where they are, what lies between them and which doors need power or a keycard, and what else you are asked to do down there, change each time. Fourteen further kinds of room (boiler house, workshop, crew quarters, infirmary, drying room, battery room, sump, old workings and more) fill it out.

![One generated station, drawn in full with debug mode](docs/screenshots/uncharted-map.jpg)

- **Size** is small, medium, large or massive: roughly 25, 33, 45 or 60 rooms and corridors. Kessel-9 has 19. Size also sets the number of keycards (one, one, two, three) and how many extra jobs dispatch gives you (see below).
- **Layout** is tight (rooms open straight into rooms), mixed, or sprawling (long corridors).
- **Levels** is one or two. With two, everything behind the last keycard, Shaft 9 included, is further down, at the foot of a flight of stairs; how long and how steep the flight is depends on the seed. Medium and large stations usually get a second, back stair, so the lower level is not a dead end.
- **Seed** decides the station, its locks and its jobs. Leave it empty for a different one every descent. Type a number or a word to get the same station again, or to give a friend the one you played. The seed of the station you are in is shown on the pause and ending screens.

What stays true in every station, so the radio and the notes never lie:

- Generator 2 is always in a room off Pump Hall B, and can be reached without power.
- The first keycard is always behind a powered door, and Shaft 9 is always behind the last keycard's door. In a two-level station that door is at the head of the stairs.
- With more than one keycard the station is a set of rings: keycard 1 opens the first ring of doors and is how you reach keycard 2, and so on inwards. A higher card opens the lower doors too, and a locked door tells you which card it wants. Dispatch tells you when the card you picked up is not the last one, and the map shows how many you hold.
- Doors carry the name of the room behind them above the frame, and long corridors have arrows to the lift and to the pump hall or the shaft.
- The first spool and the first keycard are sometimes left in a different room. The note in the security office says where that card is kept.
- Service ducts, one person wide, link parts of the station that are far apart on foot. They are a way out, and a way to be cut off.
- Vents do the same at crawl height: a low opening in a wall with the grille lying on the floor in front of it. You only fit crouched (hold `C` and walk in), you are slow in there, and sheet metal is loud. The Hollow uses them too, on its knees and hands, and you can hear it doing so from a long way off. A vent never leads past a lock: both ends are always behind the same doors.

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
| Crouch (quiet), crawl into vents | Hold `C` | CROUCH |
| Use | `E` | USE |
| Map | `Tab` or `M` | MAP |
| Point colours | `V` | Pause menu |
| Pause | `Esc` | PAUSE |

If the browser will not capture the mouse, hold the mouse button and drag to look.

The screen is quiet by default: there is the dark, the points and the aiming ring. The objective shows for a few seconds when it changes, the heat and stamina meters only while they are in use, and everything else is on the map screen (`Tab` or `M`). "Full instruments" in the settings puts the range readouts, the minimap and all the meters back, as in the pictures here.

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
- The beam slows it to a crawl, and angers it. A quick touch only makes it stop and turn toward the light.
- Keep the beam on it for more than about a second and it knows exactly where you are.
- After about four seconds its anger is full: the beam stops slowing it, and it is faster than you can sprint.
- Anger fades slowly, over half a minute. Light it up again too soon and you have less time than before.
- Once you have touched it with the beam, an AGITATION bar on the scanner shows its anger.
- Wandering near you, it sometimes stops dead and listens. It makes no footsteps then, and it hears better.
- When it loses you it searches ahead in the direction you were heading, and it sometimes pretends to leave.
- Something paces it. Left alone, its wandering closes in on you room by room over a minute or so. Once it has pressed you hard, by chasing you or by prowling close for a long time, it goes off to the far side of the station and stays there for at least 25 seconds.
- That pacing is fair by rule. It is never told where you are, only which room to walk to, and never a room closer than four metres' walk. Finding you still takes its ears or your beam. It is never called off in the middle of a chase, and when it has earned you a breather it does not pretend to leave and come back.
- Noise you make during a breather still brings it.
- The further you get, the harder it presses: each spool you carry makes it close in sooner and cuts the breathers shorter, though never below twelve seconds.
- It crawls through vents. It is slower in them, and the metal booms under it, which is the warning you get.
- It is taller than most of the station's ceilings. It bends to fit under whatever is over it, ducks through doorways, and draws itself up to the ceiling when it stops to listen.
- It will not enter the calibration store.
- It has no keycard. A door that opens by itself opens for it, and so does a powered door once the mains is on. A keycard door never opens for it, and neither does the lift door. It gets through one of those only while it stands open for you, so a keycard door closing behind you is a real way to break a chase.
- It has its own way round: the **crawlspace** above the ceilings. Every part of the station that keycard doors close off has at least one ceiling hatch, which shows in a scan as a square frame with its cover hanging down, in the warning colour. The Hollow reaches up into one, crawls, and drops out of another.
- That way round is slow and loud. You hear it thumping overhead, from where it is, all the way. The hatch it is about to come out of rattles for two and a half seconds before it drops, and for its first second on the floor it cannot catch you. Up there a scan finds nothing, and it cannot reach down.
- Before it goes round, it goes at the door. Hunting you, with a keycard door shut in its face that you hold the card for, it walks up to it and **pounds** on it for a few seconds. A door takes two bouts of that. In the third it gives way for good: the slab lies in the doorway and the opening stays open for the rest of the descent. Angry, it hits harder and the door goes sooner. So a door will save you twice, and the caption tells you when it is at a door it has battered before, and when that door will not hold.
- It only goes at a door you could open yourself, so a door it breaks was never one that kept you out, and it cannot be baited into opening a lock for you. The lift door cannot be broken.
- It only goes up when walking is much further or impossible. In Kessel-9, getting round one shut keycard door to a player nine metres away on the other side takes it a little under forty seconds.

**The Stills** are the calibration dummies in store C4.

- They only move while nothing is scanning them.
- A scan shows where each one stood at that moment. Their old outlines linger for a while, so a room can look more crowded, or less, than it is.

**Apparitions** are figures that are only in the point cloud. They cannot touch you. A few stand at fixed places, there the first time you walk into their room. The rest come by chance, at a place chosen at that moment from where you are standing and which way you are looking, so no two descents have them in the same spots, and a seed does not fix them.

- **The watcher** stands some way off, facing you, at the end of a corridor or the far side of a room. Gone once you have had a proper look, or if you walk toward it.
- **Behind you.** A breath at your back. Turn and scan, and something is reaching for you from a few metres away. Gone almost as soon as the scan finds it.
- **The dummy.** One of the calibration mannequins, standing where none should be. Scan it and look away, and it is closer. Look away again and it is gone.
- **The crosser** walks across the far end of whatever you are scanning, from one side to the other, and does not come back.
- **The crawler** is on its knees and hands in the mouth of a vent, looking out into the room. Only in stations that have vents.
- **In your face.** About one scan in a hundred, at most once a descent and never in the first two minutes, you start a scan and it is bent down right in front of you. It is gone a moment later.

Three things keep them fair, and are worth knowing:

- They are silent. Everything real in the station makes its own noise; an apparition never borrows one. The breath is the only sound they have. They also scan in the colour of the walls, not in the Hollow's colour.
- They belong to the quiet stretches. None comes while the Hollow is hunting, searching or near, or while the Stills are close, and one that is out vanishes the moment that changes. When something real is happening, everything the scanner shows you is real.
- They are rare: about four in Kessel-9, up to ten in a massive station. One you never scanned does not count. A descent shows you as many different kinds as it can before it repeats one.

**The lift** takes forty seconds to arrive once the spools are uploaded, and the Hollow can hear it from anywhere in the station.

**Extra jobs** only come up in the Uncharted annex. The seed decides which of the three a station has: a small station has none or one, a medium one, a large one or two, a massive two or all three.

- **No fuel.** Generator 2 will not start: the day tank is empty. A fuel can stands somewhere you can reach without power. You find out at the generator, so the walk for the can is a walk back through rooms you thought you were done with.
- **Core samples.** Dispatch wants the grey sample tubes Crew 2 pulled, two to four of them, one to a room, anywhere short of the last keycard's doors. The lift terminal refuses the upload until you carry them all.
- **The winch breaker.** The upload goes through, but the lift does not come: its breaker has tripped. The panel is somewhere behind a powered door, dispatch marks it on your map, and it needs mains power to hold. Close it and the forty seconds start there, a long way from the lobby. If you find the panel earlier and close it then, the upload calls the lift as usual.

What you are carrying for these jobs is listed on the map with the spools and the keycards.

Three threat levels are offered on the title screen. "Survey only" removes everything that hunts you.

A fourth, **Custom**, lets you set each thing yourself. Choose it and a panel opens (the **Adjust** button opens it again). It starts as a copy of Standard, and "Start from" copies one of the other two.

| Setting | What it changes |
|---|---|
| The Hollow, The Stills | On or off. |
| Hollow speed | 70 to 140 %. Above about 130 % it hunts faster than you sprint, and the panel says so. |
| Hollow hearing | 50 to 160 %: from how far it hears a step, a sweep, a door. |
| How hard it presses | 50 to 200 %: how soon it closes in again after a breather, and how short the breather is. |
| Its temper in the beam | 50 to 200 %: how fast the beam angers it, so how long you can hold it before it knows where you are. |
| Scanner heat | 50 to 200 %: how fast the scanner heats up. |
| Your stamina | 50 to 200 %: how long a full bar lasts. |
| Apparitions | None, few, normal or many. "None" also removes the ones that stand at fixed places. |
| Checkpoints | Off is one life: being caught ends the descent. |

Each row says what its value comes to in play ("It hunts at 3.9 m/s. You sprint at 4.6."), worked out from the numbers in `src/js/00-config.js`, and rows that differ from Standard are lit. The title screen and the ending screen name the differences in one line. Best times are kept apart for every different set of values. A threat level, custom or not, never changes what a station looks like: a seed builds the same station on all of them.

</details>

## Reporting a problem

The pause screen says which build you are playing: the version, the build number (how many commits it was built from) and the commit, with a `+` after it if the source had changes that were not committed. The ending screen says it too.

**Report a problem** on the pause screen opens a bug report on GitHub with that line, the station, its seed and options, the threat level, the room you are standing in and your browser already filled in. Nothing is sent until you submit the form.

A Docker build has no git to ask, so the image only carries the build number and the commit if you pass them in:

```bash
docker build --build-arg LAST_RETURN_BUILD_NUMBER=$(git rev-list --count HEAD) --build-arg LAST_RETURN_BUILD_COMMIT=$(git rev-parse --short=7 HEAD) -t last-return .
```

Without them the game shows the version alone.

## Debug mode

![Debug mode in the calibration store](docs/screenshots/debug-mode.jpg)

Debug mode is a tool for building the game, so like [the workshop](#the-workshop) it is not part of `index.html`. It is in the dev build:

```
npm run dev
```

Open the address it prints (http://localhost:4471/) and start a descent. Press `` ` `` (the key left of `1`) or `F2` while playing, or choose "Debug mode" in the pause menu. A panel opens and the game keeps running. Press the key again to free the mouse for the panel; click the view to take control back.

**See**

- **Show creatures** draws the Hollow in red, the Stills in amber and the apparitions in violet. An extra switch shows them faintly through walls.
- **Light the station** draws every wall, floor and object with a line every metre, scanned or not.
- **Show senses and paths** draws a cyan ring for how close the Hollow must be to notice you right now, magenta rings for each noise as it happens, and in yellow the route the Hollow is walking.
- **Creatures on the map** puts their live positions on the minimap and the full map.

**Cheat**

- Cannot be caught, creatures ignore me, freeze creatures, scanner never heats, unlimited sprint.
- **Fly through walls**: `W` and `S` move where you look, `Shift` goes faster. Above the ceilings they disappear, so you can look down into the rooms.

**Do**

- Restore power, give the keycard or all spools, summon, send away or remove the Hollow, wake the Stills, bring the lift, reveal the whole map, clear the point cloud, and jump to any room.
- **Apparition**: pick a kind and summon it where you stand. Each kind wants its own sort of place (the crosser a crossing in view, the crawler a vent), and the game says so if there is none. The readout shows how many this descent has had, and why none may come right now.

**Live tuning** lists every number from `src/js/00-config.js` and lets you change it while the game runs. Changes are lost on reload, so copy the ones you like into the file.

A run in which debug mode was used says so on the ending screen and does not set a best time.

## The workshop

Numbers in a source file do not show what a room or a body looks like. The workshop does: it is the game's own world, renderer and scanner with the lights switched on, a panel of sliders beside it, and a way to write the result back into `src/`. It is a tool for building the game, so it is not part of `index.html`.

```bash
npm run dev
```

Open the address it prints (http://localhost:4471/) and press **Workshop** on the title screen. The page rebuilds and reloads itself whenever a file in `src/` or `assets/` changes, and comes back exactly where it was: same tool, same room, same camera, unsaved work included. If a source file does not parse, the last good build stays on screen with the file and line of the mistake above it.

**Rooms**

- Any room can be opened and walked around, lit or in the dark. A room written as code can only be looked at, but with the reload that is live tweaking too: change a number in `03-layout.js` or `03-levelgen.js`, save, and the view updates a moment later.
- **New room** starts a room you build by hand. Pick things from the list (tables, lockers, shelf racks, tanks, pipes, plain boxes, wall lettering, water and hazard floor, and so on), click one in the view to select it, drag it across the floor, turn it with `R`, nudge it with the arrow keys, change its sizes with the sliders. `Ctrl+Z` undoes, `Ctrl+D` copies, `Delete` removes.
- Set the room's size and ceiling, where its doors are, which lock tiers it may sit behind, and optionally a spot where a station may leave the first spool or the keycard.
- The checks under the Save button say what would go wrong in a station: something standing just inside a door, no way across the room between two doors, a thing poking through a wall or the ceiling, a spool spot nobody can reach. `N` marks the floor nothing can walk on.
- `L` switches the lights off: the view is then scanned continuously, so you see the room as a player who has scanned all of it would. Space and `F` work the scanner by hand. **From the door** puts you on your feet just inside the first door, which is how a player first sees the room.
- **Save** (`Ctrl+S`) writes `src/rooms/<name>.json`, one line per thing so it reads well in a diff. The build packs these files into the page. A room only turns up in generated stations once "Use this room in generated stations" is ticked; until then it is a draft. Ticking it changes which rooms existing seeds produce, as adding any room does. Run `npm test` afterwards.

**Creatures**

- Every number in `FIGURE_PROPORTIONS_HOLLOW` and `FIGURE_PROPORTIONS_DUMMY` (`src/js/04-figures.js`) has a slider, and the body changes as you drag it. A number added to those objects gets a slider by itself.
- "What it is doing" poses the body with the game's own pose code: roaming, hunting, enraged, standing drawn up to listen, held in the beam, reaching you. "Posed by hand" gives every joint a slider instead.
- Once something is changed, the shape from the file stands beside it in grey, in the same pose. The other creature can be stood beside it for scale, and the pole behind it has a mark every half metre.
- "What the scanner shows" hides the body and leaves only the points a scan puts on it, which is all a player ever sees of it.
- The sliders change the proportions the whole game uses, so you can leave the workshop and meet the result in play. They are remembered across reloads until you press **Write to file** (`Ctrl+S`), which changes only those numbers in `04-figures.js` and leaves the layout and comments of the file alone, or **Back to the file**. A number you change by hand in the file wins over a slider set earlier.

**Sounds**

- Every sound the game makes has a row: a button for a sound that plays once, a tick box for one that goes on (room tone, the growl, static, the generator), so you can hear one sound against another. **Play all in turn** goes through the whole list.
- Sounds that come from somewhere (the Hollow, doors, machinery, drips) are put straight ahead of you, at the distance the slider says. The cross in the hall marks the spot.
- After a sound has played, its row shows three numbers, all measured where the sound leaves the compressor, which is what reaches the speakers. **loud** is how loud it is to an ear at its loudest moment, in decibels below the most the speakers can do (ten less is about half as loud, and deep rumble counts for little, as it does in your head). **peak** is how large the wave got at the speakers, of 1.0. **held** is how many decibels the compressor took off it. Rest the mouse on the numbers for the whole story. These are the numbers `npm run audio-check` prints.
- Red means the peak is over 1.0 (or nothing came out). A speaker cuts such a wave off flat, which gives the sound a harsh edge, and from there a higher number adds edge, not loudness. Whether that edge is wanted is yours to judge. Amber means a big wave for how little of it is heard: most of the sound is very low (a heartbeat, knocking from the shaft, a blow on a door), and ears and small speakers make little of that, so it hits the ceiling long before it gets loud. More of the sound between 150 and 600 Hz helps; more level does not.
- The compressor is the last thing every sound goes through. It holds little back: the loudest sounds lose 2 to 5 decibels. Its two numbers are `SOUND_OUTPUT`, just under `SOUND_LEVELS`; the board has both as controls to try by ear (what you try there is not kept).
- How loud each sound is, is set in `SOUND_LEVELS`, the table at the top of `src/js/07-audio.js`: one multiplier per sound, where 1 is the sound as built and 2 doubles the signal (one clear step louder, not twice as loud). Under each sound's name is which number is its own and what it is now. Change it and the page reloads with the list where you left it, so the loop is: change, save, press the button again.
- `npm run audio-check -- --listen` starts the dev server and opens this tool directly. So does an address ending in `#sounds`.
- To add a sound to the list, add a line to `SOUND_BOARD_ENTRIES` in `src/dev/23-workshop-sounds.js`. It is then measured by `npm run audio-check` as well.

Without the dev server (`node build.js --dev`, then open `build/workshop.html`) everything works except writing into `src/`: Save downloads the room file and "Write to file" copies the changed numbers instead.

## Tweaking the game

Start with `src/js/00-config.js`. Every value there has a comment saying what it does, its unit, and what raising or lowering it changes. For example, `heatFactor` multiplies how fast the scanner heats up on a threat level: at 1.3 you get about 7.7 seconds of continuous painting instead of 10.

How the Hollow is paced is the block headed "The director" there: how fast menace builds, how long a breather lasts, how near its wandering may be steered. Debug mode's readout shows the director's phase, the menace level and the band of rooms it is currently choosing from.

How bent the Hollow is has two values there: `hollowBaseStoop` (how bent it always is) and `hollowCeilingGap` (how much room it keeps over its head, so how deeply it ducks under low ceilings and doors). Its size is in `FIGURE_PROPORTIONS_HOLLOW`, best changed in the workshop; whatever size you give it, it fits itself to the ceilings.

For looks and feel that live elsewhere (point colours and size, glow, mouse sensitivity, footstep spacing, door speed, body shapes), search the `src/js` folder for `TWEAK`. How loud each sound is, is in one table: `SOUND_LEVELS` at the top of `src/js/07-audio.js`, best tuned with [the sound board](#the-workshop). Each one marks a number that is safe to change and says what it does.

To change rooms, objects or wall lettering, see the short guide at the top of `buildFacilityLayout` in `src/js/03-layout.js`. To see what a change to a room or a body looks like while you make it, use [the workshop](#the-workshop).

Generated stations are tuned at the top of `src/js/03-levelgen.js`: `GENERATED_SIZE_PRESETS` sets how many extra rooms and ducts each size gets, and `GENERATED_LAYOUT_PRESETS` sets how often rooms get corridors and how far from the lift they spread. `STAIR_STEP_COUNT` and `STAIR_STEP_HEIGHT` set how long and steep the stairs are, and so how deep the lower level is. Each size's `vents` is how many vents it tries to fit; `VENT_HEIGHT` in `src/js/02-world.js` is how high they are inside. To add a kind of room, build it in [the workshop](#the-workshop), or write a `furnish...` function for it there (the room's north-west corner is at 0, 0) and add one entry to `ROOM_CATALOGUE` with its size, the places a door may go, and which lock tiers it may sit behind. Keep the floor just inside each door clear. Then run `npm test`: it builds 120 stations and reports any that cannot be walked or finished.

After any change:

```bash
npm run build
```

## Voice lines

Dispatch's radio lines and the three survey spools can be voiced. Record them clean, drop the files into `assets/voice/`, and build; the game adds the bad-radio sound itself. [`docs/voice-lines.md`](docs/voice-lines.md) lists every line with its file name and how to say it. Lines without a recording stay text only.

## Under the hood

The game is plain JavaScript and WebGL 2 with no libraries and no asset files.

| File | What it does |
|---|---|
| `src/js/00-config.js` | Every tuning value (each one explained), difficulty presets and all story text |
| `src/js/01-math.js` | Small math helpers and 4×4 matrices |
| `src/js/02-world.js` | Tile grid, props, signs, doors, collision, navigation, occluder mesh |
| `src/js/03-layout.js` | Every hand-built room with its props, signs and pickups, and how Kessel-9 puts them together |
| `src/js/03-levelgen.js` | Generated stations: the extra rooms, the room catalogue, the planner, locks, ducts and signs |
| `src/js/03-workshop-rooms.js` | Rooms made in the workshop: what they can contain, and how a file in `src/rooms/` becomes a catalogue room |
| `src/js/04-figures.js` | The capsule bodies used for everything that stands upright |
| `src/js/05-raycast.js` | What one laser pulse hits, and how far away |
| `src/js/06-renderer.js` | Point cloud, depth-only world, scanner model, post-processing |
| `src/js/07-audio.js` | Every sound, synthesised with the Web Audio API |
| `src/js/08-crawlspace.js` | The Hollow and locked doors: which doors are shut to it, the ceiling hatches, its way round above the ceilings |
| `src/js/08-entities.js` | Doors, the Hollow and its director, the Stills |
| `src/js/08-phantoms.js` | The apparitions: each kind, and the part that decides when one comes |
| `src/js/09-difficulty.js` | Threat levels: turns the "Custom" settings into the same kind of record a preset is |
| `src/js/09-player.js` | Keyboard, mouse and touch input, movement, the scanner |
| `src/js/10-interface.js` | HUD, map, messages and overlay screens |
| `src/js/11-game.js` | Objectives, checkpoints, death, ending and the main loop |
| `src/js/12-debug.js` | The little the game itself knows about debug mode: switches that are all off, and hooks that stay empty |
| `src/js/13-start.js` | One line that starts the game once everything above is loaded |
| `src/rooms/*.json` | Rooms made in the workshop, one file each (the folder appears with the first one you save) |
| `src/dev/` | Debug mode (`10-debug.js`: the panel, its switches and what they draw) and the workshop with its room, creature and sound tools. Only in the `npm run dev` build, never in `index.html` |
| `tools/dev-server.js` | `npm run dev`: builds, serves, reloads the page when the source changes, and writes what the workshop saves |

A few details worth knowing if you change things:

- A station is a grid of one-metre tiles carved into rooms (128 × 112 at most; Kessel-9 uses 76 × 64 of it), plus boxes, cylinders and spheres for everything standing in them. The same data drives the ray caster, collision, path finding and the black geometry that hides points behind walls.
- Each room is described once, at its place in Kessel-9. A generated station moves and turns the same descriptions, so a room is the same room wherever it ends up.
- The two levels of a generated station lie side by side on the plan, not one above the other, joined by stairs that really go down. That keeps the map a single flat drawing and the path finding simple. Every tile has its own floor height; anything that walks can take a step of up to 45 cm, and stands on whatever floor is under it.
- A generated station is planned as rectangles first: rooms are attached to free doorways of rooms already placed, either wall to wall or at the end of a new corridor. Rooms that need power are only ever attached to what can be reached without it or to each other, and likewise for the keycard, so the locks always come in an order that can be finished. Only then is anything built.
- Everything in a generated station follows from its seed through one numbered sequence of random draws. A shuffle is done by giving each item a drawn number and sorting on that number. The shorter way, sorting with a coin toss as the comparison, makes the result depend on how the browser happens to run the sort, and then one seed gives different stations on different days.
- Walls, floors and props are drawn into the depth buffer only, never in colour. Creatures are not drawn at all.
- Creatures are built from capsules (rods with rounded ends): 25 for the Hollow, down to three long fingers on each hand, and 24 for a dummy. The Hollow's pose follows its mood: hunched when wandering, reaching when it hunts, drawn up to its full height when it stops to listen.
- Sound is synthesised live, mostly from noise shaped by filters. The Hollow's growl is a recorded-in-code rattle of clicks pushed through three resonances, the way a throat and chest shape a voice.
- Points live in a ring buffer on the graphics card (250,000 to 1,000,000 depending on the quality setting). The oldest points are overwritten first.
- Points left on a creature carry a lifetime and fade; points on the station are permanent.

## Building and testing

The game needs nothing to run. The tooling needs [Node.js](https://nodejs.org) 18 or newer.

```bash
npm run build
```

rebuilds `index.html` from `src/`. The file is not kept in the repository, so it can never be out of step with the source.

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
npm test
```

plays the whole objective chain in a headless browser and checks each step: leaving the lift, the generator, the Hollow's path finding, the beam holding it, the director's fairness rules (never steered closer than its floor, never called off mid-chase, a real breather afterwards, noise still brings it), both ways to die, checkpoints, powered and keycard doors, the Stills, the lift call, the ending, that the game itself has no debug mode in it, every debug mode switch in the dev build, and the turn-your-phone-sideways screen.

It then builds 120 generated stations (40 of each size, across the three layouts, half with one level and half with two) and checks each one: nothing unreachable, every door usable from both sides, every objective within arm's reach, the generator reachable without power, each keycard only with the one before it, the shaft only with the last, and the fuel can, the core samples and the winch breaker where their rules say they must be. It checks that a seed always gives the same station (also after the browser has warmed up, which is what once broke it), plays the rules of each extra job, builds eight massive stations with three keycards each, walks down a flight of stairs on foot, tries a vent standing (no) and crouched (yes), sends the Hollow through it, and plays one two-level station from lift to lift, whatever extra job that station has, which includes the Hollow climbing the stairs from the shaft. Set `GENERATED_SEEDS` to try more, for example `GENERATED_SEEDS=300 node tools/generated-station-test.js`.

Then the Hollow and locked doors: each kind of door with the Hollow standing at it (the keycard door and the lift door stay shut, even with every card in your pocket), a keycard door shut between it and you (it never walks through, goes round through the crawlspace, and takes the time the numbers say: the climb, the metres, the full warning), a look from straight underneath it (a scan finds nothing and it cannot reach down), the landing (under the hatch that rattled, harmless for its first second), a keycard door held open by you (it simply walks through), pounding on a door (one bout, the door holds, it leaves that door alone for a while; the second bout adds to the damage; the third breaks it and it comes straight through; the broken door stays open and can be walked over; no pounding without the card, none on the lift door, harder when angry, and it stops if the door opens), short walks from under a hatch (it never takes to the ceiling for those), the lift car, and the hatches themselves. The 120 generated stations are each checked too: every locked-off part has a hatch, the Hollow can reach everywhere it may go, and without the crawlspace it really is shut in.

Then the Custom threat level: the panel opens and closes, a moved control changes the setting and the sentence beside it, the values survive closing the page, bad stored values are put right, a descent plays by what was set, heat, temper, stamina and apparitions each change by the factor asked for, one life really offers no checkpoint, and the ending names the descent as custom and keeps its best time apart.

Then the apparitions. Where and when they come is chance, so nothing there trusts one lucky try: each kind is summoned from about two thousand standing places in three stations and every one must be where its rules allow (in range, in sight, on good floor, never popping into the beam). Each kind is then played through: the watcher scanned, approached and ignored; the one behind you turned on and not turned on; the dummy coming closer and going; the crosser waiting, walking and vanishing; the crawler in its vent; the one in your face with loaded dice, with its limit, and switched off. Two long quiet walks check the timing (none too soon, never two at once, never the same kind twice running, never more than the descent is allowed), and a last part checks that none comes while the Hollow hunts or is near, and that one that is out goes when a hunt starts.

It ends with the workshop: on a copy of `src/` in a temporary folder it builds a room by clicking and dragging, saves it, finds it again in generated stations, changes a creature's proportions and writes them to the file, and checks that the page survives a source file that does not parse.

```bash
npm run dev
```

starts the dev build, with [debug mode](#debug-mode) and [the workshop](#the-workshop). `npm run dev -- --port 5000` uses another port.

```bash
npm run audio-check
```

measures every sound, because a test cannot listen: how loud each one is to an ear, how large its wave is at the speakers, how much the compressor held it back and where its energy sits. It fails only if one is silent. It then lists, for you to judge, the sounds whose wave is over what a speaker can take, and the ones with a big wave that an ear hears little of. It takes about three minutes; name one or more sounds to measure only those, for example `npm run audio-check -- hollow door`. It cannot tell you whether a sound is good. Only ears can:

```bash
npm run audio-check -- --listen
```

measures nothing and opens the workshop's [sound board](#the-workshop) in your browser instead, where every sound is on a button. `--port 5000` uses another port.

```bash
npm run voice-script
```

rewrites `docs/voice-lines.md` from the text in `src/js/00-config.js`. Run it after changing what dispatch or the spools say.

```bash
npm run screenshots
```

regenerates the pictures in `docs/screenshots/`. It renders in software and takes around ten minutes. Name one or more pictures to retake only those, for example `node tools/take-screenshots.js hollow phone`.

## Status

The rules are covered by the scripted test above. The test teleports between objectives, so it shows that the game can be finished, not that the chases are fair or the pacing is right. Balance values in `src/js/00-config.js` were chosen by reasoning and have had little real play. Expect to tune them.

The director's rules are checked, and its rhythm was measured with scripted players who cannot hear or scan, which is not the same as playing against it. Whether a breather feels like relief or like the game going slack is for a real playthrough to decide.

Generated stations are proven finishable, not proven good. Nobody has yet walked one from end to end with the Hollow hunting. They have more doors than Kessel-9, and every door you open makes noise, so they may play harder. The stairs and the vents are checked for being passable, by you and by what hunts you, but how a chase through them feels is untested. Vents are only in generated stations. Kessel-9 itself is still one level.

The locked doors and the crawlspace are checked for their rules and their timings. Whether half a minute overhead is the right price for a door, whether the thumps tell you enough about where it is going, and whether the rattle is enough warning, need ears and play. The numbers are in `src/js/00-config.js` under "The crawlspace", and the two sounds are on the sound board. How many bouts a door should take, and whether the pounding frightens or only delays, need play: `hollowDoorDamagePerBout` in the same place sets it (0.34 is three bouts, 0.5 two, 0 never). Dispatch has one new line for the first broken door (`doorBroken`), not yet recorded. Not done: you cannot lock or bar a door yourself. The Stills still open the doors of their own rooms.

The apparitions keep to their rules, which is what the test can show. How often is right, whether the dummy that comes closer frightens or annoys, and whether the one in your face reads as a face or only as a mass of points a metre away, need playing. All their numbers are in `src/js/00-config.js` under "Apparitions", and debug mode can summon each kind where you stand.

The extra jobs and the stations with two or three keycards are checked the same way: they can always be finished, and the rules do what this page says. Whether a second walk for a fuel can is dread or a chore has not been played. Dispatch's five new lines for them (`lowerKeycardTaken`, `generatorNoFuel`, `coresWanted`, `winchBreakerOpen`, `breakerClosed`) have no recordings yet and show as text.
