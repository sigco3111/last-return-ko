// ---------------------------------------------------------------------------
// The workshop's sound board: every sound the game makes, on a button of its own.
//
// How loud each sound is, is set in SOUND_LEVELS at the top of src/js/07-audio.js. To get the levels right you have to hear them,
// next to each other and without playing half a station to reach the one you want. This is where:
// change a number in the source, the page reloads, press the button again.
//
// SOUND_BOARD_ENTRIES below is the list. `npm run audio-check` (tools/audio-check.js) plays this same
// list to measure it, so a sound added here is checked there too.
// ---------------------------------------------------------------------------

const SOUND_BOARD_HALL_WIDTH = 9;           // the hall you stand in, in metres
const SOUND_BOARD_HALL_LENGTH = 36;
const SOUND_BOARD_MAXIMUM_DISTANCE = 30;    // how far down the hall a sound can be put
const SOUND_BOARD_SILENT_PEAK = 0.004;      // a peak below this: nothing came out
const SOUND_BOARD_DISTORTING_PEAK = 0.98;   // a peak above this at the speakers (after the compressor): it overloads them and is cut off flat
// "A big wave for how little is heard": loudness to the ear, less the size of the wave in decibels. Speech comes
// out around -16, a snarl around -24. At -34 or lower nearly all of the sound is too low for ears and small
// speakers to make much of, and it will reach the ceiling long before it gets loud.
const SOUND_BOARD_LITTLE_HEARD_FOR_ITS_WAVE = -34;
const SOUND_BOARD_FADE_IN_SECONDS = 0.45;   // a sound that goes on gets this long to swell before it is measured

const soundBoard = {
  distance: 3,           // metres between you and sounds that come from somewhere
  heldKeys: {},          // the sounds that go on until stopped, and are on now
  hollowVoice: null,     // { aggression, shriekLevel } while one of the Hollow's growls is on
  isScanning: false,     // the scanner is held on
  measureTap: null,      // listens to everything as it goes into the compressor
  outputTap: null,       // listens to what comes out of the compressor: this is what reaches the speakers
  earWeights: null,      // for every band of the spectrum, how much the ear makes of it (see measureSoundBoardOutput)
  compressorTry: null,   // threshold and ratio being tried out with the two controls, or null for the ones in SOUND_OUTPUT
  results: {},           // per key: what came out the last time it played
  measureRun: 0,         // goes up whenever a sound is started or stopped: a measurement under way is then worthless
  playRuns: {},          // per key: goes up each time it is played or stopped, so only its latest play tidies up
  rows: {},              // per key: its elements in the panel
  playAllRun: 0,         // goes up whenever "play all" is started or stopped
  machineryPositions: null, // where the lift, the generator and the shaft were before this tool moved them
  pendingScrollTop: 0
};

// Where you stand, and where a sound that comes from somewhere is put: straight ahead, down the hall.
function getSoundBoardListenerX() { return WORKSHOP_ORIGIN_X + SOUND_BOARD_HALL_WIDTH / 2; }
function getSoundBoardListenerZ() { return WORKSHOP_ORIGIN_Z + SOUND_BOARD_HALL_LENGTH - 2.5; }
function getSoundBoardSourceZ() { return getSoundBoardListenerZ() - soundBoard.distance; }

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

// The Hollow's growl is one voice in several moods, so only one of these can be on at a time.
// `isVoicedShriek` picks which of the two shrieks is heard (audio.hollowShriekVoiced); play gets its own choice back after.
const soundBoardShriekVoicedInPlay = audio.hollowShriekVoiced;
function createSoundBoardGrowl(key, level, label, hint, aggression, shriekLevel, isVoicedShriek) {
  return {
    group: 'The Hollow', key: key, level: level, label: label, hint: hint, seconds: 3, hasPlace: true, only: 'hollowVoice',
    start: function () { audio.hollowShriekVoiced = isVoicedShriek === true; soundBoard.hollowVoice = { aggression: aggression, shriekLevel: shriekLevel }; applySoundBoardHollowVoice(0); },
    stop: function () { audio.hollowShriekVoiced = soundBoardShriekVoicedInPlay; soundBoard.hollowVoice = null; applySoundBoardHollowVoice(0); }
  };
}

function applySoundBoardHollowVoice(dt) {
  const voice = soundBoard.hollowVoice;
  updateHollowVoice(getSoundBoardListenerX(), getSoundBoardSourceZ(), voice !== null,
    voice ? voice.aggression : 0, voice ? voice.shriekLevel : 0, dt, game.time);
}

// Some sounds come two ways: the old way, and an experiment built differently (struck metal from playMetalStrike,
// water from playWaterBubbles). Play uses whichever its switch in `audio` says (audio.metalStruck, audio.waterBubbles).
// A button on the board always plays its own, and puts play's choice back after.
function playSoundBoardExperiment(switchName, isOn, play) {
  const inPlay = audio[switchName];
  audio[switchName] = isOn;
  try { play(); } finally { audio[switchName] = inPlay; }
}
function createSoundBoardExperimentPair(switchName, name, hint, extraSeconds, entry) {
  const play = entry.play;
  const experiment = Object.assign({}, entry, { key: entry.key + switchName.charAt(0).toUpperCase() + switchName.slice(1), label: entry.label + ', ' + name + ' (experiment)',
    hint: hint + ' In play when audio.' + switchName + ' is true.', seconds: entry.seconds + extraSeconds, play: function () { playSoundBoardExperiment(switchName, true, play); } });
  entry.play = function () { playSoundBoardExperiment(switchName, false, play); };
  return [entry, experiment];
}
// The Hollow above the ceiling: six steps at the pace it crawls in play, from where the cross is to right over
// the listener's head, so that you hear it come and how long that takes.
function playSoundBoardCeilingCrawl() {
  for (let step = 0; step < 6; step++) {
    const z = interpolateLinear(getSoundBoardSourceZ(), getSoundBoardListenerZ(), step / 5);
    playHollowCeilingStep(getSoundBoardListenerX(), z, 1, step * 0.47);
  }
}
function createSoundBoardMetalPair(entry) { return createSoundBoardExperimentPair('metalStruck', 'struck metal', 'Built from overtones that clash.', 0.8, entry); }
function createSoundBoardWaterPair(entry) { return createSoundBoardExperimentPair('waterBubbles', 'bubbles', 'Built from ringing bubbles.', 0.2, entry); }

// A recording. How long it lasts is only known once it has been unpacked, so `load` finds that out first.
function createSoundBoardVoice(key, treatmentName, label, hint, startDelay) {
  const entry = {
    group: 'Voices', key: 'voice-' + key, level: treatmentName === 'recorder' ? 'voiceRecorder' : 'voiceRadio', label: label, hint: hint, seconds: 6, only: 'voice', // the game has one voice channel
    load: function () {
      return loadVoiceLine(key).then(function (buffer) { if (buffer) entry.seconds = startDelay + buffer.duration + 0.5; });
    },
    play: function () {
      if (treatmentName === 'radio') playRadioBlip();
      playVoiceLine(key, treatmentName, startDelay, null);
    },
    cancel: stopVoiceLine
  };
  return entry;
}

// One line per sound.
//   play           it plays once and is over (a button)
//   start / stop   it goes on until it is stopped (a switch)
//   seconds        how long it lasts, or for one that goes on: how long the check listens to it
//   level          which number in SOUND_LEVELS (the table at the top of src/js/07-audio.js) sets how loud it is
//   hasPlace       it comes from somewhere, so it is put `soundBoard.distance` metres ahead of you
//   finish         called when its time is up, for a sound that would otherwise leave something running
//   cancel         called by the Stop button, for a sound that can be cut short
//   only           sounds with the same word here share one voice: starting one ends the others
// To add a sound: add a line. The numbers in the calls are the ones the game uses.
const SOUND_BOARD_ENTRIES = [
  // ---- you ----
  { group: 'You', key: 'stepWalk', level: 'footstep', label: 'Footstep, walking', seconds: 0.5, play: function () { playFootstepSound(false, false, 0.55); } },
  { group: 'You', key: 'stepCrouch', level: 'footstep', label: 'Footstep, crouching', seconds: 0.5, play: function () { playFootstepSound(false, false, 0.25); } },
  { group: 'You', key: 'stepSprint', level: 'footstep', label: 'Footstep, sprinting', seconds: 0.5, play: function () { playFootstepSound(false, false, 1.0); } },
  ...createSoundBoardMetalPair({ group: 'You', key: 'stepGrate', level: 'footstep', label: 'Footstep on a grate, walking', seconds: 0.6, play: function () { playFootstepSound(false, true, 0.55); } }),
  ...createSoundBoardWaterPair({ group: 'You', key: 'stepWater', level: 'footstepWater', label: 'Footstep in water, walking', seconds: 0.6, play: function () { playFootstepSound(true, false, 0.55); } }),
  ...createSoundBoardWaterPair({ group: 'You', key: 'stepWaterSprint', level: 'footstepWater', label: 'Footstep in water, sprinting', seconds: 0.6, play: function () { playFootstepSound(true, false, 1.0); } }),
  ...createSoundBoardMetalPair({ group: 'You', key: 'ventCrawl', level: 'ventCrawl', label: 'Crawling in a vent', hint: 'A crouched footstep and the sheet metal under you, as in play.', seconds: 0.8,
    play: function () { playFootstepSound(false, false, 0.25); playVentCrawlSound(); } }),
  { group: 'You', key: 'heartbeatFaint', level: 'heartbeat', label: 'Heartbeat, something is near', hint: 'The faintest it gets: the threat has only just begun.', seconds: 0.6, play: function () { playHeartbeat(0.36); } },
  { group: 'You', key: 'heartbeatFull', level: 'heartbeat', label: 'Heartbeat, it is on you', seconds: 0.6, play: function () { playHeartbeat(1); } },

  // ---- the scanner and the interface ----
  { group: 'Scanner and interface', key: 'scannerPaint', level: 'scanner', label: 'Scanner, held on', hint: 'The real scanner, fired down the hall: ticking and whine.', seconds: 1.5,
    start: function () { soundBoard.isScanning = true; },
    stop: function () { soundBoard.isScanning = false; input.isScanHeld = false; } },
  { group: 'Scanner and interface', key: 'sweep', level: 'sweep', label: 'Full sweep', seconds: TUNING.sweepDurationSeconds, play: function () { playSweepSound(TUNING.sweepDurationSeconds); } },
  { group: 'Scanner and interface', key: 'overheat', level: 'overheat', label: 'Scanner overheats', seconds: 0.9, play: playOverheatSound },
  { group: 'Scanner and interface', key: 'static', level: 'interference', label: 'Interference static, at its worst', hint: 'What the scanner picks up with a creature right beside you.', seconds: 1.5,
    start: function () { setInterferenceSound(1); },
    stop: function () { setInterferenceSound(0); } },
  { group: 'Scanner and interface', key: 'blipMap', level: 'interfaceBlip', label: 'Interface blip (the map opens)', seconds: 0.4, play: function () { playInterfaceBlip(740); } },
  { group: 'Scanner and interface', key: 'blipClose', level: 'interfaceBlip', label: 'Interface blip (a note is put away)', seconds: 0.4, play: function () { playInterfaceBlip(520); } },
  { group: 'Scanner and interface', key: 'pickup', level: 'pickup', label: 'Something picked up', seconds: 0.5, play: playPickupSound },
  { group: 'Scanner and interface', key: 'denied', level: 'denied', label: 'Denied: a door or a machine says no', seconds: 0.6, play: playDeniedSound },
  { group: 'Scanner and interface', key: 'radioBlip', level: 'radioBlip', label: 'Radio opening', seconds: 0.6, play: playRadioBlip },

  // ---- doors and machinery ----
  { group: 'Doors and machinery', key: 'doorOpen', level: 'door', label: 'Door opens', seconds: 1.1, hasPlace: true, play: function () { playDoorSound(getSoundBoardListenerX(), getSoundBoardSourceZ(), true); } },
  ...createSoundBoardMetalPair({ group: 'Doors and machinery', key: 'doorClose', level: 'door', label: 'Door closes', seconds: 1.1, hasPlace: true, play: function () { playDoorSound(getSoundBoardListenerX(), getSoundBoardSourceZ(), false); } }),
  { group: 'Doors and machinery', key: 'generatorStart', level: 'generatorStart', label: 'Generator is started', hint: 'Five turns of the starter, then it catches.', seconds: 6, hasPlace: true,
    play: startGeneratorSound,
    finish: function () {
      audio.generatorGain.gain.cancelScheduledValues(audio.context.currentTime);
      setGeneratorSoundRunning(Boolean(soundBoard.heldKeys.generatorRunning));
    } },
  { group: 'Doors and machinery', key: 'generatorRunning', level: 'generatorRunning', label: 'Generator, running', seconds: 2, hasPlace: true,
    start: function () { setGeneratorSoundRunning(true); },
    stop: function () { setGeneratorSoundRunning(false); } },
  { group: 'Doors and machinery', key: 'liftMachinery', level: 'liftMachinery', label: 'Lift machinery, the car on its way down', seconds: 2, hasPlace: true,
    start: function () { setLiftMachinerySound(0.85); },
    stop: function () { setLiftMachinerySound(0); } },
  { group: 'Doors and machinery', key: 'liftDepart', level: 'liftMachinery', label: 'Lift leaves without you', hint: 'What you hear after stepping out at the start.', seconds: 7.2, hasPlace: true,
    play: playLiftDepartSound,
    finish: function () { setLiftMachinerySound(soundBoard.heldKeys.liftMachinery ? 0.85 : 0); } },
  ...createSoundBoardMetalPair({ group: 'Doors and machinery', key: 'liftBell', level: 'liftBell', label: 'Lift bell', seconds: 1.0, hasPlace: true, play: playLiftBell }),

  // ---- the Hollow ----
  createSoundBoardGrowl('growlCalm', 'hollowGrowl', 'Growl, roaming', 'With the knocking it makes now and then.', 0.1, 0),
  createSoundBoardGrowl('growlHunt', 'hollowGrowl', 'Growl, hunting', 'With its faster knocking.', 0.8, 0),
  createSoundBoardGrowl('growlEnraged', 'hollowGrowl', 'Growl, enraged', 'As loud as the growl gets.', 1, 0),
  createSoundBoardGrowl('shriek', 'hollowShriek', 'Shriek, held in the beam', 'Over its hunting growl, as in play.', 0.8, 1),
  createSoundBoardGrowl('shriekVoiced', 'hollowShriek', 'Shriek, voiced (experiment)', 'Built on a custom waveform. In play when audio.hollowShriekVoiced is true.', 0.8, 1, true),
  { group: 'The Hollow', key: 'roar', level: 'hollowRoar', label: 'Roar: it has found you', seconds: 1.8, hasPlace: true, play: playHollowNoiseRoar },
  { group: 'The Hollow', key: 'roarVoiced', level: 'hollowRoar', label: 'Roar, voiced (experiment)', hint: 'Built on a custom waveform. In play when audio.hollowRoarVoiced is true.', seconds: 2.4, hasPlace: true, play: playHollowVoicedRoar },
  { group: 'The Hollow', key: 'snarl', level: 'hollowSnarl', label: 'Snarl, while hunting', seconds: 0.7, hasPlace: true, play: playHollowSnarl },
  { group: 'The Hollow', key: 'hiss', level: 'hollowHiss', label: 'Hiss: it has lost you', seconds: 1.9, hasPlace: true, play: playHollowLostHiss },
  { group: 'The Hollow', key: 'sniff', level: 'hollowSniff', label: 'Sniffing, while searching', seconds: 1.4, hasPlace: true, play: playHollowSniff },
  { group: 'The Hollow', key: 'trill', level: 'hollowTrill', label: 'Trill: it heard something', seconds: 1.0, hasPlace: true, play: playHollowCuriousTrill },
  { group: 'The Hollow', key: 'enraged', level: 'hollowEnraged', label: 'Enraged: the beam stops slowing it', seconds: 1.4, hasPlace: true, play: function () { playStinger('enraged'); } },
  { group: 'The Hollow', key: 'hollowStepRoam', level: 'hollowFootstep', label: 'Its footstep, roaming', seconds: 0.5, hasPlace: true, play: function () { playHollowFootstep(getSoundBoardListenerX(), getSoundBoardSourceZ(), 0.7); } },
  { group: 'The Hollow', key: 'hollowStepHunt', level: 'hollowFootstep', label: 'Its footstep, hunting', seconds: 0.5, hasPlace: true, play: function () { playHollowFootstep(getSoundBoardListenerX(), getSoundBoardSourceZ(), 1); } },
  { group: 'The Hollow', key: 'hollowVentRoam', level: 'hollowVentStep', label: 'It crawls in a vent, roaming', seconds: 0.8, hasPlace: true, play: function () { playHollowVentStep(getSoundBoardListenerX(), getSoundBoardSourceZ(), 0.8); } },
  ...createSoundBoardMetalPair({ group: 'The Hollow', key: 'hollowVentHunt', level: 'hollowVentStep', label: 'It crawls in a vent, hunting', seconds: 0.8, hasPlace: true, play: function () { playHollowVentStep(getSoundBoardListenerX(), getSoundBoardSourceZ(), 1); } }),

  ...createSoundBoardMetalPair({ group: 'The Hollow', key: 'hollowCeilingStep', level: 'hollowCeilingStep', label: 'It crawls above the ceiling', hint: 'On its way round a door it cannot open. Six thumps at the pace it crawls in play, starting where the cross is and ending right over your head.', seconds: 3.4, hasPlace: true, play: playSoundBoardCeilingCrawl }),
  ...createSoundBoardMetalPair({ group: 'The Hollow', key: 'hatchRattle', level: 'hatchRattle', label: 'A ceiling hatch rattles', hint: 'It has gone up through it, or it is about to drop out of it. This is the warning.', seconds: 0.7, hasPlace: true, play: function () { playHatchRattle(getSoundBoardListenerX(), getSoundBoardSourceZ(), 1); } }),

  ...createSoundBoardMetalPair({ group: 'The Hollow', key: 'doorBang', level: 'doorBang', label: 'It pounds on a door', hint: 'One blow. A keycard door has shut in its face and it is going at it.', seconds: 1.0, hasPlace: true, play: function () { playDoorBang(getSoundBoardListenerX(), getSoundBoardSourceZ(), 1); } }),
  { group: 'The Hollow', key: 'doorBreak', level: 'doorBreak', label: 'A door gives way', hint: 'The third bout on the same door, or sooner if it is angry.', seconds: 1.8, hasPlace: true, play: function () { playDoorBreak(getSoundBoardListenerX(), getSoundBoardSourceZ()); } },

  // ---- the Stills ----
  { group: 'The Stills', key: 'stillShuffle', level: 'stillShuffle', label: 'A Still moves', seconds: 0.4, hasPlace: true, play: function () { playStillShuffleSound(getSoundBoardListenerX(), getSoundBoardSourceZ()); } },

  // ---- apparitions ----
  { group: 'Apparitions', key: 'phantomBreath', level: 'phantomBreath', label: 'A breath behind you', hint: 'The only sound an apparition makes: the kind that stands at your back.', seconds: 1.6, hasPlace: true, play: function () { playPhantomBreath(getSoundBoardListenerX(), getSoundBoardSourceZ()); } },

  // ---- stingers: the music of a moment, heard in your head and not from anywhere ----
  { group: 'Stingers', key: 'stingerSpotted', level: 'stingerSpotted', label: 'It has found you', hint: 'Plays together with the roar.', seconds: 2.0, play: function () { playStinger('spotted'); } },
  { group: 'Stingers', key: 'stingerStill', level: 'stingerStill', label: 'The Stills wake', seconds: 1.8, play: function () { playStinger('still'); } },
  { group: 'Stingers', key: 'stingerPhantom', level: 'stingerPhantom', label: 'An apparition', seconds: 3.0, play: function () { playStinger('phantom'); } },
  { group: 'Stingers', key: 'stingerDeath', level: 'stingerDeath', label: 'Caught', seconds: 1.8, play: function () { playStinger('death'); } },

  // ---- the station ----
  { group: 'The station', key: 'roomTone', level: 'roomTone', label: 'Room tone', hint: 'Always there in play. Switch it on to hear the other sounds against it.', seconds: 2,
    start: function () { setSoundBoardRoomTone(true); },
    stop: function () { setSoundBoardRoomTone(false); } },
  ...createSoundBoardWaterPair({ group: 'The station', key: 'drips', level: 'drips', label: 'Water drips', hint: 'In play: 6 to 16 m away.', seconds: 1.2, hasPlace: true, play: function () { playAmbientDrips(getSoundBoardListenerX(), getSoundBoardSourceZ()); } }),
  { group: 'The station', key: 'pipeGroan', level: 'pipeGroan', label: 'A pipe groans', hint: 'In play: 6 to 16 m away.', seconds: 2.7, hasPlace: true, play: function () { playAmbientPipeGroan(getSoundBoardListenerX(), getSoundBoardSourceZ()); } },
  ...createSoundBoardMetalPair({ group: 'The station', key: 'metalSettles', level: 'metalSettling', label: 'Metal settles', hint: 'In play: 6 to 16 m away.', seconds: 1.4, hasPlace: true, play: function () { playAmbientMetalSettling(getSoundBoardListenerX(), getSoundBoardSourceZ()); } }),
  { group: 'The station', key: 'shaftKnocks', level: 'shaftKnocks', label: 'Knocking from Shaft 9', hint: 'In play: from wherever the shaft is, usually far off.', seconds: 2.3, hasPlace: true, play: playAmbientShaftKnocks }
];

// The recordings in assets/voice, as the game plays them. Lines that are text only have nothing to hear.
const soundBoardUnrecordedLines = [];
for (const key in RADIO_MESSAGES) {
  if (hasVoiceLine(key)) SOUND_BOARD_ENTRIES.push(createSoundBoardVoice(key, 'radio', 'Dispatch: ' + key, RADIO_MESSAGES[key], 0.35));
  else soundBoardUnrecordedLines.push(key);
}
for (const key in LOG_ENTRIES) {
  if (hasVoiceLine(key)) SOUND_BOARD_ENTRIES.push(createSoundBoardVoice(key, 'recorder', 'Recorder: ' + key, LOG_ENTRIES[key].heading, 0.4));
}

function findSoundBoardEntry(key) {
  for (const entry of SOUND_BOARD_ENTRIES) {
    if (entry.key === key) return entry;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The audio engine, as this tool needs it
// ---------------------------------------------------------------------------

function setSoundBoardRoomTone(isOn) {
  const now = audio.context.currentTime;
  audio.ambienceGain.gain.cancelScheduledValues(now);
  audio.ambienceGain.gain.setTargetAtTime(isOn ? getRoomToneLevel() : 0, now, 0.1);
}

// The lift, the generator, the shaft and the Hollow all have a place in the station. Here they are all put
// at the same spot: down the hall, at the distance that was chosen.
function placeSoundBoardSources() {
  const x = getSoundBoardListenerX(), z = getSoundBoardSourceZ();
  for (const position of [LIFT_POSITION, GENERATOR_POSITION, SHAFT_POSITION]) { position.x = x; position.z = z; }
  if (!audio.context) return;
  moveMachinerySoundsToLevel();
  setPannerPosition(audio.hollowPanner, x, getFloorHeightAt(x, z) + 1.7, z);
}

// Starts the audio engine if it is not running yet. A browser only allows that after a click, which is
// why this is called from the buttons and not when the page loads. Resolves once sound can be made.
function startSoundBoardAudio() {
  initializeAudioEngine();
  const context = audio.context;
  if (!context) return Promise.reject(new Error('This browser has no audio engine.'));
  if (!soundBoard.measureTap) {
    setMasterVolume(settings.volume);
    soundBoard.measureTap = context.createAnalyser();
    soundBoard.measureTap.fftSize = 2048;
    audio.masterGain.connect(soundBoard.measureTap);
    soundBoard.outputTap = context.createAnalyser();
    soundBoard.outputTap.fftSize = 2048;
    soundBoard.outputTap.smoothingTimeConstant = 0.5;
    audio.compressor.connect(soundBoard.outputTap);
    applySoundBoardCompressor();
    setSoundBoardRoomTone(false); // the engine starts the room tone by itself; here it is a switch like the others
    placeSoundBoardSources();
    // Your ears and the sources are moved into place smoothly, from the corner of the map. Give them a
    // moment to arrive, or the first sound after a reload is heard from far away.
    return Promise.resolve(context.state === 'running' ? null : context.resume()).then(function () {
      updateAudioListener(getSoundBoardListenerX(), TUNING.eyeHeightStanding, getSoundBoardListenerZ(), 0);
      return waitSoundBoardSeconds(0.3);
    });
  }
  return context.state === 'running' ? Promise.resolve() : context.resume();
}

// How much the ear makes of each band of the spectrum (the standard "A" curve): nearly nothing of a 50 Hz rumble,
// most of sound between 1000 and 5000 Hz. Worked out once for the bands the output tap has.
function getSoundBoardEarWeights() {
  if (soundBoard.earWeights) return soundBoard.earWeights;
  const tap = soundBoard.outputTap, weights = new Float32Array(tap.frequencyBinCount);
  for (let bin = 1; bin < weights.length; bin++) {
    const squared = Math.pow(bin * audio.context.sampleRate / tap.fftSize, 2);
    const response = 148693636 * squared * squared /
      ((squared + 424.36) * Math.sqrt((squared + 11599.29) * (squared + 544496.41)) * (squared + 148693636));
    weights[bin] = response * response * 1.585; // as power, with the curve's usual 2 dB lift
  }
  soundBoard.earWeights = weights;
  return weights;
}

// Listens for the given time to what comes out of the compressor, which is what reaches the speakers.
// Resolves with:
//   peak        the largest the wave got at the speakers (1.0 is the most a speaker can take; above it, it overloads)
//   peakBefore  the same as it went into the compressor: how hard the sound was pushed
//   heldBack    how many decibels the compressor took off it at its loudest moment
//   loudness    how loud it is to an ear at its loudest moment, in decibels (0 would be a pure tone at full scale).
//               Low rumble counts for little here, as it does in your head.
//   average     the level of the wave over the whole time
//   centre      where its energy sits, in Hz: low is dull or deep, high is bright or harsh
function measureSoundBoardOutput(seconds) {
  return new Promise(function (resolve) {
    const tap = soundBoard.outputTap, before = soundBoard.measureTap, sampleRate = audio.context.sampleRate;
    const samples = new Float32Array(tap.fftSize), samplesBefore = new Float32Array(before.fftSize);
    const spectrum = new Float32Array(tap.frequencyBinCount);
    const earWeights = getSoundBoardEarWeights();
    let peak = 0, peakBefore = 0, squareSum = 0, sampleCount = 0, weighted = 0, weightTotal = 0, isInvalid = false;
    let loudestToTheEar = 0, mostHeldBack = 0;
    const started = window.performance.now();
    const timer = window.setInterval(function () {
      tap.getFloatTimeDomainData(samples);
      for (const value of samples) {
        if (!Number.isFinite(value)) isInvalid = true;
        peak = Math.max(peak, Math.abs(value));
        squareSum += value * value;
        sampleCount++;
      }
      before.getFloatTimeDomainData(samplesBefore);
      for (const value of samplesBefore) peakBefore = Math.max(peakBefore, Math.abs(value));
      mostHeldBack = Math.max(mostHeldBack, -audio.compressor.reduction);
      tap.getFloatFrequencyData(spectrum);
      let toTheEar = 0;
      for (let bin = 1; bin < spectrum.length; bin++) {
        const power = Math.pow(10, spectrum[bin] / 10);
        weighted += power * bin * sampleRate / tap.fftSize;
        weightTotal += power;
        toTheEar += power * earWeights[bin];
      }
      loudestToTheEar = Math.max(loudestToTheEar, toTheEar);
      if (window.performance.now() - started > seconds * 1000) {
        window.clearInterval(timer);
        resolve({ peak: peak, peakBefore: peakBefore, heldBack: mostHeldBack, loudness: loudestToTheEar > 0 ? 10 * Math.log10(loudestToTheEar) : -120,
          average: Math.sqrt(squareSum / Math.max(1, sampleCount)), centre: weightTotal > 0 ? weighted / weightTotal : 0, isInvalid: isInvalid });
      }
    }, 20);
  });
}

// Puts the compressor on the threshold and ratio being tried with the two controls, or back on the ones in SOUND_OUTPUT.
function applySoundBoardCompressor() {
  if (!audio.compressor) return;
  const tried = soundBoard.compressorTry || { threshold: SOUND_OUTPUT.compressorThresholdDecibels, ratio: SOUND_OUTPUT.compressorRatio };
  audio.compressor.threshold.value = tried.threshold;
  audio.compressor.ratio.value = tried.ratio;
}

function trySoundBoardCompressor(name, value) {
  if (!soundBoard.compressorTry) soundBoard.compressorTry = { threshold: SOUND_OUTPUT.compressorThresholdDecibels, ratio: SOUND_OUTPUT.compressorRatio };
  soundBoard.compressorTry[name] = value;
  applySoundBoardCompressor();
}

function waitSoundBoardSeconds(seconds) {
  return new Promise(function (resolve) { window.setTimeout(resolve, seconds * 1000); });
}

// ---------------------------------------------------------------------------
// Playing
// ---------------------------------------------------------------------------

function showSoundBoardResult(key) {
  const row = soundBoard.rows[key], result = soundBoard.results[key];
  if (!row) return;
  const isDistorting = Boolean(result) && result.peak > SOUND_BOARD_DISTORTING_PEAK;
  const isSilent = Boolean(result) && result.peak < SOUND_BOARD_SILENT_PEAK;
  const isMostlyTooLow = Boolean(result) && isSoundBoardResultMostlyTooLow(result);
  row.level.textContent = !result ? '' : isSilent ? 'silent'
    : 'loud ' + Math.round(result.loudness) + ' · peak ' + result.peak.toFixed(2) + (result.heldBack >= 1 ? ' · held ' + Math.round(result.heldBack) : '');
  row.level.title = !result ? '' : isSilent ? 'Nothing came out.' : describeSoundBoardResult(result, isDistorting, isMostlyTooLow);
  row.level.classList.toggle('is-loud', isDistorting || isSilent);
  row.level.classList.toggle('is-held', isMostlyTooLow && !isDistorting);
}

// True for a sound whose wave is big for how little of it an ear hears (see SOUND_BOARD_LITTLE_HEARD_FOR_ITS_WAVE).
// Sounds with a small wave are left out: they are simply quiet.
function isSoundBoardResultMostlyTooLow(result) {
  return result.peak >= 0.3 && result.loudness - 20 * Math.log10(result.peak) <= SOUND_BOARD_LITTLE_HEARD_FOR_ITS_WAVE;
}

// What a row's three numbers mean for this sound, in sentences (shown when the mouse rests on them).
function describeSoundBoardResult(result, isDistorting, isMostlyTooLow) {
  const lines = ['Loudness to an ear, at its loudest moment: ' + Math.round(result.loudness) + ' dB. (0 would be a pure tone as loud as the speakers go. Ten less sounds about half as loud.)',
    'Peak at the speakers: ' + result.peak.toFixed(2) + ' of 1.0. It went into the compressor at ' + result.peakBefore.toFixed(2) +
    (result.heldBack >= 1 ? ', and the compressor held it back by ' + Math.round(result.heldBack) + ' dB.' : '.'),
    'Its energy sits around ' + Math.round(result.centre) + ' Hz.'];
  if (isDistorting) lines.push('The peak is over what a speaker can take, so it is cut off flat at 1.0. That gives it a harsh edge. It is also the ceiling: a higher number in SOUND_LEVELS adds edge, not loudness.');
  if (isMostlyTooLow) lines.push('A big wave for how little of it is heard: most of this sound is too low for ears and small speakers to make much of. Turning it up reaches the ceiling long before it gets loud. More of the sound between 150 and 600 Hz would make it louder at the same size of wave.');
  return lines.join('\n');
}

function markSoundBoardRow(key, isPlaying) {
  const row = soundBoard.rows[key];
  if (row) row.element.classList.toggle('is-playing', isPlaying);
}

function reportSoundBoardProblem(error) {
  setWorkshopStatus('No sound: ' + error.message, 'warning');
  return null;
}

// Something is about to start or stop sounding. Whatever is being measured right now would be a
// measurement of two things at once, so it is dropped: that row keeps the number it had.
function dropSoundBoardMeasurements() {
  soundBoard.measureRun++;
}

// Ends other sounds that share a voice with this one (see `only`).
function endSoundBoardRivals(entry) {
  if (!entry.only) return;
  for (const other of SOUND_BOARD_ENTRIES) {
    if (other === entry || other.only !== entry.only) continue;
    if (other.play) {
      soundBoard.playRuns[other.key] = (soundBoard.playRuns[other.key] || 0) + 1;
      markSoundBoardRow(other.key, false);
    } else if (soundBoard.heldKeys[other.key]) {
      other.stop();
      delete soundBoard.heldKeys[other.key];
      refreshSoundBoardSwitch(other.key);
    }
  }
}

function refreshSoundBoardSwitch(key) {
  const row = soundBoard.rows[key];
  if (row) row.control.checked = Boolean(soundBoard.heldKeys[key]);
  markSoundBoardRow(key, Boolean(soundBoard.heldKeys[key]));
}

// Plays a sound once. Resolves with what came out when it is over, or with nothing if another sound was
// started or stopped before then.
function playSoundBoardEntry(entry) {
  let measureRun = 0, playRun = 0;
  return startSoundBoardAudio().then(function () {
    return entry.load ? entry.load() : null;
  }).then(function () {
    dropSoundBoardMeasurements();
    endSoundBoardRivals(entry);
    measureRun = soundBoard.measureRun;
    playRun = soundBoard.playRuns[entry.key] = (soundBoard.playRuns[entry.key] || 0) + 1;
    markSoundBoardRow(entry.key, true);
    entry.play();
    return measureSoundBoardOutput(entry.seconds);
  }).then(function (result) {
    // Played again since, or stopped: this play has nothing left to do.
    if (soundBoard.playRuns[entry.key] !== playRun) return null;
    if (entry.finish) entry.finish();
    markSoundBoardRow(entry.key, false);
    if (soundBoard.measureRun !== measureRun) return null;
    soundBoard.results[entry.key] = result;
    showSoundBoardResult(entry.key);
    return result;
  });
}

// Switches a sound that goes on, on or off. Switching it on resolves with what came out once it has been
// going for a moment (or with nothing if another sound was started or stopped meanwhile); switching it off
// resolves with nothing.
function holdSoundBoardEntry(entry, isOn) {
  return startSoundBoardAudio().then(function () {
    dropSoundBoardMeasurements();
    if (!isOn) {
      if (soundBoard.heldKeys[entry.key]) entry.stop();
      delete soundBoard.heldKeys[entry.key];
      refreshSoundBoardSwitch(entry.key);
      return null;
    }
    endSoundBoardRivals(entry);
    entry.start();
    soundBoard.heldKeys[entry.key] = true;
    refreshSoundBoardSwitch(entry.key);
    const measureRun = soundBoard.measureRun;
    return waitSoundBoardSeconds(SOUND_BOARD_FADE_IN_SECONDS).then(function () {
      return soundBoard.measureRun === measureRun ? measureSoundBoardOutput(entry.seconds) : null;
    }).then(function (result) {
      if (!result || soundBoard.measureRun !== measureRun) return null;
      soundBoard.results[entry.key] = result;
      showSoundBoardResult(entry.key);
      return result;
    });
  });
}

// Lets one sound be heard from start to finish, whichever kind it is. Resolves with what came out.
function listenToSoundBoardEntry(entry) {
  if (entry.play) return playSoundBoardEntry(entry);
  return holdSoundBoardEntry(entry, true).then(function (result) {
    return holdSoundBoardEntry(entry, false).then(function () { return result; });
  });
}

function stopSoundBoard() {
  soundBoard.playAllRun++;
  if (!soundBoard.measureTap) return; // nothing has been played yet
  dropSoundBoardMeasurements();
  for (const entry of SOUND_BOARD_ENTRIES) {
    if (entry.play) {
      soundBoard.playRuns[entry.key] = (soundBoard.playRuns[entry.key] || 0) + 1;
      if (entry.cancel) entry.cancel();
      if (entry.finish) entry.finish();
      markSoundBoardRow(entry.key, false);
    } else if (soundBoard.heldKeys[entry.key]) holdSoundBoardEntry(entry, false);
  }
}

// Every sound in turn, top to bottom, with a breath between them.
function playAllSoundBoardEntries() {
  stopSoundBoard();
  const run = soundBoard.playAllRun;
  let turn = Promise.resolve();
  for (const entry of SOUND_BOARD_ENTRIES) {
    turn = turn.then(function () {
      if (run !== soundBoard.playAllRun) return null;
      const row = soundBoard.rows[entry.key];
      if (row) row.element.scrollIntoView({ block: 'nearest' });
      return listenToSoundBoardEntry(entry).then(function () { return waitSoundBoardSeconds(0.5); });
    });
  }
  turn.then(function () {
    if (run === soundBoard.playAllRun) setWorkshopStatus('That was every sound.', 'good');
  }, reportSoundBoardProblem);
}

function setSoundBoardDistance(distance) {
  soundBoard.distance = clampNumber(distance, 1, SOUND_BOARD_MAXIMUM_DISTANCE);
  placeSoundBoardSources();
  for (const key in soundBoard.rows) {
    if (soundBoard.rows[key].place) soundBoard.rows[key].place.textContent = ' · ' + formatWorkshopNumber(soundBoard.distance) + ' m';
  }
  markWorkshopStateChanged();
}

// ---------------------------------------------------------------------------
// The hall, every frame, and the panel
// ---------------------------------------------------------------------------

function openSoundBoard(stored) {
  if (Number.isFinite(stored.distance)) soundBoard.distance = clampNumber(stored.distance, 1, SOUND_BOARD_MAXIMUM_DISTANCE);
  soundBoard.pendingScrollTop = Number.isFinite(stored.scrollTop) ? stored.scrollTop : 0;
  prepareWorkshopWorld('Workshop · sounds');
  ZONE_NAMES.push('UNSURVEYED', 'SOUND HALL');
  clearPlacement();
  placement.zone = 1;
  carveRoom(WORKSHOP_ORIGIN_X, WORKSHOP_ORIGIN_Z, WORKSHOP_ORIGIN_X + SOUND_BOARD_HALL_WIDTH, WORKSHOP_ORIGIN_Z + SOUND_BOARD_HALL_LENGTH, 3.2, ZONE_GENERATED_ROOM);
  finishWorkshopWorld();
  soundBoard.machineryPositions = [LIFT_POSITION, GENERATOR_POSITION, SHAFT_POSITION].map(function (position) { return { position: position, x: position.x, z: position.z }; });
  placeSoundBoardSources();
  placeSoundBoardCamera();
}

function closeSoundBoard() {
  stopSoundBoard();
  for (const saved of soundBoard.machineryPositions || []) { saved.position.x = saved.x; saved.position.z = saved.z; }
  soundBoard.machineryPositions = null;
  if (audio.context) moveMachinerySoundsToLevel();
  soundBoard.rows = {};
}

function placeSoundBoardCamera() {
  placeWorkshopCamera(getSoundBoardListenerX(), TUNING.eyeHeightStanding, getSoundBoardListenerZ(), 0, 0);
}

function updateSoundBoard(dt) {
  // You stand still and look down the hall: what matters here is what you hear.
  placeSoundBoardCamera();
  input.lookDeltaX = 0; input.lookDeltaY = 0;
  updateAudioListener(player.x, getPlayerEyeY(), player.z, player.yaw);
  if (soundBoard.isScanning) input.isScanHeld = true;
  // The growl is kept up every frame, as in play: that is what makes it knock now and then.
  if (soundBoard.hollowVoice) applySoundBoardHollowVoice(dt);
}

// A cross on the floor where the sounds that come from somewhere are.
function addSoundBoardOverlays() {
  pushDebugCross(getSoundBoardListenerX(), 0.03, getSoundBoardSourceZ(), 0.35, 1.0, 0.66, 0.23);
}

function addSoundBoardRow(body, entry) {
  const element = createDebugElement('div', 'sound-row');
  let control, labelHolder;
  if (entry.play) {
    control = createDebugElement('button', 'button-quiet', entry.label);
    control.type = 'button';
    control.addEventListener('click', function () {
      control.blur(); // or Space (the scanner) would press it again
      playSoundBoardEntry(entry).catch(reportSoundBoardProblem);
    });
    labelHolder = control;
    element.appendChild(control);
  } else {
    const label = createDebugElement('label', 'debug-option');
    control = document.createElement('input');
    control.type = 'checkbox';
    control.checked = Boolean(soundBoard.heldKeys[entry.key]);
    control.addEventListener('change', function () {
      control.blur();
      holdSoundBoardEntry(entry, control.checked).catch(reportSoundBoardProblem);
    });
    label.appendChild(control);
    labelHolder = label.appendChild(createDebugElement('span', '', entry.label));
    element.appendChild(label);
  }
  control.id = 'sound-' + entry.key;
  labelHolder.title = (entry.hint ? entry.hint + '\n' : '') + 'Loudness: SOUND_LEVELS.' + entry.level + ' (now ' + SOUND_LEVELS[entry.level] + ')';
  // Under its name: the number in SOUND_LEVELS that sets how loud it is, and how far away it is put.
  const detail = labelHolder.appendChild(createDebugElement('span', 'sound-detail', entry.level + ' ' + SOUND_LEVELS[entry.level]));
  const place = entry.hasPlace ? detail.appendChild(createDebugElement('span', '', ' · ' + formatWorkshopNumber(soundBoard.distance) + ' m')) : null;
  const level = element.appendChild(createDebugElement('span', 'sound-level', ''));
  level.id = 'sound-level-' + entry.key;
  body.appendChild(element);
  soundBoard.rows[entry.key] = { element: element, control: control, level: level, place: place };
  element.classList.toggle('is-playing', Boolean(soundBoard.heldKeys[entry.key]));
  showSoundBoardResult(entry.key);
}

function renderSoundBoardPanel(body) {
  soundBoard.rows = {};
  addWorkshopNote(body, 'Every sound the game makes. A button plays its sound once; a tick box keeps it going, so you can hear other sounds against it. ' +
    'How loud each one is, is set in SOUND_LEVELS at the top of src/js/07-audio.js; under each name is its number there and what it is now. Change it and this page reloads with it.');
  const row = addWorkshopRow(body);
  addWorkshopButton(row, 'Play all in turn', playAllSoundBoardEntries, 'Every sound, top to bottom').id = 'sound-play-all';
  addWorkshopButton(row, 'Stop', stopSoundBoard, 'Stops "play all" and everything that is switched on').id = 'sound-stop';
  addWorkshopNumber(body, 'Distance to sounds that come from somewhere (m). They are at the cross, and show their distance under their name.',
    soundBoard.distance, 1, SOUND_BOARD_MAXIMUM_DISTANCE, 0.5, setSoundBoardDistance);
  addWorkshopNumber(body, 'Compressor threshold (dB), to try by ear. Sounds above this are held back. Lower holds loud sounds back more (fewer red rows, less punch); nearer 0 holds them back less.',
    soundBoard.compressorTry ? soundBoard.compressorTry.threshold : SOUND_OUTPUT.compressorThresholdDecibels, -40, 0, 1, function (value) { trySoundBoardCompressor('threshold', value); });
  addWorkshopNumber(body, 'Compressor ratio, to try by ear. How hard they are held back: 1 not at all, 20 a wall. To keep either number, write it into SOUND_OUTPUT in src/js/07-audio.js.',
    soundBoard.compressorTry ? soundBoard.compressorTry.ratio : SOUND_OUTPUT.compressorRatio, 1, 20, 0.5, function (value) { trySoundBoardCompressor('ratio', value); });
  addWorkshopNote(body, 'After a sound has played, its row shows three numbers, measured where the sound leaves the compressor, which is what reaches the speakers. "loud": how loud it is to an ear at its loudest moment, in decibels below the most the speakers can do (ten less is about half as loud; deep rumble counts for little, as it does in your head). ' +
    '"peak": how large the wave got at the speakers, of 1.0. "held": how many decibels the compressor took off it. Red: the peak is over 1.0, so the speakers cut it off flat (a harsh edge, and no louder for being turned up), or nothing came out. Amber: a big wave for how little is heard, because most of the sound is very low. Rest the mouse on the numbers for the whole story. ' +
    'Whatever else was already playing is counted too; start or stop another sound before it is over and it is not measured. Measured at the volume from the settings (' + Math.round(settings.volume * 100) + ' %).');

  let group = null;
  for (const entry of SOUND_BOARD_ENTRIES) {
    if (entry.group !== group) { group = entry.group; addWorkshopHeading(body, group); }
    addSoundBoardRow(body, entry);
  }
  if (soundBoardUnrecordedLines.length > 0) addWorkshopNote(body, 'Text only, no recording yet: ' + soundBoardUnrecordedLines.join(', ') + '.');

  // After a reload the list comes back where it was, so the sound being worked on is still under the mouse.
  if (soundBoard.pendingScrollTop > 0) {
    const scrollTop = soundBoard.pendingScrollTop;
    soundBoard.pendingScrollTop = 0;
    window.setTimeout(function () { body.scrollTop = scrollTop; }, 0);
  }
}

workshop.tools.sounds = {
  label: 'Sounds',
  initialize: function () {},
  open: openSoundBoard,
  close: closeSoundBoard,
  storeState: function (stored) {
    stored.distance = soundBoard.distance;
    stored.scrollTop = workshop.bodyElement.scrollTop;
  },
  save: function () { setWorkshopStatus('Nothing to save here: how loud a sound is, is set in SOUND_LEVELS at the top of src/js/07-audio.js.', 'info'); },
  moveCameraInside: placeSoundBoardCamera,
  update: updateSoundBoard,
  addOverlays: addSoundBoardOverlays,
  renderPanel: renderSoundBoardPanel,
  onPointerDown: function () {},
  onPointerMove: function () {},
  onPointerUp: function () {},
  onWheel: function () {},
  onKey: function () { return false; }
};

// For tools/audio-check.js, which plays this list to measure it, and for the browser console.
const soundBoardForTools = {
  state: soundBoard,
  silentPeak: SOUND_BOARD_SILENT_PEAK,
  distortingPeak: SOUND_BOARD_DISTORTING_PEAK,
  isMostlyTooLow: isSoundBoardResultMostlyTooLow,
  list: function () {
    return SOUND_BOARD_ENTRIES.map(function (entry) {
      return { key: entry.key, group: entry.group, label: entry.label, goesOn: !entry.play, hasPlace: Boolean(entry.hasPlace) };
    });
  },
  // Resolves with the state of the audio engine: 'running' when sounds can be made.
  start: function () {
    return startSoundBoardAudio().then(function () { return audio.context.state; }, function (error) { return error.message; });
  },
  listen: function (key) { return listenToSoundBoardEntry(findSoundBoardEntry(key)); },
  setDistance: setSoundBoardDistance,
  levels: SOUND_LEVELS // change one from the console to try a loudness without a reload
};
