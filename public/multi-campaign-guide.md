# マルチキャンペーン運用ガイド

## 概要

1つのVercelプロジェクト（通知管理システム）を複数のキャンペーン・プロモーションで共有利用するための設計ガイドです。

---

## アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────┐
│                    Vercel (単一プロジェクト)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ /api/webhook│  │ /api/config │  │ Admin UI    │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         └────────────────┴────────────────┘                 │
│                          │                                  │
│                   Firestore (設定DB)                        │
│                          │                                  │
└──────────────────────────┼──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼─────┐      ┌─────▼────┐      ┌─────▼────┐
   │ Campaign │      │ Campaign │      │ Campaign │
   │    A     │      │    B     │      │    C     │
   │(スプシA) │      │(スプシB) │      │(スプシC) │
   └────┬─────┘      └─────┬────┘      └─────┬────┘
        │                  │                  │
   ┌────▼─────┐      ┌─────▼────┐      ┌─────▼────┐
   │  GAS A   │      │  GAS B   │      │  GAS C   │
   │(同一コード)│      │(同一コード)│      │(同一コード)│
   └──────────┘      └──────────┘      └──────────┘
```

---

## 命名規則（推奨）

### スプレッドシート
```
[キャンペーン名]_通知管理
例：2026春キャンペーン_通知管理
```

### シート名（タブ名）
```
[キャンペーン名]_[用途]
例：
  - 春キャンペーン_個別相談予約
  - 春キャンペーン_本講座申込
  - 春キャンペーン_ワークショップ報告
```

### Chatworkルーム
```
【[キャンペーン名]】通知用
例：【2026春】個別相談通知
```

---

## セットアップ手順

### ステップ1: スプレッドシートの準備

1. 既存のスプレッドシートをコピー（または新規作成）
2. シート名を命名規則に従ってリネーム
3. 必要な列ヘッダーを設定

### ステップ2: GASコードの導入

各スプレッドシートに同じGASコードを導入します。

#### 手順
1. スプレッドシートを開く
2. `拡張機能` > `Apps Script`
3. 以下のコードを貼り付け

```javascript
/**
 * マルチキャンペーン対応 Webhook Trigger
 * ※ 全キャンペーンで同一のコードを使用
 */

const CONFIG = {
    // 【共通】Vercel API エンドポイント
    WEBHOOK_URL: 'https://notification-management-khaki.vercel.app/api/webhook',
    
    // 【共通】認証シークレット
    WEBHOOK_SECRET: 'my-secret-key-12345',
    
    // 【共通】設定取得URL
    CONFIG_URL: 'https://notification-management-khaki.vercel.app/api/config'
};

// ===== 以下はそのままコピー =====

function getFormTypeConfig(sheetName) {
    try {
        const response = UrlFetchApp.fetch(CONFIG.CONFIG_URL, { muteHttpExceptions: true });
        if (response.getResponseCode() === 200) {
            const data = JSON.parse(response.getContentText());
            
            // Case 1 (個別相談)
            if (data.bookingListSheet && data.bookingListSheet === sheetName) {
                return { type: 'consultation' };
            }
            
            // カスタム通知ルール
            if (data.notificationRules && Array.isArray(data.notificationRules)) {
                const matched = data.notificationRules.find(r => r.sheetName === sheetName);
                if (matched) return { type: 'universal', ruleId: matched.id };
            }
        }
    } catch (e) {
        Logger.log('Config fetch failed: ' + e.message);
    }
    return { type: 'unknown' };
}

function onFormSubmit(e) {
    try {
        const sheet = e.source.getActiveSheet();
        const sheetName = sheet.getName();
        const range = e.range || sheet.getDataRange();
        const rowIndex = range.getRow();
        
        const maxCols = sheet.getLastColumn();
        if (maxCols === 0) return;
        
        const headers = sheet.getRange(1, 1, 1, maxCols).getValues()[0];
        const values = range.getValues()[0];
        
        const config = getFormTypeConfig(sheetName);
        Logger.log(`Sheet: ${sheetName}, Type: ${config.type}`);
        
        if (config.type === 'unknown') {
            Logger.log('Unknown sheet, skipping.');
            return;
        }
        
        const formData = {};
        headers.forEach((h, i) => {
            if (h && values[i] !== undefined) {
                let val = values[i];
                if (val instanceof Date) {
                    val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss');
                }
                formData[h] = val;
            }
        });
        
        const payload = {
            type: config.type,
            data: {
                timestamp: new Date().toISOString(),
                rowIndex: rowIndex,
                sheetName: sheetName,
                clientName: formData['氏名'] || formData['お名前'] || formData['name'],
                email: formData['メールアドレス'] || formData['メール'] || formData['mail'],
                dateTime: formData['日時'] || formData['予約日時'] || formData['schedule'],
                allFields: formData
            }
        };
        
        sendToVercel(payload);
    } catch (error) {
        Logger.log('Error: ' + error.toString());
    }
}

function sendToVercel(payload) {
    const options = {
        method: 'POST',
        contentType: 'application/json',
        headers: { 'X-Webhook-Secret': CONFIG.WEBHOOK_SECRET },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };
    const response = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, options);
    Logger.log('Response: ' + response.getResponseCode());
}

function testWebhook() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    Logger.log('Testing sheet: ' + sheet.getName());
    onFormSubmit({ 
        source: SpreadsheetApp.getActiveSpreadsheet(),
        range: sheet.getRange(2, 1, 1, sheet.getLastColumn())
    });
}
```

4. トリガー設定:
   - `onFormSubmit` → スプレッドシートから → フォーム送信時

### ステップ3: 管理画面でルール追加

1. 管理画面を開く
2. 「カスタム通知設定」タブへ移動
3. 「ルールを追加」ボタンをクリック
4. 以下を設定:
   - **対象シート名**: `春キャンペーン_本講座申込` など（完全一致）
   - **通知先ルームID**: Chatworkルームの数字ID
   - **テンプレート**: 通知メッセージ形式
5. 「設定を保存」をクリック

### ステップ4: 動作確認

1. GASエディタで `testWebhook` を実行
2. Chatworkに通知が届くことを確認

---

## 運用時のポイント

### ✅ キャンペーン追加時
1. スプレッドシートを準備
2. GASコードを貼り付け（同一コード）
3. トリガー設定
4. 管理画面でルール追加

### ✅ キャンペーン終了時
1. 管理画面でルールを削除（または無効化）
2. GASトリガーを削除（任意）

### ⚠️ 注意事項
- シート名は**完全一致**が必要
- 同じシート名を複数キャンペーンで使わない
- Chatworkトークンは管理画面の「接続設定」で共有

---

## Case 1（個別相談）のキャンペーン対応

Case 1は現在「1つのシート」のみ対応です。複数キャンペーンで使う場合は「カスタム通知」として設定してください。

### 個別相談をカスタム通知で設定する方法
1. カスタム通知設定で新規ルール作成
2. シート名: `キャンペーンB_個別相談予約`
3. 通知先: 担当者チャットルームID
4. テンプレート: `【個別相談予約】\n日時：{日時}\nお客様：{お名前}`

---

## FAQ

### Q: 1つのスプレッドシートに複数シートを入れても大丈夫？
A: はい。シート名さえ正しく設定すれば、同一スプレッドシート内の複数シートを別々のルールで処理できます。

### Q: GASコードはキャンペーンごとに変える必要がある？
A: いいえ。全く同じコードを使ってください。`CONFIG` の URL とシークレットが同じであれば、管理画面のルール設定で動的に処理されます。

### Q: UTAGEなど外部連携の場合は？
A: UTAGEは直接Vercel APIを呼び出すため、GASは不要です。シート名をカスタム通知ルールに登録すれば、UTAGE経由のデータも同じ仕組みで処理されます。
