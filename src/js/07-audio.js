// ---------------------------------------------------------------------------
// Audio: everything is synthesised with the Web Audio API. No sound files.
//
// Nearly every sound here starts as NOISE shaped by filters, not as a raw
// square or sawtooth wave. Raw waves are what make synthesised audio sound
// like an old game console; filtered noise sounds like air, metal and breath.
// ---------------------------------------------------------------------------

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
  hollowThroatSource: null,
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

const ROOM_TONE_LEVEL = 0.9; // TWEAK: loudness of the constant room tone

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
  chestFilter.frequency.value = 95;
  const chestLevel = context.createGain();
  chestLevel.gain.value = 2.8;
  chestRumble.connect(chestFilter); chestFilter.connect(chestLevel); chestLevel.connect(audio.hollowGrowlGain);
  chestRumble.start();
  // 3. Breath: a slow swell of air between the rattles.
  const breath = context.createBufferSource();
  breath.buffer = audio.whiteNoiseBuffer;
  breath.loop = true;
  const breathFilter = context.createBiquadFilter();
  breathFilter.type = 'bandpass';
  breathFilter.frequency.value = 1100;
  breathFilter.Q.value = 0.8;
  const breathLevel = context.createGain();
  breathLevel.gain.value = 0.15;
  const breathSwell = context.createOscillator();
  breathSwell.frequency.value = 0.27; // one breath roughly every four seconds
  const breathSwellDepth = context.createGain();
  breathSwellDepth.gain.value = 0.05;
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

  audio.ambienceGain.gain.setTargetAtTime(ROOM_TONE_LEVEL, context.currentTime, 2.5);
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
  gain.gain.linearRampToValueAtTime(options.gain || 0.3, now + (options.attack || 0.004));
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
  gain.gain.linearRampToValueAtTime(options.gain || 0.2, now + (options.attack || 0.006));
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
  const level = (options.gain || 0.2) * (1.5 + resonance * 0.5);
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
//   level             overall loudness of the voice.
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
    level.gain.setValueAtTime(treatment.level, startTime);
    // Dropouts: the signal ducks for a few hundredths of a second, as if the carrier fades.
    if (treatment.dropoutsPerSecond > 0) {
      let dropoutTime = startTime + Math.random() / treatment.dropoutsPerSecond;
      while (dropoutTime < endTime - 0.15) {
        const dropoutLength = 0.04 + Math.random() * 0.07;
        level.gain.setValueAtTime(treatment.level * (0.15 + Math.random() * 0.3), dropoutTime);
        level.gain.setValueAtTime(treatment.level, dropoutTime + dropoutLength);
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
    hissLevel.gain.linearRampToValueAtTime(treatment.staticLevel, startTime + 0.05);
    hissLevel.gain.setValueAtTime(treatment.staticLevel, endTime);
    hissLevel.gain.linearRampToValueAtTime(0.0001, endTime + 0.12);
    hiss.connect(hissFilter); hissFilter.connect(hissLevel); hissLevel.connect(audio.masterGain);

    source.start(startTime);
    hiss.start(startTime);
    hiss.stop(endTime + 0.15);
    // The click of the channel closing.
    if (treatmentName === 'radio') playNoiseBurst({ duration: 0.09, filterType: 'bandpass', frequency: 1900, gain: 0.12, resonance: 2.5, delay: (startDelay || 0) + buffer.duration + 0.02 });

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
  if (isInWater) {
    playNoiseBurst({ duration: 0.32, frequency: 1500, frequencyEnd: 420, gain: 0.3 * loudness, resonance: 1.4, reverbAmount: 0.5 });
    playNoiseBurst({ duration: 0.18, filterType: 'bandpass', frequency: 3200, gain: 0.1 * loudness, delay: 0.05 });
    return;
  }
  playNoiseBurst({ duration: 0.11, frequency: 520 + Math.random() * 180, gain: 0.26 * loudness, useBrownNoise: true, playbackRate: 1.6, reverbAmount: 0.35 });
  playNoiseBurst({ duration: 0.04, filterType: 'bandpass', frequency: 2100, gain: 0.05 * loudness });
  if (isOnGrate) playTone({ waveform: 'triangle', frequency: 610 + Math.random() * 90, frequencyEnd: 560, duration: 0.25, gain: 0.07 * loudness, reverbAmount: 0.6 });
}

function setScannerSound(paintLevel) {
  if (!isAudioReady()) return;
  const now = audio.context.currentTime;
  audio.scannerGain.gain.setTargetAtTime(paintLevel * 0.16, now, 0.03); // TWEAK: 0.16 = loudness of the scanner ticking
  audio.scannerWhineGain.gain.setTargetAtTime(paintLevel * 0.012, now, 0.05);
}

function playSweepSound(duration) {
  // A motor winding down: a falling whistle of air, a soft falling tone under it, and hiss.
  playResonantNoise({ frequency: 2300, frequencyEnd: 320, resonance: 22, duration: duration, gain: 0.11, attack: 0.06, reverbAmount: 0.6 });
  playTone({ waveform: 'sine', frequency: 1150, frequencyEnd: 160, duration: duration, gain: 0.05, attack: 0.08, reverbAmount: 0.5 });
  playNoiseBurst({ duration: duration, filterType: 'bandpass', frequency: 5200, frequencyEnd: 900, gain: 0.1, attack: 0.08, resonance: 3 });
}

function playOverheatSound() {
  playNoiseBurst({ duration: 0.8, filterType: 'highpass', frequency: 3000, gain: 0.16, attack: 0.02 });
  playTone({ waveform: 'sine', frequency: 210, frequencyEnd: 95, duration: 0.35, gain: 0.12 });
}

function playInterfaceBlip(pitch) {
  // A soft tick with a hint of pitch, like a membrane button.
  playTone({ waveform: 'sine', frequency: pitch || 880, frequencyEnd: (pitch || 880) * 0.85, duration: 0.09, gain: 0.09, attack: 0.003 });
  playNoiseBurst({ duration: 0.02, filterType: 'bandpass', frequency: 2600, gain: 0.05, resonance: 1.5 });
}

function playRadioBlip() {
  // A radio opening: squelch, then two short tones heard through a small speaker.
  playNoiseBurst({ duration: 0.16, filterType: 'bandpass', frequency: 1900, gain: 0.16, resonance: 2.5 });
  playResonantNoise({ frequency: 1320, resonance: 30, duration: 0.09, gain: 0.12, attack: 0.005, delay: 0.12 });
  playResonantNoise({ frequency: 990, resonance: 30, duration: 0.12, gain: 0.12, attack: 0.005, delay: 0.2 });
}

function playPickupSound() {
  playTone({ waveform: 'triangle', frequency: 660, duration: 0.12, gain: 0.12 });
  playTone({ waveform: 'triangle', frequency: 990, duration: 0.22, gain: 0.12, delay: 0.09, reverbAmount: 0.4 });
  playNoiseBurst({ duration: 0.15, frequency: 900, gain: 0.12, useBrownNoise: true, playbackRate: 2 });
}

function playDeniedSound() {
  // Two dull thuds of a lock that will not turn.
  playTone({ waveform: 'sine', frequency: 150, frequencyEnd: 110, duration: 0.14, gain: 0.2, attack: 0.004 });
  playTone({ waveform: 'sine', frequency: 125, frequencyEnd: 90, duration: 0.2, gain: 0.2, attack: 0.004, delay: 0.17 });
  playNoiseBurst({ duration: 0.05, frequency: 700, gain: 0.12, useBrownNoise: true, playbackRate: 2 });
  playNoiseBurst({ duration: 0.05, frequency: 700, gain: 0.12, useBrownNoise: true, playbackRate: 2, delay: 0.17 });
}

function playDoorSound(x, z, isOpening) {
  const panner = createTemporaryPanner(x, 1.2, z);
  if (!panner) return;
  playNoiseBurst({ duration: 0.75, filterType: 'bandpass', frequency: isOpening ? 700 : 1500, frequencyEnd: isOpening ? 2400 : 500, gain: 0.5, attack: 0.05, resonance: 1.6, destination: panner });
  playNoiseBurst({ duration: 0.16, frequency: 240, gain: 0.9, useBrownNoise: true, playbackRate: 1.3, delay: 0.62, destination: panner });
  playTone({ waveform: 'triangle', frequency: 92, frequencyEnd: 60, duration: 0.3, gain: 0.5, delay: 0.62, destination: panner });
}

// Your own knees and elbows on sheet metal: a dull boom that rings on.
function playVentCrawlSound() {
  playNoiseBurst({ duration: 0.22, frequency: 260, gain: 0.34, useBrownNoise: true, playbackRate: 1.1, reverbAmount: 0.6 });
  playResonantNoise({ frequency: 190 + Math.random() * 60, resonance: 16, duration: 0.5, gain: 0.1, attack: 0.004, reverbAmount: 0.7 });
  playNoiseBurst({ duration: 0.05, filterType: 'bandpass', frequency: 1700, gain: 0.05 });
}

// The Hollow in a vent. Louder and longer than its footsteps, and it carries: this is the warning you get.
function playHollowVentStep(x, z, weight) {
  const panner = createTemporaryPanner(x, getFloorHeightAt(x, z) + 0.6, z);
  if (!panner) return;
  playNoiseBurst({ duration: 0.3, frequency: 240, gain: 1.5 * weight, useBrownNoise: true, playbackRate: 0.8, destination: panner });
  playResonantNoise({ frequency: 150 + Math.random() * 50, resonance: 18, duration: 0.7, gain: 0.5 * weight, attack: 0.004, destination: panner });
  playNoiseBurst({ duration: 0.07, filterType: 'bandpass', frequency: 2200, gain: 0.25 * weight, delay: 0.04, destination: panner });
}

function playHollowFootstep(x, z, weight) {
  const panner = createTemporaryPanner(x, 0.1, z);
  if (!panner) return;
  playNoiseBurst({ duration: 0.2, frequency: 300, gain: 1.0 * weight, useBrownNoise: true, playbackRate: 0.9, destination: panner });
  playNoiseBurst({ duration: 0.09, filterType: 'bandpass', frequency: 1400, gain: 0.22 * weight, delay: 0.03, destination: panner });
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
  playNoiseBurst({ duration: 0.16, filterType: 'bandpass', frequency: 900, resonance: 3, gain: 0.5, useBrownNoise: true, playbackRate: 2.4, destination: panner });
}

function playHollowClickTrain(clickCount, startInterval, endInterval, loudness) {
  if (!isAudioReady()) return;
  // Hard, hollow knocks, like knuckles of bone. Each one is a tiny burst of noise ringing in a narrow filter.
  let delay = 0;
  for (let clickIndex = 0; clickIndex < clickCount; clickIndex++) {
    const interval = interpolateLinear(startInterval, endInterval, clickIndex / Math.max(1, clickCount - 1));
    playNoiseBurst({ duration: 0.035, filterType: 'bandpass', frequency: 850 + Math.random() * 900, resonance: 14, gain: loudness * 1.6, attack: 0.001, delay: delay, destination: audio.hollowPanner });
    delay += interval * (0.8 + Math.random() * 0.4);
  }
}

function updateHollowVoice(x, z, isActive, aggression, shriekLevel, dt, gameTime) {
  if (!isAudioReady()) return;
  const now = audio.context.currentTime;
  if (!isActive) {
    audio.hollowGrowlGain.gain.setTargetAtTime(0, now, 0.2);
    audio.hollowScreechGain.gain.setTargetAtTime(0, now, 0.1);
    return;
  }
  setPannerPosition(audio.hollowPanner, x, getFloorHeightAt(x, z) + 1.7, z);
  // TWEAK: growl loudness. First number: when it is calm. Second: added when it is hunting.
  audio.hollowGrowlGain.gain.setTargetAtTime(0.2 + aggression * 0.85, now, 0.3);
  // The rattle in its throat runs faster the more aggressive it is.
  audio.hollowThroatSource.playbackRate.setTargetAtTime(0.8 + aggression * 0.55, now, 0.4);
  audio.hollowScreechGain.gain.setTargetAtTime(shriekLevel * shriekLevel * 2.4, now, 0.08);
  audio.hollowScreechFilter.frequency.setTargetAtTime(1200 + shriekLevel * 1500, now, 0.1);
  audio.hollowScreechFilterHigh.frequency.setTargetAtTime(2600 + shriekLevel * 2600, now, 0.1);
  if (gameTime >= audio.nextHollowClickTime) {
    if (aggression > 0.6) playHollowClickTrain(10 + Math.floor(Math.random() * 8), 0.05, 0.022, 0.9);
    else playHollowClickTrain(4 + Math.floor(Math.random() * 7), 0.13, 0.05, 0.55);
    audio.nextHollowClickTime = gameTime + (aggression > 0.6 ? randomBetween(0.9, 1.8) : randomBetween(2.5, 6.5));
  }
}

// Turns off everything that belongs to play itself: the growl, the shriek, the static and the scanner's ticking.
// Called whenever the game leaves play for a screen (title, death, ending), so nothing is left running under it.
function silenceGameplaySounds() {
  if (!isAudioReady()) return;
  const now = audio.context.currentTime;
  for (const node of [audio.hollowGrowlGain, audio.hollowScreechGain, audio.staticGain, audio.scannerGain, audio.scannerWhineGain]) {
    node.gain.cancelScheduledValues(now);
    node.gain.setTargetAtTime(0, now, 0.05);
  }
}

// ---- The Hollow's voice, by what it is doing. All of these come from where it stands. ----

// The moment it knows where you are: a roar from the chest, tearing at the top.
function playHollowRoar() {
  if (!isAudioReady()) return;
  const out = audio.hollowPanner;
  playResonantNoise({ frequency: 150, frequencyEnd: 92, resonance: 6, duration: 1.7, gain: 3.06, attack: 0.05, destination: out });
  playResonantNoise({ frequency: 430, frequencyEnd: 240, resonance: 5, duration: 1.5, gain: 2.16, attack: 0.04, destination: out });
  playNoiseBurst({ duration: 1.3, filterType: 'bandpass', frequency: 1600, frequencyEnd: 800, gain: 1.44, resonance: 3, attack: 0.03, destination: out });
  playTone({ waveform: 'sawtooth', frequency: 98, frequencyEnd: 56, duration: 1.6, gain: 0.81, attack: 0.05, destination: out });
}

// While it is after you: a short snarl every few seconds, never twice at the same pitch.
function playHollowSnarl() {
  if (!isAudioReady()) return;
  const out = audio.hollowPanner, pitch = 0.85 + Math.random() * 0.4;
  playResonantNoise({ frequency: 210 * pitch, frequencyEnd: 130 * pitch, resonance: 5, duration: 0.55, gain: 3.25, attack: 0.02, destination: out });
  playNoiseBurst({ duration: 0.45, filterType: 'bandpass', frequency: 1300 * pitch, frequencyEnd: 700 * pitch, gain: 1.25, resonance: 3, attack: 0.02, destination: out });
}

// It has lost you: one long breath out through its teeth.
function playHollowLostHiss() {
  if (!isAudioReady()) return;
  playNoiseBurst({ duration: 1.8, filterType: 'bandpass', frequency: 3200, frequencyEnd: 1100, gain: 1.00, resonance: 2, attack: 0.25, destination: audio.hollowPanner });
  playResonantNoise({ frequency: 260, frequencyEnd: 150, resonance: 8, duration: 1.4, gain: 1.00, attack: 0.3, destination: audio.hollowPanner });
}

// Searching: it tests the air. Two or three short pulls of breath, then a low huff.
function playHollowSniff() {
  if (!isAudioReady()) return;
  const out = audio.hollowPanner, pulls = 2 + Math.floor(Math.random() * 2);
  for (let pull = 0; pull < pulls; pull++) {
    playNoiseBurst({ duration: 0.16, filterType: 'bandpass', frequency: 900, frequencyEnd: 2400, gain: 3.63, resonance: 2.5, attack: 0.03, delay: pull * 0.24, destination: out });
  }
  playResonantNoise({ frequency: 170, frequencyEnd: 120, resonance: 7, duration: 0.5, gain: 3.96, attack: 0.05, delay: pulls * 0.24 + 0.1, destination: out });
}

// It has heard something and is coming to look: a quick run of clicks that speeds up, ending on a rising note.
function playHollowCuriousTrill() {
  if (!isAudioReady()) return;
  playHollowClickTrain(7, 0.11, 0.035, 1.6);
  playResonantNoise({ frequency: 520, frequencyEnd: 860, resonance: 20, duration: 0.35, gain: 2.2, attack: 0.03, delay: 0.5, destination: audio.hollowPanner });
}

function playHeartbeat(strength) {
  playTone({ frequency: 62, frequencyEnd: 38, duration: 0.16, gain: 0.5 * strength, attack: 0.008 });
  playTone({ frequency: 54, frequencyEnd: 34, duration: 0.2, gain: 0.38 * strength, attack: 0.008, delay: 0.21 });
}

function updateHeartbeat(threat, gameTime) {
  if (threat < 0.12 || gameTime < audio.nextHeartbeatTime) return;
  playHeartbeat(Math.min(1, 0.25 + threat * 0.9));
  audio.nextHeartbeatTime = gameTime + interpolateLinear(1.25, 0.42, threat);
}

function setInterferenceSound(level) {
  if (!isAudioReady()) return;
  audio.staticGain.gain.setTargetAtTime(level * level * 0.22, audio.context.currentTime, 0.06);
}

function playStinger(kind) {
  if (kind === 'phantom') {
    // Three faint notes that sag, like a breath across bottles.
    for (const frequency of [311, 329, 466]) playResonantNoise({ frequency: frequency, frequencyEnd: frequency * 0.94, resonance: 34, duration: 3.0, gain: 0.11, attack: 0.6, reverbAmount: 0.9 });
  } else if (kind === 'spotted') {
    // A cluster of close, clashing notes swelling out of a thud.
    for (const frequency of [196, 207.6, 277, 293.6]) playResonantNoise({ frequency: frequency, frequencyEnd: frequency * 1.07, resonance: 26, duration: 1.8, gain: 0.06, attack: 0.03, reverbAmount: 0.7 });
    playNoiseBurst({ duration: 0.6, frequency: 400, gain: 0.5, useBrownNoise: true, reverbAmount: 0.6 });
    playTone({ frequency: 58, frequencyEnd: 36, duration: 0.9, gain: 0.5, attack: 0.01 });
  } else if (kind === 'still') {
    // Two high notes a hair apart, drifting further apart.
    playResonantNoise({ frequency: 1244, frequencyEnd: 1174, resonance: 40, duration: 1.6, gain: 0.08, attack: 0.3, reverbAmount: 0.9 });
    playResonantNoise({ frequency: 1318, frequencyEnd: 1396, resonance: 40, duration: 1.6, gain: 0.08, attack: 0.3, reverbAmount: 0.9 });
  } else if (kind === 'death') {
    playNoiseBurst({ duration: 1.5, filterType: 'bandpass', frequency: 900, frequencyEnd: 5000, gain: 0.85, attack: 0.01, resonance: 1.2 });
    for (const frequency of [880, 932, 1245, 1568]) playResonantNoise({ frequency: frequency, frequencyEnd: frequency * 0.3, resonance: 16, duration: 1.4, gain: 0.1, attack: 0.01 });
    playTone({ frequency: 70, frequencyEnd: 28, duration: 1.8, gain: 0.7, attack: 0.01 });
  } else if (kind === 'enraged') {
    playNoiseBurst({ duration: 1.3, filterType: 'bandpass', frequency: 1300, frequencyEnd: 2600, gain: 0.8, resonance: 5, destination: audio.hollowPanner });
    playResonantNoise({ frequency: 420, frequencyEnd: 1500, resonance: 12, duration: 1.2, gain: 0.3, attack: 0.02, destination: audio.hollowPanner });
  }
}

function startGeneratorSound() {
  if (!isAudioReady()) return;
  const now = audio.context.currentTime;
  // Five laboured turns of the starter, each a little quicker, before it catches.
  for (let crankIndex = 0; crankIndex < 5; crankIndex++) {
    playNoiseBurst({ duration: 0.3, frequency: 300 + crankIndex * 60, gain: 0.9, useBrownNoise: true, delay: crankIndex * 0.42, destination: audio.generatorPanner });
    playTone({ waveform: 'sine', frequency: 30 + crankIndex * 6, frequencyEnd: 44 + crankIndex * 7, duration: 0.35, gain: 0.7, delay: crankIndex * 0.42, destination: audio.generatorPanner });
  }
  audio.generatorGain.gain.setValueAtTime(0, now + 2.0);
  audio.generatorGain.gain.linearRampToValueAtTime(0.75, now + 4.5);
}

function setGeneratorSoundRunning(isRunning) {
  if (!isAudioReady()) return;
  audio.generatorGain.gain.setTargetAtTime(isRunning ? 0.75 : 0, audio.context.currentTime, 0.3);
}

function playLiftDepartSound() {
  if (!isAudioReady()) return;
  const now = audio.context.currentTime;
  audio.liftGain.gain.cancelScheduledValues(now);
  audio.liftGain.gain.setValueAtTime(0.5, now + 0.9);
  audio.liftGain.gain.exponentialRampToValueAtTime(0.001, now + 7);
  audio.liftGain.gain.setValueAtTime(0, now + 7.1);
}

function setLiftMachinerySound(level) {
  if (!isAudioReady()) return;
  const now = audio.context.currentTime;
  audio.liftGain.gain.cancelScheduledValues(now);
  audio.liftGain.gain.setTargetAtTime(level, now, 0.4);
}

function playLiftBell() {
  const panner = createTemporaryPanner(LIFT_POSITION.x, 2.4, LIFT_POSITION.z);
  if (!panner) return;
  for (const frequency of [1480, 2217, 2960]) {
    playTone({ waveform: 'sine', frequency: frequency, duration: 0.9, gain: 0.5, attack: 0.002, destination: panner });
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
  for (let dripIndex = 0; dripIndex < dripCount; dripIndex++) {
    playTone({ frequency: 1500 + Math.random() * 900, frequencyEnd: 700, duration: 0.09, gain: 0.5, delay: dripIndex * randomBetween(0.25, 0.5), destination: panner });
  }
}

function playAmbientPipeGroan(x, z) {
  const panner = createTemporaryPanner(x, 3, z);
  if (!panner) return;
  playResonantNoise({ frequency: 74 + Math.random() * 30, frequencyEnd: 52, resonance: 9, duration: 2.6, gain: 0.3, attack: 0.6, destination: panner });
  playNoiseBurst({ duration: 2.4, filterType: 'bandpass', frequency: 300, frequencyEnd: 190, gain: 0.3, attack: 0.5, resonance: 8, destination: panner });
}

function playAmbientMetalSettling(x, z) {
  const panner = createTemporaryPanner(x, 1, z);
  if (!panner) return;
  playTone({ waveform: 'triangle', frequency: 410 + Math.random() * 200, frequencyEnd: 380, duration: 1.3, gain: 0.5, attack: 0.002, destination: panner });
  playNoiseBurst({ duration: 0.2, frequency: 1800, gain: 0.5, destination: panner });
}

// Three slow knocks from the direction of Shaft 9.
function playAmbientShaftKnocks() {
  const panner = createTemporaryPanner(SHAFT_POSITION.x, 0, SHAFT_POSITION.z);
  if (!panner) return;
  for (let knockIndex = 0; knockIndex < 3; knockIndex++) {
    playNoiseBurst({ duration: 0.25, frequency: 220, gain: 3.5, useBrownNoise: true, delay: knockIndex * 0.85, destination: panner });
    playTone({ frequency: 82, frequencyEnd: 55, duration: 0.3, gain: 3.0, delay: knockIndex * 0.85, destination: panner });
  }
}

function updateAmbientEvents(gameTime, listenerX, listenerZ, dread) {
  if (!isAudioReady() || gameTime < audio.nextAmbientEventTime) return null;
  audio.nextAmbientEventTime = gameTime + randomBetween(7, 19) * (1.2 - dread * 0.5);
  const choice = Math.random();
  const angle = Math.random() * TWO_PI, distance = randomBetween(6, 16);
  const eventX = listenerX + Math.cos(angle) * distance, eventZ = listenerZ + Math.sin(angle) * distance;
  if (choice < 0.34) { playAmbientDrips(eventX, eventZ); return null; }
  if (choice < 0.58) { playAmbientPipeGroan(eventX, eventZ); return '[a pipe groans]'; }
  if (choice < 0.8) { playAmbientMetalSettling(eventX, eventZ); return '[metal settles somewhere]'; }
  playAmbientShaftKnocks();
  return '[knocking, far below]';
}
