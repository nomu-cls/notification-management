/**
 * Sheet2Chatwork Webhook Trigger (Unified Version)
 * 
 * Supports:
 * - Case 1: 個別相談予約 (consultation) - Legacy Fixed Logic
 * - Universal: Custom Notifications (Dynamic from Admin Config)
 * 
 * Setup:
 * 1. Paste this code into Google Apps Script
 * 2. Set Trigger: onFormSubmit -> From spreadsheet -> On form submit
 */

const CONFIG = {
    // ★重要: プロモーションID（notification-managementの接続設定から確認してコピー）
    PROMOTION_ID: '',  // ← ここにプロモーションIDを入力

    // Vercel API Endpoint
    WEBHOOK_URL: 'https://notification-management-khaki.vercel.app/api/webhook',

    // Secret Key (Must match Vercel Environment Variable)
    WEBHOOK_SECRET: 'my-secret-key-12345',

    // Config endpoint to fetch sheet mappings from Admin Panel
    CONFIG_URL: 'https://notification-management-khaki.vercel.app/api/config',

    // Default Fallback
    DEFAULT_FORM_TYPE: 'consultation'
};

/**
 * Fetch configuration and determine form type based on sheet name
 */
function getFormTypeConfig(sheetName) {
    try {
        const response = UrlFetchApp.fetch(CONFIG.CONFIG_URL, { muteHttpExceptions: true });
        if (response.getResponseCode() === 200) {
            const data = JSON.parse(response.getContentText());

            // 1. Check for Case 1 (Consultation) - Supports multiple promotions
            if (data.bookingListSheet === sheetName || (data.bookingSheets && data.bookingSheets.includes(sheetName))) {
                return { type: 'consultation' };
            }

            // 2. Check for Universal Rules (Custom Notifications)
            if (data.notificationRules && Array.isArray(data.notificationRules)) {
                const matchedRule = data.notificationRules.find(r => r.sheetName === sheetName);
                if (matchedRule) {
                    return { type: 'universal', ruleId: matchedRule.id };
                }
            }

            // 3. Fallback for older hardcoded types via deprecated config fields (Optional, kept for safety)
            if (data.applicationSheetName === sheetName) return { type: 'universal' }; // Migrated to universal
            if (data.workshopSheetName === sheetName) return { type: 'universal' };    // Migrated to universal
        }
    } catch (e) {
        Logger.log('Failed to fetch config: ' + e.message);
    }

    // Default fallback (e.g. if config fetch fails but we want to try sending anyway)
    return { type: 'unknown' };
}

/**
 * Triggered on Form Submit
 */
function onFormSubmit(e) {
    try {
        const sheet = e.source.getActiveSheet();
        const sheetName = sheet.getName();
        // Fallback for getting range if e represents a simple object in tests
        const range = e.range || sheet.getDataRange();
        const rowIndex = range.getRow();

        // Get all headers
        const maxCols = sheet.getLastColumn();
        if (maxCols === 0) return; // Empty sheet
        const headers = sheet.getRange(1, 1, 1, maxCols).getValues()[0];
        const values = range.getValues()[0];

        // Determine Type
        const config = getFormTypeConfig(sheetName);
        const formType = config.type;

        Logger.log(`Sheet: ${sheetName}, FormType: ${formType}`);

        if (formType === 'unknown') {
            Logger.log('Unknown sheet type, skipping webhook.');
            return;
        }

        // Convert row data to object
        const formData = {};
        headers.forEach((header, index) => {
            if (header && values[index] !== undefined) {
                // Determine value - handle Date objects
                let val = values[index];
                if (val instanceof Date) {
                    val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss');
                }
                formData[header] = val;
            }
        });

        // Normalize Data structure
        const normalizedData = {
            timestamp: new Date().toISOString(),
            rowIndex: rowIndex,
            sheetName: sheetName,
            // Common mappings for convenience (mostly for Case 1)
            clientName: formData['氏名'] || formData['お名前'] || formData['name'] || formData['Name'],
            email: formData['メールアドレス'] || formData['メール'] || formData['mail'] || formData['Mail'],
            dateTime: formData['日時'] || formData['予約日時'] || formData['schedule'] || formData['スケジュール'],
            allFields: formData
        };

        const payload = {
            type: formType,
            promotionId: CONFIG.PROMOTION_ID,  // ← プロモーションID追加
            data: normalizedData
        };

        // Send to Vercel
        sendToVercel(payload);

    } catch (error) {
        Logger.log('Error in onFormSubmit: ' + error.toString());
    }
}

/**
 * Send Payload to Vercel Webhook
 */
function sendToVercel(payload) {
    const options = {
        method: 'POST',
        contentType: 'application/json',
        headers: {
            'X-Webhook-Secret': CONFIG.WEBHOOK_SECRET
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    Logger.log('Sending payload to: ' + CONFIG.WEBHOOK_URL);
    Logger.log('Payload type: ' + payload.type);
    const response = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, options);
    Logger.log('Response Code: ' + response.getResponseCode());
    Logger.log('Response Body: ' + response.getContentText());
}

/**
 * Test Function - Case 1: Individual Consultation
 */
function testConsultation() {
    const testPayload = {
        type: 'consultation',
        data: {
            timestamp: new Date().toISOString(),
            // rowIndex not set - triggers append row logic
            clientName: '野村 光恵',
            email: 'mitsue.nomura+1118@gmail.com',
            dateTime: '2026/01/31(土) 16:00〜18:00',
            staff: '認定コンサル1',
            allFields: {
                'Name': '野村 光恵',
                'Mail': 'mitsue.nomura+1118@gmail.com',
                'Phone': '09065624957',
                'カナ': 'ノムラ ミツエ',
                'スケジュール': '2026/01/31(土) 16:00〜18:00',
                '担当者名': '認定コンサル1',
                'Zoom': 'https://us05web.zoom.us/j/81874015477'
            }
        }
    };
    sendToVercel(testPayload);
    Logger.log('Test consultation sent');
}

/**
 * Test Function - Universal (Case 2 Replacement)
 */
function testUniversalParam() {
    let testFields = {
        '氏名': 'テスト太郎',
        '講座名': 'スタートアップ講座',
        'メールアドレス': 'test@example.com',
        '電話番号': '090-1234-5678'
    };

    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName('本講座申込');
        if (sheet) {
            const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
            testFields = {};
            headers.forEach(h => {
                if (h) testFields[h] = 'テストデータ（' + h + '）';
            });
            // Ensure mail matches for basic test
            const mailCol = headers.find(h => h.includes('メール'));
            if (mailCol) testFields[mailCol] = 'test@example.com';
        }
    } catch (e) {
        Logger.log('Realistic headers fetch failed, using dummy: ' + e.message);
    }

    const testPayload = {
        type: 'universal',
        data: {
            timestamp: new Date().toISOString(),
            rowIndex: 5,
            sheetName: '本講座申込',
            allFields: testFields
        }
    };
    sendToVercel(testPayload);
    Logger.log('Test universal notification sent with fields: ' + Object.keys(testFields).join(', '));
}

/**
 * Debug Function: Check settings on the server side
 */
function debugConfig() {
    Logger.log('Fetching config from: ' + CONFIG.CONFIG_URL);
    const response = UrlFetchApp.fetch(CONFIG.CONFIG_URL, { muteHttpExceptions: true });
    Logger.log('Response Status: ' + response.getResponseCode());
    Logger.log('Response Body: ' + response.getContentText());
}

/**
 * API Endpoint for results
 */
function doGet(e) {
    const sheetName = e.parameter.sheet || "個別相談予約一覧"; // デフォルトのシート名
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({
            error: "Sheet not found: " + sheetName
        })).setMimeType(ContentService.MimeType.JSON);
    }

    const values = sheet.getDataRange().getValues();

    return ContentService.createTextOutput(JSON.stringify({
        values: values
    })).setMimeType(ContentService.MimeType.JSON);
}
