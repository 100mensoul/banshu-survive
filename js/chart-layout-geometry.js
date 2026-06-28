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
    return {
      kind,
      parents,
      child,
      from: parents[0],
      to: child,
      label: String(raw.label || ''),
      style: raw.style === 'dashed' ? 'dashed' : 'solid',
      directed: raw.directed !== false,
      lane: Number(raw.lane) || 0,
      zIndex: Number(raw.zIndex) || 0,
    };
  }
  const from = String(raw?.from || '');
  const to = String(raw?.to || '');
  if (!from || !to) return null;
  return {
    kind,
    from,
    to,
    label: String(raw.label || ''),
    style: raw.style === 'dashed' ? 'dashed' : 'solid',
    directed: !!raw.directed,
    lane: Number(raw.lane) || 0,
    zIndex: Number(raw.zIndex) || 0,
    parents: null,
    child: null,
  };
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
  const barY = Math.max(b1.bottom, b2.bottom) + 14;
  const xLeft = Math.min(b1.cx, b2.cx);
  const xRight = Math.max(b1.cx, b2.cx);
  return {
    barY,
    xLeft,
    xRight,
    midX: (b1.cx + b2.cx) / 2,
    midY: barY,
    p1Drop: { x: b1.cx, y: b1.bottom },
    p2Drop: { x: b2.cx, y: b2.bottom },
  };
}

/** 夫婦線の横棒セグメント（既存 marriage エッジと同形） */
export function marriageBarSegments(g) {
  return [
    { x1: g.p1Drop.x, y1: g.p1Drop.y, x2: g.p1Drop.x, y2: g.barY, dashed: false },
    { x1: g.p2Drop.x, y1: g.p2Drop.y, x2: g.p2Drop.x, y2: g.barY, dashed: false },
    { x1: g.xLeft, y1: g.barY, x2: g.xRight, y2: g.barY, dashed: false },
  ];
}

/** 親子線：夫婦の横棒から各子どもへ独立に接続（共有の幹・枝分かれなし） */
function childSegmentsFromMarriageBar(g, childEntries, singleParentBounds) {
  const segments = [];
  const labels = [];
  const hitTargets = [];

  childEntries.forEach(function (c) {
    const barY = g ? g.barY : singleParentBounds.bottom + 14;
    const dropX = g
      ? Math.max(g.xLeft, Math.min(g.xRight, c.cx))
      : singleParentBounds.cx;
    const top = c.top - 4;

    if (Math.abs(dropX - c.cx) < 3) {
      segments.push({
        x1: dropX,
        y1: barY,
        x2: c.cx,
        y2: top,
        dashed: c.edge.style === 'dashed',
        arrow: true,
      });
      hitTargets.push({ edgeIndex: c.index, x1: dropX, y1: barY, x2: c.cx, y2: top });
      if (c.label) {
        labels.push({ x: c.cx, y: (barY + top) / 2 - 6, text: c.label });
      }
    } else {
      const elbowY = barY + Math.min(28, Math.max(12, (top - barY) * 0.35));
      segments.push(
        { x1: dropX, y1: barY, x2: dropX, y2: elbowY, dashed: false },
        { x1: dropX, y1: elbowY, x2: c.cx, y2: elbowY, dashed: false },
        {
          x1: c.cx,
          y1: elbowY,
          x2: c.cx,
          y2: top,
          dashed: c.edge.style === 'dashed',
          arrow: true,
        },
      );
      hitTargets.push({ edgeIndex: c.index, x1: c.cx, y1: elbowY, x2: c.cx, y2: top });
      if (c.label) {
        labels.push({ x: c.cx, y: elbowY + 12, text: c.label });
      }
    }
  });

  return { segments, labels, hitTargets };
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

function edgeTitle(edge, personName) {
  if (edge.kind === 'family-child') {
    return personName(edge.parents[0]) + '・' + personName(edge.parents[1]) + ' → ' + personName(edge.child);
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

  const familyGroups = new Map();
  canvas.edges.forEach(function (e, index) {
    if (e.kind !== 'family-child') return;
    const key = coupleKey(e.parents[0], e.parents[1] || e.parents[0]);
    if (!familyGroups.has(key)) familyGroups.set(key, []);
    familyGroups.get(key).push({ edge: e, index });
  });

  const marriageByCouple = new Map();
  canvas.edges.forEach(function (e, index) {
    if (e.kind !== 'marriage') return;
    marriageByCouple.set(coupleKey(e.from, e.to), index);
  });

  const renderedFamilyKeys = new Set();
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
      const g = computeCoupleGeometry(p1, p2, w, h);
      marriageBarSegments(g).forEach(function (seg) {
        item.segments.push(seg);
      });
      item.hitSegments = item.segments.slice();
      if (edge.label) {
        item.labels.push({ x: g.midX, y: g.barY - 8, text: edge.label });
      }
      edgeItems.push(item);
      return;
    }

    if (edge.kind === 'family-child') {
      const key = coupleKey(edge.parents[0], edge.parents[1] || edge.parents[0]);
      if (renderedFamilyKeys.has(key)) return;
      renderedFamilyKeys.add(key);
      const group = familyGroups.get(key) || [];
      const p1 = nodeMap.get(edge.parents[0]);
      const p2 = nodeMap.get(edge.parents[1]) || p1;
      if (!p1) return;

      const hasMarriageEdge = marriageByCouple.has(key);
      const twoParents = p2 && p1.slug !== p2.slug;
      const g = twoParents ? computeCoupleGeometry(p1, p2, w, h) : null;
      const singleBounds = nodePixelBounds(p1, w, h);

      // 夫婦線が別にある場合は横棒を描き直さない（親子はその横棒から出す）
      if (!hasMarriageEdge && g) {
        marriageBarSegments(g).forEach(function (seg) {
          item.segments.push(seg);
        });
      } else if (!hasMarriageEdge && !g) {
        item.segments.push({
          x1: singleBounds.cx,
          y1: singleBounds.bottom,
          x2: singleBounds.cx,
          y2: singleBounds.bottom + 14,
          dashed: false,
        });
      }

      const childEntries = group
        .map(function (entry) {
          const childNode = nodeMap.get(entry.edge.child);
          if (!childNode) return null;
          const cb = nodePixelBounds(childNode, w, h);
          return {
            edge: entry.edge,
            index: entry.index,
            cx: cb.cx,
            top: cb.top,
            label: entry.edge.label,
          };
        })
        .filter(Boolean)
        .sort(function (a, b) { return a.cx - b.cx; });

      const childDraw = childSegmentsFromMarriageBar(g, childEntries, singleBounds);
      childDraw.segments.forEach(function (seg) { item.segments.push(seg); });
      childDraw.labels.forEach(function (lb) { item.labels.push(lb); });
      item.hitTargets = childDraw.hitTargets;
      item.hitSegments = item.segments.slice();
      item.familyIndices = group.map(function (x) { return x.index; });
      edgeItems.push(item);
      return;
    }

    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    if (!fromNode || !toNode) return;
    const b1 = nodePixelBounds(fromNode, w, h);
    const b2 = nodePixelBounds(toNode, w, h);
    let x1 = b1.cx;
    let y1 = b1.cy;
    let x2 = b2.cx;
    let y2 = b2.cy;
    const seg = offsetSegment(x1, y1, x2, y2, edge.lane, 16);
    item.segments.push({
      x1: seg.x1,
      y1: seg.y1,
      x2: seg.x2,
      y2: seg.y2,
      dashed: edge.style === 'dashed',
      arrow: edge.directed,
    });
    item.hitSegments.push(item.segments[0]);
    if (edge.label) {
      item.labels.push({
        x: (seg.x1 + seg.x2) / 2,
        y: (seg.y1 + seg.y2) / 2 - 8,
        text: edge.label,
      });
    }
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
