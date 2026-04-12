(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var root = document.getElementById('arasuji-sakura');
  if (!root) return;

  var panel = root.parentElement;
  if (!panel || !panel.classList.contains('arasuji-hero-panel')) {
    panel = root.closest('.arasuji-hero-panel');
  }

  function updateFallDistance() {
    var p = panel || root.parentElement;
    if (!p) return;
    var h = p.offsetHeight;
    var fall = Math.ceil(h * 1.1 + window.innerHeight * 0.25);
    root.style.setProperty('--sakura-fall-px', fall + 'px');
  }

  var count = 60;

  function pickLayer() {
    var r = Math.random();
    if (r < 0.34) return 'far';
    if (r < 0.68) return 'mid';
    return 'near';
  }

  /* 秒が短いほど落下が速い。near だけ下限が低く、10〜40s で「飛ぶように」見えやすかった */
  function durationForLayer(layer) {
    if (layer === 'far') return 40 + Math.random() * 12;
    if (layer === 'mid') return 34 + Math.random() * 12;
    return 24 + Math.random() * 20;
  }

  function scaleForLayer(layer) {
    /* far は「かなり遠い」より少し手前に見えるよう mid に寄せた */
    if (layer === 'far') return 0.74 + Math.random() * 0.08;
    if (layer === 'mid') return 0.78 + Math.random() * 0.1;
    return 0.9 + Math.random() * 0.1;
  }

  function wobbleXs(factor) {
    var f = typeof factor === 'number' && factor > 0 ? factor : 1;
    /* 横振幅（以前より大きめ：ひらひら＋流れが見えるように） */
    var amp = (100 + Math.random() * 200) * f;
    var s = Math.random() < 0.5 ? 1 : -1;
    var x1 = s * amp * (0.45 + Math.random() * 0.35);
    var x2 = -s * amp * (0.4 + Math.random() * 0.35);
    var x3 = s * amp * (0.25 + Math.random() * 0.3);
    var x4 = (Math.random() * 92 - 46) * f + x3 * 0.35;

    /* 一定方向への流れ（風）：落下に連れて横へ持っていかれる量を足す */
    var wind = (Math.random() * 1200 - 1000) * f;
    x1 += wind * 0.8;
    x2 += wind * 1.2;
    x3 += wind * 1.5;
    x4 += wind * 2.0;

    return {
      '--sx0': '0px',
      '--sx1': x1.toFixed(1) + 'px',
      '--sx2': x2.toFixed(1) + 'px',
      '--sx3': x3.toFixed(1) + 'px',
      '--sx4': x4.toFixed(1) + 'px'
    };
  }

  function applyWobble(el, factor) {
    var w = wobbleXs(factor);
    var k;
    for (k in w) {
      if (Object.prototype.hasOwnProperty.call(w, k)) {
        el.style.setProperty(k, w[k]);
      }
    }
  }

  updateFallDistance();

  for (var i = 0; i < count; i++) {
    var layer = pickLayer();
    var outer = document.createElement('span');
    outer.className = 'arasuji-sakura__petal arasuji-sakura__petal--' + layer;
    if (Math.random() < 0.45) {
      outer.classList.add('arasuji-sakura__petal--shape-b');
    }

    var inner = document.createElement('span');
    inner.className = 'arasuji-sakura__petal-inner';
    outer.appendChild(inner);

    var durationSec = durationForLayer(layer);
    var delaySec = -Math.random() * durationSec;
    outer.style.animationDuration = durationSec + 's';
    outer.style.animationDelay = delaySec + 's';
    inner.style.animationDuration = durationSec + 's';
    inner.style.animationDelay = delaySec + 's';

    /* 左端の外〜右端の外まで（横から入る／横へ出す） */
    outer.style.left = -18 + Math.random() * 136 + '%';

    var wf = layer === 'far' ? 0.88 : layer === 'near' ? 1.22 : 1.05;
    applyWobble(outer, wf);

    outer.style.setProperty('--sakura-turn-n', (7000 + Math.random() * 10000).toFixed(1));
    /* X 軸（ひらひら）。大きすぎると真横から見えて極細＝見えづらいので抑える */
    outer.style.setProperty('--sakura-rx-n', (28 + Math.random() * 68).toFixed(1));
    outer.style.setProperty('--sakura-scale', scaleForLayer(layer).toFixed(2));
    outer.style.setProperty('--sakura-hue', (Math.random() * 18 - 9).toFixed(1) + 'deg');

    root.appendChild(outer);
  }

  window.addEventListener(
    'resize',
    function () {
      updateFallDistance();
    },
    { passive: true }
  );

  window.addEventListener('load', updateFallDistance);

  if (typeof ResizeObserver !== 'undefined' && panel) {
    var ro = new ResizeObserver(function () {
      updateFallDistance();
    });
    ro.observe(panel);
  }
})();
