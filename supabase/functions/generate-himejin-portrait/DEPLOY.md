# generate-himejin-portrait — デプロイ手順（フェーズB）

ひめじん管理画面から Replicate `black-forest-labs/flux-1.1-pro` で肖像候補を生成する Edge Function です。

## 前提

- フェーズA 済み: `himejin-portraits` バケット、`himejin_profiles` の `image_*` 列
- [Supabase CLI](https://supabase.com/docs/guides/cli) がインストール済み
- Replicate API トークン取得済み

## 1. Supabase CLI でログイン・リンク

```bash
cd /path/to/banshu-survive
supabase login
supabase link --project-ref <あなたのプロジェクトID>
```

## 2. シークレット設定

```bash
supabase secrets set REPLICATE_API_TOKEN=r8_xxxxxxxx
```

`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` は Edge Function 実行時に自動注入されます。

## 3. 関数デプロイ

```bash
supabase functions deploy generate-himejin-portrait
```

## 4. 動作確認

### 未認証 → 401

```bash
curl -i -X POST \
  "$SUPABASE_URL/functions/v1/generate-himejin-portrait" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"profile_id":"test","prompt":"test"}'
```

`401 Unauthorized` が返れば OK。

### 管理画面

1. `admin/himejin-editor.html` にログイン
2. 保存済み人物を選択
3. プロンプト確認 → **AIで肖像を生成**
4. 候補プレビュー → **採用**（この時点で `photo_url` が更新される）

## レート制限

同一 JWT ユーザーあたり **1分間に5回** まで（暴走事故防止）。超過時は `429`。

## ストレージパス

| 用途 | パス |
|------|------|
| 候補（生成直後） | `portraits/{profile_id}/candidates/{uuid}.webp` |
| 採用後（公開） | `portraits/{profile_id}/current.webp` |

`real_name` はパス・プロンプト・ログに含めません。

## トラブルシュート

| 症状 | 確認 |
|------|------|
| `Server configuration incomplete` | `REPLICATE_API_TOKEN` が secrets に設定されているか |
| `Replicate request failed` | トークン有効性・Replicate 残高 |
| CORS エラー | 関数がデプロイ済みか、`__SB_URL` が正しいか |
| Storage upload failed | `himejin-portraits` バケットとポリシー |
