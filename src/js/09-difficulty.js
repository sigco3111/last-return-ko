// ---------------------------------------------------------------------------
// Threat levels: the three presets, and "Custom", where the player sets each number themselves.
//
// The presets and the list of things that can be set are in 00-config.js (DIFFICULTY_PRESETS and
// CUSTOM_DIFFICULTY_OPTIONS). This file turns the player's choices into the same kind of record a preset is,
// so the rest of the game never needs to know whether a threat level was made up or came out of the box.
//
// A threat level changes how the rules behave. It never changes what a station looks like: the same seed
// builds the same station on every threat level, custom ones included.
// ---------------------------------------------------------------------------

function findCustomDifficultyOption(key) {
  for (const option of CUSTOM_DIFFICULTY_OPTIONS) if (option.key === key) return option;
  return null;
}

// The values a custom threat level starts from: a copy of one of the presets ('survey', 'standard', 'nightmare').
function createCustomDifficultyValues(presetKey) {
  const preset = DIFFICULTY_PRESETS[presetKey] || DIFFICULTY_PRESETS.standard;
  const values = {};
  for (const option of CUSTOM_DIFFICULTY_OPTIONS) values[option.key] = preset[option.key];
  return values;
}

// Makes one value fit its option: a switch becomes true or false, a slider value is kept inside its range and
// snapped to its steps, a choice becomes the nearest of the values on offer. Anything unusable becomes `fallback`.
function sanitizeCustomDifficultyValue(option, value, fallback) {
  if (option.kind === 'switch') return typeof value === 'boolean' ? value : fallback;
  if (typeof value !== 'number' || !isFinite(value)) return fallback;
  if (option.kind === 'choice') {
    let nearest = option.choices[0][0];
    for (const choice of option.choices) if (Math.abs(choice[0] - value) < Math.abs(nearest - value)) nearest = choice[0];
    return nearest;
  }
  const steps = Math.round((clampNumber(value, option.minimum, option.maximum) - option.minimum) / option.step);
  return Math.round((option.minimum + steps * option.step) * 1000) / 1000;
}

// Whatever was stored (possibly by an older version of the game, possibly nonsense) becomes a full, valid set of values.
function sanitizeCustomDifficultyValues(stored) {
  const values = createCustomDifficultyValues('standard');
  if (!stored || typeof stored !== 'object') return values;
  for (const option of CUSTOM_DIFFICULTY_OPTIONS) values[option.key] = sanitizeCustomDifficultyValue(option, stored[option.key], values[option.key]);
  return values;
}

// The label of the preset these values are exactly the same as, or '' if they match none.
function findMatchingDifficultyPresetLabel(values) {
  for (const presetKey in DIFFICULTY_PRESETS) {
    let isSame = true;
    for (const option of CUSTOM_DIFFICULTY_OPTIONS) if (DIFFICULTY_PRESETS[presetKey][option.key] !== values[option.key]) isSame = false;
    if (isSame) return DIFFICULTY_PRESETS[presetKey].label;
  }
  return '';
}

// A value as the panel shows it: "On", "115 %", "Few".
function formatCustomDifficultyValue(option, value) {
  if (option.kind === 'switch') return value ? 'On' : 'Off';
  if (option.kind === 'choice') {
    for (const choice of option.choices) if (choice[0] === value) return choice[1];
    return String(value);
  }
  return Math.round(value * 100) + ' %';
}

// What a value comes to in play, in a sentence, worked out from the numbers in TUNING.
function explainCustomDifficultyValue(key, value) {
  const option = findCustomDifficultyOption(key);
  if (option.kind === 'switch') return value ? option.onText : option.offText;
  switch (key) {
    case 'hollowSpeedFactor': {
      const huntSpeed = TUNING.hollowHuntSpeed * value;
      return 'It hunts at ' + huntSpeed.toFixed(1) + ' m/s. You sprint at ' + TUNING.sprintSpeed.toFixed(1) + '.' +
        (huntSpeed >= TUNING.sprintSpeed ? ' You cannot outrun it.' : '');
    }
    case 'hearingFactor':
      return 'It hears a sprinting step from ' + Math.round(TUNING.noiseRadiusSprintStep * value) + ' m.';
    case 'pressureFactor':
      return 'After a chase it leaves you alone for at least ' +
        Math.round(Math.max(TUNING.directorReliefShortestSeconds, TUNING.directorReliefMinimumSeconds / value)) +
        ' s (less with every spool you carry), and comes back ' + (value === 1 ? 'at its usual pace.' : (value > 1 ? 'sooner than usual.' : 'later than usual.'));
    case 'angerFactor':
      return 'About ' + (TUNING.hollowAngerNoticeLevel / (TUNING.hollowAngerPerBeamSecond * value)).toFixed(1) + ' s in the beam before it knows where you are.';
    case 'heatFactor':
      return 'About ' + Math.round(1 / (TUNING.heatPerSecondWhilePainting * value)) + ' s of painting before the scanner overheats.';
    case 'staminaFactor':
      return 'A full bar is ' + (TUNING.staminaSeconds * value).toFixed(1) + ' s of sprinting.';
    case 'phantomFactor':
      if (value <= 0) return 'None, not even the ones that stand at fixed places.';
      return 'About ' + getPhantomBudgetForRooms(19, value) + ' in a descent of Kessel-9, more in a bigger station.';
  }
  return '';
}

// How many chance apparitions a station with this many rooms gets on a threat level with this phantomFactor.
function getPhantomBudgetForRooms(roomCount, phantomFactor) {
  return Math.round(Math.round(TUNING.phantomBudgetBase + roomCount / TUNING.phantomRoomsPerExtra) * phantomFactor);
}

// One line saying how a custom threat level differs from Standard, for the title screen and the ending screen:
// "Hollow speed 115 %, Hollow hearing 70 %, Checkpoints off". If it differs in nothing, it says which preset it equals.
function describeCustomDifficulty(values) {
  const sameAs = findMatchingDifficultyPresetLabel(values);
  if (sameAs !== '') return 'The same as ' + sameAs + '.';
  const standard = DIFFICULTY_PRESETS.standard, parts = [];
  for (const option of CUSTOM_DIFFICULTY_OPTIONS) {
    if (values[option.key] === standard[option.key]) continue;
    if (option.kind === 'switch') parts.push(option.label + ' ' + (values[option.key] ? 'on' : 'off'));
    else parts.push(option.label + ' ' + formatCustomDifficultyValue(option, values[option.key]).toLowerCase());
  }
  return 'Standard, but: ' + parts.join(', ') + '.';
}

// The custom values as a threat level record, like one of DIFFICULTY_PRESETS.
// Its key names every value, so a best time is only ever compared with times set on the very same settings.
function buildCustomDifficulty(values) {
  const difficulty = { label: 'Custom', isCustom: true, description: describeCustomDifficulty(values) };
  const keyParts = [];
  for (const option of CUSTOM_DIFFICULTY_OPTIONS) {
    const value = values[option.key];
    difficulty[option.key] = value;
    keyParts.push(option.kind === 'switch' ? (value ? '1' : '0') : String(Math.round(value * 100)));
  }
  difficulty.key = 'custom-' + keyParts.join('-');
  return difficulty;
}

// The threat level chosen on the title screen, as a record.
function getChosenDifficulty() {
  if (settings.difficulty === 'custom') return buildCustomDifficulty(settings.customDifficulty);
  return DIFFICULTY_PRESETS[settings.difficulty] || DIFFICULTY_PRESETS.standard;
}
