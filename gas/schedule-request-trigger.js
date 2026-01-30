/**
 * 日程リクエスト用スプレッドシート GAS
 * 
 * 機能:
 * - doGet: シートデータの読み取り（分析用）
 * - doPost: フォームデータの書き込み + Chatwork通知
 */

// ========== 通知設定（プロモーションごとに編集） ==========
const NOTIFICATION_CONFIG = {
    // ★重要: プロモーションID（notification-managementのURLから確認）
    // 例: https://notification-management-khaki.vercel.app/?promo=fJwGH1B7r78vcwmFktmD
    PROMOTION_ID: '',  // ← ここにプロモーションIDを入力

    WEBHOOK_URL: 'https://notification-management-khaki.vercel.app/api/webhook',
    WEBHOOK_SECRET: 'my-secret-key-12345',
    // 通知を送信するシート名（複数指定可能）
    NOTIFY_SHEETS: ['日程リクエスト']
};
// =========================================================

// 1. 分析用 (読み取り)
function doGet(e) {
    const sheetName = e.parameter.sheet || "シート1";
    const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!s) {
        return ContentService.createTextOutput(JSON.stringify({ error: "No Sheet" }))
            .setMimeType(ContentService.MimeType.JSON);
    }
    const data = s.getDataRange().getValues();
    return ContentService.createTextOutput(JSON.stringify({ values: data }))
        .setMimeType(ContentService.MimeType.JSON);
}

// 2. フォーム送付ログ用 (書き込み) + 通知機能
function doPost(e) {
    try {
        const p = e.parameter;
        const sheetName = p.sheetName || "Sheet1";
        let s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);

        // シートが無ければ作成
        if (!s) {
            s = SpreadsheetApp.getActiveSpreadsheet().insertSheet(sheetName);
        }

        // ヘッダー候補を決定 (クライアントからの指定があれば最優先)
        let incomingHeaders = [];
        if (p._headerOrder) {
            incomingHeaders = p._headerOrder.split(',');
        } else {
            // 指定がなければキーから自動生成
            const ignore = ['sheetName', 'Body', '_headerOrder'];
            incomingHeaders = Object.keys(p).filter(k => !ignore.includes(k));
            // 優先キーの並び替え
            const priority = ['タイムスタンプ', 'お名前', 'メールアドレス'];
            incomingHeaders.sort((a, b) => {
                const ai = priority.indexOf(a);
                const bi = priority.indexOf(b);
                if (ai !== -1 && bi !== -1) return ai - bi;
                if (ai !== -1) return -1;
                if (bi !== -1) return 1;
                return 0;
            });
        }

        // ヘッダー行の確認・作成 (1行目)
        let currentHeaders = [];
        if (s.getLastRow() === 0) {
            s.appendRow(incomingHeaders);
            currentHeaders = incomingHeaders;
        } else {
            currentHeaders = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];

            // 未知のキーがあればヘッダーに追加 (自動拡張)
            const newKeys = incomingHeaders.filter(k => !currentHeaders.includes(k));

            if (newKeys.length > 0) {
                s.getRange(1, s.getLastColumn() + 1, 1, newKeys.length).setValues([newKeys]);
                currentHeaders = currentHeaders.concat(newKeys);
            }
        }

        // データ行の作成
        const row = currentHeaders.map(h => p[h] || "");
        s.appendRow(row);

        // ★ 通知を送信（設定されたシートの場合のみ）
        if (NOTIFICATION_CONFIG.NOTIFY_SHEETS.includes(sheetName)) {
            sendNotificationToWebhook(sheetName, p);
        }

        return ContentService.createTextOutput("Success");
    } catch (err) {
        return ContentService.createTextOutput("Error: " + err.toString());
    }
}

// 通知送信関数
function sendNotificationToWebhook(sheetName, data) {
    const payload = {
        type: 'universal',
        promotionId: NOTIFICATION_CONFIG.PROMOTION_ID,  // ← プロモーションID追加
        data: {
            timestamp: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
            sheetName: sheetName,
            clientName: data.name || data['お名前'] || data['氏名'] || '',
            email: data.email || data['メールアドレス'] || '',
            allFields: data
        }
    };

    try {
        const response = UrlFetchApp.fetch(NOTIFICATION_CONFIG.WEBHOOK_URL, {
            method: 'POST',
            contentType: 'application/json',
            headers: { 'X-Webhook-Secret': NOTIFICATION_CONFIG.WEBHOOK_SECRET },
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        });
        Logger.log('Notification sent: ' + response.getResponseCode());
    } catch (error) {
        Logger.log('Notification error: ' + error);
    }
}

// テスト用関数
function testNotification() {
    sendNotificationToWebhook('日程リクエスト', {
        'お名前': 'テスト太郎',
        'メールアドレス': 'test@example.com',
        '電話番号': '090-1234-5678',
        '第1希望': '2/15 14:00〜17:00',
        '第2希望': '2/16 10:00〜12:00',
        '第3希望': '2/17 終日OK'
    });
}
