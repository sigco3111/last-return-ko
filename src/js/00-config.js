// ---------------------------------------------------------------------------
// LAST RETURN - configuration, tuning values and all story text
//
// This is the file to open when you want the game to FEEL different.
// Change a number, run `npm run build`, reload index.html.
// Most numbers in TUNING can also be changed while the game is running: start `npm run dev`,
// press the ` key (top left of the keyboard) to open debug mode, then "Live tuning".
//
// Units used everywhere: distances in metres, speeds in metres per second,
// times in seconds, angles in degrees. One floor tile is one metre.
// ---------------------------------------------------------------------------

// The three threat levels on the title screen.
// Each "Factor" is a multiplier applied on top of the matching numbers in TUNING:
// 1.0 means "exactly as written in TUNING", 1.3 means 30 % more, 0.7 means 30 % less.
const DIFFICULTY_PRESETS = {
  survey: {
    key: 'survey',              // internal name, also used to store the best time
    label: 'Survey only',       // shown on the ending screen
    hollowEnabled: false,       // false: the Hollow never appears, not even after the generator starts
    stillsEnabled: false,       // false: the calibration dummies stay ordinary statues
    hollowSpeedFactor: 1.0,     // multiplies every Hollow speed (roam, investigate, hunt, enraged)
    hearingFactor: 1.0,         // multiplies every noise radius and how close it must be to hear you
    pressureFactor: 1.0,        // multiplies how quickly the Hollow closes in again after a breather, and shortens
                                // the breather by the same amount (see "The director" in TUNING)
    heatFactor: 0.7,            // multiplies how fast the scanner heats up (painting and sweeps).
                                // Below 1 you can scan for longer before overheating, above 1 for less long.
                                // It does not change how fast the scanner cools down.
    angerFactor: 1.0,           // multiplies how fast the beam angers the Hollow. Above 1 it knows where you are sooner.
    staminaFactor: 1.0,         // multiplies how long a full bar of stamina lasts. It does not change how fast it refills.
    phantomFactor: 1.0,         // multiplies how many apparitions a descent has, and divides the wait between them.
                                // 0 means none at all, not even the ones that stand at fixed places.
    checkpointsEnabled: true    // false: one life. Being caught ends the descent; there is no resuming from a checkpoint.
  },
  standard: {
    key: 'standard',
    label: 'Standard',
    hollowEnabled: true,
    stillsEnabled: true,
    hollowSpeedFactor: 1.0,
    hearingFactor: 0.8,         // it hears 20 % less far than the numbers in TUNING: a sprint step carries 11.2 m, not 14 m
    pressureFactor: 1.0,
    heatFactor: 1.0,
    angerFactor: 1.0,
    staminaFactor: 1.0,
    phantomFactor: 1.0,
    checkpointsEnabled: true
  },
  nightmare: {
    key: 'nightmare',
    label: 'Nightmare',
    hollowEnabled: true,
    stillsEnabled: true,
    hollowSpeedFactor: 1.14,    // 14 % faster: its hunt speed goes from 3.5 to about 4.0 (you sprint at 4.6)
    hearingFactor: 1.15,        // hears 15 % further than TUNING says: a sprint step carries 16.1 m (11.2 m on Standard)
    pressureFactor: 1.4,        // it closes in 40 % sooner and breathers are 40 % shorter
    heatFactor: 1.3,            // about 7.7 s of continuous painting before overheating instead of 10 s
    angerFactor: 1.2,
    staminaFactor: 1.0,
    phantomFactor: 1.4,
    checkpointsEnabled: true
  }
};

// The fourth threat level, "Custom": the player sets each of the numbers above for themselves.
// This list is what the "Adjust" panel on the title screen shows, in this order.
//   kind 'switch'   on or off. onText and offText say what each means.
//   kind 'percent'  a slider from minimum to maximum in steps of `step` (1.0 is shown as 100 %).
//   kind 'choice'   one of a few named values.
// What each setting comes to in plain numbers ("Hunts at 3.9 m/s. You sprint at 4.6.") is worked out from
// TUNING in 09-difficulty.js, so it stays true when TUNING changes.
// A custom threat level starts out as a copy of Standard.
const CUSTOM_DIFFICULTY_OPTIONS = [
  { key: 'hollowEnabled', kind: 'switch', label: 'The Hollow', onText: 'It comes once the power is on.', offText: 'It never appears.' },
  { key: 'stillsEnabled', kind: 'switch', label: 'The Stills', onText: 'They move while nothing is scanning them.', offText: 'They stay ordinary statues.' },
  { key: 'hollowSpeedFactor', kind: 'percent', label: 'Hollow speed', minimum: 0.7, maximum: 1.4, step: 0.05 },
  { key: 'hearingFactor', kind: 'percent', label: 'Hollow hearing', minimum: 0.5, maximum: 1.6, step: 0.05 },
  { key: 'pressureFactor', kind: 'percent', label: 'How hard it presses', minimum: 0.5, maximum: 2, step: 0.1 },
  { key: 'angerFactor', kind: 'percent', label: 'Its temper in the beam', minimum: 0.5, maximum: 2, step: 0.1 },
  { key: 'heatFactor', kind: 'percent', label: 'Scanner heat', minimum: 0.5, maximum: 2, step: 0.1 },
  { key: 'staminaFactor', kind: 'percent', label: 'Your stamina', minimum: 0.5, maximum: 2, step: 0.1 },
  { key: 'phantomFactor', kind: 'choice', label: 'Apparitions', choices: [[0, 'None'], [0.5, 'Few'], [1, 'Normal'], [2, 'Many']] },
  { key: 'checkpointsEnabled', kind: 'switch', label: 'Checkpoints', onText: 'Caught: you resume from the last checkpoint.', offText: 'One life. Caught means starting over.' }
];

// The "Quality" choice on the title screen. These only affect looks and performance.
const QUALITY_PRESETS = {
  // maximumPoints: how many points are remembered. When full, the oldest are overwritten,
  //                so a low number means rooms you scanned long ago fade from view sooner.
  // raysPerSecond: pulses fired per second while painting. Higher fills surfaces in faster.
  // sweepRays:     pulses fired by one full sweep.
  // renderScale:   1.0 draws at full screen resolution, 0.75 draws smaller and stretches (faster, softer).
  low: { key: 'low', maximumPoints: 1000000, raysPerSecond: 6500, sweepRays: 20000, renderScale: 0.75 },
  medium: { key: 'medium', maximumPoints: 2000000, raysPerSecond: 6500, sweepRays: 20000, renderScale: 0.8 },
  high: { key: 'high', maximumPoints: 4000000, raysPerSecond: 6500, sweepRays: 20000, renderScale: 1.0 },
  ultra: { key: 'ultra', maximumPoints: 5000000, raysPerSecond: 6500, sweepRays: 20000, renderScale: 1.0 },
};

const TUNING = {
  // ---- The player's body ---------------------------------------------------
  playerRadius: 0.3,            // how wide you are for bumping into walls. Smaller squeezes through tighter gaps.
  eyeHeightStanding: 1.62,      // camera height when standing
  eyeHeightCrouching: 0.95,     // camera height when crouched
  walkSpeed: 2.5,
  sprintSpeed: 4.6,             // must stay above hollowHuntSpeed or sprinting cannot open a gap
  crouchSpeed: 1.3,
  waterSpeedFactor: 0.72,       // speed multiplier while wading through flooded floor (1 = no slowdown)
  playerAcceleration: 16,       // how quickly you reach full speed. Low feels like ice, high feels snappy.
  staminaSeconds: 6.5,          // how long you can sprint on a full bar
  staminaRecoverySeconds: 10,   // how long an empty bar takes to refill
  interactionReach: 2.0,        // how close you must be to use a terminal, note or pickup

  // ---- The scanner ---------------------------------------------------------
  scannerMaximumRange: 50,      // pulses that travel further than this report NO RETURN
  scannerSpreadMinimumDegrees: 3,   // narrowest beam (mouse wheel down). Half-angle of the cone.
  scannerSpreadMaximumDegrees: 26,  // widest beam (mouse wheel up)
  scannerSpreadDefaultDegrees: 11,
  // The scanner is a thing in your hand and trails a little behind where you look (issue #55). Its dots, the
  // aiming ring, its lens and what it carries all go with it.
  scannerFollowRate: 22,            // how eagerly it comes round to where you look, per second. Lower trails further. 0 switches the trailing off.
  scannerLagMaximumDegrees: 9,      // it never trails further behind your view than this, however fast you turn
  scannerStrafeLagSeconds: 0.016,   // sidestepping leaves it behind by your sideways speed times this (4 cm at a walk)
  scannerStrafeLagMaximumMetres: 0.07,
  scannerRunLagSeconds: 0.005,      // going forward brings it toward you by your forward speed times this (about 2 cm at a run)
  scannerClearanceMetres: 0.08,     // the scanner is held back this far from a wall your face is against, so that it is never inside it
  // Heat runs from 0 (cold) to 1 (overheated). The HUD bar shows it.
  heatPerSecondWhilePainting: 0.1,  // 0.1 = ten seconds of continuous painting from cold to overheated
  heatCoolingPerSecond: 0.2,        // 0.2 = five seconds from overheated back to cold when not scanning
  overheatRecoveryLevel: 0.4,       // after overheating, the scanner stays locked until heat drops to this
  sweepDurationSeconds: 2.4,        // how long one full sweep takes. You walk at half speed during it.
  sweepHeatCost: 0.35,              // heat added by one sweep. Sweeps are refused above 0.78 heat.
  sweepHalfWidthDegrees: 55,        // how far left and right of centre a sweep reaches
  sweepHalfHeightDegrees: 40,       // how far above and below centre a sweep reaches
  doorImprintSeconds: 4,            // how long the points on a door stay where they were measured once it slides away
                                    // (maximum 63). They are solid for the first half and thin out over the second.

  // ---- Noise you make ------------------------------------------------------
  // Each of these is a one-off sound. If the Hollow is within this many metres it hears it
  // and walks over to investigate. If it is within 30 % of the distance it starts hunting at once.
  // Bigger numbers make the Hollow find you more often. All are multiplied by hearingFactor.
  noiseRadiusWalkStep: 4,
  noiseRadiusSprintStep: 14,
  noiseRadiusVentStep: 5,       // one shuffle forward inside a vent. Sheet metal booms: this is the price of the shortcut.
  noiseRadiusCrouchStep: 1.2,
  noiseRadiusScannerHum: 4,     // emitted twice a second while painting
  noiseRadiusSweep: 22,
  noiseRadiusDoor: 8,           // a door you open (doors the Hollow opens do not count)
  noiseRadiusPickup: 4,
  noiseRadiusValve: 18,          // shutting an isolation valve: its actuator squeals. On Standard that is heard from 14 m.
  noiseRadiusGeneratorStart: 30, // starting one of the small generators (1, 3, 4). On Standard that is heard from 24 m, and within 7 m of it the Hollow knows where you are.
  // ---- Captions (the lines themselves are in CAPTIONS, further down) ----
  captionMostLines: 4,              // never more than this many caption lines on screen at once
  captionCloseMetres: 5,            // with "every sound" on, a sound nearer than this is called "close" ...
  captionNearMetres: 12,            // ... nearer than this "near", and anything further "far"
  captionOwnDoorMetres: 3.5,        // a door opening or closing this near to you is your own doing and gets no caption
  captionHeartbeatPressure: 0.55,   // how hard you are pressed (0 to 1) before your heartbeat is put into words
  captionShriekLevel: 0.3,          // how loud its shriek in the beam (0 to 1) before that is put into words

  // ---- Loose objects (see 08-loose-objects.js): things you carry, drop and throw ----
  // How they fall and come to rest.
  looseGravity: 9.81,               // metres per second, per second
  looseStepSeconds: 1 / 120,        // the world of loose objects is worked out this often. Coarser is cheaper and lets fast things slip into walls.
  looseBounceFromSpeed: 1.2,        // a hit slower than this (m/s) does not bounce at all, so things settle instead of chattering
  looseAirDrag: 0.08,               // how much speed is lost to the air each second (0.08 = 8 percent)
  looseRollingDrag: 2.2,            // how quickly something rolling or rocking on a surface loses its spin. Higher stops a rolling canister sooner.
  looseWakeFromSpeed: 0.6,          // something at rest that is hit slower than this (m/s) by another object stays as it is, like part of the floor
  looseRestSpeed: 0.05,             // slower than this (m/s) ...
  looseRestSpin: 0.35,              // ... and turning slower than this (radians per second) ...
  looseRestSeconds: 0.4,            // ... for this long, while touching something: it is at rest, and left alone until something touches it
  looseImprintSeconds: 0.7,         // how long points scanned onto a moving or carried object stay. (On one at rest they stay for good.)
  // Carrying.
  looseBeamReach: 2.6,              // how far away the scanner's beam can take hold of one
  looseHoldDistance: 0.7,           // how far out from the scanner's lens it hangs, on top of its own size (a crate is 0.4 from middle to corner). The lens is 0.55 in front of your eyes.
  looseHoldFollowRate: 8,           // how eagerly it closes the gap to where the beam wants it. Lower is a looser, swingier carry.
  looseHoldResponseRate: 14,        // how quickly it gets up to speed. Lower is heavier-feeling.
  looseHoldLagPerKilogram: 0.06,    // how much each kilogram takes off both of those. 0 = a crate follows like a jar.
  looseHoldTurnRate: 5,             // how eagerly the beam turns a thing back to how it was taken hold of. Low: its hold on that is weak.
  looseHoldSlipDegrees: 22,         // knocked this far round against something, the beam gives and holds it as the knock left it
  looseHoldFastestSpeed: 7,         // it never chases your hands faster than this (m/s), however far behind it is
  looseHoldSagPerKilogram: 0.002,   // metres it hangs below the line the scanner points along, per kilogram
  looseHoldShortestDistance: 0.12,  // pressed against something ahead, the beam holds a thing as near as this (from the lens to its nearest side); then it can give no more
  looseHoldGiveSlack: 0.04,         // the thing has to be this far short of where the beam wants it before the beam gives
  looseHoldLetOutSpeed: 1.6,        // how fast the beam lets it out again when there is room (m/s)
  looseHoldStopDistance: 0.35,      // when it is against something and this far behind where the beam wants it, it starts to hold you back ...
  looseHoldStopSpeed: 3,            // ... by up to this many metres a second: enough to stop a walk (2.5), not a run (4.6)
  looseHoldBreakDistance: 0.9,      // caught on something and further than this from where the beam wants it ...
  looseHoldBreakSeconds: 0.25,      // ... for this long, and the beam loses it. (Not caught on anything, it has to be two and a half times as far.)
  carrySlowdownPerKilogram: 0.03,   // how much each kilogram slows your walk: 12 kg makes you 0.73 times as fast
  // The scan grenade (a loose object that does something: see `use` in LOOSE_OBJECT_KINDS).
  scanGrenadeFuseSeconds: 6,        // armed and not yet landed anywhere, it goes off after this long, wherever it is
  scanGrenadeLandingSeconds: 0.35,  // armed and thrown, it goes off this long after it first hits something
  scanGrenadeBurstSeconds: 1.2,     // how long its scan lasts
  scanGrenadeSweeps: 1.7,           // how many pulses it fires in all, in full sweeps of the scanner (a sweep is 20,000). This was 2.5 while a third of them went into the floor under it; 1.6 puts as many on the room as 2.5 did then.
  scanGrenadePatchMetres: 0.25,     // it wastes no light on anything it is up against: a pulse that would land on floor, wall or ceiling nearer than this is aimed somewhere else instead. (Lying on the floor, 35 of every 100 pulses of an all-round burst landed within a hand of it.)
  scanGrenadeStunHits: 25,          // pulses that must land on the Hollow for it to be stunned
  scanGrenadeStunSeconds: 3.5,      // how long the Hollow stands stunned. An enraged Hollow is not stunned.
  noiseRadiusScanGrenade: 20,       // going off is loud. The Hollow comes to where it went off, not to you.
  // The Hollow and things it kicks.
  hollowChasesKickedMass: 4,        // something this light or lighter (kg) that it kicks, it goes after ...
  hollowChasesKickedSeconds: 5,     // ... for this long at most, unless it is hunting you
  hollowChasesAgainAfterSeconds: 15, // and it does not go after the same thing again for this long
  // Only things you have had in the beam interest it. When it has batted a small one about for a while, it throws it back at you.
  hollowFlingsMass: 1.5,            // this light or lighter (kg) it throws: a can, a jar, a cardboard box, a scan grenade
  hollowFlingsAfterSeconds: 2,      // after going after the thing for this long, the next time it has it at its feet
  hollowFlingsWithinMetres: 1.3,    // "at its feet"
  hollowFlingsSpeed: 12,            // how fast it throws, over the ground (m/s)
  hollowFlingsScatterMetres: 1.5,   // it lands within this far of you: at you or near you, on purpose
  // What a station has lying about (see planStationLooseObjects in 08-loose-objects.js).
  ventCoverInPlaceChance: 0.5,      // this share of the vents' mouths still have their cover standing in them; the others' lie on the floor in front
  looseLitterPerRoom: 0.7,          // boxes, plates and stray cans: this many for every room and corridor
  looseValuablesPerRoom: 0.4,       // things worth carrying out: this many for every room and corridor
  haulShareOfValue: 0.4,            // the salvage quest asks for this share of what everything within walking reach of the lift is worth
  haulBayPulseSeconds: 60,          // an open salvage bay's lamp lights the floor in front of its door this often, and pings
  haulBayPulseRays: 420,            // ... with this many scan points ...
  haulBayPulseMetres: 1.1,          // ... in a patch of this radius, a step or two in front of the door
  noiseRadiusHaulBayPing: 9,        // how far the Hollow hears that ping
  looseAppraiseHits: 20,            // after this many pulses on a thing the scanner has read it, and the screen says what it is worth
  looseValuablesShareOnSurfaces: 0.5, // this share of those stands on tables, shelves and crates; the rest on the floor, out of the way
  // What a knock costs (see "What a knock costs" in 08-loose-objects.js).
  looseDamageFromSpeed: 2.2,        // a knock slower than this (m/s) costs nothing. A thing set down is under it; a full walk into a wall (2.5) is just over.
  looseDamageRuinSpeed: 9,          // ... and at this speed it takes off the whole of the thing's `fragile` share. A drop from your hands lands at about 4.5, a hard throw at up to 11.
  looseWorthLeastShare: 0.1,        // nothing is ever worth less than this share of what it was whole
  noiseRadiusShatter: 24,           // a sample jar shattering: as far as the hardest knock carries
  // Walking into one that lies on the floor.
  looseShoveFreeMass: 2,            // lighter than this (kg) you kick along without it slowing you
  looseShoveBlockMass: 16,          // this heavy or heavier it does not move for your legs and stops you: pick it up. In between it slows you by its share of the way from one to the other.
  // Throwing.
  looseThrowTapSeconds: 0.22,       // letting E go sooner than this only lets go of the object
  looseThrowChargeSeconds: 0.9,     // holding it this long gives the hardest throw
  looseThrowSpeed: 11,              // metres per second for a full throw of something that weighs nothing ...
  looseThrowLossPerKilogram: 0.11,  // ... and what each kilogram takes off it: a 3 kg canister leaves at 8.3 m/s, an 18 kg motor at 3.7
  looseThrowLift: 1.6,              // metres per second upwards added to a full throw
  looseThrowSpin: 5,                // how fast it tumbles as it leaves your hands (radians per second)
  // Knocks. How hard an object hits something decides what is heard.
  looseKnockFaintestSpeed: 0.35,    // slower than this (m/s) makes no sound at all
  looseKnockQuietSpeed: 1.5,        // slower than this is a tap that you hear and the Hollow does not. Crouch-walking (1.3 m/s) into a wall is under it; walking (2.5, less with something heavy) is over.
  looseKnockLoudSpeed: 5.5,         // at this speed and above it is as loud as it gets. A drop from your hands lands at about 4.5.
  looseKnockGapSeconds: 0.12,       // one object is not heard twice within this time, so a rattle is a few knocks and not fifty
  noiseRadiusKnockSoft: 6,          // how far the softest knock the Hollow can hear carries, for an object of middling weight ...
  noiseRadiusKnockHard: 22,         // ... and the hardest. Light things carry 0.6 times as far, the heaviest 1.5 times.

  // ---- Noisy things on the floor (see 03-noisy-floor.js): broken glass, a loose plate, empty cans ----
  noiseRadiusNoisyFloorWalk: 10,    // walking over one. A plain walking step carries 4.
  noiseRadiusNoisyFloorSprint: 19,  // running over one. A plain sprinting step carries 14. Crouched, they make no noise at all.
  noisyFloorPerRoom: 0.4,           // how many a station has: this many for every room and corridor (Kessel-9: 8, a massive station: about 24)
  noisyFloorFewest: 3,              // ... but never fewer than this
  noisyFloorLeastMetresApart: 6,    // and never two closer together than this
  noisyFloorShareWhereYouMustWalk: 0.5, // this share of them lies in corridors and a step or two inside doors; the rest anywhere
  noisyFloorLeaveMetres: 0.25,      // you (and the Hollow) count as still on one until this far past its edge, so shuffling on the edge does not set it off again and again
  noisyFloorShortestGapSeconds: 0.3, // and the same feet cannot set one off twice within this time
  waterStepNoiseFactor: 1.5,    // footsteps in water carry this much further

  // ---- How close the Hollow must be to notice you without any sound event --
  // Think of it as the sound of your breathing and clothes. It also needs a clear straight
  // walking line to you (or to be within 1.6 m). Also multiplied by hearingFactor.
  audibleRadiusSprinting: 7.5,
  audibleRadiusWalking: 4.2,
  audibleRadiusStanding: 2.6,
  audibleRadiusCrouchWalking: 2.0,
  audibleRadiusVentCrawling: 4.0, // crawling in a vent: it notices you from here even between the booms of your knees
  audibleRadiusCrouchedStill: 0.8, // the "hold your breath" distance. Below hollowKillDistance would make hiding perfect.
  waterAudibleFactor: 1.3,          // moving through water makes all of the above this much larger

  // ---- The Hollow ----------------------------------------------------------
  hollowRoamSpeed: 1.3,             // wandering between rooms, not aware of you
  hollowInvestigateSpeed: 2.5,      // walking to a noise it heard
  hollowHuntSpeed: 3.5,             // it knows where you are. Faster than your walk, slower than your sprint.
  hollowEnragedSpeed: 5.3,          // when its anger is full. Faster than your sprint on purpose.
  hollowSpeedBonusWithAllSpools: 1.1, // speed multiplier once you carry every spool (the walk back is harder)
  hollowHeldSpeedFactor: 0.1,       // speed multiplier while the beam is on it. 0 freezes it, 1 means the beam does nothing.
  hollowVentSpeedFactor: 0.7,       // speed multiplier while it crawls through a vent. Below about 0.4 a vent stops being
                                    // a shortcut for it; at 1 it is as fast on its knees as on its feet.
  hollowBeamHitsToNotice: 2,        // pulses that must land on it in one frame before it counts as "in the beam"
  hollowKillDistance: 0.4,          // closer than this and it has you

  // ---- The crawlspace: the Hollow's way round locked doors (see 08-crawlspace.js) ----
  // It cannot open a keycard door or the lift door. It goes up through a ceiling hatch, crawls, and drops out of another.
  hollowCrawlSpeed: 2.4,              // metres per second above the ceiling. Slower than it hunts on foot (hollowHuntSpeed).
  hollowCrawlClimbSeconds: 1.4,       // how long it stands under a hatch reaching up before it is gone
  hollowCrawlDropWarningSeconds: 2.5, // how long the hatch it is coming out of rattles before it drops. This is your warning.
  hollowCrawlLandingGraceSeconds: 1.0,// after it lands it cannot catch you for this long
  hollowCrawlFixedSteps: 12,          // how unwilling it is to use the crawlspace at all: going up and coming down count
                                      // as this many steps of walking when it works out the shortest way ...
  hollowCrawlStepsPerMetre: 1.5,      // ... and every metre crawled counts as this many. Raise both and it only goes up
                                      // when a lock leaves it no choice; lower them and it takes short cuts over your head.
  hollowHatchTilesPerExtra: 260,      // a locked-off part of the station gets one hatch, plus one more for every so many
                                      // square metres of floor ...
  hollowHatchMostPerPart: 3,          // ... up to this many ...
  hollowHatchLeastMetresApart: 10,    // ... and never two closer together than this

  // ---- Breaking a door down (see 08-crawlspace.js) ----
  // Hunting, with a keycard door shut between it and you that you have the card for, it goes at the door first.
  // It pounds on it for a while. A door takes so much of that, and then it gives way for good.
  hollowDoorBangSeconds: 3.3,         // how long one bout of pounding lasts
  hollowDoorBangEverySeconds: 0.55,   // the time between two blows
  hollowDoorDamagePerBout: 0.34,      // how much of a door one bout uses up. 0.34: the third bout breaks it. 0 switches breaking off
                                      // (it still pounds). 1: any door goes in one bout.
  hollowDoorDamageAngerBonus: 0.5,    // the angrier it is the harder it hits: at full anger a bout does this much more (0.5 = half as much again)
  hollowDoorBangCooldownSeconds: 20,  // after a bout that did not break the door it leaves that door alone for this long, and goes round
  hollowDoorBangWithinMetres: 7,      // it only goes at a door it is this close to, with a clear walk to it
  hollowDoorBangWorthSteps: 15,       // and only if through the door is at least this many steps shorter than the way round
  // How the Hollow holds itself. Its size is in FIGURE_PROPORTIONS_HOLLOW (04-figures.js); these two decide how bent it is.
  hollowBaseStoop: 0.4,             // how bent it always is, from 0 (as upright as its hunch allows) to 1 (folded right over).
                                    // It still draws itself up when it stops to listen.
  hollowCeilingGap: 0.25,           // metres it keeps between its head and the ceiling. It reads the ceiling over it and
                                    // just ahead, and bends further to keep this gap. Raise it and it crouches along low
                                    // corridors and ducks deep through doors; at 0.05 it only just clears them.
                                    // Standing drawn up to listen, it ignores this and stops just short of the ceiling.
  // Anger: one meter from 0 (calm) to 1 (enraged). The beam fills it, time drains it.
  //   below hollowAngerNoticeLevel  the beam only makes it stop and turn toward the light
  //   above hollowAngerNoticeLevel  the beam tells it exactly where you are, and it hunts
  //   at 1                          it is enraged: the beam stops slowing it for hollowEnragedDurationSeconds
  // Anger also carries over between encounters, so the more you light it up, the shorter your next grace period.
  hollowAngerPerBeamSecond: 0.2,   // anger gained per second in the beam. 0.24 = about 4.2 s from calm to enraged.
                                    // A quick tap of the beam (0.2 s) costs about 0.05.
  hollowAngerNoticeLevel: 0.27,      // 0.3 = about 1.25 s of beam from calm before it knows where you are.
                                    // Raise it to make brief scans safer, lower it toward 0 to make any touch dangerous.
  hollowAngerCoolingPerSecond: 0.035, // anger lost per second while the beam is off it and it is not hunting.
                                    // 0.035 = about 29 s from enraged back to calm. Higher makes it forgive faster.
  hollowAngerAfterEnraged: 0.55,    // where its anger settles once an enraged spell ends (it stays touchy)
  hollowAngerSpeedBonus: 0.12,      // at full anger it hunts this much faster (0.12 = 12 %)
  hollowAngerHearingBonus: 0.3,     // at full anger it hears this much further (0.3 = 30 %)
  hollowEnragedDurationSeconds: 4.0, // how long it stays enraged (ignores the beam, uses hollowEnragedSpeed)
  hollowMemorySeconds: 5.0,         // after losing track of you it keeps heading for where it last sensed you this long
  hollowSearchSeconds: 8.0,         // then it pokes around that area this long before giving up
  hollowSearchLeadSeconds: 2.5,     // it starts searching this many seconds of travel ahead of where it lost you,
                                    // in the direction you were moving. 0 = it searches exactly where it lost you.
  hollowDoubleBackChance: 0.3,      // chance that, after giving up a search, it walks off and then returns to the
                                    // same spot 6 to 11 seconds later. 0 = never, 1 = always.
  // Listening: while wandering near you it sometimes stops dead for a few seconds. It makes no footsteps
  // while it does, and it hears better.
  hollowListenWithinMetres: 20,     // it only stops to listen when you are within this distance
  hollowListenSecondsMinimum: 2,    // shortest pause
  hollowListenSecondsMaximum: 10,  // longest pause
  hollowListenEverySecondsMinimum: 14, // shortest gap between two pauses
  hollowListenEverySecondsMaximum: 26, // longest gap
  hollowListenHearingFactor: 1.8,   // how much further it hears while listening (1.5 = 50 %)

  // ---- The director: decides which room the Hollow wanders to next. Only the Hollow; the Stills ignore it. ----
  // It keeps a hidden "menace" level from 0 to 1. Menace rises while the Hollow is near you or after you, and
  // drains while it is away. The run is a cycle of two phases:
  //   CLOSING IN  its wandering is steered to rooms nearer and nearer to you.
  //   BREATHER    once menace has been full, and it is not chasing or searching, it is sent to the far side of
  //               the station and kept there until menace has drained.
  // What keeps this fair: the director never tells the Hollow where you are. It only picks a room, never one
  // closer than directorNearRingMinimumSteps, and the Hollow still has to hear you or feel the beam to find you.
  // A breather always follows a full menace, and noise you make is the only thing that cuts one short.
  // "Steps" below are metres of walking, round corners and through doors, not straight-line distance.
  directorMenaceRangeSteps: 22,       // closer than this on foot counts as "near you". Larger = menace builds from further off.
  directorPeakAfterHuntSeconds: 14,   // a chase fills menace in this long. Shorter = fewer long chases before it backs off.
  directorPeakAfterSearchSeconds: 26, // searching or listening right beside you fills it in this long (slower further away)
  directorPeakAfterLoomSeconds: 45,   // merely wandering right beside you fills it in this long (much slower further away)
  directorCalmSeconds: 45,            // menace drains from full to empty in this long once it is away from you
  directorReliefMinimumSeconds: 20,   // a breather lasts at least this long...
  directorReliefEndsBelowMenace: 0.3, // ...and until menace has drained below this. Lower = longer breathers.
  directorReliefSteps: 30,            // during a breather it keeps to rooms at least this far from you (or as far as there is)
  directorBuildSeconds: 80,           // after a breather, how long until it has closed in fully. Its anger shortens this, up to half.
  directorFarRingMinimumSteps: 12,    // straight after a breather it picks rooms between this...
  directorFarRingMaximumSteps: 38,    // ...and this far from you
  directorNearRingMinimumSteps: 3,    // fully closed in, it picks rooms between this (it is never steered closer than this)...
  directorNearRingMaximumSteps: 13,   // ...and this far from you
  // Tension rises as the job gets done: every spool you are carrying speeds the whole cycle up.
  directorPressurePerSpool: 0.25,     // with one spool it closes in 25 % sooner and breathers drain 25 % faster, with two 50 %,
                                      // with three 75 %. 0 = the same from start to finish. This multiplies with the threat
                                      // level's pressureFactor.
  directorReliefShortestSeconds: 12,  // however much the cycle is sped up, a breather is never shorter than this
  hollowWakeDelaySeconds: 6,        // seconds between starting the generator and the Hollow appearing at the shaft
  hollowImprintSeconds: 4,        // how long the red points a scan leaves on it stay visible (maximum 63)

  // ---- The Stills (calibration dummies) ------------------------------------
  stillSpeed: 1.8,                  // walking speed while nothing is scanning them. Your walk is 2.5.
  stillObservedHoldSeconds: 2.3,    // a dummy stays frozen this long after the last pulse that touched it.
                                    // Higher lets you look away for longer.
  stillKillDistance: 0.6,
  stillImprintSeconds: 22,          // how long the points a scan leaves on a dummy stay visible (maximum 63).
                                    // Long imprints mean old outlines linger and the room looks more crowded than it is.

  // ---- Apparitions ---------------------------------------------------------
  phantomImprintSeconds: 3.5,       // how long the points of a figure that "was never there" stay visible
  // Besides the few that stand at fixed places, apparitions turn up by chance, at a place chosen at that moment
  // from where you are and which way you are looking (see 08-phantoms.js). These numbers say how often.
  phantomFirstAfterSeconds: 45,     // none in the first seconds after you leave the lift
  phantomGapShortestSeconds: 70,    // after one has gone, the next comes no sooner than this ...
  phantomGapLongestSeconds: 170,    // ... and no later than this, if the rules below allow it then
  phantomRetryShortestSeconds: 18,  // one that nobody saw does not count; another is tried after this short a wait ...
  phantomRetryLongestSeconds: 40,   // ... or this long
  phantomBudgetBase: 2,             // how many a descent may have: this many ...
  phantomRoomsPerExtra: 8,          // ... plus one for every so many rooms (Kessel-9: 4, a massive station: about 10)
  phantomMostMenace: 0.45,          // none while the director's menace is above this: they belong to the quiet stretches.
                                    // Raise toward 1 to let them turn up with the Hollow close by.
  phantomUnseenSeconds: 30,         // one that has stood this long without being scanned is withdrawn
  phantomStingerGapSeconds: 40,     // the three sagging notes play at most this often
  phantomWatcherNearestMetres: 8,   // "watcher": stands and faces you from between this far ...
  phantomWatcherFarthestMetres: 20, // ... and this far away, where you can see it from where you are
  phantomBehindNearestMetres: 3.5,  // "behind you": between this far ...
  phantomBehindFarthestMetres: 6.5, // ... and this far behind your back
  phantomBehindSeconds: 14,         // and gone again after this long if you never turn round
  phantomDummyNearestMetres: 7,     // "dummy": a mannequin where none should be, between this far ...
  phantomDummyFarthestMetres: 14,   // ... and this far away. Look away and it is closer. Look away again and it is gone.
  phantomDummyLookAwaySeconds: 0.8, // how long it must go unscanned before it moves
  phantomCrosserNearestMetres: 9,   // "crosser": walks across your view between this far ...
  phantomCrosserFarthestMetres: 20, // ... and this far away, and is gone at the other side
  phantomCrosserSpeed: 1.5,         // metres per second
  phantomCrawlerNearestMetres: 4.5, // "crawler": on its knees and hands in a vent mouth, between this far ...
  phantomCrawlerFarthestMetres: 16, // ... and this far away
  // "In your face": you start a scan and it is standing right in front of you. Not one of the kinds above:
  // it has its own dice, thrown every time you start to scan, and its own limit.
  phantomFaceChancePerScan: 0.01,   // the chance each time a scan starts (0.01 = one in a hundred). 0 switches it off.
  phantomFaceMostPerDescent: 1,     // however the dice fall, no more than this many in one descent. A scare like this wears out fast.
  phantomFaceNotBeforeSeconds: 120, // and never in the first two minutes
  phantomFaceMetres: 1.6,           // how far in front of you its feet are (it leans in: its head is about a metre from yours)
  phantomFaceSeconds: 0.7,          // how long it stays once the scan has touched it
  // The few that stand at fixed places:
  phantomPlacedNearestMetres: 3,    // a placed one is not shown while you are closer to its spot than this

  // ---- The lift ------------------------------------------------------------
  liftArrivalSeconds: 40,           // how long you must survive after uploading the spools
  liftArrivalSecondsWithoutHollow: 12 // the same wait on "Survey only", where nothing is coming
};

// Names shown under the minimap and on the full map, for the classic station.
// The order must match the ZONE_ numbers in 02-world.js. A generated station writes its own list into ZONE_NAMES.
const CLASSIC_ZONE_NAMES = [
  'UNSURVEYED',
  'LIFT CAR',
  'LIFT LOBBY',
  'MAIN CORRIDOR A',
  'SECURITY OFFICE',
  'LOCKER ROOM',
  'MESS ROOM',
  'STORE CLOSET',
  'ARCHIVE ACCESS',
  'PUMP HALL VESTIBULE',
  'PUMP HALL B',
  'GENERATOR ROOM',
  'CONTROL ROOM',
  'WEST SERVICE PASSAGE',
  'ARCHIVE',
  'LABORATORY',
  'COLD ROOM',
  'CALIBRATION STORE C4',
  'DEEP CORRIDOR',
  'SHAFT 9'
];

const ZONE_NAMES = CLASSIC_ZONE_NAMES.slice();

// The lines that appear one by one on the black screen after "Begin descent".
const INTRO_LINES = [
  'KESSEL-9 PUMPING ANNEX',
  '212 m below grade. Sealed 1987.',
  'Work order 4471-B: recover three survey spools left by Crew 2.',
  'There is no lighting. The scanner is the only way to see.'
];

// What dispatch says over the radio. When each one plays is decided in 11-game.js.
const RADIO_MESSAGES = {
  // These lines are also read aloud if recorded (docs/voice-lines.md), so they must be true in every station,
  // classic or generated: name rooms, never directions.
  leftLift: 'The car goes back up on its own when it is empty. Mains is dead on your level. Find Generator 2 and get it running. It is off Pump Hall B.',
  firstSpool: 'That is one. Crew 2 logged two more: one in the calibration store, one at the shaft.',
  // The same moment in a station with more than three spools, where "two more" would not be true.
  firstSpoolOfMany: 'That is one. Crew 2 logged more of them. One is in the calibration store, one is at the shaft, and the rest are wherever they left them.',
  generatorStarted: 'We see the load up here. Powered doors should answer now.',
  generatorFollowUp: 'Odd. The motion sensor in the shaft chamber just tripped. Probably the mains coming back.',
  keycardTaken: 'That card opens the keycard doors. Shaft 9 is behind one of them.',
  // Only in stations with more than one keycard: said for every card except the last.
  lowerKeycardTaken: 'That card opens some of the doors. Not the way to Shaft 9. There is another card further in.',
  secondSpool: 'That is two. Do not stay in that room.',
  // Said when the Stills wake in a station with more than three spools, where the one in their room need not be your second.
  stillsWake: 'Do not stay in that room.',
  // ---- Quests. A generated station may have none, one or several (09-quests.js says which line goes with
  //      which quest and when). None of these names a number: how many there are is on screen, so one recording
  //      does for every station. docs/voice-lines.md lists the ones still to be recorded. ----
  // Said the first time any generator will not start for want of fuel, Generator 2 or one of the small ones.
  generatorNoFuel: 'Day tank reads empty from here. There will be a fuel can somewhere on your level. Bring it to the generator.',
  generatorsWanted: 'One set will not lift the car. There are more generators on your level, and the winch wants every one of them running before you call the lift. We have marked them for you. They are not quiet.',
  salvageWanted: 'Salvage has put its name on the order too. There are bays down there with their doors shut, the first not far from the lift. Open one, fill it with what is worth carrying, and it seals itself. Then find the next. The terminal keeps count.',
  badgesWanted: 'Personnel wants the badges of Crew 2 back. They will be with whatever the crew left lying about. Bring every one you find. The terminal will count them.',
  valvesWanted: 'One more for the list. The isolation valves on your level have to be shut before we bring you up. I have marked them. Those actuators have not turned in years. They will complain.',
  coresWanted: 'One more thing while you are down there. The lab wants the core samples Crew 2 pulled. Grey tubes. Bring them all.',
  winchBreakerOpen: 'Upload received. But the car is not answering. The winch breaker has tripped. I have marked the panel on your map. Close it.',
  breakerClosed: 'Breaker is in. The car is on its way down. Forty seconds. Get back to the lobby.',
  doorBroken: 'I just lost a door on the board. Those are rated for the whole shaft coming down. Do not count on the ones you have left.',
  allSpools: 'That is all of them. Go back to the lift lobby and upload them.',
  uploadStarted: 'Upload received. The car is on its way down. Forty seconds. It is not a quiet machine.',
  liftArrived: 'The car is at your level. Get in quick.'
};

// TWEAK: when Dispatch speaks. Each entry: something that happens (`when`), the line of RADIO_MESSAGES he says,
// and how many seconds after it. `onlyWithHollow: true` leaves a line out on a threat level with no Hollow.
// `ifSpools: 3` keeps a line for stations with exactly that many survey spools, `unlessSpools: 3` for the others:
// two of the recordings count ("two more", "That is two"), which is only true where there are three.
// What can happen:
//   leftLift, mainsOn, firstSpool, allSpools, keycard (any card), lowerKeycard, lastKeycard,
//   stillsWake      the Stills of a room have woken: a line that goes with that room, whatever you came for
//   enter:NAME      the first time you set foot in a room, by the name on its door: 'enter:PUMP HALL B'
// A line about a quest is not here but with its quest (`tell` in 09-quests.js). Three lines are said from the
// code that does the thing itself: uploadStarted, breakerClosed and liftArrived (the lift), and doorBroken.
const DISPATCH_CUES = [
  { when: 'leftLift', line: 'leftLift', seconds: 3.0 },
  { when: 'firstSpool', line: 'firstSpool', seconds: 1.5, ifSpools: 3 },
  { when: 'firstSpool', line: 'firstSpoolOfMany', seconds: 1.5, unlessSpools: 3 },
  { when: 'stillsWake', line: 'secondSpool', seconds: 1.5, ifSpools: 3 },
  { when: 'stillsWake', line: 'stillsWake', seconds: 1.5, unlessSpools: 3 },
  { when: 'allSpools', line: 'allSpools', seconds: 1.5 },
  { when: 'mainsOn', line: 'generatorStarted', seconds: 4.5 },
  { when: 'mainsOn', line: 'generatorFollowUp', seconds: 11, onlyWithHollow: true },
  { when: 'lastKeycard', line: 'keycardTaken', seconds: 1.5 },
  { when: 'lowerKeycard', line: 'lowerKeycardTaken', seconds: 1.5 }
];

// ---------------------------------------------------------------------------
// Captions: the lines in square brackets at the bottom of the screen.
//
// The "Captions" setting has three levels:
//   off     none of them. You go by your ears.
//   tells   only the ones that say what the Hollow has just done (level 'tell'). This is what a new game starts on.
//   all     every sound that matters as well (level 'sound'), each with an arrow to where it comes from
//           (the arrow pointing up is straight ahead) and "close", "near" or "far". For playing without hearing the game.
// Messages (a locked door, lift control, a hint) and Dispatch's words are not captions and always show.
//
// TWEAK: one line for each caption.
//   text          what it says
//   level         'tell' or 'sound', as above
//   withinMetres  it only shows if what makes the sound is this near to you; 0 means at any distance.
//                 For a sound this is as far as it can be heard: the distance at which it has faded to the
//                 level of the room tone (-48 dB in "npm run audio-check", which measures each one 3 m away).
//                 Make a sound louder in SOUND_LEVELS and it carries further: about 1.25 times as far for each
//                 2 dB it gains. Walls do not stop sound in this game, so they do not stop a caption either.
//   seconds       how long the line stays after the sound was last made
//   slot          captions with the same slot take turns on one line (its voice; its feet; the door it is at)
//   rank          within a slot, a caption with a lower rank waits until one with a higher rank has had its time
// ---------------------------------------------------------------------------
const CAPTIONS = {
  // ---- what the Hollow has just done ----
  hollowFound: { text: '[it has found you]', level: 'tell', withinMetres: 0, seconds: 3.2, slot: 'hollowVoice', rank: 3 },
  hollowLost: { text: '[it has lost you]', level: 'tell', withinMetres: 0, seconds: 3.2, slot: 'hollowVoice', rank: 3 },
  hollowEnraged: { text: '[the beam no longer holds it]', level: 'tell', withinMetres: 0, seconds: 3.2 },
  hollowTurns: { text: '[it turns toward the light]', level: 'tell', withinMetres: 0, seconds: 3.2 },
  hollowMovingOff: { text: '[it is moving off]', level: 'tell', withinMetres: 22, seconds: 3.2 },

  // ---- its voice ----
  hollowGrowl: { text: '[a low, rattling growl]', level: 'sound', withinMetres: 6, seconds: 1.2, slot: 'hollowVoice', rank: 0 },
  hollowGrowlHunting: { text: '[growling, loud and fast]', level: 'sound', withinMetres: 13, seconds: 1.2, slot: 'hollowVoice', rank: 0 },
  hollowShriek: { text: '[it shrieks in the beam]', level: 'sound', withinMetres: 50, seconds: 1.2, slot: 'hollowVoice', rank: 2 },
  hollowRoar: { text: '[it roars]', level: 'sound', withinMetres: 50, seconds: 2.5, slot: 'hollowVoice', rank: 3 },
  hollowSnarl: { text: '[it snarls]', level: 'sound', withinMetres: 60, seconds: 1.8, slot: 'hollowVoice', rank: 2 },
  hollowSniff: { text: '[it sniffs the air]', level: 'sound', withinMetres: 50, seconds: 2, slot: 'hollowVoice', rank: 2 },
  hollowTrill: { text: '[a short, rising trill]', level: 'sound', withinMetres: 23, seconds: 2.5, slot: 'hollowVoice', rank: 2 },

  // ---- where it puts its feet ----
  hollowSteps: { text: '[heavy footsteps]', level: 'sound', withinMetres: 10, seconds: 1.6, slot: 'hollowFeet', rank: 0 },
  hollowStepsHunting: { text: '[heavy footsteps, fast]', level: 'sound', withinMetres: 12, seconds: 1.6, slot: 'hollowFeet', rank: 0 },
  hollowVentSteps: { text: '[sheet metal booms: something is in a vent]', level: 'sound', withinMetres: 12, seconds: 1.6, slot: 'hollowFeet', rank: 0 },
  hollowOverhead: { text: '[something crawls overhead]', level: 'sound', withinMetres: 10, seconds: 1.6, slot: 'hollowFeet', rank: 0 },
  hollowOnGlass: { text: '[glass crunches under something]', level: 'sound', withinMetres: 13, seconds: 3, slot: 'hollowFeet', rank: 1 },
  hollowOnPlate: { text: '[a floor plate clanks under something]', level: 'sound', withinMetres: 13, seconds: 3, slot: 'hollowFeet', rank: 1 },

  // ---- hatches and doors ----
  hatchRattle: { text: '[a ceiling hatch rattles]', level: 'sound', withinMetres: 10, seconds: 1.5, slot: 'hatch', rank: 0 },
  hatchForced: { text: '[a ceiling hatch is forced open]', level: 'sound', withinMetres: 25, seconds: 3.2, slot: 'hatch', rank: 1 },
  hatchBurst: { text: '[a ceiling hatch bursts open]', level: 'sound', withinMetres: 25, seconds: 3.2, slot: 'hatch', rank: 1 },
  doorPounded: { text: '[it is at the door]', level: 'sound', withinMetres: 17, seconds: 1.5, slot: 'doorPounded', rank: 0 },
  doorPoundedAgain: { text: '[it is at the door again]', level: 'sound', withinMetres: 17, seconds: 1.5, slot: 'doorPounded', rank: 0 },
  doorPoundedLast: { text: '[it is at the door again. The door will not hold]', level: 'sound', withinMetres: 17, seconds: 1.5, slot: 'doorPounded', rank: 0 },
  doorBreaks: { text: '[the door gives way]', level: 'sound', withinMetres: 26, seconds: 3.2, slot: 'doorPounded', rank: 1 },
  doorOpens: { text: '[a door opens]', level: 'sound', withinMetres: 26, seconds: 2.2, slot: 'door', rank: 0 },
  doorCloses: { text: '[a door closes]', level: 'sound', withinMetres: 26, seconds: 2.2, slot: 'door', rank: 0 },

  // ---- the Stills and the apparitions ----
  stillShifts: { text: '[something shifts]', level: 'sound', withinMetres: 6, seconds: 2.5 },
  phantomBreath: { text: '[a breath behind you]', level: 'sound', withinMetres: 12, seconds: 3 },

  // ---- the station ----
  ambientDrips: { text: '[water drips]', level: 'sound', withinMetres: 8, seconds: 2.5, slot: 'station', rank: 0 },
  ambientPipe: { text: '[a pipe groans]', level: 'sound', withinMetres: 19, seconds: 3, slot: 'station', rank: 0 },
  ambientMetal: { text: '[metal ticks as it settles]', level: 'sound', withinMetres: 37, seconds: 2.5, slot: 'station', rank: 0 },
  ambientKnocks: { text: '[knocking, far below]', level: 'sound', withinMetres: 13, seconds: 3.5, slot: 'station', rank: 0 },
  salvageBayPing: { text: '[a salvage bay pings]', level: 'sound', withinMetres: 45, seconds: 2.5, slot: 'salvageBay', rank: 0 },
  liftBell: { text: '[the lift bell rings]', level: 'sound', withinMetres: 50, seconds: 2.2 },

  // ---- you ----
  ownGlass: { text: '[glass crunches under your boots]', level: 'sound', withinMetres: 0, seconds: 2.5, slot: 'ownFeet', rank: 0 },
  ownPlate: { text: '[a floor plate clanks under you]', level: 'sound', withinMetres: 0, seconds: 2.5, slot: 'ownFeet', rank: 0 },
  hollowFling: { text: '[something is thrown, hard, out of the dark]', level: 'sound', withinMetres: 30, seconds: 3, slot: 'hollowFeet', rank: 2 },
  ownObjectShatter: { text: '[glass shatters at your feet]', level: 'sound', withinMetres: 0, seconds: 3, slot: 'ownHands', rank: 2 },
  objectShatter: { text: '[glass shatters]', level: 'sound', withinMetres: 30, seconds: 3, slot: 'objects', rank: 2 },
  ownObjectKicked: { text: '[something skitters away from your feet]', level: 'sound', withinMetres: 0, seconds: 2.5, slot: 'ownFeet', rank: 0 },
  scanGrenade: { text: '[a rising whine, and a crack of light]', level: 'sound', withinMetres: 30, seconds: 3, slot: 'objects', rank: 2 },
  hollowStunned: { text: '[it stands frozen in the light]', level: 'tell', withinMetres: 0, seconds: 3.2 },
  ownObjectKnock: { text: '[it knocks against something]', level: 'sound', withinMetres: 0, seconds: 2, slot: 'ownHands', rank: 0 },
  ownObjectCrash: { text: '[it hits hard. That carried]', level: 'sound', withinMetres: 0, seconds: 2.5, slot: 'ownHands', rank: 1 },
  objectKnock: { text: '[something is knocked over]', level: 'sound', withinMetres: 20, seconds: 2.5, slot: 'objects', rank: 0 },
  objectCrash: { text: '[something is sent clattering]', level: 'sound', withinMetres: 28, seconds: 3, slot: 'objects', rank: 1 },
  heartbeat: { text: '[your heart is pounding]', level: 'sound', withinMetres: 0, seconds: 1.5 }
};

// Everything you can read: the three spools, the four notes, and what a spool with nothing on it says.
// Each paragraph is one entry in the list; add or remove paragraphs freely.
const LOG_ENTRIES = {
  // A spool that is not one of Ripley's three. Bigger stations may have one or more. TWEAK: this is a stand-in:
  // write what you like here, or give each extra spool an entry of its own (see getSpoolLog in 11-game.js).
  spoolBlank: {
    heading: 'Survey spool, unlabelled',
    source: 'Crew 2 · no entry',
    paragraphs: [
      'The reel turns and the counter runs. Nothing comes off it but the hiss of tape that was never recorded on.',
      'It is on the manifest all the same.'
    ]
  },
  spool1: {
    heading: 'Survey spool 1 of 3',
    source: 'Crew 2 · A. Ripley, survey lead · day 1',
    paragraphs: [
      'Fixtures are dead on every level, so we scan dark, as usual.',
      'Tomas ran the main corridor twice. The first pass has a cluster by the east door: upright, about 1.9 m tall, a few hundred returns. The second pass does not have it.',
      'We logged it as a moving-object artefact. That label is meant for people who walk through a scan. There are three of us, and all three were standing behind the tripod.'
    ]
  },
  spool2: {
    heading: 'Survey spool 2 of 3',
    source: 'Crew 2 · A. Ripley · day 3',
    paragraphs: [
      'They only move when nothing is scanning them.',
      'I walked backwards to the door with the beam on wide, sweeping across every one of them, and they stayed where they were.',
      'Tomas turned his scanner off to save the battery. I found his scanner.'
    ]
  },
  spool3: {
    heading: 'Survey spool 3 of 3',
    source: 'Crew 2 · A. Ripley · day 4',
    paragraphs: [
      'We aimed the tripod down Shaft 9 to close out the job. Returns stop at forty metres. It is not a floor. Past that depth the pulses go out and do not come back.',
      'On the last pass something at the bottom of the range was standing on the shaft wall, looking up the beam.',
      'I am leaving the spools where the next crew will find them. If that is you: it came up because we showed it the way. Do not call the lift until you are ready to leave. The lift is very loud.'
    ]
  },
  noteSecurity: {
    heading: 'Shift note',
    source: 'H. Marlow, site security · 14 November 1987',
    paragraphs: [
      'Night pump crew reports knocking from Shaft 9 again. I told them it is the water table.',
      // {keycardRoom} becomes the room the card is really in ("the laboratory" in the classic station).
      'They have asked for the deep doors to be kept on the keycard. Fine. The card stays in {keycardRoom}, where Dr. Vance can keep an eye on it.',
      'They have also asked for the calibration dummies in C4 to be covered with sheets. I did not ask why.'
    ]
  },
  noteLocker: {
    heading: 'Note taped inside a locker',
    source: 'Crew 2 · N. Taylor',
    paragraphs: [
      'Dag, if you read this before I see you.',
      'I heard walking in the pump hall. Bare feet, slow, wet. I switched the scanner off and stood still, and it went past me close enough to touch.',
      'It does not see us. I am sure of that now. It listens. Walk, do not run. Crouch if it is close, and stop moving.'
    ]
  },
  noteLab: {
    heading: 'Bench notes',
    source: 'Crew 2 · A. Ripley',
    paragraphs: [
      'The beam does something to it. When I painted it from the lab door it almost stopped, like a man wading through tar.',
      'Then it turned its whole body toward the emitter. I counted four seconds before it stopped being slow.',
      'Light holds it. Light also tells it exactly where you are. Do not hold it longer than you have to.'
    ]
  },
  noteArchive: {
    heading: 'Inventory query',
    source: 'Crew 2 · C. Foster',
    paragraphs: [
      'The inventory for store C4 says nine calibration dummies.',
      'Monday’s cloud has nine. Wednesday’s has nine, but they are not standing where Monday’s stood. Nobody has been in there.',
      'I checked today’s pass twice. Eleven.'
    ]
  }
};

// The one-line goal shown top left.
const OBJECTIVE_TEXT = {
  leaveLift: 'Step out of the lift car.',
  findGenerator: 'Restore mains power. Generator 2 is off Pump Hall B.',
  collectSpools: 'Recover the three survey spools left by Crew 2.',
  collectSpoolsOfMany: 'Recover the {total} survey spools left by Crew 2.', // in a station that has more than three
  returnToLift: 'Return to the lift lobby and upload the spools at the terminal.',
  findFuel: 'Generator 2 has no fuel. Find the fuel can on this level.',
  bringFuel: 'Carry the fuel can to Generator 2, off Pump Hall B.',
  collectCores: 'Dispatch also wants the core samples.',   // added after the spool objective while samples are missing
  // Added while some of the station's generators are not running. {running} and {total} count Generator 2 as well.
  startGenerators: 'The lift winch needs every generator running: {running} of {total} so far. They are marked on the map.',
  fuelForGenerator: 'You are carrying a fuel can. One of the generators has an empty tank.',
  closeBreaker: 'The lift will not come. Close the winch breaker: it is marked on the map.',
  surviveLift: 'The lift is coming. Stay alive until it arrives.',
  boardLift: 'Board the lift.'
};

// The "SIGNAL LOST" screen, one version per thing that can catch you.
const DEATH_TEXT = {
  hollow: {
    title: 'SIGNAL LOST',
    lines: [
      'Scanner 4471-B stopped reporting.',
      'Last frame: one return. Range 0.4 m.'
    ]
  },
  still: {
    title: 'SIGNAL LOST',
    lines: [
      'Scanner 4471-B stopped reporting.',
      'Store C4 inventory, revised: twelve.'
    ]
  }
};
