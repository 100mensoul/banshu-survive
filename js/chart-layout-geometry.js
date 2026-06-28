/**
 * 相関図レイアウト — データ正規化・描画ジオメトリ
 */

export const CARD_SIZES = {
  sm: { scale: 0.82, label: 'S', name: '小' },
  md: { scale: 1, label: 'M', name: '標準' },
  lg: { scale: 1.28, label: 'L', name: '大' },
  xl: { scale: 1.55, label: 'XL', name: '特大' },
};

const BASE_CARD_W = 92;
const BASE_CARD_H = 120;

export function normalizeSize(raw) {
  if (raw === 'sm' || raw === 'lg' || raw === 'xl') return raw;
  return 'md';
}

export function nodeScale(size) {
  return CARD_SIZES[normalizeSize(size)].scale;
}

export function coupleKey(a, b) {
  return [a, b].sort().join('|');
}

export function isCoupleLabel(label) {
  const t = String(label || '').trim();
  return t === '夫婦' || t === '夫妻';
}

function normalizeEdgeKind(raw) {
  if (raw === 'marriage' || raw === 'family-child') return raw;
  return 'relation';
}

export function normalizeEdge(raw) {
  const kind = normalizeEdgeKind(raw?.kind);
  if (kind === 'family-child') {
    const parents = Array.isArray(raw.parents)
      ? raw.parents.map(function (s) { return String(s || ''); }).filter(Boolean)
      : [];
    const child = String(raw.child || '');
    if (!parents.length || !child) return null;
    return attachLayoutFields({
      kind,
      parents,
      child,
      from: parents[0],
      to: child,
      label: String(raw.label || ''),
      style: raw.style === 'dashed' ? 'dashed' : 'solid',
      directed: false,
      bidirectional: true,
      lane: Number(raw.lane) || 0,
      zIndex: Number(raw.zIndex) || 0,
    }, raw);
  }
  if (kind === 'marriage') {
    const from = String(raw?.from || '');
    const to = String(raw?.to || '');
    if (!from || !to) return null;
    return attachLayoutFields({
      kind,
      from,
      to,
      label: String(raw.label || '夫婦'),
      style: raw.style === 'dashed' ? 'dashed' : 'solid',
      directed: false,
      bidirectional: true,
      lane: 0,
      zIndex: Number(raw.zIndex) || 0,
      parents: null,
      child: null,
    }, raw);
  }
  const from = String(raw?.from || '');
  const to = String(raw?.to || '');
  if (!from || !to) return null;
  return attachLayoutFields({
    kind,
    from,
    to,
    label: String(raw.label || ''),
    style: raw.style === 'dashed' ? 'dashed' : 'solid',
    directed: !!raw.directed,
    bidirectional: raw.bidirectional === true || (!raw.directed && raw.bidirectional !== false),
    lane: Number(raw.lane) || 0,
    zIndex: Number(raw.zIndex) || 0,
    parents: null,
    child: null,
  }, raw);
}

export function normalizeZone(raw) {
  if (!raw || !raw.id) return null;
  return {
    id: String(raw.id),
    title: String(raw.title || ''),
    x: clamp01(Number(raw.x) || 0.1),
    y: clamp01(Number(raw.y) || 0.1),
    w: Math.max(0.08, Math.min(0.95, Number(raw.w) || 0.3)),
    h: Math.max(0.08, Math.min(0.95, Number(raw.h) || 0.3)),
    color: String(raw.color || '#f0c4a8'),
    zIndex: Number(raw.zIndex) || 0,
  };
}

function clamp01(v) {
  return Math.max(0.04, Math.min(0.96, v));
}

export function normalizeEdgePoint(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp01(x), y: clamp01(y) };
}

function attachEndpointFields(edge, raw) {
  const fp = normalizeEdgePoint(raw?.fromPoint);
  const tp = normalizeEdgePoint(raw?.toPoint);
  if (fp) edge.fromPoint = fp;
  if (tp) edge.toPoint = tp;
  return edge;
}

function attachLabelPoint(edge, raw) {
  const lp = raw?.labelPoint;
  if (!lp || typeof lp !== 'object') return edge;
  const x = Number(lp.x);
  const y = Number(lp.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return edge;
  edge.labelPoint = {
    x: clamp01(x),
    y: clamp01(y),
    vertical: lp.vertical === true,
  };
  return edge;
}

function attachLayoutFields(edge, raw) {
  return attachLabelPoint(attachEndpointFields(edge, raw), raw);
}

export function defaultCanvasFromGroups(groups) {
  const nodes = [];
  const groupCount = Math.max(1, (groups || []).length);
  (groups || []).forEach(function (group, groupIndex) {
    const members = group.members || [];
    const cols = Math.min(4, Math.max(1, members.length));
    members.forEach(function (m, i) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const bandW = 0.78 / groupCount;
      const x = 0.08 + groupIndex * bandW + (col + 0.5) * (bandW / cols);
      const y = 0.12 + row * 0.17 + (groupIndex % 2) * 0.04;
      nodes.push({
        slug: m.id,
        x: clamp01(x),
        y: clamp01(y),
        source: 'cast',
        size: m.id === 'r' ? 'lg' : 'md',
      });
    });
  });
  return { version: 2, nodes, edges: [], zones: [], annotations: [] };
}

export function normalizeCanvas(raw) {
  if (!raw || typeof raw !== 'object') {
    return { version: 2, nodes: [], edges: [], zones: [], annotations: [] };
  }
  const edges = [];
  (raw.edges || []).forEach(function (e) {
    const norm = normalizeEdge(e);
    if (norm) edges.push(norm);
  });
  assignAutoLanes(edges);
  const zones = [];
  (raw.zones || []).forEach(function (z) {
    const norm = normalizeZone(z);
    if (norm) zones.push(norm);
  });
  return {
    version: raw.version || 2,
    nodes: Array.isArray(raw.nodes)
      ? raw.nodes.map(function (n) {
          return {
            slug: String(n.slug || ''),
            x: clamp01(Number(n.x) || 0.5),
            y: clamp01(Number(n.y) || 0.5),
            source: n.source === 'himejin' ? 'himejin' : 'cast',
            size: normalizeSize(n.size),
          };
        }).filter(function (n) { return n.slug; })
      : [],
    edges,
    zones,
    annotations: Array.isArray(raw.annotations) ? raw.annotations : [],
  };
}

export function assignAutoLanes(edges) {
  const directedPairs = new Map();
  edges.forEach(function (e, index) {
    if (e.kind !== 'relation' || !e.directed) return;
    const key = e.from + '→' + e.to;
    if (!directedPairs.has(key)) directedPairs.set(key, []);
    directedPairs.get(key).push(index);
  });
  const reverseKeys = new Set();
  edges.forEach(function (e, index) {
    if (e.kind !== 'relation' || !e.directed) return;
    const rev = e.to + '→' + e.from;
    const fwd = e.from + '→' + e.to;
    if (directedPairs.has(rev) && e.lane === 0) {
      if (!reverseKeys.has(fwd) && !reverseKeys.has(rev)) {
        e.lane = 1;
        reverseKeys.add(fwd);
        directedPairs.get(rev).forEach(function (ri) {
          if (edges[ri].lane === 0) edges[ri].lane = -1;
        });
      }
    }
  });
}

export const EDGE_MARKER_INSET = 12;

/** 矩形の外側で、相手方向を向いた接点（矢印がカードに隠れない） */
export function borderPointFacing(bounds, targetX, targetY, inset) {
  const dx = targetX - bounds.cx;
  const dy = targetY - bounds.cy;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
    return { x: bounds.cx, y: bounds.top - inset };
  }
  const hw = bounds.nw / 2;
  const hh = bounds.nh / 2;
  const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh, 0.001);
  return {
    x: bounds.cx + dx * scale + (dx >= 0 ? inset : -inset),
    y: bounds.cy + dy * scale + (dy >= 0 ? inset : -inset),
  };
}

export function segmentBetweenBounds(bA, bB, inset) {
  inset = inset == null ? EDGE_MARKER_INSET : inset;
  const pA = borderPointFacing(bA, bB.cx, bB.cy, inset);
  const pB = borderPointFacing(bB, bA.cx, bA.cy, inset);
  return { x1: pA.x, y1: pA.y, x2: pB.x, y2: pB.y };
}

export function nodePixelBounds(node, w, h) {
  const scale = nodeScale(node.size);
  const cx = node.x * w;
  const cy = node.y * h;
  const nw = BASE_CARD_W * scale;
  const nh = BASE_CARD_H * scale;
  return {
    cx,
    cy,
    nw,
    nh,
    left: cx - nw / 2,
    right: cx + nw / 2,
    top: cy - nh / 2,
    bottom: cy + nh / 2,
  };
}

export function computeCoupleGeometry(p1, p2, w, h) {
  const b1 = nodePixelBounds(p1, w, h);
  const b2 = nodePixelBounds(p2, w, h);
  const leftBounds = b1.cx <= b2.cx ? b1 : b2;
  const rightBounds = b1.cx <= b2.cx ? b2 : b1;
  const barY = (leftBounds.cy + rightBounds.cy) / 2;
  let xLeft = leftBounds.right;
  let xRight = rightBounds.left;
  if (xRight - xLeft < 8) {
    xLeft = Math.min(b1.cx, b2.cx);
    xRight = Math.max(b1.cx, b2.cx);
  }
  return {
    barY,
    xLeft,
    xRight,
    midX: (xLeft + xRight) / 2,
    midY: barY,
    p1Drop: { x: leftBounds.cx, y: leftBounds.bottom },
    p2Drop: { x: rightBounds.cx, y: rightBounds.bottom },
  };
}

/** 夫婦線：カード間の横線1本 */
export function marriageBarSegments(g, b1, b2) {
  const inset = EDGE_MARKER_INSET;
  const leftB = b1.cx <= b2.cx ? b1 : b2;
  const rightB = b1.cx <= b2.cx ? b2 : b1;
  let x1 = leftB.right + inset;
  let x2 = rightB.left - inset;
  if (x2 - x1 < 16) {
    x1 = g.xLeft + inset;
    x2 = g.xRight - inset;
  }
  return [
    { x1, y1: g.barY, x2, y2: g.barY, dashed: false, arrowBoth: true },
  ];
}

/**
 * 親子関係線：夫婦の横線 ↔ 子ども（直角ジグザグ・縦線ラベルは縦書き）
 */
function childRelationSegment(g, childBounds, singleParentBounds, edge) {
  const inset = EDGE_MARKER_INSET;
  let anchorX;
  let anchorY;

  if (g) {
    anchorX = Math.max(g.xLeft, Math.min(g.xRight, childBounds.cx));
    anchorY = g.barY;
  } else {
    anchorX = singleParentBounds.cx;
    anchorY = singleParentBounds.bottom + 14;
  }

  const pChild = borderPointFacing(childBounds, anchorX, anchorY, inset);
  const pAnchor = childBounds.cy > anchorY
    ? { x: anchorX, y: anchorY + inset }
    : { x: anchorX, y: anchorY - inset };

  const labelText = String(edge.label || '').trim() || '子';
  const dashed = edge.style === 'dashed';
  const segments = [];
  const hitTargets = [];
  const dx = Math.abs(pAnchor.x - pChild.x);
  const charH = 13;

  if (dx < 8) {
    segments.push({
      x1: pChild.x,
      y1: pChild.y,
      x2: pAnchor.x,
      y2: pAnchor.y,
      dashed,
      arrowStart: true,
      arrowEnd: true,
    });
    hitTargets.push({
      x1: pChild.x,
      y1: pChild.y,
      x2: pAnchor.x,
      y2: pAnchor.y,
    });
    const midY = (pChild.y + pAnchor.y) / 2;
    return {
      segments,
      labels: [{
        x: pChild.x + 14,
        y: midY - ((labelText.length - 1) * charH) / 2,
        text: labelText,
        vertical: true,
      }],
      hitTargets,
    };
  }

  const childBelow = pChild.y > pAnchor.y;
  const spanY = Math.abs(pChild.y - pAnchor.y);
  const elbowY = childBelow
    ? pAnchor.y + Math.max(22, Math.min(spanY * 0.42, spanY - 28))
    : pAnchor.y - Math.max(22, Math.min(spanY * 0.42, spanY - 28));

  segments.push(
    {
      x1: pChild.x,
      y1: pChild.y,
      x2: pChild.x,
      y2: elbowY,
      dashed: false,
      arrowStart: true,
    },
    {
      x1: pChild.x,
      y1: elbowY,
      x2: pAnchor.x,
      y2: elbowY,
      dashed: false,
    },
    {
      x1: pAnchor.x,
      y1: elbowY,
      x2: pAnchor.x,
      y2: pAnchor.y,
      dashed,
      arrowEnd: true,
    },
  );
  hitTargets.push(
    { x1: pChild.x, y1: pChild.y, x2: pChild.x, y2: elbowY },
    { x1: pChild.x, y1: elbowY, x2: pAnchor.x, y2: elbowY },
    { x1: pAnchor.x, y1: elbowY, x2: pAnchor.x, y2: pAnchor.y },
  );

  const labelSide = pChild.x <= pAnchor.x ? 14 : -14;
  const vertMid = (pChild.y + elbowY) / 2;

  return {
    segments,
    labels: [{
      x: pChild.x + labelSide,
      y: vertMid - ((labelText.length - 1) * charH) / 2,
      text: labelText,
      vertical: true,
    }],
    hitTargets,
  };
}

function offsetSegment(x1, y1, x2, y2, lane, amount) {
  if (!lane) return { x1, y1, x2, y2 };
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * lane * amount;
  const ny = (dx / len) * lane * amount;
  return { x1: x1 + nx, y1: y1 + ny, x2: x2 + nx, y2: y2 + ny };
}

/** カード2枚の位置関係に応じた直角ルート（不要な曲げを避け、下側カードは上端へ） */
function orthogonalRouteBetweenBounds(bFrom, bTo, opts) {
  opts = opts || {};
  const inset = EDGE_MARKER_INSET;
  const dashed = !!opts.dashed;
  const bidirectional = opts.arrowBoth !== false && !opts.directed;
  const oneWay = !!opts.directed && !bidirectional;
  const text = String(opts.labelText || '').trim();
  const charH = 13;
  const segments = [];
  const hitTargets = [];
  const rowThreshold = Math.min(bFrom.nh, bTo.nh) * 0.38;
  const colThreshold = Math.min(bFrom.nw, bTo.nw) * 0.38;
  const dy = bTo.cy - bFrom.cy;
  const dx = bTo.cx - bFrom.cx;

  function addSeg(x1, y1, x2, y2, flags) {
    segments.push({
      x1, y1, x2, y2,
      dashed: flags.dashed != null ? flags.dashed : dashed,
      arrowStart: !!flags.arrowStart,
      arrowEnd: !!flags.arrowEnd,
    });
    hitTargets.push({ x1, y1, x2, y2 });
  }

  function finish(label) {
    return { segments, hitTargets, label: label || null };
  }

  // ほぼ横並び → 横1本だけ
  if (Math.abs(dy) <= rowThreshold && Math.abs(dx) > 16) {
    const leftB = bFrom.cx <= bTo.cx ? bFrom : bTo;
    const rightB = bFrom.cx <= bTo.cx ? bTo : bFrom;
    const y = (leftB.cy + rightB.cy) / 2;
    addSeg(leftB.right + inset, y, rightB.left - inset, y, {
      arrowStart: bidirectional,
      arrowEnd: bidirectional || oneWay,
    });
    return finish(text ? { x: (leftB.right + rightB.left) / 2, y: y - 10, text, vertical: false } : null);
  }

  // ほぼ縦並び → 縦1本だけ
  if (Math.abs(dx) <= colThreshold && Math.abs(dy) > 16) {
    const topB = bFrom.cy <= bTo.cy ? bFrom : bTo;
    const bottomB = bFrom.cy <= bTo.cy ? bTo : bFrom;
    const x = (topB.cx + bottomB.cx) / 2;
    addSeg(x, topB.bottom + inset, x, bottomB.top - inset, {
      arrowStart: bidirectional,
      arrowEnd: bidirectional || oneWay,
    });
    return finish(text ? {
      x: x + 14,
      y: (topB.bottom + bottomB.top) / 2 - ((text.length - 1) * charH) / 2,
      text,
      vertical: true,
    } : null);
  }

  // 斜め配置：下側カードの上端中央へ。L字（横→縦）
  const lower = bFrom.cy >= bTo.cy ? bFrom : bTo;
  const upper = bFrom.cy >= bTo.cy ? bTo : bFrom;
  const end = { x: lower.cx, y: lower.top - inset };
  const start = borderPointFacing(upper, lower.cx, lower.top, inset);

  if (Math.abs(start.x - end.x) < 8) {
    addSeg(start.x, start.y, end.x, end.y, {
      arrowStart: bidirectional,
      arrowEnd: bidirectional || oneWay,
    });
    return finish(text ? {
      x: start.x + 14,
      y: (start.y + end.y) / 2 - ((text.length - 1) * charH) / 2,
      text,
      vertical: true,
    } : null);
  }

  const elbow = { x: end.x, y: start.y };
  addSeg(start.x, start.y, elbow.x, elbow.y, {
    dashed: false,
    arrowStart: bidirectional,
    arrowEnd: false,
  });
  addSeg(elbow.x, elbow.y, end.x, end.y, {
    dashed,
    arrowStart: false,
    arrowEnd: bidirectional || oneWay,
  });
  return finish(text ? { x: (start.x + elbow.x) / 2, y: start.y - 10, text, vertical: false } : null);
}

function endpointsFromSegments(segments) {
  if (!segments.length) return { from: null, to: null };
  const first = segments[0];
  const last = segments[segments.length - 1];
  return {
    from: { x: first.x1, y: first.y1 },
    to: { x: last.x2, y: last.y2 },
  };
}

function customEndpointRoute(pFrom, pTo, opts) {
  return orthogonalRouteBetweenPoints(pFrom, pTo, opts);
}

/** 2点間を直角ジグザグのみで結ぶ（斜め線なし） */
function orthogonalRouteBetweenPoints(pFrom, pTo, opts) {
  opts = opts || {};
  const dashed = !!opts.dashed;
  const bidirectional = opts.arrowBoth !== false && !opts.directed;
  const oneWay = !!opts.directed && !bidirectional;
  const text = String(opts.labelText || '').trim();
  const charH = 13;
  const preferVerticalLabel = !!opts.preferVerticalLabel;
  const segments = [];
  const hitTargets = [];
  const dx = Math.abs(pTo.x - pFrom.x);
  const dy = Math.abs(pTo.y - pFrom.y);

  function addSeg(x1, y1, x2, y2, flags) {
    segments.push({
      x1, y1, x2, y2,
      dashed: flags.dashed != null ? flags.dashed : dashed,
      arrowStart: !!flags.arrowStart,
      arrowEnd: !!flags.arrowEnd,
    });
    hitTargets.push({ x1, y1, x2, y2 });
  }

  function buildLabel() {
    if (!text) return null;
    if (preferVerticalLabel || dy >= dx) {
      const vertSeg = segments.find(function (s) { return Math.abs(s.x2 - s.x1) < 4 && Math.abs(s.y2 - s.y1) > 8; });
      if (vertSeg) {
        const side = vertSeg.x1 <= (pFrom.x + pTo.x) / 2 ? 14 : -14;
        const midY = (vertSeg.y1 + vertSeg.y2) / 2;
        return {
          x: vertSeg.x1 + side,
          y: midY - ((text.length - 1) * charH) / 2,
          text,
          vertical: true,
        };
      }
    }
    const horizSeg = segments.find(function (s) { return Math.abs(s.y2 - s.y1) < 4 && Math.abs(s.x2 - s.x1) > 8; });
    if (horizSeg) {
      return {
        x: (horizSeg.x1 + horizSeg.x2) / 2,
        y: horizSeg.y1 - 10,
        text,
        vertical: false,
      };
    }
    return {
      x: (pFrom.x + pTo.x) / 2,
      y: Math.min(pFrom.y, pTo.y) - 10,
      text,
      vertical: false,
    };
  }

  if (dx < 6) {
    addSeg(pFrom.x, pFrom.y, pTo.x, pTo.y, {
      arrowStart: bidirectional,
      arrowEnd: bidirectional || oneWay,
    });
  } else if (dy < 6) {
    addSeg(pFrom.x, pFrom.y, pTo.x, pTo.y, {
      arrowStart: bidirectional,
      arrowEnd: bidirectional || oneWay,
    });
  } else {
    const elbow = { x: pTo.x, y: pFrom.y };
    addSeg(pFrom.x, pFrom.y, elbow.x, elbow.y, {
      dashed: false,
      arrowStart: bidirectional,
      arrowEnd: false,
    });
    addSeg(elbow.x, elbow.y, pTo.x, pTo.y, {
      dashed,
      arrowStart: false,
      arrowEnd: bidirectional || oneWay,
    });
  }

  return {
    segments,
    hitTargets,
    label: buildLabel(),
    endpointFrom: { x: pFrom.x, y: pFrom.y },
    endpointTo: { x: pTo.x, y: pTo.y },
    manual: true,
  };
}

function applyManualLabel(item, edge, w, h) {
  if (!edge.labelPoint) return;
  const text = String(edge.label || '').trim();
  if (!text) return;
  item.labels = [{
    x: edge.labelPoint.x * w,
    y: edge.labelPoint.y * h,
    text,
    vertical: edge.labelPoint.vertical === true,
  }];
}

export function hasManualEndpoints(edge) {
  return !!(edge && edge.fromPoint && edge.toPoint);
}

export function hasManualLabel(edge) {
  return !!(edge && edge.labelPoint);
}

export function hasManualLayout(edge) {
  return hasManualEndpoints(edge) || hasManualLabel(edge);
}

export function shiftEdgeEndpointsForNode(edges, slug, dx, dy) {
  if (!slug || (!dx && !dy)) return;
  edges.forEach(function (edge) {
    function shiftPt(pt) {
      if (!pt) return;
      pt.x = clamp01(pt.x + dx);
      pt.y = clamp01(pt.y + dy);
    }
    if (edge.kind === 'family-child') {
      if (edge.child === slug) shiftPt(edge.fromPoint);
      if (edge.parents && edge.parents.indexOf(slug) >= 0) shiftPt(edge.toPoint);
    } else {
      if (edge.from === slug) shiftPt(edge.fromPoint);
      if (edge.to === slug) shiftPt(edge.toPoint);
    }
  });
}

function buildManualOrAutoRoute(edge, bFrom, bTo, w, h, autoOpts) {
  if (edge.fromPoint && edge.toPoint) {
    const pFrom = { x: edge.fromPoint.x * w, y: edge.fromPoint.y * h };
    const pTo = { x: edge.toPoint.x * w, y: edge.toPoint.y * h };
    return customEndpointRoute(pFrom, pTo, autoOpts);
  }
  const route = orthogonalRouteBetweenBounds(bFrom, bTo, autoOpts);
  const eps = endpointsFromSegments(route.segments);
  route.endpointFrom = eps.from;
  route.endpointTo = eps.to;
  route.manual = false;
  return route;
}

function applyRouteToItem(item, route, index) {
  route.segments.forEach(function (seg) { item.segments.push(seg); });
  item.hitSegments = item.segments.slice();
  item.hitTargets = (route.hitTargets || []).map(function (hit) {
    return {
      edgeIndex: index,
      x1: hit.x1,
      y1: hit.y1,
      x2: hit.x2,
      y2: hit.y2,
    };
  });
  if (route.label) item.labels.push(route.label);
  item.endpointFrom = route.endpointFrom;
  item.endpointTo = route.endpointTo;
  item.manualEndpoints = !!route.manual;
  item.draggableEndpoints = true;
}

function edgeTitle(edge, personName) {
  if (edge.kind === 'family-child') {
    const parents = personName(edge.parents[0]) + '・' + personName(edge.parents[1] || edge.parents[0]);
    const role = String(edge.label || '').trim() || '子';
    return parents + 'の' + role + '：' + personName(edge.child);
  }
  if (edge.kind === 'marriage') {
    return personName(edge.from) + ' — ' + personName(edge.to) + '（夫婦）';
  }
  return personName(edge.from) + ' → ' + personName(edge.to);
}

/**
 * 描画プリミティブを生成
 * @returns {{ zones, edges: Array<{index, zIndex, kind, segments, labels, hitSegments, title}> }}
 */
export function buildRenderPlan(canvas, w, h, personName) {
  const nodeMap = new Map(canvas.nodes.map(function (n) { return [n.slug, n]; }));
  const nameFn = personName || function (s) { return s; };

  const marriageByCouple = new Map();
  const relationCoupleByKey = new Map();
  canvas.edges.forEach(function (e, index) {
    if (e.kind === 'marriage') marriageByCouple.set(coupleKey(e.from, e.to), index);
    if (e.kind === 'relation' && isCoupleLabel(e.label)) {
      relationCoupleByKey.set(coupleKey(e.from, e.to), index);
    }
  });

  function renderCoupleConnector(item, p1, p2, edge, index, w, h) {
    const b1 = nodePixelBounds(p1, w, h);
    const b2 = nodePixelBounds(p2, w, h);
    const route = buildManualOrAutoRoute(edge, b1, b2, w, h, {
      dashed: edge.style === 'dashed',
      arrowBoth: true,
      labelText: edge.label || '夫婦',
    });
    applyRouteToItem(item, route, index);
    if (edge.labelPoint) applyManualLabel(item, edge, w, h);
  }

  const edgeItems = [];

  canvas.edges.forEach(function (edge, index) {
    const item = {
      index,
      zIndex: edge.zIndex || 0,
      kind: edge.kind,
      segments: [],
      labels: [],
      hitSegments: [],
      title: edgeTitle(edge, nameFn),
      selected: false,
    };

    if (edge.kind === 'marriage') {
      const p1 = nodeMap.get(edge.from);
      const p2 = nodeMap.get(edge.to);
      if (!p1 || !p2) return;
      renderCoupleConnector(item, p1, p2, edge, index, w, h);
      edgeItems.push(item);
      return;
    }

    if (edge.kind === 'family-child') {
      const p1 = nodeMap.get(edge.parents[0]);
      const p2 = nodeMap.get(edge.parents[1]) || p1;
      const childNode = nodeMap.get(edge.child);
      if (!p1 || !childNode) return;

      const twoParents = p2 && p1.slug !== p2.slug;
      const g = twoParents ? computeCoupleGeometry(p1, p2, w, h) : null;
      const singleBounds = nodePixelBounds(p1, w, h);
      const childBounds = nodePixelBounds(childNode, w, h);

      if (edge.fromPoint && edge.toPoint) {
        const pFrom = { x: edge.fromPoint.x * w, y: edge.fromPoint.y * h };
        const pTo = { x: edge.toPoint.x * w, y: edge.toPoint.y * h };
        const route = orthogonalRouteBetweenPoints(pFrom, pTo, {
          dashed: edge.style === 'dashed',
          arrowBoth: true,
          labelText: edge.label,
          preferVerticalLabel: true,
        });
        applyRouteToItem(item, route, index);
        applyManualLabel(item, edge, w, h);
      } else {
        const childDraw = childRelationSegment(g, childBounds, singleBounds, edge);
        childDraw.segments.forEach(function (seg) { item.segments.push(seg); });
        if (!edge.labelPoint) {
          childDraw.labels.forEach(function (lb) { item.labels.push(lb); });
        } else {
          applyManualLabel(item, edge, w, h);
        }
        item.hitTargets = childDraw.hitTargets.map(function (hit) {
          return { edgeIndex: index, x1: hit.x1, y1: hit.y1, x2: hit.x2, y2: hit.y2 };
        });
        item.hitSegments = item.segments.slice();
        const eps = endpointsFromSegments(item.segments);
        item.endpointFrom = eps.from;
        item.endpointTo = eps.to;
        item.draggableEndpoints = true;
      }
      edgeItems.push(item);
      return;
    }

    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    if (!fromNode || !toNode) return;

    const pairKey = coupleKey(edge.from, edge.to);
    if (marriageByCouple.has(pairKey)) return;

    if (isCoupleLabel(edge.label)) {
      renderCoupleConnector(item, fromNode, toNode, edge, index, w, h);
      edgeItems.push(item);
      return;
    }

    const b1 = nodePixelBounds(fromNode, w, h);
    const b2 = nodePixelBounds(toNode, w, h);
    const route = buildManualOrAutoRoute(edge, b1, b2, w, h, {
      dashed: edge.style === 'dashed',
      directed: !!edge.directed && !edge.bidirectional,
      arrowBoth: !!edge.bidirectional || !edge.directed,
      labelText: edge.label,
    });
    applyRouteToItem(item, route, index);
    if (edge.labelPoint) applyManualLabel(item, edge, w, h);
    edgeItems.push(item);
  });

  edgeItems.sort(function (a, b) { return a.zIndex - b.zIndex; });

  const zones = (canvas.zones || [])
    .slice()
    .sort(function (a, b) { return (a.zIndex || 0) - (b.zIndex || 0); })
    .map(function (z) {
      return {
        id: z.id,
        x: z.x * w,
        y: z.y * h,
        w: z.w * w,
        h: z.h * h,
        color: z.color,
        title: z.title,
        zIndex: z.zIndex || 0,
      };
    });

  return { zones, edges: edgeItems };
}

export function findRelationEdgeIndex(edges, from, to, directed) {
  return edges.findIndex(function (e) {
    if (e.kind !== 'relation') return false;
    if (directed) return e.from === from && e.to === to;
    return (e.from === from && e.to === to) || (e.from === to && e.to === from);
  });
}

export function findMarriageEdgeIndex(edges, a, b) {
  return edges.findIndex(function (e) {
    return e.kind === 'marriage' && coupleKey(e.from, e.to) === coupleKey(a, b);
  });
}

export function findFamilyChildIndex(edges, parents, child) {
  const key = coupleKey(parents[0], parents[1] || parents[0]);
  return edges.findIndex(function (e) {
    return e.kind === 'family-child' && e.child === child && coupleKey(e.parents[0], e.parents[1] || e.parents[0]) === key;
  });
}
