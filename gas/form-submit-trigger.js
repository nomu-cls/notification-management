/**
 * Google Form Submit Trigger for Case 2 (本講座申込) and Case 3 (報告)
 * 
 * Setup:
 * 1. Open the Google Sheet linked to your form
 * 2. Extensions > Apps Script
 * 3. Paste this code
 * 4. Run the `setupTrigger` function once to install the trigger
 * 5. Authorize when prompted
 */

// ============================================
// CONFIGURATION - Edit these values
// ============================================
const CONFIG = {
    // Vercel Webhook URL
    WEBHOOK_URL: 'https://notification-management-khaki.vercel.app/api/webhook',

    // Firestore config endpoint (fetches sheet names from admin panel)
    CONFIG_URL: 'https://notification-management-khaki.vercel.app/api/config',

    // Fallback sheet mappings (used if config fetch fails)
    FALLBACK_SHEET_CASES: {
        '本講座申込': 'application',  // Case 2
        '報告': 'workshop',           // Case 3
    }
};

/**
 * Fetch sheet-to-case mappings from Firestore via API
 */
function getSheetCaseMappings() {
    try {
        const response = UrlFetchApp.fetch(CONFIG.CONFIG_URL, { muteHttpExceptions: true });
        if (response.getResponseCode() === 200) {
            const data = JSON.parse(response.getContentText());
            const mappings = {};

            // Map from admin panel config
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
 * Trigger function - called when a form is submitted
 * @param {Object} e - Form submit event
 */
function onFormSubmit(e) {
    try {
        const sheet = e.range.getSheet();
        const sheetName = sheet.getName();

        // Get sheet mappings (from admin panel or fallback)
        const sheetCases = getSheetCaseMappings();

        // Check if this sheet is configured for notifications
        const caseType = sheetCases[sheetName];
        if (!caseType) {
            Logger.log(`Sheet "${sheetName}" is not configured for notifications. Skipping.`);
            return;
        }

        // Get the submitted row data
        const row = e.range.getRow();
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const values = e.values;

        // Build allFields object from headers and values
        const allFields = {};
        headers.forEach((header, idx) => {
            if (header && values[idx] !== undefined) {
                allFields[header] = values[idx];
            }
        });

        // Build payload
        const payload = {
            type: caseType,
            data: {
                timestamp: new Date().toISOString(),
                rowIndex: row,
                sheetName: sheetName,
                allFields: allFields
            }
        };

        // Send to Vercel webhook
        const options = {
            method: 'POST',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        };

        const response = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, options);
        Logger.log(`Webhook response: ${response.getResponseCode()} - ${response.getContentText()}`);

    } catch (error) {
        Logger.log(`Error in onFormSubmit: ${error.message}`);
    }
}

/**
 * Setup function - Run this once to install the trigger
 */
function setupTrigger() {
    // Remove existing triggers for this function
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
        if (trigger.getHandlerFunction() === 'onFormSubmit') {
            ScriptApp.deleteTrigger(trigger);
        }
    });

    // Create new trigger
    ScriptApp.newTrigger('onFormSubmit')
        .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
        .onFormSubmit()
        .create();

    Logger.log('Trigger installed successfully!');
}

/**
 * Test function - Simulates a form submission
 */
function testFormSubmit() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const lastRow = sheet.getLastRow();

    const mockEvent = {
        range: sheet.getRange(lastRow, 1),
        values: sheet.getRange(lastRow, 1, 1, sheet.getLastColumn()).getValues()[0]
    };

    onFormSubmit(mockEvent);
    Logger.log('Test completed - check Chatwork for notification');
}
