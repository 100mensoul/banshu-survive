# 2026-04-17 — あらすじページ `html/arasuji.html` + `css/arasuji.css`

**作業日（記録ベース）:** 2026-04-17 前後（当時の `docs/開発引き継ぎ.md` から移した詳細）

---

## 1. フラグメント（`#`）ジャンプと flex 縦中央のずれ対策

- `.arasuji-narrative` の `padding-top` をやめ、セクションは **`margin-top`**、各 **`arasuji-narrative__screenful`** に `padding-top` を移した。
- **`100svh` は削除**し、`100vh` → **`100dvh`** のみを使う方針にした。
- アンカー用の **`id` は「外側の screenful」** に付与（`#arasuji-narrative-part1` / `#arasuji-narrative-part3`）。
- `#arasuji-narrative-part1` と `#arasuji-narrative-part3` は **`scroll-margin-top: 0`**。part2 / part4 は `0.85rem`。

---

## 2. 1画面目（故郷〜原風景）

- `screenful--first` + `first-stack` + chunk×2 + **単一↓**（`arasuji-scroll-hint__stack--single`）。
- 内側クラス名は **`arasuji-narrative__first-stack`**（`first-center` などと混同しないこと）。

---

## 3. 2画面目（節目〜道の駅）

- **`arasuji-narrative__screenful--centered`** を追加（`--first` と同じ縦中央・`padding-top: 0`）。
- 構造は 1画面目と同型：`screenful#part3` → `first-stack` → chunk×2 → 次章への矢印。

---

## 4. 矢印

- 節目ブロック → part4 の矢印を **二重シェブロンから単一**に変更した。
- `arasuji.css` のクエリは更新のたびに **`?v=` をインクリメント**（キャッシュ対策）。**当時の記載例: `?v=43`**（現在の値は `html/arasuji.html` を実物で確認すること）。

---

## キャッシュバスター（このページの慣習）

- あらすじの見た目や **`css/arasuji.css`** を直したら、**必ず `html/arasuji.html` の `arasuji.css?v=` をインクリメント**する。変更内容とセットで **日付ログ**に「いくつに上げたか」を残す。

---

## その他アセット（当時メモ）

- 桜: `css/sakura-petals.css` / `js/sakura-petals.js`（ヒーローパネル内 `#arasuji-sakura`）。

---

## 次回やる候補（未着手・任意・当時からの転記）

- **ファーストビュー「本文へ」矢印**は、現状まだ **二重シェブロン**の可能性あり。本文と揃えて単一にするかは好みで判断。
- **アンカー + `scrollIntoView({ block: 'start' | 'center', behavior: 'smooth' })`** の JS を足すと、モバイル Safari 等での位置のブレをさらに抑えられる（CSS だけの限界の補助）。
- **part4「今しかない…」** を、必要なら `screenful` + `centered` で他ブロックと揃える。
