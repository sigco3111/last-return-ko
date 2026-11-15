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
    angerFactor: 1.0,
    staminaFactor: 1.0,
    phantomFactor: 1.0,
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
  low: { key: 'low', maximumPoints: 250000, raysPerSecond: 6000, sweepRays: 20000, renderScale: 0.75 },
  medium: { key: 'medium', maximumPoints: 500000, raysPerSecond: 6000, sweepRays: 20000, renderScale: 0.8 },
  high: { key: 'high', maximumPoints: 1000000, raysPerSecond: 6000, sweepRays: 20000, renderScale: 1.0 },
  ultra: { key: 'ultra', maximumPoints: 2000000, raysPerSecond: 6000, sweepRays: 20000, renderScale: 1.0 },
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
  hollowSpeedBonusWithAllSpools: 1.1, // speed multiplier once you carry all three spools (the walk back is harder)
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
  hollowCrawlFixedSteps: 14,          // how unwilling it is to use the crawlspace at all: going up and coming down count
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
  hollowBaseStoop: 0.3,             // how bent it always is, from 0 (as upright as its hunch allows) to 1 (folded right over).
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
  hollowAngerPerBeamSecond: 0.3,   // anger gained per second in the beam. 0.24 = about 4.2 s from calm to enraged.
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
  hollowDoubleBackChance: 0.4,      // chance that, after giving up a search, it walks off and then returns to the
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
  stillObservedHoldSeconds: 1.3,    // a dummy stays frozen this long after the last pulse that touched it.
                                    // Higher lets you look away for longer.
  stillKillDistance: 0.6,
  stillImprintSeconds: 22,          // how long the points a scan leaves on a dummy stay visible (maximum 63).
                                    // Long imprints mean old outlines linger and the room looks more crowded than it is.

  // ---- Apparitions ---------------------------------------------------------
  phantomImprintSeconds: 4,       // how long the points of a figure that "was never there" stay visible
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
  generatorStarted: 'We see the load up here. Powered doors should answer now.',
  generatorFollowUp: 'Odd. The motion sensor in the shaft chamber just tripped. Probably the mains coming back.',
  keycardTaken: 'That card opens the keycard doors. Shaft 9 is behind one of them.',
  // Only in stations with more than one keycard: said for every card except the last.
  lowerKeycardTaken: 'That card opens some of the doors. Not the way to Shaft 9. There is another card further in.',
  secondSpool: 'That is two. Do not stay in that room.',
  // ---- Extra jobs. A generated station may have none, one or several of these (see "mission" in 03-levelgen.js).
  //      They are new, so they have no recordings yet: docs/voice-lines.md lists them. ----
  generatorNoFuel: 'Day tank reads empty from here. There will be a fuel can somewhere on your level. Bring it to Generator 2.',
  coresWanted: 'One more thing while you are down there. The lab wants the core samples Crew 2 pulled. Grey tubes. Bring them all.',
  winchBreakerOpen: 'Upload received. But the car is not answering. The winch breaker has tripped. I have marked the panel on your map. Close it.',
  breakerClosed: 'Breaker is in. The car is on its way down. Forty seconds. Get back to the lobby.',
  doorBroken: 'I just lost a door on the board. Those are rated for the whole shaft coming down. Do not count on the ones you have left.',
  allSpools: 'That is all three. Go back to the lift lobby and upload them.',
  uploadStarted: 'Upload received. The car is on its way down. Forty seconds. It is not a quiet machine.',
  liftArrived: 'The car is at your level. Get in quick.'
};

// Everything you can read: the three spools and the four notes.
// Each paragraph is one entry in the list; add or remove paragraphs freely.
const LOG_ENTRIES = {
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
  returnToLift: 'Return to the lift lobby and upload the spools at the terminal.',
  findFuel: 'Generator 2 has no fuel. Find the fuel can on this level.',
  bringFuel: 'Carry the fuel can to Generator 2, off Pump Hall B.',
  collectCores: 'Dispatch also wants the core samples.',   // added after the spool objective while samples are missing
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
