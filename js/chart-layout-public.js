import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  initChartLayoutEditor,
  fetchChartLayout,
  loadCastAndHimejinForLayout,
  buildPeopleMapFromCast,
} from './chart-layout-editor.js?v=21';

function sbReady() {
  const url = window.__SB_URL;
  const key = window.__SB_ANON_KEY;
  return (
    key &&
    String(key).trim().length > 0 &&
    url &&
    String(url).trim().length > 0 &&
    !String(url).includes('あなたのプロジェクトID')
  );
}

function openMemberModal(slug, person) {
  if (typeof window.__chartPageOpenMember === 'function') {
    window.__chartPageOpenMember(slug);
    return;
  }

  const modal = document.getElementById('chart-modal');
  const modalBody = document.getElementById('chart-modal-body');
  if (!modal || !modalBody || !person) return;

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  let inner = '';
  if (person.photo && String(person.photo).trim()) {
    inner +=
      '<img class="chart-modal__photo" src="' +
      esc(person.photo) +
      '" alt="' +
      esc(person.name) +
      '">';
  }
  if (person.reading) {
    inner += '<p class="chart-modal__reading">' + esc(person.reading) + '</p>';
  }
  inner += '<h2 class="chart-modal__name" id="chart-modal-title">' + esc(person.name) + '</h2>';
  if (person.role) inner += '<p class="chart-modal__role">' + esc(person.role) + '</p>';
  if (person.tagline) inner += '<p class="chart-modal__tagline">' + esc(person.tagline) + '</p>';
  if (person.bio) inner += '<p class="chart-modal__bio">' + esc(person.bio) + '</p>';
  modalBody.innerHTML = inner;
  modal.hidden = false;
  document.documentElement.classList.add('chart-modal-open');
}

async function boot() {
  const mount = document.getElementById('chart-layout-root');
  if (!mount) return;

  let groups = [];
  let peopleMap = {};

  if (window.CHART_CAST && window.CHART_CAST.groups) {
    groups = window.CHART_CAST.groups;
    peopleMap = buildPeopleMapFromCast(groups, []);
  }

  let remote = null;

  if (sbReady()) {
    const supabase = createClient(window.__SB_URL, window.__SB_ANON_KEY);
    try {
      const loaded = await loadCastAndHimejinForLayout(supabase, true);
      if (loaded.groups.length) {
        groups = loaded.groups;
        peopleMap = loaded.peopleMap;
      }
      remote = await fetchChartLayout(supabase, true);
    } catch (_e) {
      /* fallback to static */
    }
  }

  const editor = initChartLayoutEditor({
    container: mount,
    readOnly: true,
    groups,
    peopleMap,
    initialCanvas: remote?.canvas || null,
    onNodeClick: openMemberModal,
  });

  editor.mergeInitialLoad(remote);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
