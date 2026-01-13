/**
 * Sheet2Chatwork Webhook Trigger
 * 
 * このスクリプトをGoogle Apps Scriptに設置し、
 * フォーム送信時にVercel APIへWebhookを送信します。
 * 
 * 設定方法:
 * 1. Google Sheets > 拡張機能 > Apps Script を開く
 * 2. このコードを貼り付け
 * 3. WEBHOOK_URL と WEBHOOK_SECRET を設定
 * 4. トリガーを設定（onFormSubmit を「フォーム送信時」に設定）
 */

// ========================================
// 設定項目
// ========================================

const CONFIG = {
    // Vercel APIのURL（デプロイ後に更新）
    WEBHOOK_URL: 'https://your-app.vercel.app/api/webhook',

    // Webhook認証シークレット（Vercel側と同じ値を設定）
    WEBHOOK_SECRET: 'your-secret-key',

    // このスプレッドシートのタイプを設定
    // 'consultation' | 'application' | 'workshop'
    FORM_TYPE: 'consultation'
};

// ========================================
// メイン関数
// ========================================

/**
 * フォーム送信時に呼ばれる関数
 * トリガー設定: 「フォーム送信時」
 */
function onFormSubmit(e) {
    try {
        const sheet = e.source.getActiveSheet();
        const range = e.range;
        const rowIndex = range.getRow();
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const values = range.getValues()[0];

        // フォームデータをオブジェクトに変換
        const formData = {};
        headers.forEach((header, index) => {
            if (header && values[index] !== undefined) {
                formData[header] = values[index];
            }
        });

        // Webhookペイロードを構築
        const payload = {
            type: CONFIG.FORM_TYPE,
            data: {
                timestamp: new Date().toISOString(),
                rowIndex: rowIndex,
                allFields: formData,
                // Case 1用の追加フィールド
                dateTime: formData['日時'] || formData['予約日時'] || '',
                certifiedConsultant: formData['資格'] || formData['認定コンサルタント'] || '',
                clientName: formData['氏名'] || formData['お名前'] || '',
                // Case 2用
                applicantName: formData['氏名'] || formData['お名前'] || ''
            }
        };

        // Webhookを送信
        sendWebhook(payload);

        Logger.log('Webhook sent successfully for row ' + rowIndex);

    } catch (error) {
        Logger.log('Error in onFormSubmit: ' + error.toString());
        // エラー通知（オプション）
        sendErrorNotification(error);
    }
}

/**
 * Webhookを送信
 */
function sendWebhook(payload) {
    const options = {
        method: 'POST',
        contentType: 'application/json',
        headers: {
            'X-Webhook-Secret': CONFIG.WEBHOOK_SECRET
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, options);
    const responseCode = response.getResponseCode();

    if (responseCode !== 200) {
        throw new Error('Webhook failed with code ' + responseCode + ': ' + response.getContentText());
    }

    return JSON.parse(response.getContentText());
}

/**
 * エラー通知（オプション）
 */
function sendErrorNotification(error) {
    // 管理者へのメール通知など
    // MailApp.sendEmail('admin@example.com', 'Webhook Error', error.toString());
}

// ========================================
// テスト・ユーティリティ関数
// ========================================

/**
 * Webhook接続テスト
 * スクリプトエディタから手動実行してテスト
 */
function testWebhook() {
    const testPayload = {
        type: 'consultation',
        data: {
            timestamp: new Date().toISOString(),
            rowIndex: 999,
            allFields: {
                '氏名': 'テスト太郎',
                '日時': '2026/1/15(水) 10:00〜12:00',
                '資格': 'A'
            },
            dateTime: '2026/1/15(水) 10:00〜12:00',
            certifiedConsultant: 'A',
            clientName: 'テスト太郎'
        }
    };

    try {
        const result = sendWebhook(testPayload);
        Logger.log('Test successful: ' + JSON.stringify(result));
    } catch (error) {
        Logger.log('Test failed: ' + error.toString());
    }
}

/**
 * トリガーを自動設定するヘルパー関数
 */
function createFormSubmitTrigger() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 既存のトリガーを削除
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
        if (trigger.getHandlerFunction() === 'onFormSubmit') {
            ScriptApp.deleteTrigger(trigger);
        }
    });

    // 新しいトリガーを作成
    ScriptApp.newTrigger('onFormSubmit')
        .forSpreadsheet(ss)
        .onFormSubmit()
        .create();

    Logger.log('Trigger created successfully');
}
