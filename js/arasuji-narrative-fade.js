/**
 * 本文ブロック：スクロールでビューに入った段落・見出しだけフェードイン（1要素＝1ブロック）。
 */
(function () {
  var blocks = document.querySelectorAll('.arasuji-narrative__fade');
  if (!blocks.length) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    blocks.forEach(function (el) {
      el.classList.add('is-visible');
    });
    return;
  }

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    },
    { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0.02 }
  );

  blocks.forEach(function (el) {
    io.observe(el);
  });
})();
