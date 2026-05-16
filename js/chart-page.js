/**
 * 相関図ページ UI（データは initChartPage に渡す）
 */
window.initChartPage = function (data) {
  if (!data || !data.groups) return;

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function allMembers() {
    const list = [];
    for (const g of data.groups) {
      for (const m of g.members || []) {
        list.push(m);
      }
    }
    return list;
  }

  function memberById(id) {
    return allMembers().find(function (m) {
      return m.id === id;
    });
  }

  function nameInitial(name) {
    const s = String(name || '').trim();
    if (!s) return '?';
    return s.charAt(0);
  }

  function photoPlaceholderHtml(name) {
    const initial = esc(nameInitial(name));
    return (
      '<div class="chart-card__photo chart-card__photo--placeholder" aria-hidden="true">' +
      '<span class="chart-card__photo-initial">' +
      initial +
      '</span>' +
      '<span class="chart-card__photo-pending">写真準備中</span>' +
      '</div>'
    );
  }

  function photoPlaceholderModalHtml(name) {
    const initial = esc(nameInitial(name));
    return (
      '<div class="chart-modal__photo chart-modal__photo--placeholder" aria-hidden="true">' +
      '<span class="chart-modal__photo-initial">' +
      initial +
      '</span>' +
      '</div>'
    );
  }

  function bindPhotoFallback(root) {
    root.querySelectorAll('img.chart-card__photo').forEach(function (img) {
      if (img.dataset.fallbackBound === '1') return;
      img.dataset.fallbackBound = '1';
      img.addEventListener('error', function () {
        const card = img.closest('.chart-card');
        const nameEl = card && card.querySelector('.chart-card__name');
        const name = nameEl ? nameEl.textContent : '';
        const wrap = document.createElement('div');
        wrap.innerHTML = photoPlaceholderHtml(name);
        const ph = wrap.firstElementChild;
        if (card && card.style.getPropertyValue('--card-tint')) {
          ph.style.setProperty('--card-tint', card.style.getPropertyValue('--card-tint'));
        }
        img.replaceWith(ph);
      });
    });
  }

  function renderBoard() {
    const root = document.getElementById('chart-board-root');
    if (!root) return;

    let html = '';
    for (const group of data.groups) {
      const theme = group.theme || '#4a7a9e';
      html += '<section class="chart-group" aria-labelledby="chart-group-' + esc(group.id) + '">';
      html +=
        '<h2 class="chart-group__head" id="chart-group-' +
        esc(group.id) +
        '" style="background:' +
        esc(theme) +
        '">' +
        esc(group.title) +
        '</h2>';
      html +=
        '<div class="chart-group__body" style="--group-tint:' +
        esc(theme) +
        '">';
      for (const m of group.members || []) {
        html +=
          '<button type="button" class="chart-card" data-chart-id="' +
          esc(m.id) +
          '" style="--card-tint:' +
          esc(theme) +
          '" aria-label="' +
          esc(m.name) +
          'の詳細を見る">';
        if (m.photo && String(m.photo).trim()) {
          html +=
            '<img class="chart-card__photo" src="' +
            esc(m.photo) +
            '" alt="" loading="lazy">';
        } else {
          html += photoPlaceholderHtml(m.name);
        }
        html += '<span class="chart-card__name">' + esc(m.name) + '</span>';
        html += '<span class="chart-card__role">' + esc(m.role) + '</span>';
        if (m.tagline) {
          html +=
            '<span class="chart-card__tagline">' + esc(m.tagline) + '</span>';
        }
        html += '</button>';
      }
      html += '</div></section>';
    }
    root.innerHTML = html;
    bindPhotoFallback(root);

    root.querySelectorAll('.chart-card').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openModal(btn.getAttribute('data-chart-id'));
      });
    });
  }

  const modal = document.getElementById('chart-modal');
  const modalBody = document.getElementById('chart-modal-body');

  function openModal(id) {
    const m = memberById(id);
    if (!m || !modal || !modalBody) return;
    let inner = '';
    if (m.photo && String(m.photo).trim()) {
      inner +=
        '<img class="chart-modal__photo" src="' +
        esc(m.photo) +
        '" alt="' +
        esc(m.name) +
        '" data-modal-photo="1">';
    } else {
      inner += photoPlaceholderModalHtml(m.name);
    }
    if (m.reading) {
      inner += '<p class="chart-modal__reading">' + esc(m.reading) + '</p>';
    }
    inner += '<h2 class="chart-modal__name" id="chart-modal-title">' + esc(m.name) + '</h2>';
    if (m.role) {
      inner += '<p class="chart-modal__role">' + esc(m.role) + '</p>';
    }
    if (m.tagline) {
      inner += '<p class="chart-modal__tagline">' + esc(m.tagline) + '</p>';
    }
    if (m.bio) {
      inner += '<p class="chart-modal__bio">' + esc(m.bio) + '</p>';
    }
    modalBody.innerHTML = inner;
    const modalImg = modalBody.querySelector('img[data-modal-photo]');
    if (modalImg) {
      modalImg.addEventListener('error', function onModalImgErr() {
        modalImg.removeEventListener('error', onModalImgErr);
        modalImg.replaceWith(
          (function () {
            const w = document.createElement('div');
            w.innerHTML = photoPlaceholderModalHtml(m.name);
            return w.firstElementChild;
          })()
        );
      });
    }
    modal.hidden = false;
    document.documentElement.classList.add('chart-modal-open');
    modal.querySelector('.chart-modal__close').focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.documentElement.classList.remove('chart-modal-open');
    if (modalBody) modalBody.innerHTML = '';
  }

  function bindModal() {
    if (!modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';
    modal.addEventListener('click', function (e) {
      if (e.target.closest('[data-close-modal]')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && !modal.hidden) closeModal();
    });
  }

  renderBoard();
  bindModal();
};
