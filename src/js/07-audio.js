// ---------------------------------------------------------------------------
// Audio: everything is synthesised with the Web Audio API. No sound files.
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
  hollowScreechOscillator: null,
  generatorPanner: null,
  generatorGain: null,
  liftGain: null,
  ambienceGain: null,
  nextAmbientEventTime: 6,
  nextHeartbeatTime: 0,
  nextHollowClickTime: 0,
  nextLiftBellTime: 0,
  volume: 0.8
};

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
  reverbReturn.gain.value = 0.55; // TWEAK: how echoey the station sounds (0 = dry)
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
  audio.hollowGrowlGain.gain.value = 0;
  const growlFilter = context.createBiquadFilter();
  growlFilter.type = 'lowpass';
  growlFilter.frequency.value = 260;
  growlFilter.Q.value = 4;
  for (const frequency of [47, 50.5, 71]) {
    const growl = context.createOscillator();
    growl.type = 'sawtooth';
    growl.frequency.value = frequency;
    growl.connect(growlFilter);
    growl.start();
  }
  const growlTremolo = context.createOscillator();
  growlTremolo.frequency.value = 7.3;
  const growlTremoloDepth = context.createGain();
  growlTremoloDepth.gain.value = 90;
  growlTremolo.connect(growlTremoloDepth); growlTremoloDepth.connect(growlFilter.frequency);
  growlTremolo.start();
  growlFilter.connect(audio.hollowGrowlGain); audio.hollowGrowlGain.connect(audio.hollowPanner);
  audio.hollowScreechGain = context.createGain();
  audio.hollowScreechGain.gain.value = 0;
  audio.hollowScreechOscillator = context.createOscillator();
  audio.hollowScreechOscillator.type = 'sawtooth';
  audio.hollowScreechOscillator.frequency.value = 600;
  const screechModulator = context.createOscillator();
  screechModulator.frequency.value = 37;
  const screechModulatorDepth = context.createGain();
  screechModulatorDepth.gain.value = 240;
  screechModulator.connect(screechModulatorDepth); screechModulatorDepth.connect(audio.hollowScreechOscillator.frequency);
  screechModulator.start();
  const screechFilter = context.createBiquadFilter();
  screechFilter.type = 'bandpass';
  screechFilter.frequency.value = 1700;
  screechFilter.Q.value = 2;
  audio.hollowScreechOscillator.connect(screechFilter); screechFilter.connect(audio.hollowScreechGain);
  audio.hollowScreechGain.connect(audio.hollowPanner);
  audio.hollowScreechOscillator.start();

  // ---- generator and lift machinery (started later) ----
  audio.generatorPanner = createPannerNode(GENERATOR_POSITION.x, GENERATOR_POSITION.y, GENERATOR_POSITION.z, 4, 1.0);
  audio.generatorGain = context.createGain();
  audio.generatorGain.gain.value = 0;
  audio.generatorGain.connect(audio.generatorPanner);
  for (const frequency of [50, 100.5, 149]) {
    const hum = context.createOscillator();
    hum.type = frequency < 60 ? 'sawtooth' : 'square';
    hum.frequency.value = frequency;
    const humGain = context.createGain();
    humGain.gain.value = frequency < 60 ? 0.5 : 0.12;
    hum.connect(humGain); humGain.connect(audio.generatorGain);
    hum.start();
  }
  const generatorRattle = context.createBufferSource();
  generatorRattle.buffer = audio.brownNoiseBuffer;
  generatorRattle.loop = true;
  const generatorRattleGain = context.createGain();
  generatorRattleGain.gain.value = 0.8;
  generatorRattle.connect(generatorRattleGain); generatorRattleGain.connect(audio.generatorGain);
  generatorRattle.start();

  const liftPanner = createPannerNode(LIFT_POSITION.x, 2.5, LIFT_POSITION.z, 5, 0.8);
  audio.liftGain = context.createGain();
  audio.liftGain.gain.value = 0;
  audio.liftGain.connect(liftPanner);
  const liftMotor = context.createOscillator();
  liftMotor.type = 'sawtooth';
  liftMotor.frequency.value = 64;
  const liftMotorFilter = context.createBiquadFilter();
  liftMotorFilter.type = 'lowpass';
  liftMotorFilter.frequency.value = 420;
  liftMotor.connect(liftMotorFilter); liftMotorFilter.connect(audio.liftGain);
  liftMotor.start();
  const liftRattle = context.createBufferSource();
  liftRattle.buffer = audio.brownNoiseBuffer;
  liftRattle.loop = true;
  liftRattle.connect(audio.liftGain);
  liftRattle.start();

  audio.ambienceGain.gain.setTargetAtTime(0.9, context.currentTime, 2.5); // TWEAK: 0.9 = loudness of the constant room tone
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
  setPannerPosition(panner, x, y, z);
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
    listener.setPosition(x, y, z);
    listener.setOrientation(forwardX, 0, forwardZ, 0, 1, 0);
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

function createTemporaryPanner(x, y, z) {
  if (!isAudioReady()) return null;
  const panner = createPannerNode(x, y, z, 2.5, 1.2);
  window.setTimeout(function () { try { panner.disconnect(); } catch (error) { /* already released */ } }, 6000);
  return panner;
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
  playTone({ waveform: 'sawtooth', frequency: 1900, frequencyEnd: 240, duration: duration, gain: 0.07, attack: 0.05, reverbAmount: 0.6 });
  playTone({ waveform: 'square', frequency: 3800, frequencyEnd: 480, duration: duration, gain: 0.025, attack: 0.05 });
  playNoiseBurst({ duration: duration, filterType: 'bandpass', frequency: 5200, frequencyEnd: 900, gain: 0.12, attack: 0.08, resonance: 3 });
}

function playOverheatSound() {
  playNoiseBurst({ duration: 0.7, filterType: 'highpass', frequency: 3000, gain: 0.16, attack: 0.02 });
  playTone({ waveform: 'square', frequency: 220, frequencyEnd: 110, duration: 0.3, gain: 0.06 });
}

function playInterfaceBlip(pitch) {
  playTone({ waveform: 'square', frequency: pitch || 880, duration: 0.07, gain: 0.05 });
}

function playRadioBlip() {
  playNoiseBurst({ duration: 0.12, filterType: 'bandpass', frequency: 2400, gain: 0.14, resonance: 2 });
  playTone({ waveform: 'square', frequency: 1320, duration: 0.06, gain: 0.05, delay: 0.1 });
  playTone({ waveform: 'square', frequency: 990, duration: 0.08, gain: 0.05, delay: 0.17 });
}

function playPickupSound() {
  playTone({ waveform: 'triangle', frequency: 660, duration: 0.12, gain: 0.12 });
  playTone({ waveform: 'triangle', frequency: 990, duration: 0.22, gain: 0.12, delay: 0.09, reverbAmount: 0.4 });
  playNoiseBurst({ duration: 0.15, frequency: 900, gain: 0.12, useBrownNoise: true, playbackRate: 2 });
}

function playDeniedSound() {
  playTone({ waveform: 'square', frequency: 180, duration: 0.16, gain: 0.09 });
  playTone({ waveform: 'square', frequency: 150, duration: 0.22, gain: 0.09, delay: 0.18 });
}

function playDoorSound(x, z, isOpening) {
  const panner = createTemporaryPanner(x, 1.2, z);
  if (!panner) return;
  playNoiseBurst({ duration: 0.75, filterType: 'bandpass', frequency: isOpening ? 700 : 1500, frequencyEnd: isOpening ? 2400 : 500, gain: 0.5, attack: 0.05, resonance: 1.6, destination: panner });
  playNoiseBurst({ duration: 0.16, frequency: 240, gain: 0.9, useBrownNoise: true, playbackRate: 1.3, delay: 0.62, destination: panner });
  playTone({ waveform: 'triangle', frequency: 92, frequencyEnd: 60, duration: 0.3, gain: 0.5, delay: 0.62, destination: panner });
}

function playHollowFootstep(x, z, weight) {
  const panner = createTemporaryPanner(x, 0.1, z);
  if (!panner) return;
  playNoiseBurst({ duration: 0.2, frequency: 300, gain: 1.0 * weight, useBrownNoise: true, playbackRate: 0.9, destination: panner });
  playNoiseBurst({ duration: 0.09, filterType: 'bandpass', frequency: 1400, gain: 0.22 * weight, delay: 0.03, destination: panner });
}

function playHollowClickTrain(clickCount, startInterval, endInterval, loudness) {
  if (!isAudioReady()) return;
  let delay = 0;
  for (let clickIndex = 0; clickIndex < clickCount; clickIndex++) {
    const interval = interpolateLinear(startInterval, endInterval, clickIndex / Math.max(1, clickCount - 1));
    playNoiseBurst({ duration: 0.022, filterType: 'bandpass', frequency: 1500 + Math.random() * 1500, resonance: 6, gain: loudness, delay: delay, destination: audio.hollowPanner });
    delay += interval * (0.8 + Math.random() * 0.4);
  }
}

function updateHollowVoice(x, z, isActive, aggression, rage, dt, gameTime) {
  if (!isAudioReady()) return;
  const now = audio.context.currentTime;
  if (!isActive) {
    audio.hollowGrowlGain.gain.setTargetAtTime(0, now, 0.2);
    audio.hollowScreechGain.gain.setTargetAtTime(0, now, 0.1);
    return;
  }
  setPannerPosition(audio.hollowPanner, x, 1.7, z);
  audio.hollowGrowlGain.gain.setTargetAtTime(0.12 + aggression * 0.5, now, 0.3);
  audio.hollowScreechGain.gain.setTargetAtTime(rage * rage * 0.3, now, 0.08);
  audio.hollowScreechOscillator.frequency.setTargetAtTime(520 + rage * 900, now, 0.1);
  if (gameTime >= audio.nextHollowClickTime) {
    if (aggression > 0.6) playHollowClickTrain(10 + Math.floor(Math.random() * 8), 0.05, 0.022, 0.9);
    else playHollowClickTrain(4 + Math.floor(Math.random() * 7), 0.13, 0.05, 0.55);
    audio.nextHollowClickTime = gameTime + (aggression > 0.6 ? randomBetween(0.9, 1.8) : randomBetween(2.5, 6.5));
  }
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
    for (const frequency of [311, 329, 466]) playTone({ waveform: 'sine', frequency: frequency, frequencyEnd: frequency * 0.94, duration: 2.8, gain: 0.05, attack: 0.5, reverbAmount: 0.9 });
  } else if (kind === 'spotted') {
    for (const frequency of [196, 207.6, 277, 293.6]) playTone({ waveform: 'sawtooth', frequency: frequency, frequencyEnd: frequency * 1.06, duration: 1.6, gain: 0.07, attack: 0.02, reverbAmount: 0.7 });
    playNoiseBurst({ duration: 0.5, frequency: 400, gain: 0.5, useBrownNoise: true, reverbAmount: 0.6 });
  } else if (kind === 'still') {
    playTone({ waveform: 'triangle', frequency: 1244, frequencyEnd: 1174, duration: 1.4, gain: 0.05, attack: 0.3, reverbAmount: 0.9 });
    playTone({ waveform: 'triangle', frequency: 1318, frequencyEnd: 1396, duration: 1.4, gain: 0.05, attack: 0.3, reverbAmount: 0.9 });
  } else if (kind === 'death') {
    playNoiseBurst({ duration: 1.5, filterType: 'bandpass', frequency: 900, frequencyEnd: 5000, gain: 1.1, attack: 0.01, resonance: 1.2 });
    for (const frequency of [880, 932, 1245, 1568]) playTone({ waveform: 'sawtooth', frequency: frequency, frequencyEnd: frequency * 0.3, duration: 1.4, gain: 0.16, attack: 0.01 });
    playTone({ frequency: 70, frequencyEnd: 28, duration: 1.8, gain: 0.9, attack: 0.01 });
  } else if (kind === 'enraged') {
    playNoiseBurst({ duration: 1.2, filterType: 'bandpass', frequency: 1300, frequencyEnd: 2600, gain: 0.8, resonance: 5, destination: audio.hollowPanner });
    playTone({ waveform: 'sawtooth', frequency: 420, frequencyEnd: 1500, duration: 1.1, gain: 0.5, destination: audio.hollowPanner });
  }
}

function startGeneratorSound() {
  if (!isAudioReady()) return;
  const now = audio.context.currentTime;
  for (let crankIndex = 0; crankIndex < 5; crankIndex++) {
    playNoiseBurst({ duration: 0.3, frequency: 300 + crankIndex * 60, gain: 0.9, useBrownNoise: true, delay: crankIndex * 0.42, destination: audio.generatorPanner });
    playTone({ waveform: 'sawtooth', frequency: 28 + crankIndex * 6, frequencyEnd: 40 + crankIndex * 7, duration: 0.35, gain: 0.5, delay: crankIndex * 0.42, destination: audio.generatorPanner });
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

// Occasional sounds from elsewhere in the station.
function updateAmbientEvents(gameTime, listenerX, listenerZ, dread) {
  if (!isAudioReady() || gameTime < audio.nextAmbientEventTime) return null;
  audio.nextAmbientEventTime = gameTime + randomBetween(7, 19) * (1.2 - dread * 0.5);
  const choice = Math.random();
  const angle = Math.random() * TWO_PI, distance = randomBetween(6, 16);
  const eventX = listenerX + Math.cos(angle) * distance, eventZ = listenerZ + Math.sin(angle) * distance;
  if (choice < 0.34) {
    const panner = createTemporaryPanner(eventX, 2.5, eventZ);
    if (!panner) return null;
    const dripCount = 1 + Math.floor(Math.random() * 3);
    for (let dripIndex = 0; dripIndex < dripCount; dripIndex++) {
      playTone({ frequency: 1500 + Math.random() * 900, frequencyEnd: 700, duration: 0.09, gain: 0.5, delay: dripIndex * randomBetween(0.25, 0.5), destination: panner });
    }
    return null;
  }
  if (choice < 0.58) {
    const panner = createTemporaryPanner(eventX, 3, eventZ);
    if (!panner) return null;
    playTone({ waveform: 'sawtooth', frequency: 74 + Math.random() * 30, frequencyEnd: 52, duration: 2.6, gain: 0.35, attack: 0.6, destination: panner });
    playNoiseBurst({ duration: 2.4, filterType: 'bandpass', frequency: 300, frequencyEnd: 190, gain: 0.3, attack: 0.5, resonance: 8, destination: panner });
    return '[a pipe groans]';
  }
  if (choice < 0.8) {
    const panner = createTemporaryPanner(eventX, 1, eventZ);
    if (!panner) return null;
    playTone({ waveform: 'triangle', frequency: 410 + Math.random() * 200, frequencyEnd: 380, duration: 1.3, gain: 0.5, attack: 0.002, destination: panner });
    playNoiseBurst({ duration: 0.2, frequency: 1800, gain: 0.5, destination: panner });
    return '[metal settles somewhere]';
  }
  // Three slow knocks from the direction of Shaft 9.
  const panner = createTemporaryPanner(SHAFT_POSITION.x, 0, SHAFT_POSITION.z);
  if (!panner) return null;
  for (let knockIndex = 0; knockIndex < 3; knockIndex++) {
    playNoiseBurst({ duration: 0.25, frequency: 220, gain: 3.5, useBrownNoise: true, delay: knockIndex * 0.85, destination: panner });
    playTone({ frequency: 82, frequencyEnd: 55, duration: 0.3, gain: 3.0, delay: knockIndex * 0.85, destination: panner });
  }
  return '[knocking, far below]';
}
