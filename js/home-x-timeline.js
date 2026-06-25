(function () {
  var iframes = document.querySelectorAll('.home-external-feeds__iframe--x[data-x-screen]');
  if (!iframes.length) return;

  var origin = window.location.origin || 'https://100mensoul.github.io';

  iframes.forEach(function (iframe) {
    var screen = iframe.getAttribute('data-x-screen');
    if (!screen) return;

    var params = new URLSearchParams({
      dnt: 'false',
      lang: 'ja',
      theme: 'light',
      origin: origin
    });

    iframe.src =
      'https://syndication.twitter.com/srv/timeline-profile/screen-name/' +
      screen +
      '?' +
      params.toString();
  });
})();
