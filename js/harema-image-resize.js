/**
 * はりまノはれま — アップロード前の画像縮小（ブラウザ内）
 * 大きな写真をそのまま Storage に上げないための共通処理
 */
export async function resizeImageForUpload(file, opts) {
  opts = opts || {};
  var maxW = opts.maxWidth != null ? opts.maxWidth : 1600;
  var maxH = opts.maxHeight != null ? opts.maxHeight : 1600;
  var quality = opts.quality != null ? opts.quality : 0.85;
  var skipBelowBytes = opts.skipBelowBytes != null ? opts.skipBelowBytes : 380000;

  if (!file || !file.type || file.type.indexOf('image/') !== 0) {
    return file;
  }
  if (file.type === 'image/gif') {
    return file;
  }

  var bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (e) {
    return file;
  }

  var ow = bitmap.width;
  var oh = bitmap.height;
  var scale = Math.min(1, maxW / ow, maxH / oh);
  if (scale >= 1 && file.size <= skipBelowBytes) {
    bitmap.close();
    return file;
  }

  var w = Math.max(1, Math.round(ow * scale));
  var h = Math.max(1, Math.round(oh * scale));
  var canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext('2d', { alpha: false });
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  var outType = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  var blob = await new Promise(function (resolve) {
    canvas.toBlob(resolve, outType, quality);
  });
  if (!blob) return file;

  var base = file.name.replace(/\.[^.]+$/, '');
  var ext = outType === 'image/webp' ? '.webp' : '.jpg';
  return new File([blob], base + ext, { type: outType, lastModified: Date.now() });
}
