/**
 * Sheet2Chatwork Webhook Trigger (GAS-Based Architecture)
 * 
 * このスクリプトは以下を行います：
 * 1. フォーム送信を検知
 * 2. スプレッドシート操作（スタッフマッチング、書き込み）
 * 3. Vercel API への通知リクエスト送信
 * 
 * 設定方法:
 * 1. Google Sheets > 拡張機能 > Apps Script を開く
 * 2. このコードを貼り付け
 * 3. CONFIG を適切に設定
 * 4. トリガーを設定（onFormSubmit を「フォーム送信時」に設定）
 */

// ========================================
// 設定項目
// ========================================

const CONFIG = {
    // Vercel APIのURL（デプロイ後に更新）
    WEBHOOK_URL: 'https://notification-management-khaki.vercel.app/api/webhook',

    // Webhook認証シークレット（Vercel側と同じ値を設定）
    WEBHOOK_SECRET: 'my-secret-key-12345',

    // このスプレッドシートのタイプを設定
    // 'consultation' | 'application' | 'workshop'
    FORM_TYPE: 'consultation',

    // Case 1: スタッフリストシート名
    STAFF_LIST_SHEET: 'スタッフリスト',

    // Case 1: スタッフChatIDシート名
    STAFF_CHAT_SHEET: '担当者チャット',

    // Case 1: 書き込み先の列（1-indexed）
    STAFF_COLUMN: 9,       // Column I
    VIEWER_URL_COLUMN: 15, // Column O

    // Viewer URL 生成用（適当な文字列）
    VIEWER_URL_SALT: 'notification-salt-2026',
    VIEWER_BASE_URL: 'https://notification-management-khaki.vercel.app'
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

        // ケースに応じた処理を実行
        let result;
        switch (CONFIG.FORM_TYPE) {
            case 'consultation':
                result = handleConsultation(sheet, rowIndex, formData);
                break;
            case 'application':
                result = handleApplication(sheet, rowIndex, formData);
                break;
            case 'workshop':
                result = handleWorkshop(sheet, rowIndex, formData);
                break;
            default:
                throw new Error('Unknown FORM_TYPE: ' + CONFIG.FORM_TYPE);
        }

        // Vercel API へ通知リクエストを送信
        sendNotificationRequest(result);

        Logger.log('Processing completed for row ' + rowIndex);

    } catch (error) {
        Logger.log('Error in onFormSubmit: ' + error.toString());
        sendErrorNotification(error);
    }
}

// ========================================
// Case 1: 個別相談予約
// ========================================

function handleConsultation(sheet, rowIndex, formData) {
    const ss = sheet.getParent();

    // フォームデータから必要な情報を取得
    const dateTime = formData['日時'] || formData['予約日時'] || '';
    const certifiedConsultant = formData['資格'] || formData['認定コンサルタント'] || '';
    const clientName = formData['氏名'] || formData['お名前'] || '';
    const clientEmail = formData['メールアドレス'] || formData['メール'] || '';

    // Step 1: スタッフリストからマッチング
    const staffListSheet = ss.getSheetByName(CONFIG.STAFF_LIST_SHEET);
    if (!staffListSheet) {
        throw new Error('スタッフリストシートが見つかりません: ' + CONFIG.STAFF_LIST_SHEET);
    }

    const staffData = staffListSheet.getDataRange().getValues();
    const staffHeaders = staffData[0];

    // 列インデックスを取得
    const dateTimeColIdx = findColumnIndex(staffHeaders, ['日時', 'DateTime']);
    const certColIdx = findColumnIndex(staffHeaders, ['資格', 'Certified']);
    const staffNameColIdx = findColumnIndex(staffHeaders, ['名前', 'Name', 'スタッフ名']);

    let matchedStaff = null;
    for (let i = 1; i < staffData.length; i++) {
        const row = staffData[i];
        if (row[dateTimeColIdx] === dateTime &&
            row[certColIdx] && row[certColIdx].toString().includes(certifiedConsultant)) {
            matchedStaff = row[staffNameColIdx];
            break;
        }
    }

    // Step 2: スタッフ名を書き込み（Column I）
    if (matchedStaff) {
        const surname = extractSurname(matchedStaff);
        sheet.getRange(rowIndex, CONFIG.STAFF_COLUMN).setValue(surname);
    }

    // Step 3: Viewer URL を生成して書き込み（Column O）
    const viewerUrl = generateViewerUrl(clientEmail, clientName);
    sheet.getRange(rowIndex, CONFIG.VIEWER_URL_COLUMN).setValue(viewerUrl);

    // Step 4: Chatwork ID を取得
    let chatworkId = null;
    if (matchedStaff) {
        const chatSheet = ss.getSheetByName(CONFIG.STAFF_CHAT_SHEET);
        if (chatSheet) {
            const chatData = chatSheet.getDataRange().getValues();
            const chatHeaders = chatData[0];
            const nameColIdx = findColumnIndex(chatHeaders, ['名前', 'Name', 'スタッフ名']);
            const idColIdx = findColumnIndex(chatHeaders, ['ChatworkID', 'ID', 'Chatwork']);

            for (let i = 1; i < chatData.length; i++) {
                if (chatData[i][nameColIdx] && chatData[i][nameColIdx].toString().includes(extractSurname(matchedStaff))) {
                    chatworkId = chatData[i][idColIdx];
                    break;
                }
            }
        }
    }

    return {
        type: 'consultation',
        data: {
            timestamp: new Date().toISOString(),
            rowIndex: rowIndex,
            clientName: clientName,
            dateTime: dateTime,
            staff: matchedStaff || '未マッチング',
            staffChatworkId: chatworkId,
            viewerUrl: viewerUrl,
            allFields: formData
        }
    };
}

// ========================================
// Case 2: 本講座申し込み
// ========================================

function handleApplication(sheet, rowIndex, formData) {
    const applicantName = formData['氏名'] || formData['お名前'] || '';

    return {
        type: 'application',
        data: {
            timestamp: new Date().toISOString(),
            rowIndex: rowIndex,
            applicantName: applicantName,
            allFields: formData
        }
    };
}

// ========================================
// Case 3: 体験会報告
// ========================================

function handleWorkshop(sheet, rowIndex, formData) {
    return {
        type: 'workshop',
        data: {
            timestamp: new Date().toISOString(),
            rowIndex: rowIndex,
            allFields: formData
        }
    };
}

// ========================================
// ユーティリティ関数
// ========================================

/**
 * 列名から列インデックスを取得
 */
function findColumnIndex(headers, candidates) {
    for (let i = 0; i < headers.length; i++) {
        for (const candidate of candidates) {
            if (headers[i] && headers[i].toString().includes(candidate)) {
                return i;
            }
        }
    }
    return -1;
}

/**
 * 名前から苗字を抽出
 */
function extractSurname(fullName) {
    if (!fullName) return '';
    const parts = fullName.toString().split(/[\s　]+/);
    return parts[0];
}

/**
 * Viewer URL を生成
 */
function generateViewerUrl(email, name) {
    const input = CONFIG.VIEWER_URL_SALT + ':' + (email || name) + ':' + Date.now();
    const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input);
    const hexHash = hash.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('').substring(0, 16);
    return CONFIG.VIEWER_BASE_URL + '/viewer/' + hexHash;
}

/**
 * Vercel API へ通知リクエストを送信
 */
function sendNotificationRequest(payload) {
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
 * エラー通知
 */
function sendErrorNotification(error) {
    Logger.log('ERROR: ' + error.toString());
    // 必要に応じてメール通知などを追加
}

// ========================================
// テスト・ユーティリティ関数
// ========================================

/**
 * Webhook接続テスト
 */
function testWebhook() {
    const testPayload = {
        type: 'consultation',
        data: {
            timestamp: new Date().toISOString(),
            rowIndex: 999,
            clientName: 'テスト太郎',
            dateTime: '2026/1/15(水) 10:00〜12:00',
            staff: 'テストスタッフ',
            staffChatworkId: '12345',
            viewerUrl: CONFIG.VIEWER_BASE_URL + '/viewer/test123',
            allFields: {
                '氏名': 'テスト太郎',
                '日時': '2026/1/15(水) 10:00〜12:00'
            }
        }
    };

    try {
        const result = sendNotificationRequest(testPayload);
        Logger.log('Test successful: ' + JSON.stringify(result));
    } catch (error) {
        Logger.log('Test failed: ' + error.toString());
    }
}

/**
 * トリガーを自動設定
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
