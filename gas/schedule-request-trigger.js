/**
 * 日程リクエスト用 通知トリガー GAS
 * 
 * このスクリプトをスプレッドシートのApps Scriptにコピーし、
 * トリガーを設定してください（フォーム送信時またはonEdit）
 * 
 * 使い方:
 * 1. スプレッドシートで「拡張機能」→「Apps Script」を開く
 * 2. このコードを貼り付ける
 * 3. 下の設定を編集
 * 4. 「トリガー」からonFormSubmitまたはonEditをトリガーとして設定
 */

// ========== 設定 ==========
const CONFIG = {
    // notification-managementのWebhook URL
    WEBHOOK_URL: 'https://notification-management-khaki.vercel.app/api/webhook',

    // Webhookシークレット（notification-managementと同じ値）
    WEBHOOK_SECRET: 'my-secret-key-12345',

    // 監視するシート名
    SHEET_NAME: '日程リクエスト',

    // 通知に使用するプロモーションのシート名（カスタム通知ルールに設定した名前）
    NOTIFICATION_SHEET_NAME: '日程リクエスト'
};
// ==========================

/**
 * フォーム送信時のトリガー
 * GASのWebアプリとしてPOSTリクエストを受け取った時に呼ばれる
 */
function doPost(e) {
    try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
        if (!sheet) {
            return ContentService.createTextOutput(JSON.stringify({ error: 'Sheet not found' }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        // POSTデータをパース
        let data;
        if (e.postData) {
            data = JSON.parse(e.postData.contents);
        } else if (e.parameter) {
            data = e.parameter;
        }

        if (!data) {
            return ContentService.createTextOutput(JSON.stringify({ error: 'No data received' }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        // スプレッドシートに追記
        const timestamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
        const newRow = [
            timestamp,
            data.name || '',
            data.kana || '',
            data.email || '',
            data.phone || '',
            data.date1 || '',
            data.date2 || '',
            data.date3 || ''
        ];

        sheet.appendRow(newRow);

        // 通知を送信
        sendNotification({
            timestamp: timestamp,
            name: data.name || '',
            kana: data.kana || '',
            email: data.email || '',
            phone: data.phone || '',
            date1: data.date1 || '',
            date2: data.date2 || '',
            date3: data.date3 || ''
        });

        return ContentService.createTextOutput(JSON.stringify({ success: true }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        Logger.log('doPost error: ' + error);
        return ContentService.createTextOutput(JSON.stringify({ error: error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

/**
 * スプレッドシート編集時のトリガー（手動入力対応）
 */
function onEdit(e) {
    const sheet = e.source.getActiveSheet();

    // 対象シートかチェック
    if (sheet.getName() !== CONFIG.SHEET_NAME) return;

    // 1列目（タイムスタンプ列）への入力かチェック
    const range = e.range;
    if (range.getColumn() !== 1) return;

    // 新しい行への入力かチェック（既存行の編集では通知しない）
    const row = range.getRow();
    if (row <= 1) return; // ヘッダー行はスキップ

    // 行のデータを取得
    const rowData = sheet.getRange(row, 1, 1, 8).getValues()[0];

    sendNotification({
        timestamp: rowData[0] || new Date().toLocaleString('ja-JP'),
        name: rowData[1] || '',
        kana: rowData[2] || '',
        email: rowData[3] || '',
        phone: rowData[4] || '',
        date1: rowData[5] || '',
        date2: rowData[6] || '',
        date3: rowData[7] || ''
    });
}

/**
 * フォーム送信トリガー（Googleフォーム連携時）
 */
function onFormSubmit(e) {
    try {
        const sheet = e.range.getSheet();

        // 対象シートかチェック
        if (sheet.getName() !== CONFIG.SHEET_NAME) return;

        const row = e.range.getRow();
        const rowData = sheet.getRange(row, 1, 1, 8).getValues()[0];

        sendNotification({
            timestamp: rowData[0] || new Date().toLocaleString('ja-JP'),
            name: rowData[1] || '',
            kana: rowData[2] || '',
            email: rowData[3] || '',
            phone: rowData[4] || '',
            date1: rowData[5] || '',
            date2: rowData[6] || '',
            date3: rowData[7] || ''
        });
    } catch (error) {
        Logger.log('onFormSubmit error: ' + error);
    }
}

/**
 * notification-managementにWebhookを送信
 */
function sendNotification(data) {
    const payload = {
        type: 'universal',
        data: {
            timestamp: data.timestamp,
            sheetName: CONFIG.NOTIFICATION_SHEET_NAME,
            clientName: data.name,
            email: data.email,
            allFields: {
                '氏名': data.name,
                'フリガナ': data.kana,
                'メールアドレス': data.email,
                '電話番号': data.phone,
                '第1希望': data.date1,
                '第2希望': data.date2,
                '第3希望': data.date3
            }
        }
    };

    try {
        const response = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, {
            method: 'POST',
            contentType: 'application/json',
            headers: {
                'X-Webhook-Secret': CONFIG.WEBHOOK_SECRET
            },
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        });

        const responseCode = response.getResponseCode();
        const responseText = response.getContentText();

        Logger.log('Webhook response: ' + responseCode + ' - ' + responseText);

        if (responseCode !== 200) {
            Logger.log('Webhook failed with status: ' + responseCode);
        }
    } catch (error) {
        Logger.log('Webhook error: ' + error);
    }
}

/**
 * 手動テスト用関数
 * Apps Scriptエディタで実行してテスト
 */
function testNotification() {
    sendNotification({
        timestamp: new Date().toLocaleString('ja-JP'),
        name: 'テスト太郎',
        kana: 'テストタロウ',
        email: 'test@example.com',
        phone: '090-1234-5678',
        date1: '2/15 14:00〜17:00',
        date2: '2/16 10:00〜12:00',
        date3: '2/17 終日OK'
    });
}
