/**
 * ひめじん AI 肖像 — プロンプト自動組み立て（フェーズB）
 * real_name は使わない。種族ラベルでスタイルは変えない。
 */

export const HIMEJIN_PROMPT_TEMPLATE =
  'Candid film still from a modern Japanese TV drama, {人物描写}, in the middle of a conversation, turned in three-quarter profile, looking at another person beside them off-frame, {表情}, gesturing naturally, full attention on the person they talk to, unaware of the camera. Entirely original face, not resembling any real individual. Soft warm daylight, gentle golden ambient light, natural skin tones, subtle muted green accents in the background. Shallow depth of field, contemporary Harima/Himeji street setting. Observational documentary framing, subject off-center.';

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
  const charDesc = buildCharacterDescription(name, tagline, introSummary);
  const expression = pickExpression(intro, tagline);

  return HIMEJIN_PROMPT_TEMPLATE.replace('{人物描写}', charDesc).replace('{表情}', expression);
}
