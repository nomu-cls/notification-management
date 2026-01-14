# 通知管理システム マニュアル

## 目次
1. [システム概要](#システム概要)
2. [初期設定](#初期設定)
3. [GASコードの導入](#gasコードの導入)
4. [トリガー設定](#トリガー設定)
5. [環境変数・定数の設定](#環境変数定数の設定)
6. [キャンペーン複製ガイド](#キャンペーン複製ガイド)
7. [各機能の使い方](#各機能の使い方)
8. [トラブルシューティング](#トラブルシューティング)

---

## システム概要

本システムは、Googleスプレッドシートへのデータ入力（フォーム送信、UTAGE連携など）をトリガーに、Chatworkへ自動通知を送信する仕組みです。

**主な機能:**
- **Case 1: 個別相談予約** - 担当者マッチングと通知
- **カスタム通知** - 任意のシートとルームの紐付け
- **Case 4: 前日リマインダー** - 毎日18時に翌日の予約をリマインド
- **Case 5: 課題集約ページ** - 受講者向けの課題提出状況確認
- **Case 6: 予約枠生成ツール** - 日時リスト生成

---

## 初期設定

### ステップ1: Vercelプロジェクトの準備

1. GitHubリポジトリをフォークまたはクローン
2. Vercelにてプロジェクトをインポート

### ステップ2: Firestoreの設定

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクト作成
2. Firestore Databaseを「本番モード」で作成
3. ウェブアプリを追加し、Firebase設定（apiKey等）を取得
4. `.env` または Vercel環境変数に設定:
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   ```

### ステップ3: 管理画面の初期値設定

管理画面（デプロイ先の `/` ）を開き、以下を設定:
- **接続設定タブ**: スプレッドシートID、シート名、ChatworkトークンなどをFirestoreに保存

---

## GASコードの導入

### 手順

1. 対象のGoogleスプレッドシートを開く
2. `拡張機能` > `Apps Script` をクリック
3. `gas/webhook-trigger.js` の内容を全てコピーして貼り付け
4. ファイル名を `コード.gs` などに変更

### 定数の編集

```javascript
const CONFIG = {
    // VercelにデプロイしたWebhook URL
    WEBHOOK_URL: 'https://YOUR-APP-NAME.vercel.app/api/webhook',

    // 認証用シークレット (Vercelの WEBHOOK_SECRET と一致させる)
    WEBHOOK_SECRET: 'your-secret-key-12345',

    // 設定取得URL
    CONFIG_URL: 'https://YOUR-APP-NAME.vercel.app/api/config',
};
```

- `WEBHOOK_URL`: Vercelプロジェクトのデプロイ後ドメイン + `/api/webhook`
- `WEBHOOK_SECRET`: 任意の文字列。Vercel側の環境変数と一致必須
- `CONFIG_URL`: 管理画面の設定を取得するエンドポイント

---

## トリガー設定

GASスクリプトを保存したら、フォーム送信時に自動実行されるようにトリガーを設定します。

### 手動設定

1. Apps Script左メニューの「トリガー」（⏰アイコン）をクリック
2. 「トリガーを追加」ボタンをクリック
3. 以下を設定:
   - **実行する関数を選択**: `onFormSubmit`
   - **イベントのソースを選択**: `スプレッドシートから`
   - **イベントの種類を選択**: `フォーム送信時`
4. 「保存」をクリック
5. 初回は権限承認ダイアログが表示されるので許可

### UTAGE連携の場合

UTAGEなど外部サービスからのWebhookは、直接Vercel APIを呼び出す構成となります（GASトリガー不要）。

- **Webhook URL**: `https://YOUR-APP.vercel.app/api/webhook?secret=your-secret-key`
- **認証**: クエリパラメータ `secret` をシークレットキーに設定

---

## 環境変数・定数の設定

### Vercel 環境変数

| 変数名 | 説明 | 取得方法 |
|--------|------|----------|
| `WEBHOOK_SECRET` | Webhook認証用シークレット | 任意の文字列（GASと一致） |
| `VIEWER_URL_SALT` | 課題集約ページのURL生成用ソルト | 任意の文字列 |
| `CRON_SECRET` | Cronジョブ認証用シークレット | 任意の文字列 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Sheets API用サービスアカウント | [GCP Console](https://console.cloud.google.com/) → IAM → サービスアカウント → 鍵作成 (JSON) |

### Firebase 環境変数

| 変数名 | 説明 | 取得方法 |
|--------|------|----------|
| `VITE_FIREBASE_API_KEY` | Firebase Web APIキー | Firebase Console → プロジェクト設定 → 全般 → ウェブアプリ |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase認証ドメイン | 同上 |
| `VITE_FIREBASE_PROJECT_ID` | FirebaseプロジェクトID | 同上 |

### Chatwork関連

| 設定項目 | 取得方法 |
|----------|----------|
| **APIトークン** | [Chatwork設定](https://www.chatwork.com/service/packages/chatwork/subpackages/api/token.php) → API Token |
| **ルームID** | 対象ルームを開き、URL末尾の数字 (例: `rid123456789`) |

### スプレッドシート関連

| 設定項目 | 取得方法 |
|----------|----------|
| **スプレッドシートID** | シートURL内の `/d/` と `/edit` の間の文字列 |
| **シート名** | シート下部のタブ名（正確に一致させる） |

---

## キャンペーン複製ガイド

本システムを複数のキャンペーン・プロモーションで使いたい場合の構成パターンです。

### パターンA: 1つのVercelプロジェクトで複数管理（推奨）

**メリット**: インフラ管理が1箇所で済む  
**セットアップ**:
1. 管理画面の「カスタム通知設定」でキャンペーン別にルールを追加
2. 各キャンペーン用のスプレッドシートに同じGASコードを導入（`WEBHOOK_URL`は共通）
3. シート名をユニークに設定（例：`キャンペーンA_申込`、`キャンペーンB_申込`）

### パターンB: Vercelプロジェクトごとに複製（独立管理）

**メリット**: キャンペーンごとに完全に独立、設定の干渉なし  
**セットアップ**:
1. GitHubリポジトリをフォーク
2. 新規Vercelプロジェクトとしてデプロイ
3. 独自のFirestoreプロジェクトを作成（または同一DBで `documentId` を変更）
4. 環境変数を個別に設定
5. GASの `WEBHOOK_URL` を新プロジェクトのURLに変更

### Firestoreドキュメント分離（上級者向け）

同一Firestoreで複数キャンペーンを管理する場合：
1. `api/lib/firestore.js` の `DOCUMENT_ID` を変更
2. または、管理画面に「キャンペーン切り替え」機能を追加（カスタム開発要）

---

## 各機能の使い方

### Case 1: 個別相談予約
外部システム（UTAGE等）から予約情報をWebhook受信し、担当者を自動マッチングしてChatwork通知。

### カスタム通知設定
任意のシート名とChatworkルームIDを紐付け、柔軟な通知ルールを設定。

### Case 4: 前日リマインダー
指定シートから「翌日」の予約を抽出し、担当者へリマインド通知。

### Case 5: 課題集約ページ
受講者向けに課題提出状況を表示。ハッシュまたはメールでアクセス。

### Case 6: 予約枠生成ツール
期間を指定して、対応可能な日時リストを一括生成。

---

## トラブルシューティング

### Webhookが送信されない
- GAS実行ログを確認: Apps Script → 実行数
- `WEBHOOK_URL` と `WEBHOOK_SECRET` の設定を確認
- Vercelログを確認

### 「Settings is not defined」エラー
→ 最新バージョンにデプロイ済みか確認（GItHubへのプッシュ後、Vercelの自動デプロイを待つ）

### スタッフマッチングが失敗する
→ スタッフ一覧シートの列構造、日付フォーマット（全角半角）を確認

### 権限エラー
→ GAS初回実行時に権限承認が必要。Googleアカウントでログインし承認

---

*最終更新: 2026年1月15日*
