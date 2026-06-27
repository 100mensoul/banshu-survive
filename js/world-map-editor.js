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
    shortLabel: 'ニューハリマ',
    hint: '淡路島〜雪彦山・神戸〜赤穂・瀬戸内海を含む広大なワールド',
    size: 1200,
    seg: 160,
    gridCell: 100,
    metersPerUnit: 240,
    gridLabel: '格子1マス ≈ 数kmほどの感覚',
    riverWidthDefaultMeters: 50,
    riverWidthMaxMeters: 200,
    waterWidthDefaultMeters: 80,
    waterWidthMaxMeters: 200,
    brushRadius: 48,
    orbitDefault: 580,
    planZoomMin: 0.5,
  },
  'hime-memory': {
    worldId: 'hime-memory',
    label: 'ヒメモリの地',
    shortLabel: 'ヒメモリの地',
    hint: 'お城〜市川・花田・天川、西・東の広いエリア',
    size: 3600,
    seg: 200,
    gridCell: 50,
    metersPerUnit: 16,
    gridLabel: '格子1マス ≈ 数百m・町の塊の感覚',
    riverWidthDefaultMeters: 10,
    riverWidthMaxMeters: 200,
    waterWidthDefaultMeters: 30,
    waterWidthMaxMeters: 200,
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
    seg: 480,
    gridCell: 25,
    metersPerUnit: 2,
    gridLabel: '格子1マス ≈ 50m前後の感覚',
    riverWidthDefaultMeters: 12,
    riverWidthMinMeters: 2,
    riverWidthMaxMeters: 60,
    waterWidthDefaultMeters: 30,
    waterWidthMinMeters: 2,
    waterWidthMaxMeters: 60,
    riverDepthDefaultMeters: 1,
    riverWaterLevelDefaultMeters: 2,
    brushRadius: 12,
    orbitDefault: 280,
    guideImage: '../images/konui-guide.png',
  },
};

const PRESET_ORDER = ['konui-michi', 'hime-memory', 'new-harima'];

const BRUSH_STRENGTH = 1.2;
const RIVER_STRENGTH = 2.8;
const RIVER_WIDTH_MAX = 200;
const WATER_LEVEL_MIN = 0.1; // 水面の高さ(m)＝地表(Y=0)からどれだけ下か（水平な水面）
const WATER_LEVEL_MAX = 8;
const WATER_LEVEL_STEP = 0.1;

const ORBIT_KEY_STEP = 5;
const AZIMUTH_KEY_STEP = 0.035;
const POLAR_MIN = 0.12;
const POLAR_MAX = 1.48;
const ALTITUDE_MIN = -140;
const ALTITUDE_MAX = 220;
const ALTITUDE_KEY_STEP = 4;
const POLAR_KEY_STEP = 0.022;
const PLAN_ZOOM_MIN = 0.35;
const PLAN_ZOOM_MAX = 48;
const PLAN_ZOOM_KEY_STEP = 0.045;
const ZOOM_FACTOR_KEY = 0.965; // 1フレームあたりの倍率（指数ズーム。1未満で寄る）
const PLAN_ZOOM_FACTOR_KEY = 1.035;

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
  const spotDeleteBtn = document.getElementById('world-map-spot-delete');
  const spotCancelBtn = document.getElementById('world-map-spot-cancel');
  const loadingEl = document.getElementById('world-map-loading');
  const minimapEl = document.getElementById('world-map-minimap');
  const minimapCanvas = document.getElementById('world-map-minimap-canvas');
  const minimapDot = document.getElementById('world-map-minimap-dot');
  const minimapOpenBtn = document.getElementById('world-map-minimap-open');
  const minimapModal = document.getElementById('world-map-minimap-modal');
  const minimapModalCanvas = document.getElementById('world-map-minimap-modal-canvas');
  const minimapModalDot = document.getElementById('world-map-minimap-modal-dot');
  const minimapModalClose = document.getElementById('world-map-minimap-close');
  const minimapModalBackdrop = document.getElementById('world-map-minimap-backdrop');
  const shirasagiWrap = document.getElementById('world-map-shirasagi-wrap');
  const shirasagiImg = document.getElementById('world-map-shirasagi');

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

  const minimapCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20000);
  let minimapRenderer = null;
  let minimapModalRenderer = null;
  let minimapModalOpen = false;
  const MINIMAP_PX = 188;
  const MINIMAP_MODAL_PX = 480;

  if (minimapCanvas) {
    minimapRenderer = new THREE.WebGLRenderer({
      canvas: minimapCanvas,
      antialias: true,
      alpha: false,
      powerPreference: 'low-power',
    });
    minimapRenderer.setClearColor(0xe9e1d2, 1);
  }

  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b5b40, 1.0));
  const sun = new THREE.DirectionalLight(0xfff0d8, 0.8);
  sun.position.set(120, 180, 80);
  scene.add(sun);

  const guideTextureLoader = new THREE.TextureLoader();
  let guidePlane = null;
  let guideVisible = !readOnly;
  let guideOpacity = 0.5;
  let viewMode = '3d';

  let currentPresetId = defaultPreset || (readOnly ? 'hime-memory' : 'konui-michi');
  let SIZE;
  let SEG;
  let GRID_CELL;
  let WORLD_ID;
  let N;
  let brushRadius;
  let tool = 'look';
  let brushMeters;
  let riverBrushRadius;
  let riverWidthMeters;
  let waterBrushRadius;
  let waterWidthMeters;
  let riverDepthMeters;
  let riverWaterLevelMeters;
  let digMaterial = 1; // 1=土(茶) 2=草(緑) 3=コンクリ(グレー)
  let geo;
  let pos;
  let heights;
  let water;
  let waterY; // セル毎の水面の高さ（ワールド単位・絶対Y）
  let groundMat; // セル毎の地表素材 0=自動 1=土 2=草 3=コンクリ
  let areaGrid;
  let areas;
  let currentAreaId;
  let colAttr;
  let land;
  let wireMesh;
  let gridHelper;
  let scaleMarkerGroup;
  let margin;
  let riverPreview = null;
  let shirasagiShadow = null;

  function ensureShirasagiShadow() {
    if (shirasagiShadow) return;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(18, 26, 14, 0.5)');
    grad.addColorStop(0.55, 'rgba(18, 26, 14, 0.26)');
    grad.addColorStop(1, 'rgba(18, 26, 14, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    shirasagiShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    shirasagiShadow.rotation.x = -Math.PI / 2;
    shirasagiShadow.renderOrder = 4;
    shirasagiShadow.visible = false;
    scene.add(shirasagiShadow);
  }

  /** 白鷺の地表からの高度（ワールド単位）。W/Sで上下、最低限は地面すれすれ */
  function heronAltUnits() {
    const base = SIZE * 0.04;
    const v = base + altitudeOffset * 0.5;
    return Math.max(SIZE * 0.012, Math.min(SIZE * 0.7, v));
  }

  function updateShirasagiShadow() {
    if (!shirasagiShadow) return;
    if (viewMode !== '3d') {
      shirasagiShadow.visible = false;
      return;
    }
    const gy = groundY(target.x, target.z);
    shirasagiShadow.position.set(target.x, gy + 0.25, target.z);
    // 高度が高いほど影は小さく薄く（＝影の大きさで高度がわかる）
    const altRatio = heronAltUnits() / (SIZE * 0.5);
    const r0 = Math.max(3, SIZE * 0.015);
    const r = r0 / (1 + altRatio * 1.4);
    shirasagiShadow.scale.set(r, r, 1);
    shirasagiShadow.material.opacity = Math.max(0.12, Math.min(0.6, 0.6 / (1 + altRatio * 1.2)));
    shirasagiShadow.material.transparent = true;
    shirasagiShadow.visible = true;
  }

  const _heronAnchor = new THREE.Vector3();

  /** 白鷺アバターを影の真上に投影配置。ズームで大きさが変わる（寄ると大・引くと小） */
  function updateShirasagiAvatar() {
    if (!shirasagiWrap) return;
    // 平面（地図）モードでは白鷺アイコンは出さない
    if (viewMode !== '3d') {
      shirasagiWrap.style.opacity = '0';
      return;
    }
    const gy = groundY(target.x, target.z);
    _heronAnchor.set(target.x, gy + heronAltUnits(), target.z);
    const v = _heronAnchor.clone().project(activeCamera);
    const onScreen = v.z < 1 && v.x > -1.4 && v.x < 1.4 && v.y > -1.4 && v.y < 1.4;
    if (!onScreen) {
      shirasagiWrap.style.opacity = '0';
      return;
    }
    const sx = (v.x * 0.5 + 0.5) * W();
    const sy = (-v.y * 0.5 + 0.5) * H();
    let scale;
    let fade;
    if (viewMode === 'plan') {
      scale = Math.max(0.4, Math.min(3.2, planZoom * 0.42));
      // 平面でも寄りすぎたら邪魔なので薄く
      fade = 1 - (planZoom - PLAN_ZOOM_MAX * 0.45) / (PLAN_ZOOM_MAX * 0.35);
    } else {
      const dist = perspCamera.position.distanceTo(_heronAnchor);
      scale = Math.max(0.35, Math.min(3.2, (SIZE * 0.45) / Math.max(1, dist)));
      // 寄る（orbitが小さい）ほど白鷺を薄く→作業の邪魔にならない
      const fadeStart = SIZE * 0.22;
      const fadeEnd = SIZE * 0.1;
      fade = (orbit - fadeEnd) / (fadeStart - fadeEnd);
    }
    fade = Math.max(0, Math.min(1, fade));
    const rot = viewMode === '3d' ? `rotate(${-azimuth}rad)` : '';
    shirasagiWrap.style.opacity = String(fade);
    shirasagiWrap.style.left = sx + 'px';
    shirasagiWrap.style.top = sy + 'px';
    shirasagiWrap.style.transform = `translate(-50%, -50%) ${rot} scale(${scale})`;
  }

  function ensureRiverPreview() {
    if (riverPreview) return;
    riverPreview = new THREE.Mesh(
      new THREE.RingGeometry(0.88, 1, 56),
      new THREE.MeshBasicMaterial({
        color: 0x4a8ab8,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    riverPreview.rotation.x = -Math.PI / 2;
    riverPreview.visible = false;
    scene.add(riverPreview);
  }

  function previewToolActive() {
    return (
      tool === 'dig' ||
      tool === 'water' ||
      tool === 'raise' ||
      tool === 'lower' ||
      tool === 'erase'
    );
  }

  function activeBrushRadius() {
    if (tool === 'dig') return riverSculptRadius();
    if (tool === 'water') return waterSculptRadius();
    return brushRadius;
  }

  function previewColorForTool() {
    if (tool === 'erase') return 0xc05a4a; // 消す＝赤系
    if (tool === 'raise' || tool === 'lower') return 0xc08a3a; // 盛る/へこます＝アンバー
    return 0x4a8ab8; // 川＝青
  }

  function updateRiverPreviewScale() {
    if (!riverPreview) return;
    const r = activeBrushRadius();
    riverPreview.scale.set(r, r, 1);
  }

  function updateRiverPreview(p) {
    if (!riverPreview || readOnly || !previewToolActive() || painting || draggingSpot) {
      if (riverPreview) riverPreview.visible = false;
      return;
    }
    if (!p) {
      riverPreview.visible = false;
      return;
    }
    riverPreview.material.color.setHex(previewColorForTool());
    riverPreview.visible = true;
    const y = groundY(p.x, p.z) + 0.9;
    riverPreview.position.set(p.x, y, p.z);
    updateRiverPreviewScale();
  }

  function hideRiverPreview() {
    if (riverPreview) riverPreview.visible = false;
  }

  function riverRadiusFromMeters(m) {
    return Math.max(0.03, m / 2 / preset().metersPerUnit);
  }

  function brushMaxMeters() {
    // マップの実寸（おおよそ）の3割くらいまで。最低でも80m。
    return Math.max(80, Math.round(SIZE * preset().metersPerUnit * 0.3));
  }

  function syncBrushRadiusFromMeters() {
    brushRadius = Math.max(0.05, brushMeters / 2 / preset().metersPerUnit);
  }

  function terrainCellSize() {
    return SIZE / SEG;
  }

  /** コヌイの路 (500) を基準に、大きいマップでも凹凸が見えるようスケール */
  function reliefScale() {
    return Math.sqrt(SIZE / 500);
  }

  function brushStrength() {
    return BRUSH_STRENGTH * reliefScale();
  }

  function riverDepthUnits() {
    // 実寸の深さ(m)をワールド単位へ。幅とは独立。
    const depthM = riverDepthMeters ?? preset().riverDepthDefaultMeters ?? 1;
    return depthM / preset().metersPerUnit;
  }

  function riverDepthTarget(f) {
    // f: 中心=1, 岸=0 のなだらかな椀形
    return -(riverDepthUnits() * f);
  }

  /** 地形頂点の間隔より細い川幅でも、必ず頂点に当たるよう補正した半径 */
  function riverSculptRadius() {
    const cell = terrainCellSize();
    return Math.max(riverBrushRadius, cell * 0.55);
  }

  function syncRiverRadiusFromMeters() {
    riverBrushRadius = riverRadiusFromMeters(riverWidthMeters);
  }

  function syncWaterRadiusFromMeters() {
    waterBrushRadius = riverRadiusFromMeters(waterWidthMeters);
  }

  /** 水を流す：川幅とは別に、塗りブラシの幅を設定できる */
  function waterSculptRadius() {
    const cell = terrainCellSize();
    return Math.max(waterBrushRadius, cell * 0.55);
  }

  function waterWidthMaxMeters() {
    const p = preset();
    return Math.min(RIVER_WIDTH_MAX, p.waterWidthMaxMeters ?? p.riverWidthMaxMeters ?? RIVER_WIDTH_MAX);
  }

  function waterWidthMinMeters() {
    return preset().waterWidthMinMeters ?? preset().riverWidthMinMeters ?? 2;
  }

  function applyPanPixels(dx, dy) {
    const scale = panDragScale() * 0.55;
    const mx = -dx * scale;
    const mz = -dy * scale;
    // 平面ビューは北向き固定なので回転を掛けない
    const ang = viewMode === 'plan' ? 0 : azimuth;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    target.x += mx * c - mz * s;
    target.z += mx * s + mz * c;
  }

  function panDragScale() {
    if (viewMode === 'plan') {
      return (SIZE / planZoom) / Math.min(W(), H());
    }
    return (orbit * 0.85) / Math.min(W(), H());
  }

  function preset() {
    return WORLD_PRESETS[currentPresetId];
  }

  function localKey() {
    return `banshu_world_map_v3_${WORLD_ID}`;
  }

  function orbitMin() {
    // かなり地表に寄れるように（小さいマップでもグッと近づける）
    return Math.max(2.5, SIZE * 0.004);
  }

  function orbitMax() {
    return SIZE * 0.95;
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
    destroyGuidePlane();
    destroyWaterSurface();
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

  function destroyGuidePlane() {
    if (!guidePlane) return;
    scene.remove(guidePlane);
    guidePlane.geometry.dispose();
    if (guidePlane.material.map) guidePlane.material.map.dispose();
    guidePlane.material.dispose();
    guidePlane = null;
  }

  function buildGuidePlane() {
    destroyGuidePlane();
    const src = preset().guideImage;
    if (!src) {
      updateGuideUI();
      return;
    }
    const geoG = new THREE.PlaneGeometry(SIZE, SIZE);
    geoG.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: guideOpacity,
      depthTest: false,
      depthWrite: false,
    });
    guidePlane = new THREE.Mesh(geoG, mat);
    guidePlane.position.y = 4;
    guidePlane.renderOrder = 999;
    guidePlane.visible = false;
    scene.add(guidePlane);
    guideTextureLoader.load(src, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      mat.map = tex;
      mat.needsUpdate = true;
      // 元画像の縦横比を保ったまま、正方形ワールドに収める（contain）
      const iw = tex.image && tex.image.width ? tex.image.width : 1;
      const ih = tex.image && tex.image.height ? tex.image.height : 1;
      const aspect = iw / ih;
      if (guidePlane) {
        if (aspect >= 1) {
          // 横長：幅(X)はそのまま、奥行(Z)を縮める
          guidePlane.scale.set(1, 1, 1 / aspect);
        } else {
          // 縦長：奥行(Z)はそのまま、幅(X)を縮める
          guidePlane.scale.set(aspect, 1, 1);
        }
      }
      applyGuideVisibility();
    });
    applyGuideVisibility();
    updateGuideUI();
  }

  function applyGuideVisibility() {
    if (!guidePlane) return;
    guidePlane.visible = guideVisible && viewMode === 'plan' && !!guidePlane.material.map;
    guidePlane.material.opacity = guideOpacity;
  }

  function updateGuideUI() {
    const wrap = document.getElementById('world-map-guide');
    if (!wrap) return;
    const hasGuide = !!preset().guideImage;
    wrap.hidden = !hasGuide || readOnly;
    const toggle = document.getElementById('world-map-guide-toggle');
    if (toggle) {
      toggle.classList.toggle('on', guideVisible);
      toggle.textContent = guideVisible ? '🗺 下絵: 表示' : '🗺 下絵: 非表示';
    }
    const slider = document.getElementById('world-map-guide-opacity');
    if (slider) {
      slider.value = String(Math.round(guideOpacity * 100));
      slider.disabled = !guideVisible;
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
    brushMeters = Math.round(brushRadius * 2 * p.metersPerUnit);
    riverWidthMeters = p.riverWidthDefaultMeters ?? 10;
    waterWidthMeters = p.waterWidthDefaultMeters ?? riverWidthMeters * 2;
    riverDepthMeters = p.riverDepthDefaultMeters ?? 1;
    riverWaterLevelMeters = p.riverWaterLevelDefaultMeters ?? 1;
    syncRiverRadiusFromMeters();
    syncWaterRadiusFromMeters();
    margin = SIZE * 0.07;
    syncCameraFar();

    geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    pos = geo.attributes.position;
    N = pos.count;
    heights = new Float32Array(N);
    water = new Float32Array(N);
    waterY = new Float32Array(N);
    groundMat = new Uint8Array(N);
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
    ensureRiverPreview();
    ensureShirasagiShadow();
    syncRiverBrushUI();
    updateScaleLegend();
    setupMinimapCamera();
    buildGuidePlane();
  }

  buildTerrain();

  const cLow = new THREE.Color(0x83975a);
  const cMid = new THREE.Color(0x9c7b46);
  const cHigh = new THREE.Color(0xcdbb8c);

  // 掘った地表の素材色（1=土/茶, 2=草/緑, 3=コンクリ/グレー）
  const cMatEarth = new THREE.Color(0x9c7b4e);
  const cMatGrass = new THREE.Color(0x6f8f4e);
  const cMatConcrete = new THREE.Color(0x9aa0a3);
  function matColor(id) {
    if (id === 2) return cMatGrass;
    if (id === 3) return cMatConcrete;
    return cMatEarth;
  }

  // 川の水面（フラットな青い面）。掘った地形(河床・堤防)とは別レイヤーで描く。
  let waterSurfaceMesh = null;
  let waterDirty = false;

  /** 水平な水面の絶対Y（地表0から riverWaterLevelMeters だけ下） */
  function flatWaterSurfaceY() {
    const m = riverWaterLevelMeters ?? 1;
    return -m / preset().metersPerUnit;
  }

  function destroyWaterSurface() {
    if (!waterSurfaceMesh) return;
    scene.remove(waterSurfaceMesh);
    waterSurfaceMesh.geometry.dispose();
    waterSurfaceMesh.material.dispose();
    waterSurfaceMesh = null;
  }

  function rebuildWaterSurface() {
    destroyWaterSurface();
    if (!pos) return;
    const cols = SEG + 1;
    const positions = [];
    const index = [];
    let v = 0;
    for (let gz = 0; gz < SEG; gz++) {
      for (let gx = 0; gx < SEG; gx++) {
        const i00 = gz * cols + gx;
        const i10 = gz * cols + gx + 1;
        const i01 = (gz + 1) * cols + gx;
        const i11 = (gz + 1) * cols + gx + 1;
        const corners = [i00, i10, i01, i11];
        let wsum = 0;
        let wyAcc = 0;
        for (const ci of corners) {
          if (water[ci] > 0.5) {
            wsum++;
            wyAcc += waterY[ci];
          }
        }
        if (wsum < 3) continue;
        // 水面の高さはセル毎の値の平均（川ごとに水位が違ってもOK）
        const wy = wyAcc / wsum;
        positions.push(
          pos.getX(i00), wy, pos.getZ(i00),
          pos.getX(i10), wy, pos.getZ(i10),
          pos.getX(i01), wy, pos.getZ(i01),
          pos.getX(i11), wy, pos.getZ(i11),
        );
        index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
        v += 4;
      }
    }
    if (positions.length === 0) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4f86a6,
      transparent: true,
      opacity: 0.9,
      roughness: 0.25,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    waterSurfaceMesh = new THREE.Mesh(g, mat);
    waterSurfaceMesh.renderOrder = 3;
    scene.add(waterSurfaceMesh);
  }

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
      if (groundMat[i] > 0) {
        c = matColor(groundMat[i]);
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
      if (groundMat[i] > 0) {
        const mc = matColor(groundMat[i]);
        colAttr.setXYZ(i, mc.r, mc.g, mc.b);
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

  function riverWidthLabel() {
    const m = riverWidthMeters;
    if (m < 5) return '細い水路';
    if (m < 15) return '小川';
    if (m < 30) return '川';
    return '広い川';
  }

  function depthMetersText() {
    return '約' + (Math.round(riverDepthMeters * 10) / 10) + 'm';
  }

  function waterLevelText() {
    const m = riverWaterLevelMeters ?? 1;
    return '地表から ' + m.toFixed(1) + 'm 下';
  }

  function syncRiverBrushUI() {
    const slider = document.getElementById('world-map-river-width');
    const feelEl = document.getElementById('world-map-river-width-label');
    const widthMetersEl = document.getElementById('world-map-river-width-meters');
    const waterSlider = document.getElementById('world-map-water-width');
    const waterWidthMetersEl = document.getElementById('world-map-water-width-meters');
    const depthSlider = document.getElementById('world-map-river-depth');
    const depthMetersEl = document.getElementById('world-map-river-depth-meters');
    const wlSlider = document.getElementById('world-map-river-waterlevel');
    const wlMetersEl = document.getElementById('world-map-river-waterlevel-meters');
    const legendRiver = document.getElementById('world-map-river-scale-hint');
    const riverPanel = document.getElementById('world-map-river-brush');
    const riverActive = riverPanel && !riverPanel.hidden;
    const p = preset();
    const minM = p.riverWidthMinMeters ?? 2;
    const maxM = Math.min(RIVER_WIDTH_MAX, p.riverWidthMaxMeters ?? RIVER_WIDTH_MAX);

    // ツールに応じて「掘る」用と「水を流す」用の行を出し分け
    if (riverPanel) {
      riverPanel.querySelectorAll('[data-for]').forEach((row) => {
        const forTool = row.getAttribute('data-for');
        row.hidden = forTool !== tool;
      });
    }

    if (slider) {
      slider.min = String(minM);
      slider.max = String(maxM);
      riverWidthMeters = Math.max(minM, Math.min(riverWidthMeters, maxM));
      slider.value = String(Math.round(riverWidthMeters));
    }
    if (feelEl) feelEl.textContent = riverWidthLabel();
    if (widthMetersEl) widthMetersEl.textContent = '幅 約' + formatMeters(riverWidthMeters);
    const wMinM = waterWidthMinMeters();
    const wMaxM = waterWidthMaxMeters();
    if (waterSlider) {
      waterSlider.min = String(wMinM);
      waterSlider.max = String(wMaxM);
      waterWidthMeters = Math.max(wMinM, Math.min(waterWidthMeters, wMaxM));
      waterSlider.value = String(Math.round(waterWidthMeters));
    }
    if (waterWidthMetersEl) waterWidthMetersEl.textContent = '幅 約' + formatMeters(waterWidthMeters);
    if (depthSlider) depthSlider.value = String(riverDepthMeters);
    if (depthMetersEl) depthMetersEl.textContent = '深さ ' + depthMetersText();
    if (wlSlider) wlSlider.value = String(riverWaterLevelMeters);
    if (wlMetersEl) wlMetersEl.textContent = '水位 ' + waterLevelText();

    // 素材ボタンのアクティブ表示
    document.querySelectorAll('.world-map-mat-btn').forEach((b) => {
      b.classList.toggle('on', (parseInt(b.dataset.mat, 10) || 1) === digMaterial);
    });

    if (legendRiver) {
      if (riverActive && !readOnly) {
        legendRiver.hidden = false;
        legendRiver.textContent =
          tool === 'water'
            ? '水を流す：幅 約' + formatMeters(waterWidthMeters) + ' · ' + waterLevelText() + '（水平）'
            : '川を掘る：幅 約' + formatMeters(riverWidthMeters) + ' · 深さ ' + depthMetersText();
      } else {
        legendRiver.hidden = true;
      }
    }
    updateRiverPreviewScale();
  }

  function syncBrushUI() {
    const slider = document.getElementById('world-map-brush-size');
    const metersEl = document.getElementById('world-map-brush-meters');
    const nameEl = document.getElementById('world-map-brush-name');
    const maxM = brushMaxMeters();
    if (slider) {
      slider.min = '2';
      slider.max = String(maxM);
      brushMeters = Math.max(2, Math.min(maxM, Math.round(brushMeters)));
      slider.value = String(brushMeters);
    }
    if (metersEl) metersEl.textContent = '幅 約' + formatMeters(brushMeters);
    if (nameEl) nameEl.textContent = tool === 'erase' ? '消しゴム幅' : 'ブラシ幅';
  }

  async function switchWorldPreset(id) {
    if (!WORLD_PRESETS[id] || id === currentPresetId) return;
    if (!readOnly) saveLocal();
    deletedSpotSlugs.length = 0;
    destroyTerrain();
    currentPresetId = id;
    target.set(0, 0, 0);
    orbit = preset().orbitDefault;
    buildTerrain();
    riverWidthMeters = preset().riverWidthDefaultMeters ?? 10;
    waterWidthMeters = preset().waterWidthDefaultMeters ?? riverWidthMeters * 2;
    riverDepthMeters = preset().riverDepthDefaultMeters ?? 1;
    riverWaterLevelMeters = preset().riverWaterLevelDefaultMeters ?? 1;
    syncRiverRadiusFromMeters();
    syncWaterRadiusFromMeters();
    planZoom = preset().planZoomDefault ?? 1;
    planZoom = Math.max(planZoomMin(), planZoom);
    applyHeights();
    const sel = document.getElementById('world-map-preset');
    if (sel) sel.value = id;
    const remote = await loadFromSupabase();
    const local = readOnly ? null : readLocalData();
    const localAt = local?.savedAt || 0;
    if (local && localAt > remote.updatedAt + 500) {
      applyLocalData(local);
    } else if (!remote.loaded && local) {
      applyLocalData(local);
    }
    setViewMode(viewMode);
    if (!readOnly) initHistory();
    syncPresetNav();
    setStatus(preset().label + ' に切り替えました');
  }

  function syncPresetNav() {
    const idx = PRESET_ORDER.indexOf(currentPresetId);
    if (idx < 0) return;
    const prevId = PRESET_ORDER[(idx - 1 + PRESET_ORDER.length) % PRESET_ORDER.length];
    const nextId = PRESET_ORDER[(idx + 1) % PRESET_ORDER.length];
    const prevBtn = document.getElementById('world-map-preset-prev');
    const nextBtn = document.getElementById('world-map-preset-next');
    const label = document.getElementById('world-map-preset-nav-label');
    if (prevBtn) prevBtn.title = '← ' + WORLD_PRESETS[prevId].shortLabel;
    if (nextBtn) nextBtn.title = WORLD_PRESETS[nextId].shortLabel + ' →';
    if (label) label.textContent = preset().shortLabel || preset().label;
  }

  function switchPresetStep(delta) {
    const idx = PRESET_ORDER.indexOf(currentPresetId);
    if (idx < 0) return;
    const nextIdx = (idx + delta + PRESET_ORDER.length) % PRESET_ORDER.length;
    switchWorldPreset(PRESET_ORDER[nextIdx]);
  }

  function applyHeights() {
    for (let i = 0; i < N; i++) {
      pos.setY(i, heights[i]);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    recolor();
    if (waterDirty) {
      rebuildWaterSurface();
      waterDirty = false;
    }
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
  const deletedSpotSlugs = [];
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
    const di = deletedSpotSlugs.indexOf(slug);
    if (di >= 0) deletedSpotSlugs.splice(di, 1);
    drawConstellation();
  }

  function removeSpot(sp) {
    const idx = spots.indexOf(sp);
    if (idx < 0) return;
    scene.remove(sp._m);
    scene.remove(sp._halo);
    sp._m.geometry.dispose();
    sp._halo.geometry.dispose();
    sp._el.remove();
    if (!deletedSpotSlugs.includes(sp.slug)) deletedSpotSlugs.push(sp.slug);
    spots.splice(idx, 1);
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
      wy: Array.from(waterY),
      gm: Array.from(groundMat),
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
      waterY[i] = state.wy?.[i] || 0;
      groundMat[i] = state.gm?.[i] || 0;
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
    waterDirty = true;
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
    setStatus('1つ戻りました', 1000);
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    historyIndex++;
    applyState(history[historyIndex]);
    setStatus('1つ進みました', 1000);
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
    if (dir === 'dig') {
      sculptDigAt(p);
      return;
    }
    if (dir === 'water') {
      paintWaterAt(p);
      return;
    }
    const radius = brushRadius;
    for (let i = 0; i < N; i++) {
      const dx = pos.getX(i) - p.x;
      const dz = pos.getZ(i) - p.z;
      const d = Math.hypot(dx, dz);
      if (d < radius) {
        const f = brushFalloff(d, radius);
        if (dir === 'raise') {
          heights[i] += brushStrength() * f;
          if (water[i] > 0.5) waterDirty = true;
          water[i] = 0;
          waterY[i] = 0;
          if (f > 0.25) groundMat[i] = 0;
        } else if (dir === 'lower') {
          heights[i] = Math.max(-30 * reliefScale(), heights[i] - brushStrength() * f);
        } else if (dir === 'erase') {
          const t = Math.min(1, f * 1.35);
          if (t >= 0.08) {
            heights[i] = heights[i] * (1 - t);
            water[i] = water[i] * (1 - t);
            // 深い川床でも確実に消えるよう、一定以上なら平地(0)に戻す
            if (t > 0.22) {
              heights[i] = 0;
              water[i] = 0;
              waterY[i] = 0;
              groundMat[i] = 0;
              areaGrid[i] = 0;
            } else if (t > 0.12) {
              waterY[i] = 0;
              groundMat[i] = 0;
            }
            if (Math.abs(heights[i]) < 0.4) heights[i] = 0;
            if (water[i] < 0.05) {
              water[i] = 0;
              waterY[i] = 0;
            }
            waterDirty = true;
          }
        }
      }
    }
  }

  /** 「川を掘る」：地形を溝状に掘り下げ、掘った所に素材色を付ける（水は付けない） */
  function sculptDigAt(p) {
    const radius = riverSculptRadius();
    const cell = terrainCellSize();
    const cols = SEG + 1;
    const gxCenter = (p.x + SIZE / 2) / cell;
    const gzCenter = (p.z + SIZE / 2) / cell;
    const cr = Math.ceil(radius / cell) + 1;
    const gxi0 = Math.max(0, Math.floor(gxCenter - cr));
    const gxi1 = Math.min(SEG, Math.ceil(gxCenter + cr));
    const gzi0 = Math.max(0, Math.floor(gzCenter - cr));
    const gzi1 = Math.min(SEG, Math.ceil(gzCenter + cr));
    for (let gz = gzi0; gz <= gzi1; gz++) {
      for (let gx = gxi0; gx <= gxi1; gx++) {
        const i = gz * cols + gx;
        const dx = pos.getX(i) - p.x;
        const dz = pos.getZ(i) - p.z;
        const d = Math.hypot(dx, dz);
        if (d < radius) {
          // 平らな底＋急な内壁（堤防のような断面）
          const t = Math.min(1, d / radius);
          const wallStart = 0.72;
          const f = t <= wallStart ? 1 : 1 - (t - wallStart) / (1 - wallStart);
          heights[i] = Math.min(heights[i], riverDepthTarget(f));
          if (f > 0.05) groundMat[i] = digMaterial;
        }
      }
    }
  }

  /** 「水を流す」：水平な水面を塗る（高さは地表からの下がり。セル毎に保存→川ごとに変えられる） */
  function paintWaterAt(p) {
    const radius = waterSculptRadius();
    const cell = terrainCellSize();
    const cols = SEG + 1;
    const surfaceY = flatWaterSurfaceY();
    const gxCenter = (p.x + SIZE / 2) / cell;
    const gzCenter = (p.z + SIZE / 2) / cell;
    const cr = Math.ceil(radius / cell) + 1;
    const gxi0 = Math.max(0, Math.floor(gxCenter - cr));
    const gxi1 = Math.min(SEG, Math.ceil(gxCenter + cr));
    const gzi0 = Math.max(0, Math.floor(gzCenter - cr));
    const gzi1 = Math.min(SEG, Math.ceil(gzCenter + cr));
    for (let gz = gzi0; gz <= gzi1; gz++) {
      for (let gx = gxi0; gx <= gxi1; gx++) {
        const i = gz * cols + gx;
        const dx = pos.getX(i) - p.x;
        const dz = pos.getZ(i) - p.z;
        const d = Math.hypot(dx, dz);
        if (d < radius) {
          water[i] = 1;
          // 水平な水面：地表から◯m下の絶対Y（U字断面の壁には追従しない）
          waterY[i] = surfaceY;
          waterDirty = true;
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
    const isRiverTool = dir === 'dig' || dir === 'water';
    const radius =
      dir === 'water' ? waterSculptRadius() : dir === 'dig' ? riverSculptRadius() : brushRadius;
    const step = isRiverTool
      ? Math.max(terrainCellSize() * 0.35, radius * 0.4)
      : Math.max(0.5, radius * 0.4);
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

  const panelText = {
    raise: '地面をドラッグして山を盛り上げてください',
    lower: '地面をドラッグしてへこませます（微調整）',
    erase: 'ドラッグした範囲を平地に戻します（山・川を消す）',
    dig: 'なぞった跡を溝に掘ります（河床・堤防）。素材と幅・深さを選べます',
    water: '掘った所をなぞると水平な水面が流れます（水幅・水位を調整）',
    spot: '空き地クリックで登録 · スポットをクリックで削除 · ドラッグで移動',
    area: 'ドラッグで町や区域を塗ってください（消しゴムで消せます）',
    look: 'ドラッグで視点を回す · 十字キーで移動 · Shift+ドラッグでも移動',
  };
  const panelTextPlan = {
    raise: '平面モード：距離感を見ながら山を置いてください',
    lower: '平面モード：へこませます（微調整）',
    erase: '平面モード：なぞった範囲を平地に戻します',
    dig: '平面モード：川のルートを掘ります（河床・堤防）',
    water: '平面モード：掘った所に水を流します',
    spot: '平面：クリックで置く/削除 · ドラッグで移動',
    area: '平面モード：なぞってエリアを塗ります',
    look: 'ドラッグで視点を回す · 十字キーで移動 · Shift+ドラッグでも移動',
  };

  function refreshPanelText() {
    // 常時表示の中央注釈は廃止。案内は setStatus のトースト（3秒）でのみ表示する。
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
    if (minimapEl) minimapEl.hidden = mode !== '3d';
    if (mode !== '3d') closeMinimapModal();
    applyGuideVisibility();
    recolor();
    refreshPanelText();
    updateScaleLegend();
    updateCam();
  }

  function setupMinimapCamera() {
    if (!SIZE) return;
    const half = SIZE * 0.52;
    minimapCamera.left = -half;
    minimapCamera.right = half;
    minimapCamera.top = half;
    minimapCamera.bottom = -half;
    minimapCamera.position.set(0, SIZE * 0.65, 0);
    minimapCamera.up.set(0, 0, -1);
    minimapCamera.lookAt(0, 0, 0);
    minimapCamera.updateProjectionMatrix();
  }

  function updateMinimapDot(dotEl) {
    if (!dotEl || !SIZE) return;
    dotEl.style.left = ((target.x + SIZE / 2) / SIZE) * 100 + '%';
    dotEl.style.top = ((target.z + SIZE / 2) / SIZE) * 100 + '%';
  }

  function renderMinimapTo(miniRenderer, px) {
    if (!land || !miniRenderer || !SIZE) return;
    setupMinimapCamera();
    const pr = Math.min(window.devicePixelRatio, 2);
    miniRenderer.setPixelRatio(pr);
    miniRenderer.setSize(px, px, false);
    const restore = [];
    if (guidePlane?.visible) {
      guidePlane.visible = false;
      restore.push(() => {
        guidePlane.visible = true;
      });
    }
    if (riverPreview?.visible) {
      riverPreview.visible = false;
      restore.push(() => {
        riverPreview.visible = true;
      });
    }
    if (scaleMarkerGroup?.visible) {
      scaleMarkerGroup.visible = false;
      restore.push(() => {
        scaleMarkerGroup.visible = true;
      });
    }
    if (shirasagiShadow?.visible) {
      shirasagiShadow.visible = false;
      restore.push(() => {
        shirasagiShadow.visible = true;
      });
    }
    miniRenderer.render(scene, minimapCamera);
    restore.forEach((fn) => fn());
  }

  function renderMinimaps() {
    if (viewMode !== '3d' || !land) return;
    updateMinimapDot(minimapDot);
    if (minimapRenderer) renderMinimapTo(minimapRenderer, MINIMAP_PX);
    if (minimapModalOpen && minimapModalRenderer) {
      updateMinimapDot(minimapModalDot);
      renderMinimapTo(minimapModalRenderer, MINIMAP_MODAL_PX);
    }
  }

  function openMinimapModal() {
    if (viewMode !== '3d') return;
    if (!minimapModalRenderer && minimapModalCanvas) {
      minimapModalRenderer = new THREE.WebGLRenderer({
        canvas: minimapModalCanvas,
        antialias: true,
        alpha: false,
      });
      minimapModalRenderer.setClearColor(0xe9e1d2, 1);
    }
    minimapModalOpen = true;
    if (minimapModal) minimapModal.hidden = false;
    renderMinimaps();
  }

  function closeMinimapModal() {
    minimapModalOpen = false;
    if (minimapModal) minimapModal.hidden = true;
  }

  if (minimapOpenBtn) minimapOpenBtn.addEventListener('click', openMinimapModal);
  if (minimapModalClose) minimapModalClose.addEventListener('click', closeMinimapModal);
  if (minimapModalBackdrop) minimapModalBackdrop.addEventListener('click', closeMinimapModal);
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && minimapModalOpen) closeMinimapModal();
  });

  document.querySelectorAll('.world-map-view-toggle button').forEach((b) => {
    b.onclick = () => setViewMode(b.dataset.view);
  });

  document.querySelectorAll('.world-map-tools button').forEach((b) => {
    b.classList.toggle('on', b.dataset.tool === 'look');
  });
  refreshPanelText();

  document.querySelectorAll('.world-map-tools button').forEach((b) => {
    b.onclick = () => {
      tool = b.dataset.tool;
      document.querySelectorAll('.world-map-tools button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      if (panel) refreshPanelText();
      const riverPanel = document.getElementById('world-map-river-brush');
      const isRiverTool = tool === 'dig' || tool === 'water';
      if (riverPanel) riverPanel.hidden = !isRiverTool;
      const brushPanel = document.getElementById('world-map-brush-panel');
      const isBrushTool = tool === 'raise' || tool === 'lower' || tool === 'erase';
      if (brushPanel) brushPanel.hidden = !isBrushTool;
      const areaPanel = document.getElementById('world-map-area-panel');
      if (areaPanel) areaPanel.hidden = tool !== 'area';
      syncRiverBrushUI();
      syncBrushUI();
      if (!previewToolActive()) hideRiverPreview();
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
      riverWidthMeters = parseInt(riverSlider.value, 10) || 2;
      syncRiverRadiusFromMeters();
      syncRiverBrushUI();
    });
  }

  function nudgeRiverWidth(delta) {
    const p = preset();
    const minM = p.riverWidthMinMeters ?? 2;
    const maxM = Math.min(RIVER_WIDTH_MAX, p.riverWidthMaxMeters ?? RIVER_WIDTH_MAX);
    riverWidthMeters = Math.max(minM, Math.min(maxM, Math.round(riverWidthMeters + delta)));
    syncRiverRadiusFromMeters();
    syncRiverBrushUI();
  }

  const riverWidthMinus = document.getElementById('world-map-river-width-minus');
  const riverWidthPlus = document.getElementById('world-map-river-width-plus');
  if (riverWidthMinus) riverWidthMinus.addEventListener('click', () => nudgeRiverWidth(-1));
  if (riverWidthPlus) riverWidthPlus.addEventListener('click', () => nudgeRiverWidth(1));

  const waterWidthSlider = document.getElementById('world-map-water-width');
  if (waterWidthSlider) {
    waterWidthSlider.addEventListener('input', () => {
      waterWidthMeters = parseInt(waterWidthSlider.value, 10) || 2;
      syncWaterRadiusFromMeters();
      syncRiverBrushUI();
    });
  }

  function nudgeWaterWidth(delta) {
    const minM = waterWidthMinMeters();
    const maxM = waterWidthMaxMeters();
    waterWidthMeters = Math.max(minM, Math.min(maxM, Math.round(waterWidthMeters + delta)));
    syncWaterRadiusFromMeters();
    syncRiverBrushUI();
  }

  const waterWidthMinus = document.getElementById('world-map-water-width-minus');
  const waterWidthPlus = document.getElementById('world-map-water-width-plus');
  if (waterWidthMinus) waterWidthMinus.addEventListener('click', () => nudgeWaterWidth(-1));
  if (waterWidthPlus) waterWidthPlus.addEventListener('click', () => nudgeWaterWidth(1));

  // 盛る/へこます/消す のブラシ幅
  function applyBrushMeters(m) {
    const maxM = brushMaxMeters();
    brushMeters = Math.max(2, Math.min(maxM, Math.round(m)));
    syncBrushRadiusFromMeters();
    syncBrushUI();
    updateRiverPreviewScale();
  }
  function nudgeBrush(dir) {
    const step = Math.max(1, Math.round(brushMeters * 0.12));
    applyBrushMeters(brushMeters + dir * step);
  }
  const brushSlider = document.getElementById('world-map-brush-size');
  if (brushSlider) {
    brushSlider.addEventListener('input', () => applyBrushMeters(parseInt(brushSlider.value, 10) || 2));
  }
  const brushMinus = document.getElementById('world-map-brush-minus');
  const brushPlus = document.getElementById('world-map-brush-plus');
  if (brushMinus) brushMinus.addEventListener('click', () => nudgeBrush(-1));
  if (brushPlus) brushPlus.addEventListener('click', () => nudgeBrush(1));

  const RIVER_DEPTH_MIN = 0.5;
  const RIVER_DEPTH_MAX = 8;
  const RIVER_DEPTH_STEP = 0.5;

  function setRiverDepth(v) {
    riverDepthMeters = Math.max(RIVER_DEPTH_MIN, Math.min(RIVER_DEPTH_MAX, Math.round(v / RIVER_DEPTH_STEP) * RIVER_DEPTH_STEP));
    syncRiverBrushUI();
  }

  const riverDepthSlider = document.getElementById('world-map-river-depth');
  if (riverDepthSlider) {
    riverDepthSlider.addEventListener('input', () => {
      setRiverDepth(parseFloat(riverDepthSlider.value) || RIVER_DEPTH_MIN);
    });
  }
  const riverDepthMinus = document.getElementById('world-map-river-depth-minus');
  const riverDepthPlus = document.getElementById('world-map-river-depth-plus');
  if (riverDepthMinus) riverDepthMinus.addEventListener('click', () => setRiverDepth(riverDepthMeters - RIVER_DEPTH_STEP));
  if (riverDepthPlus) riverDepthPlus.addEventListener('click', () => setRiverDepth(riverDepthMeters + RIVER_DEPTH_STEP));

  // 掘る素材の選択（土／草／コンクリ）
  function setDigMaterial(id) {
    digMaterial = id;
    syncRiverBrushUI();
  }
  document.querySelectorAll('.world-map-mat-btn').forEach((b) => {
    b.addEventListener('click', () => setDigMaterial(parseInt(b.dataset.mat, 10) || 1));
  });

  // 水位（地表から水面までの下がり m）
  function setWaterLevel(v) {
    const snapped = Math.round(v / WATER_LEVEL_STEP) * WATER_LEVEL_STEP;
    riverWaterLevelMeters = Math.max(
      WATER_LEVEL_MIN,
      Math.min(WATER_LEVEL_MAX, Math.round(snapped * 10) / 10),
    );
    syncRiverBrushUI();
  }
  const waterLevelSlider = document.getElementById('world-map-river-waterlevel');
  if (waterLevelSlider) {
    waterLevelSlider.addEventListener('input', () => {
      setWaterLevel(parseFloat(waterLevelSlider.value) || WATER_LEVEL_MIN);
    });
  }
  const waterLevelMinus = document.getElementById('world-map-river-waterlevel-minus');
  const waterLevelPlus = document.getElementById('world-map-river-waterlevel-plus');
  if (waterLevelMinus)
    waterLevelMinus.addEventListener('click', () => setWaterLevel(riverWaterLevelMeters - WATER_LEVEL_STEP));
  if (waterLevelPlus)
    waterLevelPlus.addEventListener('click', () => setWaterLevel(riverWaterLevelMeters + WATER_LEVEL_STEP));

  const presetSelect = document.getElementById('world-map-preset');
  if (presetSelect) {
    presetSelect.addEventListener('change', () => {
      switchWorldPreset(presetSelect.value);
    });
    presetSelect.value = currentPresetId;
  }

  const presetPrevBtn = document.getElementById('world-map-preset-prev');
  const presetNextBtn = document.getElementById('world-map-preset-next');
  if (presetPrevBtn) presetPrevBtn.addEventListener('click', () => switchPresetStep(-1));
  if (presetNextBtn) presetNextBtn.addEventListener('click', () => switchPresetStep(1));
  syncPresetNav();

  const guideToggleBtn = document.getElementById('world-map-guide-toggle');
  if (guideToggleBtn) {
    guideToggleBtn.addEventListener('click', () => {
      guideVisible = !guideVisible;
      if (guideVisible && viewMode !== 'plan') setViewMode('plan');
      applyGuideVisibility();
      updateGuideUI();
    });
  }
  const guideOpacitySlider = document.getElementById('world-map-guide-opacity');
  if (guideOpacitySlider) {
    guideOpacitySlider.addEventListener('input', () => {
      guideOpacity = (parseInt(guideOpacitySlider.value, 10) || 50) / 100;
      applyGuideVisibility();
    });
  }
  updateGuideUI();

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
  let spotClickAt = null;

  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  renderer.domElement.addEventListener('mousedown', (e) => {
    const panDrag = e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey);

    if (readOnly) {
      // 平面ビューはドラッグで地図移動、立体ビューはドラッグで角度回転
      dragMode = (panDrag || viewMode === 'plan') ? 'planpan' : 'orbit';
      ox = e.clientX;
      oy = e.clientY;
      if (panDrag) e.preventDefault();
      return;
    }

    if (panDrag) {
      dragMode = 'planpan';
      ox = e.clientX;
      oy = e.clientY;
      e.preventDefault();
      return;
    }

    if (tool === 'look') {
      // 平面ビューはドラッグで地図移動、立体ビューはドラッグで角度回転
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
        spotClickAt = { x: e.clientX, y: e.clientY };
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
          const dir = tool;
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
      applyPanPixels(e.clientX - ox, e.clientY - oy);
      ox = e.clientX;
      oy = e.clientY;
      return;
    }
    if (dragMode === 'orbit') {
      azimuth += (e.clientX - ox) * 0.005;
      if (viewMode === '3d') {
        polar = Math.max(POLAR_MIN, Math.min(POLAR_MAX, polar - (e.clientY - oy) * 0.004));
      }
      ox = e.clientX;
      oy = e.clientY;
      return;
    }
    if (previewToolActive() && !painting && !draggingSpot) {
      updateRiverPreview(pickGround(e));
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
    hideRiverPreview();
    if (draggingSpot) {
      if (!spotDragMoved && tool === 'spot' && spotClickAt) {
        openSpotEditForm(draggingSpot, spotClickAt);
      }
      draggingSpot = null;
      spotDragMoved = false;
      spotClickAt = null;
    }
    if (didSculpt || didSpotDrag) pushHistory();
  });

  renderer.domElement.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (viewMode === 'plan') {
        // 指数ズーム（ホイール）。下スクロールで引く・上で寄る
        planZoom = Math.max(
          planZoomMin(),
          Math.min(PLAN_ZOOM_MAX, planZoom * Math.exp(-e.deltaY * 0.0012)),
        );
      } else {
        orbit = Math.max(orbitMin(), Math.min(orbitMax(), orbit * Math.exp(e.deltaY * 0.0012)));
      }
    },
    { passive: false },
  );

  let pendingP = null;
  let editingSpot = null;

  function positionSpotbox(e) {
    if (!spotbox) return;
    spotbox.style.left = Math.min(W() - 240, Math.max(12, e.clientX)) + 'px';
    spotbox.style.top = Math.min(H() - 180, Math.max(12, e.clientY)) + 'px';
  }

  function closeSpotbox() {
    if (!spotbox) return;
    spotbox.style.display = 'none';
    pendingP = null;
    editingSpot = null;
    if (nameInput) nameInput.readOnly = false;
    if (slugInput) {
      slugInput.readOnly = false;
      slugInput.disabled = false;
    }
    if (spotDeleteBtn) spotDeleteBtn.hidden = true;
    const spotOkBtn = document.getElementById('world-map-spot-ok');
    if (spotOkBtn) spotOkBtn.hidden = false;
  }

  function openSpotForm(p, e) {
    editingSpot = null;
    pendingP = p;
    if (!spotbox) return;
    spotbox.style.display = 'flex';
    positionSpotbox(e);
    if (nameInput) {
      nameInput.value = '';
      nameInput.readOnly = false;
    }
    if (slugInput) {
      slugInput.value = '';
      slugInput.readOnly = false;
      slugInput.disabled = false;
    }
    if (spotDeleteBtn) spotDeleteBtn.hidden = true;
    const spotOkBtn = document.getElementById('world-map-spot-ok');
    if (spotOkBtn) {
      spotOkBtn.hidden = false;
      spotOkBtn.textContent = '登録';
    }
    nameInput?.focus();
  }

  function openSpotEditForm(sp, e) {
    editingSpot = sp;
    pendingP = null;
    if (!spotbox) return;
    spotbox.style.display = 'flex';
    positionSpotbox(e);
    if (nameInput) {
      nameInput.value = sp.name;
      nameInput.readOnly = true;
    }
    if (slugInput) {
      slugInput.value = sp.slug;
      slugInput.readOnly = true;
      slugInput.disabled = true;
    }
    if (spotDeleteBtn) spotDeleteBtn.hidden = false;
    const spotOkBtn = document.getElementById('world-map-spot-ok');
    if (spotOkBtn) spotOkBtn.hidden = true;
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
      closeSpotbox();
      pushHistory();
      if (panel) panel.textContent = 'スポットを登録しました: ' + name;
    };
  }

  if (spotDeleteBtn) {
    spotDeleteBtn.onclick = () => {
      if (!editingSpot) return;
      const label = editingSpot.name || editingSpot.slug;
      if (!confirm('スポット「' + label + '」を削除しますか？\n保存すると Supabase からも消えます。')) return;
      removeSpot(editingSpot);
      closeSpotbox();
      pushHistory();
      setStatus('スポットを削除しました: ' + label);
    };
  }

  if (spotCancelBtn) {
    spotCancelBtn.onclick = () => closeSpotbox();
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
      // 平面ビューは常に北向き固定（立体ビューの角度に連動しない）
      orthoCamera.up.set(0, 0, -1);
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

  let statusTimer = null;
  function setStatus(text, duration = 3000) {
    if (onStatus) onStatus(text);
    if (panel) {
      panel.textContent = text;
      panel.classList.add('is-visible');
      if (statusTimer) clearTimeout(statusTimer);
      statusTimer = setTimeout(() => {
        panel.classList.remove('is-visible');
      }, duration);
    }
  }

  function terrainPayload() {
    return {
      world_id: WORLD_ID,
      layer_id: LAYER_ID,
      seg: SEG,
      heights: Array.from(heights),
      water: Array.from(water),
      water_y: Array.from(waterY),
      ground_mat: Array.from(groundMat),
      area_defs: areas.map((x) => ({ id: x.id, slug: x.slug, name: x.name, color: x.color })),
      area_grid: Array.from(areaGrid),
    };
  }

  function localPayload() {
    return {
      seg: SEG,
      savedAt: Date.now(),
      h: Array.from(heights),
      w: Array.from(water),
      wy: Array.from(waterY),
      gm: Array.from(groundMat),
      ag: Array.from(areaGrid),
      a: areas.map((x) => ({ id: x.id, slug: x.slug, name: x.name, color: x.color })),
      curArea: currentAreaId,
      s: spots.map((s) => {
        const n = worldToNorm(s.x, s.z);
        return { name: s.name, slug: s.slug, x: n.x, z: n.z };
      }),
    };
  }

  function saveLocal() {
    if (readOnly) return true;
    try {
      localStorage.setItem(localKey(), JSON.stringify(localPayload()));
      return true;
    } catch (err) {
      console.warn('localStorage save failed', err);
      return false;
    }
  }

  function readLocalData() {
    try {
      let raw = localStorage.getItem(localKey());
      if (!raw && WORLD_ID === 'hime-memory') {
        raw = localStorage.getItem('banshu_world_map_v2');
      }
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function applyLocalData(d) {
    if (!d) return false;
    if (d.h) loadTerrainFromArrays(d.h, d.w, d.gm, d.wy);
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
  }

  function tryLoadLocal() {
    return applyLocalData(readLocalData());
  }

  async function saveAll() {
    const localOk = saveLocal();
    if (!supabase) {
      setStatus(localOk ? 'ローカルに保存しました（Supabase 未接続）' : '保存失敗: ブラウザの保存容量が足りません');
      return;
    }

    const { data: authData } = await supabase.auth.getSession();
    if (!authData?.session) {
      setStatus(
        localOk ? 'ローカルのみ保存しました（クラウド保存にはログインが必要です）' : '保存失敗: ログインとブラウザ容量を確認してください',
        5000,
      );
      return;
    }

    let { data: savedLayer, error: layerErr } = await supabase
      .from('map_world_layers')
      .upsert(terrainPayload(), { onConflict: 'world_id,layer_id' })
      .select('updated_at')
      .maybeSingle();
    // 新カラム(water_y/ground_mat)が未追加のDBでも保存できるようフォールバック
    if (layerErr && /water_y|ground_mat|column/i.test(layerErr.message || '')) {
      const payload = terrainPayload();
      delete payload.water_y;
      delete payload.ground_mat;
      ({ data: savedLayer, error: layerErr } = await supabase
        .from('map_world_layers')
        .upsert(payload, { onConflict: 'world_id,layer_id' })
        .select('updated_at')
        .maybeSingle());
    }
    if (layerErr) {
      setStatus('地形の保存エラー: ' + layerErr.message + (localOk ? '（ローカルには保存済み）' : ''), 5000);
      return;
    }

    // クラウド保存成功時刻をローカルにも記録（次回起動時の比較用）
    if (savedLayer?.updated_at) {
      try {
        const d = readLocalData() || localPayload();
        d.savedAt = Date.parse(savedLayer.updated_at) || Date.now();
        localStorage.setItem(localKey(), JSON.stringify(d));
      } catch {
        /* localStorage 容量不足でもクラウド保存は成功 */
      }
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

    for (const slug of deletedSpotSlugs) {
      const { error } = await supabase
        .from('map_spots')
        .delete()
        .eq('world_id', WORLD_ID)
        .eq('layer', LAYER_ID)
        .eq('slug', slug);
      if (error) {
        setStatus('スポット削除エラー (' + slug + '): ' + error.message);
        return;
      }
    }
    deletedSpotSlugs.length = 0;

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
      waterY.fill(0);
      groundMat.fill(0);
      areaGrid.fill(0);
      areas.length = 0;
      currentAreaId = 0;
      refreshAreaUI();
      applyHeights();
      clearSpots();
      deletedSpotSlugs.length = 0;
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
    if (grid && grid.length) {
      let g = grid;
      if (grid.length !== N) {
        const srcSeg = inferSeg(grid.length);
        g = srcSeg >= 1 ? resampleGrid(grid, srcSeg, 'nearest') : null;
      }
      if (g) for (let i = 0; i < N; i++) areaGrid[i] = Math.round(g[i]) || 0;
    }
    currentAreaId = areas[0]?.id || 0;
    refreshAreaUI();
    recolor();
  }

  function inferSeg(len) {
    const s = Math.round(Math.sqrt(len)) - 1;
    return (s + 1) * (s + 1) === len ? s : -1;
  }

  // 旧解像度の格子データを現在の解像度(SEG)へリサンプル（地形=bilinear / 水・エリア=nearest）
  function resampleGrid(src, srcSeg, mode) {
    const srcCols = srcSeg + 1;
    const dstCols = SEG + 1;
    const out = new Float32Array(dstCols * dstCols);
    for (let gz = 0; gz < dstCols; gz++) {
      const sz = (gz / SEG) * srcSeg;
      const z0 = Math.floor(sz);
      const z1 = Math.min(srcSeg, z0 + 1);
      const tz = sz - z0;
      for (let gx = 0; gx < dstCols; gx++) {
        const sx = (gx / SEG) * srcSeg;
        const x0 = Math.floor(sx);
        const x1 = Math.min(srcSeg, x0 + 1);
        const tx = sx - x0;
        const i = gz * dstCols + gx;
        if (mode === 'nearest') {
          const nx = tx < 0.5 ? x0 : x1;
          const nz = tz < 0.5 ? z0 : z1;
          out[i] = src[nz * srcCols + nx] || 0;
        } else {
          const a = src[z0 * srcCols + x0] || 0;
          const b = src[z0 * srcCols + x1] || 0;
          const c = src[z1 * srcCols + x0] || 0;
          const d = src[z1 * srcCols + x1] || 0;
          const top = a + (b - a) * tx;
          const bot = c + (d - c) * tx;
          out[i] = top + (bot - top) * tz;
        }
      }
    }
    return out;
  }

  function loadTerrainFromArrays(hArr, wArr, matArr, wyArr) {
    if (!hArr) return false;
    let h = hArr;
    let w = wArr;
    let m = matArr;
    let wy = wyArr;
    if (hArr.length !== N) {
      const srcSeg = inferSeg(hArr.length);
      if (srcSeg < 1) return false;
      h = resampleGrid(hArr, srcSeg, 'bilinear');
      w = wArr && inferSeg(wArr.length) >= 1 ? resampleGrid(wArr, srcSeg, 'nearest') : null;
      m = matArr && inferSeg(matArr.length) >= 1 ? resampleGrid(matArr, srcSeg, 'nearest') : null;
      wy = wyArr && inferSeg(wyArr.length) >= 1 ? resampleGrid(wyArr, srcSeg, 'bilinear') : null;
    }
    for (let i = 0; i < N; i++) {
      heights[i] = h[i] || 0;
      water[i] = w && w[i] > 0.5 ? 1 : 0;
      groundMat[i] = m ? Math.round(m[i] || 0) : 0;
      waterY[i] = wy ? wy[i] || 0 : 0;
    }
    waterDirty = true;
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

  /**
   * Supabase に ground_mat/water_y カラムが無い場合の保険。
   * 同じブラウザのローカル保存から素材(gm)と水位(wy)だけを重ねて復元する。
   */
  function overlayMatWaterYFromLocal() {
    try {
      const d = readLocalData();
      if (!d || (!d.gm && !d.wy)) return false;
      const apply = (arr, mode, target, asInt) => {
        if (!arr) return false;
        let a = arr;
        if (arr.length !== N) {
          const srcSeg = inferSeg(arr.length);
          if (srcSeg < 1) return false;
          a = resampleGrid(arr, srcSeg, mode);
        }
        for (let i = 0; i < N; i++) target[i] = asInt ? Math.round(a[i] || 0) : a[i] || 0;
        return true;
      };
      let changed = false;
      if (d.gm) changed = apply(d.gm, 'nearest', groundMat, true) || changed;
      if (d.wy) changed = apply(d.wy, 'bilinear', waterY, false) || changed;
      if (changed) {
        waterDirty = true;
        applyHeights();
      }
      return changed;
    } catch {
      return false;
    }
  }

  async function loadFromSupabase() {
    if (!supabase) return { loaded: false, updatedAt: 0 };

    let loaded = false;
    let updatedAt = 0;

    let layer = null;
    let layerErr = null;
    ({ data: layer, error: layerErr } = await supabase
      .from('map_world_layers')
      .select('seg, heights, water, water_y, ground_mat, area_defs, area_grid, updated_at')
      .eq('world_id', WORLD_ID)
      .eq('layer_id', LAYER_ID)
      .maybeSingle());

    if (layerErr && /water_y|ground_mat|area_|column/i.test(layerErr.message || '')) {
      ({ data: layer, error: layerErr } = await supabase
        .from('map_world_layers')
        .select('seg, heights, water, area_defs, area_grid, updated_at')
        .eq('world_id', WORLD_ID)
        .eq('layer_id', LAYER_ID)
        .maybeSingle());
    }

    if (layerErr && /area_/.test(layerErr.message || '')) {
      ({ data: layer, error: layerErr } = await supabase
        .from('map_world_layers')
        .select('seg, heights, water, updated_at')
        .eq('world_id', WORLD_ID)
        .eq('layer_id', LAYER_ID)
        .maybeSingle());
    }

    if (layerErr) {
      if (layerErr.code !== 'PGRST116' && !layerErr.message.includes('does not exist')) {
        setStatus('地形読込: ' + layerErr.message);
      }
    } else if (layer && layer.heights) {
      loadTerrainFromArrays(layer.heights, layer.water, layer.ground_mat, layer.water_y);
      if (layer.area_defs || layer.area_grid) {
        loadAreasFromData(layer.area_defs, layer.area_grid);
      }
      if (layer.ground_mat == null || layer.water_y == null) {
        overlayMatWaterYFromLocal();
      }
      updatedAt = layer.updated_at ? Date.parse(layer.updated_at) : 0;
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

    return { loaded, updatedAt };
  }

  async function boot() {
    try {
      applyHeights();
      planZoom = preset().planZoomDefault ?? 1;
      planZoom = Math.max(planZoomMin(), planZoom);
      const remote = await loadFromSupabase();
      const local = readOnly ? null : readLocalData();
      const localAt = local?.savedAt || 0;
      if (local && localAt > remote.updatedAt + 500) {
        applyLocalData(local);
      } else if (!remote.loaded && local) {
        applyLocalData(local);
      }
      setViewMode('3d');
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
        planZoom = Math.min(PLAN_ZOOM_MAX, planZoom * PLAN_ZOOM_FACTOR_KEY);
      }
      if (held.zoomOut || held.altitudeDown) {
        planZoom = Math.max(planZoomMin(), planZoom / PLAN_ZOOM_FACTOR_KEY);
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
      if (held.zoomIn) orbit = Math.max(orbitMin(), orbit * ZOOM_FACTOR_KEY);
      if (held.zoomOut) orbit = Math.min(orbitMax(), orbit / ZOOM_FACTOR_KEY);
    }

    target.x = marginClamp(target.x);
    target.z = marginClamp(target.z);
    updateCam();
    updateScaleMarkerPosition();
    updateShirasagiShadow();
    updateShirasagiAvatar();

    const isMoving = held.up || held.down || held.left || held.right;
    if (shirasagiImg) {
      shirasagiImg.classList.toggle('is-moving', isMoving);
      shirasagiImg.classList.toggle('is-glide', !isMoving && viewMode === '3d');
    }

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
    renderMinimaps();
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
