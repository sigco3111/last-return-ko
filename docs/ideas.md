## Ideas to (possibly) implement

- Logo and favicon
- More screenshots in readme
- Even better models
- random object that make sound when walked on and warn the monster
- Hollow can go through locked doors, though small chance, shouldn't be a thing, give alternative ways to get around (ceiling vents only for the monster? teleport with delay), also opens up player locking doors to get away
  - if enough doors are locked in its face it starts breaking them down? (protected doors it can't break down?)
- random work order numbers and letters
  - same for shaft number and rooms, allowing the same room multiple times with different indicator?
- random 'locations' to go along with work orders (not just Kessel-9 pumping annex)
  - random objectives and rooms tied to location types? pumping annex has shaft 9, others might not. 
- captions as setting, not for normal play (and then for more things, for accessibility)
- scan colors customizable

- more random objectives
  - item collection, multi-stage generators, activate and escape
  - only relevant objectives on map
  - fuel not always required (already a thing it seems)
  - multiple generators, could be only objective (3 or more if only objective, random fuel required per generator)
  - fuel spawn closer to generators, not across the map and back
    - fuel as object to carry with physics engine

- more monsters to vary threat or increase it
  - lidar monster produces dots around it on everything, but can see the player
  - small monster that moves objects (including what you need, chaseable and interruptable to get item back)
  - other types of blind monsters with different systems for it

- more cave like rooms for deeper levels (or different locations)
  - caves
  - bones and fossils
  - mineshafts with deadly drops
  - open field with houses :P
  - limiting certain rooms to level sizes

- extract hard-coded rooms to json files (with a few exceptions?)

- 'event' periods with event decorations
  - christmas
  - halloween
  - easter

- multiplayer? (mostly for item collection, like extraction looters), more interesting with the opened github issue <https://github.com/StefanKnol/No-Return/issues/14>
  - dev backdoor to mess with people :P (play/direct the monsters, play sounds, control doors, disco mode with random lidar dots coming out of a disco ball and music)
    - only on same server host, not other hosted
    - statistics of players (anonymous, but survival time, playtime and count, etc.)

### Implemented
~~- Slower detection of beam pointed at monster, so a tap doesn't immediately end in death but raises the monsters 'anger' level.~~
- ~~Better sounds, better monster growl, less 16bit-like audio~~
- ~~Actual voice lines over radio (generated, bad radio filter)~~
- ~~procedural level & objectives generation + bigger levels (multi-story)~~
~~- Better monster AI, more suspense~~
  ~~- Alien isolation like type;~~
    ~~- The Director AI (Macro AI / "The Brain"): This system always knows the player's exact location, but it acts as a restraint rather than an omniscient cheat. It guides the Xenomorph toward the player's general area and manages a "menace gauge" to control pressure, pulling the alien away or giving the player a breather when stress peaks.
      - not much change here :P~~
    ~~- The Xenomorph / Stalker AI (Micro AI / "The Body"): This part controls the physical creature, making it hunt strictly using line-of-sight, sound, and search nodes rather than teleporting or cheating its way to you.
      - the Hollow AI; no line-of-sight, but sound and beam detection etc, as is.
      - Could add more growling and crawling across walls and ceilings?~~
~~- less long-lived scanner dots on mobile things (doors already seem to remove the dots, figures don't)~~