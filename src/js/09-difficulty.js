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
  if (option.kind === 'switch') return value ? '켬' : '끔';
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
      return '그것은 ' + huntSpeed.toFixed(1) + ' m/s로 추격한다. 네 전력질주는 ' + TUNING.sprintSpeed.toFixed(1) + '.' +
        (huntSpeed >= TUNING.sprintSpeed ? ' 달리기로는 따돌릴 수 없다.' : '');
    }
    case 'hearingFactor':
      return '전력질주 발소리를 ' + Math.round(TUNING.noiseRadiusSprintStep * value) + ' m 밖에서도 듣는다.';
    case 'pressureFactor':
      return '추격 뒤에는 적어도 ' +
        Math.round(Math.max(TUNING.directorReliefShortestSeconds, TUNING.directorReliefMinimumSeconds / value)) +
        '초는 너를 내버려 두고(스풀을 들수록 짧아진다), ' + (value === 1 ? '평소 속도로 돌아온다.' : (value > 1 ? '평소보다 빨리 돌아온다.' : '평소보다 늦게 돌아온다.'));
    case 'angerFactor':
      return '빔을 쏘기 시작하고 약 ' + (TUNING.hollowAngerNoticeLevel / (TUNING.hollowAngerPerBeamSecond * value)).toFixed(1) + '초 뒤면 네 위치를 안다.';
    case 'heatFactor':
      return '스캐너가 과열되기까지 약 ' + Math.round(1 / (TUNING.heatPerSecondWhilePainting * value)) + '초 분량의 스캔.';
    case 'staminaFactor':
      return '가득 찬 게이지는 ' + (TUNING.staminaSeconds * value).toFixed(1) + '초 분량의 전력질주.';
    case 'phantomFactor':
      if (value <= 0) return '없음, 정해진 자리에 서 있는 것들까지도.';
      return '케셀-9 하강에서 약 ' + getPhantomBudgetForRooms(19, value) + '번, 더 큰 스테이션에서는 더 많이.';
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
  if (sameAs !== '') return sameAs + '와 같음.';
  const standard = DIFFICULTY_PRESETS.standard, parts = [];
  for (const option of CUSTOM_DIFFICULTY_OPTIONS) {
    if (values[option.key] === standard[option.key]) continue;
    if (option.kind === 'switch') parts.push(option.label + ' ' + (values[option.key] ? '켬' : '끔'));
    else parts.push(option.label + ' ' + formatCustomDifficultyValue(option, values[option.key]).toLowerCase());
  }
  return '표준에서 변경: ' + parts.join(', ') + '.';
}

// The custom values as a threat level record, like one of DIFFICULTY_PRESETS.
// Its key names every value, so a best time is only ever compared with times set on the very same settings.
function buildCustomDifficulty(values) {
  const difficulty = { label: '사용자 설정', isCustom: true, description: describeCustomDifficulty(values) };
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
