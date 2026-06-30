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

function normalizePort(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const nodeId = String(raw.nodeId || raw.slug || '').trim();
  const side = normalizeSide(raw.side);
  const t = Number(raw.t);
  if (!nodeId || !side || !Number.isFinite(t)) return null;
  return { nodeId, side, t: Math.max(0.08, Math.min(0.92, t)) };
}

function normalizeWaypoint(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp01(x), y: clamp01(y) };
}

function attachPortLayoutFields(edge, raw) {
  const source = normalizePort(raw?.source);
  const target = normalizePort(raw?.target);
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
    edge.source = { nodeId: fromSlug, side, t };
  }
  if (tp && !edge.target) {
    const side = normalizeSide(tp.side) || guessSideFromNormPoint(tp) || 'left';
    const t = (side === 'top' || side === 'bottom') ? clamp01(Number(tp.x)) : clamp01(Number(tp.y));
    edge.target = { nodeId: toSlug, side, t };
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

export const EDGE_MARKER_INSET = 14;
export const ARROW_TIP_LEN = 10;
export const ARROW_STUB_LEN = 20;
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
  const upperSide = upperB.cx <= lowerB.cx ? 'bottom' : 'bottom';
  const upperT = 0.5;
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

export function defaultPortsForEdge(edge, nodeMap, w, h) {
  if (edge.kind === 'marriage' || (edge.kind === 'relation' && isCoupleLabel(edge.label))) {
    const p1 = nodeMap.get(edge.from);
    const p2 = nodeMap.get(edge.to);
    if (!p1 || !p2) return null;
    const b1 = nodePixelBounds(p1, w, h);
    const b2 = nodePixelBounds(p2, w, h);
    const leftSlug = b1.cx <= b2.cx ? edge.from : edge.to;
    const rightSlug = b1.cx <= b2.cx ? edge.to : edge.from;
    return {
      source: { nodeId: leftSlug, side: 'right', t: 0.5 },
      target: { nodeId: rightSlug, side: 'left', t: 0.5 },
    };
  }
  if (edge.kind === 'family-child') {
    const child = nodeMap.get(edge.child);
    const parent = nodeMap.get(edge.parents[0]);
    if (!child || !parent) return null;
    const cb = nodePixelBounds(child, w, h);
    const pb = nodePixelBounds(parent, w, h);
    const p2 = nodeMap.get(edge.parents[1]);
    const childBelow = cb.cy > pb.cy;
    let targetPort = {
      nodeId: edge.parents[0],
      side: childBelow ? 'bottom' : 'top',
      t: 0.5,
    };
    if (p2 && p2.slug !== parent.slug) {
      const g = computeCoupleGeometry(parent, p2, w, h);
      const tOnBar = (g.midX - pb.left) / pb.nw;
      targetPort = {
        nodeId: edge.parents[0],
        side: childBelow ? 'bottom' : 'top',
        t: Math.max(0.08, Math.min(0.92, tOnBar)),
      };
    }
    return {
      source: { nodeId: edge.child, side: childBelow ? 'top' : 'bottom', t: 0.5 },
      target: targetPort,
    };
  }
  const fromNode = nodeMap.get(edge.from);
  const toNode = nodeMap.get(edge.to);
  if (!fromNode || !toNode) return null;
  return defaultPortsBetweenBounds(
    nodePixelBounds(fromNode, w, h),
    nodePixelBounds(toNode, w, h),
    edge.from,
    edge.to
  );
}

function autoWaypointsBetweenStubs(srcStub, tgtStub, srcNormal, tgtNormal) {
  const dx = tgtStub.x - srcStub.x;
  const dy = tgtStub.y - srcStub.y;
  if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return [];

  const exitH = Math.abs(srcNormal.x) > Math.abs(srcNormal.y);
  const enterH = Math.abs(tgtNormal.x) > Math.abs(tgtNormal.y);

  if (exitH && enterH) {
    if (Math.abs(srcStub.y - tgtStub.y) < 4) return [];
    const midX = snapPx((srcStub.x + tgtStub.x) / 2);
    return [{ x: midX, y: srcStub.y }, { x: midX, y: tgtStub.y }];
  }
  if (!exitH && !enterH) {
    if (Math.abs(srcStub.x - tgtStub.x) < 4) return [];
    const midY = snapPx((srcStub.y + tgtStub.y) / 2);
    return [{ x: srcStub.x, y: midY }, { x: tgtStub.x, y: midY }];
  }
  if (exitH) return [{ x: tgtStub.x, y: srcStub.y }];
  return [{ x: srcStub.x, y: tgtStub.y }];
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

/** 隣接点間を水平/垂直のみに直交化 */
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
  return dedupePoints(out);
}

/**
 * 単一ルータ: ポート2点 + waypoints → 直交パス
 * waypoints 空なら stub 間を自動ルート
 */
export function computePath(srcResolved, tgtResolved, waypointsPx, stubLen) {
  stubLen = stubLen == null ? ARROW_STUB_LEN : stubLen;
  const srcStub = vecAdd(srcResolved.point, vecScale(srcResolved.normal, stubLen));
  const tgtStub = vecAdd(tgtResolved.point, vecScale(tgtResolved.normal, stubLen));

  let midPts = (waypointsPx || []).map(function (wp) {
    return { x: snapPx(wp.x), y: snapPx(wp.y) };
  });
  if (!midPts.length) {
    midPts = autoWaypointsBetweenStubs(srcStub, tgtStub, srcResolved.normal, tgtResolved.normal);
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

export function arrowPolygonPoints(tip, normal, tipLen, halfWidth) {
  tipLen = tipLen == null ? ARROW_TIP_LEN : tipLen;
  halfWidth = halfWidth == null ? ARROW_HEAD_WIDTH : halfWidth;
  const back = vecAdd(tip, vecScale(normal, -tipLen));
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

/** エッジ1本のジオメトリ（単一入口） */
export function computeEdgeGeometry(edge, nodeMap, w, h, options) {
  options = options || {};
  const defaults = defaultPortsForEdge(edge, nodeMap, w, h);
  if (!defaults) return null;

  const sourcePort = edge.source || defaults.source;
  const targetPort = edge.target || defaults.target;
  const srcNode = nodeMap.get(sourcePort.nodeId);
  const tgtNode = nodeMap.get(targetPort.nodeId);
  if (!srcNode || !tgtNode) return null;

  const srcBounds = nodePixelBounds(srcNode, w, h);
  const tgtBounds = nodePixelBounds(tgtNode, w, h);
  const srcResolved = resolvePort(srcBounds, sourcePort);
  const tgtResolved = resolvePort(tgtBounds, targetPort);

  const waypointsPx = (edge.waypoints || []).map(function (wp) {
    return { x: wp.x * w, y: wp.y * h };
  });

  const pts = computePath(srcResolved, tgtResolved, waypointsPx);
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

  const waypointHandles = (edge.waypoints || []).map(function (wp, idx) {
    return { x: wp.x * w, y: wp.y * h, index: idx };
  });
  if (!waypointHandles.length && pts.length > 4) {
    for (let i = 2; i < pts.length - 2; i++) {
      waypointHandles.push({ x: pts[i].x, y: pts[i].y, index: -1, auto: true });
    }
  }

  return {
    segments,
    hitTargets,
    labels,
    pts,
    sourcePort,
    targetPort,
    sourceResolved: srcResolved,
    targetResolved: tgtResolved,
    endpointFrom: srcResolved.point,
    endpointTo: tgtResolved.point,
    endpointFromAngle: inwardAngleForSide(srcResolved.side),
    endpointToAngle: inwardAngleForSide(tgtResolved.side),
    arrowFrom: arrowPolygonPoints(srcResolved.point, srcResolved.normal),
    arrowTo: arrowPolygonPoints(tgtResolved.point, tgtResolved.normal),
    waypointHandles,
    bidirectional,
    directed,
  };
}

/** カード外周に垂直スナップ（0/90/180/270° のみ） */
export function snapPointToRectBorder(bounds, px, py, inset) {
  inset = inset == null ? EDGE_MARKER_INSET : inset;
  const clamp = function (lo, hi, v) { return Math.max(lo, Math.min(hi, v)); };
  const dTop = Math.abs(py - bounds.top);
  const dBottom = Math.abs(py - bounds.bottom);
  const dLeft = Math.abs(px - bounds.left);
  const dRight = Math.abs(px - bounds.right);
  const minD = Math.min(dTop, dBottom, dLeft, dRight);
  let side;
  let x;
  let y;
  if (minD === dTop) {
    side = 'top';
    x = snapPx(clamp(bounds.left + 6, bounds.right - 6, px));
    y = snapPx(bounds.top - inset);
  } else if (minD === dBottom) {
    side = 'bottom';
    x = snapPx(clamp(bounds.left + 6, bounds.right - 6, px));
    y = snapPx(bounds.bottom + inset);
  } else if (minD === dLeft) {
    side = 'left';
    x = snapPx(bounds.left - inset);
    y = snapPx(clamp(bounds.top + 6, bounds.bottom - 6, py));
  } else {
    side = 'right';
    x = snapPx(bounds.right + inset);
    y = snapPx(clamp(bounds.top + 6, bounds.bottom - 6, py));
  }
  return { x, y, side, angle: inwardAngleForSide(side) };
}

export function shortenSegment(x1, y1, x2, y2, trimStart, trimEnd) {
  let sx1 = x1;
  let sy1 = y1;
  let sx2 = x2;
  let sy2 = y2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  if (trimStart > 0) {
    sx1 += ux * trimStart;
    sy1 += uy * trimStart;
  }
  if (trimEnd > 0) {
    sx2 -= ux * trimEnd;
    sy2 -= uy * trimEnd;
  }
  return { x1: snapPx(sx1), y1: snapPx(sy1), x2: snapPx(sx2), y2: snapPx(sy2) };
}

export function cornersFromSegments(segments) {
  const corners = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i];
    const b = segments[i + 1];
    corners.push({ x: snapPx(a.x2), y: snapPx(a.y2), index: i });
  }
  return corners;
}

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
    x: snapPx(bounds.cx + dx * scale + (dx >= 0 ? inset : -inset)),
    y: snapPx(bounds.cy + dy * scale + (dy >= 0 ? inset : -inset)),
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
    x1 = snapPx(x1);
    y1 = snapPx(y1);
    x2 = snapPx(x2);
    y2 = snapPx(y2);
    segments.push({
      x1, y1, x2, y2,
      dashed: flags.dashed != null ? flags.dashed : dashed,
      arrowStart: !!flags.arrowStart,
      arrowEnd: !!flags.arrowEnd,
    });
    hitTargets.push({ x1, y1, x2, y2 });
  }

  function finish(label) {
    const first = segments[0];
    const last = segments[segments.length - 1];
    return {
      segments,
      hitTargets,
      label: label || null,
      endpointFromAngle: segmentEndpointMeta(first, true).angle,
      endpointToAngle: segmentEndpointMeta(last, false).angle,
      elbowCorners: cornersFromSegments(segments),
    };
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
  return orthogonalRouteBetweenBorderAnchors(
    pFrom, opts.fromSide || 'right',
    pTo, opts.toSide || 'left',
    opts
  );
}

/** 夫婦線：左カード右辺 → 右カード左辺（高さ差があっても H-V-H） */
function coupleRouteBetweenBounds(bFrom, bTo, opts) {
  opts = opts || {};
  const inset = EDGE_MARKER_INSET;
  const leftB = bFrom.cx <= bTo.cx ? bFrom : bTo;
  const rightB = bFrom.cx <= bTo.cx ? bTo : bFrom;
  const pFrom = { x: snapPx(leftB.right + inset), y: snapPx(leftB.cy) };
  const pTo = { x: snapPx(rightB.left - inset), y: snapPx(rightB.cy) };
  const jointMidX = opts.jointMidX != null ? snapPx(opts.jointMidX) : null;
  return orthogonalRouteBetweenBorderAnchors(
    pFrom, 'right', pTo, 'left',
    Object.assign({}, opts, { jointMidX: jointMidX })
  );
}

/**
 * カード外周2点を直角のみで結ぶ。
 * 関節は jointMidX（横結び）または jointMidY（縦結び）で調整。
 */
function orthogonalRouteBetweenBorderAnchors(pFrom, fromSide, pTo, toSide, opts) {
  opts = opts || {};
  const dashed = !!opts.dashed;
  const bidirectional = opts.arrowBoth !== false && !opts.directed;
  const oneWay = !!opts.directed && !bidirectional;
  const text = String(opts.labelText || '').trim();
  const charH = 13;
  const preferVerticalLabel = !!opts.preferVerticalLabel;
  const segments = [];
  const hitTargets = [];

  pFrom = snapOrthogonalPoint(pFrom);
  pTo = snapOrthogonalPoint(pTo);

  function addSeg(x1, y1, x2, y2, flags) {
    x1 = snapPx(x1);
    y1 = snapPx(y1);
    x2 = snapPx(x2);
    y2 = snapPx(y2);
    if (x1 === x2 && y1 === y2) return;
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
    const horizSeg = segments.find(function (s) { return s.y1 === s.y2 && Math.abs(s.x2 - s.x1) > 8; });
    if (horizSeg) {
      return { x: (horizSeg.x1 + horizSeg.x2) / 2, y: horizSeg.y1 - 10, text, vertical: false };
    }
    const vertSeg = segments.find(function (s) { return s.x1 === s.x2 && Math.abs(s.y2 - s.y1) > 8; });
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
    return null;
  }

  const horizPair = (fromSide === 'right' && toSide === 'left')
    || (fromSide === 'left' && toSide === 'right');
  const vertPair = (fromSide === 'bottom' && toSide === 'top')
    || (fromSide === 'top' && toSide === 'bottom');

  if (horizPair) {
    const lo = Math.min(pFrom.x, pTo.x);
    const hi = Math.max(pFrom.x, pTo.x);
    const rawMid = opts.jointMidX != null
      ? snapPx(opts.jointMidX)
      : snapPx((pFrom.x + pTo.x) / 2);
    const midX = snapPx(Math.max(lo, Math.min(hi, rawMid)));
    if (Math.abs(pFrom.y - pTo.y) < 6) {
      addSeg(pFrom.x, pFrom.y, pTo.x, pTo.y, {
        arrowStart: bidirectional,
        arrowEnd: bidirectional || oneWay,
      });
    } else {
      addSeg(pFrom.x, pFrom.y, midX, pFrom.y, {
        arrowStart: bidirectional, arrowEnd: false,
      });
      addSeg(midX, pFrom.y, midX, pTo.y, {
        arrowStart: false, arrowEnd: false,
      });
      addSeg(midX, pTo.y, pTo.x, pTo.y, {
        arrowStart: false, arrowEnd: bidirectional || oneWay,
      });
    }
  } else if (vertPair) {
    const lo = Math.min(pFrom.y, pTo.y);
    const hi = Math.max(pFrom.y, pTo.y);
    const rawMid = opts.jointMidY != null
      ? snapPx(opts.jointMidY)
      : snapPx((pFrom.y + pTo.y) / 2);
    const midY = snapPx(Math.max(lo, Math.min(hi, rawMid)));
    if (Math.abs(pFrom.x - pTo.x) < 6) {
      addSeg(pFrom.x, pFrom.y, pTo.x, pTo.y, {
        arrowStart: bidirectional,
        arrowEnd: bidirectional || oneWay,
      });
    } else {
      addSeg(pFrom.x, pFrom.y, pFrom.x, midY, {
        arrowStart: bidirectional, arrowEnd: false,
      });
      addSeg(pFrom.x, midY, pTo.x, midY, {
        arrowStart: false, arrowEnd: false,
      });
      addSeg(pTo.x, midY, pTo.x, pTo.y, {
        arrowStart: false, arrowEnd: bidirectional || oneWay,
      });
    }
  } else {
    const loX = Math.min(pFrom.x, pTo.x);
    const hiX = Math.max(pFrom.x, pTo.x);
    const rawMidX = opts.jointMidX != null
      ? snapPx(opts.jointMidX)
      : snapPx((pFrom.x + pTo.x) / 2);
    const midX = snapPx(Math.max(loX, Math.min(hiX, rawMidX)));
    if (fromSide === 'right' || fromSide === 'left') {
      addSeg(pFrom.x, pFrom.y, midX, pFrom.y, { arrowStart: bidirectional, arrowEnd: false });
      addSeg(midX, pFrom.y, midX, pTo.y, { arrowStart: false, arrowEnd: false });
      addSeg(midX, pTo.y, pTo.x, pTo.y, { arrowStart: false, arrowEnd: bidirectional || oneWay });
    } else {
      const midY = opts.jointMidY != null
        ? snapPx(opts.jointMidY)
        : snapPx((pFrom.y + pTo.y) / 2);
      addSeg(pFrom.x, pFrom.y, pFrom.x, midY, { arrowStart: bidirectional, arrowEnd: false });
      addSeg(pFrom.x, midY, pTo.x, midY, { arrowStart: false, arrowEnd: false });
      addSeg(pTo.x, midY, pTo.x, pTo.y, { arrowStart: false, arrowEnd: bidirectional || oneWay });
    }
  }

  return {
    segments,
    hitTargets,
    label: buildLabel(),
    endpointFrom: { x: pFrom.x, y: pFrom.y },
    endpointTo: { x: pTo.x, y: pTo.y },
    endpointFromAngle: inwardAngleForSide(fromSide),
    endpointToAngle: inwardAngleForSide(toSide),
    fromSide,
    toSide,
    routeAxis: horizPair || (!vertPair && (fromSide === 'right' || fromSide === 'left')) ? 'x' : 'y',
    elbowCorners: cornersFromSegments(segments),
    manual: !!opts.manual,
  };
}

function segmentEndpointMeta(seg, atStart) {
  if (!seg) return { angle: 0 };
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const a = dx >= 0 ? 0 : 180;
    return { angle: atStart ? (a === 0 ? 180 : 0) : a };
  }
  const a = dy >= 0 ? 90 : 270;
  return { angle: atStart ? (a === 90 ? 270 : 90) : a };
}

function pointOnBorderSide(bounds, side, px, py, inset) {
  inset = inset == null ? EDGE_MARKER_INSET : inset;
  const clamp = function (lo, hi, v) { return Math.max(lo, Math.min(hi, v)); };
  if (side === 'top') {
    return { x: snapPx(clamp(bounds.left + 6, bounds.right - 6, px)), y: snapPx(bounds.top - inset), side: 'top', angle: inwardAngleForSide('top') };
  }
  if (side === 'bottom') {
    return { x: snapPx(clamp(bounds.left + 6, bounds.right - 6, px)), y: snapPx(bounds.bottom + inset), side: 'bottom', angle: inwardAngleForSide('bottom') };
  }
  if (side === 'left') {
    return { x: snapPx(bounds.left - inset), y: snapPx(clamp(bounds.top + 6, bounds.bottom - 6, py)), side: 'left', angle: inwardAngleForSide('left') };
  }
  return { x: snapPx(bounds.right + inset), y: snapPx(clamp(bounds.top + 6, bounds.bottom - 6, py)), side: 'right', angle: inwardAngleForSide('right') };
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
    return role === 'from' ? edge.child : (edge.parents && edge.parents[0]);
  }
  if (role === 'from') {
    return (edge.source && edge.source.nodeId) || edge.from;
  }
  return (edge.target && edge.target.nodeId) || edge.to;
}

/** 端点ドラッグ → 最寄りポートへ写像 */
export function snapEndpointNormForEdge(edge, role, norm, canvas, w, h) {
  const slug = resolveEndpointNodeSlug(edge, role);
  const node = canvas.nodes.find(function (n) { return n.slug === slug; });
  if (!node) return norm;
  const bounds = nodePixelBounds(node, w, h);
  const port = nearestPortOnBounds(bounds, slug, norm.x * w, norm.y * h);
  const resolved = resolvePort(bounds, port);
  return {
    x: clamp01(resolved.point.x / w),
    y: clamp01(resolved.point.y / h),
    side: port.side,
    port,
  };
}

export function applyPortDrag(edge, role, port) {
  if (!port) return;
  if (role === 'from') edge.source = { nodeId: port.nodeId, side: port.side, t: port.t };
  else edge.target = { nodeId: port.nodeId, side: port.side, t: port.t };
  delete edge.fromPoint;
  delete edge.toPoint;
  delete edge.jointMidX;
  delete edge.jointMidY;
  delete edge.elbowPoint;
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

/**
 * 描画プリミティブを生成（単一ルータ経由）
 */
export function buildRenderPlan(canvas, w, h, personName) {
  const nodeMap = new Map(canvas.nodes.map(function (n) { return [n.slug, n]; }));
  const nameFn = personName || function (s) { return s; };

  const marriageByCouple = new Map();
  canvas.edges.forEach(function (e, index) {
    if (e.kind === 'marriage') marriageByCouple.set(coupleKey(e.from, e.to), index);
  });

  const edgeItems = [];

  canvas.edges.forEach(function (edge, index) {
    if (edge.kind === 'relation' && isCoupleLabel(edge.label)) {
      const pairKey = coupleKey(edge.from, edge.to);
      if (marriageByCouple.has(pairKey)) return;
    }
    if (edge.kind === 'relation' && marriageByCouple.has(coupleKey(edge.from, edge.to))) return;

    const geom = computeEdgeGeometry(edge, nodeMap, w, h);
    if (!geom) return;

    const item = {
      index,
      zIndex: edge.zIndex || 0,
      kind: edge.kind,
      segments: geom.segments,
      labels: geom.labels,
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
      endpointFromAngle: geom.endpointFromAngle,
      endpointToAngle: geom.endpointToAngle,
      arrowFrom: geom.arrowFrom,
      arrowTo: geom.arrowTo,
      waypointHandles: geom.waypointHandles,
      bidirectional: geom.bidirectional,
      directed: geom.directed,
      draggableEndpoints: true,
    };
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
