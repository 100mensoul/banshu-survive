/**
 * 相関図レイアウトエディタ（公開・編集共用）
 */
import {
  CARD_SIZES,
  normalizeSize,
  nodeScale,
  defaultCanvasFromGroups,
  normalizeCanvas,
  buildRenderPlan,
  findRelationEdgeIndex,
  findMarriageEdgeIndex,
  findFamilyChildIndex,
  coupleKey,
  isCoupleLabel,
  hasManualLayout,
  shiftEdgeEndpointsForNode,
  snapEndpointNormForEdge,
  applyPortDrag,
  clearEdgeManualLayout,
  ARROW_TIP_LEN,
  snapAngleDeg,
} from './chart-layout-geometry.js?v=21';

const LAYOUT_ID = 'main';
const LOCAL_KEY = 'banshu_chart_layout_v1';
const HISTORY_MAX = 50;
const DRAG_THRESHOLD = 6;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nameInitial(name) {
  const s = String(name || '').trim();
  return s ? s.charAt(0) : '?';
}

function clamp01(v) {
  return Math.max(0.04, Math.min(0.96, v));
}

export function initChartLayoutEditor(options) {
  const {
    supabase = null,
    readOnly = false,
    container,
    peopleMap = {},
    initialCanvas = null,
    onStatus = function () {},
    onNodeClick = null,
  } = options || {};

  const root = typeof container === 'string' ? document.getElementById(container) : container;
  if (!root) return { destroy: function () {} };

  let canvas = normalizeCanvas(initialCanvas);
  if (!canvas.nodes.length && options.groups && options.groups.length) {
    canvas = defaultCanvasFromGroups(options.groups);
  }
  if (!canvas.zones) canvas.zones = [];

  let history = [];
  let historyIndex = -1;
  let remoteUpdatedAt = 0;
  let tool = 'move';
  let lineMode = 'relation';
  let linkFromSlug = null;
  let linkParents = [];
  let selectedEdgeIndex = -1;
  let selectedNodeSlug = null;
  let selectedZoneId = null;
  let pendingDragSlug = null;
  let pendingZoneDrag = null;
  let dragPointerId = null;
  let dragStartClientX = 0;
  let dragStartClientY = 0;
  let dragHasMoved = false;
  let pendingEndpointDrag = null;
  let endpointDragMoved = false;
  let pendingLabelDrag = null;
  let labelDragMoved = false;
  let pendingElbowDrag = null;
  let elbowDragMoved = false;
  let dragLastNormX = 0;
  let dragLastNormY = 0;

  root.classList.add('chart-layout-app');
  if (readOnly) root.classList.add('chart-layout-app--readonly');
  else root.classList.add('chart-layout-app--edit');

  root.innerHTML =
    '<div class="chart-layout-toolbar" id="chart-layout-toolbar" hidden>' +
    '<button type="button" id="chart-layout-undo" disabled>↩ 戻る</button>' +
    '<button type="button" id="chart-layout-redo" disabled>↪ 進む</button>' +
    '<button type="button" id="chart-layout-save" class="chart-layout-toolbar__primary">保存</button>' +
    '<span class="chart-layout-toolbar__sep"></span>' +
    '<button type="button" id="chart-layout-tool-move" class="on">✥ 移動</button>' +
    '<button type="button" id="chart-layout-tool-relation">／ 関係</button>' +
    '<button type="button" id="chart-layout-tool-marriage">💑 夫婦</button>' +
    '<button type="button" id="chart-layout-tool-family">🌿 親子</button>' +
    '<button type="button" id="chart-layout-tool-zone">▢ 範囲</button>' +
    '<button type="button" id="chart-layout-add-zone">＋範囲</button>' +
    '<span class="chart-layout-toolbar__hint" id="chart-layout-hint"></span></div>' +
    '<div class="chart-layout-edge-modal" id="chart-layout-edge-modal" hidden>' +
    '<div class="chart-layout-edge-modal__backdrop" id="chart-layout-edge-modal-backdrop" aria-hidden="true"></div>' +
    '<div class="chart-layout-edge-modal__dialog" role="dialog" aria-labelledby="chart-layout-edge-title">' +
    '<div class="chart-layout-edge-panel" id="chart-layout-edge-panel">' +
    '<strong class="chart-layout-edge-panel__title" id="chart-layout-edge-title">関係線</strong>' +
    '<p class="chart-layout-edge-panel__kind" id="chart-layout-edge-kind"></p>' +
    '<label class="chart-layout-edge-panel__field">関係ラベル<input type="text" id="chart-layout-edge-label" autocomplete="off" placeholder="例：夫婦・長女・次女"></label>' +
    '<label class="chart-layout-edge-panel__field" id="chart-layout-edge-directed-wrap">' +
    '<input type="checkbox" id="chart-layout-edge-directed"> 矢印あり（有方向）</label>' +
    '<label class="chart-layout-edge-panel__field">線の種類<select id="chart-layout-edge-style">' +
    '<option value="solid">実線</option><option value="dashed">破線</option></select></label>' +
    '<div class="chart-layout-edge-panel__actions">' +
    '<button type="button" id="chart-layout-edge-reverse">逆方向を追加</button>' +
    '<button type="button" id="chart-layout-edge-front">前面</button>' +
    '<button type="button" id="chart-layout-edge-back">背面</button>' +
    '<button type="button" id="chart-layout-edge-reset-route">初期レイアウトに戻す</button>' +
    '<button type="button" id="chart-layout-edge-delete" class="chart-layout-edge-panel__danger">削除</button>' +
    '<button type="button" id="chart-layout-edge-close">閉じる</button></div></div></div></div>' +
    '<div class="chart-layout-node-panel" id="chart-layout-node-panel" hidden>' +
    '<strong class="chart-layout-node-panel__title" id="chart-layout-node-title">キャラ</strong>' +
    '<label class="chart-layout-node-panel__field">カードサイズ<select id="chart-layout-node-size">' +
    '<option value="sm">S — 小</option><option value="md">M — 標準</option>' +
    '<option value="lg">L — 大</option><option value="xl">XL — 特大</option></select></label>' +
    '<p class="chart-layout-node-panel__peers" id="chart-layout-node-peers"></p>' +
    '<div class="chart-layout-node-panel__actions"><button type="button" id="chart-layout-node-close">閉じる</button></div></div>' +
    '<div class="chart-layout-zone-panel" id="chart-layout-zone-panel" hidden>' +
    '<strong class="chart-layout-zone-panel__title">コミュニティ範囲</strong>' +
    '<label class="chart-layout-zone-panel__field">名称<input type="text" id="chart-layout-zone-title" placeholder="例：元永家"></label>' +
    '<label class="chart-layout-zone-panel__field">色<input type="color" id="chart-layout-zone-color" value="#f0c4a8"></label>' +
    '<div class="chart-layout-zone-panel__actions">' +
    '<button type="button" id="chart-layout-zone-delete" class="chart-layout-edge-panel__danger">削除</button>' +
    '<button type="button" id="chart-layout-zone-close">閉じる</button></div></div>' +
    '<div class="chart-layout-size-guide" id="chart-layout-size-guide" hidden>' +
    '<span class="chart-layout-size-guide__heading">サイズガイド</span>' +
    '<div class="chart-layout-size-guide__items" id="chart-layout-size-guide-items"></div></div>' +
    '<div class="chart-layout-stage" id="chart-layout-stage">' +
    '<div class="chart-layout-zones" id="chart-layout-zones"></div>' +
    '<svg class="chart-layout-edges" id="chart-layout-edges"></svg>' +
    '<div class="chart-layout-nodes" id="chart-layout-nodes"></div></div>' +
    '<p class="chart-layout-empty" id="chart-layout-empty" hidden>まだ相関図に載せるキャラがありません。</p>';

  const $ = function (id) { return root.querySelector(id); };
  const stage = $('#chart-layout-stage');
  const zonesEl = $('#chart-layout-zones');
  const edgesSvg = $('#chart-layout-edges');
  const nodesEl = $('#chart-layout-nodes');
  const hintEl = $('#chart-layout-hint');

  if (!readOnly) {
    $('#chart-layout-toolbar').hidden = false;
    $('#chart-layout-size-guide').hidden = false;
  }

  function person(slug) {
    return peopleMap[slug] || { slug, name: slug, role: '', tagline: '', photo: '', theme: '#4a7a9e', source: 'cast' };
  }
  function personName(slug) { return person(slug).name; }

  function setStatus(text) { onStatus(text); }

  function syncToolHint() {
    if (!hintEl || readOnly) return;
    if (tool === 'line') {
      if (lineMode === 'family-child') {
        if (linkParents.length === 0) hintEl.textContent = '親1人目をクリック';
        else if (linkParents.length === 1) hintEl.textContent = personName(linkParents[0]) + ' の配偶者（または同じ親）をクリック';
        else hintEl.textContent = '子どもをクリック（' + personName(linkParents[0]) + '・' + personName(linkParents[1]) + '）';
      } else if (linkFromSlug) {
        hintEl.textContent = personName(linkFromSlug) + ' → 相手をクリック';
      } else if (lineMode === 'marriage') {
        hintEl.textContent = '夫婦：2人を順にクリック';
      } else {
        hintEl.textContent = '関係：2人を順にクリック（線クリックで編集）';
      }
    } else if (tool === 'zone') {
      hintEl.textContent = '範囲をドラッグで移動 · ＋範囲で追加';
    } else {
      hintEl.textContent = '矢尻・折れ点・ラベルをドラッグ · ダブルクリック=編集 · モーダルで初期化';
    }
  }

  function resetLinkState() {
    linkFromSlug = null;
    linkParents = [];
  }

  function syncToolButtons() {
    root.querySelector('#chart-layout-tool-move').classList.toggle('on', tool === 'move');
    root.querySelector('#chart-layout-tool-relation').classList.toggle('on', tool === 'line' && lineMode === 'relation');
    root.querySelector('#chart-layout-tool-marriage').classList.toggle('on', tool === 'line' && lineMode === 'marriage');
    root.querySelector('#chart-layout-tool-family').classList.toggle('on', tool === 'line' && lineMode === 'family-child');
    root.querySelector('#chart-layout-tool-zone').classList.toggle('on', tool === 'zone');
    root.classList.toggle('chart-layout-app--line-tool', tool === 'line');
  }

  function setTool(next, opts) {
    opts = opts || {};
    tool = next;
    resetLinkState();
    if (!opts.keepEdgePanel) closeEdgePanel();
    if (!opts.keepNodePanel) closeNodePanel();
    if (!opts.keepZonePanel) closeZonePanel();
    syncToolButtons();
    syncToolHint();
    renderAll();
  }

  function setLineMode(mode) {
    lineMode = mode;
    resetLinkState();
    tool = 'line';
    closeEdgePanel();
    closeNodePanel();
    setTool('line');
  }

  function captureState() { return JSON.stringify(canvas); }

  function pushHistory() {
    if (readOnly) return;
    const snap = captureState();
    if (historyIndex >= 0 && history[historyIndex] === snap) return;
    history = history.slice(0, historyIndex + 1);
    history.push(snap);
    if (history.length > HISTORY_MAX) history.shift();
    historyIndex = history.length - 1;
    $('#chart-layout-undo').disabled = historyIndex <= 0;
    $('#chart-layout-redo').disabled = historyIndex >= history.length - 1;
  }

  function initHistory() {
    history = [captureState()];
    historyIndex = 0;
  }

  function applyCanvas(raw) {
    canvas = normalizeCanvas(typeof raw === 'string' ? JSON.parse(raw) : raw);
    if (!canvas.zones) canvas.zones = [];
    selectedEdgeIndex = -1;
    selectedNodeSlug = null;
    selectedZoneId = null;
    resetLinkState();
    $('#chart-layout-edge-panel').hidden = true;
    $('#chart-layout-node-panel').hidden = true;
    $('#chart-layout-zone-panel').hidden = true;
    renderAll();
    syncToolHint();
  }

  function nodeBySlug(slug) { return canvas.nodes.find(function (n) { return n.slug === slug; }); }
  function zoneById(id) { return canvas.zones.find(function (z) { return z.id === id; }); }

  function appendArrowPolygon(group, arrow, cls) {
    if (!arrow || !arrow.tip) return;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d',
      'M ' + arrow.tip.x + ' ' + arrow.tip.y +
      ' L ' + arrow.left.x + ' ' + arrow.left.y +
      ' L ' + arrow.right.x + ' ' + arrow.right.y + ' Z'
    );
    path.setAttribute('class', cls || 'chart-layout-edge__arrow');
    group.appendChild(path);
  }

  function appendSegment(group, seg, edgeStyle, selected, edgeIndex, interactive) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(seg.x1));
    line.setAttribute('y1', String(seg.y1));
    line.setAttribute('x2', String(seg.x2));
    line.setAttribute('y2', String(seg.y2));
    let cls = 'chart-layout-edge';
    if (seg.dashed || edgeStyle === 'dashed') cls += ' chart-layout-edge--dashed';
    if (selected) cls += ' chart-layout-edge--selected';
    if (interactive && edgeIndex != null) {
      cls += ' chart-layout-edge--interactive';
      line.dataset.edgeIndex = String(edgeIndex);
    }
    line.setAttribute('class', cls);
    group.appendChild(line);
  }

  function appendLabelButton(group, lb, edgeIndex, interactive, selected, dragging) {
    const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    let groupCls = 'chart-layout-edge__label-group';
    if (interactive) groupCls += ' chart-layout-edge__label-group--interactive';
    if (selected) groupCls += ' chart-layout-edge__label-group--selected';
    if (dragging) groupCls += ' chart-layout-edge__label-group--dragging';
    labelGroup.setAttribute('class', groupCls);
    if (interactive) {
      labelGroup.dataset.edgeIndex = String(edgeIndex);
      labelGroup.dataset.labelDrag = '1';
    }

    const isVertical = !!lb.vertical;
    const hitSize = isVertical ? { w: 28, h: Math.max(36, lb.text.length * 14) } : { w: Math.max(48, lb.text.length * 13), h: 24 };
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    hit.setAttribute('x', String(lb.x - hitSize.w / 2));
    hit.setAttribute('y', String(lb.y - (isVertical ? 0 : hitSize.h * 0.75)));
    hit.setAttribute('width', String(hitSize.w));
    hit.setAttribute('height', String(hitSize.h));
    hit.setAttribute('class', 'chart-layout-edge-label-hit');
    labelGroup.appendChild(hit);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('class', 'chart-layout-edge__label' + (isVertical ? ' chart-layout-edge__label--vertical' : ''));
    if (interactive) text.dataset.edgeIndex = String(edgeIndex);
    if (isVertical) {
      lb.text.split('').forEach(function (ch, i) {
        const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        tspan.setAttribute('x', String(lb.x));
        if (i === 0) tspan.setAttribute('y', String(lb.y));
        else tspan.setAttribute('dy', '1.05em');
        tspan.textContent = ch;
        text.appendChild(tspan);
      });
    } else {
      text.setAttribute('x', String(lb.x));
      text.setAttribute('y', String(lb.y));
      if (lb.rotate) {
        text.setAttribute('transform', 'rotate(' + lb.rotate + ' ' + lb.x + ' ' + lb.y + ')');
      }
      text.textContent = lb.text;
    }
    labelGroup.appendChild(text);
    group.appendChild(labelGroup);
  }

  function appendArrowTipHandle(group, pt, edgeIndex, role, angleDeg, selected, dragging) {
    const tip = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    let tipCls = 'chart-layout-edge-tip';
    if (selected) tipCls += ' chart-layout-edge-tip--selected';
    if (dragging) tipCls += ' chart-layout-edge-tip--dragging';
    tip.setAttribute('class', tipCls);
    const angle = snapAngleDeg(angleDeg);
    tip.setAttribute('transform', 'translate(' + pt.x + ',' + pt.y + ') rotate(' + angle + ')');
    tip.dataset.edgeIndex = String(edgeIndex);
    tip.dataset.endpoint = role;

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    hit.setAttribute('x', '-14');
    hit.setAttribute('y', '-14');
    hit.setAttribute('width', '28');
    hit.setAttribute('height', '28');
    hit.setAttribute('class', 'chart-layout-edge-tip__hit');

    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    arrow.setAttribute('class', 'chart-layout-edge-tip__arrow');
    arrow.setAttribute('transform', 'translate(-10, -5)');

    tip.appendChild(hit);
    tip.appendChild(arrow);
    group.appendChild(tip);
  }

  function appendElbowHandle(group, pt, edgeIndex, cornerIndex, selected, dragging) {
    const elbow = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    elbow.setAttribute('x', String(pt.x - 7));
    elbow.setAttribute('y', String(pt.y - 7));
    elbow.setAttribute('width', '14');
    elbow.setAttribute('height', '14');
    let cls = 'chart-layout-edge-elbow';
    if (selected) cls += ' chart-layout-edge-elbow--selected';
    if (dragging) cls += ' chart-layout-edge-elbow--dragging';
    elbow.setAttribute('class', cls);
    elbow.dataset.edgeIndex = String(edgeIndex);
    elbow.dataset.cornerIndex = String(cornerIndex);
    group.appendChild(elbow);
  }

  function bindEndpointDrag() {
    if (readOnly || !edgesSvg || edgesSvg.dataset.boundEndpoint === '1') return;
    edgesSvg.dataset.boundEndpoint = '1';

    edgesSvg.addEventListener('pointerdown', function (e) {
      if (tool !== 'move') return;
      const handle = e.target && e.target.closest ? e.target.closest('.chart-layout-edge-tip') : null;
      if (!handle) return;
      e.stopPropagation();
      e.preventDefault();
      const edgeIndex = parseInt(handle.dataset.edgeIndex, 10);
      const role = handle.dataset.endpoint;
      if (!role || edgeIndex < 0) return;
      selectedEdgeIndex = edgeIndex;
      pendingEndpointDrag = { edgeIndex, role, pointerId: e.pointerId };
      endpointDragMoved = false;
      edgesSvg.setPointerCapture(e.pointerId);
      renderEdges();
    });

    edgesSvg.addEventListener('pointermove', function (e) {
      if (!pendingEndpointDrag || e.pointerId !== pendingEndpointDrag.pointerId) return;
      const edge = canvas.edges[pendingEndpointDrag.edgeIndex];
      if (!edge) return;
      const norm = pointerToNorm(e.clientX, e.clientY);
      const rect = stage.getBoundingClientRect();
      const snapped = snapEndpointNormForEdge(
        edge,
        pendingEndpointDrag.role,
        norm,
        canvas,
        rect.width || 1,
        rect.height || 1
      );
      if (pendingEndpointDrag.role === 'from') {
        applyPortDrag(edge, 'from', snapped.port);
      } else {
        applyPortDrag(edge, 'to', snapped.port);
      }
      endpointDragMoved = true;
      renderEdges();
    });

    function finishEndpointDrag(e) {
      if (!pendingEndpointDrag || e.pointerId !== pendingEndpointDrag.pointerId) return;
      if (edgesSvg.hasPointerCapture(e.pointerId)) edgesSvg.releasePointerCapture(e.pointerId);
      pendingEndpointDrag = null;
      if (endpointDragMoved) {
        canvas = normalizeCanvas(canvas);
        pushHistory();
        saveLocal();
        updateEdgeResetButton();
      }
      endpointDragMoved = false;
      renderEdges();
    }

    edgesSvg.addEventListener('pointerup', finishEndpointDrag);
    edgesSvg.addEventListener('pointercancel', finishEndpointDrag);
  }

  function bindElbowDrag() {
    if (readOnly || !edgesSvg || edgesSvg.dataset.boundElbow === '1') return;
    edgesSvg.dataset.boundElbow = '1';

    edgesSvg.addEventListener('pointerdown', function (e) {
      if (tool !== 'move') return;
      const handle = e.target && e.target.closest ? e.target.closest('.chart-layout-edge-elbow') : null;
      if (!handle) return;
      e.stopPropagation();
      e.preventDefault();
      const edgeIndex = parseInt(handle.dataset.edgeIndex, 10);
      const cornerIndex = parseInt(handle.dataset.cornerIndex, 10);
      if (edgeIndex < 0) return;
      selectedEdgeIndex = edgeIndex;
      pendingElbowDrag = { edgeIndex, waypointIndex: cornerIndex, pointerId: e.pointerId };
      elbowDragMoved = false;
      edgesSvg.setPointerCapture(e.pointerId);
      renderEdges();
    });

    edgesSvg.addEventListener('pointermove', function (e) {
      if (!pendingElbowDrag || e.pointerId !== pendingElbowDrag.pointerId) return;
      const edge = canvas.edges[pendingElbowDrag.edgeIndex];
      if (!edge) return;
      const norm = pointerToNorm(e.clientX, e.clientY);
      const wi = pendingElbowDrag.waypointIndex;
      if (!edge.waypoints) edge.waypoints = [];
      if (wi >= 0 && wi < edge.waypoints.length) {
        edge.waypoints[wi] = { x: norm.x, y: norm.y };
      } else {
        edge.waypoints = [{ x: norm.x, y: norm.y }];
      }
      delete edge.jointMidX;
      delete edge.jointMidY;
      delete edge.elbowPoint;
      delete edge.fromPoint;
      delete edge.toPoint;
      elbowDragMoved = true;
      renderEdges();
    });

    function finishElbowDrag(e) {
      if (!pendingElbowDrag || e.pointerId !== pendingElbowDrag.pointerId) return;
      if (edgesSvg.hasPointerCapture(e.pointerId)) edgesSvg.releasePointerCapture(e.pointerId);
      pendingElbowDrag = null;
      if (elbowDragMoved) {
        canvas = normalizeCanvas(canvas);
        pushHistory();
        saveLocal();
        updateEdgeResetButton();
      }
      elbowDragMoved = false;
      renderEdges();
    }

    edgesSvg.addEventListener('pointerup', finishElbowDrag);
    edgesSvg.addEventListener('pointercancel', finishElbowDrag);
  }

  function bindLabelDrag() {
    if (readOnly || !edgesSvg || edgesSvg.dataset.boundLabel === '1') return;
    edgesSvg.dataset.boundLabel = '1';

    edgesSvg.addEventListener('pointerdown', function (e) {
      if (tool !== 'move') return;
      const labelEl = e.target && e.target.closest ? e.target.closest('[data-label-drag="1"]') : null;
      if (!labelEl) return;
      e.stopPropagation();
      e.preventDefault();
      const edgeIndex = parseInt(labelEl.dataset.edgeIndex, 10);
      if (edgeIndex < 0) return;
      ensureEdgeLabelDefault(edgeIndex);
      selectedEdgeIndex = edgeIndex;
      pendingLabelDrag = { edgeIndex, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY };
      labelDragMoved = false;
      edgesSvg.setPointerCapture(e.pointerId);
      renderEdges();
    });

    edgesSvg.addEventListener('pointermove', function (e) {
      if (!pendingLabelDrag || e.pointerId !== pendingLabelDrag.pointerId) return;
      const edge = canvas.edges[pendingLabelDrag.edgeIndex];
      if (!edge) return;
      if (!labelDragMoved) {
        const dist = Math.hypot(e.clientX - pendingLabelDrag.startX, e.clientY - pendingLabelDrag.startY);
        if (dist < DRAG_THRESHOLD) return;
        labelDragMoved = true;
      }
      const norm = pointerToNorm(e.clientX, e.clientY);
      const vertical = edge.labelPoint && edge.labelPoint.vertical === true;
      edge.labelPoint = { x: norm.x, y: norm.y, vertical: vertical };
      renderEdges();
    });

    function finishLabelDrag(e) {
      if (!pendingLabelDrag || e.pointerId !== pendingLabelDrag.pointerId) return;
      if (edgesSvg.hasPointerCapture(e.pointerId)) edgesSvg.releasePointerCapture(e.pointerId);
      const edgeIndex = pendingLabelDrag.edgeIndex;
      const moved = labelDragMoved;
      pendingLabelDrag = null;
      if (moved) {
        canvas = normalizeCanvas(canvas);
        pushHistory();
        saveLocal();
        updateEdgeResetButton();
        labelDragMoved = false;
        renderEdges();
        return;
      }
      labelDragMoved = false;
      selectEdge(edgeIndex, { openModal: true });
    }

    edgesSvg.addEventListener('pointerup', finishLabelDrag);
    edgesSvg.addEventListener('pointercancel', finishLabelDrag);
  }

  function ensureEdgeLabelDefault(index) {
    const edge = canvas.edges[index];
    if (!edge || edge.labelPoint) return;
    const text = String(edge.label || '').trim();
    if (!text) return;
    const rect = stage.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    const plan = buildRenderPlan(canvas, w, h, personName);
    const item = plan.edges.find(function (it) { return it.index === index; });
    const lb = item && item.labels[0];
    if (lb) {
      edge.labelPoint = { x: lb.x / w, y: lb.y / h, vertical: !!lb.vertical };
    }
  }

  function updateEdgeResetButton() {
    const btn = $('#chart-layout-edge-reset-route');
    if (!btn) return;
    if (selectedEdgeIndex < 0) {
      btn.hidden = true;
      return;
    }
    const edge = canvas.edges[selectedEdgeIndex];
    if (!edge) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    btn.disabled = !hasManualLayout(edge);
  }

  function resetEdgeRoute() {
    if (selectedEdgeIndex < 0) return;
    const edge = canvas.edges[selectedEdgeIndex];
    if (!edge) return;
    clearEdgeManualLayout(edge);
    canvas = normalizeCanvas(canvas);
    pushHistory();
    saveLocal();
    updateEdgeResetButton();
    renderEdges();
    setStatus('線とラベルを初期レイアウトに戻しました');
  }

  function bindEdgeSelection() {
    if (readOnly || !edgesSvg || edgesSvg.dataset.boundSelect === '1') return;
    edgesSvg.dataset.boundSelect = '1';
    edgesSvg.addEventListener('pointerdown', function (e) {
      if (tool !== 'move') return;
      if (e.target && e.target.closest && e.target.closest('.chart-layout-edge-tip, .chart-layout-edge-elbow, .chart-layout-edge__label-group')) return;
      const target = e.target;
      const edgeEl = target && target.closest
        ? target.closest('[data-edge-index]')
        : null;
      if (!edgeEl || !edgeEl.dataset.edgeIndex) return;
      e.stopPropagation();
      e.preventDefault();
      selectEdge(parseInt(edgeEl.dataset.edgeIndex, 10), { openModal: false });
    });

    edgesSvg.addEventListener('dblclick', function (e) {
      if (tool !== 'move') return;
      if (e.target && e.target.closest && e.target.closest('.chart-layout-edge-tip, .chart-layout-edge-elbow, .chart-layout-edge__label-group')) return;
      const edgeEl = e.target && e.target.closest ? e.target.closest('[data-edge-index]') : null;
      if (!edgeEl || !edgeEl.dataset.edgeIndex) return;
      e.stopPropagation();
      e.preventDefault();
      selectEdge(parseInt(edgeEl.dataset.edgeIndex, 10), { openModal: true });
    });
  }

  function renderZones() {
    if (!zonesEl || !stage) return;
    zonesEl.innerHTML = '';
    const rect = stage.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    (canvas.zones || []).slice().sort(function (a, b) { return (a.zIndex || 0) - (b.zIndex || 0); }).forEach(function (z) {
      const el = document.createElement('div');
      el.className = 'chart-layout-zone';
      if (selectedZoneId === z.id) el.classList.add('chart-layout-zone--selected');
      el.dataset.zoneId = z.id;
      el.style.left = z.x * 100 + '%';
      el.style.top = z.y * 100 + '%';
      el.style.width = z.w * 100 + '%';
      el.style.height = z.h * 100 + '%';
      el.style.setProperty('--zone-color', z.color || '#f0c4a8');
      el.innerHTML = '<span class="chart-layout-zone__title">' + esc(z.title || '範囲') + '</span>';
      zonesEl.appendChild(el);
    });
    if (!readOnly) bindZoneEvents();
  }

  function renderEdges() {
    if (!edgesSvg || !stage) return;
    const rect = stage.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    edgesSvg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    edgesSvg.innerHTML = '';
    const plan = buildRenderPlan(canvas, w, h, personName);
    const edgesInteractive = !readOnly && tool === 'move';
    edgesSvg.classList.toggle('chart-layout-edges--edit', edgesInteractive);

    plan.edges.forEach(function (item) {
      const selected = item.index === selectedEdgeIndex;
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.classList.add('chart-layout-edge-group');
      group.dataset.edgeIndex = String(item.index);

      const showTips = edgesInteractive && item.draggableEndpoints && item.endpointFrom && item.endpointTo;

      item.segments.forEach(function (seg) {
        appendSegment(group, seg, canvas.edges[item.index]?.style, selected, item.index, edgesInteractive);
      });

      if (item.bidirectional !== false) {
        appendArrowPolygon(group, item.arrowFrom, 'chart-layout-edge__arrow');
        appendArrowPolygon(group, item.arrowTo, 'chart-layout-edge__arrow');
      } else if (item.directed) {
        appendArrowPolygon(group, item.arrowTo, 'chart-layout-edge__arrow');
      }

      if (edgesInteractive) {
        const hits = item.hitTargets || item.hitSegments.map(function (s) {
          return { edgeIndex: item.index, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 };
        });
        hits.forEach(function (hit) {
          const hitLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          hitLine.setAttribute('x1', String(hit.x1));
          hitLine.setAttribute('y1', String(hit.y1));
          hitLine.setAttribute('x2', String(hit.x2));
          hitLine.setAttribute('y2', String(hit.y2));
          hitLine.setAttribute('class', 'chart-layout-edge-hit');
          hitLine.dataset.edgeIndex = String(hit.edgeIndex != null ? hit.edgeIndex : item.index);
          group.appendChild(hitLine);
        });
      }

      item.labels.forEach(function (lb) {
        const labelDragging = pendingLabelDrag
          && pendingLabelDrag.edgeIndex === item.index
          && labelDragMoved;
        appendLabelButton(group, lb, item.index, edgesInteractive, selected, labelDragging);
      });

      if (showTips) {
        const dragIdx = pendingEndpointDrag ? pendingEndpointDrag.edgeIndex : -1;
        appendArrowTipHandle(
          group,
          item.endpointFrom,
          item.index,
          'from',
          item.endpointFromAngle != null ? item.endpointFromAngle : 180,
          selected,
          dragIdx === item.index && pendingEndpointDrag && pendingEndpointDrag.role === 'from'
        );
        appendArrowTipHandle(
          group,
          item.endpointTo,
          item.index,
          'to',
          item.endpointToAngle != null ? item.endpointToAngle : 0,
          selected,
          dragIdx === item.index && pendingEndpointDrag && pendingEndpointDrag.role === 'to'
        );
      }

      if (edgesInteractive && selected && item.waypointHandles && item.waypointHandles.length) {
        const elbowDragIdx = pendingElbowDrag ? pendingElbowDrag.edgeIndex : -1;
        item.waypointHandles.forEach(function (corner) {
          appendElbowHandle(
            group,
            corner,
            item.index,
            corner.index != null ? corner.index : -1,
            selected || item.index === selectedEdgeIndex,
            elbowDragIdx === item.index && elbowDragMoved
          );
        });
      }

      edgesSvg.appendChild(group);
    });

    bindEdgeSelection();
    bindEndpointDrag();
    bindElbowDrag();
    bindLabelDrag();
  }

  function photoHtml(p) {
    if (p.photo && String(p.photo).trim()) {
      return (
        '<img class="chart-layout-node__photo" src="' +
        esc(p.photo) +
        '" alt="" loading="lazy" draggable="false" data-photo-fallback="1">'
      );
    }
    return (
      '<div class="chart-layout-node__photo chart-layout-node__photo--ph" aria-hidden="true">' +
      '<span>' + esc(nameInitial(p.name)) + '</span></div>'
    );
  }

  function bindPhotoFallback(root) {
    root.querySelectorAll('img[data-photo-fallback]').forEach(function (img) {
      if (img.dataset.bound === '1') return;
      img.dataset.bound = '1';
      img.addEventListener('error', function () {
        const card = img.closest('.chart-layout-node');
        const nameEl = card && card.querySelector('.chart-layout-node__name');
        const name = nameEl ? nameEl.textContent : '';
        const ph = document.createElement('div');
        ph.className = 'chart-layout-node__photo chart-layout-node__photo--ph';
        ph.setAttribute('aria-hidden', 'true');
        ph.innerHTML = '<span>' + esc(nameInitial(name)) + '</span>';
        img.replaceWith(ph);
      });
    });
  }

  function renderNodes() {
    if (!nodesEl) return;
    nodesEl.innerHTML = '';
    canvas.nodes.forEach(function (node) {
      const p = person(node.slug);
      const sizeKey = normalizeSize(node.size);
      const el = document.createElement(readOnly ? 'button' : 'div');
      el.className = 'chart-layout-node';
      if (linkFromSlug === node.slug || linkParents.indexOf(node.slug) >= 0) el.classList.add('chart-layout-node--link-from');
      if (selectedNodeSlug === node.slug) el.classList.add('chart-layout-node--selected');
      if (sizeKey === 'lg' || sizeKey === 'xl') el.classList.add('chart-layout-node--emphasis');
      el.dataset.slug = node.slug;
      el.style.setProperty('--node-tint', p.theme || '#4a7a9e');
      el.style.setProperty('--node-scale', String(nodeScale(node.size)));
      el.style.left = node.x * 100 + '%';
      el.style.top = node.y * 100 + '%';
      if (readOnly) { el.type = 'button'; }
      el.innerHTML = photoHtml(p) + '<span class="chart-layout-node__name">' + esc(p.name) + '</span>' +
        (p.role ? '<span class="chart-layout-node__role">' + esc(p.role) + '</span>' : '');
      nodesEl.appendChild(el);
    });
    bindPhotoFallback(nodesEl);
    bindNodeEvents();
    $('#chart-layout-empty').hidden = canvas.nodes.length > 0;
    if (stage) stage.hidden = !canvas.nodes.length;
  }

  function renderSizeGuides() {
    const items = $('#chart-layout-size-guide-items');
    if (!items || readOnly) return;
    const counts = { sm: 0, md: 0, lg: 0, xl: 0 };
    canvas.nodes.forEach(function (n) { counts[normalizeSize(n.size)] += 1; });
    const selSize = selectedNodeSlug ? normalizeSize(nodeBySlug(selectedNodeSlug)?.size) : null;
    items.innerHTML = Object.keys(CARD_SIZES).map(function (key) {
      const t = CARD_SIZES[key];
      let cls = 'chart-layout-size-guide__item';
      if (counts[key] > 0) cls += ' chart-layout-size-guide__item--used';
      if (key === selSize) cls += ' chart-layout-size-guide__item--active';
      return '<button type="button" class="' + cls + '" data-size="' + key + '" style="--guide-scale:' + t.scale + '">' +
        '<span class="chart-layout-size-guide__frame"></span><span class="chart-layout-size-guide__label">' + t.label + '</span>' +
        '<span class="chart-layout-size-guide__name">' + t.name + '</span>' +
        (counts[key] ? '<span class="chart-layout-size-guide__count">' + counts[key] + '</span>' : '') + '</button>';
    }).join('');
    items.querySelectorAll('[data-size]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!selectedNodeSlug) { setStatus('キャラをクリックして選択'); return; }
        applyNodeSize(btn.dataset.size);
      });
    });
  }

  function renderAll() {
    renderZones();
    renderNodes();
    renderSizeGuides();
    requestAnimationFrame(renderEdges);
  }

  function closeEdgeModal() {
    $('#chart-layout-edge-modal').hidden = true;
    renderEdges();
  }

  function closeEdgePanel() {
    selectedEdgeIndex = -1;
    pendingEndpointDrag = null;
    pendingLabelDrag = null;
    pendingElbowDrag = null;
    closeEdgeModal();
  }

  function openEdgeModal() {
    $('#chart-layout-edge-modal').hidden = false;
    window.requestAnimationFrame(function () {
      const input = $('#chart-layout-edge-label');
      if (input) {
        input.focus();
        input.select();
      }
    });
  }
  function closeNodePanel() { selectedNodeSlug = null; $('#chart-layout-node-panel').hidden = true; renderSizeGuides(); renderNodes(); }
  function closeZonePanel() { selectedZoneId = null; $('#chart-layout-zone-panel').hidden = true; renderZones(); }

  function selectEdge(index, opts) {
    opts = opts || {};
    if (index < 0 || index >= canvas.edges.length) { closeEdgePanel(); return; }
    closeNodePanel();
    closeZonePanel();
    selectedEdgeIndex = index;
    const edge = canvas.edges[index];
    const kindLabels = { relation: '関係線', marriage: '夫婦線', 'family-child': '親子線（家系図）' };
    let title = '';
    if (edge.kind === 'family-child') {
      const role = edge.label || '子';
      title = personName(edge.parents[0]) + '・' + personName(edge.parents[1] || edge.parents[0]) + 'の' + role + '：' + personName(edge.child);
    } else if (edge.kind === 'marriage') {
      title = personName(edge.from) + ' — ' + personName(edge.to) + '（夫婦）';
    } else {
      title = personName(edge.from) + ' → ' + personName(edge.to);
    }
    $('#chart-layout-edge-title').textContent = title;
    $('#chart-layout-edge-kind').textContent = kindLabels[edge.kind] || edge.kind;
    $('#chart-layout-edge-label').value = edge.label || '';
    $('#chart-layout-edge-style').value = edge.style === 'dashed' ? 'dashed' : 'solid';
    $('#chart-layout-edge-directed').checked = !!edge.directed;
    $('#chart-layout-edge-directed-wrap').hidden = edge.kind !== 'relation';
    $('#chart-layout-edge-reverse').hidden = edge.kind !== 'relation';
    if (edge.kind === 'family-child') {
      $('#chart-layout-edge-kind').textContent = '親子関係 — ラベル例：長女・次女・長男';
    }
    updateEdgeResetButton();
    if (opts.openModal) openEdgeModal();
    else closeEdgeModal();
    if (tool !== 'move') setTool('move', { keepEdgePanel: true });
    else renderEdges();
  }

  function selectNode(slug) {
    selectedNodeSlug = slug;
    closeEdgePanel();
    closeZonePanel();
    const node = nodeBySlug(slug);
    if (!node) { closeNodePanel(); return; }
    $('#chart-layout-node-title').textContent = personName(slug);
    $('#chart-layout-node-size').value = normalizeSize(node.size);
    $('#chart-layout-node-panel').hidden = false;
    renderSizeGuides();
    renderNodes();
  }

  function selectZone(id) {
    selectedZoneId = id;
    closeEdgePanel();
    closeNodePanel();
    const z = zoneById(id);
    if (!z) { closeZonePanel(); return; }
    $('#chart-layout-zone-title').value = z.title || '';
    $('#chart-layout-zone-color').value = z.color || '#f0c4a8';
    $('#chart-layout-zone-panel').hidden = false;
    renderZones();
  }

  function applyNodeSize(sizeKey) {
    if (!selectedNodeSlug) return;
    const node = nodeBySlug(selectedNodeSlug);
    if (!node || normalizeSize(node.size) === normalizeSize(sizeKey)) return;
    node.size = normalizeSize(sizeKey);
    pushHistory();
    saveLocal();
    renderAll();
  }

  function addRelationEdge(from, to) {
    const idx = findRelationEdgeIndex(canvas.edges, from, to, false);
    if (idx >= 0) { selectEdge(idx, { openModal: true }); return; }
    canvas.edges.push({ kind: 'relation', from, to, label: '', style: 'solid', directed: false, lane: 0, zIndex: 0 });
    pushHistory();
    saveLocal();
    selectEdge(canvas.edges.length - 1, { openModal: true });
    setStatus('関係線を追加しました');
  }

  function addMarriageEdge(from, to) {
    const idx = findMarriageEdgeIndex(canvas.edges, from, to);
    if (idx >= 0) { selectEdge(idx, { openModal: true }); return; }
    canvas.edges = canvas.edges.filter(function (e) {
      if (e.kind !== 'relation') return true;
      if (coupleKey(e.from, e.to) !== coupleKey(from, to)) return true;
      return !isCoupleLabel(e.label);
    });
    canvas.edges.push({
      kind: 'marriage',
      from,
      to,
      label: '夫婦',
      style: 'solid',
      directed: false,
      lane: 0,
      zIndex: 0,
    });
    canvas = normalizeCanvas(canvas);
    pushHistory();
    saveLocal();
    selectEdge(canvas.edges.length - 1, { openModal: true });
    setStatus('夫婦線を追加しました');
  }

  function addFamilyChildEdge(parents, child) {
    const idx = findFamilyChildIndex(canvas.edges, parents, child);
    if (idx >= 0) { selectEdge(idx, { openModal: true }); return; }
    canvas.edges.push({
      kind: 'family-child',
      parents: parents.slice(),
      child,
      from: parents[0],
      to: child,
      label: '',
      style: 'solid',
      directed: false,
      bidirectional: true,
      lane: 0,
      zIndex: 0,
    });
    pushHistory();
    saveLocal();
    selectEdge(canvas.edges.length - 1, { openModal: true });
    setStatus('親子関係を追加 — ラベルに「長女」「次女」などを入力');
  }

  function handleLineClick(slug) {
    if (lineMode === 'marriage') {
      if (!linkFromSlug) { linkFromSlug = slug; syncToolHint(); renderNodes(); return; }
      if (linkFromSlug === slug) { linkFromSlug = null; syncToolHint(); renderNodes(); return; }
      const a = linkFromSlug;
      linkFromSlug = null;
      addMarriageEdge(a, slug);
      syncToolHint();
      renderNodes();
      return;
    }
    if (lineMode === 'family-child') {
      if (linkParents.length === 0) { linkParents = [slug]; syncToolHint(); renderNodes(); return; }
      if (linkParents.length === 1) {
        if (linkParents[0] === slug) { linkParents = []; syncToolHint(); renderNodes(); return; }
        linkParents = [linkParents[0], slug];
        syncToolHint();
        renderNodes();
        return;
      }
      if (linkParents.indexOf(slug) >= 0) return;
      const parents = linkParents.slice();
      linkParents = [];
      addFamilyChildEdge(parents, slug);
      syncToolHint();
      renderNodes();
      return;
    }
    if (!linkFromSlug) { linkFromSlug = slug; syncToolHint(); renderNodes(); return; }
    if (linkFromSlug === slug) { linkFromSlug = null; syncToolHint(); renderNodes(); return; }
    const a = linkFromSlug;
    linkFromSlug = null;
    addRelationEdge(a, slug);
    syncToolHint();
    renderNodes();
  }

  function applyEdgePanelEdits() {
    if (selectedEdgeIndex < 0) return;
    const edge = canvas.edges[selectedEdgeIndex];
    if (!edge) return;
    edge.label = $('#chart-layout-edge-label').value.trim();
    edge.style = $('#chart-layout-edge-style').value === 'dashed' ? 'dashed' : 'solid';
    if (edge.kind === 'relation') edge.directed = $('#chart-layout-edge-directed').checked;
    canvas = normalizeCanvas(canvas);
    pushHistory();
    saveLocal();
    renderEdges();
  }

  function addReverseEdge() {
    if (selectedEdgeIndex < 0) return;
    const edge = canvas.edges[selectedEdgeIndex];
    if (!edge || edge.kind !== 'relation') return;
    const rev = findRelationEdgeIndex(canvas.edges, edge.to, edge.from, true);
    if (rev >= 0) { selectEdge(rev, { openModal: true }); return; }
    canvas.edges.push({
      kind: 'relation',
      from: edge.to,
      to: edge.from,
      label: '',
      style: edge.style,
      directed: true,
      lane: 0,
      zIndex: edge.zIndex || 0,
    });
    canvas = normalizeCanvas(canvas);
    pushHistory();
    saveLocal();
    selectEdge(canvas.edges.length - 1, { openModal: true });
    setStatus('逆方向の関係線を追加しました（例：尊敬 / 信頼）');
  }

  function bumpEdgeZ(delta) {
    if (selectedEdgeIndex < 0) return;
    const edge = canvas.edges[selectedEdgeIndex];
    edge.zIndex = (edge.zIndex || 0) + delta;
    pushHistory();
    saveLocal();
    renderEdges();
  }

  function removeSelectedEdge() {
    if (selectedEdgeIndex < 0) return;
    canvas.edges.splice(selectedEdgeIndex, 1);
    closeEdgePanel();
    pushHistory();
    saveLocal();
    renderAll();
  }

  function addZone() {
    const id = 'zone-' + Date.now();
    canvas.zones.push({
      id,
      title: '元永家',
      x: 0.52,
      y: 0.08,
      w: 0.42,
      h: 0.55,
      color: '#f0c4a8',
      zIndex: 0,
    });
    pushHistory();
    saveLocal();
    selectZone(id);
    renderAll();
  }

  function applyZonePanel() {
    const z = zoneById(selectedZoneId);
    if (!z) return;
    z.title = $('#chart-layout-zone-title').value.trim();
    z.color = $('#chart-layout-zone-color').value;
    pushHistory();
    saveLocal();
    renderZones();
  }

  function removeZone() {
    if (!selectedZoneId) return;
    canvas.zones = canvas.zones.filter(function (z) { return z.id !== selectedZoneId; });
    closeZonePanel();
    pushHistory();
    saveLocal();
    renderAll();
  }

  function pointerToNorm(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    return { x: clamp01((clientX - rect.left) / rect.width), y: clamp01((clientY - rect.top) / rect.height) };
  }

  function bindZoneEvents() {
    zonesEl.querySelectorAll('.chart-layout-zone').forEach(function (el) {
      const id = el.dataset.zoneId;
      el.addEventListener('pointerdown', function (e) {
        if (tool !== 'zone' && tool !== 'move') return;
        e.stopPropagation();
        selectZone(id);
        pendingZoneDrag = id;
        dragPointerId = e.pointerId;
        dragStartClientX = e.clientX;
        dragStartClientY = e.clientY;
        dragHasMoved = false;
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', function (e) {
        if (pendingZoneDrag !== id || e.pointerId !== dragPointerId) return;
        const dx = e.clientX - dragStartClientX;
        const dy = e.clientY - dragStartClientY;
        if (!dragHasMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragHasMoved = true;
        const z = zoneById(id);
        const rect = stage.getBoundingClientRect();
        z.x = clamp01(z.x + dx / rect.width);
        z.y = clamp01(z.y + dy / rect.height);
        dragStartClientX = e.clientX;
        dragStartClientY = e.clientY;
        renderZones();
      });
      el.addEventListener('pointerup', function (e) {
        if (pendingZoneDrag !== id) return;
        if (dragHasMoved) { pushHistory(); saveLocal(); }
        pendingZoneDrag = null;
        dragPointerId = null;
        dragHasMoved = false;
      });
    });
  }

  function bindNodeEvents() {
    nodesEl.querySelectorAll('.chart-layout-node').forEach(function (el) {
      const slug = el.dataset.slug;
      if (readOnly) {
        el.addEventListener('click', function () { if (onNodeClick) onNodeClick(slug, person(slug)); });
        return;
      }
      if (tool === 'line') {
        el.addEventListener('click', function (e) { e.stopPropagation(); handleLineClick(slug); });
        return;
      }
      el.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || tool === 'zone') return;
        pendingDragSlug = slug;
        dragPointerId = e.pointerId;
        dragStartClientX = e.clientX;
        dragStartClientY = e.clientY;
        const node = nodeBySlug(slug);
        dragLastNormX = node ? node.x : 0;
        dragLastNormY = node ? node.y : 0;
        dragHasMoved = false;
        el.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      el.addEventListener('pointermove', function (e) {
        if (pendingDragSlug !== slug || e.pointerId !== dragPointerId) return;
        if (!dragHasMoved && Math.hypot(e.clientX - dragStartClientX, e.clientY - dragStartClientY) < DRAG_THRESHOLD) return;
        if (!dragHasMoved) { dragHasMoved = true; el.classList.add('chart-layout-node--dragging'); closeNodePanel(); }
        const norm = pointerToNorm(e.clientX, e.clientY);
        const node = nodeBySlug(slug);
        const dx = norm.x - dragLastNormX;
        const dy = norm.y - dragLastNormY;
        node.x = norm.x;
        node.y = norm.y;
        dragLastNormX = norm.x;
        dragLastNormY = norm.y;
        shiftEdgeEndpointsForNode(canvas.edges, slug, dx, dy);
        el.style.left = node.x * 100 + '%';
        el.style.top = node.y * 100 + '%';
        renderEdges();
      });
      el.addEventListener('pointerup', function (e) {
        if (pendingDragSlug !== slug || e.pointerId !== dragPointerId) return;
        el.classList.remove('chart-layout-node--dragging');
        if (dragHasMoved) { pushHistory(); saveLocal(); }
        else if (tool === 'move') selectNode(slug);
        pendingDragSlug = null;
        dragPointerId = null;
        dragHasMoved = false;
      });
    });
  }

  function saveLocal() {
    if (readOnly) return true;
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ layoutId: LAYOUT_ID, canvas, savedAt: Date.now() }));
      return true;
    } catch { return false; }
  }

  function readLocalData() {
    try { const raw = localStorage.getItem(LOCAL_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  }

  async function saveToCloud() {
    saveLocal();
    if (!supabase) { setStatus('ローカルに保存しました'); return; }
    const { data: authData } = await supabase.auth.getSession();
    if (!authData?.session) { setStatus('ローカルのみ保存（クラウドにはログインが必要）'); return; }
    const { data, error } = await supabase.from('cast_chart_layout').upsert(
      { layout_id: LAYOUT_ID, canvas_json: canvas, status: 'published' },
      { onConflict: 'layout_id' },
    ).select('updated_at').maybeSingle();
    if (error) { setStatus('保存エラー: ' + error.message); return; }
    if (data?.updated_at) remoteUpdatedAt = Date.parse(data.updated_at) || Date.now();
    setStatus('保存しました（公開ページに反映されます）');
  }

  function mergeInitialLoad(remote) {
    if (readOnly) {
      if (remote?.canvas?.nodes?.length) applyCanvas(remote.canvas);
      return;
    }
    const local = readLocalData();
    const localAt = local?.savedAt || 0;
    const remoteAt = remote?.updatedAt || 0;
    if (local?.canvas?.nodes?.length && localAt > remoteAt + 500) applyCanvas(local.canvas);
    else if (remote?.canvas?.nodes?.length) { applyCanvas(remote.canvas); remoteUpdatedAt = remoteAt; }
    else if (local?.canvas?.nodes?.length) applyCanvas(local.canvas);
  }

  $('#chart-layout-undo').addEventListener('click', function () {
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    applyCanvas(JSON.parse(history[historyIndex]));
    saveLocal();
  });
  $('#chart-layout-redo').addEventListener('click', function () {
    if (historyIndex >= history.length - 1) return;
    historyIndex += 1;
    applyCanvas(JSON.parse(history[historyIndex]));
    saveLocal();
  });
  $('#chart-layout-save').addEventListener('click', saveToCloud);
  $('#chart-layout-tool-move').addEventListener('click', function () { setTool('move'); });
  $('#chart-layout-tool-relation').addEventListener('click', function () { setLineMode('relation'); });
  $('#chart-layout-tool-marriage').addEventListener('click', function () { setLineMode('marriage'); });
  $('#chart-layout-tool-family').addEventListener('click', function () { setLineMode('family-child'); });
  $('#chart-layout-tool-zone').addEventListener('click', function () { setTool('zone'); });
  $('#chart-layout-add-zone').addEventListener('click', addZone);
  $('#chart-layout-node-size').addEventListener('change', function () { applyNodeSize($('#chart-layout-node-size').value); });
  $('#chart-layout-node-close').addEventListener('click', closeNodePanel);
  $('#chart-layout-edge-label').addEventListener('change', applyEdgePanelEdits);
  $('#chart-layout-edge-label').addEventListener('blur', applyEdgePanelEdits);
  $('#chart-layout-edge-style').addEventListener('change', applyEdgePanelEdits);
  $('#chart-layout-edge-directed').addEventListener('change', applyEdgePanelEdits);
  $('#chart-layout-edge-reverse').addEventListener('click', addReverseEdge);
  $('#chart-layout-edge-front').addEventListener('click', function () { bumpEdgeZ(1); });
  $('#chart-layout-edge-back').addEventListener('click', function () { bumpEdgeZ(-1); });
  $('#chart-layout-edge-delete').addEventListener('click', removeSelectedEdge);
  $('#chart-layout-edge-reset-route').addEventListener('click', resetEdgeRoute);
  $('#chart-layout-edge-close').addEventListener('click', closeEdgeModal);
  $('#chart-layout-edge-modal-backdrop').addEventListener('click', closeEdgeModal);
  $('#chart-layout-zone-title').addEventListener('change', applyZonePanel);
  $('#chart-layout-zone-color').addEventListener('change', applyZonePanel);
  $('#chart-layout-zone-delete').addEventListener('click', removeZone);
  $('#chart-layout-zone-close').addEventListener('click', closeZonePanel);

  if (!readOnly) {
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (linkFromSlug || linkParents.length) { resetLinkState(); syncToolHint(); renderNodes(); }
        else if (!$('#chart-layout-edge-modal').hidden) closeEdgeModal();
        else if (selectedEdgeIndex >= 0) closeEdgePanel();
        else if (selectedNodeSlug) closeNodePanel();
        else if (selectedZoneId) closeZonePanel();
        else if (tool !== 'move') setTool('move');
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeIndex >= 0) {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        removeSelectedEdge();
      }
    });
    stage.addEventListener('click', function (e) {
      if (e.target.closest('.chart-layout-node, .chart-layout-edge-hit, .chart-layout-edge-group, .chart-layout-edge-tip, .chart-layout-edge-elbow, .chart-layout-zone, [class*="panel"]')) return;
      resetLinkState();
      syncToolHint();
      closeNodePanel();
      closeEdgePanel();
      if (tool !== 'zone') closeZonePanel();
      renderNodes();
    });
  }

  window.addEventListener('resize', renderEdges);
  renderAll();
  syncToolHint();
  if (!readOnly) initHistory();

  return {
    getCanvas: function () { return canvas; },
    applyCanvas,
    saveToCloud,
    mergeInitialLoad,
    render: renderAll,
    destroy: function () { window.removeEventListener('resize', renderEdges); },
  };
}

export {
  defaultCanvasFromGroups,
  normalizeCanvas,
  LAYOUT_ID,
  LOCAL_KEY,
  CARD_SIZES,
};

export async function fetchChartLayout(supabase, publishedOnly) {
  if (!supabase) return null;
  let query = supabase.from('cast_chart_layout').select('canvas_json,status,updated_at').eq('layout_id', LAYOUT_ID);
  if (publishedOnly) query = query.eq('status', 'published');
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return { canvas: normalizeCanvas(data.canvas_json), updatedAt: data.updated_at ? Date.parse(data.updated_at) : 0 };
}

export function buildPeopleMapFromCast(groups, himejinRows) {
  const map = {};
  (groups || []).forEach(function (g) {
    const theme = g.theme || '#4a7a9e';
    (g.members || []).forEach(function (m) {
      map[m.id] = { slug: m.id, name: m.name, reading: m.reading || '', role: m.role || '', tagline: m.tagline || '', photo: m.photo || '', bio: m.bio || '', theme, source: 'cast' };
    });
  });
  (himejinRows || []).forEach(function (h) {
    if (map[h.slug]) return;
    map[h.slug] = { slug: h.slug, name: h.name, reading: '', role: h.tribe_label || '', tagline: h.tagline || '', photo: h.photo_url || '', bio: h.intro || '', theme: '#3d5a4a', source: 'himejin' };
  });
  return map;
}

export async function loadCastAndHimejinForLayout(supabase, publishedOnly) {
  if (!supabase) return { groups: [], peopleMap: {} };
  let gq = supabase.from('cast_chart_groups').select('code,title,theme,sort_order').order('sort_order');
  let mq = supabase.from('cast_chart_members').select('slug,group_code,name,reading,role,tagline,photo_url,bio,sort_order').order('sort_order');
  let hq = supabase.from('himejin_profiles').select('slug,name,tribe_label,tagline,intro,photo_url,sort_order').order('sort_order');
  if (publishedOnly) { gq = gq.eq('status', 'published'); mq = mq.eq('status', 'published'); hq = hq.eq('status', 'published'); }
  const [gRes, mRes, hRes] = await Promise.all([gq, mq, hq]);
  const byGroup = new Map();
  (mRes.data || []).forEach(function (m) {
    if (!byGroup.has(m.group_code)) byGroup.set(m.group_code, []);
    byGroup.get(m.group_code).push({
      id: m.slug,
      name: m.name,
      reading: m.reading || '',
      role: m.role || '',
      tagline: m.tagline || '',
      photo: m.photo_url || '',
      bio: m.bio || '',
    });
  });
  const groups = (gRes.data || []).map(function (g) {
    return { id: g.code, title: g.title, theme: g.theme || '#4a7a9e', members: byGroup.get(g.code) || [] };
  });
  return { groups, peopleMap: buildPeopleMapFromCast(groups, hRes.data || []) };
}
