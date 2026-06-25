/**
 * 世界地図エディタ（admin）
 * 座標: スポットは正規化 (0–1) で保存。地形編集はワールド座標。
 */
import * as THREE from 'three';

const LAYER_ID = 'hirao';
const PERSON_M = 1.7;
const CAR_LEN_M = 4.5;
const CAR_W_M = 1.8;
const CAR_H_M = 1.5;

const WORLD_PRESETS = {
  'new-harima': {
    worldId: 'new-harima',
    label: 'ニューハリマ',
    shortLabel: '播州全体',
    hint: '淡路島〜雪彦山・神戸〜赤穂・瀬戸内海を含む広大なワールド',
    size: 1200,
    seg: 160,
    gridCell: 100,
    metersPerUnit: 240,
    gridLabel: '格子1マス ≈ 数kmほどの感覚',
    riverBrushDefault: 42,
    brushRadius: 48,
    orbitDefault: 580,
    planZoomMin: 0.5,
  },
  'hime-memory': {
    worldId: 'hime-memory',
    label: 'ヒメモリの地',
    shortLabel: '姫路エリア',
    hint: 'お城〜市川・花田・天川、西・東の広いエリア',
    size: 3600,
    seg: 200,
    gridCell: 50,
    metersPerUnit: 16,
    gridLabel: '格子1マス ≈ 数百m・町の塊の感覚',
    riverBrushDefault: 34,
    brushRadius: 70,
    orbitDefault: 1400,
    planZoomDefault: 2.8,
    planZoomMin: 1.0,
  },
  'konui-michi': {
    worldId: 'konui-michi',
    label: 'コヌイの路',
    shortLabel: 'コヌイの路',
    hint: '花田IC〜道の駅〜ツインコモンズ（半径〜1km圏）',
    size: 500,
    seg: 180,
    gridCell: 25,
    metersPerUnit: 4,
    gridLabel: '格子1マス ≈ 100m前後の感覚',
    riverBrushDefault: 14,
    brushRadius: 28,
    orbitDefault: 280,
  },
};

const BRUSH_STRENGTH = 0.85;
const RIVER_STRENGTH = 1.8;

const ORBIT_KEY_STEP = 5;
const AZIMUTH_KEY_STEP = 0.035;
const POLAR_MIN = 0.12;
const POLAR_MAX = 1.48;
const ALTITUDE_MIN = -140;
const ALTITUDE_MAX = 220;
const ALTITUDE_KEY_STEP = 4;
const POLAR_KEY_STEP = 0.022;
const PLAN_ZOOM_MIN = 0.35;
const PLAN_ZOOM_MAX = 5.5;
const PLAN_ZOOM_KEY_STEP = 0.045;

const HEIGHT_BANDS = [
  { max: 8, label: '平地', css: '#8a9e6e' },
  { max: 22, label: '低い丘', css: '#9a8a5c' },
  { max: 40, label: '播磨の山', css: '#a67a45' },
  { max: 9999, label: '高め', css: '#c9a86a' },
];

const AREA_PALETTE = ['#c9a574', '#8fad7a', '#7a9eb8', '#b88a9a', '#a890c4', '#d4a05c', '#8a8a9e'];

export function initWorldMapEditor({ supabase, onStatus, readOnly = false, defaultPreset = null }) {
  const app = document.getElementById('world-map-app');
  if (!app) return;

  if (readOnly) {
    document.body.classList.add('world-map-readonly');
  }

  const panel = document.getElementById('world-map-panel');
  const spotbox = document.getElementById('world-map-spotbox');
  const nameInput = document.getElementById('world-map-spot-name');
  const slugInput = document.getElementById('world-map-spot-slug');
  const loadingEl = document.getElementById('world-map-loading');

  const W = () => app.clientWidth;
  const H = () => app.clientHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9e1d2);
  scene.fog = null;

  const perspCamera = new THREE.PerspectiveCamera(48, W() / H(), 0.1, 12000);
  const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20000);
  let activeCamera = perspCamera;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W(), H());
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  app.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b5b40, 1.0));
  const sun = new THREE.DirectionalLight(0xfff0d8, 0.8);
  sun.position.set(120, 180, 80);
  scene.add(sun);

  let currentPresetId = defaultPreset || (readOnly ? 'hime-memory' : 'konui-michi');
  let SIZE;
  let SEG;
  let GRID_CELL;
  let WORLD_ID;
  let N;
  let brushRadius;
  let riverBrushRadius;
  let geo;
  let pos;
  let heights;
  let water;
  let areaGrid;
  let areas;
  let currentAreaId;
  let colAttr;
  let land;
  let wireMesh;
  let gridHelper;
  let scaleMarkerGroup;
  let margin;

  function preset() {
    return WORLD_PRESETS[currentPresetId];
  }

  function localKey() {
    return `banshu_world_map_v3_${WORLD_ID}`;
  }

  function orbitMin() {
    return SIZE * 0.14;
  }

  function orbitMax() {
    return SIZE * 0.82;
  }

  function planZoomMin() {
    const p = preset();
    if (p.planZoomMin != null) return p.planZoomMin;
    return Math.max(0.35, SIZE / 4800);
  }

  function syncCameraFar() {
    const far = SIZE * 2.8;
    perspCamera.far = far;
    perspCamera.updateProjectionMatrix();
    orthoCamera.far = far;
    orthoCamera.updateProjectionMatrix();
  }

  function destroyTerrain() {
    clearSpots();
    if (land) {
      scene.remove(land, wireMesh, gridHelper, scaleMarkerGroup);
      geo.dispose();
      land.material.dispose();
      wireMesh.material.dispose();
      gridHelper.geometry.dispose();
      gridHelper.material.dispose();
      scaleMarkerGroup.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      land = wireMesh = gridHelper = scaleMarkerGroup = null;
    }
  }

  function buildScaleMarkers() {
    const mpu = preset().metersPerUnit;
    const personH = PERSON_M / mpu;
    const carL = CAR_LEN_M / mpu;
    const carW = CAR_W_M / mpu;
    const carH = CAR_H_M / mpu;
    scaleMarkerGroup = new THREE.Group();
    const personMesh = new THREE.Mesh(
      new THREE.BoxGeometry(personH * 0.35, personH, personH * 0.35),
      new THREE.MeshBasicMaterial({ color: 0x2a2018, transparent: true, opacity: 0.65 }),
    );
    personMesh.position.y = personH / 2;
    const carMesh = new THREE.Mesh(
      new THREE.BoxGeometry(carL, carH, carW),
      new THREE.MeshBasicMaterial({ color: 0x4a4030, transparent: true, opacity: 0.55 }),
    );
    carMesh.position.set(personH * 0.5 + carL / 2 + 2, carH / 2, 0);
    scaleMarkerGroup.add(personMesh);
    scaleMarkerGroup.add(carMesh);
    scene.add(scaleMarkerGroup);
  }

  function updateScaleMarkerPosition() {
    if (!scaleMarkerGroup) return;
    const ox = SIZE * 0.3;
    const oz = SIZE * 0.3;
    const ty = groundY(target.x + ox, target.z + oz);
    scaleMarkerGroup.position.set(target.x + ox, ty + 0.5, target.z + oz);
  }

  function buildTerrain() {
    const p = preset();
    SIZE = p.size;
    SEG = p.seg;
    GRID_CELL = p.gridCell;
    WORLD_ID = p.worldId;
    brushRadius = p.brushRadius;
    riverBrushRadius = p.riverBrushDefault;
    margin = SIZE * 0.07;
    syncCameraFar();

    geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    pos = geo.attributes.position;
    N = pos.count;
    heights = new Float32Array(N);
    water = new Float32Array(N);
    areaGrid = new Uint16Array(N);
    areas = [];
    currentAreaId = 0;
    colAttr = new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3);
    geo.setAttribute('color', colAttr);

    land = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        metalness: 0,
        flatShading: false,
      }),
    );
    scene.add(land);
    wireMesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: 0x3a2c1a,
        wireframe: true,
        transparent: true,
        opacity: 0.05,
      }),
    );
    scene.add(wireMesh);

    const gridDivisions = Math.round(SIZE / GRID_CELL);
    gridHelper = new THREE.GridHelper(SIZE, gridDivisions, 0x5c4a32, 0x8a7a62);
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.22;
    gridHelper.position.y = 0.4;
    scene.add(gridHelper);

    buildScaleMarkers();
    syncRiverBrushUI();
    updateScaleLegend();
  }

  buildTerrain();

  const cWater = new THREE.Color(0x6fa9c4);
  const cLow = new THREE.Color(0x83975a);
  const cMid = new THREE.Color(0x9c7b46);
  const cHigh = new THREE.Color(0xcdbb8c);

  function areaColorById(id) {
    const a = areas.find((x) => x.id === id);
    if (!a) return null;
    return new THREE.Color(a.color);
  }

  function tintWithArea(base, id, strength) {
    const ac = areaColorById(id);
    if (!ac) return base;
    return base.clone().lerp(ac, strength);
  }

  function recolor3d() {
    for (let i = 0; i < N; i++) {
      const y = heights[i];
      let c;
      if (water[i] > 0.5) {
        c = cWater;
      } else if (y < 6) {
        c = cLow.clone().lerp(cMid, Math.min(1, y / 40));
      } else if (y < 40) {
        c = cLow.clone().lerp(cMid, y / 40);
      } else {
        c = cMid.clone().lerp(cHigh, Math.min(1, (y - 40) / 50));
      }
      if (areaGrid[i] > 0) c = tintWithArea(c, areaGrid[i], viewMode === 'plan' ? 0.72 : 0.45);
      colAttr.setXYZ(i, c.r, c.g, c.b);
    }
    colAttr.needsUpdate = true;
  }

  function recolorPlan() {
    for (let i = 0; i < N; i++) {
      if (water[i] > 0.5) {
        colAttr.setXYZ(i, cWater.r, cWater.g, cWater.b);
        continue;
      }
      let r;
      let g;
      let bch;
      if (areaGrid[i] > 0) {
        const ac = areaColorById(areaGrid[i]);
        if (ac) {
          colAttr.setXYZ(i, ac.r, ac.g, ac.b);
          continue;
        }
      }
      const y = heights[i];
      let band = HEIGHT_BANDS[HEIGHT_BANDS.length - 1];
      for (const b of HEIGHT_BANDS) {
        if (y < b.max) {
          band = b;
          break;
        }
      }
      const hex = band.css.replace('#', '');
      r = parseInt(hex.slice(0, 2), 16) / 255;
      g = parseInt(hex.slice(2, 4), 16) / 255;
      bch = parseInt(hex.slice(4, 6), 16) / 255;
      colAttr.setXYZ(i, r, g, bch);
    }
    colAttr.needsUpdate = true;
  }

  function recolor() {
    if (viewMode === 'plan') recolorPlan();
    else recolor3d();
  }

  function sampleMaxHeight() {
    let max = 0;
    for (let i = 0; i < N; i++) {
      if (water[i] > 0.5) continue;
      if (heights[i] > max) max = heights[i];
    }
    return max;
  }

  function heightBandLabel(y) {
    for (const b of HEIGHT_BANDS) {
      if (y < b.max) return b.label;
    }
    return HEIGHT_BANDS[HEIGHT_BANDS.length - 1].label;
  }

  function updateScaleLegend() {
    const p = preset();
    const mpu = p.metersPerUnit;
    const gridM = GRID_CELL * mpu;
    const gridEl = document.getElementById('world-map-grid-hint');
    if (gridEl) gridEl.textContent = p.gridLabel + '（約' + formatMeters(gridM) + '）';

    const presetHint = document.getElementById('world-map-preset-hint');
    if (presetHint) presetHint.textContent = p.hint;

    const legendPx = 36;
    const personPx = Math.max(4, Math.min(28, (PERSON_M / mpu) * legendPx));
    const carPx = Math.max(6, Math.min(36, (CAR_LEN_M / mpu) * legendPx));
    const personEl = document.getElementById('world-map-ref-person');
    const carEl = document.getElementById('world-map-ref-car');
    if (personEl) {
      personEl.style.height = personPx + 'px';
      personEl.style.width = Math.max(4, personPx * 0.35) + 'px';
    }
    if (carEl) carEl.style.width = carPx + 'px';

    const peakEl = document.getElementById('world-map-peak-hint');
    if (!peakEl) return;
    const peak = sampleMaxHeight();
    if (peak < 1) {
      peakEl.textContent = 'いまの地形：ほぼ平地';
    } else {
      peakEl.textContent = 'いまの最高付近：' + heightBandLabel(peak) + 'くらいの感じ';
    }
  }

  function formatMeters(m) {
    if (m >= 1000) return Math.round(m / 100) / 10 + 'km';
    return Math.round(m) + 'm';
  }

  function riverWidthLabel(r) {
    if (r < 14) return '細い川';
    if (r < 24) return 'ふつう';
    if (r < 36) return 'やや広い';
    return '広い川・用水';
  }

  function syncRiverBrushUI() {
    const slider = document.getElementById('world-map-river-width');
    const label = document.getElementById('world-map-river-width-label');
    if (slider) slider.value = String(Math.round(riverBrushRadius));
    if (label) label.textContent = riverWidthLabel(riverBrushRadius);
  }

  async function switchWorldPreset(id) {
    if (!WORLD_PRESETS[id] || id === currentPresetId) return;
    if (!readOnly) saveLocal();
    destroyTerrain();
    currentPresetId = id;
    target.set(0, 0, 0);
    orbit = preset().orbitDefault;
    buildTerrain();
    planZoom = preset().planZoomDefault ?? 1;
    planZoom = Math.max(planZoomMin(), planZoom);
    applyHeights();
    const sel = document.getElementById('world-map-preset');
    if (sel) sel.value = id;
    let loaded = await loadFromSupabase();
    if (!loaded && !readOnly) tryLoadLocal();
    setViewMode(viewMode);
    if (!readOnly) initHistory();
    setStatus(preset().label + ' に切り替えました');
  }

  function applyHeights() {
    for (let i = 0; i < N; i++) {
      pos.setY(i, water[i] > 0.5 ? Math.min(heights[i], -2) : heights[i]);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    recolor();
    updateScaleLegend();
  }

  function worldToNorm(x, z) {
    return {
      x: (x + SIZE / 2) / SIZE,
      z: (z + SIZE / 2) / SIZE,
    };
  }

  function normToWorld(nx, nz) {
    return {
      x: nx * SIZE - SIZE / 2,
      z: nz * SIZE - SIZE / 2,
    };
  }

  function nearestIndex(x, z) {
    const gx = Math.round(((x + SIZE / 2) / SIZE) * SEG);
    const gz = Math.round(((z + SIZE / 2) / SIZE) * SEG);
    const cx = Math.max(0, Math.min(SEG, gx));
    const cz = Math.max(0, Math.min(SEG, gz));
    return cz * (SEG + 1) + cx;
  }

  const spots = [];
  const seedMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });

  function spotScale() {
    return SIZE / 700;
  }

  function addSpot(worldX, worldZ, name, slug) {
    const idx = nearestIndex(worldX, worldZ);
    const r = 3 * spotScale();
    const y = (heights[idx] || 0) + 8 * spotScale();
    const seedGeo = new THREE.SphereGeometry(r, 16, 16);
    const m = new THREE.Mesh(seedGeo, seedMat);
    m.position.set(worldX, y, worldZ);
    scene.add(m);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(r * 2.2, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.16 }),
    );
    halo.position.copy(m.position);
    scene.add(halo);
    const el = document.createElement('div');
    el.className = 'world-map-label';
    el.textContent = name;
    app.appendChild(el);
    spots.push({
      x: worldX,
      z: worldZ,
      name,
      slug,
      _m: m,
      _halo: halo,
      _el: el,
      _y: y,
    });
    drawConstellation();
  }

  let constLine = null;

  function drawConstellation() {
    if (constLine) {
      scene.remove(constLine);
      constLine.geometry.dispose();
      constLine = null;
    }
    if (spots.length < 2) return;
    const pts = [];
    for (let i = 0; i < spots.length; i++) {
      let nd = 1e9;
      let nj = -1;
      for (let j = i + 1; j < spots.length; j++) {
        const d = Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z);
        if (d < nd) {
          nd = d;
          nj = j;
        }
      }
      if (nj >= 0) {
        pts.push(
          new THREE.Vector3(spots[i].x, spots[i]._y, spots[i].z),
          new THREE.Vector3(spots[nj].x, spots[nj]._y, spots[nj].z),
        );
      }
    }
    constLine = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.4 }),
    );
    scene.add(constLine);
  }

  function clearSpots() {
    spots.forEach((s) => {
      scene.remove(s._m);
      scene.remove(s._halo);
      s._el.remove();
    });
    spots.length = 0;
    if (constLine) {
      scene.remove(constLine);
      constLine.geometry.dispose();
      constLine = null;
    }
  }

  const HISTORY_MAX = 50;
  let history = [];
  let historyIndex = -1;
  let historyLock = false;

  function captureState() {
    return {
      h: Array.from(heights),
      w: Array.from(water),
      ag: Array.from(areaGrid),
      a: areas.map((x) => ({ id: x.id, slug: x.slug, name: x.name, color: x.color })),
      curArea: currentAreaId,
      s: spots.map((s) => {
        const n = worldToNorm(s.x, s.z);
        return { name: s.name, slug: s.slug, x: n.x, z: n.z };
      }),
    };
  }

  function statesEqual(a, b) {
    if (!a || !b || a.h.length !== b.h.length) return false;
    for (let i = 0; i < a.h.length; i++) {
      if (a.h[i] !== b.h[i] || a.w[i] !== b.w[i]) return false;
    }
    const agA = a.ag || [];
    const agB = b.ag || [];
    if (agA.length !== agB.length) return false;
    for (let i = 0; i < agA.length; i++) {
      if (agA[i] !== agB[i]) return false;
    }
    const arA = a.a || [];
    const arB = b.a || [];
    if (arA.length !== arB.length) return false;
    for (let i = 0; i < arA.length; i++) {
      const aa = arA[i];
      const ab = arB[i];
      if (aa.id !== ab.id || aa.slug !== ab.slug || aa.name !== ab.name || aa.color !== ab.color) return false;
    }
    if ((a.curArea || 0) !== (b.curArea || 0)) return false;
    if (a.s.length !== b.s.length) return false;
    for (let i = 0; i < a.s.length; i++) {
      const sa = a.s[i];
      const sb = b.s[i];
      if (sa.slug !== sb.slug || sa.x !== sb.x || sa.z !== sb.z || sa.name !== sb.name) return false;
    }
    return true;
  }

  function applyState(state) {
    if (!state || state.h.length !== N) return;
    historyLock = true;
    for (let i = 0; i < N; i++) {
      heights[i] = state.h[i] || 0;
      water[i] = state.w[i] || 0;
      areaGrid[i] = state.ag?.[i] || 0;
    }
    areas = (state.a || []).map((x) => ({
      id: x.id,
      slug: x.slug,
      name: x.name,
      color: x.color,
    }));
    currentAreaId = state.curArea || areas[0]?.id || 0;
    refreshAreaUI();
    clearSpots();
    for (const s of state.s || []) {
      const w = normToWorld(s.x, s.z);
      addSpot(w.x, w.z, s.name, s.slug);
    }
    applyHeights();
    historyLock = false;
    updateHistoryButtons();
  }

  function pushHistory() {
    if (historyLock || !heights) return;
    const snap = captureState();
    if (historyIndex >= 0 && statesEqual(snap, history[historyIndex])) return;
    if (historyIndex < history.length - 1) {
      history = history.slice(0, historyIndex + 1);
    }
    history.push(snap);
    if (history.length > HISTORY_MAX) history.shift();
    historyIndex = history.length - 1;
    updateHistoryButtons();
  }

  function initHistory() {
    history = [];
    historyIndex = -1;
    historyLock = false;
    pushHistory();
  }

  function undo() {
    if (historyIndex <= 0) return;
    historyIndex--;
    applyState(history[historyIndex]);
    setStatus('1つ戻りました');
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    historyIndex++;
    applyState(history[historyIndex]);
    setStatus('1つ進みました');
  }

  function updateHistoryButtons() {
    const undoBtn = document.getElementById('world-map-undo');
    const redoBtn = document.getElementById('world-map-redo');
    if (undoBtn) undoBtn.disabled = historyIndex <= 0;
    if (redoBtn) redoBtn.disabled = historyIndex >= history.length - 1;
  }

  function brushFalloff(d, radius) {
    if (d >= radius) return 0;
    const t = d / radius;
    return Math.cos(t * Math.PI * 0.5);
  }

  function smoothRegion(cx, cz, radius) {
    const temp = new Float32Array(heights);
    const cols = SEG + 1;
    for (let i = 0; i < N; i++) {
      const dx = pos.getX(i) - cx;
      const dz = pos.getZ(i) - cz;
      if (Math.hypot(dx, dz) > radius) continue;
      const gx = i % cols;
      const gz = Math.floor(i / cols);
      let sum = 0;
      let count = 0;
      for (let dz2 = -1; dz2 <= 1; dz2++) {
        for (let dx2 = -1; dx2 <= 1; dx2++) {
          const nx = gx + dx2;
          const nz = gz + dz2;
          if (nx < 0 || nx > SEG || nz < 0 || nz > SEG) continue;
          sum += temp[nz * cols + nx];
          count++;
        }
      }
      heights[i] = sum / count;
    }
  }

  function sculptAt(p, dir) {
    const radius = dir === 'river' ? riverBrushRadius : brushRadius;
    for (let i = 0; i < N; i++) {
      const dx = pos.getX(i) - p.x;
      const dz = pos.getZ(i) - p.z;
      const d = Math.hypot(dx, dz);
      if (d < radius) {
        let f;
        if (dir === 'river') {
          f = 1 - (d / radius) * 0.22;
        } else {
          f = brushFalloff(d, radius);
        }
        if (dir === 'raise') {
          heights[i] += BRUSH_STRENGTH * f;
          water[i] = 0;
        } else if (dir === 'lower') {
          heights[i] = Math.max(-30, heights[i] - BRUSH_STRENGTH * f);
        } else if (dir === 'erase') {
          heights[i] = heights[i] * (1 - f);
          water[i] = water[i] * (1 - f);
          if (f > 0.25) areaGrid[i] = 0;
        } else if (dir === 'river') {
          heights[i] = Math.min(heights[i], -3 - RIVER_STRENGTH * f);
          water[i] = 1;
        }
      }
    }
  }

  function sculpt(p, dir) {
    sculptAt(p, dir);
    applyHeights();
    updateScaleLegend();
  }

  function sculptStroke(from, to, dir) {
    const radius = dir === 'river' ? riverBrushRadius : brushRadius;
    const step = Math.max(2, radius * 0.4);
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01) {
      sculptAt(to, dir);
    } else {
      const n = Math.ceil(dist / step);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        sculptAt({ x: from.x + dx * t, z: from.z + dz * t }, dir);
      }
    }
    applyHeights();
    updateScaleLegend();
  }

  let areaBrushRadius = 48;
  let areaEraseMode = false;
  let areaNewColor = AREA_PALETTE[0];

  function paintAreaAt(p, erase) {
    const radius = areaBrushRadius;
    const id = erase ? 0 : currentAreaId;
    if (!erase && !id) return;
    for (let i = 0; i < N; i++) {
      const dx = pos.getX(i) - p.x;
      const dz = pos.getZ(i) - p.z;
      const d = Math.hypot(dx, dz);
      if (d < radius) {
        const f = brushFalloff(d, radius);
        if (f > 0.1) areaGrid[i] = id;
      }
    }
  }

  function paintArea(p, erase) {
    paintAreaAt(p, erase);
    recolor();
  }

  function paintAreaStroke(from, to, erase) {
    const step = Math.max(2, areaBrushRadius * 0.4);
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01) {
      paintAreaAt(to, erase);
    } else {
      const n = Math.ceil(dist / step);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        paintAreaAt({ x: from.x + dx * t, z: from.z + dz * t }, erase);
      }
    }
    recolor();
  }

  function refreshAreaUI() {
    const sel = document.getElementById('world-map-area-select');
    if (!sel) return;
    const prev = currentAreaId;
    sel.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '0';
    empty.textContent = '— 選んでください —';
    sel.appendChild(empty);
    for (const a of areas) {
      const opt = document.createElement('option');
      opt.value = String(a.id);
      opt.textContent = a.name;
      sel.appendChild(opt);
    }
    sel.value = String(prev || 0);
    currentAreaId = parseInt(sel.value, 10) || 0;
  }

  function addAreaDef(name, slug, color) {
    const id = areas.length ? Math.max(...areas.map((x) => x.id)) + 1 : 1;
    areas.push({ id, slug, name, color });
    currentAreaId = id;
    refreshAreaUI();
    return id;
  }

  function updateSpotWorldPos(sp, x, z) {
    const idx = nearestIndex(x, z);
    const y = (heights[idx] || 0) + 8 * spotScale();
    sp.x = x;
    sp.z = z;
    sp._y = y;
    sp._m.position.set(x, y, z);
    sp._halo.position.set(x, y, z);
    drawConstellation();
  }

  function pickSpot(e) {
    if (!spots.length) return null;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, activeCamera);
    const meshes = spots.flatMap((s) => [s._m, s._halo]);
    const hits = ray.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const mesh = hits[0].object;
    return spots.find((s) => s._m === mesh || s._halo === mesh);
  }

  let tool = 'raise';
  let viewMode = 'plan';
  const panelText = {
    raise: '地面をドラッグして山を盛り上げてください',
    lower: '地面をドラッグしてへこませます（微調整）',
    erase: 'ドラッグした範囲を平地に戻します（山・川を消す）',
    river: 'なぞった跡が川になります',
    spot: '地面をクリックして登録 · 登録済みはドラッグで移動',
    area: 'ドラッグで町や区域を塗ってください（消しゴムで消せます）',
    look: 'ドラッグで世界を眺めます（編集オフ）',
  };
  const panelTextPlan = {
    raise: '平面モード：距離感を見ながら山を置いてください',
    lower: '平面モード：へこませます（微調整）',
    erase: '平面モード：なぞった範囲を平地に戻します',
    river: '平面モード：川のルートをなぞります',
    spot: '平面モード：クリックで置く · ドラッグで移動',
    area: '平面モード：なぞってエリアを塗ります',
    look: '平面モード：右ドラッグで地図をずらします',
  };

  function refreshPanelText() {
    if (!panel) return;
    if (readOnly) {
      panel.textContent =
        viewMode === 'plan'
          ? '地図を眺めています · ドラッグで移動 · +/− でズーム'
          : '立体で地形を眺めています · 右ドラッグで回転';
      return;
    }
    const base = viewMode === 'plan' ? panelTextPlan : panelText;
    panel.textContent = base[tool] || base.raise;
  }

  function setViewMode(mode) {
    viewMode = mode;
    document.querySelectorAll('.world-map-view-toggle button').forEach((b) => {
      b.classList.toggle('on', b.dataset.view === mode);
    });
    scene.fog = null;
    wireMesh.material.opacity = mode === 'plan' ? 0.35 : 0.05;
    gridHelper.material.opacity = mode === 'plan' ? 0.45 : 0.15;
    land.material.flatShading = mode === 'plan';
    recolor();
    refreshPanelText();
    updateScaleLegend();
    updateCam();
  }

  document.querySelectorAll('.world-map-view-toggle button').forEach((b) => {
    b.onclick = () => setViewMode(b.dataset.view);
  });

  document.querySelectorAll('.world-map-tools button').forEach((b) => {
    b.onclick = () => {
      tool = b.dataset.tool;
      document.querySelectorAll('.world-map-tools button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      if (panel) refreshPanelText();
      const riverPanel = document.getElementById('world-map-river-brush');
      if (riverPanel) riverPanel.hidden = tool !== 'river';
      const areaPanel = document.getElementById('world-map-area-panel');
      if (areaPanel) areaPanel.hidden = tool !== 'area';
    };
  });

  const areaSelect = document.getElementById('world-map-area-select');
  const areaNewBtn = document.getElementById('world-map-area-new');
  const areaEraseBtn = document.getElementById('world-map-area-erase');
  const areaWidthSlider = document.getElementById('world-map-area-width');
  const areaNewForm = document.getElementById('world-map-area-newform');
  const areaNameInput = document.getElementById('world-map-area-name');
  const areaSlugInput = document.getElementById('world-map-area-slug');
  const areaAddBtn = document.getElementById('world-map-area-add');
  const areaColorsEl = document.getElementById('world-map-area-colors');

  if (areaColorsEl) {
    AREA_PALETTE.forEach((c) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'world-map-area-swatch';
      sw.style.background = c;
      sw.title = c;
      sw.onclick = () => {
        areaNewColor = c;
        areaColorsEl.querySelectorAll('.world-map-area-swatch').forEach((x) => x.classList.remove('on'));
        sw.classList.add('on');
      };
      if (c === areaNewColor) sw.classList.add('on');
      areaColorsEl.appendChild(sw);
    });
  }

  if (areaSelect) {
    areaSelect.addEventListener('change', () => {
      currentAreaId = parseInt(areaSelect.value, 10) || 0;
    });
  }

  if (areaNewBtn && areaNewForm) {
    areaNewBtn.onclick = () => {
      areaNewForm.hidden = !areaNewForm.hidden;
      if (!areaNewForm.hidden && areaNameInput) areaNameInput.focus();
    };
  }

  if (areaEraseBtn) {
    areaEraseBtn.onclick = () => {
      areaEraseMode = !areaEraseMode;
      areaEraseBtn.classList.toggle('on', areaEraseMode);
    };
  }

  if (areaWidthSlider) {
    areaWidthSlider.addEventListener('input', () => {
      areaBrushRadius = parseInt(areaWidthSlider.value, 10);
    });
    areaBrushRadius = parseInt(areaWidthSlider.value, 10) || 48;
  }

  if (areaAddBtn) {
    areaAddBtn.onclick = () => {
      const name = (areaNameInput?.value || '').trim() || '無名のエリア';
      const slug = (areaSlugInput?.value || '').trim() || slugify(name) || 'area-' + Date.now();
      addAreaDef(name, slug, areaNewColor);
      if (areaNameInput) areaNameInput.value = '';
      if (areaSlugInput) areaSlugInput.value = '';
      if (areaNewForm) areaNewForm.hidden = true;
      setStatus('エリアを追加: ' + name);
    };
  }

  refreshAreaUI();

  const riverSlider = document.getElementById('world-map-river-width');
  if (riverSlider) {
    riverSlider.addEventListener('input', () => {
      riverBrushRadius = parseInt(riverSlider.value, 10);
      syncRiverBrushUI();
    });
  }

  const presetSelect = document.getElementById('world-map-preset');
  if (presetSelect) {
    presetSelect.addEventListener('change', () => {
      switchWorldPreset(presetSelect.value);
    });
    presetSelect.value = currentPresetId;
  }

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pickGround(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, activeCamera);
    const hit = ray.intersectObject(land, false);
    return hit.length ? hit[0].point : null;
  }

  let painting = false;
  let dragMode = null;
  let sculptCenter = null;
  let lastSculptTool = null;
  let lastPaintPos = null;
  let draggingSpot = null;
  let spotDragMoved = false;

  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  renderer.domElement.addEventListener('mousedown', (e) => {
    const orbitDrag = e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey);

    if (readOnly) {
      if (orbitDrag && viewMode === 'plan') {
        dragMode = 'planpan';
        ox = e.clientX;
        oy = e.clientY;
        e.preventDefault();
        return;
      }
      if (orbitDrag && viewMode === '3d') {
        dragMode = 'orbit';
        ox = e.clientX;
        oy = e.clientY;
        e.preventDefault();
        return;
      }
      dragMode = viewMode === 'plan' ? 'planpan' : 'orbit';
      ox = e.clientX;
      oy = e.clientY;
      return;
    }

    if (orbitDrag && viewMode === 'plan') {
      dragMode = 'planpan';
      ox = e.clientX;
      oy = e.clientY;
      e.preventDefault();
      return;
    }

    if (orbitDrag && viewMode === '3d') {
      dragMode = 'orbit';
      ox = e.clientX;
      oy = e.clientY;
      e.preventDefault();
      return;
    }

    if (tool === 'look') {
      dragMode = viewMode === 'plan' ? 'planpan' : 'orbit';
      ox = e.clientX;
      oy = e.clientY;
      return;
    }
    if (tool === 'spot') {
      const sp = pickSpot(e);
      if (sp) {
        draggingSpot = sp;
        spotDragMoved = false;
        return;
      }
      const p = pickGround(e);
      if (p) openSpotForm(p, e);
      return;
    }
    if (tool === 'area') {
      if (!areaEraseMode && !currentAreaId) {
        setStatus('エリアを選ぶか「＋ 新規」で作成してください');
        return;
      }
      const p = pickGround(e);
      if (p) {
        painting = true;
        lastPaintPos = { x: p.x, z: p.z };
        sculptCenter = lastPaintPos;
        lastSculptTool = 'area';
        paintArea(p, areaEraseMode);
      }
      return;
    }
    const p = pickGround(e);
    if (p) {
      painting = true;
      lastPaintPos = { x: p.x, z: p.z };
      sculptCenter = lastPaintPos;
      lastSculptTool = tool;
      sculpt(p, tool);
    } else {
      dragMode = 'orbit';
      ox = e.clientX;
      oy = e.clientY;
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (draggingSpot) {
      const p = pickGround(e);
      if (p) {
        updateSpotWorldPos(draggingSpot, p.x, p.z);
        spotDragMoved = true;
      }
      return;
    }
    if (painting) {
      const p = pickGround(e);
      if (p) {
        if (tool === 'area') {
          if (lastPaintPos) {
            paintAreaStroke(lastPaintPos, p, areaEraseMode);
          } else {
            paintArea(p, areaEraseMode);
          }
        } else {
          const dir = tool === 'river' ? 'river' : tool;
          if (lastPaintPos) {
            sculptStroke(lastPaintPos, p, dir);
          } else {
            sculpt(p, dir);
          }
        }
        lastPaintPos = { x: p.x, z: p.z };
        sculptCenter = lastPaintPos;
      }
      return;
    }
    if (dragMode === 'planpan') {
      const scale = (SIZE / planZoom) / Math.min(W(), H());
      target.x -= (e.clientX - ox) * scale * 0.55;
      target.z -= (e.clientY - oy) * scale * 0.55;
      ox = e.clientX;
      oy = e.clientY;
      return;
    }
    if (dragMode === 'orbit' && viewMode === '3d') {
      azimuth -= (e.clientX - ox) * 0.005;
      polar = Math.max(POLAR_MIN, Math.min(POLAR_MAX, polar - (e.clientY - oy) * 0.004));
      ox = e.clientX;
      oy = e.clientY;
    }
  });

  window.addEventListener('mouseup', () => {
    const didSculpt = painting;
    const didSpotDrag = spotDragMoved;
    if (painting && sculptCenter && (lastSculptTool === 'raise' || lastSculptTool === 'lower')) {
      smoothRegion(sculptCenter.x, sculptCenter.z, brushRadius * 1.2);
      applyHeights();
    }
    painting = false;
    dragMode = null;
    sculptCenter = null;
    lastSculptTool = null;
    lastPaintPos = null;
    if (draggingSpot) {
      draggingSpot = null;
      spotDragMoved = false;
    }
    if (didSculpt || didSpotDrag) pushHistory();
  });

  renderer.domElement.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (viewMode === 'plan') {
        planZoom = Math.max(
          planZoomMin(),
          Math.min(PLAN_ZOOM_MAX, planZoom - e.deltaY * 0.002),
        );
      } else {
        orbit = Math.max(orbitMin(), Math.min(orbitMax(), orbit + e.deltaY * 0.15));
      }
    },
    { passive: false },
  );

  let pendingP = null;

  function openSpotForm(p, e) {
    pendingP = p;
    spotbox.style.display = 'flex';
    spotbox.style.left = Math.min(W() - 220, e.clientX) + 'px';
    spotbox.style.top = e.clientY + 'px';
    nameInput.value = '';
    slugInput.value = '';
    nameInput.focus();
  }

  function slugify(text) {
    return text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  const spotOkBtn = document.getElementById('world-map-spot-ok');
  if (spotOkBtn) {
    spotOkBtn.onclick = () => {
      if (!pendingP) return;
      const name = nameInput.value.trim() || '無名のスポット';
      const slug = slugInput.value.trim() || slugify(name) || 'spot-' + Date.now();
      addSpot(pendingP.x, pendingP.z, name, slug);
      spotbox.style.display = 'none';
      pendingP = null;
      pushHistory();
      if (panel) panel.textContent = 'スポットを登録しました: ' + name;
    };
  }

  if (nameInput) {
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') spotOkBtn?.click();
    });
  }
  if (slugInput) {
    slugInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') spotOkBtn?.click();
    });
  }

  const target = new THREE.Vector3(0, 0, 0);
  let orbit = preset().orbitDefault;
  let azimuth = 0;
  let polar = 0.95;
  let altitudeOffset = 0;
  let planZoom = 1;
  let ox = 0;
  let oy = 0;

  function groundY(x, z) {
    return heights[nearestIndex(x, z)] || 0;
  }

  function updateCam() {
    const ty = groundY(target.x, target.z);
    if (viewMode === 'plan') {
      const aspect = W() / H();
      const half = (SIZE * 0.58) / planZoom;
      orthoCamera.left = -half * aspect;
      orthoCamera.right = half * aspect;
      orthoCamera.top = half;
      orthoCamera.bottom = -half;
      orthoCamera.position.set(target.x, ty + SIZE * 0.52 + altitudeOffset * 0.3, target.z);
      orthoCamera.lookAt(target.x, ty, target.z);
      orthoCamera.updateProjectionMatrix();
      activeCamera = orthoCamera;
    } else {
      const camY = ty + orbit * Math.cos(polar) + altitudeOffset;
      perspCamera.position.set(
        target.x + orbit * Math.sin(polar) * Math.sin(azimuth),
        camY,
        target.z + orbit * Math.sin(polar) * Math.cos(azimuth),
      );
      perspCamera.lookAt(target.x, ty + 12, target.z);
      activeCamera = perspCamera;
    }
  }

  const held = {
    up: false,
    down: false,
    left: false,
    right: false,
    rotateLeft: false,
    rotateRight: false,
    altitudeUp: false,
    altitudeDown: false,
    zoomIn: false,
    zoomOut: false,
  };

  function bindHoldButton(btn, key) {
    const on = (e) => {
      e.preventDefault();
      held[key] = true;
      btn.classList.add('on');
    };
    const off = (e) => {
      e.preventDefault();
      held[key] = false;
      btn.classList.remove('on');
    };
    btn.addEventListener('mousedown', on);
    btn.addEventListener('touchstart', on, { passive: false });
    window.addEventListener('mouseup', off);
    btn.addEventListener('touchend', off);
    btn.addEventListener('mouseleave', off);
  }

  document.querySelectorAll('.world-map-dpad button[data-dir]').forEach((b) => {
    bindHoldButton(b, b.dataset.dir);
  });

  document.querySelectorAll('.world-map-cam-row button[data-cam]').forEach((b) => {
    const camMap = {
      'rotate-left': 'rotateLeft',
      'rotate-right': 'rotateRight',
      'altitude-up': 'altitudeUp',
      'altitude-down': 'altitudeDown',
      'zoom-in': 'zoomIn',
      'zoom-out': 'zoomOut',
    };
    const key = camMap[b.dataset.cam];
    if (key) bindHoldButton(b, key);
  });

  function isTypingTarget() {
    const ae = document.activeElement;
    return ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
  }

  const panKeyMap = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  const camKeyDown = {
    q: 'rotateLeft',
    Q: 'rotateLeft',
    e: 'rotateRight',
    E: 'rotateRight',
    w: 'altitudeUp',
    W: 'altitudeUp',
    s: 'altitudeDown',
    S: 'altitudeDown',
    '+': 'zoomIn',
    '=': 'zoomIn',
    '-': 'zoomOut',
    _: 'zoomOut',
  };
  const camKeyUp = { ...camKeyDown };

  addEventListener('keydown', (e) => {
    if (isTypingTarget()) return;
    if (panKeyMap[e.key]) {
      held[panKeyMap[e.key]] = true;
      e.preventDefault();
    }
    if (camKeyDown[e.key]) {
      held[camKeyDown[e.key]] = true;
      e.preventDefault();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    if ((e.metaKey || e.ctrlKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
      e.preventDefault();
      redo();
    }
  });
  addEventListener('keyup', (e) => {
    if (panKeyMap[e.key]) held[panKeyMap[e.key]] = false;
    if (camKeyUp[e.key]) held[camKeyUp[e.key]] = false;
  });

  function setStatus(text) {
    if (panel) panel.textContent = text;
    if (onStatus) onStatus(text);
  }

  function terrainPayload() {
    return {
      world_id: WORLD_ID,
      layer_id: LAYER_ID,
      seg: SEG,
      heights: Array.from(heights),
      water: Array.from(water),
      area_defs: areas.map((x) => ({ id: x.id, slug: x.slug, name: x.name, color: x.color })),
      area_grid: Array.from(areaGrid),
    };
  }

  function saveLocal() {
    if (readOnly) return;
    const data = {
      seg: SEG,
      h: Array.from(heights),
      w: Array.from(water),
      ag: Array.from(areaGrid),
      a: areas.map((x) => ({ id: x.id, slug: x.slug, name: x.name, color: x.color })),
      curArea: currentAreaId,
      s: spots.map((s) => {
        const n = worldToNorm(s.x, s.z);
        return { name: s.name, slug: s.slug, x: n.x, z: n.z };
      }),
    };
    localStorage.setItem(localKey(), JSON.stringify(data));
  }

  async function saveAll() {
    saveLocal();
    if (!supabase) {
      setStatus('ローカルに保存しました（Supabase 未接続）');
      return;
    }

    const { error: layerErr } = await supabase.from('map_world_layers').upsert(terrainPayload(), {
      onConflict: 'world_id,layer_id',
    });
    if (layerErr) {
      setStatus('地形の保存エラー: ' + layerErr.message);
      return;
    }

    for (const s of spots) {
      const n = worldToNorm(s.x, s.z);
      const { error } = await supabase.from('map_spots').upsert(
        {
          world_id: WORLD_ID,
          layer: LAYER_ID,
          slug: s.slug,
          name: s.name,
          category: 'unknown',
          x: n.x,
          z: n.z,
          link_type: 'none',
          link_ref: null,
        },
        { onConflict: 'world_id,layer,slug' },
      );
      if (error) {
        setStatus('スポット保存エラー (' + s.slug + '): ' + error.message);
        return;
      }
    }

    setStatus('保存しました（Supabase + ローカル）');
  }

  const saveBtn = document.getElementById('world-map-save');
  if (saveBtn) saveBtn.onclick = () => saveAll();

  const undoBtn = document.getElementById('world-map-undo');
  if (undoBtn) undoBtn.onclick = () => undo();

  const redoBtn = document.getElementById('world-map-redo');
  if (redoBtn) redoBtn.onclick = () => redo();

  const resetBtn = document.getElementById('world-map-reset');
  if (resetBtn) {
    resetBtn.onclick = () => {
      if (!confirm('地形・スポット・エリアをまっさらに戻します。\n（Supabase 上のデータは削除しません）')) return;
      heights.fill(0);
      water.fill(0);
      areaGrid.fill(0);
      areas.length = 0;
      currentAreaId = 0;
      refreshAreaUI();
      applyHeights();
      clearSpots();
      pushHistory();
      setStatus('まっさらに戻しました（ローカルのみ）');
      updateScaleLegend();
    };
  }

  function loadAreasFromData(defs, grid) {
    areas = (defs || []).map((x) => ({
      id: x.id,
      slug: x.slug,
      name: x.name,
      color: x.color,
    }));
    if (grid && grid.length === N) {
      for (let i = 0; i < N; i++) areaGrid[i] = grid[i] || 0;
    }
    currentAreaId = areas[0]?.id || 0;
    refreshAreaUI();
    recolor();
  }

  function loadTerrainFromArrays(hArr, wArr) {
    if (!hArr || hArr.length !== N) return false;
    for (let i = 0; i < N; i++) {
      heights[i] = hArr[i] || 0;
      water[i] = wArr && wArr[i] ? wArr[i] : 0;
    }
    applyHeights();
    return true;
  }

  function loadSpotsFromRows(rows) {
    clearSpots();
    for (const row of rows || []) {
      const w = normToWorld(row.x, row.z);
      addSpot(w.x, w.z, row.name || row.slug, row.slug || 'spot');
    }
  }

  function tryLoadLocal() {
    try {
      let raw = localStorage.getItem(localKey());
      if (!raw && WORLD_ID === 'hime-memory') {
        raw = localStorage.getItem('banshu_world_map_v2');
      }
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (d.seg && d.seg !== SEG) return false;
      if (d.h) loadTerrainFromArrays(d.h, d.w);
      if (d.ag || d.a) loadAreasFromData(d.a, d.ag);
      if (d.s) {
        clearSpots();
        for (const s of d.s) {
          if (s.x != null && s.z != null && s.x <= 1 && s.z <= 1) {
            const w = normToWorld(s.x, s.z);
            addSpot(w.x, w.z, s.name, s.slug || slugify(s.name));
          } else if (s.x != null && s.z != null) {
            addSpot(s.x, s.z, s.name, s.slug || slugify(s.name));
          }
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  async function loadFromSupabase() {
    if (!supabase) return false;

    let loaded = false;

    let layer = null;
    let layerErr = null;
    ({ data: layer, error: layerErr } = await supabase
      .from('map_world_layers')
      .select('seg, heights, water, area_defs, area_grid')
      .eq('world_id', WORLD_ID)
      .eq('layer_id', LAYER_ID)
      .maybeSingle());

    if (layerErr && /area_/.test(layerErr.message || '')) {
      ({ data: layer, error: layerErr } = await supabase
        .from('map_world_layers')
        .select('seg, heights, water')
        .eq('world_id', WORLD_ID)
        .eq('layer_id', LAYER_ID)
        .maybeSingle());
    }

    if (layerErr) {
      if (layerErr.code !== 'PGRST116' && !layerErr.message.includes('does not exist')) {
        setStatus('地形読込: ' + layerErr.message);
      }
    } else if (layer && layer.seg === SEG && layer.heights) {
      loadTerrainFromArrays(layer.heights, layer.water);
      if (layer.area_defs || layer.area_grid) {
        loadAreasFromData(layer.area_defs, layer.area_grid);
      }
      loaded = true;
    }

    const { data: spotRows, error: spotErr } = await supabase
      .from('map_spots')
      .select('slug, name, x, z')
      .eq('world_id', WORLD_ID)
      .eq('layer', LAYER_ID)
      .order('created_at', { ascending: true });

    if (spotErr) {
      if (!spotErr.message.includes('does not exist')) {
        setStatus('スポット読込: ' + spotErr.message);
      }
    } else if (spotRows && spotRows.length > 0) {
      loadSpotsFromRows(spotRows);
      loaded = true;
    }

    return loaded;
  }

  async function boot() {
    try {
      applyHeights();
      planZoom = preset().planZoomDefault ?? 1;
      planZoom = Math.max(planZoomMin(), planZoom);
      const fromRemote = await loadFromSupabase();
      if (!fromRemote && !readOnly) tryLoadLocal();
      setViewMode('plan');
      if (!readOnly) initHistory();
    } catch (err) {
      console.error('world-map boot error', err);
      setStatus('読み込みエラー: ' + (err.message || err));
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
      requestAnimationFrame(tick);
    }
  }

  const marginClamp = (v) => Math.max(-SIZE / 2 + margin, Math.min(SIZE / 2 - margin, v));

  let scaleLegendTick = 0;

  function tick(t) {
    const PAN = viewMode === 'plan' ? 9 : 7;
    const s = Math.sin(azimuth);
    const c = Math.cos(azimuth);

    if (viewMode === 'plan') {
      if (held.up) target.z -= PAN;
      if (held.down) target.z += PAN;
      if (held.left) target.x -= PAN;
      if (held.right) target.x += PAN;
      if (held.zoomIn || held.altitudeUp) {
        planZoom = Math.min(PLAN_ZOOM_MAX, planZoom + PLAN_ZOOM_KEY_STEP);
      }
      if (held.zoomOut || held.altitudeDown) {
        planZoom = Math.max(planZoomMin(), planZoom - PLAN_ZOOM_KEY_STEP);
      }
    } else {
      if (held.up) {
        target.x -= s * PAN;
        target.z -= c * PAN;
      }
      if (held.down) {
        target.x += s * PAN;
        target.z += c * PAN;
      }
      if (held.left) {
        target.x -= c * PAN;
        target.z += s * PAN;
      }
      if (held.right) {
        target.x += c * PAN;
        target.z -= s * PAN;
      }
      if (held.rotateLeft) azimuth -= AZIMUTH_KEY_STEP;
      if (held.rotateRight) azimuth += AZIMUTH_KEY_STEP;
      if (held.altitudeUp) {
        altitudeOffset = Math.min(ALTITUDE_MAX, altitudeOffset + ALTITUDE_KEY_STEP);
        polar = Math.max(POLAR_MIN, polar - POLAR_KEY_STEP * 0.6);
      }
      if (held.altitudeDown) {
        altitudeOffset = Math.max(ALTITUDE_MIN, altitudeOffset - ALTITUDE_KEY_STEP);
        polar = Math.min(POLAR_MAX, polar + POLAR_KEY_STEP * 0.6);
      }
      if (held.zoomIn) orbit = Math.max(orbitMin(), orbit - ORBIT_KEY_STEP);
      if (held.zoomOut) orbit = Math.min(orbitMax(), orbit + ORBIT_KEY_STEP);
    }

    target.x = marginClamp(target.x);
    target.z = marginClamp(target.z);
    updateCam();
    updateScaleMarkerPosition();

    scaleLegendTick++;
    if (scaleLegendTick % 45 === 0) updateScaleLegend();

    spots.forEach((sp, i) => {
      const pulse = 0.5 + 0.5 * Math.sin(t / 600 + i);
      sp._halo.scale.setScalar(0.9 + pulse * 0.5);
      sp._halo.material.opacity = 0.12 + pulse * 0.13;
      const v = sp._m.position.clone().project(activeCamera);
      const sx = (v.x * 0.5 + 0.5) * W();
      const sy = (-v.y * 0.5 + 0.5) * H();
      const vis = v.z < 1 && sx > -40 && sx < W() + 40 && sy > -20 && sy < H() + 20;
      sp._el.style.opacity = vis ? '1' : '0';
      sp._el.style.left = sx + 'px';
      sp._el.style.top = sy + 'px';
    });

    renderer.render(scene, activeCamera);
    requestAnimationFrame(tick);
  }

  addEventListener('resize', () => {
    const aspect = W() / H();
    perspCamera.aspect = aspect;
    perspCamera.updateProjectionMatrix();
    renderer.setSize(W(), H());
    updateCam();
  });

  boot();
}
