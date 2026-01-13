/**
 * Sheet2Chatwork Webhook Trigger (GAS-Based Architecture)
 * 
 * このスクリプトは以下を行います：
 * 1. フォーム送信を検知
 * 2. Firestoreから設定を取得
 * 3. スプレッドシート操作（スタッフマッチング、書き込み）
 * 4. Vercel API への通知リクエスト送信（設定込み）
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
    // Vercel APIのURL
    WEBHOOK_URL: 'https://notification-management-khaki.vercel.app/api/webhook',

    // Webhook認証シークレット
    WEBHOOK_SECRET: 'my-secret-key-12345',

    // このスプレッドシートのタイプ
    // 'consultation' | 'application' | 'workshop'
    FORM_TYPE: 'consultation',

    // Firestore設定（React UIと同じ値）
    FIREBASE_PROJECT_ID: 'challengemanage',
    FIREBASE_API_KEY: 'AIzaSyB55BdrbCUKU172fvtcNaqdGtjDIR-fvP4',
    CONFIG_DOC_ID: 'main',

    // Case 1: スタッフリストシート名
    STAFF_LIST_SHEET: 'スタッフリスト',

    // Case 1: スタッフChatIDシート名
    STAFF_CHAT_SHEET: '担当者チャット',

    // Case 1: 書き込み先の列（1-indexed）
    STAFF_COLUMN: 9,       // Column I
    VIEWER_URL_COLUMN: 15, // Column O

    // Viewer URL 生成用
    VIEWER_URL_SALT: 'notification-salt-2026',
    VIEWER_BASE_URL: 'https://notification-management-khaki.vercel.app'
};

// ========================================
// Firestore から設定を取得
// ========================================

/**
 * Firestore REST API から設定を取得
 */
function getFirestoreConfig() {
    const url = `https://firestore.googleapis.com/v1/projects/${CONFIG.FIREBASE_PROJECT_ID}/databases/(default)/documents/notification_config/${CONFIG.CONFIG_DOC_ID}?key=${CONFIG.FIREBASE_API_KEY}`;

    try {
        const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        const responseCode = response.getResponseCode();

        if (responseCode !== 200) {
            Logger.log('Firestore fetch failed: ' + response.getContentText());
            return null;
        }

        const doc = JSON.parse(response.getContentText());
        return parseFirestoreDocument(doc.fields);
    } catch (error) {
        Logger.log('Error fetching config from Firestore: ' + error.toString());
        return null;
    }
}

/**
 * Firestoreドキュメントのフィールドをパース
 */
function parseFirestoreDocument(fields) {
    if (!fields) return {};

    const result = {};
    for (const key in fields) {
        const field = fields[key];
        if (field.stringValue !== undefined) {
            result[key] = field.stringValue;
        } else if (field.integerValue !== undefined) {
            result[key] = parseInt(field.integerValue);
        } else if (field.booleanValue !== undefined) {
            result[key] = field.booleanValue;
        } else if (field.arrayValue !== undefined) {
            result[key] = (field.arrayValue.values || []).map(v => v.stringValue || v.integerValue);
        } else if (field.mapValue !== undefined) {
            result[key] = parseFirestoreDocument(field.mapValue.fields);
        }
    }
    return result;
}

// ========================================
// メイン関数
// ========================================

/**
 * フォーム送信時に呼ばれる関数
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

        // Firestoreから設定を取得
        const firestoreConfig = getFirestoreConfig();
        if (!firestoreConfig) {
            Logger.log('Warning: Could not fetch config from Firestore. Using defaults.');
        }

        // ケースに応じた処理を実行
        let result;
        switch (CONFIG.FORM_TYPE) {
            case 'consultation':
                result = handleConsultation(sheet, rowIndex, formData, firestoreConfig);
                break;
            case 'application':
                result = handleApplication(sheet, rowIndex, formData, firestoreConfig);
                break;
            case 'workshop':
                result = handleWorkshop(sheet, rowIndex, formData, firestoreConfig);
                break;
            default:
                throw new Error('Unknown FORM_TYPE: ' + CONFIG.FORM_TYPE);
        }

        // Vercel API へ通知リクエストを送信（設定込み）
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

function handleConsultation(sheet, rowIndex, formData, firestoreConfig) {
    const ss = sheet.getParent();

    const dateTime = formData['日時'] || formData['予約日時'] || '';
    const certifiedConsultant = formData['資格'] || formData['認定コンサルタント'] || '';
    const clientName = formData['氏名'] || formData['お名前'] || '';
    const clientEmail = formData['メールアドレス'] || formData['メール'] || '';

    // スタッフリストからマッチング
    const staffListSheet = ss.getSheetByName(CONFIG.STAFF_LIST_SHEET);
    let matchedStaff = null;
    let chatworkId = null;

    if (staffListSheet) {
        const staffData = staffListSheet.getDataRange().getValues();
        const staffHeaders = staffData[0];

        const dateTimeColIdx = findColumnIndex(staffHeaders, ['日時', 'DateTime']);
        const certColIdx = findColumnIndex(staffHeaders, ['資格', 'Certified']);
        const staffNameColIdx = findColumnIndex(staffHeaders, ['名前', 'Name', 'スタッフ名']);

        for (let i = 1; i < staffData.length; i++) {
            const row = staffData[i];
            if (row[dateTimeColIdx] === dateTime &&
                row[certColIdx] && row[certColIdx].toString().includes(certifiedConsultant)) {
                matchedStaff = row[staffNameColIdx];
                break;
            }
        }
    }

    // スタッフ名を書き込み（Column I）
    if (matchedStaff) {
        const surname = extractSurname(matchedStaff);
        sheet.getRange(rowIndex, CONFIG.STAFF_COLUMN).setValue(surname);

        // Chatwork ID を取得
        const chatSheet = ss.getSheetByName(CONFIG.STAFF_CHAT_SHEET);
        if (chatSheet) {
            const chatData = chatSheet.getDataRange().getValues();
            const chatHeaders = chatData[0];
            const nameColIdx = findColumnIndex(chatHeaders, ['名前', 'Name', 'スタッフ名']);
            const idColIdx = findColumnIndex(chatHeaders, ['ChatworkID', 'ID', 'Chatwork']);

            for (let i = 1; i < chatData.length; i++) {
                if (chatData[i][nameColIdx] && chatData[i][nameColIdx].toString().includes(surname)) {
                    chatworkId = chatData[i][idColIdx];
                    break;
                }
            }
        }
    }

    // Viewer URL を生成して書き込み（Column O）
    const viewerUrl = generateViewerUrl(clientEmail, clientName);
    sheet.getRange(rowIndex, CONFIG.VIEWER_URL_COLUMN).setValue(viewerUrl);

    return {
        type: 'consultation',
        config: firestoreConfig, // Firestoreの設定を含める
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

function handleApplication(sheet, rowIndex, formData, firestoreConfig) {
    const applicantName = formData['氏名'] || formData['お名前'] || '';

    return {
        type: 'application',
        config: firestoreConfig, // Firestoreの設定を含める
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

function handleWorkshop(sheet, rowIndex, formData, firestoreConfig) {
    return {
        type: 'workshop',
        config: firestoreConfig, // Firestoreの設定を含める
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

function extractSurname(fullName) {
    if (!fullName) return '';
    const parts = fullName.toString().split(/[\s　]+/);
    return parts[0];
}

function generateViewerUrl(email, name) {
    const input = CONFIG.VIEWER_URL_SALT + ':' + (email || name) + ':' + Date.now();
    const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input);
    const hexHash = hash.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('').substring(0, 16);
    return CONFIG.VIEWER_BASE_URL + '/viewer/' + hexHash;
}

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

function sendErrorNotification(error) {
    Logger.log('ERROR: ' + error.toString());
}

// ========================================
// テスト関数
// ========================================

function testFirestoreConfig() {
    const config = getFirestoreConfig();
    Logger.log('Firestore Config: ' + JSON.stringify(config, null, 2));
}

function testWebhook() {
    const firestoreConfig = getFirestoreConfig();

    const testPayload = {
        type: 'consultation',
        config: firestoreConfig,
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

function createFormSubmitTrigger() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
        if (trigger.getHandlerFunction() === 'onFormSubmit') {
            ScriptApp.deleteTrigger(trigger);
        }
    });

    ScriptApp.newTrigger('onFormSubmit')
        .forSpreadsheet(ss)
        .onFormSubmit()
        .create();

    Logger.log('Trigger created successfully');
}
