/**
 * イントロ3行（.arasuji-loglines 内）だけ：行ごとの遅延＋浮き上がりアニメ用の animation-delay を付与。
 * 本文は arasuji-narrative-fade.js で段落フェード（このファイルでは触らない）。
 */
(function () {
  var lines = document.querySelectorAll('.arasuji-loglines .arasuji-float-line');
  if (!lines.length) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    lines.forEach(function (el) {
      el.classList.add('arasuji-float-line--static');
    });
    return;
  }

  var step = 0.38;
  lines.forEach(function (el, i) {
    el.style.animationDelay = i * step + 's';
  });
})();
