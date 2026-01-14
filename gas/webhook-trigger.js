/**
 * Sheet2Chatwork Webhook Trigger (Unified Version)
 * 
 * Supports:
 * - Case 1: 個別相談予約 (consultation)
 * - Case 2: 本講座申込 (application)
 * - Case 3: 報告 (workshop)
 * 
 * Setup:
 * 1. Paste this code into Google Apps Script
 * 2. Set Trigger: onFormSubmit -> From spreadsheet -> On form submit
 * 3. Configure sheet names in the Admin Panel
 */

const CONFIG = {
    // Vercel API Endpoint
    WEBHOOK_URL: 'https://notification-management-khaki.vercel.app/api/webhook',

    // Secret Key (Must match Vercel Environment Variable)
    WEBHOOK_SECRET: 'my-secret-key-12345',

    // Config endpoint to fetch sheet mappings from Admin Panel
    CONFIG_URL: 'https://notification-management-khaki.vercel.app/api/config',

    // Default form type (if sheet name doesn't match any config)
    DEFAULT_FORM_TYPE: 'consultation',

    // Fallback sheet-to-case mappings (used if config fetch fails)
    // These are overridden by Admin Panel settings
    FALLBACK_SHEET_CASES: {
        '個別相談予約一覧': 'consultation', // Case 1
        '本講座申込': 'application',        // Case 2
        '報告': 'workshop'                  // Case 3
    }
};

/**
 * Fetch sheet-to-case mappings from Admin Panel
 */
function getSheetCaseMappings() {
    try {
        const response = UrlFetchApp.fetch(CONFIG.CONFIG_URL, { muteHttpExceptions: true });
        if (response.getResponseCode() === 200) {
            const data = JSON.parse(response.getContentText());
            const mappings = {};

            // Map from admin panel config
            if (data.bookingListSheet) {
                mappings[data.bookingListSheet] = 'consultation';
            }
            if (data.applicationSheetName) {
                mappings[data.applicationSheetName] = 'application';
            }
            if (data.workshopSheetName) {
                mappings[data.workshopSheetName] = 'workshop';
            }

            // Merge with fallbacks (admin config takes priority)
            return { ...CONFIG.FALLBACK_SHEET_CASES, ...mappings };
        }
    } catch (e) {
        Logger.log('Failed to fetch config, using fallback: ' + e.message);
    }
    return CONFIG.FALLBACK_SHEET_CASES;
}

/**
 * Triggered on Form Submit
 */
function onFormSubmit(e) {
    try {
        const sheet = e.source.getActiveSheet();
        const sheetName = sheet.getName();
        const range = e.range;
        const rowIndex = range.getRow();
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const values = range.getValues()[0];

        // Get sheet-to-case mappings
        const sheetCases = getSheetCaseMappings();
        const formType = sheetCases[sheetName] || CONFIG.DEFAULT_FORM_TYPE;

        Logger.log(`Sheet: ${sheetName}, FormType: ${formType}`);

        // Convert row data to object
        const formData = {};
        headers.forEach((header, index) => {
            if (header && values[index] !== undefined) {
                formData[header] = values[index];
            }
        });

        // Normalize some fields for easier handling
        const normalizedData = {
            timestamp: new Date().toISOString(),
            rowIndex: rowIndex,
            sheetName: sheetName,
            // Common mapping
            clientName: formData['氏名'] || formData['お名前'] || formData['name'] || formData['Name'],
            email: formData['メールアドレス'] || formData['メール'] || formData['mail'] || formData['Mail'],
            dateTime: formData['日時'] || formData['予約日時'] || formData['schedule'] || formData['スケジュール'],
            staff: formData['担当者名'] || formData['認定コンサル'] || formData['member_name'],
            allFields: formData
        };

        const payload = {
            type: formType,
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
 * Test Function - Case 2: Application
 */
function testApplication() {
    const testPayload = {
        type: 'application',
        data: {
            timestamp: new Date().toISOString(),
            rowIndex: 5,
            sheetName: '本講座申込',
            allFields: {
                '氏名': 'テスト太郎',
                '講座名': 'スタートアップ講座',
                'メールアドレス': 'test@example.com',
                '電話番号': '090-1234-5678'
            }
        }
    };
    sendToVercel(testPayload);
    Logger.log('Test application sent');
}

/**
 * Test Function - Case 3: Workshop Report
 */
function testWorkshop() {
    const testPayload = {
        type: 'workshop',
        data: {
            timestamp: new Date().toISOString(),
            rowIndex: 3,
            sheetName: '報告',
            allFields: {
                '報告者': '野村',
                '内容': '本日のワークショップ完了しました。',
                '日付': '2026/01/14'
            }
        }
    };
    sendToVercel(testPayload);
    Logger.log('Test workshop sent');
}
