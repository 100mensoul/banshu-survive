# Claude Fable 5 への世界地図診断 — 投入手順

**前提:** Fable 5 はこのリポジトリ・Cursor の会話・コードを**一切知らない**。  
添付ファイルと初回メッセージだけが情報のすべてになる。

---

## 1. 何を添付するか（推奨セット）

Claude の新規チャット（または Project）で、**最初の1メッセージ**に以下を添付する。

| 順 | ローカルファイル | 役割 | 必須 |
|----|------------------|------|------|
| 1 | `docs/世界地図_ClaudeFable5用_一括資料.md` | 状況＋コード索引＋**重要コード抜粋**（本文に埋め込み済み） | ★★★ |
| 2 | `js/world-map-editor.js` | 実装全文（約5,600行） | ★★★ |
| 3 | `docs/世界地図_セカンドオピニオン用_状況報告書.md` | 詳細な経緯・問い（①の補足） | ★★ |
| 4 | `admin/sql/map-world.sql` | DBスキーマ | ★ |
| 5 | `admin/sql/world-map-river-layers.sql` | 追加カラム | ★ |
| 6 | スクリーンショット PNG 2〜5枚 | 立体幹線・ギザギザ等 | ★★ |

**添付上限に達したら削る順:** ③ → ⑤ → ④（①②＋画像は残す）

**①だけでも議論は可能**（重要コードは一括資料に抜粋済み）。**②があると診断精度が上がる。**

---

## 2. 初回メッセージ（そのままコピペ）

下の ``` ブロックを、添付の**後**に貼る。`【作者メモ】` だけ自分で書き換える。

```
あなたはシニアのインタラクティブメディア／フロントエンドアーキテクトです。

【重要】
あなたは播州サバイブのコードベースにアクセスできません。
添付ファイルだけが事実のすべてです。推測でファイル構造を補完しないでください。
読めていない添付がある場合は、その旨を最初に宣言してください。

【プロジェクト一行】
個人サイト「播州サバイブ」の「世界地図」— Three.js で地形を sculpt し、
物語の場（姫路・播州・コヌイの路）を3D/平面で表現する。作者1人が編集、Supabase 保存。

【添付の読み方】
1. 「一括資料.md」— 全体像・データモデル・関数索引・コード抜粋（まずこれ）
2. 「world-map-editor.js」— 単一巨大モジュールの全文（あれば）
3. 「状況報告書.md」— 3D試行錯誤の経緯・既知バグ・診断してほしい12の問い
4. SQL — map_world_layers / map_spots スキーマ
5. 画像 — 幹線高架の現状ビジュアル

【コードを読む焦点】
- initWorldMapEditor 単一ファイルに編集・閲覧・保存・3Dが全部入っている
- activeLayerId / localKey / zone-4 フォールバック（データ正）
- rebuildHighwayViaduct（グリッド＋ボックス合成の表現限界）
- localStorage と Supabase の優先ルール

【出力してほしいもの】
1. 現状評価（強み・弱み・リスク）各5点以内
2. 3Dマップを続ける場合の推奨アーキテクチャ
3. 3Dを縮小・代替する場合の推奨案
4. 幹線高架：続行 / 凍結 / 別手法 と理由
5. 優先度付きロードマップ（2週間・2ヶ月）
6. 「やめること」「やること」を明確に

【成功の定義】
ゲーム品質は不要。読者に「天川フォーク（道の駅周辺）」の地形感が伝わればよい。

【作者メモ】（※ここを書き換えてから送る）
- 優先順位：
- 使える時間：
- 壊したくないもの：（例：zone-4 の編集データ）
- 参考イメージ：（例：播但連絡道路の高架）

回数が限られているので、この1回で最大の価値を出してください。
```

---

## 3. 添付できないとき（ファイル数・サイズ制限）

### パターン A: JS 全文が添付できない

`一括資料.md` の **付録コード抜粋** だけで送る。初回メッセージに追記:

```
world-map-editor.js は添付できませんでした。
一括資料内のコード抜粋と関数索引だけを根拠に診断してください。
全文が必要な箇所は「追加で貼るべき行範囲」を具体的に指示してください。
```

### パターン B: zip にまとめる（推奨・手順）

#### B-1. ターミナルで作る（コピペ可）

```bash
cd /Users/ootsukaumihei/Desktop/100mensoul-search/banshu-survive

zip -r docs/world-map-fable5.zip \
  "docs/世界地図_ClaudeFable5用_一括資料.md" \
  "docs/世界地図_ClaudeFable5用_投入手順.md" \
  "docs/世界地図_セカンドオピニオン用_状況報告書.md" \
  "docs/世界地図_セカンドオピニオン用_コード付録.md" \
  "js/world-map-editor.js" \
  "admin/sql/map-world.sql" \
  "admin/sql/world-map-river-layers.sql"
```

完成ファイル: `docs/world-map-fable5.zip`（約70KB・7ファイル）

デスクトップに置きたい場合:

```bash
cp docs/world-map-fable5.zip ~/Desktop/
```

#### B-2. Finder で作る

1. 次のファイルを **1つのフォルダ** にコピー（例: デスクトップに `world-map-fable5` フォルダ）
   - 上記 zip に入っている7ファイル
2. フォルダを右クリック → **「"world-map-fable5"を圧縮」**
3. できた `world-map-fable5.zip` を Claude に添付

#### B-3. スクリーンショットを入れる

画像は zip に入れてもよいが、**別添付の方が見やすい**ことが多い。

```bash
# 画像フォルダも一緒に入れる例
zip -r docs/world-map-fable5-with-images.zip \
  docs/world-map-fable5.zip の中身と同じファイル \
  /path/to/screenshots/*.png
```

または Claude へ **zip 1つ ＋ 画像を別で2〜5枚** 添付。

#### B-4. Claude への送り方

1. claude.ai で新規チャット（Fable 5 を選択）
2. 📎 で `world-map-fable5.zip` を添付
3. 画像があれば **別途** 添付
4. セクション2の **初回メッセージ** を貼る（zip用に1行追記）:

```
添付は zip 1つです。中身を展開してすべて読んでから診断してください。
含まれるファイル: 一括資料.md, 状況報告書.md, world-map-editor.js, SQL など。
```

5. 送信後、返答の冒頭で「zip内の○○を読んだ」と書いてあるか確認。  
   読めていないと言われたら、**個別ファイルを追加添付**する。

#### B-5. zip が受け付けられないとき

Claude のUIやプランによって zip 非対応のことがある。その場合:

- zip を展開して **md と js を個別に** 添付（5〜7ファイル）
- または `world-map-editor.js` だけ別メッセージで送る（回数消費）

### パターン C: 2回に分ける（非推奨・回数がもったいない）

1回目: 一括資料＋状況報告書＋プロンプト  
2回目: 「前の続き。world-map-editor.js 全文です」＋ JS 貼付

→ **1回で済ませる方がよい。**

---

## 4. Claude Project を使う場合

1. Project を新規作成（例: `播州サバイブ・世界地図診断`）
2. Project Knowledge に **①②③④⑤** を登録（会話をまたいで参照される）
3. チャットで上記 **初回メッセージ** ＋ 画像だけ送る

→ 2回目以降のフォローアップでもコードを再送しなくてよい。

---

## 5. よくあるミス

| ミス | 結果 |
|------|------|
| 状況報告書だけ送る | コードの実態が伝わらず一般論になる |
| 「前のスレッド参照」 | Fable は見えない |
| 「リポジトリ見て」 | 見えない |
| JS なし＋抜粋もなし | 高架・同期の診断が薄い |
| 画像なし | ギザギザ・板張り問題の深刻度が伝わらない |

---

## 6. ファイルの場所（フルパス）

```
/Users/ootsukaumihei/Desktop/100mensoul-search/banshu-survive/docs/世界地図_ClaudeFable5用_一括資料.md
/Users/ootsukaumihei/Desktop/100mensoul-search/banshu-survive/docs/世界地図_セカンドオピニオン用_状況報告書.md
/Users/ootsukaumihei/Desktop/100mensoul-search/banshu-survive/js/world-map-editor.js
/Users/ootsukaumihei/Desktop/100mensoul-search/banshu-survive/admin/sql/map-world.sql
/Users/ootsukaumihei/Desktop/100mensoul-search/banshu-survive/admin/sql/world-map-river-layers.sql
```

---

*初回メッセージのテンプレは `一括資料.md` 末尾にも同文を載せています。*
