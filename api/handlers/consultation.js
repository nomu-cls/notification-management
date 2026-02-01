/**
 * Case 1: Individual Consultation Booking Handler
 * 
 * Matching Logic:
 * 1. Scan "Staff List" sheet using Date/Time and "Certified Consultant" as keys
 * 2. Retrieve "Staff Name (Surname Only)" from matching row
 * 3. Write Surname into Column I (Staff) of booking list
 * 4. Generate and write Viewer URL to Column O
 * 5. Search Chatwork ID by Surname in "Staff Chat" sheet
 * 6. Send immediate notification
 */

import { readSheet, updateCell, appendRow } from '../lib/sheets.js';
import { sendMessage, sendToMessage, formatMessage } from '../lib/chatwork.js';
import { getConfig } from '../lib/firestore.js';
import { notifyError, ErrorCategory } from '../lib/errorNotify.js';
const CASE_NAME = 'Case 1: 個別相談予約';

/**
 * Generate viewer URL using email directly
 * @param {string} email - Client email
 * @param {string} name - Client name (fallback)
 * @param {string} baseUrl - Base URL for the viewer
 * @param {string} promotionId - Promotion ID for the event
 * @returns {string} Viewer URL with email and promotionId
 */
function generateViewerUrl(email, name, baseUrl, promotionId) {
    const identifier = email || name;
    const encodedId = encodeURIComponent(identifier);
    const url = `${baseUrl}/viewer/${encodedId}`;
    return promotionId ? `${url}?promotionId=${encodeURIComponent(promotionId)}` : url;
}

/**
 * Handle individual consultation booking (Direct Webhook Version)
 * Called from /api/webhook/booking
 * @param {Object} data - Normalized booking data
 * @param {Object} injectedConfig - Config
 */
export async function handleConsultationBooking(data, injectedConfig = null) {
    const config = injectedConfig || await getConfig();

    if (!config) {
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: ErrorCategory.CONFIG_MISSING,
            errorMessage: 'Configuration not found in Firestore',
            rowNumber: data.rowIndex,
            payload: data
        });
        throw new Error('Configuration not found');
    }

    const {
        spreadsheetId,
        staffListSheet,
        bookingListSheet,
        staffChatSheet,
        chatworkToken,
        roomId,
        consultationTemplate,
        bookingColumnMapping = [], // New: Column mapping configuration
        staffColumn = 8,      // Column H (1-indexed) - User specified "担当者" is at index 7 (0-based)
        viewerUrlColumn = 15, // Column O (1-indexed)
        viewerBaseUrl = process.env.VERCEL_URL || 'https://your-app.vercel.app',
        promotionId // Current promotion ID for viewer URL
    } = config;

    // Step 1: Find matching staff from Staff List
    let matchedStaff = null;
    let consultantName = data.staff; // "認定コンサル" from webhook
    let staffList = [];
    let dateTimeColIdx = -1;
    let consultantColIdx = -1;

    try {
        staffList = await readSheet(spreadsheetId, `${staffListSheet}!A:Z`);
        const headers = staffList[0];

        // Helper to normalize strings for comparison (aggressive)
        const normalize = (val) => {
            if (!val) return '';
            return String(val)
                .trim()
                .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)) // Full-width to half-width digits
                .replace(/[（]/g, '(')
                .replace(/[）]/g, ')')
                .replace(/[：]/g, ':')
                .replace(/[\u301c\u223c\uff5e~]/g, '-') // Normalize all wavy dashes and tildes to hyphen
                .replace(/[\s\u3000]/g, '');      // Remove all spaces (half and full width)
        };

        const targetDateNormalized = normalize(data.dateTime);
        const targetConsultantNormalized = normalize(consultantName);

        if (headers) {
            dateTimeColIdx = headers.findIndex(h => {
                if (!h) return false;
                const normalized = normalize(h);
                return normalized.includes('日時') || normalized.includes('DateTime');
            });
            consultantColIdx = headers.findIndex(h => {
                if (!h) return false;
                return normalize(h) === targetConsultantNormalized;
            });
        }

        console.log('Search Indices:', { dateTimeColIdx, consultantColIdx, lookingFor: consultantName });

        if (dateTimeColIdx >= 0 && consultantColIdx >= 0) {
            for (let i = 1; i < staffList.length; i++) {
                const row = staffList[i];
                const rowDate = row[dateTimeColIdx];
                const rowDateNormalized = normalize(rowDate);

                // Match by date/time only
                if (rowDateNormalized === targetDateNormalized) {
                    matchedStaff = row[consultantColIdx];
                    break;
                }
            }
        }
    } catch (error) {
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: error.message.includes('404') ? ErrorCategory.SHEET_NOT_FOUND : ErrorCategory.UNKNOWN,
            errorMessage: `Failed to read Staff List sheet: ${error.message}`,
            rowNumber: data.rowIndex,
            payload: { spreadsheetId, staffListSheet }
        });
        // Non-critical: Proceed without match, row append still needed
    }

    if (!matchedStaff) {
        console.warn('No matching staff found for:', data.dateTime, consultantName);
        // Don't fail here, we still want to append the row
    }

    // Step 0: Append row if rowIndex is missing (External Webhook / UTAGE case)
    if (!data.rowIndex) {
        console.log('rowIndex missing, attempting to append row using mapping:', JSON.stringify(bookingColumnMapping));

        if (!bookingColumnMapping || bookingColumnMapping.length === 0) {
            console.warn('No bookingColumnMapping configured. Skipping row append.');
        } else {
            try {
                // Construct row values based on mapping
                const rowValues = bookingColumnMapping.map(template => {
                    return formatMessage(template, {
                        ...data,           // contains email, staff (Consultant!), dateTime, clientName
                        consultant: consultantName, // Explicit alias for clarity
                        matchedStaff: matchedStaff || '', // The looked up staff name
                        staff: matchedStaff || consultantName, // Backwards combatibility: if matched, use it; else fallback
                        ...data.allFields, // spread fields for simple {カナ} access
                        allFields: data.allFields // nested object for {allFields.カナ} access
                    });
                });

                // Debug: Log allFields to see what data we received
                console.log('[Consultation Debug] allFields keys:', Object.keys(data.allFields || {}));
                console.log('[Consultation Debug] allFields.カナ:', data.allFields?.['カナ']);
                console.log('[Consultation Debug] allFields (full):', JSON.stringify(data.allFields));
                console.log('Constructed rowValues:', JSON.stringify(rowValues));
                console.log('Appending to spreadsheet:', spreadsheetId, 'sheet:', bookingListSheet);

                // Append to spreadsheet
                const appendResult = await appendRow(spreadsheetId, bookingListSheet, rowValues);

                console.log('appendResult:', JSON.stringify(appendResult));

                // Parse new rowIndex from response (e.g., "Sheet1!A10:Z10")
                if (appendResult.updates && appendResult.updates.updatedRange) {
                    const range = appendResult.updates.updatedRange;
                    const match = range.match(/!A(\d+)/) || range.match(/!.*(\d+)/); // Extract row number
                    if (match && match[1]) {
                        data.rowIndex = parseInt(match[1]);
                        console.log('Appended new row at index:', data.rowIndex);
                    }
                }
            } catch (error) {
                await notifyError({
                    caseName: CASE_NAME,
                    errorCategory: ErrorCategory.UNKNOWN,
                    errorMessage: `Failed to append new row: ${error.message}`,
                    rowNumber: null,
                    payload: data
                });
                // We proceed even if append fails
            }
        }
    }

    // Step 4: [MODIFIED] Send notification (or handle unmatched)
    if (!matchedStaff) {
        console.warn('No matching staff found. Sending fallback notification.');

        // Construct fallback message for general room
        const fallbackTemplate = '【個別相談予約（担当未割当）】\n日時：{dateTime}\nお客様：{clientName}\n入力されたコンサル：{consultant}\n\n※シフト表に一致する担当者がいないため、手動で割り当ててください。';
        const message = formatMessage(fallbackTemplate, {
            ...data.allFields,
            dateTime: data.dateTime,
            clientName: data.clientName,
            consultant: consultantName
        });

        try {
            await sendMessage(chatworkToken, roomId, message);
        } catch (error) {
            console.error('Failed to send fallback notification:', error.message);
        }

        // Do NOT return here. Continue to generate Viewer URL and finish.
    }

    // Step 2: Write staff name to Column I (Staff) - Legacy update fallback if row was already there
    /* 
       Optimization: If data.rowIndex came from specific append above, the staff name is already in the row
       IF the mapping used {matchedStaff}. If the row existed before (GAS case), we update.
       Since we support both, we do explicit update if needed, but for append case checking mapping serves.
       However, to be safe and ensure "Staff Column" is definitely updated with matched staff:
    */
    if (data.rowIndex) {
        try {
            await updateCell(spreadsheetId, bookingListSheet, parseInt(data.rowIndex), staffColumn, matchedStaff);
        } catch (error) {
            console.warn(`Failed to update staff name cell: ${error.message}`);
        }
    }

    // Step 3: Generate and write Viewer URL to Column O
    let viewerUrl = null;
    if (data.rowIndex) {
        try {
            viewerUrl = generateViewerUrl(data.email, data.clientName, viewerBaseUrl, promotionId);
            const hyperlinkValue = `=HYPERLINK("${viewerUrl}", "閲覧")`;
            await updateCell(spreadsheetId, bookingListSheet, parseInt(data.rowIndex), viewerUrlColumn, hyperlinkValue);
        } catch (error) {
            await notifyError({
                caseName: CASE_NAME,
                errorCategory: ErrorCategory.UNKNOWN,
                errorMessage: `Failed to write Viewer URL to Column O: ${error.message}`,
                rowNumber: data.rowIndex,
                payload: { viewerUrl, viewerUrlColumn }
            });
        }
    }

    // Step 4: Get Chatwork ID from Staff Chat sheet
    let staffChatList;
    try {
        staffChatList = await readSheet(spreadsheetId, `${staffChatSheet}!A:B`);
    } catch (error) {
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: ErrorCategory.SHEET_NOT_FOUND,
            errorMessage: `Failed to read Staff Chat sheet: ${error.message}`,
            rowNumber: data.rowIndex,
            payload: { spreadsheetId, staffChatSheet }
        });
        throw error;
    }

    let chatworkAccountId = null;
    for (const row of staffChatList) {
        if (row[0] === matchedStaff) {
            chatworkAccountId = row[1];
            break;
        }
    }

    if (!chatworkAccountId) {
        // Case 1 specific: Chatwork ID missing
        console.warn('No Chatwork ID found for staff:', matchedStaff);

        // Send notification to the main room even if TO tag is missing
        const messageTemplate = consultationTemplate || '【個別相談予約】\n日時：{dateTime}\nお客様：{clientName}\n担当：{matchedStaff}';
        const message = formatMessage(messageTemplate, {
            ...data.allFields,
            dateTime: data.dateTime,
            clientName: data.clientName,
            consultant: consultantName,
            matchedStaff: matchedStaff,
            staff: matchedStaff
        });

        try {
            await sendMessage(chatworkToken, roomId, message);
        } catch (error) {
            console.error('Failed to send notification (no Chatwork ID):', error.message);
        }

        return { matched: true, notified: true, staff: matchedStaff, viewerUrl };
    }

    // Step 5: Send notification
    // chatworkAccountId contains the full [To:xxx]Name format from the spreadsheet
    const messageTemplate = consultationTemplate || '【個別相談予約】\n日時：{dateTime}\nお客様：{clientName}\n担当：{matchedStaff}';
    const message = formatMessage(messageTemplate, {
        ...data.allFields,
        dateTime: data.dateTime,
        clientName: data.clientName,
        consultant: consultantName,
        matchedStaff: matchedStaff,
        staff: matchedStaff
    });

    // Build the full message with the [To:xxx] mention from the spreadsheet
    const fullMessage = `${chatworkAccountId}\n${message}`;

    try {
        await sendMessage(chatworkToken, roomId, fullMessage);
    } catch (error) {
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: ErrorCategory.UNKNOWN,
            errorMessage: `Failed to send Chatwork notification: ${error.message}`,
            rowNumber: data.rowIndex,
            payload: { matchedStaff, roomId }
        });
        throw error;
    }

    return { matched: true, notified: true, staff: matchedStaff, viewerUrl };
}

/**
 * Legacy handler for GAS webhook (for backward compatibility)
 * @deprecated Use handleConsultationBooking instead
 */
export async function handleConsultation(data) {
    return handleConsultationBooking(data);
}
