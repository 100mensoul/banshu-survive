/**
 * 高札横スクロールの初期位置を「右端＝新しい記事側」に合わせる（全幅対象）。
 * 狭い画面では必須、広い画面でカード列が横に溢れる場合も同様。
 * エピソード／ニュースの非同期描画後にも window.scrollKawaraToNewestEnd() を呼ぶ。
 */
(function () {
  function scrollKawaraToNewestEnd() {
    var el = document.getElementById('scrollContainer');
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
  }

  window.scrollKawaraToNewestEnd = scrollKawaraToNewestEnd;

  function runAfterLayout() {
    requestAnimationFrame(function () {
      requestAnimationFrame(scrollKawaraToNewestEnd);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAfterLayout);
  } else {
    runAfterLayout();
  }

  window.addEventListener('load', scrollKawaraToNewestEnd);

  var mq = window.matchMedia('(max-width: 768px)');
  window.addEventListener('resize', function () {
    if (mq.matches) scrollKawaraToNewestEnd();
  });
})();
