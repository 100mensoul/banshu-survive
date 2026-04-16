# 引き継ぎ書：CMS（Supabase）・高札場・ひめじん

**記載日:** 2026-04-17（就寝前メモ用）  
**記載時点の main:** `bb05288` 付近（確実には `git log -1` で確認）

Cursor スレッドが消えても、このファイルと `js/supabase-public-config.js` があれば作業を再開できます。

---

## 1. 何をしたか（ざっくり）

- **Supabase** で「高札場ニュース」「ひめじん（人物）」「種族説明」「姫路クラン辞典」を **新規・編集・削除** できるようにした。
- **公開サイト**は `js/supabase-public-config.js` の URL / anon キーで読む（RLS 前提）。
- **トップの播州事変（高札場）**は `news_posts` と `episodes` を **`js/home-news-public.js`** でまとめて描画。レイアウトは **`css/news.css`** の瓦版まわりを何度か調整済み（右寄せ・横スクロール・上揃え）。

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
| `himejin_profiles` | 人物（`slug`・種族・**`clan_code` は任意で1つ**・紹介文・写真URL 等） |

**SQL ファイル**

- 新規／フル構築: `admin/sql/content-cms.sql`  
- 既に旧スキーマだけ入っている DB 向け: `admin/sql/content-cms-migration-phase2-clans-glossary.sql`  
- 実行後は Supabase の Table Editor で RLS・データを確認。

---

## 4. 管理画面（ブックマーク用・本番 URL 例）

ベース: `https://100mensoul.github.io/banshu-survive/admin/`

| 画面 | ファイル |
|------|----------|
| 高札場ニュース | `admin/news-editor.html` |
| 種族説明 | `admin/tribes-editor.html` |
| 姫路クラン | `admin/clan-editor.html` |
| ひめじん | `admin/himejin-editor.html` |
| エピソード（従来） | `admin/episodes-editor.html` |

ログインは **Supabase の Auth ユーザー**（メール／パスワード）。公開ページに管理へのリンクは **意図的に出していない**。

---

## 5. 公開ページ（主要）

| ページ | パス | メモ |
|--------|------|------|
| トップ | `index.html` | 高札場 = `home-news-public.js` + `kawara-scroll-mobile.js` |
| ひめじんファイル | `html/himejin.html` | タイル＋モーダル、`himejin-public.js` |
| 種族・クラン辞典 | `html/himejin-glossary.html` | `himejin-glossary-public.js` |

---

## 6. 高札場の並び・レイアウト（トラブル時）

- **DOM の順:** `[エピソード札（古→新）][ニュース札（古→新）]`。視覚的に **右＝新しい** 側に寄せたいので、初期スクロールは **`scrollKawaraToNewestEnd`**（`js/kawara-scroll-mobile.js`）で `scrollLeft` を最大に。
- **CSS:** `.scroll-container--kawara` は **`display: flex` + `justify-content: flex-end` + `align-items: flex-start`**。昔の **`text-align: right` だけのやり方は廃止**（下に見える・横スクロール不調の原因になった）。
- **ニュースの `sort_order`:** 小さいほど左（ニュース同士の並び）。同じ値なら `happened_on` が古いほど左。詳細は管理画面ラベル参照。
- **キャッシュ:** `index.html` の `main.css?v=` と `home-news-public.js?v=` を上げると確実。

---

## 7. 設定ファイル

- **`js/supabase-public-config.js`** — Project URL と anon キー（公開用。RLS で制限前提）。
- 例・ローカル用: `js/supabase-public-config.example.js`

---

## 8. 残タスク・メモ（任意）

- 風土記 `guide0503.html#himeji-clans` と辞典 `himejin-glossary.html` の役割分担は、今後のリライトで整理してよい。
- `docs/news-kawara-design-baseline.md` に古い `news-recent-episodes.js` 記述が残っていれば、実体は `home-news-public.js` に統合済みなので追記修正してよい。
- ひめじんの UI（タイル・モーダル）やクラン説明の増分は、運用しながら調整でよい。

---

## 9. 続きの指示の出し方（Cursor 用）

新しいチャットで例えば次のように書くと復帰しやすいです。

> `docs/引き継ぎ_CMS_Supabase.md` と現状の `main` を前提に、（やりたいこと）を続けて。

---

*このファイルは Git 管理。更新したら意味のある単位で commit 推奨。*
