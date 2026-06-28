# 引き継ぎ書：CMS（Supabase）・高札場・ひめじん・相関図

**記載日:** 2026-05-17（相関図 CMS 追記・本フォルダへ移動）  
**記載時点の main:** `037cecd` 付近（確実には `git log -1` で確認）

**配置:** このファイルは **`docs/引き継ぎフォルダ/`** 内に置く（マスター・日付ログと同じ場所）。  
相関図の UI 変更の細部は → [`2026-05-16-相関図CMSとひめじん演出.md`](./2026-05-16-相関図CMSとひめじん演出.md)

Cursor スレッドが消えても、このファイルと `js/supabase-public-config.js` があれば CMS 作業を再開できます。

---

## 1. 何をしたか（ざっくり）

- **Supabase** で次を **新規・編集・削除** できるようにした。
  - 高札場ニュース、ひめじん（人物）、種族説明、姫路クラン辞典
  - **相関図のグループ・登場人物**（2026-05-16 追加）
- **公開サイト**は `js/supabase-public-config.js` の URL / anon キーで読む（RLS 前提）。
- **トップの播州事変（高札場）**は `news_posts` と `episodes` を **`js/home-news-public.js`** で描画。
- **相関図**は `cast_chart_*` を **`js/chart-cast-public.js`** で読み、**`js/chart-page.js`** が UI を描画。未設定時は **`js/chart-cast-data.js`** にフォールバック。

---

## 2. リポジトリ・デプロイ

| 項目 | 内容 |
|------|------|
| リポジトリ | `100mensoul/banshu-survive` |
| デプロイ | `git push origin main` → GitHub Pages 反映は数十秒〜数分 |

---

## 3. Supabase テーブル（正本）

| テーブル | 用途 |
|----------|------|
| `news_posts` | トップ高札場ニュース（タイトル・本文・リンク・日付・`sort_order`・公開状態） |
| `episodes` | エピソード（既存。高札場に札として出る） |
| `tribe_descriptions` | 種族の見出し＋本文（`code` 自由追加可、`sort_order`） |
| `clan_descriptions` | 姫路クラン1行1件（`code`・見出し・本文・`sort_order`） |
| `himejin_profiles` | ひめじんファイル用の人物（`slug`・種族・**`clan_code` は任意で1つ**・紹介文・写真URL 等） |
| `cast_chart_groups` | **相関図**のグループ（`code`, `title`, `theme` 色, `sort_order`, `status`） |
| `cast_chart_members` | **相関図**の登場人物（`slug`, `group_code`, 名前・役割・`photo_url`・`bio`・`featured` 等） |

**ひめじんと相関図の関係**

- **別テーブル**。ひめじん CMS に載せた人物を相関図に自動では出ない。
- 相関図に載せたい人物は **`cast-editor`** で追加（または phase3 SQL の初期データを編集）。

**SQL ファイル（実行順の目安）**

| ファイル | 向け |
|----------|------|
| `admin/sql/content-cms.sql` | 新規／フル構築 |
| `admin/sql/content-cms-migration-phase2-clans-glossary.sql` | 旧スキーマのみの DB |
| `admin/sql/content-cms-migration-phase3-cast-chart.sql` | **phase2 済み**の DB に相関図テーブル＋初期データ |

実行後は Supabase の Table Editor で RLS・データを確認。

**初期グループ（phase3 同梱）:** `narrator-core`（語り手と主役）, `r-family`, `himeji-light`, `brew-sound`, `town-edge`

---

## 4. 管理画面（ブックマーク用・本番 URL 例）

ベース: `https://100mensoul.github.io/banshu-survive/admin/`

| 画面 | ファイル |
|------|----------|
| 高札場ニュース | `admin/news-editor.html` |
| 種族説明 | `admin/tribes-editor.html` |
| 姫路クラン | `admin/clan-editor.html` |
| ひめじん | `admin/himejin-editor.html` |
| **相関図・登場人物** | **`admin/cast-editor.html`** |
| エピソード（従来） | `admin/episodes-editor.html` |

各 editor のツールバーから他画面へ相互リンクあり。

ログインは **Supabase の Auth ユーザー**（メール／パスワード）。公開ページに管理へのリンクは **意図的に出していない**。

**cast-editor 利用前:** `content-cms-migration-phase3-cast-chart.sql` を Supabase SQL Editor で実行すること。

---

## 5. 公開ページ（主要）

| ページ | パス | 読み込み JS 等 |
|--------|------|----------------|
| トップ | `index.html` | 高札場 = `home-news-public.js` + `kawara-scroll-mobile.js` |
| **相関図** | **`html/chart.html`** | `chart-cast-public.js` → `chart-page.js`（静的時 `chart-cast-data.js`） |
| ひめじんファイル | `html/himejin.html` | `himejin-public.js`（タイル・モーダル・今日のひめじん） |
| 種族・クラン辞典 | `html/himejin-glossary.html` | `himejin-glossary-public.js` |

**相関図の注意**

- ナビ表記は **「相関図」**（旧「登場人物・相関図」から変更済み）。
- 全体図 `images/chart.png` は **手差し差し替え**（CMS 未対応）。人物カード・モーダルは CMS。
- 旧 `html/cast.html` は残存するがナビからはリンクしない。

---

## 6. 高札場の並び・レイアウト（トラブル時）

- **DOM の順:** `[エピソード札（古→新）][ニュース札（古→新）]`。視覚的に **右＝新しい** 側に寄せたいので、初期スクロールは **`scrollKawaraToNewestEnd`**（`js/kawara-scroll-mobile.js`）で `scrollLeft` を最大に。
- **CSS:** `.scroll-container--kawara` は **`display: flex` + `justify-content: flex-end` + `align-items: flex-start`**。
- **ニュースの `sort_order`:** 小さいほど左。同じ値なら `happened_on` が古いほど左。
- **キャッシュ:** `index.html` の `main.css?v=` と `home-news-public.js?v=` を上げる。

---

## 7. 相関図 CMS（トラブル時）

- **公開に出ない:** `cast_chart_groups` / `cast_chart_members` の `status` が **`published`** か確認。
- **何も出ない（ローカル）:** `js/supabase-public-config.js` が未設定なら **`chart-cast-data.js`** の静的データが使われる。本番は Supabase 優先。
- **写真が壊れる:** `photo_url` が空または 404 のとき、プレースホルダー（頭文字＋「写真準備中」）に切替（`chart-page.js`）。
- **モーダルにプロフィールリンクは出さない**（`profile_href` 列は DB に残るが UI 非表示）。
- **キャッシュ:** `html/chart.html` の `chart-page.css?v=` / `chart-cast-public.js?v=` / `chart-page.js?v=` 等を上げる。

---

## 8. 設定ファイル

- **`js/supabase-public-config.js`** — Project URL と anon キー（公開用。RLS で制限前提）。
- 例・ローカル用: `js/supabase-public-config.example.js`

---

## 9. 残タスク・メモ（任意）

- 風土記 `guide0503.html#himeji-clans` と辞典 `himejin-glossary.html` の役割分担は、今後のリライトで整理してよい。
- `docs/news-kawara-design-baseline.md` に古い `news-recent-episodes.js` 記述が残っていれば、実体は `home-news-public.js` に統合済みなので追記修正してよい。
- **相関図画像（`chart.png`）の CMS 化**は未実装（理想として相談中）。
- **`html/cast.html`** の整理・リダイレクトは未決。

---

## 10. 続きの指示の出し方（Cursor 用）

新しいチャットで例えば次のように書くと復帰しやすいです。

> `@docs/引き継ぎフォルダ` を読み、CMS は `引き継ぎ_CMS_Supabase.md`、相関図の細部は `2026-05-16-相関図CMSとひめじん演出.md` を前提に、（やりたいこと）を続けて。

---

*このファイルは Git 管理。更新したら意味のある単位で commit 推奨。*
