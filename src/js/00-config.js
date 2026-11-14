// ---------------------------------------------------------------------------
// NO RETURN - configuration, tuning values and all story text
// ---------------------------------------------------------------------------

const DIFFICULTY_PRESETS = {
  survey: {
    key: 'survey',
    label: 'Survey only',
    hollowEnabled: false,
    stillsEnabled: false,
    hollowSpeedFactor: 1.0,
    hearingFactor: 1.0,
    heatFactor: 0.7
  },
  standard: {
    key: 'standard',
    label: 'Standard',
    hollowEnabled: true,
    stillsEnabled: true,
    hollowSpeedFactor: 1.0,
    hearingFactor: 1.0,
    heatFactor: 1.0
  },
  nightmare: {
    key: 'nightmare',
    label: 'Nightmare',
    hollowEnabled: true,
    stillsEnabled: true,
    hollowSpeedFactor: 1.14,
    hearingFactor: 1.35,
    heatFactor: 1.3
  }
};

const QUALITY_PRESETS = {
  low: { key: 'low', maximumPoints: 250000, raysPerSecond: 5000, sweepRays: 14000, renderScale: 0.75 },
  medium: { key: 'medium', maximumPoints: 600000, raysPerSecond: 8000, sweepRays: 26000, renderScale: 1.0 },
  high: { key: 'high', maximumPoints: 1200000, raysPerSecond: 11000, sweepRays: 40000, renderScale: 1.0 }
};

const TUNING = {
  playerRadius: 0.3,
  eyeHeightStanding: 1.62,
  eyeHeightCrouching: 0.95,
  walkSpeed: 2.5,
  sprintSpeed: 4.6,
  crouchSpeed: 1.3,
  waterSpeedFactor: 0.72,
  playerAcceleration: 16,
  staminaSeconds: 6.5,
  staminaRecoverySeconds: 10,
  interactionReach: 2.3,

  scannerMaximumRange: 60,
  scannerSpreadMinimumDegrees: 3,
  scannerSpreadMaximumDegrees: 26,
  scannerSpreadDefaultDegrees: 11,
  heatPerSecondWhilePainting: 0.1,
  heatCoolingPerSecond: 0.2,
  overheatRecoveryLevel: 0.4,
  sweepDurationSeconds: 2.4,
  sweepHeatCost: 0.28,
  sweepHalfWidthDegrees: 52,
  sweepHalfHeightDegrees: 36,

  noiseRadiusWalkStep: 5,
  noiseRadiusSprintStep: 13,
  noiseRadiusCrouchStep: 1.6,
  noiseRadiusScannerHum: 4,
  noiseRadiusSweep: 22,
  noiseRadiusDoor: 8,
  noiseRadiusPickup: 4,

  hollowRoamSpeed: 1.5,
  hollowInvestigateSpeed: 2.5,
  hollowHuntSpeed: 3.5,
  hollowEnragedSpeed: 5.3,
  hollowHeldSpeedFactor: 0.18,
  hollowKillDistance: 0.8,
  hollowRageLimitSeconds: 4.2,
  hollowEnragedDurationSeconds: 4.0,
  hollowMemorySeconds: 5.0,
  hollowSearchSeconds: 8.0,

  stillSpeed: 1.8,
  stillObservedHoldSeconds: 1.1,
  stillKillDistance: 0.65,

  liftArrivalSeconds: 40
};

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

const INTRO_LINES = [
  'KESSEL-9 PUMPING ANNEX',
  '212 m below grade. Sealed 1987.',
  'Work order 4471-B: recover three survey spools left by Crew 2.',
  'There is no lighting. The scanner is the only way to see.'
];

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

const OBJECTIVE_TEXT = {
  leaveLift: 'Step out of the lift car.',
  findGenerator: 'Restore mains power. Generator: Pump Hall B, east.',
  collectSpools: 'Recover the three survey spools left by Crew 2.',
  returnToLift: 'Return to the lift lobby and upload the spools at the terminal.',
  surviveLift: 'The lift is coming. Stay alive until it arrives.',
  boardLift: 'Board the lift.'
};

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
