/**
 * ひめじん AI 肖像 — プロンプト自動組み立て（フェーズB）
 * real_name は使わない。種族ラベルでスタイルは変えない。
 * gen_* が入力されていれば {人物描写} に優先反映する。
 * 外見メモは Appearance: 行として独立配置（日本語のまま）。
 */

/** 公開情報フォールバック用（従来テンプレート・変更しない） */
export const HIMEJIN_PROMPT_TEMPLATE =
  'Candid film still from a modern Japanese TV drama, {人物描写}, in the middle of a conversation, turned in three-quarter profile, looking at another person beside them off-frame, {表情}, gesturing naturally, full attention on the person they talk to, unaware of the camera. Entirely original face, not resembling any real individual. Soft warm daylight, gentle golden ambient light, natural skin tones, subtle muted green accents in the background. Shallow depth of field, contemporary Harima/Himeji street setting. Observational documentary framing, subject off-center.';

/** gen_* 使用時: {表情} の直後から末尾まで（構図・視線・色・安全指定は変更しない） */
const HIMEJIN_PROMPT_TAIL =
  ', in the middle of a conversation, turned in three-quarter profile, looking at another person beside them off-frame, gesturing naturally, full attention on the person they talk to, unaware of the camera. Entirely original face, not resembling any real individual. Soft warm daylight, gentle golden ambient light, natural skin tones, subtle muted green accents in the background. Shallow depth of field, contemporary Harima/Himeji street setting. Observational documentary framing, subject off-center.';

const DARK_TONE_KEYWORDS = [
  '重い',
  '深刻',
  '悲',
  '苦',
  '暗',
  '厳',
  '怒',
  '悲し',
  '苦し',
  'grave',
  'serious',
  'somber',
  'dark',
  'grief',
];

const AGE_RANGE_MAP = [
  { pattern: /10代前半|十代前半/, en: 'in their early teens' },
  { pattern: /10代後半|十代後半/, en: 'in their late teens' },
  { pattern: /20代前半/, en: 'in their early 20s' },
  { pattern: /20代後半/, en: 'in their late 20s' },
  { pattern: /20代|二十代|20s/i, en: 'in their 20s' },
  { pattern: /30代前半/, en: 'in their early 30s' },
  { pattern: /30代後半/, en: 'in their late 30s' },
  { pattern: /30代|三十代|30s|同年代/i, en: 'in their 30s' },
  { pattern: /40代前半/, en: 'in their early 40s' },
  { pattern: /40代後半|40代なかば|40代中ば/, en: 'in their mid-40s' },
  { pattern: /40代|四十代|40s|なかば/, en: 'in their 40s' },
  { pattern: /50代前半/, en: 'in their early 50s' },
  { pattern: /50代後半/, en: 'in their late 50s' },
  { pattern: /50代|五十代|50s|半百/, en: 'in their 50s' },
  { pattern: /60代|六十代|60s/, en: 'in their 60s' },
  { pattern: /70代|七十代|70s/, en: 'in their 70s' },
];

export function summarizeIntro(intro, maxLen) {
  if (maxLen == null) maxLen = 100;
  return String(intro || '').trim().slice(0, maxLen);
}

export function pickExpression(intro, tagline) {
  const text = String(intro || '') + ' ' + String(tagline || '');
  for (let i = 0; i < DARK_TONE_KEYWORDS.length; i++) {
    if (text.indexOf(DARK_TONE_KEYWORDS[i]) !== -1) {
      return 'calm serious look';
    }
  }
  return 'soft slight smile';
}

export function hasGenAttributes(fields) {
  if (!fields) return false;
  const gender = String(fields.gen_gender || '').trim();
  const age = String(fields.gen_age_range || '').trim();
  const notes = String(fields.gen_appearance_notes || '').trim();
  const hasGender = gender !== '' && gender !== '指定なし';
  return hasGender || age !== '' || notes !== '';
}

export function mapAgeRangeToEnglish(ageRange) {
  const raw = String(ageRange || '').trim();
  if (!raw) return '';
  for (let i = 0; i < AGE_RANGE_MAP.length; i++) {
    if (AGE_RANGE_MAP[i].pattern.test(raw)) {
      return AGE_RANGE_MAP[i].en;
    }
  }
  return 'around ' + raw;
}

/** 外見メモは日本語のまま Appearance 行へ（翻訳・埋め込みしない） */
export function formatAppearanceNotes(notes) {
  return String(notes || '').trim();
}

export function buildCharacterDescriptionFromGen(fields) {
  const genderJa = String(fields.gen_gender || '').trim();
  const ageJa = String(fields.gen_age_range || '').trim();

  let genderPhrase = 'a fictional person';
  if (genderJa === '男性') genderPhrase = 'a fictional man';
  else if (genderJa === '女性') genderPhrase = 'a fictional woman';

  const parts = [genderPhrase];
  const ageEn = mapAgeRangeToEnglish(ageJa);
  if (ageEn) parts.push(ageEn);

  return parts.join(', ');
}

export function buildCharacterDescription(name, tagline, introSummary) {
  const tag = String(tagline || '').trim();
  const intro = String(introSummary || '').trim();
  const combined = String(name || '') + ' ' + tag + ' ' + intro;

  let gender = 'person';
  if (/女性|彼女|母|妻|娘|woman|female/i.test(combined)) {
    gender = 'woman';
  } else if (/男性|彼[^女]|父|夫|息子|兄|弟|man|male/i.test(combined)) {
    gender = 'man';
  }

  let age = '';
  if (/50代|五十|50s|半百/i.test(intro)) {
    age = 'in his or her 50s';
  } else if (/40代|四十|mid-40|40s|なかば/i.test(intro)) {
    age = 'in his or her mid-40s';
  } else if (/30代|三十|late 30|early 30|30s|同年代/i.test(intro)) {
    age = 'in his or her late 30s';
  } else if (/20代|二十|20s|若/i.test(intro)) {
    age = 'in his or her late 20s';
  }

  const moodParts = [];
  if (tag) moodParts.push(tag);
  if (intro) moodParts.push(intro.slice(0, 60));

  const mood = moodParts.length ? moodParts.join(', ') : 'distinctive and grounded';

  const genderPhrase = gender === 'person' ? 'a fictional person' : 'a fictional ' + gender;
  if (age) {
    return genderPhrase + ' ' + age + ', ' + mood;
  }
  return genderPhrase + ', ' + mood;
}

export function buildHimejinPrompt(fields) {
  const name = fields && fields.name != null ? fields.name : '';
  const tagline = fields && fields.tagline != null ? fields.tagline : '';
  const intro = fields && fields.intro != null ? fields.intro : '';

  const introSummary = summarizeIntro(intro, 100);
  const expression = pickExpression(intro, tagline);

  if (hasGenAttributes(fields)) {
    const charDesc = buildCharacterDescriptionFromGen(fields);
    const appearanceNotes = formatAppearanceNotes(fields.gen_appearance_notes);
    let prompt = 'Candid film still from a modern Japanese TV drama, ' + charDesc + '.';
    if (appearanceNotes) {
      prompt += ' Appearance: ' + appearanceNotes + '.';
    }
    prompt += ' ' + expression + HIMEJIN_PROMPT_TAIL;
    return prompt;
  }

  const charDesc = buildCharacterDescription(name, tagline, introSummary);
  return HIMEJIN_PROMPT_TEMPLATE.replace('{人物描写}', charDesc).replace('{表情}', expression);
}
