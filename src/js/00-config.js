// ---------------------------------------------------------------------------
// NO RETURN - configuration, tuning values and all story text
//
// This is the file to open when you want the game to FEEL different.
// Change a number, run `npm run build`, reload index.html.
// Most numbers in TUNING can also be changed while the game is running:
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
    heatFactor: 0.7             // multiplies how fast the scanner heats up (painting and sweeps).
                                // Below 1 you can scan for longer before overheating, above 1 for less long.
                                // It does not change how fast the scanner cools down.
  },
  standard: {
    key: 'standard',
    label: 'Standard',
    hollowEnabled: true,
    stillsEnabled: true,
    hollowSpeedFactor: 1.0,
    hearingFactor: 0.8,         // it hears 20 % less far than the numbers in TUNING: a sprint step carries 11.2 m, not 14 m
    heatFactor: 1.0
  },
  nightmare: {
    key: 'nightmare',
    label: 'Nightmare',
    hollowEnabled: true,
    stillsEnabled: true,
    hollowSpeedFactor: 1.14,    // 14 % faster: its hunt speed goes from 3.5 to about 4.0 (you sprint at 4.6)
    hearingFactor: 1.15,        // hears 15 % further than TUNING says: a sprint step carries 16.1 m (11.2 m on Standard)
    heatFactor: 1.3             // about 7.7 s of continuous painting before overheating instead of 10 s
  }
};

// The "Point budget" choice on the title screen. These only affect looks and performance.
const QUALITY_PRESETS = {
  // maximumPoints: how many points are remembered. When full, the oldest are overwritten,
  //                so a low number means rooms you scanned long ago fade from view sooner.
  // raysPerSecond: pulses fired per second while painting. Higher fills surfaces in faster.
  // sweepRays:     pulses fired by one full sweep.
  // renderScale:   1.0 draws at full screen resolution, 0.75 draws smaller and stretches (faster, softer).
  low: { key: 'low', maximumPoints: 250000, raysPerSecond: 5000, sweepRays: 14000, renderScale: 0.75 },
  medium: { key: 'medium', maximumPoints: 500000, raysPerSecond: 8000, sweepRays: 26000, renderScale: 1.0 },
  high: { key: 'high', maximumPoints: 1000000, raysPerSecond: 11000, sweepRays: 40000, renderScale: 1.0 }
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
  scannerMaximumRange: 60,      // pulses that travel further than this report NO RETURN
  scannerSpreadMinimumDegrees: 3,   // narrowest beam (mouse wheel down). Half-angle of the cone.
  scannerSpreadMaximumDegrees: 26,  // widest beam (mouse wheel up)
  scannerSpreadDefaultDegrees: 11,
  // Heat runs from 0 (cold) to 1 (overheated). The HUD bar shows it.
  heatPerSecondWhilePainting: 0.1,  // 0.1 = ten seconds of continuous painting from cold to overheated
  heatCoolingPerSecond: 0.2,        // 0.2 = five seconds from overheated back to cold when not scanning
  overheatRecoveryLevel: 0.4,       // after overheating, the scanner stays locked until heat drops to this
  sweepDurationSeconds: 2.4,        // how long one full sweep takes. You walk at half speed during it.
  sweepHeatCost: 0.28,              // heat added by one sweep. Sweeps are refused above 0.78 heat.
  sweepHalfWidthDegrees: 52,        // how far left and right of centre a sweep reaches
  sweepHalfHeightDegrees: 36,       // how far above and below centre a sweep reaches

  // ---- Noise you make ------------------------------------------------------
  // Each of these is a one-off sound. If the Hollow is within this many metres it hears it
  // and walks over to investigate. If it is within 30 % of the distance it starts hunting at once.
  // Bigger numbers make the Hollow find you more often. All are multiplied by hearingFactor.
  noiseRadiusWalkStep: 4,
  noiseRadiusSprintStep: 14,
  noiseRadiusCrouchStep: 1.2,
  noiseRadiusScannerHum: 4,     // emitted twice a second while painting
  noiseRadiusSweep: 22,
  noiseRadiusDoor: 8,           // a door you open (doors the Hollow opens do not count)
  noiseRadiusPickup: 4,
  waterStepNoiseFactor: 1.5,    // footsteps in water carry this much further

  // ---- How close the Hollow must be to notice you without any sound event --
  // Think of it as the sound of your breathing and clothes. It also needs a clear straight
  // walking line to you (or to be within 1.6 m). Also multiplied by hearingFactor.
  audibleRadiusSprinting: 7.5,
  audibleRadiusWalking: 4.2,
  audibleRadiusStanding: 2.6,
  audibleRadiusCrouchWalking: 2.0,
  audibleRadiusCrouchedStill: 1.15, // the "hold your breath" distance. Below hollowKillDistance would make hiding perfect.
  waterAudibleFactor: 1.3,          // moving through water makes all of the above this much larger

  // ---- The Hollow ----------------------------------------------------------
  hollowRoamSpeed: 1.3,             // wandering between rooms, not aware of you
  hollowInvestigateSpeed: 2.5,      // walking to a noise it heard
  hollowHuntSpeed: 3.5,             // it knows where you are. Faster than your walk, slower than your sprint.
  hollowEnragedSpeed: 5.3,          // after being held in the beam too long. Faster than your sprint on purpose.
  hollowSpeedBonusWithAllSpools: 1.1, // speed multiplier once you carry all three spools (the walk back is harder)
  hollowHeldSpeedFactor: 0.1,       // speed multiplier while the beam is on it. 0 freezes it, 1 means the beam does nothing.
  hollowBeamHitsToNotice: 2,        // pulses that must land on it in one frame before it counts as "in the beam"
  hollowKillDistance: 0.4,          // closer than this and it has you
  hollowRageLimitSeconds: 4.2,      // seconds in the beam before it becomes enraged. Higher makes the beam a stronger tool.
  hollowRageCoolingPerSecond: 0.45, // how fast that timer runs back down while the beam is off it
  hollowEnragedDurationSeconds: 4.0, // how long it stays enraged (ignores the beam, uses hollowEnragedSpeed)
  hollowMemorySeconds: 5.0,         // after losing track of you it keeps heading for where it last sensed you this long
  hollowSearchSeconds: 8.0,         // then it pokes around that area this long before giving up
  hollowPressureAfterSeconds: 55,   // if it has not hunted you for this long, its wandering drifts toward you.
                                    // Lower means fewer quiet stretches. Very high means you may rarely meet it.
  hollowWakeDelaySeconds: 6,        // seconds between starting the generator and the Hollow appearing at the shaft
  hollowImprintSeconds: 5.5,        // how long the red points a scan leaves on it stay visible (maximum 63)

  // ---- The Stills (calibration dummies) ------------------------------------
  stillSpeed: 1.8,                  // walking speed while nothing is scanning them. Your walk is 2.5.
  stillObservedHoldSeconds: 1.1,    // a dummy stays frozen this long after the last pulse that touched it.
                                    // Higher lets you look away for longer.
  stillKillDistance: 0.65,
  stillImprintSeconds: 22,          // how long the points a scan leaves on a dummy stay visible (maximum 63).
                                    // Long imprints mean old outlines linger and the room looks more crowded than it is.

  // ---- Apparitions ---------------------------------------------------------
  phantomImprintSeconds: 7.5,       // how long the points of a figure that "was never there" stay visible

  // ---- The lift ------------------------------------------------------------
  liftArrivalSeconds: 40,           // how long you must survive after uploading the spools
  liftArrivalSecondsWithoutHollow: 12 // the same wait on "Survey only", where nothing is coming
};

// Names shown under the minimap and on the full map. The order must match the ZONE_ numbers in 02-world.js.
const ZONE_NAMES = [
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

// The lines that appear one by one on the black screen after "Begin descent".
const INTRO_LINES = [
  'KESSEL-9 PUMPING ANNEX',
  '212 m below grade. Sealed 1987.',
  'Work order 4471-B: recover three survey spools left by Crew 2.',
  'There is no lighting. The scanner is the only way to see.'
];

// What dispatch says over the radio. When each one plays is decided in 11-game.js.
const RADIO_MESSAGES = {
  leftLift: 'The car goes back up on its own when it is empty. Mains is dead on your level. The generator is in Pump Hall B, east end of the main corridor.',
  firstSpool: 'That is one. Crew 2 logged two more: one in the calibration store, one at the shaft.',
  generatorStarted: 'We see the load up here. Powered doors should answer now.',
  generatorFollowUp: 'Odd. The motion sensor in the shaft chamber just tripped. Probably the mains coming back.',
  keycardTaken: 'That card opens the deep corridor. East side of the archive.',
  secondSpool: 'Two. Do not stay in that room.',
  allSpools: 'That is all three. Go back to the lift lobby and upload them.',
  uploadStarted: 'Upload received. The car is on its way down. Forty seconds. It is not a quiet machine.',
  liftArrived: 'The car is at your level. Get in.'
};

// Everything you can read: the three spools and the four notes.
// Each paragraph is one entry in the list; add or remove paragraphs freely.
const LOG_ENTRIES = {
  spool1: {
    heading: 'Survey spool 1 of 3',
    source: 'Crew 2 · I. Okafor, survey lead · day 1',
    paragraphs: [
      'Fixtures are dead on every level, so we scan dark, as usual.',
      'Tomas ran the main corridor twice. The first pass has a cluster by the east door: upright, about 1.9 m tall, a few hundred returns. The second pass does not have it.',
      'We logged it as a moving-object artefact. That label is meant for people who walk through a scan. There are three of us, and all three were standing behind the tripod.'
    ]
  },
  spool2: {
    heading: 'Survey spool 2 of 3',
    source: 'Crew 2 · I. Okafor · day 3',
    paragraphs: [
      'They only move when nothing is scanning them.',
      'I walked backwards to the door with the beam on wide, sweeping across every one of them, and they stayed where they were.',
      'Tomas turned his scanner off to save the battery. I found his scanner.'
    ]
  },
  spool3: {
    heading: 'Survey spool 3 of 3',
    source: 'Crew 2 · I. Okafor · day 4',
    paragraphs: [
      'We aimed the tripod down Shaft 9 to close out the job. Returns stop at forty metres. It is not a floor. Past that depth the pulses go out and do not come back.',
      'On the last pass something at the bottom of the range was standing on the shaft wall, looking up the beam.',
      'I am leaving the spools where the next crew will find them. If that is you: it came up because we showed it the way. Do not call the lift until you are ready to leave. The lift is very loud.'
    ]
  },
  noteSecurity: {
    heading: 'Shift note',
    source: 'R. Halloran, site security · 14 November 1987',
    paragraphs: [
      'Night pump crew reports knocking from Shaft 9 again. I told them it is the water table.',
      'They have asked for the deep corridor door to be kept on the keycard. Fine. The card stays in the laboratory with Dr. Vance.',
      'They have also asked for the calibration dummies in C4 to be covered with sheets. I did not ask why.'
    ]
  },
  noteLocker: {
    heading: 'Note taped inside a locker',
    source: 'Crew 2 · T. Rehn',
    paragraphs: [
      'Dag, if you read this before I see you.',
      'I heard walking in the pump hall. Bare feet, slow, wet. I switched the scanner off and stood still, and it went past me close enough to touch.',
      'It does not see us. I am sure of that now. It listens. Walk, do not run. Crouch if it is close, and stop moving.'
    ]
  },
  noteLab: {
    heading: 'Bench notes',
    source: 'Crew 2 · I. Okafor',
    paragraphs: [
      'The beam does something to it. When I painted it from the lab door it almost stopped, like a man wading through tar.',
      'Then it turned its whole body toward the emitter. I counted four seconds before it stopped being slow.',
      'Light holds it. Light also tells it exactly where you are. Do not hold it longer than you have to.'
    ]
  },
  noteArchive: {
    heading: 'Inventory query',
    source: 'Crew 2 · D. Brandt',
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
  findGenerator: 'Restore mains power. Generator: Pump Hall B, east.',
  collectSpools: 'Recover the three survey spools left by Crew 2.',
  returnToLift: 'Return to the lift lobby and upload the spools at the terminal.',
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
