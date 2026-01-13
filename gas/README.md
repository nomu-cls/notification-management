# GAS (Google Apps Script) セットアップガイド

## 概要
このGASスクリプトは、Googleフォームの送信をトリガーにVercel APIへWebhookを送信します。

## セットアップ手順

### 1. Apps Scriptを開く
1. 対象のGoogleスプレッドシートを開く
2. `拡張機能` > `Apps Script` をクリック

### 2. スクリプトを設置
1. `webhook-trigger.js` の内容をコピー
2. Apps Scriptエディタに貼り付け
3. ファイル名を `コード.gs` に変更

### 3. 設定を更新
```javascript
const CONFIG = {
  WEBHOOK_URL: 'https://your-app.vercel.app/api/webhook', // ← Vercelデプロイ後のURL
  WEBHOOK_SECRET: 'your-secret-key',                       // ← 任意のシークレットキー
  FORM_TYPE: 'consultation'                                // ← フォームタイプ
};
```

**FORM_TYPE の値:**
- `consultation` - 個別相談予約（Case 1）
- `application` - 本講座申し込み（Case 2）
- `workshop` - ワークショップ報告（Case 3）

### 4. トリガーを設定
**方法A: 手動設定**
1. Apps Script左メニュー「トリガー」（時計アイコン）をクリック
2. 「トリガーを追加」をクリック
3. 以下を設定:
   - 実行する関数: `onFormSubmit`
   - イベントの種類: `フォーム送信時`
4. 保存

**方法B: スクリプトで設定**
1. Apps Scriptエディタで `createFormSubmitTrigger` を実行

### 5. 接続テスト
1. Apps Scriptエディタで `testWebhook` を実行
2. ログを確認（表示 > ログ）

## 複数フォームへの対応
各フォームに紐づいたスプレッドシートごとに同じ手順でセットアップし、
`FORM_TYPE` を適切な値に設定してください。

## トラブルシューティング

### 「権限がありません」エラー
→ 初回実行時に権限承認が必要です。承認してください。

### Webhookが送信されない
1. ログを確認（表示 > 実行数）
2. `WEBHOOK_URL` が正しいか確認
3. Vercel側のログを確認

### 「WEBHOOK_SECRET が一致しない」
→ Vercel環境変数 `WEBHOOK_SECRET` とGASの `CONFIG.WEBHOOK_SECRET` を一致させてください。
