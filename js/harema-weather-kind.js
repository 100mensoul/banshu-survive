/**
 * はりまノはれま — テキストから天気区分を推定
 */

/** 表示ラベル・手記から晴/曇/雨を推定（weather 未設定時のフォールバックのみ） */
export function kindFromText(text) {
  var t = (text || '').trim();
  if (!t) return null;
  if (/大雨|豪雨/.test(t)) return 'heavy-rain';
  if (/雨/.test(t)) return 'rain';
  if (/曇/.test(t)) return 'cloudy';
  if (/晴|快晴|日差し|日焼け|暑い|猛暑/.test(t)) return 'sunny';
  return null;
}
