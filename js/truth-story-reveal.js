(function () {
  var titleEl = document.getElementById('truthStoryTitle');
  var proseEl = document.getElementById('truthStoryProse');
  var section = document.querySelector('.truth-story');
  if (!titleEl || !proseEl || !section) return;

  var DATA = {
    title: '真実のストーリー',
    paragraphs: [
      [
        { text: 'この物語は、', bold: false },
        { text: '真実であり、虚構でも', bold: true },
        { text: 'あります。', bold: false },
      ],
      [
        { text: '実在の人物や団体、施設などとは', bold: false },
        { text: '一切関係があるようで、ないようで、', bold: true },
        { br: true },
        { text: 'やっぱり', bold: false },
        { text: 'あるかもしれません。', bold: true },
      ],
      [
        { text: '物語としての「現実」', bold: true },
        { text: ' をどうぞお楽しみください。', bold: false },
      ],
    ],
  };

  function delay(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function revealInto(el, parts, charDelay) {
    return new Promise(function (resolve) {
      var strongEl = null;
      var pi = 0;
      var ci = 0;

      function step() {
        if (pi >= parts.length) {
          resolve();
          return;
        }
        var part = parts[pi];
        if (part.br) {
          var br = document.createElement('br');
          if (strongEl) {
            strongEl.appendChild(br);
          } else {
            el.appendChild(br);
          }
          pi += 1;
          ci = 0;
          window.setTimeout(step, charDelay);
          return;
        }
        var chars = Array.from(part.text);
        if (ci >= chars.length) {
          pi += 1;
          ci = 0;
          step();
          return;
        }
        var ch = chars[ci];
        var span = document.createElement('span');
        span.className = 'truth-story__char';
        span.textContent = ch;
        if (part.bold) {
          if (!strongEl) {
            strongEl = document.createElement('strong');
            el.appendChild(strongEl);
          }
          strongEl.appendChild(span);
        } else {
          strongEl = null;
          el.appendChild(span);
        }
        ci += 1;
        window.setTimeout(step, charDelay);
      }

      step();
    });
  }

  function fillStatic() {
    section.classList.add('truth-story--reduced');
    titleEl.textContent = DATA.title;
    proseEl.innerHTML =
      '<p>' +
      'この物語は、<strong>真実であり、虚構でも</strong>あります。' +
      '</p><p>' +
      '実在の人物や団体、施設などとは<strong>一切関係があるようで、ないようで、<br>やっぱりあるかもしれません。</strong>' +
      '</p><p>' +
      '<strong>物語としての「現実」</strong> をどうぞお楽しみください。' +
      '</p>';
    section.setAttribute('aria-hidden', 'false');
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    fillStatic();
    return;
  }

  section.setAttribute('aria-hidden', 'true');

  function run() {
    var titleDelay = 44;
    var bodyDelay = 36;
    var pauseAfterTitle = 320;
    var pauseBetweenParas = 420;

    revealInto(titleEl, [{ text: DATA.title, bold: false }], titleDelay)
      .then(function () {
        return delay(pauseAfterTitle);
      })
      .then(function () {
        var chain = Promise.resolve();
        DATA.paragraphs.forEach(function (para, i) {
          chain = chain.then(function () {
            var p = document.createElement('p');
            proseEl.appendChild(p);
            return revealInto(p, para, bodyDelay);
          });
          if (i < DATA.paragraphs.length - 1) {
            chain = chain.then(function () {
              return delay(pauseBetweenParas);
            });
          }
        });
        return chain;
      })
      .then(function () {
        section.setAttribute('aria-hidden', 'false');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
