# 播州サバイブ「世界地図」— Claude Fable 5 用 一括資料

> **このドキュメントだけでは実装全文は含まれない。**  
> 可能なら同梱の `world-map-editor.js`（約5,600行）を必ず添付すること。  
> 添付できない場合は、本文 **付録B〜F** のコード抜粋を根拠とする。

**リポジトリ:** `banshu-survive`（個人ストーリーテリングサイト）  
**版:** 2026-07-06 時点（JS `?v=81`）

---

# 第1部：状況（プロダクト・経緯）

## 1.1 世界地図の目的

- 姫路・播州の地理を **sculpt**（掘る・盛る・水・道・樹・スポット）して物語の「場」を可視化
- 3つのスケール: **コヌイの路**（~1km）、**ヒメモリの地**（姫路広域）、**ニューハリマ**（播磨全域）
- **管理:** `admin/world-map-editor.html`（Supabaseログイン・編集可）
- **公開:** `html/world-map.html`（`readOnly: true`）

## 1.2 なぜ3Dを試したか

- 平面だけでは「天川フォーク」「川と幹線の立体交差」が伝わりにくい
- Google Maps スクショを**編集画面のみ**下絵トレース
- 幹線道路（播但連絡的な高架）を立体メッシュで表現（案B: 路面高データ → 案C: 別メッシュ）

## 1.3 現在の悩み（診断の核心）

| 問題 | 状態 |
|------|------|
| 幹線の縁がギザギザ | グリッド＋セル単位ボックスの限界。中心線・固定幅で改善試行中 |
| お風呂マット／板張り | 板張り＋溝に変更済みだが完璧ではない |
| 単一巨大JS | ~5,600行、テストなし、リファクタ困難 |
| データ同期 | zone-4（フォークノード）と `hirao` 層の不整合、localStorage優先ルール |
| 回数制限 | **Fable 5 への1回で方針を決めたい** |

## 1.4 診断してほしい問い

1. 3Dマップ制作を続けるべきか、平面＋シンボルに戻すべきか  
2. 単一JSをどう分割するか  
3. 幹線高架を続行・凍結・別手法のどれにするか  
4. localStorage vs Supabase の「正」をどう設計するか  
5. 作者1人・週数時間で次の2週間に何をやるべきか  

（詳細な12問は `世界地図_セカンドオピニオン用_状況報告書.md` に記載）

---

# 第2部：アーキテクチャ

## 2.1 技術スタック

- **Three.js** 0.160（CDN importmap）
- **Supabase** JS v2（地形レイヤー `map_world_layers`、スポット `map_spots`）
- **localStorage** 即時保存＋下絵トレース（クラウド非同期）
- **バンドラーなし** — `export function initWorldMapEditor({ supabase, onStatus, readOnly, defaultPreset })`

## 2.2 ファイル構成

| ファイル | 役割 |
|----------|------|
| `js/world-map-editor.js` | **すべて**（地形・ツール・3D・保存・UI） |
| `css/world-map.css` | スタイル |
| `admin/world-map-editor.html` | 管理UI |
| `html/world-map.html` | 公開UI |
| `admin/sql/map-world.sql` | DB初期 |
| `admin/sql/world-map-river-layers.sql` | water_y, ground_mat, highway_deck 追加 |

## 2.3 実行時の分岐

```javascript
// 管理
initWorldMapEditor({ supabase, onStatus, readOnly: false, defaultPreset: 'konui-michi' });
// 公開
initWorldMapEditor({ supabase, onStatus: () => {}, readOnly: true, defaultPreset: 'hime-memory' });
```

---

# 第3部：データモデル

## 3.1 地形配列（頂点 N = (SEG+1)²）

| 配列 | 意味 |
|------|------|
| `heights` | 地形Y |
| `water` / `waterY` | 水マスク / 水面絶対Y |
| `groundMat` | 0=自動, 1=土, 2=草, 3=コンクリ, 4=道路, **5=幹線** |
| `highwayDeckH` | 幹線路面高（0=地上） |

## 3.2 プリセット（抜粋）

| world_id | 名称 | seg | metersPerUnit | 感覚 |
|----------|------|-----|---------------|------|
| konui-michi | コヌイの路 | 480 | **2** | 1マス≈50m |
| hime-memory | ヒメモリの地 | 200 | 16 | 数百m |
| new-harima | ニューハリマ | 160 | 240 | 数km |

## 3.3 コヌイ4ゾーン

| id | 名称 | 備考 |
|----|------|------|
| zone-1 | 約束の地 | ツインコモンズ |
| zone-2 | 緑の子午線 | 372号 |
| zone-3 | フラワーゲート | 花田IC |
| **zone-4** | **フォークノード** | 道の駅・天川。**旧データの移行先** |

## 3.4 layer_id と localStorage

```
layer_id:  hirao | hirao-zone-N | hirao-overview
           （LAYER_ID 定数 = 'hirao'、world_id とは別）

localKey:  banshu_world_map_v3_{worldId}_{zoneId}
legacy:    banshu_world_map_v3_konui-michi → zone-4 へ移行
```

## 3.5 localStorage ペイロード（短縮キー）

```javascript
{ seg, savedAt, h, w, wy, gm, hd, ag, a, s, t }
// h=heights, gm=groundMat, hd=highwayDeckH, s=spots(0-1), t=trees
```

## 3.6 Supabase

`map_world_layers`: world_id, layer_id, seg, heights, water, water_y, ground_mat, highway_deck, area_*, vegetation, updated_at

`map_spots`: world_id (default 'banshu-main'≠実行時), layer (default 'hirao'), slug, x,z in 0-1

---

# 第4部：機能一覧（実装済み）

**ツール:** 盛る/削る/消す、川を掘る、水、地面を盛る（堤防的）、道路、**幹線**、樹、スポット、エリア塗り、見る

**表示:** 平面（正射影・幹線縁取り）/ 立体（パース・水面・樹・高架）

**コヌイ:** 俯瞰平面→ゾーン詳細3D、下絵トレース（localStorageのみ）、ミニマップ

**幹線:** 路面高0-20m、幹線色・橋桁色、立体で `rebuildHighwayViaduct()`

**未実装:** 橋脚柱、スポット深いリンク、road_styles/trace のクラウド同期、Phase2公開導線の完成

---

# 第5部：関数索引（world-map-editor.js）

| 関数 | 行(approx) | 役割 |
|------|------------|------|
| `initWorldMapEditor` | 250 | 唯一のexport |
| `activeLayerId` | 813 | layer_id決定 |
| `localKey` | 863 | LSキー |
| `migrateKonuiLegacyLocal` | 823 | 旧データ→zone-4 |
| `buildTerrain` | 1506 | メッシュ生成 |
| `applyHeights` | 2791 | 反映＋高架再構築 |
| `rebuildHighwayViaduct` | 1983 | **高架メッシュ** |
| `mergeUnitBoxes` | 1771 | 回転ボックス統合 |
| `paintHighwayAt` | 3567 | 幹線ブラシ |
| `saveAll` | 5018 | LS+Supabase |
| `fetchMapLayerRow` | 5357 | 段階的SELECT |
| `loadFromSupabase` | 5396 | 読込+zone-4フォールバック |
| `boot` | 5455 | 起動 |

---

# 付録A：幹線高架パイプライン（疑似コード）

```
viewMode === '3d' のときのみ:
for each elevated highway cell:
  if !isHighwayCenterline → skip（路面は中心線のみ v81〜）
  deckWidth = roadWidthMeters（固定）+ 余白
  appendHighwayDeckPlanks（スラブ + 進行方向の板 + 暗い溝）
  girderSites（28m間隔、幅50%、rotY=theta=道路に直角）

mergeUnitBoxes → Mesh（幹線色 / 溝色 / 橋桁色）
※ 橋脚（柱）は未実装
```

---

# 付録B：定数・プリセット（抜粋）

```javascript
const LAYER_ID = 'hirao';
const KONUI_LEGACY_ZONE_ID = 'zone-4';

const HIGHWAY_DECK_THICKNESS_M = 1.5;
const HIGHWAY_PILLAR_SPACING_M = 28;  // 橋桁間隔（柱なし）
const HIGHWAY_GIRDER_SLICE_M = 4;
const HIGHWAY_GIRDER_WIDTH_RATIO = 0.5;
const HIGHWAY_PLANK_WIDTH_M = 1.0;
const HIGHWAY_PLANK_GAP_M = 0.1;
const MAT_HIGHWAY = 5;

const DEFAULT_ROAD_STYLES = {
  roadColor: '#858c94',
  highwayColor: '#c9b07a',
  highwayGirderColor: '#5c636b',
  highwayOutline: true,
  highwayDeckMeters: 10,
};

// konui-michi プリセット
// size: 500, sizeZ: 580, seg: 480, metersPerUnit: 2, gridCell: 25
```

---

# 付録C：レイヤー・保存キー（抜粋）

```javascript
function activeLayerId() {
  if (isKonuiZoned() && currentZoneId) return `${LAYER_ID}-${currentZoneId}`;
  if (isKonuiZoned() && konuiOverviewMode) return `${LAYER_ID}-overview`;
  return LAYER_ID;
}

function localKey() {
  const base = `banshu_world_map_v3_${WORLD_ID}`;
  if (isKonuiZoned() && currentZoneId) return `${base}_${currentZoneId}`;
  if (isKonuiZoned() && konuiOverviewMode) return `${base}_overview`;
  return base;
}

function migrateKonuiLegacyLocal() {
  const base = 'banshu_world_map_v3_konui-michi';
  const z4Key = `${base}_${KONUI_LEGACY_ZONE_ID}`;
  if (legacy && !localStorage.getItem(z4Key)) localStorage.setItem(z4Key, legacy);
  // zone-1 に誤移行した分も zone-4 へ
}
```

---

# 付録D：クラウド読込（抜粋）

```javascript
async function fetchMapLayerRow(layerId) {
  const selects = [
    'seg, heights, water, water_y, ground_mat, highway_deck, vegetation, ...',
    'seg, heights, water, water_y, ground_mat, ...',
    'seg, heights, water, ...',  // カラム欠損DB用に段階的フォールバック
  ];
  // PGRST116 → null（行なし）
}

async function loadFromSupabase() {
  const layerIds = [activeLayerId()];
  if (zone-4) layerIds.push('hirao');  // 旧層フォールバック
  for (const layerId of layerIds) {
    const layer = await fetchMapLayerRow(layerId);
    if (layer?.heights) { applyMapLayerRow(layer); mergeMatWaterYFromLocal(...); break; }
  }
}
```

---

# 付録E：保存（抜粋）

```javascript
function terrainPayload() {
  return {
    world_id: WORLD_ID,
    layer_id: activeLayerId(),
    seg: SEG,
    heights: Array.from(heights),
    water: Array.from(water),
    water_y: Array.from(waterY),
    ground_mat: Array.from(groundMat),
    highway_deck: Array.from(highwayDeckH),
    area_defs: [...], area_grid: [...], vegetation: [...],
  };
}

async function saveAll() {
  saveLocal();  // localStorage
  supabase.from('map_world_layers').upsert(terrainPayload(), ...);
  // water_y/ground_mat/highway_deck カラムなしDB → それらを除いてリトライ
}
```

---

# 付録F：幹線ブラシ＋高架再構築（抜粋）

```javascript
function paintHighwayAt(p) {
  const useDeck = highwayDeckMeters > 0.01;
  for (each cell in brush) {
    groundMat[i] = MAT_HIGHWAY;
    highwayDeckH[i] = useDeck ? metersToUnits(highwayDeckMeters) : 0;
  }
}

function rebuildHighwayViaduct() {
  // ... 省略: clear meshes
  const deckWidthU = metersToUnits(roadWidthMeters) + cell * 0.25;
  for (let i = 0; i < N; i++) {
    if (!elevatedHighwayAtIndex(i, deckMinY)) continue;
    const theta = smoothedHighwayAngle(gx, gz, cols, deckMinY);
    if (!isHighwayCenterline(gx, gz, cols, theta, deckMinY)) continue;
    appendHighwayDeckPlanks(x, z, theta, deckWidthU, cell * 2.35, ...);
    // girderSites 収集（28m間隔）
  }
  // deck + groove + girder meshes（girder: sx=width*0.5, rotY=theta）
}
```

---

# 付録G：SQL（全文）

```sql
-- map-world.sql 要約
create table map_world_layers (
  world_id text, layer_id text, seg int,
  heights jsonb, water jsonb, area_defs jsonb, area_grid jsonb,
  vegetation jsonb, updated_at timestamptz,
  primary key (world_id, layer_id)
);
create table map_spots (
  world_id text default 'banshu-main',
  layer text default 'hirao',
  slug text, name text, x double precision, z double precision,
  unique (world_id, layer, slug)
);

-- world-map-river-layers.sql
alter table map_world_layers
  add column if not exists water_y jsonb,
  add column if not exists ground_mat jsonb,
  add column if not exists highway_deck jsonb;
```

---

# 初回メッセージ（Fable 5 にコピペ）

`世界地図_ClaudeFable5用_投入手順.md` と同文。要約:

1. コードベースにアクセスできないことを明記  
2. 添付の読み順を指示  
3. 出力形式6項目を要求  
4. 【作者メモ】を自分で書く  

---

*詳細経緯・画像説明・12の問い → `世界地図_セカンドオピニオン用_状況報告書.md`*  
*投入チェックリスト → `世界地図_ClaudeFable5用_投入手順.md`*
