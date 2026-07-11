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

const SIDES = ['top', 'right', 'bottom', 'left'];

function normalizeSide(raw) {
  const s = String(raw || '').trim();
  return SIDES.indexOf(s) >= 0 ? s : null;
}

/** Endpoint: node ポート or 参照エッジ上の点 */
function normalizeEndpoint(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind === 'edge' ? 'edge' : 'node';
  if (kind === 'edge') {
    const edgeId = String(raw.edgeId || '').trim();
    const t = Number(raw.t);
    if (!edgeId || !Number.isFinite(t)) return null;
    const ep = { kind: 'edge', edgeId, t: Math.max(0.02, Math.min(0.98, t)) };
    if (raw.autoT === false) ep.autoT = false;
    return ep;
  }
  const nodeId = String(raw.nodeId || raw.slug || '').trim();
  const side = normalizeSide(raw.side);
  const t = Number(raw.t);
  if (!nodeId || !side || !Number.isFinite(t)) return null;
  return { kind: 'node', nodeId, side, t: Math.max(0.08, Math.min(0.92, t)) };
}

function ensureEndpointKind(ep) {
  if (!ep) return ep;
  if (ep.kind) return ep;
  if (ep.edgeId) {
    const out = { kind: 'edge', edgeId: String(ep.edgeId), t: Number(ep.t) || 0.5 };
    if (ep.autoT === false) out.autoT = false;
    return out;
  }
  return { kind: 'node', nodeId: ep.nodeId, side: ep.side, t: ep.t };
}

export function assignEdgeId(edge, index) {
  if (edge.id) return String(edge.id);
  if (edge.kind === 'marriage') return 'marriage:' + coupleKey(edge.from, edge.to);
  if (edge.kind === 'family-child') {
    return 'fc:' + coupleKey(edge.parents[0], edge.parents[1] || edge.parents[0]) + ':' + edge.child;
  }
  return 'rel:' + edge.from + ':' + edge.to + ':' + index;
}

function edgeUsesEdgeEndpoint(edge) {
  const src = edge.source ? ensureEndpointKind(edge.source) : null;
  const tgt = edge.target ? ensureEndpointKind(edge.target) : null;
  return (src && src.kind === 'edge') || (tgt && tgt.kind === 'edge');
}

function referencedEdgeIds(edge) {
  const ids = [];
  const src = edge.source ? ensureEndpointKind(edge.source) : null;
  const tgt = edge.target ? ensureEndpointKind(edge.target) : null;
  if (src && src.kind === 'edge') ids.push(src.edgeId);
  if (tgt && tgt.kind === 'edge') ids.push(tgt.edgeId);
  return ids;
}

function normalizeWaypoint(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const seg = Number(raw.seg);
  const u = Number(raw.u);
  if (Number.isFinite(seg) && Number.isFinite(u)) {
    return { seg: Math.max(0, Math.floor(seg)), u: Math.max(0, Math.min(1, u)) };
  }
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp01(x), y: clamp01(y) };
}

function isRelativeWaypoint(wp) {
  return !!(wp && Number.isFinite(wp.seg) && Number.isFinite(wp.u));
}

function isAbsoluteWaypoint(wp) {
  return !!(wp && Number.isFinite(wp.x) && Number.isFinite(wp.y));
}

export const CARD_ROUTE_PAD = 12;

function inflateBounds(bounds, pad) {
  pad = pad == null ? CARD_ROUTE_PAD : pad;
  return {
    left: bounds.left - pad,
    right: bounds.right + pad,
    top: bounds.top - pad,
    bottom: bounds.bottom + pad,
    cx: bounds.cx,
    cy: bounds.cy,
    nw: bounds.nw + pad * 2,
    nh: bounds.nh + pad * 2,
  };
}

function hSegHitsRect(y, x1, x2, rect) {
  const xmin = Math.min(x1, x2);
  const xmax = Math.max(x1, x2);
  return y >= rect.top && y <= rect.bottom && xmax >= rect.left && xmin <= rect.right;
}

function vSegHitsRect(x, y1, y2, rect) {
  const ymin = Math.min(y1, y2);
  const ymax = Math.max(y1, y2);
  return x >= rect.left && x <= rect.right && ymax >= rect.top && ymin <= rect.bottom;
}

function corridorSegmentsHitObstacles(anchors, obstacles) {
  if (!obstacles || !obstacles.length || anchors.length < 2) return false;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    for (let j = 0; j < obstacles.length; j++) {
      const r = inflateBounds(obstacles[j], CARD_ROUTE_PAD);
      if (Math.abs(a.y - b.y) < 1 && hSegHitsRect(a.y, a.x, b.x, r)) return true;
      if (Math.abs(a.x - b.x) < 1 && vSegHitsRect(a.x, a.y, b.y, r)) return true;
    }
  }
  return false;
}

function nodeSlugsForEdge(edge) {
  const slugs = new Set();
  if (edge.kind === 'family-child') {
    slugs.add(edge.child);
    (edge.parents || []).forEach(function (s) { if (s) slugs.add(s); });
  } else {
    if (edge.from) slugs.add(edge.from);
    if (edge.to) slugs.add(edge.to);
  }
  const src = edge.source ? ensureEndpointKind(edge.source) : null;
  const tgt = edge.target ? ensureEndpointKind(edge.target) : null;
  if (src && src.kind === 'node') slugs.add(src.nodeId);
  if (tgt && tgt.kind === 'node') slugs.add(tgt.nodeId);
  return slugs;
}

export function collectRouteObstacles(nodeMap, w, h, boundsMap, excludeSlugs) {
  const obstacles = [];
  const skip = excludeSlugs || new Set();
  nodeMap.forEach(function (node, slug) {
    if (skip.has(slug)) return;
    obstacles.push(nodePixelBounds(node, w, h, boundsMap));
  });
  return obstacles;
}

function buildStubCorridorAnchors(srcStub, tgtStub, srcNormal, tgtNormal, obstacles) {
  const mid = autoWaypointsBetweenStubs(srcStub, tgtStub, srcNormal, tgtNormal, obstacles);
  return [srcStub].concat(mid).concat([tgtStub]);
}

function pointOnAnchorSegment(anchors, seg, u) {
  const a = anchors[seg];
  const b = anchors[seg + 1];
  if (!a || !b) return anchors[0] ? { x: anchors[0].x, y: anchors[0].y } : { x: 0, y: 0 };
  return {
    x: snapPx(a.x + (b.x - a.x) * u),
    y: snapPx(a.y + (b.y - a.y) * u),
  };
}

function nearestSegmentOnAnchors(px, py, anchors) {
  let bestSeg = 0;
  let bestU = 0.5;
  let bestD = Infinity;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + dx * t;
    const cy = a.y + dy * t;
    const d = Math.hypot(px - cx, py - cy);
    if (d < bestD) {
      bestD = d;
      bestSeg = i;
      bestU = t;
    }
  }
  return { seg: bestSeg, u: bestU };
}

function resolveManualWaypointsPx(waypoints, w, h, srcResolved, tgtResolved, obstacles) {
  if (!waypoints || !waypoints.length) return [];
  const srcStub = vecAdd(srcResolved.point, vecScale(srcResolved.normal, ARROW_STUB_LEN));
  const tgtStub = vecAdd(tgtResolved.point, vecScale(tgtResolved.normal, ARROW_STUB_LEN));
  const anchors = buildStubCorridorAnchors(srcStub, tgtStub, srcResolved.normal, tgtResolved.normal, obstacles);
  return waypoints.map(function (wp) {
    if (isRelativeWaypoint(wp)) return pointOnAnchorSegment(anchors, wp.seg, wp.u);
    if (isAbsoluteWaypoint(wp)) return { x: snapPx(wp.x * w), y: snapPx(wp.y * h) };
    return null;
  }).filter(Boolean);
}

/** ドラッグ確定時: 絶対座標 waypoint をセグメント相対形式へ変換 */
export function finalizeWaypointRelative(edge, waypointIndex, px, py, nodeMap, w, h, options) {
  options = options || {};
  const resolved = resolveEdgeEndpointsForRouting(edge, nodeMap, w, h, options);
  if (!resolved || !edge.waypoints || waypointIndex < 0 || waypointIndex >= edge.waypoints.length) return;
  const anchors = buildStubCorridorAnchors(
    resolved.srcStub,
    resolved.tgtStub,
    resolved.srcNormal,
    resolved.tgtNormal,
    resolved.obstacles
  );
  const hit = nearestSegmentOnAnchors(px, py, anchors);
  edge.waypoints[waypointIndex] = { seg: hit.seg, u: hit.u };
}

function resolveEdgeEndpointsForRouting(edge, nodeMap, w, h, options) {
  options = options || {};
  const boundsMap = options.boundsMap || null;
  const edgePaths = options.edgePaths || null;
  const canvasEdges = options.canvas || null;
  const autoPorts = options.autoPorts || null;
  const defaults = defaultPortsForEdge(edge, nodeMap, w, h, boundsMap, canvasEdges);
  if (!defaults) return null;
  const sourceEp = ensureEndpointKind(pickEffectiveEndpoint(edge, 'source', autoPorts, defaults));
  const targetEp = ensureEndpointKind(pickEffectiveEndpoint(edge, 'target', autoPorts, defaults));
  const ctx = { nodeMap, w, h, boundsMap, edgePaths };

  const childNode = edge.kind === 'family-child' ? nodeMap.get(edge.child) : null;
  const childCenter = childNode ? nodeCenter(childNode, w, h, boundsMap) : null;
  let towardForSource = null;
  if (targetEp.kind === 'node') {
    const tn = nodeMap.get(targetEp.nodeId);
    if (tn) towardForSource = nodeCenter(tn, w, h, boundsMap);
  } else if (targetEp.kind === 'edge' && edgePaths) {
    const ref = edgePaths.get(targetEp.edgeId);
    if (ref && ref.pts) {
      const at = pointAtArcLength(ref.pts, targetEp.t);
      if (at) towardForSource = at.point;
    }
  }
  if (sourceEp.kind === 'node') {
    const sn = nodeMap.get(sourceEp.nodeId);
    if (sn && !childCenter) towardForSource = nodeCenter(sn, w, h, boundsMap);
  }

  const tgtResolved = resolveEndpoint(targetEp, ctx, childCenter);
  const srcResolved = resolveEndpoint(sourceEp, ctx, towardForSource || (tgtResolved && tgtResolved.point));
  if (!srcResolved || !tgtResolved) return null;

  const srcStub = vecAdd(srcResolved.point, vecScale(srcResolved.normal, ARROW_STUB_LEN));
  const tgtStub = vecAdd(tgtResolved.point, vecScale(tgtResolved.normal, ARROW_STUB_LEN));
  const obstacles = collectRouteObstacles(nodeMap, w, h, boundsMap, nodeSlugsForEdge(edge));
  return {
    srcResolved,
    tgtResolved,
    srcStub,
    tgtStub,
    srcNormal: srcResolved.normal,
    tgtNormal: tgtResolved.normal,
    obstacles,
  };
}

function attachPortLayoutFields(edge, raw) {
  const source = normalizeEndpoint(raw?.source);
  const target = normalizeEndpoint(raw?.target);
  if (source) edge.source = source;
  if (target) edge.target = target;
  if (Array.isArray(raw?.waypoints)) {
    edge.waypoints = raw.waypoints.map(normalizeWaypoint).filter(Boolean);
  }
  migrateLegacyLayoutFields(edge, raw);
  stripLegacyLayoutFields(edge);
  return edge;
}

/** 旧 fromPoint/toPoint/jointMid → source/target/waypoints（読み取り時のみ） */
function migrateLegacyLayoutFields(edge, raw) {
  if (edge.source && edge.target) return edge;
  const fp = raw?.fromPoint;
  const tp = raw?.toPoint;
  if (!fp && !tp) return edge;

  const fromSlug = edge.kind === 'family-child' ? edge.child : edge.from;
  const toSlug = edge.kind === 'family-child' ? edge.parents[0] : edge.to;

  if (fp && !edge.source) {
    const side = normalizeSide(fp.side) || guessSideFromNormPoint(fp) || 'right';
    const t = (side === 'top' || side === 'bottom') ? clamp01(Number(fp.x)) : clamp01(Number(fp.y));
    edge.source = { kind: 'node', nodeId: fromSlug, side, t };
  }
  if (tp && !edge.target) {
    const side = normalizeSide(tp.side) || guessSideFromNormPoint(tp) || 'left';
    const t = (side === 'top' || side === 'bottom') ? clamp01(Number(tp.x)) : clamp01(Number(tp.y));
    edge.target = { kind: 'node', nodeId: toSlug, side, t };
  }
  if (!edge.waypoints || !edge.waypoints.length) {
    const wps = [];
    if (raw?.jointMidX != null && Number.isFinite(Number(raw.jointMidX))) {
      wps.push({ x: clamp01(Number(raw.jointMidX)), y: 0.5 });
    }
    if (raw?.jointMidY != null && Number.isFinite(Number(raw.jointMidY))) {
      const existing = wps[0];
      if (existing) existing.y = clamp01(Number(raw.jointMidY));
      else wps.push({ x: 0.5, y: clamp01(Number(raw.jointMidY)) });
    }
    if (wps.length) edge.waypoints = wps;
  }
  return edge;
}

function stripLegacyLayoutFields(edge) {
  delete edge.fromPoint;
  delete edge.toPoint;
  delete edge.jointMidX;
  delete edge.jointMidY;
  delete edge.elbowPoint;
}

function guessSideFromNormPoint(pt) {
  const x = Number(pt.x);
  const y = Number(pt.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const dTop = y;
  const dBottom = 1 - y;
  const dLeft = x;
  const dRight = 1 - x;
  const min = Math.min(dTop, dBottom, dLeft, dRight);
  if (min === dTop) return 'top';
  if (min === dBottom) return 'bottom';
  if (min === dLeft) return 'left';
  return 'right';
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
  return attachLabelPoint(attachPortLayoutFields(edge, raw), raw);
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
  edges.forEach(function (e, i) {
    e.id = assignEdgeId(e, i);
    if (e.source) e.source = ensureEndpointKind(e.source);
    if (e.target) e.target = ensureEndpointKind(e.target);
  });
  migrateFamilyChildTargetsToEdge(edges);
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

export const ARROW_TIP_LEN = 10;
export const ARROW_STUB_LEN = 24;
export const ARROW_HEAD_WIDTH = 6;

export function snapPx(v) {
  return Math.round(Number(v) || 0);
}

export function snapOrthogonalPoint(p) {
  return { x: snapPx(p.x), y: snapPx(p.y) };
}

export function snapAngleDeg(deg) {
  const snaps = [0, 90, 180, 270];
  const n = ((deg % 360) + 360) % 360;
  let best = snaps[0];
  let bestDiff = 360;
  snaps.forEach(function (s) {
    const d = Math.min(Math.abs(n - s), 360 - Math.abs(n - s));
    if (d < bestDiff) { bestDiff = d; best = s; }
  });
  return best;
}

/** カードの辺に刺さる矢印の向き（必ず0/90/180/270°） */
export function inwardAngleForSide(side) {
  return ({ top: 90, bottom: 270, left: 0, right: 180 })[side] || 0;
}

/** 辺の外側向き単位法線（SVG座標: y下向き） */
export function outwardNormalForSide(side) {
  return ({ top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } })[side]
    || { x: 1, y: 0 };
}

function vecAdd(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

function vecScale(v, s) {
  return { x: v.x * s, y: v.y * s };
}

/** ポート → 辺上の点 + 外向き法線 */
export function resolvePort(bounds, port) {
  const side = port.side;
  const t = Math.max(0.06, Math.min(0.94, port.t));
  const normal = outwardNormalForSide(side);
  let point;
  if (side === 'top') {
    point = { x: snapPx(bounds.left + bounds.nw * t), y: snapPx(bounds.top) };
  } else if (side === 'bottom') {
    point = { x: snapPx(bounds.left + bounds.nw * t), y: snapPx(bounds.bottom) };
  } else if (side === 'left') {
    point = { x: snapPx(bounds.left), y: snapPx(bounds.top + bounds.nh * t) };
  } else {
    point = { x: snapPx(bounds.right), y: snapPx(bounds.top + bounds.nh * t) };
  }
  return { point, normal, side };
}

/** カーソル位置から最も近い辺のポート */
export function nearestPortOnBounds(bounds, slug, px, py) {
  const candidates = [
  { side: 'top', point: { x: Math.max(bounds.left + 6, Math.min(bounds.right - 6, px)), y: bounds.top } },
  { side: 'bottom', point: { x: Math.max(bounds.left + 6, Math.min(bounds.right - 6, px)), y: bounds.bottom } },
  { side: 'left', point: { x: bounds.left, y: Math.max(bounds.top + 6, Math.min(bounds.bottom - 6, py)) } },
  { side: 'right', point: { x: bounds.right, y: Math.max(bounds.top + 6, Math.min(bounds.bottom - 6, py)) } },
  ];
  let best = candidates[0];
  let bestD = Infinity;
  candidates.forEach(function (c) {
    const d = Math.hypot(px - c.point.x, py - c.point.y);
    if (d < bestD) { bestD = d; best = c; }
  });
  let t;
  if (best.side === 'top' || best.side === 'bottom') {
    t = (best.point.x - bounds.left) / bounds.nw;
  } else {
    t = (best.point.y - bounds.top) / bounds.nh;
  }
  return { nodeId: slug, side: best.side, t: Math.max(0.08, Math.min(0.92, t)) };
}

/** パス上の弧長 t (0..1) → 点と接線 */
export function pointAtArcLength(pts, t) {
  if (!pts || pts.length < 2) return null;
  t = Math.max(0, Math.min(1, Number(t) || 0));
  let total = 0;
  const segLens = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segLens.push(len);
    total += len;
  }
  if (total < 1) {
    return { point: { x: snapPx(pts[0].x), y: snapPx(pts[0].y) }, tangent: { x: 1, y: 0 } };
  }
  let target = t * total;
  for (let i = 0; i < segLens.length; i++) {
    if (target <= segLens[i] + 0.001 || i === segLens.length - 1) {
      const localT = segLens[i] ? Math.min(1, target / segLens[i]) : 0;
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const point = {
        x: snapPx(p1.x + (p2.x - p1.x) * localT),
        y: snapPx(p1.y + (p2.y - p1.y) * localT),
      };
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      return { point, tangent: { x: dx / len, y: dy / len } };
    }
    target -= segLens[i];
  }
  const p1 = pts[pts.length - 2];
  const p2 = pts[pts.length - 1];
  return {
    point: { x: snapPx(p2.x), y: snapPx(p2.y) },
    tangent: { x: p2.x - p1.x, y: p2.y - p1.y },
  };
}

/** 画面上の点 → 参照パス上の最寄り弧長 t */
export function snapArcLengthFromPoint(pts, px, py) {
  if (!pts || pts.length < 2) return 0.5;
  let bestT = 0;
  let bestD = Infinity;
  let total = 0;
  const segLens = [];
  for (let i = 0; i < pts.length - 1; i++) {
    segLens.push(Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y));
    total += segLens[i];
  }
  if (total < 1) return 0.5;
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len2 = dx * dx + dy * dy;
    let localT = len2 ? ((px - p1.x) * dx + (py - p1.y) * dy) / len2 : 0;
    localT = Math.max(0, Math.min(1, localT));
    const cx = p1.x + dx * localT;
    const cy = p1.y + dy * localT;
    const d = Math.hypot(px - cx, py - cy);
    if (d < bestD) {
      bestD = d;
      bestT = (acc + segLens[i] * localT) / total;
    }
    acc += segLens[i];
  }
  return Math.max(0.02, Math.min(0.98, bestT));
}

function vecNormalize(v) {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

function normalFromTangent(tangent, towardPoint, atPoint) {
  const perpA = vecNormalize({ x: -tangent.y, y: tangent.x });
  const perpB = vecNormalize({ x: tangent.y, y: -tangent.x });
  const to = { x: towardPoint.x - atPoint.x, y: towardPoint.y - atPoint.y };
  const dotA = perpA.x * to.x + perpA.y * to.y;
  return dotA >= 0 ? perpA : perpB;
}

function nodeCenter(node, w, h, boundsMap) {
  const b = nodePixelBounds(node, w, h, boundsMap);
  return { x: b.cx, y: b.cy };
}

/** Endpoint 解決: node → resolvePort / edge → 参照パス上の弧長 t */
export function resolveEndpoint(ep, ctx, towardPoint) {
  if (!ep) return null;
  ep = ensureEndpointKind(ep);
  if (ep.kind === 'node') {
    const node = ctx.nodeMap.get(ep.nodeId);
    if (!node) return null;
    const bounds = nodePixelBounds(node, ctx.w, ctx.h, ctx.boundsMap);
    const resolved = resolvePort(bounds, ep);
    return {
      point: resolved.point,
      normal: resolved.normal,
      side: resolved.side,
      kind: 'node',
      endpoint: ep,
    };
  }
  const ref = ctx.edgePaths && ctx.edgePaths.get(ep.edgeId);
  if (!ref || !ref.pts || ref.pts.length < 2) return null;
  const at = pointAtArcLength(ref.pts, ep.t);
  if (!at) return null;
  let toward = towardPoint;
  if (!toward) toward = at.point;
  const normal = normalFromTangent(at.tangent, toward, at.point);
  return {
    point: at.point,
    normal,
    tangent: at.tangent,
    kind: 'edge',
    endpoint: ep,
  };
}

function migrateFamilyChildTargetsToEdge(edges) {
  const marriageByCouple = new Map();
  edges.forEach(function (e) {
    if (e.kind === 'marriage') marriageByCouple.set(coupleKey(e.from, e.to), e);
  });
  edges.forEach(function (edge) {
    if (edge.kind !== 'family-child') return;
    if (edge.target && edge.target.kind === 'edge') return;
    const key = coupleKey(edge.parents[0], edge.parents[1] || edge.parents[0]);
    const marriage = marriageByCouple.get(key);
    if (!marriage || !marriage.id) return;
    let t = 0.5;
    if (edge.target && edge.target.kind === 'node') t = edge.target.t;
    edge.target = { kind: 'edge', edgeId: marriage.id, t: Math.max(0.02, Math.min(0.98, t)) };
  });
}

function findMarriageEdgeByParents(edges, parents) {
  const idx = findMarriageEdgeIndex(edges, parents[0], parents[1] || parents[0]);
  return idx >= 0 ? edges[idx] : null;
}

function defaultPortsBetweenBounds(bFrom, bTo, fromSlug, toSlug) {
  const dy = bTo.cy - bFrom.cy;
  const dx = bTo.cx - bFrom.cx;
  const rowThreshold = Math.min(bFrom.nh, bTo.nh) * 0.38;
  const colThreshold = Math.min(bFrom.nw, bTo.nw) * 0.38;

  if (Math.abs(dy) <= rowThreshold && Math.abs(dx) > 16) {
    if (bFrom.cx <= bTo.cx) {
      return {
        source: { nodeId: fromSlug, side: 'right', t: 0.5 },
        target: { nodeId: toSlug, side: 'left', t: 0.5 },
      };
    }
    return {
      source: { nodeId: fromSlug, side: 'left', t: 0.5 },
      target: { nodeId: toSlug, side: 'right', t: 0.5 },
    };
  }
  if (Math.abs(dx) <= colThreshold && Math.abs(dy) > 16) {
    if (bFrom.cy <= bTo.cy) {
      return {
        source: { nodeId: fromSlug, side: 'bottom', t: 0.5 },
        target: { nodeId: toSlug, side: 'top', t: 0.5 },
      };
    }
    return {
      source: { nodeId: fromSlug, side: 'top', t: 0.5 },
      target: { nodeId: toSlug, side: 'bottom', t: 0.5 },
    };
  }
  const fromIsUpper = bFrom.cy <= bTo.cy;
  const upperB = fromIsUpper ? bFrom : bTo;
  const lowerB = fromIsUpper ? bTo : bFrom;
  const upperSlug = fromIsUpper ? fromSlug : toSlug;
  const lowerSlug = fromIsUpper ? toSlug : fromSlug;
  const upperSide = 'bottom';
  const upperT = upperB.cx <= lowerB.cx ? 0.62 : 0.38;
  if (fromSlug === upperSlug) {
    return {
      source: { nodeId: fromSlug, side: upperSide, t: upperT },
      target: { nodeId: toSlug, side: 'top', t: 0.5 },
    };
  }
  return {
    source: { nodeId: fromSlug, side: 'top', t: 0.5 },
    target: { nodeId: toSlug, side: upperSide, t: upperT },
  };
}

export function defaultPortsForEdge(edge, nodeMap, w, h, boundsMap, canvasEdges) {
  if (edge.kind === 'marriage' || (edge.kind === 'relation' && isCoupleLabel(edge.label))) {
    const p1 = nodeMap.get(edge.from);
    const p2 = nodeMap.get(edge.to);
    if (!p1 || !p2) return null;
    const b1 = nodePixelBounds(p1, w, h, boundsMap);
    const b2 = nodePixelBounds(p2, w, h, boundsMap);
    const leftSlug = b1.cx <= b2.cx ? edge.from : edge.to;
    const rightSlug = b1.cx <= b2.cx ? edge.to : edge.from;
    return {
      source: { kind: 'node', nodeId: leftSlug, side: 'right', t: 0.5 },
      target: { kind: 'node', nodeId: rightSlug, side: 'left', t: 0.5 },
    };
  }
  if (edge.kind === 'family-child') {
    const child = nodeMap.get(edge.child);
    const parent = nodeMap.get(edge.parents[0]);
    if (!child || !parent) return null;
    const cb = nodePixelBounds(child, w, h, boundsMap);
    const pb = nodePixelBounds(parent, w, h, boundsMap);
    const childBelow = cb.cy > pb.cy;
    const marriage = canvasEdges ? findMarriageEdgeByParents(canvasEdges, edge.parents) : null;
    let targetEp;
    if (marriage && marriage.id) {
      targetEp = { kind: 'edge', edgeId: marriage.id, t: 0.5 };
    } else {
      targetEp = {
        kind: 'node',
        nodeId: edge.parents[0],
        side: childBelow ? 'bottom' : 'top',
        t: 0.5,
      };
    }
    return {
      source: { kind: 'node', nodeId: edge.child, side: childBelow ? 'top' : 'bottom', t: 0.5 },
      target: targetEp,
    };
  }
  const fromNode = nodeMap.get(edge.from);
  const toNode = nodeMap.get(edge.to);
  if (!fromNode || !toNode) return null;
  const ports = defaultPortsBetweenBounds(
    nodePixelBounds(fromNode, w, h, boundsMap),
    nodePixelBounds(toNode, w, h, boundsMap),
    edge.from,
    edge.to
  );
  return {
    source: { kind: 'node', nodeId: ports.source.nodeId, side: ports.source.side, t: ports.source.t },
    target: { kind: 'node', nodeId: ports.target.nodeId, side: ports.target.side, t: ports.target.t },
  };
}

function autoWaypointsBetweenStubs(srcStub, tgtStub, srcNormal, tgtNormal, obstacles) {
  const dx = tgtStub.x - srcStub.x;
  const dy = tgtStub.y - srcStub.y;
  if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return [];

  const exitH = Math.abs(srcNormal.x) > Math.abs(srcNormal.y);
  const enterH = Math.abs(tgtNormal.x) > Math.abs(tgtNormal.y);
  let base = [];

  if (exitH && enterH) {
    if (Math.abs(srcStub.y - tgtStub.y) < 4) return [];
    const midX = snapPx((srcStub.x + tgtStub.x) / 2);
    base = [{ x: midX, y: srcStub.y }, { x: midX, y: tgtStub.y }];
  } else if (!exitH && !enterH) {
    if (Math.abs(srcStub.x - tgtStub.x) < 4) return [];
    const midY = snapPx((srcStub.y + tgtStub.y) / 2);
    base = [{ x: srcStub.x, y: midY }, { x: tgtStub.x, y: midY }];
  } else if (exitH) {
    base = [{ x: tgtStub.x, y: srcStub.y }];
  } else {
    base = [{ x: srcStub.x, y: tgtStub.y }];
  }

  if (!obstacles || !obstacles.length) return base;

  const anchors = [srcStub].concat(base).concat([tgtStub]);
  if (!corridorSegmentsHitObstacles(anchors, obstacles)) return base;

  // 水平/垂直シフトで回避できない場合: 障害物の上/下（または左/右）を迂回
  const detour = detourMidpointsAroundObstacles(srcStub, tgtStub, srcNormal, tgtNormal, obstacles);
  if (detour) {
    const trial = [srcStub].concat(detour).concat([tgtStub]);
    if (!corridorSegmentsHitObstacles(trial, obstacles)) return detour;
  }

  const candidates = new Set();
  if (exitH && enterH && base.length === 2) {
    candidates.add(snapPx((srcStub.x + tgtStub.x) / 2));
    candidates.add(snapPx(srcStub.x + (tgtStub.x - srcStub.x) * 0.33));
    candidates.add(snapPx(srcStub.x + (tgtStub.x - srcStub.x) * 0.67));
    obstacles.forEach(function (obs) {
      const r = inflateBounds(obs, CARD_ROUTE_PAD);
      candidates.add(snapPx(r.left - CARD_ROUTE_PAD));
      candidates.add(snapPx(r.right + CARD_ROUTE_PAD));
    });
    let best = base;
    let bestScore = Infinity;
    candidates.forEach(function (midX) {
      const mid = [{ x: midX, y: srcStub.y }, { x: midX, y: tgtStub.y }];
      const trial = [srcStub].concat(mid).concat([tgtStub]);
      if (corridorSegmentsHitObstacles(trial, obstacles)) return;
      const score = Math.abs(midX - (srcStub.x + tgtStub.x) / 2);
      if (score < bestScore) { bestScore = score; best = mid; }
    });
    return best;
  }

  if (!exitH && !enterH && base.length === 2) {
    candidates.add(snapPx((srcStub.y + tgtStub.y) / 2));
    candidates.add(snapPx(srcStub.y + (tgtStub.y - srcStub.y) * 0.33));
    candidates.add(snapPx(srcStub.y + (tgtStub.y - srcStub.y) * 0.67));
    obstacles.forEach(function (obs) {
      const r = inflateBounds(obs, CARD_ROUTE_PAD);
      candidates.add(snapPx(r.top - CARD_ROUTE_PAD));
      candidates.add(snapPx(r.bottom + CARD_ROUTE_PAD));
    });
    let best = base;
    let bestScore = Infinity;
    candidates.forEach(function (midY) {
      const mid = [{ x: srcStub.x, y: midY }, { x: tgtStub.x, y: midY }];
      const trial = [srcStub].concat(mid).concat([tgtStub]);
      if (corridorSegmentsHitObstacles(trial, obstacles)) return;
      const score = Math.abs(midY - (srcStub.y + tgtStub.y) / 2);
      if (score < bestScore) { bestScore = score; best = mid; }
    });
    return best;
  }

  if (base.length === 1) {
    const corner = base[0];
    const altA = { x: corner.x, y: snapPx((srcStub.y + tgtStub.y) / 2) };
    const altB = { x: snapPx((srcStub.x + tgtStub.x) / 2), y: corner.y };
    const trials = [
      [corner],
      [altA],
      [altB],
    ];
    let best = base;
    let bestScore = Infinity;
    trials.forEach(function (mid) {
      const trial = [srcStub].concat(mid).concat([tgtStub]);
      if (corridorSegmentsHitObstacles(trial, obstacles)) return;
      const c = mid[0];
      const score = Math.abs(c.x - corner.x) + Math.abs(c.y - corner.y);
      if (score < bestScore) { bestScore = score; best = mid; }
    });
    return best;
  }

  return base;
}

/** 障害物群を避ける上下/左右の迂回ウェイポイント候補 */
function detourMidpointsAroundObstacles(srcStub, tgtStub, srcNormal, tgtNormal, obstacles) {
  const exitH = Math.abs(srcNormal.x) > Math.abs(srcNormal.y);
  const enterH = Math.abs(tgtNormal.x) > Math.abs(tgtNormal.y);
  const xMin = Math.min(srcStub.x, tgtStub.x);
  const xMax = Math.max(srcStub.x, tgtStub.x);
  const yMin = Math.min(srcStub.y, tgtStub.y);
  const yMax = Math.max(srcStub.y, tgtStub.y);
  let laneTop = Infinity;
  let laneBottom = -Infinity;
  let laneLeft = Infinity;
  let laneRight = -Infinity;

  obstacles.forEach(function (obs) {
    const r = inflateBounds(obs, CARD_ROUTE_PAD);
    if (r.right >= xMin && r.left <= xMax) {
      laneTop = Math.min(laneTop, r.top);
      laneBottom = Math.max(laneBottom, r.bottom);
    }
    if (r.bottom >= yMin && r.top <= yMax) {
      laneLeft = Math.min(laneLeft, r.left);
      laneRight = Math.max(laneRight, r.right);
    }
  });

  const lanes = [];
  if (laneTop < Infinity) {
    const y = snapPx(laneTop - CARD_ROUTE_PAD);
    lanes.push([{ x: srcStub.x, y }, { x: tgtStub.x, y }]);
    lanes.push([{ x: srcStub.x, y }, { x: snapPx((srcStub.x + tgtStub.x) / 2), y }, { x: tgtStub.x, y }]);
  }
  if (laneBottom > -Infinity) {
    const y = snapPx(laneBottom + CARD_ROUTE_PAD);
    lanes.push([{ x: srcStub.x, y }, { x: tgtStub.x, y }]);
    lanes.push([{ x: srcStub.x, y }, { x: snapPx((srcStub.x + tgtStub.x) / 2), y }, { x: tgtStub.x, y }]);
  }
  if (!exitH && !enterH) {
    if (laneLeft < Infinity) {
      const x = snapPx(laneLeft - CARD_ROUTE_PAD);
      lanes.push([{ x, y: srcStub.y }, { x, y: tgtStub.y }]);
    }
    if (laneRight > -Infinity) {
      const x = snapPx(laneRight + CARD_ROUTE_PAD);
      lanes.push([{ x, y: srcStub.y }, { x, y: tgtStub.y }]);
    }
  }

  let best = null;
  let bestScore = Infinity;
  lanes.forEach(function (mid) {
    const trial = [srcStub].concat(mid).concat([tgtStub]);
    if (corridorSegmentsHitObstacles(trial, obstacles)) return;
    const c = mid[Math.floor(mid.length / 2)];
    const score = Math.abs(c.x - (srcStub.x + tgtStub.x) / 2) + Math.abs(c.y - (srcStub.y + tgtStub.y) / 2);
    if (score < bestScore) { bestScore = score; best = mid; }
  });
  return best;
}

function dedupePoints(pts) {
  if (!pts.length) return [];
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1];
    const cur = pts[i];
    if (prev.x !== cur.x || prev.y !== cur.y) out.push(cur);
  }
  return out;
}

/** 同一直線上の冗長な中間点を除去し、曲げ回数を最小化 */
function simplifyCollinear(pts) {
  if (pts.length < 3) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const collinearH = Math.abs(a.y - b.y) < 1 && Math.abs(b.y - c.y) < 1;
    const collinearV = Math.abs(a.x - b.x) < 1 && Math.abs(b.x - c.x) < 1;
    if (collinearH || collinearV) continue;
    out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** 隣接点間を水平/垂直のみに直交化（冗長点は除去） */
export function orthogonalizePath(pts) {
  if (pts.length < 2) return pts.slice();
  const out = [{ x: snapPx(pts[0].x), y: snapPx(pts[0].y) }];
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1];
    const cur = { x: snapPx(pts[i].x), y: snapPx(pts[i].y) };
    if (prev.x !== cur.x && prev.y !== cur.y) {
      out.push({ x: cur.x, y: prev.y });
    }
    if (out[out.length - 1].x !== cur.x || out[out.length - 1].y !== cur.y) {
      out.push(cur);
    }
  }
  return simplifyCollinear(dedupePoints(out));
}

/**
 * 単一ルータ: ポート2点 + waypoints → 直交パス
 * waypoints 空なら stub 間を自動ルート
 */
export function computePath(srcResolved, tgtResolved, waypointsPx, stubLen, options) {
  stubLen = stubLen == null ? ARROW_STUB_LEN : stubLen;
  options = options || {};
  const obstacles = options.obstacles || null;
  const srcStub = vecAdd(srcResolved.point, vecScale(srcResolved.normal, stubLen));
  const tgtStub = vecAdd(tgtResolved.point, vecScale(tgtResolved.normal, stubLen));

  let midPts = (waypointsPx || []).map(function (wp) {
    return { x: snapPx(wp.x), y: snapPx(wp.y) };
  });
  if (!midPts.length) {
    midPts = autoWaypointsBetweenStubs(srcStub, tgtStub, srcResolved.normal, tgtResolved.normal, obstacles);
    const corridor = [srcStub].concat(midPts).concat([tgtStub]);
    if (obstacles && obstacles.length && corridorSegmentsHitObstacles(corridor, obstacles)) {
      const detour = detourMidpointsAroundObstacles(
        srcStub,
        tgtStub,
        srcResolved.normal,
        tgtResolved.normal,
        obstacles
      );
      if (detour) midPts = detour;
    }
  }

  const raw = [srcResolved.point, srcStub].concat(midPts).concat([tgtStub, tgtResolved.point]);
  return orthogonalizePath(raw);
}

function pathToSegments(pts, opts) {
  opts = opts || {};
  const dashed = !!opts.dashed;
  const bidirectional = opts.arrowBoth !== false && !opts.directed;
  const oneWay = !!opts.directed && !bidirectional;
  const segments = [];
  const hitTargets = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const flags = {
      dashed,
      arrowStart: i === 0 && bidirectional,
      arrowEnd: i === pts.length - 2 && (bidirectional || oneWay),
    };
    segments.push({
      x1: pts[i].x,
      y1: pts[i].y,
      x2: pts[i + 1].x,
      y2: pts[i + 1].y,
      dashed: flags.dashed,
      arrowStart: flags.arrowStart,
      arrowEnd: flags.arrowEnd,
    });
    hitTargets.push({ x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y });
  }
  return { segments, hitTargets };
}

/**
 * 矢頭ポリゴン。tip は辺上の点、矢頭は辺の外側（normal方向）に置き、
 * 尖りが辺＝カードに向かって刺さる。カードへの食い込みを防ぐ。
 */
export function arrowPolygonPoints(tip, normal, tipLen, halfWidth) {
  tipLen = tipLen == null ? ARROW_TIP_LEN : tipLen;
  halfWidth = halfWidth == null ? ARROW_HEAD_WIDTH : halfWidth;
  const back = vecAdd(tip, vecScale(normal, tipLen));
  const ortho = { x: -normal.y, y: normal.x };
  return {
    tip,
    left: vecAdd(back, vecScale(ortho, halfWidth)),
    right: vecAdd(back, vecScale(ortho, -halfWidth)),
  };
}

function buildAutoLabel(pts, text, preferVertical) {
  const t = String(text || '').trim();
  if (!t) return null;
  const charH = 13;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a.y === b.y && Math.abs(b.x - a.x) > 12) {
      return { x: (a.x + b.x) / 2, y: a.y - 10, text: t, vertical: false };
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a.x === b.x && Math.abs(b.y - a.y) > 12) {
      const side = a.x <= (pts[0].x + pts[pts.length - 1].x) / 2 ? 14 : -14;
      const midY = (a.y + b.y) / 2;
      return {
        x: a.x + side,
        y: midY - ((t.length - 1) * charH) / 2,
        text: t,
        vertical: true,
      };
    }
  }
  if (preferVertical) {
    const mid = pts[Math.floor(pts.length / 2)];
    return { x: mid.x + 14, y: mid.y, text: t, vertical: true };
  }
  return null;
}

/** パス上の曲がり角ハンドル（手動 waypoint + 自動コーナー） */
export function extractPathCornerHandles(pts, waypointsPx) {
  if (!pts || pts.length < 3) return [];
  const manualByKey = new Map();
  (waypointsPx || []).forEach(function (wp, idx) {
    manualByKey.set(snapPx(wp.x) + ',' + snapPx(wp.y), idx);
  });
  const handles = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const collinearH = prev.y === cur.y && cur.y === next.y;
    const collinearV = prev.x === cur.x && cur.x === next.x;
    if (collinearH || collinearV) continue;
    const key = snapPx(cur.x) + ',' + snapPx(cur.y);
    if (manualByKey.has(key)) {
      handles.push({ x: cur.x, y: cur.y, index: manualByKey.get(key), auto: false });
      manualByKey.delete(key);
    } else {
      handles.push({ x: cur.x, y: cur.y, index: -1, auto: true });
    }
  }
  manualByKey.forEach(function (idx, key) {
    const parts = key.split(',');
    handles.push({ x: Number(parts[0]), y: Number(parts[1]), index: idx, auto: false });
  });
  return handles;
}

/** その端点がユーザー確定（手動）か。node は常に手動、edge は autoT===false のみ手動 */
function isManualEndpoint(ep) {
  if (!ep) return false;
  ep = ensureEndpointKind(ep);
  if (ep.kind === 'node') return true;
  return ep.autoT === false;
}

/** role の実効エンドポイントを決定（手動 > 自動割当 > デフォルト） */
function pickEffectiveEndpoint(edge, role, autoPorts, defaults) {
  const manual = edge[role];
  if (manual && isManualEndpoint(manual)) return manual;
  if (autoPorts && autoPorts[role]) return autoPorts[role];
  if (manual) return manual;
  return defaults[role];
}

/** エッジ1本のジオメトリ（単一入口） */
export function computeEdgeGeometry(edge, nodeMap, w, h, options) {
  options = options || {};
  const boundsMap = options.boundsMap || null;
  const edgePaths = options.edgePaths || null;
  const canvasEdges = options.canvas || null;
  const autoPorts = options.autoPorts || null;
  const defaults = defaultPortsForEdge(edge, nodeMap, w, h, boundsMap, canvasEdges);
  if (!defaults) return null;

  const sourceEp = ensureEndpointKind(pickEffectiveEndpoint(edge, 'source', autoPorts, defaults));
  const targetEp = ensureEndpointKind(pickEffectiveEndpoint(edge, 'target', autoPorts, defaults));
  const ctx = { nodeMap, w, h, boundsMap, edgePaths };

  const childNode = edge.kind === 'family-child' ? nodeMap.get(edge.child) : null;
  const childCenter = childNode ? nodeCenter(childNode, w, h, boundsMap) : null;
  const towardForTarget = childCenter;
  let towardForSource = null;
  if (targetEp.kind === 'node') {
    const tn = nodeMap.get(targetEp.nodeId);
    if (tn) towardForSource = nodeCenter(tn, w, h, boundsMap);
  } else if (targetEp.kind === 'edge' && edgePaths) {
    const ref = edgePaths.get(targetEp.edgeId);
    if (ref && ref.pts) {
      const at = pointAtArcLength(ref.pts, targetEp.t);
      if (at) towardForSource = at.point;
    }
  }
  if (sourceEp.kind === 'node') {
    const sn = nodeMap.get(sourceEp.nodeId);
    if (sn && !towardForTarget) towardForSource = nodeCenter(sn, w, h, boundsMap);
  }

  const tgtResolved = resolveEndpoint(targetEp, ctx, towardForTarget || childCenter);
  const srcResolved = resolveEndpoint(sourceEp, ctx, towardForSource || (tgtResolved && tgtResolved.point));
  if (!srcResolved || !tgtResolved) return null;

  const obstacles = collectRouteObstacles(nodeMap, w, h, boundsMap, nodeSlugsForEdge(edge));
  const manualWaypointsPx = resolveManualWaypointsPx(
    edge.waypoints,
    w,
    h,
    srcResolved,
    tgtResolved,
    obstacles
  );
  // 手動 waypoint 優先。無ければトランク等の自動 waypoint を経路に注入（手動扱いにはしない）
  let routeWaypointsPx = manualWaypointsPx;
  if (!manualWaypointsPx.length && options.autoWaypointsPx && options.autoWaypointsPx.length) {
    routeWaypointsPx = options.autoWaypointsPx.map(function (p) {
      return { x: snapPx(p.x), y: snapPx(p.y) };
    });
  }

  const pts = computePath(srcResolved, tgtResolved, routeWaypointsPx, null, { obstacles });
  const bidirectional = edge.kind !== 'relation' || edge.bidirectional !== false;
  const directed = edge.kind === 'relation' && !!edge.directed && !bidirectional;
  const routeOpts = {
    dashed: edge.style === 'dashed',
    directed,
    arrowBoth: bidirectional,
  };
  const { segments, hitTargets } = pathToSegments(pts, routeOpts);

  const labels = [];
  const labelText = String(edge.label || '').trim();
  if (edge.labelPoint && labelText) {
    labels.push({
      x: edge.labelPoint.x * w,
      y: edge.labelPoint.y * h,
      text: labelText,
      vertical: edge.labelPoint.vertical === true,
    });
  } else {
    const autoLb = buildAutoLabel(pts, labelText, edge.kind === 'family-child');
    if (autoLb) labels.push(autoLb);
  }

  const waypointHandles = manualWaypointsPx.map(function (pt, idx) {
    return { x: pt.x, y: pt.y, index: idx, auto: false };
  });
  const cornerHandles = extractPathCornerHandles(pts, manualWaypointsPx);

  const srcAngle = srcResolved.side != null
    ? inwardAngleForSide(srcResolved.side)
    : snapAngleDeg(Math.atan2(-srcResolved.normal.y, -srcResolved.normal.x) * 180 / Math.PI);
  const tgtAngle = tgtResolved.side != null
    ? inwardAngleForSide(tgtResolved.side)
    : snapAngleDeg(Math.atan2(-tgtResolved.normal.y, -tgtResolved.normal.x) * 180 / Math.PI);

  return {
    segments,
    hitTargets,
    labels,
    pts,
    sourceEp,
    targetEp,
    sourceResolved: srcResolved,
    targetResolved: tgtResolved,
    endpointFrom: srcResolved.point,
    endpointTo: tgtResolved.point,
    endpointFromKind: srcResolved.kind,
    endpointToKind: tgtResolved.kind,
    endpointFromAngle: srcAngle,
    endpointToAngle: tgtAngle,
    arrowFrom: arrowPolygonPoints(srcResolved.point, srcResolved.normal),
    arrowTo: arrowPolygonPoints(tgtResolved.point, tgtResolved.normal),
    waypointHandles,
    cornerHandles,
    bidirectional,
    directed,
  };
}

/**
 * ノードのカード外枠（px）。boundsMap があれば DOM 計測値を優先。
 * フォールバックは BASE_CARD_W/H の理論値（getBoundingClientRect は使わない）。
 */
export function nodePixelBounds(node, w, h, boundsMap) {
  if (boundsMap && typeof boundsMap.get === 'function') {
    const dom = boundsMap.get(node.slug);
    if (dom) return dom;
  }
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

/** stage 相対の DOM 矩形 → カード外枠 bounds */
export function boundsFromDomRect(elRect, stageRect) {
  const left = snapPx(elRect.left - stageRect.left);
  const top = snapPx(elRect.top - stageRect.top);
  const right = snapPx(elRect.right - stageRect.left);
  const bottom = snapPx(elRect.bottom - stageRect.top);
  const nw = right - left;
  const nh = bottom - top;
  return { left, right, top, bottom, nw, nh, cx: left + nw / 2, cy: top + nh / 2 };
}


export function hasManualEndpoints(edge) {
  return !!(edge && (edge.source || edge.target));
}

export function hasManualLabel(edge) {
  return !!(edge && edge.labelPoint);
}

export function hasManualLayout(edge) {
  return hasManualEndpoints(edge)
    || hasManualLabel(edge)
    || (Array.isArray(edge.waypoints) && edge.waypoints.length > 0);
}

export function shiftEdgeEndpointsForNode(edges, slug, dx, dy) {
  if (!slug || (!dx && !dy)) return;
  edges.forEach(function (edge) {
    function touches() {
      if (edge.kind === 'family-child') {
        return edge.child === slug || (edge.parents && edge.parents.indexOf(slug) >= 0);
      }
      return edge.from === slug || edge.to === slug;
    }
    if (!touches()) return;
    if (edge.waypoints) {
      edge.waypoints.forEach(function (wp) {
        if (isRelativeWaypoint(wp)) return;
        wp.x = clamp01(wp.x + dx);
        wp.y = clamp01(wp.y + dy);
      });
    }
    if (edge.labelPoint) {
      edge.labelPoint.x = clamp01(edge.labelPoint.x + dx);
      edge.labelPoint.y = clamp01(edge.labelPoint.y + dy);
    }
  });
}

export function resolveEndpointNodeSlug(edge, role) {
  if (edge.kind === 'family-child') {
    if (role === 'from') return edge.child;
    const tgt = edge.target ? ensureEndpointKind(edge.target) : null;
    if (tgt && tgt.kind === 'node') return tgt.nodeId;
    return edge.parents && edge.parents[0];
  }
  if (role === 'from') {
    const src = edge.source ? ensureEndpointKind(edge.source) : null;
    if (src && src.kind === 'node') return src.nodeId;
    return edge.from;
  }
  const tgt = edge.target ? ensureEndpointKind(edge.target) : null;
  if (tgt && tgt.kind === 'node') return tgt.nodeId;
  return edge.to;
}

/** 端点ドラッグ → 最寄りポート or 参照エッジ上の弧長 t */
export function snapEndpointNormForEdge(edge, role, norm, canvas, w, h, boundsMap, edgePaths) {
  const epRaw = role === 'from' ? edge.source : edge.target;
  const ep = epRaw ? ensureEndpointKind(epRaw) : null;
  if (ep && ep.kind === 'edge') {
    const ref = edgePaths && edgePaths.get(ep.edgeId);
    if (!ref || !ref.pts) return { x: norm.x, y: norm.y, endpoint: ep };
    const px = norm.x * w;
    const py = norm.y * h;
    const t = snapArcLengthFromPoint(ref.pts, px, py);
    // ユーザーが動かした接続点は手動確定（トランク自動配線から外す）
    const endpoint = { kind: 'edge', edgeId: ep.edgeId, t, autoT: false };
    const at = pointAtArcLength(ref.pts, t);
    if (!at) return { x: norm.x, y: norm.y, endpoint };
    return {
      x: clamp01(at.point.x / w),
      y: clamp01(at.point.y / h),
      endpoint,
    };
  }
  const slug = resolveEndpointNodeSlug(edge, role);
  const node = canvas.nodes.find(function (n) { return n.slug === slug; });
  if (!node) return { x: norm.x, y: norm.y, endpoint: ep };
  const bounds = nodePixelBounds(node, w, h, boundsMap);
  const port = nearestPortOnBounds(bounds, slug, norm.x * w, norm.y * h);
  const resolved = resolvePort(bounds, port);
  return {
    x: clamp01(resolved.point.x / w),
    y: clamp01(resolved.point.y / h),
    side: port.side,
    port,
    endpoint: { kind: 'node', nodeId: port.nodeId, side: port.side, t: port.t },
  };
}

export function applyEndpointDrag(edge, role, endpoint) {
  if (!endpoint) return;
  const ep = ensureEndpointKind(endpoint);
  if (role === 'from') edge.source = ep;
  else edge.target = ep;
  delete edge.fromPoint;
  delete edge.toPoint;
  delete edge.jointMidX;
  delete edge.jointMidY;
  delete edge.elbowPoint;
}

export function applyPortDrag(edge, role, port) {
  if (!port) return;
  applyEndpointDrag(edge, role, { kind: 'node', nodeId: port.nodeId, side: port.side, t: port.t });
}

export function clearEdgeManualLayout(edge) {
  delete edge.source;
  delete edge.target;
  delete edge.waypoints;
  delete edge.labelPoint;
  delete edge.fromPoint;
  delete edge.toPoint;
  delete edge.jointMidX;
  delete edge.jointMidY;
  delete edge.elbowPoint;
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

function shouldSkipEdgeInPlan(edge, marriageByCouple) {
  if (edge.kind === 'relation' && isCoupleLabel(edge.label)) {
    const pairKey = coupleKey(edge.from, edge.to);
    if (marriageByCouple.has(pairKey)) return true;
  }
  if (edge.kind === 'relation' && marriageByCouple.has(coupleKey(edge.from, edge.to))) return true;
  return false;
}

function referencesReach(fromId, toId, edgeById, visited) {
  if (fromId === toId) return true;
  if (visited.has(fromId)) return false;
  visited.add(fromId);
  const e = edgeById.get(fromId);
  if (!e) return false;
  const refs = referencedEdgeIds(e);
  for (let i = 0; i < refs.length; i++) {
    if (referencesReach(refs[i], toId, edgeById, visited)) return true;
  }
  return false;
}

/** 端点のおおよその座標（分散の並び順決定用） */
function approxEndpointPoint(ep, nodeMap, w, h, boundsMap, edgeById) {
  if (!ep) return null;
  ep = ensureEndpointKind(ep);
  if (ep.kind === 'node') {
    const n = nodeMap.get(ep.nodeId);
    return n ? nodeCenter(n, w, h, boundsMap) : null;
  }
  const e = edgeById.get(ep.edgeId);
  if (!e) return null;
  const a = nodeMap.get(e.from);
  const b = nodeMap.get(e.to);
  if (a && b) {
    const ca = nodeCenter(a, w, h, boundsMap);
    const cb = nodeCenter(b, w, h, boundsMap);
    return { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };
  }
  return null;
}

/**
 * A: ポート自動分散。同じ (nodeId, side) に集まる自動エンドポイントを
 * t=(i+1)/(n+1) で均等割り当て。手動エンドポイントは対象外。
 * 返り値: Map index -> { source?, target? }
 */
function buildAutoPortMap(canvas, nodeMap, w, h, boundsMap, marriageByCouple, edgeById) {
  const map = new Map();
  const groups = new Map();
  canvas.edges.forEach(function (edge, index) {
    if (shouldSkipEdgeInPlan(edge, marriageByCouple)) return;
    const defaults = defaultPortsForEdge(edge, nodeMap, w, h, boundsMap, canvas.edges);
    if (!defaults) return;
    ['source', 'target'].forEach(function (role) {
      if (edge[role]) return; // 手動指定は分散しない
      const def = defaults[role];
      if (!def || def.kind !== 'node') return;
      const key = def.nodeId + '|' + def.side;
      const otherRole = role === 'source' ? 'target' : 'source';
      const otherEp = edge[otherRole] || defaults[otherRole];
      const ref = approxEndpointPoint(otherEp, nodeMap, w, h, boundsMap, edgeById);
      const along = (def.side === 'left' || def.side === 'right')
        ? (ref ? ref.y : 0)
        : (ref ? ref.x : 0);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ index, role, along, side: def.side, nodeId: def.nodeId });
    });
  });
  groups.forEach(function (list) {
    list.sort(function (a, b) { return a.along - b.along; });
    const n = list.length;
    list.forEach(function (item, i) {
      const t = n === 1 ? 0.5 : (i + 1) / (n + 1);
      if (!map.has(item.index)) map.set(item.index, {});
      map.get(item.index)[item.role] = {
        kind: 'node',
        nodeId: item.nodeId,
        side: item.side,
        t: Math.max(0.08, Math.min(0.92, t)),
      };
    });
  });
  return map;
}

export const TRUNK_BUS_OFFSET = 40;

/**
 * B: 兄弟トランク配線。同じ夫婦線に付く自動接続の子を marriageId でグルーピングし、
 * 2人以上なら共有トランクX を算出。t/waypoint は経路計算時（参照先パス確定後）に決める。
 */
function buildSiblingTrunkGroups(canvas, nodeMap, w, h, boundsMap) {
  const groups = new Map();
  canvas.edges.forEach(function (edge, index) {
    if (edge.kind !== 'family-child') return;
    const tgt = edge.target ? ensureEndpointKind(edge.target) : null;
    if (!tgt || tgt.kind !== 'edge' || tgt.autoT === false) return;
    if (edge.waypoints && edge.waypoints.length) return;
    const child = nodeMap.get(edge.child);
    if (!child) return;
    if (!groups.has(tgt.edgeId)) groups.set(tgt.edgeId, { marriageId: tgt.edgeId, childIndices: [], xs: [] });
    const g = groups.get(tgt.edgeId);
    g.childIndices.push(index);
    g.xs.push(nodeCenter(child, w, h, boundsMap).x);
  });
  const byChildIndex = new Map();
  groups.forEach(function (g) {
    if (g.childIndices.length < 2) return; // 子1人はトランク化しない
    g.trunkX = g.xs.reduce(function (a, b) { return a + b; }, 0) / g.xs.length;
    g.childIndices.forEach(function (idx) { byChildIndex.set(idx, g); });
  });
  return byChildIndex;
}

/** 兄弟トランク: 参照先パス確定後に子1本ぶんの target(t) と経路 waypoint を算出 */
function trunkOverrideForChild(edge, group, edgePaths, nodeMap, w, h, boundsMap) {
  const ref = edgePaths.get(group.marriageId);
  if (!ref || !ref.pts) return null;
  const mid = pointAtArcLength(ref.pts, 0.5);
  if (!mid) return null;
  const midY = mid.point.y;
  const child = nodeMap.get(edge.child);
  if (!child) return null;
  const childCenter = nodeCenter(child, w, h, boundsMap);
  const childBelow = childCenter.y > midY;
  const busY = snapPx(midY + (childBelow ? TRUNK_BUS_OFFSET : -TRUNK_BUS_OFFSET));
  const trunkX = snapPx(group.trunkX);
  const t = snapArcLengthFromPoint(ref.pts, trunkX, midY);
  return {
    target: { kind: 'edge', edgeId: group.marriageId, t: t },
    autoWaypointsPx: [
      { x: snapPx(childCenter.x), y: busY },
      { x: trunkX, y: busY },
    ],
  };
}

function makeEdgePlanItem(index, edge, geom, nameFn) {
  return {
    index,
    zIndex: edge.zIndex || 0,
    kind: edge.kind,
    segments: geom.segments,
    labels: geom.labels,
    pts: geom.pts,
    hitSegments: geom.segments.slice(),
    hitTargets: geom.hitTargets.map(function (hit) {
      return {
        edgeIndex: index,
        x1: hit.x1,
        y1: hit.y1,
        x2: hit.x2,
        y2: hit.y2,
      };
    }),
    title: edgeTitle(edge, nameFn),
    selected: false,
    endpointFrom: geom.endpointFrom,
    endpointTo: geom.endpointTo,
    endpointFromKind: geom.endpointFromKind,
    endpointToKind: geom.endpointToKind,
    endpointFromAngle: geom.endpointFromAngle,
    endpointToAngle: geom.endpointToAngle,
    arrowFrom: geom.arrowFrom,
    arrowTo: geom.arrowTo,
    waypointHandles: geom.waypointHandles,
    cornerHandles: geom.cornerHandles,
    bidirectional: geom.bidirectional,
    directed: geom.directed,
    draggableEndpoints: true,
  };
}

/**
 * 描画プリミティブを生成（2パス: node-node → edge参照）
 */
export function buildRenderPlan(canvas, w, h, personName, options) {
  options = options || {};
  const boundsMap = options.boundsMap || null;
  const nodeMap = new Map(canvas.nodes.map(function (n) { return [n.slug, n]; }));
  const nameFn = personName || function (s) { return s; };

  const marriageByCouple = new Map();
  canvas.edges.forEach(function (e, index) {
    if (e.kind === 'marriage') marriageByCouple.set(coupleKey(e.from, e.to), index);
  });

  const edgePaths = new Map();
  const edgeById = new Map();
  canvas.edges.forEach(function (e) {
    if (e.id) edgeById.set(e.id, e);
  });

  // A: ポート自動分散 / B: 兄弟トランク（グループのみ先に確定）
  const autoPortMap = buildAutoPortMap(canvas, nodeMap, w, h, boundsMap, marriageByCouple, edgeById);
  const trunkByChildIndex = buildSiblingTrunkGroups(canvas, nodeMap, w, h, boundsMap);

  function autoPortsForIndex(index) {
    return autoPortMap.get(index) || null;
  }

  const edgeItems = [];
  const itemByIndex = new Map();

  function storeGeom(index, edge, geom) {
    if (geom && edge.id) edgePaths.set(edge.id, { pts: geom.pts, index, geom });
    if (geom) {
      const item = makeEdgePlanItem(index, edge, geom, nameFn);
      itemByIndex.set(index, item);
    }
  }

  // パス1: source/target とも kind:'node'
  canvas.edges.forEach(function (edge, index) {
    if (shouldSkipEdgeInPlan(edge, marriageByCouple)) return;
    if (edgeUsesEdgeEndpoint(edge)) return;
    const geom = computeEdgeGeometry(edge, nodeMap, w, h, {
      boundsMap,
      edgePaths,
      canvas: canvas.edges,
      autoPorts: autoPortsForIndex(index),
    });
    storeGeom(index, edge, geom);
  });

  // パス2: kind:'edge' を含むエッジ（参照先が揃うまで反復）
  const pass2Indices = [];
  canvas.edges.forEach(function (edge, index) {
    if (shouldSkipEdgeInPlan(edge, marriageByCouple)) return;
    if (!edgeUsesEdgeEndpoint(edge)) return;
    pass2Indices.push(index);
  });

  let progress = true;
  let guard = pass2Indices.length + 2;
  while (progress && guard-- > 0) {
    progress = false;
    pass2Indices.forEach(function (index) {
      if (itemByIndex.has(index)) return;
      const edge = canvas.edges[index];
      const refs = referencedEdgeIds(edge);
      for (let i = 0; i < refs.length; i++) {
        if (!edgePaths.has(refs[i])) return;
        if (referencesReach(refs[i], edge.id, edgeById, new Set())) {
          console.warn('[chart-layout] 循環参照を検出、エッジをスキップ:', edge.id, '→', refs[i]);
          itemByIndex.set(index, null);
          return;
        }
      }
      let autoPorts = autoPortsForIndex(index);
      let autoWaypointsPx = null;
      const trunkGroup = trunkByChildIndex.get(index);
      if (trunkGroup) {
        const override = trunkOverrideForChild(edge, trunkGroup, edgePaths, nodeMap, w, h, boundsMap);
        if (override) {
          autoPorts = Object.assign({}, autoPorts, { target: override.target });
          autoWaypointsPx = override.autoWaypointsPx;
        }
      }
      const geom = computeEdgeGeometry(edge, nodeMap, w, h, {
        boundsMap,
        edgePaths,
        canvas: canvas.edges,
        autoPorts: autoPorts,
        autoWaypointsPx: autoWaypointsPx,
      });
      if (!geom) {
        console.warn('[chart-layout] 参照先未計算、エッジをスキップ:', edge.id);
        return;
      }
      storeGeom(index, edge, geom);
      progress = true;
    });
  }

  canvas.edges.forEach(function (edge, index) {
    if (shouldSkipEdgeInPlan(edge, marriageByCouple)) return;
    const item = itemByIndex.get(index);
    if (item) edgeItems.push(item);
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

  return { zones, edges: edgeItems, edgePaths };
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
