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
    label: '측량 전용',           // shown on the ending screen
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
    label: '표준',
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
    label: '악몽',
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
  { key: 'hollowEnabled', kind: 'switch', label: '할로우', onText: '전원이 들어오면 나타난다.', offText: '나타나지 않는다.' },
  { key: 'stillsEnabled', kind: 'switch', label: '스틸즈', onText: '아무것도 스캔하지 않을 때 움직인다.', offText: '평범한 마네킹으로 남는다.' },
  { key: 'hollowSpeedFactor', kind: 'percent', label: '할로우 속도', minimum: 0.7, maximum: 1.4, step: 0.05 },
  { key: 'hearingFactor', kind: 'percent', label: '할로우 청각', minimum: 0.5, maximum: 1.6, step: 0.05 },
  { key: 'pressureFactor', kind: 'percent', label: '압박 강도', minimum: 0.5, maximum: 2, step: 0.1 },
  { key: 'angerFactor', kind: 'percent', label: '빔 아래 성질', minimum: 0.5, maximum: 2, step: 0.1 },
  { key: 'heatFactor', kind: 'percent', label: '스캐너 발열', minimum: 0.5, maximum: 2, step: 0.1 },
  { key: 'staminaFactor', kind: 'percent', label: '스태미너', minimum: 0.5, maximum: 2, step: 0.1 },
  { key: 'phantomFactor', kind: 'choice', label: '환영', choices: [[0, '없음'], [0.5, '적게'], [1, '보통'], [2, '많게']] },
  { key: 'checkpointsEnabled', kind: 'switch', label: '체크포인트', onText: '잡히면 마지막 체크포인트부터 다시.', offText: '목숨 하나. 잡히면 처음부터.' }
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
  looseSettleSeconds: 6,            // something that touches the ground and has gone nowhere for this long is at rest, however it rocks or creeps ...
  looseSettleMetres: 0.9,           // ... "nowhere" being within this far of where it was when the count began ...
  looseSettleSpeed: 0.6,            // ... and never faster than this (m/s) in that time
  looseImprintSeconds: 0.7,         // how long points scanned onto a moving or carried object stay. (On one at rest they stay for good.)
  looseMarkerSeconds: 4,            // what a thing is worth floats at it for this long after a pulse last landed on it, once the scanner has read it. Scan it again and it shows again.
  looseMarkerFadeSeconds: 1,        // ... fading out over the last of those
  looseMarkerMetres: 7,             // ... and from no further off than this
  looseMarkersAtOnce: 6,            // no more than this many of them on screen: those nearest to where you look
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
  ventCoverInPlaceChance: 0.5,      // this share of the vents' mouths still have their cover standing in front of them; the others' lie on the floor nearby
  hollowThrowsCoverMetres: 1.2,     // the Hollow, going into a vent or coming out of one, has the cover that stands there in its hands from this near ...
  hollowThrowsCoverSpeed: 8,        // ... and throws it out across the room at this speed over the ground (m/s) ...
  hollowThrowsCoverLift: 2.2,       // ... and this much upwards
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

// Korean names for the rooms, for everything the player reads. ZONE_NAMES itself stays in English: the noisy
// floor, the crawlspace, the phantoms and the salvage bays compare it, so it is logic, not text.
const KO_ZONE_NAMES = {
  'UNSURVEYED': '미측정',
  'LIFT CAR': '리프트 카',
  'LIFT LOBBY': '리프트 로비',
  'MAIN CORRIDOR A': '주 복도 A',
  'SECURITY OFFICE': '보안실',
  'LOCKER ROOM': '탈의실',
  'MESS ROOM': '식당',
  'STORE CLOSET': '비품실',
  'ARCHIVE ACCESS': '기록실 입구',
  'PUMP HALL VESTIBULE': '펌프 홀 현관',
  'PUMP HALL B': '펌프 홀 B',
  'GENERATOR ROOM': '발전실',
  'CONTROL ROOM': '제어실',
  'WEST SERVICE PASSAGE': '서쪽 정비 통로',
  'ARCHIVE': '기록실',
  'LABORATORY': '연구실',
  'COLD ROOM': '냉각실',
  'CALIBRATION STORE C4': '교정 저장고 C4',
  'DEEP CORRIDOR': '심층 복도',
  'SHAFT 9': '샤프트 9',
  'STAIRS': '계단',
  'BOILER HOUSE': '보일러실',
  'WORKSHOP': '작업장',
  'CREW QUARTERS': '크루 숙소',
  'WASHROOM': '세면장',
  'SWITCH ROOM': '개폐실',
  'STORES': '저장고',
  'SUMP 3': '집수조 3',
  'SUMP': '집수조',
  'TELEMETRY': '원격측정실',
  'INFIRMARY': '의무실',
  'PIPE GALLERY': '배관 갤러리',
  'CORE STORE': '코어 저장고',
  'BATTERY ROOM': '배터리실',
  'DRYING ROOM': '건조실',
  'OLD WORKINGS': '옛 굴착 구역',
  'CORRIDOR': '복도',
  'SERVICE DUCT': '정비 덕트',
  'SALVAGE BAY': '인양 베이'
};
const KO_ZONE_PREFIXES = Object.keys(KO_ZONE_NAMES).sort(function (a, b) { return b.length - a.length; });

// The Korean name of a room, for the map, the HUD and the lettering on the walls. A numbered room keeps its
// number: WORKSHOP 2 is 작업장 2, SUMP 4 is 집수조 4. A name nobody knows stays as it is.
function koZoneName(name) {
  if (!name) return '';
  if (KO_ZONE_NAMES[name]) return KO_ZONE_NAMES[name];
  for (const english of KO_ZONE_PREFIXES) {
    if (name.indexOf(english + ' ') === 0) return KO_ZONE_NAMES[english] + name.slice(english.length);
  }
  return name;
}

// The lines that appear one by one on the black screen after "Begin descent".
const INTRO_LINES = [
  'KESSEL-9 펌프 별관',
  '지표 아래 212m. 1987년 봉인.',
  '작업 지시서 4471-B: 크루 2가 남긴 측량 스풀 3개를 회수하라.',
  '조명은 없다. 스캐너만이 볼 수 있는 유일한 수단이다.'
];

// What dispatch says over the radio. When each one plays is decided in 11-game.js.
const RADIO_MESSAGES = {
  // These lines are also read aloud if recorded (docs/voice-lines.md), so they must be true in every station,
  // classic or generated: name rooms, never directions.
  leftLift: '차는 비면 알아서 올라간다. 네 층은 주전원이 죽어 있다. 발전기 2를 찾아 돌려라. 펌프 홀 B 옆에 있다.',
  firstSpool: '하나다. 크루 2가 남긴 게 둘 더 있어. 하나는 교정 저장고, 하나는 샤프트 쪽이야.',
  // The same moment in a station with more than three spools, where "two more" would not be true.
  firstSpoolOfMany: '하나다. 크루 2가 남긴 게 더 있어. 하나는 교정 저장고, 하나는 샤프트 쪽이고, 나머지는 그들이 둔 곳 어딘가야.',
  generatorStarted: '여기서도 부하가 보인다. 이제 전동 문이 열릴 거다.',
  generatorFollowUp: '이상하군. 샤프트실 동작 감지기가 방금 울렸어. 주전원이 돌아오면서 그랬겠지.',
  keycardTaken: '그 카드로 키카드 문을 열 수 있다. 샤프트 9도 그중 하나 뒤에 있어.',
  // Only in stations with more than one keycard: said for every card except the last.
  lowerKeycardTaken: '그 카드는 일부 문만 연다. 샤프트 9로 가는 길은 아니야. 더 안쪽에 카드가 하나 더 있어.',
  secondSpool: '둘이다. 그 방에 머물지 마.',
  // Said when the Stills wake in a station with more than three spools, where the one in their room need not be your second.
  stillsWake: '그 방에 머물지 마.',
  // ---- Quests. A generated station may have none, one or several (09-quests.js says which line goes with
  //      which quest and when). None of these names a number: how many there are is on screen, so one recording
  //      does for every station. docs/voice-lines.md lists the ones still to be recorded. ----
  // Said the first time any generator will not start for want of fuel, Generator 2 or one of the small ones.
  generatorNoFuel: '여기서 보기에 데이 탱크가 비었어. 네 층 어딘가에 연료통이 있을 거다. 발전기로 가져가.',
  generatorsWanted: '발전기 하나로는 차를 올릴 수 없다. 네 층에 발전기가 더 있고, 리프트를 부르려면 윈치에 전부 돌아가고 있어야 해. 표시해 뒀다. 조용한 것들이 아니야.',
  salvageWanted: '이번 지시는 인양팀 거다. 아래에 문 닫힌 베이들이 있어. 첫 번째는 리프트에서 멀지 않아. 하나를 열고 들고 나올 가치가 있는 걸 채우면 저절로 밀봉된다. 그다음 다음 베이를 찾아. 단말기가 세고 있어.',
  badgesWanted: '인사팀에서 크루 2의 배지를 돌려달란다. 크루가 두고 간 물건들 사이에 있을 거야. 찾는 족족 가져와. 단말기가 세어 줄 거다.',
  valvesWanted: '목록에 하나 더. 너를 올려 보내기 전에 네 층의 차단 밸브를 전부 잠가야 한다. 표시해 뒀어. 그 액추에이터들은 몇 년을 안 돌아간 것들이야. 소리 좀 낼 거다.',
  coresWanted: '내려가 있는 김에 하나 더. 연구소에서 크루 2가 뽑은 코어 시료를 원해. 회색 튜브들이야. 전부 가져와.',
  winchBreakerOpen: '업로드 받았다. 그런데 차가 응답하지 않아. 윈치 차단기가 내려갔어. 지도에 판넬을 표시했다. 올려라.',
  breakerClosed: '차단기 들어왔다. 차가 내려가는 중이야. 40초. 로비로 돌아가.',
  doorBroken: '보드에서 문 하나를 잃었어. 샤프트가 통째로 내려앉아도 버티는 등급인데. 남은 문들도 믿지 마.',
  allSpools: '전부다. 리프트 로비로 돌아가서 업로드해.',
  uploadStarted: '업로드 받았다. 차가 내려가는 중이야. 40초. 조용한 기계가 아니야.',
  liftArrived: '차가 네 층에 도착했다. 빨리 타.',
  // Said instead of uploadStarted and breakerClosed in a station where the car never went back up (no wait for
  // the lift: `liftWait` of QUEST_COMPLICATIONS in 09-quests.js). The key is the other line's, with CarWaiting.
  uploadStartedCarWaiting: '업로드 받았다. 차는 네 층을 떠난 적이 없어. 문이 열린다. 타.',
  breakerClosedCarWaiting: '차단기 들어왔다. 차는 네 층을 떠난 적이 없어. 문이 열린다. 로비로 돌아가.',
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
// code that does the thing itself: uploadStarted, breakerClosed and liftArrived (the lift, and their CarWaiting
// forms where there is no wait for it), and doorBroken.
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
  hollowFound: { text: '[그것이 너를 찾아냈다]', level: 'tell', withinMetres: 0, seconds: 3.2, slot: 'hollowVoice', rank: 3 },
  hollowLost: { text: '[그것이 너를 놓쳤다]', level: 'tell', withinMetres: 0, seconds: 3.2, slot: 'hollowVoice', rank: 3 },
  hollowEnraged: { text: '[빔이 더는 그것을 붙잡지 못한다]', level: 'tell', withinMetres: 0, seconds: 3.2 },
  hollowTurns: { text: '[그것이 빛 쪽으로 돌아선다]', level: 'tell', withinMetres: 0, seconds: 3.2 },
  hollowMovingOff: { text: '[그것이 멀어진다]', level: 'tell', withinMetres: 22, seconds: 3.2 },

  // ---- its voice ----
  hollowGrowl: { text: '[낮고 덜컹거리는 으르렁거림]', level: 'sound', withinMetres: 6, seconds: 1.2, slot: 'hollowVoice', rank: 0 },
  hollowGrowlHunting: { text: '[크고 빠른 으르렁거림]', level: 'sound', withinMetres: 13, seconds: 1.2, slot: 'hollowVoice', rank: 0 },
  hollowShriek: { text: '[빔 속에서 그것이 비명을 지른다]', level: 'sound', withinMetres: 50, seconds: 1.2, slot: 'hollowVoice', rank: 2 },
  hollowRoar: { text: '[그것이 포효한다]', level: 'sound', withinMetres: 50, seconds: 2.5, slot: 'hollowVoice', rank: 3 },
  hollowSnarl: { text: '[그것이 이빨을 드러내며 으른다]', level: 'sound', withinMetres: 60, seconds: 1.8, slot: 'hollowVoice', rank: 2 },
  hollowSniff: { text: '[그것이 공기 냄새를 맡는다]', level: 'sound', withinMetres: 50, seconds: 2, slot: 'hollowVoice', rank: 2 },
  hollowTrill: { text: '[짧게 올라가는 트릴]', level: 'sound', withinMetres: 23, seconds: 2.5, slot: 'hollowVoice', rank: 2 },

  // ---- where it puts its feet ----
  hollowSteps: { text: '[무거운 발소리]', level: 'sound', withinMetres: 10, seconds: 1.6, slot: 'hollowFeet', rank: 0 },
  hollowStepsHunting: { text: '[무겁고 빠른 발소리]', level: 'sound', withinMetres: 12, seconds: 1.6, slot: 'hollowFeet', rank: 0 },
  hollowVentSteps: { text: '[철판이 울린다: 환기구 안에 무언가 있다]', level: 'sound', withinMetres: 12, seconds: 1.6, slot: 'hollowFeet', rank: 0 },
  hollowOverhead: { text: '[무언가가 머리 위를 기어간다]', level: 'sound', withinMetres: 10, seconds: 1.6, slot: 'hollowFeet', rank: 0 },
  hollowOnGlass: { text: '[무언가 아래서 유리가 바스러진다]', level: 'sound', withinMetres: 13, seconds: 3, slot: 'hollowFeet', rank: 1 },
  hollowOnPlate: { text: '[무언가 아래서 바닥판이 쨍그랑거린다]', level: 'sound', withinMetres: 13, seconds: 3, slot: 'hollowFeet', rank: 1 },

  // ---- hatches and doors ----
  hatchRattle: { text: '[천장 해치가 덜거덕거린다]', level: 'sound', withinMetres: 10, seconds: 1.5, slot: 'hatch', rank: 0 },
  hatchForced: { text: '[천장 해치가 억지로 열린다]', level: 'sound', withinMetres: 25, seconds: 3.2, slot: 'hatch', rank: 1 },
  hatchBurst: { text: '[천장 해치가 벌컥 열린다]', level: 'sound', withinMetres: 25, seconds: 3.2, slot: 'hatch', rank: 1 },
  doorPounded: { text: '[그것이 문에 와 있다]', level: 'sound', withinMetres: 17, seconds: 1.5, slot: 'doorPounded', rank: 0 },
  doorPoundedAgain: { text: '[그것이 또 문에 와 있다]', level: 'sound', withinMetres: 17, seconds: 1.5, slot: 'doorPounded', rank: 0 },
  doorPoundedLast: { text: '[그것이 또 문에 와 있다. 문이 버티지 못한다]', level: 'sound', withinMetres: 17, seconds: 1.5, slot: 'doorPounded', rank: 0 },
  doorBreaks: { text: '[문이 무너진다]', level: 'sound', withinMetres: 26, seconds: 3.2, slot: 'doorPounded', rank: 1 },
  doorOpens: { text: '[문이 열린다]', level: 'sound', withinMetres: 26, seconds: 2.2, slot: 'door', rank: 0 },
  doorCloses: { text: '[문이 닫힌다]', level: 'sound', withinMetres: 26, seconds: 2.2, slot: 'door', rank: 0 },

  // ---- the Stills and the apparitions ----
  stillShifts: { text: '[무언가가 움직인다]', level: 'sound', withinMetres: 6, seconds: 2.5 },
  phantomBreath: { text: '[등 뒤의 숨소리]', level: 'sound', withinMetres: 12, seconds: 3 },

  // ---- the station ----
  ambientDrips: { text: '[물이 떨어진다]', level: 'sound', withinMetres: 8, seconds: 2.5, slot: 'station', rank: 0 },
  ambientPipe: { text: '[배관이 신음한다]', level: 'sound', withinMetres: 19, seconds: 3, slot: 'station', rank: 0 },
  ambientMetal: { text: '[금속이 가라앉으며 딱딱거린다]', level: 'sound', withinMetres: 37, seconds: 2.5, slot: 'station', rank: 0 },
  ambientKnocks: { text: '[노크 소리, 아주 아래에서]', level: 'sound', withinMetres: 13, seconds: 3.5, slot: 'station', rank: 0 },
  salvageBayPing: { text: '[인양 베이가 핑을 울린다]', level: 'sound', withinMetres: 45, seconds: 2.5, slot: 'salvageBay', rank: 0 },
  liftBell: { text: '[리프트 벨이 울린다]', level: 'sound', withinMetres: 50, seconds: 2.2 },

  // ---- you ----
  ownGlass: { text: '[장화 아래서 유리가 바스러진다]', level: 'sound', withinMetres: 0, seconds: 2.5, slot: 'ownFeet', rank: 0 },
  ownPlate: { text: '[네 발밑에서 바닥판이 쨍그랑거린다]', level: 'sound', withinMetres: 0, seconds: 2.5, slot: 'ownFeet', rank: 0 },
  hollowFling: { text: '[어둠 속에서 무언가가 세게 던져졌다]', level: 'sound', withinMetres: 30, seconds: 3, slot: 'hollowFeet', rank: 2 },
  ownObjectShatter: { text: '[네 발밑에서 유리가 깨진다]', level: 'sound', withinMetres: 0, seconds: 3, slot: 'ownHands', rank: 2 },
  objectShatter: { text: '[유리가 깨진다]', level: 'sound', withinMetres: 30, seconds: 3, slot: 'objects', rank: 2 },
  ownObjectBreak: { text: '[네 발밑에서 무언가가 부서진다]', level: 'sound', withinMetres: 0, seconds: 3, slot: 'ownHands', rank: 2 },
  objectBreak: { text: '[무언가가 부서진다]', level: 'sound', withinMetres: 30, seconds: 3, slot: 'objects', rank: 2 },
  ownObjectKicked: { text: '[무언가가 발밑에서 달아난다]', level: 'sound', withinMetres: 0, seconds: 2.5, slot: 'ownFeet', rank: 0 },
  scanGrenade: { text: '[올라가는 굉음, 그리고 한줄기 빛]', level: 'sound', withinMetres: 30, seconds: 3, slot: 'objects', rank: 2 },
  hollowStunned: { text: '[그것이 빛 속에 얼어붙어 서 있다]', level: 'tell', withinMetres: 0, seconds: 3.2 },
  ownObjectKnock: { text: '[그것이 무언가에 부딪힌다]', level: 'sound', withinMetres: 0, seconds: 2, slot: 'ownHands', rank: 0 },
  ownObjectCrash: { text: '[세게 부딪혔다. 소리가 퍼졌다]', level: 'sound', withinMetres: 0, seconds: 2.5, slot: 'ownHands', rank: 1 },
  objectKnock: { text: '[무언가가 넘어진다]', level: 'sound', withinMetres: 20, seconds: 2.5, slot: 'objects', rank: 0 },
  objectCrash: { text: '[무언가가 덜컹거리며 날아간다]', level: 'sound', withinMetres: 28, seconds: 3, slot: 'objects', rank: 1 },
  heartbeat: { text: '[심장이 요동친다]', level: 'sound', withinMetres: 0, seconds: 1.5 }
};

// Everything you can read: the three spools, the four notes, and what a spool with nothing on it says.
// Each paragraph is one entry in the list; add or remove paragraphs freely.
const LOG_ENTRIES = {
  // A spool that is not one of Ripley's three. Bigger stations may have one or more. TWEAK: this is a stand-in:
  // write what you like here, or give each extra spool an entry of its own (see getSpoolLog in 11-game.js).
  spoolBlank: {
    heading: '표지 없는 측량 스풀',
    source: '크루 2 · 기록 없음',
    paragraphs: [
      '릴이 돌고 카운터가 오른다. 녹음된 적 없는 테이프의 잡음만 나온다.',
      '그래도 목록에는 실려 있다.'
    ]
  },
  spool1: {
    heading: '측량 스풀 1/3',
    source: '크루 2 · 측량 리더 A. 리플리 · 1일차',
    paragraphs: [
      '설비는 모든 층에서 죽어 있다. 그러니 늘 그랬듯 어둠 속에서 스캔한다.',
      '토마스가 주 복도를 두 번 스캔했다. 첫 패스에는 동쪽 문 옆에 덩어리가 있었다. 직립, 약 1.9m, 반사점 수백 개. 두 번째 패스에는 없다.',
      '이동 물체 아티팩트로 기록했다. 그 딱지는 스캔 안을 걸어 지나가는 사람에게나 붙이는 거다. 우리는 셋뿐이고, 셋 모두 삼각대 뒤에 서 있었다.'
    ]
  },
  spool2: {
    heading: '측량 스풀 2/3',
    source: '크루 2 · A. 리플리 · 3일차',
    paragraphs: [
      '그것들은 아무것도 스캔하지 않을 때만 움직인다.',
      '빔을 넓혀 전부를 쓸면서 문까지 뒷걸음질 쳤고, 그것들은 제자리에 있었다.',
      '토마스는 배터리를 아끼겠다며 스캐너를 껐다. 나는 토마스의 스캐너를 찾았다.'
    ]
  },
  spool3: {
    heading: '측량 스풀 3/3',
    source: '크루 2 · A. 리플리 · 4일차',
    paragraphs: [
      '작업을 끝내려고 삼각대를 샤프트 9 아래로 향했다. 반사가 40m에서 끊긴다. 바닥이 아니다. 그 아래로는 펄스가 나가기만 하고 돌아오지 않는다.',
      '마지막 패스에서, 사정거리 끝의 무언가가 샤프트 벽에 서서 빔을 올려다보고 있었다.',
      '스풀은 다음 크루가 찾을 곳에 두고 간다. 이걸 읽는 게 너라면: 그것은 우리가 길을 보여줬기 때문에 올라왔다. 떠날 준비가 되기 전에는 리프트를 부르지 마라. 리프트는 아주 시끄럽다.'
    ]
  },
  noteSecurity: {
    heading: '교대조 쪽지',
    source: '현장 보안 H. 말로 · 1987년 11월 14일',
    paragraphs: [
      '야간 펌프조가 샤프트 9의 노크 소리를 또 보고했다. 수위 때문이라고 일러뒀다.',
      // {keycardRoom} becomes the room the card is really in ("연구실" in the classic station).
      '심층 구역 문을 키카드로 유지해 달란다. 알았다. 카드는 {keycardRoom}에 둔다. 밴스 박사가 지켜볼 수 있는 곳이다.',
      'C4의 교정 마네킹들을 천으로 덮어 달라는 요청도 있었다. 이유는 묻지 않았다.'
    ]
  },
  noteLocker: {
    heading: '록커 안쪽에 붙은 쪽지',
    source: '크루 2 · N. 테일러',
    paragraphs: [
      '다그, 네가 나를 보기 전에 이걸 읽는다면.',
      '펌프 홀에서 걷는 소리를 들었다. 맨발이었고, 느렸고, 축축했다. 스캐너를 끄고 가만히 서 있었더니 닿을 만큼 가까이 지나갔다.',
      '그것은 우리를 보지 못한다. 이제는 확신한다. 그것은 듣는다. 뛰지 말고 걸어라. 가까우면 웅크리고, 움직임을 멈춰라.'
    ]
  },
  noteLab: {
    heading: '작업대 노트',
    source: '크루 2 · A. 리플리',
    paragraphs: [
      '빔은 그것에게 무언가를 한다. 연구실 문에서 빔을 쐈을 때 그것은 거의 멈췄다. 타르를 헤치는 사람처럼.',
      '그다음 몸 전체를 방출기 쪽으로 돌렸다. 느려진 게 풀리기까지 4초를 셌다.',
      '빛은 그것을 붙잡는다. 빛은 또한 네가 어디 있는지 정확히 알려 준다. 필요 이상으로 오래 비추지 마라.'
    ]
  },
  noteArchive: {
    heading: '재고 조회',
    source: '크루 2 · C. 포스터',
    paragraphs: [
      '저장고 C4의 재고 목록에는 교정 마네킹이 아홉이다.',
      '월요일 클라우드에는 아홉. 수요일에도 아홉인데, 서 있는 자리가 월요일과 다르다. 아무도 들어간 적이 없다.',
      '오늘 패스를 두 번 확인했다. 열하나.'
    ]
  }
};

// The one-line goal shown top left.
const OBJECTIVE_TEXT = {
  leaveLift: '리프트 카에서 내린다.',
  findGenerator: '주전원을 복구한다. 발전기 2는 펌프 홀 B 옆에 있다.',
  collectSpools: '크루 2가 남긴 측량 스풀 3개를 회수한다.',
  collectSpoolsOfMany: '크루 2가 남긴 측량 스풀 {total}개를 회수한다.', // in a station that has more than three
  returnToLift: '리프트 로비로 돌아가 단말기에서 스풀을 업로드한다.',
  returnToLiftWithManifest: '작업 지시는 끝났다. 리프트 로비로 돌아가 단말기에서 리프트를 부른다.', // on an order that is not about spools
  findFuel: '발전기 2에 연료가 없다. 이 층에서 연료통을 찾는다.',
  bringFuel: '연료통을 펌프 홀 B 옆 발전기 2로 가져간다.',
  collectCores: '디스패치가 코어 시료도 원한다.',   // added after the spool objective while samples are missing
  // Added while some of the station's generators are not running. {running} and {total} count Generator 2 as well.
  startGenerators: '리프트 윈치에는 모든 발전기가 필요하다: 현재 {running}/{total}. 지도에 표시돼 있다.',
  fuelForGenerator: '연료통을 들고 있다. 발전기 하나의 탱크가 비어 있다.',
  closeBreaker: '리프트가 오지 않는다. 윈치 차단기를 올린다: 지도에 표시돼 있다.',
  surviveLift: '리프트가 오고 있다. 도착할 때까지 살아남는다.',
  boardLift: '리프트에 탄다.'
};

// The "SIGNAL LOST" screen, one version per thing that can catch you.
const DEATH_TEXT = {
  hollow: {
    title: '신호 끊김',
    lines: [
      '스캐너 4471-B의 보고가 끊겼다.',
      '마지막 프레임: 반사점 하나. 거리 0.4m.'
    ]
  },
  still: {
    title: '신호 끊김',
    lines: [
      '스캐너 4471-B의 보고가 끊겼다.',
      '저장고 C4 재고, 수정: 열둘.'
    ]
  }
};
