# はりまノはれま — プロトタイプ v1（復元用メモ）

**確定日:** 2026-05-29  
**概要:** トップ「播州事変」と「公式SNS」の間。15列・行優先。背景 `taue.jpg`。マス色はややポップ（黄〜オレンジ・濃青）。

## v1 に戻す手順

1. `css/harima-harema.css` を次で上書き:
   ```bash
   cp css/harima-harema.prototype-v1.css css/harima-harema.css
   ```
2. `index.html` の `main.css?v=` を1つ上げる（キャッシュ対策）。
3. 背景を v1（田植え写真）に戻す場合は、`.harima-harema__bg` の `url` が `../images/taue.jpg` であることを確認。

## v1 のファイル一覧

| ファイル | 役割 |
|----------|------|
| `css/harima-harema.prototype-v1.css` | v1 スタイルのスナップショット |
| `css/harima-harema.css` | 本番読み込み（v2 以降はここを更新） |
| `js/harima-harema.js` | グリッド・モーダル（v1/v2 共通） |
| `index.html` | セクション HTML |
| `images/taue.jpg` | v1 背景 |

## v2（2026-05-29）

- 背景: `images/harima-harema-bg-aerial.png`（上原田付近・航空写真）
- マス: 半透明・低彩度のシックトーン

## v3（2026-05-29）

- **暦の考え方:** 5/25＝田植え開始。準備／本番の分割をやめ、5/25〜9/25 をひと続き（124日・15列×9行弱）
- ラベル・凡例・リード文を削除。グリッド下地（薄グレーパネル）なし
- 未来のマスは透明（航空写真がそのまま見える）
- 全幅レイアウト（max-width 720px 廃止）
