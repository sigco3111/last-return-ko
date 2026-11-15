// ---------------------------------------------------------------------------
// Audio: everything is synthesised with the Web Audio API. No sound files.
//
// Nearly every sound here starts as NOISE shaped by filters, not as a raw
// square or sawtooth wave. Raw waves are what make synthesised audio sound
// like an old game console; filtered noise sounds like air, metal and breath.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// HOW LOUD EVERYTHING IS
//
// One number per sound. Each is a multiplier: 1 is the sound as it was built, 2 doubles the signal,
// 0.5 halves it, 0 switches it off. More is louder.
//
//   - The ear does not hear this in a straight line. Doubling a number is one clear step louder (+6 dB),
//     not "twice as loud"; that takes about 3. A change from 1 to 1.1 is hardly heard.
//   - The numbers further down this file (the `gain` of every layer of a sound) are what the sound is
//     made of: its balance, not its loudness. Change those to change how a sound sounds, these to change
//     how loud it is.
//   - To hear and measure every sound: `npm run audio-check -- --listen` (the workshop's Sounds tab).
//     Each row there names the number below that belongs to it. Keep its "peak" under 1.0.
// ---------------------------------------------------------------------------
const SOUND_LEVELS = {
  // ---- you ----
  footstep: 0.8,            // your footsteps on a dry floor (and the ring of a grate)
  footstepWater: 5,       // your footsteps in water
  ventCrawl: 3,           // the sheet metal under you in a vent, on top of a footstep
  heartbeat: 4,

  // ---- the scanner and the interface ----
  scanner: 1,             // ticking and whine while it is held on
  sweep: 1,               // the full sweep winding down
  overheat: 1,
  interference: 1,        // static with a creature near
  interfaceBlip: 1,       // map, notes
  pickup: 1,
  denied: 1,              // a door or a machine says no
  radioBlip: 1,           // the radio opening, before dispatch speaks

  // ---- doors and machinery ----
  door: 1,
  generatorStart: 1,      // the turns of the starter
  generatorRunning: 1,
  liftMachinery: 1,       // arriving, leaving, on its way down
  liftBell: 1,

  // ---- the Hollow ----
  hollowGrowl: 1,         // the growl that is always there, calm to enraged
  hollowClicks: 1,        // the knocking it makes now and then while it growls
  hollowShriek: 1,        // held in the beam
  hollowRoar: 1,          // it has found you
  hollowSnarl: 1,         // while hunting
  hollowHiss: 1,          // it has lost you
  hollowSniff: 1,         // while searching
  hollowTrill: 1,         // it heard something
  hollowEnraged: 1,       // the beam stops slowing it
  hollowFootstep: 1,
  hollowVentStep: 1,      // crawling in a vent
  hollowCeilingStep: 1,   // crawling above the ceiling, on its way round a locked door
  hatchRattle: 1,         // a ceiling hatch: it has gone in, or it is about to come out
  hollowRumble: 1,
  hollowBreath: 1,

  // ---- the Stills ----
  stillShuffle: 1,        // one of them moves

  // ---- stingers ----
  stingerSpotted: 1,      // it has found you (plays with the roar)
  stingerStill: 1,        // the Stills wake
  stingerPhantom: 1,      // an apparition
  stingerDeath: 1,        // caught

  // ---- the station ----
  roomTone: 1,            // the constant low tone
  drips: 1,
  pipeGroan: 1,
  metalSettling: 1,
  shaftKnocks: 1,         // knocking from Shaft 9

  // ---- voices ----
  voiceRadio: 0.8,          // dispatch, with its static
  voiceRecorder: 0.8        // the spools read aloud
};

const audio = {
  context: null,
  masterGain: null,
  reverbInput: null,
  whiteNoiseBuffer: null,
  brownNoiseBuffer: null,
  scannerGain: null,
  scannerWhineGain: null,
  staticGain: null,
  hollowPanner: null,
  hollowGrowlGain: null,
  hollowScreechGain: null,
  hollowScreechFilter: null,
  hollowScreechFilterHigh: null,
  hollowShriekVoiced: true, // EXPERIMENT: true makes the shriek in play the voiced one. The sound board has both.
  hollowRoarVoiced: true,   // EXPERIMENT: the same for the roar
  metalStruck: true,       // EXPERIMENT: true makes grates, vents, the door latch, settling metal and the lift bell ring like struck metal (playMetalStrike)
  waterBubbles: true,      // EXPERIMENT: true makes footsteps in water and drips out of ringing bubbles (playWaterBubbles)
  hollowVoicedShriekGain: null,
  hollowVoicedShriekThroats: [],  // { oscillator, pitch }: see initializeAudioEngine
  hollowVoicedShriekFormants: [], // { filter, restFrequency, rise }
  hollowThroatSource: null,
  throatWaves: {},        // custom waveforms made by createThroatWave, kept per roughness
  generatorPanner: null,
  liftPanner: null,
  generatorGain: null,
  liftGain: null,
  ambienceGain: null,
  nextAmbientEventTime: 6,
  nextHeartbeatTime: 0,
  nextHollowClickTime: 0,
  nextLiftBellTime: 0,
  volume: 0.8
};

function getRoomToneLevel() {
  return 0.9 * SOUND_LEVELS.roomTone;
}

function isAudioReady() {
  return audio.context !== null && audio.context.state === 'running';
}

function createNoiseBuffer(context, seconds, isBrown) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let sampleIndex = 0; sampleIndex < length; sampleIndex++) {
    const white = Math.random() * 2 - 1;
    if (isBrown) {
      last = (last + 0.02 * white) / 1.02;
      data[sampleIndex] = last * 3.5;
    } else {
      data[sampleIndex] = white;
    }
  }
  return buffer;
}

function createReverbImpulse(context, seconds) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let sampleIndex = 0; sampleIndex < length; sampleIndex++) {
      const decay = Math.pow(1 - sampleIndex / length, 2.6);
      data[sampleIndex] = (Math.random() * 2 - 1) * decay;
    }
  }
  return buffer;
}

function createScannerTickBuffer(context) {
  const seconds = 1.5;
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let position = 0;
  while (position < length - 200) {
    const tickLength = 30 + Math.floor(Math.random() * 50);
    for (let sampleIndex = 0; sampleIndex < tickLength; sampleIndex++) {
      data[position + sampleIndex] = (Math.random() * 2 - 1) * (1 - sampleIndex / tickLength);
    }
    position += Math.floor(context.sampleRate * (0.012 + Math.random() * 0.03));
  }
  return buffer;
}

// The raw material for the Hollow's growl: several seconds of irregular clicks, like a slow rattle in a throat.
// Runs of clicks speed up and slow down, with short gaps where it "breathes". Formant filters (below, where
// this buffer is used) turn the clicks into something that sounds like it comes from a body.
function createThroatBuffer(context) {
  const seconds = 9;
  const sampleRate = context.sampleRate;
  const length = Math.floor(sampleRate * seconds);
  const buffer = context.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  let position = 0;
  while (position < length) {
    const phraseEnd = Math.min(length, position + Math.floor(sampleRate * (0.7 + Math.random() * 1.8)));
    let clicksPerSecond = 20 + Math.random() * 20; // TWEAK: lower is a slower, heavier rattle
    while (position < phraseEnd) {
      const clickLength = Math.floor(sampleRate * (0.004 + Math.random() * 0.007));
      const strength = 0.45 + Math.random() * 0.65;
      for (let sampleIndex = 0; sampleIndex < clickLength && position + sampleIndex < length; sampleIndex++) {
        const fade = 1 - sampleIndex / clickLength;
        data[position + sampleIndex] += (Math.random() * 2 - 1) * strength * fade * fade;
      }
      clicksPerSecond = clampNumber(clicksPerSecond * (0.96 + Math.random() * 0.08), 13, 58);
      position += Math.floor(sampleRate / clicksPerSecond * (0.75 + Math.random() * 0.5));
    }
    position += Math.floor(sampleRate * (0.06 + Math.random() * 0.4));
  }
  return buffer;
}

function initializeAudioEngine() {
  if (audio.context) {
    if (audio.context.state === 'suspended') audio.context.resume();
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  let context;
  try { context = new AudioContextClass(); } catch (error) { return; }
  audio.context = context;

  audio.masterGain = context.createGain();
  audio.masterGain.gain.value = audio.volume;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.ratio.value = 5;
  audio.masterGain.connect(compressor);
  compressor.connect(context.destination);

  const reverb = context.createConvolver();
  reverb.buffer = createReverbImpulse(context, 3.4);
  const reverbReturn = context.createGain();
  reverbReturn.gain.value = 0.65; // TWEAK: how echoey the station sounds (0 = dry)
  reverb.connect(reverbReturn);
  reverbReturn.connect(audio.masterGain);
  audio.reverbInput = reverb;

  audio.whiteNoiseBuffer = createNoiseBuffer(context, 2, false);
  audio.brownNoiseBuffer = createNoiseBuffer(context, 5, true);

  // ---- ambience: a low room tone that never quite settles ----
  audio.ambienceGain = context.createGain();
  audio.ambienceGain.gain.value = 0.0;
  audio.ambienceGain.connect(audio.masterGain);
  const rumble = context.createBufferSource();
  rumble.buffer = audio.brownNoiseBuffer;
  rumble.loop = true;
  const rumbleFilter = context.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.value = 160;
  const rumbleGain = context.createGain();
  rumbleGain.gain.value = 0.5;
  rumble.connect(rumbleFilter); rumbleFilter.connect(rumbleGain); rumbleGain.connect(audio.ambienceGain);
  rumble.start();
  const rumbleSweep = context.createOscillator();
  rumbleSweep.frequency.value = 0.05;
  const rumbleSweepDepth = context.createGain();
  rumbleSweepDepth.gain.value = 70;
  rumbleSweep.connect(rumbleSweepDepth); rumbleSweepDepth.connect(rumbleFilter.frequency);
  rumbleSweep.start();
  for (const frequency of [41.2, 43.9, 82.1]) {
    const drone = context.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = frequency;
    const droneGain = context.createGain();
    droneGain.gain.value = frequency > 60 ? 0.025 : 0.07;
    drone.connect(droneGain); droneGain.connect(audio.ambienceGain);
    drone.start();
  }

  // ---- scanner: dry ticking plus a thin whine ----
  audio.scannerGain = context.createGain();
  audio.scannerGain.gain.value = 0;
  const ticks = context.createBufferSource();
  ticks.buffer = createScannerTickBuffer(context);
  ticks.loop = true;
  const tickFilter = context.createBiquadFilter();
  tickFilter.type = 'highpass';
  tickFilter.frequency.value = 2400;
  ticks.connect(tickFilter); tickFilter.connect(audio.scannerGain);
  audio.scannerGain.connect(audio.masterGain);
  ticks.start();
  audio.scannerWhineGain = context.createGain();
  audio.scannerWhineGain.gain.value = 0;
  const whine = context.createOscillator();
  whine.type = 'sine';
  whine.frequency.value = 6200;
  whine.connect(audio.scannerWhineGain); audio.scannerWhineGain.connect(audio.masterGain);
  whine.start();

  // ---- interference static ----
  audio.staticGain = context.createGain();
  audio.staticGain.gain.value = 0;
  const staticNoise = context.createBufferSource();
  staticNoise.buffer = audio.whiteNoiseBuffer;
  staticNoise.loop = true;
  const staticFilter = context.createBiquadFilter();
  staticFilter.type = 'bandpass';
  staticFilter.frequency.value = 3200;
  staticFilter.Q.value = 0.6;
  staticNoise.connect(staticFilter); staticFilter.connect(audio.staticGain); audio.staticGain.connect(audio.masterGain);
  staticNoise.start();

  // ---- the Hollow: a positional voice that follows it around ----
  audio.hollowPanner = createPannerNode(0, 1.6, 0, 2.2, 1.3);
  audio.hollowGrowlGain = context.createGain();
  audio.hollowGrowlGain.gain.value = 0; // silent until updateHollowVoice says there is a Hollow to hear
  audio.hollowGrowlGain.connect(audio.hollowPanner);
  // 1. The throat rattle, rounded off and pushed through three "formants": the resonances of a mouth and chest.
  audio.hollowThroatSource = context.createBufferSource();
  audio.hollowThroatSource.buffer = createThroatBuffer(context);
  audio.hollowThroatSource.loop = true;
  const throatSoftener = context.createBiquadFilter();
  throatSoftener.type = 'lowpass';
  throatSoftener.frequency.value = 2600;
  audio.hollowThroatSource.connect(throatSoftener);
  // TWEAK: each line is one resonance: [centre frequency in Hz, sharpness, loudness, how far it wanders, wander speed].
  // Lower frequencies make it sound larger. The first one carries most of the "growl".
  const formants = [[230, 5, 2, 50, 0.11], [640, 7, 1.2, 150, 0.17], [1900, 9, 0.8, 300, 0.23]];
  for (const formant of formants) {
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = formant[0];
    filter.Q.value = formant[1];
    const level = context.createGain();
    level.gain.value = formant[2] * 3.2;
    const wander = context.createOscillator();
    wander.frequency.value = formant[4];
    const wanderDepth = context.createGain();
    wanderDepth.gain.value = formant[3];
    wander.connect(wanderDepth); wanderDepth.connect(filter.frequency);
    wander.start();
    throatSoftener.connect(filter); filter.connect(level); level.connect(audio.hollowGrowlGain);
  }
  audio.hollowThroatSource.start();
  // 2. A chest rumble underneath, felt more than heard.
  const chestRumble = context.createBufferSource();
  chestRumble.buffer = audio.brownNoiseBuffer;
  chestRumble.loop = true;
  const chestFilter = context.createBiquadFilter();
  chestFilter.type = 'lowpass';
  chestFilter.frequency.value = 90;
  const chestLevel = context.createGain();
  chestLevel.gain.value = 1.3 * SOUND_LEVELS.hollowRumble;
  const chestSwell = context.createOscillator();
  chestSwell.frequency.value = 0.27; // one breath roughly every four seconds
  const chestSwellDepth = context.createGain();
  chestSwellDepth.gain.value = 0.07 * SOUND_LEVELS.hollowRumble;
  chestSwellDepth.connect(chestSwellDepth); chestSwellDepth.connect(chestLevel.gain)
  chestSwell.start();
  chestRumble.connect(chestFilter); chestFilter.connect(chestLevel); chestLevel.connect(audio.hollowGrowlGain);
  chestRumble.start();
  // 3. Breath: a slow swell of air between the rattles.
  const breath = context.createBufferSource();
  breath.buffer = audio.whiteNoiseBuffer;
  breath.loop = true;
  const breathFilter = context.createBiquadFilter();
  breathFilter.type = 'notch';
  breathFilter.frequency.value = 1100;
  breathFilter.Q.value = 0.8;
  const breathLevel = context.createGain();
  breathLevel.gain.value = 0.12 * SOUND_LEVELS.hollowBreath;
  const breathSwell = context.createOscillator();
  breathSwell.frequency.value = 0.27; // one breath roughly every four seconds
  const breathSwellDepth = context.createGain();
  breathSwellDepth.gain.value = 0.07 * SOUND_LEVELS.hollowBreath;
  breathSwell.connect(breathSwellDepth); breathSwellDepth.connect(breathLevel.gain);
  breathSwell.start();
  breath.connect(breathFilter); breathFilter.connect(breathLevel); breathLevel.connect(audio.hollowGrowlGain);
  breath.start();

  // The shriek it makes while the beam is on it: noise forced through two narrow, rising filters and
  // chopped 58 times a second, so it rasps.
  audio.hollowScreechGain = context.createGain();
  audio.hollowScreechGain.gain.value = 0;
  audio.hollowScreechGain.connect(audio.hollowPanner);
  const screechNoise = context.createBufferSource();
  screechNoise.buffer = audio.whiteNoiseBuffer;
  screechNoise.loop = true;
  audio.hollowScreechFilter = context.createBiquadFilter();
  audio.hollowScreechFilter.type = 'bandpass';
  audio.hollowScreechFilter.frequency.value = 1300;
  audio.hollowScreechFilter.Q.value = 11;
  audio.hollowScreechFilterHigh = context.createBiquadFilter();
  audio.hollowScreechFilterHigh.type = 'bandpass';
  audio.hollowScreechFilterHigh.frequency.value = 2900;
  audio.hollowScreechFilterHigh.Q.value = 9;
  const screechRasp = context.createGain();
  screechRasp.gain.value = 1.6;
  const screechRaspOscillator = context.createOscillator();
  screechRaspOscillator.frequency.value = 58;
  const screechRaspDepth = context.createGain();
  screechRaspDepth.gain.value = 0.4;
  screechRaspOscillator.connect(screechRaspDepth); screechRaspDepth.connect(screechRasp.gain);
  screechRaspOscillator.start();
  const screechHighLevel = context.createGain();
  screechHighLevel.gain.value = 0.5;
  screechNoise.connect(audio.hollowScreechFilter); audio.hollowScreechFilter.connect(screechRasp);
  screechNoise.connect(audio.hollowScreechFilterHigh); audio.hollowScreechFilterHigh.connect(screechHighLevel);
  screechHighLevel.connect(screechRasp);
  screechRasp.connect(audio.hollowScreechGain);
  screechNoise.start();

  // EXPERIMENT: the same shriek built on a real voice (see createThroatWave) instead of noise. Two throats at
  // pitches that do not fit together, as in an animal's scream, each shaking on its own. They are overdriven
  // with a little breath and pushed through the formants of a mouth held wide open. updateHollowVoice plays
  // this one or the one above (audio.hollowShriekVoiced), and raises the pitch and the formants with the shriek.
  audio.hollowVoicedShriekGain = context.createGain();
  audio.hollowVoicedShriekGain.gain.value = 0;
  audio.hollowVoicedShriekGain.connect(audio.hollowPanner);
  const shriekOverdrive = context.createWaveShaper();
  shriekOverdrive.curve = createOverdriveCurve(6); // TWEAK: 1 is clean, 8 is torn
  shriekOverdrive.oversample = '2x';
  const shriekWave = createThroatWave(context, 0.7); // TWEAK: 0 is a clean scream, 1 has broken an octave down
  // TWEAK: one line per throat: [the pitch you hear in Hz before it rises, loudness, how far the pitch shakes in cents].
  // Pitches in a simple ratio (600 and 900) sing together. Ones that are not (620 and 911) fight.
  const shriekThroats = [[920, 0.6, 170], [1211, 0.4, 220]];
  for (const throat of shriekThroats) {
    const oscillator = context.createOscillator();
    oscillator.setPeriodicWave(shriekWave);
    oscillator.frequency.value = throat[0] * 0.5; // half the pitch: see createThroatWave
    const shake = context.createBufferSource();
    shake.buffer = audio.brownNoiseBuffer;
    shake.loop = true;
    const shakeSmoother = context.createBiquadFilter();
    shakeSmoother.type = 'lowpass';
    shakeSmoother.frequency.value = 45; // TWEAK: how fast the pitch shakes. 8 is a wobble, 60 is a rasp
    const shakeDepth = context.createGain();
    shakeDepth.gain.value = throat[2] * 12; // the smoothed noise is quiet: about 0.08
    shake.connect(shakeSmoother); shakeSmoother.connect(shakeDepth); shakeDepth.connect(oscillator.detune);
    const level = context.createGain();
    level.gain.value = throat[1];
    oscillator.connect(level); level.connect(shriekOverdrive);
    oscillator.start();
    shake.start(0, Math.random() * 1.5);
    audio.hollowVoicedShriekThroats.push({ oscillator: oscillator, pitch: throat[0] });
  }
  const shriekBreath = context.createBufferSource();
  shriekBreath.buffer = audio.whiteNoiseBuffer;
  shriekBreath.loop = true;
  const shriekBreathLevel = context.createGain();
  shriekBreathLevel.gain.value = 0.2; // TWEAK: air in the scream. 0 is all voice, 1 is mostly hiss
  shriekBreath.connect(shriekBreathLevel); shriekBreathLevel.connect(shriekOverdrive);
  shriekBreath.start();
  // The same 58-times-a-second chop as the noise shriek, lighter: the voice is rough enough by itself.
  const voicedShriekRasp = context.createGain();
  const voicedShriekRaspOscillator = context.createOscillator();
  voicedShriekRaspOscillator.frequency.value = 58;
  const voicedShriekRaspDepth = context.createGain();
  voicedShriekRaspDepth.gain.value = 0.3;
  voicedShriekRaspOscillator.connect(voicedShriekRaspDepth); voicedShriekRaspDepth.connect(voicedShriekRasp.gain);
  voicedShriekRaspOscillator.start();
  voicedShriekRasp.connect(audio.hollowVoicedShriekGain);
  // TWEAK: one line per resonance: [Hz before the shriek rises, Hz added at full shriek, sharpness, loudness].
  const shriekFormants = [[950, 700, 5, 1.6], [1900, 900, 7, 1.2], [3300, 1400, 9, 0.7]];
  for (const formant of shriekFormants) {
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = formant[0];
    filter.Q.value = formant[2];
    const level = context.createGain();
    level.gain.value = formant[3];
    shriekOverdrive.connect(filter); filter.connect(level); level.connect(voicedShriekRasp);
    audio.hollowVoicedShriekFormants.push({ filter: filter, restFrequency: formant[0], rise: formant[1] });
  }

  // ---- generator and lift machinery (started later) ----
  // An engine is a low hum plus a rumble that pulses with each firing stroke.
  audio.generatorPanner = createPannerNode(GENERATOR_POSITION.x, GENERATOR_POSITION.y, GENERATOR_POSITION.z, 4, 1.0);
  audio.generatorGain = context.createGain();
  audio.generatorGain.gain.value = 0;
  audio.generatorGain.connect(audio.generatorPanner);
  for (const partial of [[50, 0.5], [100.4, 0.2], [150.9, 0.07]]) {
    const hum = context.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = partial[0];
    const humGain = context.createGain();
    humGain.gain.value = partial[1];
    hum.connect(humGain); humGain.connect(audio.generatorGain);
    hum.start();
  }
  const generatorRattle = context.createBufferSource();
  generatorRattle.buffer = audio.brownNoiseBuffer;
  generatorRattle.loop = true;
  const generatorRattleFilter = context.createBiquadFilter();
  generatorRattleFilter.type = 'lowpass';
  generatorRattleFilter.frequency.value = 420;
  const generatorRattleGain = context.createGain();
  generatorRattleGain.gain.value = 0.7;
  const generatorChug = context.createOscillator();
  generatorChug.frequency.value = 12.5; // firing strokes per second
  const generatorChugDepth = context.createGain();
  generatorChugDepth.gain.value = 0.45;
  generatorChug.connect(generatorChugDepth); generatorChugDepth.connect(generatorRattleGain.gain);
  generatorChug.start();
  generatorRattle.connect(generatorRattleFilter); generatorRattleFilter.connect(generatorRattleGain);
  generatorRattleGain.connect(audio.generatorGain);
  generatorRattle.start();

  audio.liftPanner = createPannerNode(LIFT_POSITION.x, 2.5, LIFT_POSITION.z, 5, 0.8);
  audio.liftGain = context.createGain();
  audio.liftGain.gain.value = 0;
  audio.liftGain.connect(audio.liftPanner);
  for (const partial of [[64, 0.5], [128.6, 0.22], [191, 0.1]]) {
    const liftMotor = context.createOscillator();
    liftMotor.type = 'sine';
    liftMotor.frequency.value = partial[0];
    const liftMotorGain = context.createGain();
    liftMotorGain.gain.value = partial[1];
    liftMotor.connect(liftMotorGain); liftMotorGain.connect(audio.liftGain);
    liftMotor.start();
  }
  const liftRattle = context.createBufferSource();
  liftRattle.buffer = audio.brownNoiseBuffer;
  liftRattle.loop = true;
  const liftRattleFilter = context.createBiquadFilter();
  liftRattleFilter.type = 'bandpass';
  liftRattleFilter.frequency.value = 340;
  liftRattleFilter.Q.value = 0.7;
  liftRattle.connect(liftRattleFilter); liftRattleFilter.connect(audio.liftGain);
  liftRattle.start();

  audio.ambienceGain.gain.setTargetAtTime(getRoomToneLevel(), context.currentTime, 2.5);
}

// Called when a different station is loaded: the generator and the lift are somewhere else now.
function moveMachinerySoundsToLevel() {
  if (!audio.context) return;
  setPannerPosition(audio.generatorPanner, GENERATOR_POSITION.x, GENERATOR_POSITION.y, GENERATOR_POSITION.z);
  setPannerPosition(audio.liftPanner, LIFT_POSITION.x, 2.5, LIFT_POSITION.z);
}

function setMasterVolume(volume) {
  audio.volume = volume;
  if (audio.masterGain) audio.masterGain.gain.setTargetAtTime(volume, audio.context.currentTime, 0.05);
}

function suspendAudio(shouldSuspend) {
  if (!audio.context) return;
  if (shouldSuspend && audio.context.state === 'running') audio.context.suspend();
  if (!shouldSuspend && audio.context.state === 'suspended') audio.context.resume();
}

function createPannerNode(x, y, z, referenceDistance, rolloff) {
  const context = audio.context;
  const panner = context.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = referenceDistance;
  panner.rolloffFactor = rolloff;
  // A new panner is put in its place at once. setPannerPosition glides, which is right for a source that
  // moves, but a new one would glide in from the corner of the map (0, 0, 0) and a short sound would be
  // over before it arrived.
  if (panner.positionX) {
    panner.positionX.value = x; panner.positionY.value = y; panner.positionZ.value = z;
  } else {
    panner.setPosition(x, y, z);
  }
  panner.connect(audio.masterGain);
  const reverbSend = context.createGain();
  reverbSend.gain.value = 0.45;
  panner.connect(reverbSend);
  reverbSend.connect(audio.reverbInput);
  return panner;
}

function setPannerPosition(panner, x, y, z) {
  if (panner.positionX) {
    const now = audio.context.currentTime;
    panner.positionX.setTargetAtTime(x, now, 0.04);
    panner.positionY.setTargetAtTime(y, now, 0.04);
    panner.positionZ.setTargetAtTime(z, now, 0.04);
  } else {
    panner.setPosition(x, y, z);
  }
}

function updateAudioListener(x, y, z, yaw) {
  if (!isAudioReady()) return;
  const listener = audio.context.listener;
  const forwardX = Math.sin(yaw), forwardZ = -Math.cos(yaw);
  if (listener.positionX) {
    const now = audio.context.currentTime;
    listener.positionX.setTargetAtTime(x, now, 0.03);
    listener.positionY.setTargetAtTime(y, now, 0.03);
    listener.positionZ.setTargetAtTime(z, now, 0.03);
    listener.forwardX.setTargetAtTime(forwardX, now, 0.03);
    listener.forwardY.setTargetAtTime(0, now, 0.03);
    listener.forwardZ.setTargetAtTime(forwardZ, now, 0.03);
    listener.upX.value = 0; listener.upY.value = 1; listener.upZ.value = 0;
  } else {
    listener.setPosition(x, y, z); // TODO replace when all browsers support new method
    listener.setOrientation(forwardX, 0, forwardZ, 0, 1, 0); // TODO replace when all browsers support new method
  }
}

// One filtered burst of noise. `destination` defaults to the dry master output.
function playNoiseBurst(options) {
  if (!isAudioReady()) return;
  const context = audio.context;
  const now = context.currentTime + (options.delay || 0);
  const source = context.createBufferSource();
  source.buffer = options.useBrownNoise ? audio.brownNoiseBuffer : audio.whiteNoiseBuffer;
  source.playbackRate.value = options.playbackRate || 1;
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = options.filterType || 'lowpass';
  filter.frequency.setValueAtTime(options.frequency || 800, now);
  if (options.frequencyEnd) filter.frequency.exponentialRampToValueAtTime(options.frequencyEnd, now + options.duration);
  filter.Q.value = options.resonance || 0.8;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(options.gain === undefined ? 0.3 : options.gain, now + (options.attack || 0.004));
  gain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);
  source.connect(filter); filter.connect(gain); gain.connect(options.destination || audio.masterGain);
  if (options.reverbAmount) {
    const send = context.createGain();
    send.gain.value = options.reverbAmount;
    gain.connect(send); send.connect(audio.reverbInput);
  }
  source.start(now, Math.random() * 1.2);
  source.stop(now + options.duration + 0.05);
}

function playTone(options) {
  if (!isAudioReady()) return;
  const context = audio.context;
  const now = context.currentTime + (options.delay || 0);
  const oscillator = context.createOscillator();
  oscillator.type = options.waveform || 'sine';
  oscillator.frequency.setValueAtTime(options.frequency, now);
  if (options.frequencyEnd) oscillator.frequency.exponentialRampToValueAtTime(options.frequencyEnd, now + options.duration);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(options.gain === undefined ? 0.2 : options.gain, now + (options.attack || 0.006));
  gain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);
  oscillator.connect(gain); gain.connect(options.destination || audio.masterGain);
  if (options.reverbAmount) {
    const send = context.createGain();
    send.gain.value = options.reverbAmount;
    gain.connect(send); send.connect(audio.reverbInput);
  }
  oscillator.start(now);
  oscillator.stop(now + options.duration + 0.05);
}

// A pitched, breathy tone: noise squeezed through two very narrow filters. It has a note you can hear, but it
// sounds like wind across a pipe or a bow on metal instead of a synthesiser. Most tonal sounds use this.
// `resonance` is how narrow the filters are: 10 is airy, 40 is nearly a pure whistle.
function playResonantNoise(options) {
  if (!isAudioReady()) return;
  const context = audio.context;
  const now = context.currentTime + (options.delay || 0);
  const resonance = options.resonance || 18;
  const source = context.createBufferSource();
  source.buffer = audio.whiteNoiseBuffer;
  source.loop = true;
  const first = context.createBiquadFilter();
  const second = context.createBiquadFilter();
  for (const filter of [first, second]) {
    filter.type = 'bandpass';
    filter.Q.value = resonance;
    filter.frequency.setValueAtTime(options.frequency, now);
    if (options.frequencyEnd) filter.frequency.exponentialRampToValueAtTime(options.frequencyEnd, now + options.duration);
  }
  const gain = context.createGain();
  // A narrow filter lets very little noise through, so the level is raised to match.
  const level = (options.gain === undefined ? 0.2 : options.gain) * (1.5 + resonance * 0.5);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(level, now + (options.attack || 0.02));
  gain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);
  source.connect(first); first.connect(second); second.connect(gain); gain.connect(options.destination || audio.masterGain);
  if (options.reverbAmount) {
    const send = context.createGain();
    send.gain.value = options.reverbAmount;
    gain.connect(send); send.connect(audio.reverbInput);
  }
  source.start(now, Math.random() * 1.5);
  source.stop(now + options.duration + 0.05);
}

// A custom waveform for a throat. An oscillator normally repeats one fixed shape (sine, sawtooth, ...). A
// PeriodicWave is a shape of our own, written as a list of how loud each harmonic is. Two things make this
// one sound like an animal instead of a synthesiser:
//   - the harmonics fall away gently, like the buzz of vocal folds, so there is plenty for formant filters to shape;
//   - the oscillator runs at HALF the pitch you hear. The even harmonics are the voice itself. The odd ones sit
//     in between, an octave under it: the broken, doubled rattle of a throat pushed too hard.
// `roughness` is how loud those in-between harmonics are: 0 is a clean voice, 1 has dropped a full octave.
function createThroatWave(context, roughness) {
  const harmonicCount = 96;
  const real = new Float32Array(harmonicCount + 1); // cosine parts, left at 0. Entry 0 is a constant offset, also 0.
  const imag = new Float32Array(harmonicCount + 1); // sine parts: entry 1 is the oscillator's own pitch, 2 is twice that, ...
  for (let harmonic = 1; harmonic <= harmonicCount; harmonic++) {
    const isVoice = harmonic % 2 === 0;
    // TWEAK: the power is the brightness of the buzz. -1 is a sawtooth (harsh), -2 is dull and hooty.
    imag[harmonic] = Math.pow(harmonic / 2, -1.15) * (isVoice ? 1 : roughness);
  }
  return context.createPeriodicWave(real, imag);
}

// A voice: a buzzing throat (createThroatWave) that is never quite steady, overdriven with some breath, then
// pushed through formants, the resonances of a mouth. Unlike playResonantNoise this has real vocal pulses in it.
//   pitch, pitchEnd   the note you hear, in Hz. It starts a little under `pitch`, swells to it, and falls to `pitchEnd`.
//   roughness         see createThroatWave (default 0.6)
//   unsteadiness      how far the pitch shakes, in cents. 0 is a machine, 40 is alive, 150 is tearing (default 60)
//   breath            how much air is mixed into the throat before the overdrive, 0 to 1 (default 0.25)
//   drive             how hard the throat is overdriven: 1 is clean, 8 is torn (default 4)
//   formants          one line per resonance: [Hz with the mouth shut, Hz with it open, sharpness, loudness].
//                     The mouth opens over the first third and closes again. Lower numbers are a larger animal.
function playThroatVoice(options) {
  if (!isAudioReady()) return;
  const context = audio.context;
  const now = context.currentTime + (options.delay || 0);
  const duration = options.duration;
  const end = now + duration;
  const mouthOpenTime = now + duration * 0.3;
  const roughness = options.roughness === undefined ? 0.6 : options.roughness;
  if (!audio.throatWaves[roughness]) audio.throatWaves[roughness] = createThroatWave(context, roughness);

  const throat = context.createOscillator();
  throat.setPeriodicWave(audio.throatWaves[roughness]);
  const pitchEnd = options.pitchEnd || options.pitch;
  throat.frequency.setValueAtTime(options.pitch * 0.5 * 0.8, now); // half the pitch: see createThroatWave
  throat.frequency.exponentialRampToValueAtTime(options.pitch * 0.5, now + duration * 0.18);
  throat.frequency.exponentialRampToValueAtTime(pitchEnd * 0.5, end);

  // Slow noise pushes the pitch around, so no two pulses are the same length.
  const shake = context.createBufferSource();
  shake.buffer = audio.brownNoiseBuffer;
  shake.loop = true;
  const shakeSmoother = context.createBiquadFilter();
  shakeSmoother.type = 'lowpass';
  shakeSmoother.frequency.value = 30; // TWEAK: how fast the pitch shakes. 8 is a wobble, 60 is a rasp
  const shakeDepth = context.createGain();
  shakeDepth.gain.value = (options.unsteadiness === undefined ? 60 : options.unsteadiness) * 12; // the smoothed noise is quiet: about 0.08
  shake.connect(shakeSmoother); shakeSmoother.connect(shakeDepth); shakeDepth.connect(throat.detune);

  const breath = context.createBufferSource();
  breath.buffer = audio.whiteNoiseBuffer;
  breath.loop = true;
  const breathLevel = context.createGain();
  breathLevel.gain.value = options.breath === undefined ? 0.25 : options.breath;
  const overdrive = context.createWaveShaper();
  overdrive.curve = createOverdriveCurve(options.drive || 4);
  overdrive.oversample = '2x';
  throat.connect(overdrive);
  breath.connect(breathLevel); breathLevel.connect(overdrive);

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(options.gain === undefined ? 0.3 : options.gain, now + (options.attack || 0.06));
  gain.gain.linearRampToValueAtTime(options.gain === undefined ? 0.3 : options.gain, now + duration * 0.5);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  for (const formant of options.formants) {
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = formant[2];
    filter.frequency.setValueAtTime(formant[0], now);
    filter.frequency.linearRampToValueAtTime(formant[1], mouthOpenTime);
    filter.frequency.linearRampToValueAtTime(formant[0], end);
    const level = context.createGain();
    level.gain.value = formant[3];
    overdrive.connect(filter); filter.connect(level); level.connect(gain);
  }
  gain.connect(options.destination || audio.masterGain);
  if (options.reverbAmount) {
    const send = context.createGain();
    send.gain.value = options.reverbAmount;
    gain.connect(send); send.connect(audio.reverbInput);
  }
  throat.start(now); throat.stop(end + 0.05);
  shake.start(now, Math.random() * 1.5); shake.stop(end + 0.05);
  breath.start(now, Math.random() * 1.5); breath.stop(end + 0.05);
}

// Struck metal. What makes metal sound like metal is that its overtones do NOT line up. A string or a voice
// has overtones at 2, 3, 4 times its note, and the ear hears one note. A steel bar has them at 2.76, 5.4 and 8.93
// times: they clash, and that clash is the clang. (A PeriodicWave can only hold overtones that line up, so it
// cannot do this: here every overtone is a sine wave of its own.) The high overtones die away first, which
// is why a clang starts bright and ends as a hum.
// TWEAK: each line is one kind of object, as the pitch of each overtone against the lowest.
const METAL_SHAPES = {
  bar: [1, 2.76, 5.4, 8.93, 13.34],                          // a rail, a pipe, one bar of a grate: clear and ringing
  plate: [1, 1.58, 2.5, 2.92, 4, 5, 5.43, 6.5, 8.5],         // sheet metal, a duct, a door: dense, a boom with a rattle on top
  bell: [0.5, 1, 1.2, 1.5, 2, 2.5, 3, 4]                     // a cast bell. `frequency` is the note you hear, with a hum an octave under it
};

//   frequency   the lowest overtone, in Hz. Lower is a larger or thinner piece of metal.
//   shape       'bar', 'plate' or 'bell': see METAL_SHAPES (default 'bar')
//   duration    how long the lowest overtone rings, in seconds. Short is metal held or bolted down, long hangs free.
//   hardness    what hit it, 0 to 1. 0 is a boot or a knee: mostly the low overtones, no click. 1 is steel on steel (default 0.5)
//   damping     how much sooner the high overtones die than the low ones. 0: they all ring on, like a bell. 1: only a hum is left (default 0.7)
//   bend        how far the pitch sags after the hit, as thin sheet metal does when it buckles. 0.04 is 4 percent (default 0)
function playMetalStrike(options) {
  if (!isAudioReady()) return;
  const context = audio.context;
  const now = context.currentTime + (options.delay || 0);
  const ratios = METAL_SHAPES[options.shape || 'bar'];
  const hardness = options.hardness === undefined ? 0.5 : options.hardness;
  const damping = options.damping === undefined ? 0.7 : options.damping;
  const loudness = options.gain === undefined ? 0.3 : options.gain;
  const tilt = 2 - 1.8 * hardness; // a soft hit leaves the high overtones much quieter than the low ones
  let total = 0;
  for (const ratio of ratios) total += Math.pow(ratio, -tilt);
  const output = context.createGain();
  output.gain.value = loudness / total; // all the overtones together are never louder than `gain`
  output.connect(options.destination || audio.masterGain);
  if (options.reverbAmount) {
    const send = context.createGain();
    send.gain.value = options.reverbAmount;
    output.connect(send); send.connect(audio.reverbInput);
  }
  for (const ratio of ratios) {
    // TWEAK: 0.03 is how far each overtone may sit off its place (3 percent), so no two strikes are the same piece of metal.
    const frequency = options.frequency * ratio * (1 + (Math.random() - 0.5) * 0.03);
    if (frequency > 14000) continue;
    const ringTime = options.duration * Math.pow(ratio, -damping);
    const overtone = context.createOscillator();
    overtone.frequency.setValueAtTime(frequency * (1 + (options.bend || 0)), now);
    if (options.bend) overtone.frequency.exponentialRampToValueAtTime(frequency, now + ringTime * 0.5);
    const level = context.createGain();
    level.gain.setValueAtTime(Math.pow(ratio, -tilt), now);
    level.gain.exponentialRampToValueAtTime(0.0001, now + ringTime);
    overtone.connect(level); level.connect(output);
    overtone.start(now);
    overtone.stop(now + ringTime + 0.05);
  }
  // The hit itself: a click, louder and brighter the harder the thing that struck.
  if (hardness > 0) {
    playNoiseBurst({ duration: 0.03, filterType: 'bandpass', frequency: Math.min(9000, options.frequency * (3 + hardness * 9)), resonance: 1, gain: loudness * hardness * 0.6,
      attack: 0.001, delay: options.delay, destination: options.destination, reverbAmount: options.reverbAmount });
  }
}

// Water. The sound of water is not the water, it is air: every drop and every splash traps bubbles, and each
// bubble rings for a few hundredths of a second, a clean note that slides UP as it dies. One bubble is a drip.
// Dozens of all sizes, tumbling over each other, is a splash. Noise alone only ever gives the hiss of spray.
//   count                     how many bubbles
//   spread                    over how many seconds they start. Most come early. 0 is all at once.
//   frequency, frequencyMax   the notes they are picked from, in Hz. A large bubble is low (300), a small one high (4000).
//   ring                      how long the lowest one rings, in seconds. Higher ones are shorter (default 0.06)
//   rise                      how far each note slides up. 0.5 is half as high again: the "bloop" (default 0.5)
function playWaterBubbles(options) {
  if (!isAudioReady()) return;
  const context = audio.context;
  const now = context.currentTime + (options.delay || 0);
  const count = options.count || 1;
  const spread = options.spread || 0;
  const lowest = options.frequency, highest = options.frequencyMax || options.frequency;
  const ring = options.ring || 0.06;
  const rise = options.rise === undefined ? 0.5 : options.rise;
  const output = context.createGain();
  output.gain.value = (options.gain === undefined ? 0.3 : options.gain) / Math.sqrt(count); // many bubbles rarely peak together
  output.connect(options.destination || audio.masterGain);
  if (options.reverbAmount) {
    const send = context.createGain();
    send.gain.value = options.reverbAmount;
    output.connect(send); send.connect(audio.reverbInput);
  }
  for (let bubbleIndex = 0; bubbleIndex < count; bubbleIndex++) {
    const early = Math.random() * Math.random(); // between 0 and 1, mostly near 0
    const start = now + spread * early;
    const frequency = lowest * Math.pow(highest / lowest, Math.random());
    const ringTime = ring * Math.sqrt(lowest / frequency);
    const bubble = context.createOscillator();
    bubble.frequency.setValueAtTime(frequency, start);
    bubble.frequency.exponentialRampToValueAtTime(frequency * (1 + rise), start + ringTime);
    const level = context.createGain();
    level.gain.setValueAtTime(0.0001, start);
    level.gain.linearRampToValueAtTime((0.4 + Math.random() * 0.6) * (1 - early * 0.7), start + 0.002); // the late ones are the small ones
    level.gain.exponentialRampToValueAtTime(0.0001, start + ringTime);
    bubble.connect(level); level.connect(output);
    bubble.start(start);
    bubble.stop(start + ringTime + 0.02);
  }
}

function createTemporaryPanner(x, y, z) {
  if (!isAudioReady()) return null;
  const panner = createPannerNode(x, y, z, 2.5, 1.2);
  window.setTimeout(function () { try { panner.disconnect(); } catch (error) { /* already released */ } }, 6000);
  return panner;
}

// ---------------------------------------------------------------------------
// Voice recordings
//
// Recordings are made clean and dry (see docs/voice-lines.md). The game roughs them up itself:
// 'radio' squeezes the voice into a narrow band, overdrives it, lays static under it and lets it drop out;
// 'recorder' is a gentler version for the survey spools, like a small dictation machine.
// ---------------------------------------------------------------------------

// TWEAK: the sound of each treatment.
//   lowCut / highCut  the voice is only allowed between these two frequencies (Hz). Closer together = thinner, more "phone".
//   drive             overdrive. 1 is clean, 8 is a blown speaker.
//   staticLevel       loudness of the hiss underneath (0 = none).
//   dropoutsPerSecond how often the signal briefly cuts down (0 = never).
//   level             loudness of the voice before SOUND_LEVELS.voiceRadio / voiceRecorder is applied. Tune it there.
const VOICE_TREATMENTS = {
  radio: { lowCut: 520, highCut: 2600, drive: 6, staticLevel: 0.07, dropoutsPerSecond: 1.7, level: 0.35 },
  recorder: { lowCut: 160, highCut: 4200, drive: 1.6, staticLevel: 0.012, dropoutsPerSecond: 0, level: 0.4 }
};

const voiceState = {
  decodedBuffers: {},
  pendingDecodes: {},
  stopCurrentLine: null
};

function hasVoiceLine(key) {
  return Boolean(voiceState.decodedBuffers[key]) || Boolean(EMBEDDED_VOICE_LINES[key]);
}

// Turns a packed recording back into sound the audio engine can play. Each one is decoded once and kept.
function loadVoiceLine(key) {
  if (voiceState.decodedBuffers[key]) return Promise.resolve(voiceState.decodedBuffers[key]);
  if (voiceState.pendingDecodes[key]) return voiceState.pendingDecodes[key];
  const packed = EMBEDDED_VOICE_LINES[key];
  if (!packed || !audio.context) return Promise.resolve(null);
  const binary = window.atob(packed.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  voiceState.pendingDecodes[key] = new Promise(function (resolve) {
    const finish = function (buffer) { voiceState.decodedBuffers[key] = buffer; resolve(buffer); };
    const fail = function () { resolve(null); };
    try {
      const result = audio.context.decodeAudioData(bytes.buffer, finish, fail);
      if (result && typeof result.catch === 'function') result.catch(fail);
    } catch (error) { fail(); }
  });
  return voiceState.pendingDecodes[key];
}

function createOverdriveCurve(drive) {
  const curve = new Float32Array(1024);
  for (let index = 0; index < curve.length; index++) {
    const input = index / (curve.length - 1) * 2 - 1;
    curve[index] = Math.tanh(input * drive) / Math.tanh(drive);
  }
  return curve;
}

function stopVoiceLine() {
  if (voiceState.stopCurrentLine) voiceState.stopCurrentLine();
  voiceState.stopCurrentLine = null;
}

// Plays one recording. `whenLengthKnown` is told how many seconds it lasts, so its text can stay up that long.
// Returns false straight away if there is no recording for this key (the game then shows text only).
function playVoiceLine(key, treatmentName, startDelay, whenLengthKnown) {
  if (!isAudioReady() || !hasVoiceLine(key)) return false;
  const treatment = VOICE_TREATMENTS[treatmentName] || VOICE_TREATMENTS.radio;
  const loudness = treatmentName === 'recorder' ? SOUND_LEVELS.voiceRecorder : SOUND_LEVELS.voiceRadio;
  loadVoiceLine(key).then(function (buffer) {
    if (!buffer || !isAudioReady()) return;
    stopVoiceLine();
    const context = audio.context;
    const startTime = context.currentTime + (startDelay || 0);
    const endTime = startTime + buffer.duration;
    if (whenLengthKnown) whenLengthKnown(buffer.duration + (startDelay || 0));

    const source = context.createBufferSource();
    source.buffer = buffer;
    const lowCut = context.createBiquadFilter();
    lowCut.type = 'highpass';
    lowCut.frequency.value = treatment.lowCut;
    const highCut = context.createBiquadFilter();
    highCut.type = 'lowpass';
    highCut.frequency.value = treatment.highCut;
    const presence = context.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = Math.sqrt(treatment.lowCut * treatment.highCut) * 1.5;
    presence.Q.value = 1.1;
    presence.gain.value = 6;
    const overdrive = context.createWaveShaper();
    overdrive.curve = createOverdriveCurve(treatment.drive);
    const level = context.createGain();
    const voiceLevel = treatment.level * loudness, hissLevelValue = treatment.staticLevel * loudness;
    level.gain.setValueAtTime(voiceLevel, startTime);
    // Dropouts: the signal ducks for a few hundredths of a second, as if the carrier fades.
    if (treatment.dropoutsPerSecond > 0) {
      let dropoutTime = startTime + Math.random() / treatment.dropoutsPerSecond;
      while (dropoutTime < endTime - 0.15) {
        const dropoutLength = 0.04 + Math.random() * 0.07;
        level.gain.setValueAtTime(voiceLevel * (0.15 + Math.random() * 0.3), dropoutTime);
        level.gain.setValueAtTime(voiceLevel, dropoutTime + dropoutLength);
        dropoutTime += (0.4 + Math.random() * 1.6) / treatment.dropoutsPerSecond;
      }
    }
    source.connect(lowCut); lowCut.connect(presence); presence.connect(overdrive); overdrive.connect(highCut);
    highCut.connect(level); level.connect(audio.masterGain);

    // Hiss for as long as the channel is open.
    const hiss = context.createBufferSource();
    hiss.buffer = audio.whiteNoiseBuffer;
    hiss.loop = true;
    const hissFilter = context.createBiquadFilter();
    hissFilter.type = 'bandpass';
    hissFilter.frequency.value = 2200;
    hissFilter.Q.value = 0.6;
    const hissLevel = context.createGain();
    hissLevel.gain.setValueAtTime(0.0001, startTime);
    hissLevel.gain.linearRampToValueAtTime(hissLevelValue, startTime + 0.05);
    hissLevel.gain.setValueAtTime(hissLevelValue, endTime);
    hissLevel.gain.linearRampToValueAtTime(0.0001, endTime + 0.12);
    hiss.connect(hissFilter); hissFilter.connect(hissLevel); hissLevel.connect(audio.masterGain);

    source.start(startTime);
    hiss.start(startTime);
    hiss.stop(endTime + 0.15);
    // The click of the channel closing.
    if (treatmentName === 'radio') playNoiseBurst({ duration: 0.09, filterType: 'bandpass', frequency: 1900, gain: 0.12 * loudness, resonance: 2.5, delay: (startDelay || 0) + buffer.duration + 0.02 });

    let hasStopped = false;
    voiceState.stopCurrentLine = function () {
      if (hasStopped) return;
      hasStopped = true;
      try { source.stop(); hiss.stop(); } catch (error) { /* already finished */ }
      try { level.disconnect(); hissLevel.disconnect(); } catch (error) { /* already released */ }
    };
    source.onended = function () { if (voiceState.stopCurrentLine && !hasStopped) { hasStopped = true; voiceState.stopCurrentLine = null; } };
  });
  return true;
}

// ---------------------------------------------------------------------------
// Sound events
// ---------------------------------------------------------------------------

function playFootstepSound(isInWater, isOnGrate, loudness) {
  if (isInWater && audio.waterBubbles) {
    const level = loudness * SOUND_LEVELS.footstepWater;
    // The foot goes in: a dull push of water and one big gulp of air dragged under with it.
    playNoiseBurst({ duration: 0.22, frequency: 700, frequencyEnd: 260, gain: 0.45 * level, useBrownNoise: true, playbackRate: 1.4, attack: 0.01, reverbAmount: 0.4 });
    playWaterBubbles({ count: 2, spread: 0.03, frequency: 170, frequencyMax: 300, ring: 0.11, rise: 0.35, gain: 0.22 * level, reverbAmount: 0.4 });
    // The splash: bubbles of every size, more of them the harder you run.
    playWaterBubbles({ count: Math.round(10 + loudness * 16), spread: 0.3, frequency: 450, frequencyMax: 3800, ring: 0.06, gain: 0.32 * level, delay: 0.02, reverbAmount: 0.5 });
    // A little spray off the top.
    playNoiseBurst({ duration: 0.14, filterType: 'bandpass', frequency: 5200, gain: 0.16 * level, delay: 0.04 });
    return;
  }
  if (isInWater) {
    playNoiseBurst({ duration: 0.32, frequency: 1500, frequencyEnd: 420, gain: 2.3 * loudness * SOUND_LEVELS.footstepWater, resonance: 1.4, reverbAmount: 0.5 });
    playNoiseBurst({ duration: 0.18, filterType: 'bandpass', frequency: 3200, gain: 2.1 * loudness * SOUND_LEVELS.footstepWater, delay: 0.05 });
    return;
  }
  playNoiseBurst({ duration: 0.11, frequency: 520 + Math.random() * 180, gain: 2.26 * loudness * SOUND_LEVELS.footstep, useBrownNoise: true, playbackRate: 1.6, reverbAmount: 0.35 });
  playNoiseBurst({ duration: 0.04, filterType: 'bandpass', frequency: 2100, gain: 2.05 * loudness * SOUND_LEVELS.footstep });
  if (isOnGrate && audio.metalStruck) {
    // A boot comes down on two bars of the grate, one a moment after the other.
    playMetalStrike({ shape: 'bar', frequency: 410 + Math.random() * 90, duration: 0.45, hardness: 0.4, damping: 0.8, gain: 1.6 * loudness * SOUND_LEVELS.footstep, reverbAmount: 0.6 });
    playMetalStrike({ shape: 'bar', frequency: 560 + Math.random() * 120, duration: 0.3, hardness: 0.5, damping: 0.8, gain: 0.9 * loudness * SOUND_LEVELS.footstep, delay: 0.018, reverbAmount: 0.6 });
  } else if (isOnGrate) playTone({ waveform: 'triangle', frequency: 610 + Math.random() * 90, frequencyEnd: 560, duration: 0.25, gain: 2.07 * loudness * SOUND_LEVELS.footstep, reverbAmount: 0.6 });
}

function setScannerSound(paintLevel) {
  if (!isAudioReady()) return;
  const now = audio.context.currentTime;
  audio.scannerGain.gain.setTargetAtTime(paintLevel * 0.16 * SOUND_LEVELS.scanner, now, 0.03);
  audio.scannerWhineGain.gain.setTargetAtTime(paintLevel * 0.012 * SOUND_LEVELS.scanner, now, 0.05);
}

function playSweepSound(duration) {
  // A motor winding down: a falling whistle of air, a soft falling tone under it, and hiss.
  playResonantNoise({ frequency: 1300, frequencyEnd: 320, resonance: 22, duration: duration, gain: 0.21 * SOUND_LEVELS.sweep, attack: 0.06, reverbAmount: 0.8 });
  playTone({ waveform: 'sine', frequency: 1150, frequencyEnd: 160, duration: duration, gain: 0.05 * SOUND_LEVELS.sweep, attack: 0.08, reverbAmount: 0.5 });
  playNoiseBurst({ duration: duration, filterType: 'bandpass', frequency: 5200, frequencyEnd: 900, gain: 0.1 * SOUND_LEVELS.sweep, attack: 0.08, resonance: 3 });
}

function playOverheatSound() {
  playNoiseBurst({ duration: 0.8, filterType: 'bandpass', frequency: 3000, gain: 0.36 * SOUND_LEVELS.overheat, attack: 0.02 });
  playTone({ waveform: 'sine', frequency: 210, frequencyEnd: 95, duration: 0.35, gain: 0.12 * SOUND_LEVELS.overheat });
}

function playInterfaceBlip(pitch) {
  // A soft tick with a hint of pitch, like a membrane button.
  playTone({ waveform: 'sine', frequency: pitch || 880, frequencyEnd: (pitch || 880) * 0.85, duration: 0.09, gain: 0.29 * SOUND_LEVELS.interfaceBlip, attack: 0.003 });
  playNoiseBurst({ duration: 0.02, filterType: 'bandpass', frequency: 2600, gain: 0.05 * SOUND_LEVELS.interfaceBlip, resonance: 1.5 });
}

function playRadioBlip() {
  // A radio opening: squelch, then two short tones heard through a small speaker.
  playNoiseBurst({ duration: 0.16, filterType: 'bandpass', frequency: 1900, gain: 1.86 * SOUND_LEVELS.radioBlip, resonance: 2.5 });
  playResonantNoise({ frequency: 1320, resonance: 30, duration: 0.09, gain: 2.52 * SOUND_LEVELS.radioBlip, attack: 0.005, delay: 0.12 });
  playResonantNoise({ frequency: 990, resonance: 30, duration: 0.12, gain: 2.52 * SOUND_LEVELS.radioBlip, attack: 0.005, delay: 0.2 });
}

function playPickupSound() {
  playTone({ waveform: 'triangle', frequency: 660, duration: 0.12, gain: 0.22 * SOUND_LEVELS.pickup });
  playTone({ waveform: 'triangle', frequency: 990, duration: 0.22, gain: 0.22 * SOUND_LEVELS.pickup, delay: 0.09, reverbAmount: 0.4 });
  playNoiseBurst({ duration: 0.15, frequency: 900, gain: 0.12 * SOUND_LEVELS.pickup, useBrownNoise: true, playbackRate: 2 });
}

function playDeniedSound() {
  // Two dull thuds of a lock that will not turn.
  playTone({ waveform: 'triangle', frequency: 150, frequencyEnd: 110, duration: 0.14, gain: 2.5 * SOUND_LEVELS.denied, attack: 0.004 });
  playTone({ waveform: 'triangle', frequency: 125, frequencyEnd: 90, duration: 0.2, gain: 2.5 * SOUND_LEVELS.denied, attack: 0.004, delay: 0.17 });
  playNoiseBurst({ duration: 0.05, frequency: 700, gain: 0.12 * SOUND_LEVELS.denied, useBrownNoise: true, playbackRate: 2 });
  playNoiseBurst({ duration: 0.05, frequency: 700, gain: 0.12 * SOUND_LEVELS.denied, useBrownNoise: true, playbackRate: 2, delay: 0.17 });
}

function playDoorSound(x, z, isOpening) {
  const panner = createTemporaryPanner(x, 1.2, z);
  if (!panner) return;
  playNoiseBurst({ duration: 0.75, filterType: 'bandpass', frequency: isOpening ? 700 : 1500, frequencyEnd: isOpening ? 2400 : 500, gain: 2.7 * SOUND_LEVELS.door, attack: 0.05, resonance: 1.6, destination: panner });
  playNoiseBurst({ duration: 0.16, frequency: 240, gain: 2.9 * SOUND_LEVELS.door, useBrownNoise: true, playbackRate: 1.3, delay: 0.62, destination: panner });
  if (audio.metalStruck) {
    // The slab meets its frame, and the latch drops a moment before.
    playMetalStrike({ shape: 'plate', frequency: 120, duration: 0.7, hardness: 0.55, gain: 1.8 * SOUND_LEVELS.door, delay: 0.62, destination: panner });
    playMetalStrike({ shape: 'bar', frequency: 880, duration: 0.12, hardness: 0.9, gain: 0.6 * SOUND_LEVELS.door, delay: 0.59, destination: panner });
  } else playTone({ waveform: 'triangle', frequency: 92, frequencyEnd: 60, duration: 0.3, gain: 2.7 * SOUND_LEVELS.door, delay: 0.62, destination: panner });
}

// Your own knees and elbows on sheet metal: a dull boom that rings on.
function playVentCrawlSound() {
  playNoiseBurst({ duration: 0.22, frequency: 260, gain: 0.34 * SOUND_LEVELS.ventCrawl, useBrownNoise: true, playbackRate: 1.1, reverbAmount: 0.6 });
  if (audio.metalStruck) {
    // The duct's floor buckles under a knee and springs back.
    playMetalStrike({ shape: 'plate', frequency: 95 + Math.random() * 30, duration: 0.9, hardness: 0.25, bend: 0.04, gain: 0.2 * SOUND_LEVELS.ventCrawl, reverbAmount: 0.7 });
    return;
  }
  playResonantNoise({ frequency: 190 + Math.random() * 60, resonance: 16, duration: 0.5, gain: 0.1 * SOUND_LEVELS.ventCrawl, attack: 0.004, reverbAmount: 0.7 });
  playNoiseBurst({ duration: 0.05, filterType: 'bandpass', frequency: 1700, gain: 0.05 * SOUND_LEVELS.ventCrawl });
}

// The Hollow above the ceiling, on its way round a door it cannot open. A dull, heavy thump from overhead,
// from where it is at that moment, so that you can hear which way it is going.
// TWEAK: `gain` is how loud each layer is. The first is the weight coming down, the second the ceiling panel giving under it.
function playHollowCeilingStep(x, z, weight) {
  const panner = createTemporaryPanner(x, getFloorHeightAt(x, z) + getHeadroomAt(x, z) + 0.3, z);
  if (!panner) return;
  const level = weight * SOUND_LEVELS.hollowCeilingStep;
  playNoiseBurst({ duration: 0.34, frequency: 170, gain: 2.8 * level, useBrownNoise: true, playbackRate: 0.7, destination: panner });
  playResonantNoise({ frequency: 92 + Math.random() * 26, resonance: 14, duration: 0.6, gain: 1.4 * level, attack: 0.005, destination: panner });
  playNoiseBurst({ duration: 0.09, filterType: 'bandpass', frequency: 1300, gain: 0.5 * level, delay: 0.05, destination: panner });
}

// A ceiling hatch shaken in its frame: the Hollow has just gone up through it, or it is right above it and
// about to come down. Two or three loose metal knocks.
// TWEAK: `weight` is passed in by the game (it grows as the drop gets nearer); the gains are each knock's layers.
function playHatchRattle(x, z, weight) {
  const panner = createTemporaryPanner(x, getFloorHeightAt(x, z) + getHeadroomAt(x, z), z);
  if (!panner) return;
  const level = weight * SOUND_LEVELS.hatchRattle, knocks = 2 + Math.floor(Math.random() * 2);
  for (let knock = 0; knock < knocks; knock++) {
    const delay = knock * (0.09 + Math.random() * 0.05);
    playResonantNoise({ frequency: 380 + Math.random() * 160, resonance: 22, duration: 0.28, gain: 1.6 * level, attack: 0.002, delay: delay, destination: panner });
    playNoiseBurst({ duration: 0.05, filterType: 'bandpass', frequency: 2600, gain: 0.9 * level, delay: delay, destination: panner });
  }
}

// The Hollow in a vent. Louder and longer than its footsteps, and it carries: this is the warning you get.
function playHollowVentStep(x, z, weight) {
  const panner = createTemporaryPanner(x, getFloorHeightAt(x, z) + 0.6, z);
  if (!panner) return;
  playNoiseBurst({ duration: 0.3, frequency: 240, gain: 2.5 * weight * SOUND_LEVELS.hollowVentStep, useBrownNoise: true, playbackRate: 0.8, destination: panner });
  if (audio.metalStruck) {
    // Something much heavier than you on the same sheet metal: lower, longer, and it buckles further.
    playMetalStrike({ shape: 'plate', frequency: 68 + Math.random() * 24, duration: 1.4, hardness: 0.35, bend: 0.06, gain: 1.3 * weight * SOUND_LEVELS.hollowVentStep, destination: panner });
    return;
  }
  playResonantNoise({ frequency: 150 + Math.random() * 50, resonance: 18, duration: 0.7, gain: 1.5 * weight * SOUND_LEVELS.hollowVentStep, attack: 0.004, destination: panner });
  playNoiseBurst({ duration: 0.07, filterType: 'bandpass', frequency: 2200, gain: 1.25 * weight * SOUND_LEVELS.hollowVentStep, delay: 0.04, destination: panner });
}

function playHollowFootstep(x, z, weight) {
  const panner = createTemporaryPanner(x, 0.1, z);
  if (!panner) return;
  playNoiseBurst({ duration: 0.2, frequency: 300, gain: 3.0 * weight * SOUND_LEVELS.hollowFootstep, useBrownNoise: true, playbackRate: 0.9, destination: panner });
  playNoiseBurst({ duration: 0.09, filterType: 'bandpass', frequency: 1400, gain: 2.22 * weight * SOUND_LEVELS.hollowFootstep, delay: 0.03, destination: panner });
}

// An apparition standing close behind you: one slow breath out, from where it stands. Nothing real in the
// station makes this sound, so once you know it you know what it means.
// TWEAK: `gain` is how loud each part is. The first line is the air, the second the faint low note under it.
function playPhantomBreath(x, z) {
  const panner = createTemporaryPanner(x, getFloorHeightAt(x, z) + 1.7, z);
  if (!panner) return;
  playNoiseBurst({ duration: 1.5, filterType: 'bandpass', frequency: 950, frequencyEnd: 520, resonance: 1.4, gain: 1.0, attack: 0.55, destination: panner });
  playResonantNoise({ frequency: 233, frequencyEnd: 207, resonance: 30, duration: 1.4, gain: 0.32, attack: 0.5, destination: panner });
}

// A Still moving while nothing is scanning it: one dry scrape of a foot.
function playStillShuffleSound(x, z) {
  const panner = createTemporaryPanner(x, 0.1, z);
  if (!panner) return;
  playNoiseBurst({ duration: 0.16, filterType: 'bandpass', frequency: 900, resonance: 3, gain: 2.5 * SOUND_LEVELS.stillShuffle, useBrownNoise: true, playbackRate: 2.4, destination: panner });
}

function playHollowClickTrain(clickCount, startInterval, endInterval, loudness) {
  if (!isAudioReady()) return;
  // Hard, hollow knocks, like knuckles of bone. Each one is a tiny burst of noise ringing in a narrow filter.
  let delay = 0;
  for (let clickIndex = 0; clickIndex < clickCount; clickIndex++) {
    const interval = interpolateLinear(startInterval, endInterval, clickIndex / Math.max(1, clickCount - randomBetween(1, 3)));
    playNoiseBurst({ duration: 0.035, filterType: 'bandpass', frequency: 850 + Math.random() * 900, resonance: 14, gain: loudness * 12, attack: 0.001, delay: delay, destination: audio.hollowPanner });
    delay += interval * (0.8 + Math.random() * 0.3);
  }
}

function updateHollowVoice(x, z, isActive, aggression, shriekLevel, dt, gameTime) {
  if (!isAudioReady()) return;
  const now = audio.context.currentTime;
  if (!isActive) {
    audio.hollowGrowlGain.gain.setTargetAtTime(0, now, 0.2);
    audio.hollowScreechGain.gain.setTargetAtTime(0, now, 0.1);
    audio.hollowVoicedShriekGain.gain.setTargetAtTime(0, now, 0.1);
    return;
  }
  setPannerPosition(audio.hollowPanner, x, getFloorHeightAt(x, z) + 1.7, z);
  // TWEAK: the shape of the growl. First number: when it is calm. Second: added when it is hunting.
  audio.hollowGrowlGain.gain.setTargetAtTime((0.2 + aggression * 0.85) * SOUND_LEVELS.hollowGrowl, now, 0.3);
  // The rattle in its throat runs faster the more aggressive it is.
  audio.hollowThroatSource.playbackRate.setTargetAtTime(0.8 + aggression * 0.55, now, 0.4);
  // Only one of the two shrieks is heard: the one made of noise, or the voiced one (audio.hollowShriekVoiced).
  const shriekLoudness = shriekLevel * shriekLevel * SOUND_LEVELS.hollowShriek;
  audio.hollowScreechGain.gain.setTargetAtTime(audio.hollowShriekVoiced ? 0 : shriekLoudness * 2.4, now, 0.08);
  audio.hollowVoicedShriekGain.gain.setTargetAtTime(audio.hollowShriekVoiced ? shriekLoudness * 0.5 : 0, now, 0.08);
  // TWEAK: 0.7 is how far the voiced shriek's pitch climbs at full strength: 1 would be a whole octave.
  for (const throat of audio.hollowVoicedShriekThroats) throat.oscillator.frequency.setTargetAtTime(throat.pitch * 0.5 * (1 + shriekLevel * 0.7), now, 0.1);
  for (const formant of audio.hollowVoicedShriekFormants) formant.filter.frequency.setTargetAtTime(formant.restFrequency + shriekLevel * formant.rise, now, 0.1);
  audio.hollowScreechFilter.frequency.setTargetAtTime(1200 + shriekLevel * 1500, now, 0.1);
  audio.hollowScreechFilterHigh.frequency.setTargetAtTime(2600 + shriekLevel * 2600, now, 0.1);
  if (gameTime >= audio.nextHollowClickTime) {
    if (aggression > 0.6) playHollowClickTrain(10 + Math.floor(Math.random() * 8), 0.05, 0.022, 0.9 * SOUND_LEVELS.hollowClicks);
    else playHollowClickTrain(4 + Math.floor(Math.random() * 7), 0.13, 0.05, 0.55 * SOUND_LEVELS.hollowClicks);
    audio.nextHollowClickTime = gameTime + (aggression > 0.6 ? randomBetween(0.9, 1.8) : randomBetween(2.5, 6.5));
  }
}

// Turns off everything that belongs to play itself: the growl, the shriek, the static and the scanner's ticking.
// Called whenever the game leaves play for a screen (title, death, ending), so nothing is left running under it.
function silenceGameplaySounds() {
  if (!isAudioReady()) return;
  const now = audio.context.currentTime;
  for (const node of [audio.hollowGrowlGain, audio.hollowScreechGain, audio.hollowVoicedShriekGain, audio.staticGain, audio.scannerGain, audio.scannerWhineGain]) {
    node.gain.cancelScheduledValues(now);
    node.gain.setTargetAtTime(0, now, 0.05);
  }
}

// ---- The Hollow's voice, by what it is doing. All of these come from where it stands. ----

// The moment it knows where you are: a roar from the chest, tearing at the top.
// There are two: one made of filtered noise, and one built on a real voice. audio.hollowRoarVoiced picks.
function playHollowRoar() {
  if (audio.hollowRoarVoiced) playHollowVoicedRoar();
  else playHollowNoiseRoar();
}

function playHollowNoiseRoar() {
  if (!isAudioReady()) return;
  const out = audio.hollowPanner;
  playResonantNoise({ waveform: 'sawtooth', frequency: 150, frequencyEnd: 92, resonance: 6, duration: 1.4, gain: 8.06 * SOUND_LEVELS.hollowRoar, attack: 0.05, destination: out });
  playResonantNoise({ waveform: 'sawtooth', frequency: 330, frequencyEnd: 240, resonance: 5, duration: 1.2, gain: 7.16 * SOUND_LEVELS.hollowRoar, attack: 0.04, destination: out });
  playNoiseBurst({ waveform: 'sawtooth', duration: 3, filterType: 'bandpass', frequency: 1800, frequencyEnd: 1600, gain: 4.44 * SOUND_LEVELS.hollowRoar, resonance: 3, attack: 0.03, destination: out });
  playTone({ waveform: 'triangle', frequency: 100, frequencyEnd: 90, filterType: 'bandpass', duration: 3, gain: 2 * SOUND_LEVELS.hollowRoar, attack: 0.02, destination: out });
}

// EXPERIMENT: the same roar built on a real voice (playThroatVoice) instead of filtered noise.
function playHollowVoicedRoar() {
  if (!isAudioReady()) return;
  const out = audio.hollowPanner;
  // The roar itself: starts in the chest, the mouth opens, and it tears on the way down.
  playThroatVoice({ pitch: 100 + Math.random() * 20, pitchEnd: 100 - Math.random() * 20, duration: 4, roughness: 0.8, unsteadiness: 100, breath: 0.2, drive: 3,
    formants: [[260, 560, 4, 2.2], [720, 1250, 6, 1.3], [2100, 2700, 8, 0.6]], gain: 2.4 * SOUND_LEVELS.hollowRoar, attack: 0.11, destination: out });
  // A second, slightly higher throat a moment later, so it is not one clean note.
  playThroatVoice({ pitch: 280 + Math.random() * 40, pitchEnd: 140 + Math.random() * 40, duration: 4, roughness: 0.6, unsteadiness: 140, breath: 0.5, drive: 8,
    formants: [[340, 690, 5, 1.4], [980, 1500, 7, 1.0]], gain: 1.9 * SOUND_LEVELS.hollowRoar, attack: 0.1, delay: 0.16, destination: out });
  // Air over the top, and weight underneath.
  playNoiseBurst({ duration: 3.0, filterType: 'bandpass', frequency: 1900, frequencyEnd: 800, gain: 1.5 * SOUND_LEVELS.hollowRoar, resonance: 4, attack: 0.05, destination: out });
  playTone({ waveform: 'triangle', frequency: 68, duration: 1, gain: 2.5 * SOUND_LEVELS.hollowRoar, attack: 0.06, destination: out });
}

// While it is after you: a short snarl every few seconds, never twice at the same pitch.
function playHollowSnarl() {
  if (!isAudioReady()) return;
  const out = audio.hollowPanner, pitch = 0.85 + Math.random() * randomBetween(0.2, 1.3);
  playResonantNoise({ waveform: 'sawtooth', frequency: 350 * pitch, frequencyEnd: 150 * pitch, resonance: 2, duration: 0.55, gain: 7.25 * SOUND_LEVELS.hollowSnarl, attack: 0.02, destination: out });
  playNoiseBurst({ waveform: 'sawtooth', duration: 0.45, filterType: 'highpass', frequency: 1500 * pitch, frequencyEnd: 700 * pitch, gain: 5.25 * SOUND_LEVELS.hollowSnarl, resonance: 3, attack: 0.02, destination: out });
}

// It has lost you: one long breath out through its teeth.
function playHollowLostHiss() {
  if (!isAudioReady()) return;
  playNoiseBurst({ duration: 1, filterType: 'notch', frequency: 3200, frequencyEnd: 1100, gain: 1.01 * SOUND_LEVELS.hollowHiss, resonance: 2, attack: 0.25, destination: audio.hollowPanner });
  playResonantNoise({ frequency: 260, frequencyEnd: 150, resonance: 8, duration: 1.4, gain: 1.01 * SOUND_LEVELS.hollowHiss, attack: 0.25, destination: audio.hollowPanner });
}

// Searching: it tests the air. Two or three short pulls of breath, then a low huff.
function playHollowSniff() {
  if (!isAudioReady()) return;
  const out = audio.hollowPanner, pulls = 2 + Math.floor(Math.random() * 3);
  for (let pull = 0; pull < pulls; pull++) {
    playNoiseBurst({ duration: 0.14, filterType: 'highpass', frequency: 900, frequencyEnd: 2400, gain: 3.63 * SOUND_LEVELS.hollowSniff, resonance: 2.5, attack: 0.03, delay: pull * 0.24, destination: out });
  }
  playResonantNoise({ frequency: 170, frequencyEnd: 120, resonance: 7, duration: 0.5, gain: 2.96 * SOUND_LEVELS.hollowSniff, attack: 0.05, delay: pulls * 0.24 + 0.1, destination: out });
}

// It has heard something and is coming to look: a quick run of clicks that speeds up, ending on a rising note.
function playHollowCuriousTrill() {
  if (!isAudioReady()) return;
  const ticks = randomBetween(4, 20);
  playHollowClickTrain(ticks, 0.05 * ticks * 0.1, 0.035 * ticks * 0.07, 1.8 * SOUND_LEVELS.hollowTrill);
}

function playHeartbeat(strength) {
  playTone({ frequency: 62, frequencyEnd: 38, duration: 0.16, gain: 0.8 * strength * SOUND_LEVELS.heartbeat, attack: 0.008 });
  playTone({ frequency: 54, frequencyEnd: 34, duration: 0.2, gain: 0.58 * strength * SOUND_LEVELS.heartbeat, attack: 0.008, delay: 0.21 });
}

function updateHeartbeat(threat, gameTime) {
  if (threat < 0.12 || gameTime < audio.nextHeartbeatTime) return;
  playHeartbeat(Math.min(1, 0.25 + threat * 0.9));
  audio.nextHeartbeatTime = gameTime + interpolateLinear(1.25, 0.42, threat);
}

function setInterferenceSound(level) {
  if (!isAudioReady()) return;
  audio.staticGain.gain.setTargetAtTime(level * level * 0.22 * SOUND_LEVELS.interference, audio.context.currentTime, 0.06);
}

function playStinger(kind) {
  if (kind === 'phantom') {
    // Three faint notes that sag, like a breath across bottles.
    for (const frequency of [311, 329, 466]) playResonantNoise({ frequency: frequency, frequencyEnd: frequency * 0.94, resonance: 34, duration: 3.0, gain: 0.11 * SOUND_LEVELS.stingerPhantom, attack: 0.6, reverbAmount: 0.9 });
  } else if (kind === 'spotted') {
    // A cluster of close, clashing notes swelling out of a thud.
    for (const frequency of [196, 207.6, 277, 293.6]) playResonantNoise({ frequency: frequency, frequencyEnd: frequency * 1.07, resonance: 26, duration: 1.8, gain: 0.06 * SOUND_LEVELS.stingerSpotted, attack: 0.03, reverbAmount: 0.7 });
    playNoiseBurst({ duration: 0.6, frequency: 400, gain: 0.5 * SOUND_LEVELS.stingerSpotted, useBrownNoise: true, reverbAmount: 0.6 });
    playTone({ frequency: 58, frequencyEnd: 36, duration: 0.9, gain: 0.5 * SOUND_LEVELS.stingerSpotted, attack: 0.01 });
  } else if (kind === 'still') {
    // Two high notes a hair apart, drifting further apart.
    playResonantNoise({ frequency: 1244, frequencyEnd: 1174, resonance: 40, duration: 1.6, gain: 0.08 * SOUND_LEVELS.stingerStill, attack: 0.3, reverbAmount: 0.9 });
    playResonantNoise({ frequency: 1318, frequencyEnd: 1396, resonance: 40, duration: 1.6, gain: 0.08 * SOUND_LEVELS.stingerStill, attack: 0.3, reverbAmount: 0.9 });
  } else if (kind === 'death') {
    playNoiseBurst({ duration: 1.5, filterType: 'bandpass', frequency: 900, frequencyEnd: 5000, gain: 0.85 * SOUND_LEVELS.stingerDeath, attack: 0.01, resonance: 1.2 });
    for (const frequency of [880, 932, 1245, 1568]) playResonantNoise({ frequency: frequency, frequencyEnd: frequency * 0.3, resonance: 16, duration: 1.4, gain: 0.1 * SOUND_LEVELS.stingerDeath, attack: 0.01 });
    playTone({ frequency: 70, frequencyEnd: 28, duration: 1.8, gain: 0.7 * SOUND_LEVELS.stingerDeath, attack: 0.01 });
  } else if (kind === 'enraged') {
    playNoiseBurst({ duration: 1.3, filterType: 'bandpass', frequency: 1300, frequencyEnd: 2600, gain: 0.8 * SOUND_LEVELS.hollowEnraged, resonance: 5, destination: audio.hollowPanner });
    playResonantNoise({ frequency: 420, frequencyEnd: 1500, resonance: 12, duration: 1.2, gain: 0.3 * SOUND_LEVELS.hollowEnraged, attack: 0.02, destination: audio.hollowPanner });
  }
}

function startGeneratorSound() {
  if (!isAudioReady()) return;
  const now = audio.context.currentTime;
  // Five laboured turns of the starter, each a little quicker, before it catches.
  for (let crankIndex = 0; crankIndex < 5; crankIndex++) {
    playNoiseBurst({ duration: 0.3, frequency: 300 + crankIndex * 60, gain: 0.9 * SOUND_LEVELS.generatorStart, useBrownNoise: true, delay: crankIndex * 0.42, destination: audio.generatorPanner });
    playTone({ waveform: 'sine', frequency: 30 + crankIndex * 6, frequencyEnd: 44 + crankIndex * 7, duration: 0.35, gain: 0.7 * SOUND_LEVELS.generatorStart, delay: crankIndex * 0.42, destination: audio.generatorPanner });
  }
  audio.generatorGain.gain.setValueAtTime(0, now + 2.0);
  audio.generatorGain.gain.linearRampToValueAtTime(0.75 * SOUND_LEVELS.generatorRunning, now + 4.5);
}

function setGeneratorSoundRunning(isRunning) {
  if (!isAudioReady()) return;
  audio.generatorGain.gain.setTargetAtTime(isRunning ? 0.75 * SOUND_LEVELS.generatorRunning : 0, audio.context.currentTime, 0.3);
}

function playLiftDepartSound() {
  if (!isAudioReady()) return;
  const now = audio.context.currentTime;
  audio.liftGain.gain.cancelScheduledValues(now);
  audio.liftGain.gain.setValueAtTime(0.5 * SOUND_LEVELS.liftMachinery, now + 0.9);
  audio.liftGain.gain.exponentialRampToValueAtTime(0.001, now + 7);
  audio.liftGain.gain.setValueAtTime(0, now + 7.1);
}

function setLiftMachinerySound(level) {
  if (!isAudioReady()) return;
  const now = audio.context.currentTime;
  audio.liftGain.gain.cancelScheduledValues(now);
  audio.liftGain.gain.setTargetAtTime(level * SOUND_LEVELS.liftMachinery, now, 0.4);
}

function playLiftBell() {
  const panner = createTemporaryPanner(LIFT_POSITION.x, 2.4, LIFT_POSITION.z);
  if (!panner) return;
  if (audio.metalStruck) {
    playMetalStrike({ shape: 'bell', frequency: 1480, duration: 1.6, hardness: 0.6, damping: 0.5, gain: 1.5 * SOUND_LEVELS.liftBell, destination: panner });
    return;
  }
  for (const frequency of [1480, 2217, 2960]) {
    playTone({ waveform: 'sine', frequency: frequency, duration: 0.9, gain: 0.5 * SOUND_LEVELS.liftBell, attack: 0.002, destination: panner });
  }
}

function updateLiftBell(isLiftMoving, gameTime) {
  if (!isLiftMoving || gameTime < audio.nextLiftBellTime) return;
  playLiftBell();
  audio.nextLiftBellTime = gameTime + 1.6;
}

// Occasional sounds from elsewhere in the station. Each has a function of its own, so it can be played by itself.
function playAmbientDrips(x, z) {
  const panner = createTemporaryPanner(x, 2.5, z);
  if (!panner) return;
  const dripCount = 1 + Math.floor(Math.random() * 3);
  if (audio.waterBubbles) {
    // Each drop into standing water: the tick of it landing, the bubble it makes, and often a smaller one right behind.
    for (let dripIndex = 0; dripIndex < dripCount; dripIndex++) {
      const delay = dripIndex * randomBetween(0.25, 0.5), note = 900 + Math.random() * 1300;
      playNoiseBurst({ duration: 0.012, filterType: 'bandpass', frequency: 4200, gain: 0.08 * SOUND_LEVELS.drips, attack: 0.001, delay: delay, destination: panner });
      playWaterBubbles({ frequency: note, ring: 0.08, rise: 0.7, gain: 0.3 * SOUND_LEVELS.drips, delay: delay + 0.012, destination: panner, reverbAmount: 0.3 });
      if (Math.random() < 0.6) playWaterBubbles({ frequency: note * randomBetween(1.5, 2.2), ring: 0.04, rise: 0.5, gain: 0.12 * SOUND_LEVELS.drips, delay: delay + randomBetween(0.04, 0.08), destination: panner, reverbAmount: 0.3 });
    }
    return;
  }
  for (let dripIndex = 0; dripIndex < dripCount; dripIndex++) {
    playTone({ waveform: 'sine', frequency: 1500 + Math.random() * 900, frequencyEnd: 700, duration: 0.09, gain: 0.2 * SOUND_LEVELS.drips, delay: dripIndex * randomBetween(0.25, 0.5), attack: 0.005, destination: panner });
  }
}

function playAmbientPipeGroan(x, z) {
  const panner = createTemporaryPanner(x, 3, z);
  if (!panner) return;
  playResonantNoise({ frequency: 174 + Math.random() * 30, frequencyEnd: 72 + Math.random() * 30, resonance: 9, duration: 2.6, gain: 4.3 * SOUND_LEVELS.pipeGroan, attack: 0.6, destination: panner });
  playNoiseBurst({ duration: 2.4, filterType: 'bandpass', frequency: 300 + Math.random() * 100, frequencyEnd: 190, gain: 1.3 * SOUND_LEVELS.pipeGroan, attack: 0.5, resonance: 8, destination: panner });
}

function playAmbientMetalSettling(x, z) {
  const panner = createTemporaryPanner(x, 1, z);
  if (!panner) return;
  if (audio.metalStruck) {
    // A panel lets go as it cools: one sharp tick that rings, and often a smaller one after it.
    const note = 190 + Math.random() * 170;
    playMetalStrike({ shape: 'plate', frequency: note, duration: 1.6, hardness: 0.75, gain: 1.5 * SOUND_LEVELS.metalSettling, destination: panner });
    if (Math.random() < 0.6) playMetalStrike({ shape: 'plate', frequency: note * 1.07, duration: 0.9, hardness: 0.6, gain: 0.6 * SOUND_LEVELS.metalSettling, delay: 0.12 + Math.random() * 0.3, destination: panner });
    return;
  }
  playTone({ waveform: 'triangle', filterType: 'bandpass', frequency: 300 + Math.random() * 200, frequencyEnd: 280 + Math.random() * 200, duration: 1.2, gain: 0.8 * SOUND_LEVELS.metalSettling, attack: 0.003, destination: panner });
  playNoiseBurst({ duration: 0.2, frequency: 800, gain: 1.3 * SOUND_LEVELS.metalSettling, destination: panner });
}

// Three slow knocks from the direction of Shaft 9.
function playAmbientShaftKnocks() {
  const panner = createTemporaryPanner(SHAFT_POSITION.x, 0, SHAFT_POSITION.z);
  if (!panner) return;
  for (let knockIndex = 0; knockIndex < 3; knockIndex++) {
    playNoiseBurst({ duration: 0.25, frequency: 220, gain: 3.5 * SOUND_LEVELS.shaftKnocks, useBrownNoise: true, delay: knockIndex * 0.85, destination: panner });
    playTone({ frequency: 82, frequencyEnd: 55, duration: 0.3, gain: 3.0 * SOUND_LEVELS.shaftKnocks, delay: knockIndex * 0.85, destination: panner });
  }
}

function updateAmbientEvents(gameTime, listenerX, listenerZ, dread) {
  if (!isAudioReady() || gameTime < audio.nextAmbientEventTime) return null;
  audio.nextAmbientEventTime = gameTime + randomBetween(7, 19) * (1.2 - dread * 0.5);
  const choice = Math.random();
  const angle = Math.random() * TWO_PI, distance = randomBetween(6, 16);
  const eventX = listenerX + Math.cos(angle) * distance, eventZ = listenerZ + Math.sin(angle) * distance;
  if (choice < 0.34) { playAmbientDrips(eventX, eventZ); return null; }
  if (choice < 0.58) { playAmbientPipeGroan(eventX, eventZ); return null; }
  if (choice < 0.8) { playAmbientMetalSettling(eventX, eventZ); return null; }
  playAmbientShaftKnocks();
  return '[knocking, far below]';
}
